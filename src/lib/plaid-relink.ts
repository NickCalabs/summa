import { computeCryptoValue } from "@/lib/providers/plaid";

type ProviderConfig = Record<string, unknown>;

export interface TakeoverPlaidAccount {
  connectionId: string;
  plaidAccountId: string;
  type: string;
  currentBalance: string | null;
}

export interface TakeoverTargetAsset {
  type: string;
  currentPrice: string | null;
  quantity: string | null;
  providerConfig: ProviderConfig | null;
}

export interface AssetTakeoverPatch {
  providerType: "plaid";
  providerConfig: ProviderConfig;
  currentValue?: string;
  quantity?: string;
}

// Decide how a relink takes over the target asset. Crypto: drive quantity from
// the holding, value = quantity × the asset's own price, and MERGE providerConfig
// so the pricing source/ticker survive. Cash/other: USD balance, fresh config.
export function computePlaidTakeover(
  account: TakeoverPlaidAccount,
  target: TakeoverTargetAsset,
  holdingQuantity: number | null
): AssetTakeoverPatch {
  const isCrypto = account.type === "investment" && target.type === "crypto";

  if (isCrypto) {
    const quantity =
      holdingQuantity ?? (target.quantity != null ? Number(target.quantity) : null);
    const price = target.currentPrice != null ? Number(target.currentPrice) : null;
    const value = computeCryptoValue(quantity, price);
    return {
      providerType: "plaid",
      providerConfig: {
        ...(target.providerConfig ?? {}),
        connectionId: account.connectionId,
        plaidAccountId: account.plaidAccountId,
      },
      ...(holdingQuantity != null && { quantity: holdingQuantity.toString() }),
      ...(value != null && { currentValue: value }),
    };
  }

  const balance = account.currentBalance != null ? Number(account.currentBalance) : 0;
  return {
    providerType: "plaid",
    providerConfig: {
      connectionId: account.connectionId,
      plaidAccountId: account.plaidAccountId,
    },
    currentValue: Math.abs(balance).toFixed(2),
  };
}
