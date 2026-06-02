import { db } from "@/lib/db";
import { aiSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";
import { getAIProvider } from "@/lib/ai";

interface TestBody {
  endpoint?: string;
  model?: string | null;
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    // Optional override — caller can pass form values to test without saving
    let override: TestBody = {};
    try {
      const text = await request.text();
      if (text) override = JSON.parse(text) as TestBody;
    } catch {
      // No body or invalid JSON — fall back to saved settings
    }

    let endpoint: string | undefined;
    let model: string | null | undefined;

    if (override.endpoint !== undefined || override.model !== undefined) {
      endpoint = override.endpoint;
      model = override.model;
    } else {
      const [settings] = await db
        .select()
        .from(aiSettings)
        .where(eq(aiSettings.userId, user.id))
        .limit(1);
      endpoint = settings?.endpoint;
      model = settings?.model;
    }

    const provider = getAIProvider({ endpoint, model });
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
