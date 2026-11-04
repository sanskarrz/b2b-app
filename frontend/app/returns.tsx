// Returns dashboard: search distributor + bill no., multi-select bills (checkboxes),
// flag with an issue category as Sellable (fully paid) or Issue (part / unpaid).
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TextInput, TouchableOpacity, Modal, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { IssueForm, IssueValue, emptyIssue, issuePayload } from "@/src/components/IssueForm";
import { colors, radius, formatINRFull } from "@/src/theme";

const STATE: Record<string, { l: string; bg: string; fg: string }> = {
  paid: { l: "Paid in full", bg: "#DCFCE7", fg: "#15803D" },
  partial: { l: "Part paid", bg: "#FEF3C7", fg: "#92400E" },
  unpaid: { l: "Unpaid", bg: "#FEE2E2", fg: "#B91C1C" },
};

export default function Returns() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"bills" | "history">("bills");
  const [dist, setDist] = useState("");
  const [bill, setBill] = useState("");
  const [bills, setBills] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Record<string, any>>({});
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"sellable" | "issue">("sellable");
  const [issue, setIssue] = useState<IssueValue>(emptyIssue());
  const [busy, setBusy] = useState(false);

  const loadBills = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (dist.trim()) qs.set("distributor", dist.trim());
      if (bill.trim()) qs.set("bill", bill.trim());
      setBills(await api(`/retail/bills?${qs.toString()}`));
    } catch (e: any) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dist, bill]);
  useEffect(() => { const t = setTimeout(loadBills, 250); return () => clearTimeout(t); }, [loadBills]);
  useFocusEffect(useCallback(() => { api("/returns").then(setHistory).catch(() => {}); }, []));

  const picked = Object.values(sel);
  const toggle = (b: any) => setSel((s) => {
    const n = { ...s };
    if (n[b.bill_id]) delete n[b.bill_id];
    else n[b.bill_id] = b;
    return n;
  });

  const startFlag = () => {
    // Pre-decide: Sellable only if every selected bill is fully paid
    setMode(picked.every((b) => b.payment_state === "paid") ? "sellable" : "issue");
    setIssue(emptyIssue());
    setOpen(true);
  };

  const submit = async () => {
    if (!issue.category) return showError("Pick an issue category");
    if (!issue.title.trim()) return showError("Add the product name");
    setBusy(true);
    try {
      const p = issuePayload(issue);
      const r = await api("/retail/returns/flag", {
        method: "POST",
        body: { bill_ids: picked.map((b) => b.bill_id), category: p.type, mode, title: p.title, description: p.description,
          photo_file_ids: p.photo_file_ids, audio_file_id: p.audio_file_id, transcript: p.transcript },
      });
      showSuccess(`${r.disputes.length} flag(s) raised — distributor notified`);
      setOpen(false); setSel({});
      api("/returns").then(setHistory).catch(() => {});
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Returns" subtitle="Search a bill and flag it" showBack />
      <View style={styles.tabs}>
        {(["bills", "history"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)} testID={`returns-tab-${t}`}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === "bills" ? "Flag a Bill" : `My Returns (${history.length})`}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === "bills" ? (
        <>
          <View style={styles.searchRow}>
            <TextInput style={[styles.input, { flex: 1.2 }]} value={dist} onChangeText={setDist} placeholder="Distributor name" placeholderTextColor={colors.textTertiary} testID="ret-dist" />
            <TextInput style={[styles.input, { flex: 1 }]} value={bill} onChangeText={setBill} placeholder="Bill number" placeholderTextColor={colors.textTertiary} autoCapitalize="characters" testID="ret-bill" />
          </View>
          {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (
            <FlatList
              data={bills}
              keyExtractor={(b) => b.bill_id}
              contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 + insets.bottom }}
              ListEmptyComponent={<Text style={styles.empty}>No bills match your search</Text>}
              renderItem={({ item: b }) => {
                const on = !!sel[b.bill_id];
                const st = STATE[b.payment_state];
                return (
                  <TouchableOpacity style={[styles.bill, on && styles.billOn]} onPress={() => toggle(b)} testID={`bill-${b.bill_id}`}>
                    <Ionicons name={on ? "checkbox" : "square-outline"} size={24} color={on ? colors.primary : colors.textTertiary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billNo}>{b.bill_number}</Text>
                      <Text style={styles.billMeta}>{b.distributor_name} · {b.due_date ? new Date(b.due_date).toLocaleDateString() : ""}</Text>
                      <View style={[styles.pill, { backgroundColor: st.bg }]}><Text style={[styles.pillText, { color: st.fg }]}>{st.l}{b.payment_state === "partial" ? ` · ₹${b.amount_open} due` : ""}</Text></View>
                    </View>
                    <Text style={styles.amt}>{formatINRFull(b.amount_total)}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
          {picked.length > 0 && (
            <View style={[styles.bar, { paddingBottom: 12 + insets.bottom }]}>
              <Text style={styles.barText}>{picked.length} bill{picked.length > 1 ? "s" : ""} selected</Text>
              <TouchableOpacity style={styles.flagBtn} onPress={startFlag} testID="ret-flag">
                <Ionicons name="flag" size={16} color="#FFF" /><Text style={styles.flagText}>Flag selected</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          ListEmptyComponent={<Text style={styles.empty}>No returns yet</Text>}
          renderItem={({ item }) => (
            <View style={styles.hist}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.billNo}>{item.product_name}</Text>
                <Text style={styles.status}>{(item.status || "").toUpperCase()}</Text>
              </View>
              <Text style={styles.billMeta}>{item.distributor_name} · {item.reason}{item.mode ? ` · ${item.mode === "sellable" ? "Sellable" : "Issue"}` : ""}</Text>
              {!!item.bill_numbers?.length && <Text style={styles.billMeta}>Bill {item.bill_numbers.join(", ")}</Text>}
              <Text style={styles.amt}>{formatINRFull(item.amount)}</Text>
            </View>
          )}
        />
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
          <TopBar title="Flag bills" subtitle={picked.map((b) => b.bill_number).join(", ")} showBack onBack={() => setOpen(false)} />
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Return type — pre-selected from payment status, please confirm</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                {(["sellable", "issue"] as const).map((m) => (
                  <TouchableOpacity key={m} style={[styles.mode, mode === m && styles.modeOn]} onPress={() => setMode(m)} testID={`mode-${m}`}>
                    <Text style={[styles.modeTitle, mode === m && { color: "#FFF" }]}>{m === "sellable" ? "Sellable" : "Issue"}</Text>
                    <Text style={[styles.modeSub, mode === m && { color: "#FFF" }]}>{m === "sellable" ? "Bill fully paid" : "Part paid / unpaid"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <IssueForm value={issue} onChange={setIssue} />
              <View style={{ height: 16 }} />
              <Button title="Submit flag" onPress={submit} loading={busy} testID="ret-submit" />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  tabTextOn: { color: colors.text },
  searchRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 46, fontSize: 14, color: "#000", backgroundColor: "#FFF", minWidth: 0 },
  bill: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 8 },
  billOn: { borderColor: colors.primary, backgroundColor: colors.primaryBg + "60" },
  billNo: { fontWeight: "800", color: colors.text, fontSize: 14 },
  billMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 6 },
  pillText: { fontSize: 10.5, fontWeight: "800" },
  amt: { fontWeight: "800", color: colors.text, fontSize: 14 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 40 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: colors.border },
  barText: { flex: 1, fontWeight: "800", color: colors.text },
  flagBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.danger, paddingHorizontal: 16, height: 46, borderRadius: 12 },
  flagText: { color: "#FFF", fontWeight: "800" },
  hist: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 8, gap: 2 },
  status: { fontSize: 10, fontWeight: "800", color: colors.warning },
  label: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, marginBottom: 8 },
  mode: { flex: 1, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, minHeight: 60 },
  modeOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeTitle: { fontWeight: "800", fontSize: 15, color: colors.text },
  modeSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
});
