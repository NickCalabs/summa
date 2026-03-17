import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";
import { getExchangeRates } from "@/lib/providers/exchange-rates";

export async function GET(request: Request) {
  try {
    await requireAuth(request);

    const url = new URL(request.url);
    const base = url.searchParams.get("base") ?? "USD";
    const rates = await getExchangeRates(base);

    return jsonResponse({ base, rates });
  } catch (error) {
    return handleError(error);
  }
}
