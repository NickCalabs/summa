import { describe, it, expect, vi } from "vitest";
import {
  getBtcBalance,
  getBtcBalanceBatch,
  BlockstreamError,
} from "@/lib/providers/blockstream";

function mockResponse(data: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

const ADDR = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";

const OK_RESPONSE = {
  address: ADDR,
  chain_stats: { funded_txo_sum: 150_000, spent_txo_sum: 50_000 },
  mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
};

describe("getBtcBalance (single address)", () => {
  it("returns parsed balance from Blockstream primary", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse(OK_RESPONSE));

    const info = await getBtcBalance(ADDR, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
    });

    expect(info.address).toBe(ADDR);
    expect(info.balanceSats).toBe(100_000n); // 150k funded - 50k spent
    expect(info.balanceBtc).toBeCloseTo(0.001);
    expect(info.balanceBtcString).toBe("0.00100000");
    expect(info.source).toBe("blockstream");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const calledUrl = (fetchImpl.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("blockstream.info");
    expect(calledUrl).toContain(ADDR);
  });

  it("falls back to Mempool.space when primary 5xx's", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ error: "boom" }, { status: 503 }))
      .mockResolvedValueOnce(mockResponse(OK_RESPONSE));

    const info = await getBtcBalance(ADDR, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
    });

    expect(info.source).toBe("mempool.space");
    expect(info.balanceSats).toBe(100_000n);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondUrl = (fetchImpl.mock.calls[1] as unknown[])[0] as string;
    expect(secondUrl).toContain("mempool.space");
  });

  it("falls back to Mempool.space on network error", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(mockResponse(OK_RESPONSE));

    const info = await getBtcBalance(ADDR, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
    });

    expect(info.source).toBe("mempool.space");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws BlockstreamError with code both_sources_failed when both fail", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({}, { status: 503 }))
      .mockResolvedValueOnce(mockResponse({}, { status: 503 }));

    await expect(
      getBtcBalance(ADDR, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        skipRateLimit: true,
        skipCache: true,
      })
    ).rejects.toMatchObject({
      name: "BlockstreamError",
      code: "both_sources_failed",
    });
  });

  it("throws on malformed response shape", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ totally: "wrong" }))
      .mockResolvedValueOnce(mockResponse({ totally: "wrong" }));

    await expect(
      getBtcBalance(ADDR, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        skipRateLimit: true,
        skipCache: true,
      })
    ).rejects.toBeInstanceOf(BlockstreamError);
  });

  it("treats a zero-activity address as a valid empty wallet, not an error", async () => {
    const empty = {
      chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
    };
    const fetchImpl = vi.fn().mockResolvedValueOnce(mockResponse(empty));

    const info = await getBtcBalance(ADDR, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
    });

    expect(info.balanceSats).toBe(0n);
    expect(info.balanceBtcString).toBe("0.00000000");
  });
});

describe("getBtcBalanceBatch", () => {
  it("fetches multiple addresses and returns a keyed Map", async () => {
    const addrA = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
    const addrB = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          chain_stats: { funded_txo_sum: 10_000, spent_txo_sum: 0 },
          mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          chain_stats: { funded_txo_sum: 20_000, spent_txo_sum: 0 },
          mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
        })
      );

    const results = await getBtcBalanceBatch([addrA, addrB], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
    });

    expect(results.size).toBe(2);
    expect(results.get(addrA)?.balanceSats).toBe(10_000n);
    expect(results.get(addrB)?.balanceSats).toBe(20_000n);
  });

  it("continues when one address fails, reporting via onError", async () => {
    const addrA = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
    const addrB = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    // addrA: both primary and fallback fail
    // addrB: primary succeeds
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({}, { status: 503 }))
      .mockResolvedValueOnce(mockResponse({}, { status: 503 }))
      .mockResolvedValueOnce(
        mockResponse({
          chain_stats: { funded_txo_sum: 20_000, spent_txo_sum: 0 },
          mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
        })
      );

    const errors: Array<[string, unknown]> = [];
    const results = await getBtcBalanceBatch([addrA, addrB], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
      onError: (addr, err) => errors.push([addr, err]),
    });

    expect(results.size).toBe(1);
    expect(results.has(addrA)).toBe(false);
    expect(results.get(addrB)?.balanceSats).toBe(20_000n);
    expect(errors).toHaveLength(1);
    expect(errors[0][0]).toBe(addrA);
  });

  it("deduplicates addresses before fetching", async () => {
    const addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      mockResponse({
        chain_stats: { funded_txo_sum: 10_000, spent_txo_sum: 0 },
        mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
      })
    );

    const results = await getBtcBalanceBatch([addr, addr, addr], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
    });

    expect(results.size).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
