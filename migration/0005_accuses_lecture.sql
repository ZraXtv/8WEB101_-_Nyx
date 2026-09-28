-- ============================================================
-- Accusés de lecture : messages privés ET salons de serveur.
--
-- On stocke un curseur par personne et par conversation, pas un accusé par
-- message : sinon la table grossit en nombre_de_messages × participants.
-- « Lu » se déduit en comparant la date du message à ce curseur.
--
-- À exécuter APRÈS 0004. Rejouable sans risque.
-- ============================================================

create table if not exists public.dm_reads (
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),

  primary key (conversation_id, profile_id)
);

alter table public.dm_reads enable row level security;

drop policy if exists "on voit les curseurs de ses conversations" on public.dm_reads;
drop policy if exists "on crée son propre curseur"                on public.dm_reads;
drop policy if exists "on ne déplace que son propre curseur"      on public.dm_reads;

-- Lecture ouverte aux deux participants : c'est ce qui permet à l'expéditeur
-- de savoir que son message a été lu.
create policy "on voit les curseurs de ses conversations"
  on public.dm_reads for select to authenticated
  using (public.is_dm_participant(conversation_id));

create policy "on crée son propre curseur"
  on public.dm_reads for insert to authenticated
  with check (profile_id = auth.uid() and public.is_dm_participant(conversation_id));

create policy "on ne déplace que son propre curseur"
  on public.dm_reads for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update on public.dm_reads to authenticated;

-- Pour que l'expéditeur voie l'accusé arriver sans rafraîchir.
alter table public.dm_reads replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.dm_reads;
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- Salons de serveur.
--
-- 0001 créait `channel_reads` avec une politique « chacun ne voit que son
-- propre curseur » : impossible, dans ces conditions, de savoir si les autres
-- ont lu. On ouvre la lecture aux membres du serveur, l'écriture restant
-- limitée à son propre curseur.
-- ------------------------------------------------------------

drop policy if exists "chacun ne voit que ses propres curseurs de lecture" on public.channel_reads;
drop policy if exists "on voit les curseurs des salons de ses serveurs"    on public.channel_reads;
drop policy if exists "on crée son propre curseur de salon"                on public.channel_reads;
drop policy if exists "on ne déplace que son propre curseur de salon"      on public.channel_reads;
drop policy if exists "on supprime son propre curseur de salon"            on public.channel_reads;

create policy "on voit les curseurs des salons de ses serveurs"
  on public.channel_reads for select to authenticated
  using (public.is_server_member(public.channel_server_id(channel_id)));

create policy "on crée son propre curseur de salon"
  on public.channel_reads for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.is_server_member(public.channel_server_id(channel_id))
  );

create policy "on ne déplace que son propre curseur de salon"
  on public.channel_reads for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "on supprime son propre curseur de salon"
  on public.channel_reads for delete to authenticated
  using (profile_id = auth.uid());

alter table public.channel_reads replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.channel_reads;
exception when duplicate_object then null;
end $$;
