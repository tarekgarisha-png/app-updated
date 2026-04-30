import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  DebtSummary,
  HistoryEntry,
  Product,
  ScanQueueItem,
  TransactionType,
} from "./types";

const PRODUCTS_KEY = "inventory:products:v1";
const HISTORY_KEY = "inventory:history:v1";

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).substring(2, 9);
}

export async function getAllProducts(): Promise<Product[]> {
  const raw = await AsyncStorage.getItem(PRODUCTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Product[];
    return parsed.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function writeProducts(products: Product[]): Promise<void> {
  await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

export async function getProductByBarcode(
  barcode: string,
): Promise<Product | null> {
  const products = await getAllProducts();
  return products.find((p) => p.barcode === barcode) ?? null;
}

export async function saveProduct(product: Product): Promise<void> {
  const products = await getAllProducts();
  const idx = products.findIndex((p) => p.barcode === product.barcode);
  if (idx >= 0) {
    products[idx] = product;
  } else {
    products.push(product);
  }
  await writeProducts(products);
}

export async function deleteProduct(barcode: string): Promise<void> {
  const products = await getAllProducts();
  const filtered = products.filter((p) => p.barcode !== barcode);
  await writeProducts(filtered);
}

export async function getLowStockProducts(): Promise<Product[]> {
  const products = await getAllProducts();
  return products
    .filter((p) => p.stock <= p.minStock)
    .sort((a, b) => a.stock - b.stock);
}

export async function commitScanQueue(
  queue: ScanQueueItem[],
  mode: TransactionType,
  personName?: string,
): Promise<void> {
  const products = await getAllProducts();
  const now = new Date().toISOString();
  const history = await getHistory(10000);

  for (const item of queue) {
    // SALE and CREDIT both reduce stock; PURCHASE adds.
    const delta = mode === "PURCHASE" ? item.qty : -item.qty;
    const idx = products.findIndex((p) => p.barcode === item.barcode);
    let unitPrice = item.price;
    if (idx >= 0) {
      const updated = { ...products[idx]! };
      updated.stock = Math.max(0, updated.stock + delta);
      products[idx] = updated;
      if (!unitPrice) unitPrice = products[idx]!.price;
    }
    const amount = unitPrice * item.qty;
    const entry: HistoryEntry = {
      id: genId(),
      barcode: item.barcode,
      name: item.name,
      type: mode,
      qty: item.qty,
      unitPrice,
      amount,
      date: now,
    };
    if (mode === "CREDIT") {
      entry.personName = (personName ?? "").trim() || "Unknown";
      entry.paid = false;
    }
    history.unshift(entry);
  }

  await writeProducts(products);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export async function getHistory(limit = 500): Promise<HistoryEntry[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HistoryEntry[];
    // Backward-compat: ensure new fields are present.
    const normalized = parsed.map((h) => ({
      ...h,
      unitPrice: typeof h.unitPrice === "number" ? h.unitPrice : 0,
      amount:
        typeof h.amount === "number"
          ? h.amount
          : (typeof h.unitPrice === "number" ? h.unitPrice : 0) * h.qty,
    }));
    return normalized.slice(0, limit);
  } catch {
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

async function writeHistory(history: HistoryEntry[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export async function markCreditEntryPaid(
  entryId: string,
  paid: boolean,
): Promise<void> {
  const history = await getHistory(10000);
  const idx = history.findIndex((h) => h.id === entryId);
  if (idx < 0) return;
  const entry = { ...history[idx]! };
  if (entry.type !== "CREDIT") return;
  entry.paid = paid;
  entry.paidAt = paid ? new Date().toISOString() : undefined;
  history[idx] = entry;
  await writeHistory(history);
}

export async function markPersonDebtsPaid(personName: string): Promise<void> {
  const history = await getHistory(10000);
  const now = new Date().toISOString();
  const next = history.map((h) =>
    h.type === "CREDIT" && (h.personName ?? "Unknown") === personName && !h.paid
      ? { ...h, paid: true, paidAt: now }
      : h,
  );
  await writeHistory(next);
}

export async function deleteCreditEntry(entryId: string): Promise<void> {
  const history = await getHistory(10000);
  const next = history.filter((h) => h.id !== entryId);
  await writeHistory(next);
}

export function summarizeDebts(history: HistoryEntry[]): DebtSummary[] {
  const map = new Map<string, DebtSummary>();
  for (const h of history) {
    if (h.type !== "CREDIT") continue;
    if (h.paid) continue;
    const key = (h.personName ?? "Unknown").trim() || "Unknown";
    const cur = map.get(key);
    if (cur) {
      cur.totalOwed += h.amount;
      cur.itemCount += h.qty;
      cur.entries.push(h);
      if (h.date < cur.oldestDate) cur.oldestDate = h.date;
    } else {
      map.set(key, {
        personName: key,
        totalOwed: h.amount,
        itemCount: h.qty,
        entries: [h],
        oldestDate: h.date,
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.totalOwed - a.totalOwed,
  );
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export function buildProductsCSV(products: Product[]): string {
  const header = "Barcode,Name,Arabic Name,Stock,Min Stock,Unit,Price\n";
  const rows = products
    .map(
      (p) =>
        `${csvEscape(p.barcode)},${csvEscape(p.name)},${csvEscape(
          p.nameAr,
        )},${p.stock},${p.minStock},${csvEscape(p.unit)},${p.price}`,
    )
    .join("\n");
  return header + rows;
}

export function buildHistoryCSV(history: HistoryEntry[]): string {
  const header =
    "ID,Date,Type,Barcode,Name,Qty,Unit Price,Amount,Person,Paid\n";
  const rows = history
    .map(
      (h) =>
        `${csvEscape(h.id)},${csvEscape(h.date)},${csvEscape(h.type)},${csvEscape(h.barcode)},${csvEscape(h.name)},${h.qty},${h.unitPrice ?? 0},${h.amount ?? 0},${csvEscape(h.personName ?? "")},${h.type === "CREDIT" ? (h.paid ? "PAID" : "UNPAID") : ""}`,
    )
    .join("\n");
  return header + rows;
}
