// Distributor tabs layout — 5 sections for the distributor-side app
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View, StyleSheet, Text } from "react-native";
import { colors } from "@/src/theme";

function Tab({ name, icon, focused }: { name: string; icon: any; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <Ionicons name={focused ? icon : `${icon}-outline` as any} size={22} color={focused ? colors.primary : colors.textSecondary} />
      <Text style={[styles.tabLabel, focused && { color: colors.primary, fontWeight: "800" }]}>{name}</Text>
    </View>
  );
}

export default function DLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { height: 64, paddingTop: 6, paddingBottom: 10, borderTopColor: colors.border },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ tabBarIcon: ({ focused }) => <Tab name="Home" icon="home" focused={focused} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ tabBarIcon: ({ focused }) => <Tab name="Orders" icon="receipt" focused={focused} /> }}
      />
      <Tabs.Screen
        name="inventory"
        options={{ tabBarIcon: ({ focused }) => <Tab name="Stock" icon="cube" focused={focused} /> }}
      />
      <Tabs.Screen
        name="customers"
        options={{ tabBarIcon: ({ focused }) => <Tab name="Customers" icon="people" focused={focused} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ tabBarIcon: ({ focused }) => <Tab name="More" icon="grid" focused={focused} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: "center", justifyContent: "center", gap: 2 },
  tabLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "600" },
});
