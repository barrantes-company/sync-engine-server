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
 * Three distinct home-screen widget faces rendered to a RemoteViews-compatible bitmap.
 * No continuous animation loop: the launcher owns RemoteViews and may throttle updates.
 * Accent highlights vary only on permitted clock/data refreshes.
 */
final class WidgetRenderer {
    private static final int MAX_WIDTH_PX = 600;
    private static final int MAX_HEIGHT_PX = 480;
    private static final int WHITE = 0xFFF5F8FF;
    private static final int SOFT = 0xFFB8C7DE;
    private static final int CYAN = 0xFF08DDE8;
    private static final int BLUE = 0xFF1688FF;
    private static final int MUTED = 0xFF63718B;
    private static final Locale ES = new Locale("es", "PE");
    private static Typeface face;

    private WidgetRenderer() {}

    static int[] size(Context context, int widthDp, int heightDp) {
        float density = context.getResources().getDisplayMetrics().density;
        float width = Math.max(110, widthDp) * density;
        float height = Math.max(60, heightDp) * density;
        float scale = Math.min(1f, Math.min(MAX_WIDTH_PX / width, MAX_HEIGHT_PX / height));
        return new int[]{Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))};
    }

    static Bitmap render(Context context, int style, int width, int height, String zoneId,
                         boolean use24h, boolean signedIn, int unread, int missed,
                         long lastSync, String receivedFile, String clipboardState) {
        int w = Math.max(1, width), h = Math.max(1, height);
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bitmap);
        c.drawColor(Color.BLACK);
        TimeZone zone = TimeZone.getTimeZone(zoneId == null || zoneId.isEmpty()
                ? AppSettings.DEFAULT_TIME_ZONE : zoneId);
        Date now = new Date();
        String time = format(now, zone, use24h ? "HH:mm" : "h:mm", Locale.US);
        String date = format(now, zone, "EEE, d MMM", ES);
        String fullDate = format(now, zone, "EEEE, d 'de' MMMM", ES);
        // One discrete accent phase per minute; this is NOT a continuous animation.
        float phase = (System.currentTimeMillis() / 60000L % 12L) / 12f;
        if (style == 2) ring(c, context, w, h, time, date, signedIn, unread, missed, phase);
        else if (style == 1) bar(c, context, w, h, time, date, signedIn, unread, missed, lastSync, phase);
        else city(c, context, w, h, time, fullDate, signedIn, unread, missed, phase);
        return bitmap;
    }

    private static void panel(Canvas c, float w, float h, float radius, int top, int bottom) {
        Paint p = paint(top);
        p.setShader(new LinearGradient(0, 0, w, h, top, bottom, Shader.TileMode.CLAMP));
        c.drawRoundRect(new RectF(1, 1, w - 1, h - 1), radius, radius, p);
        p.setShader(null);
        p.setColor(0x554D7AB7);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1f, Math.min(w, h) * 0.005f));
        c.drawRoundRect(new RectF(2, 2, w - 2, h - 2), radius, radius, p);
    }

    private static void glow(Canvas c, float x, float y, float radius, int color, int alpha) {
        Paint p = paint(color);
        p.setShader(new RadialGradient(x, y, Math.max(1, radius),
                new int[]{withAlpha(color, alpha), withAlpha(color, alpha / 3), 0x00000000},
                new float[]{0f, 0.38f, 1f}, Shader.TileMode.CLAMP));
        c.drawCircle(x, y, radius, p);
    }

    private static void ring(Canvas c, Context context, int w, int h, String time, String date,
                             boolean signedIn, int unread, int missed, float phase) {
        float u = Math.min(w, h), cx = w * 0.5f, cy = h * 0.46f;
        float radius = u * 0.36f;
        panel(c, w, h, u * 0.11f, 0xFF07172B, 0xFF050916);
        glow(c, cx, cy, radius * 1.4f, BLUE, 34);
        Paint p = paint(0xFF1C2940);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(u * 0.037f);
        c.drawCircle(cx, cy, radius, p);
        RectF arc = new RectF(cx - radius, cy - radius, cx + radius, cy + radius);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setShader(new LinearGradient(cx - radius, cy - radius, cx + radius, cy + radius,
                BLUE, CYAN, Shader.TileMode.CLAMP));
        c.drawArc(arc, 130, 276, false, p);
        p.setShader(null);
        float theta = (float) Math.toRadians(130 + 276 * phase);
        float dotX = cx + radius * (float) Math.cos(theta);
        float dotY = cy + radius * (float) Math.sin(theta);
        glow(c, dotX, dotY, u * 0.11f, CYAN, 150);
        p.setStyle(Paint.Style.FILL);
        p.setColor(WHITE);
        c.drawCircle(dotX, dotY, u * 0.014f, p);
        draw(c, context, "S∞", cx, h * 0.18f, u * 0.065f, CYAN, Paint.Align.CENTER, u * 0.3f, true);
        draw(c, context, time, cx, cy + u * 0.04f, u * 0.20f, WHITE, Paint.Align.CENTER, u * 0.59f, true);
        draw(c, context, date, cx, cy + u * 0.14f, u * 0.054f, SOFT, Paint.Align.CENTER, u * 0.58f, false);
        draw(c, context, signedIn ? "● SESIÓN ACTIVA" : "○ SIN SESIÓN", cx, h * 0.84f,
                u * 0.048f, signedIn ? CYAN : SOFT, Paint.Align.CENTER, w * 0.78f, false);
        draw(c, context, signedIn ? "Mensajes " + unread + "   ·   Llamadas " + missed
                : "Abre Sync ENGINE", cx, h * 0.92f, u * 0.040f, SOFT,
                Paint.Align.CENTER, w * 0.82f, false);
    }

    private static void bar(Canvas c, Context context, int w, int h, String time, String date,
                            boolean signedIn, int unread, int missed, long lastSync, float phase) {
        float u = Math.min(w, h);
        panel(c, w, h, u * 0.18f, 0xFF14223D, 0xFF090B1C);
        glow(c, w * 0.25f, h * 0.72f, w * 0.55f, 0xFFBC29D8, 105);
        glow(c, w * 0.82f, h * 0.50f, w * 0.46f, 0xFFFF8428, 100);
        for (int i = 0; i < 4; i++) {
            Paint p = paint(i % 2 == 0 ? 0x556F3FFF : 0x6651E4FF);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(Math.max(1f, h * 0.012f));
            Path wave = new Path();
            wave.moveTo(0, h * (0.67f + i * 0.055f));
            wave.cubicTo(w * 0.3f, h * (0.37f + i * 0.06f), w * 0.64f,
                    h * (1.02f - i * 0.025f), w, h * (0.52f + i * 0.065f));
            c.drawPath(wave, p);
        }
        float left = w * 0.07f;
        draw(c, context, "S∞  SYNC ENGINE", left, h * 0.23f, h * 0.11f,
                SOFT, Paint.Align.LEFT, w * 0.57f, false);
        draw(c, context, time, left, h * 0.57f, h * 0.32f, WHITE,
                Paint.Align.LEFT, w * 0.59f, true);
        draw(c, context, date, left, h * 0.73f, h * 0.105f,
                SOFT, Paint.Align.LEFT, w * 0.50f, false);
        float cx = w * 0.82f, cy = h * 0.45f, r = h * 0.23f;
        Paint p = paint(0xFF24344E);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(h * 0.055f);
        c.drawCircle(cx, cy, r, p);
        p.setColor(signedIn ? CYAN : MUTED);
        p.setStrokeCap(Paint.Cap.ROUND);
        c.drawArc(new RectF(cx-r, cy-r, cx+r, cy+r), -90, signedIn ? 270 : 70, false, p);
        draw(c, context, signedIn ? "✓" : "—", cx, cy + h * 0.065f, h * 0.20f,
                WHITE, Paint.Align.CENTER, r * 1.3f, true);
        String status = !signedIn ? "Sin sesión" : lastSync == 0 ? "Sin sincronizar"
                : "Última sincronización disponible";
        draw(c, context, status, cx, h * 0.78f, h * 0.077f, SOFT,
                Paint.Align.CENTER, w * 0.30f, false);
        draw(c, context, signedIn ? "Mensajes " + unread + "   ·   Llamadas " + missed
                : "Abre para conectar", left, h * 0.91f, h * 0.075f, WHITE,
                Paint.Align.LEFT, w * 0.63f, false);
        glow(c, w * (0.2f + phase * 0.5f), h * 0.94f, h * 0.18f, CYAN, 70);
    }

    private static void city(Canvas c, Context context, int w, int h, String time,
                             String date, boolean signedIn, int unread, int missed, float phase) {
        float u = Math.min(w, h);
        panel(c, w, h, u * 0.13f, 0xFF0A2649, 0xFF120C29);
        glow(c, w * 0.50f, h * 0.74f, w * 0.63f, 0xFF236AFF, 90);
        glow(c, w * 0.8f, h * 0.75f, w * 0.33f, 0xFFFF8B43, 62);
        float ground = h * 0.78f;
        Paint p = paint(0xFF0C1528);
        for (int i = 0; i < 44; i++) {
            float x = i * w / 43f;
            float height = h * (0.035f + ((i * 17 + 7) % 13) / 170f);
            c.drawRect(x, ground - height, x + w / 50f, ground, p);
            if (i % 4 == 0) {
                Paint light = paint(0xCCFFC76E);
                c.drawRect(x + w / 130f, ground - height * 0.7f,
                        x + w / 105f, ground - height * 0.56f, light);
            }
        }
        p.setColor(0xFF5E7CB5);
        p.setStrokeWidth(Math.max(1f, h * 0.006f));
        c.drawLine(w * 0.06f, ground, w * 0.94f, ground, p);
        draw(c, context, "S∞  SYNC ENGINE", w * 0.06f, h * 0.17f,
                h * 0.11f, CYAN, Paint.Align.LEFT, w * 0.67f, false);
        draw(c, context, time, w * 0.06f, h * 0.43f, h * 0.30f,
                WHITE, Paint.Align.LEFT, w * 0.88f, true);
        draw(c, context, date, w * 0.06f, h * 0.58f, h * 0.095f,
                SOFT, Paint.Align.LEFT, w * 0.85f, false);
        draw(c, context, signedIn ? "● Sesión activa" : "○ Sin sesión",
                w * 0.94f, h * 0.17f, h * 0.087f,
                signedIn ? CYAN : SOFT, Paint.Align.RIGHT, w * 0.35f, false);
        draw(c, context, signedIn ? "Mensajes " + unread + "   ·   Llamadas " + missed
                : "Toca para iniciar sesión", w * 0.5f, h * 0.91f, h * 0.088f,
                WHITE, Paint.Align.CENTER, w * 0.85f, false);
        glow(c, w * (0.22f + 0.55f * phase), ground, h * 0.09f, CYAN, 85);
    }

    private static String format(Date d, TimeZone zone, String pattern, Locale locale) {
        SimpleDateFormat f = new SimpleDateFormat(pattern, locale);
        f.setTimeZone(zone);
        return f.format(d);
    }

    private static Paint paint(int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        p.setSubpixelText(true);
        return p;
    }

    private static int withAlpha(int color, int alpha) {
        return (color & 0x00FFFFFF) | (Math.max(0, Math.min(255, alpha)) << 24);
    }

    private static void draw(Canvas c, Context context, String value, float x, float baseline,
                             float size, int color, Paint.Align align, float maxWidth, boolean bold) {
        Paint p = paint(color);
        p.setTextAlign(align);
        if (face == null) {
            try {
                face = Typeface.createFromAsset(context.getAssets(), "fonts/Manrope-ExtraBold.ttf");
            } catch (RuntimeException ignored) {
                face = Typeface.create("sans-serif", Typeface.BOLD);
            }
        }
        p.setTypeface(bold ? face : Typeface.create("sans-serif", Typeface.NORMAL));
        p.setTextSize(size);
        float measured = p.measureText(value);
        if (measured > maxWidth && maxWidth > 0) p.setTextSize(size * maxWidth / measured);
        c.drawText(value, x, baseline, p);
    }
}
