package com.barrantesco.syncengine;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
<<<<<<< HEAD
import android.widget.RemoteViews;

/** Widget de pantalla de inicio: reloj, contadores de mensajes/llamadas y accesos rápidos. */
public final class SyncWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_TICK = "com.barrantesco.syncengine.WIDGET_TICK";
=======
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Locale;

/** Widget de pantalla de inicio. Cada estilo es un widget distinto en la parrilla. */
public class SyncWidgetProvider extends AppWidgetProvider {
    private static final String TAG = "SyncWidgetProvider";
    private static final String ACTION_TICK = "com.barrantesco.syncengine.WIDGET_TICK";
    private static final int[] LAYOUTS = {
            R.layout.widget_style_0,
            R.layout.widget_style_1,
            R.layout.widget_style_2,
            R.layout.widget_style_3,
            R.layout.widget_style_4,
            R.layout.widget_style_5,
            R.layout.widget_style_6,
            R.layout.widget_style_7
    };

    private static final Class<?>[] PROVIDERS = {
            WidgetReloj.class,
            WidgetSenal.class,
            SyncWidgetProvider.class,
            WidgetLinea.class,
            WidgetBarra.class,
            WidgetFino.class,
            WidgetCiudad.class,
            WidgetAccesos.class
    };

    /** Estilo fijo de este widget. Negro es el que ya estaba instalado. */
    int styleIndex() {
        return 2;
    }
>>>>>>> origin/main

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
<<<<<<< HEAD
=======
        Log.d(TAG, "onReceive action=" + action);
>>>>>>> origin/main
        if (ACTION_TICK.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            refreshAll(context);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        Log.i(TAG, "onUpdate ids=" + java.util.Arrays.toString(appWidgetIds));
        for (int appWidgetId : appWidgetIds) {
            try {
                updateWidget(context, appWidgetManager, appWidgetId, styleIndex());
            } catch (RuntimeException error) {
                Log.e(TAG, "Failed to render widget id=" + appWidgetId, error);
            }
        }
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

    /** Repinta todos los widgets con la configuración y contadores en caché. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int style = 0; style < PROVIDERS.length; style++) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, PROVIDERS[style]));
            for (int id : ids) {
                updateWidget(context, manager, id, style);
            }
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
<<<<<<< HEAD
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
=======
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
        Log.d(TAG, "updateWidget start id=" + widgetId);
        if (style < 0 || style >= LAYOUTS.length) style = 2;
        RemoteViews views = new RemoteViews(context.getPackageName(), LAYOUTS[style]);

        String zone = AppSettings.timeZone(context);
        views.setString(R.id.widget_clock, "setTimeZone", zone);
        views.setString(R.id.widget_date, "setTimeZone", zone);
        CharSequence clockFormat = AppSettings.use24h(context) ? "HH:mm" : "h:mm";
        views.setCharSequence(R.id.widget_clock, "setFormat12Hour", clockFormat);
        views.setCharSequence(R.id.widget_clock, "setFormat24Hour", clockFormat);

        PendingIntent open = PendingIntent.getActivity(
                context,
>>>>>>> origin/main
                0,
                new Intent(context, OpenAppActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, open);
<<<<<<< HEAD
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
=======
        Intent messagesIntent = new Intent(context, OpenAppActivity.class)
                .putExtra(OpenAppActivity.EXTRA_WIDGET_VIEW, "chats")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Intent callsIntent = new Intent(context, OpenAppActivity.class)
                .putExtra(OpenAppActivity.EXTRA_WIDGET_VIEW, "calls")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        views.setOnClickPendingIntent(R.id.widget_messages_action, PendingIntent.getActivity(
                context, 21, messagesIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        views.setOnClickPendingIntent(R.id.widget_calls_action, PendingIntent.getActivity(
                context, 22, callsIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        boolean loggedIn = AppSettings.isLoggedIn(context);
        int unread = loggedIn ? AppSettings.unread(context) : 0;
        int missed = loggedIn ? AppSettings.missed(context) : 0;
        String unreadText = Integer.toString(unread);
        String missedText = Integer.toString(missed);
        if (style == 1) {
            views.setTextViewText(R.id.widget_messages_count, unreadText);
            views.setTextViewText(R.id.widget_calls_count, missedText);
        } else {
            views.setTextViewText(R.id.widget_messages_action, unreadText);
            views.setTextViewText(R.id.widget_calls_action, missedText);
        }
        if (style == 6) {
            views.setViewVisibility(R.id.widget_status, View.VISIBLE);
            views.setTextViewText(R.id.widget_status, city(zone));
        } else if (style == 7) {
            views.setTextViewText(R.id.widget_status, "Mensajes");
        } else if (style != 1 && style != 3) {
            if (loggedIn) {
                views.setViewVisibility(R.id.widget_status, View.VISIBLE);
                views.setTextViewText(R.id.widget_status, "ONLINE");
            } else {
                views.setViewVisibility(R.id.widget_status, View.GONE);
            }
        }

        manager.updateAppWidget(widgetId, views);
        Log.i(TAG, "updateAppWidget submitted id=" + widgetId);
    }

    private static String city(String zone) {
        if (zone == null || zone.isEmpty()) return "";
        int slash = zone.lastIndexOf('/');
        String name = slash >= 0 ? zone.substring(slash + 1) : zone;
        return name.replace('_', ' ');
    }

    private static String spaced(String name) {
        String upper = name.toUpperCase(Locale.US);
        StringBuilder spaced = new StringBuilder();
        for (int index = 0; index < upper.length(); index++) {
            if (index > 0) spaced.append(' ');
            spaced.append(upper.charAt(index));
        }
        return spaced.toString();
>>>>>>> origin/main
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
<<<<<<< HEAD
=======
        Log.i(TAG, "onEnabled");
>>>>>>> origin/main
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
