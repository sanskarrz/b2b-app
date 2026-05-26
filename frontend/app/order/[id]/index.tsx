import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

const STEPS = ["placed", "processing", "shipped", "delivered"];
const STEP_LABELS = ["Order Placed", "Processing", "Shipped", "Delivered"];

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
  const canConfirm = (order.status === "shipped" || order.status === "processing") && !order.delivery_confirmed;
  const isConfirmed = order.delivery_confirmed;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title={order.code} subtitle={order.distributor_name} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {/* Invoice number badge */}
        {order.invoice_number && (
          <View style={styles.invBadge}>
            <View style={{ flex: 1 }}>
              <Text style={styles.invLabel}>Distributor Invoice #</Text>
              <Text style={styles.invNumber}>{order.invoice_number}</Text>
            </View>
            <View style={styles.invActions}>
              {order.has_bill_pdf ? (
                <>
                  <TouchableOpacity style={styles.invBtn} testID="dl-pdf">
                    <Ionicons name="document-text" size={14} color={colors.danger} />
                    <Text style={[styles.invBtnText, { color: colors.danger }]}>PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.invBtn} testID="dl-xls">
                    <Ionicons name="grid-outline" size={14} color={colors.success} />
                    <Text style={[styles.invBtnText, { color: colors.success }]}>XLS</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.noBillPill}>
                  <Ionicons name="alert-circle-outline" size={11} color={colors.warning} />
                  <Text style={styles.noBillText}>Bill not uploaded by distributor</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Confirm Delivery CTA */}
        {canConfirm && (
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => router.push(`/order/${id}/confirm-delivery`)}
            testID="open-confirm"
          >
            <LinearGradient colors={[colors.success, "#15803D"]} style={styles.confirmBtnInner}>
              <Ionicons name="checkmark-done-circle" size={18} color="#FFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.confirmBtnText}>Confirm Delivery</Text>
                <Text style={styles.confirmBtnSub}>Verify items received & finalize payment</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Already-confirmed status */}
        {isConfirmed && (
          <View style={styles.confirmedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.confirmedTitle}>Delivery Confirmed</Text>
              <Text style={styles.confirmedSub}>
                Paid {formatINRFull(order.amount_paid_on_delivery || 0)} • Credit {formatINRFull(order.amount_on_credit || 0)}
                {order.qty_short_value > 0 && ` • Short ${formatINRFull(order.qty_short_value)}`}
              </Text>
            </View>
          </View>
        )}

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
                  {it.qty} × {formatINRFull(it.price)}{it.free_qty > 0 ? ` + ${it.free_qty} free` : ""}
                </Text>
                {(it.batch || it.expiry) && (
                  <Text style={styles.itemBatch}>Batch {it.batch || "—"} • Exp {it.expiry || "—"}</Text>
                )}
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

  // Invoice badge
  invBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: "#FFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 12,
  },
  invLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "700", letterSpacing: 0.3 },
  invNumber: { fontWeight: "800", color: colors.text, fontSize: 14, fontFamily: "monospace", marginTop: 2 },
  invActions: { flexDirection: "row", gap: 6 },
  invBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  invBtnText: { fontWeight: "800", fontSize: 11 },
  noBillPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.warningBg, maxWidth: 160 },
  noBillText: { color: colors.warning, fontSize: 10, fontWeight: "700" },

  // Confirm delivery CTA
  confirmBtn: { marginBottom: 12, borderRadius: 14, overflow: "hidden" },
  confirmBtnInner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  confirmBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  confirmBtnSub: { color: "rgba(255,255,255,0.9)", fontSize: 11, marginTop: 1, fontWeight: "500" },

  // Confirmed badge
  confirmedBadge: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: colors.successBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.success, marginBottom: 12 },
  confirmedTitle: { fontWeight: "800", color: "#15803D", fontSize: 13 },
  confirmedSub: { color: colors.text, fontSize: 11, marginTop: 2 },

  // Batch info
  itemBatch: { fontSize: 10, color: colors.textSecondary, marginTop: 3, fontFamily: "monospace" },
});
