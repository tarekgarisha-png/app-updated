import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import type { Product } from "./types";

export type ImportResult = {
  added: number;
  updated: number;
  skipped: number;
  errors: { line: number; reason: string }[];
};

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z]/g, "");
}

const HEADER_MAP: Record<string, keyof Product> = {
  barcode: "barcode",
  code: "barcode",
  sku: "barcode",
  name: "name",
  productname: "name",
  englishname: "name",
  arabicname: "nameAr",
  namear: "nameAr",
  arname: "nameAr",
  stock: "stock",
  qty: "stock",
  quantity: "stock",
  currentstock: "stock",
  minstock: "minStock",
  min: "minStock",
  unit: "unit",
  uom: "unit",
  price: "price",
  cost: "price",
};

export type ParsedCSV = {
  rows: Partial<Product>[];
  errors: { line: number; reason: string }[];
  headerMissing: boolean;
};

export function parseProductsCSV(text: string): ParsedCSV {
  const errors: { line: number; reason: string }[] = [];
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors, headerMissing: true };
  }

  const headerCells = parseCSVLine(lines[0]!).map(normalizeHeader);
  const fieldByCol: (keyof Product | null)[] = headerCells.map(
    (h) => HEADER_MAP[h] ?? null,
  );

  const hasBarcode = fieldByCol.includes("barcode");
  const hasName = fieldByCol.includes("name");

  if (!hasBarcode || !hasName) {
    return { rows: [], errors, headerMissing: true };
  }

  const rows: Partial<Product>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]!);
    const obj: Partial<Product> = {};
    for (let c = 0; c < fieldByCol.length; c++) {
      const field = fieldByCol[c];
      if (!field) continue;
      const raw = (cells[c] ?? "").trim();
      if (raw === "") continue;
      if (field === "stock" || field === "minStock") {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) obj[field] = n;
      } else if (field === "price") {
        const n = parseFloat(raw);
        if (!isNaN(n)) obj[field] = n;
      } else {
        obj[field] = raw;
      }
    }

    if (!obj.barcode) {
      errors.push({ line: i + 1, reason: "Missing barcode" });
      continue;
    }
    if (!obj.name) {
      errors.push({ line: i + 1, reason: "Missing name" });
      continue;
    }
    rows.push(obj);
  }

  return { rows, errors, headerMissing: false };
}

export function buildSampleCSV(): string {
  return [
    "Barcode,Name,Arabic Name,Stock,Min Stock,Unit,Price",
    `"6001234567890","Coca-Cola 330ml","كوكاكولا 330مل",24,5,pcs,1.50`,
    `"6009876543210","Bread Loaf","رغيف خبز",12,3,pcs,0.75`,
  ].join("\n");
}

export async function pickAndReadCSV(): Promise<string | null> {
  if (Platform.OS === "web") {
    return await pickAndReadCSVWeb();
  }
  const res = await DocumentPicker.getDocumentAsync({
    type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0]!;
  const text = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return text;
}

function pickAndReadCSVWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv,text/plain";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === "string" ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
