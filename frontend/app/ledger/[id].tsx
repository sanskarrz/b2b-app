// Vendor Ledger — per-distributor full transaction history
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

const TYPE_META: Record<string, { icon: any; color: string; label: string }> = {
  bill: { icon: "document-text", color: "#DC2626", label: "Bill" },
  payment: { icon: "checkmark-circle", color: "#16A34A", label: "Payment" },
  credit_note: { icon: "remove-circle", color: "#F59E0B", label: "Credit Note" },
  debit_note: { icon: "add-circle", color: "#7C3AED", label: "Debit Note" },
};

function formatDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso || "";
  }
}

export default function Ledger() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "bill" | "payment" | "credit_note" | "debit_note">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/ledger/${id}`);
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Ledger" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const s = data.summary;
  const dist = data.distributor;
  const creditPct = s.credit_limit > 0 ? Math.min((s.credit_used / s.credit_limit) * 100, 100) : 0;
  const entries = filter === "all" ? data.entries : data.entries.filter((e: any) => e.type === filter);
  // Reverse for newest-first display
  const sorted = [...entries].reverse();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title={dist.short_name} subtitle="Ledger" showBack
        rightIcons={[
          { name: "chatbubble-ellipses-outline", onPress: () => router.push(`/chat/${id}`), testID: "ledger-chat" },
        ]}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
          <Text style={styles.heroLabel}>Closing Balance</Text>
          <Text style={styles.heroValue}>{formatINRFull(Math.abs(s.closing_balance))}</Text>
          <Text style={styles.heroSub}>
            {s.closing_balance > 0 ? "You owe distributor" : s.closing_balance < 0 ? "Distributor owes you" : "Settled"}
          </Text>
          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.heroAction}
              onPress={() => router.push(`/dist-invoices/${id}`)}
              testID="ledger-pay"
            >
              <Ionicons name="card-outline" size={14} color="#FFF" />
              <Text style={styles.heroActionText}>Pay</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroAction}
              onPress={() => router.push({ pathname: "/credit-note/new", params: { distributor_id: id } })}
            >
              <Ionicons name="document-text-outline" size={14} color="#FFF" />
              <Text style={styles.heroActionText}>Credit Note</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroAction}
              onPress={() => router.push(`/chat/${id}`)}
            >
              <Ionicons name="chatbubble-outline" size={14} color="#FFF" />
              <Text style={styles.heroActionText}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroAction}
              onPress={() => {
                const base = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
                const url = `${base}/api/ledger/${id}/export?format=csv&days=90`;
                if (typeof window !== "undefined") {
                  window.open(url, "_blank");
                }
              }}
              testID="ledger-export"
            >
              <Ionicons name="download-outline" size={14} color="#FFF" />
              <Text style={styles.heroActionText}>Export CSV</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Summary cards */}
        <View style={styles.summaryGrid}>
          <SummaryTile label="Total Bills" value={s.total_bills} color={colors.danger} icon="document-text" />
          <SummaryTile label="Total Paid" value={s.total_paid} color={colors.success} icon="checkmark-circle" />
          <SummaryTile label="Due" value={s.total_due} color={colors.warning} icon="time" />
          <SummaryTile label="Overdue" value={s.total_overdue} color={colors.danger} icon="alert-circle" />
          <SummaryTile label="Credit Notes" value={s.credit_notes} color={colors.success} icon="remove-circle" />
          <SummaryTile label="Debit Notes" value={s.debit_notes} color="#7C3AED" icon="add-circle" />
        </View>

        {/* Credit Line card */}
        <View style={styles.creditCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="card" size={16} color={colors.primary} />
              <Text style={styles.creditTitle}>Credit Line</Text>
            </View>
            <Text style={styles.creditDays}>{dist.credit_days || 30} days</Text>
          </View>
          <View style={styles.creditTrack}>
            <View
              style={[
                styles.creditFill,
                {
                  width: `${creditPct}%`,
                  backgroundColor:
                    creditPct >= 85 ? colors.danger : creditPct >= 60 ? colors.warning : colors.success,
                },
              ]}
            />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
            <Text style={styles.creditFootText}>Used {formatINRFull(s.credit_used)}</Text>
            <Text style={styles.creditFootText}>Limit {formatINRFull(s.credit_limit)}</Text>
          </View>
          <View style={styles.creditAvailRow}>
            <Text style={styles.creditAvailLabel}>Available now</Text>
            <Text style={styles.creditAvailVal}>{formatINRFull(s.credit_available)}</Text>
          </View>
          {(dist.settlement_discount_pct || 0) > 0 && (
            <View style={styles.settleNote}>
              <Ionicons name="pricetag" size={11} color={colors.accent} />
              <Text style={styles.settleText}>
                Early settlement discount: {dist.settlement_discount_pct}% within {dist.credit_days || 30}d
              </Text>
            </View>
          )}
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {[
            { k: "all", l: "All", n: data.entries.length },
            { k: "bill", l: "Bills", n: data.entries.filter((e: any) => e.type === "bill").length },
            { k: "payment", l: "Payments", n: data.entries.filter((e: any) => e.type === "payment").length },
            { k: "credit_note", l: "CN", n: data.entries.filter((e: any) => e.type === "credit_note").length },
            { k: "debit_note", l: "DN", n: data.entries.filter((e: any) => e.type === "debit_note").length },
          ].map((f) => (
            <TouchableOpacity
              key={f.k}
              style={[styles.filterChip, filter === f.k && styles.filterChipActive]}
              onPress={() => setFilter(f.k as any)}
            >
              <Text style={[styles.filterText, filter === f.k && styles.filterTextActive]}>
                {f.l} {f.n > 0 && `(${f.n})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Entries */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          {sorted.length === 0 ? (
            <Text style={styles.emptyEntries}>No entries here.</Text>
          ) : (
            sorted.map((e: any, idx: number) => {
              const meta = TYPE_META[e.type];
              return (
                <View key={e.id + idx} style={styles.entryRow}>
                  <View style={[styles.entryIconBox, { backgroundColor: meta.color + "15", borderColor: meta.color + "30" }]}>
                    <Ionicons name={meta.icon} size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryLabel}>{e.label}</Text>
                    <Text style={styles.entryDate}>{formatDate(e.date)} • {meta.label}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.entryAmount, { color: e.debit > 0 ? colors.danger : colors.success }]}>
                      {e.debit > 0 ? "−" : "+"}{formatINRFull(e.debit || e.credit)}
                    </Text>
                    <Text style={styles.entryBalance}>Bal: {formatINRFull(Math.abs(e.running_balance))}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryTile({ label, value, color, icon }: { label: string; value: number; color: string; icon: any }) {
  return (
    <View style={styles.sumTile}>
      <View style={[styles.sumIcon, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={12} color={color} />
      </View>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={styles.sumValue}>{formatINRFull(value)}</Text>
    </View>
  );
}

const SHADOW = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  android: { elevation: 2 },
  default: {},
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 18,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  heroValue: { color: "#FFF", fontSize: 32, fontWeight: "800", letterSpacing: -0.8, marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "500", marginTop: 4 },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  heroAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  heroActionText: { color: "#FFF", fontWeight: "700", fontSize: 12 },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    marginTop: 16,
    gap: 8,
  },
  sumTile: {
    flexBasis: "31.5%",
    flexGrow: 1,
    padding: 10,
    backgroundColor: "#FFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...(SHADOW as object),
  },
  sumIcon: {
    width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center",
  },
  sumLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "600", marginTop: 5 },
  sumValue: { fontSize: 14, color: colors.text, fontWeight: "800", marginTop: 2 },

  creditCard: {
    margin: 16,
    marginBottom: 0,
    padding: 14,
    backgroundColor: "#FFF",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBg,
    ...(SHADOW as object),
  },
  creditTitle: { color: colors.text, fontWeight: "800", fontSize: 13.5 },
  creditDays: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  creditTrack: { height: 8, backgroundColor: colors.surface, borderRadius: 999, overflow: "hidden" },
  creditFill: { height: "100%", borderRadius: 999 },
  creditFootText: { fontSize: 11, color: colors.textSecondary, fontWeight: "500" },
  creditAvailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  creditAvailLabel: { fontSize: 12, color: colors.text, fontWeight: "700" },
  creditAvailVal: { fontSize: 18, color: colors.primary, fontWeight: "800" },
  settleNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  settleText: { fontSize: 11, color: colors.textSecondary, fontWeight: "500" },

  filterRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 11, color: colors.textSecondary, fontWeight: "700" },
  filterTextActive: { color: "#FFF" },

  emptyEntries: { textAlign: "center", color: colors.textSecondary, fontSize: 12, marginTop: 30 },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
    gap: 12,
  },
  entryIconBox: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  entryLabel: { fontWeight: "700", color: colors.text, fontSize: 13 },
  entryDate: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  entryAmount: { fontWeight: "800", fontSize: 14 },
  entryBalance: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
});
