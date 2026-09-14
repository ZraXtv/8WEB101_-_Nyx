'use client'

import { useState } from 'react'
import { SendHorizontal } from 'lucide-react'

const MAX_LENGTH = 4000

export function MessageComposer({
  destination,
  onSend,
  onTyping,
}: {
  /** « #salon » ou le nom de l'interlocuteur, pour l'invite de saisie. */
  destination: string
  onSend: (content: string) => Promise<void>
  /** Prévient les autres participants que l'on est en train d'écrire. */
  onTyping: () => void
}) {
  const [value, setValue] = useState('')

  async function submit() {
    const content = value.trim()
    if (!content) return

    setValue('')
    await onSend(content)
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex w-full max-w-xl items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-2 backdrop-blur-xl"
      >
        <label htmlFor="composer" className="sr-only">
          Écrire dans {destination}
        </label>
        <input
          id="composer"
          value={value}
          maxLength={MAX_LENGTH}
          onChange={(event) => {
            setValue(event.target.value)
            if (event.target.value.trim()) onTyping()
          }}
          placeholder={`Écrire dans ${destination}…`}
          autoComplete="off"
          className="h-9 flex-1 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="Envoyer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <SendHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
