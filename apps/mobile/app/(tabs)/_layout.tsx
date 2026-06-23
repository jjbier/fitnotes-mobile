import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: {
  name: string;
  title: string;
  icon: IoniconName;
  iconActive: IoniconName;
}[] = [
  { name: "index", title: "Hoy", icon: "home-outline", iconActive: "home" },
  { name: "calendar", title: "Calendario", icon: "calendar-outline", iconActive: "calendar" },
  { name: "exercises", title: "Ejercicios", icon: "barbell-outline", iconActive: "barbell" },
  { name: "progress", title: "Progreso", icon: "trending-up-outline", iconActive: "trending-up" },
  { name: "tools", title: "Rutinas", icon: "list-outline", iconActive: "list" },
  { name: "settings", title: "Configuración", icon: "settings-outline", iconActive: "settings" },
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
