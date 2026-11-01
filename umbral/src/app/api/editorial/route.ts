import { NextResponse } from "next/server";
import { z } from "zod";
import { buildContext } from "@/lib/analysis";
import { buildEditorialSuggestions, EDITORIAL_DISCLAIMER } from "@/lib/editorial";
import { clientIdFrom, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  text: z.string().min(1).max(Number(process.env.UMBRAL_MAX_INPUT_CHARS ?? 30000)),
  language: z.enum(["auto", "es", "en"]).default("auto"),
});

export async function POST(request: Request) {
  const limit = rateLimit(`editorial:${clientIdFrom(request)}`);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  const ctx = buildContext(parsed.data.text, parsed.data.language);
  const suggestions = buildEditorialSuggestions(ctx);
  return NextResponse.json(
    { available: true, suggestions, disclaimer: EDITORIAL_DISCLAIMER },
    { headers: { "Cache-Control": "no-store" } },
  );
}
