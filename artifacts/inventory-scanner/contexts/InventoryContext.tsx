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

// ─── Context type ─────────────────────────────────────────────────────────────

type InventoryContextValue = {
  // ── original (unchanged) ──
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

  // ── new ──
  exportProductsCSV: () => Promise<void>;
  exportHistoryCSV: () => Promise<void>;
  importProductsCSV: (uri: string) => Promise<{ imported: number; errors: string[] }>;
  importHistoryCSV: (uri: string) => Promise<{ imported: number; errors: string[] }>;
  exportBillPDF: (sessionId: string) => Promise<void>;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

const LANG_KEY     = "inventory:lang:v1";
const PRODUCTS_KEY = "inventory:products:v1";
const HISTORY_KEY  = "inventory:history:v1";
const PAYMENTS_KEY = "inventory:partial_payments:v1";

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [products,        setProducts]        = useState<Product[]>([]);
  const [history,         setHistory]         = useState<HistoryEntry[]>([]);
  const [partialPayments, setPartialPayments] = useState<PartialPayment[]>([]);
  const [loading,         setLoading]         = useState<boolean>(true);
  const [lang,            setLangState]       = useState<Lang>("en");
  const [syncUrl,         setSyncUrlState]    = useState<string>("");
  const [syncStatus,      setSyncStatus]      = useState<SyncStatus>("idle");
  const [lastSynced,      setLastSynced]      = useState<string | null>(null);

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
        AsyncStorage.setItem(HISTORY_KEY,  JSON.stringify(merged.history)),
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

  // ── original CRUD (all unchanged) ────────────────────────────────────────

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
  // Columns match Product type exactly:
  // barcode, name, nameAr, category, stock, minStock, unit, price

  const exportProductsCSV = useCallback(async () => {
    const headers: (keyof Product)[] = [
      "barcode", "name", "nameAr", "category",
      "stock", "minStock", "unit", "price",
    ];
    const rows = products.map((p) =>
      headers.map((h) => escapeCSV(p[h] ?? "")).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    await shareFile(`products_${Date.now()}.csv`, csv, "text/csv");
  }, [products]);

  // ── NEW: Export History CSV ───────────────────────────────────────────────
  // Columns match HistoryEntry type exactly:
  // id, barcode, name, type, qty, unitPrice, amount, personName,
  // paid, paidAt, sessionId, returnedFrom, returned, date, shiftId

  const exportHistoryCSV = useCallback(async () => {
    const headers: (keyof HistoryEntry)[] = [
      "id", "barcode", "name", "type", "qty", "unitPrice", "amount",
      "personName", "paid", "paidAt", "sessionId", "returnedFrom",
      "returned", "date", "shiftId",
    ];
    const rows = history.map((e) =>
      headers.map((h) => escapeCSV(e[h] ?? "")).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    await shareFile(`history_${Date.now()}.csv`, csv, "text/csv");
  }, [history]);

  // ── NEW: Import Products CSV ──────────────────────────────────────────────
  // Accepts the exported format or common variants (qty/quantity, etc.)

  const importProductsCSV = useCallback(
    async (uri: string): Promise<{ imported: number; errors: string[] }> => {
      const raw = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const lines = raw.trim().split("\n");
      if (lines.length < 2) return { imported: 0, errors: ["File is empty"] };

      // Tolerant header mapping → canonical Product field names
      const FIELD_MAP: Record<string, keyof Product | string> = {
        barcode: "barcode", "bar code": "barcode", sku: "barcode",
        name: "name", "product name": "name",
        namear: "nameAr", "name ar": "nameAr", "arabic name": "nameAr",
        category: "category",
        stock: "stock", quantity: "stock", qty: "stock",
        minstock: "minStock", "min stock": "minStock",
        "low stock": "minStock", minstockthreshold: "minStock",
        unit: "unit",
        price: "price", "sale price": "price",
      };

      const headers = parseCSVLine(lines[0].replace(/^\uFEFF/, ""))
        .map((h) => FIELD_MAP[h.trim().toLowerCase()] ?? h.trim().toLowerCase());

      const errors: string[] = [];
      let imported = 0;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const fields = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => (row[h as string] = (fields[idx] ?? "").trim()));

        if (!row.barcode) { errors.push(`Row ${i + 1}: missing barcode`); continue; }
        if (!row.name)    { errors.push(`Row ${i + 1}: missing name`);    continue; }

        const product: Product = {
          barcode:  row.barcode,
          name:     row.name,
          nameAr:   row.nameAr   ?? "",
          category: row.category ?? undefined,
          stock:    parseInt(row.stock, 10)    || 0,
          minStock: parseInt(row.minStock, 10) || 0,
          unit:     row.unit  || "pcs",
          price:    parseFloat(row.price)      || 0,
          updatedAt: new Date().toISOString(),
        };

        try {
          await saveProductStorage(product);
          imported++;
        } catch (e) {
          errors.push(`Row ${i + 1} (${row.name}): ${String(e)}`);
        }
      }

      if (imported > 0) await refresh();
      return { imported, errors };
    },
    [refresh],
  );

  // ── NEW: Import History CSV ───────────────────────────────────────────────
  // Accepts the exported format. Each row = one HistoryEntry.

  const importHistoryCSV = useCallback(
    async (uri: string): Promise<{ imported: number; errors: string[] }> => {
      const raw = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const lines = raw.trim().split("\n");
      if (lines.length < 2) return { imported: 0, errors: ["File is empty"] };

      const FIELD_MAP: Record<string, string> = {
        id: "id", barcode: "barcode", name: "name",
        type: "type", mode: "type",
        qty: "qty", quantity: "qty",
        unitprice: "unitPrice", "unit price": "unitPrice", price: "unitPrice",
        amount: "amount", total: "amount",
        personname: "personName", "person name": "personName", customer: "personName",
        paid: "paid", paidat: "paidAt",
        sessionid: "sessionId", session: "sessionId",
        returnedfrom: "returnedFrom",
        returned: "returned",
        date: "date", timestamp: "date",
        shiftid: "shiftId", shift: "shiftId",
      };

      const headers = parseCSVLine(lines[0].replace(/^\uFEFF/, ""))
        .map((h) => FIELD_MAP[h.trim().toLowerCase()] ?? h.trim().toLowerCase());

      // Load existing history to merge into
      const existing = await getHistory(10000);
      const byId = new Map(existing.map((e) => [e.id, e]));

      const errors: string[] = [];
      let imported = 0;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        try {
          const fields = parseCSVLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => (row[h] = (fields[idx] ?? "").trim()));

          if (!row.barcode) { errors.push(`Row ${i + 1}: missing barcode`); continue; }
          if (!row.type)    { errors.push(`Row ${i + 1}: missing type`);    continue; }

          const id = row.id || uid();
          const entry: HistoryEntry = {
            id,
            barcode:      row.barcode,
            name:         row.name ?? "",
            type:         (row.type as TransactionType) ?? "SALE",
            qty:          parseFloat(row.qty)       || 0,
            unitPrice:    parseFloat(row.unitPrice)  || 0,
            amount:       parseFloat(row.amount)     || 0,
            personName:   row.personName  || undefined,
            paid:         row.paid === "true" ? true : row.paid === "false" ? false : undefined,
            paidAt:       row.paidAt      || undefined,
            sessionId:    row.sessionId   || undefined,
            returnedFrom: row.returnedFrom || undefined,
            returned:     row.returned === "true" ? true : undefined,
            date:         row.date || new Date().toISOString(),
            shiftId:      row.shiftId ? parseInt(row.shiftId, 10) : undefined,
          };

          // OR boolean flags if entry already exists
          const ex = byId.get(id);
          if (ex) {
            entry.paid     = ex.paid     || entry.paid;
            entry.returned = ex.returned || entry.returned;
          }

          byId.set(id, entry);
          imported++;
        } catch (e) {
          errors.push(`Row ${i + 1}: ${String(e)}`);
        }
      }

      if (imported > 0) {
        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
        await refresh();
      }

      return { imported, errors };
    },
    [refresh],
  );

  // ── NEW: Export Bill PDF ──────────────────────────────────────────────────
  // Takes a sessionId, finds all matching HistoryEntry rows, renders a PDF.

  const exportBillPDF = useCallback(async (sessionId: string) => {
    // Get all entries for this session
    const entries = history.filter((e) => e.sessionId === sessionId);
    if (entries.length === 0) throw new Error("No entries found for this bill");

    const first      = entries[0];
    const dateStr    = new Date(first.date).toLocaleString();
    const totalAmt   = entries.reduce((s, e) => s + e.amount, 0);
    const isPaid     = entries.every((e) => e.paid);
    const isReturned = entries.every((e) => e.returned);
    const personName = first.personName;
    const type       = first.type;
    const shiftId    = first.shiftId;

    const typeColor: Record<TransactionType, string> = {
      SALE:     "#065f46",
      PURCHASE: "#1e3a8a",
      CREDIT:   "#92400e",
      RETURN:   "#7f1d1d",
    };

    const itemRows = entries.map((e) => `
      <tr>
        <td>${escapeCSV(e.name)}</td>
        <td style="text-align:center">${e.barcode}</td>
        <td style="text-align:center;color:${typeColor[e.type]}">${e.type}</td>
        <td style="text-align:center">${e.qty}</td>
        <td style="text-align:right">${e.unitPrice.toFixed(2)}</td>
        <td style="text-align:right">${e.amount.toFixed(2)}</td>
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
.ret{background:#fef3c7;color:#92400e}
.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:12px;font-size:11px;color:#999;text-align:center}
</style></head><body>
<h1>Invoice / Bill</h1>
<div class="meta">
  <div><strong>Session #:</strong> ${sessionId.slice(-8).toUpperCase()}</div>
  <div><strong>Date:</strong> ${dateStr}</div>
  <div><strong>Type:</strong> ${type}</div>
  ${personName ? `<div><strong>Customer:</strong> ${personName}</div>` : ""}
  ${shiftId    ? `<div><strong>Shift:</strong> ${shiftId}</div>`       : ""}
  <div style="margin-top:6px">
    <span class="badge ${isPaid ? "paid" : "unpaid"}">${isPaid ? "PAID" : "UNPAID"}</span>
    ${isReturned ? '<span class="badge ret" style="margin-left:6px">RETURNED</span>' : ""}
  </div>
</div>
<table>
  <thead><tr>
    <th>Product</th>
    <th style="text-align:center">Barcode</th>
    <th style="text-align:center">Type</th>
    <th style="text-align:center">Qty</th>
    <th style="text-align:right">Unit Price</th>
    <th style="text-align:right">Amount</th>
  </tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<table class="totals">
  <tr><td>Subtotal</td><td>${totalAmt.toFixed(2)}</td></tr>
  <tr class="grand"><td>Total</td><td>${totalAmt.toFixed(2)}</td></tr>
</table>
<div class="footer">Inventory Scanner · ${new Date().toLocaleDateString()}</div>
</body></html>`;

    const { uri } = await Print.printToFileAsync({ html, base64: false });
    let shareUri = uri;
    if (Platform.OS === "android") {
      const dest = FileSystem.cacheDirectory + `bill_${sessionId.slice(-8)}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      shareUri = dest;
    }
    if (!(await Sharing.isAvailableAsync()))
      throw new Error("Sharing is not available on this device");
    await Sharing.shareAsync(shareUri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: `Bill #${sessionId.slice(-8).toUpperCase()}`,
    });
  }, [history]);

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
