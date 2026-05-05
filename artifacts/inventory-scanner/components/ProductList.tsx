import React, { memo, useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import type { Product } from "@/lib/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProductListProps {
  products: Product[];
  lang?: "en" | "ar";
  onPress?: (product: Product) => void;
  onDelete?: (product: Product) => void;
  onEdit?: (product: Product) => void;
}

// ─── Row — memo'd so only changed rows re-render ──────────────────────────────

interface RowProps {
  product: Product;
  isRTL: boolean;
  onPress?: (p: Product) => void;
  onDelete?: (p: Product) => void;
  onEdit?: (p: Product) => void;
}

const ProductRow = memo(function ProductRow({ product, isRTL, onPress, onDelete, onEdit }: RowProps) {
  // Product type uses `stock` and `minStock` (not quantity/lowStockThreshold)
  const lowStock = product.stock <= product.minStock;

  const handlePress  = useCallback(() => onPress?.(product),  [product, onPress]);
  const handleEdit   = useCallback(() => onEdit?.(product),   [product, onEdit]);
  const handleDelete = useCallback(() => onDelete?.(product), [product, onDelete]);

  return (
    <TouchableOpacity
      style={[styles.row, isRTL && styles.rowRTL]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Name + barcode */}
      <View style={styles.rowMain}>
        <Text style={[styles.rowName, isRTL && styles.textRight]} numberOfLines={1}>
          {isRTL && product.nameAr ? product.nameAr : product.name}
        </Text>
        <Text style={[styles.rowBarcode, isRTL && styles.textRight]}>
          {product.barcode}
          {product.category ? `  ·  ${product.category}` : ""}
        </Text>
      </View>

      {/* Stock badge */}
      <View style={[styles.qtyBadge, lowStock && styles.qtyBadgeLow]}>
        <Text style={[styles.qtyText, lowStock && styles.qtyTextLow]}>
          {product.stock}
        </Text>
        <Text style={[styles.qtyUnit, lowStock && styles.qtyTextLow]}>
          {product.unit}
        </Text>
      </View>

      {/* Price + actions */}
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

export function ProductList({ products, lang = "en", onPress, onDelete, onEdit }: ProductListProps) {
  const [query, setQuery] = useState("");
  const isRTL = lang === "ar";

  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.nameAr.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
    );
  }, [products, query]);

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductRow
        product={item}
        isRTL={isRTL}
        onPress={onPress}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    ),
    [isRTL, onPress, onDelete, onEdit]
  );

  // Product has no id field — barcode is the unique key
  const keyExtractor = useCallback((item: Product) => item.barcode, []);

  return (
    <FlatList
      data={filtered}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={
        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, isRTL && styles.textRight]}
            placeholder={isRTL ? "بحث..." : "Search products..."}
            placeholderTextColor="#8e8e93"
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
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {isRTL ? "لا توجد منتجات" : "No products found"}
          </Text>
        </View>
      }
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
  countLabel: { fontSize: 12, color: "#8e8e93", minWidth: 48, textAlign: "right" },

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
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "#e5e5ea",
    minWidth: 40,
  },
  qtyBadgeLow: { backgroundColor: "#ffecd1" },
  qtyText: { fontSize: 13, fontWeight: "700", color: "#3a3a3c" },
  qtyUnit: { fontSize: 9, color: "#8e8e93" },
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
