package com.barrantesco.syncengine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Renderiza las tres caras premium del widget (Ciudad, Barra, Anillo) desde la caché local.
 * Cada variante se distingue por su fondo y composición; los datos mostrados son reales
 * (hora, fecha, contadores, archivo/portapapeles y frescura de sincronización). Sin red.
 */
final class WidgetRenderer {
    private static final int MAX_WIDTH_PX = 480;
    private static final int MAX_HEIGHT_PX = 320;

    private static final int PRIMARY = 0xFFEAF2FF;
    private static final int SECONDARY = 0xFF9FB3D1;
    private static final int MUTED = 0xFF6B7A90;
    private static final int ACCENT = 0xFF54BFA5;
    private static final int GREEN = 0xFF22C55E;
    private static final int CYAN = 0xFF22D3EE;
    private static final int AMBER = 0xFFF59E0B;
    private static final int BORDER = 0xFF24304A;
    private static final int SKY_LINE = 0xFF0A0F1E;
    private static final int WINDOW = 0xFFFFD98A;
    private static final Locale SPANISH = new Locale("es", "ES");

    private static Typeface displayTypeface;

    private WidgetRenderer() {}

    /** Calcula el bitmap a partir del tamaño del widget en dp y limita su memoria. */
    static int[] size(Context context, int widthDp, int heightDp) {
        float density = context.getResources().getDisplayMetrics().density;
        float width = Math.max(110, widthDp) * density;
        float height = Math.max(60, heightDp) * density;
        float scale = Math.min(1f, Math.min(MAX_WIDTH_PX / width, MAX_HEIGHT_PX / height));
        return new int[] {Math.max(1, Math.round(width * scale)),
                Math.max(1, Math.round(height * scale))};
    }

    /** Estado derivado de la caché que comparten las tres caras. */
    private static final class S {
        int w, h;
        float d;
        String clock, date, status, city, detail;
        int unread, missed, led, minute;
        boolean showCounters, animations;
    }

    /**
     * Dibuja la cara indicada por {@code style} (0 = Ciudad, 1 = Barra, 2 = Anillo).
     * Conserva la firma histórica y añade el selector de variante que antes se ignoraba.
     */
    static Bitmap render(Context context, int width, int height, int style, String zoneId,
                         boolean use24h, boolean signedIn, String receivedFile, String clipboardState) {
        int w = Math.max(1, width);
        int h = Math.max(1, height);
        display(context);

        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        float density = context.getResources().getDisplayMetrics().density;
        float radius = Math.max(8f * density, Math.min(w, h) * 0.09f);

        Path clip = new Path();
        clip.addRoundRect(new RectF(0f, 0f, w, h), radius, radius, Path.Direction.CW);
        canvas.clipPath(clip);

        TimeZone zone = TimeZone.getTimeZone(
                zoneId == null || zoneId.trim().isEmpty() ? AppSettings.DEFAULT_TIME_ZONE : zoneId);
        Date now = new Date();
        Calendar calendar = Calendar.getInstance(zone);
        calendar.setTime(now);

        SimpleDateFormat clockFormat = new SimpleDateFormat(use24h ? "HH:mm" : "h:mm", Locale.US);
        clockFormat.setTimeZone(zone);
        SimpleDateFormat dateFormat = new SimpleDateFormat("EEEE, d 'de' MMMM", SPANISH);
        dateFormat.setTimeZone(zone);

        String file = clean(receivedFile);
        String clipboard = clean(clipboardState);
        String detail = file.isEmpty() ? "Archivo · sin recientes" : "Archivo · " + file;
        detail += clipboard.isEmpty() ? "   ·   Portapapeles vacío" : "   ·   Portapapeles listo";

        S s = new S();
        s.w = w;
        s.h = h;
        s.d = density;
        s.clock = clockFormat.format(now);
        s.date = capitalize(dateFormat.format(now).replace('.', ' '));
        s.minute = calendar.get(Calendar.MINUTE);
        s.unread = signedIn ? AppSettings.unread(context) : 0;
        s.missed = signedIn ? AppSettings.missed(context) : 0;
        s.showCounters = AppSettings.showCounters(context);
        s.animations = AppSettings.animations(context);
        s.led = ledColor(signedIn, AppSettings.lastSync(context), now.getTime());
        s.status = statusLabel(signedIn, AppSettings.lastSync(context), now.getTime());
        s.city = cityFromZone(zone);
        s.detail = detail;

        switch (style) {
            case 0:
                ciudad(canvas, s);
                break;
            case 1:
                barra(canvas, s);
                break;
            default:
                anillo(canvas, s);
                break;
        }

        Paint border = paint();
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(Math.max(1f, density));
        border.setColor(BORDER);
        canvas.drawRoundRect(new RectF(0.5f, 0.5f, w - 0.5f, h - 0.5f), radius, radius, border);
        return bitmap;
    }

    // ---------------------------------------------------------------- Caras

    /** Anillo: reloj dentro de un anillo con brillo y chips de contadores reales. */
    private static void anillo(Canvas cv, S s) {
        radialBg(cv, s.w, s.h);
        float cx = s.w * 0.5f;
        float cy = s.h * 0.36f;
        float r = Math.min(s.w, s.h) * 0.25f;
        float stroke = Math.max(3f, r * 0.13f);
        float sweep = s.animations ? 24f + (s.minute / 60f) * 336f : 300f;
        ring(cv, cx, cy, r, stroke, sweep, ACCENT);

        Paint t = paint();
        t.setTextAlign(Paint.Align.CENTER);
        t.setColor(SECONDARY);
        t.setTextSize(r * 0.20f);
        cv.drawText("SYNC", cx, cy - r * 0.50f, t);
        t.setColor(PRIMARY);
        t.setTextSize(r * 0.60f);
        fit(t, s.clock, r * 1.7f);
        cv.drawText(s.clock, cx, cy - (t.ascent() + t.descent()) * 0.5f, t);

        t.setColor(SECONDARY);
        t.setTextSize(Math.max(9f * s.d, s.h * 0.055f));
        fit(t, s.date, s.w * 0.86f);
        cv.drawText(s.date, cx, s.h * 0.685f, t);
        t.setTextAlign(Paint.Align.LEFT);

        if (s.showCounters) {
            float cw = s.w * 0.30f;
            float ch = s.h * 0.085f;
            countChip(cv, cx - s.w * 0.17f, s.h * 0.745f, cw, ch, CYAN, s.unread, "Mensajes");
            countChip(cv, cx + s.w * 0.17f, s.h * 0.745f, cw, ch, AMBER, s.missed, "Llamadas");
        }
        status(cv, cx, s.h * 0.93f, s.w, s.led, s.status);
    }

    /** Barra: fondo mesh, reloj a la izquierda y nube de sincronización a la derecha. */
    private static void barra(Canvas cv, S s) {
        meshBg(cv, s.w, s.h);
        float pad = Math.max(10f * s.d, s.w * 0.05f);
        Paint t = paint();
        t.setTextAlign(Paint.Align.LEFT);
        t.setColor(PRIMARY);
        t.setTextSize(s.h * 0.30f);
        fit(t, s.clock, s.w * 0.46f);
        cv.drawText(s.clock, pad, s.h * 0.44f, t);
        t.setColor(SECONDARY);
        t.setTextSize(Math.max(9f * s.d, s.h * 0.072f));
        fit(t, s.date, s.w * 0.50f);
        cv.drawText(s.date, pad, s.h * 0.60f, t);
        statusLeft(cv, pad, s.h * 0.755f, s.w, s.led, s.status);
        t.setColor(MUTED);
        t.setTextSize(Math.max(7f * s.d, s.h * 0.052f));
        fit(t, s.detail, s.w * 0.52f);
        cv.drawText(s.detail, pad, s.h * 0.865f, t);

        cloudIcon(cv, s.w * 0.78f, s.h * 0.28f, s.h * 0.13f, s.led);
        if (s.showCounters) {
            float cw = s.w * 0.19f;
            float ch = s.h * 0.10f;
            countChip(cv, s.w * 0.65f, s.h * 0.50f, cw, ch, CYAN, s.unread, "Mensajes");
            countChip(cv, s.w * 0.85f, s.h * 0.50f, cw, ch, AMBER, s.missed, "Llamadas");
        }
        accentBar(cv, pad, s.h * 0.925f, s.w - pad * 2f, Math.max(3f, s.h * 0.022f),
                s.minute, s.animations);
    }

    /** Ciudad: cielo degradado, skyline con ventanas y datos de sesión (sin clima inventado). */
    private static void ciudad(Canvas cv, S s) {
        skyBg(cv, s.w, s.h);
        skyline(cv, s.w, s.h, s.minute, s.animations);
        float pad = Math.max(10f * s.d, s.w * 0.05f);
        float dotR = Math.max(3f, s.w * 0.011f);
        Paint t = paint();
        t.setTextAlign(Paint.Align.LEFT);
        t.setColor(s.led);
        t.setShadowLayer(dotR * 2.2f, 0f, 0f, s.led);
        cv.drawCircle(pad + dotR, s.h * 0.145f, dotR, t);
        t.setShadowLayer(0f, 0f, 0f, 0);
        t.setColor(PRIMARY);
        t.setTextSize(Math.max(9f * s.d, s.h * 0.075f));
        cv.drawText(s.city, pad + dotR * 2.6f, s.h * 0.165f, t);

        t.setColor(PRIMARY);
        t.setTextSize(s.h * 0.28f);
        fit(t, s.clock, s.w * 0.46f);
        cv.drawText(s.clock, pad, s.h * 0.47f, t);
        t.setColor(0xFFCFE0F5);
        t.setTextSize(Math.max(9f * s.d, s.h * 0.068f));
        fit(t, s.date, s.w * 0.50f);
        cv.drawText(s.date, pad, s.h * 0.62f, t);

        statusLeft(cv, s.w * 0.60f, s.h * 0.30f, s.w, s.led, s.status);
        if (s.showCounters) {
            float cw = s.w * 0.19f;
            float ch = s.h * 0.10f;
            countChip(cv, s.w * 0.65f, s.h * 0.42f, cw, ch, CYAN, s.unread, "Mensajes");
            countChip(cv, s.w * 0.85f, s.h * 0.42f, cw, ch, AMBER, s.missed, "Llamadas");
        }
    }

    // ------------------------------------------------------------ Fondos

    private static void radialBg(Canvas cv, int w, int h) {
        Paint p = paint();
        p.setShader(new RadialGradient(w * 0.5f, h * 0.16f, Math.max(w, h) * 0.95f,
                0xFF10203A, 0xFF05070E, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, p);
        p.setShader(null);
    }

    private static void meshBg(Canvas cv, int w, int h) {
        Paint base = paint();
        base.setShader(new LinearGradient(0f, 0f, w, h, 0xFF1A0F2E, 0xFF0A1730, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, base);
        base.setShader(null);
        Paint warm = paint();
        warm.setShader(new RadialGradient(w * 0.80f, h * 0.08f, Math.max(w, h) * 0.70f,
                0x66FB923C, 0x00000000, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, warm);
        warm.setShader(null);
        Paint cool = paint();
        cool.setShader(new RadialGradient(w * 0.08f, h * 0.96f, Math.max(w, h) * 0.70f,
                0x66A855F7, 0x00000000, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, cool);
        cool.setShader(null);
    }

    private static void skyBg(Canvas cv, int w, int h) {
        Paint p = paint();
        p.setShader(new LinearGradient(0f, 0f, 0f, h,
                new int[] {0xFF0B1230, 0xFF1B1F4A, 0xFF3A2A63, 0xFF0A0F1E},
                new float[] {0f, 0.45f, 0.75f, 1f}, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, p);
        p.setShader(null);
    }

    private static void skyline(Canvas cv, int w, int h, int minute, boolean animations) {
        int[] heights = {46, 58, 40, 66, 50, 56, 38, 62, 48, 54, 40, 60, 46, 52};
        float bw = w / (float) heights.length;
        float base = h * 0.995f;
        Paint body = paint();
        body.setColor(SKY_LINE);
        for (int i = 0; i < heights.length; i++) {
            float bh = h * 0.20f * (heights[i] / 66f);
            cv.drawRect(i * bw, base - bh, i * bw + bw - Math.max(1f, bw * 0.06f), base, body);
        }
        Paint win = paint();
        win.setColor(WINDOW);
        float ww = Math.max(1.5f, bw * 0.13f);
        float wh = Math.max(1.5f, h * 0.012f);
        for (int i = 0; i < heights.length; i++) {
            float bh = h * 0.20f * (heights[i] / 66f);
            float top = base - bh;
            for (int row = 0; row < 3; row++) {
                float wy = top + bh * 0.18f + row * bh * 0.26f;
                if (wy + wh > base - bh * 0.08f) continue;
                for (int col = 0; col < 2; col++) {
                    float wx = i * bw + bw * 0.26f + col * bw * 0.34f;
                    boolean lit = !animations || ((minute * 31 + i * 17 + row * 7 + col * 5) % 7) < 4;
                    if (!lit) continue;
                    win.setAlpha(((minute * 13 + i * 29 + row * 11 + col * 3) % 2 == 0) ? 235 : 150);
                    cv.drawRect(wx, wy, wx + ww, wy + wh, win);
                }
            }
        }
        win.setAlpha(255);
    }

    // --------------------------------------------------------- Componentes

    private static void ring(Canvas cv, float cx, float cy, float r, float stroke, float sweep, int col) {
        RectF oval = new RectF(cx - r, cy - r, cx + r, cy + r);
        Paint track = paint();
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(stroke);
        track.setColor(0x22FFFFFF);
        cv.drawArc(oval, 0f, 360f, false, track);
        Paint arc = paint();
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeWidth(stroke);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setColor(col);
        arc.setShadowLayer(stroke * 1.3f, 0f, 0f, col);
        cv.drawArc(oval, -90f, sweep, false, arc);
        arc.setShadowLayer(0f, 0f, 0f, 0);
    }

    private static void cloudIcon(Canvas cv, float cx, float cy, float r, int col) {
        Paint p = paint();
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(2f, r * 0.16f));
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(col);
        p.setShadowLayer(r * 0.55f, 0f, 0f, col);
        cv.drawCircle(cx - r * 0.34f, cy + r * 0.06f, r * 0.42f, p);
        cv.drawCircle(cx + r * 0.30f, cy - r * 0.10f, r * 0.50f, p);
        cv.drawLine(cx - r * 0.74f, cy + r * 0.46f, cx + r * 0.78f, cy + r * 0.46f, p);
        p.setShadowLayer(0f, 0f, 0f, 0);
        p.setStyle(Paint.Style.FILL);
    }

    private static void accentBar(Canvas cv, float x, float y, float w, float h, int minute, boolean animations) {
        Paint track = paint();
        track.setColor(0x1FFFFFFF);
        cv.drawRoundRect(new RectF(x, y, x + w, y + h), h / 2f, h / 2f, track);
        float frac = animations ? 0.15f + (minute / 60f) * 0.85f : 0.6f;
        Paint fill = paint();
        fill.setShader(new LinearGradient(x, y, x + w, y, ACCENT, CYAN, Shader.TileMode.CLAMP));
        cv.drawRoundRect(new RectF(x, y, x + w * frac, y + h), h / 2f, h / 2f, fill);
        fill.setShader(null);
    }

    private static void countChip(Canvas cv, float cx, float y, float cw, float ch, int col, int value, String caption) {
        float x = cx - cw / 2f;
        Paint p = paint();
        p.setColor(0x14FFFFFF);
        cv.drawRoundRect(new RectF(x, y, x + cw, y + ch), ch * 0.5f, ch * 0.5f, p);
        p.setColor(col);
        cv.drawCircle(x + ch * 0.42f, y + ch * 0.5f, ch * 0.16f, p);
        p.setColor(PRIMARY);
        p.setTextAlign(Paint.Align.LEFT);
        p.setTextSize(ch * 0.52f);
        cv.drawText(String.valueOf(value), x + ch * 0.78f, y + ch * 0.68f, p);
        p.setColor(SECONDARY);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTextSize(ch * 0.34f);
        cv.drawText(caption, cx, y + ch + ch * 0.44f, p);
        p.setTextAlign(Paint.Align.LEFT);
    }

    private static void status(Canvas cv, float cx, float y, int w, int led, String label) {
        Paint p = paint();
        p.setTextSize(Math.max(8f, w * 0.038f));
        p.setTextAlign(Paint.Align.LEFT);
        float dotR = Math.max(3f, w * 0.012f);
        float gap = dotR * 2.6f;
        float x = cx - (gap + p.measureText(label)) / 2f;
        p.setColor(led);
        p.setShadowLayer(dotR * 2.2f, 0f, 0f, led);
        cv.drawCircle(x + dotR, y - dotR * 0.6f, dotR, p);
        p.setShadowLayer(0f, 0f, 0f, 0);
        p.setColor(PRIMARY);
        cv.drawText(label, x + gap, y, p);
    }

    private static void statusLeft(Canvas cv, float x, float y, int w, int led, String label) {
        Paint p = paint();
        p.setTextSize(Math.max(8f, w * 0.036f));
        p.setTextAlign(Paint.Align.LEFT);
        float dotR = Math.max(3f, w * 0.011f);
        p.setColor(led);
        p.setShadowLayer(dotR * 2.2f, 0f, 0f, led);
        cv.drawCircle(x + dotR, y - dotR * 0.6f, dotR, p);
        p.setShadowLayer(0f, 0f, 0f, 0);
        p.setColor(PRIMARY);
        cv.drawText(label, x + dotR * 2.6f, y, p);
    }

    // ------------------------------------------------------------- Estado

    private static int ledColor(boolean signedIn, long lastSync, long now) {
        if (!signedIn) return MUTED;
        if (lastSync <= 0) return CYAN;
        long age = Math.max(0L, now - lastSync);
        if (age <= 5L * 60L * 1000L) return GREEN;
        if (age <= 30L * 60L * 1000L) return ACCENT;
        return AMBER;
    }

    private static String statusLabel(boolean signedIn, long lastSync, long now) {
        if (!signedIn) return "Inicia sesión";
        if (lastSync <= 0) return "Sincronizando…";
        long age = Math.max(0L, now - lastSync);
        if (age <= 5L * 60L * 1000L) return "Sesión activa";
        if (age <= 30L * 60L * 1000L) return "Sincronizado";
        return "Sin señal reciente";
    }

    private static String cityFromZone(TimeZone zone) {
        String id = zone.getID();
        int slash = id.lastIndexOf('/');
        String city = slash >= 0 ? id.substring(slash + 1) : id;
        return capitalize(city.replace('_', ' '));
    }

    private static Typeface display(Context context) {
        if (displayTypeface == null) {
            try {
                displayTypeface = Typeface.createFromAsset(context.getAssets(), "fonts/Manrope-ExtraBold.ttf");
            } catch (RuntimeException ignored) {
                displayTypeface = Typeface.create("sans-serif", Typeface.BOLD);
            }
        }
        return displayTypeface;
    }

    private static Paint paint() {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setSubpixelText(true);
        if (displayTypeface != null) p.setTypeface(displayTypeface);
        return p;
    }

    private static void fit(Paint paint, String value, float maxWidth) {
        float measured = paint.measureText(value);
        if (measured > maxWidth && measured > 0) {
            paint.setTextSize(paint.getTextSize() * maxWidth / measured);
        }
    }

    private static String clean(String value) {
        if (value == null) return "";
        return value.replace('\n', ' ').replace('\r', ' ').trim();
    }

    private static String capitalize(String value) {
        if (value.isEmpty()) return value;
        return value.substring(0, 1).toUpperCase(SPANISH) + value.substring(1);
    }
}
