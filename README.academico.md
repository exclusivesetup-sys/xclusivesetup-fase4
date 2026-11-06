# Entorno Local Aislado - Prototipo Académico XclusiveSetup

Este entorno permite ejecutar y probar de forma 100% independiente el prototipo académico sin interactuar con bases de datos ni servicios de producción.

Para una visión completa de la arquitectura y el alcance del proyecto de grado (UNAD), consulta el [README.md](./README.md) principal.

---

## 1. Direcciones y Puertos Locales

| Servicio | Puerto Local | Dirección |
| :--- | :--- | :--- |
| **Backend Académico (Express)** | `4050` | `http://localhost:4050` |
| **Frontend Académico (Vite)** | `5180` | `http://localhost:5180` |

---

## 2. Configuración del Entorno Local

1. Copia la plantilla `.env.academico.example`:
   ```bash
   Copy-Item .env.academico.example .env.academico
   ```
2. Completa los valores de `JWT_SECRET` y `DEMO_ADMIN_PASSWORD` en tu `.env.academico`.

---

## 3. Base de Datos Académica

- **Nombre:** `database.academico.db`
- **Ubicación:** `xclusivesetup-portal/database.academico.db`
- **Aislamiento:** La base original (`database.db`) no se modifica ni se lee para este entorno.

Para inicializar las tablas e inyectar datos de prueba (`@ejemplo.com`):
```bash
npm run seed:academico
```
*Nota: El script es totalmente idempotente; puede ejecutarse múltiples veces sin duplicar registros.*

---

## 4. Comandos de Ejecución

1. **Terminal 1 - Backend:**
   ```bash
   npm run server:academico
   ```
2. **Terminal 2 - Frontend:**
   ```bash
   npm run dev:academico
   ```
3. **Navegador Web:**
   [http://localhost:5180](http://localhost:5180)

---

## 5. Pruebas Automatizadas

- **Smoke test de lectura:** `node verify_academic.mjs`
- **Suite de integración del flujo académico:** `node test_flujo_academico_paso3.mjs` *(Atención: modifica registros en la base académica).*

---

## 6. Servicios Deshabilitados Intencionalmente en la Demo

1. **Inteligencia Artificial:** Rutas `/api/ia/*` responden con HTTP `503 Service Unavailable`.
2. **Túneles Externos:** Desvinculado de Cloudflare Tunnel; opera estrictamente en `localhost`.
3. **Aislamiento de Adjuntos:** Almacenamiento exclusivo en `uploads/academico/`.
4. **Aislamiento de Tokens:** Sesión almacenada bajo la clave `xs_academico_token`.

---

## 7. Estado de Validación Metodológica

El proyecto dispone de una implementación del flujo principal y de evidencias de pruebas documentadas previamente. La justificación del nivel de madurez tecnológica para la entrega de Fase 4 se presentará con base en las evidencias de integración y validación disponibles. No se declara en este README un nivel TRL acreditado.
