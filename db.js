const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const DB_FILE = path.join(DATA_DIR, "sync_db.json");

function ensureDbFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [],
      sessions: [],
      contacts: {},
      messages: [],
      files: [],
      pinnedMessages: {},
      subscriptions: {},
      channels: [
        { id: "chan-general", name: "general", description: "Espacio general de sincronización y equipo", createdAt: Date.now(), isDefault: true },
        { id: "chan-anuncios", name: "anuncios", description: "Comunicados oficiales de Workspace y Empresa", createdAt: Date.now(), isDefault: true }
      ],
      channelMessages: [],
      vaultItems: {},
      invoices: {}
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), "utf8");
  }
}

let cachedDb = null;
const writeQueue = [];
let isProcessingQueue = false;
let readFailure = null;

function readDb() {
  if (readFailure) throw readFailure;
  if (cachedDb) {
    return cachedDb;
  }
  try {
    ensureDbFile();
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid database root");
    for (const key of ["users", "sessions", "messages", "files", "channels", "channelMessages", "calls", "organizations"]) {
      if (data[key] !== undefined && !Array.isArray(data[key])) throw new Error("Invalid database collection");
    }
    for (const key of ["contacts", "pinnedMessages", "subscriptions", "mobilePushTokens", "vaultItems", "invoices"]) {
      if (data[key] !== undefined && (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key]))) {
        throw new Error("Invalid database map");
      }
    }
    if (!data.users) data.users = [];
    if (!data.sessions) data.sessions = [];
    if (!data.contacts) data.contacts = {};
    if (!data.messages) data.messages = [];
    if (!Array.isArray(data.files)) data.files = [];
    if (!data.pinnedMessages) data.pinnedMessages = {};
    if (!data.subscriptions) data.subscriptions = {};
    if (!data.mobilePushTokens) data.mobilePushTokens = {};
    if (!data.channels || data.channels.length === 0) {
      data.channels = [
        { id: "chan-general", name: "general", description: "Espacio general de sincronización y equipo", createdAt: Date.now(), isDefault: true },
        { id: "chan-anuncios", name: "anuncios", description: "Comunicados oficiales de Workspace y Empresa", createdAt: Date.now(), isDefault: true }
      ];
    }
    if (!data.channelMessages) data.channelMessages = [];
    if (!data.vaultItems) data.vaultItems = {};
    if (!data.invoices) data.invoices = {};
    if (!Array.isArray(data.calls)) data.calls = [];
    cachedDb = data;
    if (seedDevelopmentAdmin(cachedDb)) {
      writeDb(cachedDb);
    }
    return cachedDb;
  } catch (err) {
    cachedDb = null;
    readFailure = new Error("DB_READ_FAILED: database unavailable; restore a verified backup before restarting");
    throw readFailure;
  }
}

async function processWriteQueue() {
  if (isProcessingQueue || writeQueue.length === 0) {
    return;
  }
  isProcessingQueue = true;

  while (writeQueue.length > 0) {
    const item = writeQueue[0];
    const tmpFile = `${DB_FILE}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      ensureDbFile();
      await fs.promises.writeFile(tmpFile, item.content, "utf8");
      await fs.promises.rename(tmpFile, DB_FILE);
      writeQueue.shift();
      item.resolve();
    } catch (err) {
      console.error("[DB] Error en escritura atómica:", err.message);
      try {
        if (fs.existsSync(tmpFile)) {
          await fs.promises.unlink(tmpFile);
        }
      } catch (_) {}
      writeQueue.shift();
      item.reject(err);
    }
  }

  isProcessingQueue = false;
}

function writeDb(data) {
  // A failed read must never be followed by replacement with empty/new data.
  readDb();
  cachedDb = data;
  const content = JSON.stringify(data, null, 2);
  const promise = new Promise((resolve, reject) => {
    writeQueue.push({ content, resolve, reject });
    processWriteQueue();
  });
  promise.catch(() => {});
  return promise;
}

function removeEmojis(str) {
  if (!str) return "Usuario";
  const cleaned = str
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{1F004}\u{1F0CF}\u{E0020}-\u{E007F}]/gu, "")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
    .replace(/[^\w\s\u00C0-\u00FF\-_.]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Usuario";
}

function formatFullName(syncId, cleanName) {
  return `${syncId} - ${cleanName}`;
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
}

function seedDevelopmentAdmin(data) {
  const isDevelopment = process.env.NODE_ENV === "development" &&
    process.env.SEED_DEVELOPMENT_ADMIN === "true" &&
    !process.env.RENDER && !process.env.RENDER_EXTERNAL_URL;
  if (!isDevelopment || typeof process.env.SEED_DEVELOPMENT_ADMIN_PASSWORD !== "string" || process.env.SEED_DEVELOPMENT_ADMIN_PASSWORD.length < 12) {
    return false;
  }

  const existingAdmin = data.users.some((user) =>
    String(user.username || "").trim().toLowerCase() === "admin"
  );
  const existingSyncId = data.users.some((user) =>
    String(user.syncId || "").trim().toUpperCase() === "SYNC-0000"
  );
  if (existingAdmin || existingSyncId) {
    if (existingAdmin !== existingSyncId) {
      console.warn("[DB] No se creó el usuario de desarrollo: admin o SYNC-0000 ya está asignado.");
    }
    return false;
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const cleanDisplayName = "Admin";
  data.users.push({
    id: crypto.randomUUID ? crypto.randomUUID() : "usr_" + Date.now(),
    syncId: "SYNC-0000",
    username: "admin",
    cleanDisplayName: cleanDisplayName,
    formattedName: formatFullName("SYNC-0000", cleanDisplayName),
    salt: salt,
    passwordHash: hashPassword(process.env.SEED_DEVELOPMENT_ADMIN_PASSWORD, salt),
    createdAt: Date.now(),
    plan: "pro",
    role: "admin"
  });
  if (!data.contacts["SYNC-0000"]) {
    data.contacts["SYNC-0000"] = [];
  }
  return true;
}

function generateSyncId(users) {
  const existing = new Set(users.map((u) => u.syncId));
  for (let i = 0; i < 1000; i++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const candidate = `SYNC-${num}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `SYNC-${Date.now().toString().slice(-4)}`;
}

function toPublicUser(user) {
  return {
    syncId: user.syncId,
    username: user.username,
    cleanDisplayName: user.cleanDisplayName,
    formattedName: user.formattedName || formatFullName(user.syncId, user.cleanDisplayName),
    avatarUrl: user.avatarUrl || null,
    plan: user.plan || "free",
    role: user.role || "member",
    planExpiresAt: user.planExpiresAt || null
  };
}

function registerUser(username, password, rawDisplayName) {
  if (!username || !password) {
    throw new Error("Usuario y contraseña son obligatorios");
  }

  const cleanUsername = String(username).trim().toLowerCase();
  if (cleanUsername.length < 3) {
    throw new Error("El usuario debe tener al menos 3 caracteres");
  }
  if (String(password).length < 4) {
    throw new Error("La contraseña debe tener al menos 4 caracteres");
  }

  const db = readDb();
  const exists = db.users.find((u) => u.username === cleanUsername);
  if (exists) {
    throw new Error("El nombre de usuario ya está registrado");
  }

  const syncId = generateSyncId(db.users);
  const cleanDisplayName = removeEmojis(rawDisplayName || username);
  const formattedName = formatFullName(syncId, cleanDisplayName);
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);

  const newUser = {
    id: crypto.randomUUID ? crypto.randomUUID() : "usr_" + Date.now(),
    syncId: syncId,
    username: cleanUsername,
    cleanDisplayName: cleanDisplayName,
    formattedName: formattedName,
    salt: salt,
    passwordHash: passwordHash,
    createdAt: Date.now()
  };

  db.users.push(newUser);

  if (!db.contacts[syncId]) {
    db.contacts[syncId] = [];
  }

  writeDb(db);

  return toPublicUser(newUser);
}

function loginUser(username, password) {
  if (!username || !password) {
    throw new Error("Usuario y contraseña requeridos");
  }

  const cleanUsername = String(username).trim().toLowerCase();
  const db = readDb();
  const user = db.users.find((u) => u.username === cleanUsername);
  if (!user) {
    throw new Error("Credenciales inválidas");
  }

  const hash = hashPassword(password, user.salt);
  const storedHash = String(user.passwordHash || "");
  const hashBuffer = Buffer.from(hash, "hex");
  const storedHashBuffer = Buffer.from(storedHash, "hex");
  if (hashBuffer.length !== storedHashBuffer.length || !crypto.timingSafeEqual(hashBuffer, storedHashBuffer)) {
    throw new Error("Credenciales inválidas");
  }

  const token = crypto.randomBytes(32).toString("hex");
  db.sessions.push({
    token: token,
    syncId: user.syncId,
    createdAt: Date.now()
  });

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.sessions = db.sessions.filter((s) => s.createdAt > cutoff);

  writeDb(db);

  return { token: token, user: toPublicUser(user) };
}

function getUserByToken(token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const db = readDb();
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;

  const expiresAt = Number(session.expiresAt || (session.createdAt + 30 * 24 * 60 * 60 * 1000));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    db.sessions = db.sessions.filter((s) => s.token !== token);
    writeDb(db);
    return null;
  }

  const user = db.users.find((u) => u.syncId === session.syncId);
  return user ? toPublicUser(user) : null;
}

function revokeSession(token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return false;
  const db = readDb();
  const originalLength = db.sessions.length;
  db.sessions = db.sessions.filter((session) => session.token !== token);
  if (db.sessions.length === originalLength) return false;
  writeDb(db);
  return true;
}

function getUserBySyncId(syncId) {
  if (!syncId) return null;
  const db = readDb();
  const user = db.users.find((u) => u.syncId === syncId.trim().toUpperCase());
  return user ? toPublicUser(user) : null;
}

async function updateUserProfile(syncId, rawName, avatarUrl) {
  const db = readDb();
  const user = db.users.find((u) => u.syncId === syncId);
  if (!user) throw new Error("Usuario no encontrado");

  if (rawName !== undefined && rawName !== null) {
    const clean = removeEmojis(rawName);
    user.cleanDisplayName = clean;
    user.formattedName = formatFullName(user.syncId, clean);
  }
  if (avatarUrl !== undefined) {
    user.avatarUrl = avatarUrl;
  }
  await writeDb(db);

  return toPublicUser(user);
}

function addContact(userSyncId, targetSyncId) {
  const targetId = String(targetSyncId).trim().toUpperCase();
  if (userSyncId === targetId) {
    throw new Error("No puedes agregarte a ti mismo como contacto");
  }

  const db = readDb();
  const targetUser = db.users.find((u) => u.syncId === targetId);
  if (!targetUser) {
    throw new Error("Código ID no encontrado");
  }

  if (!db.contacts[userSyncId]) {
    db.contacts[userSyncId] = [];
  }

  if (!db.contacts[userSyncId].includes(targetId)) {
    db.contacts[userSyncId].push(targetId);
  }

  if (!db.contacts[targetId]) {
    db.contacts[targetId] = [];
  }
  if (!db.contacts[targetId].includes(userSyncId)) {
    db.contacts[targetId].push(userSyncId);
  }

  writeDb(db);

  return { ok: true, target: toPublicUser(targetUser) };
}

function getUserContacts(userSyncId, onlineSyncIds = new Set()) {
  const db = readDb();
  if (!db.contacts[userSyncId]) {
    db.contacts[userSyncId] = [];
    writeDb(db);
  }

  const list = db.contacts[userSyncId].filter((id) => id !== userSyncId);
  const contactsList = [];

  for (const id of list) {
    const u = db.users.find((item) => item.syncId === id);
    if (u) {
      const pub = toPublicUser(u);
      pub.isOnline = onlineSyncIds.has(id);
      
      const lastMsg = db.messages
        .filter((m) => (m.fromId === userSyncId && m.toId === id) || (m.fromId === id && m.toId === userSyncId))
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      
      let lastText = '';
      if (lastMsg) {
        if (lastMsg.deletedForEveryone) lastText = '🚫 Este mensaje fue eliminado';
        else if (lastMsg.type === 'audio') lastText = '🎤 Nota de voz';
        else if (lastMsg.type === 'file') lastText = '📎 ' + (lastMsg.fileData?.name || lastMsg.fileName || 'Archivo');
        else if (lastMsg.type === 'call') lastText = lastMsg.text || '📞 Llamada de voz';
        else lastText = lastMsg.text || '';
      }

      pub.lastMessage = lastMsg ? {
        text: lastText,
        timestamp: lastMsg.timestamp,
        fromId: lastMsg.fromId,
        status: lastMsg.status || (lastMsg.read ? 'read' : 'delivered')
      } : null;

      contactsList.push(pub);
    }
  }

  return contactsList;
}

/**
 * Registra el inicio de una llamada para poder contabilizar las perdidas.
 * @param {string} fromId syncId de quien llama.
 * @param {string} toId syncId de quien recibe.
 * @param {boolean} unavailable true si el destinatario no estaba en línea.
 * @returns {object} Registro de llamada creado.
 */
function recordCall(fromId, toId, unavailable) {
  const db = readDb();
  const call = {
    id: 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    fromId: fromId,
    toId: toId,
    timestamp: Date.now(),
    status: unavailable ? 'missed' : 'ringing'
  };
  db.calls.push(call);
  if (db.calls.length > 2000) {
    db.calls = db.calls.slice(-2000);
  }
  writeDb(db);
  return call;
}

/**
 * Actualiza la última llamada pendiente entre dos usuarios.
 * @param {string} fromId syncId de quien llamó.
 * @param {string} toId syncId de quien recibió.
 * @param {'answered'|'rejected'|'missed'} status Nuevo estado.
 * @returns {boolean} true si se encontró una llamada en curso.
 */
function resolveCall(fromId, toId, status) {
  const db = readDb();
  for (let i = db.calls.length - 1; i >= 0; i--) {
    const call = db.calls[i];
    if (call.fromId === fromId && call.toId === toId && call.status === 'ringing') {
      call.status = status;
      writeDb(db);
      return true;
    }
  }
  return false;
}

/**
 * Resumen para el widget nativo: mensajes sin leer y llamadas perdidas.
 * @param {string} syncId syncId del usuario autenticado.
 * @param {number} callsSince Marca de tiempo desde la que se cuentan llamadas perdidas.
 * @returns {{unreadMessages:number, missedCalls:number, latest:Array<object>}}
 */
function getWidgetSummary(syncId, callsSince) {
  const db = readDb();
  const since = Number(callsSince) || 0;
  const unread = db.messages
    .filter((m) => m.toId === syncId && m.fromId !== syncId && !m.read && m.status !== 'read' && !m.deletedForEveryone)
    .sort((a, b) => b.timestamp - a.timestamp);
  const missed = db.calls.filter((c) => c.toId === syncId && c.status === 'missed' && c.timestamp > since);
  const nameOf = (id) => {
    const user = db.users.find((u) => u.syncId === id);
    return user ? (user.formattedName || formatFullName(user.syncId, user.cleanDisplayName)) : id;
  };
  const latest = unread.slice(0, 5).map((m) => ({
    id: m.id,
    fromId: m.fromId,
    fromName: nameOf(m.fromId),
    type: m.type || 'text',
    text: m.type === 'text' || !m.type ? String(m.text || '').slice(0, 120) : '',
    timestamp: m.timestamp
  }));
  return { unreadMessages: unread.length, missedCalls: missed.length, latest: latest };
}
async function registerFile(ownerId, file) {
  if (!file.filename || file.filename === "." || file.filename === ".." ||
      /[/\\:\u0000]/.test(file.filename)) throw new Error("Nombre físico de archivo inválido");
  const data = readDb();
  const record = {
    id: crypto.randomUUID(),
    ownerId: String(ownerId).trim().toUpperCase(),
    filename: file.filename,
    name: file.originalname || file.filename,
    size: file.size,
    type: file.mimetype || "application/octet-stream",
    createdAt: Date.now()
  };
  data.files.push(record);
  await writeDb(data);
  return record;
}

function getFileById(id) {
  return readDb().files.find((file) => file.id === id) || null;
}

function getFileByFilename(filename) {
  return readDb().files.find((file) => file.filename === filename) || null;
}

function canReadFile(fileId, userId) {
  const data = readDb();
  const file = data.files.find((item) => item.id === fileId);
  if (!file) return false;
  return data.messages.some((message) => !message.deletedForEveryone &&
    message.fromId === file.ownerId && Array.isArray(message.fileIds) && message.fileIds.includes(fileId) &&
    (message.fromId === userId || message.toId === userId));
}

function saveMessage(msgData) {
  const db = readDb();
  const fromId = String(msgData.fromId).trim().toUpperCase();
  const toId = String(msgData.toId).trim().toUpperCase();
  if (msgData.id) {
    const existingMessage = db.messages.find((message) => message.id === msgData.id);
    if (existingMessage) {
      if (existingMessage.fromId === fromId && existingMessage.toId === toId) return existingMessage;
      throw new Error("El identificador del mensaje ya está en uso");
    }
  }
  const fileIds = [...new Set(msgData.fileIds || [])];
  for (const fileId of fileIds) {
    const file = db.files.find((item) => item.id === fileId);
    if (!file || file.ownerId !== fromId) throw new Error("No puedes compartir este archivo");
  }
  const newMsg = {
    id: msgData.id || ("msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7)),
    fromId: fromId,
    toId: toId,
    type: msgData.type || "text",
    text: msgData.text || "",
    audioData: msgData.audioData || null,
    fileData: msgData.fileData || null,
    fileIds: fileIds,
    callData: msgData.callData || null,
    replyTo: msgData.replyTo || null,
    linkPreview: msgData.linkPreview || null,
    reactions: msgData.reactions || {},
    timestamp: msgData.timestamp || Date.now(),
    status: msgData.status || 'sent', // 'sent' | 'delivered' | 'read'
    read: Boolean(msgData.read || msgData.status === 'read'),
    deletedForEveryone: false
  };

  db.messages.push(newMsg);

  if (db.messages.length > 5000) {
    db.messages = db.messages.slice(-5000);
  }

  writeDb(db);
  return newMsg;
}

function getMessageById(messageId) {
  return readDb().messages.find((message) => message.id === messageId) || null;
}

function saveTextMessage(fromId, toId, text, customId = null, replyTo = null, linkPreview = null, status = 'sent') {
  return saveMessage({
    id: customId,
    fromId: fromId,
    toId: toId,
    type: "text",
    text: text,
    replyTo: replyTo,
    linkPreview: linkPreview,
    status: status,
    read: status === 'read'
  });
}

function pairOwnsMessage(msg, userA, userB) {
  const a = String(userA || "").trim().toUpperCase();
  const b = String(userB || "").trim().toUpperCase();
  const from = String(msg && msg.fromId || "").trim().toUpperCase();
  const to = String(msg && msg.toId || "").trim().toUpperCase();
  return Boolean(a && b && a !== b && ((from === a && to === b) || (from === b && to === a)));
}

function updateMessageReaction(messageId, userSyncId, emoji, conversationUserId) {
  const db = readDb();
  const msg = db.messages.find((m) => m.id === messageId);
  if (!msg || msg.deletedForEveryone) {
    throw new Error("Mensaje no encontrado");
  }

  const actor = String(userSyncId || "").trim().toUpperCase();
  const peer = String(conversationUserId || "").trim().toUpperCase();
  if (!pairOwnsMessage(msg, actor, peer)) {
    throw new Error("No tienes permisos para reaccionar a este mensaje");
  }

  const cleanEmoji = String(emoji || "").trim();
  if (!cleanEmoji || cleanEmoji.length > 32 || /[\u0000-\u001F<>]/.test(cleanEmoji)) {
    throw new Error("Reacción no válida");
  }

  if (!msg.reactions || typeof msg.reactions !== "object" || Array.isArray(msg.reactions)) {
    msg.reactions = {};
  }
  if (msg.reactions[actor] === cleanEmoji) {
    delete msg.reactions[actor];
  } else {
    msg.reactions[actor] = cleanEmoji;
  }
  writeDb(db);
  return msg.reactions;
}

function updateMessageStatus(messageId, status) {
  const db = readDb();
  const msg = db.messages.find((m) => m.id === messageId);
  if (msg) {
    // Si ya está leído, no degradar
    if (msg.status === 'read' && status !== 'read') {
      return msg;
    }
    msg.status = status;
    if (status === 'read') {
      msg.read = true;
    }
    writeDb(db);
    return msg;
  }
  return null;
}

function updateMessageLinkPreview(messageId, linkPreview) {
  const db = readDb();
  const msg = db.messages.find((m) => m.id === messageId);
  if (msg) {
    msg.linkPreview = linkPreview;
    writeDb(db);
    return msg;
  }
  return null;
}

function markMessagesAsRead(senderSyncId, receiverSyncId) {
  const db = readDb();
  const updatedIds = [];
  db.messages.forEach((m) => {
    if (m.fromId === senderSyncId && m.toId === receiverSyncId && m.status !== 'read') {
      m.status = 'read';
      m.read = true;
      updatedIds.push(m.id);
    }
  });

  if (updatedIds.length > 0) {
    writeDb(db);
  }
  return updatedIds;
}

function deleteMessageForEveryone(messageId, senderSyncId, peerSyncId) {
  const db = readDb();
  const msg = db.messages.find((m) => m.id === messageId);
  if (!msg) return null;
  const sender = String(senderSyncId || "").trim().toUpperCase();
  const peer = String(peerSyncId || "").trim().toUpperCase();
  const from = String(msg.fromId || "").trim().toUpperCase();
  const to = String(msg.toId || "").trim().toUpperCase();
  if (from !== sender || (peer && to !== peer)) {
    throw new Error("No tienes permisos para eliminar este mensaje");
  }

  msg.deletedForEveryone = true;
  msg.text = "Este mensaje fue eliminado";
  msg.type = "text";
  delete msg.audioData;
  delete msg.fileData;
  delete msg.linkPreview;
  msg.reactions = {};

  writeDb(db);
  return msg;
}

function getConversationKey(user1Id, user2Id) {
  return [user1Id.toUpperCase(), user2Id.toUpperCase()].sort().join(":");
}

function getPinnedMessage(user1Id, user2Id) {
  const db = readDb();
  const key = getConversationKey(user1Id, user2Id);
  const msgId = db.pinnedMessages[key];
  if (!msgId) return null;
  const msg = db.messages.find((m) => m.id === msgId);
  if (!msg || msg.deletedForEveryone || !pairOwnsMessage(msg, user1Id, user2Id)) {
    delete db.pinnedMessages[key];
    writeDb(db);
    return null;
  }
  return msg;
}

function setPinnedMessage(user1Id, user2Id, messageId) {
  const db = readDb();
  const key = getConversationKey(user1Id, user2Id);
  const msg = db.messages.find((m) => m.id === messageId);
  if (!msg || msg.deletedForEveryone) {
    throw new Error("Mensaje no encontrado");
  }
  if (!pairOwnsMessage(msg, user1Id, user2Id)) {
    throw new Error("No tienes permisos para fijar este mensaje en esa conversación");
  }
  db.pinnedMessages[key] = messageId;
  writeDb(db);
  return msg;
}

function unpinMessage(user1Id, user2Id) {
  const db = readDb();
  const key = getConversationKey(user1Id, user2Id);
  delete db.pinnedMessages[key];
  writeDb(db);
  return true;
}

function getMessagesBetween(user1Id, user2Id) {
  const db = readDb();
  const u1 = String(user1Id).trim().toUpperCase();
  const u2 = String(user2Id).trim().toUpperCase();
  return db.messages.filter((m) => {
    const mFrom = String(m.fromId).trim().toUpperCase();
    const mTo = String(m.toId).trim().toUpperCase();
    return (mFrom === u1 && mTo === u2) || (mFrom === u2 && mTo === u1);
  }).sort((a, b) => a.timestamp - b.timestamp);
}

function clearMessagesBetween(user1Id, user2Id) {
  const db = readDb();
  const u1 = String(user1Id).trim().toUpperCase();
  const u2 = String(user2Id).trim().toUpperCase();
  const initialCount = db.messages.length;
  db.messages = db.messages.filter((m) => {
    const mFrom = String(m.fromId).trim().toUpperCase();
    const mTo = String(m.toId).trim().toUpperCase();
    return !((mFrom === u1 && mTo === u2) || (mFrom === u2 && mTo === u1));
  });
  const key = getConversationKey(u1, u2);
  delete db.pinnedMessages[key];
  writeDb(db);
  return initialCount - db.messages.length;
}

function savePushSubscription(syncId, subscription, userAgent = "") {
  if (!syncId || !subscription || !subscription.endpoint) return false;
  const db = readDb();
  if (!db.subscriptions) db.subscriptions = {};
  const sId = String(syncId).trim().toUpperCase();
  if (!db.subscriptions[sId]) db.subscriptions[sId] = [];

  const existingIdx = db.subscriptions[sId].findIndex((s) => s.endpoint === subscription.endpoint);
  const subData = {
    endpoint: subscription.endpoint,
    keys: subscription.keys || {},
    userAgent: userAgent || "",
    updatedAt: Date.now()
  };

  if (existingIdx >= 0) {
    db.subscriptions[sId][existingIdx] = subData;
  } else {
    db.subscriptions[sId].push(subData);
  }

  writeDb(db);
  return true;
}

function getPushSubscriptions(syncId) {
  if (!syncId) return [];
  const db = readDb();
  if (!db.subscriptions) return [];
  const sId = String(syncId).trim().toUpperCase();
  return db.subscriptions[sId] || [];
}

function removePushSubscription(syncId, endpoint) {
  if (!syncId || !endpoint) return false;
  const db = readDb();
  if (!db.subscriptions) return false;
  const sId = String(syncId).trim().toUpperCase();
  if (!db.subscriptions[sId]) return false;
  const initLen = db.subscriptions[sId].length;
  db.subscriptions[sId] = db.subscriptions[sId].filter((s) => s.endpoint !== endpoint);
  if (db.subscriptions[sId].length !== initLen) {
    writeDb(db);
    return true;
  }
  return false;
}

/**
 * Registra o renueva un token FCM asociado al usuario.
 * @param {string} syncId Identificador del usuario.
 * @param {string} token Token de registro de Firebase.
 * @returns {boolean} true cuando el token queda almacenado.
 */
function saveMobilePushToken(syncId, token) {
  if (!syncId || typeof token !== "string" || token.length < 20 || token.length > 4096) return false;
  const db = readDb();
  if (!db.mobilePushTokens) db.mobilePushTokens = {};
  const sId = String(syncId).trim().toUpperCase();
  const tokens = db.mobilePushTokens[sId] || (db.mobilePushTokens[sId] = []);
  const existing = tokens.find((item) => item.token === token);
  if (existing) {
    existing.updatedAt = Date.now();
  } else {
    tokens.push({ token: token, updatedAt: Date.now() });
  }
  writeDb(db);
  return true;
}

/**
 * Devuelve los tokens Android del usuario.
 * @param {string} syncId Identificador del usuario.
 * @returns {Array<{token:string,updatedAt:number}>}
 */
function getMobilePushTokens(syncId) {
  if (!syncId) return [];
  const db = readDb();
  const sId = String(syncId).trim().toUpperCase();
  return (db.mobilePushTokens && db.mobilePushTokens[sId]) || [];
}

/**
 * Elimina el token FCM de un usuario.
 * @param {string} syncId Identificador del usuario.
 * @param {string} token Token a eliminar.
 * @returns {boolean} true si el token estaba registrado.
 */
function removeMobilePushToken(syncId, token) {
  if (!syncId || !token) return false;
  const db = readDb();
  const sId = String(syncId).trim().toUpperCase();
  if (!db.mobilePushTokens || !Array.isArray(db.mobilePushTokens[sId])) return false;
  const current = db.mobilePushTokens[sId];
  db.mobilePushTokens[sId] = current.filter((item) => item.token !== token);
  if (db.mobilePushTokens[sId].length === current.length) return false;
  writeDb(db);
  return true;
}

// ==== Planes, Suscripciones y Facturación ====
function upgradeUserPlan(syncId, plan, billingCycle = "monthly", paymentDetails = {}) {
  const db = readDb();
  const sId = String(syncId).trim().toUpperCase();
  const user = db.users.find((u) => u.syncId === sId);
  if (!user) {
    throw new Error("Usuario no encontrado");
  }

  const validPlans = ["free", "pro", "enterprise"];
  if (!validPlans.includes(plan)) {
    throw new Error("Plan no válido");
  }

  const days = billingCycle === "yearly" ? 365 : 30;
  const planExpiresAt = Date.now() + days * 24 * 60 * 60 * 1000;

  user.plan = plan;
  user.planExpiresAt = planExpiresAt;
  user.billingCycle = billingCycle;
  user.updatedAt = Date.now();

  // Registrar Factura
  if (!db.invoices) db.invoices = {};
  if (!db.invoices[sId]) db.invoices[sId] = [];

  const invoiceAmount = plan === "pro" 
    ? (billingCycle === "yearly" ? 89 : 9) 
    : (plan === "enterprise" ? (billingCycle === "yearly" ? 228 : 24) : 0);

  const invoice = {
    id: "inv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
    syncId: sId,
    plan: plan,
    billingCycle: billingCycle,
    amountUsd: invoiceAmount,
    discountApplied: paymentDetails.discountApplied || 0,
    paymentMethod: paymentDetails.method || "card",
    cardLast4: paymentDetails.last4 || null,
    status: "paid",
    issuedAt: Date.now(),
    expiresAt: planExpiresAt
  };

  db.invoices[sId].unshift(invoice);
  writeDb(db);

  return {
    user: toPublicUser(user),
    invoice: invoice
  };
}

function getUserInvoices(syncId) {
  const db = readDb();
  const sId = String(syncId).trim().toUpperCase();
  return (db.invoices && db.invoices[sId]) || [];
}

// ==== Bóveda Cifrada Privada (Encrypted Vault) ====
const VAULT_KDF_ITERATIONS = 310000;

/**
 * Validates the browser-generated encryption envelope without interpreting its contents.
 * AES-GCM ciphertext contains its authentication tag as the final 16 bytes.
 * @param {object} encryptedContent
 * @returns {boolean}
 */
function isValidVaultEnvelope(encryptedContent) {
  if (!encryptedContent || typeof encryptedContent !== "object" || Array.isArray(encryptedContent) ||
      encryptedContent.version !== 1 || encryptedContent.algorithm !== "AES-GCM" ||
      encryptedContent.kdf !== "PBKDF2" || encryptedContent.hash !== "SHA-256" ||
      encryptedContent.iterations !== VAULT_KDF_ITERATIONS) return false;

  const fields = ["salt", "iv", "ciphertext"];
  if (fields.some((field) => typeof encryptedContent[field] !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encryptedContent[field]))) {
    return false;
  }

  const salt = Buffer.from(encryptedContent.salt, "base64");
  const iv = Buffer.from(encryptedContent.iv, "base64");
  const ciphertext = Buffer.from(encryptedContent.ciphertext, "base64");
  return salt.length === 16 && iv.length === 12 && ciphertext.length >= 16 &&
    ciphertext.length <= 1024 * 1024 && salt.toString("base64") === encryptedContent.salt &&
    iv.toString("base64") === encryptedContent.iv && ciphertext.toString("base64") === encryptedContent.ciphertext;
}

/**
 * Copies only the supported envelope fields so extra client data is never stored.
 * @param {object} encryptedContent
 * @returns {object|null}
 */
function normalizeVaultEnvelope(encryptedContent) {
  if (!isValidVaultEnvelope(encryptedContent)) return null;
  return {
    version: encryptedContent.version,
    algorithm: encryptedContent.algorithm,
    kdf: encryptedContent.kdf,
    hash: encryptedContent.hash,
    iterations: encryptedContent.iterations,
    salt: encryptedContent.salt,
    iv: encryptedContent.iv,
    ciphertext: encryptedContent.ciphertext
  };
}

function getVaultItems(syncId) {
  const db = readDb();
  const sId = String(syncId).trim().toUpperCase();
  return ((db.vaultItems && db.vaultItems[sId]) || [])
    .filter((item) => isValidVaultEnvelope(item.encryptedContent))
    .map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      encryptedContent: normalizeVaultEnvelope(item.encryptedContent),
      hint: item.hint,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));
}

function saveVaultItem(syncId, itemData) {
  if (!itemData || typeof itemData !== "object" || Array.isArray(itemData) ||
      Object.prototype.hasOwnProperty.call(itemData, "secretContent") ||
      Object.prototype.hasOwnProperty.call(itemData, "secret")) {
    throw new Error("Solo se aceptan secretos cifrados en el cliente");
  }

  const db = readDb();
  const sId = String(syncId).trim().toUpperCase();
  if (!db.vaultItems) db.vaultItems = {};
  if (!db.vaultItems[sId]) db.vaultItems[sId] = [];

  const { id, title, category, encryptedContent, hint } = itemData;
  const allowedCategories = ["password", "note", "api-key", "financial"];
  const safeEncryptedContent = normalizeVaultEnvelope(encryptedContent);
  if (typeof title !== "string" || !title.trim() || title.length > 100 ||
      !allowedCategories.includes(category) || !safeEncryptedContent ||
      (hint != null && (typeof hint !== "string" || hint.length > 80))) {
    throw new Error("Metadatos o payload cifrado de bóveda no válidos");
  }

  const existingIdx = id ? db.vaultItems[sId].findIndex((i) =>
    i.id === id && isValidVaultEnvelope(i.encryptedContent)) : -1;
  const now = Date.now();
  const safeHint = hint ? hint : null;

  if (existingIdx >= 0) {
    const existing = db.vaultItems[sId][existingIdx];
    db.vaultItems[sId][existingIdx] = {
      id: existing.id,
      title: String(title).slice(0, 100),
      category: category,
      encryptedContent: safeEncryptedContent,
      hint: safeHint,
      createdAt: existing.createdAt,
      updatedAt: now
    };
    writeDb(db);
    return db.vaultItems[sId][existingIdx];
  } else {
    const newItem = {
      id: "vlt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      title: String(title).slice(0, 100),
      category: category,
      encryptedContent: safeEncryptedContent,
      hint: safeHint,
      createdAt: now,
      updatedAt: now
    };
    db.vaultItems[sId].unshift(newItem);
    writeDb(db);
    return newItem;
  }
}

function deleteVaultItem(syncId, itemId) {
  const db = readDb();
  const sId = String(syncId).trim().toUpperCase();
  if (!db.vaultItems || !db.vaultItems[sId]) return false;
  const prevLen = db.vaultItems[sId].length;
  db.vaultItems[sId] = db.vaultItems[sId].filter((i) => i.id !== itemId);
  if (db.vaultItems[sId].length !== prevLen) {
    writeDb(db);
    return true;
  }
  return false;
}

// ==== Canales de Espacio de Trabajo (Workspace Channels) ====
/**
 * Returns only the channels visible to the registered user.
 * @param {string} userSyncId
 * @returns {Array<object>}
 */
function getWorkspaceChannels(userSyncId) {
  const db = readDb();
  return (db.channels || []).filter((channel) => isChannelMember(channel.id, userSyncId));
}

function findChannel(channelId) {
  if (!channelId) return null;
  const db = readDb();
  const raw = String(channelId).trim();
  const clean = raw.replace(/^#/, "").toLowerCase();
  return (db.channels || []).find((c) => 
    c.id === raw || 
    c.id === clean || 
    c.id === ("chan-" + clean) || 
    c.name.toLowerCase() === clean
  ) || null;
}

/**
 * Checks whether a registered user is allowed to access a workspace channel.
 * Default workspace channels are available to every registered user; custom
 * channels are limited to their creator and explicitly listed members.
 * @param {string} channelId
 * @param {string} userSyncId
 * @returns {boolean}
 */
function isChannelMember(channelId, userSyncId) {
  if (!channelId || !userSyncId) return false;
  const db = readDb();
  const normalizedUserId = String(userSyncId).trim().toUpperCase();
  if (!db.users.some((user) => String(user.syncId).trim().toUpperCase() === normalizedUserId)) {
    return false;
  }

  const raw = String(channelId).trim();
  const clean = raw.replace(/^#/, "").toLowerCase();
  const channel = (db.channels || []).find((item) => 
    item.id === raw || 
    item.id === clean || 
    item.id === ("chan-" + clean) || 
    item.name.toLowerCase() === clean
  );
  if (!channel) return false;
  if (channel.orgId) {
    const organization = (db.organizations || []).find((org) => org.id === channel.orgId);
    if (!organization) return false;
    const member = Array.isArray(organization.memberSyncIds) &&
      organization.memberSyncIds.some((id) => String(id).trim().toUpperCase() === normalizedUserId);
    if (!member) return false;
  }
  if (channel.isDefault && !channel.orgId) return true;
  if (String(channel.creatorSyncId || "").trim().toUpperCase() === normalizedUserId) return true;
  return Array.isArray(channel.memberSyncIds) &&
    channel.memberSyncIds.some((memberId) => String(memberId).trim().toUpperCase() === normalizedUserId);
}

function createWorkspaceChannel(name, description, creatorSyncId) {
  const db = readDb();
  if (!db.channels) db.channels = [];

  const cleanName = String(name || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  if (cleanName.length < 2) {
    throw new Error("El nombre del canal debe tener al menos 2 caracteres alfanuméricos");
  }

  const exists = db.channels.find((c) => c.name === cleanName);
  if (exists) {
    throw new Error("Ya existe un canal con este nombre");
  }

  const newChannel = {
    id: "chan-" + cleanName + "-" + Date.now().toString(36),
    name: cleanName,
    description: String(description || "Canal de equipo").slice(0, 120),
    creatorSyncId: creatorSyncId,
    memberSyncIds: [String(creatorSyncId).trim().toUpperCase()],
    createdAt: Date.now(),
    isDefault: false
  };

  db.channels.push(newChannel);
  writeDb(db);
  return newChannel;
}

function canAdministerChannel(channel, actorSyncId) {
  const actor = String(actorSyncId || "").trim().toUpperCase();
  if (!actor || channel.isDefault) return false;
  if (String(channel.creatorSyncId || "").trim().toUpperCase() === actor) return true;
  return Array.isArray(channel.adminSyncIds) &&
    channel.adminSyncIds.some((id) => String(id).trim().toUpperCase() === actor);
}

function grantWorkspaceChannelAdmin(channelId, actorSyncId, targetSyncId) {
  const db = readDb();
  const channel = findChannel(channelId);
  if (!channel) throw new Error("Canal no encontrado");
  if (channel.isDefault) throw new Error("Los canales predeterminados son administrados por el sistema");
  if (String(channel.creatorSyncId || "").trim().toUpperCase() !== String(actorSyncId || "").trim().toUpperCase()) {
    throw new Error("Solo el creador puede otorgar o retirar permisos de administrador");
  }
  const target = String(targetSyncId || "").trim().toUpperCase();
  if (!db.users.some((user) => String(user.syncId || "").trim().toUpperCase() === target)) {
    throw new Error("No existe un usuario con ese ID SYNC");
  }
  if (target === String(channel.creatorSyncId || "").trim().toUpperCase()) throw new Error("El creador ya es administrador del canal");
  if (!Array.isArray(channel.memberSyncIds)) channel.memberSyncIds = [];
  if (!channel.memberSyncIds.some((id) => String(id).trim().toUpperCase() === target)) channel.memberSyncIds.push(target);
  if (!Array.isArray(channel.adminSyncIds)) channel.adminSyncIds = [];
  if (!channel.adminSyncIds.some((id) => String(id).trim().toUpperCase() === target)) channel.adminSyncIds.push(target);
  writeDb(db);
  return channel;
}

function revokeWorkspaceChannelAdmin(channelId, actorSyncId, targetSyncId) {
  const db = readDb();
  const channel = findChannel(channelId);
  if (!channel) throw new Error("Canal no encontrado");
  if (channel.isDefault) throw new Error("Los canales predeterminados son administrados por el sistema");
  if (String(channel.creatorSyncId || "").trim().toUpperCase() !== String(actorSyncId || "").trim().toUpperCase()) {
    throw new Error("Solo el creador puede otorgar o retirar permisos de administrador");
  }
  const target = String(targetSyncId || "").trim().toUpperCase();
  channel.adminSyncIds = (channel.adminSyncIds || []).filter((id) => String(id).trim().toUpperCase() !== target);
  writeDb(db);
  return channel;
}

function updateWorkspaceChannel(channelId, actorSyncId, updates = {}) {
  const db = readDb();
  const rawChannelId = String(channelId || "").trim();
  const cleanChannelId = rawChannelId.replace(/^#/, "").toLowerCase();
  const channel = (db.channels || []).find((item) =>
    item.id === rawChannelId ||
    item.id === cleanChannelId ||
    item.id === ("chan-" + cleanChannelId) ||
    String(item.name || "").toLowerCase() === cleanChannelId
  );
  if (!channel) throw new Error("Canal no encontrado");
  if (channel.isDefault) throw new Error("Los canales predeterminados no se pueden editar");
  if (!canAdministerChannel(channel, actorSyncId)) {
    throw new Error("No tienes permisos de administrador para este canal");
  }

  if (updates.name !== undefined) {
    const cleanName = String(updates.name || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
    if (cleanName.length < 2) throw new Error("El nombre debe tener al menos 2 caracteres alfanuméricos");
    if (db.channels.some((item) => item.id !== channel.id && item.name === cleanName)) {
      throw new Error("Ya existe un canal con ese nombre");
    }
    channel.name = cleanName;
  }
  if (updates.description !== undefined) {
    channel.description = String(updates.description || "").trim().slice(0, 120);
  }
  writeDb(db);
  return channel;
}

function addWorkspaceChannelMember(channelId, actorSyncId, targetSyncId) {
  const db = readDb();
  const rawChannelId = String(channelId || "").trim();
  const cleanChannelId = rawChannelId.replace(/^#/, "").toLowerCase();
  const channel = (db.channels || []).find((item) =>
    item.id === rawChannelId ||
    item.id === cleanChannelId ||
    item.id === ("chan-" + cleanChannelId) ||
    String(item.name || "").toLowerCase() === cleanChannelId
  );
  if (!channel) throw new Error("Canal no encontrado");
  if (channel.isDefault) throw new Error("La membresía de canales predeterminados no se puede modificar aquí");
  if (!canAdministerChannel(channel, actorSyncId)) {
    throw new Error("No tienes permisos para administrar participantes");
  }
  const target = String(targetSyncId || "").trim().toUpperCase();
  const user = db.users.find((item) => String(item.syncId || "").trim().toUpperCase() === target);
  if (!user) throw new Error("No existe un usuario con ese ID SYNC");
  if (!Array.isArray(channel.memberSyncIds)) channel.memberSyncIds = [];
  if (!channel.memberSyncIds.some((id) => String(id).trim().toUpperCase() === target)) {
    channel.memberSyncIds.push(target);
    writeDb(db);
  }
  return channel;
}

function removeWorkspaceChannelMember(channelId, actorSyncId, targetSyncId) {
  const db = readDb();
  const rawChannelId = String(channelId || "").trim();
  const cleanChannelId = rawChannelId.replace(/^#/, "").toLowerCase();
  const channel = (db.channels || []).find((item) =>
    item.id === rawChannelId ||
    item.id === cleanChannelId ||
    item.id === ("chan-" + cleanChannelId) ||
    String(item.name || "").toLowerCase() === cleanChannelId
  );
  if (!channel) throw new Error("Canal no encontrado");
  if (channel.isDefault) throw new Error("La membresía de canales predeterminados no se puede modificar aquí");
  if (!canAdministerChannel(channel, actorSyncId)) {
    throw new Error("No tienes permisos para administrar participantes");
  }
  const target = String(targetSyncId || "").trim().toUpperCase();
  if (target === String(channel.creatorSyncId || "").trim().toUpperCase()) {
    throw new Error("El creador no puede retirarse a sí mismo del canal");
  }
  const before = (channel.memberSyncIds || []).length;
  channel.memberSyncIds = (channel.memberSyncIds || []).filter((id) => String(id).trim().toUpperCase() !== target);
  if (channel.memberSyncIds.length !== before) writeDb(db);
  return channel;
}

function deleteWorkspaceChannel(channelId, actorSyncId) {
  const db = readDb();
  const rawChannelId = String(channelId || "").trim();
  const cleanChannelId = rawChannelId.replace(/^#/, "").toLowerCase();
  const channel = (db.channels || []).find((item) =>
    item.id === rawChannelId ||
    item.id === cleanChannelId ||
    item.id === ("chan-" + cleanChannelId) ||
    String(item.name || "").toLowerCase() === cleanChannelId
  );
  if (!channel) throw new Error("Canal no encontrado");
  if (channel.isDefault) throw new Error("Los canales predeterminados no se pueden eliminar");
  if (!canAdministerChannel(channel, actorSyncId)) {
    throw new Error("No tienes permisos para eliminar este canal");
  }
  db.channels = (db.channels || []).filter((item) => item.id !== channel.id);
  db.channelMessages = (db.channelMessages || []).filter((message) => message.channelId !== channel.id);
  writeDb(db);
  return channel;
}

function getChannelMessages(channelId, userSyncId, limit = 100) {
  const channel = findChannel(channelId);
  const resolvedChannelId = channel ? channel.id : channelId;

  if (!isChannelMember(resolvedChannelId, userSyncId)) {
    throw new Error("No tienes permisos para acceder a este canal");
  }
  const db = readDb();
  if (!db.channelMessages) return [];
  return db.channelMessages
    .filter((m) => m.channelId === resolvedChannelId || m.channelId === channelId)
    .slice(-limit);
}

function saveChannelMessage(channelId, senderSyncId, payload) {
  const channel = findChannel(channelId);
  const resolvedChannelId = channel ? channel.id : channelId;

  if (!isChannelMember(resolvedChannelId, senderSyncId)) {
    throw new Error("No tienes permisos para enviar mensajes a este canal");
  }

  const db = readDb();
  if (!db.channelMessages) db.channelMessages = [];

  const sender = db.users.find((u) => u.syncId === senderSyncId);
  if (!sender) throw new Error("Emisor no encontrado");

  const { text, type, fileData, audioData } = payload;
  const message = {
    id: "cmsg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
    channelId: resolvedChannelId,
    senderSyncId: senderSyncId,
    senderName: sender.cleanDisplayName,
    senderFormattedName: sender.formattedName,
    senderAvatar: sender.avatarUrl || null,
    text: text || "",
    type: type || "text",
    fileData: fileData || null,
    audioData: audioData || null,
    createdAt: Date.now()
  };

  db.channelMessages.push(message);
  // Mantener histórico limitado a 1500 mensajes por performance
  if (db.channelMessages.length > 1500) {
    db.channelMessages = db.channelMessages.slice(-1500);
  }
  writeDb(db);
  return message;
}

// ==== Exportación de Conversación / Auditoría ====
function exportConversation(syncId, contactSyncId) {
  const db = readDb();
  const sId = String(syncId).trim().toUpperCase();
  const cId = String(contactSyncId).trim().toUpperCase();

  const user = db.users.find((u) => u.syncId === sId);
  const contact = db.users.find((u) => u.syncId === cId);
  const messages = getMessagesBetween(sId, cId);

  return {
    exportedAt: new Date().toISOString(),
    exportTimestamp: Date.now(),
    securitySeal: "SYNC-E2E-" + crypto.randomBytes(8).toString("hex").toUpperCase(),
    participants: {
      requester: user ? toPublicUser(user) : { syncId: sId },
      contact: contact ? toPublicUser(contact) : { syncId: cId }
    },
    totalMessages: messages.length,
    messages: messages.map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      dateFormatted: new Date(m.timestamp).toLocaleString(),
      fromSyncId: m.fromId,
      toSyncId: m.toId,
      type: m.type,
      text: m.text,
      status: m.status,
      hasFile: Boolean(m.fileData),
      fileName: m.fileData ? m.fileData.name : null,
      hasAudio: Boolean(m.audioData)
    }))
  };
}

module.exports = {
  readDb,
  registerFile,
  getFileById,
  getFileByFilename,
  canReadFile,
  removeEmojis,
  formatFullName,
  registerUser,
  loginUser,
  getUserByToken,
  revokeSession,
  getUserBySyncId,
  updateUserProfile,
  addContact,
  getUserContacts,
  saveMessage,
  getMessageById,
  saveTextMessage,
  updateMessageReaction,
  updateMessageStatus,
  markMessagesAsRead,
  deleteMessageForEveryone,
  getPinnedMessage,
  setPinnedMessage,
  unpinMessage,
  getMessagesBetween,
  clearMessagesBetween,
  writeDb,
  updateMessageLinkPreview,
  savePushSubscription,
  getPushSubscriptions,
  removePushSubscription,
  saveMobilePushToken,
  getMobilePushTokens,
  removeMobilePushToken,
  // Nuevas capacidades de monetización y workspace
  upgradeUserPlan,
  getUserInvoices,
  getVaultItems,
  saveVaultItem,
  deleteVaultItem,
  getWorkspaceChannels,
  findChannel,
  isChannelMember,
  createWorkspaceChannel,
  updateWorkspaceChannel,
  grantWorkspaceChannelAdmin,
  revokeWorkspaceChannelAdmin,
  addWorkspaceChannelMember,
  removeWorkspaceChannelMember,
  deleteWorkspaceChannel,
  getChannelMessages,
  saveChannelMessage,
  exportConversation,
  recordCall,
  resolveCall,
  getWidgetSummary
};
