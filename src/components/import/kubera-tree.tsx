"use client";

import { ChevronDownIcon } from "lucide-react";
import { KuberaAccountRow } from "./kubera-account-row";
import type { ParsedImport, ImportAction } from "@/lib/kubera-parser";

interface ExistingAsset {
  id: string;
  name: string;
  providerType: string;
}

interface KuberaTreeProps {
  data: ParsedImport;
  existingAssets: ExistingAsset[];
  onActionChange: (kuberaId: string, action: ImportAction, matchedAssetId?: string) => void;
}

export function KuberaTree({ data, existingAssets, onActionChange }: KuberaTreeProps) {
  return (
    <div className="space-y-4">
      {data.sheets.map((sheet) => (
        <div key={sheet.name} className="border rounded-lg">
          <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b">
            <ChevronDownIcon className="size-4 text-muted-foreground" />
            <h3 className="font-semibold">{sheet.name}</h3>
            <span className="text-xs text-muted-foreground">
              ({sheet.type === "debts" ? "debt" : "asset"} sheet)
            </span>
          </div>

          <div className="divide-y">
            {sheet.sections.map((section) => (
              <div key={`${sheet.name}::${section.name}`}>
                <div className="flex items-center gap-2 px-6 py-2 bg-muted/10">
                  <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {section.name}
                  </h4>
                </div>

                <div className="px-4 py-1">
                  {section.accounts.map((account) => (
                    <KuberaAccountRow
                      key={account.kuberaId}
                      account={account}
                      existingAssets={existingAssets}
                      onActionChange={onActionChange}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
