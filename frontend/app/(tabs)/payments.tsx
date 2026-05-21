import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";
import { confirm } from "@/src/components/confirm";

const TABS = [
  { key: "all", label: "All" },
  { key: "due", label: "Due" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

export default function Payments() {
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ total_due: 0, total_overdue: 0 });
  const [accSummary, setAccSummary] = useState<any>(null);
  const [distributors, setDistributors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, dists, acc] = await Promise.all([
        api(`/payments${tab !== "all" ? `?status=${tab}` : ""}`),
        api(`/distributors`),
        api("/payments/summary"),
      ]);
      setItems(data.items);
      setSummary({ total_due: data.total_due, total_overdue: data.total_overdue });
      setDistributors(dists);
      setAccSummary(acc);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pay = (id: string) => {
    confirm("Pay Invoice", "Proceed to UPI payment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Pay Now",
        onPress: async () => {
          await api(`/payments/${id}/pay`, { method: "POST" });
          load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Payments" subtitle="Outstanding & history" />

      <View style={styles.summary}>
        <View style={[styles.sumCard, { backgroundColor: colors.surface }]}>
          <Text style={styles.sumLabel}>Total Due</Text>
          <Text style={styles.sumValue}>{formatINRFull(summary.total_due)}</Text>
        </View>
        <View style={[styles.sumCard, { backgroundColor: colors.dangerBg }]}>
          <Text style={[styles.sumLabel, { color: colors.danger }]}>Overdue</Text>
          <Text style={[styles.sumValue, { color: colors.danger }]}>{formatINRFull(summary.total_overdue)}</Text>
        </View>
      </View>

      {/* Accounting Summary */}
      {accSummary && (
        <View style={styles.accGrid}>
          <TouchableOpacity style={styles.accTile} onPress={() => router.push("/cash-flow")} testID="acc-cashflow">
            <View style={[styles.accIcon, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name="calendar" size={14} color={colors.primary} />
            </View>
            <Text style={styles.accLabel}>This Week</Text>
            <Text style={styles.accVal}>{formatINRFull(accSummary.due_this_week)}</Text>
          </TouchableOpacity>
          <View style={styles.accTile}>
            <View style={[styles.accIcon, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="trending-up" size={14} color={colors.warning} />
            </View>
            <Text style={styles.accLabel}>Credit Taken</Text>
            <Text style={styles.accVal}>{formatINRFull(accSummary.total_credit_taken)}</Text>
          </View>
          <View style={styles.accTile}>
            <View style={[styles.accIcon, { backgroundColor: colors.successBg }]}>
              <Ionicons name="checkmark-done" size={14} color={colors.success} />
            </View>
            <Text style={styles.accLabel}>Paid 30d</Text>
            <Text style={styles.accVal}>{formatINRFull(accSummary.paid_last_30d)}</Text>
          </View>
          <TouchableOpacity style={styles.accTile} onPress={() => router.push("/returns")}>
            <View style={[styles.accIcon, { backgroundColor: colors.warningBg }]}>
              <Ionicons name="lock-closed" size={14} color={colors.warning} />
            </View>
            <Text style={styles.accLabel}>On Hold</Text>
            <Text style={styles.accVal}>{formatINRFull(accSummary.on_hold_disputes)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Vendor Ledger carousel */}
      <View style={{ marginTop: 18 }}>
        <View style={styles.ledgerHead}>
          <Text style={styles.ledgerHeadTitle}>Vendor Ledgers</Text>
          <Text style={styles.ledgerHeadSub}>Tap to open full ledger</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        >
          {distributors.map((d: any) => {
            const used = d.credit_used || 0;
            const limit = d.credit_limit || 1;
            const pct = Math.min((used / limit) * 100, 100);
            const avail = limit - used;
            const colorBar = pct >= 85 ? colors.danger : pct >= 60 ? colors.warning : colors.success;
            return (
              <TouchableOpacity
                key={d.id}
                style={styles.ledgerCard}
                onPress={() => router.push(`/ledger/${d.id}`)}
                testID={`ledger-${d.id}`}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={styles.ledgerAvatar}>
                    <Text style={styles.ledgerAvatarText}>{d.short_name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ledgerName} numberOfLines={1}>{d.short_name}</Text>
                    <Text style={styles.ledgerDays}>{d.credit_days || 30}d credit</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </View>
                <View style={[styles.ledgerTrack, { marginTop: 10 }]}>
                  <View style={[styles.ledgerFill, { width: `${pct}%`, backgroundColor: colorBar }]} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Text style={styles.ledgerFootText}>Avail {formatINRFull(avail)}</Text>
                  <Text style={[styles.ledgerFootText, { color: colorBar, fontWeight: "700" }]}>{pct.toFixed(0)}%</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="card-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No payments here</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 30 }}
          renderItem={({ item }) => {
            const overdue = item.status === "overdue";
            const paid = item.status === "paid";
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/invoice/${item.id}`)}
                testID={`invoice-${item.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.invCode}>{item.invoice_code}</Text>
                  <Text style={styles.distName}>{item.distributor_name}</Text>
                  <Text style={[styles.due, overdue && { color: colors.danger }]}>
                    {paid
                      ? "Paid"
                      : overdue
                      ? `Overdue by ${Math.abs(item.days_to_due)} days`
                      : item.days_to_due === 0
                      ? "Due today"
                      : `Pending ${item.days_to_due} days`}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.amount}>{formatINRFull(item.amount)}</Text>
                  {!paid && (
                    <TouchableOpacity
                      style={[styles.payBtn, overdue && { backgroundColor: colors.danger }]}
                      onPress={(e) => { e.stopPropagation?.(); pay(item.id); }}
                      testID={`pay-${item.id}`}
                    >
                      <Text style={styles.payBtnText}>Pay</Text>
                    </TouchableOpacity>
                  )}
                  {paid && (
                    <View style={styles.paidPill}>
                      <Ionicons name="checkmark-circle" size={12} color="#15803D" />
                      <Text style={styles.paidText}>Paid</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  summary: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 12 },
  sumCard: { flex: 1, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  sumLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  sumValue: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  tabs: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  tabTextActive: { color: "#FFF" },
  card: {
    flexDirection: "row",
    padding: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 10,
    gap: 12,
  },
  invCode: { fontWeight: "800", fontSize: 14, color: colors.text },
  distName: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  due: { color: colors.textSecondary, fontSize: 12, marginTop: 6, fontWeight: "600" },
  amount: { fontWeight: "800", fontSize: 16, color: colors.text },
  payBtn: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  payBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  paidPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
  },
  paidText: { color: "#15803D", fontWeight: "700", fontSize: 11 },
  empty: { alignItems: "center", marginTop: 80, gap: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },

  ledgerHead: {
    paddingHorizontal: 16,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  ledgerHeadTitle: { fontSize: 14, color: colors.text, fontWeight: "800" },
  ledgerHeadSub: { fontSize: 10, color: colors.textSecondary, fontWeight: "600" },
  ledgerCard: {
    width: 200,
    padding: 12,
    backgroundColor: "#FFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ledgerAvatar: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: colors.primaryBg, borderWidth: 1, borderColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  ledgerAvatarText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  ledgerName: { fontSize: 12.5, fontWeight: "800", color: colors.text },
  ledgerDays: { fontSize: 10, color: colors.textSecondary, marginTop: 2, fontWeight: "600" },
  ledgerTrack: { height: 6, backgroundColor: colors.surface, borderRadius: 999, overflow: "hidden" },
  ledgerFill: { height: "100%", borderRadius: 999 },
  ledgerFootText: { fontSize: 10, color: colors.textSecondary, fontWeight: "600" },

  // Accounting tiles
  accGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    marginTop: 14,
    gap: 8,
  },
  accTile: {
    flexBasis: "47%",
    flexGrow: 1,
    padding: 10,
    backgroundColor: "#FFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accIcon: {
    width: 24, height: 24, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  accLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "700", marginTop: 6 },
  accVal: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 2 },
});
