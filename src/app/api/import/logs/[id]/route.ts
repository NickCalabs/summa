import { db } from "@/lib/db";
import { importLogs, importSources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  validateUuid,
  jsonResponse,
  errorResponse,
  handleError,
} from "@/lib/api-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "log ID");

    const [log] = await db
      .select({
        id: importLogs.id,
        sourceId: importLogs.sourceId,
        sourceName: importSources.name,
        filename: importLogs.filename,
        status: importLogs.status,
        extractedData: importLogs.extractedData,
        appliedChanges: importLogs.appliedChanges,
        errorMessage: importLogs.errorMessage,
        createdAt: importLogs.createdAt,
      })
      .from(importLogs)
      .leftJoin(importSources, eq(importLogs.sourceId, importSources.id))
      .where(
        and(eq(importLogs.id, id), eq(importLogs.userId, user.id))
      )
      .limit(1);

    if (!log) return errorResponse("Import log not found", 404);
    return jsonResponse(log);
  } catch (error) {
    return handleError(error);
  }
}
