/**
 * Bottom tab navigator — 4 main tabs
 *
 * TODO:
 *  - Add badge count for active workout tab
 *  - Apply platform-specific tab bar styles (iOS blur, Android elevation)
 */

import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: Array<{
  name: string;
  title: string;
  icon: IoniconName;
  iconActive: IoniconName;
}> = [
  { name: "index", title: "Today", icon: "home-outline", iconActive: "home" },
  { name: "calendar", title: "Calendar", icon: "calendar-outline", iconActive: "calendar" },
  { name: "exercises", title: "Exercises", icon: "barbell-outline", iconActive: "barbell" },
  { name: "progress", title: "Progress", icon: "trending-up-outline", iconActive: "trending-up" },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#6366f1",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: "#e2e8f0",
          paddingBottom: 4,
          height: 60,
        },
        headerStyle: { backgroundColor: "#ffffff" },
        headerShadowVisible: false,
      }}
    >
      {TABS.map(({ name, title, icon, iconActive }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? iconActive : icon}
                size={size}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
