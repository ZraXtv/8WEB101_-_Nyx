import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Photo de profil, avec repli sur l'initiale quand aucune image n'est définie.
 *
 * `unoptimized` : les photos sont servies depuis Supabase Storage et déjà
 * limitées à 2 Mo ; les faire transiter par l'optimiseur d'images de Next
 * n'apporterait rien et imposerait de déclarer le domaine.
 */
export function Avatar({
  src,
  name,
  size = 36,
  className,
  online,
}: {
  src: string | null | undefined
  name: string
  size?: number
  className?: string
  /** `undefined` = on n'affiche aucune pastille (présence inconnue ou sans objet). */
  online?: boolean
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn('relative inline-block shrink-0', className)}
    >
      <span className="absolute inset-0 overflow-hidden rounded-full bg-secondary ring-1 ring-border">
      {src ? (
        <Image
          src={src}
          alt={`Photo de profil de ${name}`}
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized
        />
      ) : (
        <span
          aria-hidden="true"
          style={{ fontSize: Math.round(size * 0.42) }}
          className="flex h-full w-full items-center justify-center font-heading font-bold text-muted-foreground"
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      </span>

      {online !== undefined && (
        <span
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28) }}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-card',
            online ? 'bg-emerald-500' : 'bg-muted-foreground/50',
          )}
          aria-label={online ? 'En ligne' : 'Hors ligne'}
          role="img"
        />
      )}
    </span>
  )
}
