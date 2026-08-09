import CoreMedia
import ReplayKit

/// Entry point for full-device screen capture on iOS.
///
/// This target receives ReplayKit sample buffers. The next integration step is
/// to feed `.video` buffers into Aurora Call's native WebRTC video source and
/// publish that track to the active call. Audio is intentionally ignored here
/// because Aurora Call already keeps the call microphone on the main call path.
final class SampleHandler: RPBroadcastSampleHandler {
    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        BroadcastSession.shared.start()
    }

    override func broadcastPaused() {
        BroadcastSession.shared.pause()
    }

    override func broadcastResumed() {
        BroadcastSession.shared.resume()
    }

    override func broadcastFinished() {
        BroadcastSession.shared.stop()
    }

    override func processSampleBuffer(
        _ sampleBuffer: CMSampleBuffer,
        with sampleBufferType: RPSampleBufferType
    ) {
        switch sampleBufferType {
        case .video:
            BroadcastSession.shared.consumeVideo(sampleBuffer)
        case .audioApp, .audioMic:
            break
        @unknown default:
            break
        }
    }
}

/// Small boundary between ReplayKit and the future native WebRTC sender.
/// Keeping this isolated lets the WebRTC implementation be added without
/// changing ReplayKit lifecycle code.
final class BroadcastSession {
    static let shared = BroadcastSession()

    private(set) var isRunning = false
    private(set) var isPaused = false

    private init() {}

    func start() {
        isRunning = true
        isPaused = false
        // TODO: read active Aurora Call call/session metadata from an App Group
        // container and establish the native WebRTC screen-share transport.
    }

    func pause() {
        isPaused = true
    }

    func resume() {
        isPaused = false
    }

    func stop() {
        isRunning = false
        isPaused = false
        // TODO: close the native WebRTC screen-share transport and signal the
        // remote peer that screen sharing stopped.
    }

    func consumeVideo(_ sampleBuffer: CMSampleBuffer) {
        guard isRunning, !isPaused else { return }
        // TODO: convert CMSampleBuffer/CVPixelBuffer to the video frame type
        // expected by the chosen native WebRTC SDK and push it to the sender.
    }
}
