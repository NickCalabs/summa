"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { parseCurrencyInput, formatNumberForInput } from "@/lib/currency";

interface EditableCellProps {
  value: string | number | null;
  onCommit: (newValue: string, currency?: string) => void;
  type?: "text" | "number" | "currency";
  currency?: string;
  formatDisplay?: (value: string | number | null) => React.ReactNode;
  activateOn?: "click" | "doubleClick";
  className?: string;
}

export function EditableCell({
  value,
  onCommit,
  type = "text",
  currency,
  formatDisplay,
  activateOn = "click",
  className = "",
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEditing = useCallback(() => {
    if (type === "number" || type === "currency") {
      setEditValue(formatNumberForInput(value));
    } else {
      setEditValue(value != null ? String(value) : "");
    }
    setEditing(true);
  }, [value, type]);

  function commit() {
    const trimmed = editValue.trim();
    if (!trimmed && type !== "text") {
      setEditing(false);
      return;
    }

    if (type === "currency") {
      const parsed = parseCurrencyInput(trimmed, currency);
      onCommit(parsed.amount.toString(), parsed.currency ?? undefined);
    } else if (type === "number") {
      const cleaned = trimmed.replace(/,/g, "");
      const num = Number(cleaned);
      if (!isNaN(num)) {
        onCommit(num.toString());
      }
    } else {
      onCommit(trimmed);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={`w-full bg-transparent outline-none ring-1 ring-ring rounded px-1 py-0.5 text-sm tabular-nums ${className}`}
      />
    );
  }

  const displayContent = formatDisplay
    ? formatDisplay(value)
    : value != null
      ? String(value)
      : "—";

  const activationProps =
    activateOn === "doubleClick"
      ? { onDoubleClick: startEditing }
      : { onClick: startEditing };

  return (
    <span
      {...activationProps}
      className={`cursor-pointer rounded px-1 py-0.5 hover:bg-muted/60 transition-colors ${className}`}
    >
      {displayContent}
    </span>
  );
}
