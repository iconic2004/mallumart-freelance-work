export type UserRole = "owner" | "staff";

export type UserProfile = {
  id: string;
  userId: string;
  fullName: string;
  role: UserRole;
  approved: boolean;
  storeName?: string;
  phone?: string;
  createdAt?: string;
};

export type TeamMember = {
  userId: string;
  fullName: string;
  role: UserRole;
  approved: boolean;
  createdAt: string;
};

export type Unit = "pcs" | "kg" | "l";
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40] as const;

// Cost and profit fields are null for staff: the database never sends them.
export type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: string;
  categoryId?: string;
  unit: Unit;
  gstRate: number;
  hsnCode: string;
  costPrice: number | null;
  sellingPrice: number;
  stockQuantity: number;
  minimumStock: number;
  isActive: boolean;
  imageUrl?: string | null;
  description?: string | null;
};

export type Category = {
  id: string;
  name: string;
  createdAt: string;
};

export type PaymentMethod = "Cash" | "UPI" | "Card" | "Other" | "Credit";
export type CollectionMethod = Exclude<PaymentMethod, "Credit">;

export type SaleItem = {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  unit: Unit;
  hsnCode: string;
  quantity: number;
  refundedQuantity: number;
  sellingPrice: number;
  costPrice: number | null;
  totalAmount: number;
  totalCost: number | null;
  gstRate: number;
  taxAmount: number;
};

export type SaleRefund = {
  refundNumber: string;
  amount: number;
  reason: string;
  performedBy: string;
  createdAt: string;
};

export type SaleStatus = "completed" | "partially_refunded" | "refunded";

export type Sale = {
  id: string;
  invoiceNumber: string;
  cashierName: string;
  totalAmount: number;
  taxAmount: number;
  refundedAmount: number;
  status: SaleStatus;
  totalCost: number | null;
  grossProfit: number | null;
  paymentMethod: PaymentMethod;
  createdAt: string;
  customer: { id: string; name: string; phone: string } | null;
  items: number;
  saleItems: SaleItem[];
  refunds: SaleRefund[];
};

export type StockMovementType = "purchase" | "return" | "damage" | "adjustment";
export type MovementType = StockMovementType | "sale";

export type StockHistoryEntry = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: Unit;
  productActive: boolean;
  movementType: MovementType;
  quantity: number;
  referenceId: string | null;
  notes: string;
  supplierName: string | null;
  unitCost: number | null;
  performedBy: string;
  createdAt: string;
};

export type SalesReport = {
  salesCount: number;
  grossRevenue: number;
  refunds: number;
  refundCount: number;
  // Net of refunds.
  revenue: number;
  units: number;
  tax: number;
  cost: number | null;
  profit: number | null;
  payments: { method: PaymentMethod; count: number; revenue: number }[];
  topProducts: { productId: string; name: string; units: number; revenue: number }[];
  categories: { name: string; units: number; revenue: number }[];
  gst: { rate: number; taxableValue: number; tax: number }[];
};

export type DailySales = { date: string; salesCount: number; revenue: number; profit: number | null };

export type Customer = {
  id: string;
  name: string;
  phone: string;
  notes: string;
  // Positive: owes the store. Negative: advance.
  balance: number;
  isActive: boolean;
  createdAt: string;
};

export type LedgerEntry = {
  id: string;
  kind: "sale" | "refund" | "payment";
  reference: string;
  amount: number;
  balanceEffect: number;
  method: PaymentMethod;
  notes: string;
  performedBy: string;
  createdAt: string;
};

export type Supplier = { id: string; name: string; phone: string; gstin: string; notes: string; isActive: boolean };

export type StoreSettings = {
  storeName: string;
  address: string;
  phone: string;
  gstin: string;
  receiptFooter: string;
};

export type CashSummary = {
  salesCount: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  otherSales: number;
  creditSales: number;
  cashRefunds: number;
  cashCollections: number;
};

export type CashClosing = {
  id: string;
  businessDate: string;
  cashierName: string;
  openingFloat: number;
  cashSales: number;
  cashRefunds: number;
  cashCollections: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  upiSales: number;
  cardSales: number;
  otherSales: number;
  creditSales: number;
  salesCount: number;
  notes: string;
  createdAt: string;
  isMine: boolean;
};

export type ReorderItem = {
  productId: string;
  name: string;
  sku: string;
  unit: Unit;
  stock: number;
  minimum: number;
  suggestedQuantity: number;
  category: string;
  lastSupplierId: string | null;
  lastSupplierName: string | null;
  lastPurchaseAt: string | null;
  lastUnitCost: number | null;
};

export type AuditEntry = {
  id: number;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type ImportRow = {
  name: string;
  sku: string;
  category?: string;
  barcode?: string;
  unit?: string;
  costPrice?: string;
  sellingPrice?: string;
  openingStock?: string;
  minimumStock?: string;
  gstRate?: string;
  hsnCode?: string;
};

export type ImportResult = { created: number; updated: number; errors: { row: number; sku: string; message: string }[] };

export type Page<T> = { total: number; rows: T[] };

export type DateRange = { from: Date; to: Date };

export type NotificationType = "LOW_STOCK" | "OUT_OF_STOCK" | "SALE_RECORDED" | "STOCK_ADDED";

export type LocalNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  relatedProductId?: string;
  relatedSaleId?: string;
};

export type DashboardData = {
  today: SalesReport | null;
  month: SalesReport | null;
  recentSales: Sale[];
};

export type InventoryMetrics = {
  inventoryValue: number | null;
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
};

export type ActionResult = { ok: boolean; error?: string };
