import type { EditorialSuggestion, EngineContext } from "@/lib/types";
import { GENERIC_PHRASES } from "@/lib/text/lexicons";
import { countBy } from "@/lib/text/stats";
import { ES_FUNCTION_WORDS, EN_FUNCTION_WORDS } from "@/lib/text/lexicons";
import { wordCount } from "@/lib/text/tokenize";

/**
 * Módulo editorial: separado del detector. No puntúa autoría ni se optimiza
 * contra el índice multimodelo. Señala problemas de escritura y propone
 * desarrollo argumental, ejemplos y aportaciones propias del autor,
 * conservando la intención y el significado del texto.
 */
const STOP = new Set([...ES_FUNCTION_WORDS, ...EN_FUNCTION_WORDS]);

function excerpt(text: string, start: number, end: number, max = 160): string {
  const raw = text.slice(start, end).trim();
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

export function buildEditorialSuggestions(ctx: EngineContext): EditorialSuggestion[] {
  const out: EditorialSuggestion[] = [];
  const lower = ctx.text.toLocaleLowerCase("es");
  let id = 0;
  const push = (s: Omit<EditorialSuggestion, "id">) => out.push({ id: `ed-${++id}`, ...s });

  // 1. Expresiones genéricas
  for (const phrase of GENERIC_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx === -1) continue;
    const occurrences = lower.split(phrase).length - 1;
    push({
      category: "generalidad",
      severity: occurrences >= 3 ? "alta" : "media",
      excerpt: excerpt(ctx.text, idx, idx + phrase.length),
      start: idx,
      end: idx + phrase.length,
      message: `Expresión genérica «${phrase}» (${occurrences} aparición(es)).`,
      advice:
        "Sustitúyela por una afirmación concreta: qué ocurre, dónde, con qué dato o con qué matiz aporta el autor. Si no puedes precisar, probablemente la idea necesita desarrollo.",
    });
    if (out.length >= 6) break;
  }

  // 2. Palabras de contenido más repetidas
  const contentCounts = countBy(
    ctx.lowerWords.filter((w) => w.length > 4 && !STOP.has(w)),
    (w) => w,
  );
  for (const [word, count] of [...contentCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    if (count < Math.max(4, ctx.wordCount * 0.012)) continue;
    const idx = lower.indexOf(word);
    push({
      category: "repetición",
      severity: count >= 8 ? "alta" : "media",
      excerpt: excerpt(ctx.text, Math.max(0, idx - 40), idx + word.length + 40),
      start: Math.max(0, idx),
      end: idx + word.length,
      message: `«${word}» aparece ${count} veces.`,
      advice:
        "Alterna con sinónimos solo cuando no cambie el matiz; si la repetición es conceptual, desarrolla el matiz en lugar de cambiar la palabra. La variedad vacía empeora el texto.",
    });
  }

  // 3. Oraciones demasiado largas
  for (const span of ctx.sentenceSpans) {
    const words = wordCount(span.text);
    if (words <= 38) continue;
    push({
      category: "claridad",
      severity: "media",
      excerpt: excerpt(ctx.text, span.start, span.end),
      start: span.start,
      end: span.end,
      message: `Oración de ${words} palabras.`,
      advice:
        "Divide en dos o tres oraciones con sujeto explícito. Conserva la relación lógica con un conector preciso en lugar de encadenar subordinadas.",
    });
    if (out.filter((s) => s.category === "claridad").length >= 3) break;
  }

  // 4. Párrafos sin desarrollo
  for (const span of ctx.paragraphSpans) {
    const words = wordCount(span.text);
    const sentences = (span.text.match(/[.!?…]+(?=\s|$)/g) ?? []).length;
    if (words >= 35 || sentences > 1) continue;
    push({
      category: "desarrollo",
      severity: "baja",
      excerpt: excerpt(ctx.text, span.start, span.end),
      start: span.start,
      end: span.end,
      message: `Párrafo de ${words} palabras: afirma sin desarrollar.`,
      advice:
        "Añade una razón, un ejemplo concreto o una consecuencia. Un dato propio vale más que tres adjetivos.",
    });
  }

  // 5. Ausencia de ejemplos
  const hasExamples = /por ejemplo|for example|p\. ej\.|como muestra|por caso|a saber/i.test(ctx.text);
  if (!hasExamples && ctx.wordCount >= 150) {
    push({
      category: "desarrollo",
      severity: "media",
      excerpt: excerpt(ctx.text, 0, 120),
      start: 0,
      end: Math.min(120, ctx.text.length),
      message: "No se detecta ningún ejemplo explícito en el texto.",
      advice:
        "Incorpora al menos un caso concreto (una situación, una cifra, una experiencia) que solo el autor podría aportar. Es lo que un lector no encuentra en un texto genérico.",
    });
  }

  // 6. Aperturas de oración repetidas
  const openings = countBy(
    ctx.sentences.map((s) => (s.toLocaleLowerCase("es").match(/^(?:\p{L}+\s+){1,2}/u) ?? [""])[0].trim()),
    (o) => o,
  );
  for (const [opening, count] of [...openings.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    if (!opening || count < 3) continue;
    const idx = ctx.text.toLocaleLowerCase("es").indexOf(opening);
    push({
      category: "uniformidad",
      severity: "baja",
      excerpt: excerpt(ctx.text, Math.max(0, idx), Math.max(0, idx) + 80),
      start: Math.max(0, idx),
      end: Math.max(0, idx) + opening.length,
      message: `${count} oraciones empiezan con «${opening.trim()}».`,
      advice:
        "Varía la construcción: empieza por el objeto, por una circunstancia o por una pregunta. No fuerces el cambio si la estructura repetida es intencionada.",
    });
  }

  // 7. Uniformidad estructural
  const paraLengths = ctx.paragraphs.map((p) => wordCount(p)).filter((n) => n > 0);
  if (paraLengths.length >= 4) {
    const mean = paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length;
    const uniform = paraLengths.filter((l) => Math.abs(l - mean) <= mean * 0.15).length / paraLengths.length;
    if (uniform >= 0.75) {
      push({
        category: "uniformidad",
        severity: "baja",
        excerpt: `${paraLengths.length} párrafos de longitud media ${Math.round(mean)} palabras`,
        start: 0,
        end: Math.min(80, ctx.text.length),
        message: `${Math.round(uniform * 100)} % de los párrafos tienen una extensión casi idéntica.`,
        advice:
          "Ajusta la extensión de cada párrafo a lo que exige su idea: un párrafo puede ser una línea si la idea es tajante.",
      });
    }
  }

  // 8. Puntuación
  const missingSpace = (ctx.text.match(/[.,;:](?=[\p{L}])/gu) ?? []).length;
  if (missingSpace > 0) {
    const idx = ctx.text.search(/[.,;:](?=[\p{L}])/u);
    push({
      category: "puntuación",
      severity: "alta",
      excerpt: excerpt(ctx.text, Math.max(0, idx - 20), idx + 20),
      start: Math.max(0, idx),
      end: idx + 1,
      message: `${missingSpace} signo(s) sin espacio posterior.`,
      advice: "Coloca un espacio después de coma, punto y coma o dos puntos antes de continuar la palabra.",
    });
  }

  // 9. Diversidad léxica baja
  const unique = new Set(ctx.lowerWords).size;
  if (ctx.wordCount >= 150 && unique / ctx.wordCount < 0.35) {
    push({
      category: "léxico",
      severity: "media",
      excerpt: excerpt(ctx.text, 0, 140),
      start: 0,
      end: Math.min(140, ctx.text.length),
      message: `Diversidad léxica baja: ${unique} palabras distintas en ${ctx.wordCount}.`,
      advice:
        "Revisa si hay conceptos que se repiten con el mismo término por comodidad. Precisión conceptual antes que sinónimos decorativos.",
    });
  }

  return out.sort((a, b) => {
    const order = { alta: 0, media: 1, baja: 2 } as const;
    return order[a.severity] - order[b.severity];
  });
}

export const EDITORIAL_DISCLAIMER =
  "El módulo editorial es independiente del detector. No promete superar detectores ni se optimiza contra el índice multimodelo: solo señala mejoras de escritura y propone desarrollo propio, ejemplos y razonamiento.";
