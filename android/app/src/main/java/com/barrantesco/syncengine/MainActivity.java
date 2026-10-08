package com.barrantesco.syncengine;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private EditText urlField;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int padding = dp(24);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextSize(26);
        title.setTextColor(getColor(R.color.brand_navy));
        title.setTypeface(null, 1);
        content.addView(title, matchWrap());

        TextView instructions = new TextView(this);
        instructions.setText(R.string.setup_instructions);
        instructions.setTextSize(16);
        instructions.setTextColor(getColor(R.color.text_primary));
        instructions.setLineSpacing(dp(4), 1f);
        instructions.setPadding(0, dp(16), 0, dp(20));
        content.addView(instructions, matchWrap());

        urlField = new EditText(this);
        urlField.setSingleLine(true);
        urlField.setInputType( android.text.InputType.TYPE_CLASS_TEXT
                | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        urlField.setHint(R.string.widget_url_hint);
        urlField.setText(WidgetUrls.defaultUrl(this));
        content.addView(urlField, matchWrap());

        Button saveButton = new Button(this);
        saveButton.setText(R.string.save_url);
        saveButton.setOnClickListener(view -> saveDefaultUrl());
        content.addView(saveButton, matchWrap());

        Button openButton = new Button(this);
        openButton.setText(R.string.open_panel);
        openButton.setOnClickListener(view -> openPanel());
        content.addView(openButton, matchWrap());

        TextView note = new TextView(this);
        note.setText(R.string.web_sign_in_note);
        note.setTextSize(14);
        note.setTextColor(getColor(R.color.text_secondary));
        note.setPadding(0, dp(12), 0, 0);
        content.addView(note, matchWrap());

        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(content);
        setContentView(scrollView);
    }

    private void saveDefaultUrl() {
        String url = urlField.getText().toString().trim();
        if (!WidgetUrls.isWidgetUrl(url)) {
            urlField.setError(getString(R.string.invalid_widget_url));
            return;
        }
        WidgetUrls.saveDefaultUrl(this, url);
        Toast.makeText(this, R.string.url_saved, Toast.LENGTH_SHORT).show();
    }

    private void openPanel() {
        String url = urlField.getText().toString().trim();
        if (!WidgetUrls.isWidgetUrl(url)) {
            urlField.setError(getString(R.string.invalid_widget_url));
            return;
        }
        WidgetUrls.saveDefaultUrl(this, url);
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (android.content.ActivityNotFoundException exception) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_LONG).show();
        }
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
