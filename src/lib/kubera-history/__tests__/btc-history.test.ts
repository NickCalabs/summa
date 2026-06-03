import { describe, it, expect } from "vitest";
import { parseHistoday } from "@/lib/kubera-history/btc-history";

describe("parseHistoday", () => {
  it("maps each daily entry's unix time to an ISO date -> close price", () => {
    const json = { Response: "Success", Data: { Data: [
      { time: 1700000000, close: 37000.5 }, // 2023-11-14 (UTC)
      { time: 1700086400, close: 36000 },
    ] } };
    const map = parseHistoday(json);
    expect(map.get("2023-11-14")).toBeCloseTo(37000.5);
    expect(map.get("2023-11-15")).toBeCloseTo(36000);
  });
  it("skips zero/negative closes", () => {
    const json = { Data: { Data: [ { time: 1700000000, close: 0 } ] } };
    expect(parseHistoday(json).size).toBe(0);
  });
});
