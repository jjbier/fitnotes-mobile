/**
 * Hook de estado de red basado en `@react-native-community/netinfo`.
 *
 * Se suscribe a los cambios de conectividad del dispositivo para que las
 * pantallas (y, sobre todo, el disparador de sync en segundo plano) sepan
 * cuándo ha vuelto la conexión y puedan relanzar `SyncEngine.sync()` sin
 * esperar a un pull-to-refresh manual.
 */
import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Devuelve el estado de conectividad actual del dispositivo.
 *
 * `true` solo cuando hay enlace de red Y NetInfo confirma alcance real a
 * internet (`isInternetReachable !== false`, ya que puede ser `null` mientras
 * se determina) — evita falsos positivos de "conectado" en un wifi sin
 * salida a internet. `null` mientras se resuelve la primera lectura.
 */
export function useNetworkStatus(): boolean | null {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return unsubscribe;
  }, []);

  return isConnected;
}
