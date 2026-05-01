import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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

import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useInventory, useT } from "@/contexts/InventoryContext";
import { useColors } from "@/hooks/useColors";
import { generateAutoBarcode } from "@/lib/storage";

type FormState = {
  barcode: string;
  name: string;
  nameAr: string;
  stock: string;
  minStock: string;
  unit: string;
  price: string;
};

const EMPTY: FormState = {
  barcode: "",
  name: "",
  nameAr: "",
  stock: "",
  minStock: "5",
  unit: "pcs",
  price: "",
};

export default function ProductFormScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { products, saveProduct } = useInventory();
  const params = useLocalSearchParams<{ barcode?: string; edit?: string }>();

  const editing = params.edit === "1";
  const existing = useMemo(
    () =>
      params.barcode ? products.find((p) => p.barcode === params.barcode) : null,
    [params.barcode, products],
  );

  const [form, setForm] = useState<FormState>(EMPTY);
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [noBarcode, setNoBarcode] = useState<boolean>(false);

  useEffect(() => {
    if (editing && existing) {
      const isAutoId = existing.barcode.startsWith("#");
      setNoBarcode(isAutoId);
      setForm({
        barcode: existing.barcode,
        name: existing.name,
        nameAr: existing.nameAr,
        stock: String(existing.stock),
        minStock: String(existing.minStock),
        unit: existing.unit,
        price: existing.price ? String(existing.price) : "",
      });
    } else if (params.barcode) {
      setForm({ ...EMPTY, barcode: params.barcode });
    } else {
      setForm(EMPTY);
    }
  }, [editing, existing, params.barcode]);

  const toggleNoBarcode = () => {
    if (noBarcode) {
      setNoBarcode(false);
      setForm((f) => ({ ...f, barcode: "" }));
    } else {
      setNoBarcode(true);
      setForm((f) => ({ ...f, barcode: generateAutoBarcode() }));
    }
  };

  const handleSave = async () => {
    if (!form.barcode.trim()) {
      if (noBarcode) {
        setForm((f) => ({ ...f, barcode: generateAutoBarcode() }));
      } else {
        Alert.alert("", t("barcodeRequired"));
        return;
      }
    }
    if (!form.name.trim()) {
      Alert.alert("", t("nameRequired"));
      return;
    }
    try {
      await saveProduct({
        barcode: form.barcode.trim(),
        name: form.name.trim(),
        nameAr: form.nameAr.trim(),
        stock: parseInt(form.stock, 10) || 0,
        minStock: parseInt(form.minStock, 10) || 5,
        unit: form.unit.trim() || "pcs",
        price: parseFloat(form.price) || 0,
      });
      router.back();
    } catch {
      Alert.alert("Error", t("dbError"));
    }
  };

  const styles = useStyles();
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
          {editing ? t("editProduct") : t("addProduct")}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{
          padding: 18,
          paddingBottom: insets.bottom + 30,
        }}
        bottomOffset={20}
      >
        {/* Barcode field */}
        <View style={{ marginBottom: 14 }}>
          <View
            style={[
              styles.labelRow,
              rtl && styles.rowReverse,
            ]}
          >
            <Text
              style={[
                styles.fieldLabel,
                { color: colors.mutedForeground },
                rtl && styles.rtlText,
              ]}
            >
              {t("barcode")}
            </Text>
            {!editing && (
              <TouchableOpacity
                onPress={toggleNoBarcode}
                style={[
                  styles.noBarcodeBtn,
                  {
                    backgroundColor: noBarcode
                      ? colors.warning + "22"
                      : colors.secondary,
                    borderColor: noBarcode ? colors.warning : colors.border,
                  },
                ]}
              >
                <Feather
                  name={noBarcode ? "check-square" : "square"}
                  size={13}
                  color={noBarcode ? colors.warning : colors.mutedForeground}
                />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: noBarcode ? colors.warning : colors.mutedForeground,
                  }}
                >
                  {t("noBarcode")}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {noBarcode ? (
            <View
              style={[
                styles.autoBarcodeBox,
                { backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
            >
              <Feather name="hash" size={16} color={colors.mutedForeground} />
              <Text
                style={{ flex: 1, color: colors.mutedForeground, fontSize: 13 }}
                numberOfLines={1}
              >
                {form.barcode || "..."}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setForm((f) => ({ ...f, barcode: generateAutoBarcode() }))
                }
                style={[
                  styles.regenBtn,
                  { backgroundColor: colors.primary + "22" },
                ]}
              >
                <Feather name="refresh-cw" size={13} color={colors.primary} />
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "700" }}>
                  {t("generateId")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.barcodeRow, rtl && styles.rowReverse]}>
              <TextInput
                style={[
                  styles.barcodeInput,
                  {
                    borderColor: colors.border,
                    backgroundColor: editing ? colors.secondary : colors.card,
                    color:
                      editing ? colors.mutedForeground : colors.foreground,
                    textAlign: rtl ? "right" : "left",
                  },
                ]}
                value={form.barcode}
                onChangeText={(v) => setForm((f) => ({ ...f, barcode: v }))}
                placeholder="123456789"
                placeholderTextColor={colors.mutedForeground}
                editable={!editing}
              />
              {!editing && (
                <TouchableOpacity
                  style={[styles.scanBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setScannerOpen(true)}
                  activeOpacity={0.8}
                >
                  <Feather name="maximize" size={18} color="white" />
                  <Text style={styles.scanBtnText}>{t("scanBarcode")}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {noBarcode && (
            <Text
              style={{
                fontSize: 10,
                color: colors.mutedForeground,
                marginTop: 5,
              }}
            >
              {t("autoIdHint")}
            </Text>
          )}
        </View>

        <Field
          label={`${t("productName")} (EN)`}
          rtl={rtl}
          value={form.name}
          onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder="Product name"
          colors={colors}
        />

        <Field
          label={t("productNameAr")}
          rtl={true}
          value={form.nameAr}
          onChangeText={(v) => setForm((f) => ({ ...f, nameAr: v }))}
          placeholder="اسم المنتج بالعربي"
          colors={colors}
        />

        <View style={styles.grid2}>
          <View style={styles.half}>
            <Field
              label={t("currentStock")}
              rtl={rtl}
              value={form.stock}
              onChangeText={(v) => setForm((f) => ({ ...f, stock: v }))}
              placeholder="0"
              keyboardType="numeric"
              colors={colors}
            />
          </View>
          <View style={styles.half}>
            <Field
              label={t("minStock")}
              rtl={rtl}
              value={form.minStock}
              onChangeText={(v) => setForm((f) => ({ ...f, minStock: v }))}
              placeholder="5"
              keyboardType="numeric"
              colors={colors}
            />
          </View>
        </View>

        <View style={styles.grid2}>
          <View style={styles.half}>
            <Field
              label={t("unit")}
              rtl={rtl}
              value={form.unit}
              onChangeText={(v) => setForm((f) => ({ ...f, unit: v }))}
              placeholder="pcs / kg"
              colors={colors}
            />
          </View>
          <View style={styles.half}>
            <Field
              label={t("price")}
              rtl={rtl}
              value={form.price}
              onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
              placeholder="0.00"
              keyboardType="numeric"
              colors={colors}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          onPress={handleSave}
        >
          <Feather name="check-circle" size={20} color="white" />
          <Text style={styles.saveBtnText}>
            {editing ? t("updateProduct") : t("saveProduct")}
          </Text>
        </TouchableOpacity>
      </KeyboardAwareScrollViewCompat>

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(code) => {
          setForm((f) => ({ ...f, barcode: code }));
          setNoBarcode(false);
        }}
      />
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  rtl,
  keyboardType,
  editable = true,
  dim = false,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  rtl: boolean;
  keyboardType?: "default" | "numeric";
  editable?: boolean;
  dim?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={[
          {
            fontSize: 12,
            fontWeight: "600",
            color: colors.mutedForeground,
            marginBottom: 6,
            textTransform: "uppercase" as const,
            letterSpacing: 0.4,
          },
          rtl && { textAlign: "right" as const, writingDirection: "rtl" as const },
        ]}
      >
        {label}
      </Text>
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: dim ? colors.secondary : colors.card,
          color: dim ? colors.mutedForeground : colors.foreground,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 10,
          fontSize: 15,
          textAlign: rtl ? "right" : "left",
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType ?? "default"}
        editable={editable}
      />
    </View>
  );
}

function useStyles() {
  return StyleSheet.create({
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

    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    noBarcodeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
    },

    autoBarcodeBox: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 8,
    },
    regenBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },

    grid2: { flexDirection: "row", gap: 12 },
    half: { flex: 1 },

    saveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 14,
      borderRadius: 12,
      marginTop: 8,
    },
    saveBtnText: { color: "white", fontWeight: "700", fontSize: 15 },

    barcodeRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
    barcodeInput: {
      flex: 1,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 10,
      fontSize: 15,
    },
    scanBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: 10,
    },
    scanBtnText: { color: "white", fontWeight: "700", fontSize: 12 },
  });
}
