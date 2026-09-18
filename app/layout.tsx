import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Inter } from 'next/font/google'
import './globals.css'

const bodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-body',
})

const headingFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-heading',
})

export const metadata: Metadata = {
  title: 'Nyx — Messagerie de la communauté',
  description:
    'Messagerie communautaire : serveurs et salons, amis, messages privés et suivi sportif.',
  // Les quatre icônes déclarées ici renvoyaient toutes un 404 : aucune n'était
  // présente dans public/. Le carré sombre frappé d'un N les remplace, en SVG
  // pour les navigateurs récents et en PNG pour le reste.
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#141924',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning : les extensions de navigateur (Dark Reader,
    // Grammarly, gestionnaires de mots de passe) ajoutent leurs propres
    // attributs sur <html> et <body> avant que React n'hydrate la page. Le
    // rendu du serveur ne correspond alors plus à celui du navigateur, et
    // React signale une erreur pour quelque chose qui ne vient pas du projet.
    //
    // L'effet est volontairement limité : la suppression ne vaut que pour les
    // attributs de CES deux balises, pas pour leur contenu. Une vraie
    // incohérence d'hydratation ailleurs dans l'arbre sera toujours signalée.
    <html
      lang="en"
      className={`dark bg-background ${bodyFont.variable} ${headingFont.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased font-sans" suppressHydrationWarning>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
