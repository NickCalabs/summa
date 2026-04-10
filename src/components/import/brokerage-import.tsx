"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  UploadIcon,
  Loader2Icon,
  CheckCircleIcon,
  FileSpreadsheetIcon,
} from "lucide-react";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import {
  parseBrokerageCSV,
  formatLabel,
  type BrokeragePosition,
  type BrokerageFormat,
} from "@/lib/brokerage-parser";
import { useBrokerageImport } from "@/hooks/use-brokerage-import";

interface SectionOption {
  id: string;
  name: string;
}

interface BrokerageImportProps {
  portfolioId: string;
  sections: SectionOption[];
}

type Step = "upload" | "preview" | "configure" | "confirm" | "result";

export function BrokerageImport({
  portfolioId,
  sections,
}: BrokerageImportProps) {
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<BrokerageFormat>("unknown");
  const [positions, setPositions] = useState<BrokeragePosition[]>([]);
  const [accountName, setAccountName] = useState("");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [importResult, setImportResult] = useState<{
    parentAssetId: string;
    holdingsCreated: number;
    totalValue: number;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useBrokerageImport();

  const processCSV = useCallback((csvText: string) => {
    setError(null);
    const result = parseBrokerageCSV(csvText);

    if (result.format === "unknown" || result.positions.length === 0) {
      setError(
        result.errors[0] ?? "No positions found in CSV. Check the file format."
      );
      return;
    }

    setFormat(result.format);
    setPositions(result.positions);
    // Default account name from format
    if (!accountName) {
      setAccountName(
        result.format === "fidelity"
          ? "Fidelity"
          : result.format === "schwab"
            ? "Schwab"
            : "Brokerage Account"
      );
    }
    setStep("preview");
  }, [accountName]);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => processCSV(e.target?.result as string);
      reader.readAsText(file);
    },
    [processCSV]
  );

  const togglePosition = useCallback((index: number) => {
    setPositions((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, included: !p.included } : p
      )
    );
  }, []);

  const toggleAll = useCallback((checked: boolean) => {
    setPositions((prev) => prev.map((p) => ({ ...p, included: checked })));
  }, []);

  const included = positions.filter((p) => p.included);
  const totalValue = included.reduce((sum, p) => sum + p.value, 0);

  const doImport = useCallback(() => {
    importMutation.mutate(
      {
        portfolioId,
        accountName,
        sectionId,
        positions: included.map((p) => ({
          symbol: p.symbol,
          name: p.name,
          quantity: p.quantity,
          price: p.price,
          value: p.value,
        })),
      },
      {
        onSuccess: (data) => {
          setImportResult(data);
          setStep("result");
        },
      }
    );
  }, [importMutation, portfolioId, accountName, sectionId, included]);

  // ── Step: Upload ──
  if (step === "upload") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Import Brokerage Positions</h1>
          <p className="text-muted-foreground mt-1">
            Upload a CSV export from Fidelity, Schwab, or any brokerage with
            Symbol/Quantity/Value columns.
          </p>
        </div>

        <div
          className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <UploadIcon className="size-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-medium text-sm mb-1">
            Drop a .csv file here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            Supports Fidelity, Schwab, and generic CSV formats
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  // ── Step: Preview ──
  if (step === "preview") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Positions Detected</h1>
          <p className="text-muted-foreground mt-1">
            Detected{" "}
            <span className="font-medium text-foreground">
              {formatLabel(format)}
            </span>{" "}
            format with {positions.length} positions.
          </p>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground">
                  SYMBOL
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground">
                  NAME
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium tracking-wider text-muted-foreground">
                  QTY
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium tracking-wider text-muted-foreground">
                  PRICE
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium tracking-wider text-muted-foreground">
                  VALUE
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, i) => (
                <tr
                  key={i}
                  className={`border-b border-border/20 ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {pos.symbol}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[200px]">
                    {pos.name}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {pos.quantity.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <MoneyDisplay amount={pos.price} currency="USD" />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    <MoneyDisplay amount={pos.value} currency="USD" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30">
                <td colSpan={4} className="px-4 py-3 font-medium text-right">
                  Total
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  <MoneyDisplay amount={totalValue} currency="USD" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => setStep("upload")}>
            Back
          </Button>
          <Button onClick={() => setStep("configure")}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Configure ──
  if (step === "configure") {
    const allIncluded = positions.every((p) => p.included);
    const noneIncluded = positions.every((p) => !p.included);

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Configure Import</h1>
          <p className="text-muted-foreground mt-1">
            Name the account and choose which positions to include.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Account Name
            </label>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Fidelity 401k"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Section</label>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={allIncluded}
                    ref={(el) => {
                      if (el) el.indeterminate = !allIncluded && !noneIncluded;
                    }}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground">
                  SYMBOL
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground">
                  NAME
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium tracking-wider text-muted-foreground">
                  VALUE
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, i) => (
                <tr
                  key={i}
                  className={`border-b border-border/20 cursor-pointer hover:bg-muted/20 ${
                    !pos.included ? "opacity-40" : ""
                  } ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                  onClick={() => togglePosition(i)}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={pos.included}
                      onChange={() => togglePosition(i)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {pos.symbol}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[200px]">
                    {pos.name}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    <MoneyDisplay amount={pos.value} currency="USD" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => setStep("preview")}>
            Back
          </Button>
          <Button
            onClick={() => setStep("confirm")}
            disabled={included.length === 0 || !accountName.trim()}
          >
            Review Import
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Confirm ──
  if (step === "confirm") {
    const sectionName =
      sections.find((s) => s.id === sectionId)?.name ?? "Unknown";

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Confirm Import</h1>
        </div>

        <div className="bg-muted/30 border border-border rounded-lg p-6 space-y-3">
          <div className="flex items-center gap-3">
            <FileSpreadsheetIcon className="size-10 text-muted-foreground" />
            <div>
              <p className="font-semibold text-lg">{accountName}</p>
              <p className="text-sm text-muted-foreground">
                {included.length} holding{included.length !== 1 ? "s" : ""} in{" "}
                {sectionName}
              </p>
            </div>
          </div>
          <div className="border-t border-border/40 pt-3 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total value</span>
            <span className="text-xl font-semibold tabular-nums">
              <MoneyDisplay amount={totalValue} currency="USD" />
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          This will create a parent account &ldquo;{accountName}&rdquo; with{" "}
          {included.length} ticker-based holdings. Prices will auto-refresh via
          Yahoo Finance every 15 minutes.
        </p>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => setStep("configure")}>
            Back
          </Button>
          <Button
            onClick={doImport}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending ? (
              <>
                <Loader2Icon className="size-4 animate-spin mr-1.5" />
                Importing...
              </>
            ) : (
              "Import"
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Result ──
  return (
    <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
      <CheckCircleIcon className="size-14 mx-auto text-emerald-500" />
      <div>
        <h1 className="text-2xl font-semibold">Import Complete</h1>
        <p className="text-muted-foreground mt-1">
          Created &ldquo;{accountName}&rdquo; with{" "}
          {importResult?.holdingsCreated ?? 0} holdings totaling{" "}
          <span className="font-medium text-foreground tabular-nums">
            <MoneyDisplay
              amount={importResult?.totalValue ?? 0}
              currency="USD"
            />
          </span>
        </p>
      </div>
      <a href={`/portfolio/${portfolioId}`}>
        <Button>View Portfolio</Button>
      </a>
    </div>
  );
}
