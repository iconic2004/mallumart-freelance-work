"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import type {
  ActionResult,
  Category,
  DashboardData,
  InventoryMetrics,
  LocalNotification,
  PaymentMethod,
  Product,
  StoreSettings,
  Supplier,
  TeamMember,
  UserProfile,
  UserRole,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { periodRange } from "@/lib/periods";
import * as services from "@/lib/supabase/services";
import type { StockAdjustment } from "@/lib/supabase/services/products";
import { needsSecondFactor } from "@/lib/supabase/services/mfa";

type CartLine = { productId: string; quantity: number };

export type StoreContextType = {
  products: Product[];
  categories: Category[];
  notifications: LocalNotification[];
  team: TeamMember[];
  suppliers: Supplier[];
  storeSettings: StoreSettings | null;
  dashboard: DashboardData;
  inventory: InventoryMetrics;
  // Bumped after every reload; pages that fetch their own data (sales,
  // reports, stock history) refetch when it changes.
  dataVersion: number;
  isLiveSupabase: boolean;
  isLoading: boolean;
  userProfile: UserProfile | null;
  isOwner: boolean;
  // Signed in with a password, but the account has 2FA and the code hasn't been entered yet.
  needsMfa: boolean;

  createProduct: (input: Omit<Product, "id" | "isActive">) => Promise<ActionResult>;
  updateProduct: (id: string, input: Partial<Omit<Product, "stockQuantity">>) => Promise<ActionResult>;
  archiveProduct: (id: string) => Promise<ActionResult>;
  adjustStock: (id: string, adjustment: StockAdjustment) => Promise<ActionResult>;
  createCategory: (name: string) => Promise<ActionResult>;
  renameCategory: (id: string, name: string) => Promise<ActionResult>;
  deleteCategory: (id: string) => Promise<ActionResult>;
  createSale: (
    lines: CartLine[],
    paymentMethod: PaymentMethod,
    customerId?: string | null
  ) => Promise<{ ok: boolean; message: string; invoiceNumber?: string }>;
  refundSale: (saleId: string, lines: { saleItemId: string; quantity: number }[], reason: string) => Promise<ActionResult>;
  setMemberAccess: (userId: string, role: UserRole, approved: boolean) => Promise<ActionResult>;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  clearNotifications: () => Promise<void>;

  refreshData: () => Promise<void>;
};

const StoreContext = createContext<StoreContextType | null>(null);

const emptyDashboard: DashboardData = { today: null, month: null, recentSales: [] };

async function loadDashboard(): Promise<DashboardData> {
  try {
    const [today, month, recent] = await Promise.all([
      services.fetchSalesReport(periodRange("today")),
      services.fetchSalesReport(periodRange("this-month")),
      services.fetchSalesPage({ range: periodRange("this-month"), limit: 6 }),
    ]);
    return { today, month, recentSales: recent.rows };
  } catch (err) {
    console.error("Failed to load dashboard:", err);
    return emptyDashboard;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [dataVersion, setDataVersion] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLiveSupabase, setIsLiveSupabase] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const reloadTimer = useRef<number | null>(null);

  const clearData = useCallback(() => {
    setProducts([]);
    setCategories([]);
    setNotifications([]);
    setTeam([]);
    setSuppliers([]);
    setStoreSettings(null);
    setDashboard(emptyDashboard);
  }, []);

  const loadSupabaseData = useCallback(async () => {
    try {
      const profile = await services.getCurrentProfile();
      setUserProfile(profile);

      // With 2FA enrolled, the database refuses everything until the code is entered.
      const mfaPending = profile ? await needsSecondFactor() : false;
      setNeedsMfa(mfaPending);

      // Pending (unapproved) accounts get nothing; the database would refuse anyway.
      if (!profile?.approved || mfaPending) {
        clearData();
        return;
      }

      const [fetchedCategories, fetchedProducts, fetchedNotifications, fetchedTeam, fetchedDashboard, fetchedSuppliers, fetchedSettings] =
        await Promise.all([
          services.fetchCategories(),
          services.fetchProducts(),
          services.fetchNotifications(),
          profile.role === "owner" ? services.fetchTeam() : Promise.resolve([]),
          loadDashboard(),
          services.fetchSuppliers().catch(() => [] as Supplier[]),
          services.fetchStoreSettings().catch(() => null),
        ]);

      setCategories(fetchedCategories);
      setProducts(fetchedProducts);
      setNotifications(fetchedNotifications);
      setTeam(fetchedTeam);
      setDashboard(fetchedDashboard);
      setSuppliers(fetchedSuppliers);
      setStoreSettings(fetchedSettings);
      setDataVersion((version) => version + 1);
    } catch (err) {
      console.error("Failed to load Supabase data:", err);
    }
  }, [clearData]);

  // One sale fires several change events; coalesce them into a single reload.
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      loadSupabaseData();
    }, 400);
  }, [loadSupabaseData]);

  useEffect(() => {
    let channel: ReturnType<NonNullable<ReturnType<typeof createClient>>["channel"]> | null = null;
    let authUnsubscribe: (() => void) | null = null;
    let cancelled = false;

    async function initialize() {
      setIsLoading(true);

      const supabase = createClient();
      if (!supabase) {
        setIsLiveSupabase(false);
        setIsLoading(false);
        return;
      }

      setIsLiveSupabase(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await loadSupabaseData();
      if (cancelled) return;

      // store_events is the change feed for products, sales and stock movements
      // (those tables are not directly readable, so they can't be streamed).
      const channelName = `mallu-mart-realtime-${Math.random().toString(36).substring(2, 9)}`;
      channel = supabase.channel(channelName);
      for (const table of ["store_events", "categories", "notifications", "profiles"]) {
        channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleReload);
      }
      channel.subscribe();

      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        // INITIAL_SESSION is already covered by the load above.
        if (event === "INITIAL_SESSION") return;
        if (session?.user) {
          scheduleReload();
        } else {
          setUserProfile(null);
          clearData();
        }
      });
      authUnsubscribe = authListener.subscription.unsubscribe;

      setIsLoading(false);
    }

    initialize();

    return () => {
      cancelled = true;
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      if (channel) {
        const supabase = createClient();
        if (supabase) supabase.removeChannel(channel);
      }
      if (authUnsubscribe) authUnsubscribe();
    };
  }, [loadSupabaseData, scheduleReload, clearData]);

  const isOwner = Boolean(userProfile?.approved && userProfile.role === "owner");

  const inventory = useMemo<InventoryMetrics>(() => {
    const active = products.filter((product) => product.isActive);
    return {
      // Cost-based, so only available to owners.
      inventoryValue: isOwner
        ? active.reduce((sum, product) => sum + (product.costPrice ?? 0) * product.stockQuantity, 0)
        : null,
      totalProducts: active.length,
      lowStock: active.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.minimumStock).length,
      outOfStock: active.filter((p) => p.stockQuantity === 0).length,
    };
  }, [products, isOwner]);

  // Every mutation reloads on success and always hands the result back to the UI.
  const withReload = async <T extends { ok: boolean }>(result: T): Promise<T> => {
    if (result.ok) await loadSupabaseData();
    return result;
  };

  const store: StoreContextType = {
    products: products.filter((product) => product.isActive),
    categories,
    notifications,
    team,
    suppliers,
    storeSettings,
    dashboard,
    inventory,
    dataVersion,
    isLiveSupabase,
    isLoading,
    userProfile,
    isOwner,
    needsMfa,

    createProduct: async (input) => withReload(await services.createProduct(input)),
    updateProduct: async (id, input) => withReload(await services.updateProduct(id, input)),
    archiveProduct: async (id) => withReload(await services.archiveProduct(id)),
    adjustStock: async (id, adjustment) => withReload(await services.adjustProductStock(id, adjustment)),
    createCategory: async (name) => withReload(await services.createCategory(name)),
    renameCategory: async (id, name) => withReload(await services.renameCategory(id, name)),
    deleteCategory: async (id) => withReload(await services.deleteCategory(id)),
    createSale: async (lines, paymentMethod, customerId = null) =>
      withReload(await services.recordSale(lines, paymentMethod, customerId)),
    refundSale: async (saleId, lines, reason) => {
      const result = await services.refundSale(saleId, lines, reason);
      return withReload({ ok: result.ok, error: result.error });
    },
    setMemberAccess: async (userId, role, approved) =>
      withReload(await services.setMemberAccess(userId, role, approved)),

    markNotificationAsRead: async (id) => {
      if (await services.markNotificationRead(id)) {
        setNotifications((current) =>
          current.map((notification) => (notification.id === id ? { ...notification, isRead: true } : notification))
        );
      }
    },
    markAllNotificationsAsRead: async () => {
      if (await services.markAllNotificationsRead()) {
        setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
      }
    },
    clearNotifications: async () => {
      if (await services.clearNotifications()) setNotifications([]);
    },

    refreshData: loadSupabaseData,
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
