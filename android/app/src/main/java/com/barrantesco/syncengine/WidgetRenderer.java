package com.barrantesco.syncengine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Dibuja el widget como imágenes: RemoteViews no admite fuentes propias ni degradados,
 * así que fondo animado (fotogramas de estelas) y texto se pintan con Canvas.
 */
final class WidgetRenderer {
    /** Número de fotogramas del ciclo de estelas. */
    static final int FRAMES = 6;

    private static final int[] TRAIL_COLORS = {
            0xFF3ECFFF, 0xFFE7F8FF, 0xFF79B7FF, 0xFFFFFFFF, 0xFFFF4FD8,
            0xFFFF9AD4, 0xFFFF3D78, 0xFFFF3B42, 0xFFFFC4A0};
    private static final int TRAIL_COUNT = 16;
    // Keep the single bitmap sent through RemoteViews below Binder's transaction limit.
    private static final int MAX_WIDTH_PX = 480;
    private static final int MAX_HEIGHT_PX = 240;
    private static final float CORNER_DP = 28f;

    private static Typeface display;

    private WidgetRenderer() {
    }

    /** Dimensiones en píxeles del bitmap según el tamaño del widget en dp. */
    static int[] size(Context context, int widthDp, int heightDp) {
        float density = context.getResources().getDisplayMetrics().density;
        float w = Math.max(widthDp, 110) * density;
        float h = Math.max(heightDp, 110) * density;
        float scale = Math.min(1f, Math.min(MAX_WIDTH_PX / w, MAX_HEIGHT_PX / h));
        return new int[] {Math.round(w * scale), Math.round(h * scale), Math.round(density * scale * 100)};
    }

    private static Typeface display(Context context) {
        if (display == null) {
            try {
                display = Typeface.createFromAsset(context.getAssets(), "fonts/Manrope-ExtraBold.ttf");
            } catch (RuntimeException exception) {
                display = Typeface.create("sans-serif-medium", Typeface.BOLD);
            }
        }
        return display;
    }

    /**
     * Fotograma de fondo: negro, estelas con degradado lateral, brillo inferior y borde.
     * @param frame índice 0..FRAMES-1 dentro del ciclo.
     */
    static Bitmap background(Context context, int w, int h, float unit, int frame) {
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        float radius = CORNER_DP * unit;
        RectF bounds = new RectF(0, 0, w, h);

        Path clip = new Path();
        clip.addRoundRect(bounds, radius, radius, Path.Direction.CW);
        canvas.clipPath(clip);
        canvas.drawColor(Color.BLACK);

        // Las estelas se dibujan en una capa para poder desvanecer sus extremos.
        int layer = canvas.saveLayer(bounds, null);
        double phase = 2 * Math.PI * frame / FRAMES;
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        for (int i = 0; i < TRAIL_COUNT; i++) {
            stroke.setColor(TRAIL_COLORS[i % TRAIL_COLORS.length]);
            stroke.setAlpha(Math.round(255 * (i % 4 == 0 ? 0.82f : 0.55f)));
            stroke.setStrokeWidth((i % 3 == 0 ? 2.4f : 1.4f) * unit);
            canvas.drawPath(trail(120 + i * 13, i, phase, w / 800f, h / 420f), stroke);
        }
        Paint fade = new Paint();
        fade.setShader(new LinearGradient(0, 0, w, 0,
                new int[] {0x00FFFFFF, 0xFFFFFFFF, 0xB3FFFFFF, 0x00FFFFFF},
                new float[] {0f, 0.08f, 0.82f, 1f}, Shader.TileMode.CLAMP));
        fade.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
        canvas.drawRect(bounds, fade);
        canvas.restoreToCount(layer);

        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow.setShader(new RadialGradient(w / 2f, h * 1.05f, w * 0.55f,
                0x2EFFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP));
        canvas.drawRect(0, h * 0.55f, w, h, glow);

        canvas.clipRect(bounds, android.graphics.Region.Op.UNION);
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(unit);
        border.setColor(0x26FFFFFF);
        float inset = unit / 2f;
        canvas.drawRoundRect(new RectF(inset, inset, w - inset, h - inset), radius, radius, border);
        return bitmap;
    }

    private static Path trail(float y, int index, double t, float sx, float sy) {
        double sway = Math.sin(t + index * 0.45) * 22;
        double curl = 78 + Math.cos(t + index * 0.2) * 6;
        float y0 = (float) (y + sway);
        float y1 = (float) (y + sway * 0.35);
        float y2 = (float) (y - curl * 0.28 + sway);
        float y3 = (float) (y - curl);
        Path path = new Path();
        path.moveTo(-30 * sx, y0 * sy);
        path.cubicTo(180 * sx, y1 * sy, 460 * sx, y2 * sy, 680 * sx, y3 * sy);
        path.cubicTo(900 * sx, (2 * y3 - y2) * sy, 900 * sx, (y3 - 12) * sy, 1040 * sx, (y3 + 6) * sy);
        return path;
    }

    /**
     * Capa de texto transparente: hora grande, fecha y contadores.
     * @param status segmentos "número", "etiqueta" alternados; vacío si se ocultan.
     */
    static Bitmap text(Context context, int w, int h, String zone, boolean use24h,
                       String[] status, boolean dim) {
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Date now = new Date();
        TimeZone timeZone = TimeZone.getTimeZone(zone);

        SimpleDateFormat clockFormat = new SimpleDateFormat(use24h ? "HH:mm" : "h:mm", Locale.US);
        clockFormat.setTimeZone(timeZone);
        String clock = clockFormat.format(now);
        SimpleDateFormat dateFormat = new SimpleDateFormat("EEEE d MMM", new Locale("es"));
        dateFormat.setTimeZone(timeZone);
        String date = dateFormat.format(now).replace(".", "").toLowerCase(new Locale("es"));

        Paint clockPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        clockPaint.setTypeface(display(context));
        clockPaint.setColor(Color.WHITE);
        clockPaint.setLetterSpacing(-0.03f);
        float size = h * 0.5f;
        clockPaint.setTextSize(size);
        float maxWidth = w * 0.78f;
        float measured = clockPaint.measureText(clock);
        if (measured > maxWidth) {
            clockPaint.setTextSize(size * maxWidth / measured);
        }
        android.graphics.Rect digits = new android.graphics.Rect();
        clockPaint.getTextBounds("0", 0, 1, digits);
        float clockCenter = h * 0.37f;
        canvas.drawText(clock, (w - clockPaint.measureText(clock)) / 2f,
                clockCenter + digits.height() / 2f, clockPaint);

        Paint small = new Paint(Paint.ANTI_ALIAS_FLAG);
        small.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        small.setTextSize(h * 0.075f);
        small.setColor(0xCCFFFFFF);
        canvas.drawText(date, (w - small.measureText(date)) / 2f, h * 0.665f, small);

        if (status.length > 0) {
            Paint number = new Paint(small);
            number.setTypeface(display(context));
            number.setColor(dim ? 0x8CFFFFFF : Color.WHITE);
            small.setColor(0x99FFFFFF);
            float gap = small.measureText(" ");
            float total = 0;
            for (int i = 0; i < status.length; i++) {
                total += (i % 2 == 0 ? number : small).measureText(status[i]);
                total += (i % 2 == 0 ? gap : (i < status.length - 1 ? gap * 2 : 0));
            }
            float x = (w - total) / 2f;
            float y = h * 0.82f;
            for (int i = 0; i < status.length; i++) {
                Paint p = i % 2 == 0 ? number : small;
                canvas.drawText(status[i], x, y, p);
                x += p.measureText(status[i]) + (i % 2 == 0 ? gap : gap * 2);
                if (i % 2 == 1 && i < status.length - 1) {
                    canvas.drawText("·", x - gap * 1.5f, y, small);
                }
            }
        }
        return bitmap;
    }
}
