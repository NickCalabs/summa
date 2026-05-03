import { describe, it, expect } from "vitest";
import { getProviderLabel } from "@/lib/asset-helpers";

describe("getProviderLabel", () => {
  it("returns Plaid synced for plaid", () => {
    expect(getProviderLabel("plaid")).toBe("Plaid synced");
  });

  it("returns Ticker tracked for ticker", () => {
    expect(getProviderLabel("ticker")).toBe("Ticker tracked");
  });

  it("returns Manual for manual", () => {
    expect(getProviderLabel("manual")).toBe("Manual");
  });

  it("returns the providerType verbatim for unknown values", () => {
    expect(getProviderLabel("simplefin")).toBe("simplefin");
    expect(getProviderLabel("coinbase")).toBe("coinbase");
  });
});
