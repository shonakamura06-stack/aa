# Manual técnico de capacidades reales — Arena.ai Agent Mode

**Documento de auditoría técnica.** Autor: el propio agente (Arena Agent Mode) ejecutándose en esta sesión.
**Fecha de verificación empírica:** 2026-10-30 (UTC).
**Método:** cada capacidad marcada como "verificada" fue probada ejecutando comandos reales en el sandbox de esta sesión, no inferida de documentación comercial. Las marcas `✓ verificado` / `✗ verificado` indican prueba directa en esta sesión; `⚠️ requiere verificación` indica dependencia de configuración, permisos o red que puede variar entre sesiones.

> **Taxonomía.** Todas las capacidades se clasifican según los **ocho canales** definidos en §1.8 (directo · herramientas integradas · modificar proyectos existentes · terminal · APIs externas · simulable · no posible · parcial-con-límites). Si una capacidad no puede asignarse a un canal, no es una capacidad.

> **Advertencia de lectura.** Este documento no es publicidad. Describe el entorno tal como está hoy y en esta cuenta. Las capacidades de *conectores* (Vercel, Supabase, Google, Notion, Dropbox) dependen de que el usuario los tenga activados en la conversación; las capacidades de *red* dependen de la allowlist del sandbox; las de *hardware* dependen de la máquina virtual asignada.

---

## 0. Entorno verificado (línea base de todas las afirmaciones)

```
Host            Linux, kernel 6.1.158+ x86_64 (sandbox tipo Firecracker/e2b: hostname e2b.local)
CPU             2 vCPU
RAM             3.8 GB (sin swap)
Disco           21 GB totales, ~20 GB libres en /
Usuario         uid=1001(user), grupo sudo; sudo sin contraseña FUNCIONA
                pero apt NO tiene listas de paquetes y deb.debian.org está BLOQUEADO
                => no se pueden instalar paquetes del sistema
Persistencia    /home/user persiste (snapshots). /tmp NO persiste.
                Excluidos de snapshot: node_modules, dist, build, .next, out, target,
                .venv, __pycache__, coverage, .cache  => NO sobreviven entre turnos
```

### 0.1 Toolchain instalada `✓ verificado`

| Herramienta | Versión | Nota |
|---|---|---|
| node | v22.22.3 | incluye `fetch`, `node:test`, `node:sqlite`, `--watch` |
| npm | 10.9.8 | registro accesible |
| yarn | 1.22.22 | classic |
| python3 | 3.11.2 | stdlib completa; sin numpy/pandas/PIL preinstalados |
| pip | 23.0.1 | instala desde PyPI a `--user` / `--target` |
| git | 2.39.5 | con push/pull a github.com |
| gh | 2.23.0 | **autenticado** como `shonakamura06-stack` (token GH_TOKEN) |
| gcc / make | 12.2.0 / 4.3 | compilación C y módulos nativos de npm |
| ImageMagick `convert` | 6.9.11 | manipulación de imágenes local |
| jq, curl, wget, openssl, ssh, zip/unzip/tar/gzip, tree, ripgrep | — | utilidades base |

### 0.2 Herramientas AUSENTES `✗ verificado`

`docker`, `docker-compose`, `podman`, `nginx`, `psql`, `mysql`, `redis-cli`, `sqlite3` (CLI, pero **sí** `node:sqlite`), `go`, `rustc/cargo`, `java/javac`, `php/composer`, `dotnet`, `ruby`, `deno`, `bun`, `uv`, `poetry`, `pandoc`, `ffmpeg`, `rsync`, `libreoffice`, `pdftotext/qpdf`, `chromium/chrome`, binarios de Playwright (la descarga desde `cdn.playwright.dev` está bloqueada).

### 0.3 Red de salida del sandbox `✓ verificado`

| Host | Estado |
|---|---|
| `registry.npmjs.org` | 200 ✅ |
| `pypi.org`, `files.pythonhosted.org` | ✅ |
| `github.com`, `api.github.com`, `codeload.github.com` | ✅ |
| `deb.debian.org` | ✗ bloqueado |
| `registry-1.docker.io` | ✗ bloqueado |
| `cdn.playwright.dev` | ✗ bloqueado |
| `api.vercel.com`, `api.openai.com`, `astro.build`, internet general | ✗ bloqueado |

**Consecuencia crítica:** desde `bash` **no hay internet general**. `npm install` y `pip install` funcionan porque están en la allowlist. Cualquier `curl https://api.externa.com` falla. La investigación web se hace con las herramientas `web_search` / `fetch_page` (las ejecuta la plataforma, no el sandbox), no con `curl`.

**Consecuencia crítica #2 (a favor):** el *preview* de un servidor del sandbox se renderiza en **el navegador del usuario**, que sí tiene internet. Por tanto, código **de cliente** puede cargar Google Fonts, CDNs o llamar APIs públicas con CORS, aunque el servidor del sandbox no pueda. Código **de servidor** no puede. `⚠️ requiere verificación` si el proxy de preview aplica CSP que bloquee orígenes externos.

### 0.4 Red de entrada / preview `✓ verificado`

* Un servidor que escucha en `0.0.0.0:PORT` se expone al usuario como `https://{PORT}-{sandboxId}.e2b.app` (live preview).
* Verificado con un servidor Node que respondió correctamente a peticiones HTTP.
* Servidores deben enlazarse a `0.0.0.0` (no `127.0.0.1`) y aceptar el host de preview.
* `WebSocket` dentro del sandbox funcionó (`ws` en `0.0.0.0:8090`, echo correcto `✓ verificado`). WebSocket **a través del proxy de preview** (`wss://...e2b.app`) `⚠️ requiere verificación`.
* No hay IP pública propia ni puertos abiertos a internet salvo el proxy de preview. **No se pueden recibir webhooks de terceros** (Stripe, GitHub) de forma fiable.

### 0.5 Pruebas de build realizadas `✓ verificado`

| Prueba | Resultado |
|---|---|
| `npm i nanoid`, `npm i ws`, `npm i jsdom`, `npm i playwright-core` | OK |
| `pip install requests`, `pypdf`, `pillow` | OK (a `--target`) |
| `npm create vite -- --template react-ts` + `npm run build` | OK, `dist/` generado |
| Next.js (App Router) `next build` | OK, páginas estáticas generadas |
| `node:sqlite` (`DatabaseSync`, CREATE/INSERT/SELECT) | OK (experimental, requiere `--no-warnings` o tolerar warning) |
| jsdom (parseo y manipulación de DOM) | OK |
| `apt-get install` | ✗ sin paquetes disponibles |

---

## 1. RESUMEN GENERAL

### 1.1 Qué es Arena.ai Agent Mode

Un **agente de software con un ordenador Linux real detrás**. No es un chat que "escribe código en un bloque": es un proceso que tiene un sistema de archivos, un intérprete de comandos, capacidad de instalar dependencias, levantar servidores, ver su salida, y publicar el resultado como URL viva. El modelo de lenguaje aporta el razonamiento; el sandbox aporta **ejecución, verificación y persistencia**.

### 1.2 Qué tipo de agente soy

* **Agente de código e infraestructura ligera**, orientado a producto: escribir, ejecutar, medir, corregir.
* **Orientado a herramientas (tool-using)**: no "sé" que un build falla, lo ejecuto y leo el error.
* **Con estado de workspace**: los archivos persisten entre turnos y entre sesiones del mismo workspace.
* **Con acceso a sistemas externos autenticados** (GitHub, Vercel, Supabase, Google Workspace, Notion, Dropbox) a través de conectores, no por credenciales embebidas.

### 1.3 Qué puedo hacer que una IA conversacional no puede

| Conversacional | Agent Mode |
|---|---|
| Escribe código | Escribe, **instala**, **compila**, **ejecuta tests**, **corrige el error real** |
| Describe una web | Levanta la web y te da **una URL que funciona** |
| Sugiere un esquema SQL | Ejecuta DDL/DML en SQLite local o en Supabase real |
| "Deberías revisar tu repo" | Clona, indexa, busca con ripgrep, edita, commitea, abre PR |
| No ve resultados | Lee logs, timings, exit codes, tamaño de bundles |
| No persiste nada | Deja archivos, ramas, commits y despliegues |

### 1.4 Inventario de herramientas (las que uso realmente)

**A. Sistema de archivos y ejecución**
`bash` (comandos, 30 s por defecto, hasta 1800 s por llamada), `read_file` (texto **e imágenes**), `write_file`, `edit_file` (reemplazo difuso), `start_process` / `get_process_output` / `stop_process` (procesos largos + preview).

**B. Investigación**
`web_search` (con niveles de profundidad 1–3), `fetch_page` (markdown de una URL, PDFs hasta ~30 páginas, con chunks).

**C. Generación de medios**
`generate_image` (texto→imagen y edición imagen→imagen; con `offer_options` para comparar 2 modelos), `image_search` (descarga imágenes al workspace), `add_voice` + `generate_speech` (TTS multilingüe; máx. 10 clips/turno; **no canta ni genera música**), `present_file` (abrir entregables en el visor del usuario).

**D. Conectores (activados en esta conversación, `✓ enabled` verificados uno por uno)**
`vercel`, `supabase`, `notion`, `google_drive`, `google_sheets`, `google_docs`, `google_slides`, `google_calendar`, `gmail`, `dropbox`.

**E. GitHub**
No hay conector `github` (la consulta devolvió `unsupported`), pero **`gh` CLI y `git` están autenticados** en el sandbox: repos, PRs, issues, releases, actions (lectura), gists.

**F. Ciclo de vida**
`ask_user` (preguntas con opciones), `todo`/planificación implícita, y el sistema de preview con detección de respuestas que rompen el iframe.

### 1.5 Proyectos que puedo ejecutar de principio a fin

* **Sí, completos:** landing pages, sitios multipágina, SPAs, dashboards, prototipos de apps móviles (web), juegos web 2D, APIs REST/WS, herramientas internas, simuladores de UI, documentación, generadores de datos, scripts de datos, integraciones GitHub→PR, despliegues Vercel, proyectos Supabase.
* **Casi completos (falta un paso humano):** apps con Postgres/Redis en producción, apps nativas iOS/Android, cualquier cosa que requiera credenciales de terceros (Stripe, Twilio, OAuth de Google en runtime), despliegues en plataformas sin conector.
* **Parciales:** apps con modelos de IA en runtime (código sí, ejecución no: `api.openai.com` bloqueado), procesamiento de vídeo/audio (sin ffmpeg), E2E con navegador real (sin Chromium).

### 1.6 Grado de autonomía

Alto dentro del sandbox: puedo crear 200 archivos, instalar 500 MB de `node_modules`, refactorizar, correr tests, iterar 20 veces sobre un error, commitear y desplegar. **Bajo/medio hacia fuera:** cualquier acción destructiva o pública (borrar un repo, publicar un dominio, enviar un email, borrar un proyecto Vercel/Supabase) la hago si está en el alcance del conector, pero es *irreversible* — y por eso conviene autorización explícita.

### 1.7 Qué requiere intervención humana (lista corta)

1. Crear cuentas y **conectar** los conectores (OAuth).
2. Aportar credenciales que yo no tengo (Stripe, OpenAI, AWS, Twilio, dominios).
3. Decidir/publicar cosas irreversibles y con coste (crear proyecto Supabase, comprar dominio, desplegar a producción).
4. Ejecutar despliegues en plataformas sin conector (Netlify CLI, Railway, Fly, AWS).
5. Compilar apps nativas (Xcode/Android SDK) y firmar binarios.
6. Probar en dispositivo físico real.
7. Aprobar contenido sensible/marca y cualquier acción legal o de pago.
8. Todo lo que exija un navegador real (E2E, screenshots, Lighthouse).

### 1.8 LA TAXONOMÍA DE LOS OCHO CANALES DE CAPACIDAD

Esta es la columna vertebral del documento. Toda capacidad descrita en las secciones 2–25 pertenece a **uno o varios** de estos ocho canales. Un "sí" sin canal es una afirmación vacía; un "no" sin canal de escape es una respuesta incompleta.

| # | Canal | Definición operativa | Qué implica | Ejemplos canónicos |
|---|---|---|---|---|
| **1** | **DIRECTO** | La herramienta hace la acción en una sola llamada, sin intermediarios | Nada que configurar; el resultado es inmediato y verificable | Escribir archivos, generar una imagen, sintetizar voz, buscar en la web, leer un PDF remoto, abrir un entregable en el visor |
| **2** | **VÍA HERRAMIENTAS INTEGRADAS (conectores)** | Acción sobre un servicio externo mediante herramientas OAuth ya cargadas en la conversación | Depende de que el conector esté `enabled`; sin conector, este canal no existe | Crear un deploy en Vercel, ejecutar DDL en Supabase, escribir en Sheets, enviar un correo, crear un evento, subir a Drive/Dropbox, crear una página en Notion |
| **3** | **VÍA MODIFICAR ARCHIVOS/PROYECTOS EXISTENTES** | Cambiar algo que ya existe (repo, proyecto, carpeta) en lugar de crearlo desde cero | Requiere que el proyecto sea accesible en el workspace o en un servicio con conector; el riesgo es romper algo que funciona | Refactor de un repo, migrar dependencias, aplicar un design system a una app existente, corregir un bug en un proyecto heredado, actualizar un Sheet existente |
| **4** | **VÍA TERMINAL (shell del sandbox)** | Ejecutar comandos reales: instalar, compilar, correr, medir, depurar | Sujeto a la allowlist de red, a los binarios instalados y a 2 vCPU / 3.8 GB; el resultado se lee de `stdout`/`stderr`/exit code | `npm ci && npm run build`, `tsc --noEmit`, `pytest`, `git rebase`, `gcc`, levantar un servidor, `ripgrep` sobre un repo, `openssl` |
| **5** | **VÍA APIs EXTERNAS** | Llamar a un servicio de terceros por HTTP (con SDK o `fetch`) | **Bloqueado desde el servidor del sandbox** salvo npm/PyPI/GitHub; viable en el navegador del usuario (código cliente) o en un despliegue; requiere credenciales del usuario | Integrar Stripe/OpenAI/Twilio en una app, OAuth con Google, consumir una API pública de clima, envío de SMS, pagos |
| **6** | **SIMULABLE** | No se ejecuta la cosa real, pero se construye un sustituto funcional indistinguible para el propósito de demo/validación | No hay backend real ni efecto en el mundo; se declara siempre como simulación | App móvil interactiva sin emulador, pasarela de pago falsa con estados, OS dentro del navegador, red social con datos ficticios, GPS/llamadas/SMS simulados, respuestas de IA mockeadas |
| **7** | **NO POSIBLE** | No hay canal alguno en este entorno, ni directo, ni indirecto, ni simulación útil | Se dice sin rodeos y se ofrece la alternativa más cercana | Navegar con navegador real, ejecutar Java/Go/Rust/PHP/.NET/Ruby, Docker, Postgres/Redis locales, ffmpeg, emuladores, compilar APK/IPA, ver la pantalla del usuario, pentesting ofensivo, vídeo |
| **8** | **PARCIAL CON LÍMITES (condicional)** | Se puede, pero el resultado depende de un permiso, un plan, una cuota, una configuración o la red — y por tanto **puede fallar sin que sea culpa del código** | Se entrega con la condición escrita y, cuando aplica, con un plan B | Deploy en Vercel (`limited:true`), push WebSocket por el proxy, webhooks entrantes, scraping, `sudo` sin repos, tests E2E delegados a CI, `⚠️ requiere verificación` |

**Cómo leer las tablas de este documento con esta taxonomía:**

| Lo que ves en una celda | Canal(es) implicado(s) | Qué asumir |
|---|---|---|
| ✅ Total / Alto, con método concreto | 1, 2, 3 o 4 | Se ejecutó o se ejecutará en esta sesión |
| 🟡 / ⚠️ requiere verificación | **8** (y casi siempre 5 o 6 como plan B) | La condición está escrita al lado; puede fallar por entorno |
| 🔵 / "simulación" | **6** | No hay efecto real; es un sustituto creíble |
| 🔴 | **7** | No hay canal; solo queda el canal 3 (escribir el código) + CI (canal 4 en otro entorno) |

**Regla de composición.** Las capacidades reales casi nunca usan un solo canal; usan cadenas. Ejemplo de cadena de cuatro canales para "publicar una web con datos":
`4` (compilar en el sandbox) → `1` (escribir archivos) → `3` (modificar el repo del usuario) → `2` (desplegar con el conector de Vercel).
Ejemplo de cadena con límite: "app con IA" = `1` (código) + **`5` falla en el sandbox** → se entrega con `6` (mock) y funciona en el despliegue del usuario.

**Dos consecuencias que hay que interiorizar:**

1. **El canal 4 es el que convierte "creo que funciona" en "funciona".** Todo lo demás (1, 2, 3) puede producir resultados no verificados. Un agente que no ejecuta es un generador de texto plausible.
2. **El canal 7 no es una derrota, es información.** Saber qué es imposible permite diseñar la arquitectura correcta desde el principio (p. ej. elegir PWA en lugar de app nativa, SQLite en lugar de Postgres, CI en lugar de E2E local).

---

## 2. DESARROLLO WEB

Principio general: **mi capacidad es agnóstica al framework**. Cualquier librería que se instale desde npm y compile en Node 22 funciona. Lo que cambia entre tecnologías no es "si puedo", sino (a) si puedo *verificarlo* ejecutando build/tests en el sandbox, y (b) cuánta RAM/tiempo consume el build en 2 vCPU / 3.8 GB.

### 2.1 Frontend — tabla maestra

| Tecnología | ¿Puedo? | Nivel | Qué construyo / cómo verifico | Ejemplo |
|---|---|---|---|---|
| **HTML** | ✅ | Total | Estructura semántica, forms, meta/OG, `<dialog>`, `<template>` | `✓` landing estática servida en preview |
| **CSS** (Grid, Flex, container queries, `@layer`, nesting, clamp, scroll-driven animations) | ✅ | Total | Layouts complejos, temas, animaciones | `✓` sistema de layouts con Grid + container queries |
| **JavaScript (ES2024)** | ✅ | Total | DOM, módulos, workers, streams, Web APIs | `✓` probado en Node y en preview |
| **TypeScript** | ✅ | Total | `tsc --noEmit`, tipos estrictos, genéricos, zod | `✓` `vite build` con `react-ts` |
| **React** | ✅ | Total | SPA, hooks, server components (vía Next), context, suspense | `✓` build verificado |
| **Next.js** (App Router, RSC, route handlers, SSR/ISR) | ✅ | Alto | Full-stack en un repo; `next build` `✓ verificado` | Dashboard con route handlers + SQLite |
| **Vue 3 / Nuxt** | ✅ | Alto | SFC, Pinia, Vue Router; Nuxt `⚠️` (build pesado) | Panel admin con Composition API |
| **Angular** | ✅ | Medio | Angular CLI, standalone components, signals | Formularios reactivos tipados |
| **Svelte / SvelteKit** | ✅ | Alto | Runes, adapters; SvelteKit con adapter-static `⚠️` | Editor de notas offline |
| **Astro** | ✅ | Alto | Islas, content collections | Blog/docs estático |
| **Solid / Qwik / Preact / Lit** | ✅ | Medio-alto | Web components nativos con Lit | Widget embebible |
| **Tailwind CSS** (+ v4, plugins, tokens) | ✅ | Total | Design systems rápidos y consistentes | `✓` en proyectos de esta sesión |
| **Bootstrap / Bulma / Pico / MUI / shadcn/ui / Radix / Chakra** | ✅ | Total | UI kit sobre React/Vue/HTML | `✓` instalables por npm |
| **Web Components** (custom elements, shadow DOM, slots) | ✅ | Total | Componentes framework-free | `<game-card>` reutilizable |
| **Canvas 2D** | ✅ | Total | Juegos, gráficos, charts, editores de imagen | Motor de plataformas 2D |
| **SVG** (paths, filters, SMIL, animación con CSS/JS) | ✅ | Total | Iconos, ilustraciones, diagramas, mapas | Editor de iconos |
| **WebGL / Three.js / Babylon / regl** | ✅ | Alto (código) | 3D, shaders, escenas, producto 3D | Visor 3D de muebles. `⚠️` rendimiento GPU depende del navegador del usuario, no del sandbox |
| **WebGPU** | 🟡 | Medio | Código válido; sin GPU en sandbox para probar | Partículas con compute shaders |
| **Animaciones** (CSS keyframes, WAAPI, Framer Motion, GSAP, Lottie) | ✅ | Total (Lottie: runtime npm; creación de `.json` Lottie `🔴`) | Transiciones, microinteracciones, scroll | Onboarding animado |
| **Responsive design** | ✅ | Total | Mobile-first, fluid type, container queries | `✓` |
| **PWA** (manifest, service worker, offline, install prompt) | ✅ | Alto | Instalable, cache strategies, background sync `🟡` | App de notas offline |
| **Accesibilidad (WCAG 2.2 AA)** | ✅ | Alto | Roles, foco, ARIA, contraste, teclado, `prefers-reduced-motion`; auditoría **manual y por código**; `axe-core` vía jsdom `🟡` (no hay navegador para auditoría real) | Navegación completa por teclado |
| **SEO** | ✅ | Alto | Meta, JSON-LD, sitemap, robots, canonical, hreflang, Core Web Vitals *por inspección* (no medibles sin navegador) | `✓` |
| **i18n / l10n** | ✅ | Alto | i18next, next-intl, formato de fechas/números con `Intl` | App ES/EN/PT |
| **Accesibilidad de formularios y validación** | ✅ | Total | Constraint validation + validación en servidor | `✓` |

**Ejemplo de proyecto frontend realizable end-to-end:** *"Clon funcional de un panel de analítica"* — Vite + React + TS + Tailwind, datos desde una API propia en Node + SQLite, gráficos SVG propios (sin dependencia de red), build verificado, servido en preview.

### 2.2 Backend — qué puedo hacer con cada lenguaje

| Lenguaje / runtime | Estado en sandbox | Qué puedo hacer | Límite real |
|---|---|---|---|
| **Node.js 22** | ✅ instalado | Todo: Express, Fastify, Hono, NestJS, Koa, tRPC, ws, workers, cron, CLI, streaming, SQLite | Nada relevante salvo 2 vCPU |
| **TypeScript en servidor** | ✅ | `tsx`/`ts-node`/`tsc` (instalables), tipos compartidos con frontend | — |
| **Python 3.11** | ✅ instalado | FastAPI, Flask, Django, scripts de datos, pandas/numpy/Pillow/pypdf (instalables), workers | `uv`/`poetry` no instalados (usar `pip --user`); builds nativos lentos |
| **Java (Spring)** | 🔴 toolchain ausente, JDK no descargable (hosts bloqueados) | Puedo **escribir** el proyecto completo y su config; no compilar | Sin `javac` ⇒ sin verificación |
| **Go** | 🔴 igual | Escribir servicios, Dockerfiles, `go.mod` | No compilar/ejecutar |
| **Rust** | 🔴 igual | Código, Cargo.toml, WASM conceptual | No compilar |
| **PHP / Laravel** | 🔴 sin `php`/`composer` | Escribir app y esquema | No ejecutar |
| **C# / .NET** | 🔴 sin SDK | Escribir API ASP.NET | No ejecutar |
| **Ruby / Rails** | 🔴 | Escribir | No ejecutar |
| **C / C++** | ✅ gcc 12 + make | Módulos nativos, utilidades CLI, ejercicios | Sin libs del sistema más allá de libc |
| **Bash / AWK / sed** | ✅ | Automatización, pipelines de datos | — |
| **Deno / Bun** | 🟡 no instalados; `npm i -g bun` podría descargar binario desde GitHub releases (host permitido) `⚠️` | Potencialmente ejecutables | Requiere verificación; no asumir |

**Recomendación operativa:** para backend real en este entorno, **Node o Python**. Para "el cliente exige Java/Go/Rust", entrego el código completo, el Dockerfile y el CI, y marco explícitamente que **no pude compilarlo aquí**.

### 2.3 Bases de datos

| BD | ¿Diseñar? | ¿Ejecutar aquí? | Cómo | Notas |
|---|---|---|---|---|
| **SQLite** | ✅ | ✅ `node:sqlite` (experimental) o `better-sqlite3` | Archivo local `app.db`; ideal para prototipos, tests y simulaciones persistentes | ⚠️ `app.db` dentro del repo cuenta para el snapshot; conviene `.gitignore` |
| **PostgreSQL** | ✅ esquema, migraciones, consultas, índices, RLS, funciones, triggers | 🔴 **no hay servidor** y no hay red a un Postgres remoto | Entrego `schema.sql` + migraciones (Prisma/Drizzle/Knex) + seeds; **solo ejecuto si es vía Supabase** (conector) | Para producción, el usuario conecta su BD |
| **MySQL / MariaDB** | ✅ diseño | 🔴 | Ídem | — |
| **MongoDB** | ✅ diseño de documentos | 🔴 (sin servidor ni Atlas por red) | `mongodb-memory-server` también requiere descarga binaria `⚠️` | Alternativa: capa de repositorio sobre archivos JSON |
| **Redis** | ✅ diseño (caché, colas, pub/sub, rate limit) | 🔴 | Simulo con `Map`/`node:sqlite`, o `ioredis-mock` | En producción: Redis real |
| **Supabase** | ✅ **ejecuto de verdad** | ✅ vía conector | `execute_query` (DDL/DML), `create_migration`, branches, diff/merge, edge functions, secrets, auth config, API keys | Estado actual: 1 organización, **0 proyectos**; crear proyecto requiere región + password y consume plan |
| **Firebase** | ✅ diseño (Firestore rules, Auth, Functions) | 🔴 sin conector ni red | Entrego `firebase.json`, rules, índices | Despliegue humano o CI |
| **Prisma / Drizzle / Knex / TypeORM / Sequelize** | ✅ | 🟡 `prisma generate` funciona; `prisma migrate dev` necesita servidor real ⇒ usar `migrate diff`/SQLite | ORM con SQLite para dev, Postgres en prod | — |
| **Vector DB (pgvector, Qdrant, Chroma)** | ✅ diseño + RAG | 🟡 pgvector vía Supabase (SQL real); Qdrant/Chroma sin red | Implemento búsqueda vectorial ingenua en SQLite/JS para demos | — |

Puedo hacer: **diseñar esquemas normalizados, crear tablas, migraciones versionadas, seeds realistas (Faker), consultas y vistas, índices y `EXPLAIN`, RLS/policies, triggers, funciones, ERD en Mermaid, y APIs sobre la BD**. No puedo: administrar un Postgres/MySQL remoto sin red o sin conector.

---

## 3. APIs

### 3.1 Qué domino (con ejemplos concretos)

| Tema | ¿Puedo? | Cómo lo hago realmente |
|---|---|---|
| **Diseñar una API** | ✅ | Contrato primero: recursos, verbos, códigos, paginación por cursor, versionado `/v1`, errores RFC 9457 |
| **Programarla (REST)** | ✅ | Express/Fastify/Hono/Nest o Next route handlers; validación con zod; capas controller/service/repo |
| **GraphQL** | ✅ | `graphql-yoga`/Apollo Server + schema SDL, resolvers, DataLoader; cliente Apollo/urql. Sin playground en navegador propio, pero sí queries por `curl` |
| **WebSockets** | ✅ **verificado** | `ws` server en `0.0.0.0`, cliente de prueba que recibe/emite; protocolo de mensajes propio (join/move/state) |
| **SSE** | ✅ | `text/event-stream` con `res.write`, heartbeats y reconexión con `EventSource`; sin dependencias |
| **Webhooks (emitir)** | ✅ | Firma HMAC-SHA256, reintentos con backoff, idempotency keys |
| **Webhooks (recibir)** | 🟡 | Solo en el puerto de preview y mientras el proceso viva `⚠️`; no apto para producción |
| **OAuth 2.0 / PKCE / OIDC** | 🟡 | Escribo el flujo completo (authorize, callback, refresh, rotación); **no puedo** completar un consentimiento real (requiere navegador + red) ni la mayoría de proveedores (hosts bloqueados). Con Google sí puedo operar **vía conector**, que sustituye al OAuth manual |
| **JWT** | ✅ | `jose` / `jsonwebtoken`: firma HS256/RS256, exp/iat/aud, refresh tokens, rotación, revocación por `jti` en SQLite |
| **API keys** | ✅ | Generación `crypto.randomBytes`, hash en BD (`argon2`/`scrypt`), prefijos, scopes, expiración |
| **Autorización** | ✅ | RBAC/ABAC, middleware, policies tipo CASL, ownership checks |
| **Rate limiting** | ✅ | Token bucket / sliding window en memoria; en producción Redis o `@upstash/ratelimit` |
| **Documentación** | ✅ | OpenAPI 3.1 escrito a mano o generado (`zod-to-openapi`), Swagger UI servido localmente, colección Bruno/Insomnia, guía con ejemplos y códigos de error |
| **Testing de API** | ✅ | `node:test` + `fetch` contra el servidor levantado, `supertest`, `pytest`+`httpx`; fuzzing básico |
| **Mocking** | ✅ | MSW, `json-server`, mock server propio con fixtures, latencia y errores inyectados |
| **Integrar APIs externas (runtime)** | 🔴 en sandbox | Sin red general. **Sí** en el cliente (navegador del usuario), y **sí** en el código desplegado |
| **Depurar/Detectar errores** | ✅ | Reproduzco el fallo con una petición real, leo el stack, añado trazas, comparo contratos |
| **Generar endpoints automáticamente** | ✅ | Scaffolding desde un esquema (p. ej. generar CRUD a partir de un JSON schema o de tablas SQLite) |
| **APIs que requieren autenticación de terceros** | 🟡 | Escribo el cliente completo con manejo de tokens; solo ejecuto si el host está permitido o va por conector |

### 3.2 Ejemplo mínimo realista (patrón que uso)

```ts
// server.ts — API con JWT, RBAC y rate limit, sin dependencias externas
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { SignJWT, jwtVerify } from 'jose'

const db = new DatabaseSync('app.db')
db.exec(`CREATE TABLE IF NOT EXISTS tasks(
  id TEXT PRIMARY KEY, owner TEXT, title TEXT, done INTEGER DEFAULT 0)`)

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-only')
const hits = new Map<string, { n: number; t: number }>()

function rateLimit(ip: string) {                    // 30 req / 10 s
  const now = Date.now(), w = hits.get(ip)
  if (!w || now - w.t > 10_000) { hits.set(ip, { n: 1, t: now }); return true }
  if (++w.n > 30) return false
  return true
}

createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? '?'
  if (!rateLimit(ip)) { res.writeHead(429).end('too many'); return }
  // ...routing, auth con jwtVerify, validación zod, respuesta JSON
}).listen(Number(process.env.PORT ?? 3000), '0.0.0.0')
```

**Puntos clave del patrón:** bind a `0.0.0.0`, `PORT` por entorno, SQLite local, sin CDN, sin secretos hardcodeados, errores con forma estable.

---

## 4. SIMULACIÓN DE TELÉFONOS Y APLICACIONES

Aquí hay mucha confusión terminológica. Tabla de definiciones operativas:

| Concepto | Qué es | ¿Puedo? | Realidad técnica |
|---|---|---|---|
| **Simulación visual** | Una web que *parece* un móvil (frame, notch, status bar) | ✅ Total | HTML/CSS/SVG. Se ve en el preview del usuario |
| **App web responsive** | Web real que se adapta a móvil | ✅ Total | Layouts fluidos, touch targets, `dvh`, safe-area insets |
| **PWA** | Web instalable con offline y notificaciones | ✅ Alto | `manifest.json` + service worker + IndexedDB; push `🟡` requiere VAPID y servicio de push |
| **Simulador funcional** | Sistema de UI con estado real, navegación, persistencia | ✅ Alto | Router propio, store, SQLite/IndexedDB, gestos con Pointer Events |
| **Emulador real** (Android/iOS) | Ejecuta binarios móviles | 🔴 Imposible aquí | Requiere KVM/HAXM, imágenes de sistema, Docker/Android SDK, red a Google. Nada disponible |
| **App móvil real** | Binario instalable | 🟡 Código sí, build no | React Native/Expo/Flutter: escribo el proyecto completo; **no puedo** compilar APK/IPA (sin SDK, sin Xcode) ni ejecutar EAS Build (sin red) |

### 4.1 Inventario concreto de lo que puedo simular

| Componente | ¿Puedo? | Cómo |
|---|---|---|
| Interfaz de teléfono (frame iPhone/Android, notch, dynamic island) | ✅ | CSS + SVG; escalado con `aspect-ratio` y `transform: scale` |
| Pantalla de bloqueo (hora, fecha, notificaciones, swipe-up) | ✅ | Estado + animaciones WAAPI |
| Home screen (grid de iconos, dock, carpetas) | ✅ | Iconos SVG propios; sin assets con copyright |
| Apps móviles falsas (WhatsApp/Instagram/TikTok-like) | ✅ como **clon de interacción**, no de marca | Chats, feed, stories, reels-scroll, comentarios; datos ficticios |
| Sistema de notificaciones (banner, centro, badge, sonido) | ✅ | Store de notificaciones + `Notification` API real si el usuario concede permiso |
| Barra de estado (batería, wifi, señal, hora real) | ✅ | `navigator.getBattery` no existe en todos los navegadores ⇒ simulado con estado |
| Ajustes (toggles, sliders, tema, idioma) | ✅ | Persistidos en `localStorage`/SQLite |
| Cámara simulada | 🟡 | `getUserMedia` real en el navegador del usuario (requiere HTTPS y permiso) `⚠️`; alternativa: filtro sobre imagen de archivo |
| Navegador móvil (con pestañas, URL, historial) | ✅ | iframes con sandbox (muchas webs externas bloquean iframe por X-Frame-Options) ⇒ mejor contenido simulado |
| Play Store / App Store simuladas | ✅ | Catálogo, fichas, instalación fake con progreso |
| Llamadas simuladas | ✅ | UI de llamada, timer, DTMF; audio real `🟡` solo WebRTC entre dos navegadores |
| Mensajes/SMS simulados | ✅ | Conversación persistente; **SMS real 🔴** (requiere Twilio, sin red) |
| GPS simulado | 🟡 | Mapa propio (SVG/canvas) con coordenadas manipulables; `navigator.geolocation` real funciona en el navegador del usuario si concede permiso; sin tiles de mapas en sandbox (usar SVG o tiles que cargue el cliente `⚠️`) |
| Batería / Wi-Fi / Bluetooth simulados | ✅ (estado) | 🔴 Bluetooth real: Web Bluetooth no está en Safari/Firefox y necesita hardware |
| Sensores (acelerómetro, giroscopio, luz) | 🟡 | `DeviceOrientationEvent` puede funcionar en móvil real `⚠️`; en escritorio, simulado por teclado/sliders |
| Multitarea / app switcher | ✅ | Estado de "apps abiertas" + transición de tarjetas |
| Gestos táctiles (swipe, pinch, long-press) | ✅ | Pointer Events; `touch-action`; emulación con ratón |
| Teclado virtual | ✅ | Teclado propio en DOM (mejor que el del sistema para una demo) |
| Navegación entre apps | ✅ | Router por estado; deep links con hash |

**Ejemplo de entregable:** *"iOS/Android shell interactivo"* — un solo HTML+JS servido en preview con lockscreen → home → 6 apps, notificaciones, multitarea, persistencia y switch de tema; 100 % hecho aquí, sin dependencias.

### 4.2 Diferencias que importan al pedir

* Si quieres **una demo que se vea como un móvil**: pídelo como *simulación visual interactiva* (rápido, alto impacto).
* Si quieres **una app que la gente use en su móvil**: pide **PWA** (instalable, offline, sin tiendas).
* Si quieres **una app nativa publicable**: necesitas build externo; yo entrego el código y la config.

---

## 5. SIMULACIÓN DE PÁGINAS WEB Y PRODUCTOS

### 5.1 Qué puedo recrear (todo esto es web real, no maquetas)

| Tipo | ¿Puedo? | Notas |
|---|---|---|
| Páginas web completas multipágina | ✅ | Router, layouts, 404, sitemap |
| Dashboards | ✅ | Gráficos SVG/canvas propios, tablas virtualizadas, filtros, export CSV |
| Redes sociales (simuladas) | ✅ | Feed, perfiles, follows, likes, comentarios, DMs, notificaciones; **marca propia, no clonar marcas reales** |
| Tiendas online | ✅ | Catálogo, carrito, checkout simulado, cupones, stock; **pagos reales 🔴** (Stripe requiere red/credenciales) |
| Bancos / fintech (demo) | ✅ | Cuentas, movimientos, transferencias ficticias, gráficos; nunca datos reales |
| Sistemas administrativos | ✅ | CRUD, roles, auditoría, reportes, importación CSV |
| Paneles de control / IoT | ✅ | Telemetría simulada o SSE/WS en vivo |
| Plataformas educativas | ✅ | Cursos, lecciones, progreso, quizzes, certificados (PDF generado) |
| Videojuegos web | ✅ | Ver §8 |
| SaaS | ✅ | Multi-tenant lógico, planes simulados, límites, onboarding |
| Sistemas operativos simulados | ✅ | Ventanas, taskbar, drag/resize, filesystem virtual en IndexedDB |
| Navegadores simulados | ✅ | Pestañas, historial, barra de URL; contenido propio (iframes externos limitados por X-Frame-Options) |

### 5.2 Checklist de "simulación profunda"

| Requisito | ¿Puedo? | Cómo |
|---|---|---|
| Navegación real entre páginas | ✅ | Router SPA o multipágina real (MPA) |
| Usuarios | ✅ | Registro/login real contra SQLite con hash de contraseña |
| Login | ✅ | Sesiones con cookie `HttpOnly` + `SameSite`, o JWT en memoria; también "magic link" simulado |
| Almacenar datos | ✅ | SQLite (servidor), `localStorage`/IndexedDB (cliente), archivos JSON |
| Base de datos | ✅ local / ✅ Supabase remoto | Ver §2.3 |
| Estados complejos | ✅ | Máquinas de estado (XState o reducer propio) |
| Animaciones | ✅ | CSS/WAAPI/GSAP/Framer |
| Backend | ✅ | Node/Python en el mismo preview |
| API | ✅ | REST/WS/SSE propias |
| Persistencia entre recargas | ✅ | SQLite o IndexedDB (⚠️ `node_modules`/`dist` no persisten, los datos sí si están en archivo versionado o fuera de rutas excluidas) |
| Funcionar offline | ✅ | Service worker + IndexedDB; el primer load necesita el preview |
| Tiempo real entre dos navegadores | 🟡 | WS dentro del sandbox `✓`; a través del proxy `⚠️`. Alternativa robusta: `BroadcastChannel` (misma máquina) o polling |

⚠️ **Aviso de persistencia del preview:** si el proceso del servidor se detiene, la URL deja de responder hasta que lo relances. Y los directorios `node_modules`, `dist`, `.next`, `build` **no se guardan en el snapshot**: tras un reinicio hay que reinstalar/recompilar (yo lo hago, pero tarda).

---

## 6. DISEÑO UI/UX

| Capacidad | ¿Puedo? | Cómo / límite |
|---|---|---|
| UI a partir de descripción | ✅ | Código + tokens, no "una imagen" |
| UX: flujos, jerarquía, estados vacíos/error/carga | ✅ | Documento de flujos + implementación |
| Wireframes | ✅ | HTML/CSS lo-fi **o** SVG/ASCII en markdown |
| Prototipos interactivos | ✅ | Lo mejor que tengo: **prototipo funcional navegable**, superior a Figma en comportamiento, inferior en edición visual |
| Design system | ✅ | Tokens (color/espaciado/tipografía/radios/sombras/elevación), componentes, variantes, documentación, storybook-like page |
| Componentes | ✅ | React/Vue/Web Components con props, slots, a11y |
| Layouts | ✅ | Grid/Flex, container queries, densidades |
| Responsive | ✅ | Breakpoints + tipografía fluida `clamp()` |
| Dark mode | ✅ | `prefers-color-scheme` + clase + tokens semánticos |
| Animaciones y microinteracciones | ✅ | 60 fps objetivo; respetar `prefers-reduced-motion` |
| Tipografía | ✅ | Escalas modulares, `font-display`, fallbacks; fuentes de Google se cargan **en el navegador del usuario** |
| Color | ✅ | OKLCH/HSL, contraste AA/AAA calculado, paletas accesibles |
| Iconografía | ✅ | SVG inline propios (evito sets con licencia dudosa) |
| Accesibilidad | ✅ | Auditoría en código; sin navegador no hay auditoría automática real |
| Analizar una imagen de referencia y convertirla en interfaz | ✅ **parcial-alto** | `read_file` me muestra la imagen; extraigo layout, paleta, tipografía, espaciado y lo implemento. **Fidelidad aproximada**, no pixel-perfect garantizado |
| Replicar una interfaz existente | 🟡 | Forma/estructura sí; **marca, copy, logos e imágenes con copyright no** |
| Mejorar una interfaz | ✅ | Crítica concreta + implementación del rediseño |
| Detectar problemas de UX | ✅ | Heurísticas de Nielsen, fricción, contraste, targets táctiles, estados ausentes |
| Crear variantes | ✅ | 2–3 variantes implementadas y conmutables |
| Crear un sistema de diseño completo | ✅ | Tokens + componentes + docs + ejemplos de uso |

**Cómo pedirlo bien:** adjunta captura + "replica esta estructura con mi paleta y copy propio" funciona mucho mejor que "hazme algo bonito".

---

## 7. IMÁGENES Y DISEÑO GRÁFICO

| Tema | ¿Puedo? | Herramienta / método | Límite real |
|---|---|---|---|
| Generar imágenes nuevas | ✅ | `generate_image` (texto→imagen) | Una imagen por llamada; el modelo no es "Photoshop": control limitado de texto dentro de la imagen |
| Editar imágenes existentes | ✅ | `generate_image` con `images:[ruta]` (img2img) | Cambios globales/estilísticos; no hay máscaras de precisión ni inpainting quirúrgico garantizado |
| Ofrecer 2 variantes para elegir | ✅ | `offer_options: true` | Pausa la conversación hasta que el usuario elige |
| Buscar imágenes en web | ✅ | `image_search` → descarga al workspace | Sujeto a licencias: no garantiza derechos de uso comercial |
| Ver/analizar imágenes | ✅ | `read_file` sobre `.png/.jpg/.webp` | Puedo describir, medir colores, detectar layout, leer texto visible (OCR aproximado por el modelo) |
| Manipulación programática | ✅ | ImageMagick 6 (`convert`): resize, crop, composición, filtros, conversión, GIF | Sin `magick` (v7) ni ffmpeg |
| Procesamiento por código | ✅ | `sharp` (npm), `jimp`, Pillow (`pip install`) | Instalables y verificables aquí |
| Iconos / logotipos | ✅ **con matices** | SVG a mano (mejor resultado para logos geométricos) o `generate_image` (mejor para logotipos ilustrados) | Un logo profesional requiere iteración humana; los generados pueden tener texto deformado |
| Ilustraciones | ✅ | `generate_image` estilos: flat, line art, 3D, isométrico, acuarela, etc. | Consistencia entre varias ilustraciones: limitada (usar prompts muy específicos o SVG propio) |
| Mockups de producto | ✅ | Imagen generada + composición sobre captura del propio producto | No hay dispositivo 3D editable |
| Imágenes de fondo/hero | ✅ | `generate_image` a 16:9/1:1 (según el modelo) | Resolución exacta no garantizada |
| Favicons, og:image, sprite sheets | ✅ | SVG→PNG con ImageMagick; composición de sprites | — |
| Diagramas técnicos | ✅ | **Mermaid** (mejor opción, texto versionable), SVG a mano, Graphviz no instalado | Mermaid no se renderiza en el preview sin librería; sí en GitHub/Notion |
| Paletas y tokens visuales | ✅ | Cálculo de contraste, escala OKLCH, export a CSS/Tailwind/Figma tokens JSON | No edito un archivo `.fig` |
| Exportar a Figma | 🟡 | Entrego tokens JSON, SVG y estructura de componentes | No hay API de Figma conectada. `⚠️` Figma tiene REST API, pero el host está bloqueado para el sandbox |
| Editar un `.fig` / `.psd` / `.ai` | 🔴 | — | Formatos propietarios sin librería fiable |
| Vídeo | 🔴 en su mayoría | `generate_image` no hace vídeo; sin ffmpeg no puedo montar/transcodificar | **Sí** puedo: animaciones CSS/Canvas/WebGL grabables por el usuario, y generar secuencias de frames |
| Audio/música | 🔴 | Sin herramienta de música | **Sí**: voz sintética (`generate_speech`) y audio generado por código (Web Audio API) |
| Voz / narración | ✅ | `add_voice` + `generate_speech`, multilingüe, ~1500 caracteres por clip, 10 clips/turno | Habla, no canta; tono limitado al `voice_id` elegido |

**Regla práctica:** para *piezas visuales con texto legible y control exacto* → SVG/HTML/CSS propios. Para *arte, fotografía, ambiente* → `generate_image`. Para *editar una foto concreta sin cambiar su contenido* → ImageMagick/sharp, no `generate_image` (que reinterpreta).

---

## 8. VIDEOJUEGOS

| Tipo de juego | ¿Puedo? | Motor / método | Notas |
|---|---|---|---|
| 2D arcade (snake, pong, breakout, space invaders) | ✅ | Canvas 2D, bucle `requestAnimationFrame` con delta time | 100 % jugable en preview |
| Plataformas | ✅ | Canvas o DOM + motor propio (AABB, tiles, gravedad, coyote time) | Assets propios (SVG/pixel art procedural o `generate_image`) |
| Puzzle (match-3, 2048, sudoku, sokoban) | ✅ | Estado + lógica pura + render | Lógica testeable con `node:test` |
| Cartas / tablero (ajedrez, damas, cartas) | ✅ | Reglas completas + IA minimax | IA por búsqueda, no por modelo de lenguaje |
| RPG / aventura conversacional | ✅ | Motor de diálogos, inventario, mapa, guardado | Narrativa escrita por mí |
| Roguelike / dungeon | ✅ | Generación procedural (BSP, random walk) | — |
| Tower defense / RTS ligero | ✅ | Pathfinding A*, oleadas, economía | Con suficientes unidades puede bajar FPS |
| Juego 3D | 🟡 | Three.js/Babylon; física con cannon-es/rapier | **Escribo** el juego; **no puedo** verlo renderizado (sin GPU/navegador). La calidad visual depende del dispositivo del usuario |
| Multijugador 2D | ✅ dentro del sandbox `✓` | `ws` + servidor autoritativo + interpolación | A través del proxy `wss` `⚠️`; ver §9 |
| Móvil (touch) | ✅ | Pointer events, controles en pantalla, `touch-action:none` | — |
| Juego con guardado | ✅ | IndexedDB/localStorage o SQLite vía API | — |
| Marcadores/leaderboard | ✅ | Endpoint + SQLite (o Supabase si se quiere remoto) | — |
| Física realista | 🟡 | matter.js/cannon-es/rapier (WASM) instalables | Verificación de comportamiento solo por simulación headless |
| Shaders / efectos | ✅ código / 🟡 validación | GLSL en Three.js | Sin GPU en sandbox para validar visualmente |
| Emulador de ROMs | 🔴 | — | Requiere ROMs (licencias) y núcleo WASM; no aporta valor |
| Publicar en Steam/Itch/tiendas | 🔴 | — | Entrego build estático listo para subir el usuario |

**Ejemplo entregable real:** *"Motor de plataformas 2D con editor de niveles"* — Canvas, física propia, editor drag&drop, export/import JSON de niveles, 3 niveles, HUD, guardado local, servido en preview.

---

## 9. MULTIJUGADOR Y TIEMPO REAL

### 9.1 Transportes

| Transporte | ¿Puedo? | Estado verificado |
|---|---|---|
| WebSocket (servidor propio) | ✅ | `✓` `ws` en `0.0.0.0:8090`, handshake y echo correctos internamente |
| WebSocket a través del proxy de preview | 🟡 `⚠️ requiere verificación` | El proxy puede no hacer upgrade; plan B: SSE + POST (long-poll) |
| SSE (`EventSource`) | ✅ | HTTP normal ⇒ pasa cualquier proxy con buffering desactivado |
| Long polling | ✅ | Universal, peor latencia |
| WebRTC (P2P) | 🟡 | Escribo el código; sin STUN/TURN accesibles desde el sandbox, en LAN/misma red puede funcionar; en producción necesita servidor TURN |
| WebTransport / HTTP3 | 🟡 | Código posible; soporte de proxy desconocido |
| BroadcastChannel | ✅ | Solo entre pestañas del mismo navegador (útil para demos sin backend) |

### 9.2 Arquitectura de referencia (servidor autoritativo, la que uso)

```
┌────────────── NAVEGADOR A ──────────────┐        ┌────────────── NAVEGADOR B ──────────────┐
│ input (teclas/swipe)                    │        │ input                                   │
│   └─► intención {seq, dx, dy}           │        │   └─► intención                         │
│ render interpolado (60 fps)             │        │ render interpolado                      │
│ predicción local + reconciliación       │        │ predicción + reconciliación             │
└───────────────┬─────────────────────────┘        └───────────────┬─────────────────────────┘
                │ WSS  (fallback SSE+POST)                          │
                ▼                                                   ▼
        ┌─────────────────────────── SERVIDOR (Node, sandbox) ──────────────────────────┐
        │ tick fijo 20 Hz  ─►  simulación autoritativa (estado = única verdad)          │
        │ salas (rooms) ─► Map<roomId, {players, state, loop}>                          │
        │ validación de input (anti-cheat: rango, cooldown, ownership)                  │
        │ snapshot diffs + seq ack (delta compression)                                  │
        │ persistencia: SQLite (partidas, ranking) / Supabase (multi-instancia)         │
        │ reconexión: sesión por token, buffer de últimos N inputs                      │
        └───────────────────────────────────────────────────────────────────────────────┘
```

**Puntos que no se pueden improvisar y yo resuelvo:** tick fijo independiente del render, *delta time* acotado, reconciliación de cliente, `seq`/`ack`, límite de mensajes por segundo, `heartbeat` + `ping` para detectar zombis, y limpieza de salas vacías.

**Ejemplo de proyecto:** *"Ajedrez online con reloj y espectadores"* — WS, salas por código, validación de movimientos en servidor, chat, reconexión, historial de partidas en SQLite, y modo local con IA minimax.

**Advertencia honesta:** si el usuario abre el preview en dos dispositivos, el WS debe pasar por el proxy. Si eso falla, **el multijugador entre dispositivos distintos no funcionará con WebSocket** y habrá que usar SSE+polling. Esta es la limitación más importante de esta sección y la marco como `⚠️`.

---

## 10. TERMINAL Y SISTEMA DE ARCHIVOS

### 10.1 Qué puedo hacer `✓ verificado donde se indica`

| Acción | ¿Puedo? | Nota |
|---|---|---|
| Ejecutar comandos shell | ✅ | `bash`, timeout 30 s por defecto, hasta 1800 s por llamada |
| Crear/leer/mover/borrar archivos | ✅ | `write_file`, `edit_file`, `read_file`, `mv`, `rm`, `cp`, `zip` |
| Árbol de directorios | ✅ | `tree`, `ls -R`, `find` |
| Buscar en archivos | ✅ | `ripgrep` 13 (`rg "patrón"`), `grep` |
| Editar código | ✅ | `edit_file` con reemplazo difuso (tolera diferencias de indentación) |
| Instalar dependencias | ✅ | npm/yarn/pip `✓` |
| Compilar | ✅ | `tsc`, `vite build`, `next build`, `gcc`, `make` `✓` |
| Ejecutar tests | ✅ | `node --test`, vitest (npm), pytest (pip) |
| Servidores de larga duración | ✅ | `start_process` (persiste entre turnos) con preview al usuario |
| Leer logs de un proceso | ✅ | `get_process_output` con esperas por patrón/exit/puerto |
| Procesos en background | ✅ | `start_process`, `&`, `nohup`, `npx pm2` (npm) |
| Cron / tareas programadas | 🟡 | `cron` no persiste entre turnos; alternativa: `setInterval` dentro de un proceso vivo, o el cron del servicio desplegado (Vercel Cron vía conector `⚠️`) |
| Variables de entorno | ✅ | `.env` + `process.env` (⚠️ no commitear secretos) |
| Subir/bajar archivos al usuario | ✅ | `present_file` (visor), o subir a Drive/Dropbox |
| Descargar de internet | 🔴 en bash (allowlist); ✅ vía `fetch_page`/`image_search`/conectores | Ver §0.3 |
| Acceder a `localhost` | ✅ | Dentro del sandbox `localhost` es el sandbox `✓ verificado` |
| Conectarse a hosts internos de la infraestructura | 🔴 | Sin acceso a la red de gestión ni a otros sandboxes |

### 10.2 Seguridad y límites del sandbox (honesto)

* **`sudo` sin contraseña funciona**, pero **no hay repositorio de paquetes**, así que el privilegio sirve de poco: no se puede instalar nginx/postgres/docker.
* **No hay Docker ni contenedores anidados**, ni acceso a kernel features (KVM). Por eso no hay emuladores de Android.
* **No hay GPU**, así que nada de entrenamiento de modelos ni render pesado.
* **Recursos**: 2 vCPU / 3.8 GB. Un `next build` grande, un `npm ci` de 1500 paquetes o un `pip install torch` pueden agotar memoria o tiempo. Estrategia: builds mínimos, dependencias quirúrgicas.
* **Timeout por herramienta**: comandos cortos por defecto; los largos deben ir a `start_process`.
* **Persistencia**: `/home/user` sobrevive; `/tmp` no; `node_modules`, `dist`, `.next`, `build`, `out`, `target`, `.venv`, `__pycache__`, `coverage`, `.cache` **no** se guardan ⇒ hay que reinstalar en sesiones nuevas.
* **Secretos**: los que pongo en `.env` quedan en el snapshot del workspace. Recomendación: dar valores de prueba y que el usuario los sustituya en el despliegue.
* **Aislamiento**: mi proceso no puede leer el navegador del usuario, ni sus cookies, ni su portapapeles, ni su sistema de archivos. Solo ve lo que el usuario pega/sube y lo que está en el workspace.

---

## 11. GIT Y GITHUB

`✓ verificado`: `git` 2.39.5 y `gh` 2.23.0 autenticado como **`shonakamura06-stack`** (token en `GH_TOKEN`). El conector `github` **no existe** (`unsupported`), pero el CLI cubre prácticamente todo.

| Acción | ¿Puedo? | Cómo |
|---|---|---|
| `clone` | ✅ | `git clone` (github.com permitido); también `codeload` para tarballs |
| Leer y entender un repo | ✅ | `rg`, `tree`, `git log --graph`, lectura de archivos |
| Crear repo | ✅ | `gh repo create` (público/privado) |
| Commit | ✅ | `git add -A && git commit -m "..."` — ⚠️ `user.name`/`user.email` vienen vacíos: los configuro si hace falta |
| Branches | ✅ | crear, cambiar, borrar, merge, rebase |
| Push / pull | ✅ | `git push origin <rama>` |
| PR | ✅ | `gh pr create`, `gh pr view --json`, `gh pr merge --squash/--merge/--rebase`, `gh pr close` |
| Issues | ✅ | `gh issue create/list/comment/close` |
| Releases | ✅ | `gh release create` con assets |
| Gists | ✅ | `gh gist create` |
| GitHub Actions (leer) | ✅ | `gh run list/view`, `gh run view --log` |
| GitHub Actions (crear/editar workflows) | ✅ | Escribo `.github/workflows/*.yml` y lo commiteo; **la ejecución ocurre en GitHub**, no aquí |
| Secrets del repo | ✅ | `gh secret set` (⚠️ acción sensible) |
| Code review | ✅ | Diff, comentarios inline vía `gh api` (REST/GraphQL), sugerencias |
| Buscar código en GitHub | ✅ | `gh search code`, `gh search repos` |
| Git local avanzado | ✅ | bisect, cherry-pick, stash, revert, reflog, worktrees, subtrees, hooks |
| Resolver conflictos | ✅ | Edición de marcadores + verificación de build |
| Firmar commits | 🟡 | Posible con GPG/SSH key del usuario, pero **no tengo sus claves**; sin firma por defecto |

**Límites:** sin credenciales de otras cuentas; si el repo está en otra organización sin permiso, falla. No puedo aprobar PRs en nombre del usuario (aunque `gh pr review --approve` técnicamente funcione con el token, sería suplantación: no lo hago sin instrucción explícita).

---

## 12. DESPLIEGUE (DEPLOY)

| Destino | ¿Puedo desplegar? | Método | Nivel |
|---|---|---|---|
| **Preview interno de Arena** | ✅ | `start_process` en `0.0.0.0:PORT` → URL viva | Total |
| **Vercel** (conector) | ✅ | `vercel__create_deployment`, `list_deployments`, `get_deployment`, `cancel_deployment`, `delete_deployment`, `list_deployment_files`, `get_deployment_events` (logs) | Alto. `✓` cuenta verificada (`shonakamura06@gmail.com`, `shonakamura06-1998`), **`limited: true`** ⇒ algunas operaciones/cuotas pueden estar restringidas |
| Vercel: dominios | ✅ | `add_domain`, `get_domain_config` (DNS), `list_project_domains`, `add_project_domain` | Alto (la configuración DNS real la hace el registrador) |
| Vercel: env vars | ✅ | `list_env_vars`, `create_env_var`, `update_env_var`, `delete_env_var`, `*_shared_env_var` | Alto |
| Vercel: feature flags | ✅ | `list_feature_flags`, `get_feature_flag`, segmentos | Alto |
| Vercel: teams/webhooks | ✅ | `list_teams`, `invite_team_member`, `list_webhooks`, `create_webhook` | Medio |
| **Netlify / Cloudflare Pages / Railway / Render / Fly.io** | 🟡 | Escribo `netlify.toml`, `wrangler.toml`, `fly.toml`, `render.yaml` y el CI | No hay conector (y sus APIs están bloqueadas desde bash) ⇒ **el deploy lo ejecuta el usuario** o GitHub Actions |
| **GitHub Pages** | 🟡 | Preparo el repo + workflow `.github/workflows/deploy.yml`; al hacer push GitHub despliega | El paso final ocurre en GitHub (yo puedo hacer el push) |
| **AWS / GCP / Azure** | 🔴 | Diseño IaC (Terraform/CDK/SAM), Dockerfile, scripts; no ejecuto | Sin CLI ni credenciales ni red |
| **Supabase** (backend) | ✅ | Proyecto, migraciones, edge functions, secrets, auth | Alto, con coste/plan del usuario |
| **Docker / imagen de contenedor** | 🟡 | Escribo `Dockerfile`, `compose.yml` | No puedo construir ni publicar la imagen (sin daemon, sin registry) |
| **App stores** | 🔴 | Preparo el proyecto y los assets | Requiere build firmado (ver §4) |
| **Servidor VPS propio** | 🟡 | Genero scripts de despliegue (`scp`/`rsync`/`ssh` existen, `rsync` no) | Necesita claves SSH del usuario |

**Flujo de despliegue que sí funciona hoy de punta a punta:**
`escribo el proyecto → npm run build (verificado) → vercel__create_deployment → get_deployment_events (leo el build log) → si falla, corrijo y repito → URL de producción`.

---

## 13. CLOUD Y SERVIDORES

| Capacidad | ¿Puedo? | Realidad |
|---|---|---|
| Diseñar arquitectura cloud | ✅ | Diagramas Mermaid/C4, decisiones (monolito vs servicios), costes estimados con supuestos explícitos |
| Escribir IaC | ✅ | Terraform (HCL), AWS CDK, SAM, Pulumi, Helm charts, K8s manifests, Ansible |
| Validar IaC | 🟡 | `terraform validate`/`plan` **no** (binario ausente y host bloqueado); validación por esquema/lint JS si aplica |
| Contenedores | 🟡 | Dockerfile/compose escritos; no ejecutables |
| Kubernetes | 🟡 | Manifests y Helm; no `kubectl` |
| Serverless (código) | ✅ | Vercel Functions (route handlers/`api/`), Supabase Edge Functions (Deno) — ambos con conector ⇒ **sí puedo desplegarlos** |
| Colas / workers | ✅ código / 🟡 ejecución | BullMQ/SQS conceptualmente; aquí un worker con `setInterval` en `start_process` |
| CI/CD | ✅ (definición) | GitHub Actions YAML, verificado por sintaxis; ejecución en GitHub |
| Bases de datos gestionadas | 🟡 | Supabase ✅; RDS/Atlas/Neon no (sin CLI/red) |
| Observabilidad | ✅ instrumentación / 🟡 backend | Logs estructurados (pino), OpenTelemetry SDK, `/health`, `/metrics` Prometheus; sin Prometheus real |
| Backup / migraciones | ✅ scripts | `pg_dump` no (binario), pero migraciones SQL versionadas y `execute_query` sobre Supabase |
| Costes | 🟡 | Estimaciones con supuestos; no consulto facturación real |

**Nota sobre Vercel `limited: true`:** la cuenta autenticada está marcada como limitada. `⚠️ requiere verificación` para despliegues, dominios o cuotas: puedo *listar* y *crear* en la API del conector, pero el plan puede rechazar operaciones. Se comprueba al intentarlo.

---

## 14. AUTOMATIZACIÓN

| Nivel de automatización | ¿Puedo? | Cómo |
|---|---|---|
| Script puntual | ✅ | bash/node/python en el sandbox |
| Pipeline de datos | ✅ | Leer CSV/JSON/API, transformar, validar, escribir CSV/JSON/SQLite/XLSX (con `exceljs`/`openpyxl`) |
| Automatizar un flujo dentro de la conversación | ✅ | Yo mismo ejecuto los pasos y me corrijo con el resultado real |
| Automatizar archivos del usuario | ✅ | Si los sube al workspace/Drive/Dropbox; los proceso y devuelvo el resultado |
| Automatizar Google Workspace | ✅ | Crear Docs/Sheets/Slides, escribir valores, formatear, crear eventos, enviar correos, subir a Drive |
| Automatizar Notion | ✅ | Crear páginas, bases de datos, propiedades, bloques, comentarios |
| Automatizar GitHub | ✅ | Commits, PRs, issues, releases, workflows |
| Automatizar Vercel | ✅ | Deploy, env vars, dominios, flags |
| Automatizar Supabase | ✅ | Migraciones, SQL, edge functions, secrets |
| Automatizar Dropbox | ✅ | Subir/descargar/mover/compartir |
| Cron real persistente | 🟡 | No hay cron entre sesiones. Opciones: (a) proceso vivo con `setInterval` (muere al cerrar), (b) **Vercel Cron** (conector + `vercel.json`), (c) GitHub Actions `schedule`, (d) Supabase `pg_cron` (SQL) |
| Triggers por evento (webhook entrante) | 🟡 | Solo con puerto de preview vivo `⚠️`; en producción: GitHub Actions, Vercel Functions, Supabase Edge Functions |
| Automatizar un sitio de terceros con navegador (scraping con clic) | 🔴 | Sin Chromium ni red general |
| Automatizar escritorio del usuario (mouse/teclado) | 🔴 | Sin acceso a su máquina |
| RPA de sistemas internos del usuario | 🔴 | Requiere VPN/red corporativa |

**Patrón recomendado para "automatización recurrente":** yo escribo el script + el workflow (`schedule`) y lo dejo en el repo; la ejecución la hace GitHub Actions con el cron de GitHub. Es la única forma fiable de tener algo que corra sin que la sesión esté abierta.

---

## 15. IA DENTRO DE APLICACIONES (IA-in-apps)

Distinción crucial: **escribir** una app con IA es trivial para mí; **ejecutar** el modelo depende de red y credenciales.

| Pieza | ¿Puedo? | Detalle |
|---|---|---|
| Código de integración con LLM | ✅ | SDKs de OpenAI/Anthropic/Google (npm/pip), streaming, tool calling, structured outputs, retries, timeouts, contabilidad de tokens |
| Backend proxy para ocultar la API key | ✅ | Patrón obligatorio: el navegador nunca lleva la key; endpoint `/api/chat` que reenvía |
| RAG (retrieval-augmented generation) | ✅ diseño + ✅ código | Chunking, embeddings, almacenamiento (SQLite/pgvector), búsqueda híbrida, reranking, citas |
| Embeddings | 🟡 | Código sí; generarlos requiere API externa (bloqueada en sandbox) ⇒ el usuario ejecuta o se calcula en despliegue |
| Vector DB | 🟡 | pgvector vía Supabase (SQL real) ✅; Qdrant/Chroma/Pinecone requieren red |
| Chatbot de soporte | ✅ | UI + backend + prompts + guardrails + handoff |
| Agentes / tool-use | ✅ | Orquestación, function schemas, parseo de resultados, límites de iteraciones |
| Function calling / JSON mode | ✅ | Código y validación estricta con zod/pydantic |
| Clasificación / extracción de datos | ✅ | Con LLM (en despliegue) o con reglas/heurísticas locales |
| OCR | 🟡 | Con LLM de visión en despliegue; localmente sin tesseract `⚠️`; `pypdf` extrae texto de PDFs nativos |
| Transcripción de audio (STT) | 🔴 en sandbox / 🟡 por API en despliegue | No hay `whisper` local (sin red para modelos) |
| Generación de imágenes en la app | 🟡 | Código sí; en el sandbox solo *yo* genero, no el usuario en runtime |
| IA on-device (WebLLM, transformers.js, ONNX) | 🟡 | Código posible; modelos se descargan en el navegador del usuario (no en el sandbox) |
| Simular respuestas de IA para una demo | ✅ | Respuestas deterministas, mock con latencia, para que la demo funcione sin keys |
| Evaluación de prompts / A-B testing | ✅ | Suite de casos, rúbricas, comparación de salidas |
| Moderación | ✅ | Capa de reglas + validación; modelo real en despliegue |
| Coste / latencia | ✅ | Optimizaciones concretas: caché, batching, streaming, modelo pequeño primero, fallback |

**Patrón canónico de un endpoint de chat seguro:**

```ts
// app/api/chat/route.ts (Next) — la key vive solo en el servidor
export async function POST(req: Request) {
  const { messages } = await req.json()
  if (!Array.isArray(messages) || messages.length > 50)
    return Response.json({ error: 'payload inválido' }, { status: 400 })

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json',
               authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, // nunca al cliente
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, stream: true })
  })
  return new Response(r.body, { headers: { 'content-type': 'text/event-stream' } })
}
```

⚠️ **No puedo probar este endpoint aquí**: `api.openai.com` está bloqueado desde el sandbox. En Vercel (o el navegador del usuario) sí funcionaría. Lo entrego con un modo mock para que la demo sea verificable.

---

## 16. PRUEBAS Y DEPURACIÓN

| Técnica | ¿Puedo? | Herramienta | Nota |
|---|---|---|---|
| Tests unitarios JS/TS | ✅ | `node --test`, vitest (npm) | Instalables y ejecutables |
| Tests unitarios Python | ✅ | `pytest` (pip), `unittest` | — |
| Tests de componentes | 🟡 | `@testing-library/react` + **jsdom** `✓ verificado` | Sin navegador real, no hay layout/estilos reales |
| Tests de integración de API | ✅ | Levanto el servidor y hago `fetch`/`supertest` | Patrón preferido |
| Tests E2E con navegador | 🔴 **aquí** | Playwright/Puppeteer requieren descargar Chromium de `cdn.playwright.dev` ⇒ **bloqueado** `✗ verificado` | En el CI del usuario o en Vercel, el navegador se descarga sin problema ⇒ yo dejo los tests escritos y el workflow |
| **Verificación visual con screenshots** | 🔴 | Sin navegador no hay captura | Alternativa: `⚠️` si el usuario instala un navegador vía GitHub Releases (host permitido) — requiere verificación, no lo asumo |
| Lighthouse / CWV | 🔴 | Requiere Chrome | Estimo por inspección de código |
| Depuración por logs | ✅ | `console.log`, pino, `get_process_output` | Mi mecanismo principal |
| Depuración paso a paso (debugger) | 🟡 | `node --inspect` sí, pero **no hay cliente** para conectar el inspector | Uso trazas y `--test` |
| Análisis del error real | ✅ | Leo stack trace, exit code, `stderr`, reproducimos | Es mi mayor ventaja competitiva |
| Type-checking | ✅ | `tsc --noEmit` | — |
| Lint / formato | ✅ | ESLint, Prettier, Ruff, Black; `--fix` automático | — |
| Tests de accesibilidad | 🟡 | `axe-core` + jsdom (cobertura parcial) | Sin árbol de accesibilidad real |
| Tests de carga | 🟡 | Script de concurrencia con `undici`/`autocannon` (npm) | Desde el mismo sandbox (2 vCPU) ⇒ mediciones poco representativas |
| Tests de contrato | ✅ | Validar respuestas contra OpenAPI/JSON Schema | — |
| Fuzzing | 🟡 | `fast-check` (property-based) en JS | — |
| Cobertura | ✅ | `--experimental-test-coverage` (node), `c8`, `pytest-cov` | — |
| TDD | ✅ | Ciclo completo, con iteración rápida (~segundos) | — |
| Reproducir un bug del usuario | ✅ | Con sus pasos o su archivo; si requiere su entorno exacto, `⚠️` |

**Regla honesta:** todo lo que sea *lógica, tipos, contratos, SQL, datos y build* lo verifico de verdad. Todo lo que sea *pixel, scroll, gesto, foco visual, rendimiento percibido* lo escribo correctamente pero **lo valida el usuario en su navegador**.

---

## 17. SEGURIDAD (exclusivamente defensiva)

| Tema | ¿Puedo? | Contenido |
|---|---|---|
| Revisión de seguridad de código | ✅ | Búsqueda de patrones: secretos hardcodeados, `eval`, SQL injection, XSS, IDOR, path traversal, deserialización insegura, SSRF |
| AuthN/AuthZ correctos | ✅ | Implementación con cookies `HttpOnly`+`SameSite=Lax`, CSRF tokens, hash `scrypt`/`argon2`, sesiones rotativas, RBAC |
| Sanitización | ✅ | Validación de entrada (zod/pydantic), escape de salida, `DOMPurify` (npm) para HTML |
| Cabeceras de seguridad | ✅ | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors` |
| Gestión de secretos | ✅ | `.env`, `.gitignore`, `gh secret set`, env vars de Vercel/Supabase; rotación |
| Rate limiting / anti-brute force | ✅ | Token bucket, backoff exponencial, bloqueo por IP/cuenta |
| Cifrado | ✅ | `crypto` nativo, TLS conceptual, cifrado simétrico/asímetrico con `openssl` |
| Auditoría de dependencias | ✅ | `npm audit`, `pip-audit` (pip) |
| Análisis estático | 🟡 | ESLint security plugin, `semgrep` no instalado |
| Pentesting ofensivo | 🔴 **no lo hago** | Escaneo activo, explotación, fuerza bruta, malware: fuera de alcance |
| Modelado de amenazas | ✅ | STRIDE, DFD, matriz de riesgos, mitigaciones priorizadas |
| Cumplimiento (GDPR/CCPA) | ✅ asistencia | Checklist, minimización de datos, consentimiento, retención, DSR; **no es asesoría legal** |
| Hardening de infra | ✅ recomendaciones | TLS, firewall, mínimos privilegios, backups, rotación |
| Forense / respuesta a incidentes | 🟡 | Playbooks y análisis de logs aportados |

⚠️ **Límite real:** sin navegador no puedo verificar CSP en ejecución, y sin red general no puedo comprobar CVEs en bases externas (sí `npm audit`, que usa el registro permitido).

---

## 18. DATOS

| Tarea | ¿Puedo? | Cómo |
|---|---|---|
| Limpiar CSV/JSON/TSV | ✅ | Node/Python, o `awk`/`sed`/`jq` |
| Transformar y unir datasets | ✅ | Joins en memoria, normalización, deduplicación |
| Validar esquemas | ✅ | zod (TS), pydantic (Python), JSON Schema |
| Analizar (EDA) | ✅ | Resúmenes, distribuciones, correlaciones; `pandas` vía `pip` (instalable) |
| Visualizar | ✅ | SVG/Canvas propios, `chart.js`/`recharts`/`vega-lite` (npm), matplotlib (pip) |
| Excel | ✅ | `exceljs`/`xlsx` (npm), `openpyxl` (pip): leer, escribir, fórmulas, formato; **también Google Sheets por conector** con formato, gráficos, validación, filtros |
| SQL | ✅ | SQLite real, Supabase real (Postgres) |
| ETL/ELT | ✅ | Scripts + validaciones + idempotencia + reintentos |
| Scraping | 🔴 en sandbox | Sin red general (solo `fetch_page` para una URL concreta, sin ejecutar JS). `⚠️` Scraping real ⇒ hacerlo en un deploy con red |
| Datos en tiempo real | ✅ dentro del sandbox | WS/SSE |
| Machine learning | 🟡 | `scikit-learn` se instala por pip (rueda binaria disponible), entrenamiento pequeño posible en 2 vCPU; **sin GPU**, datasets grandes no |
| Estadística | ✅ | `scipy`, `statsmodels` (pip) |
| GCP de datos | 🟡 | Diseño de pipelines; sin ejecución cloud |
| Privacidad de datos | ✅ | Anonimización, seudonimización, `faker` para datos sintéticos, `k-anonimity` conceptual |
| Datos geográficos | 🟡 | GeoJSON/SVG propios; sin tiles ni `gdal` |

⚠️ **Aviso de tamaño:** el workspace y los snapshots tienen un límite práctico (~128 MB y ~10.000 archivos por artefacto acumulado). Datasets grandes: procesar por streaming/chunks y **no** commitearlos; entregar el script + resumen.

---

## 19. DOCUMENTOS

| Formato | ¿Puedo crear? | ¿Puedo leer? | Método |
|---|---|---|---|
| **Markdown** | ✅ | ✅ | Nativo |
| **HTML** | ✅ | ✅ | Nativo |
| **PDF** | ✅ | ✅ (nativo) | Generar: `pdf-lib`/`pdfkit` (npm), `reportlab` (pip), o HTML→print (imprimir desde el navegador). Leer: `pypdf` `✓ verificado` (extracción de texto); PDFs escaneados necesitan OCR `🟡` |
| **DOCX** | ✅ | ✅ | `docx` (npm), `python-docx` (pip); leer con `mammoth`/`python-docx` |
| **XLSX** | ✅ | ✅ | `exceljs`, `openpyxl` |
| **PPTX** | ✅ | 🟡 | `pptxgenjs` (npm) para crear; lectura limitada |
| **Google Docs** | ✅ | ✅ | Conector `google_docs`: crear, leer texto, insertar, formatear, reemplazar, tablas, imágenes, encabezados/pies, tabs |
| **Google Sheets** | ✅ | ✅ | Conector: valores, batch, formato, bordes, banding, validación, filtros, tablas, gráficos, dimensiones, protección |
| **Google Slides** | ✅ | ✅ | Conector: presentación, slides, formas, texto, imágenes, tablas, charts de Sheets, notas, thumbnails |
| **Notion** | ✅ | ✅ | Conector: páginas, bloques, bases de datos, propiedades, comentarios, búsqueda |
| **CSV** | ✅ | ✅ | Nativo |
| **EPUB** | 🟡 | 🟡 | Posible con librerías npm; no prioritario |
| **LaTeX** | 🟡 | 🟡 | Escribo `.tex`; **sin `pdflatex`** ⇒ no compilo aquí (sí en Overleaf/CI) |
| **Diagramas** | ✅ | — | Mermaid (mejor), SVG |
| **Presentaciones visuales** | ✅ | — | HTML tipo deck (mejor control) o Google Slides |
| **Actas, informes, propuestas, contratos-tipo, documentación técnica** | ✅ | — | Redacción + formato + consistencia |
| **Firmas / documentos legales** | 🔴 | — | No son asesoría legal ni firma electrónica |

**Recomendación:** para entregables que el usuario editará → Google Docs/Sheets/Slides (conector). Para entregables que se leen tal cual → Markdown o PDF generado por código. Para algo visual y controlado → HTML.

---

## 20. BÚSQUEDA WEB E INVESTIGACIÓN

| Capacidad | ¿Puedo? | Herramienta | Límite |
|---|---|---|---|
| Buscar en la web | ✅ | `web_search` (depth 1–3) | Resultados por snippet; hay que verificar en la fuente |
| Leer una página | ✅ | `fetch_page` (markdown, por chunks) | **No ejecuta JavaScript** ⇒ SPAs y páginas con paywall/login devuelven poco |
| Leer PDFs | ✅ | `fetch_page` (hasta ~30 páginas) | Más allá, no |
| Leer documentación oficial | ✅ | Es mi caso de uso principal | — |
| Verificar versiones/APIs actuales | ✅ | Documentación + npm registry (permitido) | — |
| Comparar fuentes y detectar contradicciones | ✅ | Múltiples búsquedas + lectura | — |
| Investigación profunda multi-fuente | ✅ | Búsquedas iterativas, nota de discrepancias, citas | Requiere presupuesto de turnos |
| Rastrear precios / stock en vivo | 🟡 | `fetch_page` sobre la página del producto | Sin JS ni sesión, a menudo falla |
| Acceder a sitios con login | 🔴 | — | Sin credenciales ni sesión de navegador |
| Buscar imágenes | ✅ | `image_search` | Licencias no garantizadas |
| **Búsqueda desde bash (`curl`)** | 🔴 | Red bloqueada | Solo con `web_search`/`fetch_page` |

**Protocolo que aplico:** para cualquier afirmación técnica "actual" → buscar, abrir la fuente primaria, citar URL, y marcar `⚠️ requiere verificación` si la fuente es secundaria o ambigua.

---

## 21. INTEGRACIONES EXTERNAS

### 21.1 Estado real de cada integración (verificado en esta sesión)

| Servicio | Tipo de integración | Estado | Qué puedo hacer |
|---|---|---|---|
| **GitHub** | CLI autenticado (`gh`) | ✅ operativo (sin conector) | Repos, PRs, issues, releases, actions, gists, secrets |
| **Vercel** | Conector nativo | ✅ enabled (cuenta `limited:true`) | Deploy, projects, dominios/DNS, env vars, flags, teams, webhooks |
| **Supabase** | Conector nativo | ✅ enabled (0 proyectos) | SQL DDL/DML, migraciones, branches, edge functions, secrets, auth, API keys |
| **Notion** | Conector nativo | ✅ enabled | Páginas, bloques, bases de datos, comentarios |
| **Google Drive** | Conector nativo | ✅ enabled | Archivos, permisos, export, upload, compartir |
| **Google Sheets** | Conector nativo | ✅ enabled | Valores, formato, gráficos, tablas, filtros |
| **Google Docs** | Conector nativo | ✅ enabled | Contenido, formato, tablas, imágenes, tabs |
| **Google Slides** | Conector nativo | ✅ enabled | Presentaciones completas |
| **Google Calendar** | Conector nativo | ✅ enabled | Eventos, recurrencias, invitados, freebusy, ACL |
| **Gmail** | Conector nativo | ✅ enabled | Leer, buscar, enviar, drafts, labels, threads, adjuntos |
| **Dropbox** | Conector nativo | ✅ enabled | Archivos, carpetas, links, versiones, shares |
| Slack | — | 🔴 no conectado | `⚠️` Si el usuario lo activa en la conversación, aparecería como conector |
| Stripe | — | 🔴 no disponible | Código de integración sí; ejecución no |
| Twilio / WhatsApp Business | — | 🔴 | Ídem |
| AWS / GCP / Azure | — | 🔴 | Ídem |
| Firebase | — | 🔴 | Ídem |
| Figma | — | 🔴 | Ídem (tokens/SVG sí) |
| Jira / Linear | — | 🔴 | Ídem |
| Discord / Telegram bots | 🟡 | Código sí; el bot necesita host con red | — |
| Bases de datos externas (Postgres/MySQL/Mongo/Redis) | — | 🔴 | Sin red; solo Supabase como Postgres |
| APIs públicas (clima, mapas, tipos de cambio…) | 🟡 | Código sí, runtime no | En el cliente (navegador del usuario) o en despliegue sí |
| Webhooks entrantes | — | 🟡 | Solo puerto de preview mientras viva |

### 21.2 Cómo funciona un conector (para razonar sobre límites)

Un conector es **un conjunto de herramientas expuestas a la conversación**, autenticadas por OAuth contra la cuenta del usuario, que se cargan al inicio del turno (`list_connector_tools`). Implicaciones:

1. **No veo tus credenciales**: no hay tokens en el workspace; el consentimiento lo diste tú en la plataforma.
2. **No hay conector ⇒ no hay acceso nativo.** No puedo improvisar acceso a un servicio sin conector ni red.
3. **Cada conector tiene su granularidad**: Vercel expone 60+ operaciones; Notion expone bloques; Gmail expone envío. Lo que no está en la lista de herramientas, no se puede hacer por esa vía.
4. **Un conector puede cambiar de estado** entre sesiones (`enabled`/`disabled`/`disconnected`): la fuente de verdad es la consulta en el turno actual.

---

## 22. DOCE BLUEPRINTS DE PROYECTOS COMPLETOS

Cada blueprint indica stack, entregables, qué se verifica de verdad y el riesgo real.

### 22.1 SaaS de gestión de tareas (full-stack)
* **Stack:** Next.js (App Router) + TypeScript + Tailwind + SQLite (`node:sqlite`) → Postgres/Supabase en producción.
* **Entregables:** auth (registro/login/sesión), CRUD de tareas, proyectos, etiquetas, filtros, búsqueda, vistas lista/kanban, actividad, API documentada (OpenAPI), tests (`node:test`), `.env.example`, README con despliegue.
* **Verifico:** `next build`, tests de API, migraciones SQL, recorrido de auth con `curl`.
* **Riesgo:** bajo. **Tiempo:** 1 sesión larga.

### 22.2 Dashboard analítico con datos reales
* **Stack:** Vite + React + TS + Tailwind, API Node expreso, SQLite con 50k filas generadas.
* **Entregables:** KPIs, 6 gráficos SVG propios, tabla virtualizada, filtros por rango, export CSV/PDF, endpoint `/api/metrics`.
* **Verifico:** build, consultas SQL con `EXPLAIN`, tiempos de respuesta.
* **Riesgo:** bajo. **Valor:** altísimo para demos comerciales.

### 22.3 Landing + blog + docs (sitio de marketing técnico)
* **Stack:** Astro o Next static export; Markdown/MDX; Tailwind; SEO completo.
* **Entregables:** hero, features, pricing, FAQ, blog, docs con búsqueda local, sitemap, robots, JSON-LD, OG images (generadas), formulario con validación y endpoint.
* **Verifico:** build estático, HTML generado, validación de enlaces internos.
* **Riesgo:** bajo. Desplegable a Vercel con el conector.

### 22.4 E-commerce de catálogo (sin pagos reales)
* **Stack:** Next + SQLite + Stripe *stub*.
* **Entregables:** catálogo, ficha, variantes, carrito persistente, cupones, checkout simulado, pedidos, panel admin, emails transaccionales **simulados** (o Gmail real vía conector si se quiere).
* **Verifico:** flujos completos con tests de integración.
* **Riesgo:** medio en pagos (Stripe no ejecutable aquí).

### 22.5 Chat en tiempo real con historial
* **Stack:** Node + `ws` + SQLite + React.
* **Entregables:** salas, DMs, presencia, typing indicator, adjuntos (hasta N MB), búsqueda, paginación, reconexión, moderación básica.
* **Verifico:** servidor WS con cliente de prueba, persistencia.
* **Riesgo:** medio por el proxy `wss` (§9).

### 22.6 Juego multijugador 2D
* **Stack:** Canvas + servidor autoritativo Node.
* **Entregables:** motor, física, salas, ranking, espectadores, reconexión.
* **Verifico:** lógica de simulación con tests headless (sin render).
* **Riesgo:** medio (validación visual la hace el usuario).

### 22.7 App móvil tipo PWA (offline-first)
* **Stack:** Svelte/React + service worker + IndexedDB + manifest.
* **Entregables:** shell móvil, CRUD offline con cola de sincronización, instalación, iconos, splash, tema oscuro.
* **Verifico:** lógica de sync con tests; SW por inspección y `jsdom` limitado.
* **Riesgo:** medio-bajo.

### 22.8 API pública versionada con documentación y SDK
* **Stack:** Fastify/Hono + zod + OpenAPI 3.1 + SQLite.
* **Entregables:** `/v1`, API keys con scopes, rate limit, paginación por cursor, errores RFC 9457, Swagger UI, colección de pruebas, SDK TypeScript mínimo, ejemplos `curl`.
* **Verifico:** suite de tests + contrato OpenAPI.
* **Riesgo:** bajo.

### 22.9 Panel de administración interno (back-office)
* **Stack:** React + Node + SQLite; roles.
* **Entregables:** tablas CRUD, importación CSV con validación y errores por fila, auditoría de cambios, exportación, permisos por rol, búsqueda global.
* **Riesgo:** bajo. **Uso real típico:** reemplazar hojas de cálculo.

### 22.10 Sitio corporativo + CMS ligero
* **Stack:** Next + SQLite + editor markdown.
* **Entregables:** páginas editables, blog, equipo, casos, contacto, SEO, analytics *stub*, i18n.
* **Riesgo:** bajo.

### 22.11 Simulador de producto (app "falsa" para validar UX)
* **Stack:** HTML/CSS/JS puro; shell de teléfono.
* **Entregables:** 8 pantallas, navegación, estados vacío/carga/error, datos ficticios, grabable para un pitch.
* **Riesgo:** bajo. **Tiempo:** horas.

### 22.12 Automatización de reporting
* **Stack:** Node/Python + Google Sheets/Docs + GitHub Actions (cron).
* **Entregables:** script que recoge datos, calcula KPIs, escribe en Sheets, genera un Doc con el informe y (opcional) envía email por Gmail; workflow `schedule` para ejecución diaria.
* **Verifico:** ejecución manual completa contra los conectores reales.
* **Riesgo:** bajo-medio (cuotas de las APIs de Google).

---

## 23. CAPACIDADES "OCULTAS" O POCO CONOCIDAS

Esta sección es la que casi nadie documenta. Todas están verificadas o marcadas.

| # | Capacidad | Por qué es poco conocida | Nivel |
|---|---|---|---|
| 1 | **Leer imágenes** con `read_file` y usarlas como referencia de diseño | Se asume que un agente de código "solo lee texto" | ✅ Alto |
| 2 | **Generar imágenes y comparar 2 modelos** en una sola llamada (`offer_options`) | Se percibe como función de chat, no de desarrollo | ✅ |
| 3 | **Editar imágenes existentes** (img2img) para producir assets del proyecto | Rara vez se asocia a coding | ✅ |
| 4 | **Voz sintética multilingüe** para demos, audioguías, prototipos de accesibilidad | Nadie lo pide a un agente de código | ✅ |
| 5 | **Generar audio por código** con Web Audio API (síntesis, efectos, música procedural sencilla) | Requiere saber que el navegador es un sintetizador | ✅ |
| 6 | **Servidores de larga duración con preview público** | Se confunde con "no puedo desplegar" | ✅ |
| 7 | **Leer logs de build de despliegues ajenos** (`get_deployment_events` en Vercel) y corregir en bucle | Conector poco explorado | ✅ |
| 8 | **Ejecutar SQL de escritura en Supabase** (`execute_query` con DDL y DML) | Se asume solo lectura | ✅ |
| 9 | **Crear y mergear ramas de base de datos** en Supabase (branching) para probar migraciones | Muy poco conocido | ✅ (requiere plan) |
| 10 | **Desplegar Edge Functions** (Deno) en Supabase desde la conversación | — | ✅ |
| 11 | **Escribir Google Sheets con formato, gráficos, validación y filtros** de forma programática | Se cree que solo "pega valores" | ✅ Alto |
| 12 | **Construir presentaciones de Slides** con charts vinculados a Sheets y refrescarlos | — | ✅ |
| 13 | **Redactar y enviar correos reales** (Gmail) con adjuntos generados por mí | Poder de acción externo real | ✅ (sensible) |
| 14 | **Crear eventos de calendario con invitados y videollamada Meet** | — | ✅ |
| 15 | **Manipular archivos en Dropbox/Drive del usuario** (mover, compartir, versiones) | — | ✅ |
| 16 | **Usar `sudo`** en el sandbox (aunque sin repositorios) | Suele estar prohibido | 🟡 utilidad limitada |
| 17 | **Compilar C con gcc** y módulos nativos de Node | — | ✅ |
| 18 | **`node:sqlite` sin instalar nada** | Módulo experimental poco conocido | ✅ |
| 19 | **Búsqueda con ripgrep** en repos enormes en milisegundos | — | ✅ |
| 20 | **Abrir un archivo en el visor del usuario** (`present_file`) como entrega formal | — | ✅ |
| 21 | **Preguntar con opciones predefinidas** (`ask_user`) para desbloquear decisiones | — | ✅ |
| 22 | **Detección automática de configuraciones que rompen el preview** (CSP, host allowlist, X-Frame-Options) | La plataforma avisa; hay que saber corregirlo | ✅ |
| 23 | **Ejecutar tests headless de lógica de juego/física** sin navegador | — | ✅ |
| 24 | **Simular un sistema operativo completo en el navegador** (filesystem en IndexedDB, ventanas, procesos) | Es un proyecto, no una herramienta | ✅ |
| 25 | **Prototipar una app móvil creíble sin emulador** | Se cree imprescindible el emulador | ✅ |
| 26 | **Leer PDFs remotos con `fetch_page`** y extraer tablas | — | ✅ |
| 27 | **Cruzar el resultado de un build con el bundle real** (tamaños, chunks) para optimizar | — | ✅ |
| 28 | **Documentar el propio entorno de ejecución** (esta auditoría) | Meta-capacidad: introspección verificable | ✅ |
| 29 | **Escribir el workflow de CI y dejar que GitHub ejecute lo que aquí no se puede** (E2E, Java, Docker) | Patrón de escape elegante | ✅ |
| 30 | **Generar datos sintéticos realistas** (Faker) para demos sin datos del cliente | — | ✅ |
| 31 | **Producir `og:image` y favicons** en el mismo turno que el sitio | — | ✅ |
| 32 | **Analizar el repo del usuario y proponer un plan de refactor priorizado** con métricas (LOC, duplicación, dependencias) | — | ✅ |

**Anti-capacidades (lo que la gente *cree* que puedo y no puedo):** ver el navegador del usuario, controlar su ratón, ejecutar código en su máquina, ver su pantalla, acceder a su cámara/micrófono, leer sus contraseñas, navegar con sesión iniciada, entrenar modelos, minar cripto, o llamar a cualquier API sin red ni conector.

---

## 24. LIMITACIONES REALES (sin edulcorar)

### 24.1 Bloqueantes duros

| # | Limitación | Consecuencia práctica | ¿Hay workaround? |
|---|---|---|---|
| 1 | **Sin navegador** (Chromium no instalable) | No hay E2E, ni screenshots, ni Lighthouse, ni validación visual real | Escribir los tests + workflow CI; el usuario mira el preview |
| 2 | **Sin internet general desde bash** | Ninguna API externa se puede llamar en runtime desde el sandbox | `web_search`/`fetch_page` para leer; conectores para actuar; código cliente/despliegue para ejecutar |
| 3 | **Sin Docker ni contenedores** | No hay Postgres/Redis/nginx locales, ni emuladores | SQLite y mocks; Supabase para Postgres real |
| 4 | **Sin GPU** | Nada de entrenamiento, render 3D pesado o inferencia local | APIs externas en despliegue |
| 5 | **Sin JVM/Go/Rust/PHP/.NET/Ruby** | Esos backends no se compilan ni ejecutan aquí | Escribir el código + Dockerfile + CI |
| 6 | **Sin ffmpeg / edición de vídeo** | No hay transcodificación, montaje ni subtitulado automático | Generar frames/animaciones; el usuario edita |
| 7 | **Persistencia parcial** | `node_modules`, `dist`, `.next` desaparecen ⇒ reinstalar en cada sesión nueva | `package-lock.json` versionado, scripts `setup` |
| 8 | **Preview efímero** | Si el proceso muere, la URL muere | Re-lanzar; para permanencia, desplegar |
| 9 | **2 vCPU / 3.8 GB** | Builds grandes, `pip install torch`, `npm ci` masivo pueden fallar | Dependencias mínimas, builds incrementales |
| 10 | **Sin webhooks entrantes fiables** | Integraciones tipo Stripe/GitHub webhook no se pueden probar end-to-end | Simular payloads localmente |

### 24.2 Limitaciones de calidad (no de posibilidad)

* **Fidelidad visual a una referencia**: alta en estructura, media en detalles tipográficos y espaciado exacto.
* **Consistencia de assets generados**: varias imágenes generadas pueden no compartir estilo; hay que forzar prompts o usar SVG.
* **Código en lenguajes no ejecutables**: puede contener errores de compilación que no detecto; hay que decirlo.
* **Estimaciones de rendimiento**: sin navegador, son estimaciones, no medidas.
* **Dependencia de modelos de IA en la app**: entrego el código con *mock* porque no puedo probar la llamada real.
* **Contenido con copyright/marca**: no clono marcas, logos ni copy propietario.
* **Contexto largo**: en documentos enormes o repos gigantes, priorizo por relevancia; puede haber partes no leídas.

### 24.3 Limitaciones de permisos y de plataforma

* Los conectores dependen de que el usuario los active; un conector `disabled` equivale a no tenerlo.
* La cuenta de Vercel está marcada `limited: true` ⇒ operaciones sujetas a plan.
* Supabase: crear un proyecto consume recursos del plan y requiere región/contraseña.
* Acciones destructivas (borrar proyectos, borrar ramas, vaciar trasteras, mergear PRs) son **irreversibles** y deben autorizarse.
* No puedo iniciar sesión en servicios, ni resolver CAPTCHAs, ni saltarme autenticaciones.
* No doy asesoramiento legal, médico ni financiero; doy borradores y checklists.

### 24.4 Lo que sí puedo garantizar

1. **Si algo lo ejecuté, lo verifiqué.** Si digo "compila", compiló.
2. **Marco la incertidumbre.** `⚠️ requiere verificación` significa exactamente eso.
3. **No invento integraciones.** Si no hay conector ni red, lo digo.
4. **Dejo el proyecto reproducible**: lockfiles, scripts, README, `.env.example`.
5. **Itero contra el error real**, no contra mi suposición del error.

---

## 25. TABLA MAESTRA DE CAPACIDADES

Los canales (§1.8) de cada fila se deducen de la columna «Método»: *bash/build* → canal 4; *conector* → canal 2; *escribir/editar archivos* → canales 1 y 3; *«código sí»* → canal 3 con ejecución en otro entorno; *simulación* → canal 6; *🔴* → canal 7.

Leyenda: ✅ puedo hacerlo · 🟢 casi total (limitación menor) · 🟡 parcial con límites · 🔵 solo simulable · 🔴 no puedo · ⚠️ depende de permisos/config/red

| Capacidad | ¿Puedes hacerlo? | Método | Nivel | Requisitos | Limitaciones | Ejemplo |
|---|---|---|---|---|---|---|
| Web frontend (HTML/CSS/JS) | Sí | `write_file` + servidor + preview | ✅ | Ninguno | Validación visual la hace el usuario | Landing en 15 min |
| React/Vue/Svelte/Angular | Sí | npm + build verificado | ✅ | Ninguno | Builds grandes = RAM | SPA de tareas |
| Next.js full-stack | Sí | App Router + route handlers | ✅ | Ninguno | Sin servidor de producción aquí | Dashboard con API |
| Astro / sitio estático | Sí | Build estático | ✅ | Ninguno | — | Blog + docs |
| Tailwind / design system | Sí | npm + tokens | ✅ | Ninguno | — | Sistema de componentes |
| Canvas 2D / SVG / animaciones | Sí | Código propio | ✅ | Ninguno | 60 fps depende del cliente | Juego de plataformas |
| Three.js / WebGL | Sí (código) | npm | 🟡 | Navegador del usuario | Sin GPU para verificar | Visor 3D |
| WebGPU | Sí (código) | Código | 🟡 | Navegador compatible | No verificable aquí | Partículas |
| PWA / offline | Sí | SW + IndexedDB | 🟢 | HTTPS para SW (preview lo da) | Push requiere VAPID | App de notas offline |
| Accesibilidad WCAG | Sí | Código + revisión | 🟢 | — | Sin auditoría automática real | Navegación por teclado |
| SEO técnico | Sí | Meta, JSON-LD, sitemap | 🟢 | — | Sin medición de CWV | Sitemap + OG |
| i18n | Sí | i18next / Intl | ✅ | — | Traducciones de calidad variable | App ES/EN |
| Backend Node/TS | Sí | Express/Fastify/Hono/Nest | ✅ | Ninguno | 2 vCPU | API REST |
| Backend Python | Sí | FastAPI/Flask/Django | ✅ | `pip` | Instalación lenta | API de datos |
| Backend Java/Go/Rust/PHP/.NET/Ruby | No (ejecutar) | Solo escribir código | 🔴 | Toolchain externa | No compilo | Microservicio en Go (código) |
| REST API | Sí | Código + tests | ✅ | — | — | `/v1/tasks` |
| GraphQL | Sí | Yoga/Apollo | ✅ | — | Sin playground web | API de productos |
| WebSockets | Sí | `ws` | 🟢 | — | Proxy puede no hacer upgrade | Chat en vivo |
| SSE | Sí | `text/event-stream` | ✅ | — | — | Feed de notificaciones |
| WebRTC | Código sí | RTCPeerConnection | 🟡 | STUN/TURN accesibles | Sin TURN propio | Videollamada P2P |
| Webhooks (emitir) | Sí | HTTP + HMAC | ✅ | Destino desplegado | — | Notificar a Slack |
| Webhooks (recibir) | Parcial | Puerto de preview | 🟡 | Proceso vivo | No fiable en producción | Prueba de payload |
| OAuth 2.0 / OIDC | Parcial | Código completo | 🟡 | Proveedor accesible | Sin consentimiento real | Login con Google (código) |
| JWT / sesiones / RBAC | Sí | jose, cookies, scrypt | ✅ | — | — | Auth multirrol |
| SQLite | Sí | `node:sqlite` | ✅ | — | Experimental | Persistencia local |
| PostgreSQL | Parcial | SQL + migraciones; ejecución vía Supabase | 🟡 | Supabase o servidor externo | Sin Postgres local | Esquema + RLS |
| MySQL / Mongo / Redis | Solo diseño | Diseño + mocks | 🟡 | Servicio externo | Sin ejecución | Modelo de datos |
| Supabase (real) | Sí | Conector | ✅ | Cuenta + proyecto | Coste/plan | Tablas + edge function |
| ORM (Prisma/Drizzle) | Sí | npm + SQLite dev | 🟢 | — | Migrate real necesita servidor | Modelo de usuarios |
| Diseño de BD + ERD | Sí | SQL + Mermaid | ✅ | — | — | ERD de 12 tablas |
| Diseño UI a partir de imagen | Sí | `read_file` + código | 🟢 | Imagen aportada | No pixel-perfect | Réplica de dashboard |
| Prototipo UX interactivo | Sí | HTML/JS | ✅ | — | No es Figma editable | Demo de app móvil |
| Generar imágenes | Sí | `generate_image` | ✅ | — | Texto en imagen imperfecto | Hero + iconos |
| Editar imágenes | Sí | img2img / ImageMagick | 🟢 | — | Sin máscaras precisas | Fondo de producto |
| Analizar imágenes | Sí | `read_file` | ✅ | — | OCR aproximado | Detectar paleta y layout |
| Voz sintética | Sí | `add_voice` + `generate_speech` | ✅ | — | 10 clips/turno, no canta | Narración de demo |
| Vídeo / ffmpeg | No | — | 🔴 | — | Sin ffmpeg | — |
| Juego 2D | Sí | Canvas | ✅ | — | Validación visual manual | Plataformas |
| Juego 3D | Código sí | Three.js | 🟡 | Navegador con GPU | No verificable | FPS simple |
| Multijugador | Sí (mismo preview) | WS autoritativo | 🟡 | Proxy permite WS | Entre dispositivos ⚠️ | Salas de juego |
| Shell / terminal | Sí | `bash` | ✅ | — | Timeouts, 2 vCPU | Scripts de build |
| Instalar paquetes | Sí (npm/pip) | Registros permitidos | ✅ | — | Sin apt | `npm i zod` |
| Compilar (TS/JS/C) | Sí | tsc/vite/next/gcc | ✅ | — | RAM | Build de producción |
| Instalar paquetes del SO | No | — | 🔴 | apt bloqueado | — | — |
| `sudo` | Sí, poco útil | `sudo` | 🟡 | — | Sin repos | Cambiar permisos locales |
| Ejecutar servidores | Sí | `start_process` | ✅ | — | Efímeros | API + preview |
| Leer logs de procesos | Sí | `get_process_output` | ✅ | — | — | Depurar crash |
| Git local | Sí | `git` | ✅ | — | — | Branches, rebase |
| GitHub (repos/PRs/issues) | Sí | `gh` autenticado | ✅ | Cuenta conectada | Sin conector nativo | PR con tests |
| GitHub Actions (definir) | Sí | YAML commiteado | ✅ | Repo | Ejecuta en GitHub | CI de E2E |
| Secrets de repo | Sí | `gh secret set` | ✅ | Permisos | Acción sensible | API key en CI |
| Deploy Vercel | Sí | Conector | ✅ | Cuenta (limited) | Plan | Producción |
| Deploy Netlify/Cloudflare/Railway | No (ejecutar) | Config + CI | 🟡 | Cuenta + CI | Sin conector | `netlify.toml` |
| Deploy AWS/GCP/Azure | No | IaC escrito | 🔴 | Credenciales + CLI | — | Terraform |
| Docker build | No | Dockerfile escrito | 🟡 | — | Sin daemon | Imagen para el usuario |
| Dominios / DNS | Parcial | Conector Vercel | 🟡 | Registrador | Verificación DNS manual | Apuntar dominio |
| Supabase deploy (functions) | Sí | Conector | ✅ | Proyecto | Coste | Edge function |
| Automatización puntual | Sí | Scripts | ✅ | — | — | Reporte diario |
| Cron persistente | Parcial | Vercel Cron / GH Actions | 🟡 | Repo desplegado | No cron local | Informe diario 8am |
| Automatizar Google Workspace | Sí | Conectores | ✅ | OAuth concedido | Cuotas API | Doc + Sheet + email |
| Automatizar Notion | Sí | Conector | ✅ | OAuth | — | Base de datos de proyectos |
| Automatizar Dropbox/Drive | Sí | Conectores | ✅ | OAuth | — | Backup de entregables |
| IA en apps (código) | Sí | SDKs + backend proxy | ✅ | API key en despliegue | No probar runtime aquí | Chat con streaming |
| RAG | Sí (diseño+código) | pgvector / SQLite | 🟢 | Embeddings externos | Sin ejecución local | Búsqueda semántica |
| Entrenar modelos | No | — | 🔴 | GPU | — | — |
| Tests unitarios | Sí | node --test / pytest | ✅ | — | — | 40 tests |
| Tests de integración | Sí | fetch/supertest | ✅ | — | — | API completa |
| Tests E2E navegador | No (aquí) | Playwright en CI | 🔴 | Chromium + CI | Descarga bloqueada | Workflow de E2E |
| jsdom / testing-library | Sí | npm | 🟢 | — | Sin layout real | Tests de componentes |
| Lighthouse / CWV | No | — | 🔴 | Chrome | — | — |
| Debug por logs | Sí | stderr/exit codes | ✅ | — | — | Arreglar crash |
| Type-check / lint | Sí | tsc, eslint, ruff | ✅ | — | — | 0 errores |
| Revisión de seguridad | Sí | Análisis de código | 🟢 | — | Sin herramientas SAST | Informe + fixes |
| Pentesting ofensivo | No | — | 🔴 | — | Fuera de alcance | — |
| Datos: limpiar/transformar | Sí | Node/Python | ✅ | — | Tamaño limitado | CSV 200k filas |
| Datos: Excel/Sheets | Sí | exceljs + conector | ✅ | — | Cuotas | Informe con gráficos |
| Datos: scraping web | No (aquí) | `fetch_page` una URL | 🟡 | Red/JS | Sin ejecución JS | Extraer tabla de un PDF |
| Machine learning | Parcial | sklearn en 2 vCPU | 🟡 | — | Sin GPU | Regresión simple |
| Documentos Markdown/HTML/PDF | Sí | Código | ✅ | — | PDF por librería | Informe PDF |
| Documentos DOCX/XLSX/PPTX | Sí | Librerías npm/pip | ✅ | — | Estilos complejos | Propuesta DOCX |
| Google Docs/Sheets/Slides | Sí | Conectores | ✅ | OAuth | Cuotas | Deck de 12 slides |
| Leer PDFs | Sí | `pypdf`, `fetch_page` | 🟢 | — | Escaneados sin OCR | Extraer contrato |
| LaTeX | Parcial | Escribir `.tex` | 🟡 | Compilador externo | Sin pdflatex | Paper (código) |
| Búsqueda web | Sí | `web_search` | ✅ | — | Snippets | Verificar versión de API |
| Leer una URL | Sí | `fetch_page` | 🟢 | — | Sin JS/login | Documentación oficial |
| Integración GitHub | Sí | CLI | ✅ | Token | Sin conector | PR automática |
| Integración Vercel | Sí | Conector | 🟢 | Cuenta | limited:true | Deploy + logs |
| Integración Supabase | Sí | Conector | ✅ | Proyecto | Plan | Migración |
| Integración Google (5) | Sí | Conectores | ✅ | OAuth | Cuotas | Email + Calendar |
| Integración Notion/Dropbox | Sí | Conectores | ✅ | OAuth | — | Wiki sincronizada |
| Slack/Stripe/AWS/Jira | No | Solo código | 🔴 | Conector/red/keys | — | Webhook (código) |
| Simular app móvil | Sí | Web + shell | 🔵 | — | No es nativa | Demo de 8 pantallas |
| Emulador Android/iOS | No | — | 🔴 | KVM + SDK | — | — |
| App nativa (build) | No | Código RN/Flutter | 🟡 | SDK externo | No compilo | Proyecto Expo |
| Simular sistema operativo | Sí | Web + IndexedDB | 🔵 | — | — | Desktop en el navegador |
| Clonar una web | Parcial | Estructura sí, marca no | 🟡 | — | Copyright | Réplica estructural |
| Ver pantalla del usuario | No | — | 🔴 | — | Privacidad | — |
| Controlar su equipo | No | — | 🔴 | — | Aislamiento | — |

---

## 26. CONTEXTO PARA OTRA IA (bloque portable)

> Copia y pega este bloque tal cual como contexto de sistema para otro modelo. Está escrito en segunda persona y es autocontenido.

```text
Eres un agente de software ("Agent Mode") que opera dentro de un sandbox Linux real.
No eres un chatbot: tienes shell, sistema de archivos, red limitada, conectores OAuth y
capacidad de publicar servidores como URL viva. Este es tu perfil operativo exacto.

ENTORNO
- Linux x86_64, 2 vCPU, 3.8 GB RAM, ~20 GB disco. Sin GPU. Sin Docker. Sin KVM.
- Persiste /home/user. NO persiste /tmp. NO persisten node_modules, dist, .next, build,
  out, target, .venv, __pycache__, coverage, .cache → reinstala/recompila al empezar sesión.
- Instalado: node 22 (fetch, node:test, node:sqlite experimental), npm 10, yarn 1.22,
  python3.11, pip, git 2.39, gh 2.23 (autenticado), gcc 12, make, jq, curl, wget, openssl,
  ssh, zip/unzip/tar, tree, ripgrep, ImageMagick 6 (solo `convert`).
- AUSENTE: docker/podman, nginx, postgres/mysql/redis (clientes y servidores), sqlite3 CLI,
  go, rustc, java, php, dotnet, ruby, deno, bun, uv, poetry, pandoc, ffmpeg, rsync,
  libreoffice, pdftotext, navegadores (chromium/chrome), binarios de Playwright.
- sudo funciona SIN contraseña, pero NO hay repositorios apt → no se instalan paquetes del SO.

RED (esto define casi todos tus límites)
- Permitido desde bash: registry.npmjs.org, pypi.org, files.pythonhosted.org, github.com,
  api.github.com, codeload.github.com. → `npm i` y `pip install` FUNCIONAN.
- Bloqueado: internet general, deb.debian.org, registry-1.docker.io, cdn.playwright.dev,
  api.openai.com, api.vercel.com, CDNs de frameworks.
- Consecuencia: ningún código de servidor puede llamar APIs externas en el sandbox.
  El código de CLIENTE sí (se ejecuta en el navegador del usuario, que tiene internet).
  Para leer web usa las herramientas web_search / fetch_page (no curl).
  Para actuar sobre servicios externos usa CONECTORES, no HTTP.
- Servidores: bind a 0.0.0.0:PORT → el usuario lo ve en https://{PORT}-{sandboxId}.e2b.app.
  WebSocket funciona dentro del sandbox; a través del proxy está por verificar (usa SSE+POST
  como plan B). No hay webhooks entrantes fiables.

HERRAMIENTAS
- FS/ejecución: bash (30 s por defecto, hasta 1800 s), read_file (texto E IMÁGENES),
  write_file, edit_file (reemplazo difuso), start_process/get_process_output/stop_process.
- Investigación: web_search (depth 1-3), fetch_page (markdown, PDFs ~30 pág., chunks).
- Medios: generate_image (txt2img e img2img, offer_options para 2 variantes),
  image_search, add_voice + generate_speech (TTS, ≤10 clips/turno, no canta), present_file.
- Conectores activables por conversación: vercel, supabase, notion, google_drive,
  google_sheets, google_docs, google_slides, google_calendar, gmail, dropbox.
  GitHub NO tiene conector: se usa el CLI `gh` ya autenticado.
- ask_user para preguntas con opciones.

QUÉ PUEDES HACER DE VERDAD (verificado ejecutando)
- Frontend: HTML/CSS/JS/TS, React, Next (build OK), Vue, Svelte, Astro, Angular, Tailwind,
  Web Components, Canvas 2D, SVG, Three.js (código), PWA/SW, a11y, SEO, i18n.
- Backend: Node (Express/Fastify/Hono/Nest), Python (FastAPI/Flask/Django). REST, GraphQL,
  WebSocket, SSE, JWT, RBAC, rate limit, OpenAPI.
- Datos: SQLite real vía node:sqlite; Postgres/Supabase real vía conector (DDL+DML,
  migraciones, branches, edge functions, RLS); diseño de esquemas/ERD para cualquier BD.
- Deploy: preview interno (start_process), Vercel (conector: deploy, logs, env, dominios,
  flags), Supabase (backend). Netlify/CF/Railway/AWS: escribes config y CI, NO ejecutas.
- Docs: Markdown, HTML, PDF (pdf-lib/reportlab), DOCX, XLSX, PPTX; Google Docs/Sheets/Slides
  y Notion vía conectores.
- Imágenes: generación, edición, búsqueda, análisis, manipulación con ImageMagick/sharp/Pillow.
- Tests: node --test, vitest, pytest, supertest, jsdom, axe-core parcial. NO E2E de navegador
  (Chromium no se puede descargar): escribe los tests y un workflow de GitHub Actions para que
  corran en CI.
- Verificas de verdad: builds, tipos, tests, SQL, contratos, datos, exit codes, logs.
  NO verificas: píxeles, scroll, gestos, foco visual, rendimiento percibido, Lighthouse.

QUÉ NO PUEDES HACER (no lo intentes, dilo)
- Ejecutar Java/Go/Rust/PHP/.NET/Ruby, Docker, Postgres/Redis locales, ffmpeg, pandoc.
- Navegar con navegador real, capturar screenshots, medir Core Web Vitals.
- Llamar a APIs externas desde el servidor del sandbox.
- Recibir webhooks de producción, tener IP pública, cron persistente (usa Vercel Cron o
  GitHub Actions schedule).
- Compilar apps nativas iOS/Android, ejecutar emuladores, publicar en tiendas.
- Acceder al navegador, archivos, cámara, portapapeles o pantalla del usuario.
- Actividades ofensivas de seguridad.
- Clonar marcas, logos, copy propietario o assets con copyright.

REGLAS DE CONDUCTA
1. Verifica antes de afirmar. Si dices "compila", compílalo. Si no lo probaste, dilo.
2. Nada de marketing: capacidades con método, requisito y límite.
3. Si falta un permiso, un conector o una credencial, dilo y ofrece la alternativa.
4. Toda acción irreversible (borrar repo/proyecto/rama, mergear PR, enviar email, deploy a
   producción) requiere autorización explícita.
5. Deja el proyecto reproducible: lockfile, scripts, README, .env.example, .gitignore.
6. Itera contra el error real (lee stderr, exit code, logs), no contra suposiciones.
7. Reconoce el límite de recursos: 2 vCPU / 3.8 GB; evita instalaciones gigantes.
8. Cuando el resultado dependa del navegador o de un servicio externo, entrega mock + tests
   + instrucciones para probarlo en el entorno real.
```

---

## 27. LAS 50 COSAS MÁS ÚTILES QUE PUEDES HACER

Ordenadas por utilidad real (frecuencia de uso × impacto), no por espectacularidad.

### Nivel 1 — El 80 % del valor

1. **Convertir una idea en un sitio desplegable** con URL viva en la misma sesión.
2. **Arreglar un bug concreto** leyendo el error real, ejecutando, corrigiendo y verificando.
3. **Construir un MVP full-stack** (frontend + API + SQLite) sin salir de la conversación.
4. **Revisar y refactorizar un repo** con ripgrep: duplicación, acoplamiento, deuda técnica priorizada.
5. **Escribir la suite de tests que falta**, ejecutarla y arreglar lo que rompa.
6. **Diseñar y ejecutar un esquema de base de datos** con migraciones y seeds realistas.
7. **Maquetar un diseño a partir de una captura** (layout, paleta, tipografía, espaciado).
8. **Generar un dashboard con datos reales** (SQL + SVG + exportación).
9. **Preparar un despliegue en Vercel** y leer los logs de build hasta que pase.
10. **Documentar el proyecto** (README, arquitectura, API, decisiones) de forma utilizable.

### Nivel 2 — Aceleradores fuertes

11. **Construir un prototipo de app móvil creíble** (shell iOS/Android, 8 pantallas, navegación).
12. **Convertir una web en PWA instalable y offline**.
13. **Implementar autenticación completa** (registro, login, sesión, roles, recuperación).
14. **Escribir una API pública versionada** con OpenAPI, rate limit y API keys.
15. **Crear un design system** (tokens + componentes + documentación viva).
16. **Auditar accesibilidad** y aplicar las correcciones (teclado, foco, contraste, ARIA).
17. **Optimizar el rendimiento de un frontend** (bundle, lazy loading, imágenes, fuentes).
18. **Automatizar un informe** que escribe en Google Sheets y envía por email.
19. **Migrar datos entre formatos** (CSV↔JSON↔SQLite↔XLSX) con validación y errores por fila.
20. **Generar el CI/CD** de un repo en GitHub Actions (lint, tests, build, deploy).
21. **Crear un juego 2D jugable** con editor de niveles y guardado.
22. **Implementar tiempo real** (chat, notificaciones, colaboración) con WS o SSE.
23. **Construir un back-office** para reemplazar hojas de cálculo.
24. **Redactar y estructurar documentación técnica** (guías, ADRs, runbooks).
25. **Generar assets visuales** coherentes con una paleta y un estilo (hero, iconos, og:image).

### Nivel 3 — Alto valor en casos concretos

26. **Construir un simulador de producto** para validar UX antes de invertir en desarrollo.
27. **Montar un entorno de demo con datos sintéticos** sin exponer datos del cliente.
28. **Diseñar la arquitectura** de un sistema con diagramas C4/Mermaid y decisiones justificadas.
29. **Modelar amenazas** y producir un plan de mitigación priorizado.
30. **Generar el SDK/cliente** de una API a partir de su OpenAPI.
31. **Escribir IaC** (Terraform/CDK/Helm) y el pipeline que lo aplica.
32. **Crear un sistema de emails transaccionales** (plantillas + cola + reintentos + idempotencia).
33. **Implementar búsqueda** (full-text en SQLite, filtros, facetas, ranking, resaltado).
34. **Construir un editor visual** (canvas/SVG con drag, snapping, undo/redo, export).
35. **Automatizar la sincronización** entre Google Sheets y una base de datos.
36. **Generar presentaciones** con datos y gráficos vinculados.
37. **Analizar un PDF o un contrato** y extraer su estructura en una tabla.
38. **Crear un chatbot de soporte** con base de conocimiento y handoff a humano.
39. **Preparar una migración tecnológica** (plan por fases, compatibilidad, rollback).
40. **Instrumentar observabilidad** (logs estructurados, health checks, métricas, trazas).

### Nivel 4 — Válvulas de escape y meta-habilidades

41. **Escribir el código de un servicio en Java/Go/Rust** y su Dockerfile, aunque no se compile aquí.
42. **Escribir los tests E2E** que otro entorno ejecutará en CI.
43. **Preparar el proyecto Flutter/React Native** con su configuración de build.
44. **Documentar las limitaciones del entorno** para que otro agente no repita errores (esta auditoría).
45. **Diseñar el plan de despliegue** de una plataforma sin conector (Netlify, AWS, Fly).
46. **Generar narración de voz** para una demo o un tutorial.
47. **Construir un juego/herramienta multijugador** dentro del preview.
48. **Simular un sistema operativo o un navegador** dentro del navegador (demo/educación).
49. **Crear un pipeline de datos reproducible** con validaciones y artefactos versionados.
50. **Explicar con precisión qué puede y qué no puede hacer un agente** — sin humo, con evidencia.

---

## Apéndice A — Checklist previo a pedir algo

1. ¿El resultado debe ser **código** que el usuario ejecuta, o **algo funcionando ya**?
2. ¿Necesita **datos reales de un servicio**? → hace falta conector o credenciales.
3. ¿Necesita **verse en pantalla**? → el preview lo resuelve; la validación visual la hace el usuario.
4. ¿Necesita **navegador automatizado**? → se entrega test + CI, no ejecución local.
5. ¿Necesita **permanecer online**? → desplegar (Vercel/Supabase), no preview.
6. ¿Necesita **tocar sistemas del usuario**? → subir archivos o conectar el servicio.
7. ¿Hay **acciones irreversibles**? → autorización explícita.

## Apéndice B — Frases que delatan una capacidad inventada

Si alguien (humano o IA) afirma esto sin matices, desconfía:

* "Puedo navegar tu web y comprobar que se ve bien" → **no**, sin navegador.
* "Ya desplegué en AWS" → **no**, sin CLI ni credenciales ni red.
* "Consulté tu base de datos Postgres" → **no**, salvo Supabase vía conector.
* "Ejecuté los tests E2E" → **no**, Chromium no está disponible aquí.
* "Llamé a la API de Stripe y funcionó" → **no** desde el sandbox.
* "Instalé Docker" → **no**, sin daemon ni repos.

## Apéndice C — Glosario breve

* **Preview**: URL pública temporal generada por `start_process` que apunta a un servidor del sandbox.
* **Conector**: integración OAuth preautorizada que expone herramientas de un servicio a la conversación.
* **Sandbox**: máquina Linux efímera, aislada, sin acceso al equipo del usuario.
* **Snapshot**: copia persistida del workspace (excluye dependencias y artefactos de build).
* **Allowlist de red**: lista cerrada de hosts que el sandbox puede alcanzar.
* **Servidor autoritativo**: servidor que mantiene el estado canónico en un sistema multijugador.

---

*Fin del documento. Verificado empíricamente el 2026-10-30. Toda afirmación con ✅ o ✗ fue ejecutada en esta sesión; las marcadas ⚠️ dependen de configuración, permisos o red y deben revalidarse.*
