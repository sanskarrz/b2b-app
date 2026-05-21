import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors } from "@/src/theme";

export function TopBar({
  title,
  subtitle,
  showBack,
  rightIcons,
}: {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  rightIcons?: { name: any; onPress: () => void; testID?: string; badge?: number }[];
}) {
  const router = useRouter();
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        {showBack ? (
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="topbar-back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>RX</Text>
          </View>
        )}
        <View style={{ marginLeft: showBack ? 0 : 10 }}>
          {title ? <Text style={styles.title}>{title}</Text> : <Text style={styles.brand}>RX Tech</Text>}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.right}>
        {rightIcons?.map((ic, i) => (
          <TouchableOpacity key={i} onPress={ic.onPress} style={styles.iconBtn} testID={ic.testID}>
            <Ionicons name={ic.name} size={22} color={colors.text} />
            {ic.badge && ic.badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{ic.badge > 9 ? "9+" : ic.badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: { flexDirection: "row", alignItems: "center", flex: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  logoBox: {
    width: 40,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  logoR: { color: colors.accent, fontWeight: "900", fontSize: 14, letterSpacing: -0.5 },
  logoX: { color: colors.primary, fontWeight: "900", fontSize: 14, letterSpacing: -0.5 },
  brand: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: colors.danger,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
});
