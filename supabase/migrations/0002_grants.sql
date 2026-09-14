-- ============================================================
-- Privilèges des rôles Supabase.
--
-- La RLS de 0001 ne sert à rien tant que le rôle n'a pas le droit d'accéder
-- à la table : Postgres vérifie d'abord les GRANT, et refuse avec
-- « 42501 permission denied » avant même de regarder les politiques.
--
-- À exécuter APRÈS 0001_init.sql. Rejouable sans risque.
-- ============================================================

grant usage on schema public to anon, authenticated;

-- `authenticated` obtient l'accès aux tables ; c'est la RLS de 0001 qui décide
-- ensuite, ligne par ligne, ce qu'il peut réellement lire ou écrire.
grant select, insert, update, delete on
  public.profiles,
  public.servers,
  public.server_members,
  public.channels,
  public.messages,
  public.channel_reads
to authenticated;

-- `anon` (visiteur non connecté) ne reçoit volontairement AUCUN accès aux
-- données : la landing est publique, la messagerie ne l'est pas.

-- Fonctions utilisées par les politiques : évaluées avec les droits de
-- l'appelant, elles ont donc besoin d'EXECUTE.
grant execute on function
  public.is_server_member(uuid),
  public.has_server_role(uuid, public.server_role[]),
  public.channel_server_id(uuid),
  public.shares_server_with(uuid)
to authenticated;
