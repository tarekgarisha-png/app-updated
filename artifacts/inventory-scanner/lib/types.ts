export type Product = {
  barcode: string;
  name: string;
  nameAr: string;
  stock: number;
  minStock: number;
  unit: string;
  price: number;
};

export type TransactionType = "SALE" | "PURCHASE" | "CREDIT" | "RETURN";

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
  sessionId?: string;
  returnedFrom?: string;
  returned?: boolean;
  date: string;
};

export type BillGroup = {
  sessionId: string;
  type: TransactionType;
  personName?: string;
  date: string;
  totalAmount: number;
  totalQty: number;
  items: HistoryEntry[];
  paid?: boolean;
  returned?: boolean;
};

export type ScanQueueItem = {
  barcode: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
};

export type ScanMode = "SALE" | "PURCHASE" | "CREDIT";

export type PartialPayment = {
  id: string;
  personName: string;
  amount: number;
  date: string;
  note?: string;
};

export type DebtSummary = {
  personName: string;
  totalOwed: number;
  remainingOwed: number;
  itemCount: number;
  entries: HistoryEntry[];
  oldestDate: string;
  partialPayments: PartialPayment[];
};
