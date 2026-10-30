# Arena IA — Agent Mode · Auditoría condensada (portable)

> Versión corta del informe completo (`auditoria-capacidades-arena-agent-mode.md`, 1296 líneas).
> Todo lo marcado **[V]** fue ejecutado y verificado en el sandbox; **[C]** deriva de la configuración
> de conectores observada; **[?]** requiere verificación en el entorno real.
> Fecha de verificación: **2026-10-30**.

---

## 1. El entorno en una tabla

| Aspecto | Realidad verificada |
|---|---|
| Máquina | Linux x86_64, **2 vCPU**, **3.8 GB RAM**, ~20 GB libres. Sin GPU, sin Docker, sin KVM. **[V]** |
| Persistencia | `/home/user` sí; `/tmp` no. **No** persisten `node_modules`, `dist`, `.next`, `build`, `out`, `target`, `.venv`, `__pycache__`, `coverage`. **[V]** |
| Runtime | node 22 (fetch, `node --test`, `node:sqlite`), npm 10, yarn 1.22, python 3.11, pip, git 2.39, **gh autenticado**, gcc 12, make, jq, curl, wget, openssl, ssh, zip, tree, ripgrep, ImageMagick 6 (`convert`). **[V]** |
| Ausentes | docker, nginx, postgres/redis (cliente y servidor), `sqlite3` CLI, go, rustc, java, php, dotnet, ruby, deno, bun, pandoc, ffmpeg, rsync, libreoffice, pdftotext, **chromium/playwright**. **[V]** |
| `sudo` | Funciona sin contraseña, pero **sin repositorios apt** ⇒ no se instala software del SO. **[V]** |
| Red (bash) | Solo `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, `github.com`, `api.github.com`, `codeload.github.com`. **Internet general bloqueado.** **[V]** |
| Servidores | Bind a `0.0.0.0:PORT` ⇒ URL pública `https://{port}-{sandboxId}.e2b.app`. WS funciona dentro del sandbox. **[V]** |
| Conectores activos | vercel, supabase, notion, google_drive, google_sheets, google_docs, google_slides, google_calendar, gmail, dropbox. **GitHub: sin conector** → se usa `gh`. **[C]** |
| Cuentas | Vercel `shonakamura06@gmail.com` (`limited:true`); Supabase 1 organización, **0 proyectos**. **[C]** |

**Los tres bloqueantes que lo explican casi todo**

1. **Sin navegador** → no hay E2E, ni screenshots, ni Lighthouse. Se entrega test + CI.
2. **Sin internet general en bash** → ningún *servidor* del sandbox llama APIs externas; el código *cliente* sí (corre en el navegador del usuario), y los conectores sí.
3. **Sin Docker ni toolchains no-JS/Python** → Java/Go/Rust/PHP/.NET/Ruby se escriben, no se compilan; Postgres/Redis locales no existen (Supabase sí).

---

## 2. Los ocho canales (taxonomía obligatoria)

Toda capacidad pertenece a uno o varios canales; un "sí" sin canal es humo.

| # | Canal | Implica | Ejemplo |
|---|---|---|---|
| 1 | **Directo** | Una llamada, resultado inmediato | escribir archivos, generar imagen, TTS, buscar web |
| 2 | **Herramientas integradas** | Conector OAuth `enabled`; sin él, no existe | deploy Vercel, DDL en Supabase, Sheets, Gmail, Notion |
| 3 | **Modificar archivos/proyectos existentes** | Requiere acceso al proyecto; riesgo de romper | refactor de repo, migrar deps, arreglar bug heredado |
| 4 | **Terminal del sandbox** | Sujeto a allowlist, binarios y 2 vCPU | `npm ci && build`, `tsc`, `pytest`, `git`, servidor local |
| 5 | **APIs externas (HTTP)** | **Bloqueado en el servidor del sandbox**; viable en cliente o despliegue | Stripe, OpenAI, Twilio, OAuth Google |
| 6 | **Simulable** | Sustituto funcional, sin efecto real; se declara | app móvil web, pago falso, OS en el navegador, IA mockeada |
| 7 | **No posible** | Ningún canal ni simulación útil | navegador real, Java/Go/Rust, Docker, ffmpeg, emuladores |
| 8 | **Parcial con límites** | Depende de permiso/plan/cuota/red; puede fallar por entorno | Vercel `limited:true`, WS por proxy, webhooks, E2E en CI |

Las capacidades reales son **cadenas**: p. ej. "web con datos" = `4` build → `1` archivos → `3` repo → `2` deploy.

---

## 3. Semáforo de capacidades

| ✅ Sí, verificado | 🟡 Parcial / con condiciones | 🔴 No |
|---|---|---|
| Web frontend: HTML/CSS/JS/TS, React, Next, Vue, Svelte, Astro, Angular, Tailwind, Canvas 2D, SVG, Three.js (código), PWA, a11y, SEO, i18n | Three.js/WebGL/WebGPU renderizado real (no verificable) | Ver píxeles / validación visual |
| Backend: Node (Express/Fastify/Hono/Nest), Python (FastAPI/Flask/Django); REST, GraphQL, WS, SSE, JWT, RBAC, rate limit, OpenAPI | WebRTC (STUN/TURN externos), webhooks entrantes (solo preview vivo) | Java, Go, Rust, PHP, .NET, Ruby (ejecutar) |
| SQLite real (`node:sqlite`); Postgres real vía Supabase (DDL+DML, migraciones, branches, edge functions, RLS) | MySQL/Mongo/Redis: solo diseño + mocks | Postgres/MySQL/Redis locales |
| Deploy: preview interno, **Vercel** (conector), **Supabase** (conector) | Netlify/CF/Railway/AWS: config + CI escritos, no ejecutados | Desplegar en AWS/GCP/Azure |
| Docs: Markdown, HTML, PDF, DOCX, XLSX, PPTX; Google Docs/Sheets/Slides, Notion (conectores) | LaTeX (sin compilador), EPUB | Asesoría legal / firma electrónica |
| Imágenes: generar, editar (img2img), buscar, analizar, manipular (ImageMagick/sharp/Pillow) | Texto dentro de imágenes (imperfecto), coherencia de estilo entre assets | Vídeo / ffmpeg / montaje |
| Tests: `node --test`, vitest, pytest, supertest, jsdom, axe-core parcial | Carga (2 vCPU), cobertura de a11y sin árbol real | E2E de navegador, Lighthouse/CWV |
| Datos: CSV/JSON/SQL/Excel/Sheets, ETL, validación, visualización, ML pequeño (sklearn) | Scraping (sin red/JS), ML sin GPU | Datasets masivos, entrenamiento |
| Voz: TTS multilingüe (≤10 clips/turno, no canta) | Bots Discord/Telegram (código sí, host no) | Capturar audio del usuario |
| Git/GitHub: repos, PRs, issues, releases, secrets, Actions (YAML) | Cron persistente (Vercel Cron / GH Actions `schedule`) | Webhooks de producción |
| Simulación: app móvil creíble, OS en el navegador, producto falso para validar UX | Emulador Android/iOS (sin KVM), build nativo (sin SDK) | Publicar en App Store / Play |

---

## 4. Regla de oro sobre lo que se puede afirmar

| Se afirma "hecho" solo si… | Se marca `⚠️ requiere verificación` cuando… |
|---|---|
| Compiló, los tests pasaron, el SQL devolvió filas, el proceso respondió, el exit code fue 0 | Depende del navegador, de un servicio externo, de un plan/cuota, de un permiso o de red |

**Verificable de verdad:** lógica, tipos, contratos, SQL, datos, builds, logs, errores, APIs propias.
**No verificable aquí:** píxeles, scroll, gestos, foco visual, rendimiento percibido, llamadas a APIs externas, comportamiento en dispositivos reales.

---

## 5. Patrones que resuelven los límites

| Necesidad | Patrón |
|---|---|
| Algo que debe verse | `start_process` → preview público; el usuario valida lo visual |
| Algo que debe permanecer | Deploy en Vercel (frontend) + Supabase (backend/BD) |
| Tarea recurrente | Script + **GitHub Actions `schedule`** o **Vercel Cron** (nunca `setInterval` local) |
| Lo que aquí no se ejecuta | Escribir código + Dockerfile + workflow de CI; CI sí tiene navegador y toolchains |
| Llamar a un LLM desde una app | Endpoint servidor `/api/chat` con la key en env; **mock** en local para que la demo funcione |
| Probar webhooks | Simular el payload localmente + test de contrato |
| Dependencias que desaparecen | Lockfile versionado + script `setup` idempotente |
| Servicio sin conector | Código de integración + variables de entorno + instrucciones; nunca afirmar que se ejecutó |

---

## 6. Bloque portable para otra IA

```text
Perfil operativo: agente de software en sandbox Linux (2 vCPU, 3.8 GB, sin GPU, sin Docker,
sin KVM). Persiste /home/user; no persiste /tmp ni node_modules/dist/build/.next.
Instalado: node 22, npm, yarn, python3.11, pip, git, gh (autenticado), gcc, make, jq, curl,
ImageMagick 6, ripgrep. Ausente: java, go, rust, php, dotnet, ruby, deno, bun, pandoc, ffmpeg,
libreoffice, postgres/redis, sqlite3 CLI, navegadores.
sudo sin contraseña pero sin repos apt.
Red: SOLO npm, pypi, github (y sus APIs). Internet general bloqueado desde bash → usa
web_search/fetch_page para leer y CONECTORES para actuar. Servidores en 0.0.0.0:PORT se
publican como https://{port}-{sandbox}.e2b.app; WebSocket funciona en el sandbox.
Conectores: vercel, supabase, notion, google_drive/sheets/docs/slides/calendar, gmail, dropbox.
GitHub NO tiene conector: usa el CLI gh.
Puedes: frontend moderno y build verificado; Node/Python backend; SQLite; Postgres vía Supabase;
deploy en Vercel/Supabase; docs y hojas de cálculo; imágenes (generar/editar/analizar); TTS;
tests unitarios e integración; análisis de seguridad defensiva; automatización con conectores.
No puedes: ejecutar Java/Go/Rust/PHP/.NET/Ruby, Docker, BD locales, ffmpeg; navegar, capturar
pantalla ni medir CWV; llamar APIs externas desde el servidor; recibir webhooks de producción;
emuladores; tocar el equipo del usuario; acciones ofensivas; clonar marcas.
Reglas: verifica antes de afirmar; nada de marketing; toda capacidad lleva método, requisito y
límite; marca la incertidumbre; pide autorización para lo irreversible; entrega reproducible
(lockfile, README, .env.example); itera contra el error real.
```

---

## 7. Las 12 capacidades más infravaloradas

1. `read_file` **lee imágenes** → usar capturas como especificación de diseño.
2. `generate_image` con variantes + img2img → assets del proyecto en el mismo turno.
3. TTS → narración de demos, audioguías, prototipos de accesibilidad.
4. Servidores de larga duración con **URL pública** → demo navegable al instante.
5. Leer **logs de build de Vercel** y corregir en bucle hasta que pase.
6. **SQL de escritura** en Supabase (DDL+DML) + branching de base de datos.
7. Escribir Google Sheets con **formato, gráficos, validación y filtros**; Slides con charts vinculados.
8. Enviar **correos reales** y crear eventos con Meet desde la conversación.
9. `node:sqlite` sin instalar nada → persistencia real en segundos.
10. Compilar C y módulos nativos con gcc.
11. Dejar el **CI** haciendo lo que el sandbox no puede (E2E con navegador, Docker, Java).
12. `present_file` + `ask_user` como mecanismos formales de entrega y desbloqueo.

**Frases que delatan una capacidad inventada:** "navegué tu web", "desplegué en AWS",
"consulté tu Postgres" (salvo Supabase), "ejecuté los E2E", "llamé a Stripe", "instalé Docker".

---

## 8. Cómo usar esto

* **Como prompt de sistema para otra IA:** pega el §5 y el §2; son autocontenidos.
* **Como control de calidad:** si una respuesta promete algo del §2 en 🔴, es humo.
* **Antes de pedir algo:** ¿debe verse (preview) / permanecer (deploy) / repetirse (cron) /
  tocar datos externos (conector) / ejecutarse en otro entorno (CI)?
* **Documento completo:** `auditoria-capacidades-arena-agent-mode.md` (§0–§27 + apéndices).
