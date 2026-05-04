import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ImportSource } from "./use-import";

export function useImportSources() {
  return useQuery<ImportSource[]>({
    queryKey: ["import-sources"],
    queryFn: async () => {
      const res = await fetch("/api/import/sources");
      if (!res.ok) throw new Error("Failed to load sources");
      return res.json();
    },
  });
}

export function useDeleteImportSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/import/sources/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Delete failed" }));
        throw new Error(err.error ?? "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["import-sources"] });
      toast.success("Source deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
