// Owner/Manager — Team management (create & manage staff)
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Modal, Pressable, TextInput, ScrollView } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { confirm } from "@/src/components/confirm";
import { colors, radius } from "@/src/theme";

const ROLES = [
  { k: "manager", l: "Manager", icon: "briefcase", desc: "Full access" },
  { k: "field_sales", l: "Field Sales", icon: "walk", desc: "Leads & CRM" },
  { k: "delivery", l: "Delivery", icon: "bicycle", desc: "Deliveries" },
];
const ROLE_META: any = {
  manager: { l: "Manager", icon: "briefcase", color: colors.primary },
  field_sales: { l: "Field Sales", icon: "walk", color: colors.info },
  delivery: { l: "Delivery", icon: "bicycle", color: colors.success },
};

export default function Team() {
  const router = useRouter();
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: "", email: "", password: "", role: "field_sales", phone: "" });
  const [busy, setBusy] = useState(false);
  const [areaFor, setAreaFor] = useState<any | null>(null);
  const [areaText, setAreaText] = useState("");
  const [partyData, setPartyData] = useState<any>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const openParties = async (s: any) => {
    setAreaFor(s); setAreaText((s.areas || []).join(", ")); setPartyData(null);
    try {
      const r = await api(`/distributor/me/staff/${s.id}/parties`);
      setPartyData(r); setPicked(r.party_ids || []);
    } catch (e: any) { showError(e.message); }
  };

  const areaList = areaText.split(",").map((a) => a.trim()).filter(Boolean);
  const inArea = (c: any) => areaList.some((a) => (c.hay || c.area || "").toLowerCase().includes(a.toLowerCase()));

  const saveAreas = async () => {
    if (!areaFor) return;
    try {
      await api(`/distributor/me/staff/${areaFor.id}/parties`, { method: "PATCH", body: { areas: areaList, party_ids: picked } });
      showSuccess("Parties updated");
      setAreaFor(null); setAreaText("");
      await load();
    } catch (e: any) { showError(e?.message || "Failed"); }
  };

  const load = useCallback(async () => {
    try { setStaff(await api("/distributor/me/staff")); }
    catch (e: any) { showError(e?.message || "Could not load team", "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      showError("Fill name, email and a 6+ char password"); return;
    }
    setBusy(true);
    try {
      await api("/distributor/me/staff", { method: "POST", body: { ...form, name: form.name.trim(), email: form.email.trim() } });
      showSuccess("Staff member added");
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "field_sales", phone: "" });
      await load();
    } catch (e: any) { showError(e?.message || "Could not add staff", "Failed"); }
    finally { setBusy(false); }
  };

  const toggleActive = (s: any) => {
    if (s.active) {
      confirm("Deactivate?", `${s.name} won't be able to log in.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: async () => {
          try { await api(`/distributor/me/staff/${s.id}`, { method: "DELETE" }); await load(); showSuccess("Deactivated"); }
          catch (e: any) { showError(e?.message || "Failed"); }
        } },
      ]);
    } else {
      (async () => {
        try { await api(`/distributor/me/staff/${s.id}`, { method: "PATCH", body: { active: true } }); await load(); showSuccess("Reactivated"); }
        catch (e: any) { showError(e?.message || "Failed"); }
      })();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>My Team</Text>
        <TouchableOpacity onPress={() => setOpen(true)} style={styles.addBtn} testID="add-staff"><Ionicons name="add" size={20} color="#FFF" /></TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="people-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>No staff yet. Tap + to add.</Text></View>}
          renderItem={({ item: s }) => {
            const m = ROLE_META[s.role] || {};
            return (
              <View style={[styles.card, !s.active && { opacity: 0.55 }]}>
                <View style={[styles.roleIcon, { backgroundColor: (m.color || colors.primary) + "22" }]}>
                  <Ionicons name={m.icon || "person"} size={18} color={m.color || colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.sub}>{m.l} · {s.email}</Text>
                  {(s.role === "delivery" || s.role === "field_sales" || (s.ops_roles || []).length > 0) && (
                    <TouchableOpacity onPress={() => openParties(s)} testID={`areas-${s.id}`}>
                      <Text style={styles.areasLine}>
                        <Ionicons name="people-outline" size={11} color={colors.primary} /> {(s.areas?.length || s.party_ids?.length) ? `${(s.areas || []).join(", ")}${s.party_ids?.length ? ` + ${s.party_ids.length} parties` : ""}` : "Set Parties"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {!s.active && <Text style={styles.inactive}>INACTIVE</Text>}
                </View>
                <TouchableOpacity onPress={() => toggleActive(s)} style={styles.toggle}>
                  <Ionicons name={s.active ? "pause-circle-outline" : "play-circle-outline"} size={22} color={s.active ? colors.danger : colors.success} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!areaFor} transparent animationType="slide" onRequestClose={() => setAreaFor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setAreaFor(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Set Parties · {areaFor?.name}</Text>
            <Text style={styles.fieldLabel}>Areas / pincodes (comma-separated) — every retailer in these areas is visible to them.</Text>
            <TextInput value={areaText} onChangeText={setAreaText} placeholder="e.g. Thane West, Mulund, 400601" placeholderTextColor={colors.textTertiary} style={styles.input} testID="parties-areas" />
            <Text style={styles.fieldLabel}>Retailers ({partyData ? partyData.customers.filter((c: any) => inArea(c) || picked.includes(c.id)).length : 0} visible) — tick extra parties outside their areas</Text>
            <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              {(partyData?.customers || []).map((c: any) => {
                const on = picked.includes(c.id) || inArea(c);
                return (
                  <TouchableOpacity key={c.id} disabled={inArea(c)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}
                    onPress={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))} testID={`party-${c.id}`}>
                    <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? colors.primary : colors.textTertiary} />
                    <Text style={{ flex: 1, color: colors.text, fontWeight: "600" }}>{c.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{inArea(c) ? "in area" : c.area || ""}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveAreas} testID="save-areas">
              <Text style={styles.saveText}>Save parties</Text>
            </TouchableOpacity>
            <View style={{ height: 16 }} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Add team member</Text>
              <Text style={styles.fieldLabel}>Role</Text>
              <View style={styles.roleRow}>
                {ROLES.map((r) => (
                  <TouchableOpacity key={r.k} style={[styles.roleChip, form.role === r.k && styles.roleChipActive]} onPress={() => set("role", r.k)}>
                    <Ionicons name={r.icon as any} size={16} color={form.role === r.k ? "#FFF" : colors.textSecondary} />
                    <Text style={[styles.roleChipText, form.role === r.k && { color: "#FFF" }]}>{r.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Inp label="Full name" value={form.name} onChange={(v: string) => set("name", v)} placeholder="e.g. Amit Verma" />
              <Inp label="Email" value={form.email} onChange={(v: string) => set("email", v)} placeholder="staff@company.com" keyboardType="email-address" />
              <Inp label="Phone" value={form.phone} onChange={(v: string) => set("phone", v)} placeholder="Mobile number" keyboardType="phone-pad" />
              <Inp label="Temporary password" value={form.password} onChange={(v: string) => set("password", v)} placeholder="Min 6 characters" />
              <TouchableOpacity style={[styles.saveBtn, busy && { opacity: 0.5 }]} onPress={create} disabled={busy} testID="create-staff">
                {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Create account</Text>}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Inp({ label, value, onChange, placeholder, keyboardType }: any) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textTertiary} keyboardType={keyboardType} autoCapitalize="none" style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  addBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.primary },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  roleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "800", color: colors.text, fontSize: 15 },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  areasLine: { color: colors.primary, fontSize: 11.5, marginTop: 4, fontWeight: "600" },
  inactive: { color: colors.danger, fontSize: 9.5, fontWeight: "800", marginTop: 3 },
  toggle: { padding: 4 },
  empty: { alignItems: "center", marginTop: 50, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "88%" },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { fontWeight: "800", color: colors.text, fontSize: 18, marginBottom: 6 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11.5, fontWeight: "700", marginBottom: 6, marginTop: 4 },
  roleRow: { flexDirection: "row", gap: 6 },
  roleChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  roleChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleChipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 11.5 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: colors.text },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 12, alignItems: "center", marginTop: 18 },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
});
