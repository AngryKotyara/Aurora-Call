package app.auroracall;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ScreenShareService extends Service {
    private static final String ACTION_START = "app.auroracall.action.START_SCREEN_SHARE";
    private static final String ACTION_STOP = "app.auroracall.action.STOP_SCREEN_SHARE";
    private static final String EXTRA_RESULT_CODE = "result_code";
    private static final String EXTRA_RESULT_DATA = "result_data";
    private static final String CHANNEL_ID = "aurora_screen_share";
    private static final int NOTIFICATION_ID = 4101;
    private static final long FRAME_INTERVAL_NS = 125_000_000L;
    private static final int MAX_LONG_EDGE = 1280;

    public interface Listener {
        void onScreenShareFrame(String base64, int width, int height);
        void onScreenShareState(String state);
    }

    private static volatile Listener listener;

    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread captureThread;
    private Handler captureHandler;
    private final AtomicBoolean frameInFlight = new AtomicBoolean(false);
    private long lastFrameNanos = 0L;
    private boolean stopping = false;

    public static void setListener(Listener value) {
        listener = value;
    }

    public static Intent createCaptureIntent(Context context) {
        MediaProjectionManager manager =
                (MediaProjectionManager) context.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        return manager.createScreenCaptureIntent();
    }

    public static Intent createStartIntent(Context context, int resultCode, Intent resultData) {
        return new Intent(context, ScreenShareService.class)
                .setAction(ACTION_START)
                .putExtra(EXTRA_RESULT_CODE, resultCode)
                .putExtra(EXTRA_RESULT_DATA, resultData);
    }

    public static Intent createStopIntent(Context context) {
        return new Intent(context, ScreenShareService.class).setAction(ACTION_STOP);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopShare(true);
            return START_NOT_STICKY;
        }

        if (!ACTION_START.equals(action) || intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        if (resultCode == 0 || resultData == null) {
            notifyState("failed");
            stopSelf();
            return START_NOT_STICKY;
        }

        startProjectionForeground();
        startShare(resultCode, resultData);
        return START_NOT_STICKY;
    }

    private void startProjectionForeground() {
        Intent stopIntent = createStopIntent(this);
        PendingIntent stopPendingIntent = PendingIntent.getService(
                this,
                1,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Action stopAction = new Notification.Action.Builder(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Остановить",
                stopPendingIntent
        ).build();

        Notification notification = new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Aurora Call")
                .setContentText("Демонстрация экрана активна")
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .addAction(stopAction)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startShare(int resultCode, Intent resultData) {
        if (mediaProjection != null) {
            notifyState("started");
            return;
        }

        stopping = false;
        MediaProjectionManager manager =
                (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);

        try {
            mediaProjection = manager.getMediaProjection(resultCode, resultData);
        } catch (SecurityException error) {
            notifyState("failed");
            stopShare(true);
            return;
        }

        if (mediaProjection == null) {
            notifyState("failed");
            stopShare(true);
            return;
        }

        captureThread = new HandlerThread("AuroraScreenCapture");
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());

        mediaProjection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                mediaProjection = null;
                cleanupCaptureResources();
                notifyState("stopped");
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelf();
            }
        }, captureHandler);

        CaptureSize size = getCaptureSize();
        imageReader = ImageReader.newInstance(
                size.width,
                size.height,
                PixelFormat.RGBA_8888,
                2
        );
        imageReader.setOnImageAvailableListener(this::handleImageAvailable, captureHandler);

        try {
            virtualDisplay = mediaProjection.createVirtualDisplay(
                    "AuroraCallScreen",
                    size.width,
                    size.height,
                    size.densityDpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    imageReader.getSurface(),
                    null,
                    captureHandler
            );
            notifyState("started");
        } catch (RuntimeException error) {
            notifyState("failed");
            stopShare(true);
        }
    }

    private CaptureSize getCaptureSize() {
        int width;
        int height;
        int densityDpi;

        WindowManager windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        densityDpi = metrics.densityDpi;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Rect bounds = windowManager.getMaximumWindowMetrics().getBounds();
            width = bounds.width();
            height = bounds.height();
        } else {
            DisplayMetrics realMetrics = new DisplayMetrics();
            windowManager.getDefaultDisplay().getRealMetrics(realMetrics);
            width = realMetrics.widthPixels;
            height = realMetrics.heightPixels;
            densityDpi = realMetrics.densityDpi;
        }

        int longEdge = Math.max(width, height);
        if (longEdge > MAX_LONG_EDGE) {
            float scale = MAX_LONG_EDGE / (float) longEdge;
            width = Math.max(2, Math.round(width * scale));
            height = Math.max(2, Math.round(height * scale));
        }

        if ((width & 1) != 0) width--;
        if ((height & 1) != 0) height--;
        return new CaptureSize(width, height, densityDpi);
    }

    private void handleImageAvailable(ImageReader reader) {
        Image image = reader.acquireLatestImage();
        if (image == null) return;

        long now = SystemClock.elapsedRealtimeNanos();
        if (now - lastFrameNanos < FRAME_INTERVAL_NS || !frameInFlight.compareAndSet(false, true)) {
            image.close();
            return;
        }
        lastFrameNanos = now;

        try {
            Image.Plane[] planes = image.getPlanes();
            if (planes.length == 0) return;

            Image.Plane plane = planes[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixelStride = plane.getPixelStride();
            int rowStride = plane.getRowStride();
            int rowPadding = rowStride - pixelStride * image.getWidth();
            int paddedWidth = image.getWidth() + rowPadding / pixelStride;

            Bitmap padded = Bitmap.createBitmap(
                    paddedWidth,
                    image.getHeight(),
                    Bitmap.Config.ARGB_8888
            );
            padded.copyPixelsFromBuffer(buffer);
            Bitmap cropped = Bitmap.createBitmap(
                    padded,
                    0,
                    0,
                    image.getWidth(),
                    image.getHeight()
            );

            ByteArrayOutputStream output = new ByteArrayOutputStream(128 * 1024);
            cropped.compress(Bitmap.CompressFormat.JPEG, 62, output);
            String base64 = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);

            Listener currentListener = listener;
            if (currentListener != null) {
                currentListener.onScreenShareFrame(base64, cropped.getWidth(), cropped.getHeight());
            }

            cropped.recycle();
            padded.recycle();
        } catch (RuntimeException ignored) {
        } finally {
            image.close();
            frameInFlight.set(false);
        }
    }

    private void stopShare(boolean notifyStopped) {
        if (stopping) return;
        stopping = true;

        MediaProjection projection = mediaProjection;
        mediaProjection = null;
        if (projection != null) {
            projection.stop();
        } else {
            cleanupCaptureResources();
            if (notifyStopped) notifyState("stopped");
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        }
    }

    private void cleanupCaptureResources() {
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (imageReader != null) {
            imageReader.setOnImageAvailableListener(null, null);
            imageReader.close();
            imageReader = null;
        }
        if (captureThread != null) {
            captureThread.quitSafely();
            captureThread = null;
            captureHandler = null;
        }
        frameInFlight.set(false);
        lastFrameNanos = 0L;
        stopping = false;
    }

    private void notifyState(String state) {
        Listener currentListener = listener;
        if (currentListener != null) currentListener.onScreenShareState(state);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Демонстрация экрана",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Системное уведомление во время демонстрации экрана Aurora Call");
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    @Override
    public void onDestroy() {
        if (mediaProjection != null || virtualDisplay != null || imageReader != null) {
            stopShare(false);
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static final class CaptureSize {
        final int width;
        final int height;
        final int densityDpi;

        CaptureSize(int width, int height, int densityDpi) {
            this.width = width;
            this.height = height;
            this.densityDpi = densityDpi;
        }
    }
}
