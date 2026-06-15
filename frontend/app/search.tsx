// Comprehensive search results — shows all distributor offers + alternates
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
  Modal,
  Pressable,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess, showWarning } from "@/src/components/Toast";
import { QtyStepper } from "@/src/components/QtyStepper";
import { useCartLookup } from "@/src/hooks/useCartLookup";
import { colors, radius, formatINRFull } from "@/src/theme";

const RECENT = ["Azithromycin", "Paracetamol", "Cetirizine", "Metformin"];
const QUICK_FILTERS = ["Antibiotic", "Analgesic", "Diabetes", "Cardiac", "Gastric"];

type Offer = {
  distributor_id: string;
  distributor_name: string;
  rating: number;
  delivery_time: string;
  ptr: number;
  mrp: number;
  scheme?: string | null;
  margin_pct: number;
  qty_available?: number;
  dist_discount_pct?: number;
  gst_pct?: number;
  expiry?: string;
};

type Match = {
  product: { id: string; name: string; salt: string; manufacturer: string; pack: string; mrp: number; image_emoji: string; category?: string };
  offers: Offer[];
  lowest_cost?: { distributor_id: string; distributor_name: string; ptr: number };
  highest_margin?: { distributor_id: string; distributor_name: string; margin_pct: number };
};

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [alternatives, setAlternatives] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [cart, setCart] = useState<{ count: number; total: number; items: any[] }>({ count: 0, total: 0, items: [] });

  // Smart debounced search — minimum 2 chars + trim
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setMatches([]);
      setAlternatives([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    const t = setTimeout(async () => {
      try {
        const data = await api(`/search/comprehensive?q=${encodeURIComponent(trimmed)}`);
        setMatches(data.matches || []);
        setAlternatives(data.alternatives || []);
      } catch (e: any) {
        // Silent fail — show empty state
        setMatches([]);
        setAlternatives([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Refresh cart summary
  const refreshCart = async () => {
    try {
      const c = await api("/cart");
      setCart(c);
    } catch {}
  };

  useEffect(() => {
    refreshCart();
  }, []);

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"medicine" | "prescription">("medicine");

  const openScan = (mode: "medicine" | "prescription") => {
    setScanMode(mode);
    setScanModalOpen(false);
    runScan("camera", mode);
  };

  const runScan = async (source: "camera" | "library", mode: "medicine" | "prescription" = scanMode) => {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showWarning(
          `Please allow ${source === "camera" ? "camera" : "photo library"} access in settings to use Scan.`,
          "Permission needed"
        );
        return;
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, allowsEditing: true })
          : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      router.push({ pathname: "/scan-result", params: { image: result.assets[0].base64, mode } });
    } catch (e: any) {
      showError(e?.message || "Could not start scan", "Scan failed");
    }
  };

  const cartLookup = useCartLookup();

  const addOffer = async (productId: string, offer: Offer) => {
    // Validation: out of stock?
    if (offer.qty_available != null && offer.qty_available <= 0) {
      showWarning(`${offer.distributor_name} has 0 units of this medicine.`, "Out of stock");
      return;
    }
    await cartLookup.addOne(productId, offer.distributor_id);
    await refreshCart();
  };

  const incOffer = async (productId: string, offer: Offer) => {
    const cur = cartLookup.getQty(productId, offer.distributor_id);
    if (offer.qty_available != null && cur + 1 > offer.qty_available) {
      showWarning(`Only ${offer.qty_available} units available from ${offer.distributor_name}.`, "Stock limit");
      return;
    }
    await cartLookup.updateQty(productId, offer.distributor_id, cur + 1);
    await refreshCart();
  };

  const decOffer = async (productId: string, offer: Offer) => {
    const cur = cartLookup.getQty(productId, offer.distributor_id);
    if (cur <= 0) return;
    await cartLookup.updateQty(productId, offer.distributor_id, cur - 1);
    await refreshCart();
  };

  const renderMatch = (m: Match, isAlt = false) => (
    <View key={m.product.id} style={[styles.matchCard, isAlt && { borderStyle: "dashed" }]}>
      <TouchableOpacity
        style={styles.matchHead}
        onPress={() => router.push(`/product/${m.product.id}`)}
        testID={`match-${m.product.id}`}
      >
        <View style={styles.thumb}>
          <Text style={{ fontSize: 24 }}>{m.product.image_emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pName}>{m.product.name}</Text>
          <Text style={styles.pSalt}>
            {m.product.salt} • {m.product.manufacturer}
          </Text>
          <Text style={styles.pPack}>
            {m.product.pack} • MRP {formatINRFull(m.product.mrp)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </TouchableOpacity>

      <View style={styles.offersHead}>
        <Text style={styles.offersHeadText}>{m.offers.length} distributors offering this</Text>
      </View>

      {m.offers.map((o) => {
        const isCheapest = m.lowest_cost?.distributor_id === o.distributor_id;
        const isBestMargin = m.highest_margin?.distributor_id === o.distributor_id;
        return (
          <View key={o.distributor_id} style={styles.offerRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.offerTopRow}>
                <Text style={styles.distName}>{o.distributor_name}</Text>
                {isCheapest && (
                  <View style={[styles.flagPill, { backgroundColor: "#DCFCE7" }]}>
                    <Ionicons name="pricetag" size={9} color="#15803D" />
                    <Text style={[styles.flagText, { color: "#15803D" }]}>LOWEST</Text>
                  </View>
                )}
                {isBestMargin && !isCheapest && (
                  <View style={[styles.flagPill, { backgroundColor: colors.primaryBg }]}>
                    <Ionicons name="trending-up" size={9} color={colors.primary} />
                    <Text style={[styles.flagText, { color: colors.primary }]}>BEST MARGIN</Text>
                  </View>
                )}
                {isBestMargin && isCheapest && (
                  <View style={[styles.flagPill, { backgroundColor: colors.primaryBg }]}>
                    <Ionicons name="trending-up" size={9} color={colors.primary} />
                    <Text style={[styles.flagText, { color: colors.primary }]}>BEST MARGIN</Text>
                  </View>
                )}
              </View>
              <Text style={styles.distMeta}>
                ⭐ {o.rating} • {o.delivery_time}
                {o.scheme ? ` • ${o.scheme}` : ""}
              </Text>
              {/* Rich offer row: qty + expiry + dist discount + GST */}
              <View style={styles.metaRichRow}>
                {o.qty_available != null && (
                  <View style={styles.metaTag}>
                    <Ionicons name="cube-outline" size={9} color={colors.textSecondary} />
                    <Text style={styles.metaTagText}>{o.qty_available > 999 ? `${(o.qty_available / 1000).toFixed(1)}k` : o.qty_available} avl</Text>
                  </View>
                )}
                {o.expiry && (
                  <View style={styles.metaTag}>
                    <Ionicons name="calendar-outline" size={9} color={colors.textSecondary} />
                    <Text style={styles.metaTagText}>Exp {o.expiry}</Text>
                  </View>
                )}
                {o.dist_discount_pct > 0 && (
                  <View style={[styles.metaTag, { backgroundColor: colors.accentBg }]}>
                    <Ionicons name="pricetag-outline" size={9} color={colors.accent} />
                    <Text style={[styles.metaTagText, { color: colors.accent, fontWeight: "800" }]}>{o.dist_discount_pct}% off</Text>
                  </View>
                )}
                {o.gst_pct != null && (
                  <View style={styles.metaTag}>
                    <Text style={styles.metaTagText}>GST {o.gst_pct}%</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Text style={styles.ptr}>{formatINRFull(o.ptr)}</Text>
                <Text style={styles.mrpStrike}>MRP {formatINRFull(o.mrp)}</Text>
                <View style={styles.marginPill}>
                  <Text style={styles.marginPillText}>{o.margin_pct.toFixed(1)}% margin</Text>
                </View>
              </View>
            </View>
            <QtyStepper
              qty={cartLookup.getQty(m.product.id, o.distributor_id)}
              onAdd={() => addOffer(m.product.id, o)}
              onInc={() => incOffer(m.product.id, o)}
              onDec={() => decOffer(m.product.id, o)}
              size="sm"
              testID={`add-offer-${o.distributor_id}`}
            />
          </View>
        );
      })}
    </View>
  );

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

        <View style={styles.scanRow}>
          <TouchableOpacity style={styles.scanBtn} onPress={() => setScanModalOpen(true)} testID="scan-btn">
            <View style={styles.scanIcon}>
              <Ionicons name="scan-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scanTitle}>Scan Medicine / Bill</Text>
              <Text style={styles.scanSub}>AI extracts and finds best vendors</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => { setScanMode("prescription"); runScan("library", "prescription"); }} testID="upload-btn">
            <Ionicons name="cloud-upload-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Scan mode picker modal */}
        <Modal visible={scanModalOpen} transparent animationType="slide" onRequestClose={() => setScanModalOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setScanModalOpen(false)}>
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>What are you scanning?</Text>
              <Text style={styles.modalSub}>We&apos;ll tune the AI to read it accurately.</Text>

              <TouchableOpacity style={styles.modeCard} onPress={() => openScan("medicine")} testID="mode-medicine">
                <View style={[styles.modeIcon, { backgroundColor: colors.primaryBg }]}>
                  <Ionicons name="medical" size={26} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeTitle}>Medicine Box / Strip</Text>
                  <Text style={styles.modeDesc}>Snap a single product to find it in the catalog with all vendor prices.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.modeCard} onPress={() => openScan("prescription")} testID="mode-prescription">
                <View style={[styles.modeIcon, { backgroundColor: colors.accentBg }]}>
                  <Ionicons name="document-text" size={26} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeTitle}>Prescription / Bill</Text>
                  <Text style={styles.modeDesc}>Scan a doctor&apos;s Rx or pharmacy invoice. AI lists all medicines + lets you add all to cart.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.modeCancel} onPress={() => setScanModalOpen(false)}>
                <Text style={styles.modeCancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

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
        ) : matches.length === 0 && alternatives.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No products found for &quot;{q}&quot;</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
            {matches.length > 0 && (
              <>
                <Text style={styles.resultHead}>Matched ({matches.length})</Text>
                {matches.map((m) => renderMatch(m))}
              </>
            )}
            {alternatives.length > 0 && (
              <>
                <Text style={[styles.resultHead, { marginTop: 14 }]}>
                  Alternate brands ({alternatives.length}) — same salt
                </Text>
                {alternatives.map((m) => renderMatch(m, true))}
              </>
            )}
          </ScrollView>
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
  scanRow: { flexDirection: "row", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
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
  resultHead: { fontSize: 12, color: colors.textSecondary, fontWeight: "800", letterSpacing: 0.5, marginBottom: 10 },
  matchCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: 12,
    overflow: "hidden",
    backgroundColor: colors.bg,
  },
  matchHead: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  pName: { fontWeight: "800", color: colors.text, fontSize: 14 },
  pSalt: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  pPack: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  offersHead: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  offersHeadText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  offerTopRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  distName: { fontWeight: "700", color: colors.text, fontSize: 13 },
  distMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  ptr: { fontWeight: "800", color: colors.text, fontSize: 16 },
  marginPill: { backgroundColor: colors.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  marginPillText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  flagPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  flagText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", marginTop: 60, gap: 10, paddingHorizontal: 24 },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },

  // Scan mode picker modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 999,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  modalSub: { color: colors.textSecondary, fontSize: 12.5, marginTop: 3, marginBottom: 18 },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: 10,
  },
  modeIcon: {
    width: 50, height: 50, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  modeTitle: { color: colors.text, fontSize: 14.5, fontWeight: "800" },
  modeDesc: { color: colors.textSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  modeCancel: {
    marginTop: 6,
    alignItems: "center",
    paddingVertical: 12,
  },
  modeCancelText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
});
