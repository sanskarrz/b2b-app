// Order Delivery Confirmation — the critical step solving the "what did I actually receive" problem
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";
import { confirm } from "@/src/components/confirm";

export default function ConfirmDelivery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Editable lines: qty_received per product
  const [lines, setLines] = useState<Record<string, { qty: number; free: number; notes: string }>>({});
  const [paidNow, setPaidNow] = useState("");
  const [onCredit, setOnCredit] = useState("0");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [raiseDispute, setRaiseDispute] = useState(false);

  useEffect(() => {
    api(`/orders/${id}`).then((o: any) => {
      setOrder(o);
      const init: any = {};
      (o.items || []).forEach((it: any) => {
        init[it.product_id] = {
          qty: it.qty_ordered ?? it.qty,
          free: it.free_qty ?? 0,
          notes: "",
        };
      });
      setLines(init);
      // Default: full payment via order's payment method
      if (o.payment_method === "credit") {
        setOnCredit(String(o.total));
        setPaidNow("0");
      } else {
        setPaidNow(String(o.total));
        setOnCredit("0");
      }
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Confirm Delivery" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  // Compute new total based on edited qty
  const newTotal = (order.items || []).reduce((s: number, it: any) => {
    const ln = lines[it.product_id];
    const qr = ln?.qty ?? it.qty;
    return s + it.price * qr;
  }, 0);
  const qtyShort = order.total - newTotal;

  const setLine = (pid: string, key: "qty" | "free" | "notes", val: any) => {
    setLines((prev) => ({ ...prev, [pid]: { ...prev[pid], [key]: val } }));
  };

  const submit = async () => {
    const paid = parseFloat(paidNow) || 0;
    const credit = parseFloat(onCredit) || 0;
    if (Math.abs(paid + credit - newTotal) > 1) {
      confirm("Payment mismatch", `Paid + Credit must equal received total (${formatINRFull(newTotal)}).`, [{ text: "OK" }]);
      return;
    }
    setSubmitting(true);
    try {
      const items = Object.entries(lines).map(([pid, l]) => ({
        product_id: pid,
        qty_received: l.qty,
        free_qty: l.free,
        notes: l.notes,
      }));
      const res: any = await api(`/orders/${id}/confirm-delivery`, {
        method: "POST",
        body: {
          items,
          paid_now: paid,
          on_credit: credit,
          photo_url: photoUrl,
          notes,
          raise_dispute: raiseDispute,
        },
      });
      confirm(
        "Delivery confirmed ✓",
        qtyShort > 0
          ? `Short ${formatINRFull(qtyShort)} auto-debit-noted to distributor.`
          : "Inventory & ledger updated successfully.",
        [
          { text: "View Order", onPress: () => router.replace(`/order/${id}`) },
          { text: "Go to Orders", onPress: () => router.replace("/(tabs)/orders") },
        ]
      );
    } catch (e: any) {
      confirm("Error", e.message, [{ text: "OK" }]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Confirm Delivery" subtitle={order.invoice_number || order.code} showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          {/* Hero summary */}
          <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
            <Ionicons name="checkmark-done-circle" size={32} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>Verify what you received</Text>
              <Text style={styles.heroDist}>{order.distributor_name}</Text>
              <Text style={styles.heroAmt}>{formatINRFull(newTotal)} <Text style={styles.heroOrig}>(ordered {formatINRFull(order.total)})</Text></Text>
            </View>
          </LinearGradient>

          {/* Items */}
          <Text style={styles.sectionTitle}>Items Received ({order.items?.length || 0})</Text>
          {(order.items || []).map((it: any) => {
            const ln = lines[it.product_id] || { qty: it.qty, free: 0, notes: "" };
            const isShort = ln.qty < (it.qty_ordered ?? it.qty);
            return (
              <View key={it.product_id} style={[styles.itemCard, isShort && { borderColor: colors.warning }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{it.name}</Text>
                    <Text style={styles.itemMeta}>PTR ₹{it.price} • Batch {it.batch || "—"} • Exp {it.expiry || "—"}</Text>
                    <Text style={styles.itemOrdered}>Ordered: {it.qty_ordered ?? it.qty}</Text>
                  </View>
                  {isShort && (
                    <View style={styles.shortPill}>
                      <Ionicons name="alert-circle" size={11} color={colors.warning} />
                      <Text style={styles.shortText}>Short</Text>
                    </View>
                  )}
                </View>
                <View style={styles.qtyRow}>
                  <View style={styles.qtyCol}>
                    <Text style={styles.qtyLabel}>Received</Text>
                    <View style={styles.qtyControl}>
                      <TouchableOpacity onPress={() => setLine(it.product_id, "qty", Math.max(0, ln.qty - 1))} style={styles.qtyBtn}>
                        <Ionicons name="remove" size={14} color={colors.text} />
                      </TouchableOpacity>
                      <TextInput
                        value={String(ln.qty)}
                        onChangeText={(t) => setLine(it.product_id, "qty", parseInt(t) || 0)}
                        keyboardType="number-pad"
                        style={styles.qtyInput}
                      />
                      <TouchableOpacity onPress={() => setLine(it.product_id, "qty", ln.qty + 1)} style={styles.qtyBtn}>
                        <Ionicons name="add" size={14} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.qtyCol}>
                    <Text style={styles.qtyLabel}>Free Qty</Text>
                    <TextInput
                      value={String(ln.free)}
                      onChangeText={(t) => setLine(it.product_id, "free", parseInt(t) || 0)}
                      keyboardType="number-pad"
                      style={[styles.qtyInput, { width: "100%", textAlign: "center" }]}
                    />
                  </View>
                </View>
              </View>
            );
          })}

          {/* Payment Split */}
          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Payment Split</Text>
          <View style={styles.paymentCard}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payLabel}>Paying Now (Cash/UPI)</Text>
                <TextInput value={paidNow} onChangeText={setPaidNow} keyboardType="decimal-pad" style={styles.payInput} placeholder="0" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.payLabel}>On Credit</Text>
                <TextInput value={onCredit} onChangeText={setOnCredit} keyboardType="decimal-pad" style={styles.payInput} placeholder="0" />
              </View>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalVal}>{formatINRFull((parseFloat(paidNow) || 0) + (parseFloat(onCredit) || 0))}</Text>
            </View>
            <View style={[styles.totalLine, { paddingTop: 0 }]}>
              <Text style={styles.totalLabel}>Bill Amount</Text>
              <Text style={styles.totalVal}>{formatINRFull(newTotal)}</Text>
            </View>
          </View>

          {/* Photo (optional) + Dispute */}
          <View style={styles.disputeCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.disputeTitle}>Raise dispute</Text>
                <Text style={styles.disputeSub}>For damaged/wrong items. Photo required.</Text>
              </View>
              <Switch value={raiseDispute} onValueChange={setRaiseDispute} trackColor={{ true: colors.danger }} testID="dispute-toggle" />
            </View>
            {raiseDispute && (
              <TouchableOpacity style={styles.photoBtn} onPress={() => setPhotoUrl("https://placehold.co/400x300?text=Delivery+Photo")}>
                <Ionicons name={photoUrl ? "checkmark-circle" : "camera-outline"} size={16} color={photoUrl ? colors.success : colors.primary} />
                <Text style={styles.photoBtnText}>{photoUrl ? "Photo attached" : "Attach photo (camera)"}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Notes */}
          <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Notes (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Any feedback or remarks for distributor..."
            placeholderTextColor={colors.textTertiary}
            style={styles.notesInput}
            multiline
          />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
            onPress={submit}
            disabled={submitting}
            testID="confirm-submit"
          >
            <LinearGradient colors={[colors.success, "#15803D"]} style={styles.submitInner}>
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                  <Text style={styles.submitText}>Confirm Delivery</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={14} color={colors.info} />
            <Text style={styles.infoText}>
              Distributor will be notified. Short qty auto-creates a debit note. Credit portion goes to your invoice list.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { flexDirection: "row", gap: 14, alignItems: "center", padding: 16, borderRadius: radius.lg, marginBottom: 14 },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600" },
  heroDist: { color: "#FFF", fontWeight: "800", fontSize: 15, marginTop: 2 },
  heroAmt: { color: "#FFF", fontWeight: "800", fontSize: 20, marginTop: 4 },
  heroOrig: { fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: "500" },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.text, marginBottom: 8, letterSpacing: 0.3 },
  itemCard: { padding: 12, marginBottom: 8, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  itemName: { fontWeight: "800", color: colors.text, fontSize: 13.5 },
  itemMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  itemOrdered: { fontSize: 11, color: colors.primary, fontWeight: "700", marginTop: 4 },
  shortPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.warningBg, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999 },
  shortText: { fontSize: 10, fontWeight: "800", color: colors.warning },
  qtyRow: { flexDirection: "row", gap: 12, marginTop: 10 },
  qtyCol: { flex: 1 },
  qtyLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "700", marginBottom: 4, letterSpacing: 0.3 },
  qtyControl: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, backgroundColor: "#FFF" },
  qtyBtn: { width: 32, height: 36, alignItems: "center", justifyContent: "center" },
  qtyInput: { flex: 1, textAlign: "center", fontWeight: "800", fontSize: 14, color: colors.text, padding: 0 },
  paymentCard: { padding: 12, backgroundColor: "#FFF", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  payLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "700", marginBottom: 4 },
  payInput: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: colors.text, fontWeight: "700", borderWidth: 1, borderColor: colors.border },
  totalLine: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: "700" },
  totalVal: { fontSize: 14, color: colors.text, fontWeight: "800" },
  disputeCard: { padding: 12, marginTop: 14, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  disputeTitle: { fontWeight: "800", color: colors.text, fontSize: 13 },
  disputeSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  photoBtn: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8, padding: 10, backgroundColor: colors.primaryBg, borderRadius: 8 },
  photoBtnText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  notesInput: { backgroundColor: "#FFF", borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 13, color: colors.text, minHeight: 70, textAlignVertical: "top" },
  submitBtn: { marginTop: 18, borderRadius: 14, overflow: "hidden" },
  submitInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  submitText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  infoBox: { flexDirection: "row", gap: 8, padding: 12, marginTop: 12, backgroundColor: colors.infoBg, borderRadius: 10 },
  infoText: { flex: 1, color: colors.text, fontSize: 11, lineHeight: 16 },
});
