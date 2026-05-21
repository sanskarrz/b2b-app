// Cash Flow Calendar — visual heat-map of upcoming dues
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull, formatINR } from "@/src/theme";

export default function CashFlow() {
  const router = useRouter();
  const [summary, setSummary] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        api("/payments/summary"),
        api("/payments?status=all"),
      ]);
      setSummary(s);
      setPayments(p.items.filter((x: any) => x.status === "due" || x.status === "overdue"));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !summary) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Cash Flow" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  // Build a 30-day grid (today → +30)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { date: Date; iso: string; amount: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split("T")[0];
    days.push({ date: d, iso, amount: summary.schedule_by_day[iso] || 0 });
  }
  const maxAmount = Math.max(...days.map((d) => d.amount), 1);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Cash Flow" subtitle="Upcoming payments" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {/* Hero summary */}
        <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>Due this week</Text>
            <Text style={styles.heroValue}>{formatINRFull(summary.due_this_week)}</Text>
            <Text style={styles.heroSub}>+ {formatINRFull(summary.due_next_week)} next week</Text>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="calendar" size={28} color="#FFF" />
          </View>
        </LinearGradient>

        {/* Stat cards */}
        <View style={styles.statRow}>
          <View style={[styles.statCard, { borderTopColor: colors.warning, borderTopWidth: 3 }]}>
            <Text style={styles.statLabel}>This month</Text>
            <Text style={styles.statVal}>{formatINR(summary.due_this_month)}</Text>
          </View>
          <View style={[styles.statCard, { borderTopColor: colors.danger, borderTopWidth: 3 }]}>
            <Text style={styles.statLabel}>Overdue</Text>
            <Text style={[styles.statVal, { color: colors.danger }]}>{formatINR(summary.total_overdue)}</Text>
          </View>
          <View style={[styles.statCard, { borderTopColor: colors.success, borderTopWidth: 3 }]}>
            <Text style={styles.statLabel}>Paid 30d</Text>
            <Text style={[styles.statVal, { color: colors.success }]}>{formatINR(summary.paid_last_30d)}</Text>
          </View>
        </View>

        {/* On hold (disputed) */}
        {summary.on_hold_disputes > 0 && (
          <View style={styles.holdCard}>
            <Ionicons name="lock-closed" size={16} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.holdTitle}>On Hold (Disputes)</Text>
              <Text style={styles.holdSub}>Pending credit notes from returns under review</Text>
            </View>
            <Text style={styles.holdAmount}>{formatINRFull(summary.on_hold_disputes)}</Text>
          </View>
        )}

        {/* 30-day calendar */}
        <Text style={styles.sectionTitle}>Next 30 Days</Text>
        <View style={styles.calendar}>
          {days.map((d, i) => {
            const isToday = i === 0;
            const intensity = d.amount > 0 ? Math.min(d.amount / maxAmount, 1) : 0;
            return (
              <View key={d.iso} style={styles.dayCell}>
                <Text style={[styles.dayWeek, isToday && { color: colors.primary, fontWeight: "800" }]}>
                  {d.date.toLocaleDateString("en", { weekday: "short" }).charAt(0)}
                </Text>
                <View
                  style={[
                    styles.dayBox,
                    isToday && styles.dayBoxToday,
                    {
                      backgroundColor: d.amount > 0
                        ? `rgba(220, 38, 38, ${0.15 + intensity * 0.75})`
                        : colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.dayNum, d.amount > 0 && intensity > 0.4 && { color: "#FFF", fontWeight: "800" }]}>
                    {d.date.getDate()}
                  </Text>
                </View>
                {d.amount > 0 && (
                  <Text style={styles.dayAmt}>{formatINR(d.amount)}</Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Upcoming list */}
        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Upcoming Payments</Text>
        {payments.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming dues 🎉</Text>
        ) : (
          payments.map((p) => {
            const overdue = p.status === "overdue";
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.payCard, overdue && { borderColor: colors.danger }]}
                onPress={() => router.push(`/invoice/${p.id}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.payInv}>{p.invoice_code}</Text>
                  <Text style={styles.payDist}>{p.distributor_name}</Text>
                  <Text style={[styles.payDue, overdue && { color: colors.danger, fontWeight: "700" }]}>
                    {overdue ? `Overdue by ${Math.abs(p.days_to_due)}d` : p.days_to_due === 0 ? "Due today" : `Due in ${p.days_to_due}d`}
                  </Text>
                </View>
                <Text style={styles.payAmount}>{formatINRFull(p.amount)}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 18, borderRadius: radius.lg, marginBottom: 14,
  },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
  heroValue: { color: "#FFF", fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "500", marginTop: 2 },
  heroIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1, padding: 12,
    backgroundColor: "#FFF",
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  statLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "600", marginBottom: 4 },
  statVal: { fontSize: 16, color: colors.text, fontWeight: "800" },

  holdCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, marginBottom: 14,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md, borderWidth: 1, borderColor: "#FCD34D",
  },
  holdTitle: { fontWeight: "800", color: colors.warning, fontSize: 13 },
  holdSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  holdAmount: { fontWeight: "800", fontSize: 14, color: colors.warning },

  sectionTitle: { fontSize: 14, color: colors.text, fontWeight: "800", marginBottom: 10 },
  calendar: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  dayCell: { width: "13.5%", alignItems: "center" },
  dayWeek: { fontSize: 9, color: colors.textSecondary, fontWeight: "600", marginBottom: 3 },
  dayBox: {
    width: 36, height: 36,
    borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  dayBoxToday: { borderColor: colors.primary, borderWidth: 2 },
  dayNum: { fontSize: 12, color: colors.text, fontWeight: "600" },
  dayAmt: { fontSize: 8, color: colors.textSecondary, marginTop: 2, fontWeight: "600" },

  emptyText: { color: colors.textSecondary, textAlign: "center", padding: 30, fontSize: 13 },
  payCard: {
    flexDirection: "row", alignItems: "center",
    padding: 12, marginBottom: 8,
    backgroundColor: "#FFF",
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
  },
  payInv: { fontWeight: "800", color: colors.text, fontSize: 13 },
  payDist: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  payDue: { color: colors.textSecondary, fontSize: 11, marginTop: 4, fontWeight: "600" },
  payAmount: { fontWeight: "800", color: colors.text, fontSize: 16 },
});
