// Cross-platform confirm/alert utility.
// React Native's Alert.alert renders only the first button on web — use window.confirm/alert there.
import { Alert, Platform } from "react-native";

type Btn = { text: string; onPress?: () => void | Promise<void>; style?: "cancel" | "destructive" | "default" };

export function confirm(
  title: string,
  message: string,
  buttons: Btn[]
) {
  // buttons normally: [{Cancel}, {Confirm/onPress}]
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return;
    const fullMsg = message ? `${title}\n\n${message}` : title;
    // If only one non-cancel button, use confirm
    const action = buttons.find((b) => b.style !== "cancel" && b.onPress);
    const hasCancel = buttons.some((b) => b.style === "cancel");
    if (!action) {
      window.alert(fullMsg);
      return;
    }
    if (!hasCancel) {
      // Single-action alert — show alert, then run onPress
      window.alert(fullMsg);
      action.onPress?.();
      return;
    }
    if (window.confirm(fullMsg)) {
      action.onPress?.();
    }
    return;
  }
  Alert.alert(title, message, buttons as any);
}

// Multi-choice alert (e.g. "View Cart" / "Continue Shopping"). On web,
// shows a confirm where OK = first non-cancel action, Cancel = second.
export function choice(
  title: string,
  message: string,
  primary: { text: string; onPress?: () => void },
  secondary?: { text: string; onPress?: () => void }
) {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return;
    const fullMsg = `${title}${message ? `\n\n${message}` : ""}\n\nOK: ${primary.text}${secondary ? `   |   Cancel: ${secondary.text}` : ""}`;
    if (window.confirm(fullMsg)) {
      primary.onPress?.();
    } else if (secondary) {
      secondary.onPress?.();
    }
    return;
  }
  const btns: any[] = [];
  if (secondary) btns.push({ text: secondary.text, onPress: secondary.onPress, style: "cancel" });
  btns.push({ text: primary.text, onPress: primary.onPress });
  Alert.alert(title, message, btns);
}
