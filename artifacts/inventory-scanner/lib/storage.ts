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

export function buildProductsCSV(products: Product[]): string {
  return [
    "Barcode,Name,Arabic Name,Category,Stock,Min Stock,Unit,Price",
    ...products.map(
      (p) =>
        `"${p.barcode}","${p.name}","${p.nameAr}","${p.category ?? ""}",${p.stock},${p.minStock},"${p.unit}",${p.price.toFixed(2)}`,
    ),
  ].join("\n");
}

export function buildHistoryCSV(history: HistoryEntry[]): string {
  return [
    "Date,Type,Barcode,Name,Customer,Qty,Unit Price,Amount,Paid,Returned",
    ...history.map(
      (h) =>
        `"${h.date}","${h.type}","${h.barcode}","${h.name}","${h.personName ?? ""}",${h.qty},${h.unitPrice.toFixed(2)},${h.amount.toFixed(2)},"${h.paid ? "YES" : "NO"}","${h.returned ? "YES" : "NO"}"`,
    ),
  ].join("\n");
}

export function buildDebtsCSV(history: HistoryEntry[]): string {
  const debts = summarizeDebts(history);
  return [
    "Customer,Items,Total Owed,Paid,Remaining,Oldest Date",
    ...debts.map(
      (d) =>
        `"${d.personName}",${d.itemCount},${d.totalOwed.toFixed(2)},${d.partialPaid.toFixed(2)},${d.remainingOwed.toFixed(2)},"${d.oldestDate}"`,
    ),
  ].join("\n");
}

export function buildBackupBundle(
  products: Product[],
  history: HistoryEntry[],
  partialPayments: PartialPayment[],
): string {
  return [
    "=== PRODUCTS ===",
    buildProductsCSV(products),
    "",
    "=== HISTORY ===",
    buildHistoryCSV(history),
    "",
    "=== DEBTS ===",
    buildDebtsCSV(history),
    "",
    "=== PARTIAL PAYMENTS ===",
    "ID,Customer,Amount,Date,Note",
    ...partialPayments.map(
      (p) => `"${p.id}","${p.personName}",${p.amount.toFixed(2)},"${p.date}","${p.note ?? ""}"`,
    ),
  ].join("\n");
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

function escapePdfText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSimplePdfHtml(title: string, subtitle: string, headers: string[], rows: string[][]): string {
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapePdfText(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#111}
    h1{font-size:22px;margin:0 0 6px;text-align:center}
    .subtitle{text-align:center;color:#666;font-size:12px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ddd;padding:8px;font-size:12px;vertical-align:top}
    th{background:#f3f4f6;text-align:left}
    .total{font-weight:700}
  </style></head><body>
    <h1>${escapePdfText(title)}</h1>
    <div class="subtitle">${escapePdfText(subtitle)}</div>
    <table><thead><tr>${headers.map((h) => `<th>${escapePdfText(h)}</th>`).join("")}</tr></thead>
    <tbody>${bodyRows}</tbody></table>
  </body></html>`;
}

export function buildHistoryPdfHtml(history: HistoryEntry[]): string {
  const rows = history.map((h) => [
    new Date(h.date).toLocaleString(),
    h.type,
    h.personName ?? "",
    h.name,
    String(h.qty),
    (h.unitPrice ?? 0).toFixed(2),
    (h.amount ?? 0).toFixed(2),
  ]);
  return buildSimplePdfHtml(
    "Qasoda Market - History",
    `Total entries: ${history.length}`,
    ["Date", "Type", "Customer", "Item", "Qty", "Unit Price", "Amount"],
    rows,
  );
}

export function buildDebtsPdfHtml(history: HistoryEntry[], partialPayments: PartialPayment[]): string {
  const debts = summarizeDebts(history, partialPayments);
  const rows = debts.map((d) => [
    d.personName,
    String(d.itemCount),
    d.oldestDate ? new Date(d.oldestDate).toLocaleDateString() : "",
    d.totalOwed.toFixed(2),
    d.partialPaid.toFixed(2),
    d.remainingOwed.toFixed(2),
  ]);
  return buildSimplePdfHtml(
    "Qasoda Market - Debts",
    `Total people: ${debts.length}`,
    ["Customer", "Items", "Since", "Total Owed", "Paid", "Remaining"],
    rows,
  );
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
