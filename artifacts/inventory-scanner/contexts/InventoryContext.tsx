/**
 * InventoryContext.tsx — Fixed version
 *
 * Changes vs original:
 * 1. PERFORMANCE: All derived values memoized with useMemo
 * 2. PERFORMANCE: Writes debounced (300ms) so AsyncStorage isn't hammered on every keystroke
 * 3. PERFORMANCE: Products/History split into separate storage writes so a product
 *    change doesn't re-serialise the entire history blob
 * 4. CSV EXPORT: uses expo-file-system + expo-sharing with proper Android content URI
 * 5. CSV IMPORT: tolerant header mapping preserved, error surfaced to caller
 * 6. PDF EXPORT: robust HTML template, proper async/await, error surfaced to caller
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { Platform } from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
  purchasePrice: number;
  quantity: number;
  lowStockThreshold: number;
  updatedAt: number; // epoch ms
}

export interface HistoryItem {
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  price: number;
  mode: "SALE" | "PURCHASE" | "CREDIT" | "RETURN";
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  items: HistoryItem[];
  total: number;
  paid: boolean;
  returned: boolean;
  shiftId: string;
  personName?: string;
}

export interface PartialPayment {
  id: string;
  historyEntryId: string;
  amount: number;
  timestamp: number;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEYS = {
  products: "inventory:products:v1",
  history: "inventory:history:v1",
  payments: "inventory:partial_payments:v1",
} as const;

// ─── Context type ─────────────────────────────────────────────────────────────

interface InventoryContextType {
  products: Product[];
  history: HistoryEntry[];
  partialPayments: PartialPayment[];
  loading: boolean;

  // Products
  addProduct: (p: Omit<Product, "id" | "updatedAt">) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  getProduct: (id: string) => Product | undefined;
  getProductByBarcode: (barcode: string) => Product | undefined;

  // History
  addHistoryEntry: (entry: Omit<HistoryEntry, "id" | "timestamp">) => void;
  markPaid: (id: string) => void;
  markReturned: (id: string) => void;
  returnItem: (entryId: string, productId: string, qty: number) => void;

  // Payments
  addPartialPayment: (p: Omit<PartialPayment, "id" | "timestamp">) => void;

  // Import / Export
  exportProductsCSV: () => Promise<void>;
  exportHistoryCSV: () => Promise<void>;
  importProductsCSV: (uri: string) => Promise<{ imported: number; errors: string[] }>;
  importHistoryCSV: (uri: string) => Promise<{ imported: number; errors: string[] }>;
  exportBillPDF: (entry: HistoryEntry) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeCSV(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Write text to a temp file and open the share sheet. Works on iOS & Android. */
async function shareTextFile(filename: string, content: string, mimeType: string) {
  const uri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Sharing is not available on this device");

  await Sharing.shareAsync(uri, { mimeType, UTI: mimeType === "text/csv" ? "public.comma-separated-values-text" : "com.adobe.pdf" });
}

// ─── Context ──────────────────────────────────────────────────────────────────

const InventoryContext = createContext<InventoryContextType | null>(null);

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInventory must be used inside <InventoryProvider>");
  return ctx;
}

// ─── Debounce helper ──────────────────────────────────────────────────────────

function useDebounceCallback<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [partialPayments, setPartialPayments] = useState<PartialPayment[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load from storage on mount ────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [rawP, rawH, rawPay] = await AsyncStorage.multiGet([
          KEYS.products,
          KEYS.history,
          KEYS.payments,
        ]);
        if (rawP[1]) setProducts(JSON.parse(rawP[1]));
        if (rawH[1]) setHistory(JSON.parse(rawH[1]));
        if (rawPay[1]) setPartialPayments(JSON.parse(rawPay[1]));
      } catch (e) {
        console.error("InventoryContext load error", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Persist — debounced per-collection ───────────────────────────────────

  const saveProducts = useCallback((data: Product[]) => {
    AsyncStorage.setItem(KEYS.products, JSON.stringify(data)).catch(console.error);
  }, []);

  const saveHistory = useCallback((data: HistoryEntry[]) => {
    AsyncStorage.setItem(KEYS.history, JSON.stringify(data)).catch(console.error);
  }, []);

  const savePayments = useCallback((data: PartialPayment[]) => {
    AsyncStorage.setItem(KEYS.payments, JSON.stringify(data)).catch(console.error);
  }, []);

  const debouncedSaveProducts = useDebounceCallback(saveProducts, 300);
  const debouncedSaveHistory = useDebounceCallback(saveHistory, 300);

  // ── Products ──────────────────────────────────────────────────────────────

  const addProduct = useCallback((p: Omit<Product, "id" | "updatedAt">) => {
    setProducts((prev) => {
      const next = [...prev, { ...p, id: uid(), updatedAt: Date.now() }];
      debouncedSaveProducts(next);
      return next;
    });
  }, [debouncedSaveProducts]);

  const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
    setProducts((prev) => {
      const next = prev.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
      );
      debouncedSaveProducts(next);
      return next;
    });
  }, [debouncedSaveProducts]);

  const deleteProduct = useCallback((id: string) => {
    setProducts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      debouncedSaveProducts(next);
      return next;
    });
  }, [debouncedSaveProducts]);

  // Memoized lookup maps — O(1) instead of O(n) on every render
  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );
  const productByBarcode = useMemo(
    () => new Map(products.map((p) => [p.barcode, p])),
    [products]
  );

  const getProduct = useCallback(
    (id: string) => productById.get(id),
    [productById]
  );
  const getProductByBarcode = useCallback(
    (barcode: string) => productByBarcode.get(barcode),
    [productByBarcode]
  );

  // ── History ───────────────────────────────────────────────────────────────

  const addHistoryEntry = useCallback(
    (entry: Omit<HistoryEntry, "id" | "timestamp">) => {
      setHistory((prev) => {
        const next = [{ ...entry, id: uid(), timestamp: Date.now() }, ...prev];
        debouncedSaveHistory(next);
        return next;
      });
    },
    [debouncedSaveHistory]
  );

  const markPaid = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, paid: true } : e));
      debouncedSaveHistory(next);
      return next;
    });
  }, [debouncedSaveHistory]);

  const markReturned = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.map((e) =>
        e.id === id ? { ...e, returned: true } : e
      );
      debouncedSaveHistory(next);
      return next;
    });
  }, [debouncedSaveHistory]);

  const returnItem = useCallback(
    (entryId: string, productId: string, qty: number) => {
      // Update history
      setHistory((prev) => {
        const next = prev.map((e) => {
          if (e.id !== entryId) return e;
          return {
            ...e,
            items: e.items.map((item) =>
              item.productId === productId
                ? { ...item, quantity: Math.max(0, item.quantity - qty) }
                : item
            ),
          };
        });
        debouncedSaveHistory(next);
        return next;
      });
      // Restock product
      setProducts((prev) => {
        const next = prev.map((p) =>
          p.id === productId
            ? { ...p, quantity: p.quantity + qty, updatedAt: Date.now() }
            : p
        );
        debouncedSaveProducts(next);
        return next;
      });
    },
    [debouncedSaveHistory, debouncedSaveProducts]
  );

  // ── Partial payments ──────────────────────────────────────────────────────

  const addPartialPayment = useCallback(
    (p: Omit<PartialPayment, "id" | "timestamp">) => {
      setPartialPayments((prev) => {
        const next = [...prev, { ...p, id: uid(), timestamp: Date.now() }];
        savePayments(next);
        return next;
      });
    },
    [savePayments]
  );

  // ── CSV Export ────────────────────────────────────────────────────────────

  const exportProductsCSV = useCallback(async () => {
    const headers = [
      "id", "barcode", "name", "price", "purchasePrice",
      "quantity", "lowStockThreshold", "updatedAt",
    ];
    const rows = products.map((p) =>
      headers.map((h) => escapeCSV(p[h as keyof Product])).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    await shareTextFile(`products_${Date.now()}.csv`, csv, "text/csv");
  }, [products]);

  const exportHistoryCSV = useCallback(async () => {
    const headers = [
      "id", "timestamp", "shiftId", "personName",
      "total", "paid", "returned",
      "items_json",
    ];
    const rows = history.map((e) =>
      [
        escapeCSV(e.id),
        escapeCSV(new Date(e.timestamp).toISOString()),
        escapeCSV(e.shiftId),
        escapeCSV(e.personName ?? ""),
        escapeCSV(e.total),
        escapeCSV(e.paid),
        escapeCSV(e.returned),
        escapeCSV(JSON.stringify(e.items)),
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    await shareTextFile(`history_${Date.now()}.csv`, csv, "text/csv");
  }, [history]);

  // ── CSV Import ────────────────────────────────────────────────────────────

  const importProductsCSV = useCallback(
    async (uri: string): Promise<{ imported: number; errors: string[] }> => {
      const raw = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const lines = raw.trim().split("\n");
      if (lines.length < 2) return { imported: 0, errors: ["File is empty"] };

      // Tolerant header mapping (case-insensitive, ignores BOM)
      const headerLine = lines[0].replace(/^\uFEFF/, "");
      const headerFields = parseCSVLine(headerLine).map((h) =>
        h.trim().toLowerCase()
      );

      const FIELD_MAP: Record<string, string> = {
        barcode: "barcode",
        "bar code": "barcode",
        sku: "barcode",
        name: "name",
        "product name": "name",
        price: "price",
        "sale price": "price",
        purchaseprice: "purchasePrice",
        "purchase price": "purchasePrice",
        cost: "purchasePrice",
        quantity: "quantity",
        qty: "quantity",
        stock: "quantity",
        lowstockthreshold: "lowStockThreshold",
        "low stock": "lowStockThreshold",
        "low stock threshold": "lowStockThreshold",
      };

      const mapped = headerFields.map((h) => FIELD_MAP[h] ?? h);

      const errors: string[] = [];
      const imported: Product[] = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const fields = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        mapped.forEach((key, idx) => {
          row[key] = (fields[idx] ?? "").trim();
        });

        if (!row.name) {
          errors.push(`Row ${i + 1}: missing name`);
          continue;
        }

        imported.push({
          id: row.id || uid(),
          barcode: row.barcode || uid(),
          name: row.name,
          price: parseFloat(row.price) || 0,
          purchasePrice: parseFloat(row.purchasePrice) || 0,
          quantity: parseInt(row.quantity, 10) || 0,
          lowStockThreshold: parseInt(row.lowStockThreshold, 10) || 5,
          updatedAt: Date.now(),
        });
      }

      if (imported.length > 0) {
        setProducts((prev) => {
          // Merge: existing product with same barcode gets updated, new ones appended
          const byBarcode = new Map(prev.map((p) => [p.barcode, p]));
          imported.forEach((p) => byBarcode.set(p.barcode, p));
          const next = Array.from(byBarcode.values());
          saveProducts(next);
          return next;
        });
      }

      return { imported: imported.length, errors };
    },
    [saveProducts]
  );

  const importHistoryCSV = useCallback(
    async (uri: string): Promise<{ imported: number; errors: string[] }> => {
      const raw = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const lines = raw.trim().split("\n");
      if (lines.length < 2) return { imported: 0, errors: ["File is empty"] };

      const errors: string[] = [];
      const imported: HistoryEntry[] = [];

      const headerLine = lines[0].replace(/^\uFEFF/, "");
      const headers = parseCSVLine(headerLine).map((h) => h.trim().toLowerCase());

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        try {
          const fields = parseCSVLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => (row[h] = (fields[idx] ?? "").trim()));

          let items: HistoryItem[] = [];
          if (row.items_json) {
            try {
              items = JSON.parse(row.items_json);
            } catch {
              errors.push(`Row ${i + 1}: invalid items_json`);
            }
          }

          imported.push({
            id: row.id || uid(),
            timestamp: row.timestamp ? new Date(row.timestamp).getTime() : Date.now(),
            shiftId: row.shiftid || row.shiftId || "1",
            personName: row.personname || row.personName || undefined,
            total: parseFloat(row.total) || 0,
            paid: row.paid === "true",
            returned: row.returned === "true",
            items,
          });
        } catch (e) {
          errors.push(`Row ${i + 1}: parse error — ${String(e)}`);
        }
      }

      if (imported.length > 0) {
        setHistory((prev) => {
          const byId = new Map(prev.map((e) => [e.id, e]));
          imported.forEach((e) => {
            // Union: existing entry flags get OR'd
            const existing = byId.get(e.id);
            if (existing) {
              byId.set(e.id, {
                ...e,
                paid: existing.paid || e.paid,
                returned: existing.returned || e.returned,
              });
            } else {
              byId.set(e.id, e);
            }
          });
          const next = Array.from(byId.values()).sort(
            (a, b) => b.timestamp - a.timestamp
          );
          saveHistory(next);
          return next;
        });
      }

      return { imported: imported.length, errors };
    },
    [saveHistory]
  );

  // ── PDF Export ────────────────────────────────────────────────────────────

  const exportBillPDF = useCallback(async (entry: HistoryEntry) => {
    const dateStr = new Date(entry.timestamp).toLocaleString();
    const itemRows = entry.items
      .map(
        (item) => `
      <tr>
        <td>${item.productName}</td>
        <td style="text-align:center">${item.mode}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">${item.price.toFixed(2)}</td>
        <td style="text-align:right">${(item.price * item.quantity).toFixed(2)}</td>
      </tr>`
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bill #${entry.id.slice(-6)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 32px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #555; margin-bottom: 24px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #1a1a2e; color: #fff; padding: 8px 10px; text-align: left; font-size: 12px; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; }
    tr:last-child td { border-bottom: none; }
    .totals { margin-left: auto; width: 260px; }
    .totals tr td:first-child { color: #555; }
    .totals tr td:last-child { text-align: right; font-weight: 600; }
    .totals tr.grand td { font-size: 15px; border-top: 2px solid #222; padding-top: 8px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
    .paid { background: #d1fae5; color: #065f46; }
    .unpaid { background: #fee2e2; color: #991b1b; }
    .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 12px; font-size: 11px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <h1>Invoice / Bill</h1>
  <div class="meta">
    <div><strong>Bill #:</strong> ${entry.id.slice(-8).toUpperCase()}</div>
    <div><strong>Date:</strong> ${dateStr}</div>
    ${entry.personName ? `<div><strong>Customer:</strong> ${entry.personName}</div>` : ""}
    <div><strong>Shift:</strong> ${entry.shiftId}</div>
    <div style="margin-top:6px">
      <span class="badge ${entry.paid ? "paid" : "unpaid"}">${entry.paid ? "PAID" : "UNPAID"}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th style="text-align:center">Mode</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <table class="totals">
    <tr>
      <td>Subtotal</td>
      <td>${entry.total.toFixed(2)}</td>
    </tr>
    <tr class="grand">
      <td>Total</td>
      <td>${entry.total.toFixed(2)}</td>
    </tr>
  </table>

  <div class="footer">Generated by Inventory Scanner · ${new Date().toLocaleDateString()}</div>
</body>
</html>`;

    // Generate PDF
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    // On iOS expo-print already writes a shareable URI.
    // On Android we need to copy to a known cache location for Sharing.
    let shareUri = uri;
    if (Platform.OS === "android") {
      const dest = FileSystem.cacheDirectory + `bill_${entry.id.slice(-8)}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      shareUri = dest;
    }

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) throw new Error("Sharing is not available on this device");

    await Sharing.shareAsync(shareUri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: `Bill #${entry.id.slice(-8).toUpperCase()}`,
    });
  }, []);

  // ── Context value — memoized so consumers don't re-render unnecessarily ───

  const value = useMemo<InventoryContextType>(
    () => ({
      products,
      history,
      partialPayments,
      loading,
      addProduct,
      updateProduct,
      deleteProduct,
      getProduct,
      getProductByBarcode,
      addHistoryEntry,
      markPaid,
      markReturned,
      returnItem,
      addPartialPayment,
      exportProductsCSV,
      exportHistoryCSV,
      importProductsCSV,
      importHistoryCSV,
      exportBillPDF,
    }),
    [
      products, history, partialPayments, loading,
      addProduct, updateProduct, deleteProduct, getProduct, getProductByBarcode,
      addHistoryEntry, markPaid, markReturned, returnItem, addPartialPayment,
      exportProductsCSV, exportHistoryCSV, importProductsCSV, importHistoryCSV,
      exportBillPDF,
    ]
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}
