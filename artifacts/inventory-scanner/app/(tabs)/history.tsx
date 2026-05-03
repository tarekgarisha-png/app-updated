import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Linking } from "react-native";
import { router } from "expo-router";
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

type Filter = "ALL" | "SALE" | "PURCHASE" | "CREDIT" | "RETURN";

function buildBillHTML(bill: BillGroup): string {
  const dateStr = new Date(bill.date).toLocaleString();
  const rows = bill.items
    .map(
      (h) =>
        `<tr><td>${h.name}</td><td style="text-align:center">${h.qty}</td><td style="text-align:right">${(h.unitPrice ?? 0).toFixed(2)}</td><td style="text-align:right">${(h.amount ?? 0).toFixed(2)}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#111}h1{text-align:center;font-size:22px;margin:0 0 4px}.subtitle{text-align:center;color:#666;font-size:13px;margin-bottom:16px}.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;margin-bottom:16px}.sale{background:#fee2e2;color:#b91c1c}.purchase{background:#dcfce7;color:#15803d}.credit{background:#fef3c7;color:#b45309}.return{background:#e0f2fe;color:#0369a1}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f3f4f6;text-align:left;padding:8px 10px;font-size:12px;color:#555}td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px}.total-row td{font-weight:700;font-size:14px;border-top:2px solid #111;border-bottom:none;padding-top:12px}.person{font-size:14px;font-weight:700;color:#d97706;margin-bottom:8px}.footer{text-align:center;color:#999;font-size:11px;margin-top:24px}</style></head><body><h1>Qasoda Market</h1><p class="subtitle">${dateStr}</p><div style="text-align:center"><span class="badge ${bill.type.toLowerCase()}">${bill.type}</span></div>${bill.personName ? `<p class="person">Customer: ${bill.personName}</p>` : ""}<table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}<tr class="total-row"><td colspan="3">Total</td><td style="text-align:right">${bill.totalAmount.toFixed(2)}</td></tr></tbody></table><p class="footer">Printed from Qasoda Market</p></body></html>`;
}

function buildBillText(bill: BillGroup): string {
  const lines = [
    "Qasoda Market",
    new Date(bill.date).toLocaleString(),
    bill.personName ? `Customer: ${bill.personName}` : "",
    "",
    ...bill.items.map(
      (h) =>
        `${h.name} x${h.qty}${(h.amount ?? 0) > 0 ? ` = ${(h.amount ?? 0).toFixed(2)}` : ""}`,
    ),
    "",
    `Total: ${bill.totalAmount.toFixed(2)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export default function HistoryScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { history, clearAllHistory, returnBill, returnEntry, syncUrl } = useInventory();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [printing, setPrinting] = useState<string | null>(null);
  const bills = useMemo(() => groupHistoryIntoBills(history), [history]);
  const filteredBills = useMemo(() => {
    let list = filter === "ALL" ? bills : bills.filter((b) => b.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.personName?.toLowerCase().includes(q) || b.items.some((h) => h.name.toLowerCase().includes(q) || h.barcode.includes(q)));
    }
    return list;
  }, [bills, search, filter]);
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()}  ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };
  const totals = useMemo(() => {
    let sold = 0, purchased = 0, credit = 0, returned = 0;
    history.forEach((h) => {
      if (h.type === "SALE") sold += h.amount ?? 0;
      else if (h.type === "PURCHASE") purchased += h.amount ?? 0;
      else if (h.type === "CREDIT" && !h.paid) credit += h.amount ?? 0;
      else if (h.type === "RETURN") returned += h.amount ?? 0;
    });
    return { sold, purchased, credit, returned };
  }, [history]);
  const toggleBill = (sessionId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }));
  };
  const handlePrintBill = async (bill: BillGroup) => {
    try {
      setPrinting(bill.sessionId);
      const html = buildBillHTML(bill);
      const filename = `bill_${bill.sessionId}_${Date.now()}.pdf`;
      const printResult = await Print.printToFileAsync({ html });
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = printResult.uri;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      await Sharing.shareAsync(printResult.uri, {
        mimeType: "application/pdf",
        dialogTitle: t("printBill"),
        UTI: "com.adobe.pdf",
      });
    } catch {
      Alert.alert("", t("printError"));
    } finally {
      setPrinting(null);
    }
  };
  const handleShareWhatsApp = async (bill: BillGroup) => {
    try {
      const text = buildBillText(bill);
      const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
      const canOpen = await Linking.canOpenURL("whatsapp://send");
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
      const webUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      await Linking.openURL(webUrl);
    } catch {
      Alert.alert("", t("shareBillFailed"));
    }
  };
  const exportCSV = async () => {
    try {
      if (!history.length) {
        Alert.alert("", t("emptyExport"));
        return;
      }
      const csv = buildHistoryCSV(history);
      if (syncUrl) {
        const url = `${syncUrl.replace(/\/+$/, "")}/export/history.csv`;
        if (Platform.OS === "web") {
          window.open(url, "_blank");
        } else {
          await Linking.openURL(url);
        }
        return;
      }
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `history_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
      const path = `${dir}history_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: t("exportCSV") });
      } else {
        Alert.alert("", t("noSharing"));
      }
    } catch {
      Alert.alert(t("exportFailed"), "");
    }
  };
  const handleClear = () => {
    Alert.alert(t("clearHistory"), t("clearHistoryMsg"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("deleteAll"), style: "destructive", onPress: () => clearAllHistory() },
    ]);
  };
  const handleReturnBill = (bill: BillGroup) => {
    const returnable = bill.items.filter((h) => !h.returned && (h.type === "SALE" || h.type === "CREDIT"));
    if (!returnable.length) return;
    Alert.alert(t("returnBill"), t("returnBillConfirm", returnable.length), [
      { text: t("cancel"), style: "cancel" },
      { text: t("returnItem"), onPress: () => returnBill(bill.sessionId) },
    ]);
  };
  const handleReturnEntry = (entryId: string, name: string) => {
    Alert.alert(t("returnItem"), t("returnConfirm", name), [
      { text: t("cancel"), style: "cancel" },
      { text: t("returnItem"), onPress: () => returnEntry(entryId) },
    ]);
  };
  const headerTopPadding = Platform.OS === "web" ? 67 : insets.top + 8;
  const styles = useStyles();
  const renderBill = ({ item }: { item: BillGroup }) => {
    const isOpen = !!expanded[item.sessionId];
    const isCredit = item.type === "CREDIT";
    const isReturn = item.type === "RETURN";
    const isSale = item.type === "SALE";
    const isPurchase = item.type === "PURCHASE";
    const isPrinting = printing === item.sessionId;
    const typeColor = isCredit ? colors.warning : isReturn ? "#0ea5e9" : isSale ? colors.destructive : colors.success;
    const bgIcon = isCredit ? "#fef3c7" : isReturn ? "#e0f2fe" : isSale ? "#fee2e2" : "#dcfce7";
    const iconName = isCredit ? "user" : isReturn ? "rotate-ccw" : isSale ? "arrow-up" : "arrow-down";
    const sign = isPurchase || isReturn ? "+" : "−";
    const isMulti = item.items.length > 1;
    const canReturn = (isSale || isCredit) && !item.returned;
    const allReturned = (isSale || isCredit) && item.items.every((h) => h.returned);
    return (
      <View style={[styles.billCard, { backgroundColor: colors.card }]}>
        <TouchableOpacity activeOpacity={isMulti ? 0.7 : 1} onPress={() => isMulti && toggleBill(item.sessionId)} style={[styles.billHeader, rtl && styles.rowReverse]}>
          <View style={[styles.typeIcon, { backgroundColor: bgIcon }]}><Feather name={iconName as any} size={16} color={typeColor} /></View>
          <View style={styles.billInfo}>
            {isCredit && item.personName ? <Text style={[styles.billPerson, { color: colors.warning }, rtl && styles.rtlText]} numberOfLines={1}>{item.personName}</Text> : null}
            {isReturn && <Text style={[styles.billPerson, { color: "#0ea5e9" }, rtl && styles.rtlText]}>{t("returnType")}</Text>}
            {isMulti ? <Text style={[styles.billName, { color: colors.foreground }, rtl && styles.rtlText]}>{t("billItems", item.items.length)}</Text> : <Text style={[styles.billName, { color: colors.foreground }, rtl && styles.rtlText]} numberOfLines={1}>{item.items[0]?.name ?? ""}</Text>}
            <Text style={[styles.billDate, { color: colors.mutedForeground }, rtl && styles.rtlText]}>{fmtDate(item.date)}</Text>
          </View>
          <View style={styles.billRight}>
            <Text style={[styles.billQty, { color: typeColor }]}>{sign}{item.totalQty}</Text>
            {item.totalAmount > 0 && <Text style={[styles.billAmount, { color: colors.foreground }]}>{item.totalAmount.toFixed(2)}</Text>}
            {isCredit && <View style={[styles.badge, { backgroundColor: item.paid ? "#dcfce7" : "#fef3c7" }]}><Text style={{ color: item.paid ? "#166534" : "#b45309", fontSize: 8, fontWeight: "800" }}>{item.paid ? t("paid") : t("unpaid")}</Text></View>}
            {allReturned && <View style={[styles.badge, { backgroundColor: "#e0f2fe" }]}><Text style={{ color: "#0369a1", fontSize: 8, fontWeight: "800" }}>{t("returnBadge")}</Text></View>}
            {isMulti && <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />}
          </View>
        </TouchableOpacity>
        <View style={[styles.actionRow, { borderTopColor: colors.border }, rtl && styles.rowReverse]}>
          {canReturn && !allReturned && <TouchableOpacity style={styles.actionBtn} onPress={() => handleReturnBill(item)}><Feather name="rotate-ccw" size={12} color="#0ea5e9" /><Text style={[styles.actionBtnText, { color: "#0369a1" }]}>{isMulti ? t("returnBill") : t("returnItem")}</Text></TouchableOpacity>}
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ecfeff" }]} onPress={() => handleShareWhatsApp(item)}><Feather name="message-circle" size={12} color="#16a34a" /><Text style={[styles.actionBtnText, { color: "#16a34a" }]}>{t("shareWhatsApp")}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#f3e8ff" }]} onPress={() => handlePrintBill(item)} disabled={isPrinting}><Feather name="printer" size={12} color="#7c3aed" /><Text style={[styles.actionBtnText, { color: "#7c3aed" }]}>{isPrinting ? "..." : t("printBill")}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#e0f2fe" }]} onPress={() => router.push("/settings")}><Feather name="settings" size={12} color="#0369a1" /><Text style={[styles.actionBtnText, { color: "#0369a1" }]}>{t("printerSetup")}</Text></TouchableOpacity>
        </View>
        {isOpen && <View style={[styles.billItems, { borderTopColor: colors.border }]}>{item.items.map((h) => {
          const canReturnLine = !h.returned && (h.type === "SALE" || h.type === "CREDIT");
          return <View key={h.id} style={[styles.lineRow, rtl && styles.rowReverse]}><View style={{ flex: 1 }}><View style={{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 6 }}><Text style={[styles.lineName, { color: h.returned ? colors.mutedForeground : colors.foreground }, rtl && styles.rtlText]} numberOfLines={1}>{h.name}</Text>{h.returned && <View style={styles.miniReturnBadge}><Text style={styles.miniReturnText}>{t("returnBadge")}</Text></View>}</View>{(h.unitPrice ?? 0) > 0 && <Text style={[styles.lineMeta, { color: colors.mutedForeground }, rtl && styles.rtlText]}>{h.qty} × {(h.unitPrice ?? 0).toFixed(2)}</Text>}</View><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{canReturnLine && <TouchableOpacity onPress={() => handleReturnEntry(h.id, h.name)} style={styles.lineReturnBtn}><Feather name="rotate-ccw" size={11} color="#0ea5e9" /></TouchableOpacity>}<Text style={[styles.lineAmount, { color: typeColor }]}>{sign}{h.qty}{(h.amount ?? 0) > 0 ? `  ${(h.amount ?? 0).toFixed(2)}` : ""}</Text></View></View>
        })}</View>}
      </View>
    );
  };
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: headerTopPadding, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }, rtl && styles.rtlText]}>{t("historyTitle")}</Text>
        <View style={[styles.summary, rtl && styles.rowReverse]}>
          <SumItem num={totals.sold.toFixed(0)} label={t("sold")} color={colors.destructive} mutedColor={colors.mutedForeground} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SumItem num={totals.purchased.toFixed(0)} label={t("purchased")} color={colors.success} mutedColor={colors.mutedForeground} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SumItem num={totals.credit.toFixed(0)} label={t("credit")} color={colors.warning} mutedColor={colors.mutedForeground} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SumItem num={totals.returned.toFixed(0)} label={t("returnType")} color="#0ea5e9" mutedColor={colors.mutedForeground} />
        </View>
      </View>
      <View style={[styles.tabs, { backgroundColor: colors.card, borderColor: colors.border }, rtl && styles.rowReverse]}>{(["ALL", "SALE", "PURCHASE", "CREDIT", "RETURN"] as Filter[]).map((key) => {
        const label = key === "ALL" ? t("all") : key === "SALE" ? t("sale") : key === "PURCHASE" ? t("purchase") : key === "CREDIT" ? t("credit") : t("returnType");
        const active = filter === key;
        return <TouchableOpacity key={key} style={[styles.tab, { backgroundColor: active ? colors.primary : colors.secondary }]} onPress={() => setFilter(key)}><Text style={[styles.tabText, { color: active ? "white" : colors.mutedForeground }]}>{label}</Text></TouchableOpacity>;
      })}</View>
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }, rtl && styles.rowReverse]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput style={[styles.searchInput, { color: colors.foreground }, rtl && styles.rtlInput]} placeholder={t("searchHistory")} value={search} onChangeText={setSearch} placeholderTextColor={colors.mutedForeground} textAlign={rtl ? "right" : "left"} />
        {!!search && <TouchableOpacity onPress={() => setSearch("")}><Feather name="x-circle" size={16} color={colors.mutedForeground} /></TouchableOpacity>}
      </View>
      {filteredBills.length === 0 ? <View style={styles.empty}><Feather name="clock" size={48} color={colors.border} /><Text style={[styles.emptyText, { color: colors.mutedForeground }, rtl && styles.rtlText]}>{t("noHistory")}</Text></View> : <FlatList data={filteredBills} keyExtractor={(b) => b.sessionId} contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 90 }} renderItem={renderBill} />}
      {history.length > 0 && <TouchableOpacity style={[styles.clearBtn, { backgroundColor: "#fef2f2", borderColor: "#fca5a5", marginBottom: insets.bottom + 80 }]} onPress={handleClear}><Feather name="trash-2" size={14} color={colors.destructive} /><Text style={[styles.clearText, { color: colors.destructive }, rtl && styles.rtlText]}>{t("clearHistory")}</Text></TouchableOpacity>}
    </View>
  );
}

function SumItem({ num, label, color, mutedColor }: { num: string; label: string; color: string; mutedColor: string }) {
  return <View style={{ flex: 1, alignItems: "center" }}><Text style={{ fontSize: 14, fontWeight: "800", color }}>{num}</Text><Text style={{ fontSize: 8, color: mutedColor, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: "600" }}>{label}</Text></View>;
}

function useStyles() {
  return StyleSheet.create({
    container: { flex: 1 },
    rtlText: { textAlign: "right", writingDirection: "rtl" },
    rtlInput: { textAlign: "right" },
    rowReverse: { flexDirection: "row-reverse" },
    header: { paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, gap: 14 },
    headerTitle: { fontSize: 24, fontWeight: "800", fontFamily: "Inter_700Bold" },
    summary: { flexDirection: "row", alignItems: "center", gap: 4 },
    divider: { width: 1, height: 28 },
    csvBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8 },
    csvText: { color: "white", fontWeight: "700", fontSize: 11 },
    tabs: { flexDirection: "row", paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, gap: 6, borderBottomWidth: 1 },
    tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
    tabText: { fontSize: 10, fontWeight: "700" },
    searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1 },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
    empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 24 },
    emptyText: { fontSize: 15 },
    billCard: { borderRadius: 12, marginBottom: 8, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 1 },
    billHeader: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
    typeIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
    billInfo: { flex: 1 },
    billPerson: { fontSize: 11, fontWeight: "700", marginBottom: 1 },
    billName: { fontWeight: "700", fontSize: 13 },
    billDate: { fontSize: 10, marginTop: 1 },
    billRight: { alignItems: "flex-end", gap: 2 },
    billQty: { fontSize: 16, fontWeight: "800" },
    billAmount: { fontSize: 12, fontWeight: "700" },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
    actionRow: { borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 8 },
    actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, backgroundColor: "#e0f2fe" },
    actionBtnText: { fontSize: 11, fontWeight: "700" },
    billItems: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
    lineRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 },
    lineName: { fontSize: 12, fontWeight: "600" },
    lineMeta: { fontSize: 10, marginTop: 1 },
    lineAmount: { fontSize: 12, fontWeight: "700" },
    lineReturnBtn: { width: 26, height: 26, borderRadius: 8, backgroundColor: "#e0f2fe", alignItems: "center", justifyContent: "center" },
    miniReturnBadge: { backgroundColor: "#e0f2fe", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
    miniReturnText: { color: "#0369a1", fontSize: 8, fontWeight: "800" },
    clearBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, marginHorizontal: 12, borderRadius: 10, borderWidth: 1 },
    clearText: { fontWeight: "600", fontSize: 13 },
  });
}
