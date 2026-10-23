package com.barrantesco.syncengine;

import android.content.Context;
import android.content.SharedPreferences;

<<<<<<< HEAD
import java.util.TimeZone;

=======
>>>>>>> origin/main
/**
 * Preferencias de la app: opciones del widget, sesión y caché de contadores.
 * La sesión solo guarda el token (nunca la contraseña) en almacenamiento privado.
 */
final class AppSettings {
<<<<<<< HEAD
    static final String DEVICE_TIME_ZONE = "device";
    static final int WIDGET_STYLE_LIGHT_SQUARE = 0;
    static final int WIDGET_STYLE_DARK_DIALS = 1;
    static final int WIDGET_STYLE_OLED = 2;
    static final int WIDGET_STYLE_SYNC_RING = 3;
    static final int WIDGET_STYLE_LIGHT_WIDE = 4;
    static final int WIDGET_STYLE_SLIM_SYNC = 5;
    static final int WIDGET_STYLE_WEATHER = 6;
    static final int WIDGET_STYLE_CONTACT = 7;
    static final int WIDGET_STYLE_COUNT = 8;
=======
    static final String DEFAULT_TIME_ZONE = "America/Lima";
>>>>>>> origin/main
    private static final String FILE = "sync_state";

    private static final String TOKEN = "token";
    private static final String FCM_TOKEN = "fcm_token";
    private static final String USER_NAME = "user_name";
    private static final String USE_24H = "use_24h";
    private static final String TIME_ZONE = "time_zone";
<<<<<<< HEAD
    private static final String WIDGET_STYLE = "widget_style";
    private static final String WIDGET_STYLE_VERSION = "widget_style_version";
    private static final String NOTIFICATIONS = "notifications";
    private static final String UNREAD = "unread";
    private static final String MISSED = "missed";
    private static final String LAST_SYNC = "last_sync";
=======
    private static final String SHOW_COUNTERS = "show_counters";
    private static final String NOTIFICATIONS = "notifications";
    private static final String ANIMATIONS = "animations";
    private static final String WIDGET_STYLE = "widget_style";
    private static final String UNREAD = "unread";
    private static final String MISSED = "missed";
>>>>>>> origin/main
    private static final String CALLS_SEEN_AT = "calls_seen_at";
    private static final String NOTIFIED_MSG_TS = "notified_msg_ts";
    private static final String NOTIFIED_MISSED = "notified_missed";

<<<<<<< HEAD
=======
    static final String[] STYLE_NAMES = {
            "Reloj", "Señal", "Negro", "Línea", "Barra", "Fino", "Ciudad", "Accesos"
    };

>>>>>>> origin/main
    private AppSettings() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static String token(Context context) {
        return prefs(context).getString(TOKEN, "");
    }

    static boolean isLoggedIn(Context context) {
        return !token(context).isEmpty();
    }

    static String userName(Context context) {
        return prefs(context).getString(USER_NAME, "");
    }

    static void saveSession(Context context, String token, String userName) {
        prefs(context).edit()
                .putString(TOKEN, token)
                .putString(USER_NAME, userName)
                .putLong(CALLS_SEEN_AT, System.currentTimeMillis())
                .putLong(NOTIFIED_MSG_TS, 0)
                .putInt(NOTIFIED_MISSED, 0)
                .apply();
    }

    /** Cierra la sesión y borra los contadores en caché. */
    static void clearSession(Context context) {
        prefs(context).edit()
                .remove(TOKEN)
                .remove(USER_NAME)
                .putInt(UNREAD, 0)
                .putInt(MISSED, 0)
<<<<<<< HEAD
                .putLong(LAST_SYNC, 0)
=======
>>>>>>> origin/main
                .apply();
    }

    static String fcmToken(Context context) {
        return prefs(context).getString(FCM_TOKEN, "");
    }

    static void saveFcmToken(Context context, String token) {
        prefs(context).edit().putString(FCM_TOKEN, token).apply();
    }

    static boolean use24h(Context context) {
        return prefs(context).getBoolean(USE_24H, true);
    }

    static void setUse24h(Context context, boolean value) {
        prefs(context).edit().putBoolean(USE_24H, value).apply();
    }

<<<<<<< HEAD
    static int widgetStyle(Context context) {
        SharedPreferences preferences = prefs(context);
        if (preferences.getInt(WIDGET_STYLE_VERSION, 0) == 0) {
            int previous = preferences.getInt(WIDGET_STYLE, 0);
            int migrated = preferences.contains(WIDGET_STYLE)
                    && previous == 1
                    ? WIDGET_STYLE_LIGHT_SQUARE : WIDGET_STYLE_DARK_DIALS;
            preferences.edit()
                    .putInt(WIDGET_STYLE, migrated)
                    .putInt(WIDGET_STYLE_VERSION, 1)
                    .apply();
        }
        int style = preferences.getInt(WIDGET_STYLE, WIDGET_STYLE_DARK_DIALS);
        return style >= 0 && style < WIDGET_STYLE_COUNT
                ? style : WIDGET_STYLE_DARK_DIALS;
    }

    static void setWidgetStyle(Context context, int value) {
        if (value < 0 || value >= WIDGET_STYLE_COUNT) {
            throw new IllegalArgumentException("Unknown widget style: " + value);
        }
        prefs(context).edit()
                .putInt(WIDGET_STYLE, value)
                .putInt(WIDGET_STYLE_VERSION, 1)
                .apply();
    }

    static String timeZone(Context context) {
        String configured = prefs(context).getString(TIME_ZONE, DEVICE_TIME_ZONE);
        return DEVICE_TIME_ZONE.equals(configured) ? TimeZone.getDefault().getID() : configured;
    }

    static String timeZonePreference(Context context) {
        return prefs(context).getString(TIME_ZONE, DEVICE_TIME_ZONE);
=======
    static String timeZone(Context context) {
        return prefs(context).getString(TIME_ZONE, DEFAULT_TIME_ZONE);
>>>>>>> origin/main
    }

    static void setTimeZone(Context context, String zoneId) {
        prefs(context).edit().putString(TIME_ZONE, zoneId).apply();
    }

<<<<<<< HEAD
=======
    static boolean showCounters(Context context) {
        return prefs(context).getBoolean(SHOW_COUNTERS, true);
    }

    static void setShowCounters(Context context, boolean value) {
        prefs(context).edit().putBoolean(SHOW_COUNTERS, value).apply();
    }

>>>>>>> origin/main
    static boolean notifications(Context context) {
        return prefs(context).getBoolean(NOTIFICATIONS, true);
    }

    static void setNotifications(Context context, boolean value) {
        prefs(context).edit().putBoolean(NOTIFICATIONS, value).apply();
    }

<<<<<<< HEAD
=======
    static boolean animations(Context context) {
        return prefs(context).getBoolean(ANIMATIONS, true);
    }

    static void setAnimations(Context context, boolean value) {
        prefs(context).edit().putBoolean(ANIMATIONS, value).apply();
    }

    static int widgetStyle(Context context) {
        int value = prefs(context).getInt(WIDGET_STYLE, 2);
        if (value < 0 || value >= STYLE_NAMES.length) return 2;
        return value;
    }

    static void setWidgetStyle(Context context, int value) {
        prefs(context).edit().putInt(WIDGET_STYLE, value).apply();
    }

>>>>>>> origin/main
    static int unread(Context context) {
        return prefs(context).getInt(UNREAD, 0);
    }

    static int missed(Context context) {
        return prefs(context).getInt(MISSED, 0);
    }

    static void saveCounts(Context context, int unread, int missed) {
        prefs(context).edit().putInt(UNREAD, unread).putInt(MISSED, missed).apply();
    }

<<<<<<< HEAD
    static void markSyncSucceeded(Context context) {
        prefs(context).edit().putLong(LAST_SYNC, System.currentTimeMillis()).apply();
    }

    static boolean isOnline(Context context) {
        long lastSync = prefs(context).getLong(LAST_SYNC, 0);
        return lastSync > 0 && System.currentTimeMillis() - lastSync < 20 * 60 * 1000L;
    }

=======
>>>>>>> origin/main
    /** Momento desde el que se cuentan llamadas perdidas (última vez que se abrió la app). */
    static long callsSeenAt(Context context) {
        return prefs(context).getLong(CALLS_SEEN_AT, 0);
    }

    /** Marca las llamadas perdidas como vistas y pone su contador a cero. */
    static void markCallsSeen(Context context) {
        prefs(context).edit()
                .putLong(CALLS_SEEN_AT, System.currentTimeMillis())
                .putInt(MISSED, 0)
                .putInt(NOTIFIED_MISSED, 0)
                .apply();
    }

    static long notifiedMessageTimestamp(Context context) {
        return prefs(context).getLong(NOTIFIED_MSG_TS, 0);
    }

    static void setNotifiedMessageTimestamp(Context context, long value) {
        prefs(context).edit().putLong(NOTIFIED_MSG_TS, value).apply();
    }

    static int notifiedMissed(Context context) {
        return prefs(context).getInt(NOTIFIED_MISSED, 0);
    }

    static void setNotifiedMissed(Context context, int value) {
        prefs(context).edit().putInt(NOTIFIED_MISSED, value).apply();
    }
}
