// Root error boundary — catches render crashes anywhere in the tree
// and shows a friendly retry screen instead of a white/black blank.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";

type Props = { children: React.ReactNode };
type State = { error: Error | null; info: string };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: "" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
    this.setState({ info: (info?.componentStack || "").slice(0, 800) });
  }

  reset = () => this.setState({ error: null, info: "" });

  render() {
    if (!this.state.error) return this.props.children;

    const msg = this.state.error.message || "Unknown error";

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.iconBox}>
            <Ionicons name="warning" size={42} color={colors.danger} />
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The app hit an unexpected error. You can try again or report this issue.
          </Text>

          <View style={styles.errBox}>
            <Text style={styles.errLabel}>Error</Text>
            <Text style={styles.errText}>{msg}</Text>
            {__DEV__ && this.state.info ? (
              <>
                <Text style={[styles.errLabel, { marginTop: 10 }]}>Component stack</Text>
                <Text style={styles.errStack}>{this.state.info}</Text>
              </>
            ) : null}
          </View>

          <TouchableOpacity style={styles.btn} onPress={this.reset} testID="err-retry">
            <Ionicons name="refresh" size={16} color="#FFF" />
            <Text style={styles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: {
    flexGrow: 1,
    padding: 24,
    paddingTop: Platform.OS === "ios" ? 80 : 50,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  iconBox: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: colors.dangerBg,
    alignItems: "center", justifyContent: "center",
    marginBottom: 18,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  subtitle: { color: colors.textSecondary, fontSize: 13.5, marginTop: 8, textAlign: "center", lineHeight: 19, maxWidth: 320 },
  errBox: {
    marginTop: 22, padding: 14,
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  errLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  errText: { color: colors.danger, fontSize: 13, fontWeight: "600", marginTop: 5, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  errStack: { color: colors.textSecondary, fontSize: 10.5, marginTop: 4, lineHeight: 14, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  btn: {
    marginTop: 22,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: 14,
  },
  btnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
