package com.barrantesco.syncengine;

import android.content.Context;
import android.content.SharedPreferences;

import java.net.URI;
import java.net.URISyntaxException;

final class WidgetUrls {
    static final String PREFERENCES = "widget_settings";
    private static final String DEFAULT_URL = "default_widget_url";

    private WidgetUrls() {
    }

    /**
     * Devuelve la URL predeterminada: la guardada por el usuario o, si no hay,
     * la configurada en el build mediante SYNC_DEFAULT_URL.
     */
    static String defaultUrl(Context context) {
        String saved = preferences(context).getString(DEFAULT_URL, "");
        return saved.isEmpty() ? BuildConfig.DEFAULT_WIDGET_URL : saved;
    }

    static void saveDefaultUrl(Context context, String url) {
        preferences(context).edit().putString(DEFAULT_URL, url).apply();
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
}
