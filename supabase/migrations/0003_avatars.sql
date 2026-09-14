-- ============================================================
-- Photos de profil : bucket de stockage + règles d'accès.
--
-- À exécuter APRÈS 0001 et 0002. Rejouable sans risque.
-- ============================================================

-- Bucket public en lecture : l'URL d'une photo de profil doit être affichable
-- par tous les membres d'un serveur sans passer par une URL signée.
-- Les limites (2 Mo, images uniquement) sont appliquées par le stockage
-- lui-même, donc impossibles à contourner depuis le navigateur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Les politiques sont recréées à chaque exécution pour rester rejouables.
drop policy if exists "avatars_lecture_publique"   on storage.objects;
drop policy if exists "avatars_depot_personnel"    on storage.objects;
drop policy if exists "avatars_remplacement"       on storage.objects;
drop policy if exists "avatars_suppression"        on storage.objects;

create policy "avatars_lecture_publique"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

-- Chaque fichier vit dans un dossier nommé d'après l'identifiant de son
-- propriétaire : storage.foldername('<uid>/photo.png')[1] vaut '<uid>'.
-- Personne ne peut donc écrire dans le dossier d'un autre.
create policy "avatars_depot_personnel"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_remplacement"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_suppression"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
