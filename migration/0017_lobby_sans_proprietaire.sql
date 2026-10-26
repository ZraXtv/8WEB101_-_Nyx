-- ============================================================
-- 0017_lobby_sans_proprietaire.sql
-- Le Lobby devient un salon commun, qui n'appartient à personne.
--
-- Jusqu'ici, c'était un serveur ordinaire dont le compte le plus ancien était
-- propriétaire : ce compte avait des droits sur tous les autres (exclure,
-- nommer des administrateurs, modérer). Le Lobby est pensé comme un salon
-- unique et commun : il n'a plus de propriétaire, chacun y est simple membre,
-- et il ne compte qu'un salon, #lobby.
--
-- Sans propriétaire, personne ne peut, depuis l'application ou l'API :
--   - attribuer des rôles : set_member_role (0007) refuse un serveur sans
--     propriétaire (« Serveur introuvable ») ;
--   - créer, renommer ou supprimer un salon, modifier le serveur, exclure
--     quelqu'un ou supprimer le message d'un autre : ces règles exigent le
--     rôle owner ou admin, que plus personne n'a ;
--   - supprimer le serveur : la règle compare owner_id à soi-même, ce qui ne
--     correspond jamais à un propriétaire vide (et proteger_lobby, 0015,
--     le refuse de toute façon).
-- Le Lobby s'administre désormais depuis le dashboard Supabase.
--
-- Effet de bord bienvenu : supprimer le compte le plus ancien ne supprime
-- plus le Lobby et tous ses messages (owner_id était « on delete cascade »).
--
-- À exécuter APRÈS 0015 (et 0016). Rejouable sans risque.
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'servers' and column_name = 'is_lobby') then
    raise exception 'Exécute d''abord 0015_lobby_securise.sql.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Un serveur peut n'avoir aucun propriétaire — mais seulement le Lobby
-- ------------------------------------------------------------
alter table public.servers alter column owner_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'servers_proprietaire_sauf_lobby') then
    alter table public.servers
      add constraint servers_proprietaire_sauf_lobby check (owner_id is not null or is_lobby);
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Création d'un serveur : le propriétaire n'est inscrit que s'il existe,
--    et le Lobby ouvre #lobby plutôt que #general.
-- ------------------------------------------------------------
create or replace function public.handle_new_server()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not null then
    insert into public.server_members (server_id, profile_id, role)
    values (new.id, new.owner_id, 'owner');
  end if;

  insert into public.channels (server_id, name, topic, position)
  values (new.id,
          case when new.is_lobby then 'lobby' else 'general' end,
          case when new.is_lobby then 'Le salon commun de Nyx' else 'Salon par défaut' end,
          0);

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. Le Lobby existant : plus de propriétaire, chacun simple membre,
--    un seul salon nommé #lobby.
-- ------------------------------------------------------------
do $$
declare
  v_lobby uuid := (select id from public.servers where is_lobby);
begin
  if v_lobby is null then
    return;   -- pas encore de Lobby : le premier inscrit le créera (ci-dessous)
  end if;

  update public.servers set owner_id = null, description = 'Le salon commun de Nyx.'
   where id = v_lobby;

  update public.server_members set role = 'member'
   where server_id = v_lobby and role <> 'member';

  -- Le salon créé par 0014/0015 s'appelait #general.
  update public.channels set name = 'lobby', topic = 'Le salon commun de Nyx'
   where server_id = v_lobby and name = 'general'
     and not exists (select 1 from public.channels where server_id = v_lobby and name = 'lobby');
end $$;

-- ------------------------------------------------------------
-- 4. Inscription : le tout premier compte fonde un Lobby sans propriétaire,
--    puis y entre comme les autres. (Reprend 0015 ; seule la création change.)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lobby uuid;
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

  select id into v_lobby from public.servers where is_lobby;

  if v_lobby is null then
    begin
      insert into public.servers (name, description, is_public, is_lobby, owner_id)
      values ('Lobby Général', 'Le salon commun de Nyx.', true, true, null)
      returning id into v_lobby;
    exception when unique_violation then
      -- Deux tout premiers comptes au même instant : l'autre l'a fondé.
      select id into v_lobby from public.servers where is_lobby;
    end;
  end if;

  insert into public.server_members (server_id, profile_id, role)
  values (v_lobby, new.id, 'member')
  on conflict do nothing;

  return new;
end;
$$;

-- ============================================================
-- Pour vérifier :
--   select name, owner_id, is_public from public.servers where is_lobby;
--   select role, count(*) from public.server_members m
--     join public.servers s on s.id = m.server_id where s.is_lobby group by role;
--   select name from public.channels c
--     join public.servers s on s.id = c.server_id where s.is_lobby;
-- ============================================================
