"use client";

import { useState } from "react";
import {
  Building2Icon,
  TrendingUpIcon,
  WalletIcon,
  HomeIcon,
  CarIcon,
  GemIcon,
  PencilIcon,
  UploadIcon,
  CreditCardIcon,
  LandmarkIcon,
  ArrowLeftIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { ManualAssetForm } from "./manual-asset-form";
import { TickerAssetForm } from "./ticker-asset-form";
import type { Section } from "@/hooks/use-portfolio";

interface CategoryOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

const ASSET_CATEGORIES: CategoryOption[] = [
  {
    id: "plaid",
    label: "Banks & Brokerages",
    description: "Connect via Plaid or SimpleFIN",
    icon: Building2Icon,
  },
  {
    id: "ticker",
    label: "Stock & Fund Tickers",
    description: "Search by ticker symbol",
    icon: TrendingUpIcon,
  },
  {
    id: "crypto",
    label: "Crypto Wallets & Exchanges",
    description: "Track wallet or exchange",
    icon: WalletIcon,
  },
  {
    id: "real_estate",
    label: "Real Estate",
    description: "Property value tracking",
    icon: HomeIcon,
  },
  {
    id: "vehicle",
    label: "Vehicles",
    description: "Vehicle value",
    icon: CarIcon,
  },
  {
    id: "precious_metals",
    label: "Precious Metals",
    description: "Gold, silver, etc.",
    icon: GemIcon,
  },
  {
    id: "manual",
    label: "Manual Asset",
    description: "Enter value or qty x price",
    icon: PencilIcon,
  },
  {
    id: "csv",
    label: "CSV Import",
    description: "Bulk import from spreadsheet",
    icon: UploadIcon,
  },
];

const DEBT_CATEGORIES: CategoryOption[] = [
  {
    id: "plaid",
    label: "Loans & Mortgages",
    description: "Connect via Plaid or SimpleFIN",
    icon: LandmarkIcon,
  },
  {
    id: "plaid_cc",
    label: "Credit Cards",
    description: "Connect via Plaid or SimpleFIN",
    icon: CreditCardIcon,
  },
  {
    id: "manual",
    label: "Manual Debt",
    description: "Enter balance manually",
    icon: PencilIcon,
  },
  {
    id: "csv",
    label: "CSV Import",
    description: "Bulk import from spreadsheet",
    icon: UploadIcon,
  },
];

interface AddFlowDialogProps {
  portfolioId: string;
  currency: string;
  sections: Section[];
}

export function AddFlowDialog({
  portfolioId,
  currency,
  sections,
}: AddFlowDialogProps) {
  const addFlowOpen = useUIStore((s) => s.addFlowOpen);
  const sheetType = useUIStore((s) => s.addFlowSheetType);
  const step = useUIStore((s) => s.addFlowStep);
  const category = useUIStore((s) => s.addFlowCategory);
  const defaultSectionId = useUIStore((s) => s.addFlowDefaultSectionId);
  const closeAddFlow = useUIStore((s) => s.closeAddFlow);
  const setAddFlowStep = useUIStore((s) => s.setAddFlowStep);
  const openPlaidDialog = useUIStore((s) => s.openPlaidDialog);
  const openCsvImportDialog = useUIStore((s) => s.openCsvImportDialog);

  const categories = sheetType === "debts" ? DEBT_CATEGORIES : ASSET_CATEGORIES;
  const title = sheetType === "debts" ? "Add Debt" : "Add Asset";

  function handleCategorySelect(categoryId: string) {
    // Categories that delegate to existing dialogs
    if (categoryId === "plaid" || categoryId === "plaid_cc") {
      closeAddFlow();
      openPlaidDialog();
      return;
    }

    if (categoryId === "csv") {
      closeAddFlow();
      openCsvImportDialog();
      return;
    }

    if (categoryId === "crypto") {
      // Placeholder — for now treat as manual with crypto type pre-selected
      setAddFlowStep("form", "manual");
      return;
    }

    // Categories that open the form step
    setAddFlowStep("form", categoryId);
  }

  function handleBack() {
    setAddFlowStep("category");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) closeAddFlow();
  }

  function handleAssetCreated() {
    closeAddFlow();
  }

  const effectiveSectionId = defaultSectionId ?? sections[0]?.id ?? null;

  return (
    <Dialog open={addFlowOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "form" && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-2 -ml-1 align-middle"
                onClick={handleBack}
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
            )}
            {step === "form" ? getCategoryLabel(category, categories) : title}
          </DialogTitle>
          {step === "category" && (
            <DialogDescription>
              Choose how you want to add {sheetType === "debts" ? "a debt" : "an asset"}.
            </DialogDescription>
          )}
        </DialogHeader>

        {step === "category" && (
          <CategoryGrid
            categories={categories}
            onSelect={handleCategorySelect}
          />
        )}

        {step === "form" && category === "manual" && effectiveSectionId && (
          <ManualAssetForm
            portfolioId={portfolioId}
            currency={currency}
            sections={sections}
            defaultSectionId={effectiveSectionId}
            onSuccess={handleAssetCreated}
          />
        )}

        {step === "form" && category === "ticker" && effectiveSectionId && (
          <TickerAssetForm
            portfolioId={portfolioId}
            currency={currency}
            sections={sections}
            defaultSectionId={effectiveSectionId}
            onSuccess={handleAssetCreated}
          />
        )}

        {step === "form" &&
          (category === "real_estate" || category === "vehicle" || category === "precious_metals") &&
          effectiveSectionId && (
            <ManualAssetForm
              portfolioId={portfolioId}
              currency={currency}
              sections={sections}
              defaultSectionId={effectiveSectionId}
              defaultType={category === "precious_metals" ? "other" : category}
              onSuccess={handleAssetCreated}
            />
          )}
      </DialogContent>
    </Dialog>
  );
}

function getCategoryLabel(
  categoryId: string | null,
  categories: CategoryOption[]
): string {
  if (!categoryId) return "";
  return categories.find((c) => c.id === categoryId)?.label ?? categoryId;
}

function CategoryGrid({
  categories,
  onSelect,
}: {
  categories: CategoryOption[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onSelect(cat.id)}
          className="flex flex-col items-start gap-2 rounded-lg border border-border/60 p-3 text-left transition-colors hover:bg-accent hover:border-accent-foreground/20"
        >
          <cat.icon className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium leading-tight">{cat.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {cat.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
