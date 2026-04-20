import { db } from "@/lib/db";
import { simplefinConnections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import { syncSimpleFINConnection } from "@/lib/simplefin-sync";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "connection ID");

    const [connection] = await db
      .select()
      .from(simplefinConnections)
      .where(
        and(
          eq(simplefinConnections.id, id),
          eq(simplefinConnections.userId, user.id)
        )
      )
      .limit(1);

    if (!connection) {
      return errorResponse("Connection not found", 404);
    }

    const result = await syncSimpleFINConnection({
      connectionId: id,
      accessUrlEnc: connection.accessUrlEnc,
    });

    if (!result.ok) {
      return errorResponse(result.errorMessage ?? "Sync failed", result.errorStatus ?? 500, {
        code: result.errorCode,
      });
    }

    return jsonResponse({
      synced: result.synced,
      warnings: result.warnings,
    });
  } catch (error) {
    return handleError(error);
  }
}
