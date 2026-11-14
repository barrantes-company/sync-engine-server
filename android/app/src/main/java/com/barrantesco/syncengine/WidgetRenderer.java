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
import android.graphics.SweepGradient;
import android.graphics.Typeface;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Renderiza los cuatro lenguajes visuales del reloj en dos fases de movimiento ambiental.
 * La hora NO se dibuja aquí: la superpone un TextClock vivo del
 * sistema. El bitmap es full-bleed con esquinas transparentes para que el widget flote sobre
 * el wallpaper sin bordes negros. Solo datos reales de la caché. Sin red.
 */
final class WidgetRenderer {
    static final int STYLE_CHROMATIC = 0;
    static final int STYLE_COMPACT = 1;
    static final int STYLE_MINIMAL = 2;
    static final int STYLE_MATERIAL = 3;
    /** Presupuesto de píxeles por frame; dos frames siguen siendo seguros para el binder. */
    private static final int MAX_PIXELS = 153600;

    private static final int PRIMARY = 0xFFF3F7FF;
    private static final int SECONDARY = 0xFFAAB9D6;
    private static final int ACCENT = 0xFF4FD1C5;
    private static final int CYAN = 0xFF38BDF8;
    private static final int AMBER = 0xFFFBBF24;
    private static final int SKY_LINE = 0xFF070B16;
    private static final int SKY_HAZE = 0xFF1C2547;
    private static final int WINDOW = 0xFFFFD9A0;
    private static final int GLASS = 0x16FFFFFF;
    private static final int HAIRLINE = 0x24FFFFFF;
    private static final Locale SPANISH = new Locale("es", "ES");

    private static Typeface displayTypeface;

    private WidgetRenderer() {}

    /** Bitmap full-bleed con presupuesto de píxeles que preserva el aspecto del widget. */
    static int[] size(Context context, int widthDp, int heightDp) {
        float density = context.getResources().getDisplayMetrics().density;
        float width = Math.max(110, widthDp) * density;
        float height = Math.max(60, heightDp) * density;
        float scale = Math.min(1f, (float) Math.sqrt(MAX_PIXELS / (width * height)));
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
        boolean showCounters, animations, banner, transparent;
        String bannerFrom, bannerText;
    }

    /**
     * Dibuja el estilo solicitado en la fase {@code phase} (0/1). La superficie exterior
     * puede ser sólida o conservar alfa cero para integrarse con el wallpaper del launcher.
     */
    static Bitmap render(Context context, int width, int height, int style, int phase,
                         boolean transparent) {
        int w = Math.max(1, width);
        int h = Math.max(1, height);
        display(context);

        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        float density = context.getResources().getDisplayMetrics().density;
        float radius = Math.max(10f * density, Math.min(w, h) * 0.10f);

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
        s.transparent = transparent;

        switch (style) {
            case STYLE_CHROMATIC:
                chromatic(canvas, s);
                break;
            case STYLE_COMPACT:
                compact(canvas, s);
                break;
            case STYLE_MATERIAL:
                material(canvas, s);
                break;
            default:
                minimal(canvas, s);
                break;
        }

        if (!transparent) {
            Paint edge = paint();
            edge.setStyle(Paint.Style.STROKE);
            edge.setStrokeWidth(Math.max(1f, density * 0.75f));
            edge.setColor(HAIRLINE);
            float inset = edge.getStrokeWidth() * 0.5f;
            canvas.drawRoundRect(new RectF(inset, inset, w - inset, h - inset),
                    radius - inset, radius - inset, edge);
        }
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

    /** 5x2: gradiente eléctrico, barrido superior y aviso con giro entre fases. */
    private static void chromatic(Canvas cv, S s) {
        if (!s.transparent) chromaticBg(cv, s.w, s.h);
        ambientGlow(cv, s);
        statusButtons(cv, s, s.w * 0.83f, s.h * 0.38f, false);
        if (s.banner) {
            banner(cv, s, s.w * 0.50f, s.h * 0.70f, s.w * 0.88f);
        } else {
            idleBanner(cv, s, s.w * 0.50f, s.h * 0.70f, s.w * 0.88f, false);
        }
        Paint sweep = paint();
        sweep.setShader(new LinearGradient(0f, 0f, s.w * 0.34f, 0f,
                new int[] {0x004DE4FF, 0xFF4DE4FF, 0x0062E2CF}, null,
                Shader.TileMode.CLAMP));
        float x = s.phase == 0 ? s.w * 0.08f : s.w * 0.58f;
        cv.drawRoundRect(new RectF(x, 0f, Math.min(s.w, x + s.w * 0.34f),
                Math.max(2f, s.d)), s.d, s.d, sweep);
    }

    /** 3x2: composición compacta y aviso que sube desde la base. */
    private static void compact(Canvas cv, S s) {
        if (!s.transparent) compactBg(cv, s.w, s.h);
        ambientGlow(cv, s);
        statusButtons(cv, s, s.w * 0.80f, s.h * 0.40f, false);
        float y = s.banner && s.phase == 0 ? s.h * 0.76f : s.h * 0.70f;
        if (s.banner) banner(cv, s, s.w * 0.50f, y, s.w * 0.88f);
        else idleBanner(cv, s, s.w * 0.50f, s.h * 0.70f, s.w * 0.88f, false);
    }

    /** 2x2: reloj protagonista y controles circulares con pulso de notificación. */
    private static void minimal(Canvas cv, S s) {
        if (!s.transparent) radialBg(cv, s.w, s.h);
        if (!s.transparent) ambientGlow(cv, s);
        float cx = s.w * 0.5f;
        float cy = s.h * 0.76f;
        statusButtons(cv, s, cx, cy, true);
        if (s.unread > 0) {
            Paint halo = paint();
            halo.setStyle(Paint.Style.STROKE);
            halo.setStrokeWidth(Math.max(1f, s.d));
            halo.setColor(s.phase == 0 ? 0xCC4DE4FF : 0x334DE4FF);
            float pulse = s.phase == 0 ? s.h * 0.09f : s.h * 0.15f;
            cv.drawCircle(cx - s.h * 0.12f, cy, pulse, halo);
        }
    }

    /** 5x2: rejilla técnica, controles biselados y línea de escáner. */
    private static void material(Canvas cv, S s) {
        if (!s.transparent) materialBg(cv, s.w, s.h);
        materialGrid(cv, s);
        statusButtons(cv, s, s.w * 0.83f, s.h * 0.38f, false);
        if (s.banner) banner(cv, s, s.w * 0.50f, s.h * 0.70f, s.w * 0.88f);
        else idleBanner(cv, s, s.w * 0.50f, s.h * 0.70f, s.w * 0.88f, true);

        float y = s.phase == 0 ? s.h * 0.20f : s.h * 0.82f;
        Paint scan = paint();
        scan.setShader(new LinearGradient(0f, y, s.w, y,
                new int[] {0x0070FFB1, 0xFF70FFB1, 0x0070FFB1}, null,
                Shader.TileMode.CLAMP));
        scan.setShadowLayer(Math.max(4f, s.d * 4f), 0f, 0f, 0xFF70FFB1);
        cv.drawRect(0f, y, s.w, y + Math.max(1f, s.d), scan);
        scan.setShadowLayer(0f, 0f, 0f, 0);
    }

    /** Anillo: reloj vivo centrado en un anillo orbital tonal; contadores glass abajo. */
    private static void anillo(Canvas cv, S s) {
        radialBg(cv, s.w, s.h);
        ambientGlow(cv, s);
        float cx = s.w * 0.5f;
        float cy = s.h * 0.47f;
        float r = Math.min(s.w, s.h) * 0.30f;
        float stroke = Math.max(3f, r * 0.09f);
        float sweep = s.animations ? 30f + (s.minute / 60f) * 330f : 300f;
        ring(cv, cx, cy, r, stroke, sweep);

        if (s.showCounters) {
            float cw = s.w * 0.34f;
            float ch = s.h * 0.075f;
            countChip(cv, cx - s.w * 0.19f, s.h * 0.84f, cw, ch, CYAN, s.unread, "Mensajes");
            countChip(cv, cx + s.w * 0.19f, s.h * 0.84f, cw, ch, AMBER, s.missed, "Llamadas");
        }
        if (s.banner) banner(cv, s, s.w * 0.5f, s.h * 0.05f, s.w * 0.84f);
    }

    /** Ciudad: cielo dusk por capas, skyline con ventanas, reloj vivo arriba a la izquierda. */
    private static void ciudad(Canvas cv, S s) {
        skyBg(cv, s.w, s.h);
        ambientGlow(cv, s);
        skyline(cv, s.w, s.h, s.minute, s.animations);
        if (s.showCounters) {
            float cw = s.w * 0.165f;
            float ch = s.h * 0.12f;
            countChip(cv, s.w * 0.70f, s.h * 0.30f, cw, ch, CYAN, s.unread, "Mensajes");
            countChip(cv, s.w * 0.875f, s.h * 0.30f, cw, ch, AMBER, s.missed, "Llamadas");
        }
        if (s.banner) banner(cv, s, s.w * 0.5f, s.h * 0.60f, s.w * 0.84f);
    }

    // ------------------------------------------------------------ Fondos

    private static void chromaticBg(Canvas cv, int w, int h) {
        Paint p = paint();
        p.setShader(new LinearGradient(0f, 0f, w, h,
                new int[] {0xFF081226, 0xFF151B46, 0xFF21183C},
                new float[] {0f, 0.62f, 1f}, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, p);
        p.setShader(new RadialGradient(w * 0.92f, 0f, Math.max(w, h) * 0.48f,
                0x334DE4FF, 0x00000000, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, p);
        p.setShader(null);
    }

    private static void compactBg(Canvas cv, int w, int h) {
        Paint p = paint();
        p.setShader(new LinearGradient(0f, 0f, w, h,
                new int[] {0xFF07151E, 0xFF111C38, 0xFF17132E},
                new float[] {0f, 0.64f, 1f}, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, p);
        p.setShader(new RadialGradient(w, 0f, Math.max(w, h) * 0.44f,
                0x2E62E2CF, 0x00000000, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, p);
        p.setShader(null);
    }

    private static void materialBg(Canvas cv, int w, int h) {
        Paint p = paint();
        p.setShader(new LinearGradient(0f, 0f, w, h,
                0xFF0A261E, 0xFF040D10, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, p);
        p.setShader(null);
    }

    private static void materialGrid(Canvas cv, S s) {
        Paint grid = paint();
        grid.setColor(s.transparent ? 0x2570FFB1 : 0x1670FFB1);
        grid.setStrokeWidth(Math.max(1f, s.d * 0.45f));
        float step = Math.max(12f * s.d, s.w / 24f);
        for (float x = 0f; x <= s.w; x += step) cv.drawLine(x, 0f, x, s.h, grid);
        for (float y = 0f; y <= s.h; y += step) cv.drawLine(0f, y, s.w, y, grid);
    }

    private static void radialBg(Canvas cv, int w, int h) {
        Paint p = paint();
        p.setShader(new RadialGradient(w * 0.5f, h * 0.40f, Math.max(w, h) * 0.85f,
                new int[] {0xFF15263F, 0xFF0A1424, 0xFF04060D},
                new float[] {0f, 0.55f, 1f}, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, p);
        p.setShader(null);
    }

    private static void skyBg(Canvas cv, int w, int h) {
        Paint p = paint();
        p.setShader(new LinearGradient(0f, 0f, 0f, h,
                new int[] {0xFF070C20, 0xFF181A47, 0xFF3A2A68, 0xFF7C4A66, 0xFF0A0E1C},
                new float[] {0f, 0.34f, 0.58f, 0.80f, 1f}, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, p);
        p.setShader(null);
        Paint horizon = paint();
        horizon.setShader(new RadialGradient(w * 0.5f, h * 0.94f, Math.max(w, h) * 0.62f,
                0x55FF9E6B, 0x00000000, Shader.TileMode.CLAMP));
        cv.drawRect(0f, 0f, w, h, horizon);
        horizon.setShader(null);
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
        float base = h * 0.995f;
        int[] back = {52, 64, 44, 70, 56, 62, 42, 68, 50, 60, 46, 66, 54, 58};
        float bbw = w / (float) back.length;
        Paint haze = paint();
        haze.setColor(SKY_HAZE);
        haze.setAlpha(150);
        for (int i = 0; i < back.length; i++) {
            float bh = h * 0.26f * (back[i] / 70f);
            float x = i * bbw + bbw * 0.12f;
            cv.drawRect(x, base - bh, x + bbw * 0.82f, base, haze);
        }
        haze.setAlpha(255);

        int[] heights = {46, 58, 40, 66, 50, 56, 38, 62, 48, 54, 40, 60, 46, 52};
        float bw = w / (float) heights.length;
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

    private static void ring(Canvas cv, float cx, float cy, float r, float stroke, float sweep) {
        RectF oval = new RectF(cx - r, cy - r, cx + r, cy + r);
        Paint track = paint();
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(stroke);
        track.setColor(0x1AFFFFFF);
        cv.drawArc(oval, 0f, 360f, false, track);

        Paint arc = paint();
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeWidth(stroke);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setShader(new SweepGradient(cx, cy,
                new int[] {ACCENT, CYAN, ACCENT}, new float[] {0f, 0.5f, 1f}));
        arc.setShadowLayer(stroke * 1.6f, 0f, 0f, CYAN);
        cv.drawArc(oval, -90f, sweep, false, arc);
        arc.setShadowLayer(0f, 0f, 0f, 0);
        arc.setShader(null);

        double end = Math.toRadians(-90f + sweep);
        float dx = cx + (float) Math.cos(end) * r;
        float dy = cy + (float) Math.sin(end) * r;
        Paint dot = paint();
        dot.setColor(PRIMARY);
        dot.setShadowLayer(stroke * 1.8f, 0f, 0f, CYAN);
        cv.drawCircle(dx, dy, stroke * 0.62f, dot);
        dot.setShadowLayer(0f, 0f, 0f, 0);
    }

    private static void countChip(Canvas cv, float cx, float y, float cw, float ch, int col, int value, String caption) {
        float x = cx - cw / 2f;
        float corner = ch * 0.46f;
        RectF chip = new RectF(x, y, x + cw, y + ch);
        Paint p = paint();
        p.setColor(GLASS);
        cv.drawRoundRect(chip, corner, corner, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1f, ch * 0.035f));
        p.setColor(HAIRLINE);
        cv.drawRoundRect(chip, corner, corner, p);
        p.setStyle(Paint.Style.FILL);

        p.setColor(col);
        p.setShadowLayer(ch * 0.34f, 0f, 0f, col);
        cv.drawCircle(x + ch * 0.44f, y + ch * 0.5f, ch * 0.15f, p);
        p.setShadowLayer(0f, 0f, 0f, 0);

        p.setColor(PRIMARY);
        p.setTextAlign(Paint.Align.LEFT);
        p.setTextSize(ch * 0.50f);
        cv.drawText(String.valueOf(value), x + ch * 0.78f, y + ch * 0.67f, p);

        p.setColor(SECONDARY);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTextSize(ch * 0.32f);
        cv.drawText(caption, cx, y + ch + ch * 0.46f, p);
        p.setTextAlign(Paint.Align.LEFT);
    }

    /** Accesos visuales a notificaciones, llamadas y mensajes. El widget completo abre la app. */
    private static void statusButtons(Canvas cv, S s, float cx, float cy, boolean circular) {
        float size = Math.max(18f * s.d, s.h * (circular ? 0.12f : 0.13f));
        float gap = size * 1.22f;
        float start = cx - gap;
        for (int index = 0; index < 3; index++) {
            float x = start + gap * index;
            RectF bounds = new RectF(x - size * 0.5f, cy - size * 0.5f,
                    x + size * 0.5f, cy + size * 0.5f);
            Paint surface = paint();
            surface.setColor(index == 0 ? 0x224DE4FF : 0x16FFFFFF);
            cv.drawRoundRect(bounds, circular ? size * 0.5f : size * 0.28f,
                    circular ? size * 0.5f : size * 0.28f, surface);
            surface.setStyle(Paint.Style.STROKE);
            surface.setStrokeWidth(Math.max(1f, s.d * 0.7f));
            surface.setColor(index == 0 ? 0xBB4DE4FF : 0x38FFFFFF);
            cv.drawRoundRect(bounds, circular ? size * 0.5f : size * 0.28f,
                    circular ? size * 0.5f : size * 0.28f, surface);

            Paint icon = paint();
            icon.setStyle(Paint.Style.STROKE);
            icon.setStrokeWidth(Math.max(1.2f, size * 0.055f));
            icon.setStrokeCap(Paint.Cap.ROUND);
            icon.setStrokeJoin(Paint.Join.ROUND);
            icon.setColor(index == 0 ? CYAN : SECONDARY);
            if (index == 0) {
                RectF bell = new RectF(x - size * 0.17f, cy - size * 0.20f,
                        x + size * 0.17f, cy + size * 0.13f);
                cv.drawArc(bell, 190f, 160f, false, icon);
                cv.drawLine(x - size * 0.22f, cy + size * 0.13f,
                        x + size * 0.22f, cy + size * 0.13f, icon);
                cv.drawCircle(x, cy + size * 0.20f, size * 0.025f, icon);
            } else if (index == 1) {
                Path phone = new Path();
                phone.moveTo(x - size * 0.16f, cy - size * 0.20f);
                phone.quadTo(x - size * 0.08f, cy + size * 0.14f,
                        x + size * 0.19f, cy + size * 0.18f);
                cv.drawPath(phone, icon);
            } else {
                RectF bubble = new RectF(x - size * 0.20f, cy - size * 0.17f,
                        x + size * 0.20f, cy + size * 0.13f);
                cv.drawRoundRect(bubble, size * 0.07f, size * 0.07f, icon);
                cv.drawLine(x - size * 0.06f, cy + size * 0.13f,
                        x - size * 0.14f, cy + size * 0.22f, icon);
            }
        }

        if (s.showCounters && s.unread > 0) {
            float bx = start + size * 0.38f;
            float by = cy - size * 0.40f;
            float br = size * 0.21f;
            Paint badge = paint();
            badge.setColor(AMBER);
            cv.drawCircle(bx, by, br, badge);
            badge.setColor(0xFF10131A);
            badge.setTextAlign(Paint.Align.CENTER);
            badge.setTextSize(br * 1.05f);
            String value = s.unread > 99 ? "99+" : String.valueOf(s.unread);
            fit(badge, value, br * 1.45f);
            cv.drawText(value, bx, by - (badge.ascent() + badge.descent()) * 0.5f, badge);
        }
    }

    /** Superficie en reposo: conserva el área del aviso sin competir con el reloj. */
    private static void idleBanner(Canvas cv, S s, float cx, float y, float bw, boolean technical) {
        float bh = Math.max(30f * s.d, s.h * 0.15f);
        float x = cx - bw / 2f;
        RectF card = new RectF(x, y, x + bw, y + bh);
        Paint p = paint();
        p.setColor(technical ? 0x1800FF84 : 0x12000000);
        cv.drawRoundRect(card, technical ? bh * 0.12f : bh * 0.34f,
                technical ? bh * 0.12f : bh * 0.34f, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1f, s.d * 0.65f));
        p.setColor(technical ? 0x5570FFB1 : 0x3A4DE4FF);
        cv.drawRoundRect(card, technical ? bh * 0.12f : bh * 0.34f,
                technical ? bh * 0.12f : bh * 0.34f, p);
    }

    /** Pop-up temporal tipo glass con el remitente del nuevo mensaje. */
    private static void banner(Canvas cv, S s, float cx, float y, float bw) {
        float bh = Math.max(30f * s.d, s.h * 0.15f);
        float x = cx - bw / 2f;
        float corner = bh * 0.34f;
        RectF card = new RectF(x, y, x + bw, y + bh);
        Paint p = paint();
        p.setColor(0xF20E1729);
        cv.drawRoundRect(card, corner, corner, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1f, s.d * 0.75f));
        p.setColor(0x4438BDF8);
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
