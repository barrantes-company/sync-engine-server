package com.barrantesco.syncengine;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/** Widget de pantalla de inicio: reloj, contadores de mensajes/llamadas y accesos rápidos. */
public final class SyncWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_TICK = "com.barrantesco.syncengine.WIDGET_TICK";
    private static final int[] FRAME_IDS = {
            R.id.widget_frame_0, R.id.widget_frame_1, R.id.widget_frame_2,
            R.id.widget_frame_3, R.id.widget_frame_4, R.id.widget_frame_5};
    private static final int[] FRAME_DRAWABLES = {
            R.drawable.widget_trails_0, R.drawable.widget_trails_1, R.drawable.widget_trails_2,
            R.drawable.widget_trails_3, R.drawable.widget_trails_4, R.drawable.widget_trails_5};

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

        if (AppSettings.animations(context)) {
            views.setViewVisibility(R.id.widget_flipper, View.VISIBLE);
            views.setViewVisibility(R.id.widget_static, View.GONE);
            for (int i = 0; i < FRAME_IDS.length; i++) {
                views.setImageViewResource(FRAME_IDS[i], FRAME_DRAWABLES[i]);
            }
        } else {
            views.setViewVisibility(R.id.widget_flipper, View.GONE);
            views.setViewVisibility(R.id.widget_static, View.VISIBLE);
            views.setImageViewResource(R.id.widget_static, FRAME_DRAWABLES[0]);
        }

        String[] status = new String[0];
        boolean dim = false;
        if (AppSettings.showCounters(context)) {
            if (AppSettings.isLoggedIn(context)) {
                int unread = AppSettings.unread(context);
                int missed = AppSettings.missed(context);
                status = new String[] {
                        String.valueOf(unread), unread == 1 ? "mensaje" : "mensajes",
                        String.valueOf(missed), missed == 1 ? "llamada" : "llamadas"};
                dim = unread + missed == 0;
            } else {
                status = new String[] {"", context.getString(R.string.widget_sign_in)};
            }
        }
        android.graphics.Bitmap text = WidgetRenderer.text(context, w, h, AppSettings.timeZone(context),
                AppSettings.use24h(context), status, dim);
        views.setImageViewBitmap(R.id.widget_text, text);

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
