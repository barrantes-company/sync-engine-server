package com.barrantesco.syncengine;

import android.app.Application;
import android.util.Log;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

/** Inicializa Firebase y registra el token FCM al iniciar la aplicación. */
public final class SyncEngineApplication extends Application {
    private static final String TAG = "SyncEngineFirebase";

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                if (!BuildConfig.FIREBASE_API_KEY.isEmpty()
                        && !BuildConfig.FIREBASE_PROJECT_ID.isEmpty()
                        && !BuildConfig.FIREBASE_APP_ID.isEmpty()) {
                    FirebaseOptions options = new FirebaseOptions.Builder()
                            .setApiKey(BuildConfig.FIREBASE_API_KEY)
                            .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                            .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                            .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                            .build();
                    FirebaseApp.initializeApp(this, options);
                } else {
                    FirebaseApp.initializeApp(this);
                }
            }
            // Obtener el token FCM al iniciar la app
            FcmRegistration.registerCurrentDevice(this);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo inicializar Firebase en la aplicación.", e);
        }
    }
}
