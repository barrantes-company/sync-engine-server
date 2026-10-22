package com.barrantesco.syncengine;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Muestra la interfaz principal de SYNC ENGINE dentro de la aplicación Android. */
public final class WebAppActivity extends Activity {
    private WebView webView;
    private String pendingConversationId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setDatabaseEnabled(true);

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (pendingConversationId != null) {
                    openConversation(pendingConversationId);
                    pendingConversationId = null;
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (request != null && request.getResources() != null) {
                        request.grant(request.getResources());
                    }
                });
            }
        });
        setContentView(webView);

        // Solicitar permisos de notificación en Android 13+
        requestNotificationPermission();

        // Obtener y registrar el token FCM en el inicio de la app
        FcmRegistration.registerCurrentDevice(this);

        handleIntent(getIntent());

        String appUrl = WidgetUrls.appUrl(WidgetUrls.defaultUrl(this));
        
        // En teléfonos físicos donde 10.0.2.2 no existe, cargar directamente los assets locales empaquetados en la APK
        if ((appUrl.contains("10.0.2.2") && !isEmulator()) || !WidgetUrls.isWidgetUrl(appUrl)) {
            appUrl = "file:///android_asset/index.html";
        }

        webView.loadUrl(appUrl);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String conversationId = intent.getStringExtra("conversationId");
        if (conversationId == null || conversationId.isEmpty()) {
            conversationId = intent.getStringExtra("syncId");
        }
        if (conversationId != null && !conversationId.isEmpty()) {
            pendingConversationId = conversationId;
            openConversation(conversationId);
        }
    }

    private void openConversation(String conversationId) {
        if (webView == null || conversationId == null || conversationId.isEmpty()) {
            return;
        }
        String safeId = conversationId.replace("\\", "\\\\").replace("'", "\\'");
        String js = "(function() {" +
                "  if (typeof window.openConversationById === 'function') {" +
                "    window.openConversationById('" + safeId + "');" +
                "  } else if (typeof selectContact === 'function') {" +
                "    selectContact('" + safeId + "');" +
                "  }" +
                "})();";
        webView.evaluateJavascript(js, null);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
        }
    }

    private boolean isEmulator() {
        return android.os.Build.FINGERPRINT.startsWith("generic")
                || android.os.Build.FINGERPRINT.startsWith("unknown")
                || android.os.Build.MODEL.contains("google_sdk")
                || android.os.Build.MODEL.contains("Emulator")
                || android.os.Build.MODEL.contains("Android SDK built for x86");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    public final class AndroidBridge {
        @JavascriptInterface
        public void onUserAuthenticated(String syncId, String username) {
            if (syncId == null || syncId.isEmpty()) return;
            AppSettings.saveSession(WebAppActivity.this, AppSettings.token(WebAppActivity.this), syncId);
            FcmRegistration.onUserAuthenticated(WebAppActivity.this, syncId);
        }
    }
}
