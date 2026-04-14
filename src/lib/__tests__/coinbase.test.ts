import { describe, expect, it } from "vitest";
import { generateKeyPairSync, type KeyObject } from "crypto";
import { jwtVerify, importJWK } from "jose";
import { buildCoinbaseJwt, sec1PemToJwk } from "../providers/coinbase";

function generateEcKeyPair(): { privatePem: string; publicKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const privatePem = privateKey
    .export({ type: "sec1", format: "pem" })
    .toString();
  return { privatePem, publicKey };
}

describe("sec1PemToJwk", () => {
  it("decodes a P-256 SEC1 PEM into a JWK with matching public coords", () => {
    const { privatePem, publicKey } = generateEcKeyPair();
    const jwk = sec1PemToJwk(privatePem);

    expect(jwk.kty).toBe("EC");
    expect(jwk.crv).toBe("P-256");
    expect(jwk.d).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(jwk.x).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(jwk.y).toMatch(/^[A-Za-z0-9_-]+$/);

    // Reference JWK from Node's native JWK export — x/y must match ours.
    const reference = publicKey.export({ format: "jwk" }) as {
      x: string;
      y: string;
    };
    expect(jwk.x).toBe(reference.x);
    expect(jwk.y).toBe(reference.y);
  });

  it("throws on malformed PEM", () => {
    expect(() =>
      sec1PemToJwk(
        "-----BEGIN EC PRIVATE KEY-----\ngarbage\n-----END EC PRIVATE KEY-----"
      )
    ).toThrow();
  });
});

describe("buildCoinbaseJwt", () => {
  it("produces a verifiable ES256 JWT with required CDP claims", async () => {
    const { privatePem, publicKey } = generateEcKeyPair();
    const keyName = "organizations/test-org/apiKeys/test-key";

    const jwt = await buildCoinbaseJwt({
      keyName,
      privateKeyPem: privatePem,
      method: "GET",
      path: "/v2/accounts",
    });

    const publicKeyObj = await importJWK(
      publicKey.export({ format: "jwk" }) as Record<string, unknown>,
      "ES256"
    );

    const { payload, protectedHeader } = await jwtVerify(jwt, publicKeyObj, {
      issuer: "cdp",
      subject: keyName,
    });

    expect(protectedHeader.alg).toBe("ES256");
    expect(protectedHeader.typ).toBe("JWT");
    expect(protectedHeader.kid).toBe(keyName);
    expect(typeof protectedHeader.nonce).toBe("string");
    expect(payload.uri).toBe("GET api.coinbase.com/v2/accounts");
    expect(typeof payload.nbf).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp! > payload.nbf!).toBe(true);
  });

  it("uppercases the method in the uri claim", async () => {
    const { privatePem, publicKey } = generateEcKeyPair();
    const jwt = await buildCoinbaseJwt({
      keyName: "k",
      privateKeyPem: privatePem,
      method: "get",
      path: "/v2/user",
    });
    const publicKeyObj = await importJWK(
      publicKey.export({ format: "jwk" }) as Record<string, unknown>,
      "ES256"
    );
    const { payload } = await jwtVerify(jwt, publicKeyObj);
    expect(payload.uri).toBe("GET api.coinbase.com/v2/user");
  });

  it("accepts PKCS#8 private keys", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const pkcs8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    const jwt = await buildCoinbaseJwt({
      keyName: "k",
      privateKeyPem: pkcs8,
      method: "GET",
      path: "/v2/user",
    });

    const publicKeyObj = await importJWK(
      publicKey.export({ format: "jwk" }) as Record<string, unknown>,
      "ES256"
    );
    const { payload } = await jwtVerify(jwt, publicKeyObj);
    expect(payload.uri).toBe("GET api.coinbase.com/v2/user");
  });

  it("accepts private keys with escaped \\n newlines", async () => {
    const { privatePem, publicKey } = generateEcKeyPair();
    const escaped = privatePem.replace(/\n/g, "\\n");

    const jwt = await buildCoinbaseJwt({
      keyName: "k",
      privateKeyPem: escaped,
      method: "GET",
      path: "/v2/accounts",
    });

    const publicKeyObj = await importJWK(
      publicKey.export({ format: "jwk" }) as Record<string, unknown>,
      "ES256"
    );
    const { payload } = await jwtVerify(jwt, publicKeyObj);
    expect(payload.uri).toBe("GET api.coinbase.com/v2/accounts");
  });
});
