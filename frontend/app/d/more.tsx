// Distributor More — team & operations, owner roles, profile, sign-out
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Pressable, Platform } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { OwnerRolesCard } from "@/src/components/OwnerRolesCard";
import { api, clearToken } from "@/src/api";
import { showError, showSuccess, showInfo } from "@/src/components/Toast";
import { confirm } from "@/src/components/confirm";
import { colors, radius } from "@/src/theme";

const BACKEND = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

export default function DistributorMore() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<any | null>(null);
  const [label, setLabel] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const isOwner = me?.role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await api("/auth/me");
      setMe(profile);
      if (profile?.role === "owner") {
        const data = await api("/distributor/me/api-keys");
        setKeys(data);
      }
    } catch (e: any) {
      showError(e?.message || "Could not load profile", "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    setCreating(true);
    try {
      const r = await api("/distributor/me/api-keys", { method: "POST", body: { label: label.trim() || "ERP Integration" } });
      setNewKey(r);
      setLabel("");
      setShowCreate(false);
      await load();
    } catch (e: any) {
      showError(e?.message || "Could not create key", "Failed");
    } finally {
      setCreating(false);
    }
  };

  const revoke = (id: string, lab: string) => {
    confirm("Revoke API key?", `"${lab}" will stop working immediately. This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/distributor/me/api-keys/${id}`, { method: "DELETE" });
            showSuccess("API key revoked");
            await load();
          } catch (e: any) {
            showError(e?.message || "Could not revoke", "Failed");
          }
        },
      },
    ]);
  };

  const signOut = async () => {
    await clearToken();
    router.replace("/auth/choose");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.header}>
          <Text style={styles.title}>More</Text>
        </View>

        {/* Team & Operations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Team & Operations</Text>
          <TouchableOpacity style={styles.itemRow} onPress={() => router.push("/d/team")} testID="nav-team">
            <Ionicons name="people-outline" size={20} color={colors.text} />
            <Text style={styles.itemText}>My Team</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.itemRow} onPress={() => router.push("/d/leads")} testID="nav-leads">
            <Ionicons name="funnel-outline" size={20} color={colors.text} />
            <Text style={styles.itemText}>Sales CRM</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.itemRow} onPress={() => router.push("/d/deliveries")} testID="nav-deliveries">
            <Ionicons name="bicycle-outline" size={20} color={colors.text} />
            <Text style={styles.itemText}>Deliveries</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.itemRow} onPress={() => router.push("/d/queries")} testID="nav-queries">
            <Ionicons name="help-buoy-outline" size={20} color={colors.text} />
            <Text style={styles.itemText}>Query Management</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.itemRow} onPress={() => router.push("/d/staff-chat")} testID="nav-staff-chat">
            <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
            <Text style={styles.itemText}>Team Chat</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.itemRow} onPress={() => router.push("/d/bills")} testID="nav-bills">
            <Ionicons name="document-text-outline" size={20} color={colors.text} />
            <Text style={styles.itemText}>Auto Bills</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.itemRow} onPress={() => router.push("/d/sync")} testID="nav-sync">
            <Ionicons name="sync-outline" size={20} color={colors.text} />
            <Text style={styles.itemText}>Data Sync (Import / Export)</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.itemRow} onPress={() => router.push("/d/sync-data")} testID="nav-sync-data">
            <Ionicons name="server-outline" size={20} color={colors.text} />
            <Text style={styles.itemText}>My System Data (Items / Parties)</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.itemRow} onPress={() => router.push("/d/settings")} testID="nav-order-settings">
            <Ionicons name="options-outline" size={20} color={colors.text} />
            <Text style={styles.itemText}>Order Settings</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {isOwner && <OwnerRolesCard />}

        {/* Profile/Sign out */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.itemRow} onPress={() => router.push("/profile")}>
            <Ionicons name="person-circle-outline" size={20} color={colors.text} />
            <Text style={styles.itemText}>Profile</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.itemRow} onPress={signOut}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={[styles.itemText, { color: colors.danger }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>


    </SafeAreaView>
  );
}

function DocEndpoint({ method, path, desc, curl }: { method: string; path: string; desc: string; curl: string }) {
  const methodColor = method === "GET" ? colors.info : method === "POST" ? colors.success : colors.warning;
  return (
    <View style={styles.endpoint}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={[styles.methodPill, { backgroundColor: methodColor }]}>
          <Text style={styles.methodText}>{method}</Text>
        </View>
        <Text style={styles.endpointPath}>{path}</Text>
      </View>
      <Text style={styles.endpointDesc}>{desc}</Text>
      <View style={styles.codeBlock}>
        <Text selectable style={styles.codeText}>{curl}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 16, paddingBottom: 6 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },

  banner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: colors.primaryBg, marginHorizontal: 12, marginTop: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary + "30" },
  bannerIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" },
  bannerTitle: { fontWeight: "800", color: colors.text, fontSize: 13 },
  bannerSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },

  section: { marginTop: 18, paddingHorizontal: 12 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontWeight: "800", color: colors.text, fontSize: 14 },
  sectionSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 16 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: "#FFF", fontWeight: "800", fontSize: 11 },

  docsRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginTop: 8, backgroundColor: colors.infoBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.info + "30" },
  docsText: { flex: 1, color: colors.info, fontWeight: "700", fontSize: 12.5 },

  newKeyBox: { marginTop: 10, padding: 12, backgroundColor: "#1F2937", borderRadius: radius.md },
  newKeyLabel: { color: "#FCD34D", fontWeight: "800", fontSize: 11 },
  newKeyText: { color: "#A7F3D0", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12, lineHeight: 16 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.success, borderRadius: 8 },
  copyText: { color: "#FFF", fontWeight: "800", fontSize: 11 },
  dismissBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#374151", borderRadius: 8 },
  dismissText: { color: "#FFF", fontWeight: "700", fontSize: 11 },

  keyRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, marginTop: 8, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  keyIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primaryBg, alignItems: "center", justifyContent: "center" },
  keyLabel: { fontWeight: "800", color: colors.text, fontSize: 12.5 },
  keyPrefix: { color: colors.textSecondary, fontSize: 10.5, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginTop: 2 },
  keyMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  revokeBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerBg },

  empty: { alignItems: "center", marginTop: 24, gap: 4, paddingVertical: 14 },
  emptyText: { color: colors.text, fontWeight: "700" },
  emptySub: { color: colors.textSecondary, fontSize: 11 },

  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginTop: 8, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  itemText: { flex: 1, color: colors.text, fontWeight: "700", fontSize: 13 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  modalHandle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  modalSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4, marginBottom: 12 },
  modalInput: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text },
  cancelBtn: { flex: 1, alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.text, fontWeight: "700" },
  saveBtn: { flex: 2, padding: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 14 },

  docHelp: { color: colors.text, fontSize: 12.5, lineHeight: 17 },
  endpoint: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  methodPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  methodText: { color: "#FFF", fontWeight: "800", fontSize: 9 },
  endpointPath: { color: colors.text, fontWeight: "800", fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  endpointDesc: { color: colors.textSecondary, fontSize: 11.5, marginTop: 4 },
  codeBlock: { backgroundColor: "#0F172A", borderRadius: 8, padding: 10, marginTop: 6 },
  codeText: { color: "#7DD3FC", fontSize: 10.5, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 15 },
  code: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11, backgroundColor: colors.surface, paddingHorizontal: 4, color: colors.danger },

  tipBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.warningBg, padding: 10, borderRadius: 10, marginTop: 16, borderWidth: 1, borderColor: colors.warning + "40" },
  tipText: { flex: 1, color: colors.text, fontSize: 11.5, lineHeight: 16 },
});
