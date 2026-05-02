import { cleanupTestSupabaseRows } from "./supabase-cleanup";

export default async function globalSetup() {
  await cleanupTestSupabaseRows();
}
