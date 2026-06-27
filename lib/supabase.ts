import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client. Uses the service-role key, so this module must
// never be imported into client components. No session persistence — each
// request is stateless.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
