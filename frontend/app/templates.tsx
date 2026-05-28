// Order Templates — save & reload recurring carts
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal,
} from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";
import { confirm } from "@/src/components/confirm";
import { showError, showSuccess } from "@/src/components/Toast";

export default function Templates() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api("/templates"));
    } catch (e: any) {
      showError(e?.message || "Could not load templates", "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Template name is required");
      return;
    }
    if (trimmed.length < 3) {
      setNameError("Name must be at least 3 characters");
      return;
    }
    if (trimmed.length > 60) {
      setNameError("Name must be 60 characters or less");
      return;
    }
    setNameError("");
    setSaving(true);
    try {
      await api("/templates", { method: "POST", body: { name: trimmed } });
      setModal(false);
      setName("");
      showSuccess(`"${trimmed}" saved`, "Template created");
      load();
    } catch (e: any) {
      const msg = e?.message || "Could not save template";
      setNameError(msg);
      showError(msg, "Cannot save");
    } finally {
      setSaving(false);
    }
  };

  const loadTemplate = async (id: string) => {
    try {
      const res: any = await api(`/templates/${id}/load`, { method: "POST" });
      showSuccess(`${res.added} items added to cart`, "Template loaded");
      confirm("Template loaded", `${res.added} items added to cart`, [
        { text: "Go to Cart", onPress: () => router.push("/cart") },
        { text: "Stay", style: "cancel" },
      ]);
    } catch (e: any) {
      showError(e?.message || "Could not load template into cart", "Load failed");
    }
  };

  const del = (id: string, n: string) => {
    confirm("Delete template?", `Remove "${n}" — this cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/templates/${id}`, { method: "DELETE" });
            showSuccess(`"${n}" deleted`);
            load();
          } catch (e: any) {
            showError(e?.message || "Could not delete template", "Delete failed");
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar
        title="Order Templates"
        subtitle="Reusable carts for recurring orders"
        showBack
        rightIcons={[{ name: "add-circle-outline", onPress: () => setModal(true), testID: "tpl-add" }]}
      />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="bookmark-outline" size={42} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No templates yet</Text>
              <Text style={styles.emptySub}>Add items to cart, then tap + to save as a template.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/cart")}>
                <Text style={styles.emptyBtnText}>Go to Cart</Text>
              </TouchableOpacity>
            </View>
          ) : (
            items.map((t) => (
              <View key={t.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.tplIcon}>
                    <Ionicons name="bookmark" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tplName}>{t.name}</Text>
                    <Text style={styles.tplMeta}>{t.sku_count} items • {formatINRFull(t.estimated_value)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => del(t.id, t.name)} style={styles.delBtn}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.loadBtn}
                  onPress={() => loadTemplate(t.id)}
                  testID={`load-tpl-${t.id}`}
                >
                  <Ionicons name="add-circle" size={14} color="#FFF" />
                  <Text style={styles.loadBtnText}>Load into Cart</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add template modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => { setModal(false); setNameError(""); }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save current cart as template</Text>
            <TextInput
              style={[styles.input, nameError ? styles.inputError : null]}
              placeholder="e.g., Monthly Antibiotics Stock"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={(v) => { setName(v); if (nameError) setNameError(""); }}
              maxLength={60}
              autoFocus
            />
            {nameError ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={12} color={colors.danger} />
                <Text style={styles.errorText}>{nameError}</Text>
              </View>
            ) : (
              <Text style={styles.charCount}>{name.length}/60</Text>
            )}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModal(false); setName(""); setNameError(""); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (!name.trim() || saving) && { opacity: 0.5 }]}
                onPress={save}
                disabled={!name.trim() || saving}
              >
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { alignItems: "center", marginTop: 60, gap: 10, paddingHorizontal: 30 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  emptySub: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  emptyBtn: { marginTop: 8, backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12 },
  emptyBtnText: { color: "#FFF", fontWeight: "800" },
  card: { backgroundColor: "#FFF", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  tplIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryBg, alignItems: "center", justifyContent: "center" },
  tplName: { fontWeight: "800", color: colors.text, fontSize: 14 },
  tplMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  delBtn: { padding: 6 },
  loadBtn: {
    marginTop: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.primary, paddingVertical: 9, borderRadius: 10,
  },
  loadBtnText: { color: "#FFF", fontWeight: "800", fontSize: 12.5 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", padding: 18, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  modalTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginBottom: 12 },
  input: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerBg + "40" },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  errorText: { fontSize: 11.5, color: colors.danger, fontWeight: "600" },
  charCount: { fontSize: 10.5, color: colors.textTertiary, marginTop: 4, textAlign: "right" },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surface, alignItems: "center" },
  cancelBtnText: { color: colors.text, fontWeight: "700" },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" },
  saveBtnText: { color: "#FFF", fontWeight: "800" },
});
