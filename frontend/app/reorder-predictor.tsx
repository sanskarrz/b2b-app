// Smart Reorder Predictor
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";
import { confirm } from "@/src/components/confirm";

export default function ReorderPredictor() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api("/analytics/reorder-predictor")); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addToCart = async (s: any) => {
    try {
      await api("/cart/items", {
        method: "POST",
        body: {
          product_id: s.product_id,
          distributor_id: s.product.best_distributor_id,
          qty: s.suggested_qty,
        },
      });
      confirm("Added to cart", `${s.suggested_qty} × ${s.product.name}`, [
        { text: "Go to Cart", onPress: () => router.push("/cart") },
        { text: "Continue", style: "cancel" },
      ]);
    } catch (e: any) {
      confirm("Error", e.message, [{ text: "OK" }]);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Smart Reorder" subtitle="AI-predicted from your order history" showBack />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="trending-up-outline" size={42} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>Nothing to reorder yet</Text>
          <Text style={styles.emptySub}>We need 2+ orders of a SKU to predict refill timing. Keep ordering and check back!</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          <Text style={styles.headSub}>{items.length} SKUs likely running low — ordered regularly in the past.</Text>
          {items.map((s: any) => {
            const urgPct = Math.min(s.urgency, 1.5);
            const urgColor = urgPct >= 1.2 ? colors.danger : urgPct >= 1.0 ? colors.warning : colors.success;
            return (
              <View key={s.product_id} style={styles.card}>
                <View style={styles.thumb}>
                  <Text style={{ fontSize: 24 }}>{s.product.image_emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{s.product.name}</Text>
                  <Text style={styles.salt}>{s.product.salt}</Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    <View style={[styles.urgPill, { backgroundColor: urgColor + "20", borderColor: urgColor }]}>
                      <Ionicons name="alarm-outline" size={10} color={urgColor} />
                      <Text style={[styles.urgText, { color: urgColor }]}>
                        {s.days_since}d since last (cycle ~{s.cycle_days}d)
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.suggest}>
                    Suggested: <Text style={{ fontWeight: "800", color: colors.text }}>{s.suggested_qty} units</Text> • {formatINRFull(s.product.ptr * s.suggested_qty)}
                  </Text>
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={() => addToCart(s)} testID={`reorder-add-${s.product_id}`}>
                  <Ionicons name="add" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { alignItems: "center", marginTop: 60, gap: 10, paddingHorizontal: 30 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  emptySub: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  headSub: { color: colors.textSecondary, fontSize: 12, marginBottom: 14 },
  card: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12, marginBottom: 10, backgroundColor: "#FFF", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  thumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "800", color: colors.text, fontSize: 13 },
  salt: { fontSize: 11, color: colors.primary, fontWeight: "600", marginTop: 2 },
  urgPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  urgText: { fontSize: 10, fontWeight: "700" },
  suggest: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
