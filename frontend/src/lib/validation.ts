import type { Product, StockMovementType, Unit } from "@/lib/types";

export const isWholeNumber = (value: number) => Number.isInteger(value) && value >= 0;

// At most two decimals; tolerant of floating-point noise (e.g. 12.34 * 100).
export const isPrice = (value: number) =>
  Number.isFinite(value) && value >= 0 && Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

// Purchases and returns add stock, damage removes it, corrections keep the sign typed.
export function signedStockChange(type: StockMovementType, amount: number): number {
  if (type === "damage") return -Math.abs(amount);
  if (type === "adjustment") return amount;
  return Math.abs(amount);
}

export type StockStatus = "In stock" | "Low stock" | "Out of stock";

export function stockStatus(product: Pick<Product, "stockQuantity" | "minimumStock">): StockStatus {
  if (product.stockQuantity === 0) return "Out of stock";
  if (product.stockQuantity <= product.minimumStock) return "Low stock";
  return "In stock";
}

// A quantity in a product's unit: positive, at most 3 decimals, whole for pieces.
export function quantityError(value: number, unit: Unit): string | null {
  if (!Number.isFinite(value) || value <= 0) return "Enter a quantity greater than zero.";
  if (Math.abs(Math.round(value * 1000) - value * 1000) > 1e-6) return "Use at most 3 decimals (e.g. 1.250 kg).";
  if (unit === "pcs" && !Number.isInteger(value)) return "Items sold by the piece need a whole number.";
  return null;
}

export const unitLabels: Record<Unit, string> = { pcs: "pcs", kg: "kg", l: "L" };

// "3", "1.25 kg", "0.5 L"
export function formatQuantity(value: number, unit: Unit): string {
  const text = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
  return unit === "pcs" ? text : `${text} ${unitLabels[unit]}`;
}

// Only digits, at most 3 decimals: what a cashier may type for a quantity.
export const quantityStep = (unit: Unit) => (unit === "pcs" ? "1" : "0.001");
