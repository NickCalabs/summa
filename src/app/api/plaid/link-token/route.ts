import { jsonResponse, errorResponse, handleError, requireAuth } from "@/lib/api-helpers";
import { isPlaidConfigured, createLinkToken } from "@/lib/providers/plaid";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    if (!isPlaidConfigured()) {
      return errorResponse("Plaid is not configured", 400);
    }

    const linkToken = await createLinkToken(user.id);
    return jsonResponse({ linkToken });
  } catch (error) {
    return handleError(error);
  }
}
