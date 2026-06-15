// Distributor Inventory — view + edit stock and pricing per product
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Pressable, FlatList } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

const FILTERS = [
  { k: "", l: "All" },
  { k: "in", l: "In stock" },
  { k: "low", l: "Low" },
  { k: "out", l: "Out" },
];

export default function DistributorInventory() {
  const params = useLocalSearchParams<{ only?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<string>(params.only || "");
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ptr: "", mrp: "", qty_available: "", scheme: "", expiry: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query) qs.set("q", query);
      if (only) qs.set("only", only);
      const d = await api(`/distributor/me/inventory?${qs.toString()}`);
      setItems(d);
    } catch (e: any) {
      showError(e?.message || "Could not load inventory", "Load failed");
    } finally {
      setLoading(false);
    }
  }, [query, only]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = (it: any) => {
    setEditing(it);
    setForm({
      ptr: String(it.ptr || ""),
      mrp: String(it.mrp || ""),
      qty_available: String(it.qty_available || 0),
      scheme: it.scheme || "",
      expiry: it.expiry || "",
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api(`/distributor/me/inventory/${editing.product_id}`, {
        method: "PATCH",
        body: {
          ptr: form.ptr ? parseFloat(form.ptr) : null,
          mrp: form.mrp ? parseFloat(form.mrp) : null,
          qty_available: form.qty_available ? parseInt(form.qty_available, 10) : 0,
          scheme: form.scheme || null,
          expiry: form.expiry || null,
        },
      });
      showSuccess("Inventory updated");
      setEditing(null);
      await load();
    } catch (e: any) {
      showError(e?.message || "Could not update", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.sub}>{items.length} SKUs</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color={colors.textSecondary} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search name, salt, manufacturer…" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.k} style={[styles.filterChip, only === f.k && styles.filterChipActive]} onPress={() => setOnly(f.k)}>
            <Text style={[styles.filterText, only === f.k && styles.filterTextActive]}>{f.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No products match this filter</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.product_id}
          renderItem={({ item: p }: any) => {
            const statusColor = p.stock_status === "out" ? colors.danger : p.stock_status === "low" ? colors.warning : colors.success;
            return (
              <TouchableOpacity style={styles.row} onPress={() => openEdit(p)}>
                <Text style={styles.emoji}>{p.image_emoji}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.pName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.pMeta} numberOfLines={1}>{p.salt} • {p.manufacturer} • {p.pack}</Text>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                    <Text style={styles.ptr}>{formatINRFull(p.ptr)}</Text>
                    <Text style={styles.mrp}>MRP {formatINRFull(p.mrp)}</Text>
                    {p.margin_pct != null && <Text style={styles.marginText}>{p.margin_pct.toFixed(0)}%</Text>}
                    {p.scheme && <Text style={styles.scheme}>{p.scheme}</Text>}
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={[styles.qtyBox, { borderColor: statusColor }]}>
                    <Text style={[styles.qtyText, { color: statusColor }]}>{p.qty_available}</Text>
                  </View>
                  <Text style={styles.qtyLabel}>units</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        />
      )}

      {/* Edit modal */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.modalBg} onPress={() => setEditing(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editing?.name}</Text>
            <Text style={styles.modalSub}>{editing?.salt} • {editing?.manufacturer}</Text>
            <View style={styles.formGrid}>
              <Field label="PTR (₹)" value={form.ptr} onChange={(v) => setForm({ ...form, ptr: v.replace(/[^\d.]/g, "") })} keyboardType="decimal-pad" />
              <Field label="MRP (₹)" value={form.mrp} onChange={(v) => setForm({ ...form, mrp: v.replace(/[^\d.]/g, "") })} keyboardType="decimal-pad" />
              <Field label="Qty in stock" value={form.qty_available} onChange={(v) => setForm({ ...form, qty_available: v.replace(/\D/g, "") })} keyboardType="number-pad" />
              <Field label="Expiry (e.g., Jun 27)" value={form.expiry} onChange={(v) => setForm({ ...form, expiry: v })} />
            </View>
            <Field label="Scheme (e.g., 10+1 Free)" value={form.scheme} onChange={(v) => setForm({ ...form, scheme: v })} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark" size={16} color="#FFF" /><Text style={styles.saveText}>Save Changes</Text></>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, keyboardType }: { label: string; value: string; onChange: (v: string) => void; keyboardType?: any }) {
  return (
    <View style={{ flex: 1, gap: 5, marginBottom: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboardType} style={styles.input} placeholderTextColor={colors.textTertiary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 16, paddingBottom: 6 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  searchWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 12, marginTop: 4, paddingHorizontal: 10, backgroundColor: colors.surface, borderRadius: 10, height: 38, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 13 },

  filterRow: { flexDirection: "row", gap: 6, paddingHorizontal: 12, marginTop: 10 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: "#FFF" },

  row: { flexDirection: "row", alignItems: "center", padding: 10, gap: 10, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  emoji: { fontSize: 28 },
  pName: { fontWeight: "800", color: colors.text, fontSize: 13 },
  pMeta: { color: colors.textSecondary, fontSize: 11 },
  ptr: { fontWeight: "800", color: colors.text, fontSize: 13 },
  mrp: { color: colors.textTertiary, fontSize: 10, textDecorationLine: "line-through" },
  marginText: { color: colors.success, fontWeight: "800", fontSize: 10 },
  scheme: { color: colors.primary, fontWeight: "700", fontSize: 10 },
  qtyBox: { minWidth: 50, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5, alignItems: "center" },
  qtyText: { fontWeight: "800", fontSize: 16 },
  qtyLabel: { color: colors.textTertiary, fontSize: 9, marginTop: 2 },

  empty: { alignItems: "center", marginTop: 60, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  modalHandle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  modalSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2, marginBottom: 16 },
  formGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 10 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text },
  cancelBtn: { flex: 1, alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cancelText: { color: colors.text, fontWeight: "700" },
  saveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, borderRadius: 10, backgroundColor: colors.primary },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
