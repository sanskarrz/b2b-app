import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme";

function Tab({ name, icon, focused }: { name: string; icon: any; focused: boolean }) {
  return (
    <View style={styles.tab}>
      <Ionicons name={icon} size={22} color={focused ? colors.primary : colors.textTertiary} />
      <Text style={[styles.tabLabel, { color: focused ? colors.primary : colors.textTertiary }]}>{name}</Text>
    </View>
  );
}

export default function FieldLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarShowLabel: false, tabBarStyle: styles.bar }}>
      <Tabs.Screen name="home" options={{ tabBarIcon: ({ focused }) => <Tab name="Pipeline" icon="funnel" focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ tabBarIcon: ({ focused }) => <Tab name="Profile" icon="person" focused={focused} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: "#FFF", borderTopColor: colors.border, height: 64, paddingTop: 8 },
  tab: { alignItems: "center", justifyContent: "center", width: 90, gap: 3 },
  tabLabel: { fontSize: 11, fontWeight: "700" },
});
