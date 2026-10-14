package com.barrantesco.syncengine;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Actividad sin interfaz: marca las llamadas como vistas, pone a cero el contador
 * del widget y abre la app del servidor.
 */
public final class OpenAppActivity extends Activity {
    static final String EXTRA_WIDGET_VIEW = "com.barrantesco.syncengine.WIDGET_VIEW";
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String widgetView = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_WIDGET_VIEW);
        if ("calls".equals(widgetView)) {
            AppSettings.markCallsSeen(this);
            SyncWidgetProvider.refreshAll(this);
        }

        String url = WidgetUrls.defaultUrl(this);
        Intent target;
        if (WidgetUrls.isWidgetUrl(url)) {
            Uri.Builder destination = Uri.parse(WidgetUrls.appUrl(url)).buildUpon();
            if ("calls".equals(widgetView) || "chats".equals(widgetView)) {
                destination.appendQueryParameter("widgetView", widgetView);
            }
            target = new Intent(Intent.ACTION_VIEW, destination.build());
        } else {
            target = new Intent(this, MainActivity.class);
        }
        try {
            startActivity(target);
        } catch (ActivityNotFoundException exception) {
            startActivity(new Intent(this, MainActivity.class));
        }
        finish();
    }
}
