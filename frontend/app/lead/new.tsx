// Add a new lead (field sales + owner/manager)
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

export default function NewLead() {
  const router = useRouter();
  const [form, setForm] = useState<any>({ shop_name: "", contact_name: "", phone: "", area: "", address: "", est_value: "" });
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.shop_name.trim()) { showError("Shop name is required"); return; }
    setBusy(true);
    try {
      await api("/distributor/me/leads", {
        method: "POST",
        body: {
          shop_name: form.shop_name.trim(),
          contact_name: form.contact_name || null,
          phone: form.phone || null,
          area: form.area || null,
          address: form.address || null,
          est_value: form.est_value ? parseFloat(form.est_value) : null,
        },
      });
      showSuccess("Lead added");
      router.back();
    } catch (e: any) {
      showError(e?.message || "Could not add lead", "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="close" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>New Lead</Text>
        <View style={{ width: 36 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Field label="Shop / Pharmacy name *" value={form.shop_name} onChange={(v) => set("shop_name", v)} placeholder="e.g. Sunrise Medicals" autoFocus />
          <Field label="Contact person" value={form.contact_name} onChange={(v) => set("contact_name", v)} placeholder="Owner name" />
          <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} placeholder="10-digit mobile" keyboardType="phone-pad" />
          <Field label="Area / Locality" value={form.area} onChange={(v) => set("area", v)} placeholder="e.g. Thane West" />
          <Field label="Full address" value={form.address} onChange={(v) => set("address", v)} placeholder="Shop address" multiline />
          <Field label="Estimated monthly value (₹)" value={form.est_value} onChange={(v) => set("est_value", v.replace(/[^\d]/g, ""))} placeholder="e.g. 80000" keyboardType="number-pad" />

          <TouchableOpacity style={[styles.saveBtn, busy && { opacity: 0.5 }]} onPress={save} disabled={busy} testID="save-lead">
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Add Lead</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, multiline, autoFocus }: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        multiline={multiline}
        autoFocus={autoFocus}
        style={[styles.input, multiline && { height: 70, textAlignVertical: "top" }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  label: { fontSize: 12.5, fontWeight: "700", color: colors.text, marginBottom: 6 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: colors.text },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 12, alignItems: "center", marginTop: 10 },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
});
