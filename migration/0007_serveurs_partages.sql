-- ============================================================
-- Serveurs partagés : invitations, rôles, icône.
--
-- Jusqu'ici un serveur ne pouvait être rejoint que s'il était public, et rien
-- ne permettait de le rendre public ni de partager un code. Les serveurs
-- étaient donc mono-utilisateur en pratique.
--
-- À exécuter APRÈS 0006. Rejouable sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- Rejoindre par code d'invitation.
--
-- Passe par une fonction car on ne peut pas voir un serveur dont on n'est pas
-- encore membre : la RLS de `servers` l'interdit, et c'est voulu.
-- ------------------------------------------------------------
create or replace function public.join_server_by_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_serveur uuid;
begin
  if v_me is null then
    raise exception 'Tu dois être connecté.' using errcode = '28000';
  end if;

  select id into v_serveur from public.servers
   where invite_code = lower(trim(p_code));

  if v_serveur is null then
    raise exception 'Code d’invitation invalide.' using errcode = 'P0002';
  end if;

  -- Déjà membre : on renvoie simplement le serveur, sans erreur.
  insert into public.server_members (server_id, profile_id, role)
  values (v_serveur, v_me, 'member')
  on conflict (server_id, profile_id) do nothing;

  return v_serveur;
end $$;

-- ------------------------------------------------------------
-- Renouveler le code (si un ancien code a fuité).
-- ------------------------------------------------------------
create or replace function public.regenerate_invite_code(p_server_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.has_server_role(p_server_id, array['owner', 'admin']::public.server_role[]) then
    raise exception 'Réservé au propriétaire et aux administrateurs.' using errcode = '42501';
  end if;

  v_code := encode(gen_random_bytes(6), 'hex');
  update public.servers set invite_code = v_code, updated_at = now() where id = p_server_id;
  return v_code;
end $$;

-- ------------------------------------------------------------
-- Changer le rôle d'un membre.
--
-- Par fonction plutôt que par politique : une politique ne peut pas empêcher
-- quelqu'un de s'auto-promouvoir en modifiant sa propre ligne.
-- ------------------------------------------------------------
create or replace function public.set_member_role(
  p_server_id  uuid,
  p_profile_id uuid,
  p_role       public.server_role
)
returns void language plpgsql security definer set search_path = public as $$
declare v_proprietaire uuid;
begin
  select owner_id into v_proprietaire from public.servers where id = p_server_id;

  if v_proprietaire is null then
    raise exception 'Serveur introuvable.' using errcode = 'P0002';
  end if;

  if v_proprietaire <> auth.uid() then
    raise exception 'Seul le propriétaire attribue les rôles.' using errcode = '42501';
  end if;

  if p_profile_id = v_proprietaire then
    raise exception 'Le propriétaire garde son rôle.' using errcode = 'P0001';
  end if;

  if p_role = 'owner' then
    raise exception 'Le transfert de propriété n’est pas géré.' using errcode = 'P0001';
  end if;

  update public.server_members
     set role = p_role
   where server_id = p_server_id and profile_id = p_profile_id;
end $$;

-- ------------------------------------------------------------
-- Appartenance : qui peut modifier quoi
-- ------------------------------------------------------------

-- Un membre ne modifie que son propre surnom. La restriction est posée au
-- niveau des privilèges de colonne : une politique RLS s'applique à la ligne
-- entière et ne saurait pas distinguer `nickname` de `role`.
revoke update on public.server_members from authenticated;
grant update (nickname) on public.server_members to authenticated;

drop policy if exists "on modifie son propre pseudo de serveur" on public.server_members;
drop policy if exists "on modifie son propre surnom"            on public.server_members;

create policy "on modifie son propre surnom"
  on public.server_members for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Exclusion et départ volontaire. La ligne du propriétaire est intouchable :
-- sans ça, un administrateur pourrait l'évincer, ou le propriétaire quitter
-- son propre serveur en le laissant sans responsable.
drop policy if exists "on quitte un serveur, owner et admin peuvent exclure" on public.server_members;
drop policy if exists "on quitte un serveur, sauf le propriétaire"           on public.server_members;

create policy "on quitte un serveur, sauf le propriétaire"
  on public.server_members for delete to authenticated
  using (
    role <> 'owner'
    and (
      profile_id = auth.uid()
      or public.has_server_role(server_id, array['owner', 'admin']::public.server_role[])
    )
  );

-- ------------------------------------------------------------
-- Icônes de serveur
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'server-icons', 'server-icons', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "icones_lecture_publique" on storage.objects;
drop policy if exists "icones_gestion_depot"    on storage.objects;
drop policy if exists "icones_gestion_maj"      on storage.objects;
drop policy if exists "icones_gestion_suppr"    on storage.objects;

create policy "icones_lecture_publique"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'server-icons');

-- Le premier dossier porte l'identifiant du serveur : seuls son propriétaire
-- et ses administrateurs peuvent y écrire.
create policy "icones_gestion_depot"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'server-icons'
    and public.has_server_role(
      ((storage.foldername(name))[1])::uuid,
      array['owner', 'admin']::public.server_role[]
    )
  );

create policy "icones_gestion_maj"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'server-icons'
    and public.has_server_role(
      ((storage.foldername(name))[1])::uuid,
      array['owner', 'admin']::public.server_role[]
    )
  );

create policy "icones_gestion_suppr"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'server-icons'
    and public.has_server_role(
      ((storage.foldername(name))[1])::uuid,
      array['owner', 'admin']::public.server_role[]
    )
  );

-- ------------------------------------------------------------
-- Privilèges
-- ------------------------------------------------------------
grant execute on function
  public.join_server_by_invite(text),
  public.regenerate_invite_code(uuid),
  public.set_member_role(uuid, uuid, public.server_role)
to authenticated;
