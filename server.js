require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// ==== Web Push Setup ====
const webPush = require('web-push');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@syncengine.local";
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
let webPushConfigured = false;

function configureWebPush(directory) {
  const dir = directory || path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
  let publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  let privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  if (!publicKey || !privateKey) {
    const file = path.join(dir, "vapid.json");
    try {
      const stored = JSON.parse(fs.readFileSync(file, "utf8"));
      publicKey = String(stored.publicKey || "");
      privateKey = String(stored.privateKey || "");
    } catch (_) {
      publicKey = "";
      privateKey = "";
    }
    if (!publicKey || !privateKey) {
      const generated = webPush.generateVAPIDKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ publicKey, privateKey }), { mode: 0o600 });
    }
  }
  webPush.setVapidDetails(VAPID_EMAIL, publicKey, privateKey);
  VAPID_PUBLIC_KEY = publicKey;
  VAPID_PRIVATE_KEY = privateKey;
  webPushConfigured = true;
  return { publicKey, privateKey };
}

// Helper to send push notification to all stored subscriptions for a syncId
async function sendPushNotification(syncId, payload) {
  if (!webPushConfigured) {
    return;
  }
  const dbData = db.readDb();
  const subs = (dbData.subscriptions && dbData.subscriptions[syncId]) || [];
  const promises = subs.map(sub =>
    webPush.sendNotification(sub, JSON.stringify(payload)).catch(err => {
      // Remove invalid subscription
      if (err.statusCode === 410 || err.statusCode === 404) {
        const idx = subs.findIndex(s => s.endpoint === sub.endpoint);
        if (idx !== -1) subs.splice(idx, 1);
        db.writeDb(dbData);
      }
    })
  );
  await Promise.all(promises);
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
          body: String(payload.body || "Tienes un aviso nuevo").slice(0, 240),
          type: String(payload.type || "message"),
          syncId: String(syncId),
          fromSyncId: String(payload.fromSyncId || ""),
          channelId: String(payload.channelId || ""),
          url: String(payload.data && payload.data.url || "/")
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
const dns = require("dns").promises;
const http = require("http");
const https = require("https");
const net = require("net");
const os = require("os");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Server } = require("socket.io");
const selfsigned = require("selfsigned");
const db = require("./db");
const { safeUrl } = require("./public/safe-content");
const { deliver } = require("./pubsub-routing");

configureWebPush();

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

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

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  next();
});

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
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origen no permitido por CORS"));
  },
  credentials: true
};
app.use(cors(corsOptions));

// JSON nunca necesita aceptar el tamaño reservado para multipart uploads.
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
app.use((err, req, res, next) => {
  if (req.path === "/api/save-subscription" && err instanceof SyntaxError && err.status === 400) {
    return res.status(500).json({ ok: false, error: "Error al procesar el payload de suscripción" });
  }
  next(err);
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
app.get('/api/notifications/vapid-public-key', requireAuth, (_req, res) => {
  res.json({ ok: true, configured: webPushConfigured, publicKey: webPushConfigured ? VAPID_PUBLIC_KEY : null });
});

function ipv4Number(address) {
  const parts = address.split(".").map(Number);
  return (((parts[0] * 16777216) + (parts[1] * 65536) + (parts[2] * 256) + parts[3]) >>> 0);
}

function isBlockedPreviewAddress(address) {
  const raw = String(address || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (raw.startsWith("::ffff:")) return isBlockedPreviewAddress(raw.slice(7));
  const version = net.isIP(raw);
  if (version === 4) {
    const value = ipv4Number(raw);
    const inside = (start, prefix) => {
      const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
      return (value & mask) >>> 0 === (start & mask) >>> 0;
    };
    return inside(0, 8) || inside(0x0a000000, 8) || inside(0x7f000000, 8) ||
      inside(0xa9fe0000, 16) || inside(0xac100000, 12) || inside(0xc0a80000, 16) ||
      inside(0x64400000, 10) || inside(0xc0000000, 24) || inside(0xc0000200, 24) ||
      inside(0xc6120000, 15) || inside(0xc6336400, 24) || inside(0xcb007100, 24) ||
      inside(0xe0000000, 4);
  }
  if (version === 6) {
    const head = raw.split(":")[0];
    const prefix = Number.parseInt(head || "0", 16);
    if (raw === "::" || raw === "::1") return true;
    if (prefix >= 0xfc00 && prefix <= 0xfdff) return true;
    if (prefix >= 0xfe80 && prefix <= 0xfebf) return true;
    if (prefix >= 0xff00) return true;
    return raw.startsWith("2001:db8");
  }
  return true;
}

function literalIpv4(hostname) {
  if (net.isIP(hostname) === 4) return hostname;
  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    const value = Number.parseInt(hostname, 16);
    if (value >= 0 && value <= 0xffffffff) {
      return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
    }
  }
  if (/^\d+$/.test(hostname)) {
    const value = Number(hostname);
    if (Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff) {
      return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
    }
  }
  return "";
}

function isBlockedPreviewHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/[\[\]]/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "metadata.google.internal" || host.endsWith(".internal")) return true;
  const literal = literalIpv4(host);
  if (literal) return isBlockedPreviewAddress(literal);
  if (host.includes(":")) return isBlockedPreviewAddress(host);
  return false;
}

async function previewDestinationIsBlocked(hostname) {
  if (isBlockedPreviewHost(hostname)) return true;
  if (net.isIP(hostname)) return isBlockedPreviewAddress(hostname);
  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (_) {
    return true;
  }
  return records.length === 0 || records.some((record) => isBlockedPreviewAddress(record.address));
}

function previewFallback(parsed) {
  return {
    url: parsed.href,
    domain: parsed.hostname,
    title: parsed.hostname,
    description: null,
    image: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=128`
  };
}

// Extractor de Metadatos OpenGraph y Favicon para Rich Link Cards
async function fetchUrlMetadata(text) {
  if (!text || typeof text !== "string") return null;
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;

  let parsed;
  try {
    parsed = new URL(match[0]);
  } catch (_) {
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  if (await previewDestinationIsBlocked(parsed.hostname)) return null;
  const fallback = previewFallback(parsed);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(parsed.href, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "Accept": "text/html,application/xhtml+xml" }
    });
    if (response.status >= 300 && response.status < 400) return fallback;
    if (!response.ok || !response.body) return fallback;
    const contentType = String(response.headers.get("content-type") || "");
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return fallback;

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (received < 262144) {
      const step = await reader.read();
      if (step.done) break;
      received += step.value.length;
      chunks.push(step.value);
    }
    await reader.cancel().catch(() => {});
    const html = Buffer.concat(chunks).subarray(0, 262144).toString("utf8");

    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
                        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    const title = ogTitleMatch ? ogTitleMatch[1] : (titleMatch ? titleMatch[1] : parsed.hostname);
    let image = ogImgMatch ? ogImgMatch[1] : null;
    if (image && !image.startsWith("http://") && !image.startsWith("https://")) {
      image = new URL(image, parsed.href).href;
    }
    if (image) {
      try {
        const imageUrl = new URL(image);
        if (imageUrl.username || imageUrl.password || isBlockedPreviewHost(imageUrl.hostname)) image = null;
      } catch (_) {
        image = null;
      }
    }

    return {
      url: parsed.href,
      domain: parsed.hostname,
      title: title ? title.trim().slice(0, 180) : parsed.hostname,
      description: ogDescMatch && ogDescMatch[1] ? ogDescMatch[1].trim().slice(0, 280) : null,
      image: image || fallback.image
    };
  } catch (_) {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

// Rutas de Autenticación
app.post("/api/auth/register", (req, res) => {
  try {
    const { username, password, displayName } = req.body || {};
    const user = db.registerUser(username, password, displayName);
    const loginResult = db.loginUser(username, password);
    res.json({ ok: true, token: loginResult.token, user: loginResult.user });
  } catch (err) {
    res.status(400).json({ error: err.message || "Error al registrar usuario" });
  }
});

app.post("/api/auth/login", (req, res) => {
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
app.post("/api/save-subscription", requireAuth, async (req, res) => {
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
});

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
app.post("/api/user/profile", requireAuth, async (req, res) => {
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
});

app.post("/api/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó ningún archivo" });
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
});

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
  const limit = Number(req.query.limit) || 40;
  const beforeId = typeof req.query.beforeId === "string" ? req.query.beforeId : "";
  const page = db.getMessagesPage(req.user.syncId, targetSyncId, limit, beforeId);
  const pinnedMessage = db.getPinnedMessage(req.user.syncId, targetSyncId);
  res.json({ ok: true, messages: page.messages, hasMore: page.hasMore, pinnedMessage: pinnedMessage });
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
    userSockets.forEach((sockId) => io.to(sockId).emit("chat-history-cleared", eventData));
  }
  const targetSockets = onlineUsers.get(targetSyncId);
  if (targetSockets) {
    targetSockets.forEach((sockId) => io.to(sockId).emit("chat-history-cleared", eventData));
  }

  res.json({ ok: true, deletedCount: deletedCount });
});

// Endpoint auxiliar para vista previa de enlaces
app.get("/api/link-preview", requireAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL requerida" });
  const preview = await fetchUrlMetadata(url);
  res.json({ ok: true, preview: preview });
});

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
      'uploads',
      'h264-video',
      'fluid-layout',
      'lightbox',
      'web-push',
      'team-channels',
      'compliance-export'
    ],
    uploadLimitBytes: 2 * 1024 * 1024 * 1024,
    onlineUsersCount: onlineUsers.size
  });
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
      creatorSockets.forEach((socketId) => io.to(socketId).emit("channel-created", channel));
    }
    res.json({ ok: true, channel: channel });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/channels/:channelId", requireAuth, (req, res) => {
  try {
    const channel = db.updateWorkspaceChannel(req.params.channelId, req.user.syncId, req.body || {});
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/channels/:channelId/members", requireAuth, (req, res) => {
  try {
    const channel = db.addWorkspaceChannelMember(req.params.channelId, req.user.syncId, req.body && req.body.syncId);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/channels/:channelId/admins/:syncId", requireAuth, (req, res) => {
  try {
    const channel = db.grantWorkspaceChannelAdmin(req.params.channelId, req.user.syncId, req.params.syncId);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.delete("/api/channels/:channelId/admins/:syncId", requireAuth, (req, res) => {
  try {
    const channel = db.revokeWorkspaceChannelAdmin(req.params.channelId, req.user.syncId, req.params.syncId);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.delete("/api/channels/:channelId/members/:syncId", requireAuth, (req, res) => {
  try {
    const channel = db.removeWorkspaceChannelMember(req.params.channelId, req.user.syncId, req.params.syncId);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.delete("/api/channels/:channelId", requireAuth, (req, res) => {
  try {
    const channel = db.deleteWorkspaceChannel(req.params.channelId, req.user.syncId);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/calls", requireAuth, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, calls: db.listCallsForUser(req.user.syncId, req.query.limit) });
});

app.get("/api/channels/:channelId/messages", requireAuth, (req, res) => {
  try {
    const page = db.getChannelMessagePage(
      req.params.channelId,
      req.user.syncId,
      Number(req.query.limit) || 40,
      typeof req.query.beforeId === "string" ? req.query.beforeId : ""
    );
    res.json({ ok: true, messages: page.messages, hasMore: page.hasMore });
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
      if (!origin || origin === "null" || origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://") || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origen no permitido por CORS"));
    },
    credentials: true,
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 50e6
});

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
const socketPresence = new Map();

function recipientIsFocused(sessions, focus = {}) {
  const contactSyncId = focus.contactSyncId ? String(focus.contactSyncId).trim().toUpperCase() : "";
  const channelId = focus.channelId ? String(focus.channelId).trim() : "";
  return sessions.some((session) => {
    if (!session || !session.visible) return false;
    if (contactSyncId) return session.contactSyncId === contactSyncId;
    if (channelId) return session.channelId === channelId;
    return false;
  });
}

function shouldDeliverPush(syncId, focus = {}) {
  const sockets = onlineUsers.get(String(syncId || "").trim().toUpperCase());
  if (!sockets || sockets.size === 0) return true;
  const sessions = [];
  for (const socketId of sockets) sessions.push(socketPresence.get(socketId) || { visible: false });
  const visibleFocus = focus.type === "channel"
    ? { channelId: focus.channelId }
    : { contactSyncId: focus.contactSyncId || focus.fromSyncId };
  return !recipientIsFocused(sessions, visibleFocus);
}

function pushBody(type, text, fileData) {
  if (type === "audio") return "Nota de voz";
  if (type === "file") {
    const name = fileData && fileData.name ? String(fileData.name).slice(0, 80) : "";
    return name ? `Archivo: ${name}` : "Archivo";
  }
  const value = String(text || "").trim();
  if (!value) return "Nuevo mensaje";
  return value.length > 140 ? `${value.slice(0, 137)}…` : value;
}

function buildPushPayload({ title, body, type, fromSyncId, channelId, url }) {
  const kind = type || "message";
  return {
    title: String(title || "SYNC ENGINE").slice(0, 120),
    body: String(body || "Tienes un aviso nuevo").slice(0, 240),
    icon: "/assets/logo.png",
    badge: "/assets/logo.png",
    tag: kind === "call" ? "sync-call" : `sync-${kind}-${fromSyncId || channelId || "inbox"}`,
    data: {
      type: kind,
      url: url || "/",
      fromSyncId: fromSyncId || "",
      channelId: channelId || ""
    },
    type: kind,
    fromSyncId: fromSyncId || "",
    channelId: channelId || ""
  };
}

function deliverPush(syncId, payload) {
  if (!shouldDeliverPush(syncId, payload.data || payload)) return Promise.resolve();
  return Promise.allSettled([
    sendPushNotification(syncId, payload),
    sendMobilePushNotification(syncId, payload)
  ]);
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
  socketPresence.delete(socket.id);
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

io.on("connection", function (socket) {
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
    broadcastUserStatus(syncId, true);
  });

  socket.on("client-presence", function (payload) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !payload || typeof payload !== "object") return;
    socketPresence.set(socket.id, {
      visible: payload.visible !== false && payload.visible !== "false",
      contactSyncId: payload.contactSyncId ? String(payload.contactSyncId).trim().toUpperCase() : "",
      channelId: payload.channelId ? String(payload.channelId).trim() : ""
    });
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
        io.to(socketId).emit("clipboard-sync", {
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
    if (rawChannelId !== channelId) {
      socket.join("channel:" + rawChannelId);
    }
  });

  socket.on("send-channel-message", async function (payload) {
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
      const msg = db.saveChannelMessage(channelId, sender.syncId, { text, type, fileData, audioData });
      io.to("channel:" + channelId).emit("channel-message-received", msg);
      if (rawChannelId !== channelId) {
        io.to("channel:" + rawChannelId).emit("channel-message-received", msg);
      }
      const preview = pushBody(type, text, fileData);
      for (const recipientId of db.listChannelRecipientSyncIds(channelId, sender.syncId)) {
        deliverPush(recipientId, buildPushPayload({
          title: `#${(channel && channel.name) || channelId}`,
          body: `${sender.cleanDisplayName || sender.syncId}: ${preview}`,
          type: "channel",
          fromSyncId: sender.syncId,
          channelId: channelId,
          url: `/?openChannel=${encodeURIComponent(channelId)}`
        })).catch((error) => console.warn("[Push] Falló el aviso de canal:", error.message));
      }
    } catch (err) {
      socket.emit("error-message", { message: err.message });
    }
  });

  // Envío de Mensaje Privado (Texto, Audio de Voz o Archivo)
  socket.on("send-private-message", async function (payload) {
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

    if (msgType === "text") {
      messageObj = db.saveTextMessage(
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

      // Si es audio en Base64, persistirlo en disco en /uploads/ para soporte de streaming y Range requests en iOS
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

      messageObj = db.saveMessage({
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

    if (!isRetry) {
      const fromSyncId = sender.syncId;
      deliverPush(targetSyncId, buildPushPayload({
        title: `Nuevo mensaje de ${sender.formattedName || fromSyncId}`,
        body: pushBody(msgType, text, fileData),
        type: "message",
        fromSyncId: fromSyncId,
        url: `/?openChat=${encodeURIComponent(fromSyncId)}`
      })).catch((error) => console.warn("[Push] Falló el aviso de mensaje:", error.message));
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
        io.to(sockId).emit("receive-private-message", messageObj);
      });
    }

    // Confirmación y sincronización a todos los sockets del emisor
    const senderSockets = onlineUsers.get(sender.syncId);
    if (senderSockets && senderSockets.size > 0) {
      senderSockets.forEach((sockId) => {
        io.to(sockId).emit("receive-private-message", messageObj);
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
                io.to(sockId).emit("message-preview-updated", previewEvent);
              });
            }

            const currentSenderSockets = onlineUsers.get(sender.syncId);
            if (currentSenderSockets && currentSenderSockets.size > 0) {
              currentSenderSockets.forEach((sockId) => {
                io.to(sockId).emit("message-preview-updated", previewEvent);
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
          io.to(sockId).emit("messages-read-receipt", receiptData);
        });
      }

      // Sincronizar en otros dispositivos del lector
      const readerSockets = onlineUsers.get(reader.syncId);
      if (readerSockets && readerSockets.size > 0) {
        readerSockets.forEach((sockId) => {
          io.to(sockId).emit("messages-read-receipt", receiptData);
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
      const updated = db.deleteMessageForEveryone(payload.messageId, sender.syncId, targetSyncId);
      if (updated) {
        const eventData = {
          messageId: payload.messageId,
          fromSyncId: sender.syncId,
          toSyncId: targetSyncId
        };

        const targetSockets = onlineUsers.get(targetSyncId);
        if (targetSockets && targetSockets.size > 0) {
          targetSockets.forEach((sockId) => {
            io.to(sockId).emit("message-deleted-for-everyone", eventData);
          });
        }

        const senderSockets = onlineUsers.get(sender.syncId);
        if (senderSockets && senderSockets.size > 0) {
          senderSockets.forEach((sockId) => {
            io.to(sockId).emit("message-deleted-for-everyone", eventData);
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
          io.to(sockId).emit("message-pinned", {
            pinnedMessage: pinned,
            conversationWith: sender.syncId
          });
        });
      }

      const senderSockets = onlineUsers.get(sender.syncId);
      if (senderSockets && senderSockets.size > 0) {
        senderSockets.forEach((sockId) => {
          io.to(sockId).emit("message-pinned", eventData);
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
        io.to(sockId).emit("message-unpinned", { conversationWith: sender.syncId });
      });
    }

    const senderSockets = onlineUsers.get(sender.syncId);
    if (senderSockets && senderSockets.size > 0) {
      senderSockets.forEach((sockId) => {
        io.to(sockId).emit("message-unpinned", { conversationWith: targetSyncId });
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
          io.to(sockId).emit("message-reaction-updated", eventData);
        });
      }

      const senderSockets = onlineUsers.get(sender.syncId);
      if (senderSockets && senderSockets.size > 0) {
        senderSockets.forEach((sockId) => {
          io.to(sockId).emit("message-reaction-updated", eventData);
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
    const reachable = Boolean(targetSockets && targetSockets.size > 0);
    db.recordCall(sender.syncId, targetSyncId, !reachable);
    deliverPush(targetSyncId, buildPushPayload({
      title: reachable ? "Llamada entrante" : "Llamada perdida",
      body: `${reachable ? "Llamada" : "Llamada perdida"} de ${sender.formattedName || sender.syncId}`,
      type: "call",
      fromSyncId: sender.syncId,
      url: `/?openChat=${encodeURIComponent(sender.syncId)}`
    })).catch((error) => console.warn("[Push] Falló el aviso de llamada:", error.message));

    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((sockId) => {
        io.to(sockId).emit("call-made", {
          offer: data.offer,
          fromSyncId: sender.syncId,
          fromName: sender.formattedName
        });
      });
    } else {
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
        io.to(sockId).emit("answer-made", {
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
        io.to(sockId).emit("ice-candidate", {
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
        io.to(sockId).emit("call-rejected", {
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
        io.to(sockId).emit("call-ended", {
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
          io.to(sockId).emit("notification-mirrored", notifData);
        }
      });
    }
  });

  socket.on("quick-reply", async function (payload) {
    const sender = socketToUser.get(socket.id);
    if (!sender || !payload || !payload.toSyncId || !payload.text) return;

    const targetSyncId = String(payload.toSyncId).trim().toUpperCase();
    const targetSockets = onlineUsers.get(targetSyncId);
    const initialStatus = Boolean(targetSockets && targetSockets.size > 0) ? "delivered" : "sent";

    const savedMsg = db.saveTextMessage(
      sender.syncId,
      targetSyncId,
      payload.text,
      null,
      payload.replyTo || null,
      null,
      initialStatus
    );
    savedMsg.fromName = sender.formattedName;
    savedMsg.toSyncId = targetSyncId;

    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((sockId) => {
        io.to(sockId).emit("receive-private-message", savedMsg);
      });
    }

    const senderSockets = onlineUsers.get(sender.syncId);
    if (senderSockets && senderSockets.size > 0) {
      senderSockets.forEach((sockId) => {
        io.to(sockId).emit("receive-private-message", savedMsg);
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
              curTargets.forEach((sockId) => io.to(sockId).emit("message-preview-updated", previewEvent));
            }

            const curSenders = onlineUsers.get(sender.syncId);
            if (curSenders && curSenders.size > 0) {
              curSenders.forEach((sockId) => io.to(sockId).emit("message-preview-updated", previewEvent));
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

if (typeof module !== "undefined" && require.main === module) {
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
    startChatSubscriptionListener(function (pubsubPayload) {
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
  module.exports.isBlockedPreviewHost = isBlockedPreviewHost;
  module.exports.isBlockedPreviewAddress = isBlockedPreviewAddress;
  module.exports.configureWebPush = configureWebPush;
  module.exports.recipientIsFocused = recipientIsFocused;
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
