import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.3.2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import jsPDF from "https://esm.sh/jspdf@2.5.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PDF text extraction function
async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const pdf = await getDocument(new Uint8Array(arrayBuffer)).promise;
    let fullText = '';

    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine all text items from the page
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      fullText += pageText + '\n';
    }

    return fullText;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to extract text from PDF: ${errorMessage}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { urlId } = await req.json();

    console.log(`Checking URL with ID: ${urlId}`);

    // Get the monitored URL
    const { data: monitoredUrl, error: urlError } = await supabaseClient
      .from('monitored_urls')
      .select('*')
      .eq('id', urlId)
      .single();

    if (urlError || !monitoredUrl) {
      throw new Error(`URL not found: ${urlError?.message}`);
    }

    console.log(`Fetching content from: ${monitoredUrl.url}`);

    // Fetch the URL content
    const response = await fetch(monitoredUrl.url);
    const statusCode = response.status;
    const contentType = response.headers.get('content-type') || '';
    
    // Clone response to use body twice (once for PDF storage, once for text extraction)
    const responseClone = response.clone();

    console.log(`Content-Type: ${contentType}`);

    // Extract clean text based on content type
    let cleanText = '';
    
    if (contentType.includes('application/pdf')) {
      // Handle PDF files
      console.log('Detected PDF content, extracting text...');
      
      const arrayBuffer = await response.arrayBuffer();
      const pdfText = await extractTextFromPDF(arrayBuffer);
      cleanText = pdfText
        .replace(/\0/g, '') // Remove null characters that PostgreSQL can't handle
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      console.log(`Extracted ${cleanText.length} characters from PDF`);
    } else if (contentType.includes('text/html')) {
      // Handle HTML content
      const rawContent = await response.text();
      cleanText = rawContent
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
        .replace(/<[^>]+>/g, ' ') // Remove all HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    } else {
      // For other content types, try to get as text
      const rawContent = await response.text();
      cleanText = rawContent.replace(/\s+/g, ' ').trim();
    }

    // Calculate content hash using the clean text
    const encoder = new TextEncoder();
    const data = encoder.encode(cleanText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Store PDF file in storage
    let pdfFilePath: string | null = null;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedUrl = monitoredUrl.url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    
    try {
      let fileBuffer: ArrayBuffer;
      let fileType: string;
      let fileName: string;
      
      if (contentType.includes('application/pdf')) {
        // Already a PDF, just store it
        fileBuffer = await responseClone.arrayBuffer();
        fileType = 'application/pdf';
        fileName = `${sanitizedUrl}_${timestamp}.pdf`;
      } else {
        // For HTML, store the HTML content directly
        console.log('Storing HTML content...');
        const htmlContent = await responseClone.text();
        const htmlBytes = encoder.encode(htmlContent);
        fileBuffer = htmlBytes.buffer;
        fileType = 'text/html';
        fileName = `${sanitizedUrl}_${timestamp}.html`;
      }
      
      const fileBlob = new Blob([fileBuffer], { type: fileType });
      
      const { error: uploadError } = await supabaseClient.storage
        .from('content-pdfs')
        .upload(fileName, fileBlob, {
          contentType: fileType,
          upsert: false
        });
      
      if (uploadError) {
        console.error('Failed to upload file:', uploadError);
      } else {
        pdfFilePath = fileName;
        console.log(`Stored file: ${fileName}`);
      }
    } catch (fileError) {
      console.error('Error storing file:', fileError);
      // Continue without file storage - don't fail the entire check
    }

    // Get the last snapshot
    const { data: lastSnapshot } = await supabaseClient
      .from('content_snapshots')
      .select('*')
      .eq('monitored_url_id', urlId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let alertLevel = 'green';
    let changePercentage = 0;

    if (lastSnapshot) {
      // Calculate change percentage
      const oldLength = lastSnapshot.content_length || 0;
      const newLength = cleanText.length;
      changePercentage = oldLength > 0 
        ? Math.abs((newLength - oldLength) / oldLength) 
        : 0;

      // Determine alert level
      if (contentHash !== lastSnapshot.content_hash) {
        if (statusCode !== 200 || changePercentage >= (monitoredUrl.red_threshold || 0.5)) {
          alertLevel = 'red';
        } else if (changePercentage >= (monitoredUrl.yellow_threshold || 0.3)) {
          alertLevel = 'yellow';
        }
      }

      console.log(`Change detected: ${changePercentage * 100}% - Alert level: ${alertLevel}`);

      // Send webhook if alert triggered
      if ((alertLevel === 'yellow' || alertLevel === 'red') && monitoredUrl.alert_webhook_url) {
        const webhookPayload = {
          ...(monitoredUrl.alert_webhook_payload || {}),
          url: monitoredUrl.url,
          alertLevel,
          changePercentage: changePercentage * 100,
          timestamp: new Date().toISOString(),
        };

        console.log(`Sending webhook to: ${monitoredUrl.alert_webhook_url}`);

        await fetch(monitoredUrl.alert_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload),
        }).catch(err => console.error('Webhook error:', err));
      }
    }

    // Save snapshot
    const { error: snapshotError } = await supabaseClient
      .from('content_snapshots')
      .insert({
        monitored_url_id: urlId,
        content_hash: contentHash,
        content_text: cleanText.substring(0, 10000), // Store first 10k chars of clean text
        content_length: cleanText.length,
        status_code: statusCode,
        alert_triggered: alertLevel,
        change_percentage: changePercentage,
        pdf_file_path: pdfFilePath,
      });

    if (snapshotError) {
      console.error('Error saving snapshot:', snapshotError);
    }

    // Update last checked time
    await supabaseClient
      .from('monitored_urls')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', urlId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        alertLevel, 
        changePercentage: changePercentage * 100,
        statusCode 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in check-url function:', error);
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