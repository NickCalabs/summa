"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useUIStore } from "@/stores/ui-store";
import { usePortfolio } from "@/hooks/use-portfolio";
import {
  useExtractImport,
  useApplyImport,
  type ExtractResponse,
  type ApplyUpdate,
} from "@/hooks/use-import";
import { UploadStep } from "./upload-step";
import { ExtractionStep } from "./extraction-step";
import { MappingStep, type MappingValue } from "./mapping-step";
import { ConfirmationStep } from "./confirmation-step";
import { SuccessStep } from "./success-step";
import type { Asset } from "@/hooks/use-portfolio";
import { computeSeverity } from "@/lib/ai/anomaly";

type Step = "upload" | "extracting" | "mapping" | "confirmation" | "success";

interface Props {
  portfolioId: string;
}

export function ImportDialog({ portfolioId }: Props) {
  const open = useUIStore((s) => s.importDialogOpen);
  const close = useUIStore((s) => s.closeImportDialog);

  const portfolioQuery = usePortfolio(portfolioId);
  const extract = useExtractImport();
  const apply = useApplyImport();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [extracted, setExtracted] = useState<ExtractResponse | null>(null);
  const [mappingResult, setMappingResult] = useState<{
    mappings: Record<string, MappingValue>;
    sourceName: string;
    saveSource: boolean;
  } | null>(null);
  const [applyResult, setApplyResult] = useState<{ count: number; logId: string } | null>(
    null
  );

  function reset() {
    setStep("upload");
    setFile(null);
    setSourceId(undefined);
    setExtracted(null);
    setMappingResult(null);
    setApplyResult(null);
  }

  function handleClose() {
    close();
    // Slight delay so the close animation isn't jumpy
    setTimeout(reset, 200);
  }

  // Flatten all assets across the portfolio into a single list
  const flatAssets: Asset[] = [];
  if (portfolioQuery.data) {
    for (const sheet of portfolioQuery.data.sheets) {
      for (const section of sheet.sections) {
        for (const asset of section.assets) {
          flatAssets.push(asset);
          if (asset.children) {
            for (const child of asset.children) {
              flatAssets.push(child);
            }
          }
        }
      }
    }
  }

  function startExtraction(f: File, srcId?: string) {
    setFile(f);
    setSourceId(srcId);
    setStep("extracting");
    extract.mutate(
      { file: f, sourceId: srcId, portfolioId },
      {
        onSuccess: (data) => {
          setExtracted(data);
          if (data.extracted.length === 0) {
            setStep("upload");
            return;
          }
          setStep("mapping");
        },
        onError: () => {
          setStep("upload");
        },
      }
    );
  }

  function applyImport() {
    if (!file || !mappingResult || !extracted) return;

    const updates: ApplyUpdate[] = [];
    const fieldMappings: {
      extractedKey: string;
      assetId: string;
      field: "currentValue" | "quantity";
      currency: string;
    }[] = [];

    for (const item of extracted.extracted) {
      const mapping = mappingResult.mappings[item.account];
      if (!mapping || !mapping.assetId) continue;
      const value = String(item.balance);
      // Don't overwrite asset.currency on import — that's user-managed asset
      // metadata, not something the document should change. The confirmation
      // step warns on currency mismatches; if the user proceeds, we update
      // the value/quantity but leave the asset's currency alone.
      updates.push({
        assetId: mapping.assetId,
        field: mapping.field,
        value,
      });
      fieldMappings.push({
        extractedKey: item.account,
        assetId: mapping.assetId,
        field: mapping.field,
        currency: item.currency,
      });
    }

    apply.mutate(
      {
        filename: file.name,
        updates,
        sourceId,
        saveSource:
          mappingResult.saveSource && !sourceId
            ? {
                name: mappingResult.sourceName,
                fieldMappings,
              }
            : undefined,
      },
      {
        onSuccess: (data) => {
          setApplyResult({ count: data.updated.length, logId: data.logId });
          setStep("success");
        },
      }
    );
  }

  // Build confirmation rows
  const confirmRows = (() => {
    if (!extracted || !mappingResult) return [];
    return extracted.extracted
      .map((item) => {
        const mapping = mappingResult.mappings[item.account];
        if (!mapping || !mapping.assetId) return null;
        const asset = flatAssets.find((a) => a.id === mapping.assetId);
        if (!asset) return null;

        const currentRaw =
          mapping.field === "quantity" ? (asset.quantity ?? "0") : asset.currentValue;
        const currentNum = Number(currentRaw);
        const newNum = item.balance;
        const delta = newNum - currentNum;
        const pct = currentNum !== 0 ? (delta / currentNum) * 100 : null;

        // Use a safe currency code for Intl.NumberFormat — the AI sometimes
        // returns non-ISO codes (e.g., "sats") that Intl rejects. Fall back to
        // a plain number with the code appended.
        function fmtCurrency(n: number, code: string): string {
          try {
            return n.toLocaleString(undefined, {
              style: "currency",
              currency: code,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          } catch {
            return `${n.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} ${code}`;
          }
        }

        const fmt = (n: number) => {
          if (mapping.field === "quantity") {
            return `${parseFloat(n.toFixed(8)).toString()} ${item.currency}`;
          }
          return fmtCurrency(n, item.currency);
        };

        const deltaStr =
          (delta >= 0 ? "+" : "") +
          fmt(delta) +
          (pct !== null ? ` (${(delta >= 0 ? "+" : "") + pct.toFixed(1)}%)` : "");

        // For quantity-based assets, the asset's "currency" represents the
        // crypto/unit it holds, so we should compare against the extracted
        // currency of the quantity. For value updates, same thing.
        const { severity, warnings } = computeSeverity({
          currentNum,
          newNum,
          assetCurrency: asset.currency,
          extractedCurrency: item.currency,
        });

        return {
          assetId: asset.id,
          assetName: asset.name,
          field: mapping.field,
          currentDisplay: fmt(currentNum),
          newDisplay: fmt(newNum),
          delta: deltaStr,
          severity,
          warnings,
        };
      })
      .filter(Boolean) as Array<{
      assetId: string;
      assetName: string;
      field: "currentValue" | "quantity";
      currentDisplay: string;
      newDisplay: string;
      delta: string;
      severity: import("@/lib/ai/anomaly").Severity;
      warnings: string[];
    }>;
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleClose() : null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Document</DialogTitle>
          <DialogDescription>
            Drop a PDF or CSV statement and we&apos;ll extract balances using your local
            Ollama server.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && <UploadStep onFileSelected={startExtraction} />}
        {step === "extracting" && file && <ExtractionStep filename={file.name} />}
        {step === "mapping" && extracted && (
          <MappingStep
            extracted={extracted.extracted}
            suggestedMappings={extracted.suggestedMappings}
            matchedSource={extracted.matchedSource}
            assets={flatAssets}
            defaultSourceName={file?.name.replace(/\.[^.]+$/, "") ?? ""}
            onBack={() => setStep("upload")}
            onContinue={(result) => {
              setMappingResult(result);
              setStep("confirmation");
            }}
          />
        )}
        {step === "confirmation" && mappingResult && (
          <ConfirmationStep
            rows={confirmRows}
            asOfDate={extracted?.extracted[0]?.asOfDate}
            isApplying={apply.isPending}
            onBack={() => setStep("mapping")}
            onApply={applyImport}
          />
        )}
        {step === "success" && applyResult && mappingResult && (
          <SuccessStep
            count={applyResult.count}
            sourceName={mappingResult.sourceName}
            logId={applyResult.logId}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
