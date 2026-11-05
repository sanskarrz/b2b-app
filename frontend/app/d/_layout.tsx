// Distributor tabs layout — 6 main sections for the distributor-side app.
// On desktop web (>= 900px) a persistent left sidebar replaces the bottom tabs.
// Secondary screens (with their own back button) hide the tab bar so nothing overlaps.
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { WebShell, useIsWideWeb, NavSection } from "@/src/components/WebSidebar";

const icon = (name: string) => ({ color, focused }: { color: string; focused: boolean }) => (
  <Ionicons name={(focused ? name : `${name}-outline`) as any} size={22} color={color} />
);

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
      { label: "My System Data", icon: "server", route: "/d/sync-data" },
      { label: "Order Settings", icon: "options", route: "/d/settings" },
    ],
  },
  {
    title: "Account",
    items: [{ label: "Settings", icon: "grid", route: "/d/more" }],
  },
];

export default function DLayout() {
  const wide = useIsWideWeb();
  const insets = useSafeAreaInsets();

  const hidden = { href: null, tabBarStyle: { display: "none" as const } };
  const screens = [
    <Tabs.Screen key="home" name="home" options={{ title: "Home", tabBarIcon: icon("home") }} />,
    <Tabs.Screen key="orders" name="orders" options={{ title: "Orders", tabBarIcon: icon("receipt") }} />,
    <Tabs.Screen key="inventory" name="inventory" options={{ title: "Stock", tabBarIcon: icon("cube") }} />,
    <Tabs.Screen key="customers" name="customers" options={{ title: "Customers", tabBarIcon: icon("people") }} />,
    <Tabs.Screen key="collections" name="collections" options={{ title: "Money", tabBarIcon: icon("cash") }} />,
    <Tabs.Screen key="more" name="more" options={{ title: "More", tabBarIcon: icon("grid") }} />,
    <Tabs.Screen key="c" name="customer/[id]" options={hidden} />,
    <Tabs.Screen key="notif" name="notifications" options={hidden} />,
    <Tabs.Screen key="mi" name="messages/index" options={hidden} />,
    <Tabs.Screen key="md" name="messages/[id]" options={hidden} />,
    <Tabs.Screen key="team" name="team" options={hidden} />,
    <Tabs.Screen key="leads" name="leads" options={hidden} />,
    <Tabs.Screen key="deliveries" name="deliveries" options={hidden} />,
    <Tabs.Screen key="settings" name="settings" options={hidden} />,
    <Tabs.Screen key="queries" name="queries" options={hidden} />,
    <Tabs.Screen key="bills" name="bills" options={hidden} />,
    <Tabs.Screen key="sync" name="sync" options={hidden} />,
    <Tabs.Screen key="syncdata" name="sync-data" options={hidden} />,
    <Tabs.Screen key="sci" name="staff-chat/index" options={hidden} />,
    <Tabs.Screen key="scd" name="staff-chat/[id]" options={hidden} />,
  ];

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: "700" },
        tabBarItemStyle: { paddingHorizontal: 0 },
        // Android phones with on-screen buttons report a bottom inset — keep the bar above them
        tabBarStyle: wide
          ? { display: "none" }
          : { height: 62 + insets.bottom, paddingTop: 6, paddingBottom: 8 + insets.bottom, borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.bg },
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
