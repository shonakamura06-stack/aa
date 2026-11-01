import { expect, test } from "@playwright/test";

const SAMPLE = `La ciudad amaneció con niebla y el mercado abrió antes de lo previsto. Los vendedores discutían el precio del pan mientras un perro dormía entre las cajas. Nadie parecía tener prisa, salvo la mujer que contaba monedas en silencio.

Al mediodía la niebla se fue y con ella la calma. El puesto de api volvió a humear y un niño preguntó por qué el cielo tardaba tanto en aclararse.`;

test("el flujo completo analiza un texto y muestra límites explícitos", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Estudia las señales del texto");

  await page.getByLabel("Texto a analizar").fill(SAMPLE);
  await page.getByRole("button", { name: "Analizar" }).click();

  await expect(page.getByText("Índice de señales", { exact: false })).toBeVisible();
  await expect(page.getByText("No disponible", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("No existe una probabilidad conjunta calibrada", { exact: false })).toBeVisible();
  await expect(page.getByText("una familia = un voto", { exact: false })).toBeVisible();
  await expect(page.getByText("Mejora editorial")).toBeVisible();
  await expect(page.getByText("Proveedores externos contactados", { exact: false })).toBeVisible();

  const engineCards = page.locator("details.engine-card");
  await expect(engineCards.first()).toBeVisible();
  expect(await engineCards.count()).toBeGreaterThanOrEqual(10);

  expect(errors.join(" ")).not.toMatch(/TypeError|ReferenceError|hydration/i);
});

test("no permite analizar con el editor vacío y conserva los contadores", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Analizar" })).toBeDisabled();
  await page.getByLabel("Texto a analizar").fill("Una sola frase de prueba con suficientes palabras para contar.");
  await expect(page.getByText(/palabras/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Analizar" })).toBeEnabled();
});

test("el catálogo de motores declara metodología y límites", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ver detalle" }).first().click();
  await expect(page.getByText("Metodología y límites").first()).toBeVisible();
  await expect(page.getByText("Limitaciones:", { exact: false }).first()).toBeVisible();
  // El bloque de metodología está abierto al desplegar el motor: nada de contenido oculto por defecto.
  await expect(page.locator("details[open]").first()).toBeVisible();
});
