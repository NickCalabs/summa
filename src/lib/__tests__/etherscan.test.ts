import { describe, it, expect, vi } from "vitest";
import {
  getEthBalance,
  getEthBalanceBatch,
  EtherscanError,
} from "@/lib/providers/etherscan";

function mockResponse(data: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

const ADDR = "0x742d35cc6634c0532925a3b844bc454e4438f44e";

// Etherscan API responses wrap data in { status, message, result }
function ethOk(result: unknown) {
  return { status: "1", message: "OK", result };
}

function ethError(message: string, result: string = "") {
  return { status: "0", message, result };
}

describe("getEthBalance (single address)", () => {
  it("returns parsed ETH balance and tokens", async () => {
    // Call 1: ETH balance
    // Call 2: token transfers (tokentx)
    // Call 3: token balance for USDC
    const fetchImpl = vi
      .fn()
      // ETH balance: 1.5 ETH in wei
      .mockResolvedValueOnce(
        mockResponse(ethOk("1500000000000000000"))
      )
      // tokentx: one USDC transfer
      .mockResolvedValueOnce(
        mockResponse(
          ethOk([
            {
              contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
              tokenName: "USD Coin",
              tokenSymbol: "USDC",
              tokenDecimal: "6",
            },
          ])
        )
      )
      // tokenbalance for USDC: 1500 USDC
      .mockResolvedValueOnce(
        mockResponse(ethOk("1500000000"))
      );

    const info = await getEthBalance(ADDR, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
      baseUrl: "https://mock.etherscan.io/v2/api",
    });

    expect(info.address).toBe(ADDR);
    expect(info.ethBalanceWei).toBe(1_500_000_000_000_000_000n);
    expect(info.ethBalanceFormatted).toBeCloseTo(1.5);
    expect(info.source).toBe("etherscan");
    expect(info.tokens).toHaveLength(1);
    expect(info.tokens[0].symbol).toBe("USDC");
    expect(info.tokens[0].rawBalance).toBe(1_500_000_000n);
    expect(info.tokens[0].decimals).toBe(6);
  });

  it("handles address with no token transfers", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(ethOk("500000000000000000")))
      .mockResolvedValueOnce(
        mockResponse(ethError("No transactions found", "No transactions found"))
      );

    const info = await getEthBalance(ADDR, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
      baseUrl: "https://mock.etherscan.io/v2/api",
    });

    expect(info.ethBalanceWei).toBe(500_000_000_000_000_000n);
    expect(info.tokens).toHaveLength(0);
  });

  it("filters out zero-balance tokens", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(ethOk("0")))
      .mockResolvedValueOnce(
        mockResponse(
          ethOk([
            {
              contractAddress: "0xaaa",
              tokenName: "Dead Token",
              tokenSymbol: "DEAD",
              tokenDecimal: "18",
            },
          ])
        )
      )
      // Token balance is 0
      .mockResolvedValueOnce(mockResponse(ethOk("0")));

    const info = await getEthBalance(ADDR, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
      baseUrl: "https://mock.etherscan.io/v2/api",
    });

    expect(info.tokens).toHaveLength(0);
  });

  it("skips tokens with no symbol (spam)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(ethOk("0")))
      .mockResolvedValueOnce(
        mockResponse(
          ethOk([
            {
              contractAddress: "0xbbb",
              tokenName: "",
              tokenSymbol: "",
              tokenDecimal: "18",
            },
          ])
        )
      );

    const info = await getEthBalance(ADDR, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
      baseUrl: "https://mock.etherscan.io/v2/api",
    });

    // No token balance calls because the contract was filtered out
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(info.tokens).toHaveLength(0);
  });

  it("throws EtherscanError on rate limit", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({}, { status: 429 }));

    await expect(
      getEthBalance(ADDR, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        skipRateLimit: true,
        skipCache: true,
        baseUrl: "https://mock.etherscan.io/v2/api",
      })
    ).rejects.toMatchObject({
      name: "EtherscanError",
      code: "rate_limited",
    });
  });

  it("throws EtherscanError on network failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(
      getEthBalance(ADDR, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        skipRateLimit: true,
        skipCache: true,
        baseUrl: "https://mock.etherscan.io/v2/api",
      })
    ).rejects.toMatchObject({
      name: "EtherscanError",
      code: "network_error",
    });
  });

  it("treats an empty (0 ETH, 0 tokens) address as valid", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(ethOk("0")))
      .mockResolvedValueOnce(
        mockResponse(ethError("No transactions found", "No transactions found"))
      );

    const info = await getEthBalance(ADDR, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
      baseUrl: "https://mock.etherscan.io/v2/api",
    });

    expect(info.ethBalanceWei).toBe(0n);
    expect(info.tokens).toHaveLength(0);
  });

  it("defaults decimals to 18 when tokenDecimal is invalid", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(ethOk("0")))
      .mockResolvedValueOnce(
        mockResponse(
          ethOk([
            {
              contractAddress: "0xccc",
              tokenName: "Weird Token",
              tokenSymbol: "WRD",
              tokenDecimal: "notanumber",
            },
          ])
        )
      )
      .mockResolvedValueOnce(
        mockResponse(ethOk("1000000000000000000"))
      );

    const info = await getEthBalance(ADDR, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
      baseUrl: "https://mock.etherscan.io/v2/api",
    });

    expect(info.tokens).toHaveLength(1);
    expect(info.tokens[0].decimals).toBe(18);
  });
});

describe("getEthBalanceBatch", () => {
  it("fetches multiple addresses and returns a keyed Map", async () => {
    const addrA = "0x742d35cc6634c0532925a3b844bc454e4438f44e";
    const addrB = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";

    const fetchImpl = vi
      .fn()
      // addrA: ETH balance
      .mockResolvedValueOnce(mockResponse(ethOk("1000000000000000000")))
      // addrA: tokentx (no tokens)
      .mockResolvedValueOnce(
        mockResponse(ethError("No transactions found", "No transactions found"))
      )
      // addrB: ETH balance
      .mockResolvedValueOnce(mockResponse(ethOk("2000000000000000000")))
      // addrB: tokentx (no tokens)
      .mockResolvedValueOnce(
        mockResponse(ethError("No transactions found", "No transactions found"))
      );

    const results = await getEthBalanceBatch([addrA, addrB], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
      baseUrl: "https://mock.etherscan.io/v2/api",
    });

    expect(results.size).toBe(2);
    expect(results.get(addrA)?.ethBalanceWei).toBe(1_000_000_000_000_000_000n);
    expect(results.get(addrB)?.ethBalanceWei).toBe(2_000_000_000_000_000_000n);
  });

  it("continues when one address fails, reporting via onError", async () => {
    const addrA = "0x742d35cc6634c0532925a3b844bc454e4438f44e";
    const addrB = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";

    // getEthBalance uses Promise.all(fetchEthBalance, fetchTokenContracts)
    // so addrA consumes 2 mocks even when the first one is a 429.
    const fetchImpl = vi
      .fn()
      // addrA: ETH balance → 429 (fires concurrently with tokentx)
      .mockResolvedValueOnce(mockResponse({}, { status: 429 }))
      // addrA: tokentx — consumed concurrently, result is discarded when Promise.all rejects
      .mockResolvedValueOnce(
        mockResponse(ethError("No transactions found", "No transactions found"))
      )
      // addrB: ETH balance ok
      .mockResolvedValueOnce(mockResponse(ethOk("2000000000000000000")))
      // addrB: tokentx (no tokens)
      .mockResolvedValueOnce(
        mockResponse(ethError("No transactions found", "No transactions found"))
      );

    const errors: Array<[string, unknown]> = [];
    const results = await getEthBalanceBatch([addrA, addrB], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
      baseUrl: "https://mock.etherscan.io/v2/api",
      onError: (addr, err) => errors.push([addr, err]),
    });

    expect(results.size).toBe(1);
    expect(results.has(addrA)).toBe(false);
    expect(results.get(addrB)?.ethBalanceWei).toBe(2_000_000_000_000_000_000n);
    expect(errors).toHaveLength(1);
    expect(errors[0][0]).toBe(addrA);
  });

  it("deduplicates addresses before fetching", async () => {
    const addr = "0x742d35cc6634c0532925a3b844bc454e4438f44e";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(ethOk("1000000000000000000")))
      .mockResolvedValueOnce(
        mockResponse(ethError("No transactions found", "No transactions found"))
      );

    const results = await getEthBalanceBatch([addr, addr, addr], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      skipRateLimit: true,
      skipCache: true,
      baseUrl: "https://mock.etherscan.io/v2/api",
    });

    expect(results.size).toBe(1);
    // Should only call once (ETH balance + tokentx)
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
