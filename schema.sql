create table if not exists intake_requests (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  title text not null check (char_length(title) between 3 and 100),
  category text not null check (category in ('build', 'repair', 'research')),
  created_at timestamptz not null default clock_timestamp()
);
