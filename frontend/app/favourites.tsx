// Favourites / Watchlist — saved products
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function Favourites() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api("/favourites"));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const removeFav = async (pid: string) => {
    await api(`/favourites/${pid}`, { method: "DELETE" });
    load();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Favourites" subtitle={`${items.length} saved medicines`} showBack />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={42} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No favourites yet</Text>
          <Text style={styles.emptySub}>Tap the star icon on any medicine to save it here.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/search")}>
            <Text style={styles.emptyBtnText}>Browse Products</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          {items.map((p) => (
            <TouchableOpacity key={p.id} style={styles.card} onPress={() => router.push(`/search?q=${encodeURIComponent(p.name)}`)}>
              <View style={styles.thumb}>
                <Text style={{ fontSize: 24 }}>{p.image_emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.salt}>{p.salt}</Text>
                <Text style={styles.mfr}>{p.manufacturer} • {p.pack}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <Text style={styles.ptr}>PTR {formatINRFull(p.ptr)}</Text>
                  <View style={styles.marginPill}>
                    <Text style={styles.marginText}>{p.margin_pct}% margin</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => removeFav(p.id)} style={styles.starBtn}>
                <Ionicons name="heart" size={20} color={colors.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
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
  card: {
    flexDirection: "row", gap: 12, alignItems: "center",
    padding: 12, marginBottom: 10,
    backgroundColor: "#FFF",
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  thumb: {
    width: 50, height: 50, borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  name: { fontWeight: "800", color: colors.text, fontSize: 13 },
  salt: { fontSize: 11, color: colors.primary, marginTop: 2, fontWeight: "600" },
  mfr: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  ptr: { fontWeight: "700", color: colors.text, fontSize: 12 },
  marginPill: { backgroundColor: colors.successBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  marginText: { color: "#15803D", fontSize: 9, fontWeight: "800" },
  starBtn: { padding: 4 },
});
