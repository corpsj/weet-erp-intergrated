-- Convert existing absolute Supabase URLs to relative paths
update utility_bills
set image_url = split_part(image_url, '/public/receipts/', 2)
where image_url like '%/public/receipts/%';

-- Ensure the receipts bucket exists (even if private)
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
