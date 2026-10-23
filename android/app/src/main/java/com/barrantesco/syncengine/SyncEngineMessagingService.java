package com.barrantesco.syncengine;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

<<<<<<< HEAD
import java.util.Map;

=======
>>>>>>> origin/main
/** Recibe avisos FCM de mensajes y llamadas entrantes y los muestra como notificaciones Android. */
public final class SyncEngineMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = SyncEngineApplication.REALTIME_CHANNEL_ID;

    @Override
    public void onNewToken(String token) {
        FcmRegistration.register(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
<<<<<<< HEAD
        String title = null;
        String body = null;

        // 1. Prioridad al payload de notificación estándar de Firebase
        RemoteMessage.Notification notificationPayload = message.getNotification();
        if (notificationPayload != null) {
            title = notificationPayload.getTitle();
            body = notificationPayload.getBody();
        }

        // 2. Extraer o completar con datos del payload "data"
        Map<String, String> data = message.getData();
        if (data != null && !data.isEmpty()) {
            if (title == null || title.isEmpty()) {
                title = data.get("title");
            }
            if (body == null || body.isEmpty()) {
                body = data.get("body");
            }
        }

        // 3. Fallbacks defensivos si faltan cadenas
        if (title == null || title.isEmpty()) {
            title = getString(R.string.app_name);
        }
        if (body == null || body.isEmpty()) {
            body = getString(R.string.realtime_notification_body);
        }

        String conversationId = null;
        String type = null;
        if (data != null && !data.isEmpty()) {
            conversationId = data.get("conversationId");
            if (conversationId == null || conversationId.isEmpty()) {
                conversationId = data.get("syncId");
            }
            if (conversationId == null || conversationId.isEmpty()) {
                conversationId = data.get("fromSyncId");
            }
            if (conversationId == null || conversationId.isEmpty()) {
                conversationId = data.get("channelId");
            }
            type = data.get("type");
        }

        boolean isCall = "call".equals(type);
        showNotification(title, body, conversationId, isCall);
        SyncRefresher.refresh(getApplicationContext());
    }

    private void showNotification(String title, String body, String conversationId, boolean call) {
=======
        String title = message.getData().get("title");
        String body = message.getData().get("body");
        String type = message.getData().get("type");
        // FCM es la vía inmediata; respetar el ajuste del usuario y refrescar contadores
        // sin generar una segunda notificación por el mismo evento.
        if (AppSettings.notifications(this)) {
            showNotification(
                    title == null || title.isEmpty() ? getString(R.string.app_name) : title,
                    body == null ? getString(R.string.realtime_notification_body) : body,
                    "call".equals(type));
        }
        SyncRefresher.refresh(getApplicationContext(), false);
    }

    private void showNotification(String title, String body, boolean call) {
>>>>>>> origin/main
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || !manager.areNotificationsEnabled()) {
            return;
        }
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        if (Build.VERSION.SDK_INT >= 26) {
<<<<<<< HEAD
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.channel_realtime),
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Notificaciones de mensajes y llamadas en tiempo real");
            channel.enableLights(true);
            channel.setLightColor(0xFF0A84FF);
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(this, WebAppActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (conversationId != null && !conversationId.isEmpty()) {
            open.putExtra("conversationId", conversationId);
            open.putExtra("syncId", conversationId);
        }

        int requestCode = conversationId != null ? Math.abs(conversationId.hashCode()) : (call ? 4202 : 4203);
        PendingIntent content = PendingIntent.getActivity(
                this,
                requestCode,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_widget_open)
                .setColor(0xFF0A84FF)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(content)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(call ? NotificationCompat.CATEGORY_CALL : NotificationCompat.CATEGORY_MESSAGE);

        int notificationId = conversationId != null ? Math.abs(conversationId.hashCode()) : (call ? 4202 : 4203);
        manager.notify(notificationId, notification.build());
=======
            manager.createNotificationChannel(new NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.channel_realtime),
                    NotificationManager.IMPORTANCE_HIGH));
        }
        Intent open = new Intent(this, OpenAppActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(
                this, call ? 4202 : 4203, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_widget_open)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(content)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(call ? NotificationCompat.CATEGORY_CALL : NotificationCompat.CATEGORY_MESSAGE);
        manager.notify(call ? 4202 : 4203, notification.build());
>>>>>>> origin/main
    }
}
