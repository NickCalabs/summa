"use client";

import { Loader2Icon } from "lucide-react";

interface Props {
  filename: string;
}

export function ExtractionStep({ filename }: Props) {
  return (
    <div className="py-8 text-center space-y-4">
      <Loader2Icon className="size-8 mx-auto animate-spin text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">Extracting balances...</p>
        <p className="text-xs text-muted-foreground mt-1 truncate">{filename}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Sending document to Ollama. This can take 30-60 seconds for larger models.
      </p>
    </div>
  );
}
