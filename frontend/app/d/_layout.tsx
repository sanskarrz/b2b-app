// Distributor tabs layout — 5 sections for the distributor-side app.
// On desktop web (>= 900px) a persistent left sidebar replaces the bottom tabs.
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View, StyleSheet, Text } from "react-native";
import { colors } from "@/src/theme";
import { WebShell, useIsWideWeb, NavSection } from "@/src/components/WebSidebar";

function Tab({ name, icon, focused }: { name: string; icon: any; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <Ionicons name={focused ? icon : `${icon}-outline` as any} size={22} color={focused ? colors.primary : colors.textSecondary} />
      <Text style={[styles.tabLabel, focused && { color: colors.primary, fontWeight: "800" }]}>{name}</Text>
    </View>
  );
}

const NAV: NavSection[] = [
  {
    items: [
      { label: "Dashboard", icon: "home", route: "/d/home" },
      { label: "Orders", icon: "receipt", route: "/d/orders" },
      { label: "Stock", icon: "cube", route: "/d/inventory" },
      { label: "Customers", icon: "people", route: "/d/customers" },
      { label: "Collections", icon: "cash", route: "/d/collections" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "My Team", icon: "person-add", route: "/d/team" },
      { label: "Sales CRM", icon: "funnel", route: "/d/leads" },
      { label: "Deliveries", icon: "bicycle", route: "/d/deliveries" },
      { label: "Query Management", icon: "help-buoy", route: "/d/queries" },
      { label: "Team Chat", icon: "chatbubbles", route: "/d/staff-chat" },
      { label: "Auto Bills", icon: "document-text", route: "/d/bills" },
      { label: "Data Sync", icon: "sync", route: "/d/sync" },
      { label: "Order Settings", icon: "options", route: "/d/settings" },
    ],
  },
  {
    title: "Account",
    items: [{ label: "Settings & ERP", icon: "grid", route: "/d/more" }],
  },
];

export default function DLayout() {
  const wide = useIsWideWeb();

  const screens = [
    <Tabs.Screen key="home" name="home" options={{ tabBarIcon: ({ focused }) => <Tab name="Home" icon="home" focused={focused} /> }} />,
    <Tabs.Screen key="orders" name="orders" options={{ tabBarIcon: ({ focused }) => <Tab name="Orders" icon="receipt" focused={focused} /> }} />,
    <Tabs.Screen key="inventory" name="inventory" options={{ tabBarIcon: ({ focused }) => <Tab name="Stock" icon="cube" focused={focused} /> }} />,
    <Tabs.Screen key="customers" name="customers" options={{ tabBarIcon: ({ focused }) => <Tab name="Customers" icon="people" focused={focused} /> }} />,
    <Tabs.Screen key="collections" name="collections" options={{ tabBarIcon: ({ focused }) => <Tab name="Money" icon="cash" focused={focused} /> }} />,
    <Tabs.Screen key="more" name="more" options={{ tabBarIcon: ({ focused }) => <Tab name="More" icon="grid" focused={focused} /> }} />,
    <Tabs.Screen key="c" name="customer/[id]" options={{ href: null }} />,
    <Tabs.Screen key="mi" name="messages/index" options={{ href: null }} />,
    <Tabs.Screen key="md" name="messages/[id]" options={{ href: null }} />,
    <Tabs.Screen key="team" name="team" options={{ href: null }} />,
    <Tabs.Screen key="leads" name="leads" options={{ href: null }} />,
    <Tabs.Screen key="deliveries" name="deliveries" options={{ href: null }} />,
    <Tabs.Screen key="settings" name="settings" options={{ href: null }} />,
    <Tabs.Screen key="queries" name="queries" options={{ href: null }} />,
    <Tabs.Screen key="bills" name="bills" options={{ href: null }} />,
    <Tabs.Screen key="sync" name="sync" options={{ href: null }} />,
    <Tabs.Screen key="sci" name="staff-chat/index" options={{ href: null }} />,
    <Tabs.Screen key="scd" name="staff-chat/[id]" options={{ href: null }} />,
  ];

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: wide ? { display: "none" } : { height: 64, paddingTop: 6, paddingBottom: 10, borderTopColor: colors.border },
        tabBarShowLabel: false,
      }}
    >
      {screens}
    </Tabs>
  );

  if (!wide) return tabs;

  return (
    <WebShell brand="RX Tech" subtitle="Distributor Panel" sections={NAV}>
      {tabs}
    </WebShell>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: "center", justifyContent: "center", gap: 2 },
  tabLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "600" },
});
