import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
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
  const { history, partialPayments, markEntryPaid, markPersonPaid, addPartialPayment } = useInventory();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState<string>("");

  // Partial payment modal state
  const [payModal, setPayModal] = useState(false);
  const [payPerson, setPayPerson] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [payNote, setPayNote] = useState<string>("");
  const [payLoading, setPayLoading] = useState(false);

  const allDebts = useMemo(
    () => summarizeDebts(history, partialPayments),
    [history, partialPayments],
  );

  const debts = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allDebts;
    return allDebts.filter((d) => d.personName.toLowerCase().includes(q));
  }, [allDebts, search]);

  const totals = useMemo(() => {
    let totalOwed = 0;
    let totalRemaining = 0;
    let totalItems = 0;
    debts.forEach((d) => {
      totalOwed += d.totalOwed;
      totalRemaining += d.remainingOwed;
      totalItems += d.itemCount;
    });
    return { totalOwed, totalRemaining, totalItems, peopleCount: debts.length };
  }, [debts]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

  const toggleExpand = (name: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleMarkPersonPaid = (debt: DebtSummary) => {
    Alert.alert(
      t("markPaid"),
      t("markPaidConfirm", debt.personName, debt.remainingOwed.toFixed(2)),
      [
        { text: t("cancel"), style: "cancel" },
        { text: t("markPaid"), onPress: () => markPersonPaid(debt.personName) },
      ],
    );
  };

  const openPayModal = (personName: string) => {
    setPayPerson(personName);
    setPayAmount("");
    setPayNote("");
    setPayModal(true);
  };

  const handleApplyPayment = async () => {
    const amt = parseFloat(payAmount.replace(",", "."));
    if (!amt || amt <= 0 || isNaN(amt)) {
      Alert.alert("", t("partialPayInvalid"));
      return;
    }
    setPayLoading(true);
    try {
      await addPartialPayment(payPerson, amt, payNote.trim() || undefined);
      setPayModal(false);
    } finally {
      setPayLoading(false);
    }
  };

  const headerTopPadding = Platform.OS === "web" ? 67 : insets.top + 8;
  const styles = useStyles();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: headerTopPadding, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }, rtl && styles.rtlText]}>
          {t("debtsTitle")}
        </Text>
        <View style={[styles.summary, rtl && styles.rowReverse]}>
          <Stat num={totals.totalRemaining.toFixed(2)} label={t("remaining")} color={colors.warning} mutedColor={colors.mutedForeground} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Stat num={String(totals.peopleCount)} label={t("peopleOwing")} color={colors.primary} mutedColor={colors.mutedForeground} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Stat num={String(totals.totalItems)} label={t("unpaidItems")} color={colors.foreground} mutedColor={colors.mutedForeground} />
        </View>
      </View>

      {/* ── Search ── */}
      {allDebts.length > 0 && (
        <View style={[styles.searchWrap, { borderColor: colors.border }, rtl && styles.rowReverse]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }, rtl && { textAlign: "right" as const }]}
            value={search}
            onChangeText={setSearch}
            placeholder={t("searchDebts")}
            placeholderTextColor={colors.mutedForeground}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── List ── */}
      {debts.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="check-circle" size={56} color="#86efac" />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
            {t("noDebts")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={debts}
          keyExtractor={(d) => d.personName}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 90 }}
          renderItem={({ item }) => {
            const isOpen = !!expanded[item.personName];
            const totalPartialPaid = item.partialPayments.reduce((s, p) => s + p.amount, 0);
            const hasPartialPayments = item.partialPayments.length > 0;

            return (
              <View style={[styles.debtCard, { backgroundColor: colors.card }]}>
                {/* Card header */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => toggleExpand(item.personName)}
                  style={[styles.debtHeader, rtl && styles.rowReverse]}
                >
                  <View style={[styles.avatar, { backgroundColor: "#fef3c7" }]}>
                    <Feather name="user" size={20} color={colors.warning} />
                  </View>
                  <View style={styles.debtInfo}>
                    <Text style={[styles.debtName, { color: colors.foreground }, rtl && styles.rtlText]} numberOfLines={1}>
                      {item.personName}
                    </Text>
                    <Text style={[styles.debtMeta, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
                      {t("items_n", item.itemCount)} · {t("sinceDate", fmtDate(item.oldestDate))}
                    </Text>
                    {hasPartialPayments && (
                      <Text style={[styles.debtPaidNote, rtl && styles.rtlText]}>
                        {t("totalPaid")}: {totalPartialPaid.toFixed(2)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.debtRight}>
                    <Text style={[styles.debtAmount, { color: colors.warning }]}>
                      {item.remainingOwed.toFixed(2)}
                    </Text>
                    {hasPartialPayments && (
                      <Text style={[styles.debtOriginal, { color: colors.mutedForeground }]}>
                        /{item.totalOwed.toFixed(2)}
                      </Text>
                    )}
                    <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>

                {/* Expanded details */}
                {isOpen && (
                  <View style={[styles.debtDetails, { borderColor: colors.border }]}>
                    {/* Credit entries */}
                    {item.entries.map((e) => (
                      <View key={e.id} style={[styles.entryRow, rtl && styles.rowReverse]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.entryName, { color: colors.foreground }, rtl && styles.rtlText]} numberOfLines={1}>
                            {e.name}
                          </Text>
                          <Text style={[styles.entryMeta, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
                            {fmtDate(e.date)} · {e.qty} × {(e.unitPrice ?? 0).toFixed(2)}
                          </Text>
                        </View>
                        <Text style={[styles.entryAmount, { color: colors.foreground }]}>
                          {(e.amount ?? 0).toFixed(2)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => markEntryPaid(e.id, true)}
                          style={[styles.smallPaidBtn, { backgroundColor: colors.success }]}
                        >
                          <Feather name="check" size={13} color="white" />
                        </TouchableOpacity>
                      </View>
                    ))}

                    {/* Partial payment history */}
                    {hasPartialPayments && (
                      <View style={[styles.partialSection, { borderTopColor: colors.border }]}>
                        <Text style={[styles.partialHeader, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
                          {t("partialHistory")}
                        </Text>
                        {item.partialPayments.map((p) => (
                          <View key={p.id} style={[styles.partialRow, rtl && styles.rowReverse]}>
                            <Feather name="minus-circle" size={13} color={colors.success} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.partialDate, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
                                {fmtDate(p.date)}{p.note ? ` · ${p.note}` : ""}
                              </Text>
                            </View>
                            <Text style={[styles.partialAmount, { color: colors.success }]}>
                              -{p.amount.toFixed(2)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Action buttons */}
                    <View style={[styles.actionBtns, rtl && styles.rowReverse]}>
                      <TouchableOpacity
                        style={[styles.payAmtBtn, { borderColor: colors.primary }]}
                        onPress={() => openPayModal(item.personName)}
                      >
                        <Feather name="dollar-sign" size={14} color={colors.primary} />
                        <Text style={[styles.payAmtText, { color: colors.primary }]}>{t("payAmount")}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.payAllBtn, { backgroundColor: colors.success }]}
                        onPress={() => handleMarkPersonPaid(item)}
                      >
                        <Feather name="check-circle" size={14} color="white" />
                        <Text style={styles.payAllText}>{t("markPaid")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* ── Partial Payment Modal ── */}
      <Modal
        visible={payModal}
        transparent
        animationType="slide"
        onRequestClose={() => setPayModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPayModal(false)} />
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }, rtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }, rtl && styles.rtlText]}>
                {t("partialPayTitle")}
              </Text>
              <TouchableOpacity onPress={() => setPayModal(false)} style={[styles.modalClose, { backgroundColor: colors.secondary }]}>
                <Feather name="x" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {/* Person name badge */}
              <View style={[styles.personBadge, { backgroundColor: "#fef3c7" }]}>
                <Feather name="user" size={14} color={colors.warning} />
                <Text style={[styles.personBadgeText, { color: "#b45309" }]}>{payPerson}</Text>
              </View>

              {/* Amount input */}
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
                {t("partialPayLabel")}
              </Text>
              <TextInput
                style={[styles.amountInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }, rtl && styles.rtlText]}
                placeholder={t("partialPayPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={payAmount}
                onChangeText={setPayAmount}
                keyboardType="decimal-pad"
                textAlign={rtl ? "right" : "left"}
                autoFocus
              />

              {/* Note input */}
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }, rtl && styles.rtlText]}>
                {t("partialPayNote")}
              </Text>
              <TextInput
                style={[styles.noteInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }, rtl && styles.rtlText]}
                placeholder={t("partialPayNotePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={payNote}
                onChangeText={setPayNote}
                textAlign={rtl ? "right" : "left"}
              />

              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.primary, opacity: payLoading ? 0.6 : 1 }]}
                onPress={handleApplyPayment}
                disabled={payLoading}
              >
                <Feather name="check" size={16} color="white" />
                <Text style={styles.confirmBtnText}>{payLoading ? "..." : t("partialPayConfirm")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Stat({ num, label, color, mutedColor }: { num: string; label: string; color: string; mutedColor: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontSize: 17, fontWeight: "800", color }}>{num}</Text>
      <Text style={{ fontSize: 9, color: mutedColor, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: "600", marginTop: 2 }}>
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

    header: { paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, gap: 14 },
    headerTitle: { fontSize: 24, fontWeight: "800", fontFamily: "Inter_700Bold" },
    summary: { flexDirection: "row", alignItems: "center", gap: 6 },
    divider: { width: 1, height: 30 },

    empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 14, paddingHorizontal: 24 },
    emptyText: { fontSize: 15, textAlign: "center" },

    debtCard: { borderRadius: 14, marginBottom: 10, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.05, shadowOffset: { width: 0, height: 1 }, shadowRadius: 4, elevation: 1 },
    debtHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
    avatar: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
    debtInfo: { flex: 1 },
    debtName: { fontSize: 15, fontWeight: "700" },
    debtMeta: { fontSize: 11, marginTop: 2 },
    debtPaidNote: { fontSize: 10, color: "#16a34a", marginTop: 2, fontWeight: "600" },
    debtRight: { alignItems: "flex-end", gap: 2 },
    debtAmount: { fontSize: 17, fontWeight: "800" },
    debtOriginal: { fontSize: 11, textDecorationLine: "line-through" },

    debtDetails: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
    entryRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
    entryName: { fontSize: 13, fontWeight: "600" },
    entryMeta: { fontSize: 10, marginTop: 1 },
    entryAmount: { fontSize: 13, fontWeight: "700", minWidth: 50, textAlign: "right" },
    smallPaidBtn: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },

    partialSection: { borderTopWidth: 1, paddingTop: 8, gap: 6 },
    partialHeader: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
    partialRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    partialDate: { fontSize: 11 },
    partialAmount: { fontSize: 12, fontWeight: "700" },

    actionBtns: { flexDirection: "row", gap: 8, marginTop: 4 },
    payAmtBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
    payAmtText: { fontWeight: "700", fontSize: 13 },
    payAllBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
    payAllText: { color: "white", fontWeight: "700", fontSize: 13 },

    searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginTop: 12, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },

    modalOverlay: { flex: 1, justifyContent: "flex-end" },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
    modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, shadowColor: "#000", shadowOpacity: 0.15, shadowOffset: { width: 0, height: -2 }, shadowRadius: 12, elevation: 20 },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1 },
    modalTitle: { fontSize: 17, fontWeight: "800" },
    modalClose: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    modalBody: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },

    personBadge: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 4 },
    personBadgeText: { fontWeight: "700", fontSize: 15 },

    inputLabel: { fontSize: 12, fontWeight: "600", marginBottom: -4 },
    amountInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 22, fontWeight: "700" },
    noteInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
    confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 6 },
    confirmBtnText: { color: "white", fontWeight: "700", fontSize: 16 },
  });
}
