import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet } from "react-native";
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
      { label: "Pipeline", icon: "funnel", route: "/field/home" },
      { label: "Chat", icon: "chatbubbles", route: "/field/chat" },
      { label: "Profile", icon: "person", route: "/field/profile" },
    ],
  },
];

export default function FieldLayout() {
  const wide = useIsWideWeb();
  const screens = [
    <Tabs.Screen key="home" name="home" options={{ tabBarIcon: ({ focused }) => <Tab name="Pipeline" icon="funnel" focused={focused} /> }} />,
    <Tabs.Screen key="chat" name="chat" options={{ tabBarIcon: ({ focused }) => <Tab name="Chat" icon="chatbubbles" focused={focused} /> }} />,
    <Tabs.Screen key="profile" name="profile" options={{ tabBarIcon: ({ focused }) => <Tab name="Profile" icon="person" focused={focused} /> }} />,
    <Tabs.Screen key="on" name="order-new" options={{ href: null }} />,
  ];
  const tabs = (
    <Tabs screenOptions={{ headerShown: false, tabBarShowLabel: false, tabBarStyle: wide ? { display: "none" } : styles.bar }}>
      {screens}
    </Tabs>
  );
  if (!wide) return tabs;
  return <WebShell brand="RX Tech" subtitle="Field Sales" sections={NAV}>{tabs}</WebShell>;
}

const styles = StyleSheet.create({
  bar: { backgroundColor: "#FFF", borderTopColor: colors.border, height: 64, paddingTop: 8 },
  tab: { alignItems: "center", justifyContent: "center", width: 90, gap: 3 },
  tabLabel: { fontSize: 11, fontWeight: "700" },
});
