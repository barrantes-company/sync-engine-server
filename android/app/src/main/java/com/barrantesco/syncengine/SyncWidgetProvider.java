package com.barrantesco.syncengine;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

/** Widget de pantalla de inicio: reloj, contadores de mensajes/llamadas y accesos rápidos. */
public final class SyncWidgetProvider extends AppWidgetProvider {
    private static final int COLOR_IDLE = 0x8CFFFFFF;
    private static final int COLOR_ACTIVE = 0xFFFFFFFF;

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
        if (AppSettings.isLoggedIn(context)) {
            SyncJobService.schedule(context);
            // Refresco inmediato fuera del hilo principal, sin que el sistema mate el receiver.
            final PendingResult result = goAsync();
            final Context app = context.getApplicationContext();
            new Thread(() -> {
                try {
                    SyncRefresher.refresh(app);
                } finally {
                    result.finish();
                }
            }).start();
        }
    }

    /** Repinta todos los widgets con la configuración y contadores en caché. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, SyncWidgetProvider.class));
        for (int id : ids) {
            updateWidget(context, manager, id);
        }
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.sync_widget);

        String zone = AppSettings.timeZone(context);
        String hourFormat = AppSettings.use24h(context) ? "HH:mm" : "h:mm a";
        views.setCharSequence(R.id.widget_clock, "setFormat24Hour", hourFormat);
        views.setCharSequence(R.id.widget_clock, "setFormat12Hour", hourFormat);
        views.setString(R.id.widget_clock, "setTimeZone", zone);
        views.setString(R.id.widget_date, "setTimeZone", zone);

        boolean animated = AppSettings.animations(context);
        views.setViewVisibility(R.id.widget_trails_flipper, animated ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_trails_static, animated ? View.GONE : View.VISIBLE);

        if (AppSettings.showCounters(context)) {
            views.setViewVisibility(R.id.widget_status, View.VISIBLE);
            if (AppSettings.isLoggedIn(context)) {
                int unread = AppSettings.unread(context);
                int missed = AppSettings.missed(context);
                views.setTextViewText(R.id.widget_status, context.getString(
                        R.string.widget_counts,
                        context.getResources().getQuantityString(R.plurals.messages_count, unread, unread),
                        context.getResources().getQuantityString(R.plurals.calls_count, missed, missed)));
                views.setTextColor(R.id.widget_status,
                        unread + missed > 0 ? COLOR_ACTIVE : COLOR_IDLE);
            } else {
                views.setTextViewText(R.id.widget_status, context.getString(R.string.widget_sign_in));
                views.setTextColor(R.id.widget_status, COLOR_IDLE);
            }
        } else {
            views.setViewVisibility(R.id.widget_status, View.GONE);
        }

        PendingIntent open = PendingIntent.getActivity(
                context,
                0,
                new Intent(context, OpenAppActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, open);
        views.setOnClickPendingIntent(R.id.widget_open, open);

        views.setOnClickPendingIntent(R.id.widget_settings, PendingIntent.getActivity(
                context,
                1,
                new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(widgetId, views);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        super.onDeleted(context, appWidgetIds);
        android.content.SharedPreferences.Editor editor =
                context.getSharedPreferences(WidgetUrls.PREFERENCES, Context.MODE_PRIVATE).edit();
        for (int widgetId : appWidgetIds) {
            editor.remove("widget_url_" + widgetId);
        }
        editor.apply();
    }

    @Override
    public void onEnabled(Context context) {
        super.onEnabled(context);
        refreshAll(context);
    }

    @Override
    public void onDisabled(Context context) {
        super.onDisabled(context);
        SyncJobService.cancel(context);
    }
}
