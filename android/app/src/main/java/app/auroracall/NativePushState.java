package app.auroracall;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.util.UUID;
import java.util.function.Consumer;

final class NativePushState {
    private static final String PREFS = "aurora_native_push";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_TOKEN = "fcm_token";
    private static final String KEY_INSTALLATION_ID = "installation_id";

    private NativePushState() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean userEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    static void setUserEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    static String token(Context context) {
        return prefs(context).getString(KEY_TOKEN, "");
    }

    static void saveToken(Context context, String token) {
        if (token == null || token.isBlank()) return;
        prefs(context).edit().putString(KEY_TOKEN, token).apply();
    }

    static String installationId(Context context) {
        SharedPreferences preferences = prefs(context);
        String current = preferences.getString(KEY_INSTALLATION_ID, "");
        if (current != null && !current.isBlank()) return current;
        String generated = UUID.randomUUID().toString();
        preferences.edit().putString(KEY_INSTALLATION_ID, generated).apply();
        return generated;
    }

    static boolean firebaseConfigured(Context context) {
        try {
            FirebaseApp app;
            try {
                app = FirebaseApp.getInstance();
            } catch (IllegalStateException ignored) {
                app = FirebaseApp.initializeApp(context.getApplicationContext());
            }
            return app != null;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static void refreshToken(Context context, Consumer<String> callback) {
        if (!firebaseConfigured(context)) {
            callback.accept(token(context));
            return;
        }
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                String value = task.isSuccessful() ? task.getResult() : token(context);
                if (value != null && !value.isBlank()) saveToken(context, value);
                callback.accept(value == null ? "" : value);
            });
        } catch (RuntimeException ignored) {
            callback.accept(token(context));
        }
    }

    static boolean notificationsAllowed(Context context) {
        if (!userEnabled(context)) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        return manager != null && manager.areNotificationsEnabled();
    }

    static boolean fullScreenAllowed(Context context) {
        if (Build.VERSION.SDK_INT < 34) return true;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        return manager != null && manager.canUseFullScreenIntent();
    }

    static void openFullScreenSettings(Activity activity) {
        if (Build.VERSION.SDK_INT < 34) return;
        try {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    Uri.parse("package:" + activity.getPackageName())
            );
            activity.startActivity(intent);
        } catch (RuntimeException ignored) {
            activity.startActivity(new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + activity.getPackageName())
            ));
        }
    }

    static JSONObject json(Context context) {
        JSONObject object = new JSONObject();
        try {
            object.put("platform", "android");
            object.put("enabled", notificationsAllowed(context));
            object.put("user_enabled", userEnabled(context));
            object.put("firebase_configured", firebaseConfigured(context));
            object.put("full_screen_allowed", fullScreenAllowed(context));
            object.put("token", token(context));
            object.put("installation_id", installationId(context));
            object.put("app_version", appVersion(context));
            object.put("device_model", deviceModel());
        } catch (Exception ignored) {
        }
        return object;
    }

    private static String appVersion(Context context) {
        try {
            return String.valueOf(
                    context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName
            );
        } catch (PackageManager.NameNotFoundException ignored) {
            return "unknown";
        }
    }

    private static String deviceModel() {
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim();
        String model = Build.MODEL == null ? "" : Build.MODEL.trim();
        return (manufacturer + " " + model).trim();
    }
}
