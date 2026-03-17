"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UploadIcon, Loader2Icon } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useUploadCsv, useImportCsv } from "@/hooks/use-csv-import";
import type { Section } from "@/hooks/use-portfolio";

const ASSET_FIELDS = [
  { value: "", label: "Skip" },
  { value: "name", label: "Name" },
  { value: "currentValue", label: "Value" },
  { value: "quantity", label: "Quantity" },
  { value: "currentPrice", label: "Price" },
  { value: "currency", label: "Currency" },
  { value: "type", label: "Type" },
  { value: "notes", label: "Notes" },
  { value: "costBasis", label: "Cost Basis" },
];

interface CsvImportDialogProps {
  portfolioId: string;
  currency: string;
  sections: Section[];
}

type Step = "upload" | "map" | "result";

export function CsvImportDialog({
  portfolioId,
  currency,
  sections,
}: CsvImportDialogProps) {
  const open = useUIStore((s) => s.csvImportDialogOpen);
  const closeCsvImportDialog = useUIStore((s) => s.closeCsvImportDialog);

  const uploadCsv = useUploadCsv(portfolioId);
  const importCsv = useImportCsv(portfolioId);

  const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileError, setFileError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [defaultCurrency, setDefaultCurrency] = useState(currency);
  const [format, setFormat] = useState("");
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  function reset() {
    setStep("upload");
    setFileError(null);
    setHeaders([]);
    setColumnMapping({});
    setPreview([]);
    setAllRows([]);
    setTotalRows(0);
    setSectionId(sections[0]?.id ?? "");
    setDefaultCurrency(currency);
    setFormat("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      closeCsvImportDialog();
      reset();
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);

    if (file.size > MAX_FILE_SIZE) {
      setFileError("File is too large. Please upload a CSV under 1MB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const data = await uploadCsv.mutateAsync(file);
    setHeaders(data.headers);
    setColumnMapping(data.columnMapping);
    setPreview(data.preview.slice(0, 10));
    setAllRows(data.preview);
    setTotalRows(data.totalRows);
    setFormat(data.format);
    setStep("map");
  }

  function updateMapping(header: string, field: string) {
    setColumnMapping((prev) => {
      const next = { ...prev };
      if (field === "") {
        delete next[header];
      } else {
        // Remove any existing mapping to the same field
        for (const [k, v] of Object.entries(next)) {
          if (v === field && k !== header) {
            delete next[k];
          }
        }
        next[header] = field;
      }
      return next;
    });
  }

  async function handleImport() {
    // We need all rows — re-upload the file to get them all
    // Actually we already have them from the preview (up to 50)
    // For a full import, we send all rows from the original upload
    const importResult = await importCsv.mutateAsync({
      sectionId,
      columnMapping,
      defaultCurrency,
      rows: allRows,
    });
    setResult(importResult);
    setStep("result");
  }

  const hasNameMapping = Object.values(columnMapping).includes("name");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Import assets from a CSV file. Supports Mint, Empower, and generic
            formats.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
              <UploadIcon className="size-8 mx-auto text-muted-foreground" />
              <div>
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadCsv.isPending}
                >
                  {uploadCsv.isPending ? (
                    <>
                      <Loader2Icon className="size-3.5 animate-spin mr-1" />
                      Parsing...
                    </>
                  ) : (
                    "Choose CSV File"
                  )}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Upload a .csv file with your asset data
              </p>
            </div>
            {fileError && (
              <p className="text-sm text-destructive text-center">{fileError}</p>
            )}
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span>{totalRows} rows detected</span>
              {format !== "generic" && (
                <Badge variant="secondary" className="text-[10px]">
                  {format} format
                </Badge>
              )}
            </div>

            <div className="flex gap-4">
              <div className="space-y-1 flex-1">
                <label className="text-sm font-medium">Section</label>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                      />
                    }
                  >
                    {sections.find((s) => s.id === sectionId)?.name ??
                      "Select section"}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup
                      value={sectionId}
                      onValueChange={setSectionId}
                    >
                      {sections.map((s) => (
                        <DropdownMenuRadioItem key={s.id} value={s.id}>
                          {s.name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Default currency</label>
                <Input
                  value={defaultCurrency}
                  onChange={(e) =>
                    setDefaultCurrency(e.target.value.toUpperCase())
                  }
                  className="w-20 h-8 text-sm"
                  maxLength={3}
                />
              </div>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {headers.map((h) => (
                      <th key={h} className="p-2 text-left font-medium">
                        <div className="space-y-1">
                          <div className="text-muted-foreground">{h}</div>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="outline"
                                  size="xs"
                                  className="w-full text-[10px] justify-start"
                                />
                              }
                            >
                              {columnMapping[h]
                                ? ASSET_FIELDS.find(
                                    (f) => f.value === columnMapping[h]
                                  )?.label ?? columnMapping[h]
                                : "Skip"}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuRadioGroup
                                value={columnMapping[h] ?? ""}
                                onValueChange={(v) => updateMapping(h, v)}
                              >
                                {ASSET_FIELDS.map((f) => (
                                  <DropdownMenuRadioItem
                                    key={f.value}
                                    value={f.value}
                                  >
                                    {f.label}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {headers.map((h) => (
                        <td key={h} className="p-2 truncate max-w-[150px]">
                          {row[h] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); setStep("upload"); }}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={!hasNameMapping || !sectionId || importCsv.isPending}
              >
                {importCsv.isPending ? (
                  <>
                    <Loader2Icon className="size-3.5 animate-spin mr-1" />
                    Importing...
                  </>
                ) : (
                  `Import ${totalRows} rows`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            <div className="border rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">Import complete</p>
              <div className="text-sm space-y-1">
                <p className="text-green-600">
                  {result.imported} asset{result.imported !== 1 ? "s" : ""}{" "}
                  imported
                </p>
                {result.skipped > 0 && (
                  <p className="text-amber-600">
                    {result.skipped} row{result.skipped !== 1 ? "s" : ""}{" "}
                    skipped
                  </p>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="mt-2 text-xs text-destructive space-y-0.5 max-h-32 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
