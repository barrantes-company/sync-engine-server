package com.barrantesco.syncengine;

import android.content.Context;
import android.graphics.Bitmap;

/** Adaptador de compatibilidad; todas las variantes delegan en un solo renderizador. */
final class WidgetFaces {
    private WidgetFaces() {}

    /** Conserva la firma histórica y dirige la representación al diseño OLED unificado. */
    static Bitmap render(Context context, int kind, int width, int height, String zone,
                         boolean use24h, int unread, int missed, boolean signedIn) {
        String file = AppSettings.receivedFile(context);
        if (file.isEmpty() && "file".equals(AppSettings.latestType(context))) {
            file = "Archivo recibido";
        }
        return WidgetRenderer.render(context, kind, width, height, zone, use24h, signedIn,
                signedIn ? unread : 0, signedIn ? missed : 0,
                signedIn ? AppSettings.lastSync(context) : 0L,
                file, signedIn ? AppSettings.clipboardState(context) : "");
    }
}
