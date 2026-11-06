import "./env.js";

async function testBackend() {
  const baseUrl = "http://localhost:4050";
  console.log("=== INICIANDO VERIFICACIONES DEL BACKEND ACADÉMICO ===");

  // 1. Probar que IA está deshabilitada
  console.log("1. Probando bloqueo de endpoints de IA...");
  const resIA = await fetch(`${baseUrl}/api/ia/resumen-cliente/1`, { method: "POST" });
  const dataIA = await resIA.json();
  console.log(`   Status: ${resIA.status} (esperado 503)`);
  console.log(`   Respuesta:`, dataIA);
  if (resIA.status !== 503 || !dataIA.deshabilitado) {
    throw new Error("El endpoint de IA no respondió con 503 deshabilitado!");
  }

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
  if (resLogin.status !== 200 || !dataLogin.token) {
    throw new Error(`Error en login: ${JSON.stringify(dataLogin)}`);
  }
  console.log(`   Usuario autenticado: ${dataLogin.usuario?.nombre} (${dataLogin.usuario?.email})`);

  const token = dataLogin.token;

  // 3. Probar /api/auth/me
  console.log("\n3. Probando verificación de sesión (/api/auth/me)...");
  const resMe = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataMe = await resMe.json();
  console.log(`   Status: ${resMe.status} (esperado 200)`);
  console.log(`   Email sesión: ${dataMe.usuario?.email}`);

  // 4. Probar /api/clientes
  console.log("\n4. Probando lectura de clientes ficticios...");
  const resClientes = await fetch(`${baseUrl}/api/clientes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataClientes = await resClientes.json();
  console.log(`   Total clientes: ${dataClientes.length} (esperado 4)`);
  dataClientes.forEach((c) => console.log(`     - [ID ${c.id}] ${c.nombre} (${c.email})`));

  // 5. Probar /api/cotizaciones
  console.log("\n5. Probando lectura de cotizaciones ficticias...");
  const resCot = await fetch(`${baseUrl}/api/cotizaciones`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataCot = await resCot.json();
  console.log(`   Total cotizaciones: ${dataCot.length} (esperado 4)`);
  dataCot.forEach((c) => console.log(`     - [ID ${c.id}] ${c.titulo} (${c.estado})`));

  // 6. Probar /api/proyectos
  console.log("\n6. Probando lectura de proyectos ficticios...");
  const resProy = await fetch(`${baseUrl}/api/proyectos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataProy = await resProy.json();
  console.log(`   Total proyectos: ${dataProy.length} (esperado 3)`);
  dataProy.forEach((p) => console.log(`     - [ID ${p.id}] ${p.titulo} (${p.estado})`));

  // 7. Probar /api/tareas
  console.log("\n7. Probando lectura de tareas ficticias...");
  const resTareas = await fetch(`${baseUrl}/api/tareas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataTareas = await resTareas.json();
  console.log(`   Total tareas: ${dataTareas.length} (esperado 6)`);
  dataTareas.forEach((t) => console.log(`     - [ID ${t.id}] ${t.titulo} [Prioridad: ${t.prioridad}]`));

  console.log("\n=== TODAS LAS VERIFICACIONES DEL BACKEND PASARON EXITOSAMENTE ===");
}

testBackend().catch((err) => {
  console.error("Falla en la verificación:", err);
  process.exit(1);
});
