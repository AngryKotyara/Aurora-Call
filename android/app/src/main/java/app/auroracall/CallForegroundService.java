package app.auroracall;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

public final class CallForegroundService extends Service {
    private static final String ACTION_START = "app.auroracall.action.START_CALL_SERVICE";
    private static final String ACTION_STOP = "app.auroracall.action.STOP_CALL_SERVICE";
    private static final int NOTIFICATION_ID = 6101;

    static Intent startIntent(
            Context context,
            String callId,
            String peerName,
            String mode
    ) {
        Intent intent = new Intent(context, CallForegroundService.class);
        intent.setAction(ACTION_START);
        intent.putExtra("call_id", callId);
        intent.putExtra("peer_name", peerName);
        intent.putExtra("mode", mode);
        return intent;
    }

    static Intent stopIntent(Context context) {
        Intent intent = new Intent(context, CallForegroundService.class);
        intent.setAction(ACTION_STOP);
        return intent;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(intent.getAction())) return START_NOT_STICKY;

        String callId = value(intent, "call_id", "active");
        String peerName = value(intent, "peer_name", "Aurora Call");
        String mode = "video".equals(value(intent, "mode", "audio")) ? "video" : "audio";
        Notification notification = AuroraNotifications.activeCallNotification(
                this,
                callId,
                peerName,
                mode
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            if (mode.equals("video")) serviceType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            startForeground(NOTIFICATION_ID, notification, serviceType);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_NOT_STICKY;
    }

    private static String value(Intent intent, String key, String fallback) {
        String value = intent.getStringExtra(key);
        return value == null || value.isBlank() ? fallback : value;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
