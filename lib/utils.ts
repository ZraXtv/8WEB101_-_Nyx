import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Faut-il contourner l'optimiseur d'images de Next pour cette source ?
 *
 * Oui dans deux cas seulement : un aperçu local (`blob:`, produit avant
 * l'envoi d'un fichier), que le serveur ne peut pas aller chercher ; et un
 * SVG, que l'optimiseur refuse par défaut.
 *
 * Partout ailleurs il faut le laisser travailler : une photo de profil pèse
 * jusqu'à 2 Mo et s'affiche dans une pastille de 36 px. Sans optimisation, ces
 * 2 Mo sont téléchargés en entier, pour chaque interlocuteur.
 */
export function imageNonOptimisable(src: string): boolean {
  return !src.startsWith('https://') || src.toLowerCase().endsWith('.svg')
}
