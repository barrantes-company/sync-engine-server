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
import android.view.View;
import android.widget.RemoteViews;

/** Widget de pantalla de inicio: reloj, contadores de mensajes/llamadas y accesos rápidos. */
public final class SyncWidgetProvider extends AppWidgetProvider {
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

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        Log.d(TAG, "onReceive action=" + action);
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
                updateWidget(context, appWidgetManager, appWidgetId);
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
        Log.d(TAG, "updateWidget start id=" + widgetId);
        int style = AppSettings.widgetStyle(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), LAYOUTS[style]);

        String zone = AppSettings.timeZone(context);
        CharSequence clockFormat = AppSettings.use24h(context) ? "HH:mm" : "h:mm a";
        views.setString(R.id.widget_clock, "setTimeZone", zone);
        views.setCharSequence(R.id.widget_clock, "setFormat12Hour", clockFormat);
        views.setCharSequence(R.id.widget_clock, "setFormat24Hour", clockFormat);
        views.setString(R.id.widget_date, "setTimeZone", zone);

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

        if (!AppSettings.showCounters(context)) {
            views.setViewVisibility(R.id.widget_action_row, View.GONE);
            if (style == 6) {
                views.setViewVisibility(R.id.widget_status, View.VISIBLE);
                views.setTextViewText(R.id.widget_status, city(zone));
            } else {
                views.setViewVisibility(R.id.widget_status, View.GONE);
            }
        } else if (!AppSettings.isLoggedIn(context)) {
            views.setViewVisibility(R.id.widget_action_row, View.GONE);
            views.setViewVisibility(R.id.widget_status, View.VISIBLE);
            views.setTextViewText(R.id.widget_status, context.getString(R.string.widget_sign_in));
        } else {
            int unread = AppSettings.unread(context);
            int missed = AppSettings.missed(context);
            String messages = unread + " " + (unread == 1 ? "mensaje" : "mensajes");
            String calls = missed + " " + (missed == 1 ? "llamada" : "llamadas");
            views.setViewVisibility(R.id.widget_action_row, View.VISIBLE);
            views.setTextViewText(R.id.widget_messages_action, messages);
            views.setTextViewText(R.id.widget_calls_action, calls);
            views.setContentDescription(R.id.widget_messages_action, messages);
            views.setContentDescription(R.id.widget_calls_action, calls);
            if (style == 6) {
                views.setViewVisibility(R.id.widget_status, View.VISIBLE);
                views.setTextViewText(R.id.widget_status, city(zone));
            }

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
        Log.i(TAG, "onEnabled");
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
