import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { signCoinbaseRequest } from "../providers/coinbase";

describe("signCoinbaseRequest", () => {
  it("produces hex signature matching spec format", () => {
    const sig = signCoinbaseRequest({
      secret: "testsecret",
      timestamp: "1700000000",
      method: "GET",
      path: "/v2/accounts",
      body: "",
    });
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches manual HMAC-SHA256 of timestamp+method+path+body", () => {
    const secret = "s3cr3t";
    const timestamp = "1700000000";
    const method = "GET";
    const path = "/v2/user";
    const body = "";
    const expected = createHmac("sha256", secret)
      .update(timestamp + method + path + body)
      .digest("hex");

    const actual = signCoinbaseRequest({ secret, timestamp, method, path, body });
    expect(actual).toBe(expected);
  });

  it("uppercases method before signing", () => {
    const secret = "s";
    const timestamp = "1";
    const path = "/v2/accounts";
    const lower = signCoinbaseRequest({ secret, timestamp, method: "get", path, body: "" });
    const upper = signCoinbaseRequest({ secret, timestamp, method: "GET", path, body: "" });
    expect(lower).toBe(upper);
  });

  it("different bodies produce different signatures", () => {
    const base = { secret: "s", timestamp: "1", method: "POST", path: "/x" };
    const a = signCoinbaseRequest({ ...base, body: "{}" });
    const b = signCoinbaseRequest({ ...base, body: `{"a":1}` });
    expect(a).not.toBe(b);
  });

  it("different timestamps produce different signatures", () => {
    const base = { secret: "s", method: "GET", path: "/v2/user", body: "" };
    const a = signCoinbaseRequest({ ...base, timestamp: "1000" });
    const b = signCoinbaseRequest({ ...base, timestamp: "2000" });
    expect(a).not.toBe(b);
  });
});
