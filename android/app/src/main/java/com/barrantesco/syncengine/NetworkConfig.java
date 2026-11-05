package com.barrantesco.syncengine;

/** Endpoints de red del cliente nativo según la variante compilada. */
final class NetworkConfig {
    static final String HTTP_BASE_URL = BuildConfig.DEBUG
            ? "http://10.0.2.2:3000/"
            : "https://sync-engine-server.onrender.com/";
    static final String WS_URL = BuildConfig.DEBUG
            ? "ws://10.0.2.2:3000/ws"
            : "wss://sync-engine-server.onrender.com/ws";

    private NetworkConfig() {
    }
}
