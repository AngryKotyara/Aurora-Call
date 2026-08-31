package app.auroracall;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public final class AuroraMessagingService extends FirebaseMessagingService {
    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        NativePushState.saveToken(this, token);
        MainActivity.notifyNativePushStateChanged();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        Map<String, String> data = message.getData();
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
    }
}
