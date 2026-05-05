import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
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
  pickAndReadCSV,
  parseProductsCSV,
  buildSampleCSV,
} from "@/lib/csvImport";
import type { Product } from "@/lib/types";

type Tab = "products";

export default function ImportCSVScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { products, saveProduct } = useInventory();

  const [tab] = useState<Tab>("products");
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Partial<Product>[]>([]);
  const [errors, setErrors] = useState<{ line: number; reason: string }[]>([]);
  const [done, setDone] = useState<{ added: number; updated: number } | null>(null);

  const existing = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) map.set(p.barcode, p);
    return map;
  }, [products]);

  const handlePick = async () => {
    try {
      setPreviewing(true);
      setRows([]);
      setErrors([]);
      setDone(null);

      const text = await pickAndReadCSV();
      if (!text) { setPreviewing(false); return; }

      const parsed = parseProductsCSV(text);

      if (parsed.headerMissing) {
        Alert.alert(
          t("importHeaderError"),
          `Expected columns: Barcode, Name, Arabic Name, Stock, Min Stock, Unit, Price\n\nExample:\n${buildSampleCSV()}`
        );
        setPreviewing(false);
        return;
      }

      if (parsed.rows.length === 0 && parsed.errors.length === 0) {
        Alert.alert("", t("importNoRows"));
        setPreviewing(false);
        return;
      }

      setRows(parsed.rows);
      setErrors(parsed.errors);
    } catch (e) {
      Alert.alert(t("exportFailed"), e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    let added = 0;
    let updated = 0;
    try {
      const now = new Date().toISOString();
      const toSave: Product[] = rows
        .filter((r) => r.barcode && r.name)
        .map((r) => {
          const old = existing.get(r.barcode!);
          return {
            barcode:  r.barcode!,
            name:     r.name!,
            nameAr:   r.nameAr   ?? old?.nameAr   ?? "",
            category: r.category ?? old?.category ?? "",
            stock:    r.stock    ?? old?.stock    ?? 0,
            minStock: r.minStock ?? old?.minStock ?? 5,
            unit:     r.unit     ?? old?.unit     ?? "pcs",
            price:    r.price    ?? old?.price    ?? 0,
            updatedAt: now,
          };
        });

      await Promise.all(toSave.map((p) => saveProduct(p)));

      for (const p of toSave) {
        if (existing.has(p.barcode)) updated++;
        else added++;
      }

      setDone({ added, updated });
      setRows([]);
      setErrors([]);
    } catch (e) {
      Alert.alert("", t("importFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.card, borderColor: colors.border },
          rtl && styles.rowReverse,
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }, rtl && styles.rtlText]}>
          {t("importCSV")}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 32 }}>

        {/* Hint box */}
        <View style={[styles.hintBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.hintTitle, { color: colors.foreground }, rtl && styles.rtlText]}>
            {t("bulkAddHint")}
          </Text>
          <Text style={[styles.hintText, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
            {"Barcode, Name, Arabic Name, Stock, Min Stock, Unit, Price"}
          </Text>
        </View>

        <View style={{ height: 16 }} />

        {/* Pick file button */}
        <TouchableOpacity
          style={[styles.pickBtn, { backgroundColor: colors.primary }, (previewing || saving) && styles.disabled]}
          onPress={handlePick}
          disabled={previewing || saving}
        >
          <Feather name="upload" size={18} color="#fff" />
          <Text style={styles.pickBtnLabel}>
            {previewing ? t("importing") : t("chooseFile") || "Choose CSV file…"}
          </Text>
        </TouchableOpacity>

        {/* Success message */}
        {done && (
          <View style={[styles.resultBox, { backgroundColor: "#f0fdf4", borderColor: "#86efac" }]}>
            <Feather name="check-circle" size={20} color="#16a34a" />
            <Text style={[styles.resultText, { color: "#16a34a" }]}>
              {t("importDoneMsg", done.added, done.updated, 0)}
            </Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.doneBtn}>
              <Text style={[styles.doneBtnText, { color: colors.primary }]}>{t("done") || "Done"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Parse errors */}
        {errors.length > 0 && (
          <View style={[styles.resultBox, { backgroundColor: "#fef3c7", borderColor: "#fbbf24", marginTop: 12 }]}>
            <Text style={{ fontWeight: "700", color: "#92400e", marginBottom: 6 }}>
              ⚠️ {errors.length} rows skipped
            </Text>
            {errors.slice(0, 10).map((e, i) => (
              <Text key={i} style={{ color: "#92400e", fontSize: 12 }}>
                Line {e.line}: {e.reason}
              </Text>
            ))}
            {errors.length > 10 && (
              <Text style={{ color: "#92400e", fontSize: 12 }}>
                ...and {errors.length - 10} more
              </Text>
            )}
          </View>
        )}

        {/* Preview rows */}
        {rows.length > 0 && (
          <View style={{ marginTop: 16, gap: 8 }}>
            <Text style={[styles.previewHeader, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
              {rows.length} rows ready to import
            </Text>
            {rows.slice(0, 15).map((row, i) => (
              <View
                key={`${row.barcode}-${i}`}
                style={[styles.previewRow, { backgroundColor: colors.card, borderColor: colors.border }, rtl && styles.rowReverse]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontWeight: "600" }} numberOfLines={1}>
                    {row.name}
                    {row.nameAr ? `  /  ${row.nameAr}` : ""}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    {row.barcode}
                    {row.category ? `  ·  ${row.category}` : ""}
                    {"  ·  "}
                    {existing.has(String(row.barcode)) ? "✏️ update" : "➕ new"}
                  </Text>
                </View>
                <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 13 }}>
                  {(row.price ?? 0).toFixed(2)}
                </Text>
              </View>
            ))}
            {rows.length > 15 && (
              <Text style={{ color: colors.mutedForeground, textAlign: "center", fontSize: 12 }}>
                ...and {rows.length - 15} more
              </Text>
            )}

            {/* Confirm save button */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.success ?? "#16a34a" }, saving && styles.disabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.saveBtnLabel}>
                {saving ? t("importing") : t("importConfirm")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "800" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  hintBox: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  hintTitle: { fontSize: 13, fontWeight: "700" },
  hintText: { fontSize: 12, lineHeight: 18 },

  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: 12,
  },
  pickBtnLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.6 },

  resultBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    marginTop: 16,
  },
  resultText: { fontSize: 15, fontWeight: "700" },
  doneBtn: { marginTop: 4 },
  doneBtnText: { fontWeight: "700", fontSize: 14 },

  previewHeader: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  previewRow: { borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  saveBtnLabel: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
