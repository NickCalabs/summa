import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  requireAuth,
  requireAssetOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, createTransaction } from "@/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    await requireAssetOwnership(id, user.id);

    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.assetId, id))
      .orderBy(desc(transactions.date), desc(transactions.createdAt));

    return jsonResponse(rows);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    await requireAssetOwnership(id, user.id);

    const body = await parseBody(request, createTransaction);

    const [created] = await db
      .insert(transactions)
      .values({
        assetId: id,
        type: body.type,
        quantity: body.quantity ?? null,
        price: body.price ?? null,
        total: body.total,
        date: body.date,
        notes: body.notes ?? null,
      })
      .returning();

    return jsonResponse(created, 201);
  } catch (error) {
    return handleError(error);
  }
}
