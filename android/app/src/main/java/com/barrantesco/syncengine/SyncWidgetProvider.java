package com.barrantesco.syncengine;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.widget.RemoteViews;

/** Actualiza las variantes del widget desde la caché local y mantiene el reloj visible. */
public class SyncWidgetProvider extends AppWidgetProvider {
    private static final String TAG = "SyncWidgetProvider";
    private static final String ACTION_TICK = "com.barrantesco.syncengine.WIDGET_TICK";
    static final String ACTION_REFRESH = "com.barrantesco.syncengine.WIDGET_REFRESH";
    private static final String ACTION_BANNER = "com.barrantesco.syncengine.WIDGET_BANNER";

    private static final Class<?>[] PROVIDERS = {
            WidgetCiudad.class,
            WidgetAnillo.class
    };

    /** Ciudad = 0 (ancha), Anillo = 2 (cuadrada). */
    int styleIndex() { return 2; }

    /** Estilo de render de cada proveedor, independiente del índice del array. */
    private static int styleOf(Class<?> provider) {
        return provider == WidgetCiudad.class ? 0 : 2;
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent == null ? null : intent.getAction();
        if (ACTION_BANNER.equals(action)) {
            refreshAll(context);
            return;
        }
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
        for (Class<?> provider : PROVIDERS) {
            int style = styleOf(provider);
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, provider));
            for (int id : ids) updateWidget(context, manager, id, style);
        }
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        int style = 2;
        AppWidgetProviderInfo info = manager.getAppWidgetInfo(widgetId);
        if (info != null && info.provider != null) {
            for (Class<?> provider : PROVIDERS) {
                if (provider.getName().equals(info.provider.getClassName())) {
                    style = styleOf(provider);
                    break;
                }
            }
        }
        updateWidget(context, manager, widgetId, style);
    }

    /** Compone el fondo premium, superpone el reloj vivo del sistema y enlaza los accesos. */
    static void updateWidget(Context context, AppWidgetManager manager, int widgetId, int style) {
        if (style != 0 && style != 2) style = 2;
        Bundle options = manager.getAppWidgetOptions(widgetId);
        int widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,
                options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250));
        int heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,
                options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180));
        int[] size = WidgetRenderer.size(context, widthDp, heightDp);

        int layout = style == 0 ? R.layout.widget_ciudad : R.layout.widget_anillo;
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);

        boolean animations = AppSettings.animations(context);
        Bitmap frameA = WidgetRenderer.render(context, size[0], size[1], style, 0);
        views.setImageViewBitmap(R.id.widget_frame_a, frameA);
        if (animations) {
            views.setImageViewBitmap(R.id.widget_frame_b,
                    WidgetRenderer.render(context, size[0], size[1], style, 1));
            views.setInt(R.id.widget_flipper, "setFlipInterval", 4000);
        } else {
            views.setImageViewBitmap(R.id.widget_frame_b, frameA);
            views.setInt(R.id.widget_flipper, "setFlipInterval", 86400000);
        }

        String zone = AppSettings.effectiveTimeZone(context);
        boolean auto = AppSettings.auto24h(context);
        boolean use24h = AppSettings.use24h(context);
        String fmt12 = (auto || !use24h) ? "h:mm" : "HH:mm";
        String fmt24 = (auto || use24h) ? "HH:mm" : "h:mm";
        views.setString(R.id.widget_clock, "setTimeZone", zone);
        views.setCharSequence(R.id.widget_clock, "setFormat12Hour", fmt12);
        views.setCharSequence(R.id.widget_clock, "setFormat24Hour", fmt24);
        views.setTextViewTextSize(R.id.widget_clock, TypedValue.COMPLEX_UNIT_DIP,
                heightDp * (style == 2 ? 0.22f : 0.28f));
        views.setTextViewText(R.id.widget_date, WidgetRenderer.date(context));
        views.setTextViewTextSize(R.id.widget_date, TypedValue.COMPLEX_UNIT_DIP,
                Math.max(10f, heightDp * 0.055f));
        if (style == 0) {
            views.setTextViewText(R.id.widget_city, WidgetRenderer.city(context));
            views.setTextViewTextSize(R.id.widget_city, TypedValue.COMPLEX_UNIT_DIP,
                    Math.max(10f, heightDp * 0.05f));
        }

        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
                context, widgetId, new Intent(context, OpenAppActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        views.setOnClickPendingIntent(R.id.widget_settings, PendingIntent.getActivity(
                context, widgetId + 10000, new Intent(context, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(widgetId, views);

        if (AppSettings.isLoggedIn(context)) {
            long until = AppSettings.bannerUntil(context);
            if (until > System.currentTimeMillis()) scheduleBannerExpiry(context, until);
        }
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
        long next = (System.currentTimeMillis() / 60000L + 1) * 60000L;
        PendingIntent intent = tickIntent(context);
        try {
            if (Build.VERSION.SDK_INT >= 31 && !alarms.canScheduleExactAlarms()) {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC, next, intent);
            } else {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC, next, intent);
            }
        } catch (SecurityException error) {
            Log.w(TAG, "No se pudo programar el reloj exacto del widget", error);
            try {
                alarms.set(AlarmManager.RTC, next, intent);
            } catch (SecurityException ignored) {
                // Sin permiso de alarmas: el widget se repintará en el próximo evento del sistema.
            }
        }
    }

    /** Programa el fin del pop-up del remitente para repintar el widget ya sin él. */
    private static void scheduleBannerExpiry(Context context, long when) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        PendingIntent intent = PendingIntent.getBroadcast(context, 3,
                new Intent(context, WidgetAnillo.class).setAction(ACTION_BANNER),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            if (Build.VERSION.SDK_INT >= 31 && !alarms.canScheduleExactAlarms()) {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC, when, intent);
            } else {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC, when, intent);
            }
        } catch (SecurityException error) {
            try {
                alarms.set(AlarmManager.RTC, when, intent);
            } catch (SecurityException ignored) {
                // Sin permiso de alarmas: el pop-up caducará en el próximo repintado.
            }
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
