import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInventory, useT } from "@/contexts/InventoryContext";
import { useColors } from "@/hooks/useColors";
import {
  buildSampleCSV,
  parseProductsCSV,
  pickAndReadCSV,
  type ImportResult,
} from "@/lib/csvImport";
import type { Product } from "@/lib/types";

type Step = "idle" | "preview" | "importing" | "done";

export default function ImportCSVScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { products, saveProduct } = useInventory();

  const [step, setStep] = useState<Step>("idle");
  const [rows, setRows] = useState<Partial<Product>[]>([]);
  const [errors, setErrors] = useState<{ line: number; reason: string }[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handlePickFile = async () => {
    try {
      const text = await pickAndReadCSV();
      if (!text) return;
      const parsed = parseProductsCSV(text);
      if (parsed.headerMissing) { Alert.alert("", t("importHeaderError")); return; }
      if (parsed.rows.length === 0) { Alert.alert("", t("importNoRows")); return; }
      setRows(parsed.rows);
      setErrors(parsed.errors);
      setStep("preview");
    } catch {
      Alert.alert("", t("importFailed"));
    }
  };

  const handleConfirm = async () => {
    setStep("importing");
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const existingMap = new Map(products.map((p) => [p.barcode, p]));

    for (const row of rows) {
      if (!row.barcode || !row.name) {
        skipped++;
        continue;
      }
      const existing = existingMap.get(row.barcode);
      const merged: Product = {
        barcode: row.barcode,
        name: row.name,
        nameAr: row.nameAr ?? existing?.nameAr ?? "",
        stock: row.stock ?? existing?.stock ?? 0,
        minStock: row.minStock ?? existing?.minStock ?? 5,
        unit: row.unit ?? existing?.unit ?? "pcs",
        price: row.price ?? existing?.price ?? 0,
      };
      try {
        await saveProduct(merged);
        if (existing) updated++;
        else added++;
      } catch {
        skipped++;
      }
    }

    setResult({ added, updated, skipped, errors });
    setStep("done");
  };

  const handleSample = async () => {
    const csv = buildSampleCSV();
    if (Platform.OS === "web") {
      if (typeof document === "undefined") return;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products_sample.csv";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    try {
      const path = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}products_sample.csv`;
      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const ok = await Sharing.isAvailableAsync();
      if (ok) {
        await Sharing.shareAsync(path, {
          mimeType: "text/csv",
          dialogTitle: t("importDownloadSample"),
        });
      } else {
        Alert.alert("", t("noSharing"));
      }
    } catch {
      Alert.alert("", t("importFailed"));
    }
  };

  const headerTopPadding = Platform.OS === "web" ? 24 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>...