# XclusiveSetup CRM - Prototipo Académico

Prototipo web funcional de CRM (Customer Relationship Management) orientado a la gestión integrada de clientes, cotizaciones, proyectos y tareas operativas.

Este repositorio corresponde a la entrega de la **Fase 4** del curso **Proyecto de Grado** de la **Universidad Nacional Abierta y a Distancia (UNAD)**.

---

## 1. Créditos y Autoría

- **Desarrollo inicial y base tecnológica del sistema:** John Alexander Bernal Alvarado.
- **Consolidación, aseguramiento metodológico y entrega Fase 4:** Trabajo colaborativo entre John Alexander Bernal Alvarado (liderazgo técnico, implementación, pruebas y demostración) y Jeisson Iván Marcillo Combita (liderazgo documental y coherencia con la metodología de desarrollo tecnológico).

---

## 2. Alcance Académico Evaluado

El prototipo académico cubre de manera estricta el siguiente alcance base funcional:
1. **Autenticación y Seguridad:** Inicio y cierre de sesión con tokens JWT, protección de endpoints mediante middlewares y contraseñas hasheadas con `bcryptjs`.
2. **Gestión de Clientes:** Registro, consulta, edición y eliminación de clientes, con validación de obligatoriedad en `nombre` y `email`.
3. **Gestión de Cotizaciones:** Emisión de propuestas económicas vinculadas a clientes, cálculo de montos y ciclo de estados (`borrador`, `enviada`, `aceptada`, `rechazada`).
4. **Conversión Controlada a Proyecto:** Transformación transaccional e idempotente de cotizaciones con estado estricto `'aceptada'` hacia proyectos en estado `'planeado'`, conservando la trazabilidad de la cotización y previniendo duplicidades.
5. **Gestión de Tareas Operativas:** Registro, priorización, asignación de responsables y seguimiento de tareas asociadas a proyectos, con validación cronológica (`fecha_limite >= fecha_inicio`).

> **Nota sobre funcionalidades complementarias:**
> Los módulos de Facturación, Finanzas, Oportunidades, Leads y Calendario corresponden a fases de expansión comercial fuera del alcance académico base. De igual forma, las rutas de Inteligencia Artificial (`/api/ia/*`) se encuentran deshabilitadas de manera intencional en este perfil (respondiendo HTTP `503 Service Unavailable`) para no requerir credenciales ni cuotas de servicios de terceros.

---

## 3. Requisitos del Sistema y Compatibilidad de Node.js

Para garantizar la correcta ejecución de todas las herramientas y dependencias, el entorno debe cumplir con la **intersección exacta** de versiones de Node.js exigida por el manifiesto de paquetes:

- **`vite` (v8.1.2):** Exige `node: '^20.19.0 || >=22.12.0'`.
- **`eslint` (v10.6.0):** Exige `node: '^20.19.0 || ^22.13.0 || >=24'`.
- **Node.js CLI `--env-file`:** Requiere Node.js $\ge 20.6.0$.

### Rangos de Node.js Soportados:
- **Rama v20 LTS:** Desde `v20.19.0` hasta `<21.0.0`.
- **Rama v22 LTS:** Desde `v22.13.0` hasta `<23.0.0`.
- **Rama v24:** Desde `v24.0.0` en adelante.

*(Versiones intermedias como Node 18.x, Node 20.0 - 20.18, Node 21.x o Node 22.0 - 22.12 no satisfacen las restricciones de empaquetado y linters de este proyecto).*

- **Versión del entorno local reportada durante las pruebas:** Node.js `v24.16.0` y npm `11.13.0` sobre Windows.

---

## 4. Guía de Puesta en Marcha (Paso a Paso)

Todos los comandos deben ejecutarse desde la raíz de este directorio (`xclusivesetup-portal`).

### Paso 1: Configurar las Variables de Entorno Académicas
Copia la plantilla de ejemplo para generar tu archivo local `.env.academico`:

```bash
# En Windows (PowerShell):
Copy-Item .env.academico.example .env.academico

# En Linux o macOS:
cp .env.academico.example .env.academico
```

Abre `.env.academico` y completa obligatoriamente las siguientes dos variables:
1. `JWT_SECRET`: Genera un secreto aleatorio ejecutando en tu terminal:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Pega la cadena resultante como valor de `JWT_SECRET`.
2. `DEMO_ADMIN_PASSWORD`: Asigna la contraseña que utilizarás para iniciar sesión con el usuario demo (`demo@example.com`).

*(El archivo `.env.academico` está ignorado por Git para proteger la confidencialidad de tus claves locales).*

### Paso 2: Instalar Dependencias Reproducibles
Utiliza `npm ci` para instalar exactamente las versiones fijadas en `package-lock.json`:

```bash
npm ci
```
*(Alternativamente, puede usarse `npm install`).*

### Paso 3: Inicializar la Base de Datos Académica y Sembrar Datos
Inicializa el esquema de SQLite y carga datos ficticios de prueba (`@ejemplo.com`):

```bash
npm run seed:academico
```

- Este script es **totalmente idempotente**: crea automáticamente el archivo `database.academico.db` con sus 12 tablas, el índice condicional de proyectos y siembra 4 clientes, 4 cotizaciones, 3 proyectos, 6 tareas y el usuario administrador demo.
- *Nota sobre migraciones:* El script `migracion_academica_paso3.mjs` solo es necesario si se actualiza una base de datos antigua previa al paso 3. Al ejecutar `npm run seed:academico` desde cero, el esquema ya incluye todas las columnas e índices.

### Paso 4: Iniciar Servidores en Dos Terminales

**Terminal 1 (Backend Express):**
```bash
npm run server:academico
```
- Se iniciará en: `http://localhost:4050`
- Conectará exclusivamente a `database.academico.db` y resolverá archivos adjuntos en `uploads/academico/`.

**Terminal 2 (Frontend Vite):**
```bash
npm run dev:academico
```
- Se iniciará en: `http://localhost:5180`
- Redirigirá internamente las peticiones `/api` hacia `http://localhost:4050` mediante su proxy reverso.

### Paso 5: Acceder al Prototipo en el Navegador
Abre en tu navegador web:
**[http://localhost:5180](http://localhost:5180)**

Ingresa con las credenciales que configuraste en tu `.env.academico`:
- **Usuario:** `demo@example.com` (o el valor de `DEMO_ADMIN_EMAIL`)
- **Contraseña:** La clave configurada en `DEMO_ADMIN_PASSWORD`

---

## 5. Pruebas Automatizadas Disponibles

| Script de Prueba | Comando | Tipo | Advertencia sobre Datos |
| :--- | :--- | :--- | :--- |
| **Verificación de Humo (Smoke Test)** | `node verify_academic.mjs` | Solo Lectura | **Seguro:** Comprueba login demo, sesión `/api/auth/me`, conteo de tablas y bloqueo HTTP 503 de IA sin modificar datos. |
| **Suite de Integración Paso 3** | `node test_flujo_academico_paso3.mjs` | Integración API | **Modifica datos:** Ejecuta 9 escenarios de prueba (rechazos 401/404/400, conversión de cotización a proyecto, idempotencia y validación de fechas de tareas). Inserta nuevos registros en `database.academico.db`. |

---

## 6. Estado de Validación Metodológica

- **Comprobación de la Implementación:** La arquitectura cliente-servidor, el esquema relacional SQLite y la respuesta HTTP en puertos locales fueron comprobados mediante inspección de código y arranque controlado local.
- **Nivel de Madurez Tecnológica (TRL):** El proyecto dispone de una implementación del flujo principal y de evidencias de pruebas documentadas previamente. La justificación del nivel de madurez tecnológica para la entrega de Fase 4 se presentará con base en las evidencias de integración y validación disponibles. No se declara en este README un nivel TRL acreditado.
