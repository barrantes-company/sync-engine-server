package com.barrantesco.syncengine;

import android.content.Context;
import android.util.Log;

import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.SetOptions;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.HashMap;
import java.util.Map;

/** Obtiene y sincroniza el token Firebase del dispositivo con Firestore y la cuenta SYNC ENGINE. */
final class FcmRegistration {
    private static final String TAG = "SyncEngineFCM";
    private static final String USERS_COLLECTION = "users";

    private FcmRegistration() {
    }

    /** Solicita el token si Firebase está configurado y lo registra cuando hay sesión o inicio. */
    static void registerCurrentDevice(Context context) {
        Context app = context.getApplicationContext();
        if (FirebaseApp.getApps(app).isEmpty()) {
            return;
        }
        FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> register(app, token))
                .addOnFailureListener(error -> Log.w(TAG, "No se pudo obtener el token FCM.", error));
    }

    /** Envía el nuevo token recibido del servicio Firebase y lo almacena en Firestore y backend. */
    static void register(Context context, String fcmToken) {
        Context app = context.getApplicationContext();
        if (fcmToken == null || fcmToken.isEmpty()) {
            return;
        }
        AppSettings.saveFcmToken(app, fcmToken);

        // Guardar en Firestore bajo el documento del usuario (campo fcmToken)
        saveTokenToFirestore(app, fcmToken, null);

        String authToken = AppSettings.token(app);
        String url = WidgetUrls.defaultUrl(app);
        if (authToken.isEmpty() || !WidgetUrls.isWidgetUrl(url)) {
            return;
        }
        new Thread(() -> {
            try {
                ApiClient.registerFcmToken(WidgetUrls.origin(url), authToken, fcmToken);
            } catch (Exception exception) {
                Log.w(TAG, "No se pudo registrar el token FCM en el servidor.", exception);
            }
        }).start();
    }

    /**
     * Guarda el token FCM en Cloud Firestore bajo el documento del usuario.
     * Si no se especifica explicitUserId, usa el UID de FirebaseAuth o el usuario de AppSettings.
     */
    static void saveTokenToFirestore(Context context, String fcmToken, String explicitUserId) {
        if (FirebaseApp.getApps(context).isEmpty() || fcmToken == null || fcmToken.isEmpty()) {
            return;
        }
        String userId = explicitUserId;
        if (userId == null || userId.isEmpty()) {
            if (FirebaseAuth.getInstance().getCurrentUser() != null) {
                userId = FirebaseAuth.getInstance().getCurrentUser().getUid();
            } else {
                userId = AppSettings.userName(context);
            }
        }
        if (userId == null || userId.isEmpty()) {
            userId = "anonymous";
        }

        FirebaseFirestore db = FirebaseFirestore.getInstance();
        Map<String, Object> data = new HashMap<>();
        data.put("fcmToken", fcmToken);
        data.put("updatedAt", FieldValue.serverTimestamp());

        final String docId = userId;
        db.collection(USERS_COLLECTION).document(docId)
                .set(data, SetOptions.merge())
                .addOnSuccessListener(aVoid -> Log.d(TAG, "Token FCM guardado en Firestore users/" + docId))
                .addOnFailureListener(e -> Log.w(TAG, "No se pudo guardar el token en Firestore users/" + docId, e));
    }

    /** Llamado cuando el usuario se autentica en la app para asociar el token FCM a su cuenta. */
    static void onUserAuthenticated(Context context, String userId) {
        Context app = context.getApplicationContext();
        String currentToken = AppSettings.fcmToken(app);
        if (currentToken != null && !currentToken.isEmpty()) {
            saveTokenToFirestore(app, currentToken, userId);
        }
        registerCurrentDevice(app);
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
            } catch (Exception exception) {
                Log.w(TAG, "No se pudo retirar el token FCM del servidor.", exception);
            }
        }).start();
    }
}
