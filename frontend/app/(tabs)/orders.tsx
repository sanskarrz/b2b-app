import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

const STATUSES = [
  { key: "all", label: "All" },
  { key: "placed", label: "Placed" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  placed: { bg: "#DBEAFE", fg: "#1D4ED8" },
  processing: { bg: "#FEF3C7", fg: "#92400E" },
  shipped: { bg: "#E0E7FF", fg: "#4338CA" },
  delivered: { bg: "#DCFCE7", fg: "#15803D" },
  cancelled: { bg: "#FEE2E2", fg: "#B91C1C" },
};

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export default function Orders() {
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/orders${tab !== "all" ? `?status=${tab}` : ""}`);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Orders" subtitle={`${items.length} ${tab === "all" ? "total" : tab}`} />

      <View style={styles.tabs}>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s.key}
            onPress={() => setTab(s.key)}
            style={[styles.tab, tab === s.key && styles.tabActive]}
            testID={`orders-tab-${s.key}`}
          >
            <Text style={[styles.tabText, tab === s.key && styles.tabTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No orders yet</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 30 }}
          renderItem={({ item }) => {
            const sc = STATUS_COLORS[item.status] || { bg: colors.surface, fg: colors.text };
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/order/${item.id}`)}
                testID={`order-${item.id}`}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.code}>{item.code}</Text>
                  <Text style={styles.total}>{formatINRFull(item.total)}</Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.dist}>{item.distributor_name}</Text>
                  <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusText, { color: sc.fg }]}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  Items: {item.sku_count} SKUs • {formatTime(item.created_at)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.text, borderColor: colors.text },
  tabText: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  tabTextActive: { color: "#FFF" },
  card: {
    padding: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { fontSize: 14, fontWeight: "800", color: colors.text },
  total: { fontSize: 15, fontWeight: "800", color: colors.text },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  dist: { fontSize: 13, color: colors.text, fontWeight: "600" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 8 },
  empty: { alignItems: "center", marginTop: 80, gap: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
});
