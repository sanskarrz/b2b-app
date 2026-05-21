import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

const RECENT = ["Azithromycin", "Paracetamol", "Cetirizine", "Metformin"];
const QUICK_FILTERS = ["Antibiotic", "Analgesic", "Diabetes", "Cardiac", "Gastric"];

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [distributors, setDistributors] = useState<any[]>([]);
  const [distFilter, setDistFilter] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    api("/distributors").then(setDistributors).catch(() => {});
  }, []);

  useEffect(() => {
    if (!q.trim() && !distFilter) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (distFilter) params.set("distributor_id", distFilter);
        const data = await api(`/products?${params.toString()}`);
        setResults(data);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, distFilter]);

  const activeDistName = distFilter ? distributors.find((d) => d.id === distFilter)?.short_name : null;

  const runScan = async (mode: "camera" | "library") => {
    try {
      if (mode === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow camera to scan prescriptions");
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow photo access to upload bills");
          return;
        }
      }
      const result =
        mode === "camera"
          ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, allowsEditing: true })
          : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const b64 = result.assets[0].base64;
      router.push({ pathname: "/scan-result", params: { image: b64 } });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not capture image");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="search-back">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              value={q}
              onChangeText={setQ}
              placeholder="Search medicine, salt, manufacturer"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              testID="search-input"
            />
            {q.length > 0 && (
              <TouchableOpacity onPress={() => setQ("")}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Scan & Upload actions */}
        <View style={styles.scanRow}>
          <TouchableOpacity style={styles.scanBtn} onPress={() => runScan("camera")} testID="scan-btn">
            <View style={styles.scanIcon}>
              <Ionicons name="scan-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scanTitle}>Scan Prescription / Bill</Text>
              <Text style={styles.scanSub}>AI extracts medicines & finds best vendors</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => runScan("library")} testID="upload-btn">
            <Ionicons name="cloud-upload-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Distributor filter row */}
        <View style={styles.distFilterRow}>
          <Text style={styles.distFilterLabel}>From:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <TouchableOpacity
              style={[styles.dPill, !distFilter && styles.dPillActive]}
              onPress={() => setDistFilter(null)}
              testID="dist-filter-all"
            >
              <Text style={[styles.dPillText, !distFilter && styles.dPillTextActive]}>All vendors</Text>
            </TouchableOpacity>
            {distributors.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.dPill, distFilter === d.id && styles.dPillActive]}
                onPress={() => setDistFilter(d.id)}
                testID={`dist-filter-${d.id}`}
              >
                <Text style={[styles.dPillText, distFilter === d.id && styles.dPillTextActive]}>
                  {d.short_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {!searched ? (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={styles.sectionLabel}>Recent searches</Text>
            <View style={styles.chipRow}>
              {RECENT.map((r, i) => (
                <TouchableOpacity key={i} style={styles.chip} onPress={() => setQ(r)}>
                  <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                  <Text style={styles.chipText}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Quick filters</Text>
            <View style={styles.chipRow}>
              {QUICK_FILTERS.map((f, i) => (
                <TouchableOpacity key={i} style={styles.chip} onPress={() => setQ(f)}>
                  <Text style={styles.chipText}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : results.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              No products found{q ? ` for "${q}"` : ""}{activeDistName ? ` from ${activeDistName}` : ""}
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(i) => i.id}
            ListHeaderComponent={
              activeDistName ? (
                <Text style={styles.resultHint}>
                  {results.length} products • from {activeDistName}
                </Text>
              ) : (
                <Text style={styles.resultHint}>{results.length} products found</Text>
              )
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/product/${item.id}`)}
                testID={`product-${item.id}`}
              >
                <View style={styles.thumb}>
                  <Text style={{ fontSize: 22 }}>{item.image_emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.salt}>
                    {item.salt} • {item.manufacturer}
                  </Text>
                  <Text style={styles.pack}>{item.pack}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <Text style={styles.ptr}>{formatINRFull(item.ptr)}</Text>
                    <Text style={styles.mrp}>MRP {formatINRFull(item.mrp)}</Text>
                    {item.scheme && (
                      <View style={styles.schemeBadge}>
                        <Text style={styles.schemeText}>{item.scheme}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={styles.marginBadge}>
                    <Text style={styles.marginText}>{item.margin_pct.toFixed(1)}% margin</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} style={{ marginTop: 8 }} />
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 4,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  scanRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scanBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  scanIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  scanTitle: { color: colors.text, fontWeight: "800", fontSize: 13 },
  scanSub: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
  uploadBtn: {
    width: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  distFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  distFilterLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: "700" },
  dPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dPillText: { fontSize: 11, fontWeight: "600", color: colors.text },
  dPillTextActive: { color: "#FFF" },
  sectionLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: "700", marginBottom: 10, letterSpacing: 0.5 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
  },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  resultHint: { fontSize: 11, color: colors.textSecondary, fontWeight: "600", marginBottom: 10 },
  card: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 10,
    gap: 12,
    alignItems: "center",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 14, fontWeight: "700", color: colors.text },
  salt: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  pack: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  ptr: { fontSize: 15, fontWeight: "800", color: colors.text },
  mrp: { fontSize: 11, color: colors.textTertiary, textDecorationLine: "line-through" },
  schemeBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  schemeText: { fontSize: 10, color: "#92400E", fontWeight: "700" },
  marginBadge: { backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  marginText: { fontSize: 10, color: "#15803D", fontWeight: "700" },
  empty: { alignItems: "center", marginTop: 60, gap: 10, paddingHorizontal: 24 },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
});
