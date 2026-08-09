import CoreImage
import CoreMedia
import ReplayKit

final class SampleHandler: RPBroadcastSampleHandler {
    private let relay = ReplayKitFrameRelay()

    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        relay.start()
    }

    override func broadcastPaused() {
        relay.pause()
    }

    override func broadcastResumed() {
        relay.resume()
    }

    override func broadcastFinished() {
        relay.stop()
    }

    override func processSampleBuffer(
        _ sampleBuffer: CMSampleBuffer,
        with sampleBufferType: RPSampleBufferType
    ) {
        guard sampleBufferType == .video else { return }
        relay.consume(sampleBuffer)
    }
}

private final class ReplayKitFrameRelay {
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let colorSpace = CGColorSpaceCreateDeviceRGB()
    private let minimumFrameInterval = 1.0 / 12.0
    private var lastFrameTime: CFTimeInterval = 0
    private var isRunning = false
    private var isPaused = false

    func start() {
        isRunning = true
        isPaused = false
        lastFrameTime = 0
        ScreenShareFiles.writeStatus("running")
    }

    func pause() {
        isPaused = true
        ScreenShareFiles.writeStatus("paused")
    }

    func resume() {
        isPaused = false
        ScreenShareFiles.writeStatus("running")
    }

    func stop() {
        isRunning = false
        isPaused = false
        ScreenShareFiles.writeStatus("stopped")
        if let frameURL = ScreenShareFiles.frameURL {
            try? FileManager.default.removeItem(at: frameURL)
        }
        if let metadataURL = ScreenShareFiles.metadataURL {
            try? FileManager.default.removeItem(at: metadataURL)
        }
    }

    func consume(_ sampleBuffer: CMSampleBuffer) {
        guard isRunning, !isPaused,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer),
              let frameURL = ScreenShareFiles.frameURL,
              let metadataURL = ScreenShareFiles.metadataURL else { return }

        let now = CACurrentMediaTime()
        guard now - lastFrameTime >= minimumFrameInterval else { return }
        lastFrameTime = now

        var image = CIImage(cvPixelBuffer: pixelBuffer)
        let sourceWidth = image.extent.width
        let sourceHeight = image.extent.height
        let longestSide = max(sourceWidth, sourceHeight)
        let scale = min(1.0, 1280.0 / longestSide)

        if scale < 1.0 {
            image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        }

        guard let jpeg = context.jpegRepresentation(
            of: image,
            colorSpace: colorSpace,
            options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.58]
        ) else { return }

        let width = Int(image.extent.width.rounded())
        let height = Int(image.extent.height.rounded())
        let metadata: [String: Any] = [
            "width": width,
            "height": height,
            "timestamp": Date().timeIntervalSince1970,
        ]

        guard let metadataData = try? JSONSerialization.data(withJSONObject: metadata) else { return }

        do {
            try jpeg.write(to: frameURL, options: .atomic)
            try metadataData.write(to: metadataURL, options: .atomic)
        } catch {
            ScreenShareFiles.writeStatus("failed")
        }
    }
}
