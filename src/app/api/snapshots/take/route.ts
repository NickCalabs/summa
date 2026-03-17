import { takePortfolioSnapshot } from "@/lib/snapshots";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, takeSnapshot } from "@/types";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, takeSnapshot);
    await requirePortfolioOwnership(body.portfolioId, user.id);

    const result = await takePortfolioSnapshot(body.portfolioId);
    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
}
