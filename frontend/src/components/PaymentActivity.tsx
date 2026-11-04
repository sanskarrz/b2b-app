// Distributor — payment visibility per retailer: Received / Partially Received / Pending
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius, formatINR, formatINRFull } from "@/src/theme";

const ST: Record<string, { l: string; bg: string; fg: string }> = {
  received: { l: "RECEIVED", bg: "#DCFCE7", fg: "#15803D" },
  partial: { l: "PARTIALLY RECEIVED", bg: "#FEF3C7", fg: "#92400E" },
  pending: { l: "PENDING", bg: "#FEE2E2", fg: "#B91C1C" },
};
const FILTERS = [{ k: "", l: "All" }, { k: "pending", l: "Pending" }, { k: "partial", l: "Partial" }, { k: "received", l: "Received" }];
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—");

export function PaymentActivity() {
  const [data, setData] = useState<any>(null);
  const [f, setF] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setData(await api(`/distributor/me/payment-activity?status=${f}&q=${encodeURIComponent(q)}`)); } catch (e: any) { showError(e.message); }
  }, [f, q]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  return (
    <FlatList
      data={data.items}
      keyExtractor={(b) => b.bill_id}
      contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 10 }}>
          <View style={styles.kpis}>
            <View style={styles.kpi}><Text style={styles.k}>BILLED</Text><Text style={styles.v}>{formatINR(data.totals.due)}</Text></View>
            <View style={styles.kpi}><Text style={styles.k}>RECEIVED</Text><Text style={[styles.v, { color: colors.success }]}>{formatINR(data.totals.received)}</Text></View>
            <View style={styles.kpi}><Text style={styles.k}>BALANCE</Text><Text style={[styles.v, { color: colors.danger }]}>{formatINR(data.totals.balance)}</Text></View>
          </View>
          <TextInput style={styles.search} value={q} onChangeText={setQ} onSubmitEditing={load} placeholder="Search retailer or bill no." placeholderTextColor={colors.textTertiary} testID="pa-search" />
          <View style={{ flexDirection: "row", gap: 6 }}>
            {FILTERS.map((x) => (
              <TouchableOpacity key={x.k} style={[styles.chip, f === x.k && styles.chipOn]} onPress={() => setF(x.k)} testID={`pa-f-${x.k || "all"}`}>
                <Text style={[styles.chipText, f === x.k && { color: "#FFF" }]}>{x.l}{x.k ? ` ${data.counts[x.k] || 0}` : ""}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No bills here</Text>}
      renderItem={({ item: b }) => {
        const st = ST[b.state];
        return (
          <TouchableOpacity style={styles.card} onPress={() => setOpen(open === b.bill_id ? null : b.bill_id)} testID={`pa-${b.bill_id}`}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{b.customer_name}</Text>
                <Text style={styles.meta}>{b.bill_number} · due {fmt(b.due_date)}{b.overdue ? " · OVERDUE" : ""}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: st.bg }]}><Text style={[styles.pillText, { color: st.fg }]}>{st.l}</Text></View>
            </View>
            <View style={styles.amts}>
              <Text style={styles.amt}>Due {formatINRFull(b.amount_total)}</Text>
              <Text style={[styles.amt, { color: colors.success }]}>Received {formatINRFull(b.amount_paid)}</Text>
              <Text style={[styles.amt, { color: b.amount_open > 0 ? colors.danger : colors.textSecondary }]}>Balance {formatINRFull(b.amount_open)}</Text>
            </View>
            {!!b.last_paid_at && <Text style={styles.meta}>Last payment {fmt(b.last_paid_at)} · {(b.last_mode || "cash").toUpperCase()}</Text>}
            {open === b.bill_id && b.events.map((e: any, i: number) => (
              <Text key={i} style={styles.event}>• {fmt(e.date)} — {formatINRFull(e.amount)} via {(e.mode || "cash").toUpperCase()}{e.by ? ` (collected by ${e.by})` : ""}</Text>
            ))}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", gap: 8 },
  kpi: { flex: 1, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF" },
  k: { fontSize: 9, fontWeight: "800", color: colors.textSecondary },
  v: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 2 },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, height: 44, paddingHorizontal: 12, color: "#000", backgroundColor: "#FFF" },
  chip: { paddingHorizontal: 12, height: 34, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.text },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 30 },
  card: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF", marginBottom: 8, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontWeight: "800", fontSize: 14, color: colors.text },
  meta: { fontSize: 11.5, color: colors.textSecondary },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 9.5, fontWeight: "800" },
  amts: { flexDirection: "row", justifyContent: "space-between", gap: 6, flexWrap: "wrap" },
  amt: { fontSize: 12, fontWeight: "700", color: colors.text },
  event: { fontSize: 12, color: colors.text },
});
