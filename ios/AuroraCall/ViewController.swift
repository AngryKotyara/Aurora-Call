import UIKit
import WebKit

final class ViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!
    private var frameTimer: Timer?
    private var lastFrameModificationDate: Date?
    private var lastStatus: String?
    private var trustedWebHost: String?
    private var trustedWebScheme: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let controller = WKUserContentController()
        controller.add(self, name: "auroraScreenShare")
        controller.add(self, name: "auroraNativeCall")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let nativeCalls = NativeCallManager.shared
        nativeCalls.onOpenCall = { [weak self] callId in
            self?.dispatchNativeEvent("aurora-call-open", detail: ["callId": callId])
        }
        nativeCalls.onEndCall = { [weak self] callId in
            self?.dispatchNativeEvent("aurora-call-end-native", detail: ["callId": callId])
        }
        nativeCalls.onVoIPToken = { [weak self] token in
            self?.dispatchNativeEvent("aurora-voip-token", detail: ["token": token])
        }

        let configuredURL = Bundle.main.object(forInfoDictionaryKey: "AuroraWebURL") as? String
        let urlString = configuredURL?.isEmpty == false
            ? configuredURL!
            : "https://aurora-call.vercel.app"

        guard let url = URL(string: urlString) else { return }
        trustedWebHost = url.host?.lowercased()
        trustedWebScheme = url.scheme?.lowercased()
        webView.load(URLRequest(url: url))

        frameTimer = Timer.scheduledTimer(
            timeInterval: 1.0 / 12.0,
            target: self,
            selector: #selector(relayReplayKitFrame),
            userInfo: nil,
            repeats: true
        )
    }

    deinit {
        frameTimer?.invalidate()
        webView?.configuration.userContentController.removeScriptMessageHandler(
            forName: "auroraScreenShare"
        )
        webView?.configuration.userContentController.removeScriptMessageHandler(
            forName: "auroraNativeCall"
        )
        NativeCallManager.shared.onOpenCall = nil
        NativeCallManager.shared.onEndCall = nil
        NativeCallManager.shared.onVoIPToken = nil
    }

    private func isTrustedOrigin(scheme: String, host: String) -> Bool {
        guard let trustedWebHost, let trustedWebScheme else { return false }
        return scheme.lowercased() == trustedWebScheme
            && host.lowercased() == trustedWebHost
    }

    private func isTrustedWebURL(_ url: URL) -> Bool {
        guard let scheme = url.scheme, let host = url.host else { return false }
        return isTrustedOrigin(scheme: scheme, host: host)
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame,
              isTrustedOrigin(scheme: origin.protocol, host: origin.host),
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        if message.name == "auroraScreenShare" {
            switch action {
            case "start":
                ScreenShareFiles.writeStatus("starting")
                ScreenBroadcastPicker.shared.present(from: view)
            case "stop":
                ScreenBroadcastPicker.shared.present(from: view)
            default:
                break
            }
            return
        }

        if message.name == "auroraNativeCall" {
            switch action {
            case "ended":
                guard let callId = body["callId"] as? String, !callId.isEmpty else { return }
                NativeCallManager.shared.reportCallEnded(callId: callId)
            case "requestVoIPToken":
                if let token = NativeCallManager.shared.voipToken {
                    dispatchNativeEvent("aurora-voip-token", detail: ["token": token])
                }
            default:
                break
            }
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if isTrustedWebURL(url) {
            decisionHandler(.allow)
            return
        }

        if navigationAction.navigationType == .linkActivated,
           UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let token = NativeCallManager.shared.voipToken {
            dispatchNativeEvent("aurora-voip-token", detail: ["token": token])
        }
    }

    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        let isTrusted = frame.isMainFrame
            && isTrustedOrigin(scheme: origin.protocol, host: origin.host)
        decisionHandler(isTrusted ? .grant : .deny)
    }

    private func dispatchNativeEvent(_ name: String, detail: [String: String]) {
        guard webView != nil,
              let detailData = try? JSONSerialization.data(withJSONObject: detail),
              let detailJSON = String(data: detailData, encoding: .utf8),
              let nameData = try? JSONEncoder().encode(name),
              let nameJSON = String(data: nameData, encoding: .utf8) else { return }

        let javascript = """
        (() => {
          const event = { name: \(nameJSON), detail: \(detailJSON) };
          const queue = Array.isArray(window.__auroraPendingNativeEvents)
            ? window.__auroraPendingNativeEvents
            : [];
          queue.push(event);
          if (queue.length > 20) queue.splice(0, queue.length - 20);
          window.__auroraPendingNativeEvents = queue;
          document.dispatchEvent(new CustomEvent(event.name, { detail: event.detail }));
        })();
        """
        webView.evaluateJavaScript(javascript) { _, error in
            if let error {
                NSLog("Aurora Call native event dispatch failed: %@", String(describing: error))
            }
        }
    }

    @objc private func relayReplayKitFrame() {
        relayStatus()

        guard let frameURL = ScreenShareFiles.frameURL,
              let metadataURL = ScreenShareFiles.metadataURL else { return }

        let attributes = try? FileManager.default.attributesOfItem(atPath: frameURL.path)
        guard let modificationDate = attributes?[.modificationDate] as? Date,
              modificationDate != lastFrameModificationDate else { return }

        guard let frameData = try? Data(contentsOf: frameURL),
              let metadataData = try? Data(contentsOf: metadataURL),
              let metadata = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any],
              let width = metadata["width"] as? Int,
              let height = metadata["height"] as? Int else { return }

        lastFrameModificationDate = modificationDate
        let base64 = frameData.base64EncodedString()
        let javascript = "window.__auroraReceiveScreenFrame?.(\"\(base64)\", \(width), \(height));"
        webView.evaluateJavaScript(javascript)
    }

    private func relayStatus() {
        guard let statusURL = ScreenShareFiles.statusURL,
              let data = try? Data(contentsOf: statusURL),
              let status = String(data: data, encoding: .utf8),
              status != lastStatus else { return }

        lastStatus = status
        let escaped = status
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        webView.evaluateJavaScript(
            "window.__auroraNativeScreenShareState?.(\"\(escaped)\");"
        )
    }
}
