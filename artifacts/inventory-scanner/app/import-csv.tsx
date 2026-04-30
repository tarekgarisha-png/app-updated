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
      if (parsed.headerMissing) {
        Alert.alert("", t("importHeaderError"));
        return;
      }
      if (parsed.rows.length === 0) {
        Alert.alert("", t("importNoRows"));
        return;
      }
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
      const path = `${FileSystem.documentDirectory}products_sample.csv`;
      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const ok = await Sharing.isAvailableAsync();
      if (ok) {
        await Sharing.shareAsync(path, {
          mimeType: "text/csv",
          dialogTitle: t("importDownloadSample"),
        });
      }
    } catch {
      // ignore
    }
  };

  const headerTopPadding = Platform.OS === "web" ? 24 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: headerTopPadding,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
          rtl && styles.rowReverse,
        ]}
      >
        <Text
          style={[
            styles.headerTitle,
            { color: colors.foreground },
            rtl && styles.rtlText,
          ]}
        >
          {t("importTitle")}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {step === "idle" && (
        <View style={{ padding: 18, gap: 14 }}>
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="info" size={18} color={colors.primary} />
            <Text
              style={[
                styles.infoText,
                { color: colors.foreground },
                rtl && styles.rtlText,
              ]}
            >
              {t("importInstructions")}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handlePickFile}
          >
            <Feather name="upload" size={18} color="white" />
            <Text style={styles.primaryBtnText}>{t("importPickFile")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
            onPress={handleSample}
          >
            <Feather name="download" size={16} color={colors.foreground} />
            <Text
              style={[styles.secondaryBtnText, { color: colors.foreground }]}
            >
              {t("importDownloadSample")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {step === "preview" && (
        <View style={{ flex: 1 }}>
          <View
            style={[
              styles.previewBanner,
              { backgroundColor: "#dbeafe", borderColor: "#93c5fd" },
            ]}
          >
            <Text style={[styles.previewText, { color: "#1e40af" }]}>
              {t("importPreview", rows.length)}
            </Text>
            {errors.length > 0 && (
              <Text style={{ color: "#b45309", fontSize: 12, marginTop: 4 }}>
                {t("importErrors", errors.length)}
              </Text>
            )}
          </View>

          <FlatList
            data={rows.slice(0, 200)}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
            renderItem={({ item, index }) => {
              const existing = products.find((p) => p.barcode === item.barcode);
              return (
                <View
                  style={[
                    styles.previewRow,
                    { backgroundColor: colors.card },
                    rtl && styles.rowReverse,
                  ]}
                >
                  <View
                    style={[
                      styles.previewBadge,
                      {
                        backgroundColor: existing ? "#fef3c7" : "#dcfce7",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: existing ? "#b45309" : "#166534",
                        fontSize: 9,
                        fontWeight: "700",
                      }}
                    >
                      {existing ? "UPD" : "NEW"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.previewName,
                        { color: colors.foreground },
                        rtl && styles.rtlText,
                      ]}
                      numberOfLines={1}
                    >
                      {item.name ?? `Row ${index + 2}`}
                    </Text>
                    <Text
                      style={[
                        styles.previewSub,
                        { color: colors.mutedForeground },
                        rtl && styles.rtlText,
                      ]}
                    >
                      {item.barcode} · stock {item.stock ?? 0}
                      {item.unit ? ` · ${item.unit}` : ""}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: insets.bottom + 12,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                {
                  flex: 1,
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                setRows([]);
                setErrors([]);
                setStep("idle");
              }}
            >
              <Text
                style={[styles.secondaryBtnText, { color: colors.foreground }]}
              >
                {t("cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { flex: 1.6, backgroundColor: colors.primary },
              ]}
              onPress={handleConfirm}
            >
              <Feather name="check-circle" size={18} color="white" />
              <Text style={styles.primaryBtnText}>{t("importConfirm")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === "importing" && (
        <View style={styles.center}>
          <Feather name="upload-cloud" size={48} color={colors.primary} />
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>
            {t("importing")}
          </Text>
        </View>
      )}

      {step === "done" && result && (
        <View style={{ padding: 18, gap: 14 }}>
          <View
            style={[
              styles.doneCard,
              { backgroundColor: "#dcfce7", borderColor: "#86efac" },
            ]}
          >
            <Feather name="check-circle" size={28} color="#166534" />
            <Text style={styles.doneTitle}>{t("importDoneTitle")}</Text>
            <Text style={styles.doneMsg}>
              {t(
                "importDoneMsg",
                result.added,
                result.updated,
                result.skipped,
              )}
            </Text>
          </View>

          {result.errors.length > 0 && (
            <View
              style={[
                styles.infoCard,
                { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
              ]}
            >
              <Feather name="alert-circle" size={18} color={colors.destructive} />
              <Text style={[styles.infoText, { color: colors.destructive }]}>
                {result.errors
                  .slice(0, 5)
                  .map((e) => `Line ${e.line}: ${e.reason}`)
                  .join("\n")}
                {result.errors.length > 5
                  ? `\n+${result.errors.length - 5} more...`
                  : ""}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryBtnText}>{t("cancel")}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  rtlText: { textAlign: "right", writingDirection: "rtl" },
  rowReverse: { flexDirection: "row-reverse" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", fontFamily: "Inter_700Bold" },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  infoCard: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: { color: "white", fontWeight: "700", fontSize: 14 },

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: "700", fontSize: 14 },

  previewBanner: {
    margin: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewText: { fontWeight: "700", fontSize: 14 },

  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
    gap: 10,
  },
  previewBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 36,
    alignItems: "center",
  },
  previewName: { fontWeight: "700", fontSize: 13 },
  previewSub: { fontSize: 11, marginTop: 2 },

  bottomBar: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },

  doneCard: {
    alignItems: "center",
    padding: 22,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  doneTitle: { color: "#166534", fontSize: 18, fontWeight: "800" },
  doneMsg: { color: "#166534", fontSize: 13, textAlign: "center" },
});
