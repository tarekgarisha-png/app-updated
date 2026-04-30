import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInventory, useT } from "@/contexts/InventoryContext";
import { useColors } from "@/hooks/useColors";
import type { ScanMode, ScanQueueItem } from "@/lib/types";

const MODE_CYCLE: ScanMode[] = ["SALE", "PURCHASE", "CREDIT"];

export default function ScannerScreen() {
  const colors = useColors();
  const { t, rtl } = useT();
  const insets = useSafeAreaInsets();
  const { products, commitQueue } = useInventory();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<boolean>(false);
  const [mode, setMode] = useState<ScanMode>("SALE");
  const [scanQueue, setScanQueue] = useState<ScanQueueItem[]>([]);
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [manualOpen, setManualOpen] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>("");
  const [personOpen, setPersonOpen] = useState<boolean>(false);
  const [personName, setPersonName] = useState<string>("");

  const isWeb = Platform.OS === "web";
  const canUseCamera = !isWeb && permission?.granted;

  const lowStockCount = useMemo(
    () => products.filter((p) => p.stock <= p.minStock).length,
    [products],
  );

  const totalItems = useMemo(
    () => scanQueue.reduce((s, i) => s + i.qty, 0),
    [scanQueue],
  );

  const totalAmount = useMemo(
    () => scanQueue.reduce((s, i) => s + i.qty * (i.price ?? 0), 0),
    [scanQueue],
  );

  const modeColor =
    mode === "SALE"
      ? colors.destructive
      : mode === "PURCHASE"
        ? colors.success
        : colors.warning;

  const modeLabel =
    mode === "SALE"
      ? t("saleMode")
      : mode === "PURCHASE"
        ? t("purchaseMode")
        : t("creditMode");

  const confirmLabel =
    mode === "SALE"
      ? t("confirmSale")
      : mode === "PURCHASE"
        ? t("confirmPurchase")
        : t("confirmCredit");

  const handleBarcode = useCallback(
    (data: string) => {
      const product = products.find((p) => p.barcode === data);
      if (!product) {
        Alert.alert(
          t("unknownBarcode"),
          `${t("unknownMsg")}\n${data}`,
          [
            {
              text: t("ignore"),
              style: "cancel",
              onPress: () => setTimeout(() => setScanned(false), 600),
            },
            {
              text: t("register"),
              onPress: () => {
                setScanned(false);
                router.push({
                  pathname: "/product-form",
                  params: { barcode: data },
                });
              },
            },
          ],
        );
        return;
      }

      const displayName = rtl && product.nameAr ? product.nameAr : product.name;

      setScanQueue((prev) => {
        const existing = prev.find((i) => i.barcode === data);
        if (existing) {
          return prev.map((i) =>
            i.barcode === data ? { ...i, qty: i.qty + 1 } : i,
          );
        }
        return [
          ...prev,
          {
            barcode: data,
            name: displayName,
            qty: 1,
            unit: product.unit,
            price: product.price ?? 0,
          },
        ];
      });
      setTimeout(() => setScanned(false), 1000);
    },
    [products, rtl, t],
  );

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      Vibration.vibrate(80);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      handleBarcode(data);
    },
    [scanned, handleBarcode],
  );

  const submitManual = () => {
    if (!manualCode.trim()) return;
    const code = manualCode.trim();
    setManualCode("");
    setManualOpen(false);
    handleBarcode(code);
  };

  const removeItem = (barcode: string) =>
    setScanQueue((prev) => prev.filter((i) => i.barcode !== barcode));

  const adjustQty = (barcode: string, delta: number) => {
    setScanQueue((prev) =>
      prev
        .map((i) =>
          i.barcode === barcode ? { ...i, qty: i.qty + delta } : i,
        )
        .filter((i) => i.qty > 0),
    );
  };

  const performCommit = async (name?: string) => {
    try {
      await commitQueue(scanQueue, mode, name);
      setScanQueue([]);
      setPersonName("");
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      Alert.alert("✓", t("savedSuccess"));
    } catch {
      Alert.alert("Error", t("dbError"));
    }
  };

  const confirmTransaction = () => {
    if (!scanQueue.length) return;
    if (mode === "CREDIT") {
      setPersonOpen(true);
      return;
    }
    Alert.alert(
      t("confirmTitle"),
      t("confirmMsg", totalItems, scanQueue.length),
      [
        { text: t("cancel"), style: "cancel" },
        { text: confirmLabel, onPress: () => performCommit() },
      ],
    );
  };

  const submitPersonAndCommit = () => {
    if (!personName.trim()) {
      Alert.alert("", t("personRequired"));
      return;
    }
    const name = personName.trim();
    setPersonOpen(false);
    performCommit(name);
  };

  useEffect(() => {
    if (!isWeb && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission, isWeb]);

  const styles = useStyles();
  const headerTopPadding = Platform.OS === "web" ? 67 : insets.top;

  const cycleMode = () => {
    setMode((m) => {
      const idx = MODE_CYCLE.indexOf(m);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]!;
    });
  };

  const renderCameraArea = () => {
    if (isWeb) {
      return (
        <View style={[styles.cameraFallback, { backgroundColor: "#0a0a0a" }]}>
          <Feather name="camera-off" size={42} color="#94a3b8" />
          <Text style={styles.fallbackText}>
            Camera scanning is mobile-only
          </Text>
          <Text style={styles.fallbackSub}>
            Use manual entry or open this app in Expo Go on your phone.
          </Text>
        </View>
      );
    }

    if (!permission) {
      return (
        <View style={styles.cameraFallback}>
          <Feather name="camera" size={42} color="#94a3b8" />
          <Text style={styles.fallbackText}>{t("cameraRequest")}</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.cameraFallback}>
          <Feather name="camera-off" size={42} color={colors.destructive} />
          <Text style={styles.fallbackText}>{t("cameraDenied")}</Text>
          <Text style={styles.fallbackSub}>{t("cameraHint")}</Text>
          <TouchableOpacity
            style={styles.permButton}
            onPress={requestPermission}
          >
            <Text style={styles.permButtonText}>{t("grantPermission")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={StyleSheet.absoluteFillObject}>
        {cameraActive && (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: [
                "ean13",
                "ean8",
                "upc_a",
                "upc_e",
                "code128",
                "code39",
                "qr",
                "pdf417",
                "itf14",
              ],
            }}
            onBarcodeScanned={scanned ? undefined : onScanned}
          />
        )}
        <View style={styles.reticle} />
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.cameraBox}>
        {renderCameraArea()}

        <View
          style={[
            styles.topBar,
            { top: headerTopPadding + 8 },
            rtl && styles.rowReverse,
          ]}
        >
          <TouchableOpacity
            style={styles.iconHeaderBtn}
            onPress={() => router.push("/settings")}
          >
            <Feather name="settings" size={18} color="white" />
          </TouchableOpacity>

          <Text style={styles.modeLabel}>{modeLabel}</Text>

          <TouchableOpacity
            style={[styles.modeBtn, { backgroundColor: modeColor }]}
            onPress={cycleMode}
          >
            <Feather name="repeat" size={14} color="white" />
            <Text style={styles.modeBtnText}>{t("switchMode")}</Text>
          </TouchableOpacity>
        </View>

        {lowStockCount > 0 && (
          <TouchableOpacity
            style={[
              styles.lowBadge,
              { backgroundColor: colors.warning },
              rtl ? styles.leftBadge : styles.rightBadge,
            ]}
            onPress={() => router.push("/(tabs)/products?lowOnly=1")}
          >
            <Feather name="alert-triangle" size={12} color="white" />
            <Text style={styles.lowBadgeText}>
              {t("lowStock", lowStockCount)}
            </Text>
          </TouchableOpacity>
        )}

        <View
          style={[
            styles.cameraActions,
            rtl ? styles.actionsLeft : styles.actionsRight,
          ]}
        >
          <TouchableOpacity
            style={styles.pauseBtn}
            onPress={() => setManualOpen(true)}
          >
            <Feather name="edit-3" size={16} color="white" />
          </TouchableOpacity>
          {canUseCamera && (
            <TouchableOpacity
              style={styles.pauseBtn}
              onPress={() => setCameraActive((c) => !c)}
            >
              <Feather
                name={cameraActive ? "pause" : "play"}
                size={16}
                color="white"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.listArea}>
        <View style={[styles.listHeader, rtl && styles.rowReverse]}>
          <Text
            style={[
              styles.listTitle,
              { color: colors.foreground },
              rtl && styles.rtlText,
            ]}
          >
            {t("scannedItems")}
            {scanQueue.length > 0 && (
              <Text style={styles.qtyHint}> {t("items", totalItems)}</Text>
            )}
          </Text>
          {scanQueue.length > 0 && (
            <TouchableOpacity
              onPress={() =>
                Alert.alert(t("clearAllTitle"), t("clearAllMsg"), [
                  { text: t("cancel"), style: "cancel" },
                  {
                    text: t("clearAll"),
                    style: "destructive",
                    onPress: () => setScanQueue([]),
                  },
                ])
              }
            >
              <Text style={[styles.clearAllBtn, { color: colors.destructive }]}>
                {t("clearAll")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {scanQueue.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="maximize" size={42} color={colors.border} />
            <Text style={[styles.emptyText, rtl && styles.rtlText]}>
              {t("scanPrompt")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={scanQueue}
            keyExtractor={(i) => i.barcode}
            contentContainerStyle={{ paddingBottom: 8 }}
            scrollEnabled
            renderItem={({ item }) => (
              <View
                style={[
                  styles.row,
                  { backgroundColor: colors.card },
                  rtl && styles.rowReverse,
                ]}
              >
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
                  <Text
                    style={[
                      styles.rowBarcode,
                      { color: colors.mutedForeground },
                      rtl && styles.rtlText,
                    ]}
                  >
                    {item.barcode}
                    {item.price > 0
                      ? ` · ${item.price.toFixed(2)} ${t("perUnit")}`
                      : ""}
                  </Text>
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={[
                      styles.qtyBtn,
                      { backgroundColor: colors.secondary },
                    ]}
                    onPress={() => adjustQty(item.barcode, -1)}
                  >
                    <Text
                      style={[styles.qtyBtnText, { color: colors.foreground }]}
                    >
                      −
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.qtyNum, { color: colors.foreground }]}>
                    {item.qty}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.qtyBtn,
                      { backgroundColor: colors.secondary },
                    ]}
                    onPress={() => adjustQty(item.barcode, 1)}
                  >
                    <Text
                      style={[styles.qtyBtnText, { color: colors.foreground }]}
                    >
                      +
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.amtBox}>
                  {item.price > 0 ? (
                    <Text
                      style={[
                        styles.amtText,
                        { color: colors.foreground },
                      ]}
                    >
                      {(item.price * item.qty).toFixed(2)}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => removeItem(item.barcode)}
                  style={[
                    styles.delBtn,
                    { backgroundColor: colors.destructive },
                  ]}
                >
                  <Feather name="trash-2" size={15} color="white" />
                </TouchableOpacity>
              </View>
            )}
          />
        )}

        {scanQueue.length > 0 && totalAmount > 0 && (
          <View
            style={[
              styles.totalRow,
              { backgroundColor: colors.secondary },
              rtl && styles.rowReverse,
            ]}
          >
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
              {t("queueTotal")}
            </Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>
              {totalAmount.toFixed(2)}
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={confirmTransaction}
          activeOpacity={0.85}
          disabled={!scanQueue.length}
          style={[
            styles.confirmBtn,
            {
              backgroundColor: modeColor,
              opacity: scanQueue.length ? 1 : 0.4,
              marginBottom: insets.bottom + 70,
            },
          ]}
        >
          <Feather name="check-circle" size={20} color="white" />
          <Text style={[styles.confirmText, rtl && styles.rtlText]}>
            {confirmLabel}
            {scanQueue.length > 0 ? ` ${t("items", totalItems)}` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Manual entry modal */}
      <Modal
        visible={manualOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setManualOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t("manualEntry")}
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: colors.border, color: colors.foreground },
              ]}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder={t("enterBarcode")}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="default"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.secondary }]}
                onPress={() => {
                  setManualCode("");
                  setManualOpen(false);
                }}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                  {t("cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={submitManual}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {t("add")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Person name modal (for credit) */}
      <Modal
        visible={personOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPersonOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t("personName")}
            </Text>
            <View
              style={[
                styles.creditSummary,
                { backgroundColor: colors.secondary },
              ]}
            >
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                {t("items_n", totalItems)}
                {totalAmount > 0 ? `  ·  ${totalAmount.toFixed(2)}` : ""}
              </Text>
            </View>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: colors.border, color: colors.foreground },
              ]}
              value={personName}
              onChangeText={setPersonName}
              placeholder={t("enterPersonName")}
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.secondary }]}
                onPress={() => setPersonOpen(false)}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                  {t("cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.warning }]}
                onPress={submitPersonAndCommit}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {t("confirmCredit")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function useStyles() {
  return StyleSheet.create({
    container: { flex: 1 },
    rtlText: { textAlign: "right", writingDirection: "rtl" },
    rowReverse: { flexDirection: "row-reverse" },

    cameraBox: { flex: 1.2, backgroundColor: "#0a0a0a", overflow: "hidden" },
    cameraFallback: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 10,
      padding: 20,
      backgroundColor: "#0a0a0a",
    },
    fallbackText: { color: "white", fontWeight: "700", fontSize: 15 },
    fallbackSub: { color: "#94a3b8", fontSize: 12, textAlign: "center" },
    permButton: {
      backgroundColor: "white",
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 24,
      marginTop: 12,
    },
    permButtonText: { color: "#0a0a0a", fontWeight: "700" },

    reticle: {
      position: "absolute",
      alignSelf: "center",
      top: "32%",
      width: 240,
      height: 130,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.25)",
    },
    corner: {
      position: "absolute",
      width: 22,
      height: 22,
      borderColor: "white",
      borderWidth: 2.5,
    },
    cornerTL: {
      top: "32%",
      left: "50%",
      marginLeft: -120,
      borderRightWidth: 0,
      borderBottomWidth: 0,
      borderTopLeftRadius: 6,
    },
    cornerTR: {
      top: "32%",
      right: "50%",
      marginRight: -120,
      borderLeftWidth: 0,
      borderBottomWidth: 0,
      borderTopRightRadius: 6,
    },
    cornerBL: {
      top: "32%",
      marginTop: 110,
      left: "50%",
      marginLeft: -120,
      borderRightWidth: 0,
      borderTopWidth: 0,
      borderBottomLeftRadius: 6,
    },
    cornerBR: {
      top: "32%",
      marginTop: 110,
      right: "50%",
      marginRight: -120,
      borderLeftWidth: 0,
      borderTopWidth: 0,
      borderBottomRightRadius: 6,
    },

    topBar: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 14,
      gap: 8,
    },
    iconHeaderBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.18)",
    },
    modeLabel: {
      flex: 1,
      color: "white",
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: 0.5,
      textAlign: "center",
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    modeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
    },
    modeBtnText: { color: "white", fontWeight: "700", fontSize: 12 },

    lowBadge: {
      position: "absolute",
      bottom: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 20,
    },
    rightBadge: { right: 14 },
    leftBadge: { left: 14 },
    lowBadgeText: { color: "white", fontSize: 12, fontWeight: "700" },

    cameraActions: {
      position: "absolute",
      bottom: 14,
      flexDirection: "row",
      gap: 8,
    },
    actionsRight: { right: 14 },
    actionsLeft: { left: 14 },

    pauseBtn: {
      backgroundColor: "rgba(255,255,255,0.22)",
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },

    listArea: { flex: 1, paddingHorizontal: 14, paddingTop: 12 },
    listHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    listTitle: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
    qtyHint: { fontSize: 12, fontWeight: "400" },
    clearAllBtn: { fontSize: 13, fontWeight: "600" },

    emptyState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 10,
      opacity: 0.6,
    },
    emptyText: { color: "#94a3b8", fontSize: 14, textAlign: "center" },

    row: {
      flexDirection: "row",
      alignItems: "center",
      padding: 11,
      borderRadius: 12,
      marginBottom: 7,
      gap: 8,
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 3,
      elevation: 1,
    },
    rowInfo: { flex: 1 },
    rowName: { fontWeight: "700", fontSize: 13 },
    rowBarcode: { fontSize: 10, marginTop: 2 },
    qtyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    qtyBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    qtyBtnText: { fontSize: 18, fontWeight: "700", lineHeight: 20 },
    qtyNum: { fontSize: 16, fontWeight: "800", minWidth: 22, textAlign: "center" },

    amtBox: { minWidth: 50, alignItems: "flex-end" },
    amtText: { fontSize: 13, fontWeight: "700" },

    delBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },

    totalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      marginTop: 4,
    },
    totalLabel: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    totalValue: { fontSize: 18, fontWeight: "800" },

    confirmBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
      marginTop: 8,
    },
    confirmText: { color: "white", fontWeight: "700", fontSize: 15 },

    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    modalCard: { borderRadius: 16, padding: 20, gap: 14 },
    modalTitle: { fontSize: 16, fontWeight: "700" },
    modalInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    modalActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
    modalBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
    },
    creditSummary: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
  });
}
