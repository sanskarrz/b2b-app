import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { colors, radius } from "@/src/theme";

type Props = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  testID?: string;
  fullWidth?: boolean;
  icon?: React.ReactNode;
};

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  small,
  testID,
  fullWidth,
  icon,
}: Props) {
  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost";
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.btn,
        small && styles.btnSmall,
        fullWidth && { alignSelf: "stretch" },
        isPrimary && styles.primary,
        variant === "secondary" && styles.secondary,
        isGhost && styles.ghost,
        (disabled || loading) && { opacity: 0.5 },
      ]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#FFF" : colors.text} size="small" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon}
          <Text
            style={[
              styles.text,
              small && { fontSize: 13 },
              isPrimary ? { color: "#FFF" } : { color: colors.text },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  btnSmall: { height: 36, paddingHorizontal: 14, borderRadius: 10 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: "transparent" },
  text: { fontWeight: "700", fontSize: 15 },
});
