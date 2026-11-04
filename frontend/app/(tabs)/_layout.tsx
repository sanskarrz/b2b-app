import { Tabs } from "expo-router";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { FloatingChat } from "@/src/components/FloatingChat";

export default function TabsLayout() {
  // Android phones with on-screen navigation buttons report a bottom inset —
  // add it so the tab bar never sits under the system buttons.
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 8 + insets.bottom,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          backgroundColor: colors.bg,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="vendors"
        options={{
          title: "Vendors",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "storefront" : "storefront-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "cube" : "cube-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: "Payments",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "card" : "card-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "grid" : "grid-outline"} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
    <FloatingChat bottom={64 + insets.bottom + 14} />
    </View>
  );
}
