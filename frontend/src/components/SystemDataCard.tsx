// Customer detail — data imported from the distributor's own system (Drive / Excel)
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export function SystemDataCard({ custId }: { custId: string }) {
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<"purchases" | "payments" | "stock">("purchases");
  useFocusEffect(useCallback(() => { api(`/distributor/me/customers/${custId}/system-data`).then(setD).catch(() => {}); }, [custId]));
  if (!d) return null;
  const p = d.parties[0];
  const rows = d[tab] || [];
  return (
    <View style={styles.card} testID="system-data-card">
      <Text style={styles.title}>From your system (imported)</Text>
      {p ? (
        <Text style={styles.sub}>Matched party: {p.name}{p.code ? ` (${p.code})` : ""} · by {p.link_method}{p.balance ? ` · Balance ${formatINRFull(p.balance)}` : ""}</Text>
      ) : (
        <Text style={[styles.sub, { color: colors.warning }]}>No imported party matched yet — link it in Data Sync → Retailer matching.</Text>
      )}
      <View style={styles.tabs}>
        {(["purchases", "payments", "stock"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)} testID={`sys-${t}`}>
            <Text style={[styles.tabText, tab === t && { color: "#FFF" }]}>
              {t === "purchases" ? `Purchases ${formatINRFull(d.totals.purchases)}` : t === "payments" ? `Payments ${formatINRFull(d.totals.payments)}` : `Stock (${d.stock.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {rows.slice(0, 15).map((r: any, i: number) => (
        <View key={i} style={styles.row}>
          {tab === "stock" ? (
            <>
              <Text style={styles.cell} numberOfLines={1}>{r.name} {r.pack ? `· ${r.pack}` : ""}</Text>
              <Text style={styles.meta}>Bought {r.ordered_qty}</Text>
              <Text style={[styles.val, { color: r.qty_available > 0 ? colors.success : colors.danger }]}>Stock {r.qty_available}</Text>
            </>
          ) : (
            <>
              <Text style={styles.cell} numberOfLines={1}>{r.date || "—"} · {r.voucher || r.type || ""}</Text>
              <Text style={styles.val}>{formatINRFull(r.amount)}</Text>
            </>
          )}
        </View>
      ))}
      {!rows.length && <Text style={styles.sub}>Nothing imported here yet.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, marginBottom: 0, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF", gap: 6 },
  title: { fontWeight: "800", fontSize: 14, color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary },
  tabs: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  tab: { paddingHorizontal: 10, height: 32, borderRadius: 999, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 11.5, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  cell: { flex: 1, fontSize: 12.5, color: colors.text },
  meta: { fontSize: 11, color: colors.textSecondary },
  val: { fontSize: 12.5, fontWeight: "800", color: colors.text },
});
