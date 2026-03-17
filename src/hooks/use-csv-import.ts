import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useUploadCsv(portfolioId: string) {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `/api/portfolios/${portfolioId}/import-csv`,
        { method: "POST", body: formData }
      );
      if (!res.ok) throw new Error("Failed to upload CSV");
      return res.json() as Promise<{
        headers: string[];
        format: string;
        columnMapping: Record<string, string>;
        preview: Record<string, string>[];
        totalRows: number;
      }>;
    },
    onError: () => {
      toast.error("Failed to parse CSV file");
    },
  });
}

export function useImportCsv(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      sectionId: string;
      columnMapping: Record<string, string>;
      defaultCurrency?: string;
      rows: Record<string, string>[];
    }) => {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/import-csv/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error("Failed to import CSV");
      return res.json() as Promise<{
        imported: number;
        skipped: number;
        errors: string[];
      }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success(`Imported ${result.imported} assets`);
    },
    onError: () => {
      toast.error("Failed to import CSV");
    },
  });
}
