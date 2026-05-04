import { db } from "@/lib/db";
import { aiSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";
import { getAIProvider } from "@/lib/ai";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const [settings] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, user.id))
      .limit(1);

    const provider = getAIProvider(settings || undefined);
    const health = await provider.healthCheck();

    if (!health.ok) {
      return jsonResponse({ ok: false, error: health.error }, 503);
    }

    try {
      const testResult = await provider.extractBalances(
        "Account: Test Savings\nBalance: $1,234.56\nAs of: 2026-01-01"
      );
      return jsonResponse({ ok: true, model: health.model, testResult });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonResponse({ ok: false, model: health.model, error: message }, 502);
    }
  } catch (error) {
    return handleError(error);
  }
}
