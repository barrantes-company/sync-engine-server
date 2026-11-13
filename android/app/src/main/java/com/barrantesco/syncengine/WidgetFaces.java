package com.barrantesco.syncengine;

import android.content.Context;
import android.graphics.Bitmap;

/** Adaptador de compatibilidad; todas las variantes delegan en un solo renderizador. */
final class WidgetFaces {
    private WidgetFaces() {}

    /** Conserva la firma histórica y dirige la representación al diseño OLED unificado. */
    static Bitmap render(Context context, int kind, int width, int height, String zone,
                         boolean use24h, int unread, int missed, boolean signedIn) {
        return WidgetRenderer.render(context, width, height, kind, 0);
    }
}
