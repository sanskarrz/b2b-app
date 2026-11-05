// Pharmacist — my queries / disputes list
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Modal, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { TYPE_LABEL, STATUS_COLOR, STATUS_LABEL } from "@/src/utils/queryLabels";
import { QueryThread } from "@/src/components/QueryThread";
import { PhotoAttach, Photo } from "@/src/components/PhotoAttach";
import { colors, radius } from "@/src/theme";

export default function MyDisputes() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<any | null>(null);
  const [reply, setReply] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api("/disputes"); setItems(r); return r; }
    catch (e: any) { showError(e?.message || "Could not load", "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const unflag = async (id: string) => {
    setBusy(id);
    try {
      await api(`/disputes/${id}/unflag`, { method: "POST" });
      showSuccess("Unflagged — ticket closed");
      setSel(null);
      load();
    } catch (e: any) { showError(e.message); }
    finally { setBusy(null); }
  };

  const send = async () => {
    if (!sel) return;
    if (!reply.trim() && !photos.length) return showError("Write a message or attach a photo");
    setSending(true);
    try {
      await api(`/disputes/${sel.id}/reply`, { method: "POST", body: { text: reply.trim() || null, photo_file_ids: photos.map((p) => p.id) } });
      showSuccess("Sent — distributor notified");
      setReply(""); setPhotos([]);
      const r = await load();
      setSel(r?.find((x: any) => x.id === sel.id) || null);
    } catch (e: any) { showError(e.message); }
    finally { setSending(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="mydisputes-back"><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>My Queries</Text>
        <TouchableOpacity onPress={() => router.push("/dispute/new")} style={styles.addBtn} testID="new-dispute-btn"><Ionicons name="add" size={20} color="#FFF" /></TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="chatbox-ellipses-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>No queries yet.{"\n"}Tap + to raise one.</Text></View>}
          renderItem={({ item: d }) => (
            <TouchableOpacity style={styles.card} onPress={() => { setSel(d); setReply(""); setPhotos([]); }} testID={`my-query-${d.id}`}>
              <View style={styles.cardTop}>
                <Text style={styles.code}>{d.code} · {TYPE_LABEL[d.type] || d.type}{d.mode ? ` · ${d.mode === "sellable" ? "Sellable" : "Issue"}` : ""}</Text>
                <View style={[styles.statusPill, { backgroundColor: (STATUS_COLOR[d.status] || colors.textSecondary) + "22" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[d.status] || colors.textSecondary }]}>{d.flagged ? "🚩 " : ""}{STATUS_LABEL[d.status] || (d.status || "").toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.qTitle}>{d.title}</Text>
              <Text style={styles.qMeta}>{d.distributor_name}{d.bill_numbers?.length ? ` · Bill ${d.bill_numbers.join(", ")}` : ""}</Text>
              {!!d.resolution && <Text style={styles.resolution}>Resolution: {d.resolution}</Text>}
              <Text style={styles.waiting}>
                {(d.activities || []).filter((a: any) => a.kind !== "status" && a.text !== "Query raised" && !(a.text || "").startsWith("Status →")).length} message(s) · tap to open
              </Text>
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
                {!!sel && <QueryThread q={sel} side="customer" onOpenOrder={(oid) => { setSel(null); router.push(`/order/${oid}`); }} />}
                {sel && sel.status !== "closed" && (
                  <>
                    <Text style={styles.fieldLabel}>Reply to distributor</Text>
                    <TextInput value={reply} onChangeText={setReply} placeholder="Write a message…" placeholderTextColor={colors.textTertiary} style={styles.input} multiline testID="my-query-reply" />
                    <View style={{ marginTop: 10 }}><PhotoAttach photos={photos} onChange={setPhotos} testID="my-query-photo" /></View>
                    <TouchableOpacity style={[styles.send, sending && { opacity: 0.6 }]} onPress={send} disabled={sending} testID="my-query-send">
                      {sending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.unflagText}>Send</Text>}
                    </TouchableOpacity>
                  </>
                )}
                {sel && ["resolved", "rejected"].includes(sel.status) && (
                  <TouchableOpacity style={styles.unflag} onPress={() => unflag(sel.id)} disabled={busy === sel.id} testID={`unflag-${sel.id}`}>
                    {busy === sel.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.unflagText}>Confirm & Unflag</Text>}
                  </TouchableOpacity>
                )}
                {sel && ["open", "in_progress"].includes(sel.status) && <Text style={styles.waiting}>You can unflag once the distributor resolves it</Text>}
                {sel?.status === "closed" && <Text style={[styles.waiting, { color: colors.success }]}>Closed — you confirmed and unflagged this ticket.</Text>}
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
  addBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.primary },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { color: colors.textSecondary, fontWeight: "700", fontSize: 11.5 },
  statusPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  qTitle: { fontWeight: "800", color: colors.text, fontSize: 15, marginTop: 6 },
  qMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  resolution: { color: colors.success, fontSize: 12.5, marginTop: 8, fontWeight: "600" },
  qDesc: { color: colors.text, fontSize: 12.5, marginTop: 6 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "88%" },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11.5, fontWeight: "700", marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, minHeight: 60, color: "#000", fontSize: 14 },
  send: { backgroundColor: colors.primary, height: 46, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 10 },
  unflag: { backgroundColor: colors.success, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 10 },
  unflagText: { color: "#FFF", fontWeight: "800" },
  waiting: { color: colors.textSecondary, fontSize: 11, marginTop: 8, fontStyle: "italic" },
  empty: { alignItems: "center", marginTop: 50, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
});
