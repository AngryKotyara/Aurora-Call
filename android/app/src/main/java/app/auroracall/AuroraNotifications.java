package app.auroracall;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import java.util.Map;

final class AuroraNotifications {
    static final String CALL_CHANNEL = "aurora_calls_v2";
    static final String MESSAGE_CHANNEL = "aurora_messages_v1";
    static final String ONGOING_CHANNEL = "aurora_active_call_v1";
    private static final String PROD_ORIGIN = "https://aurora-call.vercel.app";

    private AuroraNotifications() {
    }

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel calls = new NotificationChannel(
                CALL_CHANNEL,
                "Входящие звонки",
                NotificationManager.IMPORTANCE_HIGH
        );
        calls.setDescription("Входящие аудио- и видеозвонки Aurora Call");
        calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[]{0, 450, 300, 450, 800});
        Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        calls.setSound(
                ringtone,
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
        );
        manager.createNotificationChannel(calls);

        NotificationChannel messages = new NotificationChannel(
                MESSAGE_CHANNEL,
                "Сообщения",
                NotificationManager.IMPORTANCE_HIGH
        );
        messages.setDescription("Новые сообщения Aurora Call");
        messages.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(messages);

        NotificationChannel activeCall = new NotificationChannel(
                ONGOING_CHANNEL,
                "Активный звонок",
                NotificationManager.IMPORTANCE_LOW
        );
        activeCall.setDescription("Фоновая работа активного звонка Aurora Call");
        activeCall.setSound(null, null);
        manager.createNotificationChannel(activeCall);
    }

    static void showIncomingCall(Context context, Map<String, String> data) {
        if (!NativePushState.notificationsAllowed(context)) return;
        ensureChannels(context);
        String callId = value(data, "call_id", "");
        if (callId.isBlank()) return;
        String callerName = value(data, "caller_name", "Aurora Call");
        String mode = "video".equals(value(data, "mode", "audio")) ? "video" : "audio";

        PendingIntent showIntent = IncomingCallActivity.pendingIntent(
                context, callId, callerName, mode, IncomingCallActivity.ACTION_SHOW, 0
        );
        PendingIntent answerIntent = IncomingCallActivity.pendingIntent(
                context, callId, callerName, mode, IncomingCallActivity.ACTION_ACCEPT, 1
        );
        PendingIntent declineIntent = IncomingCallActivity.pendingIntent(
                context, callId, callerName, mode, IncomingCallActivity.ACTION_DECLINE, 2
        );

        Notification.Builder builder = new Notification.Builder(context, CALL_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(callerName)
                .setContentText(mode.equals("video") ? "Входящий видеозвонок" : "Входящий аудиозвонок")
                .setCategory(Notification.CATEGORY_CALL)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setTimeoutAfter(120_000)
                .setContentIntent(showIntent)
                .setFullScreenIntent(showIntent, true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Person caller = new Person.Builder()
                    .setName(callerName)
                    .setImportant(true)
                    .build();
            builder.setStyle(Notification.CallStyle.forIncomingCall(
                    caller,
                    declineIntent,
                    answerIntent
            ));
        } else {
            builder.addAction(0, "Отклонить", declineIntent);
            builder.addAction(0, "Ответить", answerIntent);
        }

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(callNotificationId(callId), builder.build());
    }

    static void showMessage(Context context, Map<String, String> data) {
        if (!NativePushState.notificationsAllowed(context)) return;
        ensureChannels(context);
        String friendId = value(data, "friend_id", "message");
        String friendName = value(data, "friend_name", "Aurora Call");
        String url = value(data, "url", "/");
        PendingIntent openIntent = PendingIntent.getActivity(
                context,
                stableRequestCode("message:" + friendId),
                webIntent(context, url),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification notification = new Notification.Builder(context, MESSAGE_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(friendName)
                .setContentText("Новое сообщение")
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setAutoCancel(true)
                .setContentIntent(openIntent)
                .build();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(messageNotificationId(friendId), notification);
    }

    static Notification activeCallNotification(
            Context context,
            String callId,
            String peerName,
            String mode
    ) {
        ensureChannels(context);
        Intent open = new Intent(context, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.setData(Uri.parse(PROD_ORIGIN + "/"));
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                stableRequestCode("active:" + callId),
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new Notification.Builder(context, ONGOING_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(peerName == null || peerName.isBlank() ? "Aurora Call" : peerName)
                .setContentText("video".equals(mode) ? "Видеозвонок идёт" : "Аудиозвонок идёт")
                .setCategory(Notification.CATEGORY_CALL)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(contentIntent)
                .build();
    }

    static void cancelIncomingCall(Context context, String callId) {
        if (callId == null || callId.isBlank()) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(callNotificationId(callId));
        IncomingCallActivity.finishCall(callId);
    }

    private static Intent webIntent(Context context, String relativeOrAbsoluteUrl) {
        String target = relativeOrAbsoluteUrl == null ? "/" : relativeOrAbsoluteUrl.trim();
        if (!target.startsWith("https://aurora-call.vercel.app")) {
            if (!target.startsWith("/")) target = "/";
            target = PROD_ORIGIN + target;
        }
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(target));
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }

    private static int callNotificationId(String callId) {
        return 20_000 + Math.floorMod(callId.hashCode(), 10_000);
    }

    private static int messageNotificationId(String friendId) {
        return 40_000 + Math.floorMod(friendId.hashCode(), 10_000);
    }

    private static int stableRequestCode(String value) {
        return Math.floorMod(value.hashCode(), 60_000) + 1;
    }

    private static String value(Map<String, String> data, String key, String fallback) {
        String value = data == null ? null : data.get(key);
        return value == null || value.isBlank() ? fallback : value;
    }
}
