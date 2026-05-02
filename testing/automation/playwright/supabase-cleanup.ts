import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./supabase";

function getSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Missing Supabase config for Playwright cleanup.");
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function cleanupTestSupabaseRows() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("user_blobs").delete().like("username", "test_%");
  if (error) {
    throw new Error(`Failed to clean test Supabase rows: ${error.message}`);
  }
}
