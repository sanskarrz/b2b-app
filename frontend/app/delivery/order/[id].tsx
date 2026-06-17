// Delivery detail — navigate, mark delivered (photo + GPS proof), or fail
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Image, Modal, Pressable, TextInput, Platform } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { confirm } from "@/src/components/confirm";
import { colors, radius, formatINRFull } from "@/src/theme";

const FAIL_REASONS = ["Shop closed", "Customer refused", "Wrong address", "Payment issue", "No one available", "Other"];

export default function DeliveryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [failOpen, setFailOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api(`/delivery/me/orders`);
      const completed = await api(`/delivery/me/orders?status=completed`);
      const found = [...list, ...completed].find((o: any) => o.id === id);
      setOrder(found || null);
    } catch (e: any) {
      showError(e?.message || "Could not load delivery", "Load failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const navigate = () => {
    const addr = encodeURIComponent(order?.customer_address || "");
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${addr}`,
      default: `https://www.google.com/maps/search/?api=1&query=${addr}`,
    });
    Linking.openURL(url!);
  };

  const takePhoto = async () => {
    // Contextual camera permission
    const perm = await ImagePicker.getCameraPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") {
      if (!perm.canAskAgain) {
        confirm("Camera access needed", "Enable camera access to capture delivery proof.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const req = await ImagePicker.requestCameraPermissionsAsync();
      status = req.status;
      if (status !== "granted") {
        if (!req.canAskAgain) {
          confirm("Camera access needed", "Enable camera access in Settings to capture delivery proof.", [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]);
        }
        return;
      }
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.4, base64: true, allowsEditing: false });
    if (!result.canceled && result.assets?.[0]?.base64) {
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const getLocation = async (): Promise<{ lat?: number; lng?: number }> => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") return {};
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return {};
    }
  };

  const markDelivered = async () => {
    if (!photo) { showError("Please capture a delivery photo as proof"); return; }
    setBusy(true);
    try {
      const loc = await getLocation();
      await api(`/delivery/orders/${id}/deliver`, {
        method: "POST",
        body: { photo_base64: photo, lat: loc.lat, lng: loc.lng, notes: notes || null },
      });
      showSuccess("Delivery completed ✓");
      router.back();
    } catch (e: any) {
      showError(e?.message || "Could not complete delivery", "Failed");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    try {
      await api(`/delivery/orders/${id}/start`, { method: "POST" });
      load();
    } catch (e: any) { showError(e?.message || "Failed"); }
  };

  const failDelivery = async (reason: string) => {
    setFailOpen(false);
    setBusy(true);
    try {
      await api(`/delivery/orders/${id}/fail`, { method: "POST", body: { reason } });
      showSuccess("Marked as failed");
      router.back();
    } catch (e: any) {
      showError(e?.message || "Failed");
    } finally { setBusy(false); }
  };

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header onBack={() => router.back()} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const done = order.delivery_status === "delivered" || order.delivery_status === "failed";
  const phone = (order.customer_phone || "").replace(/\D/g, "");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <View style={styles.card}>
          <Text style={styles.code}>{order.code}</Text>
          <Text style={styles.shop}>{order.customer_name}</Text>
          <View style={styles.addrRow}>
            <Ionicons name="location" size={16} color={colors.primary} />
            <Text style={styles.addr}>{order.customer_address || "No address on file"}</Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.navBtn} onPress={navigate}>
              <Ionicons name="navigate" size={16} color="#FFF" />
              <Text style={styles.navText}>Navigate</Text>
            </TouchableOpacity>
            {!!phone && (
              <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${order.customer_phone}`)}>
                <Ionicons name="call" size={16} color={colors.primary} />
                <Text style={styles.callText}>Call</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.payCard}>
          <Text style={styles.payLabel}>{order.payment_method === "cash" ? "COLLECT CASH" : "PAYMENT"}</Text>
          <Text style={[styles.payVal, { color: order.payment_method === "cash" ? colors.warning : colors.success }]}>
            {order.payment_method === "cash" ? formatINRFull(order.total) : "On credit (no collection)"}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Items ({order.sku_count})</Text>
        <View style={styles.card}>
          {(order.items || []).map((it: any, i: number) => (
            <View key={i} style={[styles.itemRow, i > 0 && styles.itemBorder]}>
              <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
              <Text style={styles.itemQty}>x{it.qty}</Text>
            </View>
          ))}
        </View>

        {done ? (
          <View style={[styles.doneBanner, order.delivery_status === "failed" ? styles.failBanner : styles.okBanner]}>
            <Ionicons name={order.delivery_status === "failed" ? "close-circle" : "checkmark-circle"} size={20} color={order.delivery_status === "failed" ? colors.danger : colors.success} />
            <Text style={styles.doneText}>{order.delivery_status === "failed" ? `Failed: ${order.fail_reason}` : "Delivered successfully"}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Proof of delivery</Text>
            <TouchableOpacity style={styles.photoBox} onPress={takePhoto} testID="capture-photo">
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera" size={32} color={colors.primary} />
                  <Text style={styles.photoText}>Tap to capture delivery photo</Text>
                </View>
              )}
            </TouchableOpacity>
            {photo && (
              <TouchableOpacity style={styles.retake} onPress={takePhoto}>
                <Ionicons name="refresh" size={14} color={colors.primary} />
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
            )}
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a note (optional)…"
              placeholderTextColor={colors.textTertiary}
              style={styles.notes}
              multiline
            />

            <TouchableOpacity style={[styles.deliverBtn, (busy || !photo) && { opacity: 0.5 }]} onPress={markDelivered} disabled={busy || !photo} testID="mark-delivered">
              {busy ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark-done" size={18} color="#FFF" /><Text style={styles.deliverText}>Mark as Delivered</Text></>}
            </TouchableOpacity>
            {order.delivery_status !== "out_for_delivery" && (
              <TouchableOpacity style={styles.startBtn} onPress={start}>
                <Text style={styles.startText}>Mark Out for Delivery</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.failBtn} onPress={() => setFailOpen(true)} testID="fail-delivery">
              <Text style={styles.failText}>Can't deliver?</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={failOpen} transparent animationType="slide" onRequestClose={() => setFailOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setFailOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Why couldn't you deliver?</Text>
            {FAIL_REASONS.map((r) => (
              <TouchableOpacity key={r} style={styles.reasonRow} onPress={() => failDelivery(r)}>
                <Text style={styles.reasonText}>{r}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
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
      <Text style={styles.topTitle}>Delivery</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  code: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  shop: { fontWeight: "800", color: colors.text, fontSize: 18, marginTop: 4 },
  addrRow: { flexDirection: "row", gap: 6, marginTop: 8, alignItems: "flex-start" },
  addr: { flex: 1, color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  navBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, paddingVertical: 11, borderRadius: 10 },
  navText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  callBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primaryBg, paddingVertical: 11, borderRadius: 10 },
  callText: { color: colors.primary, fontWeight: "800", fontSize: 14 },
  payCard: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  payLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  payVal: { fontSize: 18, fontWeight: "800", marginTop: 4 },
  sectionTitle: { fontWeight: "800", color: colors.text, fontSize: 14, marginBottom: 8 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  itemBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  itemName: { flex: 1, color: colors.text, fontSize: 13 },
  itemQty: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  photoBox: { height: 200, borderRadius: radius.md, borderWidth: 2, borderColor: colors.primarySoft, borderStyle: "dashed", overflow: "hidden", backgroundColor: colors.primaryBg },
  photoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  photoText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  photoPreview: { width: "100%", height: "100%" },
  retake: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 },
  retakeText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  notes: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginTop: 12, minHeight: 50, color: colors.text, fontSize: 14 },
  deliverBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.success, paddingVertical: 15, borderRadius: 12, marginTop: 14 },
  deliverText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  startBtn: { alignItems: "center", paddingVertical: 12, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  startText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  failBtn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  failText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  doneBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderRadius: radius.md, marginTop: 8 },
  okBanner: { backgroundColor: colors.successBg },
  failBanner: { backgroundColor: colors.dangerBg },
  doneText: { fontWeight: "800", color: colors.text, fontSize: 14, flex: 1 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { fontWeight: "800", color: colors.text, fontSize: 17, marginBottom: 10 },
  reasonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  reasonText: { color: colors.text, fontSize: 15, fontWeight: "600" },
});
