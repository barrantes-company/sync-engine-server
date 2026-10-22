package com.barrantesco.syncengine;

import android.content.Context;
import android.util.Log;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONException;

import java.io.IOException;

/** Obtiene y sincroniza el token Firebase del dispositivo con la cuenta SYNC ENGINE. */
final class FcmRegistration {
    private static final String TAG = "SyncEngineFCM";

    private FcmRegistration() {
    }

    /** Solicita el token si Firebase está configurado y lo registra cuando hay sesión. */
    static void registerCurrentDevice(Context context) {
        Context app = context.getApplicationContext();
        if (FirebaseApp.getApps(app).isEmpty()) {
            return;
        }
        FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> register(app, token))
                .addOnFailureListener(error -> Log.w(TAG, "No se pudo obtener el token FCM.", error));
    }

    /** Envía el nuevo token recibido del servicio Firebase. */
    static void register(Context context, String fcmToken) {
        Context app = context.getApplicationContext();
        if (fcmToken == null || fcmToken.isEmpty()) {
            return;
        }
        AppSettings.saveFcmToken(app, fcmToken);
        String authToken = AppSettings.token(app);
        String url = WidgetUrls.defaultUrl(app);
        if (authToken.isEmpty() || !WidgetUrls.isWidgetUrl(url)) {
            return;
        }
        new Thread(() -> {
            try {
                ApiClient.registerFcmToken(WidgetUrls.origin(url), authToken, fcmToken);
            } catch (IOException | JSONException exception) {
                Log.w(TAG, "No se pudo registrar el token FCM en el servidor.", exception);
            }
        }).start();
    }

    /** Retira el token del servidor antes de cerrar sesión para no enviar avisos a otra persona. */
    static void unregister(Context context) {
        Context app = context.getApplicationContext();
        String authToken = AppSettings.token(app);
        String fcmToken = AppSettings.fcmToken(app);
        String url = WidgetUrls.defaultUrl(app);
        if (authToken.isEmpty() || fcmToken.isEmpty() || !WidgetUrls.isWidgetUrl(url)) {
            return;
        }
        new Thread(() -> {
            try {
                ApiClient.removeFcmToken(WidgetUrls.origin(url), authToken, fcmToken);
            } catch (IOException | JSONException exception) {
                Log.w(TAG, "No se pudo retirar el token FCM del servidor.", exception);
            }
        }).start();
    }
}
