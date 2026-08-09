import Foundation

enum ScreenShareFiles {
    static let appGroup = "group.app.auroracall"
    static let frameName = "screen-frame.jpg"
    static let metadataName = "screen-frame.json"
    static let statusName = "screen-status.txt"

    static var containerURL: URL? {
        FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroup
        )
    }

    static var frameURL: URL? { containerURL?.appendingPathComponent(frameName) }
    static var metadataURL: URL? { containerURL?.appendingPathComponent(metadataName) }
    static var statusURL: URL? { containerURL?.appendingPathComponent(statusName) }

    static func writeStatus(_ status: String) {
        guard let url = statusURL else { return }
        try? Data(status.utf8).write(to: url, options: .atomic)
    }
}
