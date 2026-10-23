package com.barrantesco.syncengine;

import android.content.Context;
import android.content.SharedPreferences;

import java.net.URI;
import java.net.URISyntaxException;

final class WidgetUrls {
    static final String PREFERENCES = "widget_settings";
    private static final String DEFAULT_URL = "default_widget_url";
    private static final String WIDGET_URL_PREFIX = "widget_url_";

    private WidgetUrls() {
    }

    /**
     * Devuelve la URL predeterminada: la guardada por el usuario o, si no hay,
     * la configurada en el build mediante SYNC_DEFAULT_URL.
     */
    static String defaultUrl(Context context) {
        String saved = preferences(context).getString(DEFAULT_URL, "");
<<<<<<< HEAD
        String url = saved.isEmpty() ? BuildConfig.DEFAULT_WIDGET_URL : saved;
        if (url.contains("10.0.2.2") && !isEmulator()) {
            return "file:///android_asset/index.html";
        }
        return url;
    }

    private static boolean isEmulator() {
        return android.os.Build.FINGERPRINT.startsWith("generic")
                || android.os.Build.FINGERPRINT.startsWith("unknown")
                || android.os.Build.MODEL.contains("google_sdk")
                || android.os.Build.MODEL.contains("Emulator")
                || android.os.Build.MODEL.contains("Android SDK built for x86");
=======
        return saved.isEmpty() ? BuildConfig.DEFAULT_WIDGET_URL : saved;
>>>>>>> origin/main
    }

    static void saveDefaultUrl(Context context, String url) {
        preferences(context).edit().putString(DEFAULT_URL, url).apply();
    }

    static String widgetUrl(Context context, int widgetId) {
        return preferences(context).getString(widgetKey(widgetId), defaultUrl(context));
    }

    static void saveWidgetUrl(Context context, int widgetId, String url) {
        preferences(context).edit().putString(widgetKey(widgetId), url).apply();
    }

    /**
     * Devuelve la URL de la app principal. Si la URL termina en /widget.html
     * (configuración antigua) se usa la raíz del dominio.
     */
    static String appUrl(String widgetUrl) {
        try {
            URI uri = new URI(widgetUrl.trim());
            String path = uri.getPath();
            if (path == null || path.isEmpty() || path.endsWith("/widget.html")) {
                return new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(), "/", null, null).toString();
            }
            return uri.toString();
        } catch (URISyntaxException exception) {
            return widgetUrl;
        }
    }

    /** Devuelve solo esquema, host y puerto (sin barra final), base de las llamadas a la API. */
    static String origin(String url) {
        try {
            URI uri = new URI(url.trim());
            return new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(), null, null, null).toString();
        } catch (URISyntaxException exception) {
            return url;
        }
    }

    static boolean isWidgetUrl(String value) {
        if (value == null || value.trim().isEmpty()) {
            return false;
        }
        try {
            URI uri = new URI(value.trim());
            String scheme = uri.getScheme();
            return uri.isAbsolute()
                    && ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                    && uri.getHost() != null
                    && uri.getUserInfo() == null;
        } catch (URISyntaxException exception) {
            return false;
        }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private static String widgetKey(int widgetId) {
        return WIDGET_URL_PREFIX + widgetId;
    }
}
