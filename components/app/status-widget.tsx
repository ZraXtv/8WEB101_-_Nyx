import { Hash } from 'lucide-react'

/**
 * Rappel du serveur courant. Rendu à l'intérieur de la zone de discussion,
 * juste sous l'en-tête :
 *  - sur téléphone, c'est un bandeau d'une ligne, dans le flux, qui décale les
 *    messages au lieu de passer par-dessus ;
 *  - à partir de « xl », il redevient une carte flottante en haut à droite,
 *    calée sous la ligne de l'en-tête (h-16 = 64 px, donc top-20 = 80 px).
 *
 * Le seuil est « xl » et non « sm » par géométrie : le fil de messages est
 * centré sur 576 px (max-w-xl), la carte occupe 224 px à droite ; en dessous
 * de 1024 px elle mordrait donc sur les bulles.
 */
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
      className="flex shrink-0 items-center gap-3 border-b border-border bg-card/40 px-4 py-2 xl:absolute xl:right-4 xl:top-20 xl:z-30 xl:block xl:w-52 xl:rounded-2xl xl:border xl:bg-card/70 xl:p-3 xl:backdrop-blur-xl"
      aria-label="Serveur courant"
    >
      <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
        <Hash className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <span className="text-[11px] font-medium uppercase tracking-wider">Serveur</span>
      </div>

      <p className="min-w-0 flex-1 truncate font-heading text-sm font-bold text-foreground xl:mt-2 xl:text-lg">
        {serverName}
      </p>

      <p className="shrink-0 text-xs text-muted-foreground">
        {channelCount} salon{channelCount > 1 ? 's' : ''}
      </p>
    </div>
  )
}
