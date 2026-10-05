import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { WebShell, useIsWideWeb, NavSection } from "@/src/components/WebSidebar";

function Tab({ name, icon, focused }: { name: string; icon: any; focused: boolean }) {
  return (
    <View style={styles.tab}>
      <Ionicons name={icon} size={22} color={focused ? colors.primary : colors.textTertiary} />
      <Text style={[styles.tabLabel, { color: focused ? colors.primary : colors.textTertiary }]}>{name}</Text>
    </View>
  );
}

const NAV: NavSection[] = [
  {
    items: [
      { label: "Today", icon: "bicycle", route: "/delivery/home" },
      { label: "History", icon: "checkmark-done", route: "/delivery/completed" },
      { label: "Chat", icon: "chatbubbles", route: "/delivery/chat" },
      { label: "Profile", icon: "person", route: "/delivery/profile" },
    ],
  },
];

export default function DeliveryLayout() {
  const wide = useIsWideWeb();
  const insets = useSafeAreaInsets();
  const screens = [
    <Tabs.Screen key="home" name="home" options={{ tabBarIcon: ({ focused }) => <Tab name="Today" icon="bicycle" focused={focused} /> }} />,
    <Tabs.Screen key="completed" name="completed" options={{ tabBarIcon: ({ focused }) => <Tab name="History" icon="checkmark-done" focused={focused} /> }} />,
    <Tabs.Screen key="chat" name="chat" options={{ tabBarIcon: ({ focused }) => <Tab name="Chat" icon="chatbubbles" focused={focused} /> }} />,
    <Tabs.Screen key="profile" name="profile" options={{ tabBarIcon: ({ focused }) => <Tab name="Profile" icon="person" focused={focused} /> }} />,
    <Tabs.Screen key="oid" name="order/[id]" options={{ href: null }} />,
  ];
  const tabs = (
    <Tabs screenOptions={{ headerShown: false, tabBarShowLabel: false, tabBarStyle: wide ? { display: "none" } : [styles.bar, { height: 64 + insets.bottom, paddingBottom: insets.bottom }] }}>
      {screens}
    </Tabs>
  );
  if (!wide) return tabs;
  return <WebShell brand="RX Tech" subtitle="Delivery" sections={NAV}>{tabs}</WebShell>;
}

const styles = StyleSheet.create({
  bar: { backgroundColor: "#FFF", borderTopColor: colors.border, height: 64, paddingTop: 8 },
  tab: { alignItems: "center", justifyContent: "center", width: 80, gap: 3 },
  tabLabel: { fontSize: 11, fontWeight: "700" },
});
