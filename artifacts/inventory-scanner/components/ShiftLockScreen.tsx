import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useT } from "@/contexts/InventoryContext";
import { type ShiftId, useShift } from "@/contexts/ShiftContext";
import { useColors } from "@/hooks/useColors";

const SHIFT_COLORS: Record<ShiftId, string> = {
  1: "#3b82f6",
  2: "#8b5cf6",
};

const SHIFT_ICONS: Record<ShiftId, "sun" | "moon"> = {
  1: "sun",
  2: "moon",
};

export function ShiftLockScreen() {
  const { unlock } = useShift();
  const { t, rtl } = useT();
  const colors = useColors();

  const [selectedShift, setSelectedShift] = useState<ShiftId | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const shiftColor =
    selectedShift ? SHIFT_COLORS[selectedShift] : colors.primary;

  const handleDigit = (d: string) => {
    if (pin.length >= 4 || checking) return;
    setError(false);
    setPin((prev) => prev + d);
  };

  const handleDelete = () => {
    if (checking) return;
    setError(false);
    setPin((prev) => prev.slice(0, -1));
  };

  const handleConfirm = async (currentPin: string) => {
    if (!selectedShift || currentPin.length === 0 || checking) return;
    setChecking(true);
    const ok = await unlock(selectedShift, currentPin);
    if (!ok) {
      setError(true);
      setPin("");
      Vibration.vibrate(300);
    }
    setChecking(false);
  };

  useEffect(() => {
    if (pin.length === 4 && selectedShift) {
      handleConfirm(pin);
    }
  }, [pin]);

  const selectShift = (s: ShiftId) => {
    setSelectedShift(s);
    setPin("");
    setError(false);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.appName, { color: colors.foreground }]}>
          {t("appName")}
        </Text>
        <Text style={[styles.subTitle, { color: colors.mutedForeground }]}>
          {t("selectShift")}
        </Text>
        <Text style={[styles.credit, { color: colors.mutedForeground }]}>
          developed by Amr Mo
        </Text>
      </View>

      <View style={[styles.shiftRow, rtl && styles.rowRev]}>
        {([1, 2] as ShiftId[]).map((s) => {
          const active = selectedShift === s;
          const c = SHIFT_COLORS[s];
          return (
            <TouchableOpacity
              key={s}
              style={[
                styles.shiftBtn,
                {
                  backgroundColor: active ? c : colors.card,
                  borderColor: active ? c : colors.border,
                },
              ]}
              onPress={() => selectShift(s)}
              activeOpacity={0.8}
            >
              <Feather
                name={SHIFT_ICONS[s]}
                size={30}
                color={active ? "#fff" : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.shiftLabel,
                  { color: active ? "#fff" : colors.foreground },
                ]}
              >
                {t(s === 1 ? "shift1" : "shift2")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedShift !== null && (
        <View style={styles.pinSection}>
          <Text
            style={[
              styles.pinPrompt,
              { color: error ? "#ef4444" : colors.mutedForeground },
            ]}
          >
            {error ? t("wrongPin") : t("enterPin")}
          </Text>

          <View style={[styles.dotsRow, rtl && styles.rowRev]}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i < pin.length
                        ? error
                          ? "#ef4444"
                          : shiftColor
                        : colors.border,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.numpad}>
            {(
              [
                ["1", "2", "3"],
                ["4", "5", "6"],
                ["7", "8", "9"],
                ["", "0", "⌫"],
              ] as string[][]
            ).map((row, ri) => (
              <View key={ri} style={[styles.numRow, rtl && styles.rowRev]}>
                {row.map((key, ki) =>
                  key === "" ? (
                    <View key={ki} style={styles.numCell} />
                  ) : key === "⌫" ? (
                    <TouchableOpacity
                      key={ki}
                      style={[
                        styles.numCell,
                        styles.numKey,
                        { backgroundColor: colors.secondary },
                      ]}
                      onPress={handleDelete}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name="delete"
                        size={20}
                        color={colors.foreground}
                      />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      key={ki}
                      style={[
                        styles.numCell,
                        styles.numKey,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          borderWidth: 1,
                        },
                      ]}
                      onPress={() => handleDigit(key)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.numText, { color: colors.foreground }]}
                      >
                        {key}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>
            ))}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: "center", paddingTop: 48, paddingBottom: 36 },
  appName: {
    fontSize: 30,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  subTitle: { fontSize: 15, fontWeight: "500" },
  credit: { marginTop: 8, fontSize: 12, fontWeight: "500" },

  rowRev: { flexDirection: "row-reverse" },

  shiftRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 28,
    marginBottom: 36,
  },
  shiftBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
    borderRadius: 18,
    borderWidth: 2,
    gap: 10,
  },
  shiftLabel: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },

  pinSection: { alignItems: "center", paddingHorizontal: 28 },
  pinPrompt: { fontSize: 13, fontWeight: "600", marginBottom: 18 },
  dotsRow: { flexDirection: "row", gap: 18, marginBottom: 36 },
  dot: { width: 14, height: 14, borderRadius: 7 },

  numpad: { width: "100%", maxWidth: 288, gap: 12 },
  numRow: { flexDirection: "row", gap: 12, justifyContent: "center" },
  numCell: { width: 82, height: 66, borderRadius: 14 },
  numKey: { alignItems: "center", justifyContent: "center" },
  numText: { fontSize: 22, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
