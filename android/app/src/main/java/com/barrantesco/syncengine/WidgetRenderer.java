package com.barrantesco.syncengine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Dibuja el widget como bitmap. Hora primaria, mark S∞ solo como luz de estado,
 * negro puro, sin wordmarks. Estelas desactivadas por defecto (bajo consumo).
 */
final class WidgetRenderer {
    private static final int MAX_WIDTH_PX = 480;
    private static final int MAX_HEIGHT_PX = 240;
    private static final float CORNER_DP = 20f;

    private static Typeface display;

    private WidgetRenderer() {}

    static int[] size(Context context, int widthDp, int heightDp) {
        float density = context.getResources().getDisplayMetrics().density;
        float w = Math.max(widthDp, 110) * density;
        float h = Math.max(heightDp, 60) * density;
        float scale = Math.min(1f, Math.min(MAX_WIDTH_PX / w, MAX_HEIGHT_PX / h));
        return new int[]{Math.round(w * scale), Math.round(h * scale), Math.round(density * scale * 100)};
    }

    private static Typeface display(Context context) {
        if (display == null) {
            try {
                display = Typeface.createFromAsset(context.getAssets(), "fonts/Manrope-ExtraBold.ttf");
            } catch (RuntimeException ignored) {
                display = Typeface.create("sans-serif-medium", Typeface.BOLD);
            }
        }
        return display;
    }

    /**
     * Render principal. status: [onlineFlag, fileReceived, clipboardState] o null.
     * onlineFlag no vacío = conectado.
     */
    static Bitmap render(Context context, int w, int h, String zone, boolean use24h,
                         String[] status) {
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.BLACK);

        float pad = Math.max(8f, w * 0.04f);
        float radius = Math.max(6f, h * 0.1f);
        RectF bounds = new RectF(pad * 0.4f, pad * 0.4f, w - pad * 0.4f, h - pad * 0.4f);

        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(Math.max(0.8f, h * 0.006f));
        border.setColor(0xFF2A2A2A);
        canvas.drawRoundRect(bounds, radius, radius, border);

        Date now = new Date();
        TimeZone tz = TimeZone.getTimeZone(zone);
        Locale es = new Locale("es");

        SimpleDateFormat clockFmt = new SimpleDateFormat(use24h ? "HH:mm" : "h:mm", Locale.US);
        clockFmt.setTimeZone(tz);
        String clock = clockFmt.format(now);

        SimpleDateFormat dateFmt = new SimpleDateFormat("EEE d MMM", es);
        dateFmt.setTimeZone(tz);
        String date = dateFmt.format(now).replace(".", "").toLowerCase(es);

        boolean wide = w >= h * 1.5f;
        boolean compact = h < 140f;

        Paint strong = new Paint(Paint.ANTI_ALIAS_FLAG);
        strong.setTypeface(display(context));
        strong.setAntiAlias(true);

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        text.setAntiAlias(true);

        // Mark S∞ pequeño como luz de estado (nunca hero)
        boolean online = status != null && status.length > 0 && status[0] != null && !status[0].isEmpty();
        float markSize = Math.max(6f, Math.min(10f, h * 0.075f));
        float markX = pad;
        float markY = pad + markSize;
        Paint markDot = new Paint(Paint.ANTI_ALIAS_FLAG);
        markDot.setColor(online ? 0xFF35D6A2 : 0xFF5A5A5A);
        canvas.drawCircle(markX + markSize * 0.35f, markY - markSize * 0.35f, markSize * 0.2f, markDot);
        strong.setColor(0xFFE0E0E0);
        strong.setTextSize(markSize);
        canvas.drawText("S∞", markX + markSize * 0.65f, markY, strong);

        // Hora como hero
        float clockSize = h * (compact ? 0.5f : (wide ? 0.46f : 0.44f));
        Paint clockPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        clockPaint.setTypeface(display(context));
        clockPaint.setColor(Color.WHITE);
        clockPaint.setTextSize(clockSize);
        float maxClockW = wide ? w * 0.58f : w * 0.85f;
        float measured = clockPaint.measureText(clock);
        if (measured > maxClockW) {
            clockPaint.setTextSize(clockSize * maxClockW / measured);
        }
        float clockBaseline = h * (compact ? 0.58f : 0.55f);
        if (wide) {
            float clockX = w - pad - clockPaint.measureText(clock);
            canvas.drawText(clock, clockX, clockBaseline, clockPaint);
            text.setTextSize(Math.max(8f, h * 0.07f));
            text.setColor(0xFFB0B0B0);
            float dateW = text.measureText(date);
            canvas.drawText(date, w - pad - dateW, Math.min(h - pad, clockBaseline + text.getTextSize() * 1.25f), text);
        } else {
            float clockX = (w - clockPaint.measureText(clock)) / 2f;
            canvas.drawText(clock, clockX, clockBaseline, clockPaint);
            text.setTextSize(Math.max(8f, h * 0.07f));
            text.setColor(0xFFB0B0B0);
            canvas.drawText(date, (w - text.measureText(date)) / 2f, h * 0.68f, text);
        }

        // Datos secundarios: archivo recibido y portapapeles (si existen)
        if (status != null && status.length >= 3) {
            String file = status[1] != null ? status[1] : "";
            String clip = status[2] != null ? status[2] : "";
            if (!file.isEmpty() || !clip.isEmpty()) {
                text.setTextSize(Math.max(7f, h * 0.06f));
                text.setColor(0xFFC0C0C0);
                String line = "";
                if (!file.isEmpty()) line += "📎 " + file;
                if (!clip.isEmpty()) {
                    if (!line.isEmpty()) line += "  ·  ";
                    line += "📋 " + clip;
                }
                float y = wide ? h * 0.88f : h * 0.84f;
                canvas.drawText(line, pad, y, text);
            }
        }

        return bitmap;
    }
}
