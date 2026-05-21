// Distributor Compare A vs B
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function Compare() {
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const router = useRouter();
  const [a, setA] = useState<string>(params.a || "dist-1");
  const [b, setB] = useState<string>(params.b || "dist-2");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [distributors, setDistributors] = useState<any[]>([]);
  const [picking, setPicking] = useState<"a" | "b" | null>(null);

  useEffect(() => { api("/distributors").then(setDistributors).catch(() => {}); }, []);

  useEffect(() => {
    if (a && b && a !== b) {
      setLoading(true);
      api(`/distributors/compare/${a}/${b}`).then(setData).finally(() => setLoading(false));
    }
  }, [a, b]);

  if (!data || loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Compare Distributors" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const A = data.a, B = data.b;
  const aBetter = (vA: number, vB: number, higherIsBetter = true) => higherIsBetter ? vA > vB : vA < vB;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Compare" subtitle={`${A.short_name} vs ${B.short_name}`} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {/* Pickers */}
        <View style={styles.pickRow}>
          <TouchableOpacity style={styles.pickCol} onPress={() => setPicking("a")}>
            <Text style={styles.pickLabel}>A</Text>
            <Text style={styles.pickName}>{A.short_name}</Text>
            <Ionicons name="swap-vertical" size={12} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.vs}><Text style={styles.vsText}>VS</Text></View>
          <TouchableOpacity style={styles.pickCol} onPress={() => setPicking("b")}>
            <Text style={styles.pickLabel}>B</Text>
            <Text style={styles.pickName}>{B.short_name}</Text>
            <Ionicons name="swap-vertical" size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Rows */}
        <View style={styles.table}>
          <CompareRow label="Rating" a={A.rating} b={B.rating} aBetter={aBetter(A.rating, B.rating)} suffix=" ★" />
          <CompareRow label="Delivery" a={A.delivery_time} b={B.delivery_time} />
          <CompareRow label="Location" a={A.location} b={B.location} />
          <CompareRow label="Credit Days" a={A.credit_days || 30} b={B.credit_days || 30} aBetter={aBetter(A.credit_days || 30, B.credit_days || 30)} suffix="d" />
          <CompareRow label="Early Settle %" a={A.settlement_discount_pct || 0} b={B.settlement_discount_pct || 0} aBetter={aBetter(A.settlement_discount_pct || 0, B.settlement_discount_pct || 0)} suffix="%" />
          <CompareRow label="Min Order" a={A.min_order} b={B.min_order} aBetter={aBetter(A.min_order, B.min_order, false)} prefix="₹" />
          <CompareRow label="Credit Limit" a={A.credit_limit} b={B.credit_limit} aBetter={aBetter(A.credit_limit, B.credit_limit)} formatter={formatINRFull} />
          <CompareRow label="Discount" a={A.discount_label} b={B.discount_label} />
          <CompareRow label="Products" a={A.product_count} b={B.product_count} aBetter={aBetter(A.product_count, B.product_count)} />
          <View style={styles.sectionBreak}><Text style={styles.sectionBreakText}>Your Business</Text></View>
          <CompareRow label="Orders" a={A.user_stats.order_count} b={B.user_stats.order_count} />
          <CompareRow label="Total Spent" a={A.user_stats.total_spent} b={B.user_stats.total_spent} formatter={formatINRFull} />
          <CompareRow label="Unpaid" a={A.user_stats.unpaid} b={B.user_stats.unpaid} aBetter={aBetter(A.user_stats.unpaid, B.user_stats.unpaid, false)} formatter={formatINRFull} />
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          <TouchableOpacity style={styles.openBtn} onPress={() => router.push(`/distributor/${A.id}`)}>
            <Text style={styles.openBtnText}>Open {A.short_name}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.openBtn} onPress={() => router.push(`/distributor/${B.id}`)}>
            <Text style={styles.openBtnText}>Open {B.short_name}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Picker modal */}
      <Modal visible={picking !== null} transparent animationType="slide" onRequestClose={() => setPicking(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pick a distributor</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {distributors.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={styles.distOpt}
                  onPress={() => {
                    if (picking === "a") setA(d.id);
                    else if (picking === "b") setB(d.id);
                    setPicking(null);
                  }}
                >
                  <Text style={styles.distOptText}>{d.short_name}</Text>
                  <Text style={styles.distOptMeta}>⭐ {d.rating} • {d.location}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function CompareRow({ label, a, b, aBetter, suffix = "", prefix = "", formatter }: any) {
  const fmt = (v: any) => prefix + (formatter ? formatter(v) : String(v)) + suffix;
  return (
    <View style={styles.cmpRow}>
      <Text style={[styles.cmpVal, aBetter === true && styles.cmpValBetter]}>{fmt(a)}</Text>
      <Text style={styles.cmpLabel}>{label}</Text>
      <Text style={[styles.cmpVal, aBetter === false && styles.cmpValBetter]}>{fmt(b)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  pickRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  pickCol: { flex: 1, alignItems: "center", padding: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  pickLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "800", letterSpacing: 1 },
  pickName: { fontSize: 14, color: colors.text, fontWeight: "800" },
  vs: { paddingHorizontal: 10 },
  vsText: { fontWeight: "800", color: colors.primary, fontSize: 14 },
  table: { backgroundColor: "#FFF", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cmpRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  cmpVal: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700", textAlign: "center" },
  cmpValBetter: { color: colors.success, fontWeight: "800" },
  cmpLabel: { flex: 1.2, color: colors.textSecondary, fontSize: 10, fontWeight: "700", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.3 },
  sectionBreak: { backgroundColor: colors.surfaceAlt, paddingVertical: 6 },
  sectionBreakText: { fontSize: 10, fontWeight: "800", color: colors.text, textAlign: "center", letterSpacing: 0.5 },
  openBtn: { flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  openBtnText: { color: "#FFF", fontWeight: "800", fontSize: 12.5 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", padding: 18, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 12 },
  distOpt: { padding: 14, marginBottom: 6, backgroundColor: colors.surface, borderRadius: 10 },
  distOptText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  distOptMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
});
