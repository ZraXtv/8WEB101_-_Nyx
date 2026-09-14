-- ============================================================
-- Puissance 4.
--
-- La grille est stockée en clair : 42 caractères, une ligne de 7 colonnes
-- après l'autre, en partant du haut. '.' = vide, '1' = joueur 1, '2' = joueur 2.
--
-- Les règles sont appliquées par des fonctions SQL, jamais par le client :
-- aucune politique RLS ne saurait vérifier « c'est bien ton tour » ni « ce coup
-- est légal ». Modifier le navigateur ne permet donc pas de tricher.
--
-- À exécuter APRÈS 0008. Rejouable sans risque.
-- ============================================================

create table if not exists public.games (
  id              uuid primary key default gen_random_uuid(),

  -- Une partie appartient à une conversation privée OU à un salon.
  conversation_id uuid references public.dm_conversations (id) on delete cascade,
  channel_id      uuid references public.channels (id) on delete cascade,

  player1_id      uuid not null references public.profiles (id) on delete cascade,
  player2_id      uuid references public.profiles (id) on delete cascade,

  board           text not null default repeat('.', 42),
  turn            smallint not null default 1,
  status          text not null default 'waiting',
  winner_id       uuid references public.profiles (id) on delete set null,
  outcome         text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint un_seul_fil check (
    (conversation_id is not null and channel_id is null)
    or (conversation_id is null and channel_id is not null)
  ),
  constraint grille_valide  check (board ~ '^[.12]{42}$'),
  constraint tour_valide    check (turn in (1, 2)),
  constraint statut_valide  check (status in ('waiting', 'playing', 'finished')),
  constraint issue_valide   check (outcome is null or outcome in ('win', 'draw', 'forfeit')),
  constraint adversaires    check (player2_id is null or player2_id <> player1_id)
);

-- Une seule partie en cours par fil : sinon on ne saurait pas laquelle afficher.
create unique index if not exists games_une_active_par_conversation
  on public.games (conversation_id) where status <> 'finished' and conversation_id is not null;
create unique index if not exists games_une_active_par_salon
  on public.games (channel_id) where status <> 'finished' and channel_id is not null;

create index if not exists games_conversation_idx on public.games (conversation_id, created_at desc);
create index if not exists games_channel_idx      on public.games (channel_id, created_at desc);

-- ------------------------------------------------------------
-- Détection d'un alignement de quatre.
--
-- On balaie toute la grille plutôt que le voisinage du dernier coup : c'est
-- 42 cases, le coût est négligeable et le code reste vérifiable à l'œil.
-- ------------------------------------------------------------
create or replace function public.p4_gagnant(p_board text)
returns text language plpgsql immutable as $$
declare
  r int; c int; v text;
  cell text;
begin
  for r in 0..5 loop
    for c in 0..6 loop
      v := substr(p_board, r * 7 + c + 1, 1);
      continue when v = '.';

      -- horizontal
      if c <= 3
         and substr(p_board, r * 7 + c + 2, 1) = v
         and substr(p_board, r * 7 + c + 3, 1) = v
         and substr(p_board, r * 7 + c + 4, 1) = v then
        return v;
      end if;

      -- vertical
      if r <= 2
         and substr(p_board, (r + 1) * 7 + c + 1, 1) = v
         and substr(p_board, (r + 2) * 7 + c + 1, 1) = v
         and substr(p_board, (r + 3) * 7 + c + 1, 1) = v then
        return v;
      end if;

      -- diagonale descendante vers la droite
      if r <= 2 and c <= 3
         and substr(p_board, (r + 1) * 7 + c + 2, 1) = v
         and substr(p_board, (r + 2) * 7 + c + 3, 1) = v
         and substr(p_board, (r + 3) * 7 + c + 4, 1) = v then
        return v;
      end if;

      -- diagonale descendante vers la gauche
      if r <= 2 and c >= 3
         and substr(p_board, (r + 1) * 7 + c, 1) = v
         and substr(p_board, (r + 2) * 7 + c - 1, 1) = v
         and substr(p_board, (r + 3) * 7 + c - 2, 1) = v then
        return v;
      end if;
    end loop;
  end loop;

  return null;
end $$;

-- ------------------------------------------------------------
-- A-t-on le droit de voir / jouer dans ce fil ?
-- ------------------------------------------------------------
create or replace function public.peut_acceder_au_fil(p_conversation_id uuid, p_channel_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select case
    when p_conversation_id is not null then public.is_dm_participant(p_conversation_id)
    else public.is_server_member(public.channel_server_id(p_channel_id))
  end;
$$;

-- ------------------------------------------------------------
-- Créer une partie.
--
-- Dans une conversation privée, l'adversaire est connu d'avance : la partie
-- démarre aussitôt. Dans un salon, elle attend que quelqu'un la rejoigne.
-- ------------------------------------------------------------
create or replace function public.create_game(p_conversation_id uuid, p_channel_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_autre  uuid;
  v_statut text := 'waiting';
  v_id     uuid;
begin
  if v_me is null then
    raise exception 'Tu dois être connecté.' using errcode = '28000';
  end if;

  if not public.peut_acceder_au_fil(p_conversation_id, p_channel_id) then
    raise exception 'Ce fil ne t’est pas accessible.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.games
    where status <> 'finished'
      and (conversation_id = p_conversation_id or channel_id = p_channel_id)
  ) then
    raise exception 'Une partie est déjà en cours ici.' using errcode = 'P0001';
  end if;

  if p_conversation_id is not null then
    select case when user_low = v_me then user_high else user_low end
      into v_autre
      from public.dm_conversations where id = p_conversation_id;
    v_statut := 'playing';
  end if;

  insert into public.games (conversation_id, channel_id, player1_id, player2_id, status)
  values (p_conversation_id, p_channel_id, v_me, v_autre, v_statut)
  returning id into v_id;

  return v_id;
end $$;

-- ------------------------------------------------------------
-- Rejoindre une partie ouverte dans un salon.
-- ------------------------------------------------------------
create or replace function public.join_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_partie public.games%rowtype;
begin
  select * into v_partie from public.games where id = p_game_id;

  if not found then
    raise exception 'Partie introuvable.' using errcode = 'P0002';
  end if;
  if not public.peut_acceder_au_fil(v_partie.conversation_id, v_partie.channel_id) then
    raise exception 'Ce fil ne t’est pas accessible.' using errcode = '42501';
  end if;
  if v_partie.status <> 'waiting' then
    raise exception 'Cette partie a déjà commencé.' using errcode = 'P0001';
  end if;
  if v_partie.player1_id = auth.uid() then
    raise exception 'Tu ne peux pas jouer contre toi-même.' using errcode = 'P0001';
  end if;

  update public.games
     set player2_id = auth.uid(), status = 'playing', updated_at = now()
   where id = p_game_id;
end $$;

-- ------------------------------------------------------------
-- Jouer un coup dans une colonne (0 à 6).
-- ------------------------------------------------------------
create or replace function public.play_move(p_game_id uuid, p_column int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_partie   public.games%rowtype;
  v_me       uuid := auth.uid();
  v_mon_tour smallint;
  v_ligne    int := -1;
  r          int;
  v_board    text;
  v_gagnant  text;
begin
  select * into v_partie from public.games where id = p_game_id for update;

  if not found then
    raise exception 'Partie introuvable.' using errcode = 'P0002';
  end if;
  if v_partie.status <> 'playing' then
    raise exception 'Cette partie n’est pas en cours.' using errcode = 'P0001';
  end if;
  if p_column < 0 or p_column > 6 then
    raise exception 'Colonne invalide.' using errcode = 'P0001';
  end if;

  v_mon_tour := case when v_partie.player1_id = v_me then 1
                     when v_partie.player2_id = v_me then 2
                     else null end;

  if v_mon_tour is null then
    raise exception 'Tu ne participes pas à cette partie.' using errcode = '42501';
  end if;
  if v_mon_tour <> v_partie.turn then
    raise exception 'Ce n’est pas ton tour.' using errcode = 'P0001';
  end if;

  -- Le jeton tombe : on cherche la case libre la plus basse de la colonne.
  for r in reverse 5..0 loop
    if substr(v_partie.board, r * 7 + p_column + 1, 1) = '.' then
      v_ligne := r;
      exit;
    end if;
  end loop;

  if v_ligne = -1 then
    raise exception 'Cette colonne est pleine.' using errcode = 'P0001';
  end if;

  v_board := overlay(v_partie.board placing v_mon_tour::text
                     from v_ligne * 7 + p_column + 1 for 1);

  v_gagnant := public.p4_gagnant(v_board);

  if v_gagnant is not null then
    update public.games
       set board = v_board, status = 'finished', outcome = 'win',
           winner_id = v_me, updated_at = now()
     where id = p_game_id;
  elsif position('.' in v_board) = 0 then
    update public.games
       set board = v_board, status = 'finished', outcome = 'draw', updated_at = now()
     where id = p_game_id;
  else
    update public.games
       set board = v_board, turn = 3 - v_mon_tour, updated_at = now()
     where id = p_game_id;
  end if;
end $$;

-- ------------------------------------------------------------
-- Abandonner (ou annuler une partie que personne n'a rejointe).
-- ------------------------------------------------------------
create or replace function public.forfeit_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_partie public.games%rowtype;
  v_me     uuid := auth.uid();
begin
  select * into v_partie from public.games where id = p_game_id for update;

  if not found then
    raise exception 'Partie introuvable.' using errcode = 'P0002';
  end if;
  if v_me not in (v_partie.player1_id, coalesce(v_partie.player2_id, v_partie.player1_id)) then
    raise exception 'Tu ne participes pas à cette partie.' using errcode = '42501';
  end if;
  if v_partie.status = 'finished' then
    return;
  end if;

  update public.games
     set status = 'finished',
         outcome = case when v_partie.status = 'waiting' then null else 'forfeit' end,
         winner_id = case
           when v_partie.status = 'waiting' then null
           when v_me = v_partie.player1_id then v_partie.player2_id
           else v_partie.player1_id
         end,
         updated_at = now()
   where id = p_game_id;
end $$;

-- ------------------------------------------------------------
-- Row Level Security
--
-- Lecture seule : toute écriture passe par les fonctions ci-dessus, qui sont
-- les seules à pouvoir vérifier les règles du jeu.
-- ------------------------------------------------------------
alter table public.games enable row level security;

drop policy if exists "on voit les parties de ses fils" on public.games;

create policy "on voit les parties de ses fils"
  on public.games for select to authenticated
  using (public.peut_acceder_au_fil(conversation_id, channel_id));

grant select on public.games to authenticated;

grant execute on function
  public.p4_gagnant(text),
  public.peut_acceder_au_fil(uuid, uuid),
  public.create_game(uuid, uuid),
  public.join_game(uuid),
  public.play_move(uuid, int),
  public.forfeit_game(uuid)
to authenticated;

alter table public.games replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.games;
exception when duplicate_object then null;
end $$;
