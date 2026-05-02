import { cleanupTestSupabaseRows } from "./supabase-cleanup";

export default async function globalTeardown() {
  await cleanupTestSupabaseRows();
}
