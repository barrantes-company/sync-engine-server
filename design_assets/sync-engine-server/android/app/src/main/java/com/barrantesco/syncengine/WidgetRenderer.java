package com.barrantesco.syncengine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Dibuja Hero Clock en un solo bitmap. RemoteViews no admite fuentes propias,
 * degradados ni sombras complejas, por lo que toda la superficie se pinta con Canvas.
 */
final class WidgetRenderer {
    // Mantiene el bitmap enviado por RemoteViews por debajo del límite de Binder.
    private static final int MAX_WIDTH_PX = 480;
    private static final int MAX_HEIGHT_PX = 240;
    private static final float CORNER_DP = 28f;
    private static final int AMBER = 0xFFFFB300;
    private static final int WARM_WHITE = 0xFFF6F4EF;
    private static final Locale SPANISH = new Locale("es", "ES");

    private static Typeface display;

    private WidgetRenderer() {
    }

    /** Dimensiones en píxeles del bitmap según el tamaño del widget en dp. */
    static int[] size(Context context, int widthDp, int heightDp) {
        float density = context.getResources().getDisplayMetrics().density;
        float w = Math.max(widthDp, 250) * density;
        float h = Math.max(heightDp, 120) * density;
        float scale = Math.min(1f, Math.min(MAX_WIDTH_PX / w, MAX_HEIGHT_PX / h));
        return new int[] {Math.round(w * scale), Math.round(h * scale), Math.round(density * scale * 100)};
    }

    private static Typeface display(Context context) {
        if (display == null) {
            try {
                display = Typeface.createFromAsset(context.getAssets(), "fonts/Manrope-ExtraBold.ttf");
            } catch (RuntimeException exception) {
                display = Typeface.create("sans-serif", Typeface.BOLD);
            }
        }
        return display;
    }

    static Bitmap render(Context context, int w, int h, float unit, String zone, boolean use24h,
                         boolean showCounters, boolean signedIn, int unread, int missed) {
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        float radius = Math.min(CORNER_DP * unit, h * 0.24f);
        RectF panel = new RectF(3f * unit, 3f * unit, w - 3f * unit, h - 3f * unit);

        Path clip = new Path();
        clip.addRoundRect(panel, radius, radius, Path.Direction.CW);
        canvas.save();
        canvas.clipPath(clip);
        drawSurface(canvas, panel, w, h);
        canvas.restore();
        drawBorder(canvas, panel, radius, unit);

        float pad = Math.max(18f * unit, h * 0.105f);
        float top = Math.max(18f * unit, h * 0.13f);
        float rightColumn = w * 0.72f;
        float dividerX = rightColumn - pad * 0.72f;
        drawHeader(canvas, context, pad, top, w - pad - 30f * unit, h);
        drawClock(canvas, context, zone, use24h, pad, dividerX - pad, h);
        drawDivider(canvas, dividerX, h);

        if (showCounters) {
            if (signedIn) {
                drawMetric(canvas, context, rightColumn, h * 0.43f, unread, "mensajes", true, h);
                drawMetric(canvas, context, rightColumn, h * 0.67f, missed, "perdidas", false, h);
                drawSync(canvas, rightColumn, h * 0.86f, h);
            } else {
                drawSignIn(canvas, context, rightColumn, h * 0.54f, w - pad, h);
            }
        } else {
            drawSync(canvas, rightColumn, h * 0.62f, h);
        }
        return bitmap;
    }

    private static void drawSurface(Canvas canvas, RectF panel, int w, int h) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new LinearGradient(
                panel.left, panel.top, panel.right, panel.bottom,
                new int[] {0xFF20201E, 0xFF10100F, 0xFF050505},
                new float[] {0f, 0.48f, 1f}, Shader.TileMode.CLAMP));
        canvas.drawRect(panel, paint);

        paint.setShader(new RadialGradient(
                w * 0.9f, h * 0.92f, w * 0.48f,
                new int[] {0x2EFFB300, 0x0AFFB300, 0x00FFB300},
                new float[] {0f, 0.42f, 1f}, Shader.TileMode.CLAMP));
        canvas.drawRect(panel, paint);

        paint.setShader(new LinearGradient(
                panel.left, panel.top, panel.right, panel.top,
                new int[] {0x24FFFFFF, 0x08FFFFFF, 0x00FFFFFF},
                null, Shader.TileMode.CLAMP));
        canvas.drawRect(panel.left, panel.top, panel.right, h * 0.38f, paint);
    }

    private static void drawBorder(Canvas canvas, RectF panel, float radius, float unit) {
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);

        border.setColor(0x28FFB300);
        border.setStrokeWidth(7f * unit);
        canvas.drawRoundRect(panel, radius, radius, border);

        border.setColor(0xA6FFB300);
        border.setStrokeWidth(1.6f * unit);
        canvas.drawRoundRect(panel, radius, radius, border);

        RectF inner = new RectF(panel.left + 3f * unit, panel.top + 3f * unit,
                panel.right - 3f * unit, panel.bottom - 3f * unit);
        border.setColor(0x45FFFFFF);
        border.setStrokeWidth(unit);
        canvas.drawRoundRect(inner, radius - 2f * unit, radius - 2f * unit, border);
    }

    private static void drawHeader(Canvas canvas, Context context, float x, float y,
                                   float right, int h) {
        Paint label = textPaint(context, h * 0.038f, 0xFF85827B);
        label.setLetterSpacing(0.2f);
        canvas.drawText("SYNC", x, y, label);
        float engineX = x + label.measureText("SYNC ");
        label.setColor(AMBER);
        canvas.drawText("ENGINE", engineX, y, label);

        Paint status = textPaint(context, h * 0.036f, 0xFFB3B0A8);
        status.setTextAlign(Paint.Align.RIGHT);
        status.setLetterSpacing(0.1f);
        canvas.drawText("ONLINE · SYNC", right, y, status);

        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(0x33FFB300);
        canvas.drawCircle(right - status.measureText("ONLINE · SYNC") - h * 0.045f,
                y - h * 0.014f, h * 0.034f, dot);
        dot.setColor(AMBER);
        canvas.drawCircle(right - status.measureText("ONLINE · SYNC") - h * 0.045f,
                y - h * 0.014f, h * 0.015f, dot);
    }

    private static void drawClock(Canvas canvas, Context context, String zone, boolean use24h,
                                  float x, float maxWidth, int h) {
        TimeZone timeZone = TimeZone.getTimeZone(zone);
        Date now = new Date();
        SimpleDateFormat clockFormat = new SimpleDateFormat(use24h ? "HH:mm" : "h:mm", Locale.US);
        clockFormat.setTimeZone(timeZone);
        String clock = clockFormat.format(now);

        Paint clockPaint = textPaint(context, h * 0.47f, WARM_WHITE);
        clockPaint.setLetterSpacing(-0.065f);
        fitText(clockPaint, clock, maxWidth - x);
        Paint.FontMetrics metrics = clockPaint.getFontMetrics();
        float clockBaseline = h * 0.57f - (metrics.ascent + metrics.descent) * 0.08f;
        canvas.drawText(clock, x, clockBaseline, clockPaint);

        SimpleDateFormat dateFormat = new SimpleDateFormat("EEEE, d 'de' MMMM", SPANISH);
        dateFormat.setTimeZone(timeZone);
        String date = capitalize(dateFormat.format(now).replace(".", ""));
        Paint datePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        datePaint.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        datePaint.setTextSize(h * 0.073f);
        datePaint.setColor(0xFFAAA79F);
        fitText(datePaint, date, maxWidth - x);
        canvas.drawText(date, x, h * 0.83f, datePaint);
    }

    private static void drawDivider(Canvas canvas, float x, int h) {
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setColor(0x2EFFFFFF);
        line.setStrokeWidth(Math.max(1f, h * 0.004f));
        canvas.drawLine(x, h * 0.27f, x, h * 0.83f, line);
    }

    private static void drawMetric(Canvas canvas, Context context, float x, float centerY,
                                   int value, String label, boolean message, int h) {
        float iconSize = h * 0.16f;
        float radius = iconSize * 0.34f;
        RectF icon = new RectF(x, centerY - iconSize / 2f, x + iconSize, centerY + iconSize / 2f);
        Paint tile = new Paint(Paint.ANTI_ALIAS_FLAG);
        tile.setColor(0x13FFFFFF);
        canvas.drawRoundRect(icon, radius, radius, tile);
        tile.setStyle(Paint.Style.STROKE);
        tile.setStrokeWidth(Math.max(1f, h * 0.004f));
        tile.setColor(0x24FFFFFF);
        canvas.drawRoundRect(icon, radius, radius, tile);

        Paint glyph = new Paint(Paint.ANTI_ALIAS_FLAG);
        glyph.setColor(WARM_WHITE);
        glyph.setStyle(Paint.Style.STROKE);
        glyph.setStrokeWidth(h * 0.011f);
        glyph.setStrokeCap(Paint.Cap.ROUND);
        glyph.setStrokeJoin(Paint.Join.ROUND);
        if (message) {
            drawMessageIcon(canvas, icon, glyph);
        } else {
            drawPhoneIcon(canvas, icon, glyph);
        }

        float textX = icon.right + h * 0.045f;
        Paint number = textPaint(context, h * 0.09f, WARM_WHITE);
        canvas.drawText(String.valueOf(value), textX, centerY - h * 0.005f, number);
        Paint caption = new Paint(Paint.ANTI_ALIAS_FLAG);
        caption.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        caption.setTextSize(h * 0.036f);
        caption.setColor(0xFF77746E);
        canvas.drawText(label, textX, centerY + h * 0.05f, caption);
    }

    private static void drawMessageIcon(Canvas canvas, RectF box, Paint paint) {
        float inset = box.width() * 0.27f;
        RectF bubble = new RectF(box.left + inset, box.top + inset,
                box.right - inset, box.bottom - inset * 1.08f);
        canvas.drawRoundRect(bubble, box.width() * 0.09f, box.width() * 0.09f, paint);
        Path tail = new Path();
        tail.moveTo(bubble.left + bubble.width() * 0.25f, bubble.bottom);
        tail.lineTo(bubble.left + bubble.width() * 0.17f, bubble.bottom + box.height() * 0.13f);
        tail.lineTo(bubble.left + bubble.width() * 0.48f, bubble.bottom);
        canvas.drawPath(tail, paint);
        canvas.drawLine(bubble.left + bubble.width() * 0.25f, bubble.centerY(),
                bubble.right - bubble.width() * 0.25f, bubble.centerY(), paint);
    }

    private static void drawPhoneIcon(Canvas canvas, RectF box, Paint paint) {
        Path phone = new Path();
        phone.moveTo(box.left + box.width() * 0.34f, box.top + box.height() * 0.27f);
        phone.cubicTo(box.left + box.width() * 0.24f, box.top + box.height() * 0.43f,
                box.left + box.width() * 0.48f, box.top + box.height() * 0.76f,
                box.left + box.width() * 0.68f, box.top + box.height() * 0.69f);
        phone.lineTo(box.left + box.width() * 0.61f, box.top + box.height() * 0.55f);
        phone.cubicTo(box.left + box.width() * 0.55f, box.top + box.height() * 0.57f,
                box.left + box.width() * 0.43f, box.top + box.height() * 0.43f,
                box.left + box.width() * 0.45f, box.top + box.height() * 0.37f);
        phone.close();
        canvas.drawPath(phone, paint);
    }

    private static void drawSync(Canvas canvas, float x, float y, int h) {
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(AMBER);
        canvas.drawCircle(x + h * 0.018f, y - h * 0.012f, h * 0.014f, dot);
        Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
        label.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        label.setColor(AMBER);
        label.setTextSize(h * 0.037f);
        label.setLetterSpacing(0.09f);
        canvas.drawText("SYNC 100%", x + h * 0.055f, y, label);
    }

    private static void drawSignIn(Canvas canvas, Context context, float x, float y,
                                   float right, int h) {
        Paint title = textPaint(context, h * 0.06f, WARM_WHITE);
        canvas.drawText("SIN CONEXIÓN", x, y, title);
        Paint detail = new Paint(Paint.ANTI_ALIAS_FLAG);
        detail.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        detail.setColor(0xFF85827B);
        detail.setTextSize(h * 0.038f);
        String message = context.getString(R.string.widget_sign_in);
        fitText(detail, message, right - x);
        canvas.drawText(message, x, y + h * 0.08f, detail);
    }

    private static Paint textPaint(Context context, float size, int color) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTypeface(display(context));
        paint.setTextSize(size);
        paint.setColor(color);
        return paint;
    }

    private static void fitText(Paint paint, String text, float maxWidth) {
        float measured = paint.measureText(text);
        if (measured > maxWidth && measured > 0) {
            paint.setTextSize(paint.getTextSize() * maxWidth / measured);
        }
    }

    private static String capitalize(String value) {
        if (value.isEmpty()) {
            return value;
        }
        return value.substring(0, 1).toUpperCase(SPANISH) + value.substring(1);
    }
}
