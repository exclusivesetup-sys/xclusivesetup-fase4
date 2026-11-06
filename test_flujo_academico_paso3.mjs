import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de .env.academico de forma segura sin exponer credenciales
function cargarEnvAcademico() {
  const envPath = path.join(__dirname, ".env.academico");
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [k, ...v] = trimmed.split("=");
    env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = cargarEnvAcademico();
const baseUrl = `http://localhost:${env.PORT || 4050}`;
const email = env.DEMO_ADMIN_EMAIL || "demo@example.com";
const password = env.DEMO_ADMIN_PASSWORD;

async function runTests() {
  console.log("==========================================================");
  console.log("SUITE DE PRUEBAS AUTOMATIZADAS - PASO 3 (FLUJO ACADÉMICO)");
  console.log("==========================================================");
  console.log(`Conectando al backend académico en: ${baseUrl}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Rechazo sin autenticación
  console.log("1. Probando rechazo de acceso sin autenticación...");
  try {
    const resNoAuth = await fetch(`${baseUrl}/api/cotizaciones/1/convertir-a-proyecto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    assert(resNoAuth.status === 401, `Status esperado 401, recibido ${resNoAuth.status}`);
  } catch (err) {
    assert(false, `Error en petición sin auth: ${err.message}`);
  }

  // Autenticar para obtener token
  let token = "";
  try {
    const resLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const dataLogin = await resLogin.json();
    if (resLogin.ok && dataLogin.token) {
      token = dataLogin.token;
      console.log("  Autenticación demo exitosa (token JWT obtenido de forma protegida).");
    } else {
      throw new Error(dataLogin.error || "No se pudo autenticar");
    }
  } catch (err) {
    console.error("  Error fatal autenticando:", err.message);
    process.exit(1);
  }

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // 2. Cotización inexistente
  console.log("\n2. Probando respuesta controlada ante cotización inexistente...");
  try {
    const resNotFound = await fetch(`${baseUrl}/api/cotizaciones/999999/convertir-a-proyecto`, {
      method: "POST",
      headers: authHeaders,
    });
    const dataNotFound = await resNotFound.json();
    assert(resNotFound.status === 404, `Status esperado 404, recibido ${resNotFound.status}`);
    assert(dataNotFound.error === "Cotización no encontrada", `Mensaje de error adecuado: ${dataNotFound.error}`);
  } catch (err) {
    assert(false, `Error en prueba de cotización inexistente: ${err.message}`);
  }

  // 3. Rechazo de cotización no aceptada
  console.log("\n3. Probando rechazo de conversión para cotización con estado distinto de 'aceptada'...");
  try {
    // Cotización 2 tiene estado 'enviada'
    const resNotAccepted = await fetch(`${baseUrl}/api/cotizaciones/2/convertir-a-proyecto`, {
      method: "POST",
      headers: authHeaders,
    });
    const dataNotAccepted = await resNotAccepted.json();
    assert(resNotAccepted.status === 400, `Status esperado 400, recibido ${resNotAccepted.status}`);
    assert(
      String(dataNotAccepted.error).includes("aceptada"),
      `Mensaje rechaza conversión si no está aceptada: "${dataNotAccepted.error}"`
    );
  } catch (err) {
    assert(false, `Error en prueba de cotización no aceptada: ${err.message}`);
  }

  // 4. Conversión de cotización aceptada
  console.log("\n4. Probando conversión de cotización aceptada (#1)...");
  let nuevoProyectoId = null;
  try {
    const resConvert = await fetch(`${baseUrl}/api/cotizaciones/1/convertir-a-proyecto`, {
      method: "POST",
      headers: authHeaders,
    });
    const dataConvert = await resConvert.json();
    assert(
      resConvert.status === 201 || resConvert.status === 200,
      `Status esperado 201/200, recibido ${resConvert.status}`
    );
    nuevoProyectoId = dataConvert.id || dataConvert.proyecto?.id;
    assert(Boolean(nuevoProyectoId), `Proyecto creado con identificador válido: #${nuevoProyectoId}`);
    assert(dataConvert.proyecto?.estado === "planeado", `Estado inicial compatible con Proyectos: "${dataConvert.proyecto?.estado}"`);
    assert(dataConvert.proyecto?.responsable === null, "No se inventó responsable (queda null)");
    assert(dataConvert.proyecto?.fecha_inicio === null, "No se inventó fecha de inicio (queda null)");
    assert(dataConvert.proyecto?.fecha_fin === null, "No se inventó fecha de fin (queda null)");

    // Verificar que no se generaron tareas automáticas
    const resTareasAuto = await fetch(`${baseUrl}/api/tareas?proyecto_id=${nuevoProyectoId}`, {
      headers: authHeaders,
    });
    const dataTareasAuto = await resTareasAuto.json();
    assert(
      Array.isArray(dataTareasAuto) && dataTareasAuto.length === 0,
      `No se crearon tareas automáticamente (total tareas encontradas: ${dataTareasAuto.length})`
    );
  } catch (err) {
    assert(false, `Error en prueba de conversión: ${err.message}`);
  }

  // 5. Verificación de cliente y cotización asociados
  console.log("\n5. Verificando cliente y cotización asociados en el proyecto...");
  try {
    const resProy = await fetch(`${baseUrl}/api/proyectos`, { headers: authHeaders });
    const proyectos = await resProy.json();
    const proyectoCreado = proyectos.find((p) => p.id === nuevoProyectoId);

    assert(Boolean(proyectoCreado), `El proyecto #${nuevoProyectoId} aparece en /api/proyectos`);
    assert(
      proyectoCreado?.cotizacion_id === 1,
      `Relación persistente con cotización de origen verificada: cotizacion_id = ${proyectoCreado?.cotizacion_id}`
    );
    assert(
      Boolean(proyectoCreado?.cliente),
      `Cliente asociado correctamente: "${proyectoCreado?.cliente}"`
    );

    // Verificar que GET /api/cotizaciones ahora expone el proyecto_id
    const resCot = await fetch(`${baseUrl}/api/cotizaciones`, { headers: authHeaders });
    const cotizaciones = await resCot.json();
    const cot1 = cotizaciones.find((c) => c.id === 1);
    assert(
      cot1?.proyecto_id === nuevoProyectoId,
      `La cotización #1 expone el proyecto asociado proyecto_id = ${cot1?.proyecto_id}`
    );
  } catch (err) {
    assert(false, `Error al verificar relaciones de proyecto y cotización: ${err.message}`);
  }

  // 6. Repetición de conversión sin duplicar el proyecto
  console.log("\n6. Probando repetición de conversión (idempotencia y sin duplicados)...");
  try {
    const resRepeat = await fetch(`${baseUrl}/api/cotizaciones/1/convertir-a-proyecto`, {
      method: "POST",
      headers: authHeaders,
    });
    const dataRepeat = await resRepeat.json();
    assert(resRepeat.status === 200, `Status esperado 200 para proyecto ya existente, recibido ${resRepeat.status}`);
    assert(dataRepeat.yaExistia === true, `Respuesta controlada indica que ya existía: yaExistia = true`);
    assert(
      dataRepeat.id === nuevoProyectoId,
      `Devuelve el mismo identificador de proyecto (#${dataRepeat.id}) sin duplicar registros`
    );
  } catch (err) {
    assert(false, `Error al probar repetición de conversión: ${err.message}`);
  }

  // 7. Creación manual de tarea para el proyecto
  console.log("\n7. Probando creación manual de tarea para el proyecto...");
  let nuevaTareaId = null;
  try {
    const tareaPayload = {
      proyecto_id: nuevoProyectoId,
      titulo: "Diseñar wireframes del prototipo",
      descripcion: "Especificar los componentes principales de navegación",
      prioridad: "alta",
      responsable: "Estudiante Desarrollador",
      estado: "pendiente",
      fecha_inicio: "2026-10-15",
      fecha_limite: "2026-10-22",
    };

    const resTarea = await fetch(`${baseUrl}/api/tareas`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(tareaPayload),
    });
    const dataTarea = await resTarea.json();
    assert(resTarea.status === 201, `Status esperado 201 al crear tarea, recibido ${resTarea.status}`);
    nuevaTareaId = dataTarea.id;
    assert(Boolean(nuevaTareaId), `Tarea creada exitosamente con ID #${nuevaTareaId}`);
    assert(dataTarea.proyecto_id === nuevoProyectoId, `Tarea asociada al proyecto correcto: ${dataTarea.proyecto_id}`);
    assert(dataTarea.fecha_inicio === "2026-10-15", `Fecha de inicio registrada: ${dataTarea.fecha_inicio}`);
    assert(dataTarea.fecha_limite === "2026-10-22", `Fecha límite registrada: ${dataTarea.fecha_limite}`);
  } catch (err) {
    assert(false, `Error al crear tarea: ${err.message}`);
  }

  // 8. Actualización de fechas, prioridad y estado
  console.log("\n8. Probando actualización de fechas, prioridad y estado de la tarea...");
  try {
    const updatePayload = {
      proyecto_id: nuevoProyectoId,
      titulo: "Diseñar wireframes del prototipo - Actualizado",
      descripcion: "Revisión final de diagramas de flujo",
      prioridad: "urgente",
      responsable: "Estudiante Desarrollador",
      estado: "en_progreso",
      fecha_inicio: "2026-10-16",
      fecha_limite: "2026-10-25",
    };

    const resUpdate = await fetch(`${baseUrl}/api/tareas/${nuevaTareaId}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(updatePayload),
    });
    const dataUpdate = await resUpdate.json();
    assert(resUpdate.status === 200, `Status esperado 200 al actualizar tarea, recibido ${resUpdate.status}`);
    assert(dataUpdate.prioridad === "urgente", `Prioridad actualizada: ${dataUpdate.prioridad}`);
    assert(dataUpdate.estado === "en_progreso", `Estado actualizado: ${dataUpdate.estado}`);
    assert(dataUpdate.fecha_inicio === "2026-10-16", `Fecha inicio actualizada: ${dataUpdate.fecha_inicio}`);
    assert(dataUpdate.fecha_limite === "2026-10-25", `Fecha límite actualizada: ${dataUpdate.fecha_limite}`);
  } catch (err) {
    assert(false, `Error al actualizar tarea: ${err.message}`);
  }

  // 9. Rechazo de rango de fechas inválido (vencimiento < inicio)
  console.log("\n9. Probando rechazo de rango de fechas inválido (vencimiento anterior a inicio)...");
  try {
    const invalidPayload = {
      proyecto_id: nuevoProyectoId,
      titulo: "Tarea con fechas erróneas",
      fecha_inicio: "2026-10-20",
      fecha_limite: "2026-10-10", // anterior a fecha_inicio!
    };

    const resInvalid = await fetch(`${baseUrl}/api/tareas`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(invalidPayload),
    });
    const dataInvalid = await resInvalid.json();
    assert(resInvalid.status === 400, `Status esperado 400 por rango inválido, recibido ${resInvalid.status}`);
    assert(
      String(dataInvalid.error).includes("anterior"),
      `Mensaje de validación de fechas: "${dataInvalid.error}"`
    );
  } catch (err) {
    assert(false, `Error al probar validación de rango de fechas: ${err.message}`);
  }

  console.log("\n==========================================================");
  console.log(`RESUMEN DE PRUEBAS: ${passed} PASARON, ${failed} FALLARON.`);
  console.log("==========================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
