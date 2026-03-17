import { jsonResponse, handleError, requireAuth } from "@/lib/api-helpers";
import { isPlaidConfigured } from "@/lib/providers/plaid";

export async function GET(request: Request) {
  try {
    await requireAuth(request);
    return jsonResponse({ configured: isPlaidConfigured() });
  } catch (error) {
    return handleError(error);
  }
}
