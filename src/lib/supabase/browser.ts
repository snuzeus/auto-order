import { createBrowserClient } from "@supabase/ssr";

function getPublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

export function createClient() {
  return createBrowserClient(
    getPublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
