import { describe, it, expect } from "vitest";
import {
  detectSourceFormat,
  detectColumnMapping,
  sanitizeCsvValue,
} from "@/lib/csv-utils";

describe("detectSourceFormat", () => {
  it("detects Mint format", () => {
    expect(
      detectSourceFormat(["Date", "Description", "Amount", "Category", "Account Name"])
    ).toBe("mint");
  });

  it("detects Empower format", () => {
    expect(
      detectSourceFormat(["Account Name", "Investment Name", "Balance", "Account Type"])
    ).toBe("empower");
  });

  it("returns generic for unknown headers", () => {
    expect(detectSourceFormat(["Name", "Value", "Currency"])).toBe("generic");
  });
});

describe("detectColumnMapping", () => {
  it("maps generic columns", () => {
    const mapping = detectColumnMapping(["Name", "Value", "Currency", "Type", "Notes"]);
    expect(mapping).toEqual({
      Name: "name",
      Value: "currentValue",
      Currency: "currency",
      Type: "type",
      Notes: "notes",
    });
  });

  it("maps Mint columns", () => {
    const mapping = detectColumnMapping([
      "Date",
      "Description",
      "Amount",
      "Category",
      "Account Name",
    ]);
    expect(mapping.Description).toBe("name");
    expect(mapping.Amount).toBe("currentValue");
    expect(mapping.Category).toBe("type");
    expect(mapping["Account Name"]).toBe("notes");
  });

  it("maps Empower columns", () => {
    const mapping = detectColumnMapping([
      "Account Name",
      "Investment Name",
      "Balance",
      "Account Type",
    ]);
    expect(mapping["Account Name"]).toBe("name");
    expect(mapping.Balance).toBe("currentValue");
    expect(mapping["Account Type"]).toBe("type");
  });

  it("handles case insensitive matching", () => {
    const mapping = detectColumnMapping(["name", "CURRENT VALUE", "qty"]);
    expect(mapping.name).toBe("name");
    expect(mapping["CURRENT VALUE"]).toBe("currentValue");
    expect(mapping.qty).toBe("quantity");
  });

  it("does not duplicate mapped fields", () => {
    const mapping = detectColumnMapping(["Name", "Account", "Value", "Amount"]);
    const fields = Object.values(mapping);
    const unique = new Set(fields);
    expect(fields.length).toBe(unique.size);
  });
});

describe("sanitizeCsvValue", () => {
  it("prefixes formula-injection characters with apostrophe", () => {
    expect(sanitizeCsvValue("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(sanitizeCsvValue("+cmd")).toBe("'+cmd");
    expect(sanitizeCsvValue("-formula")).toBe("'-formula");
    expect(sanitizeCsvValue("@import")).toBe("'@import");
  });

  it("does not modify normal values", () => {
    expect(sanitizeCsvValue("My Bank Account")).toBe("My Bank Account");
    expect(sanitizeCsvValue("1234.56")).toBe("1234.56");
    expect(sanitizeCsvValue("")).toBe("");
  });
});
