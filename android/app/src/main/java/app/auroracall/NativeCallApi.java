package app.auroracall;

import android.content.Context;
import android.webkit.CookieManager;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class NativeCallApi {
    private static final String PROD_ORIGIN = "https://aurora-call.vercel.app";
    private static final ExecutorService NETWORK = Executors.newSingleThreadExecutor();

    private NativeCallApi() {
    }

    static void decline(Context context, String callId) {
        if (callId == null || !callId.matches("^[0-9a-fA-F-]{36}$")) return;
        String cookie = CookieManager.getInstance().getCookie(PROD_ORIGIN);
        AuroraNotifications.cancelIncomingCall(context, callId);
        if (cookie == null || cookie.isBlank()) return;
        NETWORK.execute(() -> {
            try {
                JSONObject answer = new JSONObject();
                answer.put("p_call_id", callId);
                answer.put("p_accept", false);
                if (post("/api/rpc/answer_call", answer, cookie)) {
                    JSONObject push = new JSONObject();
                    push.put("action", "notify_call_end");
                    push.put("call_id", callId);
                    post("/api/functions/aurora-push", push, cookie);
                }
            } catch (Exception ignored) {
            }
        });
    }

    private static boolean post(String path, JSONObject body, String cookie) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(PROD_ORIGIN + path).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(8_000);
            connection.setReadTimeout(8_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Cookie", cookie);
            connection.setRequestProperty("X-Client-Info", "aurora-call-android/1");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
            int status = connection.getResponseCode();
            return status >= 200 && status < 300;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
