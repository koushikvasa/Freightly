-- Part A: run this once in the Supabase SQL editor (SQL → New query → Run).

create table quotes (
  id             uuid primary key default gen_random_uuid(),
  origin         text,
  destination    text,
  weight_kg      numeric,
  length_cm      numeric,
  width_cm       numeric,
  height_cm      numeric,
  category       text,
  options        jsonb,          -- full ranked RateOption[]
  recommendation jsonb,          -- { carrier, service, price, why }
  created_at     timestamptz default now()
);
