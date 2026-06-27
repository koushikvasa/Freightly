import { supabase } from "@/lib/supabase";

// GET the most recent saved quotes for the history view.
export async function GET() {
  const { data, error } = await supabase
    .from("quotes")
    .select()
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("/api/quotes failed:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ quotes: data ?? [] });
}
