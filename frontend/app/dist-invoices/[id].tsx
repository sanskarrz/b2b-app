// Per-Distributor Invoices — Open vs History with multi-select Pay Lump Sum
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useState, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";
import { confirm } from "@/src/components/confirm";
import { showError, showSuccess } from "@/src/components/Toast";

function formatDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso || "";
  }
}

function daysFromToday(iso?: string) {
  if (!iso) return 0;
  const due = new Date(iso).getTime();
  const now = Date.now();
  return Math.round((due - now) / (1000 * 60 * 60 * 24));
}

export default function DistributorInvoices() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [tab, setTab] = useState<"open" | "history">("open");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/distributors/${id}/invoices`);
      setData(d);
    } catch (e: any) {
      showError(e?.message || "Could not load invoices", "Load failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setSelected(new Set());
      load();
    }, [load])
  );

  const toggle = (pid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const selectAllOpen = () => {
    if (!data) return;
    if (selected.size === data.open_invoices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.open_invoices.map((p: any) => p.id)));
    }
  };

  const selectAllOverdue = () => {
    if (!data) return;
    const overdueIds = data.open_invoices.filter((p: any) => p.status === "overdue").map((p: any) => p.id);
    setSelected(new Set(overdueIds));
  };

  const selectedTotal = useMemo(() => {
    if (!data) return 0;
    return data.open_invoices
      .filter((p: any) => selected.has(p.id))
      .reduce((s: number, p: any) => s + p.amount, 0);
  }, [data, selected]);

  const payLumpSum = () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    confirm(
      "Pay Lump Sum",
      `Settle ${ids.length} invoice${ids.length > 1 ? "s" : ""} for ${formatINRFull(selectedTotal)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pay Now",
          onPress: async () => {
            setPaying(true);
            try {
              const r = await api("/payments/pay-lump-sum", {
                method: "POST",
                body: { payment_ids: ids },
              });
              setSelected(new Set());
              await load();
              showSuccess(
                `Paid ${formatINRFull(r.total_paid)} across ${r.count} invoices. Credit line restored.`,
                "Payment Successful"
              );
            } catch (e: any) {
              showError(e?.message || "Could not complete payment", "Payment failed");
            } finally {
              setPaying(false);
            }
          },
        },
      ]
    );
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Invoices" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const d = data.distributor;
  const open = data.open_invoices || [];
  const history = data.invoice_history || [];
  const overdueCount = open.filter((p: any) => p.status === "overdue").length;
  const list = tab === "open" ? open : history;
  const creditPct = Math.min(data.credit_used_pct || 0, 100);
  const barColor = creditPct >= 85 ? colors.danger : creditPct >= 60 ? colors.warning : colors.success;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar
        title={d.short_name}
        subtitle="Invoices"
        showBack
        rightIcons={[
          { name: "receipt-outline", onPress: () => router.push(`/ledger/${id}`), testID: "inv-ledger" },
        ]}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: selected.size > 0 ? 110 : 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
          <Text style={styles.heroLabel}>Outstanding</Text>
          <Text style={styles.heroValue}>{formatINRFull(data.outstanding)}</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaItem}>
              <Ionicons name="alert-circle" size={12} color="#FECACA" />
              <Text style={styles.heroMetaText}>
                {formatINRFull(data.overdue)} overdue
              </Text>
            </View>
            <Text style={styles.heroDot}>•</Text>
            <View style={styles.heroMetaItem}>
              <Ionicons name="document-text" size={12} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroMetaText}>{open.length} open</Text>
            </View>
          </View>

          {/* Credit Line mini-bar */}
          <View style={styles.heroCreditBox}>
            <View style={styles.heroCreditHead}>
              <Text style={styles.heroCreditLabel}>Credit Used</Text>
              <Text style={styles.heroCreditPct}>{creditPct.toFixed(0)}%</Text>
            </View>
            <View style={styles.heroCreditTrack}>
              <View style={[styles.heroCreditFill, { width: `${creditPct}%`, backgroundColor: barColor }]} />
            </View>
            <View style={styles.heroCreditFootRow}>
              <Text style={styles.heroCreditFoot}>{formatINRFull(data.credit_used)} of {formatINRFull(data.credit_limit)}</Text>
              <Text style={styles.heroCreditFoot}>
                {formatINRFull(Math.max(data.credit_limit - data.credit_used, 0))} avail
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tab, tab === "open" && styles.tabActive]}
            onPress={() => { setTab("open"); setSelected(new Set()); }}
            testID="tab-open"
          >
            <Text style={[styles.tabText, tab === "open" && styles.tabTextActive]}>
              Open ({open.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "history" && styles.tabActive]}
            onPress={() => { setTab("history"); setSelected(new Set()); }}
            testID="tab-history"
          >
            <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>
              History ({history.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Action chips (only on Open tab) */}
        {tab === "open" && open.length > 0 && (
          <View style={styles.actionChipRow}>
            <TouchableOpacity style={styles.chip} onPress={selectAllOpen} testID="select-all">
              <Ionicons
                name={selected.size === open.length ? "checkbox" : "square-outline"}
                size={14}
                color={colors.primary}
              />
              <Text style={styles.chipText}>
                {selected.size === open.length ? "Clear All" : "Select All"}
              </Text>
            </TouchableOpacity>
            {overdueCount > 0 && (
              <TouchableOpacity style={[styles.chip, styles.chipDanger]} onPress={selectAllOverdue} testID="select-overdue">
                <Ionicons name="alert-circle" size={14} color={colors.danger} />
                <Text style={[styles.chipText, { color: colors.danger }]}>
                  Overdue ({overdueCount})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* List */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {list.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name={tab === "open" ? "checkmark-done-circle-outline" : "time-outline"}
                size={42}
                color={colors.textTertiary}
              />
              <Text style={styles.emptyTitle}>
                {tab === "open" ? "All clear!" : "No history yet"}
              </Text>
              <Text style={styles.emptyText}>
                {tab === "open"
                  ? "You have no outstanding invoices for this distributor."
                  : "Paid invoices will show up here."}
              </Text>
            </View>
          ) : (
            list.map((p: any) => {
              const overdue = p.status === "overdue";
              const paid = p.status === "paid";
              const isSelected = selected.has(p.id);
              const dueIn = daysFromToday(p.due_date);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.row, isSelected && styles.rowSelected, overdue && !isSelected && styles.rowOverdue]}
                  onPress={() => {
                    if (tab === "open") toggle(p.id);
                    else router.push(`/invoice/${p.id}`);
                  }}
                  onLongPress={() => router.push(`/invoice/${p.id}`)}
                  testID={`inv-${p.id}`}
                  activeOpacity={0.7}
                >
                  {/* Checkbox (Open tab only) */}
                  {tab === "open" && (
                    <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                    </View>
                  )}

                  {/* Paid tick for history */}
                  {tab === "history" && (
                    <View style={[styles.checkbox, styles.checkboxPaid]}>
                      <Ionicons name="checkmark" size={14} color={colors.success} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <View style={styles.rowHead}>
                      <Text style={styles.invCode} numberOfLines={1}>
                        {p.invoice_code}
                      </Text>
                      {overdue && (
                        <View style={styles.overduePill}>
                          <Text style={styles.overduePillText}>OVERDUE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.invMeta}>
                      {paid
                        ? `Paid ${formatDate(p.paid_at || p.due_date)}`
                        : overdue
                        ? `${Math.abs(dueIn)}d overdue • Due ${formatDate(p.due_date)}`
                        : dueIn === 0
                        ? `Due today • ${formatDate(p.due_date)}`
                        : `Due in ${dueIn}d • ${formatDate(p.due_date)}`}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.amount, overdue && { color: colors.danger }]}>
                      {formatINRFull(p.amount)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => router.push(`/invoice/${p.id}`)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.viewLink}>View →</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Floating sticky pay bar */}
      {tab === "open" && selected.size > 0 && (
        <View style={styles.payBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.payBarLabel}>
              {selected.size} invoice{selected.size > 1 ? "s" : ""} selected
            </Text>
            <Text style={styles.payBarTotal}>{formatINRFull(selectedTotal)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.payBtn, paying && { opacity: 0.6 }]}
            onPress={payLumpSum}
            disabled={paying}
            testID="pay-lump-sum"
          >
            <LinearGradient
              colors={[colors.primary, "#E07636"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.payBtnInner}
            >
              {paying ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="card" size={16} color="#FFF" />
                  <Text style={styles.payBtnText}>Pay Lump Sum</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
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
  heroValue: { color: "#FFF", fontSize: 30, fontWeight: "800", letterSpacing: -0.8, marginTop: 4 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  heroMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroMetaText: { color: "rgba(255,255,255,0.95)", fontSize: 11.5, fontWeight: "600" },
  heroDot: { color: "rgba(255,255,255,0.7)", fontSize: 11 },

  heroCreditBox: {
    alignSelf: "stretch",
    marginTop: 14,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  heroCreditHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  heroCreditLabel: { color: "rgba(255,255,255,0.95)", fontSize: 11, fontWeight: "700" },
  heroCreditPct: { color: "#FFF", fontSize: 11, fontWeight: "800" },
  heroCreditTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 999,
    overflow: "hidden",
  },
  heroCreditFill: { height: "100%", borderRadius: 999 },
  heroCreditFootRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  heroCreditFoot: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "600" },

  tabsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: "700" },
  tabTextActive: { color: "#FFF" },

  actionChipRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.primaryBg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  chipDanger: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.danger + "30",
  },
  chipText: { fontSize: 11.5, color: colors.primary, fontWeight: "700" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
    ...(SHADOW as object),
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg + "60",
  },
  rowOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxPaid: { borderColor: colors.success, backgroundColor: colors.successBg },

  rowHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  invCode: { fontWeight: "800", fontSize: 13.5, color: colors.text, flex: 1 },
  invMeta: { color: colors.textSecondary, fontSize: 11.5, marginTop: 3, fontWeight: "600" },
  overduePill: {
    backgroundColor: colors.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overduePillText: { color: "#FFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  amount: { fontWeight: "800", fontSize: 15, color: colors.text },
  viewLink: { color: colors.primary, fontSize: 11, fontWeight: "700", marginTop: 3 },

  empty: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 30,
    gap: 6,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 12, textAlign: "center", lineHeight: 17 },

  // Pay bar
  payBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFF",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    ...(Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 14 },
      android: { elevation: 8 },
      default: {},
    }) as object),
  },
  payBarLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  payBarTotal: { color: colors.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.4, marginTop: 2 },
  payBtn: { borderRadius: radius.md, overflow: "hidden" },
  payBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  payBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13.5 },
});
