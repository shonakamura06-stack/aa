import { defineConfig, devices } from "@playwright/test";

/**
 * Configuración E2E. No se ha podido ejecutar en el sandbox de desarrollo
 * (sin Chromium ni navegador automatizado); el workflow de GitHub Actions la
 * ejecuta en un entorno con navegador.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000/api/health",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
