"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import type {
  Category,
  DashboardMetrics,
  InventoryMovement,
  LocalNotification,
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

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLiveSupabase, setIsLiveSupabase] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

      setCategories(fetchedCategories || []);
      setProducts(fetchedProducts || []);
      setSales(fetchedSales || []);
      setMovements(fetchedMovements || []);
      setNotifications(fetchedNotifications || []);
      if (profile) setUserProfile(profile);
    } catch (err) {
      console.error("Failed to load Supabase data:", err);
    }
  }, []);

  // Initial check: Supabase connection & auth
  useEffect(() => {
    let channel: ReturnType<NonNullable<ReturnType<typeof createClient>>["channel"]> | null = null;
    let authUnsubscribe: (() => void) | null = null;

    async function initialize() {
      setIsLoading(true);

      // Purge any legacy dummy mock cache
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }

      const supabase = createClient();

      if (supabase) {
        setIsLiveSupabase(true);
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          await loadSupabaseData();
        }

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

        // Listen for login/logout state changes
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (session?.user) {
            await loadSupabaseData();
          } else {
            setUserProfile(null);
            setProducts([]);
            setCategories([]);
            setSales([]);
            setMovements([]);
            setNotifications([]);
          }
        });
        authUnsubscribe = authListener.subscription.unsubscribe;

        setIsLoading(false);
        return;
      }

      setIsLiveSupabase(false);
      setIsLoading(false);
    }

    initialize();

    return () => {
      if (channel) {
        const supabase = createClient();
        if (supabase) supabase.removeChannel(channel);
      }
      if (authUnsubscribe) {
        authUnsubscribe();
      }
    };
  }, [loadSupabaseData]);

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

  // CRUD & Store Handlers directly interacting with Backend
  const createProduct = async (input: Omit<Product, "id" | "isActive">) => {
    const res = await services.createProduct(input);
    if (res.ok) {
      await loadSupabaseData();
    }
  };

  const updateProduct = async (id: string, input: Partial<Product>) => {
    const res = await services.updateProduct(id, input);
    if (res.ok) {
      await loadSupabaseData();
    }
  };

  const archiveProduct = async (id: string) => {
    const res = await services.archiveProduct(id);
    if (res.ok) {
      await loadSupabaseData();
    }
  };

  const addStock = async (id: string, quantity: number, notes: string = "") => {
    const res = await services.adjustProductStock(id, quantity, "purchase", notes);
    if (res.ok) {
      await loadSupabaseData();
    }
  };

  const createCategory = async (name: string) => {
    const res = await services.createCategory(name);
    if (res.ok) {
      await loadSupabaseData();
    }
  };

  const renameCategory = async (id: string, name: string) => {
    const res = await services.renameCategory(id, name);
    if (res.ok) {
      await loadSupabaseData();
    }
  };

  const deleteCategory = async (id: string): Promise<boolean> => {
    const res = await services.deleteCategory(id);
    if (res.ok) {
      await loadSupabaseData();
      return true;
    }
    return false;
  };

  const createSale = async (
    lines: CartLine[],
    paymentMethod: PaymentMethod
  ): Promise<{ ok: boolean; message: string }> => {
    const res = await services.recordSale(lines, paymentMethod);
    if (res.ok) {
      await loadSupabaseData();
    }
    return res;
  };

  const markNotificationAsRead = async (id: string) => {
    await services.markNotificationRead(id);
    setNotifications((current) =>
      current.map((notification) => (notification.id === id ? { ...notification, isRead: true } : notification))
    );
  };

  const markAllNotificationsAsRead = async () => {
    await services.markAllNotificationsRead();
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
  };

  const clearNotifications = async () => {
    await services.clearNotifications();
    setNotifications([]);
  };

  const resetDemo = () => {
    setProducts([]);
    setCategories([]);
    setSales([]);
    setMovements([]);
    setNotifications([]);
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

export const useMockStore = useStore;
export const MockStoreProvider = StoreProvider;
