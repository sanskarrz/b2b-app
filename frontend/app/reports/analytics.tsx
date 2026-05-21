import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function Analytics() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/reports/analytics")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Sales Analytics" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const maxMonth = Math.max(1, ...data.by_month.map((m: any) => m.spend));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Sales Analytics" subtitle="Last 6 months overview" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {/* Summary */}
        <View style={styles.grid}>
          <KPI label="Total Spend" value={formatINRFull(data.summary.total_spend)} accent />
          <KPI label="Total Orders" value={String(data.summary.total_orders)} />
          <KPI label="Avg Order" value={formatINRFull(data.summary.avg_order_value)} />
          <KPI label="Delivered" value={String(data.summary.delivered_count)} />
        </View>

        {/* By month chart */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Monthly Spend</Text>
          {data.by_month.length === 0 ? (
            <Text style={styles.empty}>No order history yet</Text>
          ) : (
            <View style={styles.chart}>
              {data.by_month.map((m: any, i: number) => (
                <View key={i} style={styles.bar}>
                  <Text style={styles.barValue}>{formatINRFull(m.spend)}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${(m.spend / maxMonth) * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{m.month}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Top distributors */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Distributors</Text>
          {data.top_distributors.length === 0 ? (
            <Text style={styles.empty}>No distributors yet</Text>
          ) : (
            data.top_distributors.map((d: any, i: number) => (
              <View key={i} style={styles.distRow}>
                <View style={styles.rank}>
                  <Text style={styles.rankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.distName}>{d.name}</Text>
                  <Text style={styles.distMeta}>{d.orders} orders</Text>
                </View>
                <Text style={styles.distSpend}>{formatINRFull(d.spend)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[styles.kpi, accent && { backgroundColor: colors.surface, borderColor: colors.primary }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  kpi: {
    width: "47%",
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  kpiLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  kpiValue: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  card: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 12 },
  cardTitle: { fontWeight: "800", fontSize: 14, color: colors.text, marginBottom: 12 },
  empty: { color: colors.textSecondary, fontSize: 13, textAlign: "center", padding: 20 },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 140, paddingTop: 18 },
  bar: { flex: 1, alignItems: "center", gap: 4 },
  barValue: { fontSize: 9, color: colors.textSecondary, fontWeight: "700" },
  barTrack: { width: 22, flex: 1, backgroundColor: colors.surface, borderRadius: 6, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", backgroundColor: colors.primary, borderRadius: 6 },
  barLabel: { fontSize: 9, color: colors.textSecondary, fontWeight: "600", marginTop: 4 },
  distRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  rank: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  rankText: { color: "#FFF", fontWeight: "800", fontSize: 12 },
  distName: { fontWeight: "700", color: colors.text, fontSize: 13 },
  distMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  distSpend: { fontWeight: "800", color: colors.text, fontSize: 14 },
});
