import { createClient } from "@supabase/supabase-js";
import type { Database } from "@fitnotes/database";

const supabaseUrl = process.env["EXPO_PUBLIC_SUPABASE_URL"]!;
const supabaseAnonKey = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"]!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false, // AsyncStorage persistence added in Phase 7
    detectSessionInUrl: false,
  },
});
