import { db } from "@/lib/db";
import { importSources } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  requireAuth,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, createImportSource } from "@/types";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const sources = await db
      .select()
      .from(importSources)
      .where(eq(importSources.userId, user.id))
      .orderBy(desc(importSources.lastUsedAt));

    return jsonResponse(sources);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, createImportSource);

    const [source] = await db
      .insert(importSources)
      .values({ userId: user.id, ...body })
      .returning();

    return jsonResponse(source, 201);
  } catch (error) {
    return handleError(error);
  }
}
