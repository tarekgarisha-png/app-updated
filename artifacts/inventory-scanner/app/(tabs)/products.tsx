import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInventory, useT } from "@/contexts/InventoryContext";
import { useColors } from "@/hooks/useColors";
import type { Product } from "@/lib/types";

export default function ProductsScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { products, deleteProduct } = useInventory();
  const params = useLocalSearchParams<{ lowOnly?: string }>();

  const [search, setSearch] = useState<string>("");
  const [showLow, setShowLow] = useState<boolean>(false);

  useEffect(() => {
    if (params.lowOnly === "1") {
      setShowLow(true);
    }
  }, [params.lowOnly]);

  const filtered = useMemo(() => {
    let list = showLow
      ? products.filter((p) => p.stock <= p.minStock)
      : products;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.nameAr && p.nameAr.includes(q)) ||
          p.barcode.includes(q),
      );
    }
    return list;
  }, [products, search, showLow]);

  const dotColor = (p: Product): string => {
    if (p.stock === 0) return colors.destructive;
    if (p.stock <= p.minStock) return colors.warning;
    return colors.success;
  };

  const handleDelete = (p: Product) => {
    Alert.alert(t("deleteProduct"), t("deleteProductMsg", p.name), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteProduct(p.barcode);
          } catch {
            // ignore
          }
        },
      },
    ]);
  };

  const headerTopPadding = Platform.OS === "web" ? 67 : insets.top + 8;
  const styles = useStyles();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
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
          {t("productTitle")}
        </Text>
        <Text
          style={[
            styles.headerCount,
            { color: colors.mutedForeground },
            rtl && styles.rtlText,
          ]}
        >
          {products.length}
        </Text>
      </View>

      {/* Search + filter + add */}
      <View style={[styles.topRow, rtl && styles.rowReverse]}>
        <View
          style={[
            styles.searchWrap,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[
              styles.searchInput,
              { color: colors.foreground },
              rtl && styles.rtlInput,
            ]}
            placeholder={t("searchProducts")}
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={colors.mutedForeground}
            textAlign={rtl ? "right" : "left"}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather
                name="x-circle"
                size={16}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.iconBtn,
            {
              backgroundColor: showLow ? colors.warning : colors.card,
              borderColor: colors.border,
            },
          ]}
          onPress={() => setShowLow((v) => !v)}
        >
          <Feather
            name="alert-triangle"
            size={18}
            color={showLow ? "white" : colors.warning}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.iconBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={() => router.push("/import-csv")}
        >
          <Feather name="upload" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/product-form")}
        >
          <Feather name="plus" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {showLow && (
        <View
          style={[
            styles.filterBanner,
            { backgroundColor: "#fef3c7" },
            rtl && styles.rowReverse,
          ]}
        >
          <Feather name="alert-triangle" size={14} color="#b45309" />
          <Text style={[styles.filterText, rtl && styles.rtlText]}>
            {t("lowOnly")}
          </Text>
          <TouchableOpacity onPress={() => setShowLow(false)}>
            <Text style={[styles.filterClear, { color: colors.primary }]}>
              {t("showAll")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="package" size={48} color={colors.border} />
          <Text
            style={[
              styles.emptyText,
              { color: colors.mutedForeground },
              rtl && styles.rtlText,
            ]}
          >
            {showLow ? t("noLowStock") : t("noProducts")}
          </Text>
          {!showLow && (
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/product-form")}
            >
              <Text style={styles.emptyBtnText}>{t("addFirst")}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.barcode}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 90,
          }}
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card },
                rtl && styles.rowReverse,
              ]}
            >
              <View style={styles.dotWrap}>
                <View
                  style={[styles.dot, { backgroundColor: dotColor(item) }]}
                />
              </View>
              <View style={styles.cardInfo}>
                <Text
                  style={[
                    styles.cardName,
                    { color: colors.foreground },
                    rtl && styles.rtlText,
                  ]}
                  numberOfLines={1}
                >
                  {rtl && item.nameAr ? item.nameAr : item.name}
                </Text>
                {rtl && item.nameAr ? (
                  <Text
                    style={[
                      styles.cardNameSub,
                      { color: colors.mutedForeground },
                    ]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.cardSub,
                    { color: colors.mutedForeground },
                    rtl && styles.rtlText,
                  ]}
                >
                  {item.barcode} · {item.unit}
                  {item.price > 0 ? ` · ${item.price.toFixed(2)}` : ""}
                </Text>
              </View>
              <View style={styles.stockBox}>
                <Text style={[styles.stockNum, { color: dotColor(item) }]}>
                  {item.stock}
                </Text>
                <Text
                  style={[styles.stockMin, { color: colors.mutedForeground }]}
                >
                  {t("minLabel", item.minStock)}
                </Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/product-form",
                      params: { barcode: item.barcode, edit: "1" },
                    })
                  }
                  style={[
                    styles.editBtn,
                    { backgroundColor: colors.secondary },
                  ]}
                >
                  <Feather name="edit-2" size={15} color={colors.foreground} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  style={[
                    styles.delBtn,
                    { backgroundColor: "#fee2e2" },
                  ]}
                >
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function useStyles() {
  return StyleSheet.create({
    container: { flex: 1 },
    rtlText: { textAlign: "right", writingDirection: "rtl" },
    rtlInput: { textAlign: "right" },
    rowReverse: { flexDirection: "row-reverse" },

    header: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
    },
    headerTitle: { fontSize: 24, fontWeight: "800", fontFamily: "Inter_700Bold" },
    headerCount: { fontSize: 14, fontWeight: "600", paddingBottom: 4 },

    topRow: {
      flexDirection: "row",
      padding: 12,
      gap: 8,
      alignItems: "center",
    },
    searchWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
    },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    addBtn: {
      width: 42,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },

    filterBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    filterText: { color: "#b45309", flex: 1, fontSize: 12, fontWeight: "600" },
    filterClear: { fontSize: 12, fontWeight: "700" },

    empty: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 24,
    },
    emptyText: { fontSize: 15, textAlign: "center" },
    emptyBtn: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 10,
      marginTop: 8,
    },
    emptyBtnText: { color: "white", fontWeight: "700" },

    card: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      borderRadius: 12,
      marginBottom: 8,
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 3,
      elevation: 1,
    },
    dotWrap: { width: 10, alignItems: "center" },
    dot: { width: 10, height: 10, borderRadius: 5 },
    cardInfo: { flex: 1 },
    cardName: { fontSize: 14, fontWeight: "700" },
    cardNameSub: { fontSize: 11, marginTop: 1 },
    cardSub: { fontSize: 11, marginTop: 2 },
    stockBox: { alignItems: "center", minWidth: 50 },
    stockNum: { fontSize: 20, fontWeight: "800" },
    stockMin: { fontSize: 9 },
    actions: { flexDirection: "row", gap: 6 },
    editBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    delBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
