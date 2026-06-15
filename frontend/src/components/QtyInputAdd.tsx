// QtyInputAdd — Qty text input + ➕ button to BATCH-ADD typed qty.
// If qty already in cart, shows stepper instead (− N +).
import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";

type Props = {
  inCartQty: number;
  onAdd: (qty: number) => void | Promise<void>;
  onInc: () => void | Promise<void>;
  onDec: () => void | Promise<void>;
  loading?: boolean;
  maxQty?: number;
  testID?: string;
};

export function QtyInputAdd({ inCartQty, onAdd, onInc, onDec, loading, maxQty, testID }: Props) {
  const [val, setVal] = useState("");

  if (inCartQty > 0) {
    return (
      <View style={styles.stepper} testID={testID}>
        <TouchableOpacity onPress={onDec} style={styles.stepBtn} hitSlop={6}>
          <Ionicons name={inCartQty === 1 ? "trash-outline" : "remove"} size={16} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.stepQty}>{inCartQty}</Text>
        <TouchableOpacity onPress={onInc} style={styles.stepBtn} hitSlop={6}>
          <Ionicons name="add" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>
    );
  }

  const num = parseInt(val, 10) || 0;

  const handleAdd = () => {
    const qty = num > 0 ? num : 1; // tap + alone = +1
    if (maxQty != null && qty > maxQty) {
      // caller can choose to show toast — for now, pass qty anyway; backend stock guard will handle
    }
    onAdd(qty);
    setVal("");
  };

  return (
    <View style={styles.row} testID={testID}>
      <TextInput
        value={val}
        onChangeText={(v) => setVal(v.replace(/\D/g, "").slice(0, 4))}
        placeholder="Qty"
        placeholderTextColor={colors.textTertiary}
        keyboardType="number-pad"
        style={styles.input}
        testID={`${testID}-input`}
      />
      <TouchableOpacity
        style={[styles.plus, loading && { opacity: 0.6 }]}
        onPress={handleAdd}
        disabled={loading}
        testID={`${testID}-plus`}
        activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="add" size={20} color="#FFF" />}
      </TouchableOpacity>
    </View>
  );
}

const SHADOW = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
  default: {},
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: {
    width: 54,
    height: 34,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  plus: {
    width: 38,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...(SHADOW as object),
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryBg,
    borderRadius: 10,
    paddingHorizontal: 4,
    height: 34,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  stepBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  stepQty: {
    fontWeight: "800",
    color: colors.primary,
    fontSize: 13.5,
    minWidth: 22,
    textAlign: "center",
  },
});
