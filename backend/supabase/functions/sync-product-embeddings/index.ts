import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { geminiEmbedText } from "../_shared/voice-agent/gemini_client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Deno.env.get("GOOGLE_API_KEY")?.trim()) {
      return new Response(JSON.stringify({ error: "GOOGLE_API_KEY not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: jobs, error: jobsErr } = await admin
      .from("embedding_jobs")
      .select("id, record_id, attempts")
      .eq("table_name", "products")
      .in("status", ["pending", "failed"])
      .lt("attempts", 5)
      .order("created_at")
      .limit(BATCH_SIZE);

    if (jobsErr) {
      throw jobsErr;
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    const errors: string[] = [];

    for (const job of jobs) {
      await admin
        .from("embedding_jobs")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", job.id);

      try {
        const { data: product, error: prodErr } = await admin
          .from("products")
          .select("id, name, sku")
          .eq("id", job.record_id)
          .maybeSingle();

        if (prodErr) {
          throw prodErr;
        }
        if (!product) {
          await admin.from("embedding_jobs").update({
            status: "failed",
            last_error: "product not found",
            attempts: (job.attempts ?? 0) + 1,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          continue;
        }

        const text = [product.name, product.sku].filter(Boolean).join(" — ");
        const embedding = await geminiEmbedText(text);

        const { error: updErr } = await admin
          .from("products")
          .update({ embedding })
          .eq("id", product.id);

        if (updErr) {
          throw updErr;
        }

        await admin.from("embedding_jobs").update({
          status: "done",
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);

        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${job.id}: ${msg}`);
        await admin.from("embedding_jobs").update({
          status: "failed",
          last_error: msg.slice(0, 500),
          attempts: (job.attempts ?? 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
