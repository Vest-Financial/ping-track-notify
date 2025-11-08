-- Create enum for alert levels
CREATE TYPE alert_level AS ENUM ('green', 'yellow', 'red');

-- Create monitored_urls table
CREATE TABLE monitored_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  name TEXT,
  check_frequency_hours INTEGER NOT NULL DEFAULT 168, -- default 1 week
  last_checked_at TIMESTAMP WITH TIME ZONE,
  alert_webhook_url TEXT,
  alert_webhook_payload JSONB,
  yellow_threshold NUMERIC DEFAULT 0.3, -- % change for yellow alert
  red_threshold NUMERIC DEFAULT 0.5, -- % change for red alert
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create content_snapshots table
CREATE TABLE content_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_url_id UUID REFERENCES monitored_urls(id) ON DELETE CASCADE NOT NULL,
  content_hash TEXT NOT NULL,
  content_text TEXT,
  content_length INTEGER,
  status_code INTEGER,
  alert_triggered alert_level DEFAULT 'green',
  change_percentage NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_monitored_urls_active ON monitored_urls(is_active) WHERE is_active = true;
CREATE INDEX idx_monitored_urls_last_checked ON monitored_urls(last_checked_at);
CREATE INDEX idx_content_snapshots_url_id ON content_snapshots(monitored_url_id);
CREATE INDEX idx_content_snapshots_created_at ON content_snapshots(created_at);

-- Enable RLS
ALTER TABLE monitored_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies (public access for demo - adjust as needed)
CREATE POLICY "Allow public read access on monitored_urls"
  ON monitored_urls FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on monitored_urls"
  ON monitored_urls FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on monitored_urls"
  ON monitored_urls FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on monitored_urls"
  ON monitored_urls FOR DELETE
  USING (true);

CREATE POLICY "Allow public read access on content_snapshots"
  ON content_snapshots FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on content_snapshots"
  ON content_snapshots FOR INSERT
  WITH CHECK (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for monitored_urls
CREATE TRIGGER update_monitored_urls_updated_at
  BEFORE UPDATE ON monitored_urls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();