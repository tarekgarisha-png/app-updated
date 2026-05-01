import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInventory, useT } from "@/contexts/InventoryContext";
import { useColors } from "@/hooks/useColors";
import { buildHistoryCSV, groupHistoryIntoBills } from "@/lib/storage";
import type { BillGroup } from "@/lib/types";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Filter = "ALL" | "SALE" | "PURCHASE" | "CREDIT";

export default function HistoryScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { history, clearAllHistory } = useInventory();

  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const bills = useMemo(() => groupHistoryIntoBills(history), [history]);

  const filteredBills = useMemo(() => {
    let list =
      filter === "ALL" ? bills : bills.filter((b) => b.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.personName?.toLowerCase().includes(q) ||
          b.items.some(
            (h) =>
              h.name.toLowerCase().includes(q) ||
              h.barcode.includes(q),
          ),
      );
    }
    return list;
  }, [bills, search, filter]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date}  ${time}`;
  };

  const totals = useMemo(() => {
    let sold = 0, purchased = 0, credit = 0;
    history.forEach((h) => {
      if (h.type === "SALE") sold += h.amount ?? 0;
      else if (h.type === "PURCHASE") purchased += h.amount ?? 0;
      else if (h.type === "CREDIT" && !h.paid) credit += h.amount ?? 0;
    });
    return { sold, purchased, credit };
  }, [history]);

  const toggleBill = (sessionId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }));
  };

  const exportCSV = async () => {
    try {
      const data = history;
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

  const renderBill = ({ item }: { item: BillGroup }) => {
    const isOpen = !!expanded[item.sessionId];
    const isSale = item.type === "SALE";
    const isCredit = item.type === "CREDIT";
    const typeColor = isCredit
      ? colors.warning
      : isSale
        ? colors.destructive
        : colors.success;
    const bgIcon = isCredit ? "#fef3c7" : isSale ? "#fee2e2" : "#dcfce7";
    const sign = item.type === "PURCHASE" ? "+" : "−";
    const isMulti = item.items.length > 1;

    return (
      <View style={[styles.billCard, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          activeOpacity={isMulti ? 0.7 : 1}
          onPress={() => isMulti && toggleBill(item.sessionId)}
          style={[styles.billHeader, rtl && styles.rowReverse]}
        >
          <View style={[styles.typeIcon, { backgroundColor: bgIcon }]}>
            <Feather
              name={isCredit ? "user" : isSale ? "arrow-up" : "arrow-down"}
              size={16}
              color={typeColor}
            />
          </View>
          <View style={styles.billInfo}>
            {isCredit && item.personName ? (
              <Text
                style={[
                  styles.billPerson,
                  { color: colors.warning },
                  rtl && styles.rtlText,
                ]}
                numberOfLines={1}
              >
                {item.personName}
              </Text>
            ) : null}
            {isMulti ? (
              <Text
                style={[
                  styles.billName,
                  { color: colors.foreground },
                  rtl && styles.rtlText,
                ]}
              >
                {t("billItems", item.items.length)}
              </Text>
            ) : (
              <Text
                style={[
                  styles.billName,
                  { color: colors.foreground },
                  rtl && styles.rtlText,
                ]}
                numberOfLines={1}
              >
                {item.items[0]?.name ?? ""}
              </Text>
            )}
            <Text
              style={[
                styles.billDate,
                { color: colors.mutedForeground },
                rtl && styles.rtlText,
              ]}
            >
              {fmtDate(item.date)}
            </Text>
          </View>
          <View style={styles.billRight}>
            <Text style={[styles.billQty, { color: typeColor }]}>
              {sign}{item.totalQty}
            </Text>
            {item.totalAmount > 0 && (
              <Text style={[styles.billAmount, { color: colors.foreground }]}>
                {item.totalAmount.toFixed(2)}
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
            {isMulti && (
              <Feather
                name={isOpen ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.mutedForeground}
              />
            )}
          </View>
        </TouchableOpacity>

        {isOpen && (
          <View
            style={[
              styles.billItems,
              { borderTopColor: colors.border },
            ]}
          >
            {item.items.map((h) => (
              <View
                key={h.id}
                style={[styles.lineRow, rtl && styles.rowReverse]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.lineName,
                      { color: colors.foreground },
                      rtl && styles.rtlText,
                    ]}
                    numberOfLines={1}
                  >
                    {h.name}
                  </Text>
                  {(h.unitPrice ?? 0) > 0 && (
                    <Text
                      style={[
                        styles.lineMeta,
                        { color: colors.mutedForeground },
                        rtl && styles.rtlText,
                      ]}
                    >
                      {h.qty} × {(h.unitPrice ?? 0).toFixed(2)}
                    </Text>
                  )}
                </View>
                <Text style={[styles.lineAmount, { color: typeColor }]}>
                  {sign}{h.qty}
                  {(h.amount ?? 0) > 0
                    ? `  ${(h.amount ?? 0).toFixed(2)}`
                    : ""}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
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
            num={totals.sold.toFixed(0)}
            label={t("sold")}
            color={colors.destructive}
            mutedColor={colors.mutedForeground}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SumItem
            num={totals.purchased.toFixed(0)}
            label={t("purchased")}
            color={colors.success}
            mutedColor={colors.mutedForeground}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SumItem
            num={totals.credit.toFixed(0)}
            label={t("credit")}
            color={colors.warning}
            mutedColor={colors.mutedForeground}
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

      {filteredBills.length === 0 ? (
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
          data={filteredBills}
          keyExtractor={(b) => b.sessionId}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 90,
          }}
          renderItem={renderBill}
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
}: {
  num: string;
  label: string;
  color: string;
  mutedColor: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontSize: 16, fontWeight: "800", color }}>{num}</Text>
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

    billCard: {
      borderRadius: 12,
      marginBottom: 8,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 3,
      elevation: 1,
    },
    billHeader: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      gap: 10,
    },
    typeIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    billInfo: { flex: 1 },
    billPerson: { fontSize: 11, fontWeight: "700", marginBottom: 1 },
    billName: { fontWeight: "700", fontSize: 13 },
    billDate: { fontSize: 10, marginTop: 1 },
    billRight: { alignItems: "flex-end", gap: 2 },
    billQty: { fontSize: 16, fontWeight: "800" },
    billAmount: { fontSize: 12, fontWeight: "700" },
    paidBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      marginTop: 2,
    },

    billItems: {
      borderTopWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
    },
    lineRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 2,
    },
    lineName: { fontSize: 12, fontWeight: "600" },
    lineMeta: { fontSize: 10, marginTop: 1 },
    lineAmount: { fontSize: 12, fontWeight: "700" },

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
