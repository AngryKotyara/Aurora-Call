# Aurora Call — iOS screen sharing

Aurora Call's browser client uses `getDisplayMedia()` on platforms that expose it. Full-device screen sharing on iPhone/iPad requires a native iOS target because the browser cannot provide the screen as a WebRTC `MediaStreamTrack`.

## Native architecture

1. The Aurora Call iOS host app embeds the existing web UI in `WKWebView`.
2. The screen-share button sends a native bridge message from the web UI.
3. The host app presents `RPSystemBroadcastPickerView` configured for the Aurora Call Broadcast Upload Extension.
4. `BroadcastUploadExtension/SampleHandler.swift` receives ReplayKit video sample buffers.
5. The extension reads the active call/session metadata from an App Group container and sends the captured frames through a native WebRTC video track.
6. The remote Aurora Call peer receives the screen-share video and the existing `screen-share` signal continues to drive layout/status state.

## Xcode targets required

Create these targets in an Xcode iOS project:

- `AuroraCall` — main application target.
- `AuroraCallBroadcast` — Broadcast Upload Extension.

Use the same App Group on both targets, for example `group.app.auroracall`, and set the broadcast extension bundle identifier to the value used by `ScreenBroadcastPicker.preferredExtensionBundleIdentifier`.

## Files already included

- `AuroraCall/ScreenBroadcastPicker.swift` presents Apple's broadcast picker from a user gesture.
- `BroadcastUploadExtension/SampleHandler.swift` contains ReplayKit lifecycle handling and receives screen video sample buffers.

## Remaining native WebRTC work

A WebRTC iOS SDK must be linked to both the host app and the broadcast extension. The extension's `BroadcastSession.consumeVideo(_:)` must convert ReplayKit `CMSampleBuffer` / `CVPixelBuffer` frames into the SDK's video-frame type and publish them as the screen-share track. Active call identifiers, peer identifiers, authentication/signaling data, and start/stop state should be shared through the App Group container.

Do not fake `getDisplayMedia()` inside `WKWebView`: ReplayKit buffers are native sample buffers and are not a browser `MediaStream`. The screen-share path therefore needs to remain a dedicated native WebRTC transport on iOS.
