import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * Layout raíz del grupo `(tabs)`: declara el navegador de 6 tabs (Hoy,
 * Calendario, Ejercicios, Progreso, Rutinas, Configuración) con iconos
 * Ionicons (outline/filled según foco) y colores adaptados a modo claro/oscuro
 * vía `useTheme()` (resuelve la preferencia de tema de la app — "Claro"/
 * "Oscuro"/"Sistema" en Configuración — no el color scheme crudo del SO;
 * hasta 2026-09-22 usaba `useColorScheme()` directamente, así que un tema
 * elegido a mano en la app que no coincidiera con el del sistema operativo
 * dejaba la barra de tabs/cabecera nativa en el color equivocado). No
 * contiene lógica de datos ni de identidad — esa vive en el `_layout.tsx`
 * raíz que envuelve a este grupo.
 *
 * Todas las tabs salvo `exercises` (2026-09-22) ocultan la cabecera nativa
 * (`headerShown: false`) porque su pantalla ya dibuja su propio título
 * traducido — mostrar ambas duplicaba el título y, al no traducirse el de
 * aquí, quedaba en español aunque el resto de la pantalla cambiara a
 * inglés (mismo bug que `workout/[exerciseId]` en el `_layout.tsx` raíz).
 * `exercises/index` no tiene título propio en pantalla, así que aquí sí se
 * usa el de la tab (traducido con `t()`), y su cabecera se deja visible.
 */
export default function TabLayout() {
  const theme = useTheme();
  const { t } = useTranslation();

  const TABS: {
    name: string;
    title: string;
    icon: IoniconName;
    iconActive: IoniconName;
    headerShown?: boolean;
  }[] = [
    { name: "index", title: t("workout:todayLabel"), icon: "home-outline", iconActive: "home", headerShown: false },
    { name: "calendar", title: t("calendar:title"), icon: "calendar-outline", iconActive: "calendar", headerShown: false },
    { name: "exercises", title: t("exercises:title"), icon: "barbell-outline", iconActive: "barbell" },
    { name: "progress", title: t("progress:title"), icon: "trending-up-outline", iconActive: "trending-up", headerShown: false },
    { name: "tools", title: t("routines:title"), icon: "list-outline", iconActive: "list", headerShown: false },
    { name: "settings", title: t("settings:title"), icon: "settings-outline", iconActive: "settings", headerShown: false },
  ];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          paddingBottom: 4,
          height: 60,
        },
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      {TABS.map(({ name, title, icon, iconActive, headerShown }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            headerShown,
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
