-- Create the receipts bucket explicitly as public
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = true;

-- Allow public access to read files in the receipts bucket
drop policy if exists "Allow public read access to receipts" on storage.objects;
create policy "Allow public read access to receipts"
on storage.objects for select
to public
using (bucket_id = 'receipts');

-- Allow authenticated users to upload files to the receipts bucket
create policy "Allow authenticated upload to receipts"
on storage.objects for insert
to authenticated
with check (bucket_id = 'receipts');

-- Allow users to delete their own files (optional but good practice)
-- Note: This assumes we follow a folder structure like company_id/file
create policy "Allow users to delete their own receipts"
on storage.objects for delete
to authenticated
using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
