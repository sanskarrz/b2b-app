// Distributor — salesperson collections: approve / reject + day-wise statement
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { confirm } from "@/src/components/confirm";
import { colors, radius, formatINRFull } from "@/src/theme";

const ST: Record<string, { l: string; c: string }> = {
  pending_approval: { l: "PENDING APPROVAL", c: colors.warning }, approved: { l: "APPROVED · RECEIVED", c: colors.success }, rejected: { l: "REJECTED", c: colors.danger },
};

export function FieldCollectionsAdmin() {
  const [view, setView] = useState<"approvals" | "statement">("approvals");
  const [rows, setRows] = useState<any[] | null>(null);
  const [stmt, setStmt] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([api("/distributor/me/field-collections"), api("/distributor/me/field-collections/statement?days=30")]);
      setRows(r); setStmt(s);
    } catch (e: any) { showError(e.message); setRows([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approve = async (c: any) => {
    setBusy(c.id);
    try {
      const r = await api(`/distributor/me/field-collections/${c.id}/approve`, { method: "POST" });
      showSuccess(`Approved — settled ${r.allocations.map((a: any) => a.bill_number).join(", ")}`);
      load();
    } catch (e: any) { showError(e.message); } finally { setBusy(null); }
  };
  const reject = (c: any) => confirm("Reject this collection?", `${formatINRFull(c.amount)} from ${c.customer_name} will not be counted as received.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Reject", style: "destructive", onPress: async () => {
      try { await api(`/distributor/me/field-collections/${c.id}/reject`, { method: "POST", body: { reason: "Amount not received" } }); load(); } catch (e: any) { showError(e.message); }
    } },
  ]);

  if (!rows) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.seg}>
        {(["approvals", "statement"] as const).map((v) => (
          <TouchableOpacity key={v} style={[styles.segBtn, view === v && styles.segOn]} onPress={() => setView(v)} testID={`fc-${v}`}>
            <Text style={[styles.segText, view === v && { color: "#FFF" }]}>{v === "approvals" ? `Approvals (${rows.filter((r) => r.status === "pending_approval").length})` : "Day-wise statement"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {view === "approvals" ? (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>No salesperson collections yet</Text>}
          renderItem={({ item: c }) => (
            <View style={styles.card} testID={`fcol-${c.id}`}>
              <View style={styles.row}>
                <Text style={styles.name} numberOfLines={1}>{c.customer_name}</Text>
                <Text style={styles.amt}>{formatINRFull(c.amount)}</Text>
              </View>
              <Text style={styles.meta}>{c.code} · by {c.salesperson_name} · {new Date(c.collected_at).toLocaleString("en-IN")}</Text>
              <Text style={styles.meta}>{c.mode.toUpperCase()}{c.reference ? ` · Ref ${c.reference}` : ""}{c.remarks ? ` · ${c.remarks}` : ""}</Text>
              {!!c.allocations?.length && <Text style={styles.meta}>Settled: {c.allocations.map((a: any) => `${a.bill_number} ₹${a.amount}`).join(", ")}</Text>}
              <Text style={[styles.status, { color: ST[c.status]?.c }]}>{ST[c.status]?.l}{c.reject_reason ? ` — ${c.reject_reason}` : ""}</Text>
              {c.status === "pending_approval" && (
                <View style={styles.row}>
                  <TouchableOpacity style={styles.rej} onPress={() => reject(c)} testID={`fc-reject-${c.id}`}><Text style={{ color: colors.danger, fontWeight: "800" }}>Not received</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.ok} onPress={() => approve(c)} disabled={busy === c.id} testID={`fc-approve-${c.id}`}>
                    {busy === c.id ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontWeight: "800" }}>Approve · Received</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          <View style={styles.kpis}>
            {(["collected", "approved", "pending", "rejected"] as const).map((k) => (
              <View key={k} style={styles.kpi}><Text style={styles.k}>{k === "rejected" ? "NOT RECEIVED" : k === "approved" ? "HANDED OVER" : k.toUpperCase()}</Text><Text style={styles.v}>{formatINRFull(stmt?.totals?.[k] || 0)}</Text></View>
            ))}
          </View>
          {(stmt?.rows || []).map((r: any) => (
            <View key={`${r.date}-${r.salesperson_id}`} style={styles.card} testID={`stmt-${r.date}-${r.salesperson_id}`}>
              <View style={styles.row}><Text style={styles.name}>{r.salesperson_name}</Text><Text style={styles.meta}>{new Date(r.date).toDateString()}</Text></View>
              <Text style={styles.meta}>{r.count} collection(s) · Cash {formatINRFull(r.cash)} · Online {formatINRFull(r.online)}</Text>
              <View style={styles.row}>
                <Text style={styles.cell}>Collected{"\n"}<Text style={styles.cellV}>{formatINRFull(r.collected)}</Text></Text>
                <Text style={styles.cell}>Handed over{"\n"}<Text style={[styles.cellV, { color: colors.success }]}>{formatINRFull(r.approved)}</Text></Text>
                <Text style={styles.cell}>Pending{"\n"}<Text style={[styles.cellV, { color: colors.warning }]}>{formatINRFull(r.pending)}</Text></Text>
                {r.rejected > 0 && <Text style={styles.cell}>Not received{"\n"}<Text style={[styles.cellV, { color: colors.danger }]}>{formatINRFull(r.rejected)}</Text></Text>}
              </View>
              {r.difference > 0 && <Text style={[styles.status, { color: colors.danger }]}>Still to reconcile: {formatINRFull(r.difference)}</Text>}
            </View>
          ))}
          {!stmt?.rows?.length && <Text style={styles.empty}>No collections in the last 30 days</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  segBtn: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: colors.text, borderColor: colors.text },
  segText: { fontWeight: "800", fontSize: 12.5, color: colors.text },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 30 },
  card: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF", marginBottom: 8, gap: 5 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "space-between" },
  name: { fontWeight: "800", fontSize: 14, color: colors.text, flex: 1 },
  amt: { fontWeight: "800", fontSize: 15, color: colors.text },
  meta: { fontSize: 11.5, color: colors.textSecondary },
  status: { fontSize: 11, fontWeight: "800" },
  rej: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  ok: { flex: 1.4, height: 42, borderRadius: 10, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  kpis: { flexDirection: "row", gap: 6, marginBottom: 10 },
  kpi: { flex: 1, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF" },
  k: { fontSize: 8.5, fontWeight: "800", color: colors.textSecondary },
  v: { fontSize: 12.5, fontWeight: "800", color: colors.text, marginTop: 2 },
  cell: { flex: 1, fontSize: 10.5, color: colors.textSecondary, fontWeight: "700" },
  cellV: { fontSize: 13, color: colors.text, fontWeight: "800" },
});
