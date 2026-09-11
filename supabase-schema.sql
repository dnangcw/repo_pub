-- ============================================================================
-- SKEMA DATABASE ONLINE — Rekapitulasi Jual Beli Saham (StockTrack)
-- Jalankan seluruh file ini di: Supabase Dashboard > SQL Editor > New Query > Run
-- ============================================================================

create table if not exists transactions (
  id text primary key,
  date date not null,
  type text not null check (type in ('BUY','SELL')),
  code text not null,
  price numeric not null,
  lot numeric not null,
  fee_pct numeric not null default 0,
  note text
);
create index if not exists idx_transactions_code on transactions(code);
create index if not exists idx_transactions_date on transactions(date);

create table if not exists cashflows (
  id text primary key,
  date date not null,
  type text not null check (type in ('DEPOSIT','WITHDRAW')),
  amount numeric not null,
  note text
);

create table if not exists dividends (
  id text primary key,
  code text not null,
  cum_date date,
  pay_date date not null,
  per_share numeric not null,
  lot numeric not null,
  note text
);

create table if not exists stock_prices (
  code text primary key,
  current_price numeric not null,
  updated_at timestamptz
);

create table if not exists settings (
  key text primary key,
  value text
);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- Aplikasi ini tidak memakai sistem login — semua akses memakai satu "anon key".
-- Supabase mewajibkan RLS aktif sebelum tabel bisa diakses lewat anon key,
-- jadi kita aktifkan RLS lalu buat policy yang mengizinkan semua operasi.
--
-- PENTING: siapa pun yang memegang Project URL + anon key ini bisa membaca
-- dan menulis semua data di tabel-tabel ini. Cocok untuk pemakaian pribadi/solo,
-- TAPI JANGAN sebarkan anon key Anda secara publik (mis. di repo GitHub publik).
-- ----------------------------------------------------------------------------
alter table transactions enable row level security;
alter table cashflows enable row level security;
alter table dividends enable row level security;
alter table stock_prices enable row level security;
alter table settings enable row level security;

drop policy if exists "allow all - transactions" on transactions;
create policy "allow all - transactions" on transactions for all using (true) with check (true);

drop policy if exists "allow all - cashflows" on cashflows;
create policy "allow all - cashflows" on cashflows for all using (true) with check (true);

drop policy if exists "allow all - dividends" on dividends;
create policy "allow all - dividends" on dividends for all using (true) with check (true);

drop policy if exists "allow all - stock_prices" on stock_prices;
create policy "allow all - stock_prices" on stock_prices for all using (true) with check (true);

drop policy if exists "allow all - settings" on settings;
create policy "allow all - settings" on settings for all using (true) with check (true);

-- Selesai. Setelah ini jalan, buka Project Settings > API di Supabase untuk
-- menyalin "Project URL" dan "anon public" key, lalu masukkan ke aplikasi
-- lewat tombol "Setting Fee & Database" > "Database Online (Supabase)".
