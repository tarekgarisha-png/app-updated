import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
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

export default function HistoryScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { history, clearAllHistory, returnBill, returnEntry } = useInventory();
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
      if (Platform.OS === "web") {
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.print();
        }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: t("printBill"), UTI: "com.adobe.pdf" });
      } else {
        await Print.printAsync({ html });
      }
    } catch {
      Alert.alert(t("printError"), "");
    } finally {
      setPrinting(null);
    }
  };
  const exportCSV = async () => {
    try {
      if (!history.length) {
        Alert.alert("", t("emptyExport"));
        return;
      }
      const csv = buildHistoryCSV(history);
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
      const path = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}history_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: t("exportCSV") });
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
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#f3e8ff" }]} onPress={() => handlePrintBill(item)} disabled={isPrinting}><Feather name="printer" size={12} color="#7c3aed" /><Text style={[styles.actionBtnText, { color: "#7c3aed" }]}>{isPrinting ? "..." : t("printBill")}</Text></TouchableOpacity>
        </View>
        {isOpen && <View style={[styles.billItems, { borderTopColor: colors.border }]}>{item.items.map((h) => {
          const canReturnLine = !h.returned && (h.type === "SALE" || h.type === "CREDIT");
          return <View key={h.id} style={[styles.lineRow, rtl && styles.rowReverse]}><View style={{ flex: 1 }}><View style={{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 6 }}><Text style={[styles.lineName, { color: h.returned ? colors.mutedForeground : colors.foreground }, rtl && styles.rtlText]} numberOfLines={1}>{h.name}</Text>{h.returned && <View style={styles.miniReturnBadge}><Text style={styles.miniReturnText}>{t("returnBadge")}</Text></View>}</View>{(h.unitPrice ?? 0) > 0 && <Text style={[styles.lineMeta, { color: colors.mutedForeground }, rtl && styles.rtlText]}>{h.qty} × {(h.unitPrice ?? 0).toFixed(2)}</Text>}</View><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{canReturnLine && <TouchableOpacity onPress={() => handleReturnEntry(h.id, h.name)} style={styles.lineReturnBtn}><Feather name="rotate-ccw" size={11} color="#0ea5e9" /></TouchableOpacity>}<Text style={[styles.lineAmount, { color: typeColor }]}>{sign}{h.qty}{(h.amount ?? 0) > 0 ? `  ${(h.amount ?? 0).toFixed(2)}` : ""}</Text></View></View>
        })}</View>}
      </View>
    );
  };
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>...