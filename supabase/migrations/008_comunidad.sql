-- Comunidad real: publicaciones y comentarios visibles para todos los usuarios con sesión.
create table if not exists public.posts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,
  zona text,
  tema text not null,
  texto text not null check (char_length(texto) between 8 and 600),
  video boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.post_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,
  texto text not null check (char_length(texto) between 1 and 400),
  created_at timestamptz not null default now()
);
create index if not exists posts_created on public.posts(created_at desc);
create index if not exists post_comments_post on public.post_comments(post_id, created_at);
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
drop policy if exists "posts: ver" on public.posts;
drop policy if exists "posts: publicar" on public.posts;
drop policy if exists "posts: borrar propio" on public.posts;
create policy "posts: ver" on public.posts for select to authenticated using (true);
create policy "posts: publicar" on public.posts for insert to authenticated with check (user_id = auth.uid());
create policy "posts: borrar propio" on public.posts for delete to authenticated using (user_id = auth.uid());
drop policy if exists "pc: ver" on public.post_comments;
drop policy if exists "pc: comentar" on public.post_comments;
create policy "pc: ver" on public.post_comments for select to authenticated using (true);
create policy "pc: comentar" on public.post_comments for insert to authenticated with check (user_id = auth.uid());
grant select, insert, delete on public.posts to authenticated;
grant select, insert on public.post_comments to authenticated;
