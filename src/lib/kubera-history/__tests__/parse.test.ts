import { describe, it, expect } from "vitest";
import { parseKuberaHistoryFile } from "@/lib/kubera-history/parse";

const SAMPLE = `Riv (BTC)
Date\tUSD\tQTY\tPRICE (USD)
2026-06-03\t10957.85\t0.16729032\t65502.00
2024-11-27\t9112.68\t0.095\t95923.00`;

describe("parseKuberaHistoryFile", () => {
  it("reads the asset name from line 1 and parses rows sorted ascending", () => {
    const r = parseKuberaHistoryFile(SAMPLE);
    expect(r.assetName).toBe("Riv (BTC)");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ date: "2024-11-27", usd: 9112.68, qty: 0.095, price: 95923 });
    expect(r.rows[1].date).toBe("2026-06-03");
  });

  it("accepts comma- and multi-space-delimited rows", () => {
    const csv = `Cash USD\nDate,USD,QTY,PRICE\n2025-01-02,1000.00,,\n2025-02-02,1200.50,,`;
    const r = parseKuberaHistoryFile(csv);
    expect(r.assetName).toBe("Cash USD");
    expect(r.rows[0]).toEqual({ date: "2025-01-02", usd: 1000, qty: null, price: null });

    const spaced = `Riv (BTC)\nDate        USD         QTY          PRICE (USD)\n2025-05-10  5856.25     0.05602784   104524.00`;
    const r2 = parseKuberaHistoryFile(spaced);
    expect(r2.assetName).toBe("Riv (BTC)");
    expect(r2.rows[0]).toEqual({ date: "2025-05-10", usd: 5856.25, qty: 0.05602784, price: 104524 });
  });

  it("throws with the bad line when a row has a non-numeric USD or bad date", () => {
    const bad = `X\nDate\tUSD\n2025-13-99\tNaN`;
    expect(() => parseKuberaHistoryFile(bad)).toThrow(/2025-13-99/);
  });

  it("omits zero-value placeholder rows where Kubera wrote NaN for qty/price", () => {
    const r = parseKuberaHistoryFile(`BTC (BTC)\nDate,USD,QTY,PRICE (USD)\n2025-03-14,5000,0.1,50000\n2025-03-15,0.00,0,NaN`);
    expect(r.rows.map((x) => x.date)).toEqual(["2025-03-14"]);
  });
});
