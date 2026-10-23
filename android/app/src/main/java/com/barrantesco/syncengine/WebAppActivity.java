package com.barrantesco.syncengine;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
<<<<<<< HEAD
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
=======
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/**
 * Main Android entry point. Loads the official SYNC ENGINE web application;
 * widget configuration remains a separate activity.
 */
public final class WebAppActivity extends Activity {
    private static final int MEDIA_PERMISSION = 42;
    private WebView webView;
    private ProgressBar progress;
    private TextView errorMessage;
    private PermissionRequest pendingMedia;
>>>>>>> origin/main

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
<<<<<<< HEAD
=======
        buildView();
        loadOfficialApp();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadOfficialApp();
    }

    private void buildView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(3)));
>>>>>>> origin/main

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
<<<<<<< HEAD
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
=======
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " SYNCENGINE-Android");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override public void onPermissionRequest(PermissionRequest request) {
                if (hasMediaPermission(request)) {
                    request.grant(request.getResources());
                    return;
                }
                pendingMedia = request;
                requestPermissions(missingMediaPermissions(request), MEDIA_PERMISSION);
            }

            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (request == pendingMedia) pendingMedia = null;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme));
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showLoadError();
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        errorMessage = new TextView(this);
        errorMessage.setText("No se pudo conectar con SYNC ENGINE. Comprueba tu conexión e inténtalo de nuevo.");
        errorMessage.setTextColor(Color.rgb(10, 26, 58));
        errorMessage.setTextSize(16);
        errorMessage.setGravity(Gravity.CENTER);
        errorMessage.setPadding(dp(24), dp(24), dp(24), dp(24));
        errorMessage.setVisibility(View.GONE);
        errorMessage.setOnClickListener(v -> loadOfficialApp());
        root.addView(errorMessage, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        setContentView(root);
    }

    private void loadOfficialApp() {
        errorMessage.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        String configured = WidgetUrls.defaultUrl(this);
        String appUrl = WidgetUrls.appUrl(configured);
        if (!WidgetUrls.isWidgetUrl(appUrl)) {
            appUrl = "https://sync-engine-server.onrender.com/";
        }
        String view = getIntent() == null ? null : getIntent().getStringExtra(OpenAppActivity.EXTRA_WIDGET_VIEW);
        if ("chats".equals(view) || "calls".equals(view)) {
            appUrl = Uri.parse(appUrl).buildUpon()
                    .appendQueryParameter("widgetView", view)
                    .build()
                    .toString();
        }
        webView.loadUrl(appUrl);
    }

    private void showLoadError() {
        errorMessage.setVisibility(View.VISIBLE);
    }

    @Override protected void onStart() {
        super.onStart();
        SyncWidgetProvider.refreshAll(this);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != MEDIA_PERMISSION || pendingMedia == null) return;
        PermissionRequest request = pendingMedia;
        pendingMedia = null;
        if (hasMediaPermission(request)) request.grant(request.getResources());
        else request.deny();
    }

    private boolean hasMediaPermission(PermissionRequest request) {
        return missingMediaPermissions(request).length == 0;
    }

    private String[] missingMediaPermissions(PermissionRequest request) {
        List<String> missing = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                missing.add(Manifest.permission.CAMERA);
            }
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                missing.add(Manifest.permission.RECORD_AUDIO);
            }
        }
        return missing.toArray(new String[0]);
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
>>>>>>> origin/main
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

<<<<<<< HEAD
    public final class AndroidBridge {
        @JavascriptInterface
        public void onUserAuthenticated(String syncId, String username) {
            if (syncId == null || syncId.isEmpty()) return;
            AppSettings.saveSession(WebAppActivity.this, AppSettings.token(WebAppActivity.this), syncId);
            FcmRegistration.onUserAuthenticated(WebAppActivity.this, syncId);
        }
    }
}
=======
    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
>>>>>>> origin/main
