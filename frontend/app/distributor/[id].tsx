import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function DistributorDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/distributors/${id}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Distributor" showBack />
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const d = data.distributor;
  const pct = Math.round((d.credit_used / d.credit_limit) * 100);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title={d.short_name} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <View style={styles.hero}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>{d.short_name.charAt(0)}</Text>
          </View>
          <Text style={styles.heroName}>{d.name}</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text style={styles.heroMeta}>{d.rating}</Text>
            </View>
            <Text style={styles.heroMeta}>•</Text>
            <Text style={styles.heroMeta}>{d.location}</Text>
            <Text style={styles.heroMeta}>•</Text>
            <Text style={styles.heroMeta}>{d.delivery_time}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Min Order</Text>
            <Text style={styles.infoValue}>{formatINRFull(d.min_order)}</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Discount</Text>
            <Text style={styles.infoValue}>{d.discount_label}</Text>
          </View>
        </View>

        <View style={styles.creditCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={styles.creditTitle}>Credit Used</Text>
            <Text style={styles.creditPct}>{pct}%</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%` }]} />
          </View>
          <Text style={styles.creditMeta}>
            {formatINRFull(d.credit_used)} of {formatINRFull(d.credit_limit)} limit
          </Text>
        </View>

        <Text style={styles.section}>Categories</Text>
        <View style={styles.chipRow}>
          {d.categories.map((c: string, i: number) => (
            <View key={i} style={styles.chip}>
              <Text style={styles.chipText}>{c}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Products from this distributor ({data.products.length})</Text>
        {data.products.map((p: any) => (
          <TouchableOpacity
            key={p.id}
            style={styles.product}
            onPress={() => router.push(`/product/${p.id}`)}
          >
            <Text style={{ fontSize: 24 }}>{p.image_emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.pName}>{p.name}</Text>
              <Text style={styles.pMeta}>
                {p.manufacturer} • {p.pack}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.pPrice}>{formatINRFull(p.ptr)}</Text>
              <Text style={styles.pMrp}>MRP {formatINRFull(p.mrp)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { alignItems: "center", padding: 22, backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: 14 },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarText: { color: "#FFF", fontSize: 24, fontWeight: "800" },
  heroName: { fontSize: 18, fontWeight: "800", color: colors.text, marginTop: 12, textAlign: "center" },
  heroMeta: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  infoGrid: { flexDirection: "row", gap: 10, marginBottom: 14 },
  infoCard: { flex: 1, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  infoLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  infoValue: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 4 },
  creditCard: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 14 },
  creditTitle: { fontWeight: "700", color: colors.text, fontSize: 13 },
  creditPct: { fontWeight: "800", color: colors.text },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.primary },
  creditMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 6 },
  section: { fontWeight: "800", fontSize: 14, color: colors.text, marginTop: 8, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  chipText: { fontSize: 12, color: colors.text, fontWeight: "600" },
  product: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  pName: { fontWeight: "700", color: colors.text, fontSize: 13 },
  pMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  pPrice: { fontWeight: "800", color: colors.text, fontSize: 14 },
  pMrp: { color: colors.textTertiary, fontSize: 10, textDecorationLine: "line-through", marginTop: 2 },
});
