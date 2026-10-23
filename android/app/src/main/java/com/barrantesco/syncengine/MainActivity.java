package com.barrantesco.syncengine;

import android.Manifest;
import android.app.Activity;
<<<<<<< HEAD
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
=======
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
>>>>>>> origin/main
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;

<<<<<<< HEAD
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.TimeZone;

/** Pantalla de ajustes: sesión, notificaciones y opciones visuales del widget. */
public final class MainActivity extends Activity {
    private static final List<String> ZONES = Arrays.asList(
            "America/Lima", "America/Bogota", "America/Mexico_City", "America/Santiago",
            "America/Argentina/Buenos_Aires", "America/New_York", "Europe/Madrid", "UTC");
    private static final String DEVICE_ZONE = AppSettings.DEVICE_TIME_ZONE;

    private LinearLayout sessionBox;
=======
import java.util.Arrays;
import java.util.List;

/**
 * Ajustes locales del widget. La autenticación y creación de usuarios pertenecen
 * a la aplicación principal web, no a esta pantalla.
 */
public final class MainActivity extends Activity {
    private static final int BG = 0xFF07111D;
    private static final int CARD = 0xFF111F2D;
    private static final int GOLD = 0xFFFFC15A;
    private static final int MUTED = 0xFF9AABBD;
    private static final int WHITE = 0xFFF7F8FB;
    private static final List<String> ZONES = Arrays.asList(
            "America/Lima", "America/Bogota", "America/Mexico_City", "America/Santiago",
            "America/Argentina/Buenos_Aires", "America/New_York", "Europe/Madrid", "UTC");
>>>>>>> origin/main

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildContent();
    }

    private void buildContent() {
<<<<<<< HEAD
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(24), dp(24), dp(24));

        TextView title = text(getString(R.string.app_name), 26, R.color.brand_navy);
=======
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(22), dp(26), dp(22), dp(28));
        page.setBackgroundColor(BG);

        TextView eyebrow = text("SYNC ENGINE  /  WIDGET", 12, GOLD);
        eyebrow.setLetterSpacing(0.12f);
        page.addView(eyebrow, matchWrap());

        TextView title = text("Configuración", 28, WHITE);
>>>>>>> origin/main
        title.setTypeface(null, 1);
        title.setPadding(0, dp(7), 0, dp(4));
        page.addView(title, matchWrap());

<<<<<<< HEAD
        Button open = new Button(this);
        open.setText(R.string.open_panel);
        open.setOnClickListener(view -> startActivity(new Intent(this, OpenAppActivity.class)));
        content.addView(open, matchWrap());

        content.addView(section(R.string.section_widget), matchWrap());
        content.addView(text(getString(R.string.opt_widget_style), 15, R.color.text_primary), matchWrap());
        Spinner widgetStyles = new Spinner(this);
        String[] styleLabels = {
                getString(R.string.widget_style_light_square),
                getString(R.string.widget_style_dark_dials),
                getString(R.string.widget_style_oled),
                getString(R.string.widget_style_sync_ring),
                getString(R.string.widget_style_light_wide),
                getString(R.string.widget_style_slim_sync),
                getString(R.string.widget_style_weather),
                getString(R.string.widget_style_contact)
        };
        widgetStyles.setAdapter(new ArrayAdapter<>(
                this, android.R.layout.simple_spinner_dropdown_item, styleLabels));
        widgetStyles.setSelection(AppSettings.widgetStyle(this));
        widgetStyles.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, android.view.View view,
                                       int position, long id) {
                if (position != AppSettings.widgetStyle(MainActivity.this)) {
                    AppSettings.setWidgetStyle(MainActivity.this, position);
                    SyncWidgetProvider.refreshAll(MainActivity.this);
                }
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });
        content.addView(widgetStyles, matchWrap());
        content.addView(toggle(R.string.opt_24h, AppSettings.use24h(this),
                value -> AppSettings.setUse24h(this, value)), matchWrap());
        content.addView(toggle(R.string.opt_notifications, AppSettings.notifications(this), value -> {
            AppSettings.setNotifications(this, value);
            if (value) {
                requestNotificationPermission();
            }
        }), matchWrap());

        content.addView(text(getString(R.string.opt_timezone), 15, R.color.text_primary), matchWrap());
        Spinner zones = new Spinner(this);
        List<String> zoneIds = new ArrayList<>();
        List<String> zoneLabels = new ArrayList<>();
        zoneIds.add(DEVICE_ZONE);
        zoneLabels.add(getString(R.string.timezone_device, TimeZone.getDefault().getID()));
        zoneIds.addAll(ZONES);
        zoneLabels.addAll(ZONES);
        zones.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, zoneLabels));
        int current = zoneIds.indexOf(AppSettings.timeZonePreference(this));
        zones.setSelection(Math.max(current, 0));
        zones.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, android.view.View view, int position, long id) {
                String zoneId = zoneIds.get(position);
                if (!zoneId.equals(AppSettings.timeZonePreference(MainActivity.this))) {
                    AppSettings.setTimeZone(MainActivity.this, zoneId);
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
        String url = WidgetUrls.defaultUrl(this);
        if (!WidgetUrls.isWidgetUrl(url)) {
            Toast.makeText(this, R.string.server_unavailable, Toast.LENGTH_LONG).show();
            return;
        }
        if (username.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, R.string.credentials_required, Toast.LENGTH_SHORT).show();
            return;
        }
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
                FcmRegistration.onUserAuthenticated(this, username);
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

    private TextView section(int label) {
        TextView view = text(getString(label), 14, R.color.widget_border);
        view.setTypeface(null, 1);
        view.setAllCaps(true);
        view.setPadding(0, dp(24), 0, dp(4));
=======
        TextView intro = text("Personaliza el widget y sus avisos. Tu cuenta se administra desde la aplicación principal.", 14, MUTED);
        intro.setPadding(0, 0, 0, dp(22));
        page.addView(intro, matchWrap());

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(8), dp(16), dp(8));
        card.setBackground(roundRect(CARD, dp(20)));
        page.addView(card, matchWrap());

        card.addView(section("APARIENCIA"), matchWrap());
        card.addView(toggle("Mostrar contadores", AppSettings.showCounters(this), value ->
                AppSettings.setShowCounters(this, value)), matchWrap());
        card.addView(toggle("Formato de 24 horas", AppSettings.use24h(this), value ->
                AppSettings.setUse24h(this, value)), matchWrap());
        card.addView(toggle("Estelas animadas", AppSettings.animations(this), value ->
                AppSettings.setAnimations(this, value)), matchWrap());

        card.addView(section("AVISOS"), matchWrap());
        card.addView(toggle("Notificaciones", AppSettings.notifications(this), value -> {
            AppSettings.setNotifications(this, value);
            if (value) {
                requestNotificationPermission();
                FcmRegistration.registerCurrentDevice(this);
            }
        }), matchWrap());

        card.addView(section("ZONA HORARIA"), matchWrap());
        Spinner zones = new Spinner(this);
        zones.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, ZONES) {
            @Override public View getView(int position, View convertView, android.view.ViewGroup parent) {
                TextView view = (TextView) super.getView(position, convertView, parent);
                view.setTextColor(WHITE);
                return view;
            }
        });
        int current = ZONES.indexOf(AppSettings.timeZone(this));
        zones.setSelection(Math.max(current, 0));
        zones.setBackgroundTintList(android.content.res.ColorStateList.valueOf(GOLD));
        zones.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                String zone = ZONES.get(position);
                if (!zone.equals(AppSettings.timeZone(MainActivity.this))) {
                    AppSettings.setTimeZone(MainActivity.this, zone);
                    SyncWidgetProvider.refreshAll(MainActivity.this);
                }
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) { }
        });
        card.addView(zones, matchWrap());

        TextView serverNote = text("Servidor SYNC ENGINE: configurado automáticamente. No requiere ajustes manuales.", 12, MUTED);
        serverNote.setPadding(0, dp(18), 0, dp(4));
        page.addView(serverNote, matchWrap());

        TextView footer = text("Los cambios se aplican directamente al widget.", 12, MUTED);
        footer.setPadding(0, dp(12), 0, 0);
        page.addView(footer, matchWrap());

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);
        scroll.addView(page);
        setContentView(scroll);
    }

    private Switch toggle(String label, boolean checked, OnToggle listener) {
        Switch view = new Switch(this);
        view.setText(label);
        view.setTextSize(15);
        view.setTextColor(WHITE);
        view.setChecked(checked);
        view.setPadding(0, dp(10), 0, dp(10));
        view.setButtonTintList(android.content.res.ColorStateList.valueOf(GOLD));
        view.setOnCheckedChangeListener((button, value) -> {
            listener.changed(value);
            SyncWidgetProvider.refreshAll(this);
        });
        return view;
    }

    private interface OnToggle { void changed(boolean value); }

    private TextView section(String label) {
        TextView view = text(label, 11, GOLD);
        view.setTypeface(null, 1);
        view.setLetterSpacing(0.1f);
        view.setPadding(0, dp(16), 0, dp(5));
>>>>>>> origin/main
        return view;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
<<<<<<< HEAD
        view.setTextColor(getColor(color));
        return view;
=======
        view.setTextColor(color);
        return view;
    }

    private android.graphics.drawable.GradientDrawable roundRect(int color, int radius) {
        android.graphics.drawable.GradientDrawable shape = new android.graphics.drawable.GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(radius);
        shape.setStroke(dp(1), 0xFF26394A);
        return shape;
>>>>>>> origin/main
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }
}
