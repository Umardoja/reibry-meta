import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VIDEO_BUCKET } from "./contracts.ts";

/** Removes one video object through the Storage API with the server key. Callers must first prove the path belongs to the verified user. */
export async function removeVideoObject(trusted: SupabaseClient, path: string) {
  const { error } = await trusted.storage.from(VIDEO_BUCKET).remove([path]);
  if (error) throw new Error("video-removal-failed");
}
