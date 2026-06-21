import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// getCurrentBtcUsd memoizes through a module-level TtlCache, so reset modules
// before each test to get a fresh cache and a fresh fetch spy.
function coinbaseSpot(amount: string) {
  return {
    ok: true,
    json: async () => ({ data: { amount, base: "BTC", currency: "USD" } }),
  } as Response;
}

describe("getCurrentBtcUsd", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses the Coinbase spot amount into a number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(coinbaseSpot("64204.63"))
    );
    const { getCurrentBtcUsd } = await import("@/lib/providers/btc-price");
    expect(await getCurrentBtcUsd()).toBe(64204.63);
  });

  it("hits the public Coinbase spot endpoint (no API key)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(coinbaseSpot("70000"));
    vi.stubGlobal("fetch", fetchMock);
    const { getCurrentBtcUsd } = await import("@/lib/providers/btc-price");
    await getCurrentBtcUsd();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.coinbase.com/v2/prices/BTC-USD/spot"
    );
  });

  it("caches the rate so repeated calls fetch once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(coinbaseSpot("65000"));
    vi.stubGlobal("fetch", fetchMock);
    const { getCurrentBtcUsd } = await import("@/lib/providers/btc-price");
    await getCurrentBtcUsd();
    await getCurrentBtcUsd();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null on a non-ok response (e.g. 401)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response)
    );
    const { getCurrentBtcUsd } = await import("@/lib/providers/btc-price");
    expect(await getCurrentBtcUsd()).toBeNull();
  });

  it("returns null when the amount is missing or non-positive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      } as Response)
    );
    const { getCurrentBtcUsd } = await import("@/lib/providers/btc-price");
    expect(await getCurrentBtcUsd()).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    const { getCurrentBtcUsd } = await import("@/lib/providers/btc-price");
    expect(await getCurrentBtcUsd()).toBeNull();
  });
});
