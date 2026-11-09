package com.barrantesco.syncengine;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.widget.RemoteViews;

/** Actualiza las variantes del widget desde la caché local y mantiene el reloj visible. */
public class SyncWidgetProvider extends AppWidgetProvider {
    private static final String TAG = "SyncWidgetProvider";
    private static final String ACTION_TICK = "com.barrantesco.syncengine.WIDGET_TICK";
    static final String ACTION_REFRESH = "com.barrantesco.syncengine.WIDGET_REFRESH";

    private static final Class<?>[] PROVIDERS = {
            WidgetCiudad.class,
            WidgetBarra.class,
            WidgetAnillo.class
    };

    /** Ciudad = 0, Barra = 1, Anillo = 2. */
    int styleIndex() { return 2; }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent == null ? null : intent.getAction();
        if (ACTION_TICK.equals(action) || ACTION_REFRESH.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            refreshAll(context);
            scheduleTick(context);
            if (ACTION_REFRESH.equals(action) && AppSettings.isLoggedIn(context)) {
                PendingResult result = goAsync();
                Context app = context.getApplicationContext();
                new Thread(() -> {
                    try { SyncRefresher.refresh(app, false); }
                    finally { result.finish(); }
                }).start();
            }
        }
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            try { updateWidget(context, manager, id, styleIndex()); }
            catch (RuntimeException error) { Log.e(TAG, "No se pudo dibujar el widget " + id, error); }
        }
        scheduleTick(context);
        if (AppSettings.isLoggedIn(context)) {
            SyncJobService.schedule(context);
            PendingResult result = goAsync();
            Context app = context.getApplicationContext();
            new Thread(() -> {
                try { SyncRefresher.refresh(app); }
                finally { result.finish(); }
            }).start();
        }
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager,
                                                     int widgetId, Bundle options) {
        updateWidget(context, manager, widgetId, styleIndex());
    }

    /** Repinta todas las instancias activas desde valores locales; no realiza consultas de red. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int style = 0; style < PROVIDERS.length; style++) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, PROVIDERS[style]));
            for (int id : ids) updateWidget(context, manager, id, style);
        }
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        int style = 2;
        AppWidgetManager.AppWidgetProviderInfo info = manager.getAppWidgetInfo(widgetId);
        if (info != null && info.provider != null) {
            for (int index = 0; index < PROVIDERS.length; index++) {
                if (PROVIDERS[index].getName().equals(info.provider.getClassName())) {
                    style = index;
                    break;
                }
            }
        }
        updateWidget(context, manager, widgetId, style);
    }

    /** Renderiza la caché de estado y conserva el acceso a la APK y a sus ajustes. */
    static void updateWidget(Context context, AppWidgetManager manager, int widgetId, int style) {
        if (style < 0 || style >= PROVIDERS.length) style = 2;
        Bundle options = manager.getAppWidgetOptions(widgetId);
        int widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,
                options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250));
        int heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,
                options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180));
        int[] size = WidgetRenderer.size(context, widthDp, heightDp);
        boolean signedIn = AppSettings.isLoggedIn(context);
        String file = signedIn ? AppSettings.receivedFile(context) : "";
        if (signedIn && file.isEmpty() && "file".equals(AppSettings.latestType(context))) {
            file = "Archivo recibido";
        }
        String clipboard = signedIn ? AppSettings.clipboardState(context) : "";
        android.graphics.Bitmap bitmap = WidgetRenderer.render(context, size[0], size[1],
                AppSettings.timeZone(context), AppSettings.use24h(context), signedIn, file, clipboard);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.sync_widget);
        views.setImageViewBitmap(R.id.widget_content, bitmap);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
                context, widgetId, new Intent(context, OpenAppActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        views.setOnClickPendingIntent(R.id.widget_settings, PendingIntent.getActivity(
                context, widgetId + 10000, new Intent(context, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(widgetId, views);
    }

    private static PendingIntent tickIntent(Context context) {
        return PendingIntent.getBroadcast(context, 2,
                new Intent(context, WidgetAnillo.class).setAction(ACTION_TICK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Programa un repintado local por minuto para actualizar la hora, sin consumir red. */
    private static void scheduleTick(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        try {
            long next = (System.currentTimeMillis() / 60000L + 1) * 60000L;
            alarms.set(AlarmManager.RTC, next, tickIntent(context));
        } catch (SecurityException error) {
            Log.w(TAG, "No se pudo programar el reloj del widget", error);
        }
    }

    @Override public void onDeleted(Context context, int[] appWidgetIds) {
        super.onDeleted(context, appWidgetIds);
        android.content.SharedPreferences.Editor editor = context
                .getSharedPreferences(WidgetUrls.PREFERENCES, Context.MODE_PRIVATE).edit();
        for (int widgetId : appWidgetIds) editor.remove("widget_url_" + widgetId);
        editor.apply();
    }

    @Override public void onEnabled(Context context) {
        super.onEnabled(context);
        refreshAll(context);
        scheduleTick(context);
    }

    @Override public void onDisabled(Context context) {
        super.onDisabled(context);
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> provider : PROVIDERS) {
            if (manager.getAppWidgetIds(new ComponentName(context, provider)).length > 0) return;
        }
        SyncJobService.cancel(context);
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms != null) alarms.cancel(tickIntent(context));
    }
}
