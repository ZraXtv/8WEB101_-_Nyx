-- 1. Rendre author_id optionnel et ajouter les colonnes d'invité
ALTER TABLE public.messages
  ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_id text;

-- 2. Contrainte d'intégrité : soit un auteur enregistré, soit un invité complet
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS check_author_or_guest;

ALTER TABLE public.messages
  ADD CONSTRAINT check_author_or_guest
  CHECK (
    (author_id IS NOT NULL) OR 
    (author_id IS NULL AND guest_name IS NOT NULL AND guest_id IS NOT NULL)
  );

-- 3. Canal public dédié pour le lobby (s'il n'existe pas déjà)
-- Adaptez si vous avez déjà un salon public ou un serveur système.
-- 4. Ajustement des politiques RLS sur messages
-- Permettre la lecture publique des messages du lobby aux anonymes
CREATE POLICY "Lecture des messages du lobby par tous"
  ON public.messages
  FOR SELECT
  TO anon, authenticated
  USING (
    -- Remplacez par la condition de votre salon lobby (ex: channel_id = 'public-lobby' ou canal public)
    channel_id IN (SELECT id FROM public.channels WHERE name = 'lobby' OR name = 'general')
  );

-- Permettre l'écriture des messages du lobby aux invités non connectés
CREATE POLICY "Écriture anonyme dans le lobby"
  ON public.messages
  FOR INSERT
  TO anon
  WITH CHECK (
    author_id IS NULL 
    AND guest_name IS NOT NULL 
    AND guest_id IS NOT NULL
  );