import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInventory, useT } from "@/contexts/InventoryContext";
import { useColors } from "@/hooks/useColors";
import { summarizeDebts } from "@/lib/storage";
import type { DebtSummary } from "@/lib/types";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function DebtsScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { history, markEntryPaid, markPersonPaid } = useInventory();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const debts = useMemo(() => summarizeDebts(history), [history]);

  const totals = useMemo(() => {
    let totalOwed = 0;
    let totalItems = 0;
    debts.forEach((d) => {
      totalOwed += d.totalOwed;
      totalItems += d.itemCount;
    });
    return { totalOwed, totalItems, peopleCount: debts.length };
  }, [debts]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

  const toggleExpand = (name: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleMarkPersonPaid = (debt: DebtSummary) => {
    Alert.alert(
      t("markPaid"),
      t("markPaidConfirm", debt.personName, debt.totalOwed.toFixed(2)),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("markPaid"),
          onPress: async () => {
            await markPersonPaid(debt.personName);
          },
        },
      ],
    );
  };

  const handleMarkEntryPaid = async (id: string) => {
    await markEntryPaid(id, true);
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
          {t("debtsTitle")}
        </Text>
        <View style={[styles.summary, rtl && styles.rowReverse]}>
          <Stat
            num={totals.totalOwed.toFixed(2)}
            label={t("totalOwed")}
            color={colors.warning}
            mutedColor={colors.mutedForeground}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Stat
            num={String(totals.peopleCount)}
            label={t("peopleOwing")}
            color={colors.primary}
            mutedColor={colors.mutedForeground}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Stat
            num={String(totals.totalItems)}
            label={t("unpaidItems")}
            color={colors.foreground}
            mutedColor={colors.mutedForeground}
          />
        </View>
      </View>

      {debts.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="check-circle" size={56} color="#86efac" />
          <Text
            style={[
              styles.emptyText,
              { color: colors.mutedForeground },
              rtl && styles.rtlText,
            ]}
          >
            {t("noDebts")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={debts}
          keyExtractor={(d) => d.personName}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 90,
          }}
          renderItem={({ item }) => {
            const isOpen = !!expanded[item.personName];
            return (
              <View
                style={[styles.debtCard, { backgroundColor: colors.card }]}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => toggleExpand(item.personName)}
                  style={[styles.debtHeader, rtl && styles.rowReverse]}
                >
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: "#fef3c7" },
                    ]}
                  >
                    <Feather name="user" size={20} color={colors.warning} />
                  </View>
                  <View style={styles.debtInfo}>
                    <Text
                      style={[
                        styles.debtName,
                        { color: colors.foreground },
                        rtl && styles.rtlText,
                      ]}
                      numberOfLines={1}
                    >
                      {item.personName}
                    </Text>
                    <Text
                      style={[
                        styles.debtMeta,
                        { color: colors.mutedForeground },
                        rtl && styles.rtlText,
                      ]}
                    >
                      {t("items_n", item.itemCount)} ·{" "}
                      {t("sinceDate", fmtDate(item.oldestDate))}
                    </Text>
                  </View>
                  <View style={styles.debtRight}>
                    <Text
                      style={[
                        styles.debtAmount,
                        { color: colors.warning },
                      ]}
                    >
                      {item.totalOwed.toFixed(2)}
                    </Text>
                    <Feather
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={colors.mutedForeground}
                    />
                  </View>
                </TouchableOpacity>

                {isOpen && (
                  <View
                    style={[
                      styles.debtDetails,
                      { borderColor: colors.border },
                    ]}
                  >
                    {item.entries.map((e) => (
                      <View
                        key={e.id}
                        style={[
                          styles.entryRow,
                          rtl && styles.rowReverse,
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.entryName,
                              { color: colors.foreground },
                              rtl && styles.rtlText,
                            ]}
                            numberOfLines={1}
                          >
                            {e.name}
                          </Text>
                          <Text
                            style={[
                              styles.entryMeta,
                              { color: colors.mutedForeground },
                              rtl && styles.rtlText,
                            ]}
                          >
                            {fmtDate(e.date)} · {e.qty} ×{" "}
                            {(e.unitPrice ?? 0).toFixed(2)}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.entryAmount,
                            { color: colors.foreground },
                          ]}
                        >
                          {(e.amount ?? 0).toFixed(2)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleMarkEntryPaid(e.id)}
                          style={[
                            styles.smallPaidBtn,
                            { backgroundColor: colors.success },
                          ]}
                        >
                          <Feather name="check" size={13} color="white" />
                        </TouchableOpacity>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={[
                        styles.payAllBtn,
                        { backgroundColor: colors.success },
                      ]}
                      onPress={() => handleMarkPersonPaid(item)}
                    >
                      <Feather name="check-circle" size={16} color="white" />
                      <Text style={styles.payAllText}>{t("markPaid")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function Stat({
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
      <Text style={{ fontSize: 17, fontWeight: "800", color }}>{num}</Text>
      <Text
        style={{
          fontSize: 9,
          color: mutedColor,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: "600",
          marginTop: 2,
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
    rowReverse: { flexDirection: "row-reverse" },

    header: {
      paddingHorizontal: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      gap: 14,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "800",
      fontFamily: "Inter_700Bold",
    },
    summary: { flexDirection: "row", alignItems: "center", gap: 6 },
    divider: { width: 1, height: 30 },

    empty: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 24,
    },
    emptyText: { fontSize: 15, textAlign: "center" },

    debtCard: {
      borderRadius: 14,
      marginBottom: 10,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 4,
      elevation: 1,
    },
    debtHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      justifyContent: "center",
      alignItems: "center",
    },
    debtInfo: { flex: 1 },
    debtName: { fontSize: 15, fontWeight: "700" },
    debtMeta: { fontSize: 11, marginTop: 2 },
    debtRight: { alignItems: "flex-end", gap: 4 },
    debtAmount: { fontSize: 17, fontWeight: "800" },

    debtDetails: {
      borderTopWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
    },
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 4,
    },
    entryName: { fontSize: 13, fontWeight: "600" },
    entryMeta: { fontSize: 10, marginTop: 1 },
    entryAmount: { fontSize: 13, fontWeight: "700", minWidth: 50, textAlign: "right" },
    smallPaidBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },

    payAllBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 11,
      borderRadius: 10,
      marginTop: 4,
    },
    payAllText: { color: "white", fontWeight: "700", fontSize: 13 },
  });
}
