import { SyncEngine } from "@fitnotes/database";
import { supabase } from "./supabase";

export const syncEngine = new SyncEngine(supabase);
