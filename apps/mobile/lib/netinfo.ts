import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/** true/false una vez resuelto el estado inicial; null mientras se determina. */
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
