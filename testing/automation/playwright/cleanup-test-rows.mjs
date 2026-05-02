import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseDotEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const raw = fs.readFileSync(envPath, "utf8");
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

const dotEnv = parseDotEnvFile();
const url = process.env.VITE_SUPABASE_URL ?? dotEnv.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? dotEnv.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Missing Supabase config for cleanup.");
}

const supabase = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { count: matchedCount, error: selectError } = await supabase
  .from("user_blobs")
  .select("username", { count: "exact", head: true })
  .like("username", "test_%");
if (selectError) {
  throw new Error(`Failed to inspect test Supabase rows: ${selectError.message}`);
}

const { data, error } = await supabase
  .from("user_blobs")
  .delete()
  .like("username", "test_%")
  .select("username");
if (error) {
  throw new Error(`Failed to clean test Supabase rows: ${error.message}`);
}

if ((matchedCount ?? 0) > 0 && (data?.length ?? 0) === 0) {
  throw new Error(
    "Cleanup matched test rows but deleted none. Supabase needs a DELETE policy for public.user_blobs.",
  );
}
