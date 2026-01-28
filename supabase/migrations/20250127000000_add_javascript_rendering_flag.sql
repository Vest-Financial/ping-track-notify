-- Add flag to enable JavaScript rendering per URL
ALTER TABLE monitored_urls
ADD COLUMN use_javascript_rendering BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN monitored_urls.use_javascript_rendering IS
  'Enable JavaScript rendering via Puppeteer/Browserless for this URL. Set to true for pages that require JavaScript to render content.';
