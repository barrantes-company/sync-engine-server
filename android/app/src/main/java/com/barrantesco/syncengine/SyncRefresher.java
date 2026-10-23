package com.barrantesco.syncengine;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONException;

import java.io.IOException;

/** Consulta el resumen al servidor, actualiza el widget y lanza notificaciones nuevas. */
final class SyncRefresher {
    private static final String CHANNEL_MESSAGES = "messages";
    private static final String CHANNEL_CALLS = "calls";
    private static final int NOTIFICATION_MESSAGES = 1001;
    private static final int NOTIFICATION_CALLS = 1002;

    private SyncRefresher() {
    }

    /**
     * Actualiza contadores y notificaciones. Bloquea con red, así que no llamar en el hilo principal.
     * @return true si la consulta tuvo éxito (o no había sesión que consultar).
     */
    static boolean refresh(Context context) {
<<<<<<< HEAD
=======
        return refresh(context, true);
    }

    /** Refresca caché sin emitir avisos; el llamador ya está mostrando una notificación FCM. */
    static boolean refresh(Context context, boolean emitNotifications) {
>>>>>>> origin/main
        Context app = context.getApplicationContext();
        String token = AppSettings.token(app);
        String url = WidgetUrls.defaultUrl(app);
        if (token.isEmpty() || !WidgetUrls.isWidgetUrl(url)) {
            return true;
        }
        try {
            ApiClient.Summary summary = ApiClient.summary(
                    WidgetUrls.origin(url), token, AppSettings.callsSeenAt(app));
            AppSettings.saveCounts(app, summary.unreadMessages, summary.missedCalls);
<<<<<<< HEAD
            AppSettings.markSyncSucceeded(app);
            if (AppSettings.notifications(app)) {
=======
            if (emitNotifications && AppSettings.notifications(app)) {
>>>>>>> origin/main
                notifyNew(app, summary);
            }
            SyncWidgetProvider.refreshAll(app);
            return true;
        } catch (ApiClient.AuthException exception) {
            AppSettings.clearSession(app);
            SyncWidgetProvider.refreshAll(app);
            return true;
        } catch (IOException | JSONException exception) {
            return false;
        }
    }

    private static void notifyNew(Context context, ApiClient.Summary summary) {
        long lastTimestamp = AppSettings.notifiedMessageTimestamp(context);
        long newest = lastTimestamp;
        int fresh = 0;
        ApiClient.UnreadMessage first = null;
        for (ApiClient.UnreadMessage message : summary.latest) {
            if (message.timestamp > lastTimestamp) {
                fresh++;
                if (first == null) {
                    first = message;
                }
                newest = Math.max(newest, message.timestamp);
            }
        }
        if (fresh > 0 && first != null) {
            String body = first.text.isEmpty() ? preview(context, first.type) : first.text;
            String title = summary.unreadMessages > 1
                    ? context.getString(R.string.notif_messages_title, summary.unreadMessages)
                    : first.fromName;
            show(context, CHANNEL_MESSAGES, NOTIFICATION_MESSAGES, title,
                    summary.unreadMessages > 1 ? first.fromName + ": " + body : body);
            AppSettings.setNotifiedMessageTimestamp(context, newest);
        }

        int notifiedMissed = AppSettings.notifiedMissed(context);
        if (summary.missedCalls > notifiedMissed) {
            show(context, CHANNEL_CALLS, NOTIFICATION_CALLS,
                    context.getString(R.string.notif_calls_title),
                    context.getResources().getQuantityString(
                            R.plurals.notif_calls_body, summary.missedCalls, summary.missedCalls));
        }
        AppSettings.setNotifiedMissed(context, summary.missedCalls);
    }

    private static String preview(Context context, String type) {
        switch (type) {
            case "audio":
                return context.getString(R.string.preview_audio);
            case "file":
                return context.getString(R.string.preview_file);
            default:
                return context.getString(R.string.preview_message);
        }
    }

    private static void show(Context context, String channel, int id, String title, String body) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || !manager.areNotificationsEnabled()) {
            return;
        }
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        if (Build.VERSION.SDK_INT >= 26) {
            String name = CHANNEL_CALLS.equals(channel)
                    ? context.getString(R.string.channel_calls)
                    : context.getString(R.string.channel_messages);
            manager.createNotificationChannel(
                    new NotificationChannel(channel, name, NotificationManager.IMPORTANCE_HIGH));
        }
        PendingIntent open = PendingIntent.getActivity(context, id,
                new Intent(context, OpenAppActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new android.app.Notification.Builder(context, channel)
                : new android.app.Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_widget_open)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(open)
                .setAutoCancel(true);
        manager.notify(id, builder.build());
    }
}
