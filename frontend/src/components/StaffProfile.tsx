// Shared staff profile (delivery + field) — info, change password, logout
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Modal, Pressable, TextInput } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, clearToken } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { confirm } from "@/src/components/confirm";
import { colors, radius } from "@/src/theme";

const ROLE_LABEL: any = { delivery: "Delivery Partner", field_sales: "Field Sales Rep", manager: "Manager", owner: "Owner" };

export function StaffProfile() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pwOpen, setPwOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setMe(await api("/auth/me")); } catch (e: any) { showError(e?.message || "Failed"); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const logout = () => {
    confirm("Log out?", "You'll need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: async () => { await clearToken(); router.replace("/auth/choose"); } },
    ]);
  };

  const changePw = async () => {
    if (!cur || next.length < 6) { showError("New password must be at least 6 characters"); return; }
    setBusy(true);
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: cur, new_password: next } });
      showSuccess("Password changed");
      setPwOpen(false); setCur(""); setNext("");
    } catch (e: any) { showError(e?.message || "Failed", "Could not change password"); }
    finally { setBusy(false); }
  };

  if (loading) return <SafeAreaView style={styles.container}><ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.head}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(me?.name || "?")[0]?.toUpperCase()}</Text></View>
          <Text style={styles.name}>{me?.name}</Text>
          <Text style={styles.role}>{ROLE_LABEL[me?.role] || "Staff"}</Text>
          <Text style={styles.email}>{me?.email}</Text>
        </View>

        {me?.password_hash !== undefined || true ? (
          <TouchableOpacity style={styles.row} onPress={() => setPwOpen(true)}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
            <Text style={styles.rowText}>Change password</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.row} onPress={logout} testID="logout-btn">
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={[styles.rowText, { color: colors.danger }]}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={pwOpen} transparent animationType="slide" onRequestClose={() => setPwOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setPwOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Change password</Text>
            <TextInput value={cur} onChangeText={setCur} placeholder="Current password" placeholderTextColor={colors.textTertiary} secureTextEntry style={styles.input} />
            <TextInput value={next} onChangeText={setNext} placeholder="New password (min 6 chars)" placeholderTextColor={colors.textTertiary} secureTextEntry style={styles.input} />
            <TouchableOpacity style={[styles.saveBtn, busy && { opacity: 0.5 }]} onPress={changePw} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Update password</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  head: { alignItems: "center", marginBottom: 20, marginTop: 10 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFF", fontWeight: "800", fontSize: 28 },
  name: { fontWeight: "800", color: colors.text, fontSize: 20, marginTop: 12 },
  role: { color: colors.primary, fontWeight: "700", fontSize: 13, marginTop: 3 },
  email: { color: colors.textSecondary, fontSize: 13, marginTop: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 10 },
  rowText: { flex: 1, color: colors.text, fontWeight: "600", fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { fontWeight: "800", color: colors.text, fontSize: 17, marginBottom: 12 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 13, marginBottom: 10, color: colors.text, fontSize: 15 },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 4 },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
});
