package com.barrantesco.syncengine;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class WidgetConfigActivity extends Activity {
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private EditText urlField;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);

        Intent launchIntent = getIntent();
        if (launchIntent != null) {
            widgetId = launchIntent.getIntExtra(
                    AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        // Con una URL válida ya disponible no hace falta mostrar la pantalla.
        String existingUrl = WidgetUrls.widgetUrl(this, widgetId);
        if (WidgetUrls.isWidgetUrl(existingUrl)) {
            urlField = new EditText(this);
            urlField.setText(existingUrl);
            saveWidget();
            return;
        }

        int padding = dp(24);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText(R.string.configure_widget);
        title.setTextSize(22);
        title.setTypeface(null, 1);
        content.addView(title, matchWrap());

        TextView instructions = new TextView(this);
        instructions.setText(R.string.widget_url_instructions);
        instructions.setTextSize(15);
        instructions.setPadding(0, dp(12), 0, dp(16));
        content.addView(instructions, matchWrap());

        urlField = new EditText(this);
        urlField.setSingleLine(true);
        urlField.setInputType(android.text.InputType.TYPE_CLASS_TEXT
                | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        urlField.setHint(R.string.widget_url_hint);
        urlField.setText(WidgetUrls.widgetUrl(this, widgetId));
        content.addView(urlField, matchWrap());

        Button saveButton = new Button(this);
        saveButton.setText(R.string.add_widget);
        saveButton.setOnClickListener(view -> saveWidget());
        content.addView(saveButton, matchWrap());

        setContentView(content);
    }

    private void saveWidget() {
        String url = urlField.getText().toString().trim();
        if (!WidgetUrls.isWidgetUrl(url)) {
            urlField.setError(getString(R.string.invalid_widget_url));
            return;
        }

        WidgetUrls.saveWidgetUrl(this, widgetId, url);
        SyncWidgetProvider.updateWidget(
                this,
                AppWidgetManager.getInstance(this),
                widgetId);

        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
