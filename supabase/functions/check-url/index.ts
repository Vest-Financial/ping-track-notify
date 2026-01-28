import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.3.2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import puppeteer from "https://deno.land/x/puppeteer@16.2.0/mod.ts";

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

// Fetch content with JavaScript rendering using Puppeteer
async function fetchWithPuppeteer(url: string): Promise<{ content: string; contentType: string }> {
  const browserlessApiKey = Deno.env.get('BROWSERLESS_API_KEY');

  if (!browserlessApiKey) {
    throw new Error('BROWSERLESS_API_KEY environment variable is not set');
  }

  console.log('Connecting to Browserless...');
  const browser = await puppeteer.connect({
    browserWSEndpoint: `wss://chrome.browserless.io?token=${browserlessApiKey}`
  });

  try {
    const page = await browser.newPage();

    // Set a reasonable timeout
    await page.setDefaultNavigationTimeout(30000);

    console.log(`Navigating to ${url} with Puppeteer...`);
    const response = await page.goto(url, {
      waitUntil: 'networkidle2' // Wait until network is idle (no more than 2 connections for 500ms)
    });

    if (!response) {
      throw new Error('Failed to load page');
    }

    const contentType = response.headers()['content-type'] || 'text/html';

    // If it's a PDF, get the buffer directly
    if (contentType.includes('application/pdf')) {
      const buffer = await response.buffer();
      await browser.close();
      return {
        content: new TextDecoder().decode(buffer),
        contentType: 'application/pdf'
      };
    }

    // For HTML, get the fully rendered content
    const content = await page.content();
    await browser.close();

    return {
      content,
      contentType: 'text/html'
    };
  } catch (error) {
    await browser.close();
    throw error;
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

    let statusCode = 200;
    let contentType = '';
    let rawContent = '';
    let responseForStorage: Response | null = null;

    // Check if this URL is configured to use JavaScript rendering
    const shouldUseJavaScript = monitoredUrl.use_javascript_rendering === true;
    const browserlessAvailable = !!Deno.env.get('BROWSERLESS_API_KEY');
    const usePuppeteer = shouldUseJavaScript && browserlessAvailable;

    if (shouldUseJavaScript && !browserlessAvailable) {
      console.warn('JavaScript rendering requested but BROWSERLESS_API_KEY not set. Falling back to regular fetch.');
    }

    if (usePuppeteer) {
      try {
        console.log('Using Puppeteer for JavaScript-rendered content...');
        const puppeteerResult = await fetchWithPuppeteer(monitoredUrl.url);
        rawContent = puppeteerResult.content;
        contentType = puppeteerResult.contentType;
        statusCode = 200;
      } catch (puppeteerError) {
        console.error('Puppeteer failed, falling back to regular fetch:', puppeteerError);
        // Fall back to regular fetch
        const response = await fetch(monitoredUrl.url);
        statusCode = response.status;
        contentType = response.headers.get('content-type') || '';
        responseForStorage = response.clone();
        rawContent = await response.text();
      }
    } else {
      // Regular fetch without JavaScript rendering
      const fetchMethod = shouldUseJavaScript ? 'regular fetch (Browserless unavailable)' : 'regular fetch';
      console.log(`Using ${fetchMethod}...`);
      const response = await fetch(monitoredUrl.url);
      statusCode = response.status;
      contentType = response.headers.get('content-type') || '';
      responseForStorage = response.clone();
      rawContent = await response.text();
    }

    console.log(`Content-Type: ${contentType}, Status: ${statusCode}`);

    // Extract clean text based on content type
    let cleanText = '';

    if (contentType.includes('application/pdf')) {
      // Handle PDF files
      console.log('Detected PDF content, extracting text...');

      const encoder = new TextEncoder();
      const arrayBuffer = encoder.encode(rawContent).buffer;
      const pdfText = await extractTextFromPDF(arrayBuffer);
      cleanText = pdfText
        .replace(/\0/g, '') // Remove null characters that PostgreSQL can't handle
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      console.log(`Extracted ${cleanText.length} characters from PDF`);
    } else if (contentType.includes('text/html')) {
      // Handle HTML content
      cleanText = rawContent
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
        .replace(/<[^>]+>/g, ' ') // Remove all HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    } else {
      // For other content types, try to get as text
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
      const encoder = new TextEncoder();

      if (contentType.includes('application/pdf')) {
        // Already a PDF, just store it
        const pdfBytes = encoder.encode(rawContent);
        fileBuffer = pdfBytes.buffer;
        fileType = 'application/pdf';
        fileName = `${sanitizedUrl}_${timestamp}.pdf`;
      } else {
        // For HTML, convert to PDF using jsPDF
        console.log('Converting HTML to PDF...');

        try {
          // Strip HTML tags and extract text content
          const textContent = rawContent
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          // Create PDF with jsPDF
          const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
          });

          doc.setFontSize(10);
          const pageWidth = doc.internal.pageSize.getWidth() - 20;
          const pageHeight = doc.internal.pageSize.getHeight() - 20;
          const lineHeight = 5;

          const lines = doc.splitTextToSize(textContent, pageWidth);

          let y = 10;
          for (let i = 0; i < lines.length; i++) {
            if (y > pageHeight) {
              doc.addPage();
              y = 10;
            }
            doc.text(lines[i], 10, y);
            y += lineHeight;
          }

          // Get PDF as Uint8Array and convert to ArrayBuffer
          const pdfBytes = doc.output('arraybuffer');
          fileBuffer = pdfBytes;
          fileType = 'application/pdf';
          fileName = `${sanitizedUrl}_${timestamp}.pdf`;
          console.log('HTML converted to PDF successfully');
        } catch (error) {
          console.error('PDF conversion failed:', error);
          // Fallback: store as HTML
          const htmlBytes = encoder.encode(rawContent);
          fileBuffer = htmlBytes.buffer;
          fileType = 'text/html';
          fileName = `${sanitizedUrl}_${timestamp}.html`;
        }
      }
      
      const fileBlob = new Blob([fileBuffer], { type: fileType });
      
      const { error: uploadError } = await supabaseClient.storage
        .from('content-pdfs')
        .upload(fileName, fileBlob, {
          contentType: fileType,
          cacheControl: '3600',
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