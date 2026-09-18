// Domaine du projet Supabase, déduit de la variable d'environnement : les
// photos de profil sont servies depuis son sous-domaine de stockage.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  } catch {
    return null
  }
})()

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next génère sinon AGENTS.md et CLAUDE.md à chaque démarrage.
  agentRules: false,

  images: {
    // L'optimiseur est actif : il sert une vignette de quelques kilo-octets à
    // la place d'une photo de profil qui peut peser 2 Mo. Les sources qui ne
    // peuvent pas y passer sont marquées une par une (voir imageNonOptimisable).
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
  async rewrites() {
    return {
      // La homepage est l'export statique Webflow servi depuis public/home/.
      // `beforeFiles` garantit que "/" tombe sur ce fichier avant tout le reste.
      beforeFiles: [
        { source: '/', destination: '/home/index.html' },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
