import "./env.js";
import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { generateSecret as generarSecretoTOTP, generateURI as generarURITOTP, verifySync as verificarTOTP } from "otplib";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { llamarIA, manejarErrorIA } from "./ia-client.js";

const NODE_ENV = process.env.NODE_ENV || "development";
const JWT_SECRET_DEV_FALLBACK = "xclusivesetup-dev-secret-cambiar-en-produccion";

if (!process.env.JWT_SECRET) {
  if (NODE_ENV === "production") {
    console.error(
      "ERROR FATAL: falta la variable de entorno JWT_SECRET. Es obligatoria en producción (NODE_ENV=production). El servidor no va a arrancar sin ella."
    );
    process.exit(1);
  } else {
    console.warn(
      "AVISO: JWT_SECRET no está definida. Usando un secreto de desarrollo NO seguro (válido solo en local). Defínela en .env antes de desplegar a producción."
    );
  }
}

const JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_DEV_FALLBACK;
const INTENTOS_MAXIMOS = 5;
const BLOQUEO_MINUTOS = 15;
const JWT_EXPIRA_EN = "12h";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsSubdir =
  process.env.UPLOADS_DIR_NAME ||
  (process.env.APP_ENV === "academico"
    ? path.join("uploads", "academico")
    : path.join("uploads", "clientes"));
const UPLOADS_DIR = path.isAbsolute(uploadsSubdir)
  ? uploadsSubdir
  : path.join(__dirname, uploadsSubdir);

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
const PORT = process.env.PORT || 4000;

// Orígenes permitidos por CORS. En producción, SOLO los definidos en
// CORS_ALLOWED_ORIGINS (lista separada por comas) tienen acceso.
// En desarrollo se agregan además los orígenes típicos de Vite en local,
// para no exigir configurar la variable solo para trabajar en el proyecto.
const CORS_ORIGENES_DEV_POR_DEFECTO = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://localhost:5180",
  "http://127.0.0.1:5180",
];

const corsOrigenesPermitidos = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origen) => origen.trim())
  .filter(Boolean);

if (NODE_ENV !== "production") {
  for (const origenDev of CORS_ORIGENES_DEV_POR_DEFECTO) {
    if (!corsOrigenesPermitidos.includes(origenDev)) {
      corsOrigenesPermitidos.push(origenDev);
    }
  }
}

if (NODE_ENV === "production" && corsOrigenesPermitidos.length === 0) {
  console.warn(
    "AVISO: CORS_ALLOWED_ORIGINS no está definida en producción. Ninguna solicitud desde el dominio del frontend será aceptada hasta que la definas."
  );
}

const corsOptions = {
  origin(origin, callback) {
    // Sin header Origin (curl, apps móviles, servidor a servidor): se permite.
    if (!origin) return callback(null, true);

    const origenNormalizado = origin.replace(/\/+$/, "");
    if (corsOrigenesPermitidos.includes(origin) || corsOrigenesPermitidos.includes(origenNormalizado)) {
      return callback(null, true);
    }

    console.warn(
      `[CORS] Origen no permitido: "${origin}". Orígenes permitidos: [${corsOrigenesPermitidos.join(", ")}]`
    );
    return callback(new Error("CORS_ORIGEN_NO_PERMITIDO"));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

app.use((err, req, res, next) => {
  if (err && err.message === "CORS_ORIGEN_NO_PERMITIDO") {
    return res.status(403).json({ error: "Origen no permitido por la política CORS." });
  }
  next(err);
});

app.use(express.json());
// Los archivos de clientes ya NO se sirven públicamente por /uploads.
// Se descargan solo autenticados vía GET /api/clientes/:id/archivos/:archivoId/descargar

const sqlite = sqlite3.verbose();
const DB_NAME =
  process.env.DB_FILE ||
  (process.env.APP_ENV === "academico"
    ? "database.academico.db"
    : "database.db");
const DB_PATH = path.isAbsolute(DB_NAME) ? DB_NAME : path.join(__dirname, DB_NAME);
console.log(`[Base de Datos] Conectando a: ${DB_PATH}`);
const db = new sqlite.Database(DB_PATH);

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function registrarAuditoria({
  usuario,
  accion,
  entidad = null,
  entidadId = null,
  detalle = null,
  exitoso = 1,
  ip = null,
}) {
  db.run(
    `INSERT INTO logs_auditoria (usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle, exitoso, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      usuario?.id || null,
      usuario?.nombre || usuario?.email || null,
      accion,
      entidad,
      entidadId,
      detalle,
      exitoso ? 1 : 0,
      ip,
    ],
    (err) => {
      if (err) {
        console.error("Error al registrar auditoría:", err);
      }
    }
  );
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function minutosDeBloqueoRestantes(usuario) {
  if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
    return Math.ceil((new Date(usuario.bloqueado_hasta) - new Date()) / 60000);
  }
  return null;
}

async function registrarIntentoFallido(usuario, detalleMotivo, ip) {
  const intentos = (usuario.intentos_fallidos || 0) + 1;

  if (intentos >= INTENTOS_MAXIMOS) {
    const bloqueadoHasta = new Date(
      Date.now() + BLOQUEO_MINUTOS * 60000
    ).toISOString();

    await dbRun(
      "UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = ? WHERE id = ?",
      [bloqueadoHasta, usuario.id]
    );

    registrarAuditoria({
      usuario,
      accion: "cuenta_bloqueada",
      detalle: `${INTENTOS_MAXIMOS} intentos fallidos seguidos (${detalleMotivo})`,
      exitoso: 0,
      ip,
    });

    return true;
  }

  await dbRun("UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?", [
    intentos,
    usuario.id,
  ]);

  registrarAuditoria({
    usuario,
    accion: "login_fallido",
    detalle: `${detalleMotivo} (intento ${intentos}/${INTENTOS_MAXIMOS})`,
    exitoso: 0,
    ip,
  });

  return false;
}

const archivoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const clienteDir = path.join(UPLOADS_DIR, String(req.params.id));
    fs.mkdirSync(clienteDir, { recursive: true });
    cb(null, clienteDir);
  },
  filename: (req, file, cb) => {
    const sufijo = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = path.extname(file.originalname);
    cb(null, `${sufijo}${extension}`);
  },
});

// Whitelist de tipos de archivo permitidos para cliente_archivos.
// Se valida extensión + mimetype declarado (fileFilter) y además la
// firma binaria real del archivo ya escrito en disco (ver tieneFirmaValida),
// para no confiar solo en el nombre o en el Content-Type que manda el cliente.
const MIMETYPES_PERMITIDOS_POR_EXTENSION = {
  ".pdf": ["application/pdf"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

const FIRMAS_ARCHIVO = {
  ".pdf": [Buffer.from("25504446", "hex")],
  ".jpg": [Buffer.from("FFD8FF", "hex")],
  ".jpeg": [Buffer.from("FFD8FF", "hex")],
  ".png": [Buffer.from("89504E470D0A1A0A", "hex")],
  ".docx": [Buffer.from("504B0304", "hex")],
  ".xlsx": [Buffer.from("504B0304", "hex")],
};

function filtrarArchivoPermitido(req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();
  const mimetypesPermitidos = MIMETYPES_PERMITIDOS_POR_EXTENSION[extension];

  if (!mimetypesPermitidos || !mimetypesPermitidos.includes(file.mimetype)) {
    cb(
      new Error(
        "Tipo de archivo no permitido. Formatos aceptados: PDF, JPG, PNG, WEBP, DOCX, XLSX."
      )
    );
    return;
  }

  cb(null, true);
}

function tieneFirmaValida(filePath, extension) {
  const buffer = Buffer.alloc(12);
  const fd = fs.openSync(filePath, "r");

  try {
    fs.readSync(fd, buffer, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }

  if (extension === ".webp") {
    return (
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  const firmas = FIRMAS_ARCHIVO[extension];
  if (!firmas) return false;

  return firmas.some((firma) => buffer.subarray(0, firma.length).equals(firma));
}

const uploadArchivo = multer({
  storage: archivoStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: filtrarArchivoPermitido,
});

// ---------- AUTENTICACIÓN ----------

function sanearUsuario(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    totp_habilitado: Boolean(usuario.totp_habilitado),
    debe_cambiar_password: Boolean(usuario.debe_cambiar_password),
  };
}

function emitirToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRA_EN }
  );
}

function emitirRespuestaLogin(usuario) {
  if (usuario.debe_cambiar_password) {
    const preToken = jwt.sign(
      { sub: usuario.id, tipo: "cambio_password_obligatorio" },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    return { requiereCambioPassword: true, preToken };
  }

  return { token: emitirToken(usuario), usuario: sanearUsuario(usuario) };
}

app.post("/api/auth/login", async (req, res) => {
  console.log(`[Auth/Login] Solicitud de login recibida. Origin: "${req.headers.origin || 'sin-origin'}"`);
  const { email, password } = req.body;
  const ip = req.ip;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son obligatorios" });
  }

  const emailNormalizado = String(email).trim().toLowerCase();

  try {
    const usuario = await dbGet("SELECT * FROM usuarios WHERE email = ?", [
      emailNormalizado,
    ]);

    if (!usuario || !usuario.activo) {
      registrarAuditoria({
        usuario: { nombre: emailNormalizado },
        accion: "login_fallido",
        detalle: "Usuario no encontrado o inactivo",
        exitoso: 0,
        ip,
      });
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const minutosRestantesLogin = minutosDeBloqueoRestantes(usuario);
    if (minutosRestantesLogin) {
      registrarAuditoria({
        usuario,
        accion: "login_bloqueado",
        detalle: `Cuenta bloqueada, faltan ${minutosRestantesLogin} min`,
        exitoso: 0,
        ip,
      });
      return res.status(423).json({
        error: `Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intenta de nuevo en ${minutosRestantesLogin} minuto(s).`,
      });
    }

    const coincide = await bcrypt.compare(password, usuario.password_hash);

    if (!coincide) {
      const bloqueada = await registrarIntentoFallido(
        usuario,
        "Contraseña incorrecta",
        ip
      );

      if (bloqueada) {
        return res.status(423).json({
          error: `Cuenta bloqueada por ${BLOQUEO_MINUTOS} minutos por demasiados intentos fallidos.`,
        });
      }

      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Password correcta: resetear contador de intentos fallidos.
    if (usuario.intentos_fallidos > 0 || usuario.bloqueado_hasta) {
      await dbRun(
        "UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?",
        [usuario.id]
      );
    }

    if (usuario.totp_habilitado) {
      const preToken = jwt.sign(
        { sub: usuario.id, tipo: "pre2fa" },
        JWT_SECRET,
        { expiresIn: "5m" }
      );

      return res.json({ requiere2fa: true, preToken });
    }

    registrarAuditoria({ usuario, accion: "login_exitoso", ip });

    res.json(emitirRespuestaLogin(usuario));
  } catch (err) {
    console.error("Error al iniciar sesión:", err);
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
});

app.post("/api/auth/login/verificar-2fa", async (req, res) => {
  const { preToken, codigo } = req.body;
  const ip = req.ip;

  if (!preToken || !codigo) {
    return res
      .status(400)
      .json({ error: "El token temporal y el código son obligatorios" });
  }

  let payload;
  try {
    payload = jwt.verify(preToken, JWT_SECRET);
  } catch (_err) {
    return res.status(401).json({ error: "Sesión de verificación expirada, inicia sesión de nuevo" });
  }

  if (payload.tipo !== "pre2fa") {
    return res.status(401).json({ error: "Token inválido" });
  }

  try {
    const usuario = await dbGet("SELECT * FROM usuarios WHERE id = ?", [
      payload.sub,
    ]);

    if (!usuario || !usuario.activo || !usuario.totp_habilitado) {
      return res.status(401).json({ error: "No se pudo verificar el código" });
    }

    const minutosRestantes2fa = minutosDeBloqueoRestantes(usuario);
    if (minutosRestantes2fa) {
      registrarAuditoria({
        usuario,
        accion: "login_bloqueado",
        detalle: `Cuenta bloqueada, faltan ${minutosRestantes2fa} min`,
        exitoso: 0,
        ip,
      });
      return res.status(423).json({
        error: `Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intenta de nuevo en ${minutosRestantes2fa} minuto(s).`,
      });
    }

    const valido = verificarTOTP({
      secret: usuario.totp_secret,
      token: String(codigo).trim(),
    }).valid;

    if (!valido) {
      const bloqueada = await registrarIntentoFallido(
        usuario,
        "Código 2FA incorrecto",
        ip
      );

      if (bloqueada) {
        return res.status(423).json({
          error: `Cuenta bloqueada por ${BLOQUEO_MINUTOS} minutos por demasiados intentos fallidos.`,
        });
      }

      return res.status(401).json({ error: "Código incorrecto" });
    }

    if (usuario.intentos_fallidos > 0 || usuario.bloqueado_hasta) {
      await dbRun(
        "UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?",
        [usuario.id]
      );
    }

    registrarAuditoria({ usuario, accion: "login_exitoso", detalle: "Con 2FA", ip });

    res.json(emitirRespuestaLogin(usuario));
  } catch (err) {
    console.error("Error al verificar 2FA:", err);
    res.status(500).json({ error: "Error al verificar el código" });
  }
});

app.post("/api/auth/cambiar-password-obligatorio", async (req, res) => {
  const { preToken, password_nuevo } = req.body;
  const ip = req.ip;

  if (!preToken || !password_nuevo) {
    return res
      .status(400)
      .json({ error: "El token temporal y la nueva contraseña son obligatorios" });
  }

  if (String(password_nuevo).length < 6) {
    return res
      .status(400)
      .json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
  }

  let payload;
  try {
    payload = jwt.verify(preToken, JWT_SECRET);
  } catch (_err) {
    return res
      .status(401)
      .json({ error: "Sesión de verificación expirada, inicia sesión de nuevo" });
  }

  if (payload.tipo !== "cambio_password_obligatorio") {
    return res.status(401).json({ error: "Token inválido" });
  }

  try {
    const usuario = await dbGet("SELECT * FROM usuarios WHERE id = ?", [
      payload.sub,
    ]);

    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: "No se pudo actualizar la contraseña" });
    }

    if (!usuario.debe_cambiar_password) {
      return res.json(emitirRespuestaLogin(usuario));
    }

    const hash = await bcrypt.hash(String(password_nuevo), 10);

    await dbRun(
      "UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0 WHERE id = ?",
      [hash, usuario.id]
    );

    registrarAuditoria({
      usuario,
      accion: "password_cambiado_obligatorio",
      ip,
    });

    res.json(
      emitirRespuestaLogin({ ...usuario, debe_cambiar_password: 0 })
    );
  } catch (err) {
    console.error("Error al cambiar la contraseña obligatoria:", err);
    res.status(500).json({ error: "Error al actualizar la contraseña" });
  }
});

function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No autenticado" });
  }

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) {
      return res.status(401).json({ error: "Sesión inválida o expirada" });
    }

    req.usuario = {
      id: payload.sub,
      nombre: payload.nombre,
      email: payload.email,
      rol: payload.rol,
    };

    next();
  });
}

function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "No tienes permisos para esta acción" });
    }
    next();
  };
}

app.use("/api/ia", (req, res, next) => {
  if (process.env.APP_ENV === "academico" || process.env.DESHABILITAR_IA === "true") {
    return res.status(503).json({
      error: "Función de IA deshabilitada en el prototipo académico XclusiveSetup.",
      deshabilitado: true,
    });
  }
  next();
});

app.use(verificarToken);

app.get("/api/auth/me", async (req, res) => {
  try {
    const usuario = await dbGet("SELECT * FROM usuarios WHERE id = ?", [
      req.usuario.id,
    ]);

    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ usuario: sanearUsuario(usuario) });
  } catch (err) {
    console.error("Error al obtener usuario actual:", err);
    res.status(500).json({ error: "Error al obtener usuario actual" });
  }
});

app.post("/api/auth/2fa/generar", async (req, res) => {
  try {
    const usuario = await dbGet("SELECT * FROM usuarios WHERE id = ?", [
      req.usuario.id,
    ]);

    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const secreto = generarSecretoTOTP({ length: 20 });
    await dbRun("UPDATE usuarios SET totp_secret = ? WHERE id = ?", [
      secreto,
      usuario.id,
    ]);

    const otpauthUrl = generarURITOTP({
      issuer: "XclusiveSetup CRM",
      label: usuario.email,
      secret: secreto,
    });
    const qr = await QRCode.toDataURL(otpauthUrl);

    res.json({ secreto, qr });
  } catch (err) {
    console.error("Error al generar 2FA:", err);
    res.status(500).json({ error: "Error al generar la configuración de 2FA" });
  }
});

app.post("/api/auth/2fa/activar", async (req, res) => {
  const { codigo } = req.body;

  if (!codigo) {
    return res.status(400).json({ error: "El código es obligatorio" });
  }

  try {
    const usuario = await dbGet("SELECT * FROM usuarios WHERE id = ?", [
      req.usuario.id,
    ]);

    if (!usuario || !usuario.totp_secret) {
      return res.status(400).json({
        error: "Primero genera un código QR antes de activar la verificación en dos pasos",
      });
    }

    const valido = verificarTOTP({
      secret: usuario.totp_secret,
      token: String(codigo).trim(),
    }).valid;

    if (!valido) {
      return res.status(400).json({ error: "El código no es correcto" });
    }

    await dbRun("UPDATE usuarios SET totp_habilitado = 1 WHERE id = ?", [
      usuario.id,
    ]);

    registrarAuditoria({ usuario: req.usuario, accion: "2fa_activado", ip: req.ip });

    res.json({ mensaje: "Verificación en dos pasos activada correctamente" });
  } catch (err) {
    console.error("Error al activar 2FA:", err);
    res.status(500).json({ error: "Error al activar la verificación en dos pasos" });
  }
});

app.post("/api/auth/2fa/desactivar", async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: "Tu contraseña es obligatoria" });
  }

  try {
    const usuario = await dbGet("SELECT * FROM usuarios WHERE id = ?", [
      req.usuario.id,
    ]);

    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const coincide = await bcrypt.compare(password, usuario.password_hash);

    if (!coincide) {
      return res.status(401).json({ error: "La contraseña no es correcta" });
    }

    await dbRun(
      "UPDATE usuarios SET totp_habilitado = 0, totp_secret = NULL WHERE id = ?",
      [usuario.id]
    );

    registrarAuditoria({ usuario: req.usuario, accion: "2fa_desactivado", ip: req.ip });

    res.json({ mensaje: "Verificación en dos pasos desactivada" });
  } catch (err) {
    console.error("Error al desactivar 2FA:", err);
    res.status(500).json({ error: "Error al desactivar la verificación en dos pasos" });
  }
});

app.put("/api/auth/cambiar-password", (req, res) => {
  const { password_actual, password_nuevo } = req.body;

  if (!password_actual || !password_nuevo) {
    return res
      .status(400)
      .json({ error: "La contraseña actual y la nueva son obligatorias" });
  }

  if (String(password_nuevo).length < 6) {
    return res
      .status(400)
      .json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
  }

  db.get(
    "SELECT * FROM usuarios WHERE id = ?",
    [req.usuario.id],
    (err, usuario) => {
      if (err || !usuario) {
        return res.status(500).json({ error: "Error al cambiar la contraseña" });
      }

      bcrypt.compare(password_actual, usuario.password_hash, (errCmp, coincide) => {
        if (errCmp || !coincide) {
          return res.status(401).json({ error: "La contraseña actual no es correcta" });
        }

        bcrypt.hash(password_nuevo, 10, (errHash, hash) => {
          if (errHash) {
            return res.status(500).json({ error: "Error al cambiar la contraseña" });
          }

          db.run(
            "UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0 WHERE id = ?",
            [hash, req.usuario.id],
            (errUpdate) => {
              if (errUpdate) {
                return res
                  .status(500)
                  .json({ error: "Error al cambiar la contraseña" });
              }

              res.json({ mensaje: "Contraseña actualizada correctamente" });
            }
          );
        });
      });
    }
  );
});

// ---------- USUARIOS (SOLO ADMIN) ----------

app.get("/api/usuarios", requiereRol("admin"), (req, res) => {
  db.all(
    "SELECT id, nombre, email, rol, activo, fecha_creacion FROM usuarios ORDER BY id ASC",
    [],
    (err, rows) => {
      if (err) {
        console.error("Error al obtener usuarios:", err);
        return res.status(500).json({ error: "Error al obtener usuarios" });
      }
      res.json(rows);
    }
  );
});

app.post("/api/usuarios", requiereRol("admin"), (req, res) => {
  const { nombre, email, password, rol } = req.body;
  const rolesValidos = ["admin", "gerente", "empleado"];

  if (!nombre || !email || !password) {
    return res
      .status(400)
      .json({ error: "Nombre, email y contraseña son obligatorios" });
  }

  if (String(password).length < 6) {
    return res
      .status(400)
      .json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }

  const rolFinal = rolesValidos.includes(rol) ? rol : "empleado";

  bcrypt.hash(password, 10, (errHash, hash) => {
    if (errHash) {
      return res.status(500).json({ error: "Error al crear el usuario" });
    }

    const stmt = db.prepare(`
      INSERT INTO usuarios (nombre, email, password_hash, rol, activo, debe_cambiar_password)
      VALUES (?, ?, ?, ?, 1, 1)
    `);

    stmt.run(
      nombre.trim(),
      String(email).trim().toLowerCase(),
      hash,
      rolFinal,
      function (err) {
        if (err) {
          if (String(err.message).includes("UNIQUE")) {
            return res
              .status(400)
              .json({ error: "Ya existe un usuario con ese email" });
          }
          console.error("Error al crear usuario:", err);
          return res.status(500).json({ error: "Error al crear el usuario" });
        }

        registrarAuditoria({
          usuario: req.usuario,
          accion: "usuario_creado",
          entidad: "usuario",
          entidadId: this.lastID,
          detalle: `${nombre.trim()} (${rolFinal})`,
          ip: req.ip,
        });

        res.status(201).json({
          id: this.lastID,
          nombre: nombre.trim(),
          email: String(email).trim().toLowerCase(),
          rol: rolFinal,
          activo: 1,
          debe_cambiar_password: true,
        });
      }
    );

    stmt.finalize();
  });
});

app.put("/api/usuarios/:id", requiereRol("admin"), (req, res) => {
  const { id } = req.params;
  const { nombre, rol, activo, password } = req.body;
  const rolesValidos = ["admin", "gerente", "empleado"];

  if (!nombre) {
    return res.status(400).json({ error: "El nombre es obligatorio" });
  }

  if (rol && !rolesValidos.includes(rol)) {
    return res.status(400).json({ error: "Rol inválido" });
  }

  if (
    Number(id) === Number(req.usuario.id) &&
    (activo === false || activo === 0)
  ) {
    return res
      .status(400)
      .json({ error: "No puedes desactivar tu propia cuenta" });
  }

  function actualizarConHash(hash) {
    const campos = ["nombre = ?", "rol = ?", "activo = ?"];
    const valores = [nombre.trim(), rol || "empleado", activo ? 1 : 0];

    if (hash) {
      campos.push("password_hash = ?", "debe_cambiar_password = 1");
      valores.push(hash);
    }

    valores.push(id);

    const stmt = db.prepare(
      `UPDATE usuarios SET ${campos.join(", ")} WHERE id = ?`
    );

    stmt.run(...valores, function (err) {
      if (err) {
        console.error("Error al actualizar usuario:", err);
        return res.status(500).json({ error: "Error al actualizar usuario" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      registrarAuditoria({
        usuario: req.usuario,
        accion: "usuario_actualizado",
        entidad: "usuario",
        entidadId: Number(id),
        detalle: `${nombre.trim()} — rol: ${rol || "empleado"}, activo: ${activo ? "sí" : "no"}${hash ? ", contraseña restablecida" : ""}`,
        ip: req.ip,
      });

      res.status(200).json({
        id: Number(id),
        nombre: nombre.trim(),
        rol: rol || "empleado",
        activo: activo ? 1 : 0,
        ...(hash ? { debe_cambiar_password: true } : {}),
      });
    });

    stmt.finalize();
  }

  if (password) {
    if (String(password).length < 6) {
      return res
        .status(400)
        .json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }

    bcrypt.hash(password, 10, (errHash, hash) => {
      if (errHash) {
        return res.status(500).json({ error: "Error al actualizar usuario" });
      }
      actualizarConHash(hash);
    });
  } else {
    actualizarConHash(null);
  }
});

app.delete("/api/usuarios/:id", requiereRol("admin"), (req, res) => {
  const { id } = req.params;

  if (Number(id) === Number(req.usuario.id)) {
    return res
      .status(400)
      .json({ error: "No puedes eliminar tu propia cuenta" });
  }

  db.get(
    "SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1",
    [],
    (errCount, row) => {
      if (errCount) {
        return res.status(500).json({ error: "Error al eliminar usuario" });
      }

      db.get("SELECT * FROM usuarios WHERE id = ?", [id], (errGet, usuario) => {
        if (errGet || !usuario) {
          return res.status(404).json({ error: "Usuario no encontrado" });
        }

        if (usuario.rol === "admin" && Number(row?.total || 0) <= 1) {
          return res.status(400).json({
            error: "No puedes eliminar al último administrador activo",
          });
        }

        const stmt = db.prepare("DELETE FROM usuarios WHERE id = ?");
        stmt.run(id, function (err) {
          if (err) {
            console.error("Error al eliminar usuario:", err);
            return res.status(500).json({ error: "Error al eliminar usuario" });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
          }

          registrarAuditoria({
            usuario: req.usuario,
            accion: "usuario_eliminado",
            entidad: "usuario",
            entidadId: Number(id),
            detalle: `${usuario.nombre} (${usuario.email})`,
            ip: req.ip,
          });

          res.status(204).send();
        });

        stmt.finalize();
      });
    }
  );
});

// ---------- LOGS DE AUDITORÍA (SOLO ADMIN) ----------

app.get("/api/logs-auditoria", requiereRol("admin"), async (req, res) => {
  const { usuario_id, accion, desde, hasta, limit } = req.query;

  let sql = "SELECT * FROM logs_auditoria WHERE 1=1";
  const params = [];

  if (usuario_id) {
    sql += " AND usuario_id = ?";
    params.push(usuario_id);
  }

  if (accion) {
    sql += " AND accion = ?";
    params.push(accion);
  }

  if (desde) {
    sql += " AND date(fecha) >= date(?)";
    params.push(desde);
  }

  if (hasta) {
    sql += " AND date(fecha) <= date(?)";
    params.push(hasta);
  }

  sql += " ORDER BY fecha DESC, id DESC LIMIT ?";
  params.push(Math.min(Number(limit) || 200, 500));

  try {
    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Error al obtener logs de auditoría:", err);
    res.status(500).json({ error: "Error al obtener logs de auditoría" });
  }
});

// ---------- TABLAS ----------

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'empleado',
      activo INTEGER NOT NULL DEFAULT 1,
      fecha_creacion TEXT DEFAULT (datetime('now'))
    )
  `);

  const usuarioColumns = [
    ["totp_secret", "TEXT"],
    ["totp_habilitado", "INTEGER NOT NULL DEFAULT 0"],
    ["intentos_fallidos", "INTEGER NOT NULL DEFAULT 0"],
    ["bloqueado_hasta", "TEXT"],
    ["debe_cambiar_password", "INTEGER NOT NULL DEFAULT 0"],
  ];

  usuarioColumns.forEach(([column, type]) => {
    db.run(`ALTER TABLE usuarios ADD COLUMN ${column} ${type}`, (err) => {
      if (err && !String(err.message).includes("duplicate column name")) {
        console.error(`Error agregando columna ${column} a usuarios:`, err);
      }
    });
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS logs_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      usuario_nombre TEXT,
      accion TEXT NOT NULL,
      entidad TEXT,
      entidad_id INTEGER,
      detalle TEXT,
      exitoso INTEGER NOT NULL DEFAULT 1,
      ip TEXT,
      fecha TEXT DEFAULT (datetime('now'))
    )
  `);

  db.get("SELECT COUNT(*) AS total FROM usuarios", [], (err, row) => {
    if (err) {
      console.error("Error al verificar usuarios existentes:", err);
      return;
    }

    if (row && row.total === 0) {
      const esAcademico = process.env.APP_ENV === "academico";
      const emailAdmin = esAcademico
        ? (process.env.DEMO_ADMIN_EMAIL || "demo@example.com")
        : "admin@xclusivesetup.com";
      const passwordConfigurada = esAcademico ? process.env.DEMO_ADMIN_PASSWORD : null;
      const passwordTemporal = passwordConfigurada || crypto.randomBytes(12).toString("base64url");

      bcrypt.hash(passwordTemporal, 10, (errHash, hash) => {
        if (errHash) {
          console.error("Error al generar el usuario admin inicial:", errHash);
          return;
        }

        db.run(
          `INSERT INTO usuarios (nombre, email, password_hash, rol, activo, debe_cambiar_password)
           VALUES (?, ?, ?, 'admin', 1, ?)`,
          [esAcademico ? "Administrador Demo" : "Administrador", emailAdmin, hash, esAcademico ? 0 : 1],
          (errInsert) => {
            if (errInsert) {
              console.error("Error al crear el usuario admin inicial:", errInsert);
              return;
            }

            console.log("========================================================");
            console.log(` Usuario ${esAcademico ? "académico demo" : "administrador inicial"} configurado:`);
            console.log(`   Email:    ${emailAdmin}`);
            if (esAcademico && passwordConfigurada) {
              console.log("   Password: [Configurada desde variable de entorno]");
            } else {
              console.log(`   Password: ${passwordTemporal}`);
              console.log(" Esta contraseña es aleatoria y solo se muestra una vez.");
              console.log(" Cámbialo apenas inicies sesión.");
            }
            console.log("========================================================");
          }
        );
      });
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      empresa TEXT,
      email TEXT NOT NULL,
      telefono TEXT,
      direccion TEXT,
      ciudad TEXT,
      pais TEXT,
      estado_cliente TEXT NOT NULL DEFAULT 'activo',
      fecha_creacion TEXT DEFAULT (date('now')),
      ultimo_contacto TEXT,
      notas TEXT
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS proyectos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      cliente TEXT,
      titulo TEXT NOT NULL,
      responsable TEXT,
      fecha_inicio TEXT,
      fecha_fin TEXT,
      estado TEXT NOT NULL DEFAULT 'planeado',
      notas TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS tareas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proyecto_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      prioridad TEXT NOT NULL DEFAULT 'media',
      responsable TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      fecha_limite TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
    )
  `);

  db.run(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    empresa TEXT,
    telefono TEXT,
    email TEXT,
    fuente TEXT,
    valor_potencial REAL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'nuevo',
    notas TEXT,
    fecha_creacion TEXT DEFAULT (date('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS cliente_etiquetas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    color TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS cliente_notas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    contenido TEXT NOT NULL,
    fecha_creacion TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS cliente_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    fecha TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS cliente_archivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    nombre_original TEXT NOT NULL,
    nombre_archivo TEXT NOT NULL,
    ruta TEXT NOT NULL,
    mime_type TEXT,
    tamano INTEGER,
    fecha_creacion TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  )
`);

// ---------- LEADS ----------

app.get("/api/leads", (req, res) => {
  const { estado } = req.query;

  let sql = "SELECT * FROM leads";
  const params = [];

  if (estado) {
    sql += " WHERE estado = ?";
    params.push(estado);
  }

  sql += " ORDER BY fecha_creacion DESC, id DESC";

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("Error al obtener leads:", err);
      return res.status(500).json({ error: "Error al obtener leads" });
    }
    res.json(rows);
  });
});

app.post("/api/leads", (req, res) => {
  const { nombre, empresa, telefono, email, fuente, valor_potencial, notas } =
    req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre es obligatorio" });
  }

  const stmt = db.prepare(`
    INSERT INTO leads (
      nombre, empresa, telefono, email, fuente, valor_potencial, estado, notas
    ) VALUES (?, ?, ?, ?, ?, ?, 'nuevo', ?)
  `);

  stmt.run(
    nombre.trim(),
    empresa || null,
    telefono || null,
    email || null,
    fuente || null,
    Number(valor_potencial) || 0,
    notas || null,
    function (err) {
      if (err) {
        console.error("Error al crear lead:", err);
        return res.status(500).json({ error: "Error al crear lead" });
      }

      db.get(
        "SELECT * FROM leads WHERE id = ?",
        [this.lastID],
        (errGet, row) => {
          if (errGet || !row) {
            return res.status(201).json({ id: this.lastID });
          }
          res.status(201).json(row);
        }
      );
    }
  );

  stmt.finalize();
});

app.put("/api/leads/:id", requiereRol("admin", "gerente"), (req, res) => {
  const { id } = req.params;
  const { nombre, empresa, telefono, email, fuente, valor_potencial, notas } =
    req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre es obligatorio" });
  }

  const stmt = db.prepare(`
    UPDATE leads
    SET
      nombre = ?,
      empresa = ?,
      telefono = ?,
      email = ?,
      fuente = ?,
      valor_potencial = ?,
      notas = ?
    WHERE id = ?
  `);

  stmt.run(
    nombre.trim(),
    empresa || null,
    telefono || null,
    email || null,
    fuente || null,
    Number(valor_potencial) || 0,
    notas || null,
    id,
    function (err) {
      if (err) {
        console.error("Error al actualizar lead:", err);
        return res.status(500).json({ error: "Error al actualizar lead" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Lead no encontrado" });
      }

      db.get("SELECT * FROM leads WHERE id = ?", [id], (errGet, row) => {
        if (errGet || !row) {
          return res.status(200).json({ id: Number(id) });
        }
        res.status(200).json(row);
      });
    }
  );

  stmt.finalize();
});

app.put("/api/leads/:id/estado", (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const estadosValidos = ["nuevo", "convertido", "descartado", "archivado"];

  if (!estado || !estadosValidos.includes(estado)) {
    return res.status(400).json({ error: "Estado inválido" });
  }

  const stmt = db.prepare("UPDATE leads SET estado = ? WHERE id = ?");

  stmt.run(estado, id, function (err) {
    if (err) {
      console.error("Error al actualizar estado de lead:", err);
      return res
        .status(500)
        .json({ error: "Error al actualizar estado de lead" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Lead no encontrado" });
    }

    res.status(200).json({ id: Number(id), estado });
  });

  stmt.finalize();
});

app.delete("/api/leads/:id", requiereRol("admin", "gerente"), (req, res) => {
  const { id } = req.params;

  const stmt = db.prepare("DELETE FROM leads WHERE id = ?");

  stmt.run(id, function (err) {
    if (err) {
      console.error("Error al eliminar lead:", err);
      return res.status(500).json({ error: "Error al eliminar lead" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Lead no encontrado" });
    }

    res.status(204).send();
  });

  stmt.finalize();
});

app.post("/api/leads/:id/convertir", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM leads WHERE id = ?", [id], (err, lead) => {
    if (err) return res.status(500).json({ error: "Error al buscar lead" });
    if (!lead) return res.status(404).json({ error: "Lead no encontrado" });

    if (lead.estado === "convertido") {
      return res
        .status(400)
        .json({ error: "Este lead ya fue convertido a cliente" });
    }

    const stmt = db.prepare(`
      INSERT INTO clientes (
        nombre, empresa, email, telefono,
        estado_cliente, fecha_creacion, notas
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const hoy = new Date().toISOString().slice(0, 10);

    stmt.run(
      lead.nombre,
      lead.empresa || null,
      lead.email || null,
      lead.telefono || null,
      "activo",
      hoy,
      lead.notas || null,
      function (err2) {
        if (err2) {
          return res.status(500).json({ error: "Error al convertir lead en cliente" });
        }

        const clienteId = this.lastID;

        db.run(
          `INSERT INTO cliente_historial (cliente_id, tipo, titulo, descripcion)
           VALUES (?, ?, ?, ?)`,
          [
            clienteId,
            "lead_convertido",
            "Lead convertido a cliente",
            `Lead convertido desde fuente: ${lead.fuente || "sin fuente"}`
          ]
        );

        db.run("UPDATE leads SET estado = ? WHERE id = ?", ["convertido", id]);

        res.status(201).json({
          cliente_id: clienteId,
          lead_id: Number(id),
          mensaje: "Lead convertido correctamente"
        });
      }
    );

    stmt.finalize();
  });
});

  const clienteColumns = [
    ["empresa", "TEXT"],
    ["direccion", "TEXT"],
    ["ciudad", "TEXT"],
    ["pais", "TEXT"],
    ["estado_cliente", "TEXT NOT NULL DEFAULT 'activo'"],
    ["fecha_creacion", "TEXT"],
    ["ultimo_contacto", "TEXT"],
    ["notas", "TEXT"],
  ];

  clienteColumns.forEach(([column, type]) => {
    db.run(`ALTER TABLE clientes ADD COLUMN ${column} ${type}`, (err) => {
      if (err && !String(err.message).includes("duplicate column name")) {
        console.error(`Error agregando columna ${column} a clientes:`, err);
      }
    });
  });

  db.run(`
  UPDATE clientes
  SET fecha_creacion = date('now')
  WHERE fecha_creacion IS NULL OR fecha_creacion = ''
`);

  if (process.env.APP_ENV === "academico") {
    db.run(
      "ALTER TABLE proyectos ADD COLUMN cotizacion_id INTEGER REFERENCES cotizaciones(id)",
      (err) => {
        if (err && !String(err.message).includes("duplicate column name")) {
          console.error("Error agregando columna cotizacion_id a proyectos:", err);
        }
      }
    );
    db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_proyectos_cotizacion_id ON proyectos(cotizacion_id) WHERE cotizacion_id IS NOT NULL"
    );
    db.run(
      "ALTER TABLE tareas ADD COLUMN fecha_inicio TEXT",
      (err) => {
        if (err && !String(err.message).includes("duplicate column name")) {
          console.error("Error agregando columna fecha_inicio a tareas:", err);
        }
      }
    );
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS pipeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      empresa TEXT,
      telefono TEXT,
      email TEXT,
      fuente TEXT,
      valor_estimado REAL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'nuevo',
      fecha_creacion TEXT DEFAULT (date('now')),
      fecha_actualizacion TEXT DEFAULT (datetime('now')),
      notas TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS oportunidades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      cliente_id INTEGER,
      servicio TEXT,
      monto REAL,
      etapa TEXT NOT NULL,
      ultimo_movimiento TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  const oportunidadColumns = [["responsable", "TEXT"]];

  oportunidadColumns.forEach(([column, type]) => {
    db.run(`ALTER TABLE oportunidades ADD COLUMN ${column} ${type}`, (err) => {
      if (err && !String(err.message).includes("duplicate column name")) {
        console.error(`Error agregando columna ${column} a oportunidades:`, err);
      }
    });
  });

  // ---------- PROYECTOS ----------

app.get("/api/proyectos", (req, res) => {
  db.all(
    `SELECT p.*, c.titulo AS cotizacion_titulo
     FROM proyectos p
     LEFT JOIN cotizaciones c ON p.cotizacion_id = c.id
     ORDER BY p.fecha_creacion DESC, p.id DESC`,
    [],
    (err, rows) => {
      if (err) {
        db.all("SELECT * FROM proyectos ORDER BY fecha_creacion DESC, id DESC", [], (err2, rows2) => {
          if (err2) {
            console.error("Error al obtener proyectos:", err2);
            return res.status(500).json({ error: "Error al obtener proyectos" });
          }
          return res.json(rows2);
        });
        return;
      }
      res.json(rows);
    }
  );
});

// ---------- TAREAS ----------

app.get("/api/tareas", (req, res) => {
  const { proyecto_id } = req.query;

  let sql = "SELECT * FROM tareas";
  const params = [];

  if (proyecto_id) {
    sql += " WHERE proyecto_id = ?";
    params.push(proyecto_id);
  }

  sql += " ORDER BY fecha_creacion DESC, id DESC";

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("Error al obtener tareas:", err);
      return res.status(500).json({ error: "Error al obtener tareas" });
    }
    res.json(rows);
  });
});

app.post("/api/tareas", (req, res) => {
  const {
    proyecto_id,
    titulo,
    descripcion,
    prioridad,
    responsable,
    estado,
    fecha_inicio,
    fecha_limite,
  } = req.body;

  if (!proyecto_id || !titulo) {
    return res
      .status(400)
      .json({ error: "Proyecto y título son obligatorios" });
  }

  if (fecha_inicio && fecha_limite && fecha_limite < fecha_inicio) {
    return res.status(400).json({
      error: "La fecha límite no puede ser anterior a la fecha de inicio",
    });
  }

  const stmt = db.prepare(`
    INSERT INTO tareas (
      proyecto_id,
      titulo,
      descripcion,
      prioridad,
      responsable,
      estado,
      fecha_inicio,
      fecha_limite
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    proyecto_id,
    titulo,
    descripcion || null,
    prioridad || "media",
    responsable || null,
    estado || "pendiente",
    fecha_inicio || null,
    fecha_limite || null,
    function (err) {
      if (err) {
        console.error("Error al crear tarea:", err);
        return res.status(500).json({ error: "Error al crear tarea" });
      }

      const tareaId = this.lastID;

      if (fecha_limite) {
        db.run(
          `INSERT INTO calendario_eventos (
            tipo, titulo, fecha, descripcion, referencia_id, modulo
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            "tarea",
            `Tarea: ${titulo}`,
            fecha_limite,
            descripcion || "Fecha límite de tarea.",
            tareaId,
            "tarea",
          ],
          (errCal) => {
            if (errCal) {
              console.error(
                "Error al crear evento de calendario para tarea:",
                errCal
              );
            }
          }
        );
      }

      res.status(201).json({
        id: tareaId,
        proyecto_id: Number(proyecto_id),
        titulo,
        descripcion,
        prioridad: prioridad || "media",
        responsable,
        estado: estado || "pendiente",
        fecha_inicio: fecha_inicio || null,
        fecha_limite,
      });
    }
  );

  stmt.finalize();
});

app.put("/api/tareas/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;
  const {
    proyecto_id,
    titulo,
    descripcion,
    prioridad,
    responsable,
    estado,
    fecha_inicio,
    fecha_limite,
  } = req.body;

  if (!proyecto_id || !titulo) {
    return res
      .status(400)
      .json({ error: "Proyecto y título son obligatorios" });
  }

  if (fecha_inicio && fecha_limite && fecha_limite < fecha_inicio) {
    return res.status(400).json({
      error: "La fecha límite no puede ser anterior a la fecha de inicio",
    });
  }

  const stmt = db.prepare(`
    UPDATE tareas
    SET
      proyecto_id = ?,
      titulo = ?,
      descripcion = ?,
      prioridad = ?,
      responsable = ?,
      estado = ?,
      fecha_inicio = ?,
      fecha_limite = ?
    WHERE id = ?
  `);

  stmt.run(
    proyecto_id,
    titulo,
    descripcion || null,
    prioridad || "media",
    responsable || null,
    estado || "pendiente",
    fecha_inicio || null,
    fecha_limite || null,
    id,
    function (err) {
      if (err) {
        console.error("Error al actualizar tarea:", err);
        return res.status(500).json({ error: "Error al actualizar tarea" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Tarea no encontrada" });
      }

      const tareaId = Number(id);

      db.run(
        "DELETE FROM calendario_eventos WHERE tipo = ? AND modulo = ? AND referencia_id = ?",
        ["tarea", "tarea", tareaId],
        (errDel) => {
          if (errDel) {
            console.error(
              "Error al eliminar evento antiguo de tarea:",
              errDel
            );
          }

          if (fecha_limite) {
            db.run(
              `INSERT INTO calendario_eventos (
                tipo, titulo, fecha, descripcion, referencia_id, modulo
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                "tarea",
                `Tarea: ${titulo}`,
                fecha_limite,
                descripcion || "Fecha límite de tarea.",
                tareaId,
                "tarea",
              ],
              (errCal) => {
                if (errCal) {
                  console.error(
                    "Error al recrear evento de calendario para tarea:",
                    errCal
                  );
                }
              }
            );
          }
        }
      );

      res.status(200).json({
        id: tareaId,
        proyecto_id: Number(proyecto_id),
        titulo,
        descripcion,
        prioridad: prioridad || "media",
        responsable,
        estado: estado || "pendiente",
        fecha_inicio: fecha_inicio || null,
        fecha_limite,
      });
    }
  );

  stmt.finalize();
});

app.put("/api/tareas/:id/estado", (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!estado) {
    return res.status(400).json({ error: "El estado es obligatorio" });
  }

  const stmt = db.prepare("UPDATE tareas SET estado = ? WHERE id = ?");

  stmt.run(estado, id, function (err) {
    if (err) {
      console.error("Error al actualizar estado de tarea:", err);
      return res
        .status(500)
        .json({ error: "Error al actualizar estado de tarea" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    res.status(200).json({
      id: Number(id),
      estado,
    });
  });

  stmt.finalize();
});

app.delete("/api/tareas/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;

  db.run(
    "DELETE FROM calendario_eventos WHERE tipo = ? AND modulo = ? AND referencia_id = ?",
    ["tarea", "tarea", id],
    (errCal) => {
      if (errCal) {
        console.error(
          "Error al eliminar evento de calendario de la tarea:",
          errCal
        );
      }

      const stmt = db.prepare("DELETE FROM tareas WHERE id = ?");
      stmt.run(id, function (err) {
        if (err) {
          console.error("Error al eliminar tarea:", err);
          return res.status(500).json({ error: "Error al eliminar tarea" });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: "Tarea no encontrada" });
        }

        res.status(204).send();
      });

      stmt.finalize();
    }
  );
});

app.post("/api/proyectos", (req, res) => {
  const {
    cliente_id,
    cliente,
    titulo,
    responsable,
    fecha_inicio,
    fecha_fin,
    estado,
    notas,
    cotizacion_id,
  } = req.body;

  if (!titulo) {
    return res
      .status(400)
      .json({ error: "El título del proyecto es obligatorio" });
  }

  const stmt = db.prepare(`
    INSERT INTO proyectos (
      cliente_id,
      cliente,
      titulo,
      responsable,
      fecha_inicio,
      fecha_fin,
      estado,
      notas,
      cotizacion_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    cliente_id || null,
    cliente || null,
    titulo,
    responsable || null,
    fecha_inicio || null,
    fecha_fin || null,
    estado || "planeado",
    notas || null,
    cotizacion_id || null,
    function (err) {
      if (err) {
        console.error("Error al crear proyecto:", err);
        return res
          .status(500)
          .json({ error: "Error al crear proyecto" });
      }

      const proyectoId = this.lastID;

      if (fecha_fin) {
        db.run(
          `INSERT INTO calendario_eventos (
            tipo, titulo, fecha, descripcion, referencia_id, modulo
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            "proyecto",
            `Entrega de proyecto: ${titulo}`,
            fecha_fin,
            notas || "Fecha de entrega del proyecto.",
            proyectoId,
            "proyecto",
          ],
          (errCal) => {
            if (errCal) {
              console.error(
                "Error al crear evento de calendario para proyecto:",
                errCal
              );
            }
          }
        );
      }

      res.status(201).json({
        id: proyectoId,
        cliente_id,
        cliente,
        titulo,
        responsable,
        fecha_inicio,
        fecha_fin,
        estado: estado || "planeado",
        notas,
        cotizacion_id: cotizacion_id || null,
      });
    }
  );

  stmt.finalize();
});

app.put("/api/proyectos/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;
  const {
    cliente_id,
    cliente,
    titulo,
    responsable,
    fecha_inicio,
    fecha_fin,
    estado,
    notas,
  } = req.body;

  if (!titulo) {
    return res
      .status(400)
      .json({ error: "El título del proyecto es obligatorio" });
  }

  const stmt = db.prepare(`
    UPDATE proyectos
    SET
      cliente_id = ?,
      cliente = ?,
      titulo = ?,
      responsable = ?,
      fecha_inicio = ?,
      fecha_fin = ?,
      estado = ?,
      notas = ?
    WHERE id = ?
  `);

  stmt.run(
    cliente_id || null,
    cliente || null,
    titulo,
    responsable || null,
    fecha_inicio || null,
    fecha_fin || null,
    estado || "planeado",
    notas || null,
    id,
    function (err) {
      if (err) {
        console.error("Error al actualizar proyecto:", err);
        return res
          .status(500)
          .json({ error: "Error al actualizar proyecto" });
      }

      if (this.changes === 0) {
        return res
          .status(404)
          .json({ error: "Proyecto no encontrado" });
      }

      const proyectoId = Number(id);

      db.run(
        "DELETE FROM calendario_eventos WHERE tipo = ? AND modulo = ? AND referencia_id = ?",
        ["proyecto", "proyecto", proyectoId],
        (errDel) => {
          if (errDel) {
            console.error(
              "Error al eliminar evento antiguo de proyecto:",
              errDel
            );
          }

          if (fecha_fin) {
            db.run(
              `INSERT INTO calendario_eventos (
                tipo, titulo, fecha, descripcion, referencia_id, modulo
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                "proyecto",
                `Entrega de proyecto: ${titulo}`,
                fecha_fin,
                notas || "Fecha de entrega del proyecto.",
                proyectoId,
                "proyecto",
              ],
              (errCal) => {
                if (errCal) {
                  console.error(
                    "Error al recrear evento de calendario para proyecto:",
                    errCal
                  );
                }
              }
            );
          }
        }
      );

      res.status(200).json({
        id: proyectoId,
        cliente_id,
        cliente,
        titulo,
        responsable,
        fecha_inicio,
        fecha_fin,
        estado: estado || "planeado",
        notas,
      });
    }
  );

  stmt.finalize();
});

app.delete("/api/proyectos/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;

  db.serialize(() => {
    db.all(
      "SELECT id FROM tareas WHERE proyecto_id = ?",
      [id],
      (errTareas, tareas) => {
        if (errTareas) {
          console.error(
            "Error al buscar tareas del proyecto a eliminar:",
            errTareas
          );
        }

        const tareaIds = (tareas || []).map((t) => t.id);

        tareaIds.forEach((tareaId) => {
          db.run(
            "DELETE FROM calendario_eventos WHERE tipo = ? AND modulo = ? AND referencia_id = ?",
            ["tarea", "tarea", tareaId],
            (errCalTarea) => {
              if (errCalTarea) {
                console.error(
                  "Error al eliminar evento de calendario de tarea del proyecto:",
                  errCalTarea
                );
              }
            }
          );
        });

        db.run("DELETE FROM tareas WHERE proyecto_id = ?", [id], (errDelTareas) => {
          if (errDelTareas) {
            console.error(
              "Error al eliminar tareas del proyecto:",
              errDelTareas
            );
          }
        });

        db.run(
          "DELETE FROM calendario_eventos WHERE tipo = ? AND modulo = ? AND referencia_id = ?",
          ["proyecto", "proyecto", id],
          (errCalProyecto) => {
            if (errCalProyecto) {
              console.error(
                "Error al eliminar evento de calendario del proyecto:",
                errCalProyecto
              );
            }
          }
        );

        const stmt = db.prepare("DELETE FROM proyectos WHERE id = ?");
        stmt.run(id, function (err) {
          if (err) {
            console.error("Error al eliminar proyecto:", err);
            return res
              .status(500)
              .json({ error: "Error al eliminar proyecto" });
          }

          if (this.changes === 0) {
            return res
              .status(404)
              .json({ error: "Proyecto no encontrado" });
          }

          res.status(204).send();
        });

        stmt.finalize();
      }
    );
  });
});

  db.run(`
    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      categoria TEXT,
      precio REAL NOT NULL,
      descripcion TEXT,
      estado_servicio TEXT NOT NULL DEFAULT 'activo',
      tiempo_estimado TEXT,
      nota TEXT
    )
  `);

  const ventaColumns = [
    ["descripcion", "TEXT"],
    ["estado_servicio", "TEXT NOT NULL DEFAULT 'activo'"],
    ["tiempo_estimado", "TEXT"],
  ];

  ventaColumns.forEach(([column, type]) => {
    db.run(`ALTER TABLE ventas ADD COLUMN ${column} ${type}`, (err) => {
      if (err && !String(err.message).includes("duplicate column name")) {
        console.error(`Error agregando columna ${column} a ventas:`, err);
      }
    });
  });

   db.run(`
    CREATE TABLE IF NOT EXISTS seguimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      cliente TEXT,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      prioridad TEXT NOT NULL DEFAULT 'media',
      estado TEXT NOT NULL DEFAULT 'pendiente',
      fecha_limite TEXT,
      recordatorio TEXT,
      notas TEXT,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  const seguimientoColumns = [
    ["cliente_id", "INTEGER"],
    ["prioridad", "TEXT NOT NULL DEFAULT 'media'"],
    ["fecha_limite", "TEXT"],
    ["recordatorio", "TEXT"],
    ["notas", "TEXT"],
  ];

  seguimientoColumns.forEach(([column, type]) => {
    db.run(`ALTER TABLE seguimientos ADD COLUMN ${column} ${type}`, (err) => {
      if (err && !String(err.message).includes("duplicate column name")) {
        console.error(`Error agregando columna ${column} a seguimientos:`, err);
      }
    });
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS finanzas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      concepto TEXT NOT NULL,
      monto REAL NOT NULL,
      fecha TEXT,
      nota TEXT
    )
  `);

  const finanzaColumns = [
    ["cliente_id", "INTEGER"],
    ["cliente", "TEXT"],
    ["categoria", "TEXT"],
    ["metodo_pago", "TEXT"],
    ["proveedor", "TEXT"],
  ];

  finanzaColumns.forEach(([column, type]) => {
    db.run(`ALTER TABLE finanzas ADD COLUMN ${column} ${type}`, (err) => {
      if (err && !String(err.message).includes("duplicate column name")) {
        console.error(`Error agregando columna ${column} a finanzas:`, err);
      }
    });
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS cotizaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      oportunidad_id INTEGER,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      subtotal REAL NOT NULL,
      impuestos REAL NOT NULL,
      total REAL NOT NULL,
      estado TEXT NOT NULL,
      fecha TEXT,
      vigencia TEXT,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (oportunidad_id) REFERENCES oportunidades(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS facturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      cotizacion_id INTEGER,
      numero TEXT,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      subtotal REAL NOT NULL,
      impuestos REAL NOT NULL,
      total REAL NOT NULL,
      estado TEXT NOT NULL,
      fecha TEXT,
      vencimiento TEXT,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id)
    )
  `);

  db.run(`
    UPDATE facturas
    SET numero = 'FAC-' || printf('%05d', id)
    WHERE numero IS NULL OR numero = ''
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id INTEGER NOT NULL,
      fecha TEXT,
      monto REAL NOT NULL,
      metodo TEXT,
      referencia TEXT,
      nota TEXT,
      FOREIGN KEY (factura_id) REFERENCES facturas(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS calendario_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      fecha TEXT NOT NULL,
      descripcion TEXT,
      referencia_id INTEGER,
      modulo TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notificaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      mensaje TEXT,
      modulo TEXT,
      referencia_id INTEGER,
      leida INTEGER NOT NULL DEFAULT 0,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      UNIQUE(tipo, modulo, referencia_id)
    )
  `);
});

// ---------- CALENDARIO: PRÓXIMOS ----------

app.get("/api/calendario/proximos", (req, res) => {
  const dias = parseInt(req.query.dias || "7", 10);

  const sql = `
    SELECT *
    FROM calendario_eventos
    WHERE date(fecha) >= date('now')
      AND date(fecha) <= date('now', '+' || ? || ' days')
    ORDER BY fecha ASC, id ASC
  `;

  db.all(sql, [dias], (err, rows) => {
    if (err) {
      console.error("Error al obtener próximos eventos:", err);
      return res
        .status(500)
        .json({ error: "Error al obtener próximos eventos de calendario" });
    }
    res.json(rows);
  });
});

// ---------- CLIENTES ----------

app.get("/api/clientes", (req, res) => {
  const { q, estado } = req.query;

  let sql = `
    SELECT
      id,
      nombre,
      empresa,
      email,
      telefono,
      direccion,
      ciudad,
      pais,
      estado_cliente AS estadocliente,
      fecha_creacion AS fechacreacion,
      ultimo_contacto AS ultimocontacto,
      notas
    FROM clientes
    WHERE 1=1
  `;
  const params = [];

  if (q) {
    sql += `
      AND (
        LOWER(nombre) LIKE ?
        OR LOWER(COALESCE(empresa, '')) LIKE ?
        OR LOWER(COALESCE(email, '')) LIKE ?
        OR LOWER(COALESCE(ciudad, '')) LIKE ?
        OR LOWER(COALESCE(pais, '')) LIKE ?
      )
    `;
    const qLike = `%${String(q).toLowerCase()}%`;
    params.push(qLike, qLike, qLike, qLike, qLike);
  }

  if (estado) {
    sql += " AND estado_cliente = ?";
    params.push(estado);
  }

  sql += " ORDER BY id DESC";

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("Error al obtener clientes:", err);
      return res.status(500).json({ error: "Error al obtener clientes" });
    }
    res.json(rows);
  });
});

app.post("/api/clientes", (req, res) => {
  const {
    nombre,
    empresa,
    email,
    telefono,
    direccion,
    ciudad,
    pais,
    estadocliente,
    fechacreacion,
    ultimocontacto,
    notas,
  } = req.body;

  if (!nombre || !email) {
    return res
      .status(400)
      .json({ error: "Nombre y email son obligatorios" });
  }

  const stmt = db.prepare(`
    INSERT INTO clientes (
      nombre,
      empresa,
      email,
      telefono,
      direccion,
      ciudad,
      pais,
      estado_cliente,
      fecha_creacion,
      ultimo_contacto,
      notas
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    nombre,
    empresa || null,
    email,
    telefono || null,
    direccion || null,
    ciudad || null,
    pais || null,
    estadocliente || "activo",
    fechacreacion || new Date().toISOString().slice(0, 10),
    ultimocontacto || null,
    notas || null,
    function (err) {
      if (err) {
        console.error("Error al crear cliente:", err);
        return res.status(500).json({ error: "Error al crear cliente" });
      }

      const clienteId = this.lastID;

      db.run(
        `INSERT INTO cliente_historial (cliente_id, tipo, titulo, descripcion)
         VALUES (?, ?, ?, ?)`,
        [
          clienteId,
          "cliente_creado",
          "Cliente creado",
          empresa ? `Alta de cliente (${empresa})` : "Alta de cliente",
        ],
        (errHist) => {
          if (errHist) {
            console.error(
              "Error al registrar historial de creación de cliente:",
              errHist
            );
          }
        }
      );

      res.status(201).json({
        id: clienteId,
        nombre,
        empresa,
        email,
        telefono,
        direccion,
        ciudad,
        pais,
        estadocliente: estadocliente || "activo",
        fechacreacion:
          fechacreacion || new Date().toISOString().slice(0, 10),
        ultimocontacto: ultimocontacto || null,
        notas,
      });
    }
  );

  stmt.finalize();
});

app.put("/api/clientes/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;
  const {
    nombre,
    empresa,
    email,
    telefono,
    direccion,
    ciudad,
    pais,
    estadocliente,
    fechacreacion,
    ultimocontacto,
    notas,
  } = req.body;

  if (!nombre || !email) {
    return res
      .status(400)
      .json({ error: "Nombre y email son obligatorios" });
  }

  const stmt = db.prepare(`
    UPDATE clientes
    SET
      nombre = ?,
      empresa = ?,
      email = ?,
      telefono = ?,
      direccion = ?,
      ciudad = ?,
      pais = ?,
      estado_cliente = ?,
      fecha_creacion = ?,
      ultimo_contacto = ?,
      notas = ?
    WHERE id = ?
  `);

  stmt.run(
    nombre,
    empresa || null,
    email,
    telefono || null,
    direccion || null,
    ciudad || null,
    pais || null,
    estadocliente || "activo",
    fechacreacion || new Date().toISOString().slice(0, 10),
    ultimocontacto || null,
    notas || null,
    id,
    function (err) {
      if (err) {
        console.error("Error al actualizar cliente:", err);
        return res.status(500).json({ error: "Error al actualizar cliente" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }

      res.status(200).json({
        id: Number(id),
        nombre,
        empresa,
        email,
        telefono,
        direccion,
        ciudad,
        pais,
        estadocliente: estadocliente || "activo",
        fechacreacion:
          fechacreacion || new Date().toISOString().slice(0, 10),
        ultimocontacto: ultimocontacto || null,
        notas,
      });
    }
  );

  stmt.finalize();
});
app.delete("/api/clientes/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;

  db.get("SELECT id, nombre FROM clientes WHERE id = ?", [id], (err, cliente) => {
    if (err) {
      console.error("Error al buscar cliente para eliminar:", err);
      return res.status(500).json({ error: "Error al eliminar cliente" });
    }

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    db.serialize(() => {
      db.run("DELETE FROM cliente_etiquetas WHERE cliente_id = ?", [id], (errEtiquetas) => {
        if (errEtiquetas) {
          console.error("Error al eliminar etiquetas del cliente:", errEtiquetas);
        }
      });

      db.run("DELETE FROM cliente_notas WHERE cliente_id = ?", [id], (errNotas) => {
        if (errNotas) {
          console.error("Error al eliminar notas del cliente:", errNotas);
        }
      });

      db.run("DELETE FROM cliente_historial WHERE cliente_id = ?", [id], (errHistorial) => {
        if (errHistorial) {
          console.error("Error al eliminar historial del cliente:", errHistorial);
        }
      });

      db.run("DELETE FROM cliente_archivos WHERE cliente_id = ?", [id], (errArchivos) => {
        if (errArchivos) {
          console.error("Error al eliminar archivos del cliente:", errArchivos);
        }
      });

      const clienteDir = path.join(UPLOADS_DIR, String(id));
      fs.rm(clienteDir, { recursive: true, force: true }, (errRm) => {
        if (errRm) {
          console.error("Error al eliminar carpeta de archivos del cliente:", errRm);
        }
      });

      db.run("DELETE FROM clientes WHERE id = ?", [id], function (errDelete) {
        if (errDelete) {
          console.error("Error al eliminar cliente:", errDelete);
          return res.status(500).json({ error: "Error al eliminar cliente" });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: "Cliente no encontrado" });
        }

        registrarAuditoria({
          usuario: req.usuario,
          accion: "cliente_eliminado",
          entidad: "cliente",
          entidadId: Number(id),
          detalle: cliente.nombre,
          ip: req.ip,
        });

        res.status(204).send();
      });
    });
  });
});

// ---------- ETIQUETAS DE CLIENTE ----------

app.get("/api/clientes/:id/etiquetas", (req, res) => {
  const { id } = req.params;

  db.all(
    "SELECT * FROM cliente_etiquetas WHERE cliente_id = ? ORDER BY id ASC",
    [id],
    (err, rows) => {
      if (err) {
        console.error("Error al obtener etiquetas del cliente:", err);
        return res
          .status(500)
          .json({ error: "Error al obtener etiquetas del cliente" });
      }
      res.json(rows);
    }
  );
});

app.post("/api/clientes/:id/etiquetas", (req, res) => {
  const { id } = req.params;
  const { nombre, color } = req.body;

  if (!nombre || !nombre.trim()) {
    return res
      .status(400)
      .json({ error: "El nombre de la etiqueta es obligatorio" });
  }

  db.get("SELECT id FROM clientes WHERE id = ?", [id], (errCliente, cliente) => {
    if (errCliente) {
      console.error("Error al buscar cliente para etiqueta:", errCliente);
      return res.status(500).json({ error: "Error al buscar cliente" });
    }

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const stmt = db.prepare(
      "INSERT INTO cliente_etiquetas (cliente_id, nombre, color) VALUES (?, ?, ?)"
    );

    stmt.run(id, nombre.trim(), color || "slate", function (err) {
      if (err) {
        console.error("Error al crear etiqueta:", err);
        return res.status(500).json({ error: "Error al crear etiqueta" });
      }

      res.status(201).json({
        id: this.lastID,
        cliente_id: Number(id),
        nombre: nombre.trim(),
        color: color || "slate",
      });
    });

    stmt.finalize();
  });
});

app.delete("/api/clientes/:id/etiquetas/:etiquetaId", requiereRol("admin", "gerente"), (req, res) => {
  const { id, etiquetaId } = req.params;

  const stmt = db.prepare(
    "DELETE FROM cliente_etiquetas WHERE id = ? AND cliente_id = ?"
  );

  stmt.run(etiquetaId, id, function (err) {
    if (err) {
      console.error("Error al eliminar etiqueta:", err);
      return res.status(500).json({ error: "Error al eliminar etiqueta" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Etiqueta no encontrada" });
    }

    res.status(204).send();
  });

  stmt.finalize();
});

// ---------- HISTORIAL DE CLIENTE ----------

app.get("/api/clientes/:id/historial", (req, res) => {
  const { id } = req.params;

  db.all(
    "SELECT * FROM cliente_historial WHERE cliente_id = ? ORDER BY fecha DESC, id DESC",
    [id],
    (err, rows) => {
      if (err) {
        console.error("Error al obtener historial del cliente:", err);
        return res
          .status(500)
          .json({ error: "Error al obtener historial del cliente" });
      }
      res.json(rows);
    }
  );
});

app.post("/api/clientes/:id/historial", (req, res) => {
  const { id } = req.params;
  const { tipo, titulo, descripcion } = req.body;

  if (!titulo || !titulo.trim()) {
    return res.status(400).json({ error: "El título es obligatorio" });
  }

  db.get("SELECT id FROM clientes WHERE id = ?", [id], (errCliente, cliente) => {
    if (errCliente) {
      console.error("Error al buscar cliente para historial:", errCliente);
      return res.status(500).json({ error: "Error al buscar cliente" });
    }

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const stmt = db.prepare(`
      INSERT INTO cliente_historial (cliente_id, tipo, titulo, descripcion)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      id,
      tipo || "nota",
      titulo.trim(),
      descripcion || null,
      function (err) {
        if (err) {
          console.error("Error al crear entrada de historial:", err);
          return res
            .status(500)
            .json({ error: "Error al crear entrada de historial" });
        }

        db.get(
          "SELECT * FROM cliente_historial WHERE id = ?",
          [this.lastID],
          (errGet, row) => {
            if (errGet || !row) {
              return res.status(201).json({ id: this.lastID });
            }
            res.status(201).json(row);
          }
        );
      }
    );

    stmt.finalize();
  });
});

// ---------- NOTAS DE CLIENTE ----------

app.get("/api/clientes/:id/notas", (req, res) => {
  const { id } = req.params;

  db.all(
    "SELECT * FROM cliente_notas WHERE cliente_id = ? ORDER BY fecha_creacion DESC, id DESC",
    [id],
    (err, rows) => {
      if (err) {
        console.error("Error al obtener notas del cliente:", err);
        return res
          .status(500)
          .json({ error: "Error al obtener notas del cliente" });
      }
      res.json(rows);
    }
  );
});

app.post("/api/clientes/:id/notas", (req, res) => {
  const { id } = req.params;
  const { contenido } = req.body;

  if (!contenido || !contenido.trim()) {
    return res.status(400).json({ error: "El contenido es obligatorio" });
  }

  db.get("SELECT id FROM clientes WHERE id = ?", [id], (errCliente, cliente) => {
    if (errCliente) {
      console.error("Error al buscar cliente para nota:", errCliente);
      return res.status(500).json({ error: "Error al buscar cliente" });
    }

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const stmt = db.prepare(
      "INSERT INTO cliente_notas (cliente_id, contenido) VALUES (?, ?)"
    );

    stmt.run(id, contenido.trim(), function (err) {
      if (err) {
        console.error("Error al crear nota:", err);
        return res.status(500).json({ error: "Error al crear nota" });
      }

      db.get(
        "SELECT * FROM cliente_notas WHERE id = ?",
        [this.lastID],
        (errGet, row) => {
          if (errGet || !row) {
            return res.status(201).json({ id: this.lastID });
          }
          res.status(201).json(row);
        }
      );
    });

    stmt.finalize();
  });
});

app.delete("/api/clientes/:id/notas/:notaId", requiereRol("admin", "gerente"), (req, res) => {
  const { id, notaId } = req.params;

  const stmt = db.prepare(
    "DELETE FROM cliente_notas WHERE id = ? AND cliente_id = ?"
  );

  stmt.run(notaId, id, function (err) {
    if (err) {
      console.error("Error al eliminar nota:", err);
      return res.status(500).json({ error: "Error al eliminar nota" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Nota no encontrada" });
    }

    res.status(204).send();
  });

  stmt.finalize();
});

// ---------- ARCHIVOS DE CLIENTE ----------

app.get("/api/clientes/:id/archivos", (req, res) => {
  const { id } = req.params;

  db.all(
    "SELECT * FROM cliente_archivos WHERE cliente_id = ? ORDER BY fecha_creacion DESC, id DESC",
    [id],
    (err, rows) => {
      if (err) {
        console.error("Error al obtener archivos del cliente:", err);
        return res
          .status(500)
          .json({ error: "Error al obtener archivos del cliente" });
      }

      const archivos = rows.map((row) => ({
        ...row,
        url: `/api/clientes/${id}/archivos/${row.id}/descargar`,
      }));

      res.json(archivos);
    }
  );
});

app.get("/api/clientes/:id/archivos/:archivoId/descargar", (req, res) => {
  const { id, archivoId } = req.params;

  db.get(
    "SELECT * FROM cliente_archivos WHERE id = ? AND cliente_id = ?",
    [archivoId, id],
    (err, archivo) => {
      if (err) {
        console.error("Error al buscar archivo para descarga:", err);
        return res.status(500).json({ error: "Error al buscar el archivo" });
      }

      if (!archivo) {
        return res.status(404).json({ error: "Archivo no encontrado" });
      }

      const rutaAbsoluta = path.resolve(archivo.ruta);

      if (!rutaAbsoluta.startsWith(path.resolve(UPLOADS_DIR))) {
        console.error("Ruta de archivo fuera del directorio de uploads:", rutaAbsoluta);
        return res.status(400).json({ error: "Ruta de archivo inválida" });
      }

      fs.access(rutaAbsoluta, fs.constants.F_OK, (errAccess) => {
        if (errAccess) {
          return res.status(404).json({ error: "El archivo ya no está disponible" });
        }

        res.sendFile(rutaAbsoluta, (errSend) => {
          if (errSend && !res.headersSent) {
            console.error("Error al enviar archivo:", errSend);
            res.status(500).json({ error: "Error al descargar el archivo" });
          }
        });
      });
    }
  );
});

app.post("/api/clientes/:id/archivos", (req, res) => {
  uploadArchivo.single("archivo")(req, res, (errUpload) => {
    if (errUpload) {
      if (errUpload instanceof multer.MulterError && errUpload.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ error: "El archivo supera el tamaño máximo permitido (15 MB)." });
      }
      return res.status(400).json({
        error:
          errUpload.message ||
          "No se pudo subir el archivo. Verifica el formato e inténtalo de nuevo.",
      });
    }

    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: "El archivo es obligatorio" });
    }

    const extension = path.extname(req.file.originalname).toLowerCase();

    if (!tieneFirmaValida(req.file.path, extension)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        error:
          "El contenido del archivo no coincide con un formato permitido válido.",
      });
    }

    db.get("SELECT id FROM clientes WHERE id = ?", [id], (errCliente, cliente) => {
      if (errCliente) {
        console.error("Error al buscar cliente para archivo:", errCliente);
        return res.status(500).json({ error: "Error al buscar cliente" });
      }

      if (!cliente) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: "Cliente no encontrado" });
      }

      const stmt = db.prepare(`
        INSERT INTO cliente_archivos (
          cliente_id, nombre_original, nombre_archivo, ruta, mime_type, tamano
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        req.file.originalname,
        req.file.filename,
        req.file.path,
        req.file.mimetype,
        req.file.size,
        function (err) {
          if (err) {
            console.error("Error al registrar archivo:", err);
            return res.status(500).json({ error: "Error al registrar archivo" });
          }

          res.status(201).json({
            id: this.lastID,
            cliente_id: Number(id),
            nombre_original: req.file.originalname,
            nombre_archivo: req.file.filename,
            mime_type: req.file.mimetype,
            tamano: req.file.size,
            url: `/api/clientes/${id}/archivos/${this.lastID}/descargar`,
          });
        }
      );

      stmt.finalize();
    });
  });
});

app.delete("/api/clientes/:id/archivos/:archivoId", requiereRol("admin", "gerente"), (req, res) => {
  const { id, archivoId } = req.params;

  db.get(
    "SELECT * FROM cliente_archivos WHERE id = ? AND cliente_id = ?",
    [archivoId, id],
    (err, archivo) => {
      if (err) {
        console.error("Error al buscar archivo:", err);
        return res.status(500).json({ error: "Error al buscar archivo" });
      }

      if (!archivo) {
        return res.status(404).json({ error: "Archivo no encontrado" });
      }

      db.run(
        "DELETE FROM cliente_archivos WHERE id = ?",
        [archivoId],
        (errDelete) => {
          if (errDelete) {
            console.error("Error al eliminar archivo:", errDelete);
            return res
              .status(500)
              .json({ error: "Error al eliminar archivo" });
          }

          fs.unlink(archivo.ruta, (errUnlink) => {
            if (errUnlink) {
              console.error(
                "Error al eliminar archivo físico:",
                errUnlink
              );
            }
          });

          res.status(204).send();
        }
      );
    }
  );
});

// ---------- OPORTUNIDADES (PIPELINE) ----------

app.get("/api/oportunidades", (req, res) => {
  db.all(
    "SELECT * FROM oportunidades ORDER BY fecha_creacion DESC",
    [],
    (err, rows) => {
      if (err) {
        console.error("Error al obtener oportunidades:", err);
        return res
          .status(500)
          .json({ error: "Error al obtener oportunidades" });
      }
      res.json(rows);
    }
  );
});

app.post("/api/oportunidades", (req, res) => {
  const {
    titulo,
    cliente_id,
    servicio,
    monto,
    etapa,
    responsable,
    ultimo_movimiento,
  } = req.body;

  if (!titulo) {
    return res.status(400).json({ error: "El título es obligatorio" });
  }

  db.run(
    `
    INSERT INTO oportunidades (titulo, cliente_id, servicio, monto, etapa, responsable, ultimo_movimiento)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [
      titulo,
      cliente_id || null,
      servicio || null,
      monto || 0,
      etapa || "nuevo",
      responsable || null,
      ultimo_movimiento || "Oportunidad creada",
    ],
    function (err) {
      if (err) {
        console.error("Error al crear oportunidad:", err);
        return res
          .status(500)
          .json({ error: "Error al crear oportunidad" });
      }

      db.get(
        "SELECT * FROM oportunidades WHERE id = ?",
        [this.lastID],
        (errGet, row) => {
          if (errGet || !row) {
            return res.status(201).json({ id: this.lastID });
          }
          res.status(201).json(row);
        }
      );
    }
  );
});

app.put("/api/oportunidades/:id", requiereRol("admin", "gerente"), (req, res) => {
  const { id } = req.params;
  const { titulo, cliente_id, servicio, monto, etapa, responsable } = req.body;

  if (!titulo) {
    return res.status(400).json({ error: "El título es obligatorio" });
  }

  const stmt = db.prepare(`
    UPDATE oportunidades
    SET
      titulo = ?,
      cliente_id = ?,
      servicio = ?,
      monto = ?,
      etapa = ?,
      responsable = ?
    WHERE id = ?
  `);

  stmt.run(
    titulo,
    cliente_id || null,
    servicio || null,
    monto || 0,
    etapa || "nuevo",
    responsable || null,
    id,
    function (err) {
      if (err) {
        console.error("Error al actualizar oportunidad:", err);
        return res
          .status(500)
          .json({ error: "Error al actualizar oportunidad" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Oportunidad no encontrada" });
      }

      db.get("SELECT * FROM oportunidades WHERE id = ?", [id], (errGet, row) => {
        if (errGet || !row) {
          return res.status(200).json({ id: Number(id) });
        }
        res.status(200).json(row);
      });
    }
  );

  stmt.finalize();
});

app.delete("/api/oportunidades/:id", requiereRol("admin", "gerente"), (req, res) => {
  const { id } = req.params;

  const stmt = db.prepare("DELETE FROM oportunidades WHERE id = ?");
  stmt.run(id, function (err) {
    if (err) {
      console.error("Error al eliminar oportunidad:", err);
      return res
        .status(500)
        .json({ error: "Error al eliminar oportunidad" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Oportunidad no encontrada" });
    }

    res.status(204).send();
  });

  stmt.finalize();
});

app.put("/api/oportunidades/:id/etapa", (req, res) => {
  const { id } = req.params;
  const { etapa } = req.body;

  if (!etapa) {
    return res.status(400).json({ error: "La etapa es obligatoria" });
  }

  const ultimo_movimiento = `Movido a "${etapa}"`;

  db.run(
    `
    UPDATE oportunidades
    SET etapa = ?, ultimo_movimiento = ?
    WHERE id = ?
  `,
    [etapa, ultimo_movimiento, id],
    function (err) {
      if (err) {
        console.error("Error al actualizar etapa de oportunidad:", err);
        return res
          .status(500)
          .json({ error: "Error al actualizar oportunidad" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Oportunidad no encontrada" });
      }

      res.status(200).json({
        updated: this.changes,
        id: Number(id),
        etapa,
        ultimo_movimiento,
      });
    }
  );
});

// ---------- VENTAS ----------

app.get("/api/ventas", (req, res) => {
  db.all("SELECT * FROM ventas ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      console.error("Error al obtener ventas:", err);
      return res.status(500).json({ error: "Error al obtener ventas" });
    }
    res.json(rows);
  });
});

app.post("/api/ventas", (req, res) => {
  const {
    nombre,
    categoria,
    precio,
    descripcion,
    estado_servicio,
    tiempo_estimado,
    nota,
    duplicado_de,
  } = req.body;

  // "duplicado_de" solo lo manda la acción "Duplicar" del frontend.
  // Crear un servicio nuevo desde cero sigue abierto a todos los roles,
  // pero duplicar uno existente requiere el mismo rol que editar/eliminar.
  if (duplicado_de && req.usuario.rol === "empleado") {
    return res.status(403).json({ error: "No tienes permisos para esta acción" });
  }

  if (!nombre || precio == null) {
    return res
      .status(400)
      .json({ error: "Nombre y precio son obligatorios" });
  }

  const stmt = db.prepare(`
    INSERT INTO ventas (
      nombre,
      categoria,
      precio,
      descripcion,
      estado_servicio,
      tiempo_estimado,
      nota
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    nombre,
    categoria || null,
    Number(precio),
    descripcion || null,
    estado_servicio || "activo",
    tiempo_estimado || null,
    nota || null,
    function (err) {
      if (err) {
        console.error("Error al crear venta:", err);
        return res.status(500).json({ error: "Error al crear venta" });
      }

      res.status(201).json({
        id: this.lastID,
        nombre,
        categoria,
        precio: Number(precio),
        descripcion,
        estado_servicio: estado_servicio || "activo",
        tiempo_estimado,
        nota,
      });
    }
  );

  stmt.finalize();
});

app.put("/api/ventas/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;
  const {
    nombre,
    categoria,
    precio,
    descripcion,
    estado_servicio,
    tiempo_estimado,
    nota,
  } = req.body;

  if (!nombre || precio == null) {
    return res
      .status(400)
      .json({ error: "Nombre y precio son obligatorios" });
  }

  const stmt = db.prepare(`
    UPDATE ventas
    SET
      nombre = ?,
      categoria = ?,
      precio = ?,
      descripcion = ?,
      estado_servicio = ?,
      tiempo_estimado = ?,
      nota = ?
    WHERE id = ?
  `);

  stmt.run(
    nombre,
    categoria || null,
    Number(precio),
    descripcion || null,
    estado_servicio || "activo",
    tiempo_estimado || null,
    nota || null,
    id,
    function (err) {
      if (err) {
        console.error("Error al actualizar venta:", err);
        return res.status(500).json({ error: "Error al actualizar venta" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Venta no encontrada" });
      }

      res.status(200).json({
        id: Number(id),
        nombre,
        categoria,
        precio: Number(precio),
        descripcion,
        estado_servicio: estado_servicio || "activo",
        tiempo_estimado,
        nota,
      });
    }
  );

  stmt.finalize();
});

app.delete("/api/ventas/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;

  const stmt = db.prepare("DELETE FROM ventas WHERE id = ?");
  stmt.run(id, function (err) {
    if (err) {
      console.error("Error al eliminar venta:", err);
      return res.status(500).json({ error: "Error al eliminar venta" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    res.status(204).send();
  });

  stmt.finalize();
});

// ---------- SEGUIMIENTOS ----------

app.get("/api/seguimientos", (req, res) => {
  db.all("SELECT * FROM seguimientos ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      console.error("Error al obtener seguimientos:", err);
      return res
        .status(500)
        .json({ error: "Error al obtener seguimientos" });
    }
    res.json(rows);
  });
});

app.post("/api/seguimientos", (req, res) => {
  const {
    cliente_id,
    cliente,
    titulo,
    descripcion,
    prioridad,
    estado,
    fecha_limite,
    recordatorio,
    notas,
  } = req.body;

  if (!titulo) {
    return res.status(400).json({ error: "El título es obligatorio" });
  }

  const stmt = db.prepare(`
    INSERT INTO seguimientos (
      cliente_id,
      cliente,
      titulo,
      descripcion,
      prioridad,
      estado,
      fecha_limite,
      recordatorio,
      notas
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    cliente_id || null,
    cliente || null,
    titulo,
    descripcion || null,
    prioridad || "media",
    estado || "pendiente",
    fecha_limite || null,
    recordatorio || null,
    notas || null,
    function (err) {
      if (err) {
        console.error("Error al crear seguimiento:", err);
        return res
          .status(500)
          .json({ error: "Error al crear seguimiento" });
      }

      const seguimientoId = this.lastID;
      const fechaEvento = recordatorio || fecha_limite || null;

      if (fechaEvento) {
        const stmtCal = db.prepare(`
          INSERT INTO calendario_eventos (
            tipo,
            titulo,
            fecha,
            descripcion,
            referencia_id,
            modulo
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        const tituloEvento = `Seguimiento: ${titulo}`;
        const descripcionEvento =
          descripcion ||
          "Seguimiento programado. Revisar contacto con el cliente.";

        stmtCal.run(
          "seguimiento",
          tituloEvento,
          fechaEvento,
          descripcionEvento,
          seguimientoId,
          "seguimiento",
          (errCal) => {
            if (errCal) {
              console.error(
                "Error al crear evento de calendario para seguimiento:",
                errCal
              );
            }
          }
        );

        stmtCal.finalize();
      }

      res.status(201).json({
        id: seguimientoId,
        cliente_id,
        cliente,
        titulo,
        descripcion,
        prioridad: prioridad || "media",
        estado: estado || "pendiente",
        fecha_limite,
        recordatorio,
        notas,
      });
    }
  );

  stmt.finalize();
});

app.put("/api/seguimientos/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;
  const {
    cliente_id,
    cliente,
    titulo,
    descripcion,
    prioridad,
    estado,
    fecha_limite,
    recordatorio,
    notas,
  } = req.body;

  if (!titulo) {
    return res.status(400).json({ error: "El título es obligatorio" });
  }

  const stmt = db.prepare(`
    UPDATE seguimientos
    SET
      cliente_id = ?,
      cliente = ?,
      titulo = ?,
      descripcion = ?,
      prioridad = ?,
      estado = ?,
      fecha_limite = ?,
      recordatorio = ?,
      notas = ?
    WHERE id = ?
  `);

  stmt.run(
    cliente_id || null,
    cliente || null,
    titulo,
    descripcion || null,
    prioridad || "media",
    estado || "pendiente",
    fecha_limite || null,
    recordatorio || null,
    notas || null,
    id,
    function (err) {
      if (err) {
        console.error("Error al actualizar seguimiento:", err);
        return res
          .status(500)
          .json({ error: "Error al actualizar seguimiento" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Seguimiento no encontrado" });
      }

      const segId = Number(id);

      const deleteStmt = db.prepare(
        "DELETE FROM calendario_eventos WHERE tipo = ? AND modulo = ? AND referencia_id = ?"
      );

      deleteStmt.run("seguimiento", "seguimiento", segId, (errDel) => {
        if (errDel) {
          console.error(
            "Error al eliminar evento antiguo de seguimiento:",
            errDel
          );
        }

        deleteStmt.finalize();

        const fechaEvento = recordatorio || fecha_limite || null;

        if (fechaEvento) {
          const stmtCal = db.prepare(`
            INSERT INTO calendario_eventos (
              tipo,
              titulo,
              fecha,
              descripcion,
              referencia_id,
              modulo
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `);

          const tituloEvento = `Seguimiento: ${titulo}`;
          const descripcionEvento =
            descripcion ||
            "Seguimiento programado. Revisar contacto con el cliente.";

          stmtCal.run(
            "seguimiento",
            tituloEvento,
            fechaEvento,
            descripcionEvento,
            segId,
            "seguimiento",
            (errCal) => {
              if (errCal) {
                console.error(
                  "Error al crear evento de calendario para seguimiento actualizado:",
                  errCal
                );
              }
            }
          );

          stmtCal.finalize();
        }
      });

      res.status(200).json({
        id: segId,
        cliente_id,
        cliente,
        titulo,
        descripcion,
        prioridad: prioridad || "media",
        estado: estado || "pendiente",
        fecha_limite,
        recordatorio,
        notas,
      });
    }
  );

  stmt.finalize();
});

app.delete("/api/seguimientos/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;

  const deleteCalStmt = db.prepare(
    "DELETE FROM calendario_eventos WHERE tipo = ? AND modulo = ? AND referencia_id = ?"
  );

  deleteCalStmt.run("seguimiento", "seguimiento", Number(id), (errCal) => {
    if (errCal) {
      console.error(
        "Error al eliminar eventos de calendario del seguimiento:",
        errCal
      );
    }

    deleteCalStmt.finalize();

    const stmt = db.prepare("DELETE FROM seguimientos WHERE id = ?");
    stmt.run(id, function (err) {
      if (err) {
        console.error("Error al eliminar seguimiento:", err);
        return res
          .status(500)
          .json({ error: "Error al eliminar seguimiento" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Seguimiento no encontrado" });
      }

      res.status(204).send();
    });

    stmt.finalize();
  });
});

// ---------- FINANZAS (movimientos) ----------

app.get("/api/finanzas", (req, res) => {
  db.all("SELECT * FROM finanzas ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      console.error("Error al obtener finanzas:", err);
      return res
        .status(500)
        .json({ error: "Error al obtener finanzas" });
    }
    res.json(rows);
  });
});

function validarCamposFinanza({ tipo, fecha, categoria, cliente, metodo_pago, proveedor }) {
  if (!fecha || !categoria) {
    return "Fecha y categoría son obligatorias";
  }

  if (tipo === "ingreso" && (!cliente || !metodo_pago)) {
    return "Cliente y método de pago son obligatorios para un ingreso";
  }

  if (tipo === "gasto" && !proveedor) {
    return "El proveedor es obligatorio para un gasto";
  }

  return null;
}

app.post("/api/finanzas", requiereRol("admin", "gerente"), (req, res) => {
  const {
    tipo,
    concepto,
    monto,
    fecha,
    nota,
    cliente_id,
    cliente,
    categoria,
    metodo_pago,
    proveedor,
  } = req.body;

  if (!tipo || !concepto || monto == null) {
    return res
      .status(400)
      .json({ error: "Tipo, concepto y monto son obligatorios" });
  }

  const errorCampos = validarCamposFinanza({
    tipo,
    fecha,
    categoria,
    cliente,
    metodo_pago,
    proveedor,
  });

  if (errorCampos) {
    return res.status(400).json({ error: errorCampos });
  }

  const stmt = db.prepare(`
    INSERT INTO finanzas (
      tipo, concepto, monto, fecha, nota,
      cliente_id, cliente, categoria, metodo_pago, proveedor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    tipo,
    concepto,
    Number(monto),
    fecha || null,
    nota || null,
    cliente_id || null,
    cliente || null,
    categoria || null,
    metodo_pago || null,
    proveedor || null,
    function (err) {
      if (err) {
        console.error("Error al crear movimiento financiero:", err);
        return res
          .status(500)
          .json({ error: "Error al crear movimiento financiero" });
      }

      res.status(201).json({
        id: this.lastID,
        tipo,
        concepto,
        monto: Number(monto),
        fecha,
        nota,
        cliente_id: cliente_id || null,
        cliente: cliente || null,
        categoria: categoria || null,
        metodo_pago: metodo_pago || null,
        proveedor: proveedor || null,
      });
    }
  );

  stmt.finalize();
});

app.put("/api/finanzas/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;
  const {
    tipo,
    concepto,
    monto,
    fecha,
    nota,
    cliente_id,
    cliente,
    categoria,
    metodo_pago,
    proveedor,
  } = req.body;

  if (!tipo || !concepto || monto == null) {
    return res
      .status(400)
      .json({ error: "Tipo, concepto y monto son obligatorios" });
  }

  const errorCampos = validarCamposFinanza({
    tipo,
    fecha,
    categoria,
    cliente,
    metodo_pago,
    proveedor,
  });

  if (errorCampos) {
    return res.status(400).json({ error: errorCampos });
  }

  const stmt = db.prepare(`
    UPDATE finanzas
    SET
      tipo = ?,
      concepto = ?,
      monto = ?,
      fecha = ?,
      nota = ?,
      cliente_id = ?,
      cliente = ?,
      categoria = ?,
      metodo_pago = ?,
      proveedor = ?
    WHERE id = ?
  `);

  stmt.run(
    tipo,
    concepto,
    Number(monto),
    fecha || null,
    nota || null,
    cliente_id || null,
    cliente || null,
    categoria || null,
    metodo_pago || null,
    proveedor || null,
    id,
    function (err) {
      if (err) {
        console.error("Error al actualizar finanza:", err);
        return res
          .status(500)
          .json({ error: "Error al actualizar finanza" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Movimiento no encontrado" });
      }

      res.status(200).json({
        id: Number(id),
        tipo,
        concepto,
        monto: Number(monto),
        fecha,
        nota,
        cliente_id: cliente_id || null,
        cliente: cliente || null,
        categoria: categoria || null,
        metodo_pago: metodo_pago || null,
        proveedor: proveedor || null,
      });
    }
  );

  stmt.finalize();
});

app.delete("/api/finanzas/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;

  const stmt = db.prepare("DELETE FROM finanzas WHERE id = ?");
  stmt.run(id, function (err) {
    if (err) {
      console.error("Error al eliminar finanza:", err);
      return res
        .status(500)
        .json({ error: "Error al eliminar finanza" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Movimiento no encontrado" });
    }

    registrarAuditoria({
      usuario: req.usuario,
      accion: "finanza_eliminada",
      entidad: "finanza",
      entidadId: Number(id),
      ip: req.ip,
    });

    res.status(204).send();
  });

  stmt.finalize();
});

app.get("/api/finanzas/resumen-mensual", (req, res) => {
  const sqlMes = `
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS ingresos_mes,
      COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0) AS gastos_mes
    FROM finanzas
    WHERE fecha IS NOT NULL
      AND strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now')
  `;

  const sqlTotal = `
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS ingresos_total,
      COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0) AS gastos_total
    FROM finanzas
  `;

  db.get(sqlMes, [], (errMes, rowMes) => {
    if (errMes) {
      console.error("Error al calcular resumen mensual de finanzas:", errMes);
      return res
        .status(500)
        .json({ error: "Error al calcular resumen mensual de finanzas" });
    }

    db.get(sqlTotal, [], (errTotal, rowTotal) => {
      if (errTotal) {
        console.error("Error al calcular balance de finanzas:", errTotal);
        return res
          .status(500)
          .json({ error: "Error al calcular balance de finanzas" });
      }

      const ingresosMes = Number(rowMes?.ingresos_mes || 0);
      const gastosMes = Number(rowMes?.gastos_mes || 0);
      const ingresosTotal = Number(rowTotal?.ingresos_total || 0);
      const gastosTotal = Number(rowTotal?.gastos_total || 0);

      res.json({
        balance: ingresosTotal - gastosTotal,
        ingresos_mes: ingresosMes,
        gastos_mes: gastosMes,
        flujo_caja: ingresosMes - gastosMes,
      });
    });
  });
});

// ---------- COTIZACIONES ----------

app.get("/api/cotizaciones", (req, res) => {
  db.all(
    `SELECT c.*, p.id AS proyecto_id
     FROM cotizaciones c
     LEFT JOIN proyectos p ON p.cotizacion_id = c.id
     ORDER BY c.id DESC`,
    [],
    (err, rows) => {
      if (err) {
        db.all("SELECT * FROM cotizaciones ORDER BY id DESC", [], (err2, rows2) => {
          if (err2) {
            console.error("Error al obtener cotizaciones:", err2);
            return res
              .status(500)
              .json({ error: "Error al obtener cotizaciones" });
          }
          return res.json(rows2);
        });
        return;
      }
      res.json(rows);
    }
  );
});

app.post("/api/cotizaciones", (req, res) => {
  const {
    cliente_id,
    oportunidad_id,
    titulo,
    descripcion,
    subtotal,
    impuestos,
    total,
    estado,
    fecha,
    vigencia,
  } = req.body;

  if (
    !titulo ||
    subtotal == null ||
    impuestos == null ||
    total == null ||
    !estado
  ) {
    return res.status(400).json({
      error: "Título, subtotal, impuestos, total y estado son obligatorios",
    });
  }

  const stmt = db.prepare(`
    INSERT INTO cotizaciones (
      cliente_id,
      oportunidad_id,
      titulo,
      descripcion,
      subtotal,
      impuestos,
      total,
      estado,
      fecha,
      vigencia
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    cliente_id || null,
    oportunidad_id || null,
    titulo,
    descripcion || null,
    Number(subtotal),
    Number(impuestos),
    Number(total),
    estado,
    fecha || null,
    vigencia || null,
    function (err) {
      if (err) {
        console.error("Error al crear cotización:", err);
        return res
          .status(500)
          .json({ error: "Error al crear cotización" });
      }

      res.status(201).json({
        id: this.lastID,
        cliente_id,
        oportunidad_id,
        titulo,
        descripcion,
        subtotal: Number(subtotal),
        impuestos: Number(impuestos),
        total: Number(total),
        estado,
        fecha,
        vigencia,
      });
    }
  );

  stmt.finalize();
});

app.put("/api/cotizaciones/:id", requiereRol("admin", "gerente"), (req, res) => {
  const { id } = req.params;
  const {
    cliente_id,
    oportunidad_id,
    titulo,
    descripcion,
    subtotal,
    impuestos,
    total,
    estado,
    fecha,
    vigencia,
  } = req.body;

  if (
    !titulo ||
    subtotal == null ||
    impuestos == null ||
    total == null ||
    !estado
  ) {
    return res.status(400).json({
      error: "Título, subtotal, impuestos, total y estado son obligatorios",
    });
  }

  const stmt = db.prepare(`
    UPDATE cotizaciones
    SET
      cliente_id = ?,
      oportunidad_id = ?,
      titulo = ?,
      descripcion = ?,
      subtotal = ?,
      impuestos = ?,
      total = ?,
      estado = ?,
      fecha = ?,
      vigencia = ?
    WHERE id = ?
  `);

  stmt.run(
    cliente_id || null,
    oportunidad_id || null,
    titulo,
    descripcion || null,
    Number(subtotal),
    Number(impuestos),
    Number(total),
    estado,
    fecha || null,
    vigencia || null,
    id,
    function (err) {
      if (err) {
        console.error("Error al actualizar cotización:", err);
        return res
          .status(500)
          .json({ error: "Error al actualizar cotización" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Cotización no encontrada" });
      }

      db.get(
        "SELECT * FROM cotizaciones WHERE id = ?",
        [id],
        (errGet, row) => {
          if (errGet || !row) {
            return res.status(200).json({ id: Number(id) });
          }
          res.status(200).json(row);
        }
      );
    }
  );

  stmt.finalize();
});

app.delete("/api/cotizaciones/:id", requiereRol("admin", "gerente"), (req, res) => {
  const { id } = req.params;

  const stmt = db.prepare("DELETE FROM cotizaciones WHERE id = ?");

  stmt.run(id, function (err) {
    if (err) {
      console.error("Error al eliminar cotización:", err);
      return res
        .status(500)
        .json({ error: "Error al eliminar cotización" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    res.status(204).send();
  });

  stmt.finalize();
});

app.put("/api/cotizaciones/:id/estado", (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!estado) {
    return res.status(400).json({ error: "El estado es obligatorio" });
  }

  const stmt = db.prepare("UPDATE cotizaciones SET estado = ? WHERE id = ?");

  stmt.run(estado, id, function (err) {
    if (err) {
      console.error("Error al actualizar cotización:", err);
      return res
        .status(500)
        .json({ error: "Error al actualizar cotización" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    res.status(200).json({ id: Number(id), estado });
  });

  stmt.finalize();
});

app.post("/api/cotizaciones/:id/convertir-a-factura", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM cotizaciones WHERE id = ?", [id], (err, cot) => {
    if (err) {
      console.error("Error al buscar cotización:", err);
      return res
        .status(500)
        .json({ error: "Error al buscar cotización" });
    }

    if (!cot) {
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    if (cot.estado !== "aceptada") {
      return res.status(400).json({
        error:
          "Solo se pueden convertir cotizaciones aceptadas en factura",
      });
    }

    const fechaHoy = new Date().toISOString().slice(0, 10);

    const stmt = db.prepare(`
      INSERT INTO facturas (
        cliente_id,
        cotizacion_id,
        numero,
        titulo,
        descripcion,
        subtotal,
        impuestos,
        total,
        estado,
        fecha,
        vencimiento
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      cot.cliente_id || null,
      cot.id,
      null,
      cot.titulo,
      cot.descripcion || null,
      cot.subtotal,
      cot.impuestos,
      cot.total,
      "pendiente",
      fechaHoy,
      cot.vigencia || null,
      function (err2) {
        if (err2) {
          console.error("Error al crear factura desde cotización:", err2);
          return res
            .status(500)
            .json({ error: "Error al crear factura" });
        }

        const facturaId = this.lastID;
        const numeroFactura = `FAC-${String(facturaId).padStart(5, "0")}`;

        db.run(
          "UPDATE facturas SET numero = ? WHERE id = ?",
          [numeroFactura, facturaId],
          (errNumero) => {
            if (errNumero) {
              console.error(
                "Error al asignar número a factura desde cotización:",
                errNumero
              );
            }
          }
        );

        if (cot.vigencia) {
          const stmtCal = db.prepare(`
            INSERT INTO calendario_eventos (
              tipo,
              titulo,
              fecha,
              descripcion,
              referencia_id,
              modulo
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `);

          const tituloEvento = `Factura #${facturaId} - vencimiento`;
          const descripcionEvento =
            cot.descripcion ||
            "Vencimiento de factura creada desde cotización aceptada.";

          stmtCal.run(
            "factura",
            tituloEvento,
            cot.vigencia,
            descripcionEvento,
            facturaId,
            "factura",
            (errCal) => {
              if (errCal) {
                console.error(
                  "Error al crear evento de calendario para factura (desde cotización):",
                  errCal
                );
              }
            }
          );

          stmtCal.finalize();
        }

        res.status(201).json({
          id: facturaId,
          cliente_id: cot.cliente_id,
          cotizacion_id: cot.id,
          numero: numeroFactura,
          titulo: cot.titulo,
          descripcion: cot.descripcion,
          subtotal: cot.subtotal,
          impuestos: cot.impuestos,
          total: cot.total,
          estado: "pendiente",
          fecha: fechaHoy,
          vencimiento: cot.vigencia || null,
        });
      }
    );

    stmt.finalize();
  });
});

app.post("/api/cotizaciones/:id/convertir-a-proyecto", requiereRol("admin", "gerente"), (req, res) => {
  const { id } = req.params;
  const cotizacionId = Number(id);

  if (!cotizacionId || Number.isNaN(cotizacionId)) {
    return res.status(400).json({ error: "Identificador de cotización inválido" });
  }

  db.get("SELECT * FROM cotizaciones WHERE id = ?", [cotizacionId], (err, cot) => {
    if (err) {
      console.error("Error al buscar cotización:", err);
      return res.status(500).json({ error: "Error al buscar cotización" });
    }

    if (!cot) {
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    if (cot.estado !== "aceptada") {
      return res.status(400).json({
        error: "Solo se pueden convertir en proyecto cotizaciones con estado 'aceptada'",
        estado_actual: cot.estado,
      });
    }

    db.get("SELECT * FROM proyectos WHERE cotizacion_id = ?", [cotizacionId], (errCheck, proyectoExistente) => {
      if (errCheck) {
        console.error("Error al verificar proyecto existente:", errCheck);
        return res.status(500).json({ error: "Error al verificar proyecto existente" });
      }

      if (proyectoExistente) {
        return res.status(200).json({
          message: "Esta cotización ya fue convertida a proyecto previamente",
          id: proyectoExistente.id,
          proyecto: proyectoExistente,
          yaExistia: true,
        });
      }

      const obtenerCliente = (cb) => {
        if (!cot.cliente_id) return cb(null, null);
        db.get("SELECT nombre FROM clientes WHERE id = ?", [cot.cliente_id], (errCli, cli) => {
          if (errCli) return cb(errCli);
          cb(null, cli ? cli.nombre : null);
        });
      };

      obtenerCliente((errCli, nombreCliente) => {
        if (errCli) {
          console.error("Error al consultar cliente para proyecto:", errCli);
          return res.status(500).json({ error: "Error al consultar información del cliente" });
        }

        db.run("BEGIN IMMEDIATE TRANSACTION", (errBegin) => {
          if (errBegin) {
            console.error("Error al iniciar transacción:", errBegin);
            return res.status(500).json({ error: "Error al iniciar transacción de conversión" });
          }

          db.get("SELECT * FROM proyectos WHERE cotizacion_id = ?", [cotizacionId], (errDouble, proyectoConcurrente) => {
            if (errDouble) {
              db.run("ROLLBACK");
              return res.status(500).json({ error: "Error al verificar duplicidad" });
            }

            if (proyectoConcurrente) {
              db.run("COMMIT", () => {
                return res.status(200).json({
                  message: "Esta cotización ya fue convertida a proyecto previamente",
                  id: proyectoConcurrente.id,
                  proyecto: proyectoConcurrente,
                  yaExistia: true,
                });
              });
              return;
            }

            const tituloProyecto = cot.titulo || `Proyecto Cotización #${cot.id}`;
            const estadoInicial = "planeado";
            const notas = cot.descripcion
              ? `Proyecto generado a partir de la Cotización #${cot.id}. ${cot.descripcion}`
              : `Proyecto generado a partir de la Cotización #${cot.id}.`;

            const stmt = db.prepare(`
              INSERT INTO proyectos (
                cliente_id,
                cliente,
                titulo,
                responsable,
                fecha_inicio,
                fecha_fin,
                estado,
                notas,
                cotizacion_id
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
              cot.cliente_id || null,
              nombreCliente || null,
              tituloProyecto,
              null,
              null,
              null,
              estadoInicial,
              notas,
              cotizacionId,
              function (errInsert) {
                if (errInsert) {
                  db.run("ROLLBACK");
                  if (errInsert.message && errInsert.message.includes("UNIQUE")) {
                    db.get("SELECT * FROM proyectos WHERE cotizacion_id = ?", [cotizacionId], (errF, pExist) => {
                      if (pExist) {
                        return res.status(200).json({
                          message: "Esta cotización ya fue convertida a proyecto previamente",
                          id: pExist.id,
                          proyecto: pExist,
                          yaExistia: true,
                        });
                      }
                      return res.status(409).json({ error: "El proyecto ya existe para esta cotización" });
                    });
                    return;
                  }
                  console.error("Error al crear proyecto desde cotización:", errInsert);
                  return res.status(500).json({ error: "Error al crear proyecto desde cotización" });
                }

                const nuevoProyectoId = this.lastID;

                db.run("COMMIT", (errCommit) => {
                  if (errCommit) {
                    db.run("ROLLBACK");
                    console.error("Error al confirmar transacción:", errCommit);
                    return res.status(500).json({ error: "Error al confirmar transacción" });
                  }

                  res.status(201).json({
                    message: "Proyecto creado exitosamente desde cotización aceptada",
                    id: nuevoProyectoId,
                    proyecto: {
                      id: nuevoProyectoId,
                      cliente_id: cot.cliente_id || null,
                      cliente: nombreCliente || null,
                      titulo: tituloProyecto,
                      responsable: null,
                      fecha_inicio: null,
                      fecha_fin: null,
                      estado: estadoInicial,
                      notas,
                      cotizacion_id: cotizacionId,
                    },
                    yaExistia: false,
                  });
                });
              }
            );

            stmt.finalize();
          });
        });
      });
    });
  });
});

// ---------- FACTURAS ----------

app.get("/api/facturas", (req, res) => {
  const sqlVencidas = `
    UPDATE facturas
    SET estado = 'vencida'
    WHERE vencimiento IS NOT NULL
      AND date(vencimiento) < date('now')
      AND estado NOT IN ('pagada', 'cancelada', 'vencida')
  `;

  db.run(sqlVencidas, [], (errVencidas) => {
    if (errVencidas) {
      console.error("Error al actualizar facturas vencidas:", errVencidas);
    }

    db.all("SELECT * FROM facturas ORDER BY id DESC", [], (err, rows) => {
      if (err) {
        console.error("Error al obtener facturas:", err);
        return res.status(500).json({ error: "Error al obtener facturas" });
      }
      res.json(rows);
    });
  });
});

app.post("/api/facturas", requiereRol("admin", "gerente"), (req, res) => {
  const {
    cliente_id,
    cotizacion_id,
    numero,
    titulo,
    descripcion,
    subtotal,
    impuestos,
    total,
    estado,
    fecha,
    vencimiento,
  } = req.body;

  if (
    !titulo ||
    subtotal == null ||
    impuestos == null ||
    total == null ||
    !estado
  ) {
    return res.status(400).json({
      error: "Título, subtotal, impuestos, total y estado son obligatorios",
    });
  }

  const stmt = db.prepare(`
    INSERT INTO facturas (
      cliente_id,
      cotizacion_id,
      numero,
      titulo,
      descripcion,
      subtotal,
      impuestos,
      total,
      estado,
      fecha,
      vencimiento
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    cliente_id || null,
    cotizacion_id || null,
    numero || null,
    titulo,
    descripcion || null,
    Number(subtotal),
    Number(impuestos),
    Number(total),
    estado,
    fecha || null,
    vencimiento || null,
    function (err) {
      if (err) {
        console.error("Error al crear factura:", err);
        return res.status(500).json({ error: "Error al crear factura" });
      }

      const facturaId = this.lastID;
      const numeroFinal = numero || `FAC-${String(facturaId).padStart(5, "0")}`;

      if (!numero) {
        db.run(
          "UPDATE facturas SET numero = ? WHERE id = ?",
          [numeroFinal, facturaId],
          (errNumero) => {
            if (errNumero) {
              console.error("Error al asignar número a factura:", errNumero);
            }
          }
        );
      }

      if (vencimiento) {
        const stmtCal = db.prepare(`
          INSERT INTO calendario_eventos (
            tipo,
            titulo,
            fecha,
            descripcion,
            referencia_id,
            modulo
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        const tituloEvento = `Factura #${numeroFinal} - vencimiento`;
        const descripcionEvento =
          descripcion ||
          "Vencimiento de factura. Revisar cobro y enviar recordatorio si aplica.";

        stmtCal.run(
          "factura",
          tituloEvento,
          vencimiento,
          descripcionEvento,
          facturaId,
          "factura",
          (errCal) => {
            if (errCal) {
              console.error(
                "Error al crear evento de calendario para factura:",
                errCal
              );
            }
          }
        );

        stmtCal.finalize();
      }

      res.status(201).json({
        id: facturaId,
        cliente_id,
        cotizacion_id,
        numero: numeroFinal,
        titulo,
        descripcion,
        subtotal: Number(subtotal),
        impuestos: Number(impuestos),
        total: Number(total),
        estado,
        fecha,
        vencimiento,
      });
    }
  );

  stmt.finalize();
});

app.put("/api/facturas/:id", requiereRol("admin", "gerente"), (req, res) => {
  const { id } = req.params;
  const {
    cliente_id,
    cotizacion_id,
    numero,
    titulo,
    descripcion,
    subtotal,
    impuestos,
    total,
    estado,
    fecha,
    vencimiento,
  } = req.body;

  if (
    !titulo ||
    subtotal == null ||
    impuestos == null ||
    total == null ||
    !estado
  ) {
    return res.status(400).json({
      error: "Título, subtotal, impuestos, total y estado son obligatorios",
    });
  }

  db.get("SELECT * FROM facturas WHERE id = ?", [id], (errFac, facturaActual) => {
    if (errFac) {
      console.error("Error al buscar factura para editar:", errFac);
      return res.status(500).json({ error: "Error al buscar factura" });
    }

    if (!facturaActual) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }

    const stmt = db.prepare(`
      UPDATE facturas
      SET
        cliente_id = ?,
        cotizacion_id = ?,
        numero = ?,
        titulo = ?,
        descripcion = ?,
        subtotal = ?,
        impuestos = ?,
        total = ?,
        estado = ?,
        fecha = ?,
        vencimiento = ?
      WHERE id = ?
    `);

    stmt.run(
      cliente_id || null,
      cotizacion_id || null,
      numero || null,
      titulo,
      descripcion || null,
      Number(subtotal),
      Number(impuestos),
      Number(total),
      estado,
      fecha || null,
      vencimiento || null,
      id,
      function (errUpd) {
        if (errUpd) {
          console.error("Error al actualizar factura:", errUpd);
          return res.status(500).json({ error: "Error al actualizar factura" });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: "Factura no encontrada" });
        }

        const deleteCalStmt = db.prepare(
          "DELETE FROM calendario_eventos WHERE tipo = ? AND modulo = ? AND referencia_id = ?"
        );

        deleteCalStmt.run("factura", "factura", Number(id), (errDel) => {
          if (errDel) {
            console.error(
              "Error al eliminar evento anterior de factura en calendario:",
              errDel
            );
          }

          deleteCalStmt.finalize();

          if (vencimiento) {
            const stmtCal = db.prepare(`
              INSERT INTO calendario_eventos (
                tipo,
                titulo,
                fecha,
                descripcion,
                referencia_id,
                modulo
              )
              VALUES (?, ?, ?, ?, ?, ?)
            `);

            const tituloEvento = `Factura #${numero || id} - vencimiento`;
            const descripcionEvento =
              descripcion ||
              "Vencimiento de factura. Revisar cobro y enviar recordatorio si aplica.";

            stmtCal.run(
              "factura",
              tituloEvento,
              vencimiento,
              descripcionEvento,
              Number(id),
              "factura",
              (errCal) => {
                if (errCal) {
                  console.error(
                    "Error al recrear evento de calendario para factura editada:",
                    errCal
                  );
                }
              }
            );

            stmtCal.finalize();
          }

          res.status(200).json({
            id: Number(id),
            cliente_id: cliente_id || null,
            cotizacion_id: cotizacion_id || null,
            numero: numero || null,
            titulo,
            descripcion: descripcion || null,
            subtotal: Number(subtotal),
            impuestos: Number(impuestos),
            total: Number(total),
            estado,
            fecha: fecha || null,
            vencimiento: vencimiento || null,
          });
        });
      }
    );

    stmt.finalize();
  });
});

app.put("/api/facturas/:id/estado", requiereRol("admin", "gerente"), (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!estado) {
    return res.status(400).json({ error: "El estado es obligatorio" });
  }

  const stmt = db.prepare("UPDATE facturas SET estado = ? WHERE id = ?");

  stmt.run(estado, id, function (err) {
    if (err) {
      console.error("Error al actualizar factura:", err);
      return res
        .status(500)
        .json({ error: "Error al actualizar factura" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }

    res.status(200).json({ id: Number(id), estado });
  });

  stmt.finalize();
});

// ---------- PAGOS POR FACTURA ----------

app.get("/api/facturas/:id/pagos", (req, res) => {
  const { id } = req.params;

  db.all(
    "SELECT * FROM pagos WHERE factura_id = ? ORDER BY fecha DESC, id DESC",
    [id],
    (err, rows) => {
      if (err) {
        console.error("Error al obtener pagos de factura:", err);
        return res
          .status(500)
          .json({ error: "Error al obtener pagos de la factura" });
      }
      res.json(rows);
    }
  );
});

app.post("/api/facturas/:id/pagos", requiereRol("admin", "gerente"), (req, res) => {
  const { id } = req.params;
  const { fecha, monto, metodo, referencia, nota } = req.body;

  if (monto == null || Number.isNaN(Number(monto)) || Number(monto) <= 0) {
    return res
      .status(400)
      .json({ error: "El monto del pago debe ser mayor a 0" });
  }

  db.get("SELECT * FROM facturas WHERE id = ?", [id], (errFac, factura) => {
    if (errFac) {
      console.error("Error al buscar factura:", errFac);
      return res.status(500).json({ error: "Error al buscar factura" });
    }

    if (!factura) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }

    const stmtPago = db.prepare(`
      INSERT INTO pagos (
        factura_id,
        fecha,
        monto,
        metodo,
        referencia,
        nota
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const fechaPago = fecha || new Date().toISOString().slice(0, 10);

    stmtPago.run(
      factura.id,
      fechaPago,
      Number(monto),
      metodo || null,
      referencia || null,
      nota || null,
      function (errPago) {
        if (errPago) {
          console.error("Error al registrar pago:", errPago);
          return res
            .status(500)
            .json({ error: "Error al registrar el pago" });
        }

        const pagoId = this.lastID;

        db.get(
          "SELECT COALESCE(SUM(monto), 0) AS total_pagado FROM pagos WHERE factura_id = ?",
          [factura.id],
          (errSum, rowSum) => {
            if (errSum) {
              console.error("Error al sumar pagos:", errSum);
              return res.status(500).json({
                error:
                  "Pago registrado, pero error al actualizar estado de factura",
              });
            }

            const totalPagado = rowSum.total_pagado || 0;
            let nuevoEstado = factura.estado;

            if (totalPagado >= factura.total) {
              nuevoEstado = "pagada";
            } else if (totalPagado > 0 && totalPagado < factura.total) {
              nuevoEstado = "parcial";
            } else if (totalPagado === 0) {
              nuevoEstado = "pendiente";
            }

            const stmtUpdate = db.prepare(
              "UPDATE facturas SET estado = ? WHERE id = ?"
            );

            stmtUpdate.run(nuevoEstado, factura.id, (errUpd) => {
              if (errUpd) {
                console.error(
                  "Error al actualizar estado de factura:",
                  errUpd
                );
                return res.status(201).json({
                  pago: {
                    id: pagoId,
                    factura_id: factura.id,
                    fecha: fechaPago,
                    monto: Number(monto),
                    metodo: metodo || null,
                    referencia: referencia || null,
                    nota: nota || null,
                  },
                  aviso:
                    "Pago registrado, pero no se pudo actualizar el estado de la factura",
                });
              }

              res.status(201).json({
                pago: {
                  id: pagoId,
                  factura_id: factura.id,
                  fecha: fechaPago,
                  monto: Number(monto),
                  metodo: metodo || null,
                  referencia: referencia || null,
                  nota: nota || null,
                },
                factura: {
                  id: factura.id,
                  cliente_id: factura.cliente_id,
                  cotizacion_id: factura.cotizacion_id,
                  numero: factura.numero,
                  titulo: factura.titulo,
                  descripcion: factura.descripcion,
                  subtotal: factura.subtotal,
                  impuestos: factura.impuestos,
                  total: factura.total,
                  estado: nuevoEstado,
                  fecha: factura.fecha,
                  vencimiento: factura.vencimiento,
                },
                total_pagado: totalPagado,
                saldo_pendiente: factura.total - totalPagado,
              });
            });

            stmtUpdate.finalize();
          }
        );
      }
    );

    stmtPago.finalize();
  });
});
app.delete("/api/facturas/:id/pagos/:pagoId", requiereRol("admin", "gerente"), (req, res) => {
  const { id, pagoId } = req.params;

  db.get("SELECT * FROM facturas WHERE id = ?", [id], (errFac, factura) => {
    if (errFac) {
      console.error("Error al buscar factura:", errFac);
      return res.status(500).json({ error: "Error al buscar factura" });
    }

    if (!factura) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }

    db.get(
      "SELECT * FROM pagos WHERE id = ? AND factura_id = ?",
      [pagoId, id],
      (errPago, pago) => {
        if (errPago) {
          console.error("Error al buscar pago:", errPago);
          return res.status(500).json({ error: "Error al buscar pago" });
        }

        if (!pago) {
          return res.status(404).json({ error: "Pago no encontrado" });
        }

        const stmtDelete = db.prepare(
          "DELETE FROM pagos WHERE id = ? AND factura_id = ?"
        );

        stmtDelete.run(pagoId, id, function (errDel) {
          if (errDel) {
            console.error("Error al eliminar pago:", errDel);
            return res.status(500).json({ error: "Error al eliminar pago" });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: "Pago no encontrado" });
          }

          db.get(
            "SELECT COALESCE(SUM(monto), 0) AS total_pagado FROM pagos WHERE factura_id = ?",
            [id],
            (errSum, rowSum) => {
              if (errSum) {
                console.error("Error al recalcular pagos:", errSum);
                return res.status(500).json({
                  error: "Pago eliminado, pero no se pudo recalcular la factura",
                });
              }

              const totalPagado = Number(rowSum?.total_pagado || 0);
              let nuevoEstado = "pendiente";

              if (totalPagado >= Number(factura.total)) {
                nuevoEstado = "pagada";
              } else if (totalPagado > 0 && totalPagado < Number(factura.total)) {
                nuevoEstado = "parcial";
              }

              const stmtUpdate = db.prepare(
                "UPDATE facturas SET estado = ? WHERE id = ?"
              );

              stmtUpdate.run(nuevoEstado, id, (errUpd) => {
                if (errUpd) {
                  console.error(
                    "Error al actualizar estado tras eliminar pago:",
                    errUpd
                  );
                  return res.status(200).json({
                    deleted: true,
                    pago_eliminado: Number(pagoId),
                    aviso:
                      "Pago eliminado, pero no se pudo actualizar el estado de la factura",
                  });
                }

                res.status(200).json({
                  deleted: true,
                  pago_eliminado: Number(pagoId),
                  factura: {
                    id: Number(id),
                    estado: nuevoEstado,
                    total: Number(factura.total),
                  },
                  total_pagado: totalPagado,
                  saldo_pendiente: Number(factura.total) - totalPagado,
                });
              });

              stmtUpdate.finalize();
            }
          );
        });

        stmtDelete.finalize();
      }
    );
  });
});

app.get("/api/facturas/:id/resumen-pagos", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM facturas WHERE id = ?", [id], (errFac, factura) => {
    if (errFac) {
      console.error("Error al buscar factura:", errFac);
      return res.status(500).json({ error: "Error al buscar factura" });
    }

    if (!factura) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }

    db.get(
      "SELECT COALESCE(SUM(monto), 0) AS total_pagado FROM pagos WHERE factura_id = ?",
      [id],
      (errSum, rowSum) => {
        if (errSum) {
          console.error("Error al sumar pagos:", errSum);
          return res
            .status(500)
            .json({ error: "Error al obtener resumen de pagos" });
        }

        const totalPagado = rowSum.total_pagado || 0;
        const saldoPendiente = factura.total - totalPagado;

        res.json({
          factura_id: factura.id,
          total_factura: factura.total,
          total_pagado: totalPagado,
          saldo_pendiente: saldoPendiente,
          estado: factura.estado,
        });
      }
    );
  });
});

// ---------- FINANZAS: RESÚMENES ----------

app.get("/api/finanzas/ingresos-mensuales", (req, res) => {
  const sql = `
    SELECT
      strftime('%Y-%m', fecha) AS periodo,
      SUM(total) AS ingresos
    FROM facturas
    WHERE estado = 'pagada'
      AND fecha IS NOT NULL
    GROUP BY strftime('%Y-%m', fecha)
    ORDER BY periodo DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Error al calcular ingresos mensuales:", err);
      return res
        .status(500)
        .json({ error: "Error al calcular ingresos mensuales" });
    }
    res.json(rows);
  });
});

app.get("/api/finanzas/balance-total", (req, res) => {
  const sqlFacturas = `
    SELECT COALESCE(SUM(CAST(total AS REAL)), 0) AS ingresosfacturas
    FROM facturas
    WHERE LOWER(COALESCE(estado, '')) = 'pagada'
  `;

  const sqlMovimientos = `
    SELECT
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(tipo, '')) = 'ingreso' THEN CAST(monto AS REAL) ELSE 0 END), 0) AS ingresos,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(tipo, '')) = 'gasto' THEN CAST(monto AS REAL) ELSE 0 END), 0) AS gastos
    FROM finanzas
  `;

  db.get(sqlFacturas, [], (errF, rowF) => {
    if (errF) {
      console.error("Error al sumar facturas pagadas:", errF);
      return res.status(500).json({ error: "Error al calcular ingresos por facturas" });
    }

    db.get(sqlMovimientos, [], (errM, rowM) => {
      if (errM) {
        console.error("Error al sumar movimientos financieros:", errM);
        return res.status(500).json({ error: "Error al calcular movimientos financieros" });
      }

      const ingresosFacturas = Number(rowF?.ingresosfacturas || 0);
      const ingresosManual = Number(rowM?.ingresos || 0);
      const gastosManual = Number(rowM?.gastos || 0);
      const balanceTotal = ingresosFacturas + ingresosManual - gastosManual;

      res.json({
        ingresosfacturas: ingresosFacturas,
        ingresosmanual: ingresosManual,
        gastosmanual: gastosManual,
        balancetotal: balanceTotal,
      });
    });
  });
});

// ---------- RESUMEN DE FACTURAS ABIERTAS ----------

app.get("/api/facturas/resumen-abiertas", (req, res) => {
  const sqlFacturas = `
    SELECT id, total, estado
    FROM facturas
    WHERE LOWER(estado) IN ('pendiente', 'parcial', 'vencida')
  `;

  db.all(sqlFacturas, [], (errFac, facturas) => {
    if (errFac) {
      console.error("Error al obtener facturas abiertas:", errFac);
      return res.status(500).json({ error: "Error al obtener facturas abiertas" });
    }

    if (!facturas || facturas.length === 0) {
      return res.json({
        pendientes: 0,
        parciales: 0,
        vencidas: 0,
        totalporcobrar: 0,
      });
    }

    const ids = facturas.map((f) => f.id);
    const placeholders = ids.map(() => "?").join(",");

    const sqlPagos = `
      SELECT factura_id, COALESCE(SUM(monto), 0) AS totalpagado
      FROM pagos
      WHERE factura_id IN (${placeholders})
      GROUP BY factura_id
    `;

    db.all(sqlPagos, ids, (errPag, pagos) => {
      if (errPag) {
        console.error("Error al obtener pagos para resumen abiertas:", errPag);
        return res.status(500).json({ error: "Error al obtener pagos de facturas abiertas" });
      }

      const pagosMap = new Map();
      pagos.forEach((p) => pagosMap.set(p.factura_id, Number(p.totalpagado || 0)));

      let pendientes = 0;
      let parciales = 0;
      let vencidas = 0;
      let totalPorCobrar = 0;

      facturas.forEach((f) => {
        const totalPagado = pagosMap.get(f.id) || 0;
        const saldo = Number(f.total || 0) - totalPagado;

        if (saldo > 0) totalPorCobrar += saldo;

        switch (String(f.estado || "").toLowerCase()) {
          case "pendiente":
            pendientes += 1;
            break;
          case "parcial":
            parciales += 1;
            break;
          case "vencida":
            vencidas += 1;
            break;
          default:
            break;
        }
      });

      res.json({
        pendientes,
        parciales,
        vencidas,
        totalporcobrar: totalPorCobrar,
      });
    });
  });
});

// ---------- CALENDARIO ----------

app.get("/api/calendario/eventos", (req, res) => {
  const { mes } = req.query;

  let sql = "SELECT * FROM calendario_eventos";
  let params = [];

  if (mes) {
    sql += " WHERE strftime('%Y-%m', fecha) = ?";
    params.push(mes);
  }

  sql += " ORDER BY fecha ASC, id ASC";

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("Error al obtener eventos de calendario:", err);
      return res
        .status(500)
        .json({ error: "Error al obtener eventos de calendario" });
    }

    const eventos = rows.map((item) => ({
      ...item,
      color:
        item.tipo === "seguimiento"
          ? "orange"
          : item.tipo === "factura"
          ? "red"
          : item.tipo === "pago"
          ? "emerald"
          : item.tipo === "proyecto"
          ? "green"
          : item.tipo === "entrega"
          ? "blue"
          : item.tipo === "reunion"
          ? "violet"
          : item.tipo === "tarea"
          ? "cyan"
          : "slate",
      etiqueta:
        item.tipo === "seguimiento"
          ? "Seguimiento"
          : item.tipo === "factura"
          ? "Factura"
          : item.tipo === "pago"
          ? "Pago"
          : item.tipo === "proyecto"
          ? "Proyecto"
          : item.tipo === "entrega"
          ? "Entrega"
          : item.tipo === "reunion"
          ? "Reunión"
          : item.tipo === "tarea"
          ? "Tarea"
          : "Evento",
    }));

    res.json(eventos);
  });
});

app.post("/api/calendario/eventos", (req, res) => {
  const { tipo, titulo, fecha, descripcion, referencia_id, modulo } = req.body;

  if (!tipo || !titulo || !fecha) {
    return res.status(400).json({
      error: "Tipo, título y fecha son obligatorios",
    });
  }

  const stmt = db.prepare(`
    INSERT INTO calendario_eventos (
      tipo,
      titulo,
      fecha,
      descripcion,
      referencia_id,
      modulo
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    tipo,
    titulo,
    fecha,
    descripcion || null,
    referencia_id || null,
    modulo || null,
    function (err) {
      if (err) {
        console.error("Error al crear evento de calendario:", err);
        return res
          .status(500)
          .json({ error: "Error al crear evento de calendario" });
      }

      res.status(201).json({
        id: this.lastID,
        tipo,
        titulo,
        fecha,
        descripcion,
        referencia_id,
        modulo,
        color:
          tipo === "seguimiento"
            ? "orange"
            : tipo === "factura"
            ? "red"
            : tipo === "pago"
            ? "emerald"
            : tipo === "proyecto"
            ? "green"
            : tipo === "entrega"
            ? "blue"
            : tipo === "reunion"
            ? "violet"
            : tipo === "tarea"
            ? "cyan"
            : "slate",
        etiqueta:
          tipo === "seguimiento"
            ? "Seguimiento"
            : tipo === "factura"
            ? "Factura"
            : tipo === "pago"
            ? "Pago"
            : tipo === "proyecto"
            ? "Proyecto"
            : tipo === "entrega"
            ? "Entrega"
            : tipo === "reunion"
            ? "Reunión"
            : tipo === "tarea"
            ? "Tarea"
            : "Evento",
      });
    }
  );

  stmt.finalize();
});

app.delete("/api/calendario/eventos/:id", requiereRol("admin", "gerente"), (req, res) => {
  const id = req.params.id;

  const stmt = db.prepare(
    "DELETE FROM calendario_eventos WHERE id = ?"
  );

  stmt.run(id, function (err) {
    if (err) {
      console.error("Error al eliminar evento de calendario:", err);
      return res
        .status(500)
        .json({ error: "Error al eliminar evento de calendario" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Evento no encontrado" });
    }

    res.status(204).send();
  });

  stmt.finalize();
});



// ---------- NOTIFICACIONES (AUTOMATIZACIONES INTERNAS) ----------

function ejecutarReglaNotificacion(sql, tipo, construirNotificacion) {
  return new Promise((resolve) => {
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error(`Error evaluando regla de notificación "${tipo}":`, err);
        return resolve();
      }

      if (!rows || rows.length === 0) {
        return resolve();
      }

      const stmt = db.prepare(`
        INSERT OR IGNORE INTO notificaciones (
          tipo, titulo, mensaje, modulo, referencia_id
        ) VALUES (?, ?, ?, ?, ?)
      `);

      rows.forEach((row) => {
        const { titulo, mensaje, modulo, referenciaId } = construirNotificacion(row);
        stmt.run(tipo, titulo, mensaje, modulo, referenciaId);
      });

      stmt.finalize(resolve);
    });
  });
}

function generarNotificacionesAutomaticas() {
  const reglas = [
    ejecutarReglaNotificacion(
      `SELECT id, numero, titulo, vencimiento FROM facturas
       WHERE vencimiento IS NOT NULL
         AND estado NOT IN ('pagada', 'cancelada')
         AND date(vencimiento) < date('now')`,
      "factura_vencida",
      (f) => ({
        titulo: `Factura ${f.numero || `#${f.id}`} vencida`,
        mensaje: `"${f.titulo}" venció el ${f.vencimiento} y sigue sin pagarse.`,
        modulo: "factura",
        referenciaId: f.id,
      })
    ),
    ejecutarReglaNotificacion(
      `SELECT id, numero, titulo, vencimiento FROM facturas
       WHERE vencimiento IS NOT NULL
         AND estado NOT IN ('pagada', 'cancelada')
         AND date(vencimiento) >= date('now')
         AND date(vencimiento) <= date('now', '+3 days')`,
      "factura_proxima",
      (f) => ({
        titulo: `Factura ${f.numero || `#${f.id}`} vence pronto`,
        mensaje: `"${f.titulo}" vence el ${f.vencimiento}.`,
        modulo: "factura",
        referenciaId: f.id,
      })
    ),
    ejecutarReglaNotificacion(
      `SELECT id, titulo, fecha_limite, cliente FROM seguimientos
       WHERE fecha_limite IS NOT NULL
         AND estado NOT IN ('completado', 'cancelado')
         AND date(fecha_limite) < date('now')`,
      "seguimiento_vencido",
      (s) => ({
        titulo: `Seguimiento vencido: ${s.titulo}`,
        mensaje: s.cliente
          ? `Seguimiento con ${s.cliente} venció el ${s.fecha_limite}.`
          : `Este seguimiento venció el ${s.fecha_limite}.`,
        modulo: "seguimiento",
        referenciaId: s.id,
      })
    ),
    ejecutarReglaNotificacion(
      `SELECT id, titulo, vigencia FROM cotizaciones
       WHERE vigencia IS NOT NULL
         AND estado = 'enviada'
         AND date(vigencia) < date('now')`,
      "cotizacion_vencida",
      (c) => ({
        titulo: `Cotización vencida sin respuesta: ${c.titulo}`,
        mensaje: `La vigencia de esta cotización venció el ${c.vigencia} y sigue "enviada".`,
        modulo: "cotizacion",
        referenciaId: c.id,
      })
    ),
    ejecutarReglaNotificacion(
      `SELECT id, titulo, fecha_limite FROM tareas
       WHERE fecha_limite IS NOT NULL
         AND estado != 'completado'
         AND date(fecha_limite) < date('now')`,
      "tarea_vencida",
      (t) => ({
        titulo: `Tarea vencida: ${t.titulo}`,
        mensaje: `Esta tarea venció el ${t.fecha_limite}.`,
        modulo: "tarea",
        referenciaId: t.id,
      })
    ),
  ];

  return Promise.all(reglas);
}

app.get("/api/notificaciones", (req, res) => {
  const { leida } = req.query;

  generarNotificacionesAutomaticas().then(() => {
    let sql = "SELECT * FROM notificaciones";
    const params = [];

    if (leida === "0" || leida === "1") {
      sql += " WHERE leida = ?";
      params.push(Number(leida));
    }

    sql += " ORDER BY fecha_creacion DESC, id DESC LIMIT 100";

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error("Error al obtener notificaciones:", err);
        return res
          .status(500)
          .json({ error: "Error al obtener notificaciones" });
      }
      res.json(rows);
    });
  });
});

app.get("/api/notificaciones/resumen", (req, res) => {
  generarNotificacionesAutomaticas().then(() => {
    db.get(
      "SELECT COUNT(*) AS no_leidas FROM notificaciones WHERE leida = 0",
      [],
      (err, row) => {
        if (err) {
          console.error("Error al obtener resumen de notificaciones:", err);
          return res
            .status(500)
            .json({ error: "Error al obtener resumen de notificaciones" });
        }
        res.json({ no_leidas: Number(row?.no_leidas || 0) });
      }
    );
  });
});

app.put("/api/notificaciones/:id/leida", (req, res) => {
  const { id } = req.params;
  const leida = req.body?.leida === false ? 0 : 1;

  const stmt = db.prepare("UPDATE notificaciones SET leida = ? WHERE id = ?");

  stmt.run(leida, id, function (err) {
    if (err) {
      console.error("Error al actualizar notificación:", err);
      return res
        .status(500)
        .json({ error: "Error al actualizar notificación" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    res.status(200).json({ id: Number(id), leida });
  });

  stmt.finalize();
});

app.put("/api/notificaciones/marcar-todas", (req, res) => {
  const stmt = db.prepare("UPDATE notificaciones SET leida = 1 WHERE leida = 0");

  stmt.run(function (err) {
    if (err) {
      console.error("Error al marcar todas las notificaciones:", err);
      return res
        .status(500)
        .json({ error: "Error al marcar todas las notificaciones" });
    }

    res.status(200).json({ actualizadas: this.changes });
  });

  stmt.finalize();
});

app.delete("/api/notificaciones/leidas", (req, res) => {
  const stmt = db.prepare("DELETE FROM notificaciones WHERE leida = 1");

  stmt.run(function (err) {
    if (err) {
      console.error("Error al limpiar notificaciones leídas:", err);
      return res
        .status(500)
        .json({ error: "Error al limpiar notificaciones leídas" });
    }

    res.status(200).json({ eliminadas: this.changes });
  });

  stmt.finalize();
});

app.delete("/api/notificaciones/:id", (req, res) => {
  const { id } = req.params;

  const stmt = db.prepare("DELETE FROM notificaciones WHERE id = ?");

  stmt.run(id, function (err) {
    if (err) {
      console.error("Error al eliminar notificación:", err);
      return res
        .status(500)
        .json({ error: "Error al eliminar notificación" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    res.status(204).send();
  });

  stmt.finalize();
});

// ---------- ANALÍTICA ----------

async function calcularResumenGeneral() {
  const [clientesTotal, clientesNuevos, leadsRow, oppRow, facturasRow] =
    await Promise.all([
      dbGet("SELECT COUNT(*) AS total FROM clientes"),
      dbGet(
        `SELECT COUNT(*) AS nuevos FROM clientes
         WHERE fecha_creacion IS NOT NULL
           AND strftime('%Y-%m', fecha_creacion) = strftime('%Y-%m', 'now')`
      ),
      dbGet(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN estado = 'convertido' THEN 1 ELSE 0 END) AS convertidos
         FROM leads`
      ),
      dbGet(
        `SELECT
           SUM(CASE WHEN etapa = 'ganado' THEN 1 ELSE 0 END) AS ganadas,
           SUM(CASE WHEN etapa = 'perdido' THEN 1 ELSE 0 END) AS perdidas,
           COUNT(*) AS total
         FROM oportunidades`
      ),
      dbGet(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN estado = 'pagada' THEN 1 ELSE 0 END) AS pagadas,
           AVG(CASE WHEN estado = 'pagada' THEN total ELSE NULL END) AS ticket_promedio
         FROM facturas
         WHERE estado != 'cancelada'`
      ),
    ]);

  const leadsTotal = Number(leadsRow?.total || 0);
  const leadsConvertidos = Number(leadsRow?.convertidos || 0);
  const oppGanadas = Number(oppRow?.ganadas || 0);
  const oppPerdidas = Number(oppRow?.perdidas || 0);
  const oppCerradas = oppGanadas + oppPerdidas;
  const facturasTotal = Number(facturasRow?.total || 0);
  const facturasPagadas = Number(facturasRow?.pagadas || 0);

  return {
    clientes_total: Number(clientesTotal?.total || 0),
    clientes_nuevos_mes: Number(clientesNuevos?.nuevos || 0),
    leads_total: leadsTotal,
    leads_convertidos: leadsConvertidos,
    leads_tasa_conversion:
      leadsTotal > 0 ? (leadsConvertidos / leadsTotal) * 100 : 0,
    oportunidades_ganadas: oppGanadas,
    oportunidades_perdidas: oppPerdidas,
    oportunidades_total: Number(oppRow?.total || 0),
    oportunidades_tasa_cierre:
      oppCerradas > 0 ? (oppGanadas / oppCerradas) * 100 : 0,
    facturas_total: facturasTotal,
    facturas_pagadas: facturasPagadas,
    facturas_tasa_cobro:
      facturasTotal > 0 ? (facturasPagadas / facturasTotal) * 100 : 0,
    ticket_promedio: Number(facturasRow?.ticket_promedio || 0),
  };
}

app.get("/api/analitica/resumen-general", async (req, res) => {
  try {
    const resumen = await calcularResumenGeneral();
    res.json(resumen);
  } catch (err) {
    console.error("Error al calcular resumen general de analítica:", err);
    res
      .status(500)
      .json({ error: "Error al calcular resumen general de analítica" });
  }
});

app.get("/api/analitica/clientes-por-mes", async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT strftime('%Y-%m', fecha_creacion) AS periodo, COUNT(*) AS nuevos
       FROM clientes
       WHERE fecha_creacion IS NOT NULL
       GROUP BY periodo
       ORDER BY periodo DESC
       LIMIT 12`
    );

    res.json(rows.reverse());
  } catch (err) {
    console.error("Error al calcular clientes por mes:", err);
    res.status(500).json({ error: "Error al calcular clientes por mes" });
  }
});

app.get("/api/analitica/clientes-por-estado", async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT COALESCE(NULLIF(estado_cliente, ''), 'activo') AS estado, COUNT(*) AS cantidad
       FROM clientes
       GROUP BY estado`
    );

    res.json(rows);
  } catch (err) {
    console.error("Error al calcular clientes por estado:", err);
    res.status(500).json({ error: "Error al calcular clientes por estado" });
  }
});

app.get("/api/analitica/pipeline-conversion", async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT etapa, COUNT(*) AS cantidad, COALESCE(SUM(monto), 0) AS monto
       FROM oportunidades
       GROUP BY etapa`
    );

    res.json(rows);
  } catch (err) {
    console.error("Error al calcular conversión de pipeline:", err);
    res
      .status(500)
      .json({ error: "Error al calcular conversión de pipeline" });
  }
});

app.get("/api/analitica/top-clientes", async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT c.id, c.nombre, COALESCE(SUM(f.total), 0) AS total_facturado
       FROM clientes c
       JOIN facturas f ON f.cliente_id = c.id AND f.estado = 'pagada'
       GROUP BY c.id
       ORDER BY total_facturado DESC
       LIMIT 5`
    );

    res.json(rows);
  } catch (err) {
    console.error("Error al calcular top de clientes:", err);
    res.status(500).json({ error: "Error al calcular top de clientes" });
  }
});

app.get("/api/analitica/gastos-por-categoria", async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT COALESCE(NULLIF(categoria, ''), 'Sin categoría') AS categoria,
              COALESCE(SUM(monto), 0) AS total
       FROM finanzas
       WHERE tipo = 'gasto'
       GROUP BY categoria
       ORDER BY total DESC
       LIMIT 8`
    );

    res.json(rows);
  } catch (err) {
    console.error("Error al calcular gastos por categoría:", err);
    res
      .status(500)
      .json({ error: "Error al calcular gastos por categoría" });
  }
});

// ---------- IA: ENDPOINTS ----------

app.use("/api/ia", (req, res, next) => {
  if (process.env.APP_ENV === "academico" || process.env.DESHABILITAR_IA === "true") {
    return res.status(503).json({
      error: "Función de IA deshabilitada en el prototipo académico XclusiveSetup.",
      deshabilitado: true,
    });
  }
  next();
});

const IA_RATE_LIMIT_MAX = 20;
const IA_RATE_LIMIT_VENTANA_MS = 60 * 60 * 1000;
const iaSolicitudesPorUsuario = new Map();

function limitarUsoIA(req, res, next) {
  if (process.env.APP_ENV === "academico" || process.env.DESHABILITAR_IA === "true") {
    return res.status(503).json({
      error: "Función de IA deshabilitada en el prototipo académico XclusiveSetup.",
      deshabilitado: true,
    });
  }

  const usuarioId = req.usuario?.id;
  const ahora = Date.now();

  const historial = (iaSolicitudesPorUsuario.get(usuarioId) || []).filter(
    (marcaTiempo) => ahora - marcaTiempo < IA_RATE_LIMIT_VENTANA_MS
  );

  if (historial.length >= IA_RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: `Has alcanzado el límite de ${IA_RATE_LIMIT_MAX} solicitudes de IA por hora. Intenta de nuevo más tarde.`,
    });
  }

  historial.push(ahora);
  iaSolicitudesPorUsuario.set(usuarioId, historial);
  next();
}

app.post("/api/ia/resumen-cliente/:id", limitarUsoIA, async (req, res) => {
  const { id } = req.params;

  try {
    const cliente = await dbGet("SELECT * FROM clientes WHERE id = ?", [id]);

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const [historial, seguimientos, oportunidades, facturas] = await Promise.all([
      dbAll(
        `SELECT tipo, titulo, descripcion, fecha FROM cliente_historial
         WHERE cliente_id = ? ORDER BY fecha DESC LIMIT 8`,
        [id]
      ),
      dbAll(
        `SELECT titulo, estado, prioridad, fecha_limite FROM seguimientos
         WHERE cliente_id = ? ORDER BY id DESC LIMIT 8`,
        [id]
      ),
      dbAll(
        `SELECT titulo, etapa, monto FROM oportunidades
         WHERE cliente_id = ? ORDER BY id DESC LIMIT 8`,
        [id]
      ),
      dbAll(
        `SELECT numero, total, estado, vencimiento FROM facturas
         WHERE cliente_id = ? ORDER BY id DESC LIMIT 8`,
        [id]
      ),
    ]);

    const contexto = `
Cliente: ${cliente.nombre}${cliente.empresa ? ` (${cliente.empresa})` : ""}
Estado: ${cliente.estado_cliente || "activo"}
Último contacto: ${cliente.ultimo_contacto || "sin registro"}
Notas del cliente: ${cliente.notas || "sin notas"}

Historial reciente:
${
  historial.map((h) => `- [${h.tipo}] ${h.titulo}: ${h.descripcion || ""} (${h.fecha})`).join("\n") ||
  "Sin historial registrado."
}

Seguimientos:
${
  seguimientos
    .map((s) => `- ${s.titulo} (${s.estado}, prioridad ${s.prioridad}, vence ${s.fecha_limite || "sin fecha"})`)
    .join("\n") || "Sin seguimientos registrados."
}

Oportunidades:
${
  oportunidades.map((o) => `- ${o.titulo} (${o.etapa}, $${o.monto || 0})`).join("\n") ||
  "Sin oportunidades registradas."
}

Facturas:
${
  facturas
    .map((f) => `- ${f.numero || ""} total $${f.total} estado ${f.estado} vence ${f.vencimiento || "sin fecha"}`)
    .join("\n") || "Sin facturas registradas."
}
`.trim();

    const respuesta = await llamarIA([
      {
        role: "system",
        content:
          "Eres un asistente de un CRM para freelancers y pequeñas agencias. Con la información del cliente que te dan, escribe un resumen breve (4 a 6 líneas), profesional, en español, y termina con una línea que empiece exactamente con 'Siguiente paso recomendado:' seguida de una acción concreta.",
      },
      { role: "user", content: contexto },
    ]);

    res.json({ resumen: respuesta });
  } catch (err) {
    manejarErrorIA(err, res);
  }
});

app.post("/api/ia/redactar-correo", limitarUsoIA, async (req, res) => {
  const { cliente_id, tipo, instrucciones } = req.body;

  if (!cliente_id || !tipo) {
    return res.status(400).json({ error: "cliente_id y tipo son obligatorios" });
  }

  try {
    const cliente = await dbGet("SELECT * FROM clientes WHERE id = ?", [cliente_id]);

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    let contextoExtra = "";

    if (tipo === "recordatorio_pago") {
      const facturas = await dbAll(
        `SELECT numero, total, vencimiento FROM facturas
         WHERE cliente_id = ? AND estado NOT IN ('pagada', 'cancelada')
         ORDER BY vencimiento ASC`,
        [cliente_id]
      );
      contextoExtra = facturas.length
        ? `Facturas pendientes:\n${facturas
            .map((f) => `- ${f.numero || ""}: $${f.total}, vence ${f.vencimiento || "sin fecha"}`)
            .join("\n")}`
        : "No hay facturas pendientes registradas para este cliente.";
    } else if (tipo === "seguimiento") {
      const ultimo = await dbGet(
        `SELECT titulo, descripcion, fecha_limite FROM seguimientos
         WHERE cliente_id = ? ORDER BY id DESC LIMIT 1`,
        [cliente_id]
      );
      contextoExtra = ultimo
        ? `Último seguimiento registrado: "${ultimo.titulo}" - ${ultimo.descripcion || "sin detalle"}`
        : "Sin seguimientos previos registrados.";
    }

    const tiposLabels = {
      seguimiento: "seguimiento comercial",
      recordatorio_pago: "recordatorio de pago de una factura",
      propuesta: "envío de una propuesta comercial",
      agradecimiento: "agradecimiento por la confianza",
      personalizado: "mensaje personalizado",
    };

    const contexto = `
Cliente: ${cliente.nombre}${cliente.empresa ? ` (${cliente.empresa})` : ""}
Tipo de correo solicitado: ${tiposLabels[tipo] || tipo}
${contextoExtra}
${instrucciones ? `Instrucciones adicionales de quien lo pide: ${instrucciones}` : ""}
`.trim();

    const respuesta = await llamarIA([
      {
        role: "system",
        content:
          "Eres un asistente que redacta correos comerciales cortos y profesionales en español, para una empresa de servicios (freelancers/agencias). Responde ÚNICAMENTE en este formato exacto, sin texto adicional antes o después:\nASUNTO: <asunto del correo>\nCUERPO:\n<cuerpo del correo, con saludo y despedida>",
      },
      { role: "user", content: contexto },
    ]);

    const matchAsunto = respuesta.match(/ASUNTO:\s*(.+)/i);
    const matchCuerpo = respuesta.match(/CUERPO:\s*([\s\S]*)/i);

    res.json({
      asunto: matchAsunto ? matchAsunto[1].trim() : "",
      cuerpo: matchCuerpo ? matchCuerpo[1].trim() : respuesta,
    });
  } catch (err) {
    manejarErrorIA(err, res);
  }
});

app.get("/api/ia/sugerencias-seguimiento", limitarUsoIA, async (req, res) => {
  try {
    const [clientesSinContacto, seguimientosVencidos, oportunidadesAbiertas, facturasVencidas] =
      await Promise.all([
        dbAll(
          `SELECT nombre, empresa, ultimo_contacto FROM clientes
           WHERE estado_cliente = 'activo'
             AND (ultimo_contacto IS NULL OR date(ultimo_contacto) < date('now', '-30 days'))
           LIMIT 10`
        ),
        dbAll(
          `SELECT titulo, cliente, fecha_limite FROM seguimientos
           WHERE estado NOT IN ('completado', 'cancelado')
             AND fecha_limite IS NOT NULL
             AND date(fecha_limite) < date('now')
           LIMIT 10`
        ),
        dbAll(
          `SELECT titulo, etapa, monto FROM oportunidades
           WHERE etapa NOT IN ('ganado', 'perdido')
           LIMIT 10`
        ),
        dbAll(
          `SELECT numero, total, vencimiento FROM facturas
           WHERE estado NOT IN ('pagada', 'cancelada') AND date(vencimiento) < date('now')
           LIMIT 10`
        ),
      ]);

    if (
      clientesSinContacto.length === 0 &&
      seguimientosVencidos.length === 0 &&
      oportunidadesAbiertas.length === 0 &&
      facturasVencidas.length === 0
    ) {
      return res.json({
        sugerencias:
          "No hay nada urgente pendiente por ahora. El equipo está al día con clientes, seguimientos y facturas.",
      });
    }

    const contexto = `
Clientes activos sin contacto en más de 30 días:
${
  clientesSinContacto
    .map((c) => `- ${c.nombre}${c.empresa ? ` (${c.empresa})` : ""}, último contacto: ${c.ultimo_contacto || "nunca"}`)
    .join("\n") || "Ninguno."
}

Seguimientos vencidos:
${
  seguimientosVencidos
    .map((s) => `- ${s.titulo} (cliente: ${s.cliente || "sin cliente"}), venció el ${s.fecha_limite}`)
    .join("\n") || "Ninguno."
}

Oportunidades abiertas en el pipeline:
${
  oportunidadesAbiertas.map((o) => `- ${o.titulo} (${o.etapa}, $${o.monto || 0})`).join("\n") || "Ninguna."
}

Facturas vencidas sin pagar:
${
  facturasVencidas.map((f) => `- ${f.numero || ""}: $${f.total}, venció el ${f.vencimiento}`).join("\n") ||
  "Ninguna."
}
`.trim();

    const respuesta = await llamarIA([
      {
        role: "system",
        content:
          "Eres un asistente de ventas y cobranza para un CRM de freelancers/agencias. Con los datos que te dan, entrega una lista priorizada (máximo 6 puntos, numerada del 1 al 6) de las acciones más importantes que el equipo debería hacer hoy. Sé breve, concreto y en español.",
      },
      { role: "user", content: contexto },
    ]);

    res.json({ sugerencias: respuesta });
  } catch (err) {
    manejarErrorIA(err, res);
  }
});

app.get("/api/ia/prediccion-financiera", limitarUsoIA, async (req, res) => {
  try {
    const [ingresosMensuales, gastosMensuales] = await Promise.all([
      dbAll(
        `SELECT strftime('%Y-%m', fecha) AS periodo, SUM(total) AS ingresos
         FROM facturas WHERE estado = 'pagada' AND fecha IS NOT NULL
         GROUP BY periodo ORDER BY periodo DESC LIMIT 6`
      ),
      dbAll(
        `SELECT strftime('%Y-%m', fecha) AS periodo, SUM(monto) AS gastos
         FROM finanzas WHERE tipo = 'gasto' AND fecha IS NOT NULL
         GROUP BY periodo ORDER BY periodo DESC LIMIT 6`
      ),
    ]);

    if (ingresosMensuales.length === 0 && gastosMensuales.length === 0) {
      return res.json({
        prediccion:
          "Aún no hay suficiente historial de facturas pagadas o gastos registrados para generar una predicción confiable.",
      });
    }

    const contexto = `
Ingresos mensuales recientes (de más reciente a más antiguo):
${ingresosMensuales.map((r) => `- ${r.periodo}: $${r.ingresos}`).join("\n") || "Sin datos."}

Gastos mensuales recientes (de más reciente a más antiguo):
${gastosMensuales.map((r) => `- ${r.periodo}: $${r.gastos}`).join("\n") || "Sin datos."}
`.trim();

    const respuesta = await llamarIA([
      {
        role: "system",
        content:
          "Eres un analista financiero para un pequeño negocio de servicios. Con el historial de ingresos y gastos mensuales que te dan, escribe un análisis breve (máximo 6 líneas) de la tendencia y una proyección aproximada para el próximo mes. Termina con una línea aclarando que es una estimación basada en pocos datos y no es asesoría financiera formal. Responde en español.",
      },
      { role: "user", content: contexto },
    ]);

    res.json({ prediccion: respuesta });
  } catch (err) {
    manejarErrorIA(err, res);
  }
});

app.post("/api/ia/chat", limitarUsoIA, async (req, res) => {
  const { mensaje, historial } = req.body;

  if (!mensaje || !String(mensaje).trim()) {
    return res.status(400).json({ error: "El mensaje es obligatorio" });
  }

  const historialLimitado = Array.isArray(historial) ? historial.slice(-10) : [];

  try {
    const resumen = await calcularResumenGeneral();

    const contextoNegocio = `
Contexto actual del negocio (usa esto solo como referencia, no lo repitas textualmente salvo que te pregunten por estos datos):
- Clientes totales: ${resumen.clientes_total} (nuevos este mes: ${resumen.clientes_nuevos_mes})
- Clientes potenciales: ${resumen.leads_total} totales, ${resumen.leads_convertidos} convertidos (${resumen.leads_tasa_conversion.toFixed(1)}%)
- Oportunidades: ${resumen.oportunidades_total} totales, ${resumen.oportunidades_ganadas} ganadas, ${resumen.oportunidades_perdidas} perdidas (tasa de cierre ${resumen.oportunidades_tasa_cierre.toFixed(1)}%)
- Facturas: ${resumen.facturas_total} totales, ${resumen.facturas_pagadas} pagadas (tasa de cobro ${resumen.facturas_tasa_cobro.toFixed(1)}%), ticket promedio $${resumen.ticket_promedio.toFixed(0)}
`.trim();

    const mensajes = [
      {
        role: "system",
        content: `Eres el Asistente de Negocio de XclusiveSetup CRM: un asesor ejecutivo integrado en la plataforma, no un chatbot genérico. Tu usuario es el dueño del negocio, un gerente o un vendedor que necesita decisiones rápidas, no explicaciones largas.

Cómo respondes:
- Siempre en español, tono profesional, claro y directo. Sin relleno, sin frases de cortesía innecesarias, sin sonar a chatbot genérico.
- Usa el lenguaje del CRM tal como lo usa el usuario: "clientes potenciales" (nunca "leads"), "oportunidades" (nunca "pipeline"), "clientes", "ventas", "cotizaciones", "facturas", "tareas", "seguimientos", "proyectos", "finanzas".
- Basa tus respuestas SOLO en el contexto de negocio que se te entrega abajo y en lo que el usuario te escriba. Nunca inventes cifras, nombres de clientes, montos o fechas que no estén ahí.
- Si te preguntan algo que no puedes saber con los datos disponibles, dilo con honestidad y sugiere en qué módulo del CRM puede verificarlo (por ejemplo: "no tengo el detalle de esa factura, revísalo en el módulo de Facturas").
- Prioriza respuestas accionables: cuando el contexto muestre un riesgo o una oportunidad (facturas vencidas, baja tasa de conversión, seguimientos atrasados), señálalo y sugiere la siguiente acción concreta.
- Sé breve: 2 a 5 líneas por respuesta, salvo que el usuario pida explícitamente un análisis más detallado.
- No des asesoría legal, fiscal o contable definitiva; para eso remite a un profesional.

${contextoNegocio}`,
      },
      ...historialLimitado
        .filter((m) => m && (m.rol === "usuario" || m.rol === "asistente") && m.contenido)
        .map((m) => ({
          role: m.rol === "usuario" ? "user" : "assistant",
          content: String(m.contenido),
        })),
      { role: "user", content: String(mensaje) },
    ];

    const respuesta = await llamarIA(mensajes, { maxTokens: 500 });

    res.json({ respuesta });
  } catch (err) {
    manejarErrorIA(err, res);
  }
});

// ---------- ARRANQUE DEL SERVIDOR ----------

app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});