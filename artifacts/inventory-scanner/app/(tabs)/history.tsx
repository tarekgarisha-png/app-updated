import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState } from "react";
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
import { buildHistoryCSV } from "@/lib/storage";

type Filter = "ALL" | "SALE" | "PURCHASE" | "CREDIT";

export default function HistoryScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { history, clearAllHistory } = useInventory();

  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const filtered = useMemo(() => {
    let list =
      filter === "ALL" ? history : history.filter((h) => h.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.barcode.includes(q) ||
          (h.personName ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [history, search, filter]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date}  ${time}`;
  };

  const totalSold = useMemo(
    () =>
      history
        .filter((h) => h.type === "SALE")
        .reduce((s, h) => s + (h.amount ?? 0), 0),
    [history],
  );
  const totalPurchased = useMemo(
    () =>
      history
        .filter((h) => h.type === "PURCHASE")
        .reduce((s, h) => s + (h.amount ?? 0), 0),
    [history],
  );
  const totalCredit = useMemo(
    () =>
      history
        .filter((h) => h.type === "CREDIT" && !h.paid)
        .reduce((s, h) => s + (h.amount ?? 0), 0),
    [history],
  );

  const exportCSV = async () => {
    try {
      const data = filtered.length ? filtered : history;
      if (!data.length) {
        Alert.alert("", t("emptyExport"));
        return;
      }
      const csv = buildHistoryCSV(data);

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `history_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const path = `${FileSystem.documentDirectory}history_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const ok = await Sharing.isAvailableAsync();
      if (!ok) {
        Alert.alert("", t("noSharing"));
        return;
      }
      await Sharing.shareAsync(path, {
        mimeType: "text/csv",
        dialogTitle: t("exportCSV"),
      });
    } catch {
      Alert.alert(t("exportFailed"), "");
    }
  };

  const handleClear = () => {
    Alert.alert(t("clearHistory"), t("clearHistoryMsg"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("deleteAll"),
        style: "destructive",
        onPress: async () => {
          await clearAllHistory();
        },
      },
    ]);
  };

  const headerTopPadding = Platform.OS === "web" ? 67 : insets.top + 8;
  const styles = useStyles();

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
        ]}
      >
        <Text
          style={[
            styles.headerTitle,
            { color: colors.foreground },
            rtl && styles.rtlText,
          ]}
        >
          {t("historyTitle")}
        </Text>

        <View style={[styles.summary, rtl && styles.rowReverse]}>
          <SumItem
            num={totalSold}
            label={t("sold")}
            color={colors.destructive}
            mutedColor={colors.mutedForeground}
            isMoney
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SumItem
            num={totalPurchased}
            label={t("purchased")}
            color={colors.success}
            mutedColor={colors.mutedForeground}
            isMoney
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SumItem
            num={totalCredit}
            label={t("credit")}
            color={colors.warning}
            mutedColor={colors.mutedForeground}
            isMoney
          />
          <TouchableOpacity
            style={[styles.csvBtn, { backgroundColor: colors.primary }]}
            onPress={exportCSV}
          >
            <Feather name="download" size={14} color="white" />
            <Text style={styles.csvText}>CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.tabs,
          { backgroundColor: colors.card, borderColor: colors.border },
          rtl && styles.rowReverse,
        ]}
      >
        {(
          [
            { key: "ALL", label: t("all") },
            { key: "SALE", label: t("sale") },
            { key: "PURCHASE", label: t("purchase") },
            { key: "CREDIT", label: t("credit") },
          ] as { key: Filter; label: string }[]
        ).map((tab) => {
          const active = filter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                { backgroundColor: active ? colors.primary : colors.secondary },
              ]}
              onPress={() => setFilter(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: active ? "white" : colors.mutedForeground,
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View
        style={[
          styles.searchWrap,
          { backgroundColor: colors.card, borderColor: colors.border },
          rtl && styles.rowReverse,
        ]}
      >
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[
            styles.searchInput,
            { color: colors.foreground },
            rtl && styles.rtlInput,
          ]}
          placeholder={t("searchHistory")}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={colors.mutedForeground}
          textAlign={rtl ? "right" : "left"}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x-circle" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="clock" size={48} color={colors.border} />
          <Text
            style={[
              styles.emptyText,
              { color: colors.mutedForeground },
              rtl && styles.rtlText,
            ]}
          >
            {t("noHistory")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 90,
          }}
          renderItem={({ item }) => {
            const isSale = item.type === "SALE";
            const isCredit = item.type === "CREDIT";
            const typeColor = isCredit
              ? colors.warning
              : isSale
                ? colors.destructive
                : colors.success;
            const bgIcon = isCredit
              ? "#fef3c7"
              : isSale
                ? "#fee2e2"
                : "#dcfce7";
            const sign = item.type === "PURCHASE" ? "+" : "−";
            return (
              <View
                style={[
                  styles.row,
                  { backgroundColor: colors.card },
                  rtl && styles.rowReverse,
                ]}
              >
                <View style={[styles.typeIcon, { backgroundColor: bgIcon }]}>
                  <Feather
                    name={
                      isCredit
                        ? "user"
                        : isSale
                          ? "arrow-up"
                          : "arrow-down"
                    }
                    size={16}
                    color={typeColor}
                  />
                </View>
                <View style={styles.rowInfo}>
                  <Text
                    style={[
                      styles.rowName,
                      { color: colors.foreground },
                      rtl && styles.rtlText,
                    ]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {isCredit && item.personName ? (
                    <Text
                      style={[
                        styles.rowPerson,
                        { color: colors.warning },
                        rtl && styles.rtlText,
                      ]}
                      numberOfLines={1}
                    >
                      {item.personName}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.rowDate,
                      { color: colors.mutedForeground },
                      rtl && styles.rtlText,
                    ]}
                  >
                    {fmtDate(item.date)}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowQty, { color: typeColor }]}>
                    {sign}
                    {item.qty}
                  </Text>
                  {(item.amount ?? 0) > 0 && (
                    <Text
                      style={[
                        styles.rowAmount,
                        { color: colors.foreground },
                      ]}
                    >
                      {(item.amount ?? 0).toFixed(2)}
                    </Text>
                  )}
                  {isCredit && (
                    <View
                      style={[
                        styles.paidBadge,
                        {
                          backgroundColor: item.paid ? "#dcfce7" : "#fef3c7",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: item.paid ? "#166534" : "#b45309",
                          fontSize: 8,
                          fontWeight: "800",
                          letterSpacing: 0.4,
                        }}
                      >
                        {item.paid ? t("paid") : t("unpaid")}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {history.length > 0 && (
        <TouchableOpacity
          style={[
            styles.clearBtn,
            {
              backgroundColor: "#fef2f2",
              borderColor: "#fca5a5",
              marginBottom: insets.bottom + 80,
            },
          ]}
          onPress={handleClear}
        >
          <Feather name="trash-2" size={14} color={colors.destructive} />
          <Text
            style={[
              styles.clearText,
              { color: colors.destructive },
              rtl && styles.rtlText,
            ]}
          >
            {t("clearHistory")}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function SumItem({
  num,
  label,
  color,
  mutedColor,
  isMoney,
}: {
  num: number;
  label: string;
  color: string;
  mutedColor: string;
  isMoney?: boolean;
}) {
  const display = isMoney ? num.toFixed(0) : String(num);
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontSize: 16, fontWeight: "800", color }}>{display}</Text>
      <Text
        style={{
          fontSize: 9,
          color: mutedColor,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
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
      paddingHorizontal: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      gap: 14,
    },
    headerTitle: { fontSize: 24, fontWeight: "800", fontFamily: "Inter_700Bold" },
    summary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    divider: { width: 1, height: 28 },
    csvBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 8,
    },
    csvText: { color: "white", fontWeight: "700", fontSize: 11 },

    tabs: {
      flexDirection: "row",
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 10,
      gap: 6,
      borderBottomWidth: 1,
    },
    tab: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
    },
    tabText: { fontSize: 11, fontWeight: "700" },

    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      margin: 12,
      borderRadius: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
    },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },

    empty: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 24,
    },
    emptyText: { fontSize: 15 },

    row: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 3,
      elevation: 1,
    },
    typeIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    rowInfo: { flex: 1 },
    rowName: { fontWeight: "700", fontSize: 13 },
    rowPerson: { fontSize: 11, fontWeight: "700", marginTop: 1 },
    rowDate: { fontSize: 10, marginTop: 1 },
    rowRight: { alignItems: "flex-end", gap: 2 },
    rowQty: { fontSize: 16, fontWeight: "800" },
    rowAmount: { fontSize: 12, fontWeight: "700" },
    paidBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      marginTop: 2,
    },

    clearBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: 12,
      marginHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    clearText: { fontWeight: "600", fontSize: 13 },
  });
}
