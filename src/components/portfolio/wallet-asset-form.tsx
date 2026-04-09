"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCreateAsset } from "@/hooks/use-assets";
import { isValidBtcAddress, defaultBtcWalletName } from "@/lib/btc";
import { isValidEthAddress, defaultEthWalletName } from "@/lib/eth";
import type { Section } from "@/hooks/use-portfolio";

interface WalletAssetFormProps {
  portfolioId: string;
  currency: string;
  sections: Section[];
  defaultSectionId: string;
  onSuccess: () => void;
}

// v0.2 ships BTC only. ETH / SOL land in the next chunks — leaving the
// dropdown in place so it's obvious how the surface extends.
const CHAIN_OPTIONS = [
  { id: "btc", label: "Bitcoin (BTC)", enabled: true },
  { id: "eth", label: "Ethereum (ETH)", enabled: true },
  { id: "sol", label: "Solana (SOL) — coming soon", enabled: false },
] as const;

type ChainId = (typeof CHAIN_OPTIONS)[number]["id"];

export function WalletAssetForm({
  portfolioId,
  sections,
  defaultSectionId,
  onSuccess,
}: WalletAssetFormProps) {
  const createAsset = useCreateAsset(portfolioId);

  const [chain, setChain] = useState<ChainId>("btc");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [sectionId, setSectionId] = useState(defaultSectionId);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmedAddress = address.trim();
    if (chain === "btc" && !isValidBtcAddress(trimmedAddress)) {
      setError(
        "That doesn't look like a BTC address. Use a mainnet address starting with bc1, 1, or 3."
      );
      return;
    }
    if (chain === "eth" && !isValidEthAddress(trimmedAddress)) {
      setError(
        "That doesn't look like an ETH address. Use a 0x-prefixed 40-character hex address."
      );
      return;
    }
    if (!sectionId) return;

    const walletName =
      name.trim() ||
      (chain === "eth"
        ? defaultEthWalletName(trimmedAddress)
        : defaultBtcWalletName(trimmedAddress));

    createAsset.mutate(
      {
        sectionId,
        name: walletName,
        type: "crypto",
        currency: "USD",
        providerType: "wallet",
        providerConfig: {
          chain,
          address: trimmedAddress,
        },
      } as Parameters<typeof createAsset.mutate>[0],
      {
        onSuccess: () => {
          toast.success("Wallet added");
          onSuccess();
        },
        // onError: useCreateAsset's own onError handler surfaces the API
        // error message as a toast. No inline error needed — the toast
        // already tells the user what went wrong.
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Chain</label>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="w-full justify-start" />
            }
          >
            {CHAIN_OPTIONS.find((c) => c.id === chain)?.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <DropdownMenuRadioGroup
              value={chain}
              onValueChange={(v) => {
                const opt = CHAIN_OPTIONS.find((c) => c.id === v);
                if (opt?.enabled) setChain(v as ChainId);
              }}
            >
              {CHAIN_OPTIONS.map((c) => (
                <DropdownMenuRadioItem
                  key={c.id}
                  value={c.id}
                  disabled={!c.enabled}
                >
                  {c.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Address</label>
        <Input
          placeholder={chain === "eth" ? "0x..." : "bc1q..."}
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setError("");
          }}
          autoFocus
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className={error ? "border-red-500 font-mono text-sm" : "font-mono text-sm"}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Name (optional)</label>
        <Input
          placeholder={
            chain === "eth"
              ? address && isValidEthAddress(address.trim())
                ? defaultEthWalletName(address.trim())
                : "ETH Wallet"
              : address && isValidBtcAddress(address.trim())
                ? defaultBtcWalletName(address.trim())
                : "BTC Wallet"
          }
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {sections.length > 1 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Section</label>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className="w-full justify-start" />
              }
            >
              {sections.find((s) => s.id === sectionId)?.name ?? "Select section"}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
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
      )}

      <p className="text-xs text-muted-foreground">
        Watch-only. Summa never touches private keys or transactions.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={createAsset.isPending}>
          {createAsset.isPending ? "Adding..." : "Add wallet"}
        </Button>
      </div>
    </form>
  );
}
