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
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONException;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Entrada nativa: no WebView, no redirección al sitio HTML y servidor preconfigurado. */
public final class NativeLoginActivity extends Activity {
    private static final int BG = 0xFF07111D;
    private static final int CARD = 0xFF111F2D;
    private static final int GOLD = 0xFFFFC15A;
    private static final int WHITE = 0xFFF7F8FB;
    private static final int MUTED = 0xFF9AABBD;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private EditText username;
    private EditText password;
    private Button submit;
    private ProgressBar progress;
    private TextView error;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (AppSettings.isLoggedIn(this)) {
            openHome();
            return;
        }
        buildScreen();
    }

    private void buildScreen() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER);
        page.setPadding(dp(26), dp(28), dp(26), dp(28));
        page.setBackgroundColor(BG);

        TextView mark = text("SYNC", 17, GOLD);
        mark.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        mark.setLetterSpacing(0.32f);
        mark.setGravity(Gravity.CENTER);
        page.addView(mark, params(-1, -2));

        TextView title = text("ENGINE", 36, WHITE);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setLetterSpacing(0.16f);
        title.setGravity(Gravity.CENTER);
        page.addView(title, params(-1, -2));

        TextView subtitle = text("Todo conectado. En un solo lugar.", 14, MUTED);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, dp(8), 0, dp(28));
        page.addView(subtitle, params(-1, -2));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(22), dp(20), dp(20));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(CARD);
        bg.setCornerRadius(dp(22));
        bg.setStroke(dp(1), 0xFF26394A);
        card.setBackground(bg);
        page.addView(card, params(-1, -2));

        TextView heading = text("Iniciar sesión", 22, WHITE);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        card.addView(heading, params(-1, -2));

        TextView hint = text("Accede con tu cuenta SYNC ENGINE.", 13, MUTED);
        hint.setPadding(0, dp(5), 0, dp(18));
        card.addView(hint, params(-1, -2));

        username = input("Usuario");
        username.setSingleLine(true);
        card.addView(username, params(-1, 52));

        password = input("Contraseña");
        password.setInputType( android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        password.setSingleLine(true);
        LinearLayout.LayoutParams passParams = params(-1, 52);
        passParams.topMargin = dp(12);
        card.addView(password, passParams);

        error = text("", 13, 0xFFFF8D83);
        error.setPadding(0, dp(10), 0, 0);
        card.addView(error, params(-1, -2));

        submit = new Button(this);
        submit.setText("ENTRAR");
        submit.setTextColor(0xFF10151D);
        submit.setTextSize(14);
        submit.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        submit.setAllCaps(false);
        submit.setBackground(tint(GOLD, dp(14)));
        LinearLayout.LayoutParams buttonParams = params(-1, 52);
        buttonParams.topMargin = dp(18);
        card.addView(submit, buttonParams);
        progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);
        LinearLayout.LayoutParams progressParams = params(-2, 30);
        progressParams.gravity = Gravity.CENTER_HORIZONTAL;
        progressParams.topMargin = dp(10);
        card.addView(progress, progressParams);

        TextView footer = text("Conexión segura · Servidor oficial", 12, MUTED);
        footer.setGravity(Gravity.CENTER);
        footer.setPadding(0, dp(24), 0, 0);
        page.addView(footer, params(-1, -2));
        setContentView(page);

        submit.setOnClickListener(v -> signIn());
        password.setOnEditorActionListener((v, action, event) -> { signIn(); return true; });
    }

    private void signIn() {
        String user = username.getText().toString().trim();
        String pass = password.getText().toString();
        if (user.isEmpty() || pass.isEmpty()) {
            error.setText("Introduce tu usuario y contraseña.");
            return;
        }
        setBusy(true);
        error.setText("");
        String origin = WidgetUrls.origin(BuildConfig.DEFAULT_WIDGET_URL);
        executor.execute(() -> {
            try {
                ApiClient.Session session = ApiClient.login(origin, user, pass);
                AppSettings.saveSession(this, session.token, session.displayName);
                FcmRegistration.registerCurrentDevice(this);
                runOnUiThread(this::openHome);
            } catch (IOException | JSONException ex) {
                runOnUiThread(() -> {
                    setBusy(false);
                    error.setText(ex.getMessage() == null ? "No se pudo iniciar sesión." : ex.getMessage());
                });
            }
        });
    }

    private void setBusy(boolean busy) {
        submit.setEnabled(!busy);
        submit.setText(busy ? "Conectando…" : "ENTRAR");
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
    }

    private void openHome() {
        startActivity(new Intent(this, NativeHomeActivity.class));
        finish();
    }

    private EditText input(String hint) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setHintTextColor(MUTED);
        field.setTextColor(WHITE);
        field.setTextSize(15);
        field.setPadding(dp(14), 0, dp(14), 0);
        field.setBackground(tint(0xFF0B1724, dp(12)));
        field.setSelectAllOnFocus(false);
        return field;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private GradientDrawable tint(int color, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(radius);
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
