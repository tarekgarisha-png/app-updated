import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInventory, useT } from "@/contexts/InventoryContext";
import { useColors } from "@/hooks/useColors";
import {
  buildDebtsCSV,
  buildHistoryCSV,
  buildProductsCSV,
  summarizeDebts,
} from "@/lib/storage";

export default function SettingsScreen() {
  const colors = useColors();
  const { t, rtl, lang } = useT();
  const { setLang, products, history, partialPayments } = useInventory();
  const insets = useSafeAreaInsets();

  const [exporting, setExporting] = useState<string | null>(null);

  const headerTopPadding = Platform.OS === "web" ? 24 : insets.top + 8;

  const debtCount = summarizeDebts(history, partialPayments).length;

  const shareCSV = async (csv: string, filename: string, title: string) => {
    if (Platform.OS === "web") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const path = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}${filename}`;
    await FileSystem.writeAsStringAsync(path, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const ok = await Sharing.isAvailableAsync();
    if (!ok) {
      Alert.alert("", t("noSharing"));
      return;
    }
    await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: title });
  };

  const handleExport = async (type: "products" | "history" | "debts" | "all") => {
    try {
      setExporting(type);
      if (type === "products") {
        if (!products.length) { Alert.alert("", t("emptyExport")); return; }
        const csv = buildProductsCSV(products);
        await shareCSV(csv, `products_${Date.now()}.csv`, t("exportProducts"));
      } else if (type === "history") {
        if (!history.length) { Alert.alert("", t("emptyExport")); return; }
        const csv = buildHistoryCSV(history);
        await shareCSV(csv, `history_${Date.now()}.csv`, t("exportHistory"));
      } else if (type === "debts") {
        const debts = summarizeDebts(history, partialPayments);
        if (!debts.length) { Alert.alert("", t("emptyExport")); return; }
        const csv = buildDebtsCSV(history);
        await shareCSV(csv, `debts_${Date.now()}.csv`, t("exportDebts"));
      } else if (type === "all") {
        const lines: string[] = [];
        lines.push("=== PRODUCTS ===");
        lines.push(buildProductsCSV(products));
        lines.push("");
        lines.push("=== HISTORY ===");
        lines.push(buildHistoryCSV(history));
        lines.push("");
        lines.push("=== DEBTS ===");
        lines.push(buildDebtsCSV(history));
        const combined = lines.join("\n");
        await shareCSV(combined, `inventory_export_${Date.now()}.csv`, t("exportAll"));
      }
    } catch {
      Alert.alert(t("exportFailed"), "");
    } finally {
      setExporting(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>...