# Pedido de evidencias priorizado — y qué frases ya son seguras

**Para:** Sho
**De:** auditoría del 8 de noviembre de 2026
**Recordatorio:** el CV no se puede cerrar con lo que hay. Cuatro de las seis cosas que más lo fortalecerían no las tengo. Abajo van cinco, en orden de rentabilidad.

---

## Las cinco evidencias que más cambian el CV

### 1. Un archivo de Excel hecho por ti (con macros, si las hay)

**Por qué es la primera:** es tu hueco más grande. La versión administrativa del CV se sostiene en Excel y hoy no hay una sola prueba de que lo uses más allá de lo que dices. Un reclutador no puede verificar una declaración.

**Qué enviar:** el `.xlsx` original de un trabajo tuyo. Si tiene macros, el `.xlsm` **sin convertir**. Un PDF no me sirve: pierde el código VBA y no puedo ver fórmulas ni tablas.

**Qué voy a mirar:** qué funciones usaste de verdad, si las tablas dinámicas son tuyas o venían hechas, si la validación y el formato condicional tienen criterio, y en las macros si escribiste lógica o solo ejecutaste algo ya armado.

**Advertencia:** si las macros resultan ser una grabación de pasos, se escribe exactamente eso —"grabación y adaptación de macros"—, no "VBA". No es una derrota, es una descripción que aguanta una pregunta en entrevista.

---

### 2. Un enlace público de Credly, y los certificados

**Por qué:** dos certificaciones verificables por un tercero valen más que cinco declaradas. Y están a un enlace de distancia.

**Qué enviar:**
- El perfil **público** de Credly (no la URL de edición que enviaste; esa es solo tuya y no la puede abrir nadie).
- Fotos o PDF de: los tres certificados BOLMUN, el de la Olimpiada SPIKE UPSA y el del Triatlón UCB.
- La carta o documento de la beca del 60 % de UNIVALLE, con su nombre oficial.

**Qué voy a mirar:** si las insignias están marcadas como públicas, si el nombre del perfil coincide, y qué dice literalmente cada certificado —fecha, cargo, categoría—, porque el CV tiene que decir lo mismo y no una versión más generosa.

**Si el certificado STEM sigue con el nombre de tu hermano:** no lo mandes como prueba. Mándame solo el correo o la constancia de que pediste la corrección. Mientras tanto no aparece en el CV.

---

### 3. Sintonía: confirmar tu autoría y el alcance real

**Por qué:** es tu proyecto más grande y el que más riesgo tiene de escribirse mal. Ya lo revisé: la app funciona en `sintonia-beta.vercel.app`, tiene 11 juegos, 4.583 entradas de contenido y 42 archivos de prueba.

**Lo que necesito de ti no es el código, es tu versión.** Cuatro preguntas concretas:

1. De los 11 juegos, ¿cuáles diseñaste tú completo —reglas, puntuación, flujo— y en cuáles solo ajustaste lo que ya existía?
2. ¿Qué decisiones fueron tuyas y no de la IA? Por ejemplo: que la PC no juegue, que los equipos no se asignen solos, que los puntos de pareja se dividan, los seis rangos del Precio Justo, el sistema antirrepetición. Confírmame cuáles pediste tú.
3. ¿Llegaste a probar la sala con teléfonos de verdad, con amigos o en el colegio? Si sí: cuántos, qué falló. Si no, se escribe "probado en navegadores emulados", que igual es verdad y no se cae en la entrevista.
4. ¿Qué quedó pendiente y lo sabes? Esto no es para el CV, es para que yo no te haga afirmar algo que no aguanta.

**Lo que no voy a escribir:** "desarrollé", "programé", "lancé en producción". Los commits de la rama están firmados por 16 agentes de IA y 13 por tu cuenta. Se escribe lo que sí pasó: diseño funcional, especificación, dirección de agentes, revisión de pruebas.

---

### 4. Trazador y ELIGE TU PROBLEMA: publicar y acreditar

**Por qué:** encontré dos proyectos que no estaban en el paquete de traspaso.

- **Trazador** ya está publicado y funciona (`trazador-math-wars.vercel.app`). Es tu mejor tarjeta de presentación técnica: matemática real resuelta en el navegador.
- **ELIGE TU PROBLEMA** está terminado, con 7 suites aprobadas, y **sin publicar**.

**Qué necesito:**
- Para los dos: ¿el diseño y las decisiones fueron tuyos? ¿Quién escribió el código, tú o un agente? Con eso ajusto los verbos.
- Para ELIGE TU PROBLEMA: autorización para publicarlo en Netlify o Vercel. Está listo, tiene `netlify.toml`, y no publicarlo es dejar una prueba guardada en un cajón.

---

### 5. BOLMUN y el colegio: lo que se puede citar con nombre

**Por qué:** cuatro ediciones y dos resoluciones son un argumento fuerte para la versión de investigación y redacción. Hoy no hay un solo papel.

**Qué enviar:**
- Los tres certificados, para saber a qué edición corresponde cada uno. Tienes cuatro ediciones y tres certificados: hay que decir la verdad, no rellenar.
- Las dos resoluciones de 2026, tal como quedaron. Aunque no se hayan aprobado.
- Boleta o constancia del colegio con el promedio y, si existe, el documento de los puestos de curso.

---

## Qué NO necesito que me mandes ahora

Para no hacerte perder tiempo:

- El CV en Word o PDF — ya tengo su contenido transcrito y revisado.
- Descripciones de Sintonía escritas a mano — ya leí el código, los informes y las pruebas.
- Fotos de tu escritorio, capturas de pantalla genéricas o tu letra.
- El `.txt` de "Texto pegado(4)". Si quieres recuperar ese documento, expórtalo de Word como `.docx` o PDF. Renombrar la extensión no lo arregla.
- Datos personales: dirección, edad, estado civil. No van en el CV y no los pido.

---

## Frases que ya puedo respaldar hoy

Estas no dependen de nada pendiente. Sirven de base y no habrá que retirarlas:

| Frase | Respaldo |
|---|---|
| "Diseñé las reglas, la puntuación y el flujo de 11 juegos de fiesta para un proyecto web multijugador, y dirigí su implementación con agentes de IA." | Repo, informes de decisiones, 42 archivos de prueba |
| "Participé en la revisión de cambios y pruebas: 62 casos automatizados, con 21 capturas de fallo previas a cada corrección." | `suite-final.tap` y los `.tap` de "antes" |
| "Mantuve informes técnicos en español con criterio de aceptación y verificación por caso." | `AUDITORIA-SINTONIA.md`, `CONTINUACION-MISION.md` |
| "Publiqué y mantengo dos aplicaciones web en producción." | Ambas URL, abiertas hoy |
| "Construí un plano cartesiano interactivo que ajusta una ecuación a una curva dibujada a mano." | `trazador/`, publicado |

---

## Frases que no van a aparecer en ninguna versión

Para que no haya sorpresas al leer el borrador:

- "Programador", "desarrollador full-stack", "experto en IA", "experto en Excel", "especialista en ciberseguridad".
- "Desarrollé íntegramente", "programé solo", "lancé al mercado".
- Cifras de contenido o de pruebas que no pueda citar con el archivo detrás.
- "114 certificaciones" del programa de UNIVALLE. Ese es el techo del programa, no algo que hayas hecho.
- "Becario de UNIVALLE" hasta ver el documento.
- "Inglés C1".
- Cualquier cosa del certificado STEM.

---

## Formato para enviar

Archivos sueltos o un `.zip`, da igual. Lo que importa:

- Excel: `.xlsx` o `.xlsm` **originales**, no capturas.
- Certificados: foto legible o PDF. Si es foto, que se lea la letra pequeña.
- Credly: el enlace público del perfil.
- Documentos de BOLMUN: `.docx` o PDF exportado.

Puedes mandarlos en tandas. Con el Excel y el enlace de Credly ya puedo empezar a redactar la versión administrativa completa y dejar la tecnológica al 80 %.
