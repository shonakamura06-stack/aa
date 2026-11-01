export interface SampleText {
  id: string;
  title: string;
  kind: string;
  language: "es" | "en";
  text: string;
}

/** Textos de demostración. No son un corpus de calibración. */
export const SAMPLES: SampleText[] = [
  {
    id: "narrativo-es",
    title: "Narrativa personal (español)",
    kind: "voz propia, variación de ritmo",
    language: "es",
    text: `Cuando llegué a La Paz en 2011, el teleférico amarillo todavía olía a pintura fresca. Yo tenía veintitrés años y una mochila con más libros que ropa. Recuerdo que un vendedor de api, en la esquina de la Plaza San Francisco, me preguntó de dónde venía y, antes de que terminara de responder, ya me había servido un vaso humeante.

Esa ciudad me enseñó que la altitud no perdona: subir tres cuadras era una expedición. Aprendí a caminar despacio, a masticar coca, a desconfiar de los taxis que te dicen un precio y luego lo cambian. También aprendí que la hospitalidad no siempre hace ruido.

Volví en 2019, con menos pelo y más preguntas. La ciudad se había llenado de obras y de oficinas nuevas, pero la señora del api seguía en el mismo puesto. No me reconoció. Le conté la historia del vaso humeante y se rió como si me hubiera estado esperando desde entonces. Nos quedamos callados un rato, mirando a la gente pasar, y ese silencio me pareció más elocuente que cualquier discurso sobre el progreso.`,
  },
  {
    id: "uniforme-es",
    title: "Ensayo uniforme (español)",
    kind: "plantilla, conectores repetidos",
    language: "es",
    text: `La inteligencia artificial es una tecnología fundamental en el mundo actual. Es importante destacar que esta tecnología ha transformado diversos aspectos de la sociedad. En este sentido, resulta esencial comprender sus implicaciones. Por otra parte, es fundamental analizar sus beneficios. Asimismo, cabe destacar que presenta desafíos relevantes.

Además, es importante señalar que su implementación requiere consideración cuidadosa. Por otro lado, es esencial evaluar los riesgos asociados. En este sentido, resulta necesario establecer marcos regulatorios adecuados. Asimismo, es fundamental promover la alfabetización digital.

En conclusión, la inteligencia artificial representa un tema de gran relevancia en el mundo actual. Es importante destacar que su desarrollo debe ser responsable. Por lo tanto, es esencial fomentar el diálogo entre diversos actores. En definitiva, resulta crucial construir un futuro inclusivo y sostenible.`,
  },
  {
    id: "academico-es",
    title: "Fragmento académico (español)",
    kind: "registro formal, citas",
    language: "es",
    text: `La detección de texto generado automáticamente se ha convertido en un problema metodológico antes que técnico. Los estudios iniciales (Solaiman et al., 2019) confiaban en clasificadores entrenados sobre las salidas de un único modelo generador; esa estrategia se degrada con rapidez cuando aparece un modelo nuevo. Mitchell et al. (2023) mostraron que la curvatura de la probabilidad condicional, estimada con un modelo de referencia, conserva capacidad discriminativa sin reentrenamiento específico, aunque su coste computacional es alto y su calibración depende del idioma.

En español, la evidencia disponible es más escasa. La mayoría de los corpus etiquetados de acceso abierto están construidos en inglés, y la traducción automática introduce artefactos que confunden al detector: un texto humano traducido puede exhibir una regularidad léxica superior a la de un texto generado originalmente en español. Por ese motivo, cualquier afirmación de precisión en español exige evaluación por idioma y por género textual, con separación estricta de autores y de modelos generadores.`,
  },
  {
    id: "english-1",
    title: "Narrative (English)",
    kind: "variación de ritmo y longitud",
    language: "en",
    text: `The machine sat in the corner of the workshop for three weeks before anyone touched it. Marta had bought it at an auction, convinced that the missing gear could be rebuilt from the parts of two broken pumps. On the fourth week she finally opened the casing, and the smell of old oil filled the room like a memory she had been avoiding.

What she found inside was not a gear at all, but a folded letter, brittle at the edges, addressed to a name she did not recognise. She read it twice, then a third time, standing very still while the afternoon light moved across the floor and the dog slept on the mat by the door.`,
  },
];
