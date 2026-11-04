// Field sales — record a payment collected from a retailer → sent to distributor for approval
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

const MODES = ["cash", "upi", "neft", "cheque"];
const ST: Record<string, { l: string; c: string }> = {
  pending_approval: { l: "PENDING APPROVAL", c: colors.warning }, approved: { l: "APPROVED · RECEIVED", c: colors.success }, rejected: { l: "REJECTED", c: colors.danger },
};

export default function FieldCollect() {
  const [custs, setCusts] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [cust, setCust] = useState<any | null>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [ref, setRef] = useState("");
  const [remarks, setRemarks] = useState("");
  const [mine, setMine] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadMine = useCallback(() => api("/field/collections").then(setMine).catch(() => {}), []);
  useFocusEffect(useCallback(() => { api("/field/customers").then(setCusts).catch((e) => showError(e.message)); loadMine(); }, [loadMine]));
  useEffect(() => {
    if (!cust) return;
    setSel([]);
    api(`/field/customers/${cust.id}/bills`).then(setBills).catch(() => setBills([]));
  }, [cust]);

  const toggle = (b: any) => {
    const next = sel.includes(b.bill_id) ? sel.filter((x) => x !== b.bill_id) : [...sel, b.bill_id];
    setSel(next);
    const sum = bills.filter((x) => next.includes(x.bill_id)).reduce((s, x) => s + x.amount_open, 0);
    if (sum) setAmount(String(Math.round(sum)));
  };

  const submit = async () => {
    if (!cust) return showError("Pick the retailer");
    setBusy(true);
    try {
      await api("/field/collections", { method: "POST", body: { customer_id: cust.id, amount: Number(amount) || 0, mode, reference: ref, remarks, bill_ids: sel } });
      showSuccess("Sent to distributor for approval");
      setCust(null); setAmount(""); setRef(""); setRemarks(""); setBills([]); setSel([]);
      loadMine();
    } catch (e: any) { showError(e.message); } finally { setBusy(false); }
  };

  const list = custs.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  const totalDue = bills.reduce((s, b) => s + b.amount_open, 0);

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <Text style={styles.h}>Record Collection</Text>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {!cust ? (
            <>
              <TextInput style={styles.in} value={q} onChangeText={setQ} placeholder="Search your parties" placeholderTextColor={colors.textTertiary} testID="col-cust-search" />
              {list.map((c) => (
                <TouchableOpacity key={c.id} style={styles.cust} onPress={() => setCust(c)} testID={`col-cust-${c.id}`}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.meta}>{c.area || c.address || "—"} · Credit used {formatINRFull(c.credit_used || 0)}</Text>
                </TouchableOpacity>
              ))}
              {!list.length && <Text style={styles.meta}>No parties assigned to you yet.</Text>}
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.custSel} onPress={() => setCust(null)}>
                <View style={{ flex: 1 }}><Text style={styles.name}>{cust.name}</Text><Text style={styles.meta}>Open bills {formatINRFull(totalDue)} · tap to change</Text></View>
                <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
              </TouchableOpacity>
              <Text style={styles.label}>Against bills (optional — else the system matches the bill)</Text>
              {bills.map((b) => (
                <TouchableOpacity key={b.bill_id} style={styles.bill} onPress={() => toggle(b)} testID={`col-bill-${b.bill_id}`}>
                  <Ionicons name={sel.includes(b.bill_id) ? "checkbox" : "square-outline"} size={22} color={sel.includes(b.bill_id) ? colors.primary : colors.textTertiary} />
                  <Text style={[styles.name, { flex: 1, fontSize: 13 }]}>{b.bill_number}</Text>
                  <Text style={styles.name}>{formatINRFull(b.amount_open)}</Text>
                </TouchableOpacity>
              ))}
              {!bills.length && <Text style={[styles.meta, { color: colors.warning, fontWeight: "700" }]}>Nothing to collect — no open bills yet (unbilled orders are billed on delivery).</Text>}
              <Text style={styles.label}>Amount collected (₹)</Text>
              <TextInput style={styles.in} value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" testID="col-amount" />
              <Text style={styles.label}>Mode</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {MODES.map((m) => (
                  <TouchableOpacity key={m} style={[styles.chip, mode === m && styles.chipOn]} onPress={() => setMode(m)} testID={`col-mode-${m}`}>
                    <Text style={[styles.chipText, mode === m && { color: "#FFF" }]}>{m.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Reference {mode === "cash" ? "(optional)" : "(UTR / cheque no.)"}</Text>
              <TextInput style={styles.in} value={ref} onChangeText={setRef} placeholder="e.g. UTR 4567…" placeholderTextColor={colors.textTertiary} testID="col-ref" />
              <Text style={styles.label}>Remarks</Text>
              <TextInput style={styles.in} value={remarks} onChangeText={setRemarks} placeholder="Optional" placeholderTextColor={colors.textTertiary} />
              <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy} testID="col-submit">
                {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Submit for approval</Text>}
              </TouchableOpacity>
            </>
          )}
          <Text style={[styles.h, { paddingHorizontal: 0, marginTop: 24, fontSize: 16 }]}>My collections</Text>
          {mine.map((c) => (
            <View key={c.id} style={styles.cust}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={styles.name}>{c.customer_name}</Text><Text style={styles.name}>{formatINRFull(c.amount)}</Text></View>
              <Text style={styles.meta}>{new Date(c.collected_at).toLocaleString("en-IN")} · {c.mode.toUpperCase()}</Text>
              <Text style={{ fontSize: 11, fontWeight: "800", color: ST[c.status]?.c }}>{ST[c.status]?.l}</Text>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  h: { fontSize: 20, fontWeight: "800", color: colors.text, paddingHorizontal: 16, paddingTop: 12 },
  in: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, height: 46, paddingHorizontal: 12, fontSize: 15, color: "#000", backgroundColor: "#FFF", marginBottom: 6 },
  cust: { padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 8, gap: 3 },
  custSel: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radius.md, backgroundColor: colors.primaryBg, marginBottom: 6 },
  name: { fontWeight: "800", color: colors.text, fontSize: 14 },
  meta: { fontSize: 12, color: colors.textSecondary },
  label: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, marginTop: 12, marginBottom: 6 },
  bill: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46, borderBottomWidth: 1, borderBottomColor: colors.border },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: "800", fontSize: 12, color: colors.text },
  btn: { backgroundColor: colors.success, height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 18 },
  btnText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
});
