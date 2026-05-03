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
    const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
    const path = `${dir}${filename}`;
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
          {t("settings")}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 32 }}
      >
        {/* Language */}
        <Text
          style={[
            styles.sectionLabel,
            { color: colors.mutedForeground },
            rtl && styles.rtlText,
          ]}
        >
          {t("language")}
        </Text>

        <View
          style={[
            styles.group,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <LangOption
            label="English"
            active={lang === "en"}
            onPress={() => setLang("en")}
            colors={colors}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <LangOption
            label="العربية"
            active={lang === "ar"}
            onPress={() => setLang("ar")}
            colors={colors}
          />
        </View>

        <View style={{ height: 24 }} />

        {/* Data Management */}
        <Text
          style={[
            styles.sectionLabel,
            { color: colors.mutedForeground },
            rtl && styles.rtlText,
          ]}
        >
          {t("dataManagement")}
        </Text>

        <View
          style={[
            styles.group,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Import */}
          <ActionRow
            icon="upload"
            iconColor={colors.primary}
            iconBg="#eff6ff"
            label={t("importProducts")}
            desc={t("importInstructions").split(".")[0]}
            rtl={rtl}
            colors={colors}
            onPress={() => router.push("/import-csv" as any)}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Export Products */}
          <ActionRow
            icon="package"
            iconColor={colors.success}
            iconBg="#dcfce7"
            label={t("exportProducts")}
            desc={t("exportProductsDesc", products.length)}
            rtl={rtl}
            colors={colors}
            loading={exporting === "products"}
            onPress={() => handleExport("products")}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Export History */}
          <ActionRow
            icon="clock"
            iconColor="#8b5cf6"
            iconBg="#f3e8ff"
            label={t("exportHistory")}
            desc={t("exportHistoryDesc", history.length)}
            rtl={rtl}
            colors={colors}
            loading={exporting === "history"}
            onPress={() => handleExport("history")}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Export Debts */}
          <ActionRow
            icon="user"
            iconColor={colors.warning}
            iconBg="#fef3c7"
            label={t("exportDebts")}
            desc={t("exportDebtsDesc", debtCount)}
            rtl={rtl}
            colors={colors}
            loading={exporting === "debts"}
            onPress={() => handleExport("debts")}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Export All */}
          <ActionRow
            icon="archive"
            iconColor={colors.foreground}
            iconBg={colors.secondary}
            label={t("exportAll")}
            desc={`${t("exportProductsDesc", products.length)}, ${t("exportHistoryDesc", history.length)}, ${t("exportDebtsDesc", debtCount)}`}
            rtl={rtl}
            colors={colors}
            loading={exporting === "all"}
            bold
            onPress={() => handleExport("all")}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function ActionRow({
  icon,
  iconColor,
  iconBg,
  label,
  desc,
  rtl,
  colors,
  onPress,
  loading,
  bold,
}: {
  icon: string;
  iconColor: string;
  iconBg: string;
  label: string;
  desc: string;
  rtl: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  loading?: boolean;
  bold?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!!loading}
      style={[
        styles.actionRow,
        rtl && styles.rowReverse,
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.actionLabel,
            { color: colors.foreground, fontWeight: bold ? "800" : "600" },
            rtl && styles.rtlText,
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.actionDesc,
            { color: colors.mutedForeground },
            rtl && styles.rtlText,
          ]}
          numberOfLines={1}
        >
          {desc}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <Feather
          name={rtl ? "chevron-left" : "chevron-right"}
          size={16}
          color={colors.mutedForeground}
        />
      )}
    </TouchableOpacity>
  );
}

function LangOption({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
      }}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          color: colors.foreground,
        }}
      >
        {label}
      </Text>
      {active && (
        <Feather name="check" size={20} color={colors.primary} />
      )}
    </TouchableOpacity>
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

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  group: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },

  divider: {
    height: 1,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 14,
    marginBottom: 1,
  },
  actionDesc: {
    fontSize: 11,
  },
});
