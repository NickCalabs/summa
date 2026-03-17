import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";

export async function GET(request: Request) {
  try {
    await requireAuth(request);
    return jsonResponse([]);
  } catch (error) {
    return handleError(error);
  }
}
