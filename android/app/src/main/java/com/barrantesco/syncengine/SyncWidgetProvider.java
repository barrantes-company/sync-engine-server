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

/** Solo Ciudad, Barra y Anillo. El resto no se publica. */
public class SyncWidgetProvider extends AppWidgetProvider {
    private static final String TAG = "SyncWidgetProvider";
    private static final String ACTION_TICK = "com.barrantesco.syncengine.WIDGET_TICK";

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
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            refreshAll(context);
            scheduleTick(context);
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
        int widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, style == 2 ? 250 : 280);
        int heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, style == 2 ? 250 : 110);
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
        views.setImageViewBitmap(R.id.widget_content, bitmap);
        int inset = Math.round((style == 2 ? 16 : 8) * context.getResources().getDisplayMetrics().density);
        views.setViewPadding(R.id.widget_root, inset, inset, inset, inset);
        PendingIntent open = PendingIntent.getActivity(
                context, 0,
                new Intent(context, OpenAppActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, open);
        manager.updateAppWidget(widgetId, views);
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
