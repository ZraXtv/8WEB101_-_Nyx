-- ============================================================
-- 0014_lobby.sql
-- Création du Lobby Général et ajout automatique des membres.
-- ============================================================

DO $$
DECLARE
  v_owner uuid;
  v_lobby_id uuid;
BEGIN
  -- 1. Trouver le plus ancien utilisateur (ex: vous) pour être le propriétaire du Lobby
  SELECT id INTO v_owner FROM public.profiles ORDER BY created_at ASC LIMIT 1;

  IF v_owner IS NOT NULL THEN
    -- 2. Vérifier si le lobby existe déjà
    SELECT id INTO v_lobby_id FROM public.servers WHERE name = 'Lobby Général' LIMIT 1;

    IF v_lobby_id IS NULL THEN
      -- Création du lobby (le trigger handle_new_server va automatiquement créer le salon #general et ajouter le owner)
      INSERT INTO public.servers (name, description, is_public, owner_id)
      VALUES ('Lobby Général', 'Salon public accessible à tous les membres.', true, v_owner)
      RETURNING id INTO v_lobby_id;
    END IF;

    -- 3. Ajouter tous les autres utilisateurs existants au Lobby
    INSERT INTO public.server_members (server_id, profile_id, role)
    SELECT v_lobby_id, id, 'member'
    FROM public.profiles
    WHERE id != v_owner
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

-- ============================================================
-- Mise à jour du trigger d'inscription
-- Pour que les NOUVEAUX inscrits rejoignent automatiquement le Lobby
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lobby_id uuid;
BEGIN
  -- 1. Insertion du profil de base (Votre code d'origine)
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    new.id,
    coalesce(
      nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
      'user_' || substr(replace(new.id::text, '-', ''), 1, 12)
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'Nouvel utilisateur'
    )
  );

  -- 2. NOUVEAUTÉ : Gestion du Lobby Général
  SELECT id INTO v_lobby_id FROM public.servers WHERE name = 'Lobby Général' LIMIT 1;

  IF v_lobby_id IS NULL THEN
    -- S'il n'y a pas de Lobby (cas exceptionnel du tout 1er utilisateur de la base), il le crée
    INSERT INTO public.servers (name, description, is_public, owner_id)
    VALUES ('Lobby Général', 'Salon public accessible à tous les membres.', true, new.id);
  ELSE
    -- Sinon, le nouvel inscrit rejoint automatiquement le Lobby existant
    INSERT INTO public.server_members (server_id, profile_id, role)
    VALUES (v_lobby_id, new.id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN new;
END;
$$;