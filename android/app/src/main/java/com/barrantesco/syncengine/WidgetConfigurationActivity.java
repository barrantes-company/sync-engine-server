package com.barrantesco.syncengine;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;

/** Configura la superficie sólida o transparente de una instancia concreta. */
public final class WidgetConfigurationActivity extends Activity {
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        setContentView(content());
    }

    private LinearLayout content() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER_HORIZONTAL);
        page.setPadding(dp(24), dp(32), dp(24), dp(24));
        page.setBackgroundColor(getColor(R.color.widget_config_background));

        TextView eyebrow = text(getString(R.string.widget_config_eyebrow), 12,
                R.color.widget_config_accent);
        eyebrow.setLetterSpacing(0.12f);
        page.addView(eyebrow, matchWrap());

        TextView title = text(getString(R.string.widget_config_title), 28,
                R.color.widget_text);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setPadding(0, dp(8), 0, dp(8));
        page.addView(title, matchWrap());

        TextView description = text(getString(R.string.widget_config_description), 14,
                R.color.widget_text_secondary);
        description.setPadding(0, 0, 0, dp(22));
        page.addView(description, matchWrap());

        Switch transparent = new Switch(this);
        transparent.setText(R.string.widget_config_transparent);
        transparent.setTextColor(getColor(R.color.widget_text));
        transparent.setTextSize(16);
        transparent.setChecked(AppSettings.widgetTransparent(this, widgetId));
        transparent.setPadding(dp(16), dp(16), dp(16), dp(16));
        transparent.setBackgroundColor(getColor(R.color.widget_config_surface));
        page.addView(transparent, matchWrap());

        TextView hint = text(getString(R.string.widget_config_hint), 12,
                R.color.widget_text_secondary);
        hint.setPadding(dp(4), dp(10), dp(4), dp(24));
        page.addView(hint, matchWrap());

        Button save = new Button(this);
        save.setText(R.string.widget_config_save);
        save.setTextColor(getColor(R.color.widget_config_button_text));
        save.setBackgroundTintList(android.content.res.ColorStateList.valueOf(
                getColor(R.color.widget_config_accent)));
        save.setOnClickListener(view -> save(transparent.isChecked()));
        page.addView(save, matchWrap());
        return page;
    }

    private void save(boolean transparent) {
        AppSettings.setWidgetTransparent(this, widgetId, transparent);
        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        SyncWidgetProvider.updateWidget(this, manager, widgetId);
        Intent result = new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    private TextView text(String value, int size, int colorResource) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(getColor(colorResource));
        return view;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
