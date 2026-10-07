-- Learning Buddy parent↔child sync backend
-- Run this once in a dedicated Supabase project.
-- Uses only the public/publishable browser key; direct table access remains blocked by RLS.

create extension if not exists pgcrypto;

create table if not exists public.lb_families (
  id uuid primary key default gen_random_uuid(),
  family_code text not null unique,
  parent_token_hash text not null unique,
  child_token_hash text unique,
  child_link_code_hash text,
  child_link_expires_at timestamptz,
  learner_name text not null,
  buddy_id text not null default 'alex',
  progress_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lb_assignments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.lb_families(id) on delete cascade,
  assigned_for date not null,
  subject text not null,
  unit_id text not null,
  unit_title text not null,
  mode text not null check (mode in ('module','lesson','quiz')),
  title text not null,
  note text not null default '',
  status text not null default 'assigned' check (status in ('assigned','in_progress','complete')),
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (family_id, assigned_for)
);

alter table public.lb_families enable row level security;
alter table public.lb_assignments enable row level security;
revoke all on public.lb_families from anon, authenticated;
revoke all on public.lb_assignments from anon, authenticated;

create or replace function public.lb_token_hash(v text)
returns text
language sql
immutable
strict
set search_path = public
as $$ select encode(digest(v, 'sha256'), 'hex') $$;

create or replace function public.lb_create_family(p_learner_name text, p_buddy_id text default 'alex')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_token text := encode(gen_random_bytes(32), 'hex');
  v_link text := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
  v_family_code text := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
  v_id uuid;
begin
  if length(trim(coalesce(p_learner_name,''))) < 1 then
    raise exception 'Learner name is required';
  end if;
  loop
    begin
      insert into public.lb_families(
        family_code, parent_token_hash, child_link_code_hash, child_link_expires_at,
        learner_name, buddy_id
      ) values (
        v_family_code, public.lb_token_hash(v_parent_token), public.lb_token_hash(v_link), now() + interval '24 hours',
        left(trim(p_learner_name), 40), coalesce(nullif(p_buddy_id,''),'alex')
      ) returning id into v_id;
      exit;
    exception when unique_violation then
      v_family_code := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
    end;
  end loop;
  return jsonb_build_object(
    'family_code', v_family_code,
    'parent_token', v_parent_token,
    'child_link_code', v_link,
    'child_link_expires_at', now() + interval '24 hours',
    'learner_name', left(trim(p_learner_name), 40),
    'buddy_id', coalesce(nullif(p_buddy_id,''),'alex')
  );
end;
$$;

create or replace function public.lb_parent_snapshot(p_parent_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.lb_families%rowtype;
  a jsonb;
begin
  select * into f from public.lb_families where parent_token_hash = public.lb_token_hash(p_parent_token);
  if f.id is null then raise exception 'Invalid parent token'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.assigned_for desc), '[]'::jsonb)
    into a
    from (
      select id, assigned_for, subject, unit_id, unit_title, mode, title, note, status, result,
             created_at, started_at, completed_at, updated_at
      from public.lb_assignments
      where family_id = f.id
      order by assigned_for desc
      limit 30
    ) x;
  return jsonb_build_object(
    'family_code', f.family_code,
    'learner_name', f.learner_name,
    'buddy_id', f.buddy_id,
    'progress_snapshot', f.progress_snapshot,
    'assignments', a,
    'child_linked', f.child_token_hash is not null,
    'link_expires_at', f.child_link_expires_at
  );
end;
$$;

create or replace function public.lb_parent_assign(
  p_parent_token text,
  p_assigned_for date,
  p_subject text,
  p_unit_id text,
  p_unit_title text,
  p_mode text,
  p_title text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f_id uuid;
  a public.lb_assignments%rowtype;
begin
  select id into f_id from public.lb_families where parent_token_hash = public.lb_token_hash(p_parent_token);
  if f_id is null then raise exception 'Invalid parent token'; end if;
  if p_mode not in ('module','lesson','quiz') then raise exception 'Invalid mode'; end if;

  insert into public.lb_assignments(
    family_id, assigned_for, subject, unit_id, unit_title, mode, title, note, status
  ) values (
    f_id, p_assigned_for, left(p_subject,80), left(p_unit_id,120), left(p_unit_title,160), p_mode,
    left(coalesce(nullif(trim(p_title),''), p_unit_title),160), left(coalesce(p_note,''),1200), 'assigned'
  )
  on conflict (family_id, assigned_for) do update set
    subject = excluded.subject,
    unit_id = excluded.unit_id,
    unit_title = excluded.unit_title,
    mode = excluded.mode,
    title = excluded.title,
    note = excluded.note,
    status = 'assigned',
    result = null,
    started_at = null,
    completed_at = null,
    updated_at = now()
  returning * into a;

  return to_jsonb(a);
end;
$$;

create or replace function public.lb_parent_update_profile(
  p_parent_token text,
  p_learner_name text,
  p_buddy_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare f public.lb_families%rowtype;
begin
  update public.lb_families
     set learner_name = left(trim(p_learner_name),40),
         buddy_id = coalesce(nullif(p_buddy_id,''),'alex'),
         updated_at = now()
   where parent_token_hash = public.lb_token_hash(p_parent_token)
   returning * into f;
  if f.id is null then raise exception 'Invalid parent token'; end if;
  return jsonb_build_object('learner_name',f.learner_name,'buddy_id',f.buddy_id);
end;
$$;

create or replace function public.lb_parent_regenerate_link(p_parent_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
  f public.lb_families%rowtype;
begin
  update public.lb_families
     set child_link_code_hash = public.lb_token_hash(v_link),
         child_link_expires_at = now() + interval '24 hours',
         updated_at = now()
   where parent_token_hash = public.lb_token_hash(p_parent_token)
   returning * into f;
  if f.id is null then raise exception 'Invalid parent token'; end if;
  return jsonb_build_object('family_code',f.family_code,'child_link_code',v_link,'child_link_expires_at',f.child_link_expires_at);
end;
$$;

create or replace function public.lb_child_claim(p_family_code text, p_link_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child_token text := encode(gen_random_bytes(32), 'hex');
  f public.lb_families%rowtype;
begin
  select * into f
    from public.lb_families
   where family_code = upper(trim(p_family_code))
     and child_link_code_hash = public.lb_token_hash(upper(trim(p_link_code)))
     and child_link_expires_at > now();
  if f.id is null then raise exception 'Invalid or expired link code'; end if;

  update public.lb_families
     set child_token_hash = public.lb_token_hash(v_child_token),
         child_link_code_hash = null,
         child_link_expires_at = null,
         updated_at = now()
   where id = f.id;

  return jsonb_build_object(
    'child_token',v_child_token,
    'family_code',f.family_code,
    'learner_name',f.learner_name,
    'buddy_id',f.buddy_id,
    'progress_snapshot',f.progress_snapshot
  );
end;
$$;

create or replace function public.lb_child_snapshot(p_child_token text, p_local_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.lb_families%rowtype;
  a jsonb;
begin
  select * into f from public.lb_families where child_token_hash = public.lb_token_hash(p_child_token);
  if f.id is null then raise exception 'Invalid child token'; end if;
  select to_jsonb(x) into a from (
    select id, assigned_for, subject, unit_id, unit_title, mode, title, note, status, result,
           created_at, started_at, completed_at, updated_at
    from public.lb_assignments
    where family_id = f.id and assigned_for = p_local_date
    limit 1
  ) x;
  return jsonb_build_object(
    'family_code',f.family_code,
    'learner_name',f.learner_name,
    'buddy_id',f.buddy_id,
    'progress_snapshot',f.progress_snapshot,
    'assignment',a
  );
end;
$$;

create or replace function public.lb_child_start(p_child_token text, p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f_id uuid;
  a public.lb_assignments%rowtype;
begin
  select id into f_id from public.lb_families where child_token_hash = public.lb_token_hash(p_child_token);
  if f_id is null then raise exception 'Invalid child token'; end if;
  update public.lb_assignments
     set status = case when status='complete' then status else 'in_progress' end,
         started_at = coalesce(started_at,now()),
         updated_at = now()
   where id = p_assignment_id and family_id = f_id
   returning * into a;
  if a.id is null then raise exception 'Assignment not found'; end if;
  return to_jsonb(a);
end;
$$;

create or replace function public.lb_child_complete(
  p_child_token text,
  p_assignment_id uuid,
  p_result jsonb,
  p_progress_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f_id uuid;
  a public.lb_assignments%rowtype;
begin
  select id into f_id from public.lb_families where child_token_hash = public.lb_token_hash(p_child_token);
  if f_id is null then raise exception 'Invalid child token'; end if;

  update public.lb_assignments
     set status='complete', result=coalesce(p_result,'{}'::jsonb), completed_at=now(), updated_at=now()
   where id=p_assignment_id and family_id=f_id
   returning * into a;
  if a.id is null then raise exception 'Assignment not found'; end if;

  update public.lb_families
     set progress_snapshot=coalesce(p_progress_snapshot,'{}'::jsonb), updated_at=now()
   where id=f_id;

  return to_jsonb(a);
end;
$$;

revoke all on function public.lb_create_family(text,text) from public;
revoke all on function public.lb_parent_snapshot(text) from public;
revoke all on function public.lb_parent_assign(text,date,text,text,text,text,text,text) from public;
revoke all on function public.lb_parent_update_profile(text,text,text) from public;
revoke all on function public.lb_parent_regenerate_link(text) from public;
revoke all on function public.lb_child_claim(text,text) from public;
revoke all on function public.lb_child_snapshot(text,date) from public;
revoke all on function public.lb_child_start(text,uuid) from public;
revoke all on function public.lb_child_complete(text,uuid,jsonb,jsonb) from public;

grant execute on function public.lb_create_family(text,text) to anon;
grant execute on function public.lb_parent_snapshot(text) to anon;
grant execute on function public.lb_parent_assign(text,date,text,text,text,text,text,text) to anon;
grant execute on function public.lb_parent_update_profile(text,text,text) to anon;
grant execute on function public.lb_parent_regenerate_link(text) to anon;
grant execute on function public.lb_child_claim(text,text) to anon;
grant execute on function public.lb_child_snapshot(text,date) to anon;
grant execute on function public.lb_child_start(text,uuid) to anon;
grant execute on function public.lb_child_complete(text,uuid,jsonb,jsonb) to anon;
