// Distributor — pending mapping requests: approve with credit limit, or decline.
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { GradePill, StarsView } from "@/src/components/Ratings";
import { colors, radius } from "@/src/theme";

export function MappingRequests({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [sel, setSel] = useState<any | null>(null);
  const [limit, setLimit] = useState("50000");
  const [days, setDays] = useState("21");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await api("/distributor/me/mapping-requests")); } catch (e: any) { showError(e.message); setRows([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      if (approve) {
        await api(`/distributor/me/mapping-requests/${sel.user_id}/approve`, { method: "POST", body: { credit_limit: Number(limit) || 0, credit_days: Number(days) || null } });
        showSuccess(`${sel.name} mapped`);
      } else {
        await api(`/distributor/me/mapping-requests/${sel.user_id}/reject`, { method: "POST", body: { reason: reason.trim() || null } });
        showSuccess("Request declined");
      }
      setSel(null); setReason("");
      load(); onChanged?.();
    } catch (e: any) { showError(e.message); } finally { setBusy(false); }
  };

  if (!rows) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.user_id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>No pending mapping requests</Text>}
        renderItem={({ item: r }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSel(r)} testID={`req-${r.user_id}`}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.meta}>{[r.contact_name, r.phone, r.area || r.address].filter(Boolean).join(" • ")}</Text>
            {(r.gst || r.drug_license) && <Text style={styles.meta}>{r.gst ? `GST ${r.gst}` : ""}{r.drug_license ? `  DL ${r.drug_license}` : ""}</Text>}
            <View style={styles.row}>
              <GradePill grade={r.rating?.grade} score={r.rating?.score} />
              <StarsView avg={r.rating?.stars_avg} count={r.rating?.stars_count} />
              {r.distance_km != null && <Text style={styles.meta}>{r.distance_km} km away</Text>}
            </View>
            <Text style={styles.tap}>Tap to review →</Text>
          </TouchableOpacity>
        )}
      />
      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSel(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={styles.bg} onPress={() => setSel(null)}>
            <Pressable style={styles.sheet}>
              <Text style={styles.sheetTitle}>{sel?.name}</Text>
              <Text style={styles.meta}>Credit {sel?.rating?.grade} · {sel?.rating?.paid_on_time}/{sel?.rating?.paid} bills paid on time · {sel?.rating?.overdue_count} overdue</Text>
              <Text style={styles.label}>Credit limit (₹)</Text>
              <TextInput style={styles.input} value={limit} onChangeText={(v) => setLimit(v.replace(/\D/g, ""))} keyboardType="number-pad" testID="approve-limit" />
              <Text style={styles.label}>Credit days</Text>
              <TextInput style={styles.input} value={days} onChangeText={(v) => setDays(v.replace(/\D/g, ""))} keyboardType="number-pad" testID="approve-days" />
              <TouchableOpacity style={styles.approve} onPress={() => decide(true)} disabled={busy} testID="approve-btn">
                {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Approve & Map</Text>}
              </TouchableOpacity>
              <TextInput style={[styles.input, { marginTop: 14 }]} value={reason} onChangeText={setReason} placeholder="Reason (optional, if declining)" placeholderTextColor={colors.textTertiary} />
              <TouchableOpacity style={styles.reject} onPress={() => decide(false)} disabled={busy} testID="reject-btn">
                <Text style={[styles.btnText, { color: colors.danger }]}>Decline request</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 40 },
  card: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 10, backgroundColor: "#FFF", gap: 4 },
  name: { fontWeight: "800", fontSize: 15, color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
  tap: { color: colors.primary, fontWeight: "700", fontSize: 12, marginTop: 6 },
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30 },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  label: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 46, fontSize: 15, color: "#000" },
  approve: { backgroundColor: colors.success, height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 16 },
  reject: { height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8, borderWidth: 1, borderColor: colors.border },
  btnText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
});
