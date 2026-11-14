import { createClient } from "@supabase/supabase-js";
import { config, hasSupabase } from "./config.js";

export const supabase = hasSupabase
  ? createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-application-name": "forge3d-cloud" } }
    })
  : null;

export function requireDatabase() {
  if (!supabase) throw Object.assign(new Error("Supabase não configurado"), { statusCode: 503 });
  return supabase;
}