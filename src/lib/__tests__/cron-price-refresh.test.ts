import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted ensures these are available inside vi.mock factories (which are hoisted)
const mocks = vi.hoisted(() => {
  const mockSetWhere = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockSelectWhere = vi.fn();
  const mockSelectFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockGetYahooBatchPrices = vi.fn();
  const mockGetCoinGeckoBatchPrices = vi.fn();
  return {
    mockSetWhere,
    mockSet,
    mockUpdate,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockGetYahooBatchPrices,
    mockGetCoinGeckoBatchPrices,
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: mocks.mockSelect, update: mocks.mockUpdate },
}));

vi.mock("@/lib/providers/yahoo", () => ({
  getYahooBatchPrices: mocks.mockGetYahooBatchPrices,
}));

vi.mock("@/lib/providers/coingecko", () => ({
  getCoinGeckoBatchPrices: mocks.mockGetCoinGeckoBatchPrices,
}));

vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
vi.mock("@/lib/snapshots", () => ({ takePortfolioSnapshot: vi.fn() }));
vi.mock("@/lib/providers/exchange-rates", () => ({ refreshAndStoreRates: vi.fn() }));
vi.mock("@/lib/providers/plaid", () => ({
  isPlaidConfigured: vi.fn().mockReturnValue(false),
  getBalances: vi.fn(),
}));
vi.mock("@/lib/encryption", () => ({ decrypt: vi.fn() }));

import { refreshPrices } from "@/lib/cron";

function makeAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-1",
    isArchived: false,
    providerType: "ticker",
    providerConfig: { ticker: "AAPL", source: "yahoo" },
    currency: "USD",
    quantity: "10",
    ...overrides,
  };
}

describe("refreshPrices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockSetWhere.mockResolvedValue([]);
    mocks.mockSet.mockReturnValue({ where: mocks.mockSetWhere });
    mocks.mockUpdate.mockReturnValue({ set: mocks.mockSet });
  });

  function setupSelectReturning(assets: unknown[]) {
    mocks.mockSelectWhere.mockResolvedValue(assets);
    mocks.mockSelectFrom.mockReturnValue({ where: mocks.mockSelectWhere });
    mocks.mockSelect.mockReturnValue({ from: mocks.mockSelectFrom });
  }

  it("returns early when no active ticker assets exist", async () => {
    setupSelectReturning([]);
    await refreshPrices();
    expect(mocks.mockGetYahooBatchPrices).not.toHaveBeenCalled();
    expect(mocks.mockGetCoinGeckoBatchPrices).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it("skips archived assets", async () => {
    setupSelectReturning([makeAsset({ isArchived: true })]);
    await refreshPrices();
    expect(mocks.mockGetYahooBatchPrices).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it("updates currentPrice and currentValue for yahoo asset with quantity", async () => {
    setupSelectReturning([makeAsset({ quantity: "10" })]);
    mocks.mockGetYahooBatchPrices.mockResolvedValue(
      new Map([["AAPL", { symbol: "AAPL", price: 150, currency: "USD", timestamp: new Date() }]])
    );

    await refreshPrices();

    expect(mocks.mockSet).toHaveBeenCalledWith({
      currentPrice: "150.00000000",
      currentValue: "1500.00",
      lastSyncedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(mocks.mockSetWhere).toHaveBeenCalledTimes(1);
  });

  it("uses price as currentValue when asset has no quantity", async () => {
    setupSelectReturning([makeAsset({ quantity: null })]);
    mocks.mockGetYahooBatchPrices.mockResolvedValue(
      new Map([["AAPL", { symbol: "AAPL", price: 200, currency: "USD", timestamp: new Date() }]])
    );

    await refreshPrices();

    expect(mocks.mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPrice: "200.00000000",
        currentValue: "200.00",
      })
    );
  });

  it("skips yahoo asset when price is <= 0", async () => {
    setupSelectReturning([makeAsset()]);
    mocks.mockGetYahooBatchPrices.mockResolvedValue(
      new Map([["AAPL", { symbol: "AAPL", price: 0, currency: "USD", timestamp: new Date() }]])
    );

    await refreshPrices();

    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it("skips yahoo asset when ticker is absent from prices map", async () => {
    setupSelectReturning([makeAsset()]);
    mocks.mockGetYahooBatchPrices.mockResolvedValue(new Map());

    await refreshPrices();

    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it("skips asset with no ticker in providerConfig", async () => {
    setupSelectReturning([makeAsset({ providerConfig: { source: "yahoo" } })]);
    mocks.mockGetYahooBatchPrices.mockResolvedValue(new Map());

    await refreshPrices();

    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it("defaults to yahoo source when providerConfig.source is missing", async () => {
    setupSelectReturning([makeAsset({ providerConfig: { ticker: "MSFT" } })]);
    mocks.mockGetYahooBatchPrices.mockResolvedValue(
      new Map([["MSFT", { symbol: "MSFT", price: 300, currency: "USD", timestamp: new Date() }]])
    );

    await refreshPrices();

    expect(mocks.mockGetYahooBatchPrices).toHaveBeenCalledWith(["MSFT"]);
    expect(mocks.mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ currentPrice: "300.00000000" })
    );
  });

  it("updates currentPrice and currentValue for coingecko asset", async () => {
    setupSelectReturning([
      makeAsset({
        providerConfig: { ticker: "bitcoin", source: "coingecko" },
        quantity: "0.5",
        currency: "USD",
      }),
    ]);
    mocks.mockGetCoinGeckoBatchPrices.mockResolvedValue(
      new Map([["bitcoin", { symbol: "bitcoin", price: 60000, currency: "USD", timestamp: new Date() }]])
    );

    await refreshPrices();

    expect(mocks.mockGetCoinGeckoBatchPrices).toHaveBeenCalledWith(["bitcoin"], "USD");
    expect(mocks.mockSet).toHaveBeenCalledWith({
      currentPrice: "60000.00000000",
      currentValue: "30000.00",
      lastSyncedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
  });

  it("handles yahoo provider error gracefully without crashing", async () => {
    setupSelectReturning([makeAsset()]);
    mocks.mockGetYahooBatchPrices.mockRejectedValue(new Error("Network error"));

    await expect(refreshPrices()).resolves.not.toThrow();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it("updates multiple assets in a single yahoo batch", async () => {
    setupSelectReturning([
      makeAsset({ id: "a1", providerConfig: { ticker: "AAPL", source: "yahoo" }, quantity: "5" }),
      makeAsset({ id: "a2", providerConfig: { ticker: "MSFT", source: "yahoo" }, quantity: "2" }),
    ]);
    mocks.mockGetYahooBatchPrices.mockResolvedValue(
      new Map([
        ["AAPL", { symbol: "AAPL", price: 150, currency: "USD", timestamp: new Date() }],
        ["MSFT", { symbol: "MSFT", price: 300, currency: "USD", timestamp: new Date() }],
      ])
    );

    await refreshPrices();

    expect(mocks.mockGetYahooBatchPrices).toHaveBeenCalledWith(["AAPL", "MSFT"]);
    expect(mocks.mockSet).toHaveBeenCalledTimes(2);
  });
});
