import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface ModelInfo {
  id: string;
  name: string;
  size?: string;
}

export interface AiSettings {
  endpoint: string;
  model: string | null;
  health: { ok: boolean; model: string; error?: string };
}

export function useAiSettings() {
  return useQuery<AiSettings>({
    queryKey: ["ai-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ai");
      if (!res.ok) throw new Error("Failed to load AI settings");
      return res.json();
    },
  });
}

export function useAiModels() {
  return useQuery<{ models: ModelInfo[] }>({
    queryKey: ["ai-models"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ai/models");
      if (!res.ok) throw new Error("Failed to load models");
      return res.json();
    },
  });
}

export function useUpdateAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { endpoint?: string; model?: string | null }) => {
      const res = await fetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to update" }));
        throw new Error(err.error ?? "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
      qc.invalidateQueries({ queryKey: ["ai-models"] });
      toast.success("AI settings updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useTestAiConnection() {
  return useMutation({
    mutationFn: async (override?: { endpoint?: string; model?: string | null }) => {
      const res = await fetch("/api/settings/ai/test", {
        method: "POST",
        headers: override ? { "Content-Type": "application/json" } : undefined,
        body: override ? JSON.stringify(override) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Connected to ${data.model}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
