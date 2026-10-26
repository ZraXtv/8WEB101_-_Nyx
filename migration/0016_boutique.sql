-- ============================================================
-- 0016_boutique.sql
-- La boutique : des cosmétiques achetés avec les points des paris.
--
-- Quatre sortes d'objets, uniquement décoratifs — rien qui fasse gagner des
-- points, l'économie des paris reste équitable :
--   - couleur  : la couleur (ou le dégradé) du nom affiché ;
--   - cadre    : un anneau autour de la photo de profil ;
--   - badge    : une petite icône à côté du nom ;
--   - banniere : le fond de la carte de profil.
--
-- Les mêmes règles que les paris :
--   - aucun argent réel : on achète AVEC des points, jamais DES points ;
--   - le navigateur ne décide de rien : acheter passe par `acheter()`, qui
--     vérifie le solde et inscrit l'achat dans le registre `point_ledger` ;
--     et la base refuse d'équiper un objet qu'on ne possède pas.
--
-- À exécuter APRÈS 0013 (elle utilise les portefeuilles des paris).
-- Rejouable sans risque : le catalogue est mis à jour, rien n'est perdu.
-- ============================================================

do $$
begin
  if to_regclass('public.wallets') is null then
    raise exception 'La boutique utilise les points des paris : exécute d''abord 0013_paris.sql.';
  end if;
end $$;

-- ------------------------------------------------------------
-- Catalogue
--
-- `style` décrit l'apparence, dans un format strict propre à chaque sorte.
-- Les contraintes ci-dessous le vérifient : rien d'autre qu'une couleur
-- hexadécimale ou une clé connue ne peut entrer, si bien qu'aucune valeur du
-- catalogue ne peut injecter de CSS ou de HTML dans les pages.
--   couleur  : '#rrggbb' ou '#rrggbb,#rrggbb' (dégradé)
--   cadre    : 'argent' | 'or' | 'neon' | 'arc-en-ciel'
--   badge    : 'etoile' | 'eclair' | 'coeur' | 'ballon' | 'flamme' | 'couronne' | 'diamant'
--   banniere : deux ou trois couleurs '#rrggbb' séparées par des virgules
-- Ajouter un cadre ou un badge demande donc aussi son dessin côté site
-- (css/app.css et js/cosmetiques.js) ; une couleur ou une bannière, non.
-- ------------------------------------------------------------
create table if not exists public.shop_items (
  id          text primary key,          -- slug lisible : 'cadre-or'
  kind        text not null check (kind in ('couleur', 'cadre', 'badge', 'banniere')),
  name        text not null check (char_length(name) between 2 and 40),
  description text not null default '' check (char_length(description) <= 140),
  style       text not null,
  price       integer not null check (price > 0),
  rarity      text not null default 'commun'
              check (rarity in ('commun', 'rare', 'epique', 'legendaire')),
  position    integer not null default 0,
  available   boolean not null default true,

  constraint shop_items_style_valide check (
    case kind
      when 'couleur'  then style ~* '^#[0-9a-f]{6}(,#[0-9a-f]{6})?$'
      when 'cadre'    then style in ('argent', 'or', 'neon', 'arc-en-ciel')
      when 'badge'    then style in ('etoile', 'eclair', 'coeur', 'ballon', 'flamme', 'couronne', 'diamant')
      when 'banniere' then style ~* '^#[0-9a-f]{6},#[0-9a-f]{6}(,#[0-9a-f]{6})?$'
    end
  )
);

-- Les prix sont pensés pour une économie de 1 000 points au départ et
-- 50 par jour : un objet commun s'offre dès le premier jour, un légendaire
-- se mérite par les paris.
insert into public.shop_items (id, kind, name, description, style, price, rarity, position) values
  -- Couleurs du nom
  ('couleur-corail',     'couleur',  'Corail',               'Ton nom en rouge corail.',                  '#ff6b6b',          300,  'commun',      10),
  ('couleur-lagon',      'couleur',  'Lagon',                'Ton nom en bleu lagon.',                    '#4dabf7',          300,  'commun',      11),
  ('couleur-menthe',     'couleur',  'Menthe',               'Ton nom en vert menthe.',                   '#51cf66',          300,  'commun',      12),
  ('couleur-or',         'couleur',  'Or',                   'Ton nom en lettres d’or.',                  '#fcc419',          600,  'rare',        13),
  ('couleur-crepuscule', 'couleur',  'Crépuscule',           'Un dégradé du corail à l’or.',              '#ff6b6b,#fcc419',  1200, 'epique',      14),
  ('couleur-aurore',     'couleur',  'Aurore',               'Un dégradé du vert au bleu.',               '#51cf66,#4dabf7',  1200, 'epique',      15),
  ('couleur-neon',       'couleur',  'Néon',                 'Un dégradé rose et violet électrique.',     '#f06595,#845ef7',  2000, 'legendaire',  16),
  -- Cadres d'avatar
  ('cadre-argent',       'cadre',    'Cadre argent',         'Un anneau argenté autour de ta photo.',     'argent',           400,  'commun',      20),
  ('cadre-or',           'cadre',    'Cadre or',             'Un anneau doré autour de ta photo.',        'or',               800,  'rare',        21),
  ('cadre-neon',         'cadre',    'Cadre néon',           'Un halo lumineux autour de ta photo.',      'neon',             1500, 'epique',      22),
  ('cadre-arc-en-ciel',  'cadre',    'Cadre arc-en-ciel',    'Un anneau aux couleurs qui tournent.',      'arc-en-ciel',      2500, 'legendaire',  23),
  -- Badges
  ('badge-etoile',       'badge',    'Étoile',               'Une étoile à côté de ton nom.',             'etoile',           250,  'commun',      30),
  ('badge-eclair',       'badge',    'Éclair',               'Un éclair à côté de ton nom.',              'eclair',           250,  'commun',      31),
  ('badge-coeur',        'badge',    'Cœur',                 'Un cœur à côté de ton nom.',                'coeur',            250,  'commun',      32),
  ('badge-ballon',       'badge',    'Pronostiqueur',        'Un ballon : pour les fidèles des paris.',   'ballon',           500,  'rare',        33),
  ('badge-flamme',       'badge',    'Flamme',               'Une flamme à côté de ton nom.',             'flamme',           500,  'rare',        34),
  ('badge-couronne',     'badge',    'Couronne',             'Une couronne à côté de ton nom.',           'couronne',         1000, 'epique',      35),
  ('badge-diamant',      'badge',    'Diamant',              'Le plus rare des badges.',                  'diamant',          2000, 'legendaire',  36),
  -- Bannières de profil
  ('banniere-ocean',     'banniere', 'Océan',                'Du bleu ciel au bleu profond.',             '#0ea5e9,#1e3a8a',  500,  'commun',      40),
  ('banniere-foret',     'banniere', 'Forêt',                'Du vert tendre au vert sombre.',            '#22c55e,#14532d',  500,  'commun',      41),
  ('banniere-couchant',  'banniere', 'Couchant',             'De l’orange au rose.',                      '#f97316,#db2777',  700,  'rare',        42),
  ('banniere-aurore',    'banniere', 'Aurore boréale',       'Vert, turquoise et violet.',                '#22c55e,#06b6d4,#8b5cf6', 1500, 'epique', 43)
-- Rejouer met à jour textes et prix, sans réactiver un article retiré à la main.
on conflict (id) do update set
  kind = excluded.kind, name = excluded.name, description = excluded.description,
  style = excluded.style, price = excluded.price, rarity = excluded.rarity,
  position = excluded.position;

-- ------------------------------------------------------------
-- Inventaire : ce que chacun possède
-- ------------------------------------------------------------
create table if not exists public.user_items (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  item_id      text not null references public.shop_items(id) on delete restrict,
  price_paid   integer not null,
  purchased_at timestamptz not null default now(),
  primary key (profile_id, item_id)
);

-- Le registre des points dit désormais ce qui a été acheté.
alter table public.point_ledger
  add column if not exists item_id text references public.shop_items(id) on delete set null;

-- ------------------------------------------------------------
-- Ce que chacun porte
--
-- Sur `profiles`, pour être lu là où le profil l'est déjà : par soi-même, les
-- membres de ses serveurs et ses amis (règle de 0004). Personne d'autre.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists cos_couleur  text references public.shop_items(id) on delete set null,
  add column if not exists cos_cadre    text references public.shop_items(id) on delete set null,
  add column if not exists cos_badge    text references public.shop_items(id) on delete set null,
  add column if not exists cos_banniere text references public.shop_items(id) on delete set null;

/**
 * On équipe en modifiant simplement son profil — mais seulement avec un objet
 * qu'on possède, et de la bonne sorte. Sans ce contrôle, n'importe qui
 * pourrait s'afficher un badge légendaire sans l'avoir payé.
 *
 * Sans compte connecté (dashboard), tout reste permis.
 */
create or replace function public.verifier_cosmetiques()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_colonne text;
  v_sorte   text;
  v_objet   text;
  v_ancien  text;
begin
  if auth.uid() is null then
    return new;
  end if;

  foreach v_colonne in array array['couleur', 'cadre', 'badge', 'banniere'] loop
    v_objet  := to_jsonb(new) ->> ('cos_' || v_colonne);
    v_ancien := case when tg_op = 'UPDATE' then to_jsonb(old) ->> ('cos_' || v_colonne) end;

    continue when v_objet is null or v_objet is not distinct from v_ancien;

    select kind into v_sorte from public.shop_items where id = v_objet;
    if v_sorte is distinct from v_colonne then
      raise exception 'Cet objet ne se porte pas à cet endroit.' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.user_items where profile_id = new.id and item_id = v_objet) then
      raise exception 'Tu ne possèdes pas cet objet.' using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists verifier_cosmetiques on public.profiles;
create trigger verifier_cosmetiques
  before insert or update on public.profiles
  for each row execute function public.verifier_cosmetiques();

-- ------------------------------------------------------------
-- Le registre accepte une référence d'objet
--
-- `paris_prive.mouvement` reste la seule porte d'entrée des points ; elle
-- gagne un paramètre facultatif. L'ancienne version (4 paramètres) est
-- supprimée : laissée en place, les appels à 4 arguments deviendraient
-- ambigus entre les deux.
-- ------------------------------------------------------------
drop function if exists paris_prive.mouvement(uuid, integer, text, uuid);

create or replace function paris_prive.mouvement(
  p_profil uuid, p_montant integer, p_type text, p_pari uuid default null, p_objet text default null
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

  insert into public.point_ledger (profile_id, amount, kind, bet_id, item_id, balance_after)
  values (p_profil, p_montant, p_type, p_pari, p_objet, v_solde);

  return v_solde;
end $$;

revoke all on all functions in schema paris_prive from public;

-- ------------------------------------------------------------
-- Acheter
-- ------------------------------------------------------------
create or replace function public.acheter(p_objet text)
returns integer   -- le solde restant
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_objet public.shop_items%rowtype;
  v_solde integer;
begin
  if v_me is null then
    raise exception 'Tu dois être connecté.' using errcode = '28000';
  end if;

  select * into v_objet from public.shop_items where id = p_objet;
  if not found or not v_objet.available then
    raise exception 'Cet objet n’est pas en vente.' using errcode = 'P0002';
  end if;

  perform paris_prive.ouvrir_portefeuille(v_me);

  -- Verrou : deux achats envoyés en même temps ne dépensent pas deux fois
  -- le même solde.
  select balance into v_solde from public.wallets where profile_id = v_me for update;

  -- Avant le solde : racheter un objet qu'on a déjà doit le dire, et non
  -- répondre « solde insuffisant ».
  if exists (select 1 from public.user_items where profile_id = v_me and item_id = v_objet.id) then
    raise exception 'Tu possèdes déjà cet objet.' using errcode = 'P0001';
  end if;
  if v_solde < v_objet.price then
    raise exception 'Solde insuffisant : il te manque % points.', v_objet.price - v_solde
      using errcode = 'P0001';
  end if;

  begin
    insert into public.user_items (profile_id, item_id, price_paid)
    values (v_me, v_objet.id, v_objet.price);
  exception when unique_violation then
    raise exception 'Tu possèdes déjà cet objet.' using errcode = 'P0001';
  end;

  return paris_prive.mouvement(v_me, -v_objet.price, 'achat', null, v_objet.id);
end $$;

-- ------------------------------------------------------------
-- Le classement des paris montre aussi les cosmétiques portés.
-- Le type de retour change : la fonction est recréée.
-- ------------------------------------------------------------
drop function if exists public.classement_points(integer);

create function public.classement_points(p_limite integer default 20)
returns table (rang bigint, profile_id uuid, display_name text, username text,
               avatar_url text, solde integer,
               cos_couleur text, cos_cadre text, cos_badge text, cos_banniere text)
language sql security definer stable set search_path = public as $$
  select rank() over (order by w.balance desc),
         p.id, p.display_name, p.username, p.avatar_url, w.balance,
         p.cos_couleur, p.cos_cadre, p.cos_badge, p.cos_banniere
    from public.wallets w
    join public.profiles p on p.id = w.profile_id
   where auth.uid() is not null
   order by w.balance desc, p.display_name
   limit least(greatest(coalesce(p_limite, 20), 1), 100)
$$;

-- ------------------------------------------------------------
-- Politiques et privilèges
-- ------------------------------------------------------------
alter table public.shop_items enable row level security;
alter table public.user_items enable row level security;

drop policy if exists "catalogue lisible"       on public.shop_items;
drop policy if exists "on lit son inventaire"   on public.user_items;

create policy "catalogue lisible" on public.shop_items
  for select to authenticated using (true);
create policy "on lit son inventaire" on public.user_items
  for select to authenticated using (profile_id = auth.uid());

-- Lecture seule : on n'écrit dans l'inventaire que par `acheter()`.
revoke all on public.shop_items, public.user_items from anon, authenticated;
grant select on public.shop_items, public.user_items to authenticated;

revoke all on function public.acheter(text)               from public, anon;
revoke all on function public.classement_points(integer)  from public, anon;
grant execute on function public.acheter(text)              to authenticated;
grant execute on function public.classement_points(integer) to authenticated;

-- ============================================================
-- Pour vérifier :
--   select kind, count(*) from public.shop_items group by kind;
--   select * from public.point_ledger where kind = 'achat' order by created_at desc;
-- ============================================================
