-- Create storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-pdfs', 'content-pdfs', true);

-- Add PDF file path column to content_snapshots
ALTER TABLE content_snapshots
ADD COLUMN pdf_file_path text;

-- Create policy for public read access to PDFs
CREATE POLICY "Allow public read access to content PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'content-pdfs');

-- Create policy for service role to insert PDFs
CREATE POLICY "Allow service role to insert content PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'content-pdfs');