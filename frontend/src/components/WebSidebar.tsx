// Desktop-web left sidebar for the distributor-side apps (owner/manager/field/delivery).
// Shown only on web at >= 900px; phones/native keep the bottom tab bar.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { colors, radius } from "@/src/theme";
import { clearToken } from "@/src/api";

export function useIsWideWeb() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= 900;
}

export type NavItem = { label: string; icon: any; route: string };
export type NavSection = { title?: string; items: NavItem[] };

function isActive(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(route + "/");
}

export function WebSidebar({ brand, subtitle, sections }: { brand: string; subtitle: string; sections: NavSection[] }) {
  const router = useRouter();
  const pathname = usePathname();

  const signOut = async () => {
    await clearToken();
    router.replace("/auth/email");
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.brandRow}>
        <View style={styles.logo}><Ionicons name="medical" size={20} color="#FFF" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>{brand}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
        {sections.map((sec, i) => (
          <View key={i} style={{ marginBottom: 6 }}>
            {sec.title ? <Text style={styles.sectionTitle}>{sec.title}</Text> : null}
            {sec.items.map((it) => {
              const active = isActive(pathname, it.route);
              return (
                <TouchableOpacity
                  key={it.route}
                  style={[styles.item, active && styles.itemActive]}
                  onPress={() => router.push(it.route as any)}
                  testID={`side-${it.route}`}
                >
                  <Ionicons name={active ? it.icon : (`${it.icon}-outline` as any)} size={18} color={active ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.itemText, active && styles.itemTextActive]}>{it.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.signOut} onPress={signOut} testID="side-signout">
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Wrap a Tabs navigator (children) with the persistent sidebar on wide web. */
export function WebShell({ brand, subtitle, sections, children }: { brand: string; subtitle: string; sections: NavSection[]; children: React.ReactNode }) {
  return (
    <View style={styles.shell}>
      <WebSidebar brand={brand} subtitle={subtitle} sections={sections} />
      <View style={styles.contentWrap}>
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: "row", backgroundColor: colors.surface },
  sidebar: { width: 248, backgroundColor: "#FFF", borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingTop: 18 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  logo: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },

  sectionTitle: { fontSize: 10.5, fontWeight: "800", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 10, marginTop: 12, marginBottom: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderRadius: radius.md, marginBottom: 2 },
  itemActive: { backgroundColor: colors.primaryBg },
  itemText: { fontSize: 13.5, fontWeight: "600", color: colors.textSecondary },
  itemTextActive: { color: colors.primary, fontWeight: "800" },

  signOut: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  signOutText: { fontSize: 13.5, fontWeight: "700", color: colors.danger },

  contentWrap: { flex: 1, alignItems: "center" },
  content: { flex: 1, width: "100%", maxWidth: 1200, backgroundColor: colors.bg },
});
