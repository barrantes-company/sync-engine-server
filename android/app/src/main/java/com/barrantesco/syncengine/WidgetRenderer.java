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
            0xFF24D7F2, 0xFFB8F7FF, 0xFF378BFF, 0xFFFFFFFF, 0xFFFFC15A,
            0xFFFFE2A0, 0xFFFFA63D, 0xFFDA8A25, 0xFFFFF0C4};
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
        float h = Math.max(heightDp, 60) * density;
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
        canvas.drawColor(0xFF07111D);
        Paint glassBase = new Paint(Paint.ANTI_ALIAS_FLAG);
        glassBase.setShader(new LinearGradient(0, 0, w, h,
                new int[] {0xFF172838, 0xFF0B1522, 0xFF111C29},
                new float[] {0f, 0.58f, 1f}, Shader.TileMode.CLAMP));
        canvas.drawRect(bounds, glassBase);

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
                new int[] {0x00FFFFFF, 0xFFFFD98A, 0xB3FFFFFF, 0x00FFFFFF},
                new float[] {0f, 0.08f, 0.82f, 1f}, Shader.TileMode.CLAMP));
        fade.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
        canvas.drawRect(bounds, fade);
        canvas.restoreToCount(layer);

        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow.setShader(new RadialGradient(w / 2f, h * 1.05f, w * 0.55f,
                0x45FFB84D, 0x00FFFFFF, Shader.TileMode.CLAMP));
        canvas.drawRect(0, h * 0.55f, w, h, glow);

        canvas.clipRect(bounds, android.graphics.Region.Op.UNION);
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(unit);
        border.setColor(0x55E8C58C);
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
        Locale es = new Locale("es");

        SimpleDateFormat clockFormat = new SimpleDateFormat(use24h ? "HH:mm" : "h:mm", Locale.US);
        clockFormat.setTimeZone(timeZone);
        String clock = clockFormat.format(now);
        SimpleDateFormat dateFormat = new SimpleDateFormat("EEE d MMM", es);
        dateFormat.setTimeZone(timeZone);
        String date = dateFormat.format(now).replace(".", "").toLowerCase(es);
        boolean wide = w >= h * 1.55f;
        boolean compact = h < 140f;

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        Paint strong = new Paint(Paint.ANTI_ALIAS_FLAG);
        strong.setTypeface(display(context));
        Paint shape = new Paint(Paint.ANTI_ALIAS_FLAG);
        float pad = Math.max(8f, w * 0.045f);
        float radius = Math.max(8f, h * 0.12f);

        // Paneles de cristal y halo ámbar, inspirados en el paquete de referencia.
        shape.setColor(0x351D3547);
        canvas.drawRoundRect(new RectF(pad, pad, w - pad, h - pad), radius, radius, shape);
        shape.setStyle(Paint.Style.STROKE);
        shape.setStrokeWidth(Math.max(0.7f, h * 0.006f));
        shape.setColor(0x75E6BC69);
        canvas.drawRoundRect(new RectF(pad + 1, pad + 1, w - pad - 1, h - pad - 1), radius, radius, shape);
        shape.setStyle(Paint.Style.FILL);
        shape.setShader(new RadialGradient(w * (wide ? 0.25f : 0.5f), h * 0.08f,
                Math.max(w, h) * 0.62f, new int[] {0x32FFC45F, 0x00FFC45F},
                null, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(new RectF(pad, pad, w - pad, h - pad), radius, radius, shape);
        shape.setShader(null);

        float labelSize = Math.max(7f, Math.min(12f, h * (compact ? 0.12f : 0.075f)));
        float clockSize = h * (compact ? 0.48f : (wide ? 0.40f : 0.38f));
        float contentLeft = pad + Math.max(8f, h * 0.12f);
        float contentRight = w - pad - Math.max(8f, h * 0.12f);

        // Marca y estado de conexión.
        strong.setColor(0xFFFFE4AD);
        strong.setTextSize(Math.max(8f, Math.min(15f, h * (compact ? 0.17f : 0.105f))));
        if (wide) {
            canvas.drawText("SYNC ENGINE", contentLeft, pad + labelSize + 3f, strong);
            text.setTextSize(labelSize);
            text.setColor(0xFFB7C8D7);
            canvas.drawText("BY BARRANTES CO.", contentLeft, pad + labelSize * 2.25f, text);
            float dotX = contentLeft + 4f;
            float dotY = Math.min(h * 0.62f, h - pad - labelSize * 2.3f);
            shape.setColor(0xFF35D6A2);
            canvas.drawCircle(dotX, dotY - labelSize * 0.25f, Math.max(2f, labelSize * 0.23f), shape);
            text.setColor(0xFFBFE8D8);
            text.setTextSize(labelSize);
            canvas.drawText("ONLINE SYNC", dotX + labelSize * 0.75f, dotY, text);
        } else {
            strong.setTextAlign(Paint.Align.CENTER);
            canvas.drawText("SYNC ENGINE", w / 2f, pad + labelSize + 2f, strong);
            strong.setTextAlign(Paint.Align.LEFT);
        }

        // Hora y fecha: panorámica para 4x2/4x1, apilada para 2x2.
        Paint clockPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        clockPaint.setTypeface(display(context));
        clockPaint.setColor(Color.WHITE);
        clockPaint.setShadowLayer(Math.max(1f, h * 0.018f), 0, 0, 0x80FFBD52);
        clockPaint.setTextSize(clockSize);
        float maxClockWidth = wide ? w * 0.46f : w * 0.84f;
        float measured = clockPaint.measureText(clock);
        if (measured > maxClockWidth) clockPaint.setTextSize(clockSize * maxClockWidth / measured);
        if (wide) {
            float clockX = w - pad - clockPaint.measureText(clock) - h * 0.07f;
            float baseline = compact ? h * 0.60f : h * 0.59f;
            canvas.drawText(clock, clockX, baseline, clockPaint);
            text.setTextSize(labelSize);
            text.setColor(0xFFD0D9E3);
            float dateWidth = text.measureText(date);
            canvas.drawText(date, w - pad - dateWidth - h * 0.07f, Math.min(h - pad - 5f, baseline + labelSize * 1.35f), text);
        } else {
            float baseline = h * 0.55f;
            canvas.drawText(clock, (w - clockPaint.measureText(clock)) / 2f, baseline, clockPaint);
            text.setTextSize(labelSize);
            text.setColor(0xFFD0D9E3);
            canvas.drawText(date, (w - text.measureText(date)) / 2f, h * 0.68f, text);
        }

        if (status.length >= 4) {
            String unread = status[0];
            String unreadLabel = status[1];
            String missed = status[2];
            String missedLabel = status[3];
            if (wide && compact) {
                text.setTextSize(Math.max(6f, Math.min(9f, h * 0.075f)));
                text.setColor(dim ? 0xFFB4C2CF : 0xFFFFD88A);
                canvas.drawText(unread + " MENSAJES  ·  " + missed + " LLAMADAS",
                        contentLeft, h * 0.87f, text);
            } else {
                float pillY = wide ? h * 0.82f : h * 0.84f;
                float pillH = Math.max(12f, h * 0.19f);
                float gap = Math.max(4f, w * 0.012f);
                float pillW = wide ? Math.min(w * 0.29f, h * 2.15f) : w * 0.40f;
                float leftX = wide ? contentLeft : (w - pillW * 2 - gap) / 2f;
                float rightX = wide ? contentLeft + pillW + gap : leftX + pillW + gap;
                Paint pill = new Paint(Paint.ANTI_ALIAS_FLAG);
                pill.setColor(0x4A07111D);
                canvas.drawRoundRect(new RectF(leftX, pillY - pillH, leftX + pillW, pillY), pillH / 2f, pillH / 2f, pill);
                canvas.drawRoundRect(new RectF(rightX, pillY - pillH, rightX + pillW, pillY), pillH / 2f, pillH / 2f, pill);
                pill.setStyle(Paint.Style.STROKE);
                pill.setStrokeWidth(Math.max(0.7f, h * 0.006f));
                pill.setColor(0x8CE4B866);
                canvas.drawRoundRect(new RectF(leftX, pillY - pillH, leftX + pillW, pillY), pillH / 2f, pillH / 2f, pill);
                canvas.drawRoundRect(new RectF(rightX, pillY - pillH, rightX + pillW, pillY), pillH / 2f, pillH / 2f, pill);
                pill.setStyle(Paint.Style.FILL);
                Paint metric = new Paint(Paint.ANTI_ALIAS_FLAG);
                metric.setTypeface(display(context));
                metric.setColor(dim ? 0xFFB4C2CF : 0xFFFFD88A);
                metric.setTextSize(Math.max(8f, Math.min(14f, pillH * 0.48f)));
                String first = unread + "  " + unreadLabel;
                String second = missed + "  " + missedLabel;
                canvas.drawText(first, leftX + pillH * 0.28f, pillY - pillH * 0.32f, metric);
                canvas.drawText(second, rightX + pillH * 0.28f, pillY - pillH * 0.32f, metric);
            }
        }

        if (wide) {
            text.setTextSize(Math.max(6f, Math.min(10f, labelSize)));
            text.setColor(0xFFFFD78A);
            float actionY = h - pad - labelSize * 0.15f;
            canvas.drawText("MENSAJES  ›", w * 0.48f, actionY, text);
            canvas.drawText("LLAMADAS  ›", w * 0.70f, actionY, text);
        }
        return bitmap;
    }
}
