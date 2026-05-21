import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

const STEPS = ["placed", "processing", "shipped", "delivered"];
const STEP_LABELS = ["Order Placed", "Processing", "Shipped", "Delivered"];

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/orders/${id}`)
      .then(setOrder)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Order" showBack />
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const stepIdx = STEPS.indexOf(order.status);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title={order.code} subtitle={order.distributor_name} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {/* Status tracker */}
        <View style={styles.tracker}>
          {STEPS.map((s, i) => {
            const active = i <= stepIdx;
            return (
              <View key={s} style={styles.step}>
                <View style={[styles.stepCircle, active && styles.stepActive]}>
                  {active ? (
                    <Ionicons name="checkmark" size={14} color="#FFF" />
                  ) : (
                    <Text style={styles.stepNum}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, active && { color: colors.text, fontWeight: "700" }]}>
                  {STEP_LABELS[i]}
                </Text>
                {i < STEPS.length - 1 && (
                  <View style={[styles.stepLine, i < stepIdx && { backgroundColor: colors.primary }]} />
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Items ({order.items.length})</Text>
          {order.items.map((it: any, i: number) => (
            <View key={i} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{it.name}</Text>
                <Text style={styles.itemMeta}>
                  {it.qty} × {formatINRFull(it.price)}
                </Text>
              </View>
              <Text style={styles.itemTotal}>{formatINRFull(it.qty * it.price)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Subtotal</Text>
            <Text style={styles.rowVal}>{formatINRFull(order.total)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Delivery</Text>
            <Text style={[styles.rowVal, { color: "#16A34A" }]}>FREE</Text>
          </View>
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 }]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalVal}>{formatINRFull(order.total)}</Text>
          </View>
        </View>

        {order.eta && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="time-outline" size={18} color={colors.text} />
              <Text style={{ fontWeight: "700", color: colors.text }}>
                ETA: {new Date(order.eta).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tracker: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  step: { flex: 1, alignItems: "center", position: "relative" },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepActive: { backgroundColor: colors.text },
  stepNum: { color: "#FFF", fontWeight: "800", fontSize: 12 },
  stepLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 6, textAlign: "center" },
  stepLine: { position: "absolute", top: 14, right: -50, width: 100, height: 2, backgroundColor: colors.border, zIndex: -1 },
  card: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 12 },
  sectionTitle: { fontWeight: "800", fontSize: 14, color: colors.text, marginBottom: 10 },
  itemRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName: { fontWeight: "700", color: colors.text, fontSize: 13 },
  itemMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  itemTotal: { fontWeight: "800", color: colors.text, fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { color: colors.textSecondary, fontSize: 13 },
  rowVal: { color: colors.text, fontWeight: "700", fontSize: 13 },
  totalLabel: { fontWeight: "800", color: colors.text, fontSize: 14 },
  totalVal: { fontWeight: "800", color: colors.text, fontSize: 18 },
});
