import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useInventory, useT } from "@/contexts/InventoryContext";
import { useColors } from "@/hooks/useColors";
import { parseProductsCSV } from "@/lib/csvImport";
import type { Product } from "@/lib/types";

type RowState = Partial<Product> & { key: string };

export default function BulkAddScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { products, saveProduct } = useInventory();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<RowState[]>([]);

  const existing = useMemo(() => new Set(products.map((p) => p.barcode)), [products]);

  const parseInput = () => {
    const parsed = parseProductsCSV(text);
    if (parsed.headerMissing) {
      Alert.alert("", t("importHeaderError"));
      return;
    }
    if (parsed.rows.length === 0) {
      Alert.alert("", t("importNoRows"));
      return;
    }
    setRows(parsed.rows.map((row, i) => ({ ...row, key: `${row.barcode ?? i}-${i}` })));
  };

  const handleSave = async () => {
    setSaving(true);
    let added = 0;
    let updated = 0;
    let skipped = 0;
    try {
      for (const row of rows) {
        if (!row.barcode || !row.name) {
          skipped++;
          continue;
        }
        const merged: Product = {
          barcode: row.barcode,
          name: row.name,
          nameAr: row.nameAr ?? "",
          stock: row.stock ?? 0,
          minStock: row.minStock ?? 5,
          unit: row.unit ?? "pcs",
          price: row.price ?? 0,
        };
        await saveProduct(merged);
        if (existing.has(row.barcode)) updated++;
        else added++;
      }
      Alert.alert("", t("importDoneMsg", added, updated, skipped));
      router.back();
    } catch {
      Alert.alert("", t("importFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderColor: colors.border }, rtl && styles.rowReverse]}>
        <Text style={[styles.title, { color: colors.foreground }, rtl && styles.rtlText]}>{t("bulkAddProducts")}</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: colors.secondary }]}>
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>
      <KeyboardAwareScrollViewCompat contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <Text style={[styles.label, { color: colors.mutedForeground }, rtl && styles.rtlText]}>{t("bulkAddHint")}</Text>
        <TextInput
          multiline
          value={text}
          onChangeText={setText}
          placeholder={t("bulkAddPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }, rtl && styles.rtlText]}
        />
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={parseInput}>
          <Text style={styles.btnText}>{t("preview")}</Text>
        </TouchableOpacity>
        {rows.length > 0 && (
          <View style={{ marginTop: 16, gap: 8 }}>
            {rows.slice(0, 20).map((row) => (
              <View key={row.key} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }, rtl && styles.rowReverse]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontWeight: "700" }}>{row.name}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{row.barcode} · {existing.has(String(row.barcode)) ? t("updated") : t("added")}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity disabled={saving} style={[styles.btn, { backgroundColor: colors.success }]} onPress={handleSave}>
              <Text style={styles.btnText}>{saving ? t("importing") : t("importConfirm")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  rtlText: { textAlign: "right", writingDirection: "rtl" },
  rowReverse: { flexDirection: "row-reverse" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: "800" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  label: { marginBottom: 10, fontSize: 13 },
  input: { minHeight: 180, borderWidth: 1, borderRadius: 12, padding: 14, textAlignVertical: "top" },
  btn: { marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  btnText: { color: "white", fontWeight: "800" },
  row: { borderWidth: 1, borderRadius: 12, padding: 12 },
});