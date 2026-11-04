import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { VoiceRecorder } from "@/src/components/VoiceRecorder";
import { PhotoAttach, Photo } from "@/src/components/PhotoAttach";
import { IssueForm, IssueValue, emptyIssue, issuePayload } from "@/src/components/IssueForm";
import { FileImage, VoicePlayer } from "@/src/components/FileMedia";
import { colors, radius, formatINRFull } from "@/src/theme";

type Tab = "notes" | "reorder";

export default function Shortbook() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("notes");
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  // composer
  const [text, setText] = useState("");
  const [product, setProduct] = useState("");
  const [audio, setAudio] = useState<{ id: string; transcript: string } | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [saving, setSaving] = useState(false);
  // raise query
  const [qNote, setQNote] = useState<any | null>(null);
  const [issue, setIssue] = useState<IssueValue>(emptyIssue());
  const [dists, setDists] = useState<any[]>([]);
  const [distId, setDistId] = useState("");
  const [raising, setRaising] = useState(false);

  const load = async () => {
    try {
      const [sb, ns] = await Promise.all([api("/shortbook"), api("/shortbook/notes")]);
      setItems(sb.items);
      setTotal(sb.total);
      setNotes(ns);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const saveNote = async () => {
    setSaving(true);
    try {
      await api("/shortbook/notes", {
        method: "POST",
        body: { text, product_name: product, audio_file_id: audio?.id, transcript: audio?.transcript, photo_file_id: photos[0]?.id },
      });
      setText(""); setProduct(""); setAudio(null); setPhotos([]);
      showSuccess("Note saved");
      load();
    } catch (e: any) {
      showError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openQuery = async (n: any) => {
    setQNote(n);
    setIssue({
      ...emptyIssue(n.product_name || ""),
      details: n.text || n.transcript || "",
      audio_file_id: n.audio_file_id || null,
      transcript: n.transcript || "",
      photos: n.photo_file_id ? [{ id: n.photo_file_id, uri: "" }] : [],
    });
    if (!dists.length) api("/retail/distributors?tab=mapped").then((r) => setDists(r.items)).catch(() => {});
  };

  const raise = async () => {
    if (!distId) return showError("Select the distributor");
    if (!issue.category) return showError("Pick an issue category");
    if (!issue.title.trim()) return showError("Add the product name");
    setRaising(true);
    try {
      await api(`/shortbook/notes/${qNote.id}/query`, { method: "POST", body: { distributor_id: distId, ...issuePayload(issue) } });
      showSuccess("Query raised — distributor notified");
      setQNote(null);
      load();
    } catch (e: any) {
      showError(e.message);
    } finally {
      setRaising(false);
    }
  };

  const del = async (id: string) => {
    await api(`/shortbook/notes/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  const addAll = async () => {
    setAdding(true);
    try {
      for (const it of items) await api(`/shortbook/${it.id}/order`, { method: "POST" });
      showSuccess(`${items.length} SKUs added to cart`);
      router.push("/cart");
    } catch (e: any) {
      showError(e.message);
    } finally {
      setAdding(false);
      load();
    }
  };

  const composer = (
    <View style={styles.composer}>
      <Text style={styles.compTitle}>New note</Text>
      <TextInput style={styles.input} value={product} onChangeText={setProduct} placeholder="Product name (optional)" placeholderTextColor={colors.textTertiary} testID="note-product" />
      <TextInput style={[styles.input, { height: 70, textAlignVertical: "top", paddingTop: 10 }]} multiline value={text} onChangeText={setText}
        placeholder="Type a note — e.g. Azee 500 short, 2 strips damaged" placeholderTextColor={colors.textTertiary} testID="note-text" />
      <VoiceRecorder onResult={({ text: t, file_id }) => { setAudio({ id: file_id, transcript: t }); if (t) setText((p) => [p.trim(), t].filter(Boolean).join(" ")); }} testID="note-voice" />
      {!!audio && <Text style={styles.ok}>✓ Voice note attached</Text>}
      <View style={{ marginTop: 10 }}>
        <PhotoAttach photos={photos} onChange={setPhotos} max={1} testID="note-photo" />
      </View>
      <Button title="Save note" onPress={saveNote} loading={saving} disabled={!text.trim() && !audio && !photos.length} small testID="note-save" />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Shortbook" subtitle="Notes, voice & queries" showBack />
      <View style={styles.tabs}>
        {(["notes", "reorder"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)} testID={`sb-tab-${t}`}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === "notes" ? `Notes (${notes.length})` : `Reorder (${items.length})`}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      ) : tab === "notes" ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <FlatList
            data={notes}
            keyExtractor={(n) => n.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={composer}
            contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
            renderItem={({ item: n }) => (
              <View style={styles.note} testID={`note-${n.id}`}>
                {!!n.product_name && <Text style={styles.noteTitle}>{n.product_name}</Text>}
                {!!(n.text || n.transcript) && <Text style={styles.noteText}>{n.text || n.transcript}</Text>}
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                  {!!n.photo_file_id && <FileImage id={n.photo_file_id} size={52} />}
                  {!!n.audio_file_id && <VoicePlayer id={n.audio_file_id} />}
                </View>
                <View style={styles.noteFoot}>
                  <Text style={styles.noteTime}>{new Date(n.created_at).toLocaleString()}</Text>
                  <TouchableOpacity onPress={() => del(n.id)} hitSlop={8} style={styles.iconBtn}><Ionicons name="trash-outline" size={16} color={colors.danger} /></TouchableOpacity>
                  {n.query_code ? (
                    <View style={styles.raised}><Text style={styles.raisedText}>Query {n.query_code}</Text></View>
                  ) : (
                    <TouchableOpacity style={styles.raiseBtn} onPress={() => openQuery(n)} testID={`raise-${n.id}`}>
                      <Ionicons name="flag" size={13} color="#FFF" /><Text style={styles.raiseText}>Raise a Query</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          />
        </KeyboardAvoidingView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
          ListHeaderComponent={items.length ? (
            <View style={styles.summary}>
              <View><Text style={styles.sumLabel}>{items.length} SKUs • Total Value</Text><Text style={styles.sumValue}>{formatINRFull(total)}</Text></View>
              <Button title="Add all to Cart" onPress={addAll} loading={adding} small testID="shortbook-add-all" />
            </View>
          ) : null}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="checkmark-circle" size={48} color={colors.success} /><Text style={styles.emptyText}>All stock levels healthy!</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.product_name}</Text>
                <Text style={styles.meta}>Stock: <Text style={{ color: colors.danger, fontWeight: "700" }}>{item.current_stock}</Text> • Min: {item.min_level} • Suggested {item.suggested_qty}</Text>
                <Text style={styles.value}>{formatINRFull(item.estimated_value)}</Text>
              </View>
              <TouchableOpacity style={styles.addBtn} onPress={async () => { await api(`/shortbook/${item.id}/order`, { method: "POST" }); load(); }} testID={`shortbook-add-${item.id}`}>
                <Ionicons name="add" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal visible={!!qNote} animationType="slide" onRequestClose={() => setQNote(null)}>
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
          <TopBar title="Raise a Query" subtitle="From your Shortbook note" showBack onBack={() => setQNote(null)} />
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 + insets.bottom }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Distributor</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
                {dists.map((d) => (
                  <TouchableOpacity key={d.id} style={[styles.chip, distId === d.id && styles.chipOn]} onPress={() => setDistId(d.id)} testID={`q-dist-${d.id}`}>
                    <Text style={[styles.chipText, distId === d.id && { color: "#FFF" }]}>{d.short_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <IssueForm value={issue} onChange={setIssue} />
              <View style={{ height: 16 }} />
              <Button title="Submit Query" onPress={raise} loading={raising} testID="q-submit" />
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
  composer: { padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 10, marginBottom: 16 },
  compTitle: { fontWeight: "800", fontSize: 14, color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 44, fontSize: 14, color: "#000", backgroundColor: "#FFF" },
  ok: { color: colors.success, fontSize: 12, fontWeight: "700" },
  note: { padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10, backgroundColor: "#FFF" },
  noteTitle: { fontWeight: "800", fontSize: 14, color: colors.text },
  noteText: { fontSize: 13, color: colors.text, marginTop: 4 },
  noteFoot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  noteTime: { flex: 1, fontSize: 11, color: colors.textSecondary },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  raiseBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.danger, paddingHorizontal: 12, height: 36, borderRadius: 10 },
  raiseText: { color: "#FFF", fontWeight: "800", fontSize: 12 },
  raised: { backgroundColor: colors.successBg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  raisedText: { color: "#15803D", fontWeight: "800", fontSize: 11 },
  label: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, marginBottom: 6 },
  chip: { paddingHorizontal: 14, height: 38, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12.5 },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: 14, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  sumLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  sumValue: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 4 },
  card: { flexDirection: "row", padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 10, gap: 12, alignItems: "center" },
  name: { fontWeight: "700", color: colors.text, fontSize: 14 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  value: { fontWeight: "800", color: colors.text, fontSize: 14, marginTop: 4 },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", marginTop: 60, gap: 12 },
  emptyText: { color: colors.textSecondary, fontSize: 15, fontWeight: "600" },
});
