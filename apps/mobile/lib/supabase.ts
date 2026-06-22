import { createClient } from "@supabase/supabase-js";
import * as FileSystem from "expo-file-system";
import type { Database } from "@fitnotes/database";

const supabaseUrl = process.env["EXPO_PUBLIC_SUPABASE_URL"]!;
const supabaseAnonKey = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"]!;

const STORAGE_PATH = FileSystem.documentDirectory + "supabase-auth.json";

// File-based storage adapter — avoids native module linking issues with AsyncStorage
const FileStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const info = await FileSystem.getInfoAsync(STORAGE_PATH);
      if (!info.exists) return null;
      const raw = await FileSystem.readAsStringAsync(STORAGE_PATH);
      const data = JSON.parse(raw) as Record<string, string>;
      return data[key] ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      let data: Record<string, string> = {};
      const info = await FileSystem.getInfoAsync(STORAGE_PATH);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(STORAGE_PATH);
        data = JSON.parse(raw) as Record<string, string>;
      }
      data[key] = value;
      await FileSystem.writeAsStringAsync(STORAGE_PATH, JSON.stringify(data));
    } catch {
      // storage failure is non-fatal — user will need to log in again
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(STORAGE_PATH);
      if (!info.exists) return;
      const raw = await FileSystem.readAsStringAsync(STORAGE_PATH);
      const data = JSON.parse(raw) as Record<string, string>;
      delete data[key];
      await FileSystem.writeAsStringAsync(STORAGE_PATH, JSON.stringify(data));
    } catch {
      // ignore
    }
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: FileStorage,
  },
});
