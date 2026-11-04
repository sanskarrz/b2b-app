// Data Sync — imported parties auto-matched to app retailers; exceptions linked by hand
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView, TextInput } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

export function SyncMatching() {
  const [d, setD] = useState<any>(null);
  const [linkFor, setLinkFor] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => api("/distributor/me/sync/matching").then(setD).catch(() => {}), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const link = async (userId: string | null, party = linkFor) => {
    try {
      await api("/distributor/me/sync/link", { method: "POST", body: { party_id: party.id, user_id: userId } });
      showSuccess(userId ? "Linked" : "Unlinked");
      setLinkFor(null); setQ("");
      load();
    } catch (e: any) { showError(e.message); }
  };

  if (!d) return null;
  return (
    <View style={styles.card} testID="sync-matching">
      <Text style={styles.title}>Retailer matching</Text>
      <Text style={styles.sub}>{d.matched.length} parties matched to app retailers (GST → phone → name) · {d.exceptions.length} exceptions · {d.ledger_unmatched}/{d.ledger_rows} ledger rows unmatched</Text>
      {d.exceptions.map((p: any) => (
        <View key={p.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>⚠ {p.name}</Text>
            <Text style={styles.sub}>{[p.code, p.phone, p.gstin, p.area || p.city].filter(Boolean).join(" · ") || "No details"}</Text>
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => setLinkFor(p)} testID={`link-${p.id}`}><Text style={styles.btnText}>Link</Text></TouchableOpacity>
        </View>
      ))}
      {d.matched.slice(0, 20).map((p: any) => (
        <View key={p.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>✓ {p.name}</Text>
            <Text style={styles.sub}>→ {p.linked_name} · by {p.link_method}</Text>
          </View>
          <TouchableOpacity onPress={() => link(null, p)} style={styles.ghost} testID={`unlink-${p.id}`}><Text style={{ color: colors.danger, fontWeight: "700", fontSize: 12 }}>Unlink</Text></TouchableOpacity>
        </View>
      ))}
      <Modal visible={!!linkFor} transparent animationType="slide" onRequestClose={() => setLinkFor(null)}>
        <Pressable style={styles.bg} onPress={() => setLinkFor(null)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.title}>Link “{linkFor?.name}” to</Text>
            <TextInput style={styles.in} value={q} onChangeText={setQ} placeholder="Search your customers" placeholderTextColor={colors.textTertiary} />
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {d.customers.filter((c: any) => !q || c.name.toLowerCase().includes(q.toLowerCase())).map((c: any) => (
                <TouchableOpacity key={c.id} style={styles.opt} onPress={() => link(c.id)} testID={`link-to-${c.id}`}><Text style={styles.name}>{c.name}</Text></TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF", gap: 6 },
  title: { fontWeight: "800", fontSize: 15, color: colors.text },
  sub: { fontSize: 11.5, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { fontWeight: "700", fontSize: 13, color: colors.text },
  btn: { backgroundColor: colors.primary, paddingHorizontal: 14, height: 36, borderRadius: 10, justifyContent: "center" },
  btnText: { color: "#FFF", fontWeight: "800", fontSize: 12 },
  ghost: { paddingHorizontal: 8, height: 36, justifyContent: "center" },
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30, gap: 10 },
  in: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, height: 44, paddingHorizontal: 12, color: "#000" },
  opt: { minHeight: 46, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
});
