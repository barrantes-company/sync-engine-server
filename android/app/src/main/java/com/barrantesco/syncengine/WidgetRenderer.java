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

/** Renderiza las ocho composiciones aprobadas con hora y contadores del estado local. */
final class WidgetRenderer {
    private static final int MAX_WIDTH_PX = 480;
    private static final int MAX_HEIGHT_PX = 480;
    private static final int MAX_PIXELS = 160_000;
    private static Typeface display;

    private WidgetRenderer() {
    }

    /** Calcula dimensiones seguras para el bitmap enviado a RemoteViews. */
    static int[] size(Context context, int widthDp, int heightDp) {
        float density = context.getResources().getDisplayMetrics().density;
        float width = Math.max(widthDp, 110) * density;
        float height = Math.max(heightDp, 110) * density;
        float scale = Math.min(1f, Math.min(MAX_WIDTH_PX / width, MAX_HEIGHT_PX / height));
        scale = Math.min(scale, (float) Math.sqrt(MAX_PIXELS / (width * height)));
        return new int[] {
                Math.max(1, Math.round(width * scale)),
                Math.max(1, Math.round(height * scale)),
                Math.round(density * scale * 100)
        };
    }

    /** Dibuja una de las ocho referencias sin inventar datos de clima, sincronización o contacto. */
    static Bitmap render(Context context, int width, int height, float unit, String zone,
                         boolean use24h, int style, String userName, int unread, int missed,
                         boolean online) {
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        boolean light = style == AppSettings.WIDGET_STYLE_LIGHT_SQUARE
                || style == AppSettings.WIDGET_STYLE_LIGHT_WIDE;
        float radius = Math.min(width, height) * 0.085f;
        RectF bounds = new RectF(0, 0, width, height);
        Path clip = new Path();
        clip.addRoundRect(bounds, radius, radius, Path.Direction.CW);
        canvas.save();
        canvas.clipPath(clip);
        drawBackground(canvas, bounds, width, height, light);
        drawFrame(canvas, radius, width, height, unit);

        Date now = new Date();
        TimeZone timeZone = TimeZone.getTimeZone(zone);
        SimpleDateFormat clockFormat = new SimpleDateFormat(
                use24h ? "HH:mm" : "h:mm", Locale.US);
        clockFormat.setTimeZone(timeZone);
        SimpleDateFormat dateFormat = new SimpleDateFormat(
                "EEEE, d 'de' MMMM", new Locale("es"));
        dateFormat.setTimeZone(timeZone);
        String date = dateFormat.format(now).replace(".", "").toLowerCase(new Locale("es"));
        String clock = clockFormat.format(now);
        Typeface strong = display(context);
        int safeUnread = Math.max(0, unread);
        int safeMissed = Math.max(0, missed);

        switch (style) {
            case AppSettings.WIDGET_STYLE_LIGHT_SQUARE:
                drawLightSquare(canvas, width, height, unit, strong, clock, date,
                        safeUnread, safeMissed, online);
                break;
            case AppSettings.WIDGET_STYLE_DARK_DIALS:
                drawDarkDials(canvas, width, height, unit, strong, clock, date,
                        safeUnread, safeMissed);
                break;
            case AppSettings.WIDGET_STYLE_OLED:
                drawOled(canvas, width, height, unit, strong, clock, date,
                        safeUnread, safeMissed);
                break;
            case AppSettings.WIDGET_STYLE_SYNC_RING:
                drawSyncRing(canvas, width, height, unit, strong, clock, date,
                        safeUnread, safeMissed, online);
                break;
            case AppSettings.WIDGET_STYLE_LIGHT_WIDE:
                drawLightWide(canvas, width, height, unit, strong, clock, date,
                        safeUnread, safeMissed, online);
                break;
            case AppSettings.WIDGET_STYLE_SLIM_SYNC:
                drawSlimSync(canvas, width, height, unit, strong, clock, date,
                        safeUnread, safeMissed, online);
                break;
            case AppSettings.WIDGET_STYLE_WEATHER:
                drawWeatherClock(canvas, width, height, unit, strong, clock, date,
                        city(zone), safeUnread, safeMissed, online);
                break;
            case AppSettings.WIDGET_STYLE_CONTACT:
                drawContact(canvas, width, height, unit, strong, clock, date,
                        userName, safeUnread, safeMissed);
                break;
            default:
                drawDarkDials(canvas, width, height, unit, strong, clock, date,
                        safeUnread, safeMissed);
                break;
        }
        canvas.restore();
        return bitmap;
    }

    private static String city(String zone) {
        return zone.substring(zone.lastIndexOf('/') + 1).replace('_', ' ');
    }

    private static Typeface display(Context context) {
        if (display == null) {
            try {
                display = Typeface.createFromAsset(
                        context.getAssets(), "fonts/Manrope-ExtraBold.ttf");
            } catch (RuntimeException exception) {
                display = Typeface.create("sans-serif", Typeface.BOLD);
            }
        }
        return display;
    }

    private static void drawBackground(Canvas canvas, RectF bounds, int width, int height,
                                       boolean light) {
        Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
        background.setShader(new LinearGradient(0, 0, width, height,
                light
                        ? new int[] {0xFFFFFFFF, 0xFFF3F1ED, 0xFFFAF9F6}
                        : new int[] {0xFF030405, 0xFF111214, 0xFF030405},
                null, Shader.TileMode.CLAMP));
        canvas.drawRect(bounds, background);
        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        int glowColor = light ? 0x30FFB300 : 0x22FF9E00;
        glow.setShader(new RadialGradient(width * 0.82f, height * 0.98f,
                Math.max(width, height) * 0.62f,
                new int[] {glowColor, 0x00FF9E00}, null, Shader.TileMode.CLAMP));
        canvas.drawRect(bounds, glow);
    }

    private static void drawFrame(Canvas canvas, float radius, int width, int height,
                                  float unit) {
        Paint outer = new Paint(Paint.ANTI_ALIAS_FLAG);
        outer.setStyle(Paint.Style.STROKE);
        outer.setStrokeWidth(Math.max(1f, unit * 1.3f));
        outer.setShader(new LinearGradient(0, 0, width, height,
                new int[] {0xFFFFC14B, 0xFFE7E7E7, 0xFFFFA000, 0xFFF4F1E8},
                null, Shader.TileMode.CLAMP));
        float inset = outer.getStrokeWidth();
        canvas.drawRoundRect(new RectF(inset, inset, width - inset, height - inset),
                radius, radius, outer);

        Paint inner = new Paint(Paint.ANTI_ALIAS_FLAG);
        inner.setStyle(Paint.Style.STROKE);
        inner.setStrokeWidth(Math.max(1f, unit * 0.65f));
        inner.setColor(0x66FFFFFF);
        float innerInset = unit * 4f;
        float innerRadius = Math.max(0, radius - innerInset);
        canvas.drawRoundRect(new RectF(innerInset, innerInset,
                width - innerInset, height - innerInset), innerRadius, innerRadius, inner);
    }

    /** Referencia 01: composición clara cuadrada con reloj, estado y aro Sync. */
    private static void drawLightSquare(Canvas canvas, int width, int height, float unit,
                                        Typeface strong, String clock, String date, int unread,
                                        int missed, boolean online) {
        if ((float) width / height > 1.35f) {
            drawLightWide(canvas, width, height, unit, strong, clock, date,
                    unread, missed, online);
            return;
        }
        String[] time = clock.split(":", 2);
        Paint timePaint = text(0xFF171717, strong, height * 0.235f);
        fit(timePaint, time[0], width * 0.46f);
        canvas.drawText(time[0], width * 0.09f, height * 0.40f, timePaint);
        fit(timePaint, time.length > 1 ? time[1] : "", width * 0.46f);
        canvas.drawText(time.length > 1 ? time[1] : "", width * 0.09f, height * 0.64f, timePaint);
        divider(canvas, width * 0.57f, height * 0.17f, width * 0.57f, height * 0.75f,
                0x556A6255, unit);
        drawOnline(canvas, width * 0.70f, height * 0.21f, width * 0.26f,
                height * 0.105f, online, true, unit);
        drawStatusRing(canvas, width * 0.77f, height * 0.51f,
                Math.min(height * 0.15f, width * 0.16f), online, true, unit);
        divider(canvas, width * 0.06f, height * 0.78f, width * 0.94f, height * 0.78f,
                0x556A6255, unit);
        Paint datePaint = text(0xFF494949, Typeface.create("sans-serif", Typeface.NORMAL),
                height * 0.047f);
        fit(datePaint, date, width * 0.51f);
        canvas.drawText(date, width * 0.065f, height * 0.88f, datePaint);
        drawFooterCounts(canvas, width, height, unit, unread, missed, true);
    }

    /** Referencia 02: reloj OLED ancho con contadores circulares independientes. */
    private static void drawDarkDials(Canvas canvas, int width, int height, float unit,
                                      Typeface strong, String clock, String date, int unread,
                                      int missed) {
        if ((float) width / height < 1.35f) {
            Paint timePaint = text(Color.WHITE, strong, height * 0.22f);
            fit(timePaint, clock, width * 0.82f);
            centered(canvas, clock, width * 0.5f, height * 0.38f, timePaint);
            Paint datePaint = text(0xFFBFC0C2, Typeface.create("sans-serif", 0),
                    height * 0.052f);
            fit(datePaint, date, width * 0.84f);
            centered(canvas, date, width * 0.5f, height * 0.48f, datePaint);
            drawMetric(canvas, width * 0.33f, height * 0.69f,
                    Math.min(height * 0.105f, width * 0.15f), unread, true, false, unit);
            drawMetric(canvas, width * 0.68f, height * 0.69f,
                    Math.min(height * 0.105f, width * 0.15f), missed, false, false, unit);
            return;
        }
        Paint timePaint = text(Color.WHITE, strong, height * 0.48f);
        fit(timePaint, clock, width * 0.57f);
        canvas.drawText(clock, width * 0.075f, height * 0.57f, timePaint);
        Paint datePaint = text(0xFFBEBFC2, Typeface.create("sans-serif", 0), height * 0.14f);
        fit(datePaint, date, width * 0.55f);
        canvas.drawText(date, width * 0.08f, height * 0.82f, datePaint);
        divider(canvas, width * 0.66f, height * 0.18f, width * 0.66f, height * 0.82f,
                0x55FFFFFF, unit);
        float r = Math.min(height * 0.18f, width * 0.058f);
        drawMetric(canvas, width * 0.78f, height * 0.49f, r, unread, true, false, unit);
        drawMetric(canvas, width * 0.91f, height * 0.49f, r, missed, false, false, unit);
    }

    /** Referencia 03: reloj OLED centrado con estelas de luz y contadores inferiores. */
    private static void drawOled(Canvas canvas, int width, int height, float unit,
                                 Typeface strong, String clock, String date, int unread,
                                 int missed) {
        Paint trails = new Paint(Paint.ANTI_ALIAS_FLAG);
        trails.setStyle(Paint.Style.STROKE);
        trails.setStrokeCap(Paint.Cap.ROUND);
        trails.setStrokeWidth(Math.max(unit * 2.2f, height * 0.009f));
        trails.setShader(new LinearGradient(0, height * 0.2f, width, height * 0.85f,
                new int[] {0x00FF9B00, 0xFFFFB31C, 0x66FF6A00, 0x00FFFFFF},
                null, Shader.TileMode.CLAMP));
        Path trail = new Path();
        trail.moveTo(-width * 0.08f, height * 0.65f);
        trail.cubicTo(width * 0.19f, height * 0.05f, width * 0.55f, height * 0.95f,
                width * 1.08f, height * 0.31f);
        canvas.drawPath(trail, trails);
        trails.setStrokeWidth(Math.max(unit, height * 0.004f));
        trails.setColor(0x55FFFFFF);
        Path second = new Path();
        second.moveTo(-width * 0.08f, height * 0.73f);
        second.cubicTo(width * 0.32f, height * 0.15f, width * 0.67f, height * 0.95f,
                width * 1.08f, height * 0.43f);
        canvas.drawPath(second, trails);

        Paint timePaint = text(Color.WHITE, strong, height * 0.34f);
        fit(timePaint, clock, width * 0.85f);
        centered(canvas, clock, width * 0.5f, height * 0.54f, timePaint);
        Paint datePaint = text(0xFFBFC0C2, Typeface.create("sans-serif", 0), height * 0.075f);
        fit(datePaint, date, width * 0.86f);
        centered(canvas, date, width * 0.5f, height * 0.67f, datePaint);
        drawInlineCounts(canvas, width * 0.5f, height * 0.86f,
                Math.min(height * 0.07f, width * 0.07f), unread, missed, false, unit);
    }

    /** Referencia 04: hora dividida, estado de conexión y anillo de sincronización. */
    private static void drawSyncRing(Canvas canvas, int width, int height, float unit,
                                     Typeface strong, String clock, String date, int unread,
                                     int missed, boolean online) {
        if ((float) width / height > 1.35f) {
            Paint timePaint = text(Color.WHITE, strong, height * 0.40f);
            fit(timePaint, clock, width * 0.40f);
            canvas.drawText(clock, width * 0.07f, height * 0.54f, timePaint);
            divider(canvas, width * 0.47f, height * 0.18f, width * 0.47f, height * 0.82f,
                    0x55FFFFFF, unit);
            drawStatusRing(canvas, width * 0.58f, height * 0.50f,
                    Math.min(height * 0.19f, width * 0.07f), online, false, unit);
            drawOnline(canvas, width * 0.80f, height * 0.40f, width * 0.24f,
                    height * 0.26f, online, false, unit);
            drawInlineCounts(canvas, width * 0.80f, height * 0.77f, height * 0.10f,
                    unread, missed, false, unit);
            return;
        }
        String[] time = clock.split(":", 2);
        Paint timePaint = text(Color.WHITE, strong, height * 0.235f);
        fit(timePaint, time[0], width * 0.48f);
        canvas.drawText(time[0], width * 0.085f, height * 0.41f, timePaint);
        fit(timePaint, time.length > 1 ? time[1] : "", width * 0.48f);
        canvas.drawText(time.length > 1 ? time[1] : "", width * 0.085f,
                height * 0.65f, timePaint);
        divider(canvas, width * 0.56f, height * 0.17f, width * 0.56f, height * 0.76f,
                0x55FFFFFF, unit);
        drawOnline(canvas, width * 0.69f, height * 0.22f, width * 0.27f,
                height * 0.10f, online, false, unit);
        drawStatusRing(canvas, width * 0.76f, height * 0.51f,
                Math.min(height * 0.15f, width * 0.16f), online, false, unit);
        divider(canvas, width * 0.06f, height * 0.78f, width * 0.94f, height * 0.78f,
                0x55FFFFFF, unit);
        Paint datePaint = text(0xFFBFC0C2, Typeface.create("sans-serif", 0), height * 0.047f);
        fit(datePaint, date, width * 0.51f);
        canvas.drawText(date, width * 0.065f, height * 0.88f, datePaint);
        drawFooterCounts(canvas, width, height, unit, unread, missed, false);
    }

    /** Referencia 05: composición clara horizontal con hora, contadores y estado. */
    private static void drawLightWide(Canvas canvas, int width, int height, float unit,
                                      Typeface strong, String clock, String date, int unread,
                                      int missed, boolean online) {
        Paint timePaint = text(0xFF171717, strong, height * 0.40f);
        fit(timePaint, clock, width * 0.34f);
        canvas.drawText(clock, width * 0.055f, height * 0.57f, timePaint);
        Paint datePaint = text(0xFF454545, Typeface.create("sans-serif", 0), height * 0.13f);
        fit(datePaint, date, width * 0.35f);
        canvas.drawText(date, width * 0.065f, height * 0.79f, datePaint);
        divider(canvas, width * 0.39f, height * 0.20f, width * 0.39f, height * 0.80f,
                0x556A6255, unit);
        float radius = Math.min(height * 0.19f, width * 0.06f);
        drawMetric(canvas, width * 0.49f, height * 0.47f, radius, unread, true, true, unit);
        drawMetric(canvas, width * 0.62f, height * 0.47f, radius, missed, false, true, unit);
        divider(canvas, width * 0.72f, height * 0.20f, width * 0.72f, height * 0.80f,
                0x556A6255, unit);
        drawOnline(canvas, width * 0.85f, height * 0.50f, width * 0.23f,
                height * 0.40f, online, true, unit);
    }

    /** Referencia 06: panel Sync horizontal con reloj y contadores reales. */
    private static void drawSlimSync(Canvas canvas, int width, int height, float unit,
                                     Typeface strong, String clock, String date, int unread,
                                     int missed, boolean online) {
        if ((float) width / height < 1.55f) {
            drawDarkDials(canvas, width, height, unit, strong, clock, date, unread, missed);
            return;
        }
        Paint timePaint = text(Color.WHITE, strong, height * 0.39f);
        fit(timePaint, clock, width * 0.25f);
        canvas.drawText(clock, width * 0.055f, height * 0.55f, timePaint);
        Paint datePaint = text(0xFFBFC0C2, Typeface.create("sans-serif", 0), height * 0.13f);
        fit(datePaint, date, width * 0.27f);
        canvas.drawText(date, width * 0.065f, height * 0.77f, datePaint);
        divider(canvas, width * 0.31f, height * 0.20f, width * 0.31f, height * 0.80f,
                0x55FFFFFF, unit);
        Paint brand = text(Color.WHITE, Typeface.create("sans-serif-medium", 0),
                height * 0.19f);
        fit(brand, "SYNC ENGINE", width * 0.28f);
        canvas.drawText("SYNC ENGINE", width * 0.36f, height * 0.42f, brand);
        drawOnline(canvas, width * 0.48f, height * 0.67f, width * 0.25f,
                height * 0.25f, online, false, unit);
        divider(canvas, width * 0.64f, height * 0.20f, width * 0.64f, height * 0.80f,
                0x55FFFFFF, unit);
        float r = Math.min(height * 0.20f, width * 0.055f);
        drawMetric(canvas, width * 0.75f, height * 0.50f, r, unread, true, false, unit);
        drawMetric(canvas, width * 0.88f, height * 0.50f, r, missed, false, false, unit);
    }

    /** Referencia 07: reloj con la ciudad de la zona horaria (la app no tiene dato de clima). */
    private static void drawWeatherClock(Canvas canvas, int width, int height, float unit,
                                         Typeface strong, String clock, String date, String city,
                                         int unread, int missed, boolean online) {
        if ((float) width / height < 1.55f) {
            drawDarkDials(canvas, width, height, unit, strong, clock, date, unread, missed);
            return;
        }
        drawPin(canvas, width * 0.075f, height * 0.42f, height * 0.11f);
        Paint place = text(Color.WHITE, Typeface.create("sans-serif-medium", 0), height * 0.19f);
        fit(place, city, width * 0.19f);
        canvas.drawText(city, width * 0.115f, height * 0.50f, place);
        Paint zoneLabel = text(0xFFBFC0C2, Typeface.create("sans-serif", 0), height * 0.11f);
        canvas.drawText("Hora local", width * 0.115f, height * 0.68f, zoneLabel);
        divider(canvas, width * 0.32f, height * 0.20f, width * 0.32f, height * 0.80f,
                0x55FFFFFF, unit);
        Paint timePaint = text(Color.WHITE, strong, height * 0.40f);
        fit(timePaint, clock, width * 0.36f);
        canvas.drawText(clock, width * 0.35f, height * 0.56f, timePaint);
        Paint datePaint = text(0xFFBFC0C2, Typeface.create("sans-serif", 0), height * 0.12f);
        fit(datePaint, date, width * 0.37f);
        canvas.drawText(date, width * 0.36f, height * 0.78f, datePaint);
        divider(canvas, width * 0.73f, height * 0.20f, width * 0.73f, height * 0.80f,
                0x55FFFFFF, unit);
        drawOnline(canvas, width * 0.86f, height * 0.40f, width * 0.22f,
                height * 0.26f, online, false, unit);
        drawInlineCounts(canvas, width * 0.86f, height * 0.77f, height * 0.10f,
                unread, missed, false, unit);
    }

    /** Referencia 08: panel de contacto con nombre de sesión y accesos del widget. */
    private static void drawContact(Canvas canvas, int width, int height, float unit,
                                    Typeface strong, String clock, String date, String userName,
                                    int unread, int missed) {
        if ((float) width / height < 1.55f) {
            drawDarkDials(canvas, width, height, unit, strong, clock, date, unread, missed);
            return;
        }
        float avatarX = width * 0.10f;
        float avatarY = height * 0.50f;
        float avatarR = Math.min(height * 0.28f, width * 0.07f);
        Paint avatar = new Paint(Paint.ANTI_ALIAS_FLAG);
        avatar.setShader(new LinearGradient(avatarX - avatarR, avatarY - avatarR,
                avatarX + avatarR, avatarY + avatarR,
                new int[] {0xFF37393C, 0xFF111214}, null, Shader.TileMode.CLAMP));
        canvas.drawCircle(avatarX, avatarY, avatarR, avatar);
        Paint avatarText = text(Color.WHITE, strong, avatarR * 0.80f);
        centered(canvas, "S", avatarX, avatarY + avatarText.getTextSize() * 0.34f, avatarText);
        Paint title = text(Color.WHITE, Typeface.create("sans-serif-medium", 0),
                height * 0.16f);
        String contact = userName == null || userName.trim().isEmpty()
                ? "SYNC ENGINE" : userName.trim();
        fit(title, contact, width * 0.25f);
        canvas.drawText(contact, width * 0.19f, height * 0.43f, title);
        Paint subtitle = text(0xFFBFC0C2, Typeface.create("sans-serif", 0), height * 0.12f);
        fit(subtitle, "Notificaciones y llamadas", width * 0.27f);
        canvas.drawText("Notificaciones y llamadas", width * 0.19f, height * 0.63f, subtitle);
        Paint time = text(0xFFBFC0C2, Typeface.create("sans-serif", 0), height * 0.105f);
        fit(time, date + " · " + clock, width * 0.28f);
        canvas.drawText(date + " · " + clock, width * 0.19f, height * 0.79f, time);
        divider(canvas, width * 0.49f, height * 0.23f, width * 0.49f, height * 0.77f,
                0x55FFFFFF, unit);
        float r = Math.min(height * 0.25f, width * 0.065f);
        drawMetric(canvas, width * 0.64f, height * 0.50f, r, unread, true, false, unit);
        drawMetric(canvas, width * 0.79f, height * 0.50f, r, missed, false, false, unit);
        drawAppIcon(canvas, width * 0.92f, height * 0.50f, r * 0.76f, unit);
    }

    private static void drawOnline(Canvas canvas, float centerX, float centerY,
                                   float width, float height, boolean online, boolean light,
                                   float unit) {
        RectF pill = new RectF(centerX - width / 2f, centerY - height / 2f,
                centerX + width / 2f, centerY + height / 2f);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(light ? 0xCCFFFFFF : 0xAA0C0D0F);
        canvas.drawRoundRect(pill, height / 2f, height / 2f, fill);
        Paint outline = new Paint(Paint.ANTI_ALIAS_FLAG);
        outline.setStyle(Paint.Style.STROKE);
        outline.setStrokeWidth(Math.max(1f, unit));
        outline.setColor(light ? 0x66D49528 : 0x667E7E7E);
        canvas.drawRoundRect(pill, height / 2f, height / 2f, outline);
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(online ? 0xFFFFA000 : 0xFF777777);
        canvas.drawCircle(pill.left + height * 0.34f, centerY, height * 0.11f, dot);
        int ink = light ? 0xFF222222 : Color.WHITE;
        Paint label = text(ink, Typeface.create("sans-serif", Typeface.BOLD), height * 0.27f);
        String state = online ? "ONLINE" : "OFFLINE";
        fit(label, state, width * 0.67f);
        canvas.drawText(state, pill.left + height * 0.56f, centerY - height * 0.015f, label);
        label.setColor(light ? 0xFF777777 : 0xFFBFC0C2);
        label.setTypeface(Typeface.create("sans-serif", 0));
        label.setTextSize(height * 0.21f);
        canvas.drawText("SYNC", pill.left + height * 0.56f, centerY + height * 0.27f, label);
    }

    private static void drawStatusRing(Canvas canvas, float centerX, float centerY,
                                       float radius, boolean online, boolean light, float unit) {
        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(Math.max(unit * 4f, radius * 0.12f));
        track.setColor(light ? 0x337C7466 : 0x557C7466);
        canvas.drawCircle(centerX, centerY, radius, track);
        Paint arc = new Paint(track);
        arc.setShader(new LinearGradient(centerX - radius, centerY - radius,
                centerX + radius, centerY + radius,
                new int[] {0xFFFFD34F, 0xFFFF9200}, null, Shader.TileMode.CLAMP));
        canvas.drawArc(new RectF(centerX - radius, centerY - radius,
                centerX + radius, centerY + radius), -90, online ? 285 : 48, false, arc);
        int ink = light ? 0xFF242424 : Color.WHITE;
        Paint value = text(ink, Typeface.create("sans-serif", Typeface.BOLD), radius * 0.42f);
        String status = online ? "OK" : "—";
        fit(value, status, radius * 1.35f);
        centered(canvas, status, centerX, centerY + value.getTextSize() * 0.13f, value);
        Paint label = text(light ? 0xFF747474 : 0xFFBFC0C2,
                Typeface.create("sans-serif", 0), radius * 0.24f);
        centered(canvas, "SYNC", centerX, centerY + radius * 0.40f, label);
    }

    private static void drawMetric(Canvas canvas, float centerX, float centerY, float radius,
                                   int count, boolean messages, boolean light, float unit) {
        int ink = light ? 0xFF262626 : Color.WHITE;
        drawMetricFace(canvas, centerX, centerY, radius, messages, light, unit);
        Paint number = text(ink, Typeface.create("sans-serif-medium", 0), radius * 0.58f);
        String label = String.valueOf(count);
        centered(canvas, label, centerX, centerY + radius * 1.62f, number);
    }

    private static void drawMetricFace(Canvas canvas, float centerX, float centerY,
                                       float radius, boolean messages, boolean light,
                                       float unit) {
        int ink = light ? 0xFF262626 : Color.WHITE;
        Paint face = new Paint(Paint.ANTI_ALIAS_FLAG);
        face.setShader(new LinearGradient(centerX - radius, centerY - radius,
                centerX + radius, centerY + radius,
                light ? new int[] {0xFFFDFDFC, 0xFFE9E7E3}
                        : new int[] {0xFF242629, 0xFF090A0B},
                null, Shader.TileMode.CLAMP));
        canvas.drawCircle(centerX, centerY, radius, face);
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(Math.max(unit, radius * 0.045f));
        ring.setColor(light ? 0x66998B73 : 0x667E7E7E);
        canvas.drawCircle(centerX, centerY, radius, ring);
        Paint accent = new Paint(Paint.ANTI_ALIAS_FLAG);
        accent.setColor(0xFFFFAA00);
        canvas.drawCircle(centerX + radius * 0.72f, centerY - radius * 0.72f,
                Math.max(unit * 2f, radius * 0.14f), accent);
        Paint icon = iconPaint(ink, radius, unit);
        if (messages) {
            drawMessageIcon(canvas, centerX, centerY - radius * 0.04f, radius * 0.70f, icon);
        } else {
            drawPhoneIcon(canvas, centerX, centerY - radius * 0.04f, radius * 0.70f, icon);
        }
    }

    private static void drawFooterCounts(Canvas canvas, int width, int height, float unit,
                                         int unread, int missed, boolean light) {
        float r = Math.max(unit * 8f, height * 0.035f);
        drawMetric(canvas, width * 0.70f, height * 0.87f, r, unread, true, light, unit);
        drawMetric(canvas, width * 0.86f, height * 0.87f, r, missed, false, light, unit);
    }

    /** Par de contadores con el número a la derecha del icono, centrado en centerX. */
    private static void drawInlineCounts(Canvas canvas, float centerX, float centerY,
                                         float radius, int unread, int missed, boolean light,
                                         float unit) {
        drawInlineMetric(canvas, centerX - radius * 3.5f, centerY, radius, unread, true,
                light, unit);
        drawInlineMetric(canvas, centerX + radius * 1.5f, centerY, radius, missed, false,
                light, unit);
    }

    private static void drawInlineMetric(Canvas canvas, float centerX, float centerY,
                                         float radius, int count, boolean messages,
                                         boolean light, float unit) {
        drawMetricFace(canvas, centerX, centerY, radius, messages, light, unit);
        Paint number = text(light ? 0xFF262626 : Color.WHITE,
                Typeface.create("sans-serif-medium", 0), radius * 1.05f);
        canvas.drawText(String.valueOf(count), centerX + radius * 1.4f,
                centerY + number.getTextSize() * 0.36f, number);
    }

    /** Pin de ubicación para la zona horaria configurada. */
    private static void drawPin(Canvas canvas, float centerX, float centerY, float radius) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(0xFFFFB21A);
        Path pin = new Path();
        pin.addCircle(centerX, centerY - radius * 0.25f, radius * 0.62f, Path.Direction.CW);
        pin.moveTo(centerX - radius * 0.5f, centerY + radius * 0.05f);
        pin.lineTo(centerX, centerY + radius * 1.0f);
        pin.lineTo(centerX + radius * 0.5f, centerY + radius * 0.05f);
        pin.close();
        canvas.drawPath(pin, paint);
        paint.setColor(0xFF0A0A0B);
        canvas.drawCircle(centerX, centerY - radius * 0.25f, radius * 0.25f, paint);
    }

    /** Identifica el acceso directo que abre la app al tocar el widget. */
    private static void drawAppIcon(Canvas canvas, float centerX, float centerY, float radius,
                                    float unit) {
        Paint paint = iconPaint(Color.WHITE, radius, unit);
        paint.setStrokeWidth(Math.max(unit * 1.8f, radius * 0.12f));
        RectF app = new RectF(centerX - radius * 0.42f, centerY - radius * 0.35f,
                centerX + radius * 0.24f, centerY + radius * 0.34f);
        canvas.drawRoundRect(app, radius * 0.08f, radius * 0.08f, paint);
        canvas.drawLine(centerX - radius * 0.02f, centerY + radius * 0.04f,
                centerX + radius * 0.42f, centerY - radius * 0.40f, paint);
        canvas.drawLine(centerX + radius * 0.12f, centerY - radius * 0.40f,
                centerX + radius * 0.42f, centerY - radius * 0.40f, paint);
        canvas.drawLine(centerX + radius * 0.42f, centerY - radius * 0.40f,
                centerX + radius * 0.42f, centerY - radius * 0.10f, paint);
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(Math.max(unit, radius * 0.06f));
        border.setColor(0x887E7E7E);
        canvas.drawCircle(centerX, centerY, radius, border);
    }

    private static Paint iconPaint(int color, float radius, float unit) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(Math.max(unit * 1.6f, radius * 0.11f));
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        return paint;
    }

    private static void drawMessageIcon(Canvas canvas, float centerX, float centerY,
                                        float radius, Paint paint) {
        Path bubble = new Path();
        bubble.moveTo(centerX - radius * 0.42f, centerY - radius * 0.25f);
        bubble.quadTo(centerX - radius * 0.42f, centerY - radius * 0.42f,
                centerX - radius * 0.25f, centerY - radius * 0.42f);
        bubble.lineTo(centerX + radius * 0.30f, centerY - radius * 0.42f);
        bubble.quadTo(centerX + radius * 0.43f, centerY - radius * 0.42f,
                centerX + radius * 0.43f, centerY - radius * 0.28f);
        bubble.lineTo(centerX + radius * 0.43f, centerY + radius * 0.10f);
        bubble.quadTo(centerX + radius * 0.43f, centerY + radius * 0.25f,
                centerX + radius * 0.28f, centerY + radius * 0.25f);
        bubble.lineTo(centerX - radius * 0.08f, centerY + radius * 0.25f);
        bubble.lineTo(centerX - radius * 0.30f, centerY + radius * 0.42f);
        bubble.lineTo(centerX - radius * 0.28f, centerY + radius * 0.21f);
        bubble.quadTo(centerX - radius * 0.42f, centerY + radius * 0.19f,
                centerX - radius * 0.42f, centerY + radius * 0.04f);
        bubble.close();
        canvas.drawPath(bubble, paint);
        float dotRadius = Math.max(1f, radius * 0.045f);
        canvas.drawCircle(centerX - radius * 0.17f, centerY - radius * 0.08f, dotRadius, paint);
        canvas.drawCircle(centerX, centerY - radius * 0.08f, dotRadius, paint);
        canvas.drawCircle(centerX + radius * 0.17f, centerY - radius * 0.08f, dotRadius, paint);
    }

    private static void drawPhoneIcon(Canvas canvas, float centerX, float centerY,
                                      float radius, Paint paint) {
        Path phone = new Path();
        phone.moveTo(centerX - radius * 0.32f, centerY - radius * 0.33f);
        phone.cubicTo(centerX - radius * 0.44f, centerY - radius * 0.22f,
                centerX - radius * 0.19f, centerY + radius * 0.17f,
                centerX + radius * 0.06f, centerY + radius * 0.31f);
        phone.cubicTo(centerX + radius * 0.22f, centerY + radius * 0.40f,
                centerX + radius * 0.39f, centerY + radius * 0.20f,
                centerX + radius * 0.32f, centerY + radius * 0.10f);
        canvas.drawPath(phone, paint);
        canvas.drawLine(centerX - radius * 0.31f, centerY - radius * 0.31f,
                centerX - radius * 0.17f, centerY - radius * 0.16f, paint);
        canvas.drawLine(centerX + radius * 0.17f, centerY + radius * 0.21f,
                centerX + radius * 0.31f, centerY + radius * 0.31f, paint);
    }

    private static void divider(Canvas canvas, float x1, float y1, float x2, float y2,
                                int color, float unit) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setStrokeWidth(Math.max(1f, unit));
        canvas.drawLine(x1, y1, x2, y2, paint);
    }

    private static Paint text(int color, Typeface typeface, float size) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setTypeface(typeface);
        paint.setTextSize(size);
        return paint;
    }

    private static void fit(Paint paint, String value, float maxWidth) {
        float width = paint.measureText(value);
        if (width > maxWidth && width > 0) {
            paint.setTextSize(paint.getTextSize() * maxWidth / width);
        }
    }

    private static void centered(Canvas canvas, String value, float centerX, float baseline,
                                 Paint paint) {
        canvas.drawText(value, centerX - paint.measureText(value) / 2f, baseline, paint);
    }
}
