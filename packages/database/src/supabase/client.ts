/**
 * Fábricas de clientes Supabase tipados (`Database`) para los dos contextos
 * de Next.js (browser y servidor). Ambas leen la URL/anon key de variables de
 * entorno `NEXT_PUBLIC_*` y lanzan si faltan, en vez de crear un cliente inválido.
 */
import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";
import { createServerClient as _createServerClient } from "@supabase/ssr";
import type { Database } from "./types.js";

type CookieOptions = { name: string; value: string; options?: object };

const supabaseUrl = () => {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return url;
};

const supabaseAnonKey = () => {
  const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return key;
};

/** Browser/client-component Supabase client. */
export function createBrowserClient() {
  return _createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}

/**
 * Server-side Supabase client (Next.js Server Components / Route Handlers).
 * Accepts cookie getter/setter callbacks so it works in any Next.js context.
 */
export function createServerClient(
  cookieStore: {
    getAll: () => CookieOptions[];
    setAll: (cookies: CookieOptions[]) => void;
  }
) {
  return _createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieOptions[]) {
        cookieStore.setAll(cookiesToSet);
      },
    },
  });
}
