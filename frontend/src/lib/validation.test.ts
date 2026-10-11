import { describe, expect, it } from "vitest";
import { formatQuantity, isPrice, isWholeNumber, quantityError, signedStockChange, stockStatus } from "./validation";

describe("isWholeNumber", () => {
  it("accepts zero and positive integers", () => {
    expect(isWholeNumber(0)).toBe(true);
    expect(isWholeNumber(25)).toBe(true);
  });

  it("rejects negatives, decimals and NaN", () => {
    expect(isWholeNumber(-1)).toBe(false);
    expect(isWholeNumber(2.5)).toBe(false);
    expect(isWholeNumber(Number.NaN)).toBe(false);
  });
});

describe("isPrice", () => {
  it("accepts up to two decimals, including floating-point awkward values", () => {
    expect(isPrice(0)).toBe(true);
    expect(isPrice(360)).toBe(true);
    expect(isPrice(12.34)).toBe(true);
    expect(isPrice(19.99)).toBe(true);
  });

  it("rejects three decimals, negatives and non-numbers", () => {
    expect(isPrice(1.234)).toBe(false);
    expect(isPrice(-5)).toBe(false);
    expect(isPrice(Number.NaN)).toBe(false);
    expect(isPrice(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("signedStockChange", () => {
  it("purchases and returns always add stock", () => {
    expect(signedStockChange("purchase", 5)).toBe(5);
    expect(signedStockChange("purchase", -5)).toBe(5);
    expect(signedStockChange("return", 3)).toBe(3);
  });

  it("damage always removes stock", () => {
    expect(signedStockChange("damage", 2)).toBe(-2);
    expect(signedStockChange("damage", -2)).toBe(-2);
  });

  it("corrections keep the sign that was typed", () => {
    expect(signedStockChange("adjustment", -4)).toBe(-4);
    expect(signedStockChange("adjustment", 4)).toBe(4);
  });
});

describe("stockStatus", () => {
  it("classifies stock against the minimum level", () => {
    expect(stockStatus({ stockQuantity: 0, minimumStock: 5 })).toBe("Out of stock");
    expect(stockStatus({ stockQuantity: 5, minimumStock: 5 })).toBe("Low stock");
    expect(stockStatus({ stockQuantity: 6, minimumStock: 5 })).toBe("In stock");
    expect(stockStatus({ stockQuantity: 1, minimumStock: 0 })).toBe("In stock");
  });
});

describe("quantityError", () => {
  it("accepts whole pieces and weights with up to 3 decimals", () => {
    expect(quantityError(3, "pcs")).toBeNull();
    expect(quantityError(1.25, "kg")).toBeNull();
    expect(quantityError(0.005, "l")).toBeNull();
  });

  it("rejects fractional pieces, zero, negatives and 4 decimals", () => {
    expect(quantityError(1.5, "pcs")).toMatch(/whole number/);
    expect(quantityError(0, "kg")).toMatch(/greater than zero/);
    expect(quantityError(-1, "kg")).toMatch(/greater than zero/);
    expect(quantityError(1.2345, "kg")).toMatch(/3 decimals/);
  });
});

describe("formatQuantity", () => {
  it("shows units only for weighed and measured goods", () => {
    expect(formatQuantity(3, "pcs")).toBe("3");
    expect(formatQuantity(1.25, "kg")).toBe("1.25 kg");
    expect(formatQuantity(0.5, "l")).toBe("0.5 L");
    expect(formatQuantity(2.1000000001, "kg")).toBe("2.1 kg");
  });
});
