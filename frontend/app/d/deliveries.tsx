// Owner/Manager — Delivery oversight: assign riders + view proof
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Modal, Pressable, Image } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

const TABS = [
  { k: "to_assign", l: "To Assign" },
  { k: "in_progress", l: "In Progress" },
  { k: "delivered", l: "Delivered" },
];

export default function Deliveries() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("to_assign");
  const [assignFor, setAssignFor] = useState<any | null>(null);
  const [proofFor, setProofFor] = useState<any | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [photos, setPhotos] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api("/distributor/me/orders"), api("/distributor/me/staff?role=delivery")]);
      setOrders(o.items || o);
      setRiders(s);
    } catch (e: any) { showError(e?.message || "Could not load", "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const filtered = orders.filter((o) => {
    const ds = o.delivery_status;
    if (tab === "to_assign") return o.status === "dispatched" && (!ds || ds === "assigned") && !o.assigned_to;
    if (tab === "in_progress") return o.assigned_to && (ds === "assigned" || ds === "out_for_delivery");
    return ds === "delivered" || ds === "failed";
  });

  const assign = async (riderId: string) => {
    const oid = assignFor.id;
    setAssignFor(null);
    try { await api(`/distributor/orders/${oid}/assign`, { method: "PATCH", body: { delivery_user_id: riderId } }); showSuccess("Rider assigned"); await load(); }
    catch (e: any) { showError(e?.message || "Failed"); }
  };

  const autoAssign = async () => {
    setAssigning(true);
    try {
      const r = await api("/distributor/me/deliveries/auto-assign", { method: "POST" });
      showSuccess(r.assigned > 0 ? `Auto-assigned ${r.assigned} order(s) by area` : `No area matches (${r.unmatched} unmatched). Set rider areas in Team.`);
      await load();
    } catch (e: any) { showError(e?.message || "Failed"); }
    finally { setAssigning(false); }
  };

  const openPhotos = async () => {
    setPhotosOpen(true);
    try { setPhotos(await api("/distributor/me/delivery-photos")); }
    catch (e: any) { showError(e?.message || "Could not load photos"); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>Deliveries</Text>
        <TouchableOpacity onPress={openPhotos} style={styles.backBtn} testID="all-photos-btn"><Ionicons name="images-outline" size={20} color={colors.text} /></TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.k} style={[styles.tab, tab === t.k && styles.tabActive]} onPress={() => setTab(t.k)}>
            <Text style={[styles.tabText, tab === t.k && styles.tabTextActive]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "to_assign" && (
        <TouchableOpacity style={[styles.autoBar, assigning && { opacity: 0.5 }]} onPress={autoAssign} disabled={assigning} testID="auto-assign-btn">
          {assigning ? <ActivityIndicator color={colors.primary} size="small" /> : <><Ionicons name="flash" size={16} color={colors.primary} /><Text style={styles.autoText}>Auto-assign riders by area</Text></>}
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="cube-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>Nothing here</Text></View>}
          renderItem={({ item: o }) => {
            const failed = o.delivery_status === "failed";
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.code}>{o.code}</Text>
                  <Text style={styles.total}>{formatINRFull(o.total)}</Text>
                </View>
                <Text style={styles.shop}>{o.customer_name || o.user_name || "Customer"}</Text>
                {!!o.assigned_to_name && <Text style={styles.rider}><Ionicons name="bicycle" size={12} color={colors.primary} /> {o.assigned_to_name}{o.delivery_status === "out_for_delivery" ? " · en route" : ""}</Text>}
                {failed && <Text style={[styles.rider, { color: colors.danger }]}>Failed: {o.fail_reason}</Text>}
                <View style={styles.cardFoot}>
                  {tab === "to_assign" && (
                    <TouchableOpacity style={styles.assignBtn} onPress={() => setAssignFor(o)} testID="assign-rider">
                      <Ionicons name="person-add" size={14} color="#FFF" />
                      <Text style={styles.assignText}>Assign Rider</Text>
                    </TouchableOpacity>
                  )}
                  {tab === "in_progress" && (
                    <TouchableOpacity style={styles.reassignBtn} onPress={() => setAssignFor(o)}>
                      <Text style={styles.reassignText}>Reassign</Text>
                    </TouchableOpacity>
                  )}
                  {o.delivery_status === "delivered" && o.delivery_proof && (
                    <TouchableOpacity style={styles.proofBtn} onPress={() => setProofFor(o)}>
                      <Ionicons name="image" size={14} color={colors.primary} />
                      <Text style={styles.proofText}>View Proof</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Assign rider modal */}
      <Modal visible={!!assignFor} transparent animationType="slide" onRequestClose={() => setAssignFor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setAssignFor(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Assign delivery rider</Text>
            {riders.length === 0 ? (
              <Text style={styles.emptyText}>No delivery staff yet. Add one in Team.</Text>
            ) : riders.map((r) => (
              <TouchableOpacity key={r.id} style={styles.riderRow} onPress={() => assign(r.id)}>
                <View style={styles.riderAvatar}><Ionicons name="bicycle" size={16} color={colors.success} /></View>
                <Text style={styles.riderName}>{r.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Proof modal */}
      <Modal visible={!!proofFor} transparent animationType="fade" onRequestClose={() => setProofFor(null)}>
        <Pressable style={styles.proofBg} onPress={() => setProofFor(null)}>
          <View style={styles.proofCard}>
            {proofFor?.delivery_proof?.photo_base64 && <Image source={{ uri: proofFor.delivery_proof.photo_base64 }} style={styles.proofImg} resizeMode="contain" />}
            <Text style={styles.proofMeta}>Delivered by {proofFor?.delivery_proof?.rider_name} · {proofFor?.delivery_proof?.captured_at ? new Date(proofFor.delivery_proof.captured_at).toLocaleString() : ""}</Text>
            {proofFor?.delivery_proof?.notes && <Text style={styles.proofNote}>“{proofFor.delivery_proof.notes}”</Text>}
            {(proofFor?.delivery_proof?.lat != null) && <Text style={styles.proofMeta}>📍 {proofFor.delivery_proof.lat?.toFixed(4)}, {proofFor.delivery_proof.lng?.toFixed(4)}</Text>}
          </View>
        </Pressable>
      </Modal>

      {/* All delivery photos gallery */}
      <Modal visible={photosOpen} transparent animationType="slide" onRequestClose={() => setPhotosOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setPhotosOpen(false)}>
          <Pressable style={[styles.modalCard, { maxHeight: "85%" }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>All delivery photos ({photos.length})</Text>
            <FlatList
              data={photos}
              keyExtractor={(p) => p.order_id}
              numColumns={2}
              columnWrapperStyle={{ gap: 8 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No delivery photos yet</Text>}
              renderItem={({ item: p }) => (
                <TouchableOpacity style={styles.photoTile} onPress={() => { setPhotosOpen(false); setProofFor({ code: p.code, delivery_proof: { photo_base64: p.photo_base64, rider_name: p.rider_name, captured_at: p.captured_at, notes: p.notes, lat: p.lat, lng: p.lng } }); }}>
                  <Image source={{ uri: p.photo_base64 }} style={styles.photoTileImg} />
                  <Text style={styles.photoTileText} numberOfLines={1}>{p.customer_name}</Text>
                </TouchableOpacity>
              )}
            />
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
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 12, marginVertical: 8 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12.5 },
  tabTextActive: { color: "#FFF" },
  autoBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: 12, marginBottom: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primaryBg, borderWidth: 1, borderColor: colors.primarySoft },
  autoText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  photoTile: { flex: 1, marginBottom: 8 },
  photoTileImg: { width: "100%", height: 130, borderRadius: 10, backgroundColor: colors.surface },
  photoTileText: { color: colors.text, fontSize: 11.5, fontWeight: "600", marginTop: 4 },
  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between" },
  code: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  total: { fontWeight: "800", color: colors.text, fontSize: 14 },
  shop: { fontWeight: "800", color: colors.text, fontSize: 15, marginTop: 4 },
  rider: { color: colors.textSecondary, fontSize: 12.5, marginTop: 5, fontWeight: "600" },
  cardFoot: { marginTop: 12 },
  assignBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 10 },
  assignText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  reassignBtn: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  reassignText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  proofBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: colors.primaryBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  proofText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", marginTop: 50, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { fontWeight: "800", color: colors.text, fontSize: 17, marginBottom: 12 },
  riderRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  riderAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.successBg, alignItems: "center", justifyContent: "center" },
  riderName: { flex: 1, fontWeight: "700", color: colors.text, fontSize: 15 },
  proofBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 20 },
  proofCard: { width: "100%", alignItems: "center", gap: 10 },
  proofImg: { width: "100%", height: 360, borderRadius: 12, backgroundColor: "#222" },
  proofMeta: { color: "#FFF", fontSize: 12.5, textAlign: "center" },
  proofNote: { color: "#FFF", fontSize: 14, fontStyle: "italic", textAlign: "center" },
});
