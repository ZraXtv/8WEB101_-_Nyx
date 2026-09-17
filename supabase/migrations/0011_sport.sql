-- ============================================================
-- Suivi sportif : catalogue de sports et d'équipes, et les équipes
-- que chacun choisit de suivre.
--
-- Première brique de l'idée « suivi de sport » : on pose ici de quoi
-- choisir ses équipes. Les scores et les paris entre amis viendront
-- s'appuyer dessus et ne sont pas dans cette migration.
--
-- À exécuter APRÈS 0010. Rejouable sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- Catalogue
--
-- Les identifiants sont des slugs lisibles ('foot-psg') et non des uuid :
-- le catalogue est alimenté par cette migration, pas par les utilisateurs,
-- et un slug stable permet de la rejouer sans créer de doublons.
-- ------------------------------------------------------------
create table if not exists public.sports (
  id       text primary key,
  name     text not null,
  emoji    text not null default '',
  position integer not null default 0
);

create table if not exists public.teams (
  id         text primary key,
  sport_id   text not null references public.sports(id) on delete cascade,
  name       text not null,
  -- Abréviation usuelle ('PSG', 'LAL'), utilisée quand la place manque.
  short_name text not null,
  -- Championnat ou « Sélections » pour les équipes nationales.
  league     text not null,
  -- Code ISO 3166-1 alpha-2, pour un futur affichage de drapeau.
  country    text not null default 'FR'
);

create index if not exists teams_sport_idx on public.teams (sport_id, league, name);

-- ------------------------------------------------------------
-- Ce que chacun suit
-- ------------------------------------------------------------
create table if not exists public.team_follows (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team_id    text not null references public.teams(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, team_id)
);

create index if not exists team_follows_profile_idx on public.team_follows (profile_id);

-- ------------------------------------------------------------
-- Politiques
-- ------------------------------------------------------------
alter table public.sports       enable row level security;
alter table public.teams        enable row level security;
alter table public.team_follows enable row level security;

-- Le catalogue est le même pour tout le monde : lisible par tout compte
-- connecté, modifiable par personne (voir les privilèges plus bas).
drop policy if exists "catalogue des sports lisible"  on public.sports;
drop policy if exists "catalogue des equipes lisible" on public.teams;

create policy "catalogue des sports lisible"
  on public.sports for select to authenticated using (true);

create policy "catalogue des equipes lisible"
  on public.teams for select to authenticated using (true);

-- Les suivis sont privés : personne ne voit les équipes de quelqu'un d'autre.
-- Les paris entre amis, plus tard, exposeront ce qu'il faut par une fonction
-- dédiée plutôt qu'en ouvrant la table.
drop policy if exists "on lit ses propres suivis"          on public.team_follows;
drop policy if exists "on suit une equipe pour soi"        on public.team_follows;
drop policy if exists "on ne retire que ses propres suivis" on public.team_follows;

create policy "on lit ses propres suivis"
  on public.team_follows for select to authenticated
  using (profile_id = auth.uid());

create policy "on suit une equipe pour soi"
  on public.team_follows for insert to authenticated
  with check (profile_id = auth.uid());

create policy "on ne retire que ses propres suivis"
  on public.team_follows for delete to authenticated
  using (profile_id = auth.uid());

-- ------------------------------------------------------------
-- Privilèges
--
-- Rappel de 0002 : Postgres vérifie les GRANT avant la RLS. Le catalogue
-- n'est donc accordé qu'en lecture, et `team_follows` sans UPDATE : suivre
-- ou ne plus suivre, c'est ajouter ou retirer une ligne, jamais la modifier.
-- ------------------------------------------------------------
grant select on public.sports, public.teams to authenticated;
grant select, insert, delete on public.team_follows to authenticated;

-- ============================================================
-- Garnissage du catalogue
--
-- Effectifs de la saison 2025-2026. Les montées et descentes changent la
-- donne chaque année : ce sont de simples lignes, à corriger ici puis à
-- rejouer, ou directement dans la table depuis le dashboard Supabase.
-- ============================================================
insert into public.sports (id, name, emoji, position) values
  ('football', 'Football', '⚽', 1),
  ('basket',   'Basket',   '🏀', 2),
  ('rugby',    'Rugby',    '🏉', 3)
on conflict (id) do update set
  name     = excluded.name,
  emoji    = excluded.emoji,
  position = excluded.position;

insert into public.teams (id, sport_id, name, short_name, league, country) values
  -- Football — Ligue 1
  ('foot-psg',        'football', 'Paris Saint-Germain',   'PSG',  'Ligue 1', 'FR'),
  ('foot-om',         'football', 'Olympique de Marseille','OM',   'Ligue 1', 'FR'),
  ('foot-asm',        'football', 'AS Monaco',             'ASM',  'Ligue 1', 'MC'),
  ('foot-losc',       'football', 'LOSC Lille',            'LOSC', 'Ligue 1', 'FR'),
  ('foot-ogcn',       'football', 'OGC Nice',              'OGCN', 'Ligue 1', 'FR'),
  ('foot-ol',         'football', 'Olympique Lyonnais',    'OL',   'Ligue 1', 'FR'),
  ('foot-rcl',        'football', 'RC Lens',               'RCL',  'Ligue 1', 'FR'),
  ('foot-srfc',       'football', 'Stade Rennais',         'SRFC', 'Ligue 1', 'FR'),
  ('foot-rcsa',       'football', 'RC Strasbourg',         'RCSA', 'Ligue 1', 'FR'),
  ('foot-tfc',        'football', 'Toulouse FC',           'TFC',  'Ligue 1', 'FR'),
  ('foot-sb29',       'football', 'Stade Brestois',        'SB29', 'Ligue 1', 'FR'),
  ('foot-aja',        'football', 'AJ Auxerre',            'AJA',  'Ligue 1', 'FR'),
  ('foot-sco',        'football', 'Angers SCO',            'SCO',  'Ligue 1', 'FR'),
  ('foot-fcn',        'football', 'FC Nantes',             'FCN',  'Ligue 1', 'FR'),
  ('foot-hac',        'football', 'Le Havre AC',           'HAC',  'Ligue 1', 'FR'),
  ('foot-fcm',        'football', 'FC Metz',               'FCM',  'Ligue 1', 'FR'),
  ('foot-fcl',        'football', 'FC Lorient',            'FCL',  'Ligue 1', 'FR'),
  ('foot-pfc',        'football', 'Paris FC',              'PFC',  'Ligue 1', 'FR'),
  -- Football — sélections
  ('foot-sel-fr',     'football', 'France',        'FRA', 'Sélections', 'FR'),
  ('foot-sel-be',     'football', 'Belgique',      'BEL', 'Sélections', 'BE'),
  ('foot-sel-pt',     'football', 'Portugal',      'POR', 'Sélections', 'PT'),
  ('foot-sel-es',     'football', 'Espagne',       'ESP', 'Sélections', 'ES'),
  ('foot-sel-en',     'football', 'Angleterre',    'ANG', 'Sélections', 'GB'),
  ('foot-sel-de',     'football', 'Allemagne',     'ALL', 'Sélections', 'DE'),
  ('foot-sel-it',     'football', 'Italie',        'ITA', 'Sélections', 'IT'),
  ('foot-sel-br',     'football', 'Brésil',        'BRA', 'Sélections', 'BR'),
  ('foot-sel-ar',     'football', 'Argentine',     'ARG', 'Sélections', 'AR'),
  -- Basket — NBA, conférence Est
  ('nba-bos', 'basket', 'Boston Celtics',        'BOS', 'NBA', 'US'),
  ('nba-bkn', 'basket', 'Brooklyn Nets',         'BKN', 'NBA', 'US'),
  ('nba-nyk', 'basket', 'New York Knicks',       'NYK', 'NBA', 'US'),
  ('nba-phi', 'basket', 'Philadelphia 76ers',    'PHI', 'NBA', 'US'),
  ('nba-tor', 'basket', 'Toronto Raptors',       'TOR', 'NBA', 'CA'),
  ('nba-chi', 'basket', 'Chicago Bulls',         'CHI', 'NBA', 'US'),
  ('nba-cle', 'basket', 'Cleveland Cavaliers',   'CLE', 'NBA', 'US'),
  ('nba-det', 'basket', 'Detroit Pistons',       'DET', 'NBA', 'US'),
  ('nba-ind', 'basket', 'Indiana Pacers',        'IND', 'NBA', 'US'),
  ('nba-mil', 'basket', 'Milwaukee Bucks',       'MIL', 'NBA', 'US'),
  ('nba-atl', 'basket', 'Atlanta Hawks',         'ATL', 'NBA', 'US'),
  ('nba-cha', 'basket', 'Charlotte Hornets',     'CHA', 'NBA', 'US'),
  ('nba-mia', 'basket', 'Miami Heat',            'MIA', 'NBA', 'US'),
  ('nba-orl', 'basket', 'Orlando Magic',         'ORL', 'NBA', 'US'),
  ('nba-was', 'basket', 'Washington Wizards',    'WAS', 'NBA', 'US'),
  -- Basket — NBA, conférence Ouest
  ('nba-den', 'basket', 'Denver Nuggets',        'DEN', 'NBA', 'US'),
  ('nba-min', 'basket', 'Minnesota Timberwolves','MIN', 'NBA', 'US'),
  ('nba-okc', 'basket', 'Oklahoma City Thunder', 'OKC', 'NBA', 'US'),
  ('nba-por', 'basket', 'Portland Trail Blazers','POR', 'NBA', 'US'),
  ('nba-uta', 'basket', 'Utah Jazz',             'UTA', 'NBA', 'US'),
  ('nba-gsw', 'basket', 'Golden State Warriors', 'GSW', 'NBA', 'US'),
  ('nba-lac', 'basket', 'Los Angeles Clippers',  'LAC', 'NBA', 'US'),
  ('nba-lal', 'basket', 'Los Angeles Lakers',    'LAL', 'NBA', 'US'),
  ('nba-phx', 'basket', 'Phoenix Suns',          'PHX', 'NBA', 'US'),
  ('nba-sac', 'basket', 'Sacramento Kings',      'SAC', 'NBA', 'US'),
  ('nba-dal', 'basket', 'Dallas Mavericks',      'DAL', 'NBA', 'US'),
  ('nba-hou', 'basket', 'Houston Rockets',       'HOU', 'NBA', 'US'),
  ('nba-mem', 'basket', 'Memphis Grizzlies',     'MEM', 'NBA', 'US'),
  ('nba-nop', 'basket', 'New Orleans Pelicans',  'NOP', 'NBA', 'US'),
  ('nba-sas', 'basket', 'San Antonio Spurs',     'SAS', 'NBA', 'US'),
  -- Basket — sélections
  ('basket-sel-fr', 'basket', 'France',      'FRA', 'Sélections', 'FR'),
  ('basket-sel-us', 'basket', 'États-Unis',  'USA', 'Sélections', 'US'),
  ('basket-sel-es', 'basket', 'Espagne',     'ESP', 'Sélections', 'ES'),
  ('basket-sel-rs', 'basket', 'Serbie',      'SRB', 'Sélections', 'RS'),
  ('basket-sel-ca', 'basket', 'Canada',      'CAN', 'Sélections', 'CA'),
  ('basket-sel-de', 'basket', 'Allemagne',   'ALL', 'Sélections', 'DE'),
  -- Rugby — Top 14
  ('rugby-st',   'rugby', 'Stade Toulousain',       'ST',   'Top 14', 'FR'),
  ('rugby-ubb',  'rugby', 'Union Bordeaux-Bègles',  'UBB',  'Top 14', 'FR'),
  ('rugby-sr',   'rugby', 'Stade Rochelais',        'SR',   'Top 14', 'FR'),
  ('rugby-r92',  'rugby', 'Racing 92',              'R92',  'Top 14', 'FR'),
  ('rugby-sfp',  'rugby', 'Stade Français Paris',   'SFP',  'Top 14', 'FR'),
  ('rugby-asm',  'rugby', 'ASM Clermont Auvergne',  'ASM',  'Top 14', 'FR'),
  ('rugby-mhr',  'rugby', 'Montpellier Hérault',    'MHR',  'Top 14', 'FR'),
  ('rugby-rct',  'rugby', 'RC Toulon',              'RCT',  'Top 14', 'FR'),
  ('rugby-sp',   'rugby', 'Section Paloise',        'SP',   'Top 14', 'FR'),
  ('rugby-usap', 'rugby', 'USA Perpignan',          'USAP', 'Top 14', 'FR'),
  ('rugby-ab',   'rugby', 'Aviron Bayonnais',       'AB',   'Top 14', 'FR'),
  ('rugby-co',   'rugby', 'Castres Olympique',      'CO',   'Top 14', 'FR'),
  ('rugby-lou',  'rugby', 'LOU Rugby',              'LOU',  'Top 14', 'FR'),
  ('rugby-usm',  'rugby', 'US Montauban',           'USM',  'Top 14', 'FR'),
  -- Rugby — sélections
  ('rugby-sel-fr', 'rugby', 'France',             'FRA', 'Sélections', 'FR'),
  ('rugby-sel-ie', 'rugby', 'Irlande',            'IRL', 'Sélections', 'IE'),
  ('rugby-sel-en', 'rugby', 'Angleterre',         'ANG', 'Sélections', 'GB'),
  ('rugby-sel-wa', 'rugby', 'Pays de Galles',     'GAL', 'Sélections', 'GB'),
  ('rugby-sel-sc', 'rugby', 'Écosse',             'ECO', 'Sélections', 'GB'),
  ('rugby-sel-it', 'rugby', 'Italie',             'ITA', 'Sélections', 'IT'),
  ('rugby-sel-nz', 'rugby', 'Nouvelle-Zélande',   'NZL', 'Sélections', 'NZ'),
  ('rugby-sel-za', 'rugby', 'Afrique du Sud',     'RSA', 'Sélections', 'ZA'),
  ('rugby-sel-au', 'rugby', 'Australie',          'AUS', 'Sélections', 'AU')
on conflict (id) do update set
  sport_id   = excluded.sport_id,
  name       = excluded.name,
  short_name = excluded.short_name,
  league     = excluded.league,
  country    = excluded.country;
