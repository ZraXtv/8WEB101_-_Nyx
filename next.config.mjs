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
  images: {
    unoptimized: true,
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
