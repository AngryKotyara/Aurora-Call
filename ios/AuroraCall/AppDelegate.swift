import UIKit
import AVFAudio

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playAndRecord,
                mode: .videoChat,
                options: [.allowBluetoothHFP, .defaultToSpeaker]
            )
        } catch {
            NSLog("Aurora Call audio-session setup failed: %@", String(describing: error))
        }

        NativeCallManager.shared.start()

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = ViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
