import ReplayKit
import UIKit

/// Presents Apple's system broadcast picker for the Aurora Call
/// Broadcast Upload Extension. Keep the picker as the user-initiated entry
/// point: iOS does not allow starting a full-device broadcast silently.
final class ScreenBroadcastPicker {
    static let shared = ScreenBroadcastPicker()

    /// Replace with the Broadcast Upload Extension bundle identifier used by
    /// the Xcode target.
    var preferredExtensionBundleIdentifier = "app.auroracall.broadcast"

    private init() {}

    func present(from hostView: UIView) {
        let picker = RPSystemBroadcastPickerView(frame: .zero)
        picker.preferredExtension = preferredExtensionBundleIdentifier
        picker.showsMicrophoneButton = false
        picker.translatesAutoresizingMaskIntoConstraints = false
        picker.alpha = 0.01

        hostView.addSubview(picker)
        NSLayoutConstraint.activate([
            picker.centerXAnchor.constraint(equalTo: hostView.centerXAnchor),
            picker.centerYAnchor.constraint(equalTo: hostView.centerYAnchor),
            picker.widthAnchor.constraint(equalToConstant: 44),
            picker.heightAnchor.constraint(equalToConstant: 44),
        ])

        // Trigger the system-provided button only as a consequence of the
        // user's tap on the Aurora Call screen-share control.
        DispatchQueue.main.async {
            let systemButton = picker.subviews.compactMap { $0 as? UIButton }.first
            systemButton?.sendActions(for: .touchUpInside)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                picker.removeFromSuperview()
            }
        }
    }
}
