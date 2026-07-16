/**
 * Cliente Supabase de mobile con un adaptador de almacenamiento de auth
 * propio basado en archivos (`FileStorage`) en vez de `AsyncStorage`.
 *
 * Se usa un archivo JSON gestionado con `expo-file-system` (con cola de
 * escrituras y patrón write-tmp-then-rename) en lugar de `AsyncStorage`
 * porque los síntomas observados (sesión corrupta/perdida tras un
 * `force-stop`) apuntaban a escrituras solapadas y truncadas de GoTrue; este
 * adaptador ataca ambos problemas directamente y evita además el enlazado de
 * módulos nativos de `AsyncStorage`.
 *
 * 2026-07-16: encontrada y corregida la causa raíz concreta del intento de
 * fix anterior — `writeAll` borraba el archivo real antes de mover el
 * temporal encima, reabriendo (con otra forma) la misma ventana sin archivo
 * en disco que decía cerrar; un `force-stop` justo ahí perdía la sesión por
 * completo. En Android, `moveAsync` ya hace un `rename(2)` atómico que
 * sobrescribe el destino (confirmado en el código nativo de
 * `expo-file-system`), así que el borrado previo era innecesario y activamente
 * peligroso — eliminado. Se añade también gating de `startAutoRefresh()` por
 * conectividad real, no solo primer plano. Sin dispositivo físico en este
 * entorno para confirmar el arreglo end-to-end; ver CLAUDE.md.
 */
import { createClient } from "@supabase/supabase-js";
import * as FileSystem from "expo-file-system";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import type { Database } from "@fitnotes/database";

const supabaseUrl = process.env["EXPO_PUBLIC_SUPABASE_URL"]!;
const supabaseAnonKey = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"]!;

const STORAGE_PATH = FileSystem.documentDirectory + "supabase-auth.json";
const STORAGE_TMP_PATH = FileSystem.documentDirectory + "supabase-auth.json.tmp";

// Serializa todas las operaciones: GoTrue dispara varios get/set/remove casi
// a la vez (p.ej. _saveSession borra la clave "code-verifier" y acto seguido
// escribe la sesión) — sin cola, dos escrituras solapadas hacen cada una su
// propio read-modify-write sobre el mismo archivo y la que termina última
// pisa a la otra con datos más viejos (causa real de pérdida de sesión).
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function readAll(): Promise<Record<string, string>> {
  try {
    const info = await FileSystem.getInfoAsync(STORAGE_PATH);
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(STORAGE_PATH);
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    // JSON corrupto (p.ej. un `force-stop` interrumpió una escritura antes de
    // este fix) — tratarlo como "nada guardado" en vez de tirar.
    return {};
  }
}

// Escribe en un archivo temporal y lo renombra al final: si el proceso muere
// a mitad de `writeAsStringAsync` (p.ej. `force-stop`), el temporal queda
// corrupto pero el real (aún no tocado) sigue intacto.
//
// IMPORTANTE: no borrar STORAGE_PATH antes del `moveAsync`. En Android,
// `moveAsync` llama a `File.renameTo` (expo-file-system, FileSystemModule.kt),
// que es un `rename(2)` atómico a nivel de SO y ya sobrescribe el destino si
// existe — no hace falta borrarlo antes. Un `deleteAsync` previo (como tenía
// esta función anteriormente) abre una ventana real entre "borrar el real" y
// "mover el temporal encima": un `force-stop` justo en ese hueco deja CERO
// archivos en disco, perdiendo la sesión por completo — el propio bug que
// este `writeAll` decía arreglar. Quitar el borrado cierra esa ventana.
async function writeAll(data: Record<string, string>): Promise<void> {
  await FileSystem.writeAsStringAsync(STORAGE_TMP_PATH, JSON.stringify(data));
  await FileSystem.moveAsync({ from: STORAGE_TMP_PATH, to: STORAGE_PATH });
}

/**
 * Adaptador de `storage` para el cliente Supabase (interfaz `getItem`/`setItem`/`removeItem`
 * que espera GoTrue) respaldado por un único archivo JSON en `documentDirectory`, con las
 * escrituras serializadas por `enqueue` y persistidas de forma atómica por `writeAll`.
 */
// File-based storage adapter — avoids native module linking issues with AsyncStorage
const FileStorage = {
  getItem(key: string): Promise<string | null> {
    return enqueue(async () => (await readAll())[key] ?? null);
  },
  setItem(key: string, value: string): Promise<void> {
    return enqueue(async () => {
      const data = await readAll();
      data[key] = value;
      await writeAll(data);
    });
  },
  removeItem(key: string): Promise<void> {
    return enqueue(async () => {
      const data = await readAll();
      if (!(key in data)) return; // ya no está — evita una reescritura innecesaria
      delete data[key];
      await writeAll(data);
    });
  },
};

/**
 * Cliente Supabase compartido de la app mobile, tipado con el `Database` generado.
 * Usado directamente solo por el `SyncEngine` y por las pantallas de cuenta
 * (crear/iniciar sesión, vincular invitado); la UI de datos habla con los
 * repos locales vía `useRepositories()`, no con este cliente.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: FileStorage,
  },
});

// El ticker de refresco de token de GoTrue corre siempre en RN (no depende de
// `document.visibilitychange`), pero seguimos la recomendación oficial de
// pausarlo en background: evita refrescos/escrituras de sesión innecesarias
// mientras la app no está en primer plano.
//
// También se pausa sin conectividad real (no solo enlace, ver `netinfo.ts`):
// `startAutoRefresh()` dispara un intento de refresco inmediato si el token
// está cerca de expirar, algo muy probable justo tras un cold start (el
// dispositivo puede tardar un momento en tener red utilizable). Casos
// reportados en el ecosistema Supabase+RN muestran refrescos fallidos por
// falta de red arrancando el ciclo de vida antes de tiempo (p.ej.
// supabase/supabase-js#1509, supabase orgs discussion #36906); esta versión
// de auth-js ya protege el propio `_callRefreshToken` contra fallos de red
// (no borra la sesión si el error es reintentable), pero evitar el intento
// mientras no hay red confirmada es una salvaguarda adicional sin coste.
let isAppActive = AppState.currentState === "active";
let isNetworkReachable = false;

function syncAutoRefresh() {
  if (isAppActive && isNetworkReachable) {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
}

AppState.addEventListener("change", (state) => {
  isAppActive = state === "active";
  syncAutoRefresh();
});

NetInfo.addEventListener((state) => {
  isNetworkReachable = Boolean(state.isConnected && state.isInternetReachable !== false);
  syncAutoRefresh();
});
