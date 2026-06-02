"use client";

import { useRef, useState } from "react";
import { UploadIcon, FileTextIcon } from "lucide-react";
import { useImportSources } from "@/hooks/use-import-sources";
import { format } from "date-fns";

const MAX_SIZE = 10 * 1024 * 1024;

interface Props {
  onFileSelected: (file: File, sourceId?: string) => void;
}

export function UploadStep({ onFileSelected }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const sourcesQuery = useImportSources();
  const [pendingSourceId, setPendingSourceId] = useState<string | undefined>();

  function handleFile(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (f.size > MAX_SIZE) {
      setError("File too large. Maximum size is 10MB.");
      return;
    }
    const allowed = [".pdf", ".csv", ".txt"];
    const lowered = f.name.toLowerCase();
    if (!allowed.some((ext) => lowered.endsWith(ext))) {
      setError("Unsupported file type. Use PDF, CSV, or TXT.");
      return;
    }
    onFileSelected(f, pendingSourceId);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`w-full border-2 border-dashed rounded-md p-8 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
      >
        <UploadIcon className="size-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">Drop a PDF, CSV, or TXT file</p>
        <p className="text-xs text-muted-foreground mt-1">
          or click to browse · Max 10MB
        </p>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {sourcesQuery.data && sourcesQuery.data.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recent sources
          </p>
          <div className="space-y-1">
            {sourcesQuery.data.slice(0, 5).map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => {
                  setPendingSourceId(source.id);
                  fileRef.current?.click();
                }}
                className="flex w-full items-center gap-3 rounded border p-3 text-left text-sm hover:bg-muted/50"
              >
                <FileTextIcon className="size-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{source.name}</div>
                  {source.lastUsedAt && (
                    <div className="text-xs text-muted-foreground">
                      Last used {format(new Date(source.lastUsedAt), "MMM d, yyyy")}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
