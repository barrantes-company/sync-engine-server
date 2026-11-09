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

/** Renderiza el widget OLED con la hora como elemento visual principal. */
final class WidgetRenderer {
    private static final int MAX_WIDTH_PX = 480;
    private static final int MAX_HEIGHT_PX = 320;
    private static final int BACKGROUND = Color.BLACK;
    private static final int PRIMARY = 0xFFE7E7E7;
    private static final int SECONDARY = 0xFF969696;
    private static final int MUTED = 0xFF686868;
    private static final int ACCENT = 0xFF54BFA5;
    private static final int BORDER = 0xFF242424;
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

    /** Dibuja hora, fecha y estados breves desde la caché local, sin acceso de red. */
    static Bitmap render(Context context, int width, int height, String zoneId, boolean use24h,
                         boolean signedIn, String receivedFile, String clipboardState) {
        int w = Math.max(1, width);
        int h = Math.max(1, height);
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(BACKGROUND);

        float density = context.getResources().getDisplayMetrics().density;
        float pad = Math.max(8f * density, Math.min(w, h) * 0.065f);
        float radius = Math.max(8f * density, Math.min(w, h) * 0.09f);
        RectF frame = new RectF(1f, 1f, w - 1f, h - 1f);
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(Math.max(1f, density));
        border.setColor(BORDER);
        canvas.drawRoundRect(frame, radius, radius, border);

        TimeZone zone = TimeZone.getTimeZone(
                zoneId == null || zoneId.trim().isEmpty() ? AppSettings.DEFAULT_TIME_ZONE : zoneId);
        Date now = new Date();
        SimpleDateFormat clockFormat = new SimpleDateFormat(use24h ? "HH:mm" : "h:mm", Locale.US);
        clockFormat.setTimeZone(zone);
        String clock = clockFormat.format(now);
        SimpleDateFormat dateFormat = new SimpleDateFormat("EEEE, d 'de' MMMM", SPANISH);
        dateFormat.setTimeZone(zone);
        String date = capitalize(dateFormat.format(now).replace('.', ' '));

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setSubpixelText(true);
        text.setTypeface(display(context));
        text.setColor(SECONDARY);
        text.setTextSize(Math.max(7f * density, Math.min(10f * density, h * 0.065f)));

        // El identificador se limita a una luz de estado; no se dibuja un wordmark.
        float markSize = Math.max(7f * density, Math.min(10f * density, h * 0.075f));
        Paint mark = new Paint(Paint.ANTI_ALIAS_FLAG);
        mark.setColor(signedIn ? ACCENT : MUTED);
        canvas.drawCircle(pad + markSize * 0.35f, pad + markSize * 0.35f,
                markSize * 0.22f, mark);
        text.setColor(SECONDARY);
        text.setTextSize(markSize);
        canvas.drawText("S∞", pad + markSize * 0.8f, pad + markSize, text);

        Paint clockPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        clockPaint.setAntiAlias(true);
        clockPaint.setTypeface(display(context));
        clockPaint.setColor(PRIMARY);
        clockPaint.setTextSize(h * 0.39f);
        fitText(clockPaint, clock, w - pad * 2f);
        clockPaint.setTextAlign(Paint.Align.CENTER);
        float clockBaseline = h * 0.53f - (clockPaint.ascent() + clockPaint.descent()) * 0.5f;
        canvas.drawText(clock, w * 0.5f, clockBaseline, clockPaint);

        text.setTextAlign(Paint.Align.CENTER);
        text.setTextSize(Math.max(9f * density, Math.min(13f * density, h * 0.085f)));
        text.setColor(SECONDARY);
        fitText(text, date, w - pad * 2f);
        canvas.drawText(date, w * 0.5f, h * 0.67f, text);

        text.setTextAlign(Paint.Align.LEFT);
        text.setTextSize(Math.max(7f * density, Math.min(10f * density, h * 0.065f)));
        text.setColor(signedIn ? SECONDARY : MUTED);
        String laptop = signedIn ? "Laptop · sin señal" : "Inicia sesión para sincronizar";
        drawFitted(canvas, text, laptop, pad, h * 0.80f, w - pad * 2f);

        String file = clean(receivedFile);
        String clipboard = clean(clipboardState);
        String detail;
        if (!file.isEmpty()) {
            detail = "Archivo · " + file;
        } else {
            detail = "Archivo · sin recientes";
        }
        if (!clipboard.isEmpty()) detail += "   ·   Portapapeles actualizado";
        else detail += "   ·   Portapapeles vacío";
        text.setColor(MUTED);
        drawFitted(canvas, text, detail, pad, h - pad * 0.75f, w - pad * 2f);
        return bitmap;
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

    private static void drawFitted(Canvas canvas, Paint paint, String value, float x, float y,
                                   float maxWidth) {
        fitText(paint, value, maxWidth);
        canvas.drawText(value, x, y, paint);
    }

    private static void fitText(Paint paint, String value, float maxWidth) {
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
