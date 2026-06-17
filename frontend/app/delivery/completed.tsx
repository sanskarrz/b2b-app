// Delivery rider — completed/failed history
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Image } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function DeliveryCompleted() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await api("/delivery/me/orders?status=completed"));
    } catch (e: any) {
      showError(e?.message || "Could not load history", "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Delivery History</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="time-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>No completed deliveries yet</Text></View>}
          renderItem={({ item: o }) => {
            const failed = o.delivery_status === "failed";
            return (
              <View style={styles.card}>
                {o.delivery_proof?.photo_base64 && !failed ? (
                  <Image source={{ uri: o.delivery_proof.photo_base64 }} style={styles.proof} />
                ) : (
                  <View style={[styles.proof, styles.proofPlaceholder]}>
                    <Ionicons name={failed ? "close-circle" : "image"} size={22} color={failed ? colors.danger : colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.shop}>{o.customer_name}</Text>
                  <Text style={styles.code}>{o.code} • {formatINRFull(o.total)}</Text>
                  <View style={[styles.pill, failed ? styles.pillFail : styles.pillOk]}>
                    <Text style={[styles.pillText, { color: failed ? colors.danger : colors.success }]}>{failed ? `FAILED: ${o.fail_reason || ""}` : "DELIVERED"}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, padding: 16, paddingBottom: 6 },
  card: { flexDirection: "row", gap: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  proof: { width: 54, height: 54, borderRadius: 10, backgroundColor: colors.surface },
  proofPlaceholder: { alignItems: "center", justifyContent: "center" },
  shop: { fontWeight: "800", color: colors.text, fontSize: 14 },
  code: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  pillOk: { backgroundColor: colors.successBg },
  pillFail: { backgroundColor: colors.dangerBg },
  pillText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3 },
  empty: { alignItems: "center", marginTop: 60, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
});
