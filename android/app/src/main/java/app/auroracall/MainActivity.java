package app.auroracall;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class MainActivity extends Activity implements ScreenShareService.Listener {
    private static final String WEB_URL = "https://aurora-call.vercel.app";
    private static final String TRUSTED_ORIGIN = "https://aurora-call.vercel.app";
    private static final String TRUSTED_HOST = "aurora-call.vercel.app";
    private static final int REQUEST_WEB_MEDIA = 2101;
    private static final int REQUEST_FILE_CHOOSER = 2102;
    private static final int REQUEST_SCREEN_CAPTURE = 2103;

    private WebView webView;
    private boolean nativeBridgeAvailable;
    private PermissionRequest pendingWebPermission;
    private String[] pendingWebResources;
    private ValueCallback<Uri[]> pendingFileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(7, 7, 12));
        getWindow().setNavigationBarColor(Color.rgb(7, 7, 12));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 7, 12));
        setContentView(webView);

        configureWebView();
        ScreenShareService.setListener(this);
        webView.loadUrl(resolveLaunchUrl(getIntent()));
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString() + " AuroraCallAndroid/1.0");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        nativeBridgeAvailable = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (nativeBridgeAvailable) {
            WebViewCompat.addWebMessageListener(
                    webView,
                    "AuroraScreenShare",
                    Collections.singleton(TRUSTED_ORIGIN),
                    (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                        if (!isMainFrame || !isTrustedUri(sourceOrigin)) return;
                        if (message.getType() != WebMessageCompat.TYPE_STRING) return;
                        String action = message.getData();
                        if ("start".equals(action)) {
                            beginScreenCapture();
                        } else if ("stop".equals(action)) {
                            runOnUiThread(() -> {
                                if (isTrustedCurrentPage()) stopScreenCapture();
                            });
                        }
                    }
            );
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isTrustedUri(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (isTrustedUri(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (nativeBridgeAvailable && isTrustedUri(Uri.parse(url))) {
                    injectAndroidScreenShareBridge();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermission == request) {
                    pendingWebPermission = null;
                    pendingWebResources = null;
                }
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (!isTrustedCurrentPage()) return false;

                if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
                pendingFileCallback = filePathCallback;

                try {
                    Intent chooser = fileChooserParams.createIntent();
                    startActivityForResult(chooser, REQUEST_FILE_CHOOSER);
                    return true;
                } catch (ActivityNotFoundException error) {
                    pendingFileCallback.onReceiveValue(null);
                    pendingFileCallback = null;
                    return false;
                }
            }
        });
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        if (!isTrustedUri(request.getOrigin())) {
            request.deny();
            return;
        }

        List<String> grantedResources = new ArrayList<>();
        List<String> runtimePermissions = new ArrayList<>();

        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                grantedResources.add(resource);
                if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    runtimePermissions.add(Manifest.permission.CAMERA);
                }
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                grantedResources.add(resource);
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    runtimePermissions.add(Manifest.permission.RECORD_AUDIO);
                }
            }
        }

        if (grantedResources.isEmpty()) {
            request.deny();
            return;
        }

        pendingWebPermission = request;
        pendingWebResources = grantedResources.toArray(new String[0]);

        if (runtimePermissions.isEmpty()) {
            grantPendingWebPermission();
        } else {
            requestPermissions(runtimePermissions.toArray(new String[0]), REQUEST_WEB_MEDIA);
        }
    }

    private void grantPendingWebPermission() {
        PermissionRequest request = pendingWebPermission;
        String[] resources = pendingWebResources;
        pendingWebPermission = null;
        pendingWebResources = null;
        if (request != null && resources != null && isTrustedUri(request.getOrigin())) {
            request.grant(resources);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_WEB_MEDIA) return;

        boolean granted = grantResults.length > 0;
        for (int result : grantResults) {
            if (result != PackageManager.PERMISSION_GRANTED) {
                granted = false;
                break;
            }
        }

        if (granted) {
            grantPendingWebPermission();
        } else {
            if (pendingWebPermission != null) pendingWebPermission.deny();
            pendingWebPermission = null;
            pendingWebResources = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_FILE_CHOOSER) {
            if (pendingFileCallback != null) {
                pendingFileCallback.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                );
                pendingFileCallback = null;
            }
            return;
        }

        if (requestCode == REQUEST_SCREEN_CAPTURE) {
            if (resultCode == RESULT_OK && data != null) {
                Intent serviceIntent = ScreenShareService.createStartIntent(this, resultCode, data);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            } else {
                onScreenShareState("failed");
            }
        }
    }

    private void beginScreenCapture() {
        runOnUiThread(() -> {
            if (!isTrustedCurrentPage()) {
                onScreenShareState("failed");
                return;
            }

            Intent captureIntent = ScreenShareService.createCaptureIntent(this);
            startActivityForResult(captureIntent, REQUEST_SCREEN_CAPTURE);
        });
    }

    private void stopScreenCapture() {
        Intent stopIntent = ScreenShareService.createStopIntent(this);
        startService(stopIntent);
    }

    private boolean isTrustedCurrentPage() {
        String currentUrl = webView == null ? null : webView.getUrl();
        return currentUrl != null && isTrustedUri(Uri.parse(currentUrl));
    }

    private static boolean isTrustedUri(Uri uri) {
        if (uri == null) return false;
        return "https".equalsIgnoreCase(uri.getScheme())
                && TRUSTED_HOST.equalsIgnoreCase(uri.getHost());
    }

    private String resolveLaunchUrl(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction())) {
            Uri uri = intent.getData();
            if (isTrustedUri(uri)) return uri.toString();
        }
        return WEB_URL;
    }

    private void openExternal(Uri uri) {
        if (uri == null) return;
        String scheme = uri.getScheme();
        if (scheme == null) return;
        if (!(scheme.equalsIgnoreCase("https") || scheme.equalsIgnoreCase("http")
                || scheme.equalsIgnoreCase("mailto") || scheme.equalsIgnoreCase("tel"))) {
            return;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    private void injectAndroidScreenShareBridge() {
        String script = "(() => {\n"
                + "  if (window.__auroraAndroidBridgeInstalled) return;\n"
                + "  const nativeBridge = window.AuroraScreenShare;\n"
                + "  if (!nativeBridge?.postMessage || !navigator.mediaDevices || !HTMLCanvasElement.prototype.captureStream) return;\n"
                + "  let canvas = null, context = null, stream = null, rawStop = null, firstResolve = null, firstReject = null, firstTimer = null, stopping = false;\n"
                + "  const clearWait = () => { if (firstTimer) clearTimeout(firstTimer); firstTimer = null; firstResolve = null; firstReject = null; };\n"
                + "  const destroy = (notifyNative) => {\n"
                + "    if (notifyNative) { try { nativeBridge.postMessage('stop'); } catch {} }\n"
                + "    clearWait();\n"
                + "    if (rawStop && stream?.getVideoTracks?.()[0]?.readyState !== 'ended') { try { rawStop(); } catch {} }\n"
                + "    stream = null; rawStop = null; stopping = false; canvas?.remove(); canvas = null; context = null;\n"
                + "  };\n"
                + "  const startNative = async () => {\n"
                + "    destroy(false);\n"
                + "    canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 1280; canvas.hidden = true; canvas.setAttribute('aria-hidden','true'); document.body.appendChild(canvas);\n"
                + "    context = canvas.getContext('2d', { alpha: false }); stream = canvas.captureStream(8);\n"
                + "    const track = stream.getVideoTracks()[0]; if (!track) throw new Error('Android screen track unavailable');\n"
                + "    rawStop = track.stop.bind(track);\n"
                + "    track.stop = () => { if (stopping) return; stopping = true; try { nativeBridge.postMessage('stop'); } catch {} try { rawStop(); } catch {} };\n"
                + "    const firstFrame = new Promise((resolve, reject) => { firstResolve = resolve; firstReject = reject; firstTimer = setTimeout(() => { reject(new Error('Android screen capture did not start')); destroy(true); }, 20000); });\n"
                + "    window.__auroraReceiveScreenFrame = (base64, width, height) => {\n"
                + "      if (!canvas || !context || !base64) return;\n"
                + "      const image = new Image();\n"
                + "      image.onload = () => {\n"
                + "        if (!canvas || !context) return;\n"
                + "        const w = Number(width) || image.naturalWidth || 720, h = Number(height) || image.naturalHeight || 1280;\n"
                + "        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; context = canvas.getContext('2d', { alpha: false }); }\n"
                + "        context.drawImage(image, 0, 0, canvas.width, canvas.height); firstResolve?.(); clearWait();\n"
                + "      };\n"
                + "      image.onerror = () => { firstReject?.(new Error('Android frame decode failed')); destroy(true); };\n"
                + "      image.src = 'data:image/jpeg;base64,' + base64;\n"
                + "    };\n"
                + "    window.__auroraNativeScreenShareState = (status) => {\n"
                + "      if (status === 'failed') { firstReject?.(new Error('Android screen capture failed')); destroy(false); }\n"
                + "      if (status === 'stopped') {\n"
                + "        firstReject?.(new Error('Android screen capture stopped'));\n"
                + "        const currentTrack = stream?.getVideoTracks?.()[0];\n"
                + "        if (currentTrack && currentTrack.readyState !== 'ended') { try { currentTrack.dispatchEvent(new Event('ended')); } catch {} }\n"
                + "        destroy(false);\n"
                + "      }\n"
                + "    };\n"
                + "    nativeBridge.postMessage('start'); await firstFrame; try { track.contentHint = 'detail'; } catch {} return stream;\n"
                + "  };\n"
                + "  try { Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: startNative }); } catch { navigator.mediaDevices.getDisplayMedia = startNative; }\n"
                + "  window.__auroraAndroidBridgeInstalled = true;\n"
                + "})();";

        webView.evaluateJavascript(script, null);
    }

    @Override
    public void onScreenShareFrame(String base64, int width, int height) {
        if (webView == null || base64 == null) return;
        runOnUiThread(() -> {
            if (!isTrustedCurrentPage()) return;
            String javascript = "window.__auroraReceiveScreenFrame?.('" + base64 + "',"
                    + width + "," + height + ");";
            webView.evaluateJavascript(javascript, null);
        });
    }

    @Override
    public void onScreenShareState(String state) {
        if (webView == null) return;
        runOnUiThread(() -> {
            if (!isTrustedCurrentPage()) return;
            String javascript = "window.__auroraNativeScreenShareState?.("
                    + JSONObject.quote(state) + ");";
            webView.evaluateJavascript(javascript, null);
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String target = resolveLaunchUrl(intent);
        if (webView != null && !target.equals(webView.getUrl())) webView.loadUrl(target);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        ScreenShareService.setListener(null);
        if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
        if (pendingWebPermission != null) pendingWebPermission.deny();
        pendingFileCallback = null;
        pendingWebPermission = null;
        pendingWebResources = null;

        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
