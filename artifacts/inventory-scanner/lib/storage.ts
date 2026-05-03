import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  BillGroup,
  DebtSummary,
  HistoryEntry,
  PartialPayment,
  Product,
  ScanQueueItem,
  TransactionType,
} from "./types";

const PRODUCTS_KEY = "inventory:products:v1";
const HISTORY_KEY = "inventory:history:v1";
const PAYMENTS_KEY = "inventory:partial_payments:v1";

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
  const withTimestamp: Product = { ...product, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    products[idx] = withTimestamp;
  } else {
    products.push(withTimestamp);
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
  shiftId?: number,
): Promise<void> {
  const products = await getAllProducts();
  const now = new Date().toISOString();
  const batchSessionId = genId();
  const history = await getHistory(10000);

  for (const item of queue) {
    const delta =
      mode === "PURCHASE" || mode === "RETURN" ? item.qty : -item.qty;
    const idx = products.findIndex((p) => p.barcode === item.barcode);
    let unitPrice = item.price;
    if (idx >= 0) {
      const updated = { ...products[idx]! };
      updated.stock = Math.max(0, updated.stock + delta);
      updated.updatedAt = now;
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
      sessionId: batchSessionId,
      date: now,
      ...(shiftId !== undefined ? { shiftId } : {}),
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

export async function returnBillSession(sessionId: string): Promise<void> {
  const products = await getAllProducts();
  const history = await getHistory(10000);
  const now = new Date().toISOString();
  const returnSessionId = genId();

  const originals = history.filter(
    (h) =>
      (h.sessionId === sessionId || h.id === sessionId.replace("solo:", "")) &&
      !h.returned &&
      (h.type === "SALE" || h.type === "CREDIT"),
  );

  if (!originals.length) return;

  const newEntries: HistoryEntry[] = [];

  for (const orig of originals) {
    const idx = products.findIndex((p) => p.barcode === orig.barcode);
    if (idx >= 0) {
      const updated = { ...products[idx]! };
      updated.stock = updated.stock + orig.qty;
      updated.updatedAt = now;
      products[idx] = updated;
    }
    newEntries.push({
      id: genId(),
      barcode: orig.barcode,
      name: orig.name,
      type: "RETURN",
      qty: orig.qty,
      unitPrice: orig.unitPrice,
      amount: orig.amount,
      sessionId: returnSessionId,
      returnedFrom: orig.id,
      date: now,
    });
  }

  const updatedHistory = history.map((h) =>
    originals.some((o) => o.id === h.id) ? { ...h, returned: true } : h,
  );

  await writeProducts(products);
  await writeHistory([...newEntries, ...updatedHistory]);
}

export async function returnSingleEntry(entryId: string): Promise<void> {
  const products = await getAllProducts();
  const history = await getHistory(10000);
  const now = new Date().toISOString();

  const orig = history.find((h) => h.id === entryId);
  if (!orig || orig.returned) return;
  if (orig.type !== "SALE" && orig.type !== "CREDIT") return;

  const idx = products.findIndex((p) => p.barcode === orig.barcode);
  if (idx >= 0) {
    const updated = { ...products[idx]! };
    updated.stock = updated.stock + orig.qty;
    updated.updatedAt = now;
    products[idx] = updated;
  }

  const returnEntry: HistoryEntry = {
    id: genId(),
    barcode: orig.barcode,
    name: orig.name,
    type: "RETURN",
    qty: orig.qty,
    unitPrice: orig.unitPrice,
    amount: orig.amount,
    returnedFrom: orig.id,
    sessionId: genId(),
    date: now,
  };

  const updatedHistory = history.map((h) =>
    h.id === entryId ? { ...h, returned: true } : h,
  );

  await writeProducts(products);
  await writeHistory([returnEntry, ...updatedHistory]);
}

export async function getPartialPayments(): Promise<PartialPayment[]> {
  const raw = await AsyncStorage.getItem(PAYMENTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PartialPayment[];
  } catch {
    return [];
  }
}

export async function addPartialPayment(
  personName: string,
  amount: number,
  note?: string,
): Promise<void> {
  const payments = await getPartialPayments();
  const payment: PartialPayment = {
    id: genId(),
    personName: personName.trim(),
    amount,
    note,
    date: new Date().toISOString(),
  };
  payments.unshift(payment);
  await AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
}

export function groupHistoryIntoBills(history: HistoryEntry[]): BillGroup[] {
  const sessionMap = new Map<string, BillGroup>();
  const singleKey = (h: HistoryEntry) => `solo:${h.id}`;

  for (const h of history) {
    const key = h.sessionId ?? singleKey(h);
    const existing = sessionMap.get(key);
    if (existing) {
      existing.totalAmount += h.amount ?? 0;
      existing.totalQty += h.qty;
      existing.items.push(h);
      if (h.paid === false) existing.paid = false;
      if (!h.returned) existing.returned = false;
    } else {
      sessionMap.set(key, {
        sessionId: key,
        type: h.type,
        personName: h.personName,
        date: h.date,
        totalAmount: h.amount ?? 0,
        totalQty: h.qty,
        items: [h],
        paid: h.type === "CREDIT" ? (h.paid ?? false) : undefined,
        returned: h.returned ?? false,
      });
    }
  }

  return Array.from(sessionMap.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function generateAutoBarcode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `#${ts}${rand}`;
}

export function summarizeDebts(
  history: HistoryEntry[],
  partialPayments: PartialPayment[] = [],
): DebtSummary[] {
  const map = new Map<string, DebtSummary>();
  for (const h of history) {
    if (h.type !== "CREDIT") continue;
    if (h.paid) continue;
    const key = (h.personName ?? "Unknown").trim() || "Unknown";
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        personName: key,
        totalOwed: h.amount ?? 0,
        partialPaid: 0,
        remainingOwed: h.amount ?? 0,
        itemCount: 1,
        oldestDate: h.date,
        entries: [h],
        partialPayments: [],
      });
    } else {
      cur.totalOwed += h.amount ?? 0;
      cur.remainingOwed += h.amount ?? 0;
      cur.itemCount += 1;
      cur.entries.push(h);
      if (new Date(h.date).getTime() < new Date(cur.oldestDate).getTime()) {
        cur.oldestDate = h.date;
      }
    }
  }

  for (const d of map.values()) {
    d.partialPayments = partialPayments.filter(
      (p) => (p.personName ?? "Unknown").trim() === d.personName,
    );
    d.partialPaid = d.partialPayments.reduce((s, p) => s + p.amount, 0);
    d.remainingOwed = Math.max(0, d.totalOwed - d.partialPaid);
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.oldestDate).getTime() - new Date(b.oldestDate).getTime(),
  );
}
