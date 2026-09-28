-- ============================================================
-- Présence : état « reçu » des messages, et indicateur en ligne.
--
-- Dans une application web il n'y a pas d'appareil joignable en permanence,
-- seulement un onglet ouvert ou rien. « Reçu » ne peut donc signifier qu'une
-- chose : le destinataire était connecté à ce moment-là. On le mesure avec un
-- battement écrit par le client tant que sa page est visible.
--
-- Table séparée plutôt qu'une colonne sur `profiles` : un battement toutes les
-- 25 secondes par personne déclencherait sinon le trigger `updated_at` et
-- diffuserait le profil entier en temps réel à chaque fois.
--
-- À exécuter APRÈS 0005. Rejouable sans risque.
-- ============================================================

create table if not exists public.user_presence (
  profile_id   uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;

drop policy if exists "on voit la présence de ses contacts" on public.user_presence;
drop policy if exists "on crée sa propre présence"          on public.user_presence;
drop policy if exists "on met à jour sa propre présence"    on public.user_presence;

-- Même périmètre que la visibilité des profils : les personnes avec qui on
-- partage un serveur, et celles avec qui on a une relation d'amitié.
create policy "on voit la présence de ses contacts"
  on public.user_presence for select to authenticated
  using (
    profile_id = auth.uid()
    or public.shares_server_with(profile_id)
    or public.is_linked_to(profile_id)
  );

create policy "on crée sa propre présence"
  on public.user_presence for insert to authenticated
  with check (profile_id = auth.uid());

create policy "on met à jour sa propre présence"
  on public.user_presence for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update on public.user_presence to authenticated;

alter table public.user_presence replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.user_presence;
exception when duplicate_object then null;
end $$;
