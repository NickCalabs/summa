"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UploadIcon, Loader2Icon, CheckCircleIcon } from "lucide-react";
import { KuberaTree } from "./kubera-tree";
import {
  parseKuberaJson,
  autoMatch,
  type ParsedImport,
  type ImportAction,
} from "@/lib/kubera-parser";
import { useKuberaImport } from "@/hooks/use-kubera-import";

interface ExistingAsset {
  id: string;
  name: string;
  providerType: string;
}

interface KuberaImportProps {
  portfolioId: string;
  existingAssets: ExistingAsset[];
  existingSheetNames: Set<string>;
  existingSectionKeys: Set<string>; // "sheetName::sectionName"
}

type Step = "upload" | "review" | "confirm" | "result";

export function KuberaImport({ portfolioId, existingAssets, existingSheetNames, existingSectionKeys }: KuberaImportProps) {
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [exportDate, setExportDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [importResult, setImportResult] = useState<{
    assetsCreated: number;
    assetsMatched: number;
    assetsSkipped: number;
    snapshotsInserted: number;
    sheetsCreated: number;
    sectionsCreated: number;
    errors: string[];
  } | null>(null);

  const importMutation = useKuberaImport();

  const processJson = useCallback(
    (raw: string) => {
      setError(null);
      try {
        const result = parseKuberaJson(raw);
        const matched = autoMatch(result, existingAssets);
        setParsed(matched);
        setStep("review");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse JSON");
      }
    },
    [existingAssets]
  );

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const reader = new FileReader();
      reader.onload = (e) => processJson(e.target?.result as string);
      reader.readAsText(file);
    },
    [processJson]
  );

  const handleActionChange = useCallback(
    (kuberaId: string, action: ImportAction, matchedAssetId?: string) => {
      setParsed((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        for (const sheet of next.sheets) {
          for (const section of sheet.sections) {
            for (const account of section.accounts) {
              if (account.kuberaId === kuberaId) {
                account.action = action;
                account.matchedAssetId = matchedAssetId ?? null;
                return next;
              }
            }
          }
        }
        return next;
      });
    },
    []
  );

  const summary = parsed
    ? (() => {
        let create = 0,
          match = 0,
          skip = 0;
        const newSheets = new Set<string>();
        const newSections = new Set<string>();
        for (const sheet of parsed.sheets) {
          for (const section of sheet.sections) {
            for (const account of section.accounts) {
              if (account.action === "create") {
                create++;
                if (!existingSheetNames.has(sheet.name)) newSheets.add(sheet.name);
                if (!existingSectionKeys.has(`${sheet.name}::${section.name}`)) {
                  newSections.add(`${sheet.name}::${section.name}`);
                }
              } else if (account.action === "match") match++;
              else skip++;
            }
          }
        }
        return { create, match, skip, newSheets: newSheets.size, newSections: newSections.size };
      })()
    : null;

  const handleImport = () => {
    if (!parsed) return;
    const actions = parsed.sheets.flatMap((sheet) =>
      sheet.sections.flatMap((section) =>
        section.accounts.map((a) => ({
          kuberaId: a.kuberaId,
          action: a.action,
          summaAssetId: a.matchedAssetId ?? undefined,
          name: a.name,
          category: a.category,
          sheetName: a.sheetName,
          sectionName: a.sectionName,
          value: a.value,
          currency: a.currency,
          ticker: a.ticker,
          quantity: a.quantity,
          price: a.price,
          ownership: a.ownership,
          costBasis: a.costBasis,
          isInvestable: a.isInvestable,
          isCashEquivalent: a.isCashEquivalent,
          assetType: a.assetType,
          providerType: a.providerType,
          purchaseDate: a.purchaseDate,
          notes: a.notes,
        }))
      )
    );

    importMutation.mutate(
      { exportDate, portfolioId, actions },
      {
        onSuccess: (data) => {
          setImportResult(data);
          setStep("result");
        },
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import from Kubera</h1>
        <p className="text-muted-foreground">
          Upload your Kubera JSON export to migrate accounts into Summa.
        </p>
      </div>

      {step === "upload" && (
        <div className="space-y-6">
          <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-4">
            <UploadIcon className="size-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Upload a Kubera JSON file</p>
              <p className="text-sm text-muted-foreground">
                Export from Kubera, then upload the .json file
              </p>
            </div>
            <Input
              type="file"
              accept=".json"
              className="max-w-xs mx-auto"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or paste JSON</span>
            </div>
          </div>

          <div className="space-y-2">
            <textarea
              className="w-full h-40 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground"
              placeholder='Paste your Kubera JSON here... (starts with {"asset":[...]})'
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  const val = (e.target as HTMLTextAreaElement).value.trim();
                  if (val) processJson(val);
                }
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Press Cmd+Enter to import</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const textarea = document.querySelector("textarea");
                  const val = textarea?.value.trim();
                  if (val) processJson(val);
                }}
              >
                Parse JSON
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      )}

      {step === "review" && parsed && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Export date:</label>
              <Input
                type="date"
                value={exportDate}
                onChange={(e) => setExportDate(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {parsed.totalAccounts} accounts found
            </p>
          </div>

          <KuberaTree
            data={parsed}
            existingAssets={existingAssets}
            onActionChange={handleActionChange}
          />

          {summary && (
            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-muted-foreground">
                {summary.create} create &middot; {summary.match} match &middot;{" "}
                {summary.skip} skip
                {summary.newSheets > 0 && (
                  <span>
                    {" "}&middot; {summary.newSheets} new sheet{summary.newSheets > 1 ? "s" : ""}
                  </span>
                )}
                {summary.newSections > 0 && (
                  <span>
                    {" "}&middot; {summary.newSections} new section{summary.newSections > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <Button
                onClick={() => setStep("confirm")}
                disabled={summary.create === 0 && summary.match === 0}
              >
                Review import
              </Button>
            </div>
          )}
        </>
      )}

      {step === "confirm" && summary && (
        <div className="border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">Confirm import</h2>
          <ul className="space-y-1 text-sm">
            <li>Creating <strong>{summary.create}</strong> new assets</li>
            <li>Matching <strong>{summary.match}</strong> to existing assets</li>
            <li>Skipping <strong>{summary.skip}</strong> accounts</li>
            {summary.newSheets > 0 && (
              <li>Creating <strong>{summary.newSheets}</strong> new sheets</li>
            )}
            {summary.newSections > 0 && (
              <li>Creating <strong>{summary.newSections}</strong> new sections</li>
            )}
          </ul>
          <p className="text-sm text-muted-foreground">
            Snapshots dated {exportDate} will be recorded for all new assets.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("review")}>
              Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending && (
                <Loader2Icon className="size-4 mr-2 animate-spin" />
              )}
              Import
            </Button>
          </div>
          {importMutation.error && (
            <p className="text-sm text-destructive">
              {importMutation.error.message}
            </p>
          )}
        </div>
      )}

      {step === "result" && importResult && (
        <div className="border rounded-lg p-6 space-y-4 text-center">
          <CheckCircleIcon className="size-12 mx-auto text-green-600" />
          <h2 className="text-lg font-semibold">Import complete</h2>
          <ul className="text-sm space-y-1">
            <li>{importResult.assetsCreated} assets created</li>
            <li>{importResult.assetsMatched} assets matched</li>
            <li>{importResult.snapshotsInserted} snapshots recorded</li>
            {importResult.sheetsCreated > 0 && (
              <li>{importResult.sheetsCreated} sheets created</li>
            )}
            {importResult.sectionsCreated > 0 && (
              <li>{importResult.sectionsCreated} sections created</li>
            )}
          </ul>
          {importResult.errors.length > 0 && (
            <div className="text-left">
              <p className="text-sm font-medium text-destructive">Errors:</p>
              <ul className="text-sm text-destructive list-disc pl-5">
                {importResult.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            Go to dashboard
          </a>
        </div>
      )}
    </div>
  );
}
