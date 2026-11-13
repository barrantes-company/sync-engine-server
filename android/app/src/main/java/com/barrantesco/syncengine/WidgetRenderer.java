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
 * Renderiza el fondo premium de las tres caras (Ciudad, Barra, Anillo) en dos fases de glow
 * para el ViewFlipper. La hora NO se dibuja aquí: la superpone un TextClock vivo del sistema.
 * Solo datos reales de la caché (contadores y remitente del último mensaje). Sin red.
 */
final class WidgetRenderer {
    private static final int MAX_WIDTH_PX = 480;
    private static final int MAX_HEIGHT_PX = 320;

    private static final int PRIMARY = 0xFFEAF2FF;
    private static final int SECONDARY = 0xFF9FB3D1;
    private static final int ACCENT = 0xFF54BFA5;
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

    /** Etiqueta de ciudad derivada de la zona horaria efectiva (para el TextView de Ciudad). */
    static String city(Context context) {
        TimeZone zone = TimeZone.getTimeZone(AppSettings.effectiveTimeZone(context));
        String id = zone.getID();
        int slash = id.lastIndexOf('/');
        String city = slash >= 0 ? id.substring(slash + 1) : id;
        return capitalize(city.replace('_', ' '));
    }

    /** Fecha larga en español para el TextView bajo el reloj. */
    static String date(Context context) {
        TimeZone zone = TimeZone.getTimeZone(AppSettings.effectiveTimeZone(context));
        SimpleDateFormat format = new SimpleDateFormat("EEEE, d 'de' MMMM", SPANISH);
        format.setTimeZone(zone);
        return capitalize(format.format(new Date()).replace('.', ' '));
    }

    private static final class S {
        int w, h;
        float d;
        int unread, missed, minute, phase;
        boolean showCounters, animations, banner;
        String bannerFrom, bannerText;
    }

    /**
     * Dibuja el fondo de la cara {@code style} (0 = Ciudad, 1 = Barra, 2 = Anillo) en la fase
     * {@code phase} (0/1). Las dos fases solo cambian el glow ambiental para el bucle sutil.
     */
    static Bitmap render(Context context, int width, int height, int style, int phase) {
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

        boolean signedIn = AppSettings.isLoggedIn(context);
        long now = System.currentTimeMillis();
        TimeZone zone = TimeZone.getTimeZone(AppSettings.effectiveTimeZone(context));
        Calendar calendar = Calendar.getInstance(zone);
        calendar.setTimeInMillis(now);

        S s = new S();
        s.w = w;
        s.h = h;
        s.d = density;
        s.minute = calendar.get(Calendar.MINUTE);
        s.phase = phase;
        s.unread = signedIn ? AppSettings.unread(context) : 0;
        s.missed = signedIn ? AppSettings.missed(context) : 0;
        s.showCounters = AppSettings.showCounters(context);
        s.animations = AppSettings.animations(context);
        s.banner = signedIn && AppSettings.bannerUntil(context) > now;
        s.bannerFrom = clean(AppSettings.latestFrom(context));
        s.bannerText = bannerText(context);

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

    private static String bannerText(Context context) {
        String text = clean(AppSettings.latestText(context));
        if (!text.isEmpty()) return text;
        String type = AppSettings.latestType(context);
        if ("audio".equals(type)) return context.getString(R.string.preview_audio);
        if ("file".equals(type)) return context.getString(R.string.preview_file);
        return context.getString(R.string.preview_message);
    }

    // ---------------------------------------------------------------- Caras

    /** Anillo: reloj vivo centrado dentro de un anillo orbital; contadores abajo. */
    private static void anillo(Canvas cv, S s) {
        radialBg(cv, s.w, s.h);
        ambientGlow(cv, s);
        float cx = s.w * 0.5f;
        float cy = s.h * 0.5f;
        float r = Math.min(s.w, s.h) * 0.30f;
        float stroke = Math.max(3f, r * 0.10f);
        float sweep = s.animations ? 24f + (s.minute / 60f) * 336f : 300f;
        ring(cv, cx, cy, r, stroke, sweep, ACCENT);

        if (s.showCounters) {
            float cw = s.w * 0.30f;
            float ch = s.h * 0.085f;
            countChip(cv, cx - s.w * 0.17f, s.h * 0.84f, cw, ch, CYAN, s.unread, "Mensajes");
            countChip(cv, cx + s.w * 0.17f, s.h * 0.84f, cw, ch, AMBER, s.missed, "Llamadas");
        }
        if (s.banner) banner(cv, s, s.w * 0.5f, s.h * 0.055f, s.w * 0.82f);
    }

    /** Barra: fondo mesh, reloj vivo a la izquierda, nube y contadores a la derecha. */
    private static void barra(Canvas cv, S s) {
        meshBg(cv, s.w, s.h);
        ambientGlow(cv, s);
        float pad = Math.max(10f * s.d, s.w * 0.05f);
        cloudIcon(cv, s.w * 0.80f, s.h * 0.22f, s.h * 0.12f, ACCENT);
        if (s.showCounters) {
            float cw = s.w * 0.18f;
            float ch = s.h * 0.10f;
            countChip(cv, s.w * 0.70f, s.h * 0.42f, cw, ch, CYAN, s.unread, "Mensajes");
            countChip(cv, s.w * 0.88f, s.h * 0.42f, cw, ch, AMBER, s.missed, "Llamadas");
        }
        accentBar(cv, pad, s.h * 0.90f, s.w - pad * 2f, Math.max(3f, s.h * 0.022f),
                s.minute, s.animations);
        if (s.banner) banner(cv, s, s.w * 0.42f, s.h * 0.06f, s.w * 0.62f);
    }

    /** Ciudad: cielo degradado, skyline con ventanas, reloj vivo arriba a la izquierda. */
    private static void ciudad(Canvas cv, S s) {
        skyBg(cv, s.w, s.h);
        ambientGlow(cv, s);
        skyline(cv, s.w, s.h, s.minute, s.animations);
        if (s.showCounters) {
            float cw = s.w * 0.18f;
            float ch = s.h * 0.10f;
            countChip(cv, s.w * 0.70f, s.h * 0.40f, cw, ch, CYAN, s.unread, "Mensajes");
            countChip(cv, s.w * 0.88f, s.h * 0.40f, cw, ch, AMBER, s.missed, "Llamadas");
        }
        if (s.banner) banner(cv, s, s.w * 0.5f, s.h * 0.62f, s.w * 0.82f);
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

    /** Glow ambiental que respira entre las dos fases del ViewFlipper. */
    private static void ambientGlow(Canvas cv, S s) {
        float intensity = s.animations ? (s.phase == 0 ? 0.28f : 0.52f) : 0.38f;
        int alpha = Math.max(0, Math.min(255, Math.round(intensity * 255f)));
        int color = (alpha << 24) | (CYAN & 0x00FFFFFF);
        float cx = s.phase == 1 ? s.w * 0.62f : s.w * 0.40f;
        Paint p = paint();
        p.setShader(new RadialGradient(cx, s.h * 0.10f, Math.max(s.w, s.h) * 0.85f,
                color, 0x00000000, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, s.w, s.h, p);
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
        p.setShadowLayer(ch * 0.30f, 0f, 0f, col);
        cv.drawCircle(x + ch * 0.42f, y + ch * 0.5f, ch * 0.16f, p);
        p.setShadowLayer(0f, 0f, 0f, 0);
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

    /** Pop-up temporal tipo glass con el remitente del nuevo mensaje. */
    private static void banner(Canvas cv, S s, float cx, float y, float bw) {
        float bh = Math.max(30f * s.d, s.h * 0.15f);
        float x = cx - bw / 2f;
        float corner = bh * 0.30f;
        RectF card = new RectF(x, y, x + bw, y + bh);
        Paint p = paint();
        p.setColor(0xF2101A2E);
        cv.drawRoundRect(card, corner, corner, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1f, s.d));
        p.setColor(0x5522D3EE);
        cv.drawRoundRect(card, corner, corner, p);
        p.setStyle(Paint.Style.FILL);

        float av = bh * 0.60f;
        float avx = x + bh * 0.52f;
        float avy = y + bh * 0.5f;
        p.setColor(CYAN);
        p.setShadowLayer(av * 0.45f, 0f, 0f, CYAN);
        cv.drawCircle(avx, avy, av * 0.5f, p);
        p.setShadowLayer(0f, 0f, 0f, 0);
        p.setColor(0xFF04121A);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTextSize(av * 0.52f);
        String initial = s.bannerFrom.isEmpty() ? "?"
                : s.bannerFrom.substring(0, 1).toUpperCase(SPANISH);
        cv.drawText(initial, avx, avy - (p.ascent() + p.descent()) * 0.5f, p);

        float tx = avx + av * 0.78f;
        float maxw = x + bw - tx - bh * 0.30f;
        p.setTextAlign(Paint.Align.LEFT);
        p.setColor(PRIMARY);
        p.setTextSize(bh * 0.30f);
        String from = s.bannerFrom.isEmpty() ? "Mensaje nuevo" : s.bannerFrom;
        fit(p, from, maxw);
        cv.drawText(from, tx, y + bh * 0.42f, p);
        p.setColor(SECONDARY);
        p.setTextSize(bh * 0.24f);
        fit(p, s.bannerText, maxw);
        cv.drawText(s.bannerText, tx, y + bh * 0.74f, p);
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
