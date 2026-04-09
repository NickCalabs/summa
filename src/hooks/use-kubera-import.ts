import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ImportAction {
  kuberaId: string;
  action: "create" | "match" | "skip";
  summaAssetId?: string;
  name: string;
  category: "asset" | "debt";
  sheetName: string;
  sectionName: string;
  value: number;
  currency: string;
  ticker: string | null;
  quantity: number | null;
  price: number | null;
  ownership: number;
  costBasis: number | null;
  isInvestable: boolean;
  isCashEquivalent: boolean;
  assetType: string;
  providerType: "manual" | "ticker";
  purchaseDate: string | null;
  notes: string | null;
}

interface ImportRequest {
  exportDate: string;
  portfolioId: string;
  actions: ImportAction[];
}

interface ImportResponse {
  assetsCreated: number;
  assetsMatched: number;
  assetsSkipped: number;
  snapshotsInserted: number;
  sheetsCreated: number;
  sectionsCreated: number;
  errors: string[];
}

export function useKuberaImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ImportRequest): Promise<ImportResponse> => {
      const res = await fetch("/api/import/kubera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Import failed" }));
        throw new Error(err.error ?? "Import failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      toast.success(
        `Imported ${data.assetsCreated} assets, matched ${data.assetsMatched}, skipped ${data.assetsSkipped}`
      );
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
}
