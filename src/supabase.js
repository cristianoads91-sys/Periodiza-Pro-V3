import { createClient } from "@supabase/supabase-js";

// Credenciais do projeto Supabase
const SUPABASE_URL = "import.meta.env.VITE_SUPABASE_URL";
const SUPABASE_ANON_KEY = "import.meta.env.VITE_SUPABASE_ANON_KEY";
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
