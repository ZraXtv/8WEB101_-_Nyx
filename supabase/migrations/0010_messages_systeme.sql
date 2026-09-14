-- ============================================================
-- Messages système : annoncer le résultat d'une partie dans le fil.
--
-- Un tel message n'a pas d'auteur humain. Deux conséquences :
--   - `author_id` devient facultatif ;
--   - une colonne `kind` distingue les messages écrits par quelqu'un de ceux
--     produits par l'application, pour les afficher différemment.
--
-- Les politiques d'écriture n'autorisent que `kind = 'user'` : seules les
-- fonctions du jeu, en security definer, peuvent poser un message système.
--
-- À exécuter APRÈS 0009. Rejouable sans risque.
-- ============================================================

alter table public.messages        add column if not exists kind text not null default 'user';
alter table public.direct_messages add column if not exists kind text not null default 'user';

do $$ begin
  alter table public.messages add constraint messages_kind_valide check (kind in ('user', 'system'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.direct_messages add constraint dm_kind_valide check (kind in ('user', 'system'));
exception when duplicate_object then null;
end $$;

alter table public.messages        alter column author_id drop not null;
alter table public.direct_messages alter column author_id drop not null;

-- On resserre l'insertion : un client ne peut poser qu'un message d'utilisateur,
-- signé de son propre identifiant.
drop policy if exists "on écrit en son propre nom dans ses serveurs"    on public.messages;
drop policy if exists "on écrit en son nom dans ses conversations"      on public.direct_messages;

create policy "on écrit en son propre nom dans ses serveurs"
  on public.messages for insert to authenticated
  with check (
    kind = 'user'
    and author_id = auth.uid()
    and public.is_server_member(public.channel_server_id(channel_id))
  );

create policy "on écrit en son nom dans ses conversations"
  on public.direct_messages for insert to authenticated
  with check (
    kind = 'user'
    and author_id = auth.uid()
    and public.is_dm_participant(conversation_id)
  );

-- ------------------------------------------------------------
-- Poser l'annonce dans le bon fil.
-- ------------------------------------------------------------
create or replace function public.p4_annonce(p_game public.games, p_texte text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_game.conversation_id is not null then
    insert into public.direct_messages (conversation_id, author_id, content, kind)
    values (p_game.conversation_id, null, p_texte, 'system');
  else
    insert into public.messages (channel_id, author_id, content, kind)
    values (p_game.channel_id, null, p_texte, 'system');
  end if;
end $$;

create or replace function public.p4_nom(p_profile_id uuid)
returns text language sql security definer stable set search_path = public as $$
  select coalesce(display_name, 'Un joueur') from public.profiles where id = p_profile_id;
$$;

-- ------------------------------------------------------------
-- play_move : identique à 0009, avec l'annonce en fin de partie.
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

    perform public.p4_annonce(
      v_partie,
      public.p4_nom(v_me) || ' a gagné la partie de Puissance 4.'
    );

  elsif position('.' in v_board) = 0 then
    update public.games
       set board = v_board, status = 'finished', outcome = 'draw', updated_at = now()
     where id = p_game_id;

    perform public.p4_annonce(v_partie, 'Match nul au Puissance 4 : la grille est pleine.');

  else
    update public.games
       set board = v_board, turn = 3 - v_mon_tour, updated_at = now()
     where id = p_game_id;
  end if;
end $$;

-- ------------------------------------------------------------
-- forfeit_game : idem, avec annonce de l'abandon.
-- ------------------------------------------------------------
create or replace function public.forfeit_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_partie  public.games%rowtype;
  v_me      uuid := auth.uid();
  v_gagnant uuid;
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

  -- Partie que personne n'a rejointe : simple annulation, rien à annoncer.
  if v_partie.status = 'waiting' then
    update public.games
       set status = 'finished', outcome = null, winner_id = null, updated_at = now()
     where id = p_game_id;
    return;
  end if;

  v_gagnant := case when v_me = v_partie.player1_id
                    then v_partie.player2_id else v_partie.player1_id end;

  update public.games
     set status = 'finished', outcome = 'forfeit', winner_id = v_gagnant, updated_at = now()
   where id = p_game_id;

  perform public.p4_annonce(
    v_partie,
    public.p4_nom(v_me) || ' a abandonné : ' || public.p4_nom(v_gagnant)
      || ' gagne la partie de Puissance 4.'
  );
end $$;

grant execute on function
  public.p4_annonce(public.games, text),
  public.p4_nom(uuid)
to authenticated;
