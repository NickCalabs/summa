import { db } from "@/lib/db";
import { aiSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";
import { getAIProvider } from "@/lib/ai";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const [settings] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, user.id))
      .limit(1);

    const provider = getAIProvider(settings || undefined);
    const models = await provider.listModels();

    return jsonResponse({ models });
  } catch (error) {
    return handleError(error);
  }
}
