// Distributor: shop GPS location + delivery localities + cut-off slots (rough ETA for pharmacies)
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

export function DeliverySlotsCard() {
  const [locs, setLocs] = useState<string[]>([]);
  const [newLoc, setNewLoc] = useState("");
  const [slots, setSlots] = useState<{ cutoff: string; window: string }[]>([]);
  const [geo, setGeo] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useFocusEffect(useCallback(() => {
    api("/distributor/me/delivery-slots").then((r) => { setLocs(r.localities); setSlots(r.slots); setGeo(r); }).catch(() => {});
  }, []));

  const save = async () => {
    setBusy(true);
    try {
      const r = await api("/distributor/me/delivery-slots", { method: "PUT", body: { localities: locs, slots: slots.filter((s) => s.cutoff || s.window) } });
      setLocs(r.localities); setSlots(r.slots);
      showSuccess("Delivery areas & slots saved");
    } catch (e: any) { showError(e.message); } finally { setBusy(false); }
  };

  const gps = async () => {
    try {
      const cur = await Location.getForegroundPermissionsAsync();
      if (!cur.granted) {
        if (!cur.canAskAgain && cur.status === "denied") return setBlocked(true);
        const r = await Location.requestForegroundPermissionsAsync();
        if (!r.granted) { setBlocked(!r.canAskAgain); return showError("Location lets nearby pharmacies find you first"); }
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const r = await api("/distributor/me/location", { method: "PATCH", body: { lat: p.coords.latitude, lng: p.coords.longitude } });
      setGeo(r);
      showSuccess("Shop location saved");
    } catch (e: any) { showError(e?.message || "Couldn't read location"); }
  };

  const addLoc = () => {
    const v = newLoc.trim();
    if (v && !locs.some((l) => l.toLowerCase() === v.toLowerCase())) setLocs([...locs, v]);
    setNewLoc("");
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Shop location</Text>
      <Text style={styles.sub}>{geo.lat ? `Saved (${Number(geo.lat).toFixed(4)}, ${Number(geo.lng).toFixed(4)})` : "Not set — pharmacies can't see how near you are"}</Text>
      <TouchableOpacity style={styles.ghost} onPress={gps} testID="dist-use-gps"><Ionicons name="locate" size={16} color={colors.primary} /><Text style={styles.ghostText}>Use current GPS location</Text></TouchableOpacity>
      {blocked && <TouchableOpacity onPress={() => Linking.openSettings()} style={{ minHeight: 32, justifyContent: "center" }}><Text style={styles.ghostText}>Open Settings to allow location</Text></TouchableOpacity>}

      <Text style={[styles.title, { marginTop: 16 }]}>Localities you deliver to</Text>
      <Text style={styles.sub}>Pharmacies outside these areas see {'"'}Not in delivery area{'"'}. Leave empty to serve everyone.</Text>
      <View style={styles.chips}>
        {locs.map((l) => (
          <TouchableOpacity key={l} style={styles.chip} onPress={() => setLocs(locs.filter((x) => x !== l))}>
            <Text style={styles.chipText}>{l}</Text><Ionicons name="close" size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.row}>
        <TextInput style={[styles.in, { flex: 1 }]} value={newLoc} onChangeText={setNewLoc} onSubmitEditing={addLoc} placeholder="e.g. Bhandup" placeholderTextColor={colors.textTertiary} testID="loc-input" />
        <TouchableOpacity style={styles.add} onPress={addLoc} testID="loc-add"><Text style={styles.addText}>Add</Text></TouchableOpacity>
      </View>

      <Text style={[styles.title, { marginTop: 16 }]}>Delivery slots</Text>
      <Text style={styles.sub}>Orders placed before the cut-off are delivered in that slot. After the last cut-off → next day{"'"}s first slot.</Text>
      {slots.map((s, i) => (
        <View key={i} style={styles.row}>
          <TextInput style={[styles.in, { width: 80 }]} value={s.cutoff} onChangeText={(v) => setSlots(slots.map((x, j) => (j === i ? { ...x, cutoff: v } : x)))} placeholder="11:00" placeholderTextColor={colors.textTertiary} testID={`slot-cutoff-${i}`} />
          <TextInput style={[styles.in, { flex: 1 }]} value={s.window} onChangeText={(v) => setSlots(slots.map((x, j) => (j === i ? { ...x, window: v } : x)))} placeholder="1:00 PM – 3:00 PM" placeholderTextColor={colors.textTertiary} testID={`slot-window-${i}`} />
          <TouchableOpacity onPress={() => setSlots(slots.filter((_, j) => j !== i))} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.danger} /></TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity onPress={() => setSlots([...slots, { cutoff: "", window: "" }])} style={{ minHeight: 36, justifyContent: "center" }} testID="slot-add">
        <Text style={styles.ghostText}>+ Add slot (cut-off HH:MM, 24h)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.save} onPress={save} disabled={busy} testID="slots-save">
        {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.addText}>Save delivery settings</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12, gap: 6 },
  title: { fontWeight: "800", color: colors.text, fontSize: 15 },
  sub: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  ghost: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 },
  ghostText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 32, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  in: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, height: 44, paddingHorizontal: 10, fontSize: 14, color: "#000", backgroundColor: colors.surface },
  add: { backgroundColor: colors.primary, paddingHorizontal: 16, height: 44, borderRadius: 10, justifyContent: "center" },
  addText: { color: "#FFF", fontWeight: "800" },
  save: { backgroundColor: colors.primary, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 10 },
});
