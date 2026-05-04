/**
 * app/import-csv.tsx — Fixed CSV import screen
 *
 * Fixes:
 * 1. Uses expo-document-picker (not expo-file-system directly) so the OS
 *    file picker opens correctly on both iOS and Android.
 * 2. Passes the picked URI straight to the context's importProductsCSV /
 *    importHistoryCSV which handles reading and merging.
 * 3. Shows a proper result summary with error list.
 * 4. Handles Android's content:// URIs by copying to cache first.
 *
 * Required package (add if missing):
 *   pnpm --filter inventory-scanner add expo-document-picker
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import { useInventory } from "../contexts/InventoryContext";

type Mode = "products" | "history";

interface ImportResult {
  imported: number;
  errors: string[];
}

export default function ImportCSVScreen() {
  const router = useRouter();
  const { importProductsCSV, importHistoryCSV } = useInventory();

  const [mode, setMode] = useState<Mode>("products");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const pickAndImport = useCallback(async () => {
    try {
      // Open OS file picker — CSV only
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"],
        copyToCacheDirectory: true, // ensures we get a readable file:// URI
      });

      if (picked.canceled || !picked.assets?.length) return;

      const asset = picked.assets[0];
      let uri = asset.uri;

      // On Android the URI may be a content:// URI even with copyToCacheDirectory.
      // Copy it to our cache to guarantee file:// access.
      if (Platform.OS === "android" && uri.startsWith("content://")) {
        const dest =
          FileSystem.cacheDirectory + `import_${Date.now()}.csv`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        uri = dest;
      }

      setLoading(true);
      setResult(null);

      const res =
        mode === "products"
          ? await importProductsCSV(uri)
          : await importHistoryCSV(uri);

      setResult(res);

      if (res.errors.length === 0) {
        Alert.alert(
          "Import complete",
          `${res.imported} ${mode} imported successfully.`,
          [{ text: "OK", onPress: () => router.back() }]
        );
      }
    } catch (e: unknown) {
      Alert.alert("Import failed", String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [mode, importProductsCSV, importHistoryCSV, router]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Import CSV</Text>

      {/* Mode selector */}
      <View style={styles.segmentRow}>
        {(["products", "history"] as Mode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.segment, mode === m && styles.segmentActive]}
            onPress={() => { setMode(m); setResult(null); }}
          >
            <Text style={[styles.segmentLabel, mode === m && styles.segmentLabelActive]}>
              {m === "products" ? "Products" : "History"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Format hint */}
      <View style={styles.hintBox}>
        <Text style={styles.hintTitle}>
          Expected columns ({mode === "products" ? "products" : "history"}):
        </Text>
        {mode === "products" ? (
          <Text style={styles.hintText}>
            name, barcode, price, purchasePrice, quantity, lowStockThreshold{"\n"}
            (column names are case-insensitive; extra columns are ignored)
          </Text>
        ) : (
          <Text style={styles.hintText}>
            id, timestamp, shiftId, personName, total, paid, returned, items_json{"\n"}
            (use the exported CSV as a template)
          </Text>
        )}
      </View>

      {/* Pick button */}
      <TouchableOpacity
        style={[styles.pickBtn, loading && styles.pickBtnDisabled]}
        onPress={pickAndImport}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.pickBtnLabel}>📂  Choose CSV file…</Text>
        )}
      </TouchableOpacity>

      {/* Result */}
      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>
            ✅ {result.imported} rows imported
          </Text>
          {result.errors.length > 0 && (
            <>
              <Text style={styles.resultErrorHeader}>
                ⚠️ {result.errors.length} rows skipped:
              </Text>
              {result.errors.map((err, i) => (
                <Text key={i} style={styles.resultError}>
                  • {err}
                </Text>
              ))}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f2f2f7" },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#1c1c1e", marginBottom: 4 },

  segmentRow: {
    flexDirection: "row",
    backgroundColor: "#e5e5ea",
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  segmentActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  segmentLabel: { fontSize: 14, fontWeight: "500", color: "#8e8e93" },
  segmentLabelActive: { color: "#1c1c1e", fontWeight: "700" },

  hintBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  hintTitle: { fontSize: 13, fontWeight: "700", color: "#3a3a3c" },
  hintText: { fontSize: 12, color: "#8e8e93", lineHeight: 18 },

  pickBtn: {
    backgroundColor: "#007aff",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  pickBtnDisabled: { opacity: 0.6 },
  pickBtnLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },

  resultBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  resultTitle: { fontSize: 15, fontWeight: "700", color: "#1c1c1e" },
  resultErrorHeader: { fontSize: 13, fontWeight: "600", color: "#c84b00", marginTop: 4 },
  resultError: { fontSize: 12, color: "#c84b00", lineHeight: 18 },
});
