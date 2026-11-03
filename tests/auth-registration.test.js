const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-engine-auth-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";
process.env.SKIP_EMAIL_MX_CHECK = "true";

const db = require("../db");
const server = require("../server");

test.after(async () => {
  await db.flushWrites();
  server.shutdown();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("expone las rutas OTP que consume la interfaz", () => {
  const paths = server.app.router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  assert.ok(paths.includes("/api/auth/register/request-code"));
  assert.ok(paths.includes("/api/auth/register/verify-code"));
});

test("registra el correo verificado y lo devuelve como dato público", () => {
  db.registerUser("usuario-otp", "password-segura", "Usuario OTP", "usuario@example.com", true);
  const result = db.loginUser("usuario-otp", "password-segura");

  assert.equal(result.user.email, "usuario@example.com");
  assert.equal(result.user.emailVerified, true);
});
