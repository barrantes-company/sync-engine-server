require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// ==== Web Push Setup ====
const webPush = require('web-push');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@syncengine.local';
let webPushConfigured = false;
try {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY no están configuradas");
  }
  webPush.setVapidDetails(
    VAPID_EMAIL,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  webPushConfigured = true;
} catch (err) {
  const message = process.env.NODE_ENV === "production"
    ? "[Push] Web Push deshabilitado; el servidor continuará sin notificaciones push."
    : "[Push] Web Push deshabilitado: configure claves VAPID válidas.";
  console.warn(message, err.message);
}

// Helper to store subscription per syncId (multiple devices allowed)
function storeSubscription(syncId, subscription) {
  const dbData = db.readDb ? db.readDb() : db.readDb(); // Ensure db is loaded
  if (!dbData.subscriptions) dbData.subscriptions = {};
  if (!Array.isArray(dbData.subscriptions[syncId])) {
    dbData.subscriptions[syncId] = [];
  }
  // Avoid duplicates based on endpoint
  const exists = dbData.subscriptions[syncId].some(sub => sub.endpoint === subscription.endpoint);
  if (!exists) {
    dbData.subscriptions[syncId].push(subscription);
    db.writeDb(dbData);
  }
}

// ==== FCM Mobile Push Setup ====
let firebaseAdmin = null;
try {
  firebaseAdmin = require("firebase-admin");
  if (!firebaseAdmin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(sa)
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.applicationDefault()
      });
    }
  }
} catch (e) {
  // firebase-admin no instalado o no configurado aún; punto de envío desacoplado
}

async function sendFcmNotification(syncId, payload) {
  const tokens = db.getMobilePushTokens ? db.getMobilePushTokens(syncId) : [];
  if (!tokens || tokens.length === 0) return;

  const dataPayload = {};
  if (payload.data) {
    for (const [k, v] of Object.entries(payload.data)) {
      if (v !== undefined && v !== null) {
        dataPayload[k] = String(v);
      }
    }
  }
  const fromSyncId = dataPayload.fromSyncId || "";
  if (!dataPayload.conversationId && fromSyncId) {
    dataPayload.conversationId = fromSyncId;
  }
  if (!dataPayload.title && payload.title) dataPayload.title = String(payload.title);
  if (!dataPayload.body && payload.body) dataPayload.body = String(payload.body);

  if (firebaseAdmin && firebaseAdmin.apps && firebaseAdmin.apps.length > 0) {
    const registrationTokens = tokens.map((t) => t.token);
    try {
      const response = await firebaseAdmin.messaging().sendEachForMulticast({
        tokens: registrationTokens,
        notification: {
          title: payload.title || "SYNC ENGINE",
          body: payload.body || "Nuevo mensaje recibido"
        },
        data: dataPayload
      });
      if (response && response.responses) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const code = resp.error.code;
            if (code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token") {
              db.removeMobilePushToken(syncId, registrationTokens[idx]);
            }
          }
        });
      }
    } catch (err) {
      console.warn("[FCM] Error al enviar notificación:", err.message);
    }
  } else {
    if (process.env.NODE_ENV !== "test") {
      console.log(`[FCM] Notificación preparada para ${syncId} (${tokens.length} token(s)):`, payload.title);
    }
  }
}

// Helper to send push notification to all stored subscriptions (Web Push & FCM) for a syncId
async function sendPushNotification(syncId, payload) {
  const fcmPromise = sendFcmNotification(syncId, payload).catch((err) => {
    console.warn("[FCM] Falló envío:", err.message);
  });

  if (!webPushConfigured) {
    await fcmPromise;
    return;
  }

  const dbData = db.readDb();
  const subs = (dbData.subscriptions && dbData.subscriptions[syncId]) || [];
  const expiredEndpoints = new Set();
  const payloadStr = JSON.stringify(payload);

  const promises = subs.map((sub) =>
    webPush.sendNotification(sub, payloadStr).catch((err) => {
      if (err.statusCode === 410 || err.statusCode === 404) {
        expiredEndpoints.add(sub.endpoint);
      } else {
        console.warn(`[Push Error] Fallo al entregar push a ${syncId}:`, err.message);
      }
    })
  );

  await Promise.all([...promises, fcmPromise]);

  // Limpieza atómica en disco solo si hubo suscripciones expiradas
  if (expiredEndpoints.size > 0) {
    dbData.subscriptions[syncId] = subs.filter((s) => !expiredEndpoints.has(s.endpoint));
    await db.writeDb(dbData);
    console.log(`[Push Cleanup] Se removieron ${expiredEndpoints.size} suscripciones caducadas para ${syncId}`);
  }
}
// ==== End of Web Push Additions ====

// ==== Firebase Cloud Messaging for native Android ====
let firebaseMessaging = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });
    firebaseMessaging = getMessaging(app);
  } else if (process.env.NODE_ENV === "production") {
    console.warn("[FCM] Notificaciones Android deshabilitadas: falta FIREBASE_SERVICE_ACCOUNT.");
  }
} catch (err) {
  console.error("[FCM] No se pudo configurar Firebase Admin:", err.message);
}

/**
 * Envía una notificación push a los dispositivos Android del usuario.
 * No incluye tokens de acceso ni ofertas WebRTC en el payload.
 * @param {string} syncId Usuario destinatario.
 * @param {{title:string,body:string,type:string}} payload Notificación visible y tipo.
 */
async function sendMobilePushNotification(syncId, payload) {
  if (!firebaseMessaging) return;
  const tokens = db.getMobilePushTokens(syncId);
  if (!tokens.length) return;
  const stale = [];
  await Promise.all(tokens.map(async ({ token }) => {
    try {
      await firebaseMessaging.send({
        token,
        data: {
          title: String(payload.title || "SYNC ENGINE").slice(0, 120),
          body: String(payload.body || "").slice(0, 240),
          type: String(payload.type || "message"),
          syncId: String(syncId)
        },
        android: { priority: "high" }
      });
    } catch (err) {
      if (err.code === "messaging/registration-token-not-registered" ||
          err.code === "messaging/invalid-registration-token") {
        stale.push(token);
      } else {
        console.warn("[FCM] Falló el envío a un dispositivo:", err.message);
      }
    }
  }));
  for (const token of stale) db.removeMobilePushToken(syncId, token);
}

// ==== End of Firebase Cloud Messaging ====
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Server } = require("socket.io");
const selfsigned = require("selfsigned");
const db = require("./db");
const { safeUrl } = require("./public/safe-content");
const { createMetadataFetcher } = require("./metadata-fetch");
const fetchMetadata = createMetadataFetcher();
const { deliver } = require("./pubsub-routing");

const asyncHandler = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const configuredCorsOrigins = new Set(String(process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean));

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) return true;
  return configuredCorsOrigins.has(origin);
}

function getLocalIPv4Addresses() {
  const nets = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(nets)) {
    const netList = nets[name] || [];
    for (let i = 0; i < netList.length; i++) {
      const net = netList[i];
      const isIPv4 = net.family === 4 || net.family === "IPv4";
      if (isIPv4 && !net.internal) {
        addresses.push({ name: name, address: net.address });
      }
    }
  }

  return addresses;
}

let shuttingDown = false;
let stopPubSub = null;
const messageTasks = new Set();
const app = express();
app.use((_req, res, next) => shuttingDown
  ? res.status(503).json({ error: "Servidor cerrando" }) : next());
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  next();
});

const authAttempts = new Map();
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 5;
const AUTH_MAX_TRACKED_IPS = 10000;

function authRateLimit(req, res, next) {
  const now = Date.now();
  for (const [ip, attempt] of authAttempts) {
    if (attempt.resetAt <= now) authAttempts.delete(ip);
  }
  const key = req.ip || req.socket?.remoteAddress || "unknown";
  const current = authAttempts.get(key);
  if (!current || current.resetAt <= now) {
    if (authAttempts.size >= AUTH_MAX_TRACKED_IPS) {
      const oldestKey = authAttempts.keys().next().value;
      if (oldestKey !== undefined) authAttempts.delete(oldestKey);
    }
    authAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return next();
  }
  if (current.count >= AUTH_MAX_ATTEMPTS) {
    res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
    return res.status(429).json({ error: "Demasiados intentos de autenticación; inténtalo en 15 minutos." });
  }
  current.count += 1;
  next();
}

const allowedOrigins = new Set(
  String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || origin === "null" || origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) {
      return callback(null, true);
    }
    if (allowedOrigins.has(origin) || configuredCorsOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origen no permitido por CORS"));
  },
  credentials: true
};
app.use(cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));
app.use(
  "/.well-known",
  express.static(path.join(__dirname, "public", ".well-known"), {
    dotfiles: "allow",
    setHeaders: (res) => res.setHeader("Content-Type", "application/json; charset=utf-8")
  })
);
// Intercept normalized/encoded upload paths BEFORE the public static middleware.
// No alternate static spelling may expose the physical file without authorization.
app.use((req, res, next) => {
  let pathname;
  try {
    pathname = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, "/"));
  } catch (_) {
    return res.status(400).json({ error: "Ruta no válida" });
  }
  const parts = pathname.split("/").filter(Boolean);
  if (pathname.includes(":")) return res.status(400).json({ error: "Ruta no válida" });
  if ((parts[0] || "").replace(/[. ]+$/, "").toLowerCase() !== "uploads") return next();
  res.setHeader("Cache-Control", "private, no-store");
  requireFileAuth(req, res, () => {
    const file = parts.length === 2 ? db.getFileByFilename(parts[1]) : null;
    servePrivateFile(req, res, file);
  });
});

// Servir widget universal con cabeceras para iframe y paneles laterales de extensiones
app.get(["/widget", "/widget.html", "/public/widget.html"], (req, res) => {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' chrome-extension:* moz-extension:*"
  );
  res.sendFile("widget.html", { root: path.join(__dirname, "public") });
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/src/assets/images", express.static(path.join(__dirname, "src/assets/images")));
// Manejador global de errores: Responder 400 Bad Request para JSON malformado y 403 para bloqueos CORS
app.use((err, req, res, next) => {
  if (req.path === "/api/save-subscription" && err instanceof SyntaxError && err.status === 400) {
    return res.status(500).json({ ok: false, error: "Error al procesar el payload de suscripción" });
  }
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Payload JSON malformado o inválido" });
  }
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({ error: "Petición bloqueada por política de origen (CORS)" });
  }
  console.error("[Server Unhandled Error]:", err);
  return res.status(500).json({ error: "Error interno del servidor" });
});
// Directorio y almacenamiento Multer para documentos y archivos pesados (hasta 2 GB sin compresión)
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, "public", "uploads"));
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 20);
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const MAX_STANDARD_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_PREMIUM_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024,
    files: 1,
    fields: 8,
    fieldSize: 64 * 1024,
    parts: 12
  },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname || file.originalname.length > 255) {
      return cb(new Error("Nombre de archivo inválido"));
    }
    cb(null, true);
  }
});

function uploadSingleFileForPlan(req, res, next) {
  const plan = String(req.user?.plan || "free").trim().toLowerCase();
  const maxBytes = plan === "enterprise" || plan === "pro"
    ? MAX_PREMIUM_UPLOAD_BYTES
    : MAX_STANDARD_UPLOAD_BYTES;

  multer({
    storage: storage,
    limits: { fileSize: maxBytes }
  }).single("file")(req, res, (err) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "El archivo supera el límite del plan" });
    }
    return next(err);
  });
}

// Middleware de Autenticación
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de sesión requerido" });
  }

  const token = authHeader.slice(7).trim();
  const user = db.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: "Sesión expirada o inválida" });
  }

  req.user = user;
  next();
}

const FILE_COOKIE = "sync_engine_file_auth";
const FILE_COOKIE_PATHS = ["/api/files", "/uploads"];

function fileCookieOptions(req, cookiePath) {
  return {
    path: cookiePath, httpOnly: true, sameSite: "strict",
    secure: req.secure || String(req.get("x-forwarded-proto") || "").split(",")[0].trim() === "https" ||
      /^https:\/\//i.test(req.get("origin") || "")
  };
}

// Only file routes accept this transport of an EXISTING session token.
// Login/session creation, expiration and other API authentication are unchanged.
function requireFileAuth(req, res, next) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!req.headers.authorization) {
    const cookie = String(req.headers.cookie || "").split(";")
      .map((part) => part.trim()).find((part) => part.startsWith(FILE_COOKIE + "="));
    if (cookie) {
      try { req.headers.authorization = "Bearer " + decodeURIComponent(cookie.slice(FILE_COOKIE.length + 1)); }
      catch (_) { return res.status(401).json({ error: "Credencial de archivo inválida" }); }
    }
  }
  requireAuth(req, res, next);
}

app.post("/api/files/access", requireAuth, (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const token = req.headers.authorization.slice(7).trim();
  for (const cookiePath of FILE_COOKIE_PATHS) res.cookie(FILE_COOKIE, token, fileCookieOptions(req, cookiePath));
  res.json({ ok: true });
});

app.post("/api/files/access/clear", (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  for (const cookiePath of FILE_COOKIE_PATHS) res.clearCookie(FILE_COOKIE, fileCookieOptions(req, cookiePath));
  res.json({ ok: true });
});

function servePrivateFile(req, res, file) {
  if (!file) return res.status(404).json({ error: "Archivo no registrado" });
  if (!db.canReadFile(file.id, req.user.syncId)) return res.status(403).json({ error: "Sin acceso a este archivo" });
  if (!file.filename || /[/\\:\u0000]/.test(file.filename) || [".", ".."].includes(file.filename)) {
    return res.status(404).json({ error: "Archivo no disponible" });
  }
  // Preserve P0-01 protections, streaming and native byte-range handling.
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; script-src 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Authorization, Cookie");
  const inlineMedia = /\.(?:png|jpe?g|gif|webp|avif|bmp|ico|mp4|m4v|mov|webm|mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i.test(file.filename);
  if (!inlineMedia || req.query.download === "1") res.attachment(file.name);
  res.sendFile(file.filename, { root: UPLOADS_DIR, cacheControl: false, acceptRanges: true, dotfiles: "deny" }, (err) => {
    if (!err || res.headersSent) return;
    res.status(err.statusCode || 500).json({ error: "No se pudo leer el archivo" });
  });
}

app.get("/api/files/:fileId", requireFileAuth, (req, res) => {
  servePrivateFile(req, res, db.getFileById(req.params.fileId));
});

function messageFileIds(senderId, references, serverHost) {
  const ids = new Set();
  const origin = new URL("http://" + serverHost);
  for (const reference of references) {
    if (typeof reference !== "string" || !reference) continue;
    const url = new URL(reference, origin);
    if (url.host !== origin.host || !["http:", "https:"].includes(url.protocol)) continue;
    const pathname = path.posix.normalize(decodeURIComponent(url.pathname).replace(/\\/g, "/"));
    const parts = pathname.split("/").filter(Boolean);
    let file;
    if ((parts[0] || "").replace(/[. ]+$/, "").toLowerCase() === "uploads") {
      file = parts.length === 2 ? db.getFileByFilename(parts[1]) : null;
    } else if (parts[0] === "api" && parts[1] === "files") {
      file = parts.length === 3 ? db.getFileById(parts[2]) : null;
    } else continue;
    if (!file || file.ownerId !== senderId) throw new Error("No puedes compartir este archivo");
    ids.add(file.id);
  }
  return [...ids];
}

// Endpoint to receive subscription from client
app.post('/api/notifications/subscribe', requireAuth, (req, res) => {
  const { syncId, subscription } = req.body || {};
  if (!syncId || !subscription) {
    return res.status(400).json({ error: 'syncId y subscription son requeridos' });
  }
  if (String(syncId).trim().toUpperCase() !== req.user.syncId) {
    return res.status(403).json({ error: 'No puedes registrar notificaciones para otro usuario' });
  }
  try {
    storeSubscription(syncId, subscription);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Push] Error storing subscription:', err);
    return res.status(500).json({ error: 'Error interno al guardar suscripción' });
  }
});

app.get('/api/notifications/vapid-public-key', requireAuth, (_req, res) => {
  res.json({ ok: true, configured: webPushConfigured, publicKey: webPushConfigured ? VAPID_PUBLIC_KEY : null });
});



// Extractor de Metadatos OpenGraph y Favicon para Rich Link Cards
async function fetchUrlMetadata(text) {
  if (!text || typeof text !== "string") return null;
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;

  const targetUrl = match[0];
  try {
    const parsed = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    const domain = parsed.hostname;
    const defaultFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

    const response = await fetchMetadata(targetUrl);

    if (!response.ok) {
      return {
        url: targetUrl,
        domain: domain,
        title: domain,
        description: null,
        image: defaultFavicon
      };
    }

    const html = response.body;

    // og:title o <title>
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    // og:description o description
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
                        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);

    // og:image
    const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    const title = ogTitleMatch ? ogTitleMatch[1] : (titleMatch ? titleMatch[1] : domain);
    let image = ogImgMatch ? ogImgMatch[1] : null;

    if (image && !image.startsWith("http://") && !image.startsWith("https://")) {
      image = new URL(image, response.url).href;
    }
    if (!image) {
      image = defaultFavicon;
    }

    const description = ogDescMatch ? ogDescMatch[1] : null;

    return {
      url: targetUrl,
      domain: domain,
      title: title ? title.trim() : domain,
      description: description ? description.trim() : null,
      image: image
    };
  } catch (err) {
    try {
      const parsed = new URL(targetUrl);
      return {
        url: targetUrl,
        domain: parsed.hostname,
        title: parsed.hostname,
        description: null,
        image: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128`
      };
    } catch (e) {
      return null;
    }
  }
}


// Rutas de Autenticación
app.post("/api/auth/register", authRateLimit, (req, res) => {
  try {
    const { username, password, displayName } = req.body || {};
    const user = db.registerUser(username, password, displayName);
    const loginResult = db.loginUser(username, password);
    res.json({ ok: true, token: loginResult.token, user: loginResult.user });
  } catch (err) {
    res.status(400).json({ error: err.message || "Error al registrar usuario" });
  }
});

app.post("/api/auth/login", authRateLimit, (req, res) => {
  try {
    const { username, password } = req.body || {};
    const result = db.loginUser(username, password);
    res.json({ ok: true, token: result.token, user: result.user });
  } catch (err) {
    res.status(401).json({ error: err.message || "Error de credenciales" });
  }
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const token = req.headers.authorization.slice(7).trim();
  db.revokeSession(token);
  res.status(204).end();
});

/**
 * Resumen para el widget nativo de Android.
 * Query: callsSince (ms epoch) limita las llamadas perdidas contadas.
 */
app.get("/api/widget/summary", requireAuth, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, ...db.getWidgetSummary(req.user.syncId, req.query.callsSince) });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});



// Endpoint de Registro Web Push inyectado de forma segura
app.post("/api/save-subscription", requireAuth, asyncHandler(async (req, res) => {
  try {
    const subscription = req.body?.subscription || req.body;

    if (!subscription || typeof subscription !== "object" ||
        Array.isArray(subscription) || typeof subscription.endpoint !== "string") {
      return res.status(400).json({ ok: false, error: "Payload de suscripción inválido o ausente" });
    }

    const saved = await db.savePushSubscription(
      req.user.syncId,
      subscription,
      req.get("user-agent") || ""
    );

    if (!saved) {
      return res.status(400).json({ ok: false, error: "Payload de suscripción inválido o ausente" });
    }

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[Push] Error al guardar suscripción:", err);
    return res.status(500).json({ ok: false, error: "Error interno al guardar la suscripción" });
  }
}));


/** Registra un token FCM Android en la cuenta autenticada. */
app.post("/api/mobile/push-token", requireAuth, (req, res) => {
  const token = req.body?.token;
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    return res.status(400).json({ ok: false, error: "Token FCM inválido" });
  }
  if (!db.saveMobilePushToken(req.user.syncId, token)) {
    return res.status(400).json({ ok: false, error: "No se pudo registrar el dispositivo" });
  }
  return res.status(201).json({ ok: true });
});

/** Retira el token FCM de la cuenta autenticada (p. ej. al cerrar sesión). */
app.delete("/api/mobile/push-token", requireAuth, (req, res) => {
  const token = req.body?.token;
  if (typeof token !== "string" || !token) {
    return res.status(400).json({ ok: false, error: "Token FCM requerido" });
  }
  db.removeMobilePushToken(req.user.syncId, token);
  return res.json({ ok: true });
});

// Rutas de Usuario y Perfil
app.post("/api/user/profile", requireAuth, asyncHandler(async (req, res) => {
  try {
    const { displayName, avatarUrl } = req.body || {};
    if (avatarUrl !== undefined && avatarUrl !== null && !safeUrl(avatarUrl, "avatar")) {
      return res.status(400).json({ error: "URL de avatar no válida" });
    }
    const updated = await db.updateUserProfile(req.user.syncId, displayName, avatarUrl);
    io.emit("user-profile-updated", updated);
    res.json({ ok: true, user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message || "Error al actualizar perfil" });
  }
}));

// Endpoint de Subida de Documentos y Archivos Pesados (hasta 2 GB sin compresión)
app.post("/api/upload", requireAuth, uploadSingleFileForPlan, asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó ningún archivo" });
    }

    const plan = String(req.user.plan || "free").trim().toLowerCase();
    const maxUploadBytes = plan === "enterprise" || plan === "pro"
      ? MAX_PREMIUM_UPLOAD_BYTES
      : MAX_STANDARD_UPLOAD_BYTES;
    if (req.file.size > maxUploadBytes) {
      try { await fs.promises.unlink(req.file.path); } catch (_) {}
      return res.status(413).json({ error: "El archivo supera el límite del plan" });
    }

    const registeredFile = await db.registerFile(req.user.syncId, req.file);
    const fileUrl = `/api/files/${registeredFile.id}`;
    const mime = (req.file.mimetype || "").toLowerCase();
    const orig = req.file.originalname || "";

    const isVideo = mime.startsWith("video/") || /\.(mp4|m4v|mov|webm)$/i.test(orig);
    const isAudio = mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(orig);
    const isImage = mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(orig);

    res.json({
      ok: true,
      file: {
        id: registeredFile.id,
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        filename: req.file.filename,
        isVideo: isVideo,
        isAudio: isAudio,
        isImage: isImage
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Error al procesar subida de archivo: " + err.message });
  }
}));

// Rutas de Contactos
app.get("/api/contacts", requireAuth, (req, res) => {
  const onlineIds = new Set(onlineUsers.keys());
  const contacts = db.getUserContacts(req.user.syncId, onlineIds);
  res.json({ ok: true, contacts: contacts });
});

app.post("/api/contacts/add", requireAuth, (req, res) => {
  try {
    const { contactSyncId } = req.body || {};
    if (!contactSyncId) {
      return res.status(400).json({ error: "El código ID es requerido" });
    }
    const result = db.addContact(req.user.syncId, contactSyncId);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message || "Contacto no encontrado" });
  }
});

// Rutas de Mensajería e Historial
app.get("/api/messages/:contactSyncId", requireAuth, (req, res) => {
  const { contactSyncId } = req.params;
  const targetSyncId = contactSyncId.toUpperCase();
  const messages = db.getMessagesBetween(req.user.syncId, targetSyncId);
  const pinnedMessage = db.getPinnedMessage(req.user.syncId, targetSyncId);
  res.json({ ok: true, messages: messages, pinnedMessage: pinnedMessage });
});

// Endpoint para vaciar historial completo con un contacto
app.delete("/api/messages/:contactSyncId", requireAuth, (req, res) => {
  const { contactSyncId } = req.params;
  const targetSyncId = contactSyncId.toUpperCase();
  const deletedCount = db.clearMessagesBetween(req.user.syncId, targetSyncId);

  const eventData = {
    fromSyncId: req.user.syncId,
    contactSyncId: targetSyncId
  };

  const userSockets = onlineUsers.get(req.user.syncId);
  if (userSockets) {
    userSockets.forEach((sockId) => authenticatedTo(sockId).emit("chat-history-cleared", eventData));
  }
  const targetSockets = onlineUsers.get(targetSyncId);
  if (targetSockets) {
    targetSockets.forEach((sockId) => authenticatedTo(sockId).emit("chat-history-cleared", eventData));
  }

  res.json({ ok: true, deletedCount: deletedCount });
});

// Endpoint auxiliar para vista previa de enlaces
app.get("/api/link-preview", requireAuth, asyncHandler(async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL requerida" });
  const preview = await fetchUrlMetadata(url);
  res.json({ ok: true, preview: preview });
}));

app.get('/api/status', function (_req, res) {
  res.json({
    status: 'ok',
    service: 'sync-engine-server',
    features: [
      'auth',
      'private-messaging',
      'voice-notes',
      'pwa',
      'double-check',
      'pinned-messages',
      'rich-links',
      'multimedia-2gb',
      'h264-video',
      'fluid-layout',
      'lightbox',
      'monetization-tiers',
      'encrypted-vault',
      'team-channels',
      'compliance-export'
    ],
    uploadLimitBytes: 2147483648,
    onlineUsersCount: onlineUsers.size
  });
});

// ==== Endpoints de Monetización, Facturación y Planes ====
app.get("/api/billing/plan", requireAuth, (req, res) => {
  const user = db.getUserBySyncId(req.user.syncId);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json({
    ok: true,
    plan: user.plan || "free",
    role: user.role || "member",
    planExpiresAt: user.planExpiresAt || null,
    features: {
      maxUploadBytes: user.plan === "enterprise" ? 2147483648 : (user.plan === "pro" ? 2147483648 : 52428800),
      maxVoiceSeconds: user.plan === "free" ? 60 : 600,
      encryptedVault: user.plan !== "free",
      teamChannels: user.plan === "enterprise" || user.plan === "pro",
      exportAudit: true,
      hdCalling: user.plan !== "free"
    }
  });
});

app.post("/api/billing/upgrade", requireAuth, (req, res) => {
  if (process.env.ALLOW_TEST_BILLING !== "true") {
    return res.status(403).json({ error: "La actualización de plan de prueba está deshabilitada. Contacte a ventas BARRANTES CO. para facturación B2B." });
  }
  const { plan, billingCycle, paymentDetails } = req.body || {};
  try {
    const result = db.upgradeUserPlan(req.user.syncId, plan, billingCycle, paymentDetails);
    res.json({ ok: true, user: result.user, invoice: result.invoice });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/billing/invoices", requireAuth, (req, res) => {
  const invoices = db.getUserInvoices(req.user.syncId);
  res.json({ ok: true, invoices: invoices });
});

app.post("/api/billing/apply-coupon", requireAuth, (req, res) => {
  const { code } = req.body || {};
  const cleanCode = String(code || "").trim().toUpperCase();
  const coupons = {
    "SYNC2026": 25,
    "LAUNCH50": 50,
    "BARRANTES": 30,
    "VIP": 20
  };
  if (coupons[cleanCode]) {
    res.json({ ok: true, valid: true, discountPercent: coupons[cleanCode], code: cleanCode });
  } else {
    res.status(400).json({ ok: false, valid: false, error: "Código promocional no válido o caducado" });
  }
});

// Webhook de pagos deshabilitado hasta implementar verificación criptográfica
// específica del proveedor sobre el cuerpo original de la solicitud.
app.post("/api/billing/webhook", (_req, res) => {
  return res.status(503).json({
    error: "Webhook de pagos no habilitado: falta verificación de firma del proveedor."
  });
});

// Endpoint de Eliminación de Cuenta (Cumplimiento Políticas Google Play & Apple App Store)
app.post("/api/user/delete-account", requireAuth, (req, res) => {
  try {
    const result = db.deleteUserAccount(req.user.syncId);
    res.json({ ok: true, message: "Cuenta y datos eliminados permanentemente", details: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Endpoint B2B para crear Organización
app.post("/api/org/create", requireAuth, (req, res) => {
  try {
    const { name } = req.body || {};
    const org = db.createOrganization(name, req.user.syncId);
    res.json({ ok: true, organization: org });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==== Endpoints de Bóveda Cifrada Privada ====
app.get("/api/vault", requireAuth, (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const items = db.getVaultItems(req.user.syncId);
  res.json({ ok: true, items: items });
});

app.post("/api/vault", requireAuth, (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const item = db.saveVaultItem(req.user.syncId, req.body);
    res.json({ ok: true, item: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/vault/:itemId", requireAuth, (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const success = db.deleteVaultItem(req.user.syncId, req.params.itemId);
  res.json({ ok: true, deleted: success });
});

// ==== Endpoints de Canales de Espacio de Trabajo ====
app.get("/api/channels", requireAuth, (req, res) => {
  const channels = db.getWorkspaceChannels(req.user.syncId);
  res.json({ ok: true, channels: channels });
});

app.post("/api/channels", requireAuth, (req, res) => {
  const { name, description } = req.body || {};
  try {
    const channel = db.createWorkspaceChannel(name, description, req.user.syncId);
    const creatorSockets = onlineUsers.get(req.user.syncId);
    if (creatorSockets) {
      creatorSockets.forEach((socketId) => authenticatedTo(socketId).emit("channel-created", channel));
    }
    res.json({ ok: true, channel: channel });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/channels/:channelId", requireAuth, (req, res) => {
  try {
    const channel = db.updateWorkspaceChannel(req.params.channelId, req.user.syncId, req.body || {});
    emitToChannelMembers(channel, "channel-updated", req.user.syncId);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/channels/:channelId/members", requireAuth, (req, res) => {
  try {
    const channel = db.addWorkspaceChannelMember(req.params.channelId, req.user.syncId, req.body && req.body.syncId);
    const targetSyncId = String(req.body && req.body.syncId || "").trim().toUpperCase();
    const targetSockets = channelUserSockets(targetSyncId);
    if (targetSockets) for (const socketId of targetSockets) authenticatedTo(socketId).emit("channel-membership-added", channel);
    emitToChannelMembers(channel, "channel-updated", targetSyncId);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/channels/:channelId/admins/:syncId", requireAuth, (req, res) => {
  try {
    const channel = db.grantWorkspaceChannelAdmin(req.params.channelId, req.user.syncId, req.params.syncId);
    emitToChannelMembers(channel, "channel-updated", req.user.syncId);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.delete("/api/channels/:channelId/admins/:syncId", requireAuth, (req, res) => {
  try {
    const channel = db.revokeWorkspaceChannelAdmin(req.params.channelId, req.user.syncId, req.params.syncId);
    emitToChannelMembers(channel, "channel-updated", req.user.syncId);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.delete("/api/channels/:channelId/members/:syncId", requireAuth, (req, res) => {
  try {
    const channelId = req.params.channelId;
    const targetSyncId = String(req.params.syncId || "").trim().toUpperCase();
    const previousChannel = db.findChannel(channelId);
    const channel = db.removeWorkspaceChannelMember(channelId, req.user.syncId, targetSyncId);
    if (previousChannel) revokeChannelSockets(previousChannel.id, [targetSyncId], "channel-membership-removed");
    emitToChannelMembers(channel, "channel-updated", req.user.syncId);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.delete("/api/channels/:channelId", requireAuth, (req, res) => {
  try {
    const channel = db.deleteWorkspaceChannel(req.params.channelId, req.user.syncId);
    revokeChannelSockets(channel.id, channel.memberSyncIds || [], "channel-deleted", channel);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/channels/:channelId/messages", requireAuth, (req, res) => {
  try {
    const messages = db.getChannelMessages(req.params.channelId, req.user.syncId);
    res.json({ ok: true, messages: messages });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// ==== Endpoint de Exportación de Auditoría y Transcripción ====
app.get("/api/messages/:contactSyncId/export", requireAuth, (req, res) => {
  try {
    const data = db.exportConversation(req.user.syncId, req.params.contactSyncId);
    res.json({ ok: true, export: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Los certificados autofirmados solo se inicializan para el servidor local.
// Vercel termina TLS delante de la Function y su filesystem desplegado no es persistente.
const isServerlessRuntime = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION);
let sslOptions = null;

if (!isServerlessRuntime && process.env.DISABLE_LOCAL_TLS !== "true") {
  const SSL_DIR = path.join(__dirname, "data", "ssl");
  const CERT_FILE = path.join(SSL_DIR, "cert.pem");
  const KEY_FILE = path.join(SSL_DIR, "key.pem");

  try {
    if (!fs.existsSync(SSL_DIR)) {
      fs.mkdirSync(SSL_DIR, { recursive: true });
    }

    if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
      sslOptions = {
        cert: fs.readFileSync(CERT_FILE),
        key: fs.readFileSync(KEY_FILE)
      };
    } else {
      const pemsOrPromise = selfsigned.generate(
        [{ name: "commonName", value: "sync-engine-server" }],
        { days: 365, keySize: 2048 }
      );
      if (pemsOrPromise && typeof pemsOrPromise.then === "function") {
        pemsOrPromise.then((pems) => {
          if (pems && pems.cert && pems.private) {
            try {
              fs.writeFileSync(CERT_FILE, pems.cert, "utf8");
              fs.writeFileSync(KEY_FILE, pems.private, "utf8");
            } catch (_) {}
          }
        }).catch(() => {});
      } else if (pemsOrPromise && pemsOrPromise.cert && pemsOrPromise.private) {
        fs.writeFileSync(CERT_FILE, pemsOrPromise.cert, "utf8");
        fs.writeFileSync(KEY_FILE, pemsOrPromise.private, "utf8");
        sslOptions = { cert: pemsOrPromise.cert, key: pemsOrPromise.private };
      }
    }
  } catch (sslErr) {
    console.warn("[SSL] No se pudo inicializar certificado SSL:", sslErr.message);
  }
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin || origin === "null" || origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://") || allowedOrigins.has(origin) || configuredCorsOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origen no permitido por CORS"));
    },
    credentials: true,
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 50e6
});

function canReceivePubSubEvent(user, payload) {
  if (!user || !payload || typeof payload !== "object") return false;
  const directAudience = [payload.targetSyncId, payload.recipientSyncId, payload.userSyncId]
    .filter(Boolean)
    .map((value) => String(value).trim().toUpperCase());
  if (directAudience.length) return directAudience.includes(user.syncId);
  if (payload.channelId) return db.isChannelMember(payload.channelId, user.syncId);
  return false;
}

let httpsServer = null;
const HTTPS_PORT = process.env.HTTPS_PORT || (Number(PORT) + 443);
if (sslOptions) {
  try {
    httpsServer = https.createServer(sslOptions, app);
    io.attach(httpsServer);
  } catch (err) {
    console.warn("[HTTPS] Error al iniciar servidor HTTPS:", err.message);
  }
}

// Registro de Usuarios Online: Map<syncId, Set<socketId>>
const onlineUsers = new Map();
const socketToUser = new Map();

function channelUserSockets(syncId) {
  const normalized = String(syncId || "").trim().toUpperCase();
  for (const [onlineSyncId, sockets] of onlineUsers) {
    if (String(onlineSyncId || "").trim().toUpperCase() === normalized) return sockets;
  }
  return null;
}

function emitToChannelMembers(channel, event, excludedSyncId) {
  if (!channel) return;
  const excluded = String(excludedSyncId || "").trim().toUpperCase();
  for (const syncId of channel.memberSyncIds || []) {
    if (String(syncId || "").trim().toUpperCase() === excluded) continue;
    const sockets = channelUserSockets(syncId);
    if (!sockets) continue;
    for (const socketId of sockets) authenticatedTo(socketId).emit(event, channel);
  }
}

function revokeChannelSockets(channelId, syncIds, event, channel) {
  for (const syncId of syncIds || []) {
    const sockets = channelUserSockets(syncId);
    if (!sockets) continue;
    for (const socketId of sockets) {
      const client = io.sockets.sockets.get(socketId);
      if (!client || !currentSocketUser(client)) continue;
      client.leave("channel:" + channelId);
      client.emit(event, channel || { id: channelId });
    }
  }
}

function deliverPubSubEvent(payload) {
  return deliver(payload, socketToUser, io, (socketId, user) => {
    const socket = io.sockets.sockets.get(socketId);
    const currentUser = socket && db.getUserByToken(socket.data.authToken);
    return currentUser?.syncId === user.syncId;
  });
}

function clearSocketIdentity(socket) {
  const previous = socketToUser.get(socket.id);
  socketToUser.delete(socket.id);
  delete socket.data.authToken;
  if (previous) {
    const sockets = onlineUsers.get(previous.syncId);
    if (sockets) {
      sockets.delete(socket.id);
      if (!sockets.size) onlineUsers.delete(previous.syncId);
    }
    for (const room of socket.rooms) if (room !== socket.id) socket.leave(room);
  }
}

/**
 * Sends a structured channel authorization failure to a Socket.IO client.
 * @param {import("socket.io").Socket} socket
 * @param {string} code
 * @param {string} message
 */
function emitChannelAuthorizationError(socket, code, message) {
  socket.emit("authorization-error", { code: code, message: message });
}

function currentSocketUser(socket) {
  const previous = socketToUser.get(socket.id);
  let user;
  try { user = db.getUserByToken(socket.data.authToken); } catch (_) { user = null; }
  if (!previous || !user || user.syncId !== previous.syncId) {
    clearSocketIdentity(socket);
    return null;
  }
  socketToUser.set(socket.id, user);
  return user;
}

function authenticatedTo(room) {
  return { emit(event, ...args) {
    const ids = [...(io.sockets.adapter.rooms.get(room) || [])];
    for (const id of ids) {
      const recipient = io.sockets.sockets.get(id);
      if (recipient && currentSocketUser(recipient)) recipient.emit(event, ...args);
    }
  } };
}

function onMessage(socket, event, handler) {
  socket.on(event, (...args) => {
    const task = Promise.resolve().then(() => handler(...args));
    messageTasks.add(task);
    task.catch(() => socket.emit("error-message", { message: "No se pudo persistir el mensaje" }))
      .finally(() => messageTasks.delete(task));
  });
}

io.on("connection", function (socket) {
  socket.use(([event, payload], next) => {
    if (!shuttingDown && (event === "authenticate" || currentSocketUser(socket))) return next();
    socket.emit("auth-error", { message: "Sesión expirada o inválida" });
    emitChannelAuthorizationError(socket, "UNAUTHENTICATED", "Autenticación requerida");
    socket.emit("error-message", { id: payload?.clientMsgId, message: "No autenticado" });
  });
  // Autenticación de Socket
  socket.on("authenticate", function (payload) {
    const token = payload && payload.token ? payload.token : null;
    const user = db.getUserByToken(token);
    clearSocketIdentity(socket);
    if (!user) {
      socket.emit("auth-error", { message: "Token inválido" });
      return;
    }

    const syncId = user.syncId;
    socketToUser.set(socket.id, user);
    socket.data.authToken = token;

    if (!onlineUsers.has(syncId)) {
      onlineUsers.set(syncId, new Set());
    }
    onlineUsers.get(syncId).add(socket.id);

    socket.emit("authenticated", { user: user });

    // Notificar a contactos sobre estado online
    broadcastUserStatus(syncId, true);
  });

  socket.on("clipboard-sync", function (payload) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !payload || typeof payload.text !== "string") return;
    if (payload.text.length > 10000) {
      socket.emit("error-message", { message: "El contenido del portapapeles supera el límite permitido" });
      return;
    }

    const userSockets = onlineUsers.get(sender.syncId);
    if (!userSockets) return;
    userSockets.forEach((socketId) => {
      if (socketId !== socket.id) {
        authenticatedTo(socketId).emit("clipboard-sync", {
          text: payload.text,
          fromSyncId: sender.syncId,
          timestamp: Date.now()
        });
      }
    });
  });

  // ==== Gestión y Mensajería de Canales de Equipo ====
  socket.on("join-channel", function (payload) {
    const user = socketToUser.get(socket.id);
    if (!user) {
      emitChannelAuthorizationError(socket, "UNAUTHENTICATED", "Autenticación requerida");
      return;
    }

    const rawChannelId = payload && typeof payload.channelId === "string" ? payload.channelId.trim() : "";
    if (!rawChannelId) {
      emitChannelAuthorizationError(socket, "FORBIDDEN", "No tienes permisos para acceder a este canal");
      return;
    }

    const channel = db.findChannel ? db.findChannel(rawChannelId) : null;
    const channelId = channel ? channel.id : rawChannelId;

    if (!db.isChannelMember(channelId, user.syncId)) {
      emitChannelAuthorizationError(socket, "FORBIDDEN", "No tienes permisos para acceder a este canal");
      return;
    }

    socket.join("channel:" + channelId);
  });

  onMessage(socket, "send-channel-message", async function (payload) {
    const sender = socketToUser.get(socket.id);
    if (!sender) {
      emitChannelAuthorizationError(socket, "UNAUTHENTICATED", "Autenticación requerida");
      return;
    }
    const { channelId: rawChannelId, text, type, fileData, audioData } = payload || {};
    if (!rawChannelId) return;

    const channel = db.findChannel ? db.findChannel(rawChannelId) : null;
    const channelId = channel ? channel.id : rawChannelId;

    if (!db.isChannelMember(channelId, sender.syncId)) {
      emitChannelAuthorizationError(socket, "FORBIDDEN", "No tienes permisos para enviar mensajes a este canal");
      return;
    }

    try {
      const msg = await db.saveChannelMessage(channelId, sender.syncId, { text, type, fileData, audioData });
      await db.flushWrites();
      authenticatedTo("channel:" + channelId).emit("channel-message-received", msg);
    } catch (err) {
      socket.emit("error-message", { message: err.message });
    }
  });

  // Envío de Mensaje Privado (Texto, Audio de Voz o Archivo)
  onMessage(socket, "send-private-message", async function (payload) {
    const clientMsgId = payload && payload.clientMsgId;
    const emitMessageError = (message) => socket.emit("error-message", { id: clientMsgId, message });
    const sender = socketToUser.get(socket.id);
    if (!sender) {
      emitMessageError("No autenticado");
      return;
    }

    const { toSyncId, text, type, fileData, audioData, replyTo } = payload || {};
    if (!toSyncId) return;

    const targetSyncId = String(toSyncId).trim().toUpperCase();
    if (sender.syncId === targetSyncId) {
      return;
    }

    const msgType = type || "text";
    // Reject executable resource schemes before storing or broadcasting user-controlled data.
    if (fileData) {
      if (typeof fileData !== "object" || Array.isArray(fileData) ||
          ["url", "data"].some((key) => fileData[key] != null &&
            !safeUrl(fileData[key], "download") && !safeUrl(fileData[key], "image"))) {
        emitMessageError("URL de archivo no válida");
        return;
      }
    }
    if (audioData != null && !safeUrl(audioData, "audio")) {
      emitMessageError("URL de audio no válida");
      return;
    }
    let fileIds;
    try {
      fileIds = messageFileIds(sender.syncId, [fileData?.url, fileData?.data, audioData], socket.handshake.headers.host);
    } catch (err) {
      emitMessageError(err.message);
      return;
    }
    const targetSockets = onlineUsers.get(targetSyncId);
    const isTargetOnline = Boolean(targetSockets && targetSockets.size > 0);
    const initialStatus = isTargetOnline ? "delivered" : "sent";
    const existingMessage = clientMsgId ? db.getMessageById(clientMsgId) : null;
    if (existingMessage &&
        (existingMessage.fromId !== sender.syncId || existingMessage.toId !== targetSyncId)) {
      emitMessageError("El identificador del mensaje ya está en uso");
      return;
    }
    const isRetry = Boolean(existingMessage);

    let messageObj = null;

    try {
      if (msgType === "text") {
        messageObj = await db.saveTextMessage(
          sender.syncId,
          targetSyncId,
          text,
          clientMsgId || null,
          replyTo || null,
          null,
          initialStatus
        );
      } else {
        let finalAudioData = audioData || null;

        if (msgType === "audio" && audioData && typeof audioData === "string" && audioData.startsWith("data:audio/")) {
          try {
            const matches = audioData.match(/^data:audio\/([a-zA-Z0-9_\-+.]+);base64,(.+)$/);
            if (matches) {
              const rawFormat = matches[1].toLowerCase();
              const ext = rawFormat.includes("mp4") || rawFormat.includes("m4a") || rawFormat.includes("aac")
                ? "mp4"
                : (rawFormat.includes("wav") ? "wav" : "webm");
              const buffer = Buffer.from(matches[2], "base64");
              const audioFileName = `voice-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
              const audioFilePath = path.join(UPLOADS_DIR, audioFileName);
              fs.writeFileSync(audioFilePath, buffer);
              const audioFile = await db.registerFile(sender.syncId, {
                filename: audioFileName, originalname: audioFileName, size: buffer.length,
                mimetype: "audio/" + rawFormat
              });
              finalAudioData = `/api/files/${audioFile.id}`;
              fileIds.push(audioFile.id);
            }
          } catch (err) {
            console.warn("[AUDIO] Error al persistir audio en disco:", err.message);
            emitMessageError("No se pudo registrar el audio");
            return;
          }
        }

        messageObj = await db.saveMessage({
          id: clientMsgId || null,
          fromId: sender.syncId,
          toId: targetSyncId,
          type: msgType,
          text: text,
          audioData: finalAudioData,
          fileData: fileData,
          fileIds: fileIds,
          replyTo: replyTo || null,
          status: initialStatus
        });
      }
    } catch (err) {
      emitMessageError(err.message || "No se pudo guardar el mensaje");
      return;
    }
    try {
      await db.flushWrites();
    } catch (_) {
      emitMessageError("No se pudo persistir el mensaje");
      return;
    }

    if (!isTargetOnline && !isRetry) {
      const pushPayload = {
        title: `Nuevo mensaje de ${sender.formattedName}`,
        body: (text && text.length > 100) ? text.slice(0, 97) + "..." : text,
        icon: '/assets/logo.png',
        data: { syncId: targetSyncId, fromSyncId: sender.syncId, type: 'message' }
      };
      sendPushNotification(targetSyncId, pushPayload).catch(e => console.warn('[Push] envío fallido:', e.message));
    }

    if (!isRetry) {
      sendMobilePushNotification(targetSyncId, {
        title: `Nuevo mensaje de ${sender.formattedName}`,
        body: (text && text.length > 100) ? text.slice(0, 97) + "..." : (text || "Tienes un mensaje nuevo"),
        type: "message"
      }).catch(e => console.warn("[FCM] Falló el aviso de mensaje:", e.message));
    }

    if (sender) {
      messageObj.fromName = sender.formattedName || sender.displayName || "Usuario";
    } else {
      messageObj.fromName = "Usuario Desconocido";
      console.warn("[Chat Warning] Se intentó procesar un mensaje de un remitente inexistente en db.");
    }
    messageObj.toSyncId = targetSyncId;

    // Entregar a todos los sockets activos del destinatario
    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("receive-private-message", messageObj);
      });
    }

    // Confirmación y sincronización a todos los sockets del emisor
    const senderSockets = onlineUsers.get(sender.syncId);
    if (senderSockets && senderSockets.size > 0) {
      senderSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("receive-private-message", messageObj);
      });
    }

    socket.emit("message-sent", { id: messageObj.id, status: messageObj.status, timestamp: messageObj.timestamp });

    // Extracción asíncrona desacoplada de metadatos Open Graph sin bloquear la entrega de mensajes
    if (msgType === "text" && text && /https?:\/\/[^\s]+/i.test(text)) {
      setImmediate(async () => {
        try {
          const preview = await fetchUrlMetadata(text);
          if (preview) {
            db.updateMessageLinkPreview(messageObj.id, preview);
            const previewEvent = {
              messageId: messageObj.id,
              fromSyncId: sender.syncId,
              toSyncId: targetSyncId,
              linkPreview: preview
            };

            const currentTargetSockets = onlineUsers.get(targetSyncId);
            if (currentTargetSockets && currentTargetSockets.size > 0) {
              currentTargetSockets.forEach((sockId) => {
                authenticatedTo(sockId).emit("message-preview-updated", previewEvent);
              });
            }

            const currentSenderSockets = onlineUsers.get(sender.syncId);
            if (currentSenderSockets && currentSenderSockets.size > 0) {
              currentSenderSockets.forEach((sockId) => {
                authenticatedTo(sockId).emit("message-preview-updated", previewEvent);
              });
            }
          }
        } catch (previewErr) {
          console.warn("[PREVIEW] Error en extracción asíncrona de metadatos Open Graph:", previewErr.message);
        }
      });
    }
  });

  // Marcado de Mensajes como Leídos (Read Receipt)
  socket.on("mark-messages-read", function (payload) {
    const reader = socketToUser.get(socket.id);
    if (!reader || !payload || !payload.contactSyncId) return;

    const contactSyncId = String(payload.contactSyncId).trim().toUpperCase();
    const updatedIds = db.markMessagesAsRead(contactSyncId, reader.syncId);

    if (updatedIds.length > 0) {
      const receiptData = {
        senderSyncId: contactSyncId,
        readerSyncId: reader.syncId,
        messageIds: updatedIds
      };

      // Notificar al autor de los mensajes
      const senderSockets = onlineUsers.get(contactSyncId);
      if (senderSockets && senderSockets.size > 0) {
        senderSockets.forEach((sockId) => {
          authenticatedTo(sockId).emit("messages-read-receipt", receiptData);
        });
      }

      // Sincronizar en otros dispositivos del lector
      const readerSockets = onlineUsers.get(reader.syncId);
      if (readerSockets && readerSockets.size > 0) {
        readerSockets.forEach((sockId) => {
          authenticatedTo(sockId).emit("messages-read-receipt", receiptData);
        });
      }
    }
  });

  // Eliminar Mensaje para Todos (Delete for Everyone)
  socket.on("delete-message-for-everyone", function (payload) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !payload || !payload.messageId || !payload.toSyncId) return;

    const targetSyncId = String(payload.toSyncId).trim().toUpperCase();
    try {
      const updated = db.deleteMessageForEveryone(payload.messageId, sender.syncId);
      if (updated) {
        const eventData = {
          messageId: payload.messageId,
          fromSyncId: sender.syncId,
          toSyncId: targetSyncId
        };

        const targetSockets = onlineUsers.get(targetSyncId);
        if (targetSockets && targetSockets.size > 0) {
          targetSockets.forEach((sockId) => {
            authenticatedTo(sockId).emit("message-deleted-for-everyone", eventData);
          });
        }

        const senderSockets = onlineUsers.get(sender.syncId);
        if (senderSockets && senderSockets.size > 0) {
          senderSockets.forEach((sockId) => {
            authenticatedTo(sockId).emit("message-deleted-for-everyone", eventData);
          });
        }
      }
    } catch (err) {
      socket.emit("error-message", { message: err.message });
    }
  });

  // Fijar Mensaje Clave (Pin Message)
  socket.on("pin-message", function (payload) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !payload || !payload.toSyncId || !payload.messageId) return;

    const targetSyncId = String(payload.toSyncId).trim().toUpperCase();
    try {
      const pinned = db.setPinnedMessage(sender.syncId, targetSyncId, payload.messageId);
      const eventData = {
        pinnedMessage: pinned,
        conversationWith: targetSyncId
      };

      const targetSockets = onlineUsers.get(targetSyncId);
      if (targetSockets && targetSockets.size > 0) {
        targetSockets.forEach((sockId) => {
          authenticatedTo(sockId).emit("message-pinned", {
            pinnedMessage: pinned,
            conversationWith: sender.syncId
          });
        });
      }

      const senderSockets = onlineUsers.get(sender.syncId);
      if (senderSockets && senderSockets.size > 0) {
        senderSockets.forEach((sockId) => {
          authenticatedTo(sockId).emit("message-pinned", eventData);
        });
      }
    } catch (err) {
      socket.emit("error-message", { message: err.message });
    }
  });

  // Desfijar Mensaje Clave (Unpin Message)
  socket.on("unpin-message", function (payload) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !payload || !payload.toSyncId) return;

    const targetSyncId = String(payload.toSyncId).trim().toUpperCase();
    db.unpinMessage(sender.syncId, targetSyncId);

    const targetSockets = onlineUsers.get(targetSyncId);
    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("message-unpinned", { conversationWith: sender.syncId });
      });
    }

    const senderSockets = onlineUsers.get(sender.syncId);
    if (senderSockets && senderSockets.size > 0) {
      senderSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("message-unpinned", { conversationWith: targetSyncId });
      });
    }
  });

  // Reacciones con Emojis a Mensajes ('message-reaction')
  socket.on("message-reaction", function (payload) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !payload || !payload.messageId || !payload.toSyncId || !payload.emoji) return;

    const targetSyncId = String(payload.toSyncId).trim().toUpperCase();
    try {
      const updatedReactions = db.updateMessageReaction(payload.messageId, sender.syncId, payload.emoji, targetSyncId);
      const eventData = {
        messageId: payload.messageId,
        fromSyncId: sender.syncId,
        emoji: payload.emoji,
        reactions: updatedReactions
      };

      const targetSockets = onlineUsers.get(targetSyncId);
      if (targetSockets && targetSockets.size > 0) {
        targetSockets.forEach((sockId) => {
          authenticatedTo(sockId).emit("message-reaction-updated", eventData);
        });
      }

      const senderSockets = onlineUsers.get(sender.syncId);
      if (senderSockets && senderSockets.size > 0) {
        senderSockets.forEach((sockId) => {
          authenticatedTo(sockId).emit("message-reaction-updated", eventData);
        });
      }
    } catch (err) {
      socket.emit("error-message", { message: err.message });
    }
  });

  // SEÑALIZACIÓN WEBRTC (LLAMADAS DE VOZ P2P EN TIEMPO REAL)
  socket.on("call-user", function (data) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !data || !data.toSyncId || !data.offer) return;

    const targetSyncId = String(data.toSyncId).trim().toUpperCase();
    const targetSockets = onlineUsers.get(targetSyncId);
    db.recordCall(sender.syncId, targetSyncId, !(targetSockets && targetSockets.size > 0));
    sendMobilePushNotification(targetSyncId, {
      title: "Llamada entrante",
      body: `Llamada de ${sender.formattedName || sender.syncId}`,
      type: "call"
    }).catch(e => console.warn("[FCM] Falló el aviso de llamada:", e.message));

    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("call-made", {
          offer: data.offer,
          fromSyncId: sender.syncId,
          fromName: sender.formattedName
        });
      });
    } else {
      sendMobilePushNotification(targetSyncId, {
        title: "Llamada entrante",
        body: `Llamada de ${sender.formattedName || sender.syncId}`,
        type: "call"
      }).catch(e => console.warn("[FCM] Falló el aviso de llamada:", e.message));
      socket.emit("call-unavailable", {
        toSyncId: targetSyncId,
        message: "El contacto no se encuentra en línea para recibir llamadas"
      });
    }
  });

  socket.on("make-answer", function (data) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !data || !data.toSyncId || !data.answer) return;

    const targetSyncId = String(data.toSyncId).trim().toUpperCase();
    const targetSockets = onlineUsers.get(targetSyncId);
    db.resolveCall(targetSyncId, sender.syncId, 'answered');

    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("answer-made", {
          answer: data.answer,
          fromSyncId: sender.syncId,
          fromName: sender.formattedName
        });
      });
    }
  });

  socket.on("ice-candidate", function (data) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !data || !data.toSyncId || !data.candidate) return;

    const targetSyncId = String(data.toSyncId).trim().toUpperCase();
    const targetSockets = onlineUsers.get(targetSyncId);

    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("ice-candidate", {
          candidate: data.candidate,
          fromSyncId: sender.syncId
        });
      });
    }
  });

  socket.on("reject-call", function (data) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !data || !data.toSyncId) return;

    const targetSyncId = String(data.toSyncId).trim().toUpperCase();
    const targetSockets = onlineUsers.get(targetSyncId);
    db.resolveCall(targetSyncId, sender.syncId, 'rejected');

    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("call-rejected", {
          fromSyncId: sender.syncId,
          fromName: sender.formattedName
        });
      });
    }
  });

  socket.on("end-call", function (data) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !data || !data.toSyncId) return;

    const targetSyncId = String(data.toSyncId).trim().toUpperCase();
    const targetSockets = onlineUsers.get(targetSyncId);
    // Si quien llama cuelga antes de que contesten, cuenta como llamada perdida.
    db.resolveCall(sender.syncId, targetSyncId, 'missed');

    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("call-ended", {
          fromSyncId: sender.syncId,
          fromName: sender.formattedName
        });
      });
    }
  });

  // Espejo de Notificaciones (Notification Mirroring)
  socket.on("mirror-notification", function (payload) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !payload) return;

    const notifData = {
      id: payload.id || ("mirr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      title: payload.title || "Notificación de Móvil",
      body: payload.body || "",
      icon: payload.icon || "📱",
      appName: payload.appName || "Móvil",
      fromSyncId: payload.fromSyncId || null,
      fromName: payload.fromName || null,
      timestamp: payload.timestamp || Date.now()
    };

    const userSockets = onlineUsers.get(sender.syncId);
    if (userSockets && userSockets.size > 0) {
      userSockets.forEach((sockId) => {
        if (sockId !== socket.id) {
          authenticatedTo(sockId).emit("notification-mirrored", notifData);
        }
      });
    }
  });

  onMessage(socket, "quick-reply", async function (payload) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !payload || !payload.toSyncId || !payload.text) return;

    const targetSyncId = String(payload.toSyncId).trim().toUpperCase();
    const targetSockets = onlineUsers.get(targetSyncId);
    const initialStatus = Boolean(targetSockets && targetSockets.size > 0) ? "delivered" : "sent";

    let savedMsg;
    try {
      savedMsg = await db.saveTextMessage(
        sender.syncId,
        targetSyncId,
        payload.text,
        null,
        payload.replyTo || null,
        null,
        initialStatus
      );
      await db.flushWrites();
    } catch (err) {
      socket.emit("error-message", { message: err.message || "No se pudo guardar el mensaje" });
      return;
    }
    savedMsg.fromName = sender.formattedName;
    savedMsg.toSyncId = targetSyncId;

    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("receive-private-message", savedMsg);
      });
    }

    const senderSockets = onlineUsers.get(sender.syncId);
    if (senderSockets && senderSockets.size > 0) {
      senderSockets.forEach((sockId) => {
        authenticatedTo(sockId).emit("receive-private-message", savedMsg);
      });
    }

    socket.emit("quick-reply-sent", { ok: true, id: savedMsg.id });

    // Extracción asíncrona desacoplada de metadatos Open Graph
    if (payload.text && /https?:\/\/[^\s]+/i.test(payload.text)) {
      setImmediate(async () => {
        try {
          const preview = await fetchUrlMetadata(payload.text);
          if (preview) {
            db.updateMessageLinkPreview(savedMsg.id, preview);
            const previewEvent = {
              messageId: savedMsg.id,
              fromSyncId: sender.syncId,
              toSyncId: targetSyncId,
              linkPreview: preview
            };

            const curTargets = onlineUsers.get(targetSyncId);
            if (curTargets && curTargets.size > 0) {
              curTargets.forEach((sockId) => authenticatedTo(sockId).emit("message-preview-updated", previewEvent));
            }

            const curSenders = onlineUsers.get(sender.syncId);
            if (curSenders && curSenders.size > 0) {
              curSenders.forEach((sockId) => authenticatedTo(sockId).emit("message-preview-updated", previewEvent));
            }
          }
        } catch (previewErr) {
          console.warn("[PREVIEW] Error en quick-reply link preview:", previewErr.message);
        }
      });
    }
  });

  // Desconexión
  socket.on("disconnect", function () {
    const user = socketToUser.get(socket.id);
    if (user) {
      const syncId = user.syncId;
      socketToUser.delete(socket.id);

      const userSockets = onlineUsers.get(syncId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(syncId);
          broadcastUserStatus(syncId, false);
        }
      }
    }
  });
});

function broadcastUserStatus(syncId, isOnline) {
  io.emit("contact-status-changed", {
    syncId: syncId,
    isOnline: isOnline
  });
}

let shutdownTask = null;
function shutdown() {
  if (shutdownTask) return shutdownTask;
  shuttingDown = true;
  shutdownTask = (async () => {
    let listenerError;
    try {
      if (typeof stopPubSub === "function") await stopPubSub();
      else if (stopPubSub && typeof stopPubSub.close === "function") await stopPubSub.close();
    } catch (error) {
      listenerError = error;
    }
    await new Promise((resolve) => io.close(resolve));
    if (httpsServer?.listening) await new Promise((resolve) => httpsServer.close(resolve));
    await Promise.allSettled([...messageTasks]);
    await db.closeWrites();
    if (listenerError) throw listenerError;
  })();
  return shutdownTask;
}

if (typeof module !== "undefined" && require.main === module) {
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
    shutdown().catch(() => {
      console.error("[Shutdown] Failed to drain persistent writes");
      process.exitCode = 1;
    });
  });
  // DATA-01: fail before accepting traffic, including when /api/status is probed.
  db.readDb();
  server.listen(PORT, HOST, function () {
  const localIps = getLocalIPv4Addresses();
  console.log("\n==================================================");
  console.log("SYNC ENGINE Server Activo en http://" + HOST + ":" + PORT);
  console.log("Direcciones disponibles:");
  if (localIps.length === 0) {
    console.log("  (sin IPv4 detectada)");
  } else {
    for (let i = 0; i < localIps.length; i++) {
      console.log("  http://" + localIps[i].address + ":" + PORT);
    }
  }
  console.log("==================================================\n");

  // ==== Inicialización del listener de Cloud Pub/Sub ====
  // Se arranca después de que el servidor HTTP/Socket.IO ya está escuchando tráfico.
  // Only explicitly addressed, currently authenticated recipients receive events.
  try {
    if (process.env.PUBSUB_ENABLED === "false") return;
    const { startChatSubscriptionListener } = require("./pubsub-service");
    stopPubSub = startChatSubscriptionListener(function (pubsubPayload) {
      const delivered = deliverPubSubEvent(pubsubPayload);
      console.log("[Pub/Sub → Socket.IO] Destinatarios autenticados:", delivered);
    });
  } catch (err) {
    console.error("[Pub/Sub] No se pudo iniciar la suscripción; HTTP seguirá disponible:", err.message);
  }
  });
}

if (typeof module !== "undefined") {
  module.exports = app;
  module.exports.app = app;
  module.exports.server = server;
  module.exports.io = io;
  module.exports.deliverPubSubEvent = deliverPubSubEvent;
  module.exports.shutdown = shutdown;
}

if (process.env.RENDER_EXTERNAL_URL) {
  const keepAliveUrl = new URL("/api/status", process.env.RENDER_EXTERNAL_URL);
  const keepAliveInterval = setInterval(async function () {
    try {
      const response = await fetch(keepAliveUrl, {
        signal: AbortSignal.timeout(30000)
      });
      await response.text();
      if (!response.ok) {
        console.warn("[Render Keep-Alive] Respuesta HTTP inesperada:", response.status);
      }
    } catch (err) {
      console.warn("[Render Keep-Alive] No se pudo consultar el estado:", err.message);
    }
  }, 5 * 60 * 1000);
  keepAliveInterval.unref();
}