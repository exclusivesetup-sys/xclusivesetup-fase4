import "./env.js";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFileName =
  process.env.DB_FILE ||
  (process.env.APP_ENV === "academico"
    ? "database.academico.db"
    : "database.db");

const dbPath = path.isAbsolute(dbFileName)
  ? dbFileName
  : path.join(__dirname, dbFileName);

console.log(`[Seed Académico] Conectando a base de datos: ${dbPath}`);

const db = new sqlite3.Database(dbPath);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function inicializarEsquemaSiNoExiste() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'empleado',
      activo INTEGER NOT NULL DEFAULT 1,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      totp_secret TEXT,
      totp_habilitado INTEGER NOT NULL DEFAULT 0,
      intentos_fallidos INTEGER NOT NULL DEFAULT 0,
      bloqueado_hasta TEXT,
      debe_cambiar_password INTEGER NOT NULL DEFAULT 0
    )
  `);

  await dbRun(`
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

  await dbRun(`
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

  await dbRun(`
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
      cotizacion_id INTEGER,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id)
    )
  `);

  await dbRun(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_proyectos_cotizacion_id ON proyectos(cotizacion_id) WHERE cotizacion_id IS NOT NULL;
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS tareas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proyecto_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      prioridad TEXT NOT NULL DEFAULT 'media',
      responsable TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      fecha_inicio TEXT,
      fecha_limite TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
    )
  `);

  await dbRun(`
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
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS cliente_etiquetas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      color TEXT,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS cliente_notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      contenido TEXT NOT NULL,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  await dbRun(`
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

  await dbRun(`
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

  await dbRun(`
    CREATE TABLE IF NOT EXISTS calendario_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      fecha TEXT NOT NULL,
      descripcion TEXT,
      referencia_id INTEGER,
      modulo TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now'))
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS notificaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      mensaje TEXT,
      modulo TEXT,
      referencia_id INTEGER,
      leida INTEGER NOT NULL DEFAULT 0,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      UNIQUE (tipo, modulo, referencia_id)
    )
  `);

  // Tablas auxiliares existentes para compatibilidad total
  await dbRun(`
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

  await dbRun(`
    CREATE TABLE IF NOT EXISTS pipeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      orden INTEGER NOT NULL,
      color TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS oportunidades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      titulo TEXT NOT NULL,
      valor REAL DEFAULT 0,
      etapa TEXT NOT NULL DEFAULT 'nuevo',
      probabilidad INTEGER DEFAULT 50,
      fecha_cierre TEXT,
      notas TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      titulo TEXT NOT NULL,
      monto REAL NOT NULL,
      estado TEXT NOT NULL DEFAULT 'completada',
      fecha TEXT DEFAULT (date('now')),
      notas TEXT,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS seguimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      cliente TEXT,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      tipo TEXT NOT NULL DEFAULT 'llamada',
      estado TEXT NOT NULL DEFAULT 'pendiente',
      fecha_limite TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS finanzas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      categoria TEXT NOT NULL,
      concepto TEXT NOT NULL,
      monto REAL NOT NULL,
      fecha TEXT DEFAULT (date('now')),
      comprobante TEXT,
      notas TEXT,
      proveedor TEXT
    )
  `);

  await dbRun(`
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

  await dbRun(`
    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id INTEGER NOT NULL,
      fecha TEXT,
      monto REAL NOT NULL,
      metodo TEXT,
      referencia TEXT,
      notas TEXT,
      FOREIGN KEY (factura_id) REFERENCES facturas(id)
    )
  `);
}

async function sembrarDatos() {
  await inicializarEsquemaSiNoExiste();

  console.log("[Seed Académico] Verificando usuario administrador demo...");
  const adminEmail =
    process.env.DEMO_ADMIN_EMAIL || "demo@example.com";
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("DEMO_ADMIN_PASSWORD debe estar definida en .env.academico");
  }

  const usuarioExiste = await dbGet(
    "SELECT id, rol FROM usuarios WHERE email = ? OR rol = 'admin' LIMIT 1",
    [adminEmail]
  );

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  if (!usuarioExiste) {
    await dbRun(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo, debe_cambiar_password)
       VALUES (?, ?, ?, 'admin', 1, 0)`,
      ["Administrador Académico Demo", adminEmail, passwordHash]
    );
    console.log(`[Seed Académico] Usuario demo creado: ${adminEmail}`);
  } else {
    await dbRun(
      `UPDATE usuarios SET email = ?, password_hash = ?, debe_cambiar_password = 0, activo = 1 WHERE id = ?`,
      [adminEmail, passwordHash, usuarioExiste.id]
    );
    console.log(`[Seed Académico] Usuario demo existente (ID ${usuarioExiste.id}) actualizado a: ${adminEmail}`);
  }

  // Clientes ficticios
  console.log("[Seed Académico] Sembrando clientes ficticios...");
  const clientesFicticios = [
    {
      nombre: "Academia Digital Innova",
      empresa: "Innova Educación SAS",
      email: "contacto@innova.ejemplo.com",
      telefono: "+57 300 111 2233",
      direccion: "Calle 100 #15-20",
      ciudad: "Bogotá",
      pais: "Colombia",
      estado_cliente: "activo",
      notas: "Cliente institucional para proyectos de tecnología educativa.",
    },
    {
      nombre: "TechCore Soluciones",
      empresa: "TechCore Global Ltda.",
      email: "soporte@techcore.ejemplo.com",
      telefono: "+57 311 444 5566",
      direccion: "Carrera 43A #1-50",
      ciudad: "Medellín",
      pais: "Colombia",
      estado_cliente: "activo",
      notas: "Empresa de desarrollo de software para el sector salud.",
    },
    {
      nombre: "Consultores Andes Demo",
      empresa: "Andes Consulting Group",
      email: "info@andesdemo.ejemplo.com",
      telefono: "+57 315 777 8899",
      direccion: "Avenida 6N #22-04",
      ciudad: "Cali",
      pais: "Colombia",
      estado_cliente: "activo",
      notas: "Firma de consultoría en transformación digital.",
    },
    {
      nombre: "Plataforma EduPlus",
      empresa: "EduPlus Latam",
      email: "ventas@eduplus.ejemplo.com",
      telefono: "+57 320 222 3344",
      direccion: "Calle 72 #54-12",
      ciudad: "Barranquilla",
      pais: "Colombia",
      estado_cliente: "activo",
      notas: "Startup de cursos virtuales en crecimiento.",
    },
  ];

  const mapaClientes = new Map();

  for (const c of clientesFicticios) {
    let row = await dbGet("SELECT id FROM clientes WHERE email = ?", [c.email]);
    if (!row) {
      const res = await dbRun(
        `INSERT INTO clientes (nombre, empresa, email, telefono, direccion, ciudad, pais, estado_cliente, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.nombre,
          c.empresa,
          c.email,
          c.telefono,
          c.direccion,
          c.ciudad,
          c.pais,
          c.estado_cliente,
          c.notas,
        ]
      );
      mapaClientes.set(c.email, res.lastID);
      console.log(`  + Cliente creado: ${c.nombre} (#${res.lastID})`);
    } else {
      mapaClientes.set(c.email, row.id);
      console.log(`  = Cliente existente: ${c.nombre} (#${row.id})`);
    }
  }

  // Cotizaciones ficticias
  console.log("[Seed Académico] Sembrando cotizaciones ficticias...");
  const cotizacionesFicticias = [
    {
      cliente_email: "contacto@innova.ejemplo.com",
      titulo: "Cotización Plataforma Académica Web",
      descripcion: "Diseño y despliegue del portal académico con gestión de usuarios.",
      subtotal: 4500000,
      impuestos: 855000,
      total: 5355000,
      estado: "aceptada",
      fecha: "2026-10-05",
      vigencia: "2026-11-30",
    },
    {
      cliente_email: "soporte@techcore.ejemplo.com",
      titulo: "Cotización Módulo de Reportes y Analítica",
      descripcion: "Desarrollo de tablero gerencial con métricas y visualización.",
      subtotal: 2800000,
      impuestos: 532000,
      total: 3332000,
      estado: "enviada",
      fecha: "2026-10-08",
      vigencia: "2026-11-15",
    },
    {
      cliente_email: "info@andesdemo.ejemplo.com",
      titulo: "Cotización Soporte Técnico y Mantenimiento",
      descripcion: "Póliza mensual de soporte correctivo y preventivo.",
      subtotal: 1500000,
      impuestos: 285000,
      total: 1785000,
      estado: "borrador",
      fecha: "2026-10-10",
      vigencia: "2026-11-20",
    },
    {
      cliente_email: "ventas@eduplus.ejemplo.com",
      titulo: "Cotización Actualización de Infraestructura",
      descripcion: "Migración de servidores y configuración de entorno en la nube.",
      subtotal: 3200000,
      impuestos: 608000,
      total: 3808000,
      estado: "rechazada",
      fecha: "2026-09-20",
      vigencia: "2026-10-20",
    },
  ];

  for (const cot of cotizacionesFicticias) {
    const clienteId = mapaClientes.get(cot.cliente_email);
    const row = await dbGet(
      "SELECT id FROM cotizaciones WHERE titulo = ? AND cliente_id = ?",
      [cot.titulo, clienteId]
    );

    if (!row) {
      const res = await dbRun(
        `INSERT INTO cotizaciones (cliente_id, titulo, descripcion, subtotal, impuestos, total, estado, fecha, vigencia)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clienteId,
          cot.titulo,
          cot.descripcion,
          cot.subtotal,
          cot.impuestos,
          cot.total,
          cot.estado,
          cot.fecha,
          cot.vigencia,
        ]
      );
      console.log(`  + Cotización creada: "${cot.titulo}" (${cot.estado})`);
    } else {
      console.log(`  = Cotización existente: "${cot.titulo}"`);
    }
  }

  // Proyectos ficticios
  console.log("[Seed Académico] Sembrando proyectos ficticios...");
  const proyectosFicticios = [
    {
      cliente_email: "contacto@innova.ejemplo.com",
      titulo: "Implementación Prototipo XclusiveSetup",
      responsable: "Equipo Académico",
      fecha_inicio: "2026-10-01",
      fecha_fin: "2026-11-30",
      estado: "en_progreso",
      notas: "Proyecto derivado de cotización académica aprobada.",
    },
    {
      cliente_email: "soporte@techcore.ejemplo.com",
      titulo: "Integración de Base de Datos y API",
      responsable: "Coordinador Técnico",
      fecha_inicio: "2026-10-15",
      fecha_fin: "2026-12-15",
      estado: "planeado",
      notas: "Fase de planeación de servicios REST.",
    },
    {
      cliente_email: "ventas@eduplus.ejemplo.com",
      titulo: "Migración de Arquitectura Legacy",
      responsable: "Líder de Desarrollo",
      fecha_inicio: "2026-09-01",
      fecha_fin: "2026-10-14",
      estado: "completado",
      notas: "Concluida con pruebas de regresión exitosas.",
    },
  ];

  const mapaProyectos = new Map();

  for (const p of proyectosFicticios) {
    const clienteId = mapaClientes.get(p.cliente_email);
    const clienteNombre = clientesFicticios.find(
      (c) => c.email === p.cliente_email
    )?.nombre;

    let row = await dbGet(
      "SELECT id FROM proyectos WHERE titulo = ? AND cliente_id = ?",
      [p.titulo, clienteId]
    );

    if (!row) {
      const res = await dbRun(
        `INSERT INTO proyectos (cliente_id, cliente, titulo, responsable, fecha_inicio, fecha_fin, estado, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clienteId,
          clienteNombre,
          p.titulo,
          p.responsable,
          p.fecha_inicio,
          p.fecha_fin,
          p.estado,
          p.notas,
        ]
      );
      mapaProyectos.set(p.titulo, res.lastID);
      console.log(`  + Proyecto creado: "${p.titulo}" (#${res.lastID})`);
    } else {
      mapaProyectos.set(p.titulo, row.id);
      console.log(`  = Proyecto existente: "${p.titulo}" (#${row.id})`);
    }
  }

  // Tareas ficticias
  console.log("[Seed Académico] Sembrando tareas ficticias...");
  const tareasFicticias = [
    {
      proyecto_titulo: "Implementación Prototipo XclusiveSetup",
      titulo: "Diseño del esquema de base de datos aislada",
      descripcion: "Creación de tablas SQLite independientes sin datos de producción.",
      prioridad: "alta",
      responsable: "Equipo Académico",
      estado: "completado",
      fecha_limite: "2026-10-20",
    },
    {
      proyecto_titulo: "Implementación Prototipo XclusiveSetup",
      titulo: "Configuración de endpoints para Clientes y Cotizaciones",
      descripcion: "Asegurar compatibilidad REST en backend express.",
      prioridad: "alta",
      responsable: "Equipo Académico",
      estado: "en_progreso",
      fecha_limite: "2026-10-28",
    },
    {
      proyecto_titulo: "Implementación Prototipo XclusiveSetup",
      titulo: "Pruebas de flujo Cotización a Proyecto",
      descripcion: "Verificar trazabilidad entre entidades del prototipo.",
      prioridad: "media",
      responsable: "Equipo Académico",
      estado: "pendiente",
      fecha_limite: "2026-11-10",
    },
    {
      proyecto_titulo: "Integración de Base de Datos y API",
      titulo: "Definición de modelos relacionales",
      descripcion: "Revisar claves foráneas y restricciones de integridad.",
      prioridad: "media",
      responsable: "Coordinador Técnico",
      estado: "pendiente",
      fecha_limite: "2026-11-05",
    },
    {
      proyecto_titulo: "Integración de Base de Datos y API",
      titulo: "Documentación de especificaciones REST",
      descripcion: "Elaborar contratos de API para los cuatro módulos.",
      prioridad: "baja",
      responsable: "Coordinador Técnico",
      estado: "pendiente",
      fecha_limite: "2026-11-20",
    },
    {
      proyecto_titulo: "Migración de Arquitectura Legacy",
      titulo: "Validación de integridad de datos de prueba",
      descripcion: "Auditoría de integridad referencial.",
      prioridad: "alta",
      responsable: "Líder de Desarrollo",
      estado: "completado",
      fecha_limite: "2026-10-10",
    },
  ];

  for (const t of tareasFicticias) {
    const proyectoId = mapaProyectos.get(t.proyecto_titulo);
    if (!proyectoId) continue;

    const row = await dbGet(
      "SELECT id FROM tareas WHERE titulo = ? AND proyecto_id = ?",
      [t.titulo, proyectoId]
    );

    if (!row) {
      await dbRun(
        `INSERT INTO tareas (proyecto_id, titulo, descripcion, prioridad, responsable, estado, fecha_limite)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          proyectoId,
          t.titulo,
          t.descripcion,
          t.prioridad,
          t.responsable,
          t.estado,
          t.fecha_limite,
        ]
      );
      console.log(`  + Tarea creada: "${t.titulo}" [${t.prioridad}]`);
    } else {
      console.log(`  = Tarea existente: "${t.titulo}"`);
    }
  }

  console.log("========================================================");
  console.log(" CARGA DE DATOS ACADÉMICOS FICTICIOS COMPLETADA CON ÉXITO");
  console.log(" Ningún dato fue copiado del CRM original.");
  console.log("========================================================");

  db.close();
}

sembrarDatos().catch((err) => {
  console.error("Error al sembrar datos académicos:", err);
  process.exit(1);
});
