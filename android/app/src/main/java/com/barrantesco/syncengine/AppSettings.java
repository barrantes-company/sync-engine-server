package com.barrantesco.syncengine;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.format.DateFormat;

import java.util.TimeZone;

/**
 * Preferencias de la app: opciones del widget, sesión y caché de contadores.
 * La sesión solo guarda el token (nunca la contraseña) en almacenamiento privado.
 */
final class AppSettings {
    static final String DEFAULT_TIME_ZONE = "America/Lima";
    /** Sentinel: seguir la zona horaria del dispositivo en lugar de una fija. */
    static final String DEVICE_ZONE = "device";
    private static final String FILE = "sync_state";

    private static final String TOKEN = "token";
    private static final String FCM_TOKEN = "fcm_token";
    private static final String USER_NAME = "user_name";
    private static final String USE_24H = "use_24h";
    private static final String USE_24H_AUTO = "use_24h_auto";
    private static final String TIME_ZONE = "time_zone";
    private static final String SHOW_COUNTERS = "show_counters";
    private static final String NOTIFICATIONS = "notifications";
    private static final String ANIMATIONS = "animations";
    private static final String UNREAD = "unread";
    private static final String MISSED = "missed";
    private static final String CALLS_SEEN_AT = "calls_seen_at";
    private static final String NOTIFIED_MSG_TS = "notified_msg_ts";
    private static final String NOTIFIED_MISSED = "notified_missed";
    private static final String RECEIVED_FILE = "received_file";
    private static final String CLIPBOARD_STATE = "clipboard_state";
    private static final String LATEST_FROM = "latest_from";
    private static final String LATEST_TEXT = "latest_text";
    private static final String LATEST_TYPE = "latest_type";
    private static final String LATEST_TIMESTAMP = "latest_timestamp";
    private static final String BANNER_UNTIL = "banner_until";
    private static final String BANNER_TS = "banner_ts";
    private static final String LAST_SYNC = "last_sync";

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
                .remove(LATEST_FROM)
                .remove(LATEST_TEXT)
                .remove(LATEST_TYPE)
                .remove(LATEST_TIMESTAMP)
                .remove(BANNER_UNTIL)
                .remove(BANNER_TS)
                .remove(LAST_SYNC)
                .apply();
    }

    static String fcmToken(Context context) {
        return prefs(context).getString(FCM_TOKEN, "");
    }

    static void saveFcmToken(Context context, String token) {
        prefs(context).edit().putString(FCM_TOKEN, token).apply();
    }

    static boolean use24h(Context context) {
        if (auto24h(context)) return DateFormat.is24HourFormat(context);
        return prefs(context).getBoolean(USE_24H, true);
    }

    static void setUse24h(Context context, boolean value) {
        prefs(context).edit().putBoolean(USE_24H, value).putBoolean(USE_24H_AUTO, false).apply();
    }

    /** Cuando está activo, el formato 12/24 sigue al dispositivo. */
    static boolean auto24h(Context context) {
        return prefs(context).getBoolean(USE_24H_AUTO, true);
    }

    static void setAuto24h(Context context, boolean value) {
        prefs(context).edit().putBoolean(USE_24H_AUTO, value).apply();
    }

    static String timeZone(Context context) {
        return prefs(context).getString(TIME_ZONE, DEVICE_ZONE);
    }

    static void setTimeZone(Context context, String zoneId) {
        prefs(context).edit().putString(TIME_ZONE, zoneId).apply();
    }

    /** Zona efectiva: la del dispositivo en modo automático, o la elegida manualmente. */
    static String effectiveTimeZone(Context context) {
        String zone = timeZone(context);
        if (zone == null || zone.isEmpty() || DEVICE_ZONE.equals(zone)) {
            return TimeZone.getDefault().getID();
        }
        return zone;
    }

    static boolean showCounters(Context context) {
        return prefs(context).getBoolean(SHOW_COUNTERS, true);
    }

    static void setShowCounters(Context context, boolean value) {
        prefs(context).edit().putBoolean(SHOW_COUNTERS, value).apply();
    }

    static boolean notifications(Context context) {
        return prefs(context).getBoolean(NOTIFICATIONS, true);
    }

    static void setNotifications(Context context, boolean value) {
        prefs(context).edit().putBoolean(NOTIFICATIONS, value).apply();
    }

    static boolean animations(Context context) {
        return prefs(context).getBoolean(ANIMATIONS, true);
    }

    static void setAnimations(Context context, boolean value) {
        prefs(context).edit().putBoolean(ANIMATIONS, value).apply();
    }

    static int unread(Context context) {
        return prefs(context).getInt(UNREAD, 0);
    }

    static int missed(Context context) {
        return prefs(context).getInt(MISSED, 0);
    }

    static void saveCounts(Context context, int unread, int missed) {
        prefs(context).edit().putInt(UNREAD, unread).putInt(MISSED, missed).apply();
    }

    static void saveLatest(Context context, ApiClient.Summary summary) {
        SharedPreferences.Editor editor = prefs(context).edit()
                .putLong(LAST_SYNC, System.currentTimeMillis());
        if (!summary.latest.isEmpty()) {
            ApiClient.UnreadMessage message = summary.latest.get(0);
            editor.putString(LATEST_FROM, message.fromName)
                    .putString(LATEST_TEXT, message.text)
                    .putString(LATEST_TYPE, message.type)
                    .putLong(LATEST_TIMESTAMP, message.timestamp);
        } else {
            editor.remove(LATEST_FROM)
                    .remove(LATEST_TEXT)
                    .remove(LATEST_TYPE)
                    .remove(LATEST_TIMESTAMP);
        }
        editor.apply();
    }

    static String latestFrom(Context context) {
        return prefs(context).getString(LATEST_FROM, "");
    }

    static String latestText(Context context) {
        return prefs(context).getString(LATEST_TEXT, "");
    }

    static String latestType(Context context) {
        return prefs(context).getString(LATEST_TYPE, "text");
    }

    /** Fin de la ventana del pop-up del remitente (epoch ms); 0 si no hay pop-up activo. */
    static long bannerUntil(Context context) {
        return prefs(context).getLong(BANNER_UNTIL, 0);
    }

    static void setBannerUntil(Context context, long value) {
        prefs(context).edit().putLong(BANNER_UNTIL, value).apply();
    }

    /** Timestamp del último mensaje que activó el pop-up, para no reactivarlo en cada sync. */
    static long bannerTimestamp(Context context) {
        return prefs(context).getLong(BANNER_TS, 0);
    }

    static void setBannerTimestamp(Context context, long value) {
        prefs(context).edit().putLong(BANNER_TS, value).apply();
    }

    static long lastSync(Context context) {
        return prefs(context).getLong(LAST_SYNC, 0);
    }

    /** Archivo recibido más reciente (texto corto o vacío). */
    static String receivedFile(Context context) {
        return prefs(context).getString(RECEIVED_FILE, "");
    }

    static void setReceivedFile(Context context, String value) {
        prefs(context).edit().putString(RECEIVED_FILE, value == null ? "" : value).apply();
    }

    /** Estado del portapapeles (texto corto o vacío). */
    static String clipboardState(Context context) {
        return prefs(context).getString(CLIPBOARD_STATE, "");
    }

    static void setClipboardState(Context context, String value) {
        prefs(context).edit().putString(CLIPBOARD_STATE, value == null ? "" : value).apply();
    }

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
