import { Hash } from 'lucide-react'

export function StatusWidget({
  serverName,
  channelCount,
}: {
  serverName: string | null
  channelCount: number
}) {
  if (!serverName) return null

  return (
    <div
      className="fixed right-4 top-4 z-30 w-44 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:w-52"
      aria-label="Serveur courant"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Hash className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <span className="text-[11px] font-medium uppercase tracking-wider">Serveur</span>
      </div>
      <p className="mt-2 truncate font-heading text-lg font-bold text-foreground">{serverName}</p>
      <p className="text-xs text-muted-foreground">
        {channelCount} salon{channelCount > 1 ? 's' : ''}
      </p>
    </div>
  )
}
