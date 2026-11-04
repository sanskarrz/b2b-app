// Owner can also work as Field Sales / Delivery with the same login.
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Switch, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

const ROLES = [
  { k: "field_sales", l: "Field Salesperson", icon: "briefcase", route: "/field/home" },
  { k: "delivery", l: "Delivery Person", icon: "bicycle", route: "/delivery/home" },
];

export function OwnerRolesCard() {
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>([]);
  useFocusEffect(useCallback(() => { api("/auth/me").then((m) => setRoles(m.ops_roles || [])).catch(() => {}); }, []));

  const toggle = async (k: string, on: boolean) => {
    const next = on ? [...roles, k] : roles.filter((r) => r !== k);
    setRoles(next);
    try {
      const r = await api("/distributor/me/ops-roles", { method: "PATCH", body: { roles: next } });
      setRoles(r.ops_roles);
      showSuccess(on ? "Role added — use the button to switch" : "Role removed");
    } catch (e: any) { showError(e.message); }
  };

  return (
    <View style={styles.card} testID="owner-roles-card">
      <Text style={styles.title}>My operational roles</Text>
      <Text style={styles.sub}>Work as a salesperson or delivery person with this same owner login.</Text>
      {ROLES.map((r) => {
        const on = roles.includes(r.k);
        return (
          <View key={r.k} style={styles.row}>
            <Ionicons name={r.icon as any} size={18} color={colors.primary} />
            <Text style={styles.label}>{r.l}</Text>
            {on && (
              <TouchableOpacity style={styles.switchBtn} onPress={() => router.push(r.route as any)} testID={`open-${r.k}`}>
                <Text style={styles.switchText}>Open</Text>
              </TouchableOpacity>
            )}
            <Switch value={on} onValueChange={(v) => toggle(r.k, v)} testID={`role-${r.k}`} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 16, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF", gap: 6 },
  title: { fontWeight: "800", fontSize: 15, color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  label: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },
  switchBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, height: 36, borderRadius: 10, justifyContent: "center" },
  switchText: { color: "#FFF", fontWeight: "800", fontSize: 12 },
});
