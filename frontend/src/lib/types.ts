export type UserRole = "owner" | "staff";

export type UserProfile = {
  id: string;
  userId: string;
  fullName: string;
  role: UserRole;
  storeName?: string;
  phone?: string;
  createdAt?: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  categoryId?: string;
  costPrice: number;
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

export type PaymentMethod = "Cash" | "UPI" | "Card" | "Other";

export type SaleItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  costPrice: number;
  totalAmount: number;
  totalCost: number;
};

export type InventoryMovement = {
  id: string;
  productId: string;
  productName?: string;
  movementType: "purchase" | "sale" | "return" | "damage" | "adjustment";
  quantity: number;
  createdAt: string;
  notes?: string;
  referenceId?: string;
};

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

export type Sale = {
  id: string;
  totalAmount: number;
  totalCost: number;
  grossProfit: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  items: number;
  saleItems: SaleItem[];
};

export type DashboardMetrics = {
  todayRevenue: number;
  todayTransactions: number;
  monthlyRevenue: number;
  grossProfit: number;
  inventoryValue: number;
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
};
