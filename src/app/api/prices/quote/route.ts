import {
  requireAuth,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { getProvider } from "@/lib/providers/types";

export async function GET(request: Request) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const source = searchParams.get("source");
    const currency = searchParams.get("currency") ?? "USD";

    if (!symbol || !source) {
      return errorResponse("Missing symbol or source", 400);
    }

    const provider = await getProvider(source);
    const result = await provider.getPrice(symbol, currency);

    return jsonResponse(result);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Quote fetch error:", error);
    return errorResponse("Failed to fetch quote", 502);
  }
}
