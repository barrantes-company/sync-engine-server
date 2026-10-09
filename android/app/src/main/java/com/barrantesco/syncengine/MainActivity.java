package com.barrantesco.syncengine;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Arrays;
import java.util.List;

/** Pantalla de ajustes: servidor, sesión, notificaciones y opciones visuales del widget. */
public final class MainActivity extends Activity {
    private static final List<String> ZONES = Arrays.asList(
            "America/Lima", "America/Bogota", "America/Mexico_City", "America/Santiago",
            "America/Argentina/Buenos_Aires", "America/New_York", "Europe/Madrid", "UTC");

    private EditText urlField;
    private LinearLayout sessionBox;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildContent();
    }

    private void buildContent() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(24), dp(24), dp(24));

        TextView title = text(getString(R.string.app_name), 26, R.color.brand_navy);
        title.setTypeface(null, 1);
        content.addView(title, matchWrap());

        content.addView(section(R.string.section_server), matchWrap());
        urlField = new EditText(this);
        urlField.setSingleLine(true);
        urlField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        urlField.setHint(R.string.widget_url_hint);
        urlField.setText(WidgetUrls.defaultUrl(this));
        content.addView(urlField, matchWrap());

        Button save = new Button(this);
        save.setText(R.string.save_url);
        save.setOnClickListener(view -> saveUrl());
        content.addView(save, matchWrap());

        Button open = new Button(this);
        open.setText(R.string.open_panel);
        open.setOnClickListener(view -> startActivity(new Intent(this, OpenAppActivity.class)));
        content.addView(open, matchWrap());

        content.addView(section(R.string.section_session), matchWrap());
        sessionBox = new LinearLayout(this);
        sessionBox.setOrientation(LinearLayout.VERTICAL);
        content.addView(sessionBox, matchWrap());
        renderSession();

        content.addView(section(R.string.section_widget), matchWrap());
        content.addView(toggle(R.string.opt_counters, AppSettings.showCounters(this),
                value -> AppSettings.setShowCounters(this, value)), matchWrap());
        content.addView(toggle(R.string.opt_24h, AppSettings.use24h(this),
                value -> AppSettings.setUse24h(this, value)), matchWrap());
        content.addView(toggle(R.string.opt_animations, AppSettings.animations(this),
                value -> AppSettings.setAnimations(this, value)), matchWrap());
        content.addView(toggle(R.string.opt_notifications, AppSettings.notifications(this), value -> {
            AppSettings.setNotifications(this, value);
            if (value) {
                requestNotificationPermission();
            }
        }), matchWrap());

        content.addView(text(getString(R.string.opt_timezone), 15, R.color.text_primary), matchWrap());
        Spinner zones = new Spinner(this);
        zones.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, ZONES));
        int current = ZONES.indexOf(AppSettings.timeZone(this));
        zones.setSelection(Math.max(current, 0));
        zones.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, android.view.View view, int position, long id) {
                if (!ZONES.get(position).equals(AppSettings.timeZone(MainActivity.this))) {
                    AppSettings.setTimeZone(MainActivity.this, ZONES.get(position));
                    SyncWidgetProvider.refreshAll(MainActivity.this);
                }
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });
        content.addView(zones, matchWrap());

        TextView note = text(getString(R.string.sync_note), 13, R.color.text_secondary);
        note.setPadding(0, dp(16), 0, 0);
        content.addView(note, matchWrap());

        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
    }

    private interface OnToggle {
        void changed(boolean value);
    }

    private Switch toggle(int label, boolean checked, OnToggle listener) {
        Switch view = new Switch(this);
        view.setText(label);
        view.setTextSize(16);
        view.setChecked(checked);
        view.setPadding(0, dp(8), 0, dp(8));
        view.setOnCheckedChangeListener((button, value) -> {
            listener.changed(value);
            SyncWidgetProvider.refreshAll(this);
        });
        return view;
    }

    private void renderSession() {
        sessionBox.removeAllViews();
        if (AppSettings.isLoggedIn(this)) {
            sessionBox.addView(text(getString(R.string.signed_in_as, AppSettings.userName(this)),
                    15, R.color.text_primary), matchWrap());
            Button logout = new Button(this);
            logout.setText(R.string.sign_out);
            logout.setOnClickListener(view -> {
                FcmRegistration.unregister(this);
                AppSettings.clearSession(this);
                SyncJobService.cancel(this);
                SyncWidgetProvider.refreshAll(this);
                renderSession();
            });
            sessionBox.addView(logout, matchWrap());
            return;
        }
        EditText user = new EditText(this);
        user.setSingleLine(true);
        user.setHint(R.string.hint_username);
        user.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        sessionBox.addView(user, matchWrap());
        EditText pass = new EditText(this);
        pass.setSingleLine(true);
        pass.setHint(R.string.hint_password);
        pass.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        sessionBox.addView(pass, matchWrap());
        Button login = new Button(this);
        login.setText(R.string.sign_in);
        login.setOnClickListener(view -> signIn(login, user.getText().toString().trim(),
                pass.getText().toString()));
        sessionBox.addView(login, matchWrap());
    }

    private void signIn(Button button, String username, String password) {
        String url = urlField.getText().toString().trim();
        if (!WidgetUrls.isWidgetUrl(url)) {
            urlField.setError(getString(R.string.invalid_widget_url));
            return;
        }
        if (username.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, R.string.credentials_required, Toast.LENGTH_SHORT).show();
            return;
        }
        WidgetUrls.saveDefaultUrl(this, url);
        button.setEnabled(false);
        new Thread(() -> {
            String error = null;
            try {
                ApiClient.Session session = ApiClient.login(WidgetUrls.origin(url), username, password);
                AppSettings.saveSession(this, session.token, session.displayName);
                SyncRefresher.refresh(this);
            } catch (Exception exception) {
                error = exception.getMessage();
            }
            final String failure = error;
            runOnUiThread(() -> {
                button.setEnabled(true);
                if (failure != null) {
                    Toast.makeText(this, getString(R.string.sign_in_failed, failure),
                            Toast.LENGTH_LONG).show();
                    return;
                }
                SyncJobService.schedule(this);
                SyncWidgetProvider.refreshAll(this);
                renderSession();
                FcmRegistration.registerCurrentDevice(this);
                if (AppSettings.notifications(this)) {
                    requestNotificationPermission();
                }
            });
        }).start();
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    private void saveUrl() {
        String url = urlField.getText().toString().trim();
        if (!WidgetUrls.isWidgetUrl(url)) {
            urlField.setError(getString(R.string.invalid_widget_url));
            return;
        }
        WidgetUrls.saveDefaultUrl(this, url);
        Toast.makeText(this, R.string.url_saved, Toast.LENGTH_SHORT).show();
    }

    private TextView section(int label) {
        TextView view = text(getString(label), 14, R.color.widget_border);
        view.setTypeface(null, 1);
        view.setAllCaps(true);
        view.setPadding(0, dp(24), 0, dp(4));
        return view;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(getColor(color));
        return view;
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
