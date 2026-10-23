"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const DB_FILE = path.join(DATA_DIR, "sync_db.json");

let cachedDb = null;
const writeQueue = [];
let isProcessingQueue = false;

function ensureDbFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initialData = { users: {}, subscriptions: {}, channels: {}, messages: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), "utf8");
    cachedDb = initialData;
  }
}

/**
 * Lee la base de datos local JSON.
 * CORRECCIÓN: Se devuelve una copia profunda para evitar mutación descontrolada en memoria
 * antes de que la escritura a disco sea confirmada.
 */
function readDb() {
  ensureDbFile();
  if (cachedDb) {
    return JSON.parse(JSON.stringify(cachedDb));
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    cachedDb = JSON.parse(raw);
    return JSON.parse(JSON.stringify(cachedDb));
  } catch (err) {
    console.error("[DB Error] Error al leer la base de datos:", err);
    return { users: {}, subscriptions: {}, channels: {}, messages: {} };
  }
}

async function processWriteQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (writeQueue.length > 0) {
    const item = writeQueue[0];
    const tmpFile = `${DB_FILE}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await fs.promises.writeFile(tmpFile, item.content, "utf8");
      await fs.promises.rename(tmpFile, DB_FILE);
      // Actualizar caché oficial tras confirmación en disco
      cachedDb = JSON.parse(item.content);
      writeQueue.shift();
      item.resolve(cachedDb);
    } catch (err) {
      console.error("[DB Critical Error] Falló la escritura atómica en sync_db.json:", err.message);
      try {
        if (fs.existsSync(tmpFile)) await fs.promises.unlink(tmpFile);
      } catch (_) {}
      writeQueue.shift();
      item.reject(err);
    }
  }
  isProcessingQueue = false;
}

/**
 * Encola la escritura atómica a disco.
 * CORRECCIÓN: Los errores no se silencian ciegamente y se registran en los logs del servidor.
 */
function writeDb(data) {
  ensureDbFile();
  const content = JSON.stringify(data, null, 2);
  const promise = new Promise((resolve, reject) => {
    writeQueue.push({ content, resolve, reject });
    processWriteQueue();
  });
  // Se añade advertencia explícita en caso de no capturarse externamente
  promise.catch((err) => {
    console.warn("[DB Warning] Error en cola de persistencia:", err.message);
  });
  return promise;
}

module.exports = {
  readDb,
  writeDb,
  DB_FILE,
  DATA_DIR
};
