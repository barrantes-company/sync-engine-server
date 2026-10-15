package com.barrantesco.syncengine;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONException;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Primera superficie autenticada nativa. No abre HTML.
 * Hasta que estén implementadas las APIs nativas de contactos/conversaciones,
 * muestra únicamente el resumen real que el backend ya expone para el widget.
 */
public final class NativeHomeActivity extends Activity {
    private static final int BG = 0xFF07111D;
    private static final int CARD = 0xFF111F2D;
    private static final int GOLD = 0xFFFFC15A;
    private static final int WHITE = 0xFFF7F8FB;
    private static final int MUTED = 0xFF9AABBD;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private LinearLayout content;
    private TextView status;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (!AppSettings.isLoggedIn(this)) {
            startActivity(new Intent(this, NativeLoginActivity.class));
            finish();
            return;
        }
        buildScreen();
        refreshSummary();
    }

    private void buildScreen() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(20), dp(22), dp(20), dp(20));
        page.setBackgroundColor(BG);

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setOrientation(LinearLayout.HORIZONTAL);
        TextView brand = text("SYNC ENGINE", 20, WHITE);
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        brand.setLetterSpacing(0.06f);
        top.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        Button settings = smallButton("⚙");
        top.addView(settings, params(48, 44));
        settings.setOnClickListener(v -> startActivity(new Intent(this, MainActivity.class)));
        page.addView(top, params(-1, -2));

        TextView greeting = text("Hola, " + AppSettings.userName(this), 24, WHITE);
        greeting.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        greeting.setPadding(0, dp(24), 0, dp(4));
        page.addView(greeting, params(-1, -2));
        page.addView(text("Tu actividad, sincronizada.", 14, MUTED), params(-1, -2));

        LinearLayout stats = new LinearLayout(this);
        stats.setOrientation(LinearLayout.HORIZONTAL);
        stats.setPadding(0, dp(20), 0, dp(18));
        stats.addView(statCard("MENSAJES SIN LEER", String.valueOf(AppSettings.unread(this))), new LinearLayout.LayoutParams(0, dp(100), 1));
        View spacer = new View(this);
        stats.addView(spacer, new LinearLayout.LayoutParams(dp(10), 1));
        stats.addView(statCard("LLAMADAS PERDIDAS", String.valueOf(AppSettings.missed(this))), new LinearLayout.LayoutParams(0, dp(100), 1));
        page.addView(stats, params(-1, -2));

        TextView section = text("Actividad reciente", 18, WHITE);
        section.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        section.setPadding(0, dp(8), 0, dp(10));
        page.addView(section, params(-1, -2));

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        page.addView(content, params(-1, -2));

        status = text("Cargando actividad…", 13, MUTED);
        status.setPadding(0, dp(8), 0, dp(8));
        page.addView(status, params(-1, -2));

        Button refresh = smallButton("Actualizar");
        refresh.setOnClickListener(v -> refreshSummary());
        LinearLayout.LayoutParams refreshParams = params(-1, 48);
        refreshParams.topMargin = dp(12);
        page.addView(refresh, refreshParams);

        Button logout = smallButton("Cerrar sesión");
        logout.setTextColor(GOLD);
        logout.setOnClickListener(v -> {
            AppSettings.clearSession(this);
            startActivity(new Intent(this, NativeLoginActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK));
            finish();
        });
        LinearLayout.LayoutParams logoutParams = params(-1, 48);
        logoutParams.topMargin = dp(8);
        page.addView(logout, logoutParams);

        TextView note = text("Versión nativa inicial. La lista completa de contactos y chats requiere integrar sus endpoints; esta pantalla no deriva a la web.", 12, MUTED);
        note.setPadding(0, dp(20), 0, 0);
        page.addView(note, params(-1, -2));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);
        scroll.addView(page);
        setContentView(scroll);
    }

    private View statCard(String label, String value) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(14), dp(12), dp(12), dp(12));
        card.setBackground(shape(CARD, dp(18), 0xFF26394A));
        TextView count = text(value, 27, GOLD);
        count.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        card.addView(count, params(-1, -2));
        TextView title = text(label, 10, MUTED);
        title.setPadding(0, dp(4), 0, 0);
        card.addView(title, params(-1, -2));
        return card;
    }

    private void refreshSummary() {
        status.setText("Sincronizando…");
        executor.execute(() -> {
            try {
                ApiClient.Summary summary = ApiClient.summary(
                        WidgetUrls.origin(BuildConfig.DEFAULT_WIDGET_URL),
                        AppSettings.token(this), AppSettings.callsSeenAt(this));
                AppSettings.saveCounts(this, summary.unreadMessages, summary.missedCalls);
                runOnUiThread(() -> {
                    content.removeAllViews();
                    if (summary.latest.isEmpty()) {
                        content.addView(text("No hay mensajes recientes para mostrar.", 14, MUTED), params(-1, -2));
                    } else {
                        for (ApiClient.UnreadMessage item : summary.latest) {
                            LinearLayout row = new LinearLayout(this);
                            row.setOrientation(LinearLayout.VERTICAL);
                            row.setPadding(dp(14), dp(12), dp(14), dp(12));
                            row.setBackground(shape(CARD, dp(14), 0xFF26394A));
                            TextView from = text(item.fromName.isEmpty() ? "Mensaje" : item.fromName, 15, WHITE);
                            from.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
                            row.addView(from, params(-1, -2));
                            TextView body = text(item.text.isEmpty() ? "Contenido no disponible" : item.text, 13, MUTED);
                            body.setMaxLines(2);
                            body.setPadding(0, dp(5), 0, 0);
                            row.addView(body, params(-1, -2));
                            LinearLayout.LayoutParams rowParams = params(-1, -2);
                            rowParams.bottomMargin = dp(8);
                            content.addView(row, rowParams);
                        }
                    }
                    status.setText("Conectado al servidor oficial.");
                });
            } catch (IOException | JSONException ex) {
                runOnUiThread(() -> status.setText("No se pudo actualizar: " + (ex.getMessage() == null ? "error de conexión" : ex.getMessage())));
            }
        });
    }

    private Button smallButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(WHITE);
        button.setBackground(shape(CARD, dp(12), 0xFF26394A));
        return button;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private GradientDrawable shape(int color, int radius, int stroke) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(radius);
        shape.setStroke(dp(1), stroke);
        return shape;
    }

    private LinearLayout.LayoutParams params(int width, int height) {
        return new LinearLayout.LayoutParams(width < 0 ? width : dp(width), height < 0 ? height : dp(height));
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }
}
