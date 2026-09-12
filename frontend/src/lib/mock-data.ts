import type { Category, Product, Sale } from "./types";

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 42).toISOString();
const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 17, 3).toISOString();
export const initialCategories: Category[] = ["Grocery", "Snacks", "Beverages", "Household", "Personal Care"].map((name, index) => ({ id: `cat-${index + 1}`, name, createdAt: now.toISOString() }));
export const initialProducts: Product[] = [
  { id: "p1", name: "Rice 5kg", sku: "MM-001", category: "Grocery", costPrice: 300, sellingPrice: 350, stockQuantity: 24, minimumStock: 10, isActive: true },
  { id: "p2", name: "Maggi", sku: "MM-002", category: "Snacks", costPrice: 12, sellingPrice: 15, stockQuantity: 8, minimumStock: 10, isActive: true },
  { id: "p3", name: "Coconut Oil", sku: "MM-003", category: "Grocery", costPrice: 180, sellingPrice: 220, stockQuantity: 4, minimumStock: 8, isActive: true },
  { id: "p4", name: "Parle-G", sku: "MM-004", category: "Snacks", costPrice: 8, sellingPrice: 10, stockQuantity: 3, minimumStock: 10, isActive: true },
  { id: "p5", name: "Milk", sku: "MM-005", category: "Beverages", costPrice: 24, sellingPrice: 30, stockQuantity: 32, minimumStock: 10, isActive: true },
  { id: "p6", name: "Sugar", sku: "MM-006", category: "Grocery", costPrice: 42, sellingPrice: 48, stockQuantity: 18, minimumStock: 8, isActive: true },
  { id: "p7", name: "Tea", sku: "MM-007", category: "Grocery", costPrice: 180, sellingPrice: 220, stockQuantity: 12, minimumStock: 5, isActive: true },
];
const item = (id: string, productId: string, productName: string, quantity: number, sellingPrice: number, costPrice: number) => ({ id, productId, productName, quantity, sellingPrice, costPrice, totalAmount: sellingPrice * quantity, totalCost: costPrice * quantity });
export const initialSales: Sale[] = [
  { id: "MM-1048", totalAmount: 842, totalCost: 631, grossProfit: 211, paymentMethod: "UPI", createdAt: today, items: 5, saleItems: [item("i1", "p1", "Rice 5kg", 2, 350, 300), item("i2", "p2", "Maggi", 4, 15, 12)] },
  { id: "MM-1047", totalAmount: 1260, totalCost: 980, grossProfit: 280, paymentMethod: "Cash", createdAt: today, items: 8, saleItems: [item("i3", "p3", "Coconut Oil", 3, 220, 180), item("i4", "p5", "Milk", 6, 30, 24)] },
  { id: "MM-1046", totalAmount: 475, totalCost: 342, grossProfit: 133, paymentMethod: "Card", createdAt: yesterday, items: 3, saleItems: [item("i5", "p6", "Sugar", 3, 48, 42)] },
];
export const products = initialProducts;
export const sales = initialSales;
