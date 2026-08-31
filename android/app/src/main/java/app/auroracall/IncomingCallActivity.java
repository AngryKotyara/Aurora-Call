package app.auroracall;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.lang.ref.WeakReference;

public final class IncomingCallActivity extends Activity {
    static final String ACTION_SHOW = "app.auroracall.action.SHOW_INCOMING_CALL";
    static final String ACTION_ACCEPT = "app.auroracall.action.ACCEPT_CALL";
    static final String ACTION_DECLINE = "app.auroracall.action.DECLINE_CALL";
    private static final String EXTRA_CALL_ID = "call_id";
    private static final String EXTRA_CALLER_NAME = "caller_name";
    private static final String EXTRA_MODE = "mode";
    private static final String PROD_ORIGIN = "https://aurora-call.vercel.app";
    private static WeakReference<IncomingCallActivity> visible = new WeakReference<>(null);

    private String callId = "";

    static PendingIntent pendingIntent(
            Context context,
            String callId,
            String callerName,
            String mode,
            String action,
            int actionOffset
    ) {
        Intent intent = new Intent(context, IncomingCallActivity.class);
        intent.setAction(action);
        intent.putExtra(EXTRA_CALL_ID, callId);
        intent.putExtra(EXTRA_CALLER_NAME, callerName);
        intent.putExtra(EXTRA_MODE, mode);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int requestCode = Math.floorMod((callId + ":" + actionOffset).hashCode(), 60_000) + 1;
        return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    static void finishCall(String callId) {
        IncomingCallActivity activity = visible.get();
        if (activity == null || callId == null || !callId.equals(activity.callId)) return;
        activity.runOnUiThread(activity::finishAndRemoveTask);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        visible = new WeakReference<>(this);
        getWindow().setStatusBarColor(Color.rgb(7, 7, 12));
        getWindow().setNavigationBarColor(Color.rgb(7, 7, 12));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        callId = String.valueOf(intent.getStringExtra(EXTRA_CALL_ID) == null ? "" : intent.getStringExtra(EXTRA_CALL_ID));
        String callerName = intent.getStringExtra(EXTRA_CALLER_NAME);
        String mode = "video".equals(intent.getStringExtra(EXTRA_MODE)) ? "video" : "audio";
        String action = intent.getAction();
        if (ACTION_ACCEPT.equals(action)) {
            acceptCall(callId);
            return;
        }
        if (ACTION_DECLINE.equals(action)) {
            NativeCallApi.decline(this, callId);
            finishAndRemoveTask();
            return;
        }
        render(callerName == null || callerName.isBlank() ? "Aurora Call" : callerName, mode);
    }

    private void acceptCall(String callId) {
        AuroraNotifications.cancelIncomingCall(this, callId);
        Uri target = Uri.parse(PROD_ORIGIN + "/").buildUpon()
                .appendQueryParameter("push", "call")
                .appendQueryParameter("call_id", callId)
                .appendQueryParameter("native_action", "accept")
                .build();
        Intent open = new Intent(this, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.setData(target);
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(open);
        finishAndRemoveTask();
    }

    private void render(String callerName, String mode) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(48), dp(28), dp(48));
        root.setBackgroundColor(Color.rgb(7, 7, 12));

        TextView brand = new TextView(this);
        brand.setText("AURORA CALL");
        brand.setTextColor(Color.rgb(151, 163, 184));
        brand.setTextSize(13);
        brand.setGravity(Gravity.CENTER);
        root.addView(brand, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView caller = new TextView(this);
        caller.setText(callerName);
        caller.setTextColor(Color.WHITE);
        caller.setTextSize(34);
        caller.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams callerParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        callerParams.topMargin = dp(28);
        root.addView(caller, callerParams);

        TextView kind = new TextView(this);
        kind.setText(mode.equals("video") ? "Входящий видеозвонок" : "Входящий аудиозвонок");
        kind.setTextColor(Color.rgb(203, 213, 225));
        kind.setTextSize(17);
        kind.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams kindParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        kindParams.topMargin = dp(10);
        root.addView(kind, kindParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        actionsParams.topMargin = dp(72);
        root.addView(actions, actionsParams);

        Button decline = callButton("Отклонить", Color.rgb(153, 27, 27));
        decline.setOnClickListener(view -> {
            NativeCallApi.decline(this, callId);
            finishAndRemoveTask();
        });
        LinearLayout.LayoutParams declineParams = new LinearLayout.LayoutParams(0, dp(58), 1f);
        declineParams.setMarginEnd(dp(8));
        actions.addView(decline, declineParams);

        Button accept = callButton("Ответить", Color.rgb(21, 128, 61));
        accept.setOnClickListener(view -> acceptCall(callId));
        LinearLayout.LayoutParams acceptParams = new LinearLayout.LayoutParams(0, dp(58), 1f);
        acceptParams.setMarginStart(dp(8));
        actions.addView(accept, acceptParams);

        setContentView(root);
    }

    private Button callButton(String text, int color) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(Color.WHITE);
        button.setTextSize(16);
        button.setAllCaps(false);
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setCornerRadius(dp(18));
        button.setBackground(background);
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        if (visible.get() == this) visible.clear();
        super.onDestroy();
    }
}
