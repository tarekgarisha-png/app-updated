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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInventory, useT } from "@/contexts/InventoryContext";
import { type ShiftId, useShift } from "@/contexts/ShiftContext";
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
  const { setLang, products, history, partialPayments, syncUrl, syncStatus, lastSynced, syncNow, setSyncUrl } =
    useInventory();
  const { currentShift, lock, setPin, getPin } = useShift();
  const insets = useSafeAreaInsets();

  const [exporting, setExporting] = useState<string | null>(null);
  const [editingPin, setEditingPin] = useState<ShiftId | null>(null);
  const [newPinValue, setNewPinValue] = useState("");
  const [syncUrlInput, setSyncUrlInput] = useState(syncUrl);
  const [savingUrl, setSavingUrl] = useState(false);

  const headerTopPadding = Platform.OS === "web" ? 24 : insets.top + 8;
  const debtCount = summarizeDebts(history, partialPayments).length;

  const shiftColor = currentShift === 1 ? "#3b82f6" : "#8b5cf6";
  const shiftLabel = currentShift ? t(currentShift === 1 ? "shift1" : "shift2") : "—";

  const syncStatusColor =
    syncStatus === "ok"
      ? colors.success
      : syncStatus === "error"
      ? colors.destructive
      : syncStatus === "syncing"
      ? colors.primary
      : colors.mutedForeground;

  const syncStatusLabel =
    syncStatus === "syncing"
      ? t("syncing")
      : syncStatus === "ok" && lastSynced
      ? t("lastSynced", new Date(lastSynced).toLocaleTimeString())
      : syncStatus === "error"
      ? t("syncError")
      : syncStatus === "off" || !syncUrl
      ? t("syncOff")
      : t("syncNow");

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

  const handleSavePin = async () => {
    if (!editingPin) return;
    const trimmed = newPinValue.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      Alert.alert("", t("pinError"));
      return;
    }
    await setPin(editingPin, trimmed);
    setEditingPin(null);
    setNewPinValue("");
    Alert.alert("", t("pinSaved"));
  };

  const handleSaveSyncUrl = async () => {
    setSavingUrl(true);
    await setSyncUrl(syncUrlInput.trim());
    setSavingUrl(false);
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
        {/* ─── Language ─────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
          {t("language")}
        </Text>
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LangOption label="English" active={lang === "en"} onPress={() => setLang("en")} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <LangOption label="العربية" active={lang === "ar"} onPress={() => setLang("ar")} colors={colors} />
        </View>

        <View style={{ height: 24 }} />

        {/* ─── Shift Settings ──────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
          {t("shiftSettings")}
        </Text>
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Current shift row */}
          <View style={[styles.shiftStatusRow, rtl && styles.rowReverse]}>
            <View style={[styles.shiftDot, { backgroundColor: currentShift ? shiftColor : colors.border }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: colors.foreground }, rtl && styles.rtlText]}>
                {t("currentShiftLabel")}
              </Text>
              <Text style={[styles.actionDesc, { color: currentShift ? shiftColor : colors.mutedForeground }, rtl && styles.rtlText]}>
                {shiftLabel}
              </Text>
            </View>
            {currentShift && (
              <TouchableOpacity
                style={[styles.lockBtn, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}
                onPress={() => {
                  Alert.alert(t("lockShift"), "", [
                    { text: t("cancel"), style: "cancel" },
                    { text: t("lockShift"), style: "destructive", onPress: lock },
                  ]);
                }}
              >
                <Feather name="lock" size={14} color={colors.destructive} />
                <Text style={[styles.lockBtnText, { color: colors.destructive }]}>{t("lockShift")}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Change Shift 1 PIN */}
          <TouchableOpacity
            style={[styles.actionRow, rtl && styles.rowReverse]}
            onPress={() => { setEditingPin(1); setNewPinValue(""); }}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#eff6ff" }]}>
              <Feather name="sun" size={18} color="#3b82f6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: colors.foreground }, rtl && styles.rtlText]}>
                {t("shift1Pin")}
              </Text>
              <Text style={[styles.actionDesc, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
                {t("changePin")}
              </Text>
            </View>
            <Feather name={rtl ? "chevron-left" : "chevron-right"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {editingPin === 1 && (
            <PinEditRow
              value={newPinValue}
              onChange={setNewPinValue}
              onSave={handleSavePin}
              onCancel={() => { setEditingPin(null); setNewPinValue(""); }}
              placeholder={t("newPin")}
              colors={colors}
              rtl={rtl}
              t={t}
            />
          )}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Change Shift 2 PIN */}
          <TouchableOpacity
            style={[styles.actionRow, rtl && styles.rowReverse]}
            onPress={() => { setEditingPin(2); setNewPinValue(""); }}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#f5f3ff" }]}>
              <Feather name="moon" size={18} color="#8b5cf6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: colors.foreground }, rtl && styles.rtlText]}>
                {t("shift2Pin")}
              </Text>
              <Text style={[styles.actionDesc, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
                {t("changePin")}
              </Text>
            </View>
            <Feather name={rtl ? "chevron-left" : "chevron-right"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {editingPin === 2 && (
            <PinEditRow
              value={newPinValue}
              onChange={setNewPinValue}
              onSave={handleSavePin}
              onCancel={() => { setEditingPin(null); setNewPinValue(""); }}
              placeholder={t("newPin")}
              colors={colors}
              rtl={rtl}
              t={t}
            />
          )}
        </View>

        <View style={{ height: 24 }} />

        {/* ─── Sync Settings ────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
          {t("syncSettings")}
        </Text>
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* URL input */}
          <View style={[styles.urlRow, rtl && styles.rowReverse]}>
            <View style={[styles.actionIcon, { backgroundColor: "#f0fdf4" }]}>
              <Feather name="link" size={18} color={colors.success} />
            </View>
            <TextInput
              style={[
                styles.urlInput,
                { color: colors.foreground, flex: 1 },
                rtl && styles.rtlText,
              ]}
              value={syncUrlInput}
              onChangeText={setSyncUrlInput}
              onBlur={handleSaveSyncUrl}
              placeholder="https://your-app.replit.app/api"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {savingUrl ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : syncUrlInput !== syncUrl ? (
              <TouchableOpacity onPress={handleSaveSyncUrl} style={styles.saveUrlBtn}>
                <Feather name="check" size={18} color={colors.success} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Sync Now button */}
          <TouchableOpacity
            style={[styles.actionRow, rtl && styles.rowReverse]}
            onPress={syncNow}
            disabled={syncStatus === "syncing"}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#f0fdf4" }]}>
              <Feather name="refresh-cw" size={18} color={syncStatusColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: colors.foreground }, rtl && styles.rtlText]}>
                {t("syncNow")}
              </Text>
              <Text style={[styles.actionDesc, { color: syncStatusColor }, rtl && styles.rtlText]}>
                {syncStatusLabel}
              </Text>
            </View>
            {syncStatus === "syncing" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name={rtl ? "chevron-left" : "chevron-right"} size={16} color={colors.mutedForeground} />
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />

        {/* ─── Data Management ─────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
          {t("dataManagement")}
        </Text>
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActionRow
            icon="upload"
            iconColor={colors.primary}
            iconBg="#eff6ff"
            label={t("bulkAddProducts")}
            desc={t("bulkAddProductsDesc")}
            rtl={rtl}
            colors={colors}
            onPress={() => router.push("/bulk-add" as any)}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
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

function PinEditRow({
  value,
  onChange,
  onSave,
  onCancel,
  placeholder,
  colors,
  rtl,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  placeholder: string;
  colors: ReturnType<typeof useColors>;
  rtl: boolean;
  t: (k: string) => string;
}) {
  return (
    <View style={[styles.pinEditRow, { borderTopColor: colors.border }, rtl && styles.rowReverse]}>
      <TextInput
        style={[
          styles.pinInput,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            color: colors.foreground,
          },
          rtl && styles.rtlText,
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType="numeric"
        maxLength={4}
        secureTextEntry
      />
      <TouchableOpacity
        style={[styles.pinSaveBtn, { backgroundColor: colors.primary }]}
        onPress={onSave}
      >
        <Text style={{ color: colors.primaryForeground, fontWeight: "700", fontSize: 13 }}>
          {t("save")}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pinCancelBtn, { backgroundColor: colors.secondary }]}
        onPress={onCancel}
      >
        <Feather name="x" size={16} color={colors.foreground} />
      </TouchableOpacity>
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
      style={[styles.actionRow, rtl && styles.rowReverse]}
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
          style={[styles.actionDesc, { color: colors.mutedForeground }, rtl && styles.rtlText]}
          numberOfLines={1}
        >
          {desc}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <Feather name={rtl ? "chevron-left" : "chevron-right"} size={16} color={colors.mutedForeground} />
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
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}
    >
      <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>{label}</Text>
      {active && <Feather name="check" size={20} color={colors.primary} />}
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

  divider: { height: 1 },

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
  actionLabel: { fontSize: 14, marginBottom: 1, fontWeight: "600" },
  actionDesc: { fontSize: 11 },

  shiftStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  shiftDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  lockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  lockBtnText: { fontSize: 12, fontWeight: "700" },

  pinEditRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
  },
  pinInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    letterSpacing: 4,
    fontWeight: "700",
  },
  pinSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pinCancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  urlRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  urlInput: {
    fontSize: 13,
    paddingVertical: 4,
  },
  saveUrlBtn: {
    padding: 4,
  },
});
