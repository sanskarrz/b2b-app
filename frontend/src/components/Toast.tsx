// Global Toast system — non-blocking, animated banner
// Usage anywhere:
//   import { showToast } from "@/src/components/Toast";
//   showToast({ type: "error", message: "Could not place order" });
//
// Mount <ToastHost /> ONCE near the top of your app tree (root _layout.tsx).
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius } from "@/src/theme";

export type ToastType = "error" | "success" | "info" | "warning";

export type ToastInput = {
  type?: ToastType;
  message: string;
  title?: string;
  duration?: number; // ms (0 = sticky)
};

type ToastInternal = ToastInput & {
  id: number;
  type: ToastType;
  duration: number;
};

type Listener = (t: ToastInternal) => void;

let counter = 1;
const listeners = new Set<Listener>();

export function showToast(input: ToastInput) {
  const t: ToastInternal = {
    id: counter++,
    type: input.type || "info",
    title: input.title,
    message: input.message,
    duration: input.duration ?? 3500,
  };
  listeners.forEach((l) => l(t));
}

export function showError(message: string, title = "Something went wrong") {
  showToast({ type: "error", title, message, duration: 5000 });
}
export function showSuccess(message: string, title?: string) {
  showToast({ type: "success", title, message });
}
export function showWarning(message: string, title?: string) {
  showToast({ type: "warning", title, message });
}
export function showInfo(message: string, title?: string) {
  showToast({ type: "info", title, message });
}

const META: Record<ToastType, { icon: any; bg: string; border: string; iconColor: string }> = {
  error: { icon: "alert-circle", bg: colors.dangerBg, border: colors.danger, iconColor: colors.danger },
  success: { icon: "checkmark-circle", bg: colors.successBg, border: colors.success, iconColor: colors.success },
  warning: { icon: "warning", bg: colors.warningBg, border: colors.warning, iconColor: colors.warning },
  info: { icon: "information-circle", bg: colors.infoBg, border: colors.info, iconColor: colors.info },
};

function ToastItem({ toast, onDismiss }: { toast: ToastInternal; onDismiss: (id: number) => void }) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const meta = META[toast.type];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
    if (toast.duration > 0) {
      const t = setTimeout(() => dismiss(), toast.duration);
      return () => clearTimeout(t);
    }
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -100, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => onDismiss(toast.id));
  };

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: meta.bg, borderColor: meta.border, transform: [{ translateY }], opacity },
      ]}
    >
      <Ionicons name={meta.icon} size={20} color={meta.iconColor} />
      <View style={{ flex: 1 }}>
        {toast.title ? <Text style={styles.title}>{toast.title}</Text> : null}
        <Text style={styles.message}>{toast.message}</Text>
      </View>
      <Pressable onPress={dismiss} hitSlop={8} style={styles.close}>
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const [items, setItems] = useState<ToastInternal[]>([]);

  useEffect(() => {
    const l: Listener = (t) => setItems((prev) => [...prev, t].slice(-3));
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const dismiss = (id: number) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  if (items.length === 0) return null;

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.host} edges={["top"]}>
      <View pointerEvents="box-none" style={{ width: "100%", maxWidth: 480, gap: 8 }}>
        {items.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 4,
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    width: "100%",
    ...(Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 6 },
      default: {},
    }) as object),
  },
  title: { color: colors.text, fontWeight: "800", fontSize: 13, marginBottom: 2 },
  message: { color: colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: "500" },
  close: { padding: 2 },
});
