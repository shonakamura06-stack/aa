#!/usr/bin/env node
/**
 * Generador de un corpus SINTÉTICO para probar el pipeline de evaluación.
 *
 * ADVERTENCIA: este corpus NO sirve para validar nada. Los textos se construyen
 * con plantillas y fragmentos fijos, no proceden de autores reales y no tienen
 * etiquetas fiables. Su único uso es comprobar que `evaluate-aggregator.mjs`
 * funciona de punta a punta: lectura, peticiones, métricas y guardas.
 *
 * Uso: node scripts/make-smoke-corpus.mjs --out /tmp/smoke.jsonl [--n 20]
 */
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const out = arg("out", "/tmp/umbral-smoke.jsonl");
const perClass = Number(arg("n", 20));

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HUMANO = [
  "Cuando llegué a La Paz en 2011, el teleférico amarillo todavía olía a pintura fresca.",
  "Yo tenía veintitrés años y una mochila con más libros que ropa.",
  "Un vendedor de api me preguntó de dónde venía antes de que terminara de responder.",
  "Esa ciudad me enseñó que la altitud no perdona: subir tres cuadras era una expedición.",
  "Aprendí a caminar despacio, a masticar coca, a desconfiar de los taxis que cambian el precio.",
  "La señora del puesto no me reconoció y se rió como si me hubiera estado esperando.",
  "Nos quedamos callados un rato, mirando a la gente pasar.",
  "Mi abuela guardaba las cartas en una caja de zapatos y las releía en voz alta los domingos.",
  "Nunca entendí por qué se empeñaba en leerlas de pie, junto a la ventana.",
  "El pan de la esquina se acababa antes de las ocho y había que madrugar.",
  "Hubo un invierno en que la lluvia duró tres semanas y el río se llevó el puente.",
  "Los vecinos organizaron una colecta, pero el dinero nunca alcanzó para todo.",
  "Recuerdo el olor del eucalipto en la sala de espera del hospital.",
  "El médico nos dijo que no había nada que hacer y mi padre se rió, como si fuera una broma.",
  "Años después entendí que esa risa era la única forma que tenía de no llorar.",
  "Volví en 2019, con menos pelo y más preguntas.",
  "La ciudad se había llenado de obras y de oficinas nuevas.",
  "El puesto del api seguía en el mismo lugar, con la misma olla abollada.",
  "Le conté la historia del vaso humeante y me sirvió otro sin decir nada.",
  "Ese silencio me pareció más elocuente que cualquier discurso sobre el progreso.",
  "Todavía conservo la libreta donde anotaba los precios del mercado.",
  "Hay tardes en que la ciudad se queda sin luz y la gente sale a la calle.",
  "Los chicos juegan a la pelota entre los cables caídos y nadie se queja.",
  "Me gusta pensar que volveré, aunque ya no reconozca las esquinas.",
  "El último invierno fue seco y las montañas aparecieron sin nieve.",
  "Escribo esto en una servilleta, en una cafetería que antes era una ferretería.",
  "No sé si la nostalgia es una forma de memoria o solo una costumbre.",
];

const UNIFORME = [
  "La inteligencia artificial es una tecnología fundamental en el mundo actual.",
  "Es importante destacar que esta tecnología ha transformado diversos aspectos de la sociedad.",
  "En este sentido, resulta esencial comprender sus implicaciones.",
  "Por otra parte, es fundamental analizar sus beneficios y sus riesgos.",
  "Asimismo, cabe destacar que presenta desafíos relevantes para las instituciones.",
  "Además, es importante señalar que su implementación requiere una consideración cuidadosa.",
  "Por otro lado, es esencial evaluar los riesgos asociados a su uso.",
  "En este sentido, resulta necesario establecer marcos regulatorios adecuados.",
  "Asimismo, es fundamental promover la alfabetización digital de la ciudadanía.",
  "En conclusión, la inteligencia artificial representa un tema de gran relevancia.",
  "Es importante destacar que su desarrollo debe ser responsable e inclusivo.",
  "Por lo tanto, es esencial fomentar el diálogo entre los diversos actores.",
  "En definitiva, resulta crucial construir un futuro sostenible para todos.",
  "Cabe señalar que la cooperación internacional desempeña un papel fundamental.",
  "En este marco, es importante promover la investigación y el desarrollo.",
  "Del mismo modo, resulta esencial garantizar el acceso equitativo a la tecnología.",
  "Por otra parte, es fundamental fortalecer los sistemas educativos.",
  "En síntesis, el tema reviste una importancia considerable en la actualidad.",
];

function humano(seed) {
  const rand = rng(seed);
  const n = 10 + Math.floor(rand() * 5);
  const start = Math.floor(rand() * (HUMANO.length - n));
  // Ventana contigua, sin repetir frases: el corpus sintético no debe introducir
  // repeticiones que el detector interpretaría como señal de generación.
  return HUMANO.slice(start, start + n).join(" ");
}

function uniforme(seed) {
  const rand = rng(seed);
  const n = 14 + Math.floor(rand() * 4);
  const start = Math.floor(rand() * (UNIFORME.length - n + 1));
  return UNIFORME.slice(start, start + n).join(" ");
}

const rows = [];
for (let i = 0; i < perClass; i++) {
  rows.push({ text: humano(i * 7 + 1), label: "human", author: `sintetico-h-${i}`, language: "es" });
}
for (let i = 0; i < perClass; i++) {
  rows.push({ text: uniforme(i * 13 + 3), label: "ai", author: `sintetico-a-${i}`, language: "es" });
}

writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
const words = rows.map((r) => r.text.split(/\s+/).length);
console.log(
  `Escritos ${rows.length} documentos sintéticos en ${out} ` +
    `(${Math.min(...words)}–${Math.max(...words)} palabras). ` +
    "ADVERTENCIA: no es un corpus de validación.",
);
