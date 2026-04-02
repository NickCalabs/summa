import { describe, expect, it } from "vitest";
import {
  decodeSimpleFINToken,
  getSimpleFINServerUrl,
  normalizeSimpleFINAccessUrl,
} from "@/lib/providers/simplefin";
import {
  getInstitutionSectionName,
  inferSimpleFINAssetType,
  inferSimpleFINSheetType,
} from "@/lib/provider-account-grouping";

describe("SimpleFIN helpers", () => {
  it("decodes a setup token into a claim URL", () => {
    const setupToken = Buffer.from(
      "https://bridge.simplefin.org/simplefin/claim/demo",
      "utf8"
    ).toString("base64");

    expect(decodeSimpleFINToken(setupToken)).toBe(
      "https://bridge.simplefin.org/simplefin/claim/demo"
    );
  });

  it("normalizes access URLs and preserves credentials", () => {
    const accessUrl = normalizeSimpleFINAccessUrl(
      "https://demo:secret@bridge.simplefin.org/simplefin"
    );

    expect(accessUrl).toBe(
      "https://demo:secret@bridge.simplefin.org/simplefin"
    );
    expect(getSimpleFINServerUrl(accessUrl)).toBe(
      "https://bridge.simplefin.org/simplefin"
    );
  });

  it("rejects non-https access URLs", () => {
    expect(() =>
      normalizeSimpleFINAccessUrl(
        "http://demo:secret@bridge.simplefin.org/simplefin"
      )
    ).toThrow(/HTTPS/);
  });

  it("derives a readable institution label from domains", () => {
    expect(getInstitutionSectionName("www.coinbase.com")).toBe("Coinbase");
    expect(getInstitutionSectionName("https://www.chase.com")).toBe("Chase");
  });

  it("routes cards to debts and wallets to assets", () => {
    expect(
      inferSimpleFINSheetType({
        accountName: "Travel Rewards Visa Platinum Plus",
        balance: "-1200.50",
      })
    ).toBe("debts");

    expect(
      inferSimpleFINAssetType({
        accountName: "DOGE Wallet",
        balance: "100.00",
      })
    ).toBe("crypto");
  });
});
