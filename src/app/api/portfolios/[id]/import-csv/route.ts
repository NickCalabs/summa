import { jsonResponse, errorResponse, handleError, requireAuth, requirePortfolioOwnership, validateUuid } from "@/lib/api-helpers";
import { detectColumnMapping, detectSourceFormat } from "@/lib/csv-utils";
import Papa from "papaparse";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return errorResponse("No CSV file provided", 400);
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return errorResponse("File must be a CSV", 400);
    }

    const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse("File too large. Maximum size is 1MB.", 413);
    }

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return errorResponse("Failed to parse CSV", 400, parsed.errors.slice(0, 5));
    }

    const headers = parsed.meta.fields ?? [];
    const columnMapping = detectColumnMapping(headers);
    const format = detectSourceFormat(headers);

    // Return preview (first 50 rows)
    const preview = parsed.data.slice(0, 50);

    return jsonResponse({
      headers,
      format,
      columnMapping,
      preview,
      totalRows: parsed.data.length,
    });
  } catch (error) {
    return handleError(error);
  }
}
