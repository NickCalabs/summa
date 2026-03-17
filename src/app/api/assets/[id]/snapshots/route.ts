import { db } from "@/lib/db";
import { assetSnapshots } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  requireAuth,
  requireAssetOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    await requireAssetOwnership(id, user.id);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const conditions = [eq(assetSnapshots.assetId, id)];
    if (from) conditions.push(gte(assetSnapshots.date, from));
    if (to) conditions.push(lte(assetSnapshots.date, to));

    const snapshots = await db
      .select()
      .from(assetSnapshots)
      .where(and(...conditions))
      .orderBy(desc(assetSnapshots.date));

    return jsonResponse(snapshots);
  } catch (error) {
    return handleError(error);
  }
}
