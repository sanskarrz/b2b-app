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
import { QtyInputAdd } from "@/src/components/QtyInputAdd";
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
  const [tab, setTab] = useState<"mapped" | "non_mapped">("mapped");
  const [distFilter, setDistFilter] = useState<string | null>(null); // distributor_id or null = all
  const [distFilterOpen, setDistFilterOpen] = useState(false);
  const [allDistributors, setAllDistributors] = useState<any[]>([]);

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
    api("/distributors").then(setAllDistributors).catch(() => {});
  }, []);

  // Add with custom qty (from QtyInputAdd)
  const addOfferQty = async (productId: string, offer: Offer, qty: number) => {
    if (offer.qty_available != null && offer.qty_available <= 0) {
      showWarning(`${offer.distributor_name} has 0 units of this medicine.`, "Out of stock");
      return;
    }
    if (offer.qty_available != null && qty > offer.qty_available) {
      showWarning(`Only ${offer.qty_available} units available from ${offer.distributor_name}.`, "Stock limit");
      return;
    }
    try {
      await api("/cart/items", {
        method: "POST",
        body: { product_id: productId, distributor_id: offer.distributor_id, qty },
      });
      await cartLookup.refresh();
      await refreshCart();
      showSuccess(`Added ${qty} unit${qty > 1 ? "s" : ""} from ${offer.distributor_name}`);
    } catch (e: any) {
      showError(e?.message || "Could not add to cart", "Add failed");
    }
  };

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

  const renderMatch = (m: Match, isAlt = false) => {
    const filteredOffers = distFilter ? m.offers.filter((o) => o.distributor_id === distFilter) : m.offers;
    if (distFilter && filteredOffers.length === 0) return null;
    const distName = distFilter
      ? (allDistributors.find((d) => d.id === distFilter)?.short_name || "this distributor")
      : "";
    return (
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

      {filteredOffers.map((o) => {
        const isCheapest = m.lowest_cost?.distributor_id === o.distributor_id;
        const isBestMargin = m.highest_margin?.distributor_id === o.distributor_id;
        const metaParts: string[] = [];
        if (o.rating != null) metaParts.push(`⭐ ${o.rating}`);
        if (o.delivery_time) metaParts.push(o.delivery_time);
        if (o.scheme) metaParts.push(o.scheme);
        if (o.qty_available != null) metaParts.push(`📦 ${o.qty_available > 999 ? (o.qty_available / 1000).toFixed(1) + "k" : o.qty_available}`);
        if (o.expiry) metaParts.push(`Exp ${o.expiry}`);
        if (o.dist_discount_pct > 0) metaParts.push(`${o.dist_discount_pct}% off`);
        if (o.gst_pct != null) metaParts.push(`GST ${o.gst_pct}%`);
        return (
          <View key={o.distributor_id} style={styles.offerRow}>
            <View style={{ flex: 1, gap: 3 }}>
              {/* Line 1: Dist name + flags */}
              <View style={styles.offerLine1}>
                <Text style={styles.distName} numberOfLines={1}>{o.distributor_name}</Text>
                {isCheapest && (
                  <View style={styles.flagPillSm}>
                    <Text style={styles.flagTextSm}>LOWEST</Text>
                  </View>
                )}
                {isBestMargin && (
                  <View style={[styles.flagPillSm, { backgroundColor: colors.primaryBg }]}>
                    <Text style={[styles.flagTextSm, { color: colors.primary }]}>BEST MARGIN</Text>
                  </View>
                )}
              </View>
              {/* Line 2: Price + Margin */}
              <View style={styles.offerLine2}>
                <Text style={styles.ptr}>{formatINRFull(o.ptr)}</Text>
                <Text style={styles.mrpStrike}>MRP {formatINRFull(o.mrp)}</Text>
                <View style={styles.marginPill}>
                  <Text style={styles.marginPillText}>{o.margin_pct.toFixed(1)}%</Text>
                </View>
              </View>
              {/* Line 3: dense meta in one inline string */}
              {metaParts.length > 0 && (
                <Text style={styles.metaInline} numberOfLines={2}>
                  {metaParts.join("  •  ")}
                </Text>
              )}
            </View>
            <QtyInputAdd
              inCartQty={cartLookup.getQty(m.product.id, o.distributor_id)}
              onAdd={(qty) => addOfferQty(m.product.id, o, qty)}
              onInc={() => incOffer(m.product.id, o)}
              onDec={() => decOffer(m.product.id, o)}
              maxQty={o.qty_available}
              testID={`add-offer-${o.distributor_id}`}
            />
          </View>
        );
      })}
    </View>
    );
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
          <>
            {/* Mapped / Non-Mapped tabs + Distributor filter */}
            <View style={styles.subHeader}>
              <View style={styles.subTabsRow}>
                <TouchableOpacity
                  style={[styles.subTab, tab === "mapped" && styles.subTabActive]}
                  onPress={() => setTab("mapped")}
                  testID="tab-mapped"
                >
                  <Text style={[styles.subTabText, tab === "mapped" && styles.subTabTextActive]}>
                    Mapped ({matches.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subTab, tab === "non_mapped" && styles.subTabActive]}
                  onPress={() => setTab("non_mapped")}
                  testID="tab-non-mapped"
                >
                  <Text style={[styles.subTabText, tab === "non_mapped" && styles.subTabTextActive]}>
                    Non-Mapped ({alternatives.length})
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={styles.distFilterChip}
                  onPress={() => setDistFilterOpen(true)}
                  testID="dist-filter"
                >
                  <Ionicons name="business-outline" size={13} color={colors.textSecondary} />
                  <Text style={styles.distFilterText} numberOfLines={1}>
                    {distFilter ? (allDistributors.find((d) => d.id === distFilter)?.short_name || "Distributor") : "All Distributors"}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
                {distFilter && (
                  <TouchableOpacity style={styles.clearFilter} onPress={() => setDistFilter(null)}>
                    <Ionicons name="close-circle" size={16} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
              {tab === "mapped" ? (
                matches.length === 0 ? (
                  <View style={styles.empty}>
                    <Ionicons name="search" size={32} color={colors.textTertiary} />
                    <Text style={styles.emptyText}>No matched products for &quot;{q}&quot;</Text>
                    <TouchableOpacity onPress={() => setTab("non_mapped")} style={styles.emptyAction}>
                      <Text style={styles.emptyActionText}>See Non-Mapped suggestions →</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  matches.map((m) => renderMatch(m))
                )
              ) : alternatives.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="bulb-outline" size={32} color={colors.textTertiary} />
                  <Text style={styles.emptyText}>No alternate-brand suggestions.</Text>
                  <Text style={styles.emptySub}>Non-Mapped will list same-salt alternates from other manufacturers.</Text>
                </View>
              ) : (
                alternatives.map((m) => renderMatch(m, true))
              )}
            </ScrollView>

            {/* Distributor picker modal */}
            <Modal visible={distFilterOpen} transparent animationType="fade" onRequestClose={() => setDistFilterOpen(false)}>
              <Pressable style={styles.pickerBackdrop} onPress={() => setDistFilterOpen(false)}>
                <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
                  <View style={styles.pickerHandle} />
                  <Text style={styles.pickerTitle}>Filter by Distributor</Text>
                  <Text style={styles.pickerSub}>Show offers from a specific distributor only.</Text>
                  <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 12 }}>
                    <TouchableOpacity
                      style={[styles.pickerRow, !distFilter && styles.pickerRowActive]}
                      onPress={() => { setDistFilter(null); setDistFilterOpen(false); }}
                    >
                      <Ionicons name="apps" size={18} color={!distFilter ? colors.primary : colors.textSecondary} />
                      <Text style={[styles.pickerRowText, !distFilter && { color: colors.primary, fontWeight: "800" }]}>All Distributors</Text>
                      {!distFilter && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                    {allDistributors.map((d: any) => (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.pickerRow, distFilter === d.id && styles.pickerRowActive]}
                        onPress={() => { setDistFilter(d.id); setDistFilterOpen(false); }}
                      >
                        <Ionicons name="business" size={18} color={distFilter === d.id ? colors.primary : colors.textSecondary} />
                        <Text style={[styles.pickerRowText, distFilter === d.id && { color: colors.primary, fontWeight: "800" }]}>{d.short_name || d.name}</Text>
                        {distFilter === d.id && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>
          </>
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
    borderRadius: radius.md,
    marginBottom: 10,
    overflow: "hidden",
    backgroundColor: colors.bg,
  },
  matchHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumb: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  pName: { fontWeight: "800", color: colors.text, fontSize: 13.5, letterSpacing: -0.2 },
  pSalt: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  pPack: { color: colors.textTertiary, fontSize: 10.5, marginTop: 1 },
  offersHead: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 2,
  },
  offersHeadText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  offerLine1: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  offerLine2: { flexDirection: "row", alignItems: "center", gap: 6 },
  offerTopRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  distName: { fontWeight: "800", color: colors.text, fontSize: 12.5, letterSpacing: -0.1 },
  distMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  metaInline: { color: colors.textSecondary, fontSize: 10.5, lineHeight: 14, fontWeight: "500" },
  ptr: { fontWeight: "800", color: colors.text, fontSize: 14.5 },
  flagPillSm: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  flagTextSm: { color: "#15803D", fontSize: 8.5, fontWeight: "900", letterSpacing: 0.4 },
  marginPill: { backgroundColor: colors.successBg, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  marginPillText: { color: colors.success, fontSize: 10, fontWeight: "800" },
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

  // Mapped/Non-Mapped tabs + Distributor filter
  subHeader: {
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  subTabsRow: { flexDirection: "row", gap: 18, marginBottom: 10 },
  subTab: { paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: "transparent" },
  subTabActive: { borderBottomColor: colors.primary },
  subTabText: { color: colors.textSecondary, fontWeight: "700", fontSize: 14 },
  subTabTextActive: { color: colors.primary },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  distFilterChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    maxWidth: 240,
  },
  distFilterText: { color: colors.text, fontSize: 12.5, fontWeight: "700", maxWidth: 160 },
  clearFilter: { padding: 2 },

  // Distributor picker modal
  pickerBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: colors.bg,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 22,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
  },
  pickerHandle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  pickerTitle: { color: colors.text, fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  pickerSub: { color: colors.textSecondary, fontSize: 12, marginTop: 3, marginBottom: 14 },
  pickerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: 12,
  },
  pickerRowActive: { backgroundColor: colors.primaryBg },
  pickerRowText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "600" },

  emptyAction: { marginTop: 8, paddingVertical: 6 },
  emptyActionText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  emptySub: { color: colors.textTertiary, fontSize: 11.5, textAlign: "center", marginTop: 4 },
});
