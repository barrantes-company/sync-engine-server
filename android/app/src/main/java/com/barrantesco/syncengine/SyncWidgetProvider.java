package com.barrantesco.syncengine;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public final class SyncWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.sync_widget);
        String url = WidgetUrls.widgetUrl(context, widgetId);
        Intent openIntent;
        if (WidgetUrls.isWidgetUrl(url)) {
            openIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        } else {
            openIntent = new Intent(context, MainActivity.class);
        }
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        PendingIntent clickIntent = PendingIntent.getActivity(
                context,
                widgetId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, clickIntent);
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
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] widgetIds = manager.getAppWidgetIds(
                new ComponentName(context, SyncWidgetProvider.class));
        for (int widgetId : widgetIds) {
            updateWidget(context, manager, widgetId);
        }
    }
}
