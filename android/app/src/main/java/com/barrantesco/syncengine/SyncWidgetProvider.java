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

import java.text.DateFormat;
import java.util.Date;

/** Solo Ciudad, Barra y Anillo. El resto no se publica. */
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
    int styleIndex() {
        return 2;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (ACTION_TICK.equals(action)
                || ACTION_REFRESH.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            refreshAll(context);
            scheduleTick(context);
            if (ACTION_REFRESH.equals(action) && AppSettings.isLoggedIn(context)) {
                final PendingResult result = goAsync();
                final Context app = context.getApplicationContext();
                new Thread(() -> {
                    try {
                        SyncRefresher.refresh(app, false);
                    } finally {
                        result.finish();
                    }
                }).start();
            }
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            try {
                updateWidget(context, appWidgetManager, appWidgetId, styleIndex());
            } catch (RuntimeException error) {
                Log.e(TAG, "Failed to render widget id=" + appWidgetId, error);
            }
        }
        scheduleTick(context);
        if (AppSettings.isLoggedIn(context)) {
            SyncJobService.schedule(context);
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
        updateWidget(context, manager, widgetId, styleIndex());
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int style = 0; style < PROVIDERS.length; style++) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, PROVIDERS[style]));
            for (int id : ids) {
                updateWidget(context, manager, id, style);
            }
        }
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        int style = 2;
        android.appwidget.AppWidgetProviderInfo info = manager.getAppWidgetInfo(widgetId);
        if (info != null && info.provider != null) {
            String name = info.provider.getClassName();
            for (int index = 0; index < PROVIDERS.length; index++) {
                if (PROVIDERS[index].getName().equals(name)) {
                    style = index;
                    break;
                }
            }
        }
        updateWidget(context, manager, widgetId, style);
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId, int style) {
        if (style < 0 || style >= PROVIDERS.length) style = 2;
        Bundle options = manager.getAppWidgetOptions(widgetId);
        int widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180);
        int[] size = WidgetRenderer.size(context, widthDp, heightDp);
        boolean loggedIn = AppSettings.isLoggedIn(context);
        android.graphics.Bitmap bitmap = WidgetFaces.render(
                context, style, size[0], size[1],
                AppSettings.timeZone(context),
                AppSettings.use24h(context),
                loggedIn ? AppSettings.unread(context) : 0,
                loggedIn ? AppSettings.missed(context) : 0,
                loggedIn);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.sync_widget);
        int unread = loggedIn ? AppSettings.unread(context) : 0;
        int missed = loggedIn ? AppSettings.missed(context) : 0;
        views.setTextViewText(R.id.widget_status, loggedIn ? "● Sesión sincronizada" : "○ Inicia sesión en SYNC ENGINE");
        views.setTextViewText(R.id.widget_unread, loggedIn ? countLabel(unread, "mensaje") : "— mensajes");
        views.setTextViewText(R.id.widget_missed, loggedIn ? countLabel(missed, "llamada") : "— llamadas");
        views.setTextViewText(R.id.widget_last_sync, syncLabel(context, loggedIn));
        views.setTextViewText(R.id.widget_latest, latestLabel(context, loggedIn));
        views.setImageViewBitmap(R.id.widget_content, bitmap);

        PendingIntent openChats = activityIntent(context, 0, "chats");
        PendingIntent openCalls = activityIntent(context, 1, "calls");
        PendingIntent refresh = PendingIntent.getBroadcast(context, 2,
                new Intent(context, WidgetAnillo.class).setAction(ACTION_REFRESH),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, openChats);
        views.setOnClickPendingIntent(R.id.widget_action_chats, openChats);
        views.setOnClickPendingIntent(R.id.widget_action_calls, openCalls);
        views.setOnClickPendingIntent(R.id.widget_action_refresh, refresh);
        manager.updateAppWidget(widgetId, views);
    }

    private static PendingIntent activityIntent(Context context, int requestCode, String view) {
        Intent intent = new Intent(context, OpenAppActivity.class)
                .putExtra(OpenAppActivity.EXTRA_WIDGET_VIEW, view)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String countLabel(int count, String singular) {
        return count + " " + singular + (count == 1 ? "" : "s");
    }

    private static String latestLabel(Context context, boolean loggedIn) {
        if (!loggedIn) return "Contenido protegido hasta iniciar sesión";
        String from = AppSettings.latestFrom(context);
        if (from.isEmpty()) return "Sin mensajes nuevos";
        String text = AppSettings.latestText(context);
        if (text.isEmpty()) {
            text = "audio".equals(AppSettings.latestType(context)) ? "Nota de voz" : "Archivo adjunto";
        }
        return from + ": " + text.replace('\n', ' ').trim();
    }

    private static String syncLabel(Context context, boolean loggedIn) {
        if (!loggedIn) return "Widget listo · toca para abrir";
        long timestamp = AppSettings.lastSync(context);
        if (timestamp == 0) return "Sincronización pendiente";
        return "Actualizado " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(timestamp));
    }

    private static PendingIntent tickIntent(Context context) {
        Intent intent = new Intent(context, WidgetAnillo.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(context, 2, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void scheduleTick(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        try {
            alarms.set(AlarmManager.RTC, System.currentTimeMillis() + 60_000L, tickIntent(context));
        } catch (SecurityException ignored) {
            Log.w(TAG, "No se pudo programar el reloj del widget");
        }
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
        scheduleTick(context);
    }

    @Override
    public void onDisabled(Context context) {
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
