// Floating chat bubble for pharmacies — opens chats with their distributors.
import { TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors } from "@/src/theme";

export function FloatingChat({ bottom }: { bottom: number }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={[styles.fab, { bottom }]}
      onPress={() => router.push("/chat")}
      activeOpacity={0.85}
      accessibilityLabel="Chat with distributors"
      testID="floating-chat"
    >
      <Ionicons name="chatbubble-ellipses" size={24} color="#FFF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
      android: { elevation: 6 },
      default: { boxShadow: "0 4px 12px rgba(0,0,0,0.2)" },
    }) as object),
  },
});
