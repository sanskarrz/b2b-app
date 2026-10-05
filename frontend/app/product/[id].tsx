// Product Detail — Refined per-distributor offers + Compare/Substitute/Variant tabs
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { QtyInputAdd } from "@/src/components/QtyInputAdd";
import { useCartLookup } from "@/src/hooks/useCartLookup";
import { api } from "@/src/api";
import { showError, showSuccess, showWarning } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

type Offer = {
  distributor_id: string;
  distributor_name: string;
  distributor_full_name?: string;
  rating?: number;
  delivery_time?: string;
  ptr: number;
  mrp: number;
  scheme?: string;
  margin_pct?: number;
  qty_available?: number;
  dist_discount_pct?: number;
  gst_pct?: number;
  expiry?: string;
};

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"compare" | "substitute" | "variant">("compare");
  const [sortBy, setSortBy] = useState<"popularity" | "price_low" | "margin">("popularity");
  const [sortOpen, setSortOpen] = useState(false);
  const cart = useCartLookup();

  useEffect(() => {
    api(`/products/${id}`)
      .then(setData)
      .catch((e: any) => showError(e?.message || "Could not load product", "Load failed"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Product" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const { product, offers = [], variants = [], substitutes = [] } = data;
  const bestOffer: Offer | undefined =
    offers.find((o: Offer) => o.distributor_id === product.best_distributor_id) || offers[0];

  // Sort offers for Compare tab
  const sortedOffers = [...offers];
  if (sortBy === "price_low") sortedOffers.sort((a, b) => a.ptr - b.ptr);
  else if (sortBy === "margin") sortedOffers.sort((a, b) => (b.margin_pct || 0) - (a.margin_pct || 0));
  // else popularity — by qty_available desc as a proxy
  else sortedOffers.sort((a, b) => (b.qty_available || 0) - (a.qty_available || 0));

  const addQty = async (offer: Offer, qty: number) => {
    if (offer.qty_available != null && offer.qty_available <= 0) {
      showWarning(`${offer.distributor_name} has 0 units.`, "Out of stock");
      return;
    }
    try {
      await api("/cart/items", {
        method: "POST",
        body: { product_id: product.id, distributor_id: offer.distributor_id, qty },
      });
      await cart.refresh();
      showSuccess(`Added ${qty} unit${qty > 1 ? "s" : ""}`, offer.distributor_name);
    } catch (e: any) {
      showError(e?.message || "Could not add to cart", "Add failed");
    }
  };

  const inc = async (offer: Offer) => {
    const cur = cart.getQty(product.id, offer.distributor_id);
    if (offer.qty_available != null && cur + 1 > offer.qty_available) {
      showWarning(`Only ${offer.qty_available} available.`, "Stock limit");
      return;
    }
    await cart.updateQty(product.id, offer.distributor_id, cur + 1);
  };
  const dec = async (offer: Offer) => {
    const cur = cart.getQty(product.id, offer.distributor_id);
    if (cur > 0) await cart.updateQty(product.id, offer.distributor_id, cur - 1);
  };

  const margin = bestOffer?.margin_pct?.toFixed(0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar
        title="Product"
        showBack
        rightIcons={[
          { name: "search-outline", onPress: () => router.push("/search") },
          { name: "cart-outline", onPress: () => router.push("/cart") },
        ]}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        {/* Product header */}
        <View style={styles.headerWrap}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pName}>{product.name}</Text>
            <Text style={styles.pPack}>{product.pack}</Text>
            <Text style={styles.pMfr}>{(product.manufacturer || "").toUpperCase()}</Text>
          </View>
          <View style={styles.pThumb}>
            <Text style={{ fontSize: 32 }}>{product.image_emoji || "💊"}</Text>
          </View>
        </View>

        {/* Best distributor card */}
        {bestOffer && (
          <View style={styles.bestCard}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
                <Text style={styles.bestName} numberOfLines={1}>
                  {bestOffer.distributor_full_name || bestOffer.distributor_name}
                </Text>
              </View>
              {bestOffer.delivery_time && (
                <View style={styles.deliveryRow}>
                  <Ionicons name="bicycle" size={12} color={colors.textSecondary} />
                  <Text style={styles.deliveryText}>
                    Delivery by {bestOffer.delivery_time}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.qtyAvailable}>
                Qty {bestOffer.qty_available != null ? bestOffer.qty_available : "—"}
              </Text>
              {bestOffer.scheme && (
                <Text style={styles.schemeText}>Scheme: {bestOffer.scheme}</Text>
              )}
              {bestOffer.expiry && (
                <Text style={styles.expiryText}>Exp {bestOffer.expiry}</Text>
              )}
            </View>
          </View>
        )}

        {/* Pricing summary */}
        {bestOffer && (
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaLabel}>GST</Text>
              <Text style={styles.metaValue}>{bestOffer.gst_pct ?? 12}%</Text>
            </View>
            {bestOffer.dist_discount_pct ? (
              <View style={styles.metaPill}>
                <Text style={styles.metaLabel}>Dist. Discount</Text>
                <Text style={styles.metaValue}>{bestOffer.dist_discount_pct}%</Text>
              </View>
            ) : null}
          </View>
        )}

        {bestOffer && (
          <View style={styles.priceCard}>
            {margin && (
              <View style={styles.marginBadge}>
                <Text style={styles.marginBadgeText}>MARGIN {margin}%</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <View>
                <Text style={styles.priceLabel}>MRP</Text>
                <Text style={styles.priceMrp}>{formatINRFull(bestOffer.mrp)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.priceLabel}>PTR</Text>
                <Text style={styles.pricePtr}>{formatINRFull(bestOffer.ptr)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <TabBtn label={`Compare`} badge={offers.length} active={tab === "compare"} onPress={() => setTab("compare")} />
          <TabBtn label="Substitute" badge={substitutes.length} active={tab === "substitute"} onPress={() => setTab("substitute")} />
          <TabBtn label="Variant" badge={variants.length} active={tab === "variant"} onPress={() => setTab("variant")} />
        </View>

        {/* Sort header (Compare tab) */}
        {tab === "compare" && (
          <View style={styles.sortHead}>
            <Text style={styles.sortLabel}>
              By {sortBy === "popularity" ? "Popularity" : sortBy === "price_low" ? "Price (Low)" : "Margin (High)"}
            </Text>
            <TouchableOpacity style={styles.sortBtn} onPress={() => setSortOpen((o) => !o)}>
              <Ionicons name="swap-vertical" size={14} color={colors.text} />
              <Text style={styles.sortBtnText}>Sort</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sort options dropdown (inline) */}
        {tab === "compare" && sortOpen && (
          <View style={styles.sortOpts}>
            {[
              { k: "popularity", l: "By Popularity (most stock)" },
              { k: "price_low", l: "Price: Low to High" },
              { k: "margin", l: "Best Margin first" },
            ].map((s) => (
              <TouchableOpacity
                key={s.k}
                style={styles.sortOpt}
                onPress={() => { setSortBy(s.k as any); setSortOpen(false); }}
              >
                <Text style={[styles.sortOptText, sortBy === s.k && { color: colors.primary, fontWeight: "800" }]}>
                  {s.l}
                </Text>
                {sortBy === s.k && <Ionicons name="checkmark" size={14} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Content per tab */}
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          {tab === "compare" && (
            <>
              {sortedOffers.map((o: Offer) => (
                <CompareRow
                  key={o.distributor_id}
                  offer={o}
                  inCart={cart.getQty(product.id, o.distributor_id)}
                  onAdd={(qty: number) => addQty(o, qty)}
                  onInc={() => inc(o)}
                  onDec={() => dec(o)}
                />
              ))}
              {sortedOffers.length === 0 && <EmptyMini label="No distributors offering this." />}
            </>
          )}

          {tab === "substitute" && (
            <>
              {substitutes.length === 0 ? (
                <EmptyMini label="No alternate-brand substitutes for this salt." />
              ) : (
                substitutes.map((s: any) => (
                  <SimpleProductRow key={s.id} p={s} onPress={() => router.push(`/product/${s.id}`)} />
                ))
              )}
            </>
          )}

          {tab === "variant" && (
            <>
              {variants.length === 0 ? (
                <EmptyMini label="No other strength/pack variants from this manufacturer." />
              ) : (
                variants.map((v: any) => (
                  <SimpleProductRow key={v.id} p={v} onPress={() => router.push(`/product/${v.id}`)} />
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Sticky bottom add-to-cart */}
      {bestOffer && (
        <View style={[styles.stickyBar, { bottom: 12 + insets.bottom }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stickyLabel}>{bestOffer.distributor_name}</Text>
            <Text style={styles.stickyPrice}>{formatINRFull(bestOffer.ptr)} <Text style={styles.stickyMrp}>MRP {formatINRFull(bestOffer.mrp)}</Text></Text>
          </View>
          <QtyInputAdd
            inCartQty={cart.getQty(product.id, bestOffer.distributor_id)}
            onAdd={(q) => addQty(bestOffer, q)}
            onInc={() => inc(bestOffer)}
            onDec={() => dec(bestOffer)}
            maxQty={bestOffer.qty_available}
            testID="sticky-add"
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function TabBtn({ label, badge, active, onPress }: { label: string; badge?: number; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tabBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.tabBtnInner}>
        <Text style={[styles.tabBtnText, active && { color: colors.success }]}>{label}</Text>
        {badge != null && badge > 0 && (
          <View style={[styles.badge, active && { backgroundColor: colors.success }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      {active && <View style={styles.tabUnderline} />}
    </TouchableOpacity>
  );
}

function CompareRow({
  offer, inCart, onAdd, onInc, onDec,
}: { offer: Offer; inCart: number; onAdd: (q: number) => void; onInc: () => void; onDec: () => void }) {
  const metaParts: string[] = [];
  if (offer.rating != null) metaParts.push(`⭐ ${offer.rating}`);
  if (offer.delivery_time) metaParts.push(offer.delivery_time);
  if (offer.scheme) metaParts.push(offer.scheme);
  if (offer.qty_available != null) metaParts.push(`📦 ${offer.qty_available > 999 ? (offer.qty_available / 1000).toFixed(1) + "k" : offer.qty_available}`);
  if (offer.expiry) metaParts.push(`Exp ${offer.expiry}`);
  if (offer.dist_discount_pct) metaParts.push(`${offer.dist_discount_pct}% off`);
  if (offer.gst_pct != null) metaParts.push(`GST ${offer.gst_pct}%`);
  return (
    <View style={styles.compareRow}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.compName} numberOfLines={1}>{offer.distributor_name}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Text style={styles.compPtr}>{formatINRFull(offer.ptr)}</Text>
          <Text style={styles.compMrp}>MRP {formatINRFull(offer.mrp)}</Text>
          {offer.margin_pct != null && (
            <View style={styles.compMarginPill}>
              <Text style={styles.compMarginText}>{offer.margin_pct.toFixed(0)}%</Text>
            </View>
          )}
        </View>
        {metaParts.length > 0 && (
          <Text style={styles.compMetaInline} numberOfLines={2}>
            {metaParts.join("  •  ")}
          </Text>
        )}
      </View>
      <QtyInputAdd
        inCartQty={inCart}
        onAdd={onAdd}
        onInc={onInc}
        onDec={onDec}
        maxQty={offer.qty_available}
      />
    </View>
  );
}

function SimpleProductRow({ p, onPress }: { p: any; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.altRow} onPress={onPress}>
      <View style={styles.altThumb}><Text style={{ fontSize: 20 }}>{p.image_emoji || "💊"}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.altName} numberOfLines={1}>{p.name}</Text>
        <Text style={styles.altMeta} numberOfLines={1}>{p.salt} • {p.manufacturer}</Text>
        <Text style={styles.altPack} numberOfLines={1}>{p.pack}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.altPrice}>{formatINRFull(p.ptr)}</Text>
        <Text style={styles.altMrp}>MRP {formatINRFull(p.mrp)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

function EmptyMini({ label }: { label: string }) {
  return (
    <View style={styles.emptyMini}>
      <Ionicons name="information-circle-outline" size={20} color={colors.textTertiary} />
      <Text style={styles.emptyMiniText}>{label}</Text>
    </View>
  );
}

const SHADOW = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  android: { elevation: 1 },
  default: {},
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  headerWrap: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 8,
    gap: 12,
    alignItems: "center",
  },
  pName: { fontSize: 19, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  pPack: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  pMfr: { fontSize: 11, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.5, marginTop: 6 },
  pThumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },

  bestCard: {
    flexDirection: "row",
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: "#FFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    gap: 10,
    alignItems: "center",
  },
  bestName: { color: colors.text, fontWeight: "800", fontSize: 14 },
  deliveryRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  deliveryText: { color: colors.primary, fontSize: 11.5, fontWeight: "600" },
  qtyAvailable: { color: colors.success, fontWeight: "800", fontSize: 13 },
  schemeText: { color: colors.primary, fontWeight: "700", fontSize: 11, marginTop: 2 },
  expiryText: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },

  metaRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 10,
  },
  metaPill: {
    flexDirection: "column",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  metaValue: { color: colors.text, fontWeight: "800", fontSize: 12.5, marginTop: 2 },

  priceCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    backgroundColor: "#FFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  marginBadge: { position: "absolute", top: -10, right: 14, backgroundColor: colors.successBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.success },
  marginBadgeText: { color: colors.success, fontWeight: "800", fontSize: 11 },
  priceLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  priceMrp: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 2, letterSpacing: -0.5 },
  pricePtr: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 2, letterSpacing: -0.5 },

  // Tabs
  tabsRow: {
    flexDirection: "row",
    marginTop: 18,
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabBtnInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  tabBtnText: { color: colors.textSecondary, fontWeight: "700", fontSize: 14 },
  badge: { backgroundColor: colors.textSecondary, borderRadius: 999, paddingHorizontal: 6, minWidth: 22, alignItems: "center", paddingVertical: 1 },
  badgeText: { color: "#FFF", fontWeight: "800", fontSize: 11 },
  tabUnderline: { position: "absolute", bottom: -1, height: 3, width: "70%", borderRadius: 999, backgroundColor: colors.success },

  sortHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginTop: 12 },
  sortLabel: { color: colors.text, fontWeight: "700", fontSize: 13 },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sortBtnText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  sortOpts: { marginHorizontal: 16, marginTop: 6, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  sortOpt: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  sortOptText: { color: colors.text, fontSize: 13 },

  // Compare rows
  compareRow: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    gap: 8,
    alignItems: "center",
    ...(SHADOW as object),
  },
  compName: { color: colors.text, fontWeight: "800", fontSize: 13 },
  compMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  compMetaInline: { color: colors.textSecondary, fontSize: 10.5, lineHeight: 14, fontWeight: "500" },
  compTagRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  compTag: { color: colors.textSecondary, fontSize: 10.5, fontWeight: "600" },
  compPtr: { color: colors.text, fontWeight: "800", fontSize: 14 },
  compMrp: { color: colors.textTertiary, fontSize: 10.5, textDecorationLine: "line-through" },
  compMarginPill: { backgroundColor: colors.successBg, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  compMarginText: { color: colors.success, fontWeight: "800", fontSize: 10 },

  // Alt/variant rows
  altRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  altThumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  altName: { color: colors.text, fontWeight: "800", fontSize: 13 },
  altMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  altPack: { color: colors.textTertiary, fontSize: 10.5, marginTop: 1 },
  altPrice: { color: colors.text, fontWeight: "800", fontSize: 13 },
  altMrp: { color: colors.textTertiary, fontSize: 10, textDecorationLine: "line-through", marginTop: 1 },

  emptyMini: { flexDirection: "row", alignItems: "center", gap: 8, padding: 16, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: 6 },
  emptyMiniText: { color: colors.textSecondary, fontSize: 12.5, flex: 1 },

  // Sticky bottom
  stickyBar: {
    position: "absolute",
    left: 12, right: 12, bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    ...(Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 14 },
      android: { elevation: 6 },
      default: {},
    }) as object),
  },
  stickyLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  stickyPrice: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 2 },
  stickyMrp: { color: colors.textTertiary, fontSize: 11, fontWeight: "500", textDecorationLine: "line-through" },
});
