import { supabaseClient } from "./supabase";

export type CloudBlobResult =
  | { ok: true; data: { raw: unknown; updatedAt: string } | null }
  | { ok: false; error: string };

type UserBlobRow = {
  username: string;
  data: unknown;
  updated_at: string;
};

export async function fetchUserBlob(username: string): Promise<CloudBlobResult> {
  try {
    const client = supabaseClient();
    const { data, error, status } = await client
      .from("user_blobs")
      .select("data,updated_at")
      .eq("username", username)
      .maybeSingle<UserBlobRow>();

    if (error && status !== 406) {
      return { ok: false, error: error.message };
    }

    if (!data) {
      return { ok: true, data: null };
    }

    return {
      ok: true,
      data: {
        raw: data.data,
        updatedAt: data.updated_at,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function upsertUserBlob(
  username: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = supabaseClient();
    const { error } = await client
      .from("user_blobs")
      .upsert(
        {
          username,
          data: raw,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "username" },
      );

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
