// Distributor Collections — receivables owed by customers + record payments
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, FlatList, Modal, Pressable } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius, formatINR, formatINRFull } from "@/src/theme";

const FILTERS = [
  { k: "", l: "Open" },
  { k: "overdue", l: "Overdue" },
  { k: "due", l: "Due" },
  { k: "paid", l: "History" },
];
const METHODS = ["cash", "upi", "cheque", "neft"];

export default function DistributorCollections() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<any | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter) qs.set("status", filter);
      if (query) qs.set("q", query);
      const d = await api(`/distributor/me/receivables?${qs.toString()}`);
      setData(d);
    } catch (e: any) {
      showError(e?.message || "Could not load collections", "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openRecord = (p: any) => {
    setActive(p);
    setAmount(String(Math.round(p.amount)));
    setMethod("cash");
  };

  const record = async () => {
    if (!active) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { showError("Enter a valid amount"); return; }
    setSaving(true);
    try {
      const r = await api(`/distributor/payments/${active.id}/record`, {
        method: "POST",
        body: { amount: amt, method },
      });
      showSuccess(r.fully_paid ? "Invoice settled" : `₹${amt} collected`);
      setActive(null);
      await load();
    } catch (e: any) {
      showError(e?.message || "Could not record payment", "Failed");
    } finally {
      setSaving(false);
    }
  };

  const s = data?.summary;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
        <Text style={styles.heroLabel}>TOTAL RECEIVABLE</Text>
        <Text style={styles.heroValue}>{formatINRFull(s?.total_outstanding || 0)}</Text>
        <View style={styles.heroRow}>
          <View style={styles.heroPill}><Text style={styles.heroPillText}>⚠ {formatINR(s?.total_overdue || 0)} overdue</Text></View>
          <View style={styles.heroPill}><Text style={styles.heroPillText}>{s?.open_count || 0} open invoices</Text></View>
        </View>
      </LinearGradient>

      <View style={styles.statRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>COLLECTED 30D</Text>
          <Text style={[styles.statVal, { color: colors.success }]}>{formatINR(s?.collected_30d || 0)}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>DUE THIS WEEK</Text>
          <Text style={[styles.statVal, { color: colors.warning }]}>{formatINR(s?.due_this_week || 0)}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>OVERDUE</Text>
          <Text style={[styles.statVal, { color: colors.danger }]}>{s?.overdue_count || 0}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color={colors.textSecondary} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search customer or invoice…" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.k} style={[styles.chip, filter === f.k && styles.chipActive]} onPress={() => setFilter(f.k)}>
            <Text style={[styles.chipText, filter === f.k && styles.chipTextActive]}>{f.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(p: any) => p.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}><Ionicons name="cash-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>Nothing here</Text></View>
          }
          renderItem={({ item: p }: any) => {
            const isPaid = p.status === "paid";
            const isOverdue = p.status === "overdue";
            return (
              <View style={[styles.card, isOverdue && styles.cardOverdue]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.custName} numberOfLines={1}>{p.customer_name}</Text>
                  <Text style={styles.invCode}>{p.invoice_code}</Text>
                  <View style={[styles.statusPill, isPaid ? styles.paidPill : isOverdue ? styles.overduePill : styles.duePill]}>
                    <Text style={[styles.statusText, { color: isPaid ? colors.success : isOverdue ? colors.danger : colors.warning }]}>
                      {isPaid ? "PAID" : isOverdue ? "OVERDUE" : "DUE"}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Text style={styles.amount}>{formatINRFull(p.amount)}</Text>
                  {!isPaid && (
                    <TouchableOpacity style={styles.recordBtn} onPress={() => openRecord(p)}>
                      <Ionicons name="checkmark-done" size={13} color="#FFF" />
                      <Text style={styles.recordBtnText}>Record</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Record payment modal */}
      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <Pressable style={styles.modalBg} onPress={() => setActive(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Record Payment</Text>
            <Text style={styles.modalSub}>{active?.customer_name} • {active?.invoice_code} • {formatINRFull(active?.amount || 0)} due</Text>
            <Text style={styles.fieldLabel}>Amount received (₹)</Text>
            <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" style={styles.input} />
            <Text style={styles.fieldLabel}>Method</Text>
            <View style={styles.methodRow}>
              {METHODS.map((m) => (
                <TouchableOpacity key={m} style={[styles.methodChip, method === m && styles.methodChipActive]} onPress={() => setMethod(m)}>
                  <Text style={[styles.methodText, method === m && { color: "#FFF" }]}>{m.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setActive(null)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={record} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="cash" size={16} color="#FFF" /><Text style={styles.saveText}>Collect</Text></>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { padding: 18, paddingTop: 22, paddingBottom: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  heroValue: { color: "#FFF", fontSize: 32, fontWeight: "800", marginTop: 4, letterSpacing: -1 },
  heroRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  heroPill: { backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  heroPillText: { color: "#FFF", fontSize: 11, fontWeight: "700" },

  statRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginTop: 12 },
  statBox: { flex: 1, padding: 11, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  statLabel: { color: colors.textSecondary, fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  statVal: { fontSize: 17, fontWeight: "800", marginTop: 3, letterSpacing: -0.3 },

  searchWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 12, marginTop: 12, paddingHorizontal: 10, backgroundColor: colors.surface, borderRadius: 10, height: 38, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 13 },

  filterRow: { flexDirection: "row", gap: 6, paddingHorizontal: 12, marginTop: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#FFF" },

  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 8, gap: 10 },
  cardOverdue: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  custName: { fontWeight: "800", color: colors.text, fontSize: 14 },
  invCode: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  statusPill: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, marginTop: 6 },
  duePill: { backgroundColor: colors.warningBg },
  overduePill: { backgroundColor: colors.dangerBg },
  paidPill: { backgroundColor: colors.successBg },
  statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  amount: { fontWeight: "800", color: colors.text, fontSize: 15 },
  recordBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.success, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  recordBtnText: { color: "#FFF", fontWeight: "800", fontSize: 11 },

  empty: { alignItems: "center", marginTop: 60, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  modalHandle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  modalSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4, marginBottom: 14 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", marginTop: 10, marginBottom: 5 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: colors.text, fontWeight: "700" },
  methodRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  methodChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  methodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodText: { color: colors.textSecondary, fontWeight: "700", fontSize: 11 },
  cancelBtn: { flex: 1, alignItems: "center", padding: 13, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cancelText: { color: colors.text, fontWeight: "700" },
  saveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 13, borderRadius: 10, backgroundColor: colors.success },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
