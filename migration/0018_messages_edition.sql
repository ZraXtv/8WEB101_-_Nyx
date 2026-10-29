-- ============================================================
-- 0018_messages_edition.sql
-- Répondre à un message, le modifier, le supprimer.
--
-- Réponse : une colonne `reply_to` pointe vers le message cité. Un déclencheur
-- vérifie qu'il appartient au même fil : on ne cite pas un salon où l'on n'est
-- pas.
--
-- Suppression : le message n'est pas effacé mais vidé et daté (`deleted_at`).
-- Le fil garde sa place et affiche « Le message a été supprimé. », et les
-- réponses qui le citaient restent compréhensibles. Le texte, lui, disparaît
-- vraiment de la base.
--
-- Modification et suppression passent par deux fonctions. La règle d'UPDATE
-- directe est retirée : elle laissait l'auteur changer n'importe quelle
-- colonne de sa ligne — déplacer son message dans un autre salon, le dater
-- d'avant-hier ou le faire passer pour une annonce de l'application.
--
-- À exécuter APRÈS 0017. Rejouable sans risque.
-- ============================================================

alter table public.messages        add column if not exists reply_to   uuid;
alter table public.messages        add column if not exists deleted_at timestamptz;
alter table public.direct_messages add column if not exists reply_to   uuid;
alter table public.direct_messages add column if not exists deleted_at timestamptz;

do $$ begin
  alter table public.messages add constraint messages_reply_to_fkey
    foreign key (reply_to) references public.messages (id) on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.direct_messages add constraint direct_messages_reply_to_fkey
    foreign key (reply_to) references public.direct_messages (id) on delete set null;
exception when duplicate_object then null;
end $$;

-- Un message supprimé est vide : la longueur n'est exigée que des autres.
alter table public.messages        drop constraint if exists content_length;
alter table public.direct_messages drop constraint if exists contenu_longueur;

do $$ begin
  alter table public.messages add constraint content_length check (
    (deleted_at is not null and content = '')
    or (deleted_at is null and char_length(content) between 1 and 4000)
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.direct_messages add constraint contenu_longueur check (
    (deleted_at is not null and content = '')
    or (deleted_at is null and char_length(content) between 1 and 4000)
  );
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- Une réponse cite un message du même fil.
-- ------------------------------------------------------------
create or replace function public.verifier_reponse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reply_to is null then
    return new;
  end if;

  if tg_table_name = 'messages' then
    if not exists (select 1 from public.messages
                   where id = new.reply_to and channel_id = new.channel_id) then
      raise exception 'Le message cité n’est pas dans ce salon.' using errcode = 'P0001';
    end if;
  else
    if not exists (select 1 from public.direct_messages
                   where id = new.reply_to and conversation_id = new.conversation_id) then
      raise exception 'Le message cité n’est pas dans cette conversation.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists verifier_reponse on public.messages;
create trigger verifier_reponse
  before insert on public.messages
  for each row execute function public.verifier_reponse();

drop trigger if exists verifier_reponse on public.direct_messages;
create trigger verifier_reponse
  before insert on public.direct_messages
  for each row execute function public.verifier_reponse();

-- ------------------------------------------------------------
-- Plus d'UPDATE direct : tout passe par les fonctions ci-dessous.
-- ------------------------------------------------------------
drop policy if exists "on ne modifie que ses propres messages"         on public.messages;
drop policy if exists "on ne modifie que ses propres messages privés"  on public.direct_messages;

-- ------------------------------------------------------------
-- Modifier : seul l'auteur, seulement le texte.
-- p_fil vaut 'salon' ou 'mp'.
-- ------------------------------------------------------------
create or replace function public.modifier_message(p_fil text, p_id uuid, p_contenu text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_contenu text := btrim(coalesce(p_contenu, ''));
begin
  if char_length(v_contenu) not between 1 and 4000 then
    raise exception 'Le message doit faire entre 1 et 4000 caractères.' using errcode = 'P0001';
  end if;

  if p_fil = 'salon' then
    update public.messages
       set content = v_contenu, edited_at = now()
     where id = p_id and author_id = auth.uid() and kind = 'user' and deleted_at is null;
  elsif p_fil = 'mp' then
    update public.direct_messages
       set content = v_contenu, edited_at = now()
     where id = p_id and author_id = auth.uid() and kind = 'user' and deleted_at is null;
  else
    raise exception 'Fil inconnu.' using errcode = 'P0001';
  end if;

  if not found then
    raise exception 'Ce message ne peut pas être modifié.' using errcode = '42501';
  end if;
end $$;

-- ------------------------------------------------------------
-- Supprimer : l'auteur ; dans un salon, aussi le propriétaire et les
-- administrateurs du serveur, comme le permettait déjà la règle de DELETE.
-- ------------------------------------------------------------
create or replace function public.supprimer_message(p_fil text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_fil = 'salon' then
    update public.messages
       set content = '', deleted_at = now()
     where id = p_id and kind = 'user' and deleted_at is null
       and (author_id = auth.uid()
            or public.has_server_role(public.channel_server_id(channel_id),
                                      array['owner', 'admin']::public.server_role[]));
  elsif p_fil = 'mp' then
    update public.direct_messages
       set content = '', deleted_at = now()
     where id = p_id and kind = 'user' and deleted_at is null and author_id = auth.uid();
  else
    raise exception 'Fil inconnu.' using errcode = 'P0001';
  end if;

  if not found then
    raise exception 'Ce message ne peut pas être supprimé.' using errcode = '42501';
  end if;
end $$;

revoke all on function public.modifier_message(text, uuid, text) from public, anon;
revoke all on function public.supprimer_message(text, uuid)      from public, anon;
grant execute on function public.modifier_message(text, uuid, text) to authenticated;
grant execute on function public.supprimer_message(text, uuid)      to authenticated;
