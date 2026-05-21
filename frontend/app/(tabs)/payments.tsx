import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

const TABS = [
  { key: "all", label: "All" },
  { key: "due", label: "Due" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

export default function Payments() {
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total_due: 0, total_overdue: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/payments${tab !== "all" ? `?status=${tab}` : ""}`);
      setItems(data.items);
      setSummary({ total_due: data.total_due, total_overdue: data.total_overdue });
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pay = (id: string) => {
    Alert.alert("Pay Invoice", "Proceed to UPI payment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Pay Now",
        onPress: async () => {
          await api(`/payments/${id}/pay`, { method: "POST" });
          load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Payments" subtitle="Outstanding & history" />

      <View style={styles.summary}>
        <View style={[styles.sumCard, { backgroundColor: colors.surface }]}>
          <Text style={styles.sumLabel}>Total Due</Text>
          <Text style={styles.sumValue}>{formatINRFull(summary.total_due)}</Text>
        </View>
        <View style={[styles.sumCard, { backgroundColor: colors.dangerBg }]}>
          <Text style={[styles.sumLabel, { color: colors.danger }]}>Overdue</Text>
          <Text style={[styles.sumValue, { color: colors.danger }]}>{formatINRFull(summary.total_overdue)}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="card-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No payments here</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 30 }}
          renderItem={({ item }) => {
            const overdue = item.status === "overdue";
            const paid = item.status === "paid";
            return (
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invCode}>{item.invoice_code}</Text>
                  <Text style={styles.distName}>{item.distributor_name}</Text>
                  <Text style={[styles.due, overdue && { color: colors.danger }]}>
                    {paid
                      ? "Paid"
                      : overdue
                      ? `Overdue by ${Math.abs(item.days_to_due)}d`
                      : item.days_to_due === 0
                      ? "Due today"
                      : `Due in ${item.days_to_due}d`}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.amount}>{formatINRFull(item.amount)}</Text>
                  {!paid && (
                    <TouchableOpacity
                      style={[styles.payBtn, overdue && { backgroundColor: colors.danger }]}
                      onPress={() => pay(item.id)}
                      testID={`pay-${item.id}`}
                    >
                      <Text style={styles.payBtnText}>Pay</Text>
                    </TouchableOpacity>
                  )}
                  {paid && (
                    <View style={styles.paidPill}>
                      <Ionicons name="checkmark-circle" size={12} color="#15803D" />
                      <Text style={styles.paidText}>Paid</Text>
                    </View>
                  )}
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
  summary: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 12 },
  sumCard: { flex: 1, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  sumLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  sumValue: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  tabs: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  tabTextActive: { color: "#FFF" },
  card: {
    flexDirection: "row",
    padding: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 10,
    gap: 12,
  },
  invCode: { fontWeight: "800", fontSize: 14, color: colors.text },
  distName: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  due: { color: colors.textSecondary, fontSize: 12, marginTop: 6, fontWeight: "600" },
  amount: { fontWeight: "800", fontSize: 16, color: colors.text },
  payBtn: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  payBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  paidPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
  },
  paidText: { color: "#15803D", fontWeight: "700", fontSize: 11 },
  empty: { alignItems: "center", marginTop: 80, gap: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
});
