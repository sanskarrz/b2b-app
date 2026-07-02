// Distributor — Area & time-wise auto bill generation
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Modal, Pressable, TextInput } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function Bills() {
  const router = useRouter();
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState("");
  const [schedule, setSchedule] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setBills(await api("/distributor/me/bills")); }
    catch (e: any) { showError(e?.message || "Could not load bills", "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api("/distributor/me/bills/generate", { method: "POST", body: { area: area.trim() || null, scheduled_for: schedule.trim() || null } });
      showSuccess(r.generated > 0 ? `Generated ${r.generated} bill(s)` : "No unbilled orders match");
      setOpen(false); setArea(""); setSchedule("");
      await load();
    } catch (e: any) { showError(e?.message || "Could not generate", "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="bills-back"><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>Auto Bills</Text>
        <TouchableOpacity onPress={() => setOpen(true)} style={styles.addBtn} testID="generate-bills-btn"><Ionicons name="add" size={20} color="#FFF" /></TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="document-text-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>No bills generated yet.{"\n"}Tap + to batch-generate by area.</Text></View>}
          renderItem={({ item: b }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.code}>{b.code}</Text>
                <Text style={styles.total}>{formatINRFull(b.total)}</Text>
              </View>
              <Text style={styles.cust}>{b.customer_name}</Text>
              <Text style={styles.meta}>{b.order_count} orders · {b.area || "—"}{b.scheduled_for ? ` · scheduled ${b.scheduled_for}` : ""}</Text>
            </View>
          )}
        />
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Generate bills</Text>
            <Text style={styles.modalSub}>Batches all unbilled accepted/dispatched/delivered orders per customer.</Text>
            <Text style={styles.fieldLabel}>Area (optional — filters customers)</Text>
            <TextInput value={area} onChangeText={setArea} placeholder="e.g. Thane West" placeholderTextColor={colors.textTertiary} style={styles.input} />
            <Text style={styles.fieldLabel}>Schedule for (optional label)</Text>
            <TextInput value={schedule} onChangeText={setSchedule} placeholder="e.g. Tomorrow 9 AM" placeholderTextColor={colors.textTertiary} style={styles.input} />
            <TouchableOpacity style={[styles.saveBtn, busy && { opacity: 0.5 }]} onPress={generate} disabled={busy} testID="confirm-generate-bills">
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Generate now</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  addBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.primary },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between" },
  code: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  total: { fontWeight: "800", color: colors.text, fontSize: 15 },
  cust: { fontWeight: "800", color: colors.text, fontSize: 15, marginTop: 4 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  empty: { alignItems: "center", marginTop: 50, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { fontWeight: "800", color: colors.text, fontSize: 18 },
  modalSub: { color: colors.textSecondary, fontSize: 12.5, marginTop: 4, marginBottom: 6 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11.5, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15 },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 12, alignItems: "center", marginTop: 18 },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
});
