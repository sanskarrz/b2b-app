import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { ToastHost } from "@/src/components/Toast";

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/choose" />
          <Stack.Screen name="auth/register" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="auth/email" />
          <Stack.Screen name="auth/otp" />
          <Stack.Screen name="auth/onboarding" />
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="d" />
          <Stack.Screen name="field" />
          <Stack.Screen name="delivery" />
          <Stack.Screen name="disputes" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="dispute/new" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
          <Stack.Screen name="lead/[id]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="lead/new" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
          <Stack.Screen name="search" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="product/[id]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="cart" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="order/[id]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="distributor/[id]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="dist-invoices/[id]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="returns" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="shortbook" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="bulk-order" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="invoice/[id]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="report-issue" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
          <Stack.Screen name="scan-result" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="profile" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="notifications" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="help" options={{ animation: "slide_from_right" }} />
        </Stack>
        <ToastHost />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
