package com.barrantesco.syncengine;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.util.Log;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

/** Inicializa Firebase Messaging con la configuración pública del proyecto inyectada al compilar. */
public final class SyncEngineApplication extends Application {
    private static final String TAG = "SyncEngineFirebase";
    static final String REALTIME_CHANNEL_ID = "sync_engine_realtime";

    @Override
    public void onCreate() {
        super.onCreate();
        createRealtimeChannel();
        if (BuildConfig.FIREBASE_API_KEY.isEmpty()
                || BuildConfig.FIREBASE_PROJECT_ID.isEmpty()
                || BuildConfig.FIREBASE_APP_ID.isEmpty()
                || BuildConfig.FIREBASE_SENDER_ID.isEmpty()) {
            Log.w(TAG, "Falta la configuración Android de Firebase; FCM no estará activo.");
            return;
        }
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApiKey(BuildConfig.FIREBASE_API_KEY)
                    .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                    .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                    .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                    .build();
            FirebaseApp.initializeApp(this, options);
        }
    }

    /** El canal existe antes del primer aviso, también si el sistema lo muestra con la app cerrada. */
    private void createRealtimeChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                REALTIME_CHANNEL_ID,
                getString(R.string.channel_realtime),
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(getString(R.string.realtime_notification_body));
        manager.createNotificationChannel(channel);
    }
}