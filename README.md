# XclusiveSetup

Prototipo web funcional de CRM orientado a la gestión integrada de clientes, cotizaciones, proyectos y tareas operativas.

## Descripción general

XclusiveSetup es un prototipo de software diseñado para centralizar la gestión comercial y operativa de servicios técnicos. El sistema permite registrar y consultar clientes, elaborar cotizaciones vinculadas a dichos clientes, realizar la conversión controlada de cotizaciones aprobadas hacia proyectos operativos y gestionar las tareas requeridas para su ejecución.

El prototipo implementa un flujo básico de trabajo estructurado en las siguientes fases:
Cliente → Cotización → Cotización aceptada → Proyecto → Tareas.

## Alcance funcional

El alcance funcional principal evaluado en este prototipo comprende exclusivamente los siguientes módulos:

1. **Gestión de clientes:** Registro, listado y consulta de información de contacto comercial.
2. **Gestión de cotizaciones:** Creación de propuestas económicas vinculadas a un cliente, con control de estados (borrador, enviada, aceptada, rechazada).
3. **Conversión controlada de cotizaciones a proyectos:** Proceso transaccional e idempotente que valida que una cotización se encuentre en estado `aceptada` antes de generar el proyecto asociado.
4. **Gestión de proyectos:** Seguimiento del estado del proyecto generado a partir de la propuesta aprobada.
5. **Gestión de tareas:** Creación, asignación de estados y seguimiento de actividades operativas asociadas a un proyecto.

### Componentes de soporte técnico
El sistema integra como componentes técnicos de soporte:
- Autenticación mediante tokens JWT (JSON Web Tokens).
- Almacenamiento seguro de contraseñas mediante hash con `bcryptjs`.
- Gestión de almacenamiento de archivos adjuntos mediante `Multer`.

> [!NOTE]
> Otros módulos o archivos presentes en el código fuente (como analíticas, facturación, finanzas, leads, calendario, pipeline, ventas, administración de usuarios, visor de logs y asistente de IA) corresponden a exploraciones técnicas secundarias y no forman parte del alcance funcional evaluado en esta versión académica.

## Tecnologías utilizadas

- **Frontend:** React 19, JavaScript (ES Modules).
- **Herramienta de desarrollo y compilación:** Vite.
- **Backend:** Node.js con Express.
- **Persistencia de datos:** SQLite mediante el controlador `sqlite3`.
- **Seguridad y sesiones:** `jsonwebtoken` (JWT) y `bcryptjs`.
- **Gestión de cargas:** `multer`.
- **Estilos:** CSS personalizado modular.

## Requisitos

- **Node.js:** Versión 20 LTS (`>= 20.19.0`), Versión 22 LTS (`>= 22.13.0`) o superior (compatible con Node.js 24.x). Requerido por Vite, ESLint y la directiva nativa `--env-file`.
- **Gestor de paquetes:** `npm` (incluido con Node.js).
- **Navegador web:** Compatible con ECMAScript 2022 y estándares web modernos.

## Instalación y ejecución local

Para desplegar y ejecutar el prototipo en un entorno local, siga estos pasos:

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/exclusivesetup-sys/xclusivesetup-fase4.git
   ```

2. Ingresar al directorio del proyecto:
   ```bash
   cd xclusivesetup-fase4
   ```

3. Copiar la plantilla de configuración académica:
   ```bash
   # En Linux / macOS:
   cp .env.academico.example .env.academico

   # En Windows (PowerShell):
   Copy-Item .env.academico.example .env.academico
   ```

4. Configurar las variables locales en `.env.academico`:
   Abra el archivo `.env.academico` y asigne valores locales propios a las variables obligatorias:
   - `JWT_SECRET`: Clave de firma para los tokens de sesión.
   - `DEMO_ADMIN_PASSWORD`: Contraseña asignada para el usuario de demostración académica.

5. Instalar las dependencias del proyecto:
   ```bash
   npm ci
   # o alternativamente:
   npm install
   ```

6. Inicializar la base de datos local y cargar datos iniciales de prueba:
   ```bash
   npm run seed:academico
   ```

7. Iniciar el servidor backend en una primera terminal:
   ```bash
   npm run server:academico
   ```
   El backend iniciará la escucha en el puerto `4050`.

8. Iniciar el servidor frontend en una segunda terminal:
   ```bash
   npm run dev:academico
   ```
   El frontend estará accesible en el puerto `5180`.

9. Abrir el aplicativo en el navegador ingresando a:
   ```text
   http://localhost:5180
   ```

## Seguridad y configuración local

- El archivo `.env.academico` contiene secretos y configuraciones locales sensibles, por lo cual se encuentra excluido del control de versiones mediante `.gitignore` y **nunca debe publicarse en el repositorio**.
- El archivo `.env.academico.example` actúa únicamente como plantilla estructural y no contiene contraseñas, secretos ni claves reales.
- Cada evaluador o desarrollador debe generar su propio `JWT_SECRET` y definir una contraseña local para el usuario de demostración en su copia privada `.env.academico`.

## Pruebas disponibles

El proyecto incluye scripts de prueba e inspección automatizada en la raíz del repositorio:

1. **Verificación de servicios de solo lectura (`verify_academic.mjs`):**
   ```bash
   node verify_academic.mjs
   ```
   Comprueba que los servicios externos de IA respondan bloqueados con código HTTP 503, valida la autenticación del usuario demo, comprueba la sesión en `/api/auth/me` y consulta en modo de solo lectura las listas de clientes, cotizaciones, proyectos y tareas. Este script no realiza modificaciones sobre la base de datos local.

2. **Prueba automatizada del flujo de conversión (`test_flujo_academico_paso3.mjs`):**
   ```bash
   node test_flujo_academico_paso3.mjs
   ```
   Valida el rechazo ante solicitudes no autenticadas (HTTP 401), el manejo de cotizaciones inexistentes (HTTP 404), el bloqueo de conversión cuando una cotización no está en estado aceptada (HTTP 400), la conversión efectiva de una cotización aceptada a proyecto (HTTP 201) y la regla de idempotencia para prevenir conversiones duplicadas.
   *(Advertencia: este script ejecuta operaciones transaccionales de escritura sobre la base de datos local).*

## Limitaciones

- **Carácter del proyecto:** Es un prototipo académico experimental, no un producto comercial terminado.
- **Dependencia de ejecución local:** El funcionamiento integral requiere la ejecución local del backend en Express y del motor de base de datos SQLite.
- **Incompatibilidad con GitHub Pages para ejecución completa:** GitHub Pages es una plataforma exclusiva para alojamiento de archivos estáticos (HTML, JS, CSS). No tiene capacidad de ejecutar entornos Node.js ni bases de datos SQLite. Si se aloja únicamente el frontend compilado en GitHub Pages, la interfaz gráfica cargará visualmente, pero los inicios de sesión y las operaciones contra la API fallarán sin un backend accesible.
- **Servicios externos:** El prototipo no incluye servicios de inteligencia artificial activos ni pasarelas comerciales externas habilitadas.
- **Delimitación:** La operatividad evaluada se concentra puntualmente en los módulos de clientes, cotizaciones, proyectos y tareas.

## Uso académico

Este prototipo puede utilizarse como base para trabajos académicos relacionados con desarrollo de software, ingeniería de software, gestión tecnológica y emprendimiento de base tecnológica. Cada trabajo académico debe presentar el proyecto desde su enfoque específico: desarrollo y validación técnica, proceso de ingeniería, o análisis de oportunidad y modelo de negocio.

## Estructura del proyecto

- `src/`: Código fuente del frontend (componentes React, páginas, utilidades de consumo de API y hojas de estilo).
- `server.js`: Servidor backend en Express con la definición de rutas RESTful y control de persistencia.
- `database.academico.db`: Archivo SQLite generado localmente tras ejecutar el seed académico (excluido de Git).
- `uploads/`: Directorio para el almacenamiento local de archivos adjuntos (excluido de Git).
- `package.json`: Definición de dependencias, configuración del proyecto y scripts de ejecución.
- `.env.academico.example`: Plantilla de configuración de entorno para despliegue local.

## Licencia o aviso académico

Este repositorio corresponde a un prototipo académico. Su uso, reproducción o distribución fuera del contexto académico requiere autorización de los autores.
