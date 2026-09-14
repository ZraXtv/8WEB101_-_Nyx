-- ============================================================
-- Amis et messages privés.
--
-- À exécuter APRÈS 0001, 0002 et 0003. Rejouable sans risque.
-- ============================================================

do $$ begin
  create type public.friendship_status as enum ('pending', 'accepted', 'blocked');
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- Amitiés
--
-- Une demande est dirigée (requester → addressee), mais une amitié est
-- symétrique. Les colonnes générées user_low / user_high rangent toujours
-- la paire dans le même ordre : l'index unique empêche alors A→B et B→A
-- de coexister, quel que soit l'ordre d'arrivée des demandes.
-- ------------------------------------------------------------
create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  addressee_id  uuid not null references public.profiles (id) on delete cascade,
  status        public.friendship_status not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,

  user_low  uuid generated always as (least(requester_id, addressee_id)) stored,
  user_high uuid generated always as (greatest(requester_id, addressee_id)) stored,

  constraint pas_ami_avec_soi_meme check (requester_id <> addressee_id),
  constraint paire_unique unique (user_low, user_high)
);

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

-- ------------------------------------------------------------
-- Conversations privées
--
-- Une seule conversation par paire, d'où le même rangement canonique.
-- ------------------------------------------------------------
create table if not exists public.dm_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_low   uuid not null references public.profiles (id) on delete cascade,
  user_high  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint paire_ordonnee check (user_low < user_high),
  constraint conversation_unique unique (user_low, user_high)
);

create table if not exists public.direct_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  content         text not null,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,

  constraint contenu_longueur check (char_length(content) between 1 and 4000)
);

create index if not exists direct_messages_conversation_idx
  on public.direct_messages (conversation_id, created_at desc);

-- ------------------------------------------------------------
-- Fonctions d'aide (security definer : elles interrogent les tables
-- qu'elles servent à protéger, sinon la RLS partirait en récursion)
-- ------------------------------------------------------------

-- Vrai si une relation existe dans un sens ou dans l'autre, quel que soit
-- son statut : sert à voir le profil de qui vous a envoyé une demande.
create or replace function public.is_linked_to(p_profile_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where user_low  = least(auth.uid(), p_profile_id)
      and user_high = greatest(auth.uid(), p_profile_id)
  );
$$;

create or replace function public.is_dm_participant(p_conversation_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.dm_conversations
    where id = p_conversation_id
      and auth.uid() in (user_low, user_high)
  );
$$;

-- ------------------------------------------------------------
-- Recherche d'un membre par pseudo exact.
--
-- Volontairement en correspondance exacte : une recherche partielle
-- permettrait d'énumérer tous les comptes de la plateforme.
-- ------------------------------------------------------------
create or replace function public.find_profile_by_username(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where p.username = lower(trim(p_username))
    and p.id <> auth.uid()
  limit 1;
$$;

-- ------------------------------------------------------------
-- Envoi d'une demande d'ami, par pseudo.
--
-- Tout se joue dans une seule fonction pour rester atomique : sans ça, deux
-- personnes s'ajoutant en même temps déclencheraient une violation de l'index
-- unique au lieu de devenir amies.
-- ------------------------------------------------------------
create or replace function public.send_friend_request(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_cible uuid;
  v_existe public.friendships%rowtype;
begin
  if v_me is null then
    raise exception 'Tu dois être connecté.' using errcode = '28000';
  end if;

  select p.id into v_cible from public.profiles p
   where p.username = lower(trim(p_username));

  if v_cible is null then
    raise exception 'Aucun membre avec ce pseudo.' using errcode = 'P0002';
  end if;

  if v_cible = v_me then
    raise exception 'Tu ne peux pas t’ajouter toi-même.' using errcode = 'P0001';
  end if;

  select * into v_existe from public.friendships
   where user_low = least(v_me, v_cible) and user_high = greatest(v_me, v_cible);

  if found then
    if v_existe.status = 'accepted' then
      return 'deja_amis';
    elsif v_existe.status = 'blocked' then
      raise exception 'Demande impossible.' using errcode = 'P0001';
    elsif v_existe.requester_id = v_me then
      return 'deja_envoyee';
    else
      -- L'autre nous avait déjà demandé : on accepte plutôt que de refuser.
      update public.friendships
         set status = 'accepted', responded_at = now()
       where id = v_existe.id;
      return 'acceptee';
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (v_me, v_cible);

  return 'envoyee';
end $$;

-- ------------------------------------------------------------
-- Ouverture d'une conversation privée (créée à la volée si besoin).
-- ------------------------------------------------------------
create or replace function public.get_or_create_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_low  uuid := least(auth.uid(), p_other);
  v_high uuid := greatest(auth.uid(), p_other);
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'Tu dois être connecté.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.friendships
    where user_low = v_low and user_high = v_high and status = 'accepted'
  ) then
    raise exception 'Vous devez être amis pour discuter en privé.' using errcode = 'P0001';
  end if;

  insert into public.dm_conversations (user_low, user_high)
  values (v_low, v_high)
  on conflict (user_low, user_high) do nothing;

  select id into v_id from public.dm_conversations
   where user_low = v_low and user_high = v_high;

  return v_id;
end $$;

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.friendships      enable row level security;
alter table public.dm_conversations enable row level security;
alter table public.direct_messages  enable row level security;

drop policy if exists "on voit ses propres relations"                on public.friendships;
drop policy if exists "on envoie une demande en son nom"             on public.friendships;
drop policy if exists "seul le destinataire répond à une demande"    on public.friendships;
drop policy if exists "chacun peut rompre une relation"              on public.friendships;

create policy "on voit ses propres relations"
  on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));

create policy "on envoie une demande en son nom"
  on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');

create policy "seul le destinataire répond à une demande"
  on public.friendships for update to authenticated
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

create policy "chacun peut rompre une relation"
  on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

drop policy if exists "on voit ses conversations" on public.dm_conversations;
create policy "on voit ses conversations"
  on public.dm_conversations for select to authenticated
  using (auth.uid() in (user_low, user_high));
-- Pas de politique INSERT : les conversations naissent via get_or_create_dm,
-- qui vérifie d'abord que les deux personnes sont bien amies.

drop policy if exists "on lit les messages de ses conversations" on public.direct_messages;
drop policy if exists "on écrit en son nom dans ses conversations" on public.direct_messages;
drop policy if exists "on ne modifie que ses propres messages privés" on public.direct_messages;
drop policy if exists "on supprime ses propres messages privés" on public.direct_messages;

create policy "on lit les messages de ses conversations"
  on public.direct_messages for select to authenticated
  using (public.is_dm_participant(conversation_id));

create policy "on écrit en son nom dans ses conversations"
  on public.direct_messages for insert to authenticated
  with check (author_id = auth.uid() and public.is_dm_participant(conversation_id));

create policy "on ne modifie que ses propres messages privés"
  on public.direct_messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy "on supprime ses propres messages privés"
  on public.direct_messages for delete to authenticated
  using (author_id = auth.uid());

-- ------------------------------------------------------------
-- Visibilité des profils : on ajoute les relations d'amitié aux serveurs
-- partagés, sinon impossible d'afficher qui vous a envoyé une demande.
-- ------------------------------------------------------------
drop policy if exists "profils visibles: soi-même et les membres de mes serveurs" on public.profiles;
drop policy if exists "profils visibles: soi, mes serveurs, mes amis" on public.profiles;

create policy "profils visibles: soi, mes serveurs, mes amis"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.shares_server_with(id)
    or public.is_linked_to(id)
  );

-- ------------------------------------------------------------
-- Privilèges (voir 0002 : la RLS ne s'applique qu'après les GRANT)
-- ------------------------------------------------------------
grant select, insert, update, delete on
  public.friendships,
  public.dm_conversations,
  public.direct_messages
to authenticated;

grant execute on function
  public.is_linked_to(uuid),
  public.is_dm_participant(uuid),
  public.find_profile_by_username(text),
  public.send_friend_request(text),
  public.get_or_create_dm(uuid)
to authenticated;

-- ------------------------------------------------------------
-- Temps réel
-- ------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;
