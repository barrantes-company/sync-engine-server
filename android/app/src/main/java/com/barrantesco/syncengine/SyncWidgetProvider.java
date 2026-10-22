package com.barrantesco.syncengine;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;

/** Widget de pantalla de inicio: reloj, contadores de mensajes/llamadas y accesos rápidos. */
public final class SyncWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_TICK = "com.barrantesco.syncengine.WIDGET_TICK";

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (ACTION_TICK.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            refreshAll(context);
        }
    }

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

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager,
                                          int widgetId, Bundle newOptions) {
        updateWidget(context, manager, widgetId);
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
        Bundle options = manager.getAppWidgetOptions(widgetId);
        int widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 120);
        int[] size = WidgetRenderer.size(context, widthDp, heightDp);
        int w = size[0];
        int h = size[1];
        float unit = size[2] / 100f;

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.sync_widget);
        views.setImageViewBitmap(R.id.widget_content, WidgetRenderer.render(
                context,
                w,
                h,
                unit,
                AppSettings.timeZone(context),
                AppSettings.use24h(context),
                AppSettings.widgetStyle(context),
                AppSettings.userName(context),
                AppSettings.unread(context),
                AppSettings.missed(context),
                AppSettings.isOnline(context)));

        PendingIntent open = PendingIntent.getActivity(
                context,
                0,
                new Intent(context, OpenAppActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, open);
        views.setOnClickPendingIntent(R.id.widget_content, open);
        views.setOnClickPendingIntent(R.id.widget_settings, PendingIntent.getActivity(
                context,
                1000 + widgetId,
                new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(widgetId, views);
        scheduleTick(context);
    }

    /** Programa el repintado en el próximo cambio de minuto para que la hora no se quede atrasada. */
    private static void scheduleTick(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) {
            return;
        }
        long next = (System.currentTimeMillis() / 60000L + 1) * 60000L;
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, next, tickIntent(context));
    }

    private static PendingIntent tickIntent(Context context) {
        Intent intent = new Intent(context, SyncWidgetProvider.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(context, 2, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms != null) {
            alarms.cancel(tickIntent(context));
        }
    }
}
