// Shared lead detail (field sales + owner/manager): status, activities, convert
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Modal, Pressable, TextInput } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { confirm } from "@/src/components/confirm";
import { colors, radius, formatINR } from "@/src/theme";

const STAGES = ["new", "contacted", "visited", "converted", "lost"];
const STAGE_COLOR: any = { new: colors.info, contacted: colors.warning, visited: colors.primary, converted: colors.success, lost: colors.danger };
const ACT_ICON: any = { call: "call", visit: "walk", note: "create" };

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actOpen, setActOpen] = useState(false);
  const [actType, setActType] = useState("call");
  const [actNote, setActNote] = useState("");

  const load = useCallback(async () => {
    try { setLead(await api(`/distributor/me/leads/${id}`)); }
    catch (e: any) { showError(e?.message || "Could not load lead", "Load failed"); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (status: string) => {
    setBusy(true);
    try { await api(`/distributor/me/leads/${id}`, { method: "PATCH", body: { status } }); await load(); }
    catch (e: any) { showError(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const logActivity = async () => {
    setActOpen(false);
    setBusy(true);
    try {
      let lat, lng;
      if (actType === "visit") {
        try {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status === "granted") {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            lat = pos.coords.latitude; lng = pos.coords.longitude;
          }
        } catch {}
      }
      await api(`/distributor/me/leads/${id}/activity`, { method: "POST", body: { type: actType, notes: actNote || null, lat, lng } });
      setActNote("");
      showSuccess("Activity logged");
      await load();
    } catch (e: any) { showError(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const convert = () => {
    confirm("Convert to customer?", `${lead.shop_name} will be added as a customer with a default credit line.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Convert", onPress: async () => {
        setBusy(true);
        try { await api(`/distributor/me/leads/${id}/convert`, { method: "POST" }); showSuccess("Lead converted to customer 🎉"); await load(); }
        catch (e: any) { showError(e?.message || "Failed", "Could not convert"); }
        finally { setBusy(false); }
      } },
    ]);
  };

  if (loading || !lead) {
    return <SafeAreaView style={styles.container} edges={["top"]}><Header onBack={() => router.back()} /><ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /></SafeAreaView>;
  }

  const phone = (lead.phone || "").replace(/\D/g, "");
  const converted = lead.status === "converted";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <View style={styles.card}>
          <Text style={styles.shop}>{lead.shop_name}</Text>
          <Text style={styles.meta}>{lead.contact_name || ""}{lead.area ? ` · ${lead.area}` : ""}</Text>
          {!!lead.address && <Text style={styles.meta}>{lead.address}</Text>}
          {!!lead.est_value && <Text style={styles.value}>Est. value {formatINR(lead.est_value)}</Text>}
          <View style={styles.actions}>
            {!!phone && <TouchableOpacity style={styles.pill} onPress={() => Linking.openURL(`tel:${lead.phone}`)}><Ionicons name="call" size={15} color={colors.primary} /><Text style={styles.pillText}>Call</Text></TouchableOpacity>}
            {!!phone && <TouchableOpacity style={styles.pill} onPress={() => Linking.openURL(`https://wa.me/${phone}`)}><Ionicons name="logo-whatsapp" size={15} color={colors.success} /><Text style={styles.pillText}>WhatsApp</Text></TouchableOpacity>}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Stage</Text>
        <View style={styles.stageRow}>
          {STAGES.map((s) => (
            <TouchableOpacity key={s} disabled={busy || converted} style={[styles.stageChip, lead.status === s && { backgroundColor: STAGE_COLOR[s], borderColor: STAGE_COLOR[s] }]} onPress={() => setStatus(s)}>
              <Text style={[styles.stageChipText, lead.status === s && { color: "#FFF" }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!converted ? (
          <TouchableOpacity style={[styles.convertBtn, busy && { opacity: 0.5 }]} onPress={convert} disabled={busy} testID="convert-lead">
            <Ionicons name="person-add" size={16} color="#FFF" />
            <Text style={styles.convertText}>Convert to Customer</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.wonBanner}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.wonText}>Converted to customer</Text>
          </View>
        )}

        <View style={styles.actHead}>
          <Text style={styles.sectionTitle}>Activity</Text>
          {!converted && <TouchableOpacity style={styles.logBtn} onPress={() => { setActType("call"); setActOpen(true); }} testID="log-activity"><Ionicons name="add" size={16} color={colors.primary} /><Text style={styles.logText}>Log</Text></TouchableOpacity>}
        </View>
        {(lead.activities || []).length === 0 ? (
          <Text style={styles.emptyText}>No activity yet. Log a call or visit.</Text>
        ) : (
          [...lead.activities].reverse().map((a: any) => (
            <View key={a.id} style={styles.actRow}>
              <View style={styles.actIcon}><Ionicons name={ACT_ICON[a.type] || "ellipse"} size={14} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actType}>{a.type.toUpperCase()}{a.lat ? " · 📍 checked in" : ""}</Text>
                {!!a.notes && <Text style={styles.actNote}>{a.notes}</Text>}
                <Text style={styles.actDate}>{new Date(a.at).toLocaleString()} · {a.by_name || ""}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={actOpen} transparent animationType="slide" onRequestClose={() => setActOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setActOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Log activity</Text>
            <View style={styles.typeRow}>
              {["call", "visit", "note"].map((t) => (
                <TouchableOpacity key={t} style={[styles.typeChip, actType === t && styles.typeChipActive]} onPress={() => setActType(t)}>
                  <Ionicons name={ACT_ICON[t]} size={15} color={actType === t ? "#FFF" : colors.textSecondary} />
                  <Text style={[styles.typeText, actType === t && { color: "#FFF" }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={actNote} onChangeText={setActNote} placeholder="Add notes (optional)…" placeholderTextColor={colors.textTertiary} style={styles.input} multiline />
            {actType === "visit" && <Text style={styles.hint}>📍 Your location will be captured as check-in proof</Text>}
            <TouchableOpacity style={styles.saveBtn} onPress={logActivity}><Text style={styles.saveText}>Save activity</Text></TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.topbar}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
      <Text style={styles.topTitle}>Lead</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16 },
  shop: { fontWeight: "800", color: colors.text, fontSize: 19 },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  value: { color: colors.primary, fontWeight: "800", fontSize: 14, marginTop: 8 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  pillText: { fontWeight: "700", color: colors.text, fontSize: 12.5 },
  sectionTitle: { fontWeight: "800", color: colors.text, fontSize: 14, marginTop: 18, marginBottom: 10 },
  stageRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  stageChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stageChipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12, textTransform: "capitalize" },
  convertBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.success, paddingVertical: 14, borderRadius: 12, marginTop: 16 },
  convertText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  wonBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.successBg, padding: 14, borderRadius: radius.md, marginTop: 16 },
  wonText: { fontWeight: "800", color: colors.text, fontSize: 14 },
  actHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primaryBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginTop: 8 },
  logText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  actRow: { flexDirection: "row", gap: 10, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  actIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primaryBg, alignItems: "center", justifyContent: "center" },
  actType: { fontWeight: "800", color: colors.text, fontSize: 12 },
  actNote: { color: colors.textSecondary, fontSize: 13, marginTop: 3 },
  actDate: { color: colors.textTertiary, fontSize: 11, marginTop: 4 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { fontWeight: "800", color: colors.text, fontSize: 17, marginBottom: 12 },
  typeRow: { flexDirection: "row", gap: 8 },
  typeChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13, textTransform: "capitalize" },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginTop: 12, minHeight: 60, color: colors.text, fontSize: 14 },
  hint: { color: colors.textSecondary, fontSize: 12, marginTop: 8 },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 14 },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
});
