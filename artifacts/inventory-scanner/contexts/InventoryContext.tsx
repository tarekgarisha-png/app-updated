import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { isRTLFor, tFor, type Lang } from "@/lib/i18n";
import {
  addPartialPayment as addPartialPaymentStorage,
  clearHistory as clearHistoryStorage,
  commitScanQueue,
  deleteCreditEntry as deleteCreditEntryStorage,
  deleteProduct as deleteProductStorage,
  getAllProducts,
  getHistory,
  getPartialPayments,
  markCreditEntryPaid as markCreditEntryPaidStorage,
  markPersonDebtsPaid as markPersonDebtsPaidStorage,
  returnBillSession as returnBillSessionStorage,
  returnSingleEntry as returnSingleEntryStorage,
  saveProduct as saveProductStorage,
} from "@/lib/storage";
import type {
  HistoryEntry,
  PartialPayment,
  Product,
  ScanQueueItem,
  TransactionType,
} from "@/lib/types";

type InventoryContextValue = {
  products: Product[];
  history: HistoryEntry[];
  partialPayments: PartialPayment[];
  loading: boolean;
  lang: Lang;
  setLang: (l: Lang) => void;
  refresh: () => Promise<void>;
  saveProduct: (p: Product) => Promise<void>;
  deleteProduct: (barcode: string) => Promise<void>;
  commitQueue: (
    queue: ScanQueueItem[],
    mode: TransactionType,
    personName?: string,
  ) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  markEntryPaid: (entryId: string, paid: boolean) => Promise<void>;
  markPersonPaid: (personName: string) => Promise<void>;
  removeCreditEntry: (entryId: string) => Promise<void>;
  returnBill: (sessionId: string) => Promise<void>;
  returnEntry: (entryId: string) => Promise<void>;
  addPartialPayment: (personName: string, amount: number, note?: string) => Promise<void>;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

const LANG_KEY = "inventory:lang:v1";

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [partialPayments, setPartialPayments] = useState<PartialPayment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lang, setLangState] = useState<Lang>("en");

  const refresh = useCallback(async () => {
    const [p, h, pp] = await Promise.all([
      getAllProducts(),
      getHistory(600),
      getPartialPayments(),
    ]);
    setProducts(p);
    setHistory(h);
    setPartialPayments(pp);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const storedLang = await AsyncStorage.getItem(LANG_KEY);
        if (storedLang === "ar" || storedLang === "en") {
          setLangState(storedLang);
        }
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
  }, []);

  const saveProduct = useCallback(
    async (p: Product) => {
      await saveProductStorage(p);
      await refresh();
    },
    [refresh],
  );

  const deleteProduct = useCallback(
    async (barcode: string) => {
      await deleteProductStorage(barcode);
      await refresh();
    },
    [refresh],
  );

  const commitQueue = useCallback(
    async (queue: ScanQueueItem[], mode: TransactionType, personName?: string) => {
      await commitScanQueue(queue, mode, personName);
      await refresh();
    },
    [refresh],
  );

  const clearAllHistory = useCallback(async () => {
    await clearHistoryStorage();
    await refresh();
  }, [refresh]);

  const markEntryPaid = useCallback(
    async (entryId: string, paid: boolean) => {
      await markCreditEntryPaidStorage(entryId, paid);
      await refresh();
    },
    [refresh],
  );

  const markPersonPaid = useCallback(
    async (personName: string) => {
      await markPersonDebtsPaidStorage(personName);
      await refresh();
    },
    [refresh],
  );

  const removeCreditEntry = useCallback(
    async (entryId: string) => {
      await deleteCreditEntryStorage(entryId);
      await refresh();
    },
    [refresh],
  );

  const returnBill = useCallback(
    async (sessionId: string) => {
      await returnBillSessionStorage(sessionId);
      await refresh();
    },
    [refresh],
  );

  const returnEntry = useCallback(
    async (entryId: string) => {
      await returnSingleEntryStorage(entryId);
      await refresh();
    },
    [refresh],
  );

  const addPartialPayment = useCallback(
    async (personName: string, amount: number, note?: string) => {
      await addPartialPaymentStorage(personName, amount, note);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<InventoryContextValue>(
    () => ({
      products,
      history,
      partialPayments,
      loading,
      lang,
      setLang,
      refresh,
      saveProduct,
      deleteProduct,
      commitQueue,
      clearAllHistory,
      markEntryPaid,
      markPersonPaid,
      removeCreditEntry,
      returnBill,
      returnEntry,
      addPartialPayment,
    }),
    [
      products,
      history,
      partialPayments,
      loading,
      lang,
      setLang,
      refresh,
      saveProduct,
      deleteProduct,
      commitQueue,
      clearAllHistory,
      markEntryPaid,
      markPersonPaid,
      removeCreditEntry,
      returnBill,
      returnEntry,
      addPartialPayment,
    ],
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory(): InventoryContextValue {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error("useInventory must be used within InventoryProvider");
  }
  return ctx;
}

export function useT() {
  const { lang } = useInventory();
  return {
    t: (key: string, ...args: any[]) => tFor(lang, key, ...args),
    rtl: isRTLFor(lang),
    lang,
  };
}
