import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface ExtractedBalance {
  account: string;
  balance: number;
  currency: string;
  asOfDate?: string;
  confidence: number;
  rawText?: string;
}

export interface SuggestedMapping {
  extractedKey: string;
  suggestedAssetId: string | null;
  suggestedAssetName: string | null;
  confidence: number;
  field: "currentValue" | "quantity" | null;
}

export interface ImportSource {
  id: string;
  userId: string;
  name: string;
  fileType: string | null;
  extractionHints: string | null;
  fieldMappings: Array<{
    extractedKey: string;
    assetId: string;
    field: "currentValue" | "quantity";
    currency: string;
  }>;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractResponse {
  extracted: ExtractedBalance[];
  matchedSource: ImportSource | null;
  suggestedMappings: SuggestedMapping[];
}

export interface ApplyUpdate {
  assetId: string;
  field: "currentValue" | "quantity";
  value: string;
  currency?: string;
}

export interface ApplyRequest {
  filename: string;
  updates: ApplyUpdate[];
  sourceId?: string;
  saveSource?: {
    name: string;
    extractionHints?: string;
    fieldMappings: Array<{
      extractedKey: string;
      assetId: string;
      field: "currentValue" | "quantity";
      currency: string;
    }>;
  };
}

export interface ApplyResponse {
  updated: Array<{
    assetId: string;
    assetName: string;
    previousValue: string;
    newValue: string;
    field: string;
  }>;
  logId: string;
}

export interface ImportLog {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  filename: string;
  status: string;
  errorMessage: string | null;
  appliedChanges: Array<{
    assetId: string;
    assetName: string;
    previousValue: string;
    newValue: string;
    field: string;
  }> | null;
  extractedData?: unknown;
  createdAt: string;
}

export function useExtractImport() {
  return useMutation({
    mutationFn: async (params: {
      file: File;
      sourceId?: string;
      portfolioId?: string;
    }): Promise<ExtractResponse> => {
      const fd = new FormData();
      fd.append("file", params.file);
      if (params.sourceId) fd.append("sourceId", params.sourceId);
      if (params.portfolioId) fd.append("portfolioId", params.portfolioId);

      const res = await fetch("/api/import/extract", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Extraction failed" }));
        throw new Error(err.error ?? "Extraction failed");
      }
      return res.json();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useApplyImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: ApplyRequest): Promise<ApplyResponse> => {
      const res = await fetch("/api/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Apply failed" }));
        throw new Error(err.error ?? "Apply failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      qc.invalidateQueries({ queryKey: ["import-logs"] });
      qc.invalidateQueries({ queryKey: ["import-sources"] });
      toast.success(`Updated ${data.updated.length} asset${data.updated.length === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useImportLogs() {
  return useQuery<ImportLog[]>({
    queryKey: ["import-logs"],
    queryFn: async () => {
      const res = await fetch("/api/import/logs");
      if (!res.ok) throw new Error("Failed to load import history");
      return res.json();
    },
  });
}

export function useImportLog(id: string | null) {
  return useQuery<ImportLog>({
    queryKey: ["import-logs", id],
    queryFn: async () => {
      const res = await fetch(`/api/import/logs/${id}`);
      if (!res.ok) throw new Error("Failed to load import log");
      return res.json();
    },
    enabled: !!id,
  });
}
