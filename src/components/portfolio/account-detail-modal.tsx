"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AccountDetailView } from "./account-detail-view";
import { useUIStore } from "@/stores/ui-store";

export function AccountDetailModal() {
  const assetId = useUIStore((s) => s.accountDetailAssetId);
  const portfolioId = useUIStore((s) => s.accountDetailPortfolioId);
  const closeAccountDetail = useUIStore((s) => s.closeAccountDetail);

  const open = assetId !== null && portfolioId !== null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeAccountDetail()}>
      <DialogContent
        className="sm:max-w-5xl max-h-[90vh] overflow-y-auto p-6"
        showCloseButton
      >
        {open && (
          <AccountDetailView
            portfolioId={portfolioId}
            assetId={assetId}
            isModal
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
