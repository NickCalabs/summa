import { describe, it, expect } from "vitest";
import {
  buildPickerGroups,
  expandSelection,
  type PickerAsset,
} from "@/lib/lens-utils";

const a = (
  id: string,
  name: string,
  type: string,
  ticker?: string,
  source?: string
): PickerAsset => ({
  id,
  name,
  type,
  currency: "USD",
  currentValueInBase: 1000,
  providerType: "ticker",
  providerConfig: ticker ? { ticker, source } : null,
  parentAssetId: null,
});

describe("buildPickerGroups", () => {
  it("groups crypto assets with the same canonical key", () => {
    const assets = [
      a("1", "BTC (Coinbase)", "crypto", "BTC-USD", "coinbase"),
      a("2", "BTC (Trezor)", "crypto", "bitcoin", "coingecko"),
      a("3", "ETH (Coinbase)", "crypto", "ETH-USD", "coinbase"),
    ];
    const groups = buildPickerGroups(assets);
    const btc = groups.find((g) => g.key === "coin:BTC");
    expect(btc?.assetIds).toEqual(["1", "2"]);
    expect(btc?.totalValue).toBe(2000);
    const eth = groups.find((g) => g.key === "coin:ETH");
    expect(eth?.assetIds).toEqual(["3"]);
  });

  it("groups equities by ticker symbol across brokerages", () => {
    const assets = [
      a("1", "AAPL @ Fidelity", "stock", "AAPL"),
      a("2", "AAPL @ Schwab", "stock", "AAPL"),
      a("3", "MSFT @ Fidelity", "stock", "MSFT"),
    ];
    const groups = buildPickerGroups(assets);
    expect(groups.find((g) => g.key === "equity:AAPL")?.assetIds).toEqual([
      "1",
      "2",
    ]);
    expect(groups.find((g) => g.key === "equity:MSFT")?.assetIds).toEqual([
      "3",
    ]);
  });

  it("falls back to per-asset key for assets with no canonical aggregation", () => {
    const assets = [a("1", "House", "real_estate")];
    const groups = buildPickerGroups(assets);
    expect(groups[0].key).toBe("asset:1");
    expect(groups[0].assetIds).toEqual(["1"]);
  });

  it("excludes group-parent assets (isGroupParent)", () => {
    const assets = [
      {
        ...a("p1", "Fidelity (parent)", "investment"),
        providerConfig: { isGroupParent: true } as Record<string, unknown>,
      },
      a("c1", "AAPL", "stock", "AAPL"),
    ];
    const groups = buildPickerGroups(assets);
    expect(groups.find((g) => g.assetIds.includes("p1"))).toBeUndefined();
    expect(groups.find((g) => g.key === "equity:AAPL")?.assetIds).toEqual([
      "c1",
    ]);
  });
});

describe("expandSelection", () => {
  const assets = [
    a("1", "BTC (Coinbase)", "crypto", "BTC-USD", "coinbase"),
    a("2", "BTC (Trezor)", "crypto", "bitcoin", "coingecko"),
    a("3", "WBTC (Coinbase)", "crypto", "wrapped-bitcoin", "coingecko"),
    a("4", "AAPL", "stock", "AAPL"),
  ];

  it("expands a checked canonical group to its asset IDs", () => {
    const ids = expandSelection(
      { groupKeys: ["coin:BTC"], assetIds: [] },
      assets
    );
    expect(ids.sort()).toEqual(["1", "2"]);
  });

  it("merges multiple groups", () => {
    const ids = expandSelection(
      { groupKeys: ["coin:BTC", "coin:WBTC"], assetIds: [] },
      assets
    );
    expect(ids.sort()).toEqual(["1", "2", "3"]);
  });

  it("merges groups with individual asset picks, deduped", () => {
    const ids = expandSelection(
      { groupKeys: ["coin:BTC"], assetIds: ["1", "4"] },
      assets
    );
    expect(ids.sort()).toEqual(["1", "2", "4"]);
  });

  it("returns an empty array when nothing is selected", () => {
    expect(expandSelection({ groupKeys: [], assetIds: [] }, assets)).toEqual(
      []
    );
  });
});
