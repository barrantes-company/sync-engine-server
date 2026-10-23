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

/** Recibe avisos FCM de mensajes y llamadas entrantes y los muestra como notificaciones Android. */
public final class SyncEngineMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "sync_engine_realtime";

    @Override
    public void onNewToken(String token) {
        FcmRegistration.register(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        String title = message.getData().get("title");
        String body = message.getData().get("body");
        String type = message.getData().get("type");
        showNotification(
                title == null || title.isEmpty() ? getString(R.string.app_name) : title,
                body == null ? getString(R.string.realtime_notification_body) : body,
                "call".equals(type));
        SyncRefresher.refresh(getApplicationContext());
    }

    private void showNotification(String title, String body, boolean call) {
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
    }
}
