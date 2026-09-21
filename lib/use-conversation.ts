'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Author, ChatMessage, MessageSource } from '@/lib/types'

const PAGE_SIZE = 50

/** Au-delà de ce délai sans nouvel événement, on considère que la frappe a cessé. */
const FRAPPE_EXPIRATION_MS = 4000
/** On ne prévient les autres qu'une fois par intervalle, pas à chaque touche. */
const FRAPPE_INTERVALLE_MS = 2000

const SELECT =
  'id, author_id, guest_name, guest_id, content, kind, created_at, edited_at,' +
  ' author:profiles(id, username, display_name, avatar_url)'

type Params = {
  source: MessageSource | null
  currentUserId: string
  authorCache: React.RefObject<Map<string, Author>>
  /** Profil de l'utilisateur courant, diffusé aux autres pendant la frappe. */
  me: Author | null
  /**
   * Les autres participants du fil : l'interlocuteur pour un message privé,
   * les autres membres du serveur pour un salon. Un message n'est « lu » que
   * lorsque tous l'ont lu.
   */
  otherParticipantIds: string[]
}

/**
 * Charge l'historique d'un fil, s'abonne au temps réel, expose l'envoi,
 * les accusés de lecture et l'indicateur de frappe.
 *
 * Salons de serveur et messages privés vivent dans deux tables distinctes mais
 * se comportent à l'identique : une seule implémentation pour les deux évite
 * que les corrections faites d'un côté manquent de l'autre.
 */
export function useConversation({
  source,
  currentUserId,
  authorCache,
  me,
  otherParticipantIds,
}: Params) {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Date jusqu'à laquelle TOUS les autres participants ont lu, c'est-à-dire le
   * plus ancien de leurs curseurs. `null` tant que l'un d'eux n'a jamais ouvert
   * le fil : on ne peut alors rien affirmer.
   */
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null)
  const [cursors, setCursors] = useState<Record<string, string>>({})
  const [typingNames, setTypingNames] = useState<string[]>([])

  const kind = source?.kind ?? null
  const id = source?.id ?? null

  const canal = useRef<RealtimeChannel | null>(null)
  const derniereFrappeEnvoyee = useRef(0)
  const frappeurs = useRef(new Map<string, { name: string; at: number }>())

  // ── Historique ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!kind || !id) {
      setMessages([])
      setCursors({})
      return
    }

    let annule = false
    setLoading(true)
    setError(null)
    setCursors({})

    // Branchement explicite plutôt qu'un nom de table calculé : c'est ce qui
    // permet à TypeScript de vérifier que la colonne de filtrage existe.
    const requete =
      kind === 'channel'
        ? supabase.from('messages').select(SELECT).eq('channel_id', id)
        : supabase.from('direct_messages').select(SELECT).eq('conversation_id', id)

    requete
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .then(({ data, error: erreur }) => {
        if (annule) return

        if (erreur) {
          setError('Impossible de charger les messages.')
        } else {
          const rows = (data ?? []) as unknown as (ChatMessage & {
            guest_name?: string | null
            guest_id?: string | null
          })[]

          for (const row of rows) {
            if (row.author) {
              authorCache.current?.set(row.author.id, row.author)
            } else if (row.guest_name) {
              row.author = {
                id: row.guest_id ?? 'guest',
                username: row.guest_name,
                display_name: row.guest_name,
                avatar_url: null,
              } as unknown as Author
            }
          }
          // Trié du plus récent au plus ancien pour que LIMIT prenne les
          // derniers ; on remet ensuite dans l'ordre de lecture.
          setMessages(rows.slice().reverse())
        }
        setLoading(false)
      })

    // Curseurs de lecture : uniquement pour les messages privés. Les salons
    // n'affichent pas d'accusé, inutile d'interroger la table ni de s'y abonner.
    if (kind === 'dm') {
      supabase
        .from('dm_reads')
        .select('profile_id, last_read_at')
        .eq('conversation_id', id)
        .then(({ data }) => {
          if (annule) return
          const parProfil: Record<string, string> = {}
          for (const row of data ?? []) parProfil[row.profile_id] = row.last_read_at
          setCursors(parProfil)
        })
    }

    return () => {
      annule = true
    }
  }, [kind, id, currentUserId, supabase, authorCache])

  // ── Temps réel : messages, accusés de lecture, frappe ────────────────────
  useEffect(() => {
    if (!kind || !id) return

    const table = kind === 'channel' ? 'messages' : 'direct_messages'
    const column = kind === 'channel' ? 'channel_id' : 'conversation_id'

    const abonnement = supabase
      // `self: false` : inutile de recevoir l'écho de sa propre frappe.
      .channel(`${table}:${id}`, { config: { broadcast: { self: false } } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `${column}=eq.${id}` },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            const supprime = payload.old as { id: string }
            setMessages((prev) => prev.filter((m) => m.id !== supprime.id))
            return
          }

          const row = payload.new as Omit<ChatMessage, 'author'> & {
            guest_name?: string | null
            guest_id?: string | null
          }

          // Une annonce de l'application n'a pas d'auteur à résoudre.
          let author = row.author_id ? (authorCache.current?.get(row.author_id) ?? null) : null

          if (!author && row.author_id) {
            const { data } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .eq('id', row.author_id)
              .single()
            if (data) {
              author = data
              authorCache.current?.set(data.id, data)
            }
          } else if (!author && row.guest_name) {
            author = {
              id: row.guest_id ?? 'guest',
              username: row.guest_name,
              display_name: row.guest_name,
              avatar_url: null,
            } as unknown as Author
          }

          setMessages((prev) => {
            const arrivant: ChatMessage = { ...row, author }

            // Nos propres messages sont déjà affichés en optimiste : on remplace
            // la version provisoire au lieu d'ajouter un doublon.
            const provisoire = prev.findIndex(
              (m) =>
                m.pending &&
                ((arrivant.author_id && m.author_id === arrivant.author_id) ||
                  (!arrivant.author_id && !m.author_id)) &&
                m.content === arrivant.content,
            )
            if (provisoire !== -1) {
              const suite = prev.slice()
              suite[provisoire] = arrivant
              return suite
            }

            const existant = prev.findIndex((m) => m.id === arrivant.id)
            if (existant !== -1) {
              const suite = prev.slice()
              suite[existant] = arrivant
              return suite
            }

            return [...prev, arrivant]
          })
        },
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { userId, name } = (payload ?? {}) as { userId?: string; name?: string }
        if (!userId || userId === currentUserId || !name) return

        frappeurs.current.set(userId, { name, at: Date.now() })
        setTypingNames([...frappeurs.current.values()].map((f) => f.name))
      })

    if (kind === 'dm') {
      abonnement.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dm_reads', filter: `conversation_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { profile_id?: string; last_read_at?: string }
          if (!row?.profile_id || !row.last_read_at) return
          setCursors((prev) => ({ ...prev, [row.profile_id!]: row.last_read_at! }))
        },
      )
    }

    abonnement.subscribe()
    canal.current = abonnement

    return () => {
      canal.current = null
      frappeurs.current.clear()
      setTypingNames([])
      supabase.removeChannel(abonnement)
    }
  }, [kind, id, currentUserId, supabase, authorCache])

  // « Lu » = le plus ancien curseur parmi les autres participants. Si l'un
  // d'eux n'a jamais ouvert le fil, on n'affiche pas d'accusé.
  useEffect(() => {
    if (otherParticipantIds.length === 0) {
      setOtherReadAt(null)
      return
    }

    let minimum: string | null = null
    for (const participant of otherParticipantIds) {
      const curseur = cursors[participant]
      if (!curseur) {
        setOtherReadAt(null)
        return
      }
      if (minimum === null || curseur < minimum) minimum = curseur
    }
    setOtherReadAt(minimum)
  }, [cursors, otherParticipantIds])

  // Les événements de frappe n'ont pas d'événement « stop » : on les périme.
  useEffect(() => {
    if (typingNames.length === 0) return

    const timer = setInterval(() => {
      const limite = Date.now() - FRAPPE_EXPIRATION_MS
      let change = false

      for (const [id, info] of frappeurs.current) {
        if (info.at < limite) {
          frappeurs.current.delete(id)
          change = true
        }
      }
      if (change) setTypingNames([...frappeurs.current.values()].map((f) => f.name))
    }, 1000)

    return () => clearInterval(timer)
  }, [typingNames.length])

  // ── Marquer comme lu ─────────────────────────────────────────────────────
  const marquerLu = useCallback(async () => {
    if (!kind || !id) return
    if (!currentUserId || currentUserId === 'guest-user') return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

    const maintenant = new Date().toISOString()

    if (kind === 'channel') {
      // Rien ne l'affiche aujourd'hui : ce curseur est la base d'un futur
      // indicateur de salons non lus. L'écriture est d'une requête par ouverture.
      await supabase
        .from('channel_reads')
        .upsert(
          { channel_id: id, profile_id: currentUserId, last_read_at: maintenant },
          { onConflict: 'channel_id,profile_id' },
        )
    } else {
      await supabase
        .from('dm_reads')
        .upsert(
          { conversation_id: id, profile_id: currentUserId, last_read_at: maintenant },
          { onConflict: 'conversation_id,profile_id' },
        )
    }
  }, [kind, id, currentUserId, supabase])

  // À l'ouverture du fil, à chaque nouveau message, et au retour sur l'onglet.
  const dernierMessageId = messages[messages.length - 1]?.id
  useEffect(() => {
    if (!kind || !id) return

    void marquerLu()
    const onVisible = () => void marquerLu()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [kind, id, dernierMessageId, marquerLu])

  // ── Envoi ────────────────────────────────────────────────────────────────
  const send = useCallback(
    async (content: string) => {
      if (!kind || !id) return

      const isGuest = !currentUserId || currentUserId === 'guest-user'

      let guestId: string | null = null
      let guestName: string | null = null
      if (isGuest && typeof window !== 'undefined') {
        guestId = localStorage.getItem('guest_id')
        if (!guestId) {
          guestId = `guest_${crypto.randomUUID().slice(0, 8)}`
          localStorage.setItem('guest_id', guestId)
        }
        guestName = me?.display_name ?? 'Invité'
      }

      const tempId = `temp-${crypto.randomUUID()}`
      const optimiste: ChatMessage = {
        id: tempId,
        author_id: isGuest ? null : currentUserId,
        content,
        kind: 'user',
        created_at: new Date().toISOString(),
        edited_at: null,
        author: isGuest
          ? ({
              id: guestId ?? 'guest',
              username: guestName ?? 'Invité',
              display_name: guestName ?? 'Invité',
              avatar_url: null,
            } as unknown as Author)
          : (authorCache.current?.get(currentUserId) ?? null),
        pending: true,
      }
      setMessages((prev) => [...prev, optimiste])

      const payload = isGuest
        ? {
            channel_id: id,
            author_id: null,
            content,
            guest_id: guestId,
            guest_name: guestName,
          }
        : {
            channel_id: id,
            author_id: currentUserId,
            content,
          }

      const { error: erreur } =
        kind === 'channel'
          ? await supabase.from('messages').insert(payload as any)
          : await supabase
              .from('direct_messages')
              .insert({ conversation_id: id, author_id: currentUserId, content })

      if (erreur) {
        console.error('Erreur Supabase insert message:', erreur)
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        setError("Le message n'a pas pu être envoyé.")
      }
    },
    [kind, id, currentUserId, me, supabase, authorCache],
  )

  /**
   * Signale que l'utilisateur est en train d'écrire.
   *
   * Diffusé par le canal temps réel, sans passer par la base : l'information
   * ne vaut que quelques secondes et n'a aucune raison d'être conservée.
   */
  const notifyTyping = useCallback(() => {
    const maintenant = Date.now()
    if (!canal.current || !me) return
    if (maintenant - derniereFrappeEnvoyee.current < FRAPPE_INTERVALLE_MS) return

    derniereFrappeEnvoyee.current = maintenant
    void canal.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId, name: me.display_name },
    })
  }, [currentUserId, me])

  /** Met à jour sur place les messages d'un auteur dont le profil a changé. */
  const refreshAuthor = useCallback((author: Author) => {
    setMessages((prev) => prev.map((m) => (m.author_id === author.id ? { ...m, author } : m)))
  }, [])

  return { messages, loading, error, send, refreshAuthor, otherReadAt, typingNames, notifyTyping }
}