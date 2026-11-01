import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Umbral · Análisis multimodelo de texto",
  description:
    "Plataforma de análisis multimodelo: entropía, diversidad, repetición, estilometría, previsibilidad y detección comercial. Estudia características del texto, no determina autoría.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
