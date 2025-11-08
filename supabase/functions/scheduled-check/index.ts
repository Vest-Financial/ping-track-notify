import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    console.log('Running scheduled URL checks...');

    // Get URLs that need checking
    const { data: urlsToCheck, error: queryError } = await supabaseClient
      .from('monitored_urls')
      .select('*')
      .eq('is_active', true)
      .or(`last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - 60 * 60 * 1000).toISOString()}`);

    if (queryError) {
      throw new Error(`Query error: ${queryError.message}`);
    }

    console.log(`Found ${urlsToCheck?.length || 0} URLs to check`);

    const results = [];

    for (const url of urlsToCheck || []) {
      const now = new Date();
      const lastChecked = url.last_checked_at ? new Date(url.last_checked_at) : null;
      const hoursSinceCheck = lastChecked 
        ? (now.getTime() - lastChecked.getTime()) / (1000 * 60 * 60)
        : Infinity;

      if (!lastChecked || hoursSinceCheck >= url.check_frequency_hours) {
        console.log(`Checking URL: ${url.url}`);
        
        // Call the check-url function
        const checkResult = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/check-url`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({ urlId: url.id }),
          }
        );

        const result = await checkResult.json();
        results.push({ url: url.url, result });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        checkedCount: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in scheduled-check function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});