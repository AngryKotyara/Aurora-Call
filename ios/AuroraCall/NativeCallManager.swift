import Foundation
import AVFAudio
import CallKit
import PushKit

final class NativeCallManager: NSObject {
    static let shared = NativeCallManager()

    var onOpenCall: ((String) -> Void)?
    var onEndCall: ((String) -> Void)?
    var onVoIPToken: ((String) -> Void)?

    private(set) var voipToken: String?

    private let provider: CXProvider
    private var pushRegistry: PKPushRegistry?
    private var callIdsByUUID: [UUID: String] = [:]
    private var uuidsByCallId: [String: UUID] = [:]

    private override init() {
        let configuration = CXProviderConfiguration(localizedName: "Aurora Call")
        configuration.supportsVideo = true
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.includesCallsInRecents = false
        provider = CXProvider(configuration: configuration)
        super.init()
    }

    func start() {
        provider.setDelegate(self, queue: .main)

        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        pushRegistry = registry
    }

    func reportCallEnded(callId: String, reason: CXCallEndedReason = .remoteEnded) {
        guard let uuid = uuidsByCallId.removeValue(forKey: callId) else { return }
        callIdsByUUID.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
    }

    private func remember(callId: String, uuid: UUID) {
        if let previousUUID = uuidsByCallId[callId], previousUUID != uuid {
            callIdsByUUID.removeValue(forKey: previousUUID)
        }
        callIdsByUUID[uuid] = callId
        uuidsByCallId[callId] = uuid
    }

    private func forget(uuid: UUID) -> String? {
        guard let callId = callIdsByUUID.removeValue(forKey: uuid) else { return nil }
        if uuidsByCallId[callId] == uuid {
            uuidsByCallId.removeValue(forKey: callId)
        }
        return callId
    }

    private func payloadValue(_ payload: [AnyHashable: Any], keys: [String]) -> String? {
        let nested = payload["data"] as? [String: Any]
        for key in keys {
            if let value = payload[key] as? String, !value.isEmpty { return value }
            if let value = payload[key] as? NSNumber { return value.stringValue }
            if let value = nested?[key] as? String, !value.isEmpty { return value }
            if let value = nested?[key] as? NSNumber { return value.stringValue }
        }
        return nil
    }

    private func reportIncomingVoIPPush(
        payload: PKPushPayload,
        completion: @escaping () -> Void
    ) {
        let dictionary = payload.dictionaryPayload
        guard let callId = payloadValue(dictionary, keys: ["call_id", "callId"]) else {
            NSLog("Aurora Call ignored VoIP push without call_id")
            completion()
            return
        }

        let callerName = payloadValue(
            dictionary,
            keys: ["caller_name", "from_name", "callerName"]
        ) ?? "Aurora Call"
        let mode = payloadValue(dictionary, keys: ["mode", "call_mode"]) ?? "audio"
        let uuid = uuidsByCallId[callId] ?? UUID()
        remember(callId: callId, uuid: uuid)

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerName)
        update.localizedCallerName = callerName
        update.hasVideo = mode.lowercased() == "video"
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false

        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error {
                self?.forget(uuid: uuid)
                NSLog("Aurora Call failed to report incoming CallKit call: %@", String(describing: error))
            }
            completion()
        }
    }
}

extension NativeCallManager: PKPushRegistryDelegate {
    func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        voipToken = token
        onVoIPToken?(token)
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        voipToken = nil
        onVoIPToken?("")
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }
        reportIncomingVoIPPush(payload: payload, completion: completion)
    }
}

extension NativeCallManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        callIdsByUUID.removeAll()
        uuidsByCallId.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard let callId = callIdsByUUID[action.callUUID] else {
            action.fail()
            return
        }
        onOpenCall?(callId)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        guard let callId = forget(uuid: action.callUUID) else {
            action.fulfill()
            return
        }
        onEndCall?(callId)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        do {
            try audioSession.setActive(true)
        } catch {
            NSLog("Aurora Call failed to activate CallKit audio session: %@", String(describing: error))
        }
    }
}
