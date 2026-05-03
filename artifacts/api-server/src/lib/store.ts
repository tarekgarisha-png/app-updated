import * as fs from "fs";
import { logger } from "./logger";

const STORE_PATH = "/tmp/qasoda_sync.json";

export type SyncProduct = {
  barcode: string;
  name: string;
  nameAr: string;
  stock: number;
  minStock: number;
  unit: string;
  price: number;
  updatedAt?: string;
};

export type SyncHistoryEntry = {
  id: string;
  barcode: string;
  name: string;
  type: string;
  qty: number;
  unitPrice: number;
  amount: number;
  personName?: string;
  paid?: boolean;
  paidAt?: string;
  sessionId?: string;
  returnedFrom?: string;
  returned?: boolean;
  date: string;
  shiftId?: number;
};

export type SyncPartialPayment = {
  id: string;
  personName: string;
  amount: number;
  date: string;
  note?: string;
};

export type SyncData = {
  products: SyncProduct[];
  history: SyncHistoryEntry[];
  partialPayments: SyncPartialPayment[];
  updatedAt: string;
};

let store: SyncData = {
  products: [],
  history: [],
  partialPayments: [],
  updatedAt: new Date().toISOString(),
};

function loadStore(): void {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as Partial<SyncData>;
      store = {
        products: [],
        history: [],
        partialPayments: [],
        updatedAt: new Date().toISOString(),
        ...parsed,
      };
      logger.info(
        { products: store.products.length, history: store.history.length },
        "Sync store loaded from disk",
      );
    }
  } catch (err) {
    logger.warn({ err }, "Could not load sync store, starting fresh");
  }
}

function saveStore(): void {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Could not save sync store to disk");
  }
}

loadStore();

export function getData(): SyncData {
  return store;
}

export function mergeData(
  incoming: Omit<SyncData, "updatedAt">,
): SyncData {
  // ─── Products: newer updatedAt wins; server wins if no timestamps ──────────
  const productMap = new Map<string, SyncProduct>(
    store.products.map((p) => [p.barcode, p]),
  );
  for (const p of incoming.products ?? []) {
    const existing = productMap.get(p.barcode);
    if (!existing) {
      productMap.set(p.barcode, p);
    } else {
      const serverTs = existing.updatedAt ?? "";
      const incomingTs = p.updatedAt ?? "";
      if (incomingTs > serverTs) {
        productMap.set(p.barcode, p);
      }
      // else server copy is newer or equal — keep it
    }
  }

  // ─── History: union by id; OR boolean flags ─────────────────────────────────
  const historyMap = new Map<string, SyncHistoryEntry>(
    store.history.map((h) => [h.id, h]),
  );
  for (const h of incoming.history ?? []) {
    const existing = historyMap.get(h.id);
    if (!existing) {
      historyMap.set(h.id, h);
    } else {
      historyMap.set(h.id, {
        ...existing,
        paid: existing.paid || h.paid,
        returned: existing.returned || h.returned,
        paidAt: existing.paidAt ?? h.paidAt,
      });
    }
  }

  // ─── Partial payments: append-only by id ─────────────────────────────────
  const paymentMap = new Map<string, SyncPartialPayment>(
    store.partialPayments.map((p) => [p.id, p]),
  );
  for (const p of incoming.partialPayments ?? []) {
    if (!paymentMap.has(p.id)) {
      paymentMap.set(p.id, p);
    }
  }

  store = {
    products: Array.from(productMap.values()),
    history: Array.from(historyMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    ),
    partialPayments: Array.from(paymentMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    ),
    updatedAt: new Date().toISOString(),
  };

  saveStore();
  return store;
}
