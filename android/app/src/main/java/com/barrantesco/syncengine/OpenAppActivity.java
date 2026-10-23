package com.barrantesco.syncengine;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
<<<<<<< HEAD
 * Actividad sin interfaz: marca las llamadas como vistas, pone a cero el contador
 * del widget y abre la interfaz SYNC ENGINE dentro de la APK.
 */
public final class OpenAppActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AppSettings.markCallsSeen(this);
        SyncWidgetProvider.refreshAll(this);

        Intent intent = new Intent(this, WebAppActivity.class);
        if (getIntent() != null && getIntent().getExtras() != null) {
            intent.putExtras(getIntent().getExtras());
        }
        startActivity(intent);
        finish();
    }
}
=======
 * Actividad sin interfaz: marca las llamadas como vistas y abre la app instalada.
 * No entrega el enlace al navegador.
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

        Intent target = new Intent(this, WebAppActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if ("calls".equals(widgetView) || "chats".equals(widgetView)) {
            target.putExtra(EXTRA_WIDGET_VIEW, widgetView);
        }
        startActivity(target);
        finish();
    }
}
>>>>>>> origin/main
