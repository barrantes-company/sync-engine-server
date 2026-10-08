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
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AppSettings.markCallsSeen(this);
        SyncWidgetProvider.refreshAll(this);

        String url = WidgetUrls.defaultUrl(this);
        Intent target;
        if (WidgetUrls.isWidgetUrl(url)) {
            target = new Intent(Intent.ACTION_VIEW, Uri.parse(WidgetUrls.appUrl(url)));
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
