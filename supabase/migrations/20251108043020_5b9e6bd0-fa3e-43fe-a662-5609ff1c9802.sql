-- Add delete policy for content_snapshots to allow discarding revisions
CREATE POLICY "Allow public delete on content_snapshots"
ON content_snapshots
FOR DELETE
USING (true);