package com.barrantesco.syncengine;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Cliente HTTP mínimo del servidor SYNC ENGINE. Debe usarse fuera del hilo principal. */
final class ApiClient {
    private static final int TIMEOUT_MS = 15000;

    private ApiClient() {
    }

    /** La sesión fue rechazada por el servidor (token caducado o credenciales inválidas). */
    static final class AuthException extends IOException {
        AuthException(String message) {
            super(message);
        }
    }

    /** Mensaje sin leer devuelto por el resumen. */
    static final class UnreadMessage {
        final String fromName;
        final String text;
        final String type;
        final long timestamp;

        UnreadMessage(String fromName, String text, String type, long timestamp) {
            this.fromName = fromName;
            this.text = text;
            this.type = type;
            this.timestamp = timestamp;
        }
    }

    /** Resumen de actividad para el widget. */
    static final class Summary {
        int unreadMessages;
        int missedCalls;
        final java.util.List<UnreadMessage> latest = new java.util.ArrayList<>();
    }

    /** Resultado del inicio de sesión. */
    static final class Session {
        final String token;
        final String displayName;

        Session(String token, String displayName) {
            this.token = token;
            this.displayName = displayName;
        }
    }

    /**
     * Inicia sesión con usuario y contraseña.
     * @param origin Origen del servidor, por ejemplo https://dominio.example.
     */
    static Session login(String origin, String username, String password)
            throws IOException, JSONException {
        JSONObject body = new JSONObject().put("username", username).put("password", password);
        JSONObject json = request("POST", origin + "/api/auth/login", null, body.toString());
        JSONObject user = json.optJSONObject("user");
        String name = user != null ? user.optString("formattedName", username) : username;
        return new Session(json.getString("token"), name);
    }

    /** Obtiene mensajes sin leer y llamadas perdidas desde {@code callsSince}. */
    static Summary summary(String origin, String token, long callsSince)
            throws IOException, JSONException {
        JSONObject json = request("GET", origin + "/api/widget/summary?callsSince=" + callsSince,
                token, null);
        Summary summary = new Summary();
        summary.unreadMessages = json.optInt("unreadMessages");
        summary.missedCalls = json.optInt("missedCalls");
        JSONArray latest = json.optJSONArray("latest");
        if (latest != null) {
            for (int i = 0; i < latest.length(); i++) {
                JSONObject item = latest.getJSONObject(i);
                summary.latest.add(new UnreadMessage(
                        item.optString("fromName"),
                        item.optString("text"),
                        item.optString("type", "text"),
                        item.optLong("timestamp")));
            }
        }
        return summary;
    }

    private static JSONObject request(String method, String address, String token, String body)
            throws IOException, JSONException {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestProperty("Accept", "application/json");
            if (token != null) {
                connection.setRequestProperty("Authorization", "Bearer " + token);
            }
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String text = stream == null ? "" : read(stream);
            if (status == 401) {
                throw new AuthException(errorMessage(text, "Sesión no válida"));
            }
            if (status >= 400) {
                throw new IOException(errorMessage(text, "Error " + status));
            }
            return new JSONObject(text);
        } finally {
            connection.disconnect();
        }
    }

    private static String errorMessage(String text, String fallback) {
        try {
            return new JSONObject(text).optString("error", fallback);
        } catch (JSONException exception) {
            return fallback;
        }
    }

    private static String read(InputStream stream) throws IOException {
        try (InputStream in = stream) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = in.read(buffer)) != -1) {
                out.write(buffer, 0, count);
            }
            return out.toString("UTF-8");
        }
    }
}
