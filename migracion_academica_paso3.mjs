import sqlite3 from "sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFile = path.join(__dirname, "database.academico.db");
console.log(`[Migración Académica Paso 3] Aplicando migración exclusivamente sobre: ${dbFile}`);

const db = new sqlite3.Database(dbFile);

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
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

async function migrar() {
  try {
    // 1. Verificar proyectos
    const colsProyectos = await dbAll("PRAGMA table_info(proyectos)");
    const tieneCotizacionId = colsProyectos.some((c) => c.name === "cotizacion_id");

    if (!tieneCotizacionId) {
      console.log("[Migración] Agregando columna cotizacion_id a proyectos...");
      await dbRun("ALTER TABLE proyectos ADD COLUMN cotizacion_id INTEGER REFERENCES cotizaciones(id)");
      console.log("[Migración] Columna cotizacion_id agregada con éxito.");
    } else {
      console.log("[Migración] Columna cotizacion_id ya existe en proyectos.");
    }

    console.log("[Migración] Creando índice único condicional idx_proyectos_cotizacion_id...");
    await dbRun(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_proyectos_cotizacion_id ON proyectos(cotizacion_id) WHERE cotizacion_id IS NOT NULL"
    );
    console.log("[Migración] Índice idx_proyectos_cotizacion_id verificado/creado.");

    // 2. Verificar tareas
    const colsTareas = await dbAll("PRAGMA table_info(tareas)");
    const tieneFechaInicio = colsTareas.some((c) => c.name === "fecha_inicio");

    if (!tieneFechaInicio) {
      console.log("[Migración] Agregando columna fecha_inicio a tareas...");
      await dbRun("ALTER TABLE tareas ADD COLUMN fecha_inicio TEXT");
      console.log("[Migración] Columna fecha_inicio agregada con éxito.");
    } else {
      console.log("[Migración] Columna fecha_inicio ya existe en tareas.");
    }

    console.log("[Migración] Esquema de base académica verificado correctamente.");
  } catch (err) {
    console.error("[Migración] Error al aplicar migración:", err);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

migrar();
