import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import QRCode from "qrcode";
import { colors, radii, spacing } from "@/theme";

interface AddressQrProps {
  value: string;
  /** Target QR module area (px); outer frame adds quiet zone padding. */
  size?: number;
  quietZone?: number;
}

export default function AddressQr({
  value,
  size = 200,
  quietZone = spacing.md,
}: AddressQrProps) {
  const { qr, cellSize, qrSize, frameSize } = useMemo(() => {
    const matrix = QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
    const cell = Math.max(4, Math.floor(size / matrix.size));
    const rendered = cell * matrix.size;
    return {
      qr: matrix,
      cellSize: cell,
      qrSize: rendered,
      frameSize: rendered + quietZone * 2,
    };
  }, [value, size, quietZone]);

  return (
    <View
      style={[
        styles.frame,
        {
          width: frameSize,
          height: frameSize,
          padding: quietZone,
        },
      ]}
    >
      <View style={{ width: qrSize, height: qrSize }}>
        {Array.from({ length: qr.size }, (_, row) => (
          <View key={`row-${row}`} style={styles.row}>
            {Array.from({ length: qr.size }, (_, col) => (
              <View
                key={`cell-${row}-${col}`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: qr.get(row, col) ? colors.navy : colors.surfaceElevated,
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
  },
});
