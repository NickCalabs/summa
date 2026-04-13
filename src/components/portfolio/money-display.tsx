"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

interface MoneyDisplayProps {
  amount: number;
  currency: string;
  className?: string;
  /**
   * When true, the displayed value tweens from its previous value to the
   * new value over ~800ms with ease-out. Use sparingly — only on hero
   * numbers that update live (e.g. dashboard net worth). Per-row cells
   * should stay static to avoid visual noise.
   */
  animate?: boolean;
}

const ANIMATION_DURATION_MS = 800;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    // Fallback for invalid currency codes (e.g. "BTC", empty string)
    return `${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency}`;
  }
}

export function MoneyDisplay({
  amount,
  currency,
  className,
  animate = false,
}: MoneyDisplayProps) {
  const [displayAmount, setDisplayAmount] = useState(amount);
  const previousAmount = useRef(amount);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    if (!animate) {
      setDisplayAmount(amount);
      previousAmount.current = amount;
      return;
    }

    if (amount === previousAmount.current) return;

    const start = previousAmount.current;
    const delta = amount - start;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
      const next = start + delta * easeOutCubic(t);
      setDisplayAmount(next);
      if (t < 1) {
        rafId.current = requestAnimationFrame(tick);
      } else {
        previousAmount.current = amount;
        rafId.current = null;
      }
    };

    if (rafId.current != null) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(tick);

    return () => {
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [amount, animate]);

  const masked = useUIStore((s) => s.valuesMasked);
  const valueToRender = animate ? displayAmount : amount;
  return (
    <span className={cn("tabular-nums", className)}>
      {masked ? "$•••••" : formatCurrency(valueToRender, currency)}
    </span>
  );
}
