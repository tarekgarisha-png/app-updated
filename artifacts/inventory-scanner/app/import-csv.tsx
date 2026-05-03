import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, router } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  PermissionsAndroid,
  ScrollView,
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
  readSharedCSV,
  type ImportResult,
} from "@/lib/csvImport";
import type { Product } from "@/lib/types";

type Step = "idle" | "preview" | "importing" | "done";

const IOS_STEPS = [
  { icon: "smartphone", keyEN: "shareGuideIOS1", keyAR: "shareGuideIOS1Ar" },
  { icon: "file-text",  keyEN: "shareGuideIOS2", keyAR: "shareGuideIOS2Ar" },
  { icon: "share",      keyEN: "shareGuideIOS3", keyAR: "shareGuideIOS3Ar" },
  { icon: "corner-down-right", keyEN: "shareGuideIOS4", keyAR: "shareGuideIOS4Ar" },
];
const ANDROID_STEPS = [
  { icon: "smartphone", keyEN: "shareGuideAndroid1", keyAR: "shareGuideAndroid1Ar" },
  { icon: "file-text",  keyEN: "shareGuideAndroid2", keyAR: "shareGuideAndroid2Ar" },
  { icon: "share-2",    keyEN: "shareGuideAndroid3", keyAR: "shareGuideAndroid3Ar" },
  { icon: "corner-down-right", keyEN: "shareGuideAndroid4", keyAR: "shareGuideAndroid4Ar" },
];

export default function ImportCSVScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { products, saveProduct } = useInventory();
  const params = useLocalSearchParams<{ sharedUri?: string }>();

  const [step, setStep] = useState<Step>("idle");
  const [rows, setRows] = useState<Partial<Product>[]>([]);
  const [errors, setErrors] = useState<{ line: number; reason: string }[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const parseAndPreview = (text: string) => {
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
  };

  // Auto-import when opened via share sheet / intent
  useEffect(() => {
    const uri = params.sharedUri;
    if (!uri) return;
    (async () => {
      try {
        const text = await readSharedCSV(uri);
        parseAndPreview(text);
      } catch {
        Alert.alert("", t("importFailed"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sharedUri]);

  const handlePickFile = async () => {
    try {
      if (Platform.OS === "android" && Platform.Version < 29) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert("", t("cameraDenied"));
          return;
        }
      }
      const text = await pickAndReadCSV();
      if (!text) return;
      parseAndPreview(text);
    } catch (err) {
      Alert.alert("", err instanceof Error ? err.message : t("importFailed"));
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
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    try {
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
      const path = `${dir}products_sample.csv`;
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
    } catch (err) {
      Alert.alert("", err instanceof Error ? err.message : t("importFailed"));
    }
  };

  const headerTopPadding = Platform.OS === "web" ? 24 : insets.top + 8;
  const guideSteps = Platform.OS === "ios" ? IOS_STEPS : ANDROID_STEPS;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
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
        <Text style={[styles.headerTitle, { color: colors.foreground }, rtl && styles.rtlText]}>
          {t("importTitle")}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* ── Idle: choose how to import ── */}
      {step === "idle" && (
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }} showsVerticalScrollIndicator={false}>
          {/* CSV format hint */}
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="info" size={18} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.foreground }, rtl && styles.rtlText]}>
              {t("importInstructions")}
            </Text>
          </View>

          {/* Section: From Phone Storage */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
            {t("importSectionStorage")}
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handlePickFile}
          >
            <Feather name="folder" size={18} color="white" />
            <Text style={styles.primaryBtnText}>{t("importPickFile")}</Text>
          </TouchableOpacity>

          {/* Section: From Other Apps */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
            {t("importSectionShareSheet")}
          </Text>

          {/* Share-sheet guide card */}
          <TouchableOpacity
            style={[styles.shareCard, { backgroundColor: "#f0fdf4", borderColor: "#86efac" }]}
            onPress={() => setShowGuide(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.shareCardTop, rtl && styles.rowReverse]}>
              <View style={styles.shareIconBg}>
                <Feather name="share-2" size={22} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.shareCardTitle, { color: "#15803d" }, rtl && styles.rtlText]}>
                  {t("importFromShareSheet")}
                </Text>
                <Text style={[styles.shareCardSub, { color: "#4ade80" }, rtl && styles.rtlText]}>
                  {t("importShareSheetSub")}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#16a34a" style={rtl && { transform: [{ scaleX: -1 }] }} />
            </View>

            {/* Preview of steps */}
            <View style={[styles.sharePreviewRow, rtl && styles.rowReverse]}>
              {["whatsapp", "mail", "google-drive"].map((app, i) => (
                <View key={i} style={[styles.appChip, { backgroundColor: "#dcfce7" }]}>
                  <Feather name="file-text" size={11} color="#16a34a" />
                  <Text style={styles.appChipText}>
                    {app === "whatsapp" ? "WhatsApp" : app === "mail" ? "Gmail" : "Drive"}
                  </Text>
                </View>
              ))}
              <Text style={[styles.appChipText, { color: "#86efac" }]}>→ {t("importTitle")}</Text>
            </View>
          </TouchableOpacity>

          {/* Sample download */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
            {t("importSectionSample")}
          </Text>
          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            onPress={handleSample}
          >
            <Feather name="download" size={16} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
              {t("importDownloadSample")}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.hintText, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
            {t("importPhoneFallbackHint")}
          </Text>
        </ScrollView>
      )}

      {/* ── Preview ── */}
      {step === "preview" && (
        <View style={{ flex: 1 }}>
          <View style={[styles.previewBanner, { backgroundColor: "#dbeafe", borderColor: "#93c5fd" }]}>
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
                <View style={[styles.previewRow, { backgroundColor: colors.card }, rtl && styles.rowReverse]}>
                  <View style={[styles.previewBadge, { backgroundColor: existing ? "#fef3c7" : "#dcfce7" }]}>
                    <Text style={{ color: existing ? "#b45309" : "#166534", fontSize: 9, fontWeight: "700" }}>
                      {existing ? "UPD" : "NEW"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.previewName, { color: colors.foreground }, rtl && styles.rtlText]} numberOfLines={1}>
                      {item.name ?? `Row ${index + 2}`}
                    </Text>
                    <Text style={[styles.previewSub, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
                      {item.barcode} · stock {item.stock ?? 0}{item.unit ? ` · ${item.unit}` : ""}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          <View style={[styles.bottomBar, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={() => { setRows([]); setErrors([]); setStep("idle"); }}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>{t("cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1.6, backgroundColor: colors.primary }]}
              onPress={handleConfirm}
            >
              <Feather name="check-circle" size={18} color="white" />
              <Text style={styles.primaryBtnText}>{t("importConfirm")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Importing spinner ── */}
      {step === "importing" && (
        <View style={styles.center}>
          <Feather name="upload-cloud" size={48} color={colors.primary} />
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>{t("importing")}</Text>
        </View>
      )}

      {/* ── Done ── */}
      {step === "done" && result && (
        <View style={{ padding: 18, gap: 14 }}>
          <View style={[styles.doneCard, { backgroundColor: "#dcfce7", borderColor: "#86efac" }]}>
            <Feather name="check-circle" size={28} color="#166534" />
            <Text style={styles.doneTitle}>{t("importDoneTitle")}</Text>
            <Text style={styles.doneMsg}>{t("importDoneMsg", result.added, result.updated, result.skipped)}</Text>
          </View>

          {result.errors.length > 0 && (
            <View style={[styles.infoCard, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
              <Feather name="alert-circle" size={18} color="#ef4444" />
              <Text style={[styles.infoText, { color: "#ef4444" }]}>
                {result.errors.slice(0, 5).map((e) => `Line ${e.line}: ${e.reason}`).join("\n")}
                {result.errors.length > 5 ? `\n+${result.errors.length - 5} more...` : ""}
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

      {/* ── Share-sheet Guide Modal ── */}
      <Modal visible={showGuide} transparent animationType="slide" onRequestClose={() => setShowGuide(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            {/* Title row */}
            <View style={[styles.modalHeader, rtl && styles.rowReverse]}>
              <View style={styles.modalIconBg}>
                <Feather name="share-2" size={20} color="#16a34a" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.foreground }, rtl && styles.rtlText]}>
                {t("shareGuideTitle")}
              </Text>
              <TouchableOpacity onPress={() => setShowGuide(false)} style={styles.modalClose}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Platform badge */}
            <View style={[styles.platformBadge, { backgroundColor: Platform.OS === "ios" ? "#eff6ff" : "#f0fdf4" }]}>
              <Feather name={Platform.OS === "ios" ? "aperture" : "smartphone"} size={12}
                color={Platform.OS === "ios" ? "#1d4ed8" : "#15803d"} />
              <Text style={[styles.platformBadgeText, { color: Platform.OS === "ios" ? "#1d4ed8" : "#15803d" }]}>
                {Platform.OS === "ios" ? "iPhone / iPad" : "Android"}
              </Text>
            </View>

            {/* Steps */}
            <View style={{ gap: 12, marginBottom: 16 }}>
              {guideSteps.map((s, i) => (
                <View key={i} style={[styles.stepRow, rtl && styles.rowReverse]}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <View style={[styles.stepIconBg, { backgroundColor: colors.secondary }]}>
                    <Feather name={s.icon as any} size={15} color={colors.primary} />
                  </View>
                  <Text style={[styles.stepText, { color: colors.foreground }, rtl && styles.rtlText]}>
                    {t(s.keyEN)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Info note */}
            <View style={[styles.guideNote, { backgroundColor: "#fef9c3", borderColor: "#fde68a" }]}>
              <Feather name="zap" size={14} color="#b45309" />
              <Text style={[styles.guideNoteText, { color: "#92400e" }, rtl && styles.rtlText]}>
                {t("shareGuideNote")}
              </Text>
            </View>

            {/* CTA: open file picker after guide */}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#16a34a", marginTop: 4 }]}
              onPress={() => { setShowGuide(false); setTimeout(handlePickFile, 200); }}
            >
              <Feather name="folder-plus" size={18} color="white" />
              <Text style={styles.primaryBtnText}>{t("shareGuideReady")}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowGuide(false)} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{t("cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  rtlText: { textAlign: "right", writingDirection: "rtl" },
  rowReverse: { flexDirection: "row-reverse" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: "800", fontFamily: "Inter_700Bold" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: -4 },
  infoCard: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },
  hintText: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  primaryBtnText: { color: "white", fontWeight: "700", fontSize: 14 },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  secondaryBtnText: { fontWeight: "700", fontSize: 14 },
  // Share card
  shareCard: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 10 },
  shareCardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  shareIconBg: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
  shareCardTitle: { fontSize: 15, fontWeight: "700" },
  shareCardSub: { fontSize: 12, marginTop: 2 },
  sharePreviewRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  appChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  appChipText: { fontSize: 11, fontWeight: "600", color: "#16a34a" },
  // Preview
  previewBanner: { margin: 12, padding: 12, borderRadius: 10, borderWidth: 1 },
  previewText: { fontWeight: "700", fontSize: 14 },
  previewRow: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 10, marginBottom: 6, gap: 10 },
  previewBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, minWidth: 36, alignItems: "center" },
  previewName: { fontWeight: "700", fontSize: 13 },
  previewSub: { fontSize: 11, marginTop: 2 },
  bottomBar: { flexDirection: "row", gap: 10, padding: 12, borderTopWidth: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  doneCard: { alignItems: "center", padding: 22, borderRadius: 14, borderWidth: 1, gap: 8 },
  doneTitle: { color: "#166534", fontSize: 18, fontWeight: "800" },
  doneMsg: { color: "#166534", fontSize: 13, textAlign: "center" },
  // Guide Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalIconBg: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: "800" },
  modalClose: { padding: 4 },
  platformBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  platformBadgeText: { fontSize: 12, fontWeight: "700" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center" },
  stepNumText: { color: "white", fontSize: 11, fontWeight: "800" },
  stepIconBg: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
  guideNote: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: "flex-start" },
  guideNoteText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
