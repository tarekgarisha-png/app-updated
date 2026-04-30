import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";

import { useT } from "@/contexts/InventoryContext";
import { useColors } from "@/hooks/useColors";

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (barcode: string) => void;
};

export function BarcodeScannerModal({ visible, onClose, onScanned }: Props) {
  const colors = useColors();
  const { t, rtl } = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState<boolean>(false);
  const isWeb = Platform.OS === "web";

  const handleScan = ({ data }: { data: string }) => {
    if (locked || !data) return;
    setLocked(true);
    Vibration.vibrate(80);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onScanned(data);
    setTimeout(() => {
      setLocked(false);
      onClose();
    }, 200);
  };

  const renderBody = () => {
    if (isWeb) {
      return (
        <View style={styles.center}>
          <Feather name="camera-off" size={48} color="#94a3b8" />
          <Text style={styles.bigText}>Camera scanning is mobile-only</Text>
          <Text style={styles.smallText}>
            Open this app in Expo Go on your phone to scan barcodes.
          </Text>
        </View>
      );
    }
    if (!permission) {
      return (
        <View style={styles.center}>
          <Text style={styles.smallText}>{t("cameraRequest")}</Text>
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={styles.center}>
          <Feather name="camera-off" size={42} color={colors.destructive} />
          <Text style={styles.bigText}>{t("cameraDenied")}</Text>
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
      <>
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
          onBarcodeScanned={locked ? undefined : handleScan}
        />
        <View style={styles.reticle} />
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>{t("scanPrompt")}</Text>
        </View>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View style={styles.container}>
        {renderBody()}
        <TouchableOpacity
          style={[styles.closeBtn, rtl ? styles.closeLeft : styles.closeRight]}
          onPress={onClose}
        >
          <Feather name="x" size={22} color="white" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  bigText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },
  smallText: { color: "#94a3b8", fontSize: 13, textAlign: "center" },
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
    top: "38%",
    width: 260,
    height: 150,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "white",
    borderWidth: 3,
  },
  cornerTL: {
    top: "38%",
    left: "50%",
    marginLeft: -130,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: "38%",
    right: "50%",
    marginRight: -130,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    top: "38%",
    marginTop: 130,
    left: "50%",
    marginLeft: -130,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    top: "38%",
    marginTop: 130,
    right: "50%",
    marginRight: -130,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 6,
  },

  hintBox: {
    position: "absolute",
    top: "62%",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
  },
  hintText: { color: "white", fontWeight: "600", fontSize: 13 },

  closeBtn: {
    position: "absolute",
    top: 56,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeRight: { right: 16 },
  closeLeft: { left: 16 },
});
