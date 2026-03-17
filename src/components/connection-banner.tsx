"use client";

import { WifiOffIcon } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";

export function ConnectionBanner() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="flex items-center gap-2 bg-destructive/10 text-destructive px-4 py-2 text-sm">
      <WifiOffIcon className="size-4 shrink-0" />
      <span>Connection lost. Changes may not be saved.</span>
    </div>
  );
}
