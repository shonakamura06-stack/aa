import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { Gauge } from "@/components/Gauge";
import type { AnalysisResponse } from "@/lib/types";
import type { CatalogEntry } from "@/components/EngineCatalog";
import { analyze } from "@/lib/orchestrator";
import { HUMAN_ES, UNIFORM_ES } from "./fixtures/texts";

/**
 * Prueba de representación en servidor (sin navegador): verifica que el
 * dashboard se genera con los datos reales del análisis y que no se filtran
 * valores rotos ni el texto original en las secciones agregadas.
 */
describe("representación del dashboard", () => {
  let result: AnalysisResponse;
  let catalog: CatalogEntry[];

  beforeAll(async () => {
    result = await analyze({ text: HUMAN_ES });
    catalog = result.engines.map((run) => ({
      meta: {
        id: run.id,
        name: run.id,
        kind: run.id.startsWith("commercial.") ? "commercial" : "statistical",
        family: "information-previsible" as never,
        version: "1",
        summary: "",
        methodology: "",
        variables: [],
        formulas: [],
        limitations: [],
        languages: ["es"],
        minWords: 0,
        external: false,
        validation: "unvalidated",
        directionality: "non-directional",
        dependenceCluster: "test",
        supportsSegments: false,
      },
      availability: { id: run.id, status: "ready", detail: "" },
      provider: null,
    }));
  }, 30000);

  it("el indicador dibuja el valor y el rango", () => {
    const html = renderToStaticMarkup(<Gauge value={42} band="medio" range={[31, 53]} />);
    expect(html).toContain(">42<");
    expect(html).toContain("31–53");
    expect(html).toContain("banda");
  });

  it("el dashboard muestra el índice, la evidencia y la ausencia de probabilidad", () => {
    const html = renderToStaticMarkup(<ResultsDashboard result={result} catalog={catalog} />);
    expect(html).toContain("Índice heurístico de rasgos");
    expect(html).toContain("Nivel de evidencia");
    expect(html).toContain("No disponible");
    expect(html).toContain("No existe una probabilidad conjunta calibrada");
    expect(html).toContain("un grupo = un voto");
    // El acuerdo no se inventa: se declara no calculable y se explica por qué.
    expect(html).toContain("No calculable");
    expect(html).toContain("ninguno emite una decisión binaria validada");
    expect(html).not.toMatch(/\d+ \/ 100<\/div><div class="metric-card__note">Distancia media/);
    expect(html).toContain("Mejora editorial");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("undefined");
  });

  it("el agregado no transporta el texto original", () => {
    // El texto del usuario solo debe aparecer donde el propio motor lo devuelve
    // (tabla de oraciones), nunca dentro de las métricas agregadas.
    expect(JSON.stringify(result.aggregate)).not.toContain("teleférico");
    for (const run of result.engines) {
      expect(JSON.stringify(run.metrics)).not.toContain("teleférico");
    }
    expect(result.text.stored).toBe(false);
  });

  it("el dashboard refleja más señal en el texto uniforme", async () => {
    const uniform = await analyze({ text: UNIFORM_ES });
    expect(uniform.aggregate.signalIndex).not.toBeNull();
    expect(result.aggregate.signalIndex).not.toBeNull();
    expect(uniform.aggregate.signalIndex!).toBeGreaterThan(result.aggregate.signalIndex!);
    const html = renderToStaticMarkup(<ResultsDashboard result={uniform} catalog={catalog} />);
    expect(html).toContain("Desacuerdos entre metodologías");
  }, 30000);
});
