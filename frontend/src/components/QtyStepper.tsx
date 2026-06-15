// Reusable QtyStepper — shows either "+ Add" button OR a "- N +" stepper if qty > 0
// Useful across Search, Product, Scan-Result screens so the user always sees
// "what's already in cart".
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";

type Props = {
  qty: number;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** if true, render compact (icon-only) when qty=0 */
  compact?: boolean;
  size?: "sm" | "md";
  testID?: string;
};

export function QtyStepper({
  qty,
  onAdd,
  onInc,
  onDec,
  loading,
  disabled,
  compact,
  size = "md",
  testID,
}: Props) {
  const isSmall = size === "sm";
  const dim = isSmall ? 30 : 36;

  if (loading) {
    return (
      <View style={[styles.add, { height: dim, paddingHorizontal: 14 }]}>
        <ActivityIndicator color="#FFF" size="small" />
      </View>
    );
  }

  if (!qty || qty <= 0) {
    return (
      <TouchableOpacity
        style={[styles.add, { height: dim, paddingHorizontal: compact ? 0 : 14, width: compact ? dim : undefined }, disabled && { opacity: 0.5 }]}
        onPress={onAdd}
        disabled={disabled}
        testID={testID}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={isSmall ? 16 : 18} color="#FFF" />
        {!compact && <Text style={[styles.addText, isSmall && { fontSize: 11 }]}>Add</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.stepper, { height: dim }]} testID={testID}>
      <TouchableOpacity onPress={onDec} style={[styles.iconBtn, { width: dim - 6, height: dim - 6 }]} hitSlop={6}>
        <Ionicons name={qty === 1 ? "trash-outline" : "remove"} size={isSmall ? 14 : 16} color={colors.primary} />
      </TouchableOpacity>
      <Text style={[styles.qty, isSmall && { fontSize: 12 }]} testID={`${testID}-qty`}>{qty}</Text>
      <TouchableOpacity onPress={onInc} style={[styles.iconBtn, { width: dim - 6, height: dim - 6 }]} hitSlop={6}>
        <Ionicons name="add" size={isSmall ? 14 : 16} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  add: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addText: { color: "#FFF", fontWeight: "800", fontSize: 12.5 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryBg,
    borderRadius: radius.md,
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  iconBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  qty: {
    fontWeight: "800",
    color: colors.primary,
    fontSize: 13.5,
    minWidth: 22,
    textAlign: "center",
  },
});
