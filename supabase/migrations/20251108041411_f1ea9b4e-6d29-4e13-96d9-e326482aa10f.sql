-- Add resolved field to content_snapshots
ALTER TABLE content_snapshots
ADD COLUMN resolved BOOLEAN DEFAULT FALSE;

-- Add index for better query performance
CREATE INDEX idx_content_snapshots_resolved ON content_snapshots(resolved);

-- Add resolved_at timestamp
ALTER TABLE content_snapshots
ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE;

-- Create policy for updating resolved status
CREATE POLICY "Allow public update resolved on content_snapshots"
ON content_snapshots
FOR UPDATE
USING (true)
WITH CHECK (true);