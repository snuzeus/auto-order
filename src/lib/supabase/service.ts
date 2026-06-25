import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getEnv(
  name:
    | "NEXT_PUBLIC_SUPABASE_URL"
    | "SUPABASE_SERVICE_ROLE_KEY",
) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

export function createServiceClient() {
  return createSupabaseClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
