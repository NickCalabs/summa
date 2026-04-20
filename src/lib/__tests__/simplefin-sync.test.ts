import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const mockUpdateSetWhere = vi.fn();
  const mockUpdateSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn();
  const mockSelectFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockGetSimpleFINAccounts = vi.fn();
  const mockDecrypt = vi.fn();
  return {
    mockUpdateSetWhere,
    mockUpdateSet,
    mockUpdate,
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockGetSimpleFINAccounts,
    mockDecrypt,
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: mocks.mockSelect, update: mocks.mockUpdate },
}));

vi.mock("@/lib/providers/simplefin", () => ({
  getSimpleFINAccounts: mocks.mockGetSimpleFINAccounts,
  SimpleFINProviderError: class SimpleFINProviderError extends Error {
    status: number;
    code: string;
    constructor(message: string, status = 500, code = "SIMPLEFIN_ERROR") {
      super(message);
      this.name = "SimpleFINProviderError";
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: mocks.mockDecrypt,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  sql: vi.fn(),
}));

import { syncSimpleFINConnection } from "@/lib/simplefin-sync";
import { SimpleFINProviderError } from "@/lib/providers/simplefin";

describe("syncSimpleFINConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockDecrypt.mockReturnValue("https://user:pass@simplefin.example/");

    // Default chain: select().from().where() → [] (also supports .limit())
    mocks.mockSelectLimit.mockResolvedValue([]);
    mocks.mockSelectWhere.mockImplementation(() => ({
      limit: mocks.mockSelectLimit,
      // .where() also resolves directly as a promise (for queries without .limit())
      then: (resolve: (v: unknown[]) => void) => resolve([]),
    }));
    mocks.mockSelectFrom.mockReturnValue({ where: mocks.mockSelectWhere });
    mocks.mockSelect.mockReturnValue({ from: mocks.mockSelectFrom });

    // Default chain: update().set().where() → []
    mocks.mockUpdateSetWhere.mockResolvedValue([]);
    mocks.mockUpdateSet.mockReturnValue({ where: mocks.mockUpdateSetWhere });
    mocks.mockUpdate.mockReturnValue({ set: mocks.mockUpdateSet });
  });

  it("returns error result on SimpleFINProviderError", async () => {
    const providerError = new SimpleFINProviderError(
      "SimpleFIN access was rejected",
      403,
      "AUTH_FAILED"
    );
    mocks.mockGetSimpleFINAccounts.mockRejectedValue(providerError);

    const result = await syncSimpleFINConnection({
      connectionId: "conn-1",
      accessUrlEnc: "encrypted-url",
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("AUTH_FAILED");
    expect(result.errorMessage).toBe("SimpleFIN access was rejected");
    expect(result.errorStatus).toBe(403);
  });

  it("returns success result with synced count", async () => {
    mocks.mockGetSimpleFINAccounts.mockResolvedValue({
      accounts: [],
      messages: [],
    });

    const result = await syncSimpleFINConnection({
      connectionId: "conn-1",
      accessUrlEnc: "encrypted-url",
    });

    expect(result.ok).toBe(true);
    expect(result.synced).toBe(0);
  });
});
