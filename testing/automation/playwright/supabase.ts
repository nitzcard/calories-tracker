import fs from "node:fs";
import path from "node:path";

export type SupabaseConfig = {
  url: string;
  anonKey: string; 
};

function parseDotEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return {} as Record<string, string>;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  const values: Record<string, string> = {};
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

export function getSupabaseConfig(): SupabaseConfig | null {
  const dotEnv = parseDotEnvFile();
  const url = process.env.VITE_SUPABASE_URL ?? dotEnv.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? dotEnv.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}
