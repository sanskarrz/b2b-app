// Distributor settings — auto-accept (no overdue) + default cash discount
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Switch, TextInput } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

export default function DistributorSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoAccept, setAutoAccept] = useState(false);
  const [cd, setCd] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api("/distributor/me/settings");
      setAutoAccept(!!s.auto_accept_no_overdue);
      setCd(String(s.cd_default_pct ?? 0));
    } catch (e: any) {
      showError(e?.message || "Could not load settings", "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async (patch: any) => {
    setSaving(true);
    try {
      await api("/distributor/me/settings", { method: "PATCH", body: patch });
      showSuccess("Settings saved");
    } catch (e: any) {
      showError(e?.message || "Could not save", "Failed");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleAuto = (v: boolean) => { setAutoAccept(v); save({ auto_accept_no_overdue: v }); };
  const saveCd = () => save({ cd_default_pct: parseFloat(cd) || 0 });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="settings-back"><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>Order Settings</Text>
        <View style={{ width: 36 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.cardTitle}>Auto-accept orders</Text>
                <Text style={styles.cardSub}>Automatically accept new orders when the customer has no overdue payments.</Text>
              </View>
              <Switch value={autoAccept} onValueChange={toggleAuto} trackColor={{ true: colors.primary }} testID="auto-accept-switch" />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Default cash discount (%)</Text>
            <Text style={styles.cardSub}>Applied by default when taking orders. Reps can add extra CD or offers.</Text>
            <View style={styles.cdRow}>
              <TextInput value={cd} onChangeText={(v) => setCd(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" style={styles.input} testID="cd-input" />
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={saveCd} disabled={saving} testID="save-cd">
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontWeight: "800", color: colors.text, fontSize: 15 },
  cardSub: { color: colors.textSecondary, fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  cdRow: { flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" },
  input: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  saveBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
