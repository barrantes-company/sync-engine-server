package com.barrantesco.syncengine;

/** Endpoints de red del cliente nativo apuntando a produccion en Render. */
final class NetworkConfig {
    static final String HTTP_BASE_URL = "https://sync-engine-server.onrender.com/";
    static final String WS_URL = "wss://sync-engine-server.onrender.com/ws";

    private NetworkConfig() {
    }
}