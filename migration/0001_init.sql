-- ============================================================
-- Jeans Platform — schéma initial (modèle Discord)
-- profiles → servers → channels → messages
-- À coller dans l'éditeur SQL de Supabase (une seule exécution).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Types
-- ------------------------------------------------------------

create type public.server_role as enum ('owner', 'admin', 'member');

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

-- Un profil public par compte auth.users (créé automatiquement, voir trigger plus bas).
-- On ne duplique JAMAIS l'email ici : il reste dans auth.users (minimisation RGPD).
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique,
  display_name  text not null,
  avatar_url    text,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint username_format check (username ~ '^[a-z0-9_]{3,32}$'),
  constraint display_name_length check (char_length(display_name) between 1 and 48),
  constraint bio_length check (bio is null or char_length(bio) <= 280)
);

create table public.servers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  icon_url     text,
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  is_public    boolean not null default false,
  invite_code  text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint server_name_length check (char_length(name) between 2 and 64),
  constraint server_description_length check (description is null or char_length(description) <= 280)
);

create table public.server_members (
  server_id  uuid not null references public.servers (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       public.server_role not null default 'member',
  nickname   text,
  joined_at  timestamptz not null default now(),

  primary key (server_id, profile_id),
  constraint nickname_length check (nickname is null or char_length(nickname) between 1 and 48)
);

create table public.channels (
  id         uuid primary key default gen_random_uuid(),
  server_id  uuid not null references public.servers (id) on delete cascade,
  name       text not null,
  topic      text,
  position   integer not null default 0,
  created_at timestamptz not null default now(),

  constraint channel_name_format check (name ~ '^[a-z0-9-]{1,32}$'),
  constraint channel_topic_length check (topic is null or char_length(topic) <= 280),
  unique (server_id, name)
);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  edited_at  timestamptz,

  constraint content_length check (char_length(content) between 1 and 4000)
);

-- Curseur de lecture par salon : on stocke le dernier message lu, pas un accusé
-- par message — sinon la table explose (nb_messages × nb_membres).
-- « lu » se déduit en comparant messages.created_at à last_read_at.
create table public.channel_reads (
  channel_id           uuid not null references public.channels (id) on delete cascade,
  profile_id           uuid not null references public.profiles (id) on delete cascade,
  last_read_message_id uuid references public.messages (id) on delete set null,
  last_read_at         timestamptz not null default now(),

  primary key (channel_id, profile_id)
);

-- ------------------------------------------------------------
-- Index
-- ------------------------------------------------------------

-- Requête la plus fréquente : le fil d'un salon, du plus récent au plus ancien.
create index messages_channel_created_idx on public.messages (channel_id, created_at desc);
create index messages_author_idx          on public.messages (author_id);
create index server_members_profile_idx   on public.server_members (profile_id);
create index channels_server_idx          on public.channels (server_id, position);
create index servers_owner_idx            on public.servers (owner_id);

-- ------------------------------------------------------------
-- Fonctions d'aide pour les politiques RLS
--
-- IMPORTANT : elles sont en `security definer` pour contourner la RLS de la
-- table qu'elles interrogent. Sans ça, une politique de server_members qui lit
-- server_members provoque une récursion infinie (erreur 42P17).
-- ------------------------------------------------------------

create or replace function public.is_server_member(p_server_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server_id
      and profile_id = auth.uid()
  );
$$;

create or replace function public.has_server_role(p_server_id uuid, p_roles public.server_role[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server_id
      and profile_id = auth.uid()
      and role = any (p_roles)
  );
$$;

create or replace function public.channel_server_id(p_channel_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select server_id from public.channels where id = p_channel_id;
$$;

-- Minimisation RGPD : on ne voit le profil de quelqu'un que si on partage un serveur.
create or replace function public.shares_server_with(p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.server_members moi
    join public.server_members autre on autre.server_id = moi.server_id
    where moi.profile_id = auth.uid()
      and autre.profile_id = p_profile_id
  );
$$;

-- ------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------

-- Chaque inscription crée son profil. Le username vient des métadonnées passées
-- à supabase.auth.signUp({ options: { data: { username, display_name } } }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
      'user_' || substr(replace(new.id::text, '-', ''), 1, 12)
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'Nouvel utilisateur'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Créer un serveur inscrit d'office son propriétaire et ouvre un salon #general.
create or replace function public.handle_new_server()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.server_members (server_id, profile_id, role)
  values (new.id, new.owner_id, 'owner');

  insert into public.channels (server_id, name, topic, position)
  values (new.id, 'general', 'Salon par défaut', 0);

  return new;
end;
$$;

create trigger on_server_created
  after insert on public.servers
  for each row execute function public.handle_new_server();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger servers_touch_updated_at
  before update on public.servers
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- Tout est refusé par défaut ; chaque politique rouvre le strict nécessaire.
-- ------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.servers        enable row level security;
alter table public.server_members enable row level security;
alter table public.channels       enable row level security;
alter table public.messages       enable row level security;
alter table public.channel_reads  enable row level security;

-- profiles ---------------------------------------------------

create policy "profils visibles: soi-même et les membres de mes serveurs"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.shares_server_with(id));

create policy "on ne modifie que son propre profil"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Pas de policy INSERT : seul le trigger handle_new_user crée les profils.
-- Pas de policy DELETE : la suppression passe par auth.users (cascade),
-- ce qui garantit le droit à l'effacement RGPD en un seul geste.

-- servers ----------------------------------------------------

create policy "serveurs visibles: les miens et les publics"
  on public.servers for select
  to authenticated
  using (public.is_server_member(id) or is_public);

create policy "on crée un serveur dont on est propriétaire"
  on public.servers for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "seuls owner et admin modifient un serveur"
  on public.servers for update
  to authenticated
  using (public.has_server_role(id, array['owner', 'admin']::public.server_role[]))
  with check (public.has_server_role(id, array['owner', 'admin']::public.server_role[]));

create policy "seul le propriétaire supprime un serveur"
  on public.servers for delete
  to authenticated
  using (owner_id = auth.uid());

-- server_members ---------------------------------------------

create policy "on voit les membres des serveurs où l'on est"
  on public.server_members for select
  to authenticated
  using (public.is_server_member(server_id));

create policy "on rejoint soi-même un serveur public"
  on public.server_members for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.servers s where s.id = server_id and s.is_public)
  );

create policy "on modifie son propre pseudo de serveur"
  on public.server_members for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and role = 'member');

create policy "on quitte un serveur, owner et admin peuvent exclure"
  on public.server_members for delete
  to authenticated
  using (
    profile_id = auth.uid()
    or public.has_server_role(server_id, array['owner', 'admin']::public.server_role[])
  );

-- channels ---------------------------------------------------

create policy "on voit les salons de ses serveurs"
  on public.channels for select
  to authenticated
  using (public.is_server_member(server_id));

create policy "owner et admin gèrent les salons"
  on public.channels for all
  to authenticated
  using (public.has_server_role(server_id, array['owner', 'admin']::public.server_role[]))
  with check (public.has_server_role(server_id, array['owner', 'admin']::public.server_role[]));

-- messages ---------------------------------------------------

create policy "on lit les messages de ses serveurs"
  on public.messages for select
  to authenticated
  using (public.is_server_member(public.channel_server_id(channel_id)));

create policy "on écrit en son propre nom dans ses serveurs"
  on public.messages for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_server_member(public.channel_server_id(channel_id))
  );

create policy "on ne modifie que ses propres messages"
  on public.messages for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "on supprime ses messages, owner et admin modèrent"
  on public.messages for delete
  to authenticated
  using (
    author_id = auth.uid()
    or public.has_server_role(public.channel_server_id(channel_id), array['owner', 'admin']::public.server_role[])
  );

-- channel_reads ----------------------------------------------

create policy "chacun ne voit que ses propres curseurs de lecture"
  on public.channel_reads for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ------------------------------------------------------------
-- Realtime : diffuser les nouveaux messages aux clients abonnés.
-- La RLS ci-dessus s'applique aussi au flux temps réel.
-- ------------------------------------------------------------

alter publication supabase_realtime add table public.messages;
