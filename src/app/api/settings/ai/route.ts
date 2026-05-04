import { db } from "@/lib/db";
import { aiSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  requireAuth,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, updateAiSettings } from "@/types";
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
    const health = await provider.healthCheck();

    return jsonResponse({
      endpoint: settings?.endpoint || "http://192.168.1.250:11434",
      model: settings?.model || null,
      health,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, updateAiSettings);

    const [existing] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, user.id))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(aiSettings)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(aiSettings.id, existing.id))
        .returning();
      return jsonResponse(updated);
    }

    const [created] = await db
      .insert(aiSettings)
      .values({ userId: user.id, ...body })
      .returning();
    return jsonResponse(created, 201);
  } catch (error) {
    return handleError(error);
  }
}
