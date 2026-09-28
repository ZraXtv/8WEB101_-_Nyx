-- ============================================================
-- Les salons n'affichent plus d'accusé de lecture.
--
-- 0005 avait ouvert la lecture de `channel_reads` à tous les membres du
-- serveur, uniquement pour calculer ces accusés. La fonctionnalité ayant été
-- retirée, on referme : savoir qui a lu quoi et quand n'a plus à être exposé.
--
-- Chacun ne voit donc à nouveau que son propre curseur, qui reste écrit à
-- l'ouverture d'un salon et servira à un futur indicateur de non-lus.
--
-- À exécuter APRÈS 0007. Rejouable sans risque.
-- ============================================================

drop policy if exists "on voit les curseurs des salons de ses serveurs" on public.channel_reads;
drop policy if exists "on voit son propre curseur de salon"             on public.channel_reads;

create policy "on voit son propre curseur de salon"
  on public.channel_reads for select to authenticated
  using (profile_id = auth.uid());

-- Plus aucun client ne s'y abonne : inutile de répliquer la table.
do $$ begin
  alter publication supabase_realtime drop table public.channel_reads;
exception when undefined_object then null;
end $$;
