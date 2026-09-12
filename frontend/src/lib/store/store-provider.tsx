"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { initialCategories, initialProducts, initialSales } from "@/lib/mock-data";
import type {
  Category,
  DashboardMetrics,
  InventoryMovement,
  LocalNotification,
  NotificationType,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  UserProfile,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import * as services from "@/lib/supabase/services";

type CartLine = { productId: string; quantity: number };

export type StoreContextType = {
  products: Product[];
  categories: Category[];
  sales: Sale[];
  movements: InventoryMovement[];
  notifications: LocalNotification[];
  metrics: DashboardMetrics;
  paymentBreakdown: { method: PaymentMethod; total: number; percent: number }[];
  isLiveSupabase: boolean;
  isLoading: boolean;
  userProfile: UserProfile | null;

  createProduct: (input: Omit<Product, "id" | "isActive">) => Promise<void>;
  updateProduct: (id: string, input: Partial<Product>) => Promise<void>;
  archiveProduct: (id: string) => Promise<void>;
  addStock: (id: string, quantity: number, notes?: string) => Promise<void>;
  createCategory: (name: string) => Promise<void>;
  renameCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<boolean>;
  createSale: (lines: CartLine[], paymentMethod: PaymentMethod) => Promise<{ ok: boolean; message: string }>;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  clearNotifications: () => Promise<void>;
  resetDemo: () => void;
  refreshData: () => Promise<void>;
};

const storageKey = "mallu-mart-mock-store-v2";
const StoreContext = createContext<StoreContextType | null>(null);

const isToday = (date: string) => new Date(date).toDateString() === new Date().toDateString();
const isThisMonth = (date: string) => {
  const value = new Date(date);
  const current = new Date();
  return value.getMonth() === current.getMonth() && value.getFullYear() === current.getFullYear();
};

const makeNotification = (
  type: NotificationType,
  title: string,
  message: string,
  relatedProductId?: string,
  relatedSaleId?: string
): LocalNotification => ({
  id: `notification-${Date.now()}-${Math.random()}`,
  type,
  title,
  message,
  createdAt: new Date().toISOString(),
  isRead: false,
  relatedProductId,
  relatedSaleId,
});

const initialNotifications: LocalNotification[] = [
  makeNotification("LOW_STOCK", "Low stock", "Maggi is running low. 8 units remaining.", "p2"),
];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [sales, setSales] = useState<Sale[]>(initialSales);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [notifications, setNotifications] = useState<LocalNotification[]>(initialNotifications);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLiveSupabase, setIsLiveSupabase] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [ready, setReady] = useState(false);

  // Helper to load live Supabase data
  const loadSupabaseData = useCallback(async () => {
    try {
      const [fetchedCategories, fetchedProducts, fetchedSales, fetchedMovements, fetchedNotifications, profile] =
        await Promise.all([
          services.fetchCategories(),
          services.fetchProducts(),
          services.fetchSales(),
          services.fetchMovements(),
          services.fetchNotifications(),
          services.getCurrentProfile(),
        ]);

      if (fetchedCategories.length > 0) setCategories(fetchedCategories);
      if (fetchedProducts.length > 0) setProducts(fetchedProducts);
      setSales(fetchedSales);
      setMovements(fetchedMovements);
      if (fetchedNotifications.length > 0) setNotifications(fetchedNotifications);
      if (profile) setUserProfile(profile);
    } catch (err) {
      console.error("Failed to load Supabase data:", err);
    }
  }, []);

  // Initial check: Supabase connection & auth
  useEffect(() => {
    let channel: ReturnType<NonNullable<ReturnType<typeof createClient>>["channel"]> | null = null;

    async function initialize() {
      setIsLoading(true);
      const supabase = createClient();

      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setIsLiveSupabase(true);
          await loadSupabaseData();

          // Set up Supabase Realtime channel for live updates
          channel = supabase
            .channel("mallu-mart-realtime")
            .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
              loadSupabaseData();
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
              loadSupabaseData();
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => {
              loadSupabaseData();
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
              loadSupabaseData();
            })
            .subscribe();

          setIsLoading(false);
          setReady(true);
          return;
        }
      }

      // Demo fallback mode with localStorage
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const data = JSON.parse(saved) as {
            products: Product[];
            categories: Category[];
            sales: Sale[];
            movements: InventoryMovement[];
            notifications?: LocalNotification[];
          };
          if (data.products?.length) setProducts(data.products);
          if (data.categories?.length) setCategories(data.categories);
          if (data.sales) setSales(data.sales);
          if (data.movements) setMovements(data.movements);
          if (data.notifications) setNotifications(data.notifications);
        } catch (e) {
          console.error("Failed to parse local demo store", e);
        }
      }
      setIsLiveSupabase(false);
      setIsLoading(false);
      setReady(true);
    }

    initialize();

    return () => {
      if (channel) {
        const supabase = createClient();
        if (supabase) supabase.removeChannel(channel);
      }
    };
  }, [loadSupabaseData]);

  // Persist demo mode changes to localStorage
  useEffect(() => {
    if (ready && !isLiveSupabase) {
      localStorage.setItem(storageKey, JSON.stringify({ products, categories, sales, movements, notifications }));
    }
  }, [products, categories, sales, movements, notifications, ready, isLiveSupabase]);

  // Metrics computation
  const metrics = useMemo(() => {
    const today = sales.filter((sale) => isToday(sale.createdAt));
    const month = sales.filter((sale) => isThisMonth(sale.createdAt));
    return {
      todayRevenue: today.reduce((sum, sale) => sum + sale.totalAmount, 0),
      todayTransactions: today.length,
      monthlyRevenue: month.reduce((sum, sale) => sum + sale.totalAmount, 0),
      grossProfit: month.reduce((sum, sale) => sum + sale.grossProfit, 0),
      inventoryValue: products
        .filter((product) => product.isActive)
        .reduce((sum, product) => sum + product.costPrice * product.stockQuantity, 0),
      totalProducts: products.filter((product) => product.isActive).length,
      lowStock: products.filter(
        (product) => product.isActive && product.stockQuantity > 0 && product.stockQuantity <= product.minimumStock
      ).length,
      outOfStock: products.filter((product) => product.isActive && product.stockQuantity === 0).length,
    };
  }, [products, sales]);

  const paymentBreakdown = useMemo(() => {
    const total = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    return (["Cash", "UPI", "Card", "Other"] as PaymentMethod[]).map((method) => {
      const amount = sales
        .filter((sale) => sale.paymentMethod === method)
        .reduce((sum, sale) => sum + sale.totalAmount, 0);
      return {
        method,
        total: amount,
        percent: total ? Math.round((amount / total) * 100) : 0,
      };
    });
  }, [sales]);

  // CRUD & Store Handlers
  const createProduct = async (input: Omit<Product, "id" | "isActive">) => {
    if (isLiveSupabase) {
      const res = await services.createProduct(input);
      if (res.ok) {
        await loadSupabaseData();
      }
      return;
    }
    setProducts((current) => [{ ...input, id: `p-${Date.now()}`, isActive: true }, ...current]);
  };

  const updateProduct = async (id: string, input: Partial<Product>) => {
    if (isLiveSupabase) {
      const res = await services.updateProduct(id, input);
      if (res.ok) {
        await loadSupabaseData();
      }
      return;
    }
    setProducts((current) =>
      current.map((product) => (product.id === id ? { ...product, ...input } : product))
    );
  };

  const archiveProduct = async (id: string) => {
    if (isLiveSupabase) {
      const res = await services.archiveProduct(id);
      if (res.ok) {
        await loadSupabaseData();
      }
      return;
    }
    setProducts((current) =>
      current.map((product) => (product.id === id ? { ...product, isActive: false } : product))
    );
  };

  const addStock = async (id: string, quantity: number, notes: string = "") => {
    if (isLiveSupabase) {
      const res = await services.adjustProductStock(id, quantity, "purchase", notes);
      if (res.ok) {
        await loadSupabaseData();
      }
      return;
    }
    const product = products.find((item) => item.id === id);
    setProducts((current) =>
      current.map((item) => (item.id === id ? { ...item, stockQuantity: item.stockQuantity + quantity } : item))
    );
    setMovements((current) => [
      {
        id: `move-${Date.now()}`,
        productId: id,
        movementType: "purchase",
        quantity,
        createdAt: new Date().toISOString(),
        notes,
      },
      ...current,
    ]);
    if (product) {
      setNotifications((current) => [
        makeNotification("STOCK_ADDED", "Stock updated", `${quantity} units added to ${product.name}.`, id),
        ...current,
      ]);
    }
  };

  const createCategory = async (name: string) => {
    if (isLiveSupabase) {
      const res = await services.createCategory(name);
      if (res.ok) {
        await loadSupabaseData();
      }
      return;
    }
    setCategories((current) => [...current, { id: `cat-${Date.now()}`, name, createdAt: new Date().toISOString() }]);
  };

  const renameCategory = async (id: string, name: string) => {
    if (isLiveSupabase) {
      const res = await services.renameCategory(id, name);
      if (res.ok) {
        await loadSupabaseData();
      }
      return;
    }
    const oldName = categories.find((category) => category.id === id)?.name;
    setCategories((current) =>
      current.map((category) => (category.id === id ? { ...category, name } : category))
    );
    if (oldName) {
      setProducts((current) =>
        current.map((product) => (product.category === oldName ? { ...product, category: name } : product))
      );
    }
  };

  const deleteCategory = async (id: string): Promise<boolean> => {
    if (isLiveSupabase) {
      const res = await services.deleteCategory(id);
      if (res.ok) {
        await loadSupabaseData();
        return true;
      }
      return false;
    }
    const category = categories.find((item) => item.id === id);
    if (!category || products.some((product) => product.category === category.name && product.isActive)) {
      return false;
    }
    setCategories((current) => current.filter((item) => item.id !== id));
    return true;
  };

  const createSale = async (
    lines: CartLine[],
    paymentMethod: PaymentMethod
  ): Promise<{ ok: boolean; message: string }> => {
    if (isLiveSupabase) {
      const res = await services.recordSale(lines, paymentMethod);
      if (res.ok) {
        await loadSupabaseData();
      }
      return res;
    }

    // Demo Mode Logic
    const available = products.filter((product) => product.isActive);
    for (const line of lines) {
      const product = available.find((item) => item.id === line.productId);
      if (!product) return { ok: false, message: "Product is unavailable." };
      if (line.quantity < 1) return { ok: false, message: "Quantity must be positive." };
      if (line.quantity > product.stockQuantity)
        return { ok: false, message: `Only ${product.stockQuantity} units available for ${product.name}.` };
    }

    const saleItems: SaleItem[] = lines.map((line) => {
      const product = available.find((item) => item.id === line.productId)!;
      return {
        id: `item-${Date.now()}-${line.productId}`,
        productId: product.id,
        productName: product.name,
        quantity: line.quantity,
        sellingPrice: product.sellingPrice,
        costPrice: product.costPrice,
        totalAmount: product.sellingPrice * line.quantity,
        totalCost: product.costPrice * line.quantity,
      };
    });

    const totalAmount = saleItems.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalCost = saleItems.reduce((sum, item) => sum + item.totalCost, 0);
    const createdAt = new Date().toISOString();
    const sale: Sale = {
      id: `MM-${Date.now().toString().slice(-5)}`,
      totalAmount,
      totalCost,
      grossProfit: totalAmount - totalCost,
      paymentMethod,
      createdAt,
      items: saleItems.reduce((sum, item) => sum + item.quantity, 0),
      saleItems,
    };

    setSales((current) => [sale, ...current]);
    setProducts((current) =>
      current.map((product) => {
        const line = lines.find((item) => item.productId === product.id);
        return line ? { ...product, stockQuantity: product.stockQuantity - line.quantity } : product;
      })
    );

    const newMovements: InventoryMovement[] = lines.map((line) => ({
      id: `move-${Date.now()}-${line.productId}`,
      productId: line.productId,
      movementType: "sale",
      quantity: -line.quantity,
      referenceId: sale.id,
      createdAt,
    }));
    setMovements((current) => [...newMovements, ...current]);

    // Notifications
    setNotifications((current) => [
      makeNotification(
        "SALE_RECORDED",
        "Sale recorded",
        `₹${totalAmount.toLocaleString("en-IN")} sale recorded via ${paymentMethod}.`,
        undefined,
        sale.id
      ),
      ...current,
    ]);

    lines.forEach((line) => {
      const before = products.find((product) => product.id === line.productId);
      const after = before ? before.stockQuantity - line.quantity : 0;
      if (after === 0) {
        setNotifications((current) => [
          makeNotification("OUT_OF_STOCK", "Out of stock", `${before?.name ?? "Product"} is out of stock.`, line.productId),
          ...current,
        ]);
      } else if (before && before.stockQuantity > before.minimumStock && after <= before.minimumStock) {
        setNotifications((current) => [
          makeNotification("LOW_STOCK", "Low stock", `${before.name} is running low. ${after} units remaining.`, line.productId),
          ...current,
        ]);
      }
    });

    return { ok: true, message: "Sale recorded successfully." };
  };

  const markNotificationAsRead = async (id: string) => {
    if (isLiveSupabase) {
      await services.markNotificationRead(id);
      setNotifications((current) =>
        current.map((notification) => (notification.id === id ? { ...notification, isRead: true } : notification))
      );
      return;
    }
    setNotifications((current) =>
      current.map((notification) => (notification.id === id ? { ...notification, isRead: true } : notification))
    );
  };

  const markAllNotificationsAsRead = async () => {
    if (isLiveSupabase) {
      await services.markAllNotificationsRead();
      setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
      return;
    }
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
  };

  const clearNotifications = async () => {
    if (isLiveSupabase) {
      await services.clearNotifications();
      setNotifications([]);
      return;
    }
    setNotifications([]);
  };

  const resetDemo = () => {
    setProducts(initialProducts);
    setCategories(initialCategories);
    setSales(initialSales);
    setMovements([]);
    setNotifications(initialNotifications);
  };

  const store: StoreContextType = {
    products: products.filter((product) => product.isActive),
    categories,
    sales,
    movements,
    notifications,
    metrics,
    paymentBreakdown,
    isLiveSupabase,
    isLoading,
    userProfile,
    createProduct,
    updateProduct,
    archiveProduct,
    addStock,
    createCategory,
    renameCategory,
    deleteCategory,
    createSale,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    clearNotifications,
    resetDemo,
    refreshData: loadSupabaseData,
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}

// Backward compatibility with previous code imports
export const useMockStore = useStore;
export const MockStoreProvider = StoreProvider;
