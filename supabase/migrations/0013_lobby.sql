-- =============================================================================
-- Migration: 0013_lobby.sql
-- Description: Configuration du Lobby public pour les visiteurs et inscrits
-- =============================================================================

-- 1. Rendre author_id optionnel et ajouter les colonnes d'invité
ALTER TABLE public.messages
  ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_id text;

-- 2. Contrainte d'intégrité : soit un compte authentifié, soit un invité complet
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS check_author_or_guest;

ALTER TABLE public.messages
  ADD CONSTRAINT check_author_or_guest
  CHECK (
    (author_id IS NOT NULL) OR 
    (author_id IS NULL AND guest_name IS NOT NULL AND guest_id IS NOT NULL)
  );

-- 3. Création du serveur système et du salon lobby avec UUIDs fixes
-- Serveur parent obligatoire pour respecter la clé étrangère de channels(server_id)
INSERT INTO public.servers (id, name, owner_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Communauté',
  (SELECT id FROM auth.users LIMIT 1)
)
ON CONFLICT (id) DO NOTHING;

-- Salon Lobby public lié à ChatWorkspace
INSERT INTO public.channels (id, server_id, name)
VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000001',
  'lobby'
)
ON CONFLICT (id) DO NOTHING;

-- 4. Nettoyage des anciennes politiques si existantes
DROP POLICY IF EXISTS "Lecture des messages du lobby par tous" ON public.messages;
DROP POLICY IF EXISTS "Écriture anonyme dans le lobby" ON public.messages;
DROP POLICY IF EXISTS "Écriture dans le lobby pour tous" ON public.messages;

-- 5. Politique de lecture : accessible aux anonymes (anon) et connectés (authenticated)
CREATE POLICY "Lecture des messages du lobby par tous"
  ON public.messages
  FOR SELECT
  TO anon, authenticated
  USING (
    channel_id = '00000000-0000-0000-0000-000000000099'
  );

-- 6. Politique d'insertion : les visiteurs non connectés (anon) et utilisateurs (authenticated)
CREATE POLICY "Écriture dans le lobby pour tous"
  ON public.messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    channel_id = '00000000-0000-0000-0000-000000000099'
    AND (
      -- Cas utilisateur connecté
      (auth.uid() IS NOT NULL AND author_id = auth.uid())
      OR
      -- Cas invité / anonyme
      (auth.uid() IS NULL AND author_id IS NULL AND guest_name IS NOT NULL AND guest_id IS NOT NULL)
    )
  );