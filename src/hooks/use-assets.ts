import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Portfolio, Asset } from "@/hooks/use-portfolio";
import {
  findAssetInTree,
  updateAssetInTree,
  removeAssetFromTree,
  insertAssetInTree,
} from "@/lib/portfolio-utils";

type QueryKey = ["portfolio", string];

function portfolioKey(portfolioId: string): QueryKey {
  return ["portfolio", portfolioId];
}

export function useUpdateAsset(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

  return useMutation({
    mutationFn: async (data: { id: string } & Partial<Asset>) => {
      const { id, ...body } = data;
      const res = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update asset");
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const { id, ...partial } = data;
      const merged: Partial<Asset> = { ...partial };

      const hasCurrentValue = partial.currentValue !== undefined;
      const hasQuantity = partial.quantity !== undefined;
      const hasCurrentPrice = partial.currentPrice !== undefined;

      if (hasCurrentValue && !hasQuantity && !hasCurrentPrice) {
        // Mode 1: Value-only — clear price
        merged.currentPrice = null;
      } else if ((hasQuantity || hasCurrentPrice) && !hasCurrentValue) {
        // Mode 2: Price-driven — recompute value
        const existing = findAssetInTree(previous, id);
        const quantity = hasQuantity
          ? Number(partial.quantity)
          : Number(existing?.quantity ?? 0);
        const price = hasCurrentPrice
          ? Number(partial.currentPrice)
          : Number(existing?.currentPrice ?? 0);
        merged.currentValue = (quantity * price).toFixed(2);
      }

      queryClient.setQueryData<Portfolio>(
        key,
        updateAssetInTree(previous, id, merged)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to update asset");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useCreateAsset(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

  return useMutation({
    mutationFn: async (
      data: { sectionId: string; name: string } & Partial<Asset>
    ) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create asset");
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const tempAsset: Asset = {
        id: crypto.randomUUID(),
        sectionId: data.sectionId,
        name: data.name,
        type: data.type ?? "other",
        sortOrder: 999,
        currency: data.currency ?? previous.currency ?? "USD",
        quantity: data.quantity ?? null,
        costBasis: data.costBasis ?? null,
        currentValue: data.currentValue ?? "0",
        currentPrice: data.currentPrice ?? null,
        isInvestable: data.isInvestable ?? true,
        isCashEquivalent: data.isCashEquivalent ?? false,
        providerType: data.providerType ?? "manual",
        providerConfig: (data.providerConfig as Record<string, unknown>) ?? null,
        staleDays: (data.staleDays as number) ?? null,
        lastSyncedAt: null,
        ownershipPct: data.ownershipPct ?? "100",
        notes: data.notes ?? null,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<Portfolio>(
        key,
        insertAssetInTree(previous, data.sectionId, tempAsset)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to create asset");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useArchiveAsset(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

  return useMutation({
    mutationFn: async (data: { id: string }) => {
      const res = await fetch(`/api/assets/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: true }),
      });
      if (!res.ok) throw new Error("Failed to archive asset");
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      queryClient.setQueryData<Portfolio>(
        key,
        removeAssetFromTree(previous, data.id)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to archive asset");
    },
    onSuccess: (_data, vars) => {
      toast("Asset archived", {
        action: {
          label: "Undo",
          onClick: () => {
            fetch(`/api/assets/${vars.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isArchived: false }),
            }).then(() => {
              queryClient.invalidateQueries({ queryKey: key });
            });
          },
        },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDeleteAsset(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

  return useMutation({
    mutationFn: async (data: { id: string }) => {
      const res = await fetch(`/api/assets/${data.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete asset");
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      queryClient.setQueryData<Portfolio>(
        key,
        removeAssetFromTree(previous, data.id)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to delete asset");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useMoveAsset(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

  return useMutation({
    mutationFn: async (data: {
      id: string;
      sectionId: string;
      sortOrder?: number;
    }) => {
      const res = await fetch(`/api/assets/${data.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: data.sectionId,
          sortOrder: data.sortOrder,
        }),
      });
      if (!res.ok) throw new Error("Failed to move asset");
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      // Find the asset before removing
      const asset = findAssetInTree(previous, data.id);
      if (!asset) return { previous };

      const withoutAsset = removeAssetFromTree(previous, data.id);
      const movedAsset = { ...asset, sectionId: data.sectionId };
      queryClient.setQueryData<Portfolio>(
        key,
        insertAssetInTree(withoutAsset, data.sectionId, movedAsset)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to move asset");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useReorderAssets(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

  return useMutation({
    mutationFn: async (data: { items: { id: string; sortOrder: number }[] }) => {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/assets/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error("Failed to reorder assets");
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const clone = structuredClone(previous);
      const orderMap = new Map(data.items.map((i) => [i.id, i.sortOrder]));
      for (const sheet of clone.sheets) {
        for (const section of sheet.sections) {
          for (const asset of section.assets) {
            const newOrder = orderMap.get(asset.id);
            if (newOrder !== undefined) asset.sortOrder = newOrder;
          }
          section.assets.sort((a, b) => a.sortOrder - b.sortOrder);
        }
      }
      queryClient.setQueryData<Portfolio>(key, clone);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to reorder assets");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
