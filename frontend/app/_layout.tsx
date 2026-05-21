import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/email" />
        <Stack.Screen name="auth/otp" />
        <Stack.Screen name="auth/onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="search" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="product/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="cart" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="order/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="distributor/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="returns" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="shortbook" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="bulk-order" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="invoice/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="report-issue" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
