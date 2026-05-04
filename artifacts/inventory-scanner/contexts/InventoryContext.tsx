import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// NEW: Native libraries for mobile features
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

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
import {
  getLastSynced,
  getSyncUrl,
  pushAndPull,
  saveLastSynced,
  saveSyncUrl,
  type SyncStatus,
} from "@/lib/sync";
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
    shiftId?: number,
  ) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  markEntryPaid: (entryId: string, paid: boolean) => Promise<void>;
  markPersonPaid: (personName: string) => Promise<void>;
  removeCreditEntry: (entryId: string) => Promise<void>;
  returnBill: (sessionId: string) => Promise<void>;
  returnEntry: (entryId: string) => Promise<void>;
  addPartialPayment: (personName: string, amount: number, note?: string) => Promise<void>;
  syncUrl: string;
  syncStatus: SyncStatus;
  lastSynced: string | null;
  syncNow: () => Promise<void>;
  setSyncUrl: (url: string) => Promise<void>;
  // NEW: Function Types
  exportToPDF: (title: string, data: any[]) => Promise<void>;
  exportToCSV: () => Promise<void>;
  importFromCSV: () => Promise<void>;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

const LANG_KEY = "inventory:lang:v1";
const PRODUCTS_KEY = "inventory:products:v1";
const HISTORY_KEY = "inventory:history:v1";
const PAYMENTS_KEY = "inventory:partial_payments:v1";

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [partialPayments, setPartialPayments] = useState<PartialPayment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lang, setLangState] = useState<Lang>("en");
  const [syncUrl, setSyncUrlState] = useState<string>("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSynced, setLastSynced] = useState<string | null>(null);

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
        const [storedLang, storedSyncUrl, storedLastSynced] = await Promise.all([
          AsyncStorage.getItem(LANG_KEY),
          getSyncUrl(),
          getLastSynced(),
        ]);
        if (storedLang === "ar" || storedLang === "en") {
          setLangState(storedLang);
        }
        setSyncUrlState(storedSyncUrl);
        setLastSynced(storedLastSynced);
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  // NEW: PDF Export Logic
  const exportToPDF = useCallback(async (title: string, data: any[]) => {
    const html = `
      <html>
        <body style="font-family: sans-serif; padding: 20px;">
          <h1 style="text-align: center;">${title}</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px;">Item</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Details</th>
            </tr>
            ${data.map(item => `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${item.name || 'N/A'}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${item.price || item.amount || 0}</td>
              </tr>
            `).join('')}
          </table>
        </body>
      </html>
    `;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }, []);

  // NEW: CSV Export Logic
  const exportToCSV = useCallback(async () => {
    let csv = "Name,Barcode,Price,Stock\n";
    products.forEach(p => {
      csv += `${p.name},${p.barcode},${p.price},${p.stock}\n`;
    });
    const fileUri = FileSystem.documentDirectory + "inventory_backup.csv";
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(fileUri);
  }, [products]);

  // NEW: CSV Import Logic
  const importFromCSV = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'text/comma-separated-values' });
    if (!result.canceled) {
      const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const lines = content.split('\n').slice(1); // Skip header
      for (const line of lines) {
        const [name, barcode, price, stock] = line.split(',');
        if (name && barcode) {
          await saveProductStorage({ 
            name, 
            barcode, 
            price: parseFloat(price), 
            stock: parseInt(stock) 
          } as Product);
        }
      }
      await refresh();
      alert("Import Successful");
    }
  }, [refresh]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
  }, []);

  const syncNow = useCallback(async () => {
    const url = syncUrl;
    if (!url) {
      setSyncStatus("off");
      return;
    }
    setSyncStatus("syncing");
    try {
      const [prods, hist, payments] = await Promise.all([
        getAllProducts(),
        getHistory(10000),
        getPartialPayments(),
      ]);
      const merged = await pushAndPull(url, {
        products: prods,
        history: hist,
        partialPayments: payments,
      });
      await Promise.all([
        AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(merged.products)),
        AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(merged.history)),
        AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify(merged.partialPayments)),
      ]);
      await refresh();
      const now = new Date().toISOString();
      setLastSynced(now);
      await saveLastSynced(now);
      setSyncStatus("ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.error("sync failed", message);
      setSyncStatus("error");
    }
  }, [syncUrl, refresh]);

  const syncNowRef = useRef(syncNow);
  useEffect(() => {
    syncNowRef.current = syncNow;
  }, [syncNow]);

  const setSyncUrl = useCallback(async (url: string) => {
    setSyncUrlState(url);
    await saveSyncUrl(url);
    setSyncStatus("idle");
  }, []);

  const saveProduct = useCallback(
    async (p: Product) => {
      await saveProductStorage(p);
      await refresh();
      setTimeout(() => syncNowRef.current().catch(() => {}), 200);
    },
    [refresh],
  );

  const deleteProduct = useCallback(
    async (barcode: string) => {
      await deleteProductStorage(barcode);
      await refresh();
      setTimeout(() => syncNowRef.current().catch(() => {}), 200);
    },
    [refresh],
  );

  const commitQueue = useCallback(
    async (queue: ScanQueueItem[], mode: TransactionType, personName?: string, shiftId?: number) => {
      await commitScanQueue(queue, mode, personName, shiftId);
      await refresh();
      setTimeout(() => syncNowRef.current().catch(() => {}), 200);
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
      setTimeout(() => syncNowRef.current().catch(() => {}), 200);
    },
    [refresh],
  );

  const markPersonPaid = useCallback(
    async (personName: string) => {
      await markPersonDebtsPaidStorage(personName);
      await refresh();
      setTimeout(() => syncNowRef.current().catch(() => {}), 200);
    },
    [refresh],
  );

  const removeCreditEntry = useCallback(
    async (entryId: string) => {
      await deleteCreditEntryStorage(entryId);
      await refresh();
      setTimeout(() => syncNowRef.current().catch(() => {}), 200);
    },
    [refresh],
  );

  const returnBill = useCallback(
    async (sessionId: string) => {
      await returnBillSessionStorage(sessionId);
      await refresh();
      setTimeout(() => syncNowRef.current().catch(() => {}), 200);
    },
    [refresh],
  );

  const returnEntry = useCallback(
    async (entryId: string) => {
      await returnSingleEntryStorage(entryId);
      await refresh();
      setTimeout(() => syncNowRef.current().catch(() => {}), 200);
    },
    [refresh],
  );

  const addPartialPayment = useCallback(
    async (personName: string, amount: number, note?: string) => {
      await addPartialPaymentStorage(personName, amount, note);
      await refresh();
      setTimeout(() => syncNowRef.current().catch(() => {}), 200);
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
      syncUrl,
      syncStatus,
      lastSynced,
      syncNow,
      setSyncUrl,
      // Added Values
      exportToPDF,
      exportToCSV,
      importFromCSV
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
      syncUrl,
      syncStatus,
      lastSynced,
      syncNow,
      setSyncUrl,
      exportToPDF,
      exportToCSV,
      importFromCSV
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
