// Scan Result — handles both "medicine" (single box) and "prescription/bill" (multi-medicine)
// modes returned by /api/scan/extract. Shows scanned item info + matched product +
// best distributor + alternatives, all with QtyStepper controls and a sticky "Add All" bar.
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { QtyStepper } from "@/src/components/QtyStepper";
import { useCartLookup } from "@/src/hooks/useCartLookup";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

type ScanItem = {
  scanned: {
    label: string;
    name: string;
    salt: string;
    strength: string;
    pack: string;
    manufacturer: string;
    qty: number;
  };
  product: any | null;
  best_distributor: any | null;
  alternatives: any[];
};

export default function ScanResult() {
  const { image, mode } = useLocalSearchParams<{ image: string; mode?: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ mode: string; matches: ScanItem[]; extracted: string[] } | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  // Per-row chosen distributor override (default = best)
  const [chosenDist, setChosenDist] = useState<Record<number, string>>({});
  const cart = useCartLookup();

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/scan/extract", {
          method: "POST",
          body: { image_base64: image, mode: mode || "auto" },
        });
        setData(res);
      } catch (e: any) {
        setError(e?.message || "Could not analyse image");
        showError(e?.message || "Could not analyse image", "Scan failed");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, mode]);

  const distFor = (m: ScanItem, idx: number) => {
    const override = chosenDist[idx];
    if (override) {
      // could be product's best_distributor OR an alternative's best dist — but for now
      // we limit choice to the matched product's offered vendor (i.e., best_distributor).
      return override;
    }
    return m.best_distributor?.id || m.product?.best_distributor_id;
  };

  const addOne = async (m: ScanItem, idx: number) => {
    if (!m.product) return;
    const did = distFor(m, idx);
    if (!did) return;
    await cart.addOne(m.product.id, did);
  };

  const incDec = async (m: ScanItem, idx: number, delta: number) => {
    if (!m.product) return;
    const did = distFor(m, idx);
    if (!did) return;
    const cur = cart.getQty(m.product.id, did);
    await cart.updateQty(m.product.id, did, cur + delta);
  };

  const addAll = async () => {
    if (!data) return;
    setAddingAll(true);
    try {
      let added = 0;
      for (let i = 0; i < data.matches.length; i++) {
        const m = data.matches[i];
        if (!m.product) continue;
        const did = distFor(m, i);
        if (!did) continue;
        const wantQty = Math.max(1, m.scanned?.qty || 1);
        const cur = cart.getQty(m.product.id, did);
        // If already in cart with >= wanted qty, skip
        if (cur >= wantQty) continue;
        // Add the delta to reach wantQty
        if (cur === 0) {
          await api("/cart/items", {
            method: "POST",
            body: { product_id: m.product.id, distributor_id: did, qty: wantQty },
          });
          added += 1;
        } else {
          // raise the qty
          await api("/cart/items", {
            method: "POST",
            body: { product_id: m.product.id, distributor_id: did, qty: wantQty - cur },
          });
          added += 1;
        }
      }
      await cart.refresh();
      showSuccess(`${added} item(s) added to cart`, "Added");
    } catch (e: any) {
      showError(e?.message || "Could not add to cart", "Add failed");
    } finally {
      setAddingAll(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Scanning…" showBack />
        <View style={styles.loadingBox}>
          <View style={styles.loadingPulse}>
            <Ionicons name="scan" size={42} color={colors.primary} />
          </View>
          <ActivityIndicator color={colors.primary} size="small" style={{ marginTop: 14 }} />
          <Text style={styles.loadingTitle}>Reading {mode === "medicine" ? "the medicine package" : "the prescription / bill"}…</Text>
          <Text style={styles.loadingSub}>AI is extracting names, strengths and quantities, then matching to your catalog and best distributors.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Scan failed" showBack />
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={48} color={colors.danger} />
          <Text style={styles.errorTitle}>Could not read the image</Text>
          <Text style={styles.errorText}>{error || "Please try again with a clearer photo."}</Text>
          <Button title="Try again" onPress={() => router.back()} small />
        </View>
      </SafeAreaView>
    );
  }

  const foundCount = data.matches.filter((m) => m.product).length;
  const totalCount = data.matches.length;
  const detectedMode = data.mode || mode || "auto";
  const modeLabel = detectedMode === "medicine" ? "Medicine package" : "Prescription / Bill";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Scan result" subtitle={`${foundCount}/${totalCount} matched in catalog`} showBack />
      <ScrollView contentContainerStyle={{ paddingBottom: foundCount > 0 ? 110 : 30 }}>
        {/* Hero banner */}
        <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
          <View style={styles.heroIconBox}>
            <Ionicons name={detectedMode === "medicine" ? "medical" : "document-text"} size={22} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>{modeLabel}</Text>
            <Text style={styles.heroValue}>
              {totalCount === 0 ? "Nothing readable" : `${totalCount} medicine${totalCount === 1 ? "" : "s"} detected`}
            </Text>
            <Text style={styles.heroSub}>
              {foundCount} matched • {totalCount - foundCount} unmatched
            </Text>
          </View>
        </LinearGradient>

        <View style={{ padding: 16, paddingTop: 8 }}>
          {data.matches.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={42} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No medicines detected</Text>
              <Text style={styles.emptySub}>Try a clearer, well-lit photo of the {detectedMode === "medicine" ? "package" : "prescription / bill"}.</Text>
              <Button title="Try again" onPress={() => router.back()} small />
            </View>
          ) : (
            data.matches.map((m, idx) => {
              const product = m.product;
              const dist = m.best_distributor;
              const qtyWanted = Math.max(1, m.scanned?.qty || 1);
              const did = product ? distFor(m, idx) : "";
              const inCart = product && did ? cart.getQty(product.id, did) : 0;
              return (
                <View key={idx} style={styles.card}>
                  <View style={styles.scanRow}>
                    <View style={styles.scanIcon}>
                      <Ionicons name="scan-outline" size={12} color={colors.textSecondary} />
                    </View>
                    <Text style={styles.scanLabel}>SCANNED</Text>
                    <Text style={styles.scanName} numberOfLines={1}>
                      {m.scanned?.label || "Unknown"}
                    </Text>
                    {qtyWanted > 1 && (
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyBadgeText}>×{qtyWanted}</Text>
                      </View>
                    )}
                  </View>

                  {product ? (
                    <View style={styles.matched}>
                      <View style={styles.thumb}>
                        <Text style={{ fontSize: 24 }}>{product.image_emoji || "💊"}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <TouchableOpacity onPress={() => router.push(`/product/${product.id}`)}>
                          <Text style={styles.pName} numberOfLines={1}>{product.name}</Text>
                          <Text style={styles.pSalt} numberOfLines={1}>{product.salt} • {product.manufacturer}</Text>
                          <View style={styles.priceRow}>
                            <Text style={styles.ptr}>{formatINRFull(product.ptr)}</Text>
                            <Text style={styles.mrp}>MRP {formatINRFull(product.mrp)}</Text>
                          </View>
                        </TouchableOpacity>
                        {dist && (
                          <View style={styles.bestPill}>
                            <Ionicons name="star" size={9} color="#FFF" />
                            <Text style={styles.bestText}>Best from {dist.short_name || dist.name}</Text>
                            {dist.delivery_time && <Text style={styles.bestSub}>• {dist.delivery_time}</Text>}
                          </View>
                        )}
                      </View>
                      <QtyStepper
                        qty={inCart}
                        onAdd={() => addOne(m, idx)}
                        onInc={() => incDec(m, idx, +1)}
                        onDec={() => incDec(m, idx, -1)}
                        size="sm"
                        testID={`scan-add-${idx}`}
                      />
                    </View>
                  ) : (
                    <View style={styles.unmatched}>
                      <Ionicons name="help-circle-outline" size={20} color={colors.textTertiary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.unmatchedTitle}>No catalog match</Text>
                        <Text style={styles.unmatchedSub}>This medicine isn&apos;t in our catalog yet.</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.searchManually}
                        onPress={() => router.push({ pathname: "/search", params: { q: m.scanned?.label || "" } } as any)}
                      >
                        <Text style={styles.searchManuallyText}>Search</Text>
                        <Ionicons name="search" size={12} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Alternatives */}
                  {m.alternatives && m.alternatives.length > 0 && (
                    <View style={styles.altWrap}>
                      <Text style={styles.altLabel}>OR consider</Text>
                      {m.alternatives.map((alt: any) => (
                        <TouchableOpacity
                          key={alt.id}
                          style={styles.altRow}
                          onPress={() => router.push(`/product/${alt.id}`)}
                        >
                          <Text style={{ fontSize: 18 }}>{alt.image_emoji || "💊"}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.altName} numberOfLines={1}>{alt.name}</Text>
                            <Text style={styles.altMeta} numberOfLines={1}>{alt.salt} • {alt.manufacturer}</Text>
                          </View>
                          <Text style={styles.altPrice}>{formatINRFull(alt.ptr)}</Text>
                          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {foundCount > 0 && (
        <View style={styles.bottomBar}>
          <Button
            title={`Add all ${foundCount} to cart`}
            onPress={addAll}
            loading={addingAll}
            fullWidth
            testID="scan-add-all"
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 8 },
  loadingPulse: {
    width: 92, height: 92, borderRadius: 28,
    backgroundColor: colors.primaryBg,
    alignItems: "center", justifyContent: "center",
  },
  loadingTitle: { fontWeight: "800", fontSize: 15, color: colors.text, marginTop: 10, textAlign: "center" },
  loadingSub: { color: colors.textSecondary, fontSize: 12.5, textAlign: "center", lineHeight: 18, marginTop: 4 },
  errorBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 10 },
  errorTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  errorText: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    margin: 16,
    padding: 16,
    borderRadius: radius.lg,
  },
  heroIconBox: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  heroValue: { color: "#FFF", fontSize: 18, fontWeight: "800", marginTop: 2 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 11.5, fontWeight: "600", marginTop: 2 },

  card: {
    marginBottom: 12,
    backgroundColor: "#FFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  scanRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  scanIcon: {
    width: 18, height: 18, borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  scanLabel: { color: colors.textSecondary, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  scanName: { color: colors.text, fontSize: 12.5, fontWeight: "700", flex: 1, fontStyle: "italic" },
  qtyBadge: { backgroundColor: colors.accentBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  qtyBadgeText: { color: colors.accent, fontSize: 10, fontWeight: "800" },

  matched: { flexDirection: "row", alignItems: "center", gap: 10 },
  thumb: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  pName: { fontWeight: "800", color: colors.text, fontSize: 14 },
  pSalt: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 },
  ptr: { fontWeight: "800", color: colors.text, fontSize: 14 },
  mrp: { color: colors.textTertiary, fontSize: 10, textDecorationLine: "line-through" },
  bestPill: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, alignSelf: "flex-start" },
  bestText: { color: "#FFF", fontWeight: "700", fontSize: 9 },
  bestSub: { color: "rgba(255,255,255,0.9)", fontSize: 9, fontWeight: "600" },

  unmatched: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
  },
  unmatchedTitle: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
  unmatchedSub: { color: colors.textSecondary, fontSize: 10.5, marginTop: 2 },
  searchManually: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.primaryBg, borderRadius: 999,
    borderWidth: 1, borderColor: colors.primary + "30",
  },
  searchManuallyText: { color: colors.primary, fontWeight: "800", fontSize: 11 },

  altWrap: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 },
  altLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  altRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  altName: { color: colors.text, fontSize: 12, fontWeight: "700" },
  altMeta: { color: colors.textSecondary, fontSize: 10, marginTop: 1 },
  altPrice: { color: colors.text, fontWeight: "800", fontSize: 12 },

  empty: { alignItems: "center", padding: 30, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  emptySub: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },

  bottomBar: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    padding: 12, paddingBottom: 22,
    backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
});
