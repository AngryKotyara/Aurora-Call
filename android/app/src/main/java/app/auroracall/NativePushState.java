package app.auroracall;

import static org.unifiedpush.android.connector.ConstantsKt.INSTANCE_DEFAULT;

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
import android.util.Base64;

import org.json.JSONObject;
import org.unifiedpush.android.connector.UnifiedPush;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import kotlin.Unit;

final class NativePushState {
    private static final String PREFS = "aurora_native_push";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_ENDPOINT = "unifiedpush_endpoint";
    private static final String KEY_P256DH = "unifiedpush_p256dh";
    private static final String KEY_AUTH = "unifiedpush_auth";
    private static final String KEY_TEMPORARY = "unifiedpush_temporary";
    private static final String KEY_INSTALLATION_ID = "installation_id";
    private static final String KEY_REGISTRATION_ERROR = "registration_error";
    private static final String VAPID_PUBLIC_KEY =
            "BMNFI7gc9X-oOOTXoFTRW2oulzz68swL5TOTK5g6EIR_svfw8BHXLG1u3sSMPaj_fxQ2B2XDpPP7jj4qO86chDU";

    private NativePushState() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean userEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    static void setUserEnabled(Context context, boolean enabled) {
        SharedPreferences.Editor editor = prefs(context).edit().putBoolean(KEY_ENABLED, enabled);
        if (!enabled) editor.remove(KEY_REGISTRATION_ERROR);
        editor.apply();
        if (!enabled) {
            clearEndpoint(context);
            try {
                UnifiedPush.unregister(context, INSTANCE_DEFAULT);
            } catch (RuntimeException ignored) {
            }
        }
    }

    static String token(Context context) {
        String endpoint = endpoint(context);
        String p256dh = prefs(context).getString(KEY_P256DH, "");
        String auth = prefs(context).getString(KEY_AUTH, "");
        if (endpoint == null || endpoint.isBlank() || p256dh == null || p256dh.isBlank()
                || auth == null || auth.isBlank()) {
            return "";
        }
        try {
            JSONObject payload = new JSONObject();
            payload.put("v", 1);
            payload.put("provider", "unifiedpush");
            payload.put("endpoint", endpoint);
            payload.put("p256dh", p256dh);
            payload.put("auth", auth);
            payload.put("temporary", prefs(context).getBoolean(KEY_TEMPORARY, false));
            return Base64.encodeToString(
                    payload.toString().getBytes(StandardCharsets.UTF_8),
                    Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING
            );
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String endpoint(Context context) {
        return prefs(context).getString(KEY_ENDPOINT, "");
    }

    static void saveEndpoint(
            Context context,
            String endpoint,
            String p256dh,
            String auth,
            boolean temporary
    ) {
        if (endpoint == null || endpoint.isBlank() || p256dh == null || p256dh.isBlank()
                || auth == null || auth.isBlank()) {
            clearEndpoint(context);
            return;
        }
        prefs(context).edit()
                .putString(KEY_ENDPOINT, endpoint)
                .putString(KEY_P256DH, p256dh)
                .putString(KEY_AUTH, auth)
                .putBoolean(KEY_TEMPORARY, temporary)
                .remove(KEY_REGISTRATION_ERROR)
                .apply();
    }

    static void clearEndpoint(Context context) {
        prefs(context).edit()
                .remove(KEY_ENDPOINT)
                .remove(KEY_P256DH)
                .remove(KEY_AUTH)
                .remove(KEY_TEMPORARY)
                .apply();
    }

    static void setRegistrationError(Context context, String error) {
        SharedPreferences.Editor editor = prefs(context).edit();
        if (error == null || error.isBlank()) editor.remove(KEY_REGISTRATION_ERROR);
        else editor.putString(KEY_REGISTRATION_ERROR, error);
        editor.apply();
    }

    static String installationId(Context context) {
        SharedPreferences preferences = prefs(context);
        String current = preferences.getString(KEY_INSTALLATION_ID, "");
        if (current != null && !current.isBlank()) return current;
        String generated = UUID.randomUUID().toString();
        preferences.edit().putString(KEY_INSTALLATION_ID, generated).apply();
        return generated;
    }

    static void refreshToken(Context context, Consumer<String> callback) {
        if (!userEnabled(context)) {
            callback.accept(token(context));
            return;
        }
        try {
            if (UnifiedPush.getAckDistributor(context) != null) {
                setRegistrationError(context, null);
                UnifiedPush.register(
                        context,
                        INSTANCE_DEFAULT,
                        "Aurora Call — звонки и сообщения",
                        VAPID_PUBLIC_KEY
                );
                callback.accept(token(context));
                return;
            }
            if (!(context instanceof Activity)) {
                callback.accept(token(context));
                return;
            }
            UnifiedPush.tryUseCurrentOrDefaultDistributor((Activity) context, success -> {
                if (Boolean.TRUE.equals(success)) {
                    setRegistrationError(context, null);
                    UnifiedPush.register(
                            context,
                            INSTANCE_DEFAULT,
                            "Aurora Call — звонки и сообщения",
                            VAPID_PUBLIC_KEY
                    );
                    callback.accept(token(context));
                } else {
                    clearEndpoint(context);
                    setRegistrationError(context, "no_distributor");
                    callback.accept("");
                }
                MainActivity.notifyNativePushStateChanged();
                return Unit.INSTANCE;
            });
        } catch (RuntimeException ignored) {
            setRegistrationError(context, "registration_exception");
            callback.accept(token(context));
        }
    }

    static boolean notificationsAllowed(Context context) {
        if (!userEnabled(context) || token(context).isBlank()) return false;
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
            String distributor = UnifiedPush.getAckDistributor(context);
            List<String> distributors = UnifiedPush.getDistributors(context);
            String currentToken = token(context);
            object.put("platform", "android");
            object.put("provider", "unifiedpush");
            object.put("enabled", notificationsAllowed(context));
            object.put("user_enabled", userEnabled(context));
            object.put("firebase_configured", false);
            object.put("unifiedpush_configured", true);
            object.put("registered", !currentToken.isBlank());
            object.put("distributor_available", distributors != null && !distributors.isEmpty());
            object.put("distributor_selected", distributor != null);
            object.put("distributor", distributor == null ? "" : distributor);
            object.put("registration_error", prefs(context).getString(KEY_REGISTRATION_ERROR, ""));
            object.put("full_screen_allowed", fullScreenAllowed(context));
            object.put("token", currentToken);
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
