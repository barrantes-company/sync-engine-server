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
        boolean ring = kind == 2;
        float width = ring ? 218 : 234;
        float height = ring ? 218 : 94;
        float scale = Math.min(w / width, h / height);
        canvas.translate((w - width * scale) / 2, (h - height * scale) / 2);
        canvas.scale(scale, scale);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(0xCC0F172A);
        canvas.drawRoundRect(0, 0, width, height, 18, 18, paint);
        if (ring) {
            strokeCircle(canvas, 109, 105, 73, 0xFF384563, 7);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeWidth(7);
            paint.setColor(0xFF818CF8);
            canvas.drawArc(36, 32, 182, 178, -90, face.orbit, false, paint);
            text(canvas, face.clock, 109, 110, 34, Color.WHITE, true);
            text(canvas, face.ap, 109, 127, 10, Color.WHITE, true);
            text(canvas, face.date.toUpperCase(new Locale("es")), 109, 148, 12, 0xFFCBD5E1, true);
            badges(context, canvas, 66, 185, unread, missed);
        } else {
            String location = TimeZone.getTimeZone(zone == null ? "America/Lima" : zone).getID();
            location = location.substring(location.lastIndexOf('/') + 1).replace('_', ' ');
            canvas.save();
            canvas.clipRect(10, 0, 157, height);
            text(canvas, location, 12, 17, 11, 0xFFCBD5E1, false);
            text(canvas, face.clock, 12, 45, kind == 0 ? 28 : 31, Color.WHITE, false);
            text(canvas, face.ap, 102, 44, 10, Color.WHITE, false);
            text(canvas, face.date, 12, 59, 11, 0xFFCBD5E1, false);
            canvas.restore();
            badges(context, canvas, 12, 66, unread, missed);
            strokeCircle(canvas, 194, 46, 26, 0xFF64748B, 2);
            paint.setColor(0xFFCBD5E1);
            canvas.drawCircle(190, 40, 4, paint);
            canvas.drawCircle(196, 38, 6, paint);
            canvas.drawRoundRect(185, 40, 204, 45, 3, 3, paint);
            text(canvas, "Sin datos", 194, 58, 9, 0xFFCBD5E1, true);
        }
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

    private static void strokeCircle(Canvas c, float x, float y, float radius, int color, float width) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(width);
        c.drawCircle(x, y, radius, p);
    }

    private static void text(Canvas c, String value, float x, float baseline, float size, int color, boolean centered) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        p.setTypeface(size >= 24 ? bold() : Typeface.DEFAULT);
        p.setTextSize(size);
        if (centered) p.setTextAlign(Paint.Align.CENTER);
        c.drawText(value, x, baseline, p);
    }

    private static void badges(Context context, Canvas c, int x, int y, int unread, int missed) {
        badge(context, c, x, y, R.drawable.ic_widget_chat, unread);
        badge(context, c, x + 48, y, R.drawable.ic_widget_call, missed);
    }

    private static void badge(Context context, Canvas c, int x, int y, int resource, int count) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0xFF334155);
        c.drawRoundRect(x, y, x + 44, y + 18, 9, 9, p);
        android.graphics.drawable.Drawable icon = context.getDrawable(resource).mutate();
        icon.setTint(Color.WHITE);
        icon.setBounds(x + 5, y + 3, x + 17, y + 15);
        icon.draw(c);
        text(c, count > 99 ? "99+" : String.valueOf(count), x + 29, y + 13, 10, Color.WHITE, true);
    }
}
