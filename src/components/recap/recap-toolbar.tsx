"use client";

import { useRecapContext } from "@/contexts/recap-context";
import {
  RECAP_REPORT_LABELS,
  RECAP_PERIOD_LABELS,
  RECAP_MODE_LABELS,
  type RecapReportType,
  type RecapPeriod,
  type RecapMode,
} from "@/lib/recap-types";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function RecapToolbar() {
  const {
    report,
    setReport,
    period,
    setPeriod,
    mode,
    setMode,
    showChange,
    toggleShowChange,
  } = useRecapContext();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToolbarDropdown
        label={RECAP_REPORT_LABELS[report]}
        options={Object.entries(RECAP_REPORT_LABELS) as [RecapReportType, string][]}
        value={report}
        onChange={setReport}
      />
      <ToolbarDropdown
        label={RECAP_PERIOD_LABELS[period]}
        options={Object.entries(RECAP_PERIOD_LABELS) as [RecapPeriod, string][]}
        value={period}
        onChange={setPeriod}
      />
      <ToolbarDropdown
        label={RECAP_MODE_LABELS[mode]}
        options={Object.entries(RECAP_MODE_LABELS) as [RecapMode, string][]}
        value={mode}
        onChange={setMode}
      />

      <Button
        variant={showChange ? "default" : "outline"}
        size="sm"
        className="ml-auto text-xs h-8"
        onClick={toggleShowChange}
      >
        Show Change
      </Button>
    </div>
  );
}

function ToolbarDropdown<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="text-sm font-medium h-8 gap-1" />
        }
      >
        {label}
        <ChevronDownIcon className="size-3.5 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map(([key, text]) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => onChange(key)}
            className={key === value ? "font-semibold" : ""}
          >
            {text}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
