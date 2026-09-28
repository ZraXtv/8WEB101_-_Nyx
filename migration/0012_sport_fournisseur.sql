-- ============================================================
-- Suivi sportif : raccordement au fournisseur de données.
--
-- 0011 posait un catalogue écrit à la main. Il a deux défauts qu'on ne peut
-- pas corriger à la main : il vieillit à chaque saison (Nantes et Metz y sont
-- donnés en Ligue 1 alors qu'ils jouent en Ligue 2 en 2026-2027), et il ne
-- contient que ce que j'y ai tapé.
--
-- On lui adjoint donc les identifiants de TheSportsDB, et de quoi enregistrer
-- une équipe trouvée par recherche. Le catalogue devient une liste de
-- suggestions ; la recherche couvre le reste du monde.
--
-- À exécuter APRÈS 0011. Rejouable sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- Colonnes
-- ------------------------------------------------------------
alter table public.teams
  -- Identifiant chez le fournisseur : c'est lui qui permet d'aller chercher
  -- les résultats. Nul tant que l'équipe n'a pas été raccordée.
  add column if not exists provider_team_id text,
  -- Libellé du championnat CHEZ LE FOURNISSEUR ('French Ligue 1'), qui diffère
  -- du nôtre ('Ligue 1'). Sert à vérifier qu'une recherche par nom est tombée
  -- sur la bonne équipe : sans ce contrôle, « Paris SG » ramène Torcy, en
  -- National 3, et « Lille » une équipe de hockey sur gazon.
  add column if not exists provider_league text,
  add column if not exists badge_url text,
  -- Renseigné pour une équipe ajoutée par une recherche, et non par une
  -- migration : on sait alors qui l'a fait entrer.
  add column if not exists discovered_by uuid references public.profiles(id) on delete set null,
  -- Vrai pour les lignes posées par une migration, qui composent la liste
  -- proposée à l'ouverture. Les équipes trouvées par recherche restent à faux
  -- et n'encombrent donc pas cette liste.
  add column if not exists is_catalogue boolean not null default true;

-- Une équipe du fournisseur ne peut figurer qu'une fois. L'index est partiel :
-- les lignes non encore raccordées ont toutes `provider_team_id` à null, et
-- null n'entre pas en conflit avec null.
create unique index if not exists teams_provider_idx
  on public.teams (provider_team_id) where provider_team_id is not null;

-- ------------------------------------------------------------
-- Correspondance des championnats
-- ------------------------------------------------------------
update public.teams set provider_league = case league
  when 'Ligue 1' then 'French Ligue 1'
  when 'NBA'     then 'NBA'
  when 'Top 14'  then 'French Top 14'
  else null   -- « Sélections » : les équipes nationales ne jouent pas un championnat
end
where is_catalogue and provider_league is distinct from case league
  when 'Ligue 1' then 'French Ligue 1'
  when 'NBA'     then 'NBA'
  when 'Top 14'  then 'French Top 14'
  else null
end;

-- ------------------------------------------------------------
-- Identifiants vérifiés
--
-- Chacun a été confirmé auprès du fournisseur le 2026-09-17 : soit la ligue
-- renvoyée correspondait à celle attendue, soit l'identifiant a été relu par
-- `lookupteam` puis vérifié sur un vrai match. Les équipes absentes d'ici
-- restent à null : elles seront raccordées à l'usage, jamais devinées.
-- ------------------------------------------------------------
update public.teams as t
   set provider_team_id = v.provider_id,
       badge_url        = coalesce(v.badge, t.badge_url)
  from (values
  ('foot-aja', '134788', 'https://r2.thesportsdb.com/images/media/team/badge/lzdtbf1658753355.png'),
  ('foot-asm', '133823', 'https://r2.thesportsdb.com/images/media/team/badge/exjf5l1678808044.png'),
  ('foot-fcl', '133715', 'https://r2.thesportsdb.com/images/media/team/badge/sxsttw1473504748.png'),
  ('foot-fcm', '133883', 'https://r2.thesportsdb.com/images/media/team/badge/1iuew61688452857.png'),
  ('foot-fcn', '133861', 'https://r2.thesportsdb.com/images/media/team/badge/mla9x61678808018.png'),
  ('foot-hac', '133862', 'https://r2.thesportsdb.com/images/media/team/badge/aikowk1546475003.png'),
  ('foot-losc', '133711', 'https://r2.thesportsdb.com/images/media/team/badge/2giize1534005340.png'),
  ('foot-ogcn', '133712', 'https://r2.thesportsdb.com/images/media/team/badge/msy7ly1621593859.png'),
  ('foot-ol', '133713', 'https://r2.thesportsdb.com/images/media/team/badge/blk9771656932845.png'),
  ('foot-om', '133707', 'https://r2.thesportsdb.com/images/media/team/badge/c6bazh1779212287.png'),
  ('foot-pfc', '135465', 'https://r2.thesportsdb.com/images/media/team/badge/yuvtsy1447594254.png'),
  ('foot-psg', '133714', 'https://r2.thesportsdb.com/images/media/team/badge/rwqrrq1473504808.png'),
  ('foot-rcl', '133822', 'https://r2.thesportsdb.com/images/media/team/badge/3pxoum1598797195.png'),
  ('foot-rcsa', '133882', 'https://r2.thesportsdb.com/images/media/team/badge/b8k77w1766625501.png'),
  ('foot-sb29', '133704', 'https://r2.thesportsdb.com/images/media/team/badge/z69be41598797026.png'),
  ('foot-sco', '134709', 'https://r2.thesportsdb.com/images/media/team/badge/ix6q4w1678808069.png'),
  ('foot-srfc', '133719', 'https://r2.thesportsdb.com/images/media/team/badge/ypturx1473504818.png'),
  ('foot-tfc', '133703', 'https://r2.thesportsdb.com/images/media/team/badge/17eqox1688449282.png')  ) as v(slug, provider_id, badge)
 where t.id = v.slug;

-- ------------------------------------------------------------
-- Enregistrer une équipe trouvée par recherche
--
-- Le catalogue n'accorde aucun privilège d'écriture aux clients (0011), et
-- c'est à conserver : personne ne doit pouvoir renommer une équipe depuis son
-- navigateur. Cette fonction est donc la seule porte, et elle est étroite.
--
-- Le chemin normal est une action serveur qui a relu l'équipe chez le
-- fournisseur par son identifiant : les valeurs passées ici viennent de lui,
-- pas de la page. Un appel direct depuis un navigateur reste possible ; c'est
-- pourquoi la fonction valide ses entrées, marque la ligne comme découverte
-- (elle n'entrera pas dans la liste proposée) et retient son auteur.
-- ------------------------------------------------------------
create or replace function public.ensure_team(
  p_provider_id text,
  p_sport_id    text,
  p_name        text,
  p_league      text,
  p_badge_url   text
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_id    text;
  v_nom   text := btrim(coalesce(p_name, ''));
  v_ligue text := btrim(coalesce(p_league, ''));
begin
  if v_me is null then
    raise exception 'Tu dois être connecté.' using errcode = '28000';
  end if;

  if p_provider_id is null or p_provider_id !~ '^[0-9]{1,12}$' then
    raise exception 'Identifiant fournisseur invalide.' using errcode = '22023';
  end if;

  -- Déjà connue : on renvoie la ligne telle quelle. Surtout, on ne réécrit
  -- rien — sinon un appel direct pourrait rebaptiser une équipe du catalogue
  -- que quelqu'un d'autre suit.
  select id into v_id from public.teams where provider_team_id = p_provider_id;
  if v_id is not null then
    return v_id;
  end if;

  if not exists (select 1 from public.sports where id = p_sport_id) then
    raise exception 'Sport inconnu : %.', p_sport_id using errcode = '23503';
  end if;

  if v_nom = '' or length(v_nom) > 80 or length(v_ligue) > 80 then
    raise exception 'Nom ou championnat invalide.' using errcode = '22023';
  end if;

  -- Un blason est une URL https chez un hébergeur, ou rien. On refuse tout le
  -- reste, `javascript:` et `data:` compris.
  if p_badge_url is not null and p_badge_url !~ '^https://[a-zA-Z0-9.-]+/[^\s]*$' then
    raise exception 'Adresse de blason invalide.' using errcode = '22023';
  end if;

  v_id := 'tsdb-' || p_provider_id;

  insert into public.teams (
    id, sport_id, name, short_name, league, country,
    provider_team_id, provider_league, badge_url, discovered_by, is_catalogue
  )
  values (
    v_id, p_sport_id, v_nom,
    -- Abréviation de secours : les initiales suffisent quand le blason manque.
    upper(left(regexp_replace(v_nom, '[^A-Za-z0-9]', '', 'g'), 4)),
    coalesce(nullif(v_ligue, ''), 'Autre'),
    'XX',  -- le pays n'est pas affiché pour l'instant
    p_provider_id, nullif(v_ligue, ''), p_badge_url, v_me, false
  )
  on conflict (id) do nothing;

  return v_id;
end $$;

grant execute on function
  public.ensure_team(text, text, text, text, text)
to authenticated;
