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
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { Platform } from "react-native";

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

// ─── CSV / PDF helpers ────────────────────────────────────────────────────────

function escapeCSV(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current); current = "";
    } else { current += ch; }
  }
  result.push(current);
  return result;
}

async function shareFile(filename: string, content: string, mimeType: string) {
  const uri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing is not available on this device");
  await Sharing.shareAsync(uri, {
    mimeType,
    UTI: mimeType === "text/csv"
      ? "public.comma-separated-values-text"
      : "com.adobe.pdf",
  });
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Context type (original + new export/import functions) ───────────────────

type InventoryContextValue = {
  // ── original fields (DO NOT CHANGE) ──
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

  // ── NEW: export / import / PDF ──
  exportProductsCSV: () => Promise<void>;
  exportHistoryCSV: () => Promise<void>;
  importProductsCSV: (uri: string) => Promise<{ imported: number; errors: string[] }>;
  importHistoryCSV: (uri: string) => Promise<{ imported: number; errors: string[] }>;
  exportBillPDF: (entry: HistoryEntry) => Promise<void>;
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

  // ── original refresh ──────────────────────────────────────────────────────

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
        if (storedLang === "ar" || storedLang === "en") setLangState(storedLang);
        setSyncUrlState(storedSyncUrl);
        setLastSynced(storedLastSynced);
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

  // ── original sync ─────────────────────────────────────────────────────────

  const syncNow = useCallback(async () => {
    if (!syncUrl) { setSyncStatus("off"); return; }
    setSyncStatus("syncing");
    try {
      const [prods, hist, payments] = await Promise.all([
        getAllProducts(),
        getHistory(10000),
        getPartialPayments(),
      ]);
      const merged = await pushAndPull(syncUrl, {
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
      console.error("sync failed", err instanceof Error ? err.message : "unknown");
      setSyncStatus("error");
    }
  }, [syncUrl, refresh]);

  const syncNowRef = useRef(syncNow);
  useEffect(() => { syncNowRef.current = syncNow; }, [syncNow]);

  const setSyncUrl = useCallback(async (url: string) => {
    setSyncUrlState(url);
    await saveSyncUrl(url);
    setSyncStatus("idle");
  }, []);

  // ── original CRUD ─────────────────────────────────────────────────────────

  const saveProduct = useCallback(async (p: Product) => {
    await saveProductStorage(p);
    await refresh();
    setTimeout(() => syncNowRef.current().catch(() => {}), 200);
  }, [refresh]);

  const deleteProduct = useCallback(async (barcode: string) => {
    await deleteProductStorage(barcode);
    await refresh();
    setTimeout(() => syncNowRef.current().catch(() => {}), 200);
  }, [refresh]);

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

  const markEntryPaid = useCallback(async (entryId: string, paid: boolean) => {
    await markCreditEntryPaidStorage(entryId, paid);
    await refresh();
    setTimeout(() => syncNowRef.current().catch(() => {}), 200);
  }, [refresh]);

  const markPersonPaid = useCallback(async (personName: string) => {
    await markPersonDebtsPaidStorage(personName);
    await refresh();
    setTimeout(() => syncNowRef.current().catch(() => {}), 200);
  }, [refresh]);

  const removeCreditEntry = useCallback(async (entryId: string) => {
    await deleteCreditEntryStorage(entryId);
    await refresh();
    setTimeout(() => syncNowRef.current().catch(() => {}), 200);
  }, [refresh]);

  const returnBill = useCallback(async (sessionId: string) => {
    await returnBillSessionStorage(sessionId);
    await refresh();
    setTimeout(() => syncNowRef.current().catch(() => {}), 200);
  }, [refresh]);

  const returnEntry = useCallback(async (entryId: string) => {
    await returnSingleEntryStorage(entryId);
    await refresh();
    setTimeout(() => syncNowRef.current().catch(() => {}), 200);
  }, [refresh]);

  const addPartialPayment = useCallback(
    async (personName: string, amount: number, note?: string) => {
      await addPartialPaymentStorage(personName, amount, note);
      await refresh();
      setTimeout(() => syncNowRef.current().catch(() => {}), 200);
    },
    [refresh],
  );

  // ── NEW: Export Products CSV ──────────────────────────────────────────────

  const exportProductsCSV = useCallback(async () => {
    const headers = ["barcode", "name", "price", "purchasePrice", "quantity", "lowStockThreshold"];
    const rows = products.map((p) =>
      headers.map((h) => escapeCSV((p as any)[h])).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    await shareFile(`products_${Date.now()}.csv`, csv, "text/csv");
  }, [products]);

  // ── NEW: Export History CSV ───────────────────────────────────────────────

  const exportHistoryCSV = useCallback(async () => {
    const headers = ["id", "timestamp", "type", "personName", "total", "paid", "returned", "items_json"];
    const rows = history.map((e) => [
      escapeCSV((e as any).id ?? ""),
      escapeCSV(new Date((e as any).timestamp ?? Date.now()).toISOString()),
      escapeCSV((e as any).type ?? (e as any).mode ?? ""),
      escapeCSV((e as any).personName ?? ""),
      escapeCSV((e as any).total ?? ""),
      escapeCSV((e as any).paid ?? ""),
      escapeCSV((e as any).returned ?? ""),
      escapeCSV(JSON.stringify((e as any).items ?? [])),
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    await shareFile(`history_${Date.now()}.csv`, csv, "text/csv");
  }, [history]);

  // ── NEW: Import Products CSV ──────────────────────────────────────────────

  const importProductsCSV = useCallback(
    async (uri: string): Promise<{ imported: number; errors: string[] }> => {
      const raw = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const lines = raw.trim().split("\n");
      if (lines.length < 2) return { imported: 0, errors: ["File is empty"] };

      const FIELD_MAP: Record<string, string> = {
        barcode: "barcode", "bar code": "barcode", sku: "barcode",
        name: "name", "product name": "name",
        price: "price", "sale price": "price",
        purchaseprice: "purchasePrice", "purchase price": "purchasePrice", cost: "purchasePrice",
        quantity: "quantity", qty: "quantity", stock: "quantity",
        lowstockthreshold: "lowStockThreshold", "low stock": "lowStockThreshold",
        "low stock threshold": "lowStockThreshold",
      };

      const headers = parseCSVLine(lines[0].replace(/^\uFEFF/, ""))
        .map((h) => FIELD_MAP[h.trim().toLowerCase()] ?? h.trim().toLowerCase());

      const errors: string[] = [];
      let imported = 0;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const fields = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => (row[h] = (fields[idx] ?? "").trim()));

        if (!row.name) { errors.push(`Row ${i + 1}: missing name`); continue; }

        const product: Product = {
          barcode: row.barcode || uid(),
          name: row.name,
          price: parseFloat(row.price) || 0,
          purchasePrice: parseFloat(row.purchasePrice) || 0,
          quantity: parseInt(row.quantity, 10) || 0,
          lowStockThreshold: parseInt(row.lowStockThreshold, 10) || 5,
          updatedAt: Date.now(),
        } as any;

        try {
          await saveProductStorage(product);
          imported++;
        } catch (e) {
          errors.push(`Row ${i + 1}: ${String(e)}`);
        }
      }

      if (imported > 0) await refresh();
      return { imported, errors };
    },
    [refresh],
  );

  // ── NEW: Import History CSV ───────────────────────────────────────────────

  const importHistoryCSV = useCallback(
    async (uri: string): Promise<{ imported: number; errors: string[] }> => {
      const raw = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const lines = raw.trim().split("\n");
      if (lines.length < 2) return { imported: 0, errors: ["File is empty"] };

      // History import goes through AsyncStorage directly since there's
      // no individual-entry save in storage.ts
      const existing = await getHistory(10000);
      const byId = new Map(existing.map((e: any) => [e.id, e]));

      const headers = parseCSVLine(lines[0].replace(/^\uFEFF/, ""))
        .map((h) => h.trim().toLowerCase());

      const errors: string[] = [];
      let imported = 0;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        try {
          const fields = parseCSVLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => (row[h] = (fields[idx] ?? "").trim()));

          let items: any[] = [];
          if (row.items_json) {
            try { items = JSON.parse(row.items_json); }
            catch { errors.push(`Row ${i + 1}: invalid items_json`); }
          }

          const id = row.id || uid();
          const entry: any = {
            id,
            timestamp: row.timestamp ? new Date(row.timestamp).getTime() : Date.now(),
            type: row.type || row.mode || "SALE",
            personName: row.personname || undefined,
            total: parseFloat(row.total) || 0,
            paid: row.paid === "true",
            returned: row.returned === "true",
            items,
          };

          // OR flags if entry already exists
          const existing2 = byId.get(id) as any;
          if (existing2) {
            entry.paid = existing2.paid || entry.paid;
            entry.returned = existing2.returned || entry.returned;
          }
          byId.set(id, entry);
          imported++;
        } catch (e) {
          errors.push(`Row ${i + 1}: ${String(e)}`);
        }
      }

      if (imported > 0) {
        const merged = Array.from(byId.values()).sort(
          (a: any, b: any) => b.timestamp - a.timestamp
        );
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
        await refresh();
      }

      return { imported, errors };
    },
    [refresh],
  );

  // ── NEW: Export Bill PDF ──────────────────────────────────────────────────

  const exportBillPDF = useCallback(async (entry: HistoryEntry) => {
    const e = entry as any;
    const dateStr = new Date(e.timestamp ?? Date.now()).toLocaleString();
    const items: any[] = e.items ?? [];

    const itemRows = items.map((item: any) => `
      <tr>
        <td>${item.productName ?? item.name ?? ""}</td>
        <td style="text-align:center">${item.mode ?? item.type ?? ""}</td>
        <td style="text-align:center">${item.quantity ?? 1}</td>
        <td style="text-align:right">${Number(item.price ?? 0).toFixed(2)}</td>
        <td style="text-align:right">${(Number(item.price ?? 0) * Number(item.quantity ?? 1)).toFixed(2)}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:13px;color:#222;padding:32px}
h1{font-size:22px;margin-bottom:4px}
.meta{color:#555;margin-bottom:24px;font-size:12px;line-height:1.8}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{background:#1a1a2e;color:#fff;padding:8px 10px;text-align:left;font-size:12px}
td{padding:7px 10px;border-bottom:1px solid #eee}
.totals{margin-left:auto;width:260px}
.totals td:last-child{text-align:right;font-weight:600}
.grand td{font-size:15px;border-top:2px solid #222;padding-top:8px}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.paid{background:#d1fae5;color:#065f46}
.unpaid{background:#fee2e2;color:#991b1b}
.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:12px;font-size:11px;color:#999;text-align:center}
</style></head><body>
<h1>Invoice / Bill</h1>
<div class="meta">
  <div><strong>Bill #:</strong> ${String(e.id ?? "").slice(-8).toUpperCase()}</div>
  <div><strong>Date:</strong> ${dateStr}</div>
  <div><strong>Type:</strong> ${e.type ?? e.mode ?? ""}</div>
  ${e.personName ? `<div><strong>Customer:</strong> ${e.personName}</div>` : ""}
  ${e.shiftId ? `<div><strong>Shift:</strong> ${e.shiftId}</div>` : ""}
  <div style="margin-top:6px">
    <span class="badge ${e.paid ? "paid" : "unpaid"}">${e.paid ? "PAID" : "UNPAID"}</span>
    ${e.returned ? '<span class="badge" style="background:#fef3c7;color:#92400e;margin-left:6px">RETURNED</span>' : ""}
  </div>
</div>
<table>
  <thead><tr>
    <th>Product</th>
    <th style="text-align:center">Mode</th>
    <th style="text-align:center">Qty</th>
    <th style="text-align:right">Unit Price</th>
    <th style="text-align:right">Subtotal</th>
  </tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<table class="totals">
  <tr><td>Subtotal</td><td>${Number(e.total ?? 0).toFixed(2)}</td></tr>
  <tr class="grand"><td>Total</td><td>${Number(e.total ?? 0).toFixed(2)}</td></tr>
</table>
<div class="footer">Inventory Scanner · ${new Date().toLocaleDateString()}</div>
</body></html>`;

    const { uri } = await Print.printToFileAsync({ html, base64: false });
    let shareUri = uri;
    if (Platform.OS === "android") {
      const dest = FileSystem.cacheDirectory + `bill_${String(e.id ?? Date.now()).slice(-8)}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      shareUri = dest;
    }
    if (!(await Sharing.isAvailableAsync()))
      throw new Error("Sharing is not available on this device");
    await Sharing.shareAsync(shareUri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: `Bill #${String(e.id ?? "").slice(-8).toUpperCase()}`,
    });
  }, []);

  // ── context value ─────────────────────────────────────────────────────────

  const value = useMemo<InventoryContextValue>(
    () => ({
      // original
      products, history, partialPayments, loading,
      lang, setLang, refresh,
      saveProduct, deleteProduct, commitQueue, clearAllHistory,
      markEntryPaid, markPersonPaid, removeCreditEntry,
      returnBill, returnEntry, addPartialPayment,
      syncUrl, syncStatus, lastSynced, syncNow, setSyncUrl,
      // new
      exportProductsCSV, exportHistoryCSV,
      importProductsCSV, importHistoryCSV,
      exportBillPDF,
    }),
    [
      products, history, partialPayments, loading,
      lang, setLang, refresh,
      saveProduct, deleteProduct, commitQueue, clearAllHistory,
      markEntryPaid, markPersonPaid, removeCreditEntry,
      returnBill, returnEntry, addPartialPayment,
      syncUrl, syncStatus, lastSynced, syncNow, setSyncUrl,
      exportProductsCSV, exportHistoryCSV,
      importProductsCSV, importHistoryCSV,
      exportBillPDF,
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
  if (!ctx) throw new Error("useInventory must be used within InventoryProvider");
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
