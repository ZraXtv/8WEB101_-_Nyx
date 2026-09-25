/**
 * Client Supabase, partagé par toute l'application.
 *
 * La bibliothèque est servie par le projet lui-même (vendor/supabase.js) et
 * non par un CDN : la page fonctionne hors ligne, et aucune adresse IP de
 * visiteur n'est transmise à un tiers.
 */

function configManquante(raison) {
  document.body.innerHTML = `
    <div style="max-width:34rem;margin:15vh auto;padding:2rem;font-family:system-ui;line-height:1.6">
      <h1 style="font-size:1.25rem;margin-bottom:.75rem">Configuration manquante</h1>
      <p style="opacity:.8">${raison}</p>
      <p style="opacity:.8;margin-top:1rem">
        Copie <code>config.exemple.js</code> en <code>config.js</code>, puis renseigne
        l'URL et la clé publiable de ton projet Supabase.
      </p>
    </div>`
  throw new Error(raison)
}

if (!window.CONFIG) {
  configManquante('Le fichier <code>config.js</code> est absent.')
}

const { SUPABASE_URL, SUPABASE_KEY } = window.CONFIG

if (!SUPABASE_URL || SUPABASE_URL.includes('<ref-du-projet>')) {
  configManquante('<code>SUPABASE_URL</code> n’a pas été renseignée dans <code>config.js</code>.')
}
if (!SUPABASE_KEY || SUPABASE_KEY.includes('xxxx')) {
  configManquante('<code>SUPABASE_KEY</code> n’a pas été renseignée dans <code>config.js</code>.')
}

if (!window.supabase?.createClient) {
  configManquante('La bibliothèque Supabase n’a pas été chargée (vendor/supabase.js).')
}

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
