// Rich Distributor Profile — contact, stats, chat, ledger, order history, products
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Linking, Platform,
} from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso || "—";
  }
}

export default function DistributorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api(`/distributors/${id}`)); } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Distributor" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const d = data.distributor;
  const c = data.contact;
  const s = data.stats;
  const creditPct = d.credit_limit > 0 ? Math.min((d.credit_used / d.credit_limit) * 100, 100) : 0;
  const creditAvail = d.credit_limit - d.credit_used;
  const barColor = creditPct >= 85 ? colors.danger : creditPct >= 60 ? colors.warning : colors.success;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title={d.short_name} showBack
        rightIcons={[
          { name: "git-compare-outline", onPress: () => router.push({ pathname: "/compare", params: { a: id } }), testID: "dp-compare" },
        ]}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>{d.short_name.charAt(0)}</Text>
          </View>
          <Text style={styles.heroName}>{d.name}</Text>
          <View style={styles.heroMeta}>
            <View style={styles.heroMetaItem}>
              <Ionicons name="star" size={11} color="#FBBF24" />
              <Text style={styles.heroMetaText}>{d.rating}</Text>
            </View>
            <Text style={styles.heroDot}>•</Text>
            <View style={styles.heroMetaItem}>
              <Ionicons name="location" size={11} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroMetaText}>{d.location}</Text>
            </View>
            <Text style={styles.heroDot}>•</Text>
            <View style={styles.heroMetaItem}>
              <Ionicons name="time" size={11} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroMetaText}>{d.delivery_time}</Text>
            </View>
          </View>
          {/* Quick action row */}
          <View style={styles.heroActions}>
            <ActionPill icon="chatbubble" label="Chat" onPress={() => router.push(`/chat/${id}`)} />
            <ActionPill icon="receipt" label="Ledger" onPress={() => router.push(`/ledger/${id}`)} />
            <ActionPill icon="call" label="Call" onPress={() => Linking.openURL(`tel:${c.phone.replace(/\s/g, "")}`)} />
            <ActionPill icon="logo-whatsapp" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${c.whatsapp.replace(/\D/g, "")}?text=Hi%20${encodeURIComponent(d.short_name)}`)} />
          </View>
        </LinearGradient>

        {/* My Business with this distributor */}
        {s && (
          <View style={styles.body}>
            <Text style={styles.sectionTitle}>Your Business</Text>
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { borderTopColor: colors.primary, borderTopWidth: 3 }]}>
                <Text style={styles.statLabel}>Total Spent</Text>
                <Text style={styles.statVal}>{formatINRFull(s.total_spent)}</Text>
              </View>
              <View style={[styles.statCard, { borderTopColor: colors.success, borderTopWidth: 3 }]}>
                <Text style={styles.statLabel}>Orders</Text>
                <Text style={styles.statVal}>{s.order_count}</Text>
              </View>
              <View style={[styles.statCard, { borderTopColor: colors.danger, borderTopWidth: 3 }]}>
                <Text style={styles.statLabel}>Unpaid</Text>
                <Text style={[styles.statVal, { color: colors.danger }]}>{formatINRFull(s.unpaid)}</Text>
              </View>
              <View style={[styles.statCard, { borderTopColor: colors.accent, borderTopWidth: 3 }]}>
                <Text style={styles.statLabel}>Last Order</Text>
                <Text style={styles.statVal}>{formatDate(s.last_order_date)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Credit Line */}
        <View style={[styles.body, { paddingTop: 0 }]}>
          <Text style={styles.sectionTitle}>Credit Line</Text>
          <View style={styles.creditCard}>
            <View style={styles.creditTrack}>
              <View style={[styles.creditFill, { width: `${creditPct}%`, backgroundColor: barColor }]} />
            </View>
            <View style={styles.creditRow}>
              <Text style={styles.creditLabel}>Used {formatINRFull(d.credit_used)} of {formatINRFull(d.credit_limit)}</Text>
              <Text style={[styles.creditAvail, { color: barColor }]}>{creditAvail.toLocaleString("en-IN", { maximumFractionDigits: 0 })} avail</Text>
            </View>
            <View style={styles.creditTermsRow}>
              <View style={styles.termPill}>
                <Ionicons name="calendar-outline" size={11} color={colors.primary} />
                <Text style={styles.termText}>{d.credit_days || 30} days credit</Text>
              </View>
              {(d.settlement_discount_pct || 0) > 0 && (
                <View style={styles.termPill}>
                  <Ionicons name="pricetag-outline" size={11} color={colors.accent} />
                  <Text style={styles.termText}>{d.settlement_discount_pct}% early settle</Text>
                </View>
              )}
              <View style={styles.termPill}>
                <Ionicons name="cube-outline" size={11} color={colors.text} />
                <Text style={styles.termText}>Min ₹{d.min_order}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Contact details */}
        <View style={[styles.body, { paddingTop: 0 }]}>
          <Text style={styles.sectionTitle}>Contact Details</Text>
          <View style={styles.contactCard}>
            <ContactRow icon="call-outline" label="Phone" value={c.phone} onPress={() => Linking.openURL(`tel:${c.phone.replace(/\s/g, "")}`)} />
            <ContactRow icon="logo-whatsapp" label="WhatsApp" value={c.whatsapp} onPress={() => Linking.openURL(`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`)} />
            <ContactRow icon="mail-outline" label="Email" value={c.email} onPress={() => Linking.openURL(`mailto:${c.email}`)} />
            <ContactRow icon="location-outline" label="Address" value={c.address} />
            <ContactRow icon="time-outline" label="Hours" value={c.working_hours} />
            <View style={styles.gstPill}>
              <Ionicons name="document-text-outline" size={12} color={colors.text} />
              <Text style={styles.gstText}>GSTIN: {d.gst}</Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Sales Representative</Text>
          <TouchableOpacity
            style={styles.repCard}
            onPress={() => Linking.openURL(`tel:${c.sales_rep.phone.replace(/\s/g, "")}`)}
          >
            <View style={styles.repAvatar}>
              <Text style={styles.repAvatarText}>{c.sales_rep.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.repName}>{c.sales_rep.name}</Text>
              <Text style={styles.repDesignation}>{c.sales_rep.designation}</Text>
              <Text style={styles.repPhone}>{c.sales_rep.phone}</Text>
            </View>
            <View style={styles.repCallBtn}>
              <Ionicons name="call" size={16} color="#FFF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Last chat preview */}
        {data.last_chat && (
          <View style={[styles.body, { paddingTop: 0 }]}>
            <Text style={styles.sectionTitle}>Latest Message</Text>
            <TouchableOpacity style={styles.chatPreview} onPress={() => router.push(`/chat/${id}`)}>
              <Ionicons name="chatbubble-ellipses" size={14} color={colors.primary} />
              <Text style={styles.chatPreviewText} numberOfLines={2}>
                <Text style={{ fontWeight: "700" }}>{data.last_chat.sender === "user" ? "You: " : `${d.short_name}: `}</Text>
                {data.last_chat.message}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Recent Orders */}
        {data.recent_orders && data.recent_orders.length > 0 && (
          <View style={[styles.body, { paddingTop: 0 }]}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Recent Orders</Text>
              <TouchableOpacity onPress={() => router.push(`/(tabs)/orders`)}>
                <Text style={styles.linkAll}>View all</Text>
              </TouchableOpacity>
            </View>
            {data.recent_orders.map((o: any) => (
              <TouchableOpacity key={o.id} style={styles.orderRow} onPress={() => router.push(`/order/${o.id}`)}>
                <View style={[styles.orderIcon, { backgroundColor: o.status === "delivered" ? colors.successBg : colors.primaryBg }]}>
                  <Ionicons name={o.status === "delivered" ? "checkmark-circle" : "cube"} size={16} color={o.status === "delivered" ? colors.success : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderCode}>{o.code}</Text>
                  <Text style={styles.orderMeta}>{o.sku_count || (o.items?.length || 0)} items • {formatDate(o.created_at)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.orderAmt}>{formatINRFull(o.total)}</Text>
                  <Text style={[styles.orderStatus, { color: o.status === "delivered" ? colors.success : colors.primary }]}>{o.status}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Available Products */}
        <View style={[styles.body, { paddingTop: 0 }]}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Available Products ({data.products.length})</Text>
            <TouchableOpacity onPress={() => router.push(`/search?distributor_id=${id}`)}>
              <Text style={styles.linkAll}>View all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {data.products.slice(0, 12).map((p: any) => (
              <TouchableOpacity key={p.id} style={styles.prodCard} onPress={() => router.push(`/search?q=${encodeURIComponent(p.name)}`)}>
                <View style={styles.prodThumb}>
                  <Text style={{ fontSize: 22 }}>{p.image_emoji}</Text>
                </View>
                <Text style={styles.prodName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.prodSalt} numberOfLines={1}>{p.salt}</Text>
                <Text style={styles.prodPrice}>{formatINRFull(p.ptr)}</Text>
                {p.scheme && (
                  <View style={styles.schemePill}>
                    <Text style={styles.schemeText}>{p.scheme}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Categories */}
        <View style={[styles.body, { paddingTop: 0 }]}>
          <Text style={styles.sectionTitle}>Specializes In</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {(d.categories || []).map((c: string, i: number) => (
              <View key={i} style={styles.catChip}>
                <Text style={styles.catChipText}>{c}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionPill({ icon, label, onPress }: any) {
  return (
    <TouchableOpacity style={styles.actionPill} onPress={onPress}>
      <Ionicons name={icon} size={16} color="#FFF" />
      <Text style={styles.actionPillText}>{label}</Text>
    </TouchableOpacity>
  );
}

function ContactRow({ icon, label, value, onPress }: any) {
  return (
    <TouchableOpacity style={styles.contactRow} onPress={onPress} disabled={!onPress}>
      <View style={styles.contactIcon}>
        <Ionicons name={icon} size={15} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={styles.contactValue} numberOfLines={2}>{value}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />}
    </TouchableOpacity>
  );
}

const SHADOW = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  android: { elevation: 2 },
  default: {},
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { padding: 20, alignItems: "center", borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  heroAvatar: { width: 64, height: 64, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.25)", borderWidth: 2, borderColor: "rgba(255,255,255,0.5)", alignItems: "center", justifyContent: "center" },
  heroAvatarText: { color: "#FFF", fontWeight: "800", fontSize: 26 },
  heroName: { color: "#FFF", fontWeight: "800", fontSize: 18, marginTop: 10, textAlign: "center" },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  heroMetaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  heroMetaText: { color: "#FFF", fontSize: 11, fontWeight: "600" },
  heroDot: { color: "rgba(255,255,255,0.6)", fontSize: 10 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 14 },
  actionPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.22)" },
  actionPillText: { color: "#FFF", fontWeight: "700", fontSize: 12 },

  body: { padding: 16 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontWeight: "800", color: colors.text, fontSize: 14, marginBottom: 10 },
  linkAll: { color: colors.primary, fontWeight: "700", fontSize: 12 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { flexBasis: "47%", flexGrow: 1, padding: 10, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...(SHADOW as object) },
  statLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "700" },
  statVal: { fontSize: 16, color: colors.text, fontWeight: "800", marginTop: 4 },

  creditCard: { padding: 14, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, ...(SHADOW as object) },
  creditTrack: { height: 8, backgroundColor: colors.surface, borderRadius: 999, overflow: "hidden" },
  creditFill: { height: "100%", borderRadius: 999 },
  creditRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  creditLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
  creditAvail: { fontSize: 12, fontWeight: "800" },
  creditTermsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  termPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface, borderRadius: 999 },
  termText: { color: colors.text, fontSize: 11, fontWeight: "700" },

  contactCard: { padding: 4, backgroundColor: "#FFF", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...(SHADOW as object) },
  contactRow: { flexDirection: "row", alignItems: "center", padding: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  contactIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primaryBg, alignItems: "center", justifyContent: "center" },
  contactLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "700" },
  contactValue: { fontSize: 13, color: colors.text, fontWeight: "600", marginTop: 1 },
  gstPill: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10 },
  gstText: { color: colors.text, fontWeight: "700", fontSize: 12 },

  repCard: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12, backgroundColor: "#FFF", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...(SHADOW as object) },
  repAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent + "20", borderWidth: 1, borderColor: colors.accent, alignItems: "center", justifyContent: "center" },
  repAvatarText: { color: colors.accent, fontWeight: "800", fontSize: 16 },
  repName: { fontWeight: "800", color: colors.text, fontSize: 14 },
  repDesignation: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  repPhone: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 2 },
  repCallBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },

  chatPreview: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8, backgroundColor: colors.primaryBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary },
  chatPreviewText: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 16 },

  orderRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  orderIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  orderCode: { fontWeight: "800", color: colors.text, fontSize: 13 },
  orderMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  orderAmt: { fontWeight: "800", color: colors.text, fontSize: 14 },
  orderStatus: { fontSize: 10, marginTop: 2, fontWeight: "700", textTransform: "capitalize" },

  prodCard: { width: 130, padding: 10, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  prodThumb: { width: 50, height: 50, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  prodName: { fontWeight: "700", color: colors.text, fontSize: 12 },
  prodSalt: { fontSize: 10, color: colors.primary, fontWeight: "600" },
  prodPrice: { fontWeight: "800", color: colors.text, fontSize: 13, marginTop: 2 },
  schemePill: { backgroundColor: colors.successBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start" },
  schemeText: { color: "#15803D", fontSize: 9, fontWeight: "800" },

  catChip: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  catChipText: { fontSize: 11, color: colors.text, fontWeight: "700" },
});
