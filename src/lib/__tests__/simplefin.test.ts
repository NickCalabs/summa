import { describe, expect, it } from "vitest";
import {
  decodeSimpleFINToken,
  getSimpleFINServerUrl,
  normalizeSimpleFINAccessUrl,
} from "@/lib/providers/simplefin";

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
});
