alter table public.triggers
  add column if not exists entry_node_id text,
  add column if not exists show_outputs boolean not null default false,
  add column if not exists output_node_ids text[];
