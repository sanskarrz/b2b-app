// Margin Analyzer by Category
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function MarginAnalyzer() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api("/analytics/margin-by-category")); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Margin Analyzer" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const maxProfit = Math.max(...data.rows.map((r: any) => r.profit), 1);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Margin Analyzer" subtitle="Profit by category" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <LinearGradient colors={[colors.success, "#15803D"]} style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>Total Profit (delivered orders)</Text>
            <Text style={styles.heroValue}>{formatINRFull(data.total_profit)}</Text>
            <Text style={styles.heroSub}>From {formatINRFull(data.total_spend)} spend</Text>
          </View>
          <Ionicons name="trending-up" size={36} color="#FFF" />
        </LinearGradient>

        <Text style={styles.sectionTitle}>By Category</Text>
        {data.rows.length === 0 ? (
          <Text style={styles.empty}>No delivered orders yet. Place an order to see margin breakdown here.</Text>
        ) : (
          data.rows.map((r: any, i: number) => {
            const barPct = (r.profit / maxProfit) * 100;
            const tier = r.margin_pct >= 30 ? "high" : r.margin_pct >= 18 ? "mid" : "low";
            const tierColor = tier === "high" ? colors.success : tier === "mid" ? colors.warning : colors.danger;
            return (
              <View key={i} style={styles.row}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={styles.rankPill}><Text style={styles.rankText}>#{i + 1}</Text></View>
                    <Text style={styles.catName}>{r.category}</Text>
                  </View>
                  <View style={[styles.tierPill, { backgroundColor: tierColor + "20", borderColor: tierColor }]}>
                    <Text style={[styles.tierText, { color: tierColor }]}>{r.margin_pct}%</Text>
                  </View>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${barPct}%`, backgroundColor: tierColor }]} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Text style={styles.metaText}>Spend: {formatINRFull(r.spend)}</Text>
                  <Text style={[styles.metaText, { color: colors.success, fontWeight: "800" }]}>+{formatINRFull(r.profit)}</Text>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.tipBox}>
          <Ionicons name="bulb" size={14} color={colors.primary} />
          <Text style={styles.tipText}>
            Categories with margin {">"}30% are your <Text style={{ fontWeight: "800" }}>star earners</Text>. Push more SKUs here. Anything below 18% — review pricing or switch distributor.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radius.lg, marginBottom: 16 },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600" },
  heroValue: { color: "#FFF", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 11, marginTop: 2 },
  sectionTitle: { fontWeight: "800", color: colors.text, fontSize: 14, marginBottom: 12 },
  empty: { color: colors.textSecondary, textAlign: "center", padding: 30, fontSize: 13 },
  row: { padding: 12, marginBottom: 10, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rankPill: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  rankText: { fontWeight: "800", color: colors.text, fontSize: 11 },
  catName: { fontWeight: "800", color: colors.text, fontSize: 13.5 },
  tierPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  tierText: { fontSize: 11, fontWeight: "800" },
  barTrack: { height: 8, backgroundColor: colors.surface, borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
  metaText: { fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
  tipBox: { marginTop: 14, flexDirection: "row", padding: 12, gap: 8, backgroundColor: colors.primaryBg, borderRadius: 10 },
  tipText: { flex: 1, color: colors.text, fontSize: 11.5, lineHeight: 17 },
});
