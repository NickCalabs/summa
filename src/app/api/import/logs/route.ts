import { db } from "@/lib/db";
import { importLogs, importSources } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const logs = await db
      .select({
        id: importLogs.id,
        sourceId: importLogs.sourceId,
        sourceName: importSources.name,
        filename: importLogs.filename,
        status: importLogs.status,
        errorMessage: importLogs.errorMessage,
        appliedChanges: importLogs.appliedChanges,
        createdAt: importLogs.createdAt,
      })
      .from(importLogs)
      .leftJoin(importSources, eq(importLogs.sourceId, importSources.id))
      .where(eq(importLogs.userId, user.id))
      .orderBy(desc(importLogs.createdAt))
      .limit(50);

    return jsonResponse(logs);
  } catch (error) {
    return handleError(error);
  }
}
