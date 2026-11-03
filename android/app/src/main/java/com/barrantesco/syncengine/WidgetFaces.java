package com.barrantesco.syncengine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;

import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

/** Ciudad, Barra y Anillo. Se pintan en un bitmap porque RemoteViews no anima. */
final class WidgetFaces {
    private WidgetFaces() {}

    static Bitmap render(Context context, int kind, int w, int h, String zone, boolean use24h,
                         int unread, int missed, boolean online) {
        Bitmap bitmap = Bitmap.createBitmap(Math.max(w, 1), Math.max(h, 1), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Face face = face(zone, use24h);
        if (kind == 0) ciudad(canvas, w, h, face, unread, missed, online);
        else if (kind == 1) barra(canvas, w, h, face, unread, missed);
        else anillo(canvas, w, h, face, unread, missed, online);
        return bitmap;
    }

    private static final class Face {
        String clock;
        String ap;
        String date;
        String weekday;
        float orbit;
    }

    private static Face face(String zone, boolean use24h) {
        TimeZone tz = TimeZone.getTimeZone(zone == null || zone.isEmpty() ? "America/Lima" : zone);
        Calendar cal = Calendar.getInstance(tz);
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        int minute = cal.get(Calendar.MINUTE);
        Face face = new Face();
        if (use24h) {
            face.clock = String.format(Locale.US, "%02d:%02d", hour, minute);
            face.ap = "";
        } else {
            int hour12 = hour % 12;
            if (hour12 == 0) hour12 = 12;
            face.clock = String.format(Locale.US, "%02d:%02d", hour12, minute);
            face.ap = hour < 12 ? "AM" : "PM";
        }
        String[] days = {"domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"};
        String[] months = {"ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"};
        int dow = cal.get(Calendar.DAY_OF_WEEK) - 1;
        face.weekday = days[dow];
        face.date = days[dow].substring(0, 3) + " " + cal.get(Calendar.DAY_OF_MONTH) + " " + months[cal.get(Calendar.MONTH)];
        face.orbit = (System.currentTimeMillis() % 60000L) / 60000f * 360f;
        return face;
    }

    private static Typeface bold() {
        return Typeface.create("sans-serif", Typeface.BOLD);
    }

    private static void round(Canvas canvas, int color, float radius) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        canvas.drawRoundRect(new RectF(0, 0, canvas.getWidth(), canvas.getHeight()), radius, radius, paint);
    }

    private static void ciudad(Canvas canvas, int w, int h, Face face, int unread, int missed, boolean online) {
        round(canvas, 0xFF101010, h * 0.14f);
        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow.setColor(0x33FFC45C);
        canvas.drawCircle(w * 0.86f, h * 0.08f, h * 0.7f, glow);

        Paint clock = new Paint(Paint.ANTI_ALIAS_FLAG);
        clock.setTypeface(bold());
        clock.setColor(Color.WHITE);
        clock.setTextSize(h * 0.34f);
        float left = w * 0.06f;
        canvas.drawText(face.clock, left, h * 0.40f, clock);
        if (!face.ap.isEmpty()) {
            Paint ap = new Paint(clock);
            ap.setTextSize(h * 0.09f);
            canvas.drawText(face.ap, left + clock.measureText(face.clock) + h * 0.04f, h * 0.40f, ap);
        }

        Paint place = new Paint(Paint.ANTI_ALIAS_FLAG);
        place.setTypeface(bold());
        place.setColor(Color.WHITE);
        place.setTextSize(h * 0.13f);
        canvas.drawText("Lima", left, h * 0.56f, place);

        Paint date = new Paint(Paint.ANTI_ALIAS_FLAG);
        date.setColor(0xFF9C9C9C);
        date.setTextSize(h * 0.075f);
        canvas.drawText(face.date, left, h * 0.68f, date);

        chip(canvas, left, h * 0.76f, h * 0.42f, h * 0.16f, "✉ " + unread);
        chip(canvas, left + h * 0.48f, h * 0.76f, h * 0.42f, h * 0.16f, "☎ " + missed);

        Paint panel = new Paint(Paint.ANTI_ALIAS_FLAG);
        panel.setColor(0x10FFFFFF);
        float px = w * 0.64f;
        canvas.drawRoundRect(new RectF(px, h * 0.08f, w * 0.96f, h * 0.92f), h * 0.1f, h * 0.1f, panel);

        Paint sun = new Paint(Paint.ANTI_ALIAS_FLAG);
        sun.setColor(0xFFFFD15A);
        float sx = (px + w * 0.96f) / 2f;
        canvas.save();
        canvas.rotate(face.orbit, sx, h * 0.28f);
        sun.setStrokeWidth(h * 0.012f);
        sun.setStyle(Paint.Style.STROKE);
        for (int i = 0; i < 8; i++) {
            double a = Math.toRadians(i * 45.0);
            float x1 = sx + (float) Math.cos(a) * h * 0.07f;
            float y1 = h * 0.28f + (float) Math.sin(a) * h * 0.07f;
            float x2 = sx + (float) Math.cos(a) * h * 0.11f;
            float y2 = h * 0.28f + (float) Math.sin(a) * h * 0.11f;
            canvas.drawLine(x1, y1, x2, y2, sun);
        }
        canvas.restore();
        sun.setStyle(Paint.Style.FILL);
        canvas.drawCircle(sx, h * 0.28f, h * 0.055f, sun);
        Paint cloud = new Paint(Paint.ANTI_ALIAS_FLAG);
        cloud.setColor(0xFFF4F4F4);
        canvas.drawCircle(sx - h * 0.02f, h * 0.34f, h * 0.045f, cloud);
        canvas.drawCircle(sx + h * 0.04f, h * 0.33f, h * 0.055f, cloud);

        Paint temp = new Paint(clock);
        temp.setTextAlign(Paint.Align.CENTER);
        temp.setTextSize(h * 0.16f);
        canvas.drawText("--°", sx, h * 0.56f, temp);
        Paint cond = new Paint(date);
        cond.setTextAlign(Paint.Align.CENTER);
        cond.setColor(online ? 0xFFECECEC : 0xFF8E8E8E);
        canvas.drawText(online ? "EN LÍNEA" : "SIN SESIÓN", sx, h * 0.68f, cond);
        cond.setTextSize(h * 0.055f);
        canvas.drawText("Día --  ·  Noche --", sx, h * 0.80f, cond);
    }

    private static void barra(Canvas canvas, int w, int h, Face face, int unread, int missed) {
        round(canvas, 0xFF161616, h * 0.18f);
        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow.setColor(0x55FF9628);
        canvas.drawCircle(w * 0.72f, h * 0.5f, h * 0.7f, glow);

        Paint clock = new Paint(Paint.ANTI_ALIAS_FLAG);
        clock.setTypeface(bold());
        clock.setColor(Color.WHITE);
        clock.setTextSize(h * 0.42f);
        float left = w * 0.06f;
        canvas.drawText(face.clock, left, h * 0.48f, clock);
        if (!face.ap.isEmpty()) {
            Paint ap = new Paint(clock);
            ap.setTextSize(h * 0.14f);
            canvas.drawText(face.ap, left + clock.measureText(face.clock) + h * 0.04f, h * 0.48f, ap);
        }
        chip(canvas, left, h * 0.62f, h * 0.55f, h * 0.2f, "✉ " + unread);
        chip(canvas, left + h * 0.62f, h * 0.62f, h * 0.55f, h * 0.2f, "☎ " + missed);

        float cx = w * 0.82f;
        float cy = h * 0.5f;
        float radius = h * 0.32f;
        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(h * 0.07f);
        track.setColor(0xFF2A211C);
        canvas.drawCircle(cx, cy, radius, track);
        Paint arc = new Paint(track);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setColor(0xFFFF7A18);
        RectF oval = new RectF(cx - radius, cy - radius, cx + radius, cy + radius);
        canvas.drawArc(oval, face.orbit - 90f, 250f, false, arc);
        Paint head = new Paint(Paint.ANTI_ALIAS_FLAG);
        head.setColor(Color.WHITE);
        double rad = Math.toRadians(face.orbit - 90.0);
        canvas.drawCircle(cx + (float) Math.cos(rad) * radius, cy + (float) Math.sin(rad) * radius, h * 0.035f, head);
        Paint temp = new Paint(clock);
        temp.setTextAlign(Paint.Align.CENTER);
        temp.setTextSize(h * 0.16f);
        canvas.drawText("--°", cx, cy + temp.getTextSize() * 0.3f, temp);
    }

    private static void anillo(Canvas canvas, int w, int h, Face face, int unread, int missed, boolean online) {
        round(canvas, 0xFF050505, h * 0.08f);
        Paint top = new Paint(Paint.ANTI_ALIAS_FLAG);
        top.setColor(0xFFC5C5C5);
        top.setTextAlign(Paint.Align.CENTER);
        top.setTextSize(h * 0.045f);
        top.setLetterSpacing(0.18f);
        canvas.drawText(face.date.toUpperCase(new Locale("es")), w / 2f, h * 0.1f, top);

        float cx = w / 2f;
        float cy = h * 0.48f;
        float radius = Math.min(w, h) * 0.3f;
        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(radius * 0.16f);
        track.setColor(0xFF2A2A2A);
        canvas.drawCircle(cx, cy, radius, track);
        Paint arc = new Paint(track);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setColor(0xFF2F78FF);
        RectF oval = new RectF(cx - radius, cy - radius, cx + radius, cy + radius);
        canvas.drawArc(oval, face.orbit - 90f, 283f, false, arc);

        String[] marks = {"✉", "☎", online ? "●" : "○"};
        int[] tones = {0xFF3EE7FF, 0xFF3D7DFF, online ? 0xFF3EE7FF : 0xFF2A5FD4};
        for (int i = 0; i < 3; i++) {
            double rad = Math.toRadians(face.orbit + i * 120.0 - 90.0);
            float x = cx + (float) Math.cos(rad) * radius;
            float y = cy + (float) Math.sin(rad) * radius;
            Paint node = new Paint(Paint.ANTI_ALIAS_FLAG);
            node.setColor(0xFF050505);
            node.setStyle(Paint.Style.FILL);
            canvas.drawCircle(x, y, radius * 0.16f, node);
            node.setStyle(Paint.Style.STROKE);
            node.setStrokeWidth(radius * 0.03f);
            node.setColor(tones[i]);
            canvas.drawCircle(x, y, radius * 0.16f, node);
            Paint glyph = new Paint(Paint.ANTI_ALIAS_FLAG);
            glyph.setColor(Color.WHITE);
            glyph.setTextAlign(Paint.Align.CENTER);
            glyph.setTextSize(radius * 0.16f);
            canvas.drawText(marks[i], x, y + glyph.getTextSize() * 0.32f, glyph);
        }

        Paint clock = new Paint(Paint.ANTI_ALIAS_FLAG);
        clock.setTypeface(bold());
        clock.setColor(Color.WHITE);
        clock.setTextAlign(Paint.Align.CENTER);
        clock.setTextSize(radius * 0.55f);
        canvas.drawText(face.clock, cx, cy + clock.getTextSize() * 0.15f, clock);
        if (!face.ap.isEmpty()) {
            Paint ap = new Paint(clock);
            ap.setTextSize(radius * 0.16f);
            ap.setLetterSpacing(0.2f);
            canvas.drawText(face.ap, cx, cy + clock.getTextSize() * 0.42f, ap);
        }

        Paint day = new Paint(top);
        day.setColor(0xFFDEDEDE);
        day.setTextSize(h * 0.055f);
        day.setLetterSpacing(0.02f);
        canvas.drawText(face.weekday, w / 2f, h * 0.92f, day);

        if (unread > 0 || missed > 0) {
            Paint badge = new Paint(Paint.ANTI_ALIAS_FLAG);
            badge.setColor(0xFFFF4B4B);
            badge.setTextAlign(Paint.Align.LEFT);
            badge.setTextSize(h * 0.04f);
            canvas.drawText(unread + "  " + missed, w * 0.08f, h * 0.1f, badge);
        }
    }

    private static void chip(Canvas canvas, float x, float y, float w, float h, String label) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(0x18FFFFFF);
        canvas.drawRoundRect(new RectF(x, y, x + w, y + h), h / 2f, h / 2f, bg);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(Color.WHITE);
        text.setTypeface(bold());
        text.setTextSize(h * 0.48f);
        canvas.drawText(label, x + h * 0.35f, y + h * 0.7f, text);
    }
}
