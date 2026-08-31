package app.auroracall;

import org.json.JSONObject;
import org.unifiedpush.android.connector.FailedReason;
import org.unifiedpush.android.connector.PushService;
import org.unifiedpush.android.connector.data.PublicKeySet;
import org.unifiedpush.android.connector.data.PushEndpoint;
import org.unifiedpush.android.connector.data.PushMessage;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public final class AuroraPushService extends PushService {
    @Override
    public void onNewEndpoint(PushEndpoint endpoint, String instance) {
        PublicKeySet keys = endpoint == null ? null : endpoint.getPubKeySet();
        if (endpoint == null || keys == null) {
            NativePushState.clearEndpoint(this);
        } else {
            NativePushState.saveEndpoint(
                    this,
                    endpoint.getUrl(),
                    keys.getPubKey(),
                    keys.getAuth(),
                    endpoint.getTemporary()
            );
        }
        MainActivity.notifyNativePushStateChanged();
    }

    @Override
    public void onMessage(PushMessage message, String instance) {
        if (message == null || !message.getDecrypted()) return;
        try {
            String raw = new String(message.getContent(), StandardCharsets.UTF_8);
            JSONObject json = new JSONObject(raw);
            Map<String, String> data = new HashMap<>();
            Iterator<String> keys = json.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                Object value = json.opt(key);
                if (value != null && value != JSONObject.NULL) data.put(key, String.valueOf(value));
            }

            String type = data.get("type");
            if ("call_end".equals(type)) {
                AuroraNotifications.cancelIncomingCall(this, data.get("call_id"));
                return;
            }
            if ("call".equals(type)) {
                AuroraNotifications.showIncomingCall(this, data);
                return;
            }
            if ("message".equals(type)) {
                AuroraNotifications.showMessage(this, data);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onRegistrationFailed(FailedReason reason, String instance) {
        NativePushState.clearEndpoint(this);
        MainActivity.notifyNativePushStateChanged();
    }

    @Override
    public void onUnregistered(String instance) {
        NativePushState.clearEndpoint(this);
        MainActivity.notifyNativePushStateChanged();
    }

    @Override
    public void onTempUnavailable(String instance) {
        MainActivity.notifyNativePushStateChanged();
    }
}
