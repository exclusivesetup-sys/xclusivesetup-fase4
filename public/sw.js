// Service worker mínimo y seguro para XclusiveSetup CRM.
// A propósito NO cachea la API ni los bundles con hash: solo da una
// respuesta de reserva si la navegación falla por falta de red.
// Esto dejar preparada la base de PWA (instalable, con manifest y
// service worker registrado) sin arriesgar datos desactualizados.

const OFFLINE_MESSAGE = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Sin conexión — XclusiveSetup CRM</title>
    <style>
      body { font-family: system-ui, sans-serif; background:#0b1120; color:#e6edf6;
        display:flex; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; }
      div { max-width: 360px; padding: 24px; }
      h1 { font-size: 1.2rem; }
      p { color: #90a3bd; font-size: 0.92rem; }
    </style>
  </head>
  <body>
    <div>
      <h1>Sin conexión</h1>
      <p>No se pudo cargar XclusiveSetup CRM. Verifica tu conexión a internet e intenta de nuevo.</p>
    </div>
  </body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Nunca interceptar la API ni métodos que no sean GET.
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) {
    return;
  }

  // Solo dar una respuesta de reserva para navegaciones de página completa.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_MESSAGE, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
      )
    );
  }
});
