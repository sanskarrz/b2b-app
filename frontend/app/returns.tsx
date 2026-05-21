import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  requested: { bg: "#FEF3C7", fg: "#92400E" },
  approved: { bg: "#DBEAFE", fg: "#1D4ED8" },
  rejected: { bg: "#FEE2E2", fg: "#B91C1C" },
  refunded: { bg: "#DCFCE7", fg: "#15803D" },
};

export default function ReturnsList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/returns")
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Returns" subtitle={`${items.length} return requests`} showBack />
      {loading ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="return-up-back-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No return requests yet</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          renderItem={({ item }) => {
            const sc = STATUS_COLORS[item.status] || { bg: colors.surface, fg: colors.text };
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.name}>{item.product_name}</Text>
                  <View style={[styles.pill, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.pillText, { color: sc.fg }]}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.dist}>{item.distributor_name}</Text>
                <Text style={styles.reason}>Reason: {item.reason}</Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.meta}>Qty: {item.qty}</Text>
                  <Text style={styles.amount}>{formatINRFull(item.amount)}</Text>
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
  card: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 10 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "800", fontSize: 14, color: colors.text },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontSize: 10, fontWeight: "800" },
  dist: { color: colors.textSecondary, fontSize: 12, marginTop: 6, fontWeight: "600" },
  reason: { color: colors.text, fontSize: 13, marginTop: 8 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  meta: { color: colors.textSecondary, fontSize: 12 },
  amount: { color: colors.text, fontWeight: "800", fontSize: 14 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
});
