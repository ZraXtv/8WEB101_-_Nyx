-- ============================================================
-- Paris sportifs en points.
--
-- Chacun reçoit des points gratuits et les mise sur des matchs, à de vraies
-- cotes de bookmakers. Les mêmes points serviront plus tard dans une boutique.
--
-- DEUX RÈGLES QUI TIENNENT TOUTE CETTE MIGRATION
--
--  1. Aucun argent réel. Les points ne s'achètent pas et ne se revendent
--     pas. Le jour où l'on pourrait en acheter avec des euros, ces paris
--     deviendraient des jeux d'argent, interdits sans agrément de l'ANJ.
--     La boutique vendra CONTRE des points, jamais DES points.
--
--  2. Le navigateur ne décide de rien. Il n'écrit dans aucune table de ce
--     fichier : miser, récupérer un bonus, régler un pari passent tous par
--     des fonctions qui vérifient elles-mêmes solde, horaire et résultat.
--     Les cotes et les scores sont récupérés PAR LA BASE, auprès de
--     The Odds API, grâce à pg_net (requêtes HTTP) et pg_cron (planification).
--     Si c'était la page qui annonçait « j'ai gagné », n'importe qui se
--     créditerait un million de points depuis la console.
--
-- AVANT DE L'EXÉCUTER
--
--  a. Activer les extensions pg_net et pg_cron :
--     Dashboard → Database → Extensions (ou Integrations → Cron).
--  b. Créer un compte gratuit sur https://the-odds-api.com et ranger la clé
--     dans le coffre de Supabase, depuis le SQL Editor :
--        select vault.create_secret('TA_CLE', 'odds_api_key');
--     Elle ne quitte ainsi jamais la base : ni le navigateur ni le dépôt.
--
-- À exécuter APRÈS 0012. Rejouable sans risque.
-- ============================================================

do $$
begin
  if to_regnamespace('net') is null then
    raise exception 'Extension pg_net absente : active-la dans Database → Extensions, puis relance.';
  end if;
  if to_regnamespace('cron') is null then
    raise exception 'Extension pg_cron absente : active-la dans Database → Extensions, puis relance.';
  end if;
end $$;

-- ------------------------------------------------------------
-- Schéma privé
--
-- Les fonctions qui créditent des points ou règlent des paris vivent ici.
-- Supabase n'expose par l'API que le schéma `public` : personne ne peut
-- donc les appeler depuis le navigateur, quels que soient ses droits.
-- ------------------------------------------------------------
create schema if not exists paris_prive;
revoke all on schema paris_prive from public;

-- ------------------------------------------------------------
-- Portefeuille et registre des mouvements
--
-- Le solde est rangé dans `wallets` pour être lu et verrouillé vite, mais
-- chaque point qui bouge laisse une ligne dans `point_ledger`. La somme des
-- mouvements d'un compte égale toujours son solde : on sait d'où vient
-- chaque point, et la future boutique ne sera qu'un type de mouvement de
-- plus (« achat »).
-- ------------------------------------------------------------
create table if not exists public.wallets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  -- La contrainte est le dernier rempart : même une fonction boguée ne
  -- pourrait pas faire passer un solde sous zéro.
  balance    integer not null default 0 check (balance >= 0),
  -- Jour (heure de Paris) du dernier bonus quotidien récupéré.
  last_daily date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.point_ledger (
  id            bigint generated always as identity primary key,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  amount        integer not null check (amount <> 0),
  kind          text not null check (kind in (
                  'depart',        -- capital de départ
                  'quotidien',     -- bonus quotidien
                  'filet',         -- complément du filet de sécurité
                  'mise',          -- mise d'un pari (négatif)
                  'gain',          -- pari gagné : mise × cote
                  'remboursement', -- match annulé ou jamais joué
                  'achat',         -- réservé à la future boutique
                  'ajustement'     -- correction manuelle depuis le dashboard
                )),
  bet_id        uuid,
  balance_after integer not null,
  created_at    timestamptz not null default now()
);

create index if not exists point_ledger_profile_idx
  on public.point_ledger (profile_id, created_at desc);

-- ------------------------------------------------------------
-- Championnats proposés
--
-- The Odds API offre 500 crédits par mois. Chaque championnat actif coûte
-- environ 30 crédits de cotes et 30 à 60 de résultats par mois : quatre
-- championnats actifs tiennent dans le budget, pas huit. Les autres sont
-- présents, désactivés ; on les échange depuis le Table Editor.
-- ------------------------------------------------------------
create table if not exists public.bet_leagues (
  sport_key         text primary key,   -- identifiant chez The Odds API
  name              text not null,      -- intitulé affiché
  enabled           boolean not null default false,
  position          integer not null default 0,
  odds_fetched_at   timestamptz,
  scores_fetched_at timestamptz
);

insert into public.bet_leagues (sport_key, name, enabled, position) values
  ('soccer_france_ligue_one',    'Ligue 1',             true,  1),
  ('soccer_uefa_champs_league',  'Ligue des champions', true,  2),
  ('soccer_epl',                 'Premier League',      true,  3),
  ('soccer_spain_la_liga',       'La Liga',             true,  4),
  ('soccer_italy_serie_a',       'Serie A',             false, 5),
  ('soccer_germany_bundesliga',  'Bundesliga',          false, 6),
  ('soccer_uefa_europa_league',  'Ligue Europa',        false, 7),
  ('soccer_france_ligue_two',    'Ligue 2',             false, 8)
-- Rejouer ne doit pas réactiver ce qu'on a désactivé à la main.
on conflict (sport_key) do update set name = excluded.name, position = excluded.position;

-- ------------------------------------------------------------
-- Matchs ouverts aux paris
--
-- Les cotes sont la MOYENNE des bookmakers européens pour le résultat à
-- 90 minutes (1N2). Elles bougent jusqu'au coup d'envoi ; un pari garde la
-- cote du moment où il a été placé.
-- ------------------------------------------------------------
create table if not exists public.bet_events (
  id              text primary key,     -- identifiant chez The Odds API
  sport_key       text not null references public.bet_leagues(sport_key),
  home_team       text not null,
  away_team       text not null,
  commence_time   timestamptz not null,
  odds_home       numeric(6,2) check (odds_home > 1),
  odds_draw       numeric(6,2) check (odds_draw > 1),
  odds_away       numeric(6,2) check (odds_away > 1),
  odds_updated_at timestamptz,
  status          text not null default 'a_venir'
                  check (status in ('a_venir', 'termine', 'annule')),
  home_score      integer,
  away_score      integer,
  result          text check (result in ('home', 'draw', 'away')),
  settled_at      timestamptz
);

create index if not exists bet_events_statut_idx
  on public.bet_events (status, commence_time);

-- ------------------------------------------------------------
-- Paris
-- ------------------------------------------------------------
create table if not exists public.bets (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- restrict : effacer un match ne doit jamais faire disparaître des mises.
  event_id   text not null references public.bet_events(id) on delete restrict,
  pick       text not null check (pick in ('home', 'draw', 'away')),
  stake      integer not null check (stake > 0),
  odds       numeric(6,2) not null check (odds > 1),
  payout     integer,
  status     text not null default 'en_cours'
             check (status in ('en_cours', 'gagne', 'perdu', 'rembourse')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  -- Un pari par match et par personne : plus lisible, et empêche de couvrir
  -- les trois issues pour ne jamais perdre.
  unique (profile_id, event_id)
);

create index if not exists bets_profile_idx on public.bets (profile_id, created_at desc);
create index if not exists bets_event_idx   on public.bets (event_id) where status = 'en_cours';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'point_ledger_bet_fk') then
    alter table public.point_ledger
      add constraint point_ledger_bet_fk foreign key (bet_id)
      references public.bets(id) on delete set null;
  end if;
end $$;

-- ------------------------------------------------------------
-- Journal des appels à The Odds API
--
-- pg_net est asynchrone : on lance la requête, la réponse arrive plus tard
-- dans net._http_response. On note ici ce que chaque requête était censée
-- rapporter, pour savoir quoi faire de sa réponse.
-- ------------------------------------------------------------
create table if not exists paris_prive.requetes (
  request_id   bigint primary key,
  kind         text not null check (kind in ('cotes', 'scores')),
  sport_key    text not null,
  created_at   timestamptz not null default now(),
  processed_at timestamptz,
  outcome      text
);

-- Crédits restants, lus dans les en-têtes de chaque réponse.
create table if not exists paris_prive.quota (
  id         boolean primary key default true check (id),
  remaining  integer,
  used       integer,
  updated_at timestamptz
);

-- ============================================================
-- Fonctions internes (schéma privé, inaccessibles depuis l'API)
-- ============================================================

create or replace function paris_prive.reglage(p_nom text)
returns integer language sql immutable as $$
  select case p_nom
    when 'depart'    then 1000   -- capital de départ
    when 'quotidien' then 50     -- bonus quotidien
    when 'filet'     then 100    -- solde minimum garanti par le bonus
    when 'mise_min'  then 10
  end
$$;

/** Seule porte d'entrée pour faire bouger des points. */
create or replace function paris_prive.mouvement(
  p_profil uuid, p_montant integer, p_type text, p_pari uuid default null
) returns integer language plpgsql as $$
declare
  v_solde integer;
begin
  update public.wallets
     set balance = balance + p_montant, updated_at = now()
   where profile_id = p_profil
  returning balance into v_solde;

  if not found then
    raise exception 'Portefeuille introuvable.' using errcode = 'P0002';
  end if;

  insert into public.point_ledger (profile_id, amount, kind, bet_id, balance_after)
  values (p_profil, p_montant, p_type, p_pari, v_solde);

  return v_solde;
end $$;

/** Crée le portefeuille au premier passage, capital de départ compris. */
create or replace function paris_prive.ouvrir_portefeuille(p_profil uuid)
returns void language plpgsql as $$
begin
  insert into public.wallets (profile_id) values (p_profil)
  on conflict (profile_id) do nothing;

  if found then
    perform paris_prive.mouvement(p_profil, paris_prive.reglage('depart'), 'depart');
  end if;
end $$;

-- Débarrassée des espaces, retours à la ligne et guillemets qu'un copier-coller
-- depuis l'e-mail d'inscription ajoute facilement : The Odds API les compte
-- dans la clé et répond 401 « API key is not valid ».
create or replace function paris_prive.cle_api()
returns text language sql stable as $$
  select nullif(btrim(decrypted_secret, E' \t\r\n"\'<>'), '')
    from vault.decrypted_secrets where name = 'odds_api_key' limit 1
$$;

create or replace function paris_prive.credits_restants()
returns integer language sql stable as $$
  select remaining from paris_prive.quota where id
$$;

/**
 * Demande les cotes de chaque championnat actif : 1 crédit par championnat.
 * Sous 60 crédits restants, on s'abstient : mieux vaut garder de quoi
 * RÉGLER les paris déjà pris que d'en ouvrir de nouveaux.
 */
create or replace function paris_prive.demander_cotes()
returns integer language plpgsql as $$
declare
  v_cle    text := paris_prive.cle_api();
  v_ligue  record;
  v_id     bigint;
  v_nombre integer := 0;
begin
  if v_cle is null then
    raise warning 'Paris : aucune clé odds_api_key dans le coffre, cotes non demandées.';
    return 0;
  end if;
  if coalesce(paris_prive.credits_restants(), 500) < 60 then
    raise warning 'Paris : crédits presque épuisés, cotes non demandées.';
    return 0;
  end if;

  for v_ligue in select sport_key from public.bet_leagues where enabled loop
    v_id := net.http_get(
      url    => format('https://api.the-odds-api.com/v4/sports/%s/odds', v_ligue.sport_key),
      params => jsonb_build_object(
        'apiKey', v_cle, 'regions', 'eu', 'markets', 'h2h',
        'oddsFormat', 'decimal', 'dateFormat', 'iso'),
      timeout_milliseconds => 20000
    );
    insert into paris_prive.requetes (request_id, kind, sport_key)
    values (v_id, 'cotes', v_ligue.sport_key);
    update public.bet_leagues set odds_fetched_at = now() where sport_key = v_ligue.sport_key;
    v_nombre := v_nombre + 1;
  end loop;

  return v_nombre;
end $$;

/**
 * Demande les résultats, mais seulement des championnats qui ont un match
 * probablement terminé et pas encore réglé : 2 crédits par appel.
 * `daysFrom=3` est le maximum de l'API : un match plus ancien ne pourra
 * plus être réglé, d'où le remboursement de `annuler_perimes`.
 */
create or replace function paris_prive.demander_scores()
returns integer language plpgsql as $$
declare
  v_cle    text := paris_prive.cle_api();
  v_ligue  record;
  v_id     bigint;
  v_nombre integer := 0;
begin
  if v_cle is null then
    raise warning 'Paris : aucune clé odds_api_key dans le coffre, résultats non demandés.';
    return 0;
  end if;
  if coalesce(paris_prive.credits_restants(), 500) < 4 then
    raise warning 'Paris : crédits épuisés, résultats non demandés.';
    return 0;
  end if;

  for v_ligue in
    select distinct e.sport_key
      from public.bet_events e
     where e.status = 'a_venir'
       and e.commence_time < now() - interval '2 hours 10 minutes'
       and e.commence_time > now() - interval '3 days'
  loop
    v_id := net.http_get(
      url    => format('https://api.the-odds-api.com/v4/sports/%s/scores', v_ligue.sport_key),
      params => jsonb_build_object('apiKey', v_cle, 'daysFrom', '3', 'dateFormat', 'iso'),
      timeout_milliseconds => 20000
    );
    insert into paris_prive.requetes (request_id, kind, sport_key)
    values (v_id, 'scores', v_ligue.sport_key);
    update public.bet_leagues set scores_fetched_at = now() where sport_key = v_ligue.sport_key;
    v_nombre := v_nombre + 1;
  end loop;

  return v_nombre;
end $$;

/** Intègre une réponse de cotes : ajoute les matchs, rafraîchit les cotes. */
create or replace function paris_prive.integrer_cotes(p_sport text, p_donnees jsonb)
returns integer language plpgsql as $$
declare
  v_match   jsonb;
  v_debut   timestamptz;
  v_dom     numeric;
  v_nul     numeric;
  v_ext     numeric;
  v_nombre  integer := 0;
begin
  for v_match in select * from jsonb_array_elements(p_donnees) loop
    v_debut := (v_match ->> 'commence_time')::timestamptz;

    -- Un match déjà commencé n'est plus ouvert aux paris : inutile de
    -- l'ajouter, ni de toucher à ses cotes.
    continue when v_debut <= now();

    -- Moyenne, sur tous les bookmakers, de chaque issue du marché 1N2.
    select avg((o ->> 'price')::numeric) filter (where o ->> 'name' = v_match ->> 'home_team'),
           avg((o ->> 'price')::numeric) filter (where o ->> 'name' = 'Draw'),
           avg((o ->> 'price')::numeric) filter (where o ->> 'name' = v_match ->> 'away_team')
      into v_dom, v_nul, v_ext
      from jsonb_array_elements(coalesce(v_match -> 'bookmakers', '[]')) b,
           jsonb_array_elements(coalesce(b -> 'markets', '[]')) m,
           jsonb_array_elements(coalesce(m -> 'outcomes', '[]')) o
     where m ->> 'key' = 'h2h';

    -- Sans les trois cotes, on ne propose pas le match.
    continue when v_dom is null or v_nul is null or v_ext is null;

    insert into public.bet_events as e (
      id, sport_key, home_team, away_team, commence_time,
      odds_home, odds_draw, odds_away, odds_updated_at)
    values (
      v_match ->> 'id', p_sport, v_match ->> 'home_team', v_match ->> 'away_team', v_debut,
      greatest(round(v_dom, 2), 1.01), greatest(round(v_nul, 2), 1.01),
      greatest(round(v_ext, 2), 1.01), now())
    on conflict (id) do update set
      -- Un report change l'horaire : on le suit.
      commence_time   = excluded.commence_time,
      odds_home       = excluded.odds_home,
      odds_draw       = excluded.odds_draw,
      odds_away       = excluded.odds_away,
      odds_updated_at = excluded.odds_updated_at
    where e.status = 'a_venir';

    v_nombre := v_nombre + 1;
  end loop;

  return v_nombre;
end $$;

/** Paie les gagnants d'un match terminé. */
create or replace function paris_prive.regler(p_match text)
returns void language plpgsql as $$
declare
  v_resultat text;
  v_pari     public.bets%rowtype;
  v_gain     integer;
begin
  select result into v_resultat from public.bet_events
   where id = p_match and status = 'termine' and settled_at is null
   for update;
  if not found then return; end if;

  for v_pari in
    select * from public.bets where event_id = p_match and status = 'en_cours' for update
  loop
    if v_pari.pick = v_resultat then
      -- Le gain inclut la mise : 100 points à 2,50 rapportent 250.
      v_gain := floor(v_pari.stake * v_pari.odds)::integer;
      perform paris_prive.mouvement(v_pari.profile_id, v_gain, 'gain', v_pari.id);
      update public.bets set status = 'gagne', payout = v_gain, settled_at = now()
       where id = v_pari.id;
    else
      update public.bets set status = 'perdu', payout = 0, settled_at = now()
       where id = v_pari.id;
    end if;
  end loop;

  update public.bet_events set settled_at = now() where id = p_match;
end $$;

/** Intègre une réponse de résultats et règle les matchs terminés. */
create or replace function paris_prive.integrer_scores(p_donnees jsonb)
returns integer language plpgsql as $$
declare
  v_match  jsonb;
  v_ligne  public.bet_events%rowtype;
  v_dom    integer;
  v_ext    integer;
  v_nombre integer := 0;
begin
  for v_match in select * from jsonb_array_elements(p_donnees) loop
    continue when coalesce((v_match ->> 'completed')::boolean, false) is false;

    select * into v_ligne from public.bet_events
     where id = v_match ->> 'id' and status = 'a_venir';
    continue when not found;

    select (s ->> 'score')::integer into v_dom
      from jsonb_array_elements(coalesce(v_match -> 'scores', '[]')) s
     where s ->> 'name' = v_ligne.home_team;
    select (s ->> 'score')::integer into v_ext
      from jsonb_array_elements(coalesce(v_match -> 'scores', '[]')) s
     where s ->> 'name' = v_ligne.away_team;

    -- Score incomplet : on attend le prochain passage plutôt que de deviner.
    continue when v_dom is null or v_ext is null;

    update public.bet_events set
      status     = 'termine',
      home_score = v_dom,
      away_score = v_ext,
      result     = case when v_dom > v_ext then 'home'
                        when v_dom < v_ext then 'away'
                        else 'draw' end
    where id = v_ligne.id;

    perform paris_prive.regler(v_ligne.id);
    v_nombre := v_nombre + 1;
  end loop;

  return v_nombre;
end $$;

/**
 * Traite les réponses arrivées. Chaque réponse est isolée : une réponse
 * illisible est notée comme telle, sans bloquer les suivantes.
 */
create or replace function paris_prive.traiter_reponses()
returns integer language plpgsql as $$
declare
  v_req    record;
  v_reste  text;
  v_utilise text;
  v_nombre integer := 0;
begin
  for v_req in
    select q.request_id, q.kind, q.sport_key,
           r.status_code, r.headers, r.content, r.timed_out, r.error_msg
      from paris_prive.requetes q
      join net._http_response r on r.id = q.request_id
     where q.processed_at is null
     order by q.request_id
  loop
    begin
      v_reste   := coalesce(v_req.headers ->> 'x-requests-remaining', v_req.headers ->> 'X-Requests-Remaining');
      v_utilise := coalesce(v_req.headers ->> 'x-requests-used',      v_req.headers ->> 'X-Requests-Used');
      if v_reste is not null then
        insert into paris_prive.quota (id, remaining, used, updated_at)
        values (true, v_reste::numeric::integer, v_utilise::numeric::integer, now())
        on conflict (id) do update set
          remaining = excluded.remaining, used = excluded.used, updated_at = excluded.updated_at;
      end if;

      if coalesce(v_req.timed_out, false) or v_req.status_code is distinct from 200 then
        update paris_prive.requetes
           set processed_at = now(),
               outcome = format('erreur %s %s', coalesce(v_req.status_code::text, ''),
                                coalesce(v_req.error_msg, left(v_req.content, 200), ''))
         where request_id = v_req.request_id;
      elsif v_req.kind = 'cotes' then
        update paris_prive.requetes
           set processed_at = now(),
               outcome = format('%s matchs', paris_prive.integrer_cotes(v_req.sport_key, v_req.content::jsonb))
         where request_id = v_req.request_id;
      else
        update paris_prive.requetes
           set processed_at = now(),
               outcome = format('%s matchs réglés', paris_prive.integrer_scores(v_req.content::jsonb))
         where request_id = v_req.request_id;
      end if;
    exception when others then
      update paris_prive.requetes
         set processed_at = now(), outcome = 'illisible : ' || sqlerrm
       where request_id = v_req.request_id;
    end;
    v_nombre := v_nombre + 1;
  end loop;

  -- pg_net ne garde ses réponses que six heures : une requête restée sans
  -- réponse au-delà d'une heure ne sera jamais traitée.
  update paris_prive.requetes set processed_at = now(), outcome = 'sans réponse'
   where processed_at is null and created_at < now() - interval '1 hour';

  return v_nombre;
end $$;

/**
 * Rembourse les paris des matchs jamais réglés : reportés, annulés, ou dont
 * le résultat n'a pas pu être lu dans les trois jours que permet l'API.
 */
create or replace function paris_prive.annuler_perimes()
returns integer language plpgsql as $$
declare
  v_match  record;
  v_pari   public.bets%rowtype;
  v_nombre integer := 0;
begin
  for v_match in
    select id from public.bet_events
     where status = 'a_venir' and commence_time < now() - interval '3 days 6 hours'
     for update
  loop
    for v_pari in
      select * from public.bets where event_id = v_match.id and status = 'en_cours' for update
    loop
      perform paris_prive.mouvement(v_pari.profile_id, v_pari.stake, 'remboursement', v_pari.id);
      update public.bets set status = 'rembourse', payout = v_pari.stake, settled_at = now()
       where id = v_pari.id;
    end loop;
    update public.bet_events set status = 'annule', settled_at = now() where id = v_match.id;
    v_nombre := v_nombre + 1;
  end loop;
  return v_nombre;
end $$;

revoke all on all functions in schema paris_prive from public;

-- ============================================================
-- Fonctions publiques (appelées depuis le navigateur)
-- ============================================================

/** Solde et état du bonus. Ouvre le portefeuille au premier appel. */
create or replace function public.mon_portefeuille()
returns table (solde integer, bonus_disponible boolean, bonus integer, filet integer, mise_min integer)
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Tu dois être connecté.' using errcode = '28000';
  end if;

  perform paris_prive.ouvrir_portefeuille(v_me);

  return query
    select w.balance,
           w.last_daily is distinct from (now() at time zone 'Europe/Paris')::date,
           paris_prive.reglage('quotidien'),
           paris_prive.reglage('filet'),
           paris_prive.reglage('mise_min')
      from public.wallets w
     where w.profile_id = v_me;
end $$;

/**
 * Bonus quotidien, une fois par jour (heure de Paris). Si le solde reste
 * sous le filet de sécurité, le bonus le complète jusqu'au filet : un
 * compte ruiné peut toujours rejouer le lendemain.
 */
create or replace function public.reclamer_bonus()
returns table (solde integer, gagne integer)
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_jour   date := (now() at time zone 'Europe/Paris')::date;
  v_wallet public.wallets%rowtype;
  v_solde  integer;
  v_filet  integer;
begin
  if v_me is null then
    raise exception 'Tu dois être connecté.' using errcode = '28000';
  end if;

  perform paris_prive.ouvrir_portefeuille(v_me);

  -- Verrou : deux clics simultanés ne doivent pas encaisser deux bonus.
  select * into v_wallet from public.wallets where profile_id = v_me for update;

  if v_wallet.last_daily = v_jour then
    raise exception 'Bonus déjà récupéré aujourd’hui. Reviens demain !' using errcode = 'P0001';
  end if;

  v_solde := paris_prive.mouvement(v_me, paris_prive.reglage('quotidien'), 'quotidien');

  v_filet := paris_prive.reglage('filet') - v_solde;
  if v_filet > 0 then
    v_solde := paris_prive.mouvement(v_me, v_filet, 'filet');
  end if;

  update public.wallets set last_daily = v_jour where profile_id = v_me;

  return query select v_solde, v_solde - v_wallet.balance;
end $$;

/**
 * Place un pari.
 *
 * `p_cote` est la cote que la personne a VUE. Les cotes bougent jusqu'au
 * coup d'envoi : si elle a changé entre-temps, on refuse plutôt que de
 * miser à une cote qu'on n'a pas acceptée. Le navigateur reconnaît ce cas
 * au `hint` « cote_modifiee » et rafraîchit l'affichage.
 */
create or replace function public.parier(
  p_match text, p_choix text, p_mise integer, p_cote numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_match  public.bet_events%rowtype;
  v_cote   numeric;
  v_solde  integer;
  v_pari   uuid;
begin
  if v_me is null then
    raise exception 'Tu dois être connecté.' using errcode = '28000';
  end if;

  if p_choix not in ('home', 'draw', 'away') then
    raise exception 'Choix invalide.' using errcode = 'P0001';
  end if;
  if p_mise is null or p_mise < paris_prive.reglage('mise_min') then
    raise exception 'La mise minimale est de % points.', paris_prive.reglage('mise_min')
      using errcode = 'P0001';
  end if;

  select * into v_match from public.bet_events where id = p_match for share;
  if not found then
    raise exception 'Match introuvable.' using errcode = 'P0002';
  end if;
  -- L'heure qui compte est celle de la base, pas celle du navigateur.
  if v_match.status <> 'a_venir' or v_match.commence_time <= now() then
    raise exception 'Les paris sont fermés : le match a commencé.' using errcode = 'P0001';
  end if;

  v_cote := case p_choix when 'home' then v_match.odds_home
                         when 'draw' then v_match.odds_draw
                         else v_match.odds_away end;
  if v_cote is null then
    raise exception 'Pas de cote pour ce choix.' using errcode = 'P0001';
  end if;
  if p_cote is null or abs(v_cote - p_cote) >= 0.005 then
    raise exception 'La cote vient de changer : elle est maintenant de %.', replace(v_cote::text, '.', ',')
      using errcode = 'P0001', hint = 'cote_modifiee';
  end if;

  perform paris_prive.ouvrir_portefeuille(v_me);

  -- Verrou sur le portefeuille : deux paris envoyés en même temps ne
  -- peuvent pas dépenser deux fois le même solde.
  select balance into v_solde from public.wallets where profile_id = v_me for update;
  if v_solde < p_mise then
    raise exception 'Solde insuffisant : il te reste % points.', v_solde using errcode = 'P0001';
  end if;

  begin
    insert into public.bets (profile_id, event_id, pick, stake, odds)
    values (v_me, p_match, p_choix, p_mise, v_cote)
    returning id into v_pari;
  exception when unique_violation then
    raise exception 'Tu as déjà parié sur ce match.' using errcode = 'P0001';
  end;

  perform paris_prive.mouvement(v_me, -p_mise, 'mise', v_pari);
  return v_pari;
end $$;

/** Classement général par solde. */
create or replace function public.classement_points(p_limite integer default 20)
returns table (rang bigint, profile_id uuid, display_name text, username text,
               avatar_url text, solde integer)
language sql security definer stable set search_path = public as $$
  select rank() over (order by w.balance desc),
         p.id, p.display_name, p.username, p.avatar_url, w.balance
    from public.wallets w
    join public.profiles p on p.id = w.profile_id
   where auth.uid() is not null
   order by w.balance desc, p.display_name
   limit least(greatest(coalesce(p_limite, 20), 1), 100)
$$;

-- ------------------------------------------------------------
-- Politiques : lecture seule, et seulement de ce qui nous concerne.
-- ------------------------------------------------------------
alter table public.wallets      enable row level security;
alter table public.point_ledger enable row level security;
alter table public.bet_leagues  enable row level security;
alter table public.bet_events   enable row level security;
alter table public.bets         enable row level security;

drop policy if exists "on lit son portefeuille"     on public.wallets;
drop policy if exists "on lit ses mouvements"       on public.point_ledger;
drop policy if exists "championnats lisibles"       on public.bet_leagues;
drop policy if exists "matchs lisibles"             on public.bet_events;
drop policy if exists "on lit ses paris"            on public.bets;

create policy "on lit son portefeuille" on public.wallets
  for select to authenticated using (profile_id = auth.uid());
create policy "on lit ses mouvements" on public.point_ledger
  for select to authenticated using (profile_id = auth.uid());
create policy "championnats lisibles" on public.bet_leagues
  for select to authenticated using (true);
create policy "matchs lisibles" on public.bet_events
  for select to authenticated using (true);
create policy "on lit ses paris" on public.bets
  for select to authenticated using (profile_id = auth.uid());

-- ------------------------------------------------------------
-- Privilèges
--
-- SELECT seulement : aucune écriture directe, pour personne. Tout passe par
-- les fonctions ci-dessus. Et les fonctions ne sont accordées qu'aux
-- comptes connectés : Postgres les ouvre à PUBLIC par défaut.
-- ------------------------------------------------------------
revoke all on public.wallets, public.point_ledger, public.bet_leagues,
              public.bet_events, public.bets from anon, authenticated;
grant select on public.wallets, public.point_ledger, public.bet_leagues,
                public.bet_events, public.bets to authenticated;

revoke all on function public.mon_portefeuille()                          from public, anon;
revoke all on function public.reclamer_bonus()                            from public, anon;
revoke all on function public.parier(text, text, integer, numeric)        from public, anon;
revoke all on function public.classement_points(integer)                  from public, anon;
grant execute on function public.mon_portefeuille()                       to authenticated;
grant execute on function public.reclamer_bonus()                         to authenticated;
grant execute on function public.parier(text, text, integer, numeric)     to authenticated;
grant execute on function public.classement_points(integer)               to authenticated;

-- ------------------------------------------------------------
-- Temps réel : le solde et les paris se mettent à jour d'eux-mêmes au
-- règlement. La RLS s'applique aussi au temps réel : chacun ne reçoit que
-- ses propres lignes.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'wallets') then
    alter publication supabase_realtime add table public.wallets;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'bets') then
    alter publication supabase_realtime add table public.bets;
  end if;
end $$;

-- ------------------------------------------------------------
-- Planification (heures UTC)
--
--   06:00          cotes des championnats actifs (1 crédit chacun)
--   17:30, 22:30   résultats, seulement s'il y a des matchs à régler
--                  (19:30 et 00:30 à Paris l'été, 18:30 et 23:30 l'hiver)
--   toutes les 5 min  lecture des réponses reçues (gratuit)
--   04:00          remboursement des matchs jamais réglés
--
-- `cron.schedule` remplace un job du même nom : rejouer ne crée pas de
-- doublon. Pour tout arrêter : select cron.unschedule('nyx-paris-cotes'); etc.
-- ------------------------------------------------------------
select cron.schedule('nyx-paris-cotes',      '0 6 * * *',      'select paris_prive.demander_cotes()');
select cron.schedule('nyx-paris-scores',     '30 17,22 * * *', 'select paris_prive.demander_scores()');
select cron.schedule('nyx-paris-traitement', '*/5 * * * *',    'select paris_prive.traiter_reponses()');
select cron.schedule('nyx-paris-menage',     '0 4 * * *',      'select paris_prive.annuler_perimes()');

-- ============================================================
-- Premier remplissage, sans attendre 6 h du matin :
--     select paris_prive.demander_cotes();
-- Les matchs apparaissent au plus tard cinq minutes après.
--
-- Pour surveiller :
--     select * from paris_prive.requetes order by created_at desc limit 20;
--     select * from paris_prive.quota;
-- ============================================================
