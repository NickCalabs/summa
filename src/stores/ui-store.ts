import { create } from "zustand";

interface UIStore {
  activeSheetId: string | null;
  setActiveSheet: (id: string) => void;

  detailPanelAssetId: string | null;
  openDetailPanel: (assetId: string) => void;
  closeDetailPanel: () => void;

  collapsedSections: Set<string>;
  toggleSection: (sectionId: string) => void;

  selectedAssetIds: Set<string>;
  toggleAssetSelection: (assetId: string) => void;
  clearSelection: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeSheetId: null,
  setActiveSheet: (id) => set({ activeSheetId: id }),

  detailPanelAssetId: null,
  openDetailPanel: (assetId) => set({ detailPanelAssetId: assetId }),
  closeDetailPanel: () => set({ detailPanelAssetId: null }),

  collapsedSections: new Set(),
  toggleSection: (sectionId) =>
    set((state) => {
      const next = new Set(state.collapsedSections);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return { collapsedSections: next };
    }),

  selectedAssetIds: new Set(),
  toggleAssetSelection: (assetId) =>
    set((state) => {
      const next = new Set(state.selectedAssetIds);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return { selectedAssetIds: next };
    }),
  clearSelection: () => set({ selectedAssetIds: new Set() }),
}));
