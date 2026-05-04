/**
 * ProductList.tsx — High-performance product list
 *
 * Replaces a plain ScrollView/map with FlashList (or FlatList fallback).
 * FlashList recycles cells and only renders what's visible, so adding
 * hundreds of products no longer degrades the UI.
 *
 * Usage:
 *   <ProductList products={products} onPress={handlePress} onDelete={handleDelete} />
 *
 * Install FlashList if not already present:
 *   pnpm --filter inventory-scanner add @shopify/flash-list
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";

// Try FlashList first, fall back to FlatList (both have the same API surface we use)
let List: React.ComponentType<any>;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  List = require("@shopify/flash-list").FlashList;
} catch {
  List = require("react-native").FlatList;
}

import type { Product } from "./InventoryContext";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProductListProps {
  products: Product[];
  lang?: "en" | "ar";
  onPress?: (product: Product) => void;
  onDelete?: (product: Product) => void;
  onEdit?: (product: Product) => void;
}

// ─── Row component — memo'd so only changed rows re-render ────────────────────

interface ProductRowProps {
  product: Product;
  lang: "en" | "ar";
  onPress?: (p: Product) => void;
  onDelete?: (p: Product) => void;
  onEdit?: (p: Product) => void;
}

const ProductRow = memo(function ProductRow({
  product,
  lang,
  onPress,
  onDelete,
  onEdit,
}: ProductRowProps) {
  const isRTL = lang === "ar";
  const lowStock = product.quantity <= product.lowStockThreshold;

  const handlePress = useCallback(() => onPress?.(product), [product, onPress]);
  const handleEdit = useCallback(() => onEdit?.(product), [product, onEdit]);
  const handleDelete = useCallback(() => onDelete?.(product), [product, onDelete]);

  return (
    <TouchableOpacity
      style={[styles.row, isRTL && styles.rowRTL]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Left: name + barcode */}
      <View style={styles.rowMain}>
        <Text
          style={[styles.rowName, isRTL && styles.textRight]}
          numberOfLines={1}
        >
          {product.name}
        </Text>
        <Text style={[styles.rowBarcode, isRTL && styles.textRight]}>
          {product.barcode}
        </Text>
      </View>

      {/* Center: quantity pill */}
      <View style={[styles.qtyBadge, lowStock && styles.qtyBadgeLow]}>
        <Text style={[styles.qtyText, lowStock && styles.qtyTextLow]}>
          {product.quantity}
        </Text>
      </View>

      {/* Right: price + actions */}
      <View style={styles.rowRight}>
        <Text style={styles.rowPrice}>{product.price.toFixed(2)}</Text>
        <View style={styles.rowActions}>
          {onEdit && (
            <TouchableOpacity onPress={handleEdit} style={styles.actionBtn} hitSlop={8}>
              <Text style={styles.actionEdit}>✏️</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity onPress={handleDelete} style={styles.actionBtn} hitSlop={8}>
              <Text style={styles.actionDelete}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export function ProductList({
  products,
  lang = "en",
  onPress,
  onDelete,
  onEdit,
}: ProductListProps) {
  const [query, setQuery] = useState("");

  // Filter only when query changes — memoized
  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q)
    );
  }, [products, query]);

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductRow
        product={item}
        lang={lang}
        onPress={onPress}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    ),
    [lang, onPress, onDelete, onEdit]
  );

  const keyExtractor = useCallback((item: Product) => item.id, []);

  const ListHeader = useMemo(
    () => (
      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, lang === "ar" && styles.textRight]}
          placeholder={lang === "ar" ? "بحث..." : "Search products..."}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Text style={styles.countLabel}>
          {filtered.length} / {products.length}
        </Text>
      </View>
    ),
    [query, filtered.length, products.length, lang]
  );

  const ListEmpty = useMemo(
    () => (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {lang === "ar" ? "لا توجد منتجات" : "No products found"}
        </Text>
      </View>
    ),
    [lang]
  );

  return (
    <List
      data={filtered}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      estimatedItemSize={72} // FlashList hint; ignored by FlatList
      removeClippedSubviews={Platform.OS === "android"}
      maxToRenderPerBatch={20}
      windowSize={10}
      initialNumToRender={15}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.listContent}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  listContent: { paddingBottom: 80 },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f2f2f7",
    paddingHorizontal: 12,
    fontSize: 15,
  },
  countLabel: {
    fontSize: 12,
    color: "#8e8e93",
    minWidth: 48,
    textAlign: "right",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5ea",
    backgroundColor: "#fff",
    gap: 10,
  },
  rowRTL: { flexDirection: "row-reverse" },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: "600", color: "#1c1c1e", marginBottom: 2 },
  rowBarcode: { fontSize: 12, color: "#8e8e93" },
  textRight: { textAlign: "right" },

  qtyBadge: {
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "#e5e5ea",
    alignItems: "center",
  },
  qtyBadgeLow: { backgroundColor: "#ffecd1" },
  qtyText: { fontSize: 13, fontWeight: "700", color: "#3a3a3c" },
  qtyTextLow: { color: "#c84b00" },

  rowRight: { alignItems: "flex-end", gap: 4 },
  rowPrice: { fontSize: 14, fontWeight: "700", color: "#1c1c1e" },
  rowActions: { flexDirection: "row", gap: 4 },
  actionBtn: { padding: 4 },
  actionEdit: { fontSize: 15 },
  actionDelete: { fontSize: 15 },

  empty: { alignItems: "center", marginTop: 60, opacity: 0.5 },
  emptyText: { fontSize: 16, color: "#8e8e93" },
});
