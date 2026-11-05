// Distributor Query Management — disputes (wrong supply / returns / credit / other)
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Modal, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";
import { TYPE_LABEL, STATUS_COLOR, STATUS_LABEL } from "@/src/utils/queryLabels";
import { QueryThread } from "@/src/components/QueryThread";
import { PhotoAttach, Photo } from "@/src/components/PhotoAttach";

const TYPES = [
  { k: "", l: "All" },
  { k: "damaged_goods", l: "Damaged" },
  { k: "wrong_supply", l: "Wrong supply" },
  { k: "extra_supply", l: "Extra supply" },
  { k: "no_supply", l: "No supply" },
  { k: "rate_scheme", l: "Rate/Scheme" },
  { k: "other", l: "Other" },
];

export default function Queries() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [sel, setSel] = useState<any | null>(null);
  const [reply, setReply] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (type) qs.set("type", type);
      const r = await api(`/distributor/me/disputes?${qs.toString()}`);
      setData(r);
      return r;
    } catch (e: any) { showError(e?.message || "Could not load queries", "Load failed"); }
    finally { setLoading(false); }
  }, [type]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const openQuery = (d: any) => { setSel(d); setReply(""); setPhotos([]); };

  // status === null → just send the reply (message + photos) and keep the ticket open on screen
  const act = async (status: string | null) => {
    if (!sel) return;
    const note = reply.trim();
    if (!status && !note && !photos.length) return showError("Write a reply or attach a photo");
    setBusy(true);
    try {
      const body: any = { note: note || null, photo_file_ids: photos.map((p) => p.id) };
      if (status) body.status = status;
      if (status === "resolved" || status === "rejected") body.resolution = note || sel.resolution || null;
      await api(`/distributor/me/disputes/${sel.id}`, { method: "PATCH", body });
      showSuccess(status ? `Marked ${status.replace("_", " ")}` : "Reply sent — retailer notified");
      setReply(""); setPhotos([]);
      const r = await load();
      const fresh = r?.items?.find((x: any) => x.id === sel.id);
      if (status === "resolved" || status === "rejected" || !fresh) setSel(null);
      else setSel(fresh);
    } catch (e: any) { showError(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const counts = data?.counts || {};

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="queries-back"><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>Query Management</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.kpiRow}>
        <View style={styles.kpi}><Text style={[styles.kpiVal, { color: colors.warning }]}>{counts.open || 0}</Text><Text style={styles.kpiLabel}>Open</Text></View>
        <View style={styles.kpi}><Text style={[styles.kpiVal, { color: colors.info }]}>{counts.in_progress || 0}</Text><Text style={styles.kpiLabel}>In progress</Text></View>
        <View style={styles.kpi}><Text style={[styles.kpiVal, { color: colors.success }]}>{counts.resolved || 0}</Text><Text style={styles.kpiLabel}>Resolved</Text></View>
      </View>

      <FlatList
        horizontal showsHorizontalScrollIndicator={false} data={TYPES} keyExtractor={(t) => t.k || "all"}
        style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
        renderItem={({ item: t }) => (
          <TouchableOpacity style={[styles.chip, type === t.k && styles.chipActive]} onPress={() => setType(t.k)}>
            <Text style={[styles.chipText, type === t.k && styles.chipTextActive]}>{t.l}</Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="checkmark-done-circle-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>No queries here</Text></View>}
          renderItem={({ item: d }) => (
            <TouchableOpacity style={styles.card} onPress={() => openQuery(d)} testID={`query-${d.id}`}>
              <View style={styles.cardTop}>
                <Text style={styles.code}>{d.code} · {TYPE_LABEL[d.type] || d.type}{d.mode ? ` · ${d.mode === "sellable" ? "Sellable" : "Issue"}` : ""}</Text>
                <View style={[styles.statusPill, { backgroundColor: (STATUS_COLOR[d.status] || colors.textSecondary) + "22" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[d.status] || colors.textSecondary }]}>{d.flagged ? "🚩 " : ""}{STATUS_LABEL[d.status] || (d.status || "").toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.qTitle}>{d.title}</Text>
              <Text style={styles.qMeta}>{d.customer_name}{d.bill_numbers?.length ? ` · Bill ${d.bill_numbers.join(", ")}` : ""}{d.order_id ? " · has order ref" : ""}{d.source === "shortbook" ? " · from Shortbook" : ""}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSel(null)}>
        <Pressable style={styles.modalBg} onPress={() => setSel(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <KeyboardAvoidingView style={{ flexShrink: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
              {!!sel && <QueryThread q={sel} side="distributor" onOpenOrder={(oid) => { setSel(null); router.push(`/order/${oid}`); }} />}
              {sel?.status === "closed" ? (
                <Text style={[styles.desc, { color: colors.success, fontWeight: "700" }]}>Closed — the retailer confirmed and unflagged this ticket.</Text>
              ) : (<>
              <Text style={styles.fieldLabel}>Reply / resolution note</Text>
              <TextInput value={reply} onChangeText={setReply} placeholder="Write to the retailer…" placeholderTextColor={colors.textTertiary} style={styles.input} multiline testID="query-reply-input" />
              <View style={{ marginTop: 10 }}>
                <PhotoAttach photos={photos} onChange={setPhotos} testID="query-reply-photo" />
              </View>
              <TouchableOpacity style={[styles.sendBtn, busy && { opacity: 0.6 }]} onPress={() => act(null)} disabled={busy} testID="query-send-reply">
                {busy ? <ActivityIndicator color="#FFF" /> : (<><Ionicons name="send" size={15} color="#FFF" /><Text style={styles.actText}>Send reply</Text></>)}
              </TouchableOpacity>
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.actBtn, { backgroundColor: colors.info }]} onPress={() => act("in_progress")} disabled={busy} testID="progress-query">
                  <Text style={styles.actText}>In progress</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actBtn, { backgroundColor: colors.success }]} onPress={() => act("resolved")} disabled={busy} testID="resolve-query">
                  <Text style={styles.actText}>Resolve</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => act("rejected")} disabled={busy} testID="reject-query">
                <Text style={styles.rejectText}>Reject query</Text>
              </TouchableOpacity>
              </>)}
              <View style={{ height: 20 }} />
            </ScrollView>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  kpiRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  kpi: { flex: 1, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 11, alignItems: "center" },
  kpiVal: { fontSize: 20, fontWeight: "800", color: colors.text },
  kpiLabel: { fontSize: 10.5, color: colors.textSecondary, fontWeight: "700", marginTop: 2 },
  chip: { paddingHorizontal: 14, height: 32, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#FFF" },
  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { color: colors.textSecondary, fontWeight: "700", fontSize: 11.5 },
  statusPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  qTitle: { fontWeight: "800", color: colors.text, fontSize: 15, marginTop: 6 },
  qMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  empty: { alignItems: "center", marginTop: 50, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "85%" },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { fontWeight: "800", color: colors.text, fontSize: 18 },
  modalMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  desc: { color: colors.text, fontSize: 13.5, marginTop: 10, lineHeight: 19, backgroundColor: colors.surface, padding: 12, borderRadius: 10 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11.5, fontWeight: "700", marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, minHeight: 60, color: colors.text, fontSize: 14 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  sendBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, height: 48, borderRadius: 10, marginTop: 12 },
  actBtn: { flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 10 },
  actText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  rejectBtn: { alignItems: "center", paddingVertical: 12, marginTop: 8 },
  rejectText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
});
