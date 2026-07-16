import { Stack } from "expo-router";

/**
 * Layout raíz del grupo `(auth)`: login y registro (`login.tsx`, `register.tsx`).
 * Solo envuelve las pantallas en un `Stack` sin cabecera — no es un flujo de
 * arranque obligatorio, se accede a él desde Configuración ("Crear cuenta" /
 * "Iniciar sesión para sincronizar"), ya que la app arranca siempre en las
 * tabs en modo invitado.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
