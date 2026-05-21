import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function ProfitReport() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/reports/profit")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Profit Report" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Profit Report" subtitle="Estimated margin earned" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Total Margin Earned</Text>
          <Text style={styles.heroValue}>{formatINRFull(data.summary.total_margin)}</Text>
          <View style={styles.heroRow}>
            <Stat label="On Revenue" value={formatINRFull(data.summary.total_value)} />
            <Stat label="Avg Margin" value={`${data.summary.avg_margin_pct.toFixed(1)}%`} />
          </View>
        </View>

        <Text style={styles.section}>Top profit-generating SKUs</Text>
        {data.top_sku.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No orders yet — start ordering to track profit</Text>
          </View>
        ) : (
          data.top_sku.map((s: any, i: number) => (
            <View key={s.product_id} style={styles.row}>
              <View style={styles.rank}>
                <Text style={styles.rankText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.meta}>
                  {s.qty} units sold • {s.margin_pct.toFixed(1)}% margin
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.margin}>+{formatINRFull(s.margin)}</Text>
                <Text style={styles.value}>of {formatINRFull(s.value)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: {
    padding: 22,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    marginBottom: 20,
  },
  heroLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  heroValue: { fontSize: 40, fontWeight: "900", color: colors.primary, letterSpacing: -1, marginTop: 6 },
  heroRow: { flexDirection: "row", gap: 24, marginTop: 16 },
  stat: { alignItems: "center" },
  statLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },
  statValue: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 4 },
  section: { fontWeight: "800", fontSize: 14, color: colors.text, marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  rankText: { color: "#FFF", fontWeight: "800", fontSize: 12 },
  name: { fontWeight: "700", color: colors.text, fontSize: 13 },
  meta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  margin: { color: "#15803D", fontWeight: "800", fontSize: 14 },
  value: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
  empty: { alignItems: "center", padding: 40, gap: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
});
