package com.barrantesco.syncengine;

import android.Manifest;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;

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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildContent();
    }

    private void buildContent() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(22), dp(26), dp(22), dp(28));
        page.setBackgroundColor(BG);

        TextView eyebrow = text("SYNC ENGINE  /  WIDGET", 12, GOLD);
        eyebrow.setLetterSpacing(0.12f);
        page.addView(eyebrow, matchWrap());

        TextView title = text("Configuración", 28, WHITE);
        title.setTypeface(null, 1);
        title.setPadding(0, dp(7), 0, dp(4));
        page.addView(title, matchWrap());

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
        return view;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private android.graphics.drawable.GradientDrawable roundRect(int color, int radius) {
        android.graphics.drawable.GradientDrawable shape = new android.graphics.drawable.GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(radius);
        shape.setStroke(dp(1), 0xFF26394A);
        return shape;
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
