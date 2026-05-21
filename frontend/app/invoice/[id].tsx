import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

function formatDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [inv, setInv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api(`/payments/${id}`);
      setInv(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const onPay = async () => {
    setPaying(true);
    try {
      await api(`/payments/${id}/pay`, { method: "POST" });
      load();
    } finally {
      setPaying(false);
    }
  };

  const onShare = async () => {
    if (!inv) return;
    try {
      await Share.share({
        message: `RX Tech Invoice ${inv.invoice_code}\nDistributor: ${inv.distributor_name}\nAmount: ${formatINRFull(inv.amount)}\nDue: ${formatDate(inv.due_date)}\nStatus: ${inv.status.toUpperCase()}`,
      });
    } catch {}
  };

  const onReport = () => {
    router.push({
      pathname: "/report-issue",
      params: {
        type: "invoice",
        reference_id: id,
        reference_label: inv?.invoice_code || "",
      },
    });
  };

  if (loading || !inv) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Invoice" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const overdue = inv.status === "overdue";
  const paid = inv.status === "paid";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar
        title={inv.invoice_code}
        subtitle={inv.distributor_name}
        showBack
        rightIcons={[{ name: "share-outline", onPress: onShare, testID: "inv-share" }]}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Total Amount</Text>
          <Text style={styles.amount}>{formatINRFull(inv.amount)}</Text>
          <View style={[styles.statusPill, paid ? styles.paidPill : overdue ? styles.overduePill : styles.duePill]}>
            <Ionicons
              name={paid ? "checkmark-circle" : overdue ? "warning" : "time"}
              size={14}
              color={paid ? "#15803D" : overdue ? colors.danger : colors.warning}
            />
            <Text
              style={[
                styles.statusText,
                { color: paid ? "#15803D" : overdue ? colors.danger : "#92400E" },
              ]}
            >
              {paid
                ? `Paid${inv.paid_at ? ` on ${formatDate(inv.paid_at)}` : ""}`
                : overdue
                ? `Overdue by ${Math.abs(inv.days_to_due)} days`
                : inv.days_to_due === 0
                ? "Due Today"
                : `Pending: ${inv.days_to_due} days left`}
            </Text>
          </View>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.cardTitle}>Invoice Details</Text>
          <Row label="Invoice No." value={inv.invoice_code} />
          <Row label="Distributor" value={inv.distributor_name} />
          <Row label="Due Date" value={formatDate(inv.due_date)} />
          {paid && inv.paid_at && <Row label="Paid On" value={formatDate(inv.paid_at)} />}
          <Row label="Status" value={inv.status.toUpperCase()} />
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.cardTitle}>Charges</Text>
          <Row label="Subtotal" value={formatINRFull(inv.amount)} />
          <Row label="Taxes (incl.)" value="—" />
          <View style={styles.divider} />
          <Row label="Grand Total" value={formatINRFull(inv.amount)} bold />
        </View>

        <TouchableOpacity style={styles.reportBtn} onPress={onReport} testID="inv-report">
          <Ionicons name="flag-outline" size={16} color={colors.danger} />
          <Text style={styles.reportText}>Report a problem with this invoice</Text>
        </TouchableOpacity>
      </ScrollView>

      {!paid && (
        <View style={styles.bottomBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bbLabel}>Amount</Text>
            <Text style={styles.bbValue}>{formatINRFull(inv.amount)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.payBtn, overdue && { backgroundColor: colors.danger }]}
            onPress={onPay}
            disabled={paying}
            testID="inv-pay-btn"
          >
            <Text style={styles.payText}>{paying ? "Paying..." : "Pay Now"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontWeight: "800", fontSize: 16 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  amountCard: {
    padding: 22,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  amount: { fontSize: 36, fontWeight: "900", color: colors.text, letterSpacing: -1, marginTop: 6 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginTop: 12,
  },
  paidPill: { backgroundColor: "#DCFCE7" },
  overduePill: { backgroundColor: colors.dangerBg },
  duePill: { backgroundColor: colors.warningBg },
  statusText: { fontSize: 12, fontWeight: "800" },
  detailCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  cardTitle: { fontWeight: "800", fontSize: 14, color: colors.text, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { color: colors.textSecondary, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: 4,
  },
  reportText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    paddingBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bbLabel: { color: colors.textSecondary, fontSize: 11 },
  bbValue: { fontWeight: "800", color: colors.text, fontSize: 18 },
  payBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  payText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
