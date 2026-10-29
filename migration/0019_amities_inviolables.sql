-- ============================================================
-- 0019_amities_inviolables.sql
-- Le destinataire d'une demande d'ami ne peut plus la réécrire.
--
-- La faille : la règle d'UPDATE de 0004 vérifiait seulement que l'on était
-- le destinataire de la ligne, et le droit d'UPDATE couvrait toutes les
-- colonnes. Le destinataire de n'importe quelle demande — par exemple une
-- demande envoyée depuis un second compte — pouvait donc remplacer
-- `requester_id` par l'identifiant de quelqu'un d'autre et poser
-- `status = 'accepted'` :
--
--   update friendships set requester_id = '<victime>', status = 'accepted'
--    where id = '<demande reçue>';
--
-- Il devenait ainsi « ami » de la victime sans qu'elle ait rien accepté, et
-- obtenait ce que l'amitié ouvre : son profil, sa présence en ligne, et une
-- conversation privée (get_or_create_dm ne vérifie que le statut).
--
-- La correction, comme pour server_members en 0007 :
--   - le droit d'UPDATE est restreint aux colonnes de réponse (status,
--     responded_at) : les deux participants ne peuvent plus être changés ;
--   - seule une demande EN ATTENTE peut recevoir une réponse, et cette
--     réponse ne peut être qu'accepter ou bloquer.
--
-- À exécuter APRÈS 0004. Rejouable sans risque.
-- ============================================================

revoke update on public.friendships from authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

drop policy if exists "seul le destinataire répond à une demande" on public.friendships;

create policy "seul le destinataire répond à une demande"
  on public.friendships for update to authenticated
  using (addressee_id = auth.uid() and status = 'pending')
  with check (addressee_id = auth.uid() and status in ('accepted', 'blocked'));

-- ------------------------------------------------------------
-- Vérification (facultative) : amitiés dont la réponse précède la demande
-- ou qui n'ont jamais reçu de réponse — une ligne falsifiée a souvent l'une
-- de ces formes. À examiner à la main, rien n'est supprimé automatiquement.
--
--   select id, requester_id, addressee_id, created_at, responded_at
--     from public.friendships
--    where status = 'accepted'
--      and (responded_at is null or responded_at < created_at);
-- ------------------------------------------------------------
