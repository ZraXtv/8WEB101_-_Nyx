-- ============================================================
-- 0015_lobby_securise.sql
-- Le Lobby Général, protégé par la base et non plus par l'interface.
--
-- 0014 reconnaissait le Lobby à son NOM. Or n'importe qui peut appeler son
-- propre serveur « Lobby Général ». Deux effets, reproduits sur une base de
-- test avant d'écrire cette migration :
--   - un serveur imitateur finissait par recevoir les nouveaux inscrits, et
--     son propriétaire voyait leur profil et leur présence ;
--   - renommer le vrai Lobby faisait créer, à l'inscription suivante, un
--     second Lobby vide dont le nouvel inscrit devenait propriétaire.
-- Et les protections n'existaient que dans l'interface : depuis l'API, le
-- propriétaire pouvait renommer ou supprimer le Lobby (et tous ses messages).
--
-- Ce que fait cette migration :
--   1. retire les restes de l'ancienne tentative (0013_lobby.sql de la
--      version Next), qui permettaient de publier de faux messages système ;
--   2. désigne le Lobby par une colonne `is_lobby`, un seul possible ;
--   3. le crée s'il n'existe pas encore (0014 non exécutée) ;
--   4. empêche, depuis l'API, de le renommer, le supprimer, le rendre privé
--      ou d'usurper son nom ;
--   5. fait rejoindre le Lobby aux nouveaux inscrits d'après `is_lobby` ;
--   6. corrige la règle « on rejoint soi-même un serveur public » (0001),
--      qui ne vérifiait pas le RÔLE : depuis l'API, on pouvait entrer dans
--      un serveur public comme administrateur, voire propriétaire. Sans
--      danger tant qu'aucun serveur n'était public ; le Lobby l'est.
--
-- On peut QUITTER le Lobby et le REJOINDRE : y être, c'est rendre son profil
-- et sa présence visibles de tous les comptes. Ce doit rester un choix.
--
-- À exécuter APRÈS 0013 (et après 0014 si elle a été exécutée : elle n'est
-- pas nécessaire). Rejouable sans risque : relancée, elle ne réinscrit pas
-- ceux qui ont quitté le Lobby.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Restes de l'ancienne tentative (version Next, 0013_lobby.sql)
--
-- Ses règles d'écriture ne reprenaient pas la vérification `kind = 'user'`
-- de 0010 : un compte pouvait publier dans son salon un faux message
-- « système ». Sans effet si elle n'a jamais été exécutée.
-- ------------------------------------------------------------
drop policy if exists "Lecture des messages du lobby par tous" on public.messages;
drop policy if exists "Écriture dans le lobby pour tous"       on public.messages;
drop policy if exists "Écriture anonyme dans le lobby"          on public.messages;
alter table public.messages drop constraint if exists check_author_or_guest;

do $$
begin
  -- Colonnes d'invité : supprimées seulement si aucune ligne ne s'en sert.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'messages' and column_name = 'guest_id') then
    if not exists (select 1 from public.messages where guest_id is not null or guest_name is not null) then
      alter table public.messages drop column guest_name, drop column guest_id;
    else
      raise notice 'Lobby : des messages d’invités existent, colonnes guest_* conservées.';
    end if;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Un seul Lobby, désigné par une colonne
-- ------------------------------------------------------------
alter table public.servers add column if not exists is_lobby boolean not null default false;

-- Deux lignes `is_lobby = true` sont impossibles.
create unique index if not exists servers_un_seul_lobby on public.servers (is_lobby) where is_lobby;

-- ------------------------------------------------------------
-- 3. Désigner le Lobby existant, ou le créer
-- ------------------------------------------------------------
do $$
declare
  v_lobby     uuid;
  v_ancien    uuid := (select id from public.profiles order by created_at limit 1);
  v_imitateurs integer;
begin
  -- Déjà désigné (migration relancée) : on ne touche plus aux membres, pour
  -- ne pas réinscrire ceux qui sont partis.
  if exists (select 1 from public.servers where is_lobby) then
    return;
  end if;

  if v_ancien is null then
    -- Base sans aucun compte : le premier inscrit créera le Lobby.
    return;
  end if;

  -- Le vrai Lobby est celui qu'a créé 0014 : PUBLIC et appartenant au compte
  -- le plus ancien — même s'il a été renommé depuis, d'où ce critère avant
  -- le nom. À défaut, un serveur nommé « Lobby Général » : le plus peuplé,
  -- puis le plus ancien.
  select s.id into v_lobby
    from public.servers s
   where (s.is_public and s.owner_id = v_ancien) or s.name = 'Lobby Général'
   order by (s.is_public and s.owner_id = v_ancien) desc,
            (select count(*) from public.server_members m where m.server_id = s.id) desc,
            s.created_at
   limit 1;

  if v_lobby is null then
    -- 0014 jamais exécutée : on crée le Lobby. Le déclencheur
    -- handle_new_server inscrit le propriétaire et ouvre #general.
    insert into public.servers (name, description, is_public, owner_id)
    values ('Lobby Général', 'Salon public accessible à tous les membres.', true, v_ancien)
    returning id into v_lobby;
  end if;

  -- Les imitateurs sont renommés : ils ne peuvent plus se faire passer pour
  -- le Lobby, ni aux yeux des membres ni pour le déclencheur d'inscription.
  update public.servers set name = 'Ancien lobby'
   where name = 'Lobby Général' and id <> v_lobby;
  get diagnostics v_imitateurs = row_count;
  if v_imitateurs > 0 then
    raise notice 'Lobby : % serveur(s) imitateur(s) renommé(s) « Ancien lobby ».', v_imitateurs;
  end if;

  -- Le vrai reprend son nom s'il avait été renommé.
  update public.servers set is_lobby = true, is_public = true, name = 'Lobby Général'
   where id = v_lobby;

  -- Première désignation : tous les comptes existants y entrent, y compris
  -- ceux qu'un imitateur ou un renommage avait envoyés ailleurs.
  insert into public.server_members (server_id, profile_id, role)
  select v_lobby, p.id, 'member' from public.profiles p
  on conflict do nothing;
end $$;

-- ------------------------------------------------------------
-- 4. Protection
--
-- Refusé depuis l'API (toute requête d'un compte connecté) : renommer le
-- Lobby, le supprimer, le rendre privé, changer son propriétaire, désigner
-- un autre serveur comme Lobby, ou donner le nom « Lobby Général » à un
-- autre serveur.
--
-- Autorisé sans compte connecté : le SQL Editor du dashboard, les
-- migrations, et le déclencheur d'inscription. C'est là que le Lobby se
-- gère, volontairement.
-- ------------------------------------------------------------
create or replace function public.proteger_lobby()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.is_lobby then
      raise exception 'Le Lobby ne peut pas être supprimé.' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.is_lobby and (
       new.name     is distinct from old.name
    or new.is_public is distinct from old.is_public
    or new.owner_id is distinct from old.owner_id
    or new.is_lobby is distinct from old.is_lobby) then
    raise exception 'Le Lobby ne peut être ni renommé, ni rendu privé, ni transféré.' using errcode = '42501';
  end if;

  if new.is_lobby and (tg_op = 'INSERT' or not old.is_lobby) then
    raise exception 'Seul le Lobby Général est un lobby.' using errcode = '42501';
  end if;

  if not new.is_lobby and lower(btrim(new.name)) = lower('Lobby Général') then
    raise exception 'Ce nom est réservé au Lobby.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_lobby on public.servers;
create trigger proteger_lobby
  before insert or update or delete on public.servers
  for each row execute function public.proteger_lobby();

-- ------------------------------------------------------------
-- 5. Inscription : rejoindre le Lobby, reconnu par `is_lobby`
--
-- La création du profil est celle de 0001, inchangée.
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
    -- Tout premier compte de la base : il fonde le Lobby.
    begin
      insert into public.servers (name, description, is_public, is_lobby, owner_id)
      values ('Lobby Général', 'Salon public accessible à tous les membres.', true, true, new.id);
    exception when unique_violation then
      -- Deux tout premiers comptes au même instant : l'autre l'a fondé.
      insert into public.server_members (server_id, profile_id, role)
      select id, new.id, 'member' from public.servers where is_lobby
      on conflict do nothing;
    end;
  else
    insert into public.server_members (server_id, profile_id, role)
    values (v_lobby, new.id, 'member')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 6. Rejoindre un serveur public : comme simple membre, et rien d'autre
-- ------------------------------------------------------------
drop policy if exists "on rejoint soi-même un serveur public" on public.server_members;

create policy "on rejoint soi-même un serveur public"
  on public.server_members for insert to authenticated
  with check (
    profile_id = auth.uid()
    and role = 'member'
    and exists (select 1 from public.servers s where s.id = server_id and s.is_public)
  );

-- Un rôle « propriétaire » n'est légitime que pour le propriétaire inscrit
-- dans `servers.owner_id`. Toute autre ligne `owner` n'a pu venir que de la
-- faille ci-dessus : elle redevient `member`.
do $$
declare v_n integer;
begin
  update public.server_members m set role = 'member'
    from public.servers s
   where s.id = m.server_id and m.role = 'owner' and m.profile_id <> s.owner_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    raise notice 'Lobby : % rôle(s) « propriétaire » illégitime(s) ramené(s) à « membre ».', v_n;
  end if;
end $$;

-- ============================================================
-- Pour vérifier :
--   select id, name, is_public, owner_id from public.servers where is_lobby;
--   select count(*) from public.server_members m
--     join public.servers s on s.id = m.server_id where s.is_lobby;
-- ============================================================
