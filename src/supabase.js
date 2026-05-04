import { createClient } from "@supabase/supabase-js";

// Credenciais do projeto Supabase
const SUPABASE_URL = "https://timkysvfqtlteamvefrb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpbWt5c3ZmcXRsdGVhbXZlZnJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzcyMTksImV4cCI6MjA5MjA1MzIxOX0.WQ8jCI-LUAy4pdud42dY06tWXrBa2QcI4TUUx7-EU48";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "periodizapro_auth",
  },
});

// Helper: save data to cloud
export async function syncToCloud(userId, data) {
  if (!userId) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("user_data")
    .upsert({ user_id: userId, data }, { onConflict: "user_id" });
  return { error };
}

// Helper: load data from cloud
export async function loadFromCloud(userId) {
  if (!userId) return { data: null, error: "Not authenticated" };
  const { data, error } = await supabase
    .from("user_data")
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  return { data: data?.data || null, updatedAt: data?.updated_at || null, error };
}
