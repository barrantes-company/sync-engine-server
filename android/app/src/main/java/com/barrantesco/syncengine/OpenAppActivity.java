package com.barrantesco.syncengine;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
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
