const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
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
      pinnedMessages: {},
      subscriptions: {}
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), "utf8");
  }
}

let cachedDb = null;
const writeQueue = [];
let isProcessingQueue = false;

function readDb() {
  if (cachedDb) {
    return cachedDb;
  }
  ensureDbFile();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data.users) data.users = [];
    if (!data.sessions) data.sessions = [];
    if (!data.contacts) data.contacts = {};
    if (!data.messages) data.messages = [];
    if (!data.pinnedMessages) data.pinnedMessages = {};
    if (!data.subscriptions) data.subscriptions = {};
    cachedDb = data;
    return cachedDb;
  } catch (err) {
    console.error("[DB] Error al leer base de datos, inicializando respaldo:", err.message);
    cachedDb = { users: [], sessions: [], contacts: {}, messages: [], pinnedMessages: {} };
    return cachedDb;
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
    avatarUrl: user.avatarUrl || null
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
  if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash))) {
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
  if (!token) return null;
  const db = readDb();
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;

  const user = db.users.find((u) => u.syncId === session.syncId);
  return user ? toPublicUser(user) : null;
}

function getUserBySyncId(syncId) {
  if (!syncId) return null;
  const db = readDb();
  const user = db.users.find((u) => u.syncId === syncId.trim().toUpperCase());
  return user ? toPublicUser(user) : null;
}

function updateUserProfile(syncId, rawName, avatarUrl) {
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
  writeDb(db);

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

function saveMessage(msgData) {
  const db = readDb();
  const newMsg = {
    id: msgData.id || ("msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7)),
    fromId: String(msgData.fromId).trim().toUpperCase(),
    toId: String(msgData.toId).trim().toUpperCase(),
    type: msgData.type || "text",
    text: msgData.text || "",
    audioData: msgData.audioData || null,
    fileData: msgData.fileData || null,
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

function updateMessageReaction(messageId, userSyncId, emoji) {
  const db = readDb();
  const msg = db.messages.find((m) => m.id === messageId);
  if (msg) {
    if (!msg.reactions || typeof msg.reactions !== 'object') {
      msg.reactions = {};
    }
    if (msg.reactions[userSyncId] === emoji) {
      delete msg.reactions[userSyncId];
    } else {
      msg.reactions[userSyncId] = emoji;
    }
    writeDb(db);
    return msg.reactions;
  }
  return { [userSyncId]: emoji };
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

function deleteMessageForEveryone(messageId, senderSyncId) {
  const db = readDb();
  const msg = db.messages.find((m) => m.id === messageId);
  if (!msg) return null;
  if (msg.fromId !== senderSyncId) {
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
  return msg || null;
}

function setPinnedMessage(user1Id, user2Id, messageId) {
  const db = readDb();
  const key = getConversationKey(user1Id, user2Id);
  const msg = db.messages.find((m) => m.id === messageId);
  if (!msg) {
    throw new Error("Mensaje no encontrado");
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

module.exports = {
  removeEmojis,
  formatFullName,
  registerUser,
  loginUser,
  getUserByToken,
  getUserBySyncId,
  updateUserProfile,
  addContact,
  getUserContacts,
  saveMessage,
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
  removePushSubscription
};
