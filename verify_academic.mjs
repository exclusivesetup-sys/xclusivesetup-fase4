import assert from "node:assert";
import "./env.js";

async function testBackend() {
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4050}`;
  console.log("=== INICIANDO VERIFICACIONES DEL BACKEND ACADÉMICO ===");

  // 1. Probar que IA está deshabilitada (HTTP 503)
  console.log("1. Probando bloqueo de endpoints de IA...");
  const resIA = await fetch(`${baseUrl}/api/ia/resumen-cliente/1`, { method: "POST" });
  const dataIA = await resIA.json();
  console.log(`   Status: ${resIA.status} (esperado 503)`);
  console.log(`   Respuesta:`, dataIA);
  assert.strictEqual(resIA.status, 503, "El endpoint de IA debe responder con status HTTP 503");
  assert.strictEqual(dataIA.deshabilitado, true, "La respuesta debe indicar { deshabilitado: true }");
  assert.ok(dataIA.error, "La respuesta de IA bloqueada debe contener un mensaje de error");

  // 2. Probar Login con credenciales demo
  console.log("\n2. Probando inicio de sesión con usuario demo...");
  const email = process.env.DEMO_ADMIN_EMAIL || "demo@example.com";
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("DEMO_ADMIN_PASSWORD debe estar definida en .env.academico");
  }

  const resLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const dataLogin = await resLogin.json();
  console.log(`   Status: ${resLogin.status} (esperado 200)`);
  assert.strictEqual(resLogin.status, 200, "El inicio de sesión demo debe responder HTTP 200");
  assert.ok(dataLogin.token, "La respuesta de login debe incluir un token JWT");
  assert.ok(dataLogin.usuario, "La respuesta de login debe incluir el objeto de usuario");
  assert.strictEqual(dataLogin.usuario?.email, email, "El email del usuario autenticado debe coincidir con el solicitado");
  console.log(`   Usuario autenticado: ${dataLogin.usuario?.nombre} (${dataLogin.usuario?.email}) [Rol: ${dataLogin.usuario?.rol}]`);

  const token = dataLogin.token;
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // 3. Probar /api/auth/me
  console.log("\n3. Probando verificación de sesión (/api/auth/me)...");
  const resMe = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataMe = await resMe.json();
  console.log(`   Status: ${resMe.status} (esperado 200)`);
  assert.strictEqual(resMe.status, 200, "/api/auth/me debe responder HTTP 200");
  assert.ok(dataMe.usuario, "La respuesta de /api/auth/me debe incluir el objeto usuario");
  assert.strictEqual(dataMe.usuario?.email, email, "El email de la sesión activa debe coincidir");
  console.log(`   Email sesión: ${dataMe.usuario?.email}`);

  // 4. Probar /api/clientes
  console.log("\n4. Probando lectura de clientes ficticios...");
  const resClientes = await fetch(`${baseUrl}/api/clientes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataClientes = await resClientes.json();
  console.log(`   Status: ${resClientes.status} (esperado 200)`);
  console.log(`   Total clientes: ${dataClientes.length} (esperado >= 4)`);
  assert.strictEqual(resClientes.status, 200, "Lectura de clientes debe responder HTTP 200");
  assert.ok(Array.isArray(dataClientes), "dataClientes debe ser una lista de registros");
  assert.ok(dataClientes.length >= 4, `Se esperaban al menos 4 clientes en el seed, recibidos: ${dataClientes.length}`);
  for (const c of dataClientes) {
    assert.ok(c.id != null, "Cada cliente debe contar con id numérico");
    assert.ok(typeof c.nombre === "string" && c.nombre.length > 0, "Cada cliente debe contar con nombre");
    assert.ok(typeof c.email === "string" && c.email.length > 0, "Cada cliente debe contar con email");
  }
  dataClientes.forEach((c) => console.log(`     - [ID ${c.id}] ${c.nombre} (${c.email})`));

  // 5. Probar /api/cotizaciones
  console.log("\n5. Probando lectura de cotizaciones ficticias...");
  const resCot = await fetch(`${baseUrl}/api/cotizaciones`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataCot = await resCot.json();
  console.log(`   Status: ${resCot.status} (esperado 200)`);
  console.log(`   Total cotizaciones: ${dataCot.length} (esperado >= 4)`);
  assert.strictEqual(resCot.status, 200, "Lectura de cotizaciones debe responder HTTP 200");
  assert.ok(Array.isArray(dataCot), "dataCot debe ser una lista de registros");
  assert.ok(dataCot.length >= 4, `Se esperaban al menos 4 cotizaciones en el seed, recibidas: ${dataCot.length}`);
  for (const c of dataCot) {
    assert.ok(c.id != null, "Cada cotización debe contar con id");
    assert.ok(c.titulo, "Cada cotización debe contar con título");
    assert.ok(c.estado, "Cada cotización debe contar con estado");
  }
  dataCot.forEach((c) => console.log(`     - [ID ${c.id}] ${c.titulo} (${c.estado})`));

  // 6. Probar /api/proyectos
  console.log("\n6. Probando lectura de proyectos ficticios...");
  const resProy = await fetch(`${baseUrl}/api/proyectos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataProy = await resProy.json();
  console.log(`   Status: ${resProy.status} (esperado 200)`);
  console.log(`   Total proyectos: ${dataProy.length} (esperado >= 3)`);
  assert.strictEqual(resProy.status, 200, "Lectura de proyectos debe responder HTTP 200");
  assert.ok(Array.isArray(dataProy), "dataProy debe ser una lista de registros");
  assert.ok(dataProy.length >= 3, `Se esperaban al menos 3 proyectos en el seed, recibidos: ${dataProy.length}`);
  for (const p of dataProy) {
    assert.ok(p.id != null, "Cada proyecto debe contar con id");
    assert.ok(p.titulo, "Cada proyecto debe contar con título");
    assert.ok(p.estado, "Cada proyecto debe contar con estado");
  }
  dataProy.forEach((p) => console.log(`     - [ID ${p.id}] ${p.titulo} (${p.estado})`));

  // 7. Probar /api/tareas
  console.log("\n7. Probando lectura de tareas ficticias...");
  const resTareas = await fetch(`${baseUrl}/api/tareas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataTareas = await resTareas.json();
  console.log(`   Status: ${resTareas.status} (esperado 200)`);
  console.log(`   Total tareas: ${dataTareas.length} (esperado >= 6)`);
  assert.strictEqual(resTareas.status, 200, "Lectura de tareas debe responder HTTP 200");
  assert.ok(Array.isArray(dataTareas), "dataTareas debe ser una lista de registros");
  assert.ok(dataTareas.length >= 6, `Se esperaban al menos 6 tareas en el seed, recibidas: ${dataTareas.length}`);
  for (const t of dataTareas) {
    assert.ok(t.id != null, "Cada tarea debe contar con id");
    assert.ok(t.titulo, "Cada tarea debe contar con título");
  }
  dataTareas.forEach((t) => console.log(`     - [ID ${t.id}] ${t.titulo} [Prioridad: ${t.prioridad}]`));

  // 8. Regla de negocio RF-03 en creación manual: Rechazo con cotización no aceptada (HTTP 400)
  console.log("\n8. Probando creación manual de proyecto con cotización no aceptada (RF-03)...");
  const cotNoAceptada = dataCot.find((c) => c.estado !== "aceptada");
  assert.ok(cotNoAceptada, "Debe existir al menos una cotización no aceptada para la prueba");
  const resProyInvalido = await fetch(`${baseUrl}/api/proyectos`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      titulo: "Proyecto Inválido Prueba RF-03",
      cotizacion_id: cotNoAceptada.id,
      cliente_id: cotNoAceptada.cliente_id,
    }),
  });
  const dataProyInvalido = await resProyInvalido.json();
  console.log(`   Status: ${resProyInvalido.status} (esperado 400)`);
  console.log(`   Mensaje de error recibido: "${dataProyInvalido.error}"`);
  assert.strictEqual(
    resProyInvalido.status,
    400,
    `Crear proyecto con cotización en estado '${cotNoAceptada.estado}' debe devolver HTTP 400`
  );
  assert.ok(dataProyInvalido.error, "La respuesta debe contener un mensaje de error descriptivo");

  // 9. Regla de negocio en cotizaciones: Rechazo ante estado inválido (HTTP 400)
  console.log("\n9. Probando cambio de estado de cotización a un valor inválido...");
  const cotPrueba = dataCot[0];
  const resEstadoInvalido = await fetch(`${baseUrl}/api/cotizaciones/${cotPrueba.id}/estado`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      estado: "estado_invalido_xyz",
    }),
  });
  const dataEstadoInvalido = await resEstadoInvalido.json();
  console.log(`   Status: ${resEstadoInvalido.status} (esperado 400)`);
  console.log(`   Mensaje de error recibido: "${dataEstadoInvalido.error}"`);
  assert.strictEqual(
    resEstadoInvalido.status,
    400,
    `Cambiar cotización a estado inválido debe devolver HTTP 400 (obtenido ${resEstadoInvalido.status})`
  );
  assert.ok(dataEstadoInvalido.error, "La respuesta debe contener un mensaje de error descriptivo");

  // 10. Regla de integridad referencial: Rechazo al eliminar cliente con cotizaciones o proyectos (HTTP 400)
  console.log("\n10. Probando integridad referencial al eliminar cliente con proyectos/cotizaciones...");
  const clienteConVinculos = dataClientes[0];
  const resDeleteClienteInvalido = await fetch(`${baseUrl}/api/clientes/${clienteConVinculos.id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  const dataDeleteClienteInvalido = await resDeleteClienteInvalido.json();
  console.log(`   Status: ${resDeleteClienteInvalido.status} (esperado 400)`);
  console.log(`   Mensaje de error recibido: "${dataDeleteClienteInvalido.error}"`);
  assert.strictEqual(
    resDeleteClienteInvalido.status,
    400,
    `Eliminar cliente con cotizaciones/proyectos asociados debe devolver HTTP 400 (obtenido ${resDeleteClienteInvalido.status})`
  );
  assert.ok(
    dataDeleteClienteInvalido.error,
    "La respuesta debe contener un mensaje de error descriptivo sobre integridad referencial"
  );

  // 11. Validación de RF-01: Creación de cliente únicamente con nombre y email obligatorios
  console.log("\n11. Probando creación de cliente cumpliendo RF-01 (solo nombre y email obligatorios)...");
  const resClienteMinimo = await fetch(`${baseUrl}/api/clientes`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      nombre: "Cliente Temporal RF01",
      email: "rf01.temp@ejemplo.com",
    }),
  });
  const dataClienteMinimo = await resClienteMinimo.json();
  console.log(`   Status creación: ${resClienteMinimo.status} (esperado 201)`);
  assert.strictEqual(resClienteMinimo.status, 201, "Crear cliente con solo nombre y email debe devolver HTTP 201");
  assert.ok(dataClienteMinimo.id != null, "El cliente creado debe tener un id");
  assert.strictEqual(dataClienteMinimo.nombre, "Cliente Temporal RF01");
  assert.strictEqual(dataClienteMinimo.email, "rf01.temp@ejemplo.com");

  // Limpieza del cliente temporal (como no tiene cotizaciones ni proyectos, la eliminación debe ser 204)
  const resCleanTemp = await fetch(`${baseUrl}/api/clientes/${dataClienteMinimo.id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  console.log(`   Status eliminación cliente temporal sin vínculos: ${resCleanTemp.status} (esperado 204)`);
  assert.strictEqual(resCleanTemp.status, 204, "Eliminar cliente sin cotizaciones ni proyectos debe devolver HTTP 204");

  console.log("\n=== TODAS LAS VERIFICACIONES DEL BACKEND PASARON EXITOSAMENTE ===");
}

testBackend().catch((err) => {
  console.error("\n❌ Falla en la verificación:", err);
  process.exit(1);
});
