export type Product = {
  barcode: string;
  name: string;
  nameAr: string;
  stock: number;
  minStock: number;
  unit: string;
  price: number;
};

export type TransactionType = "SALE" | "PURCHASE" | "CREDIT";

export type HistoryEntry = {
  id: string;
  barcode: string;
  name: string;
  type: TransactionType;
  qty: number;
  unitPrice: number;
  amount: number;
  personName?: string;
  paid?: boolean;
  paidAt?: string;
  date: string;
};

export type ScanQueueItem = {
  barcode: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
};

export type ScanMode = "SALE" | "PURCHASE" | "CREDIT";

export type DebtSummary = {
  personName: string;
  totalOwed: number;
  itemCount: number;
  entries: HistoryEntry[];
  oldestDate: string;
};
