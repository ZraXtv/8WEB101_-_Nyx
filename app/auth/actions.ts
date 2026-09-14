'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateEmail, validatePassword, validateUsername } from '@/lib/validation/auth'

export type AuthState = { error: string | null; notice?: string | null }

/** N'accepte qu'un chemin interne, pour éviter une redirection ouverte. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : ''
  return next.startsWith('/') && !next.startsWith('//') ? next : '/chat'
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))

  if (!email || !password) {
    return { error: 'Renseigne ton e-mail et ton mot de passe.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Message volontairement vague : ne pas révéler si le compte existe.
    return { error: 'E-mail ou mot de passe incorrect.' }
  }

  revalidatePath('/', 'layout')
  redirect(next)
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const username = String(formData.get('username') ?? '').trim().toLowerCase()
  const displayName = String(formData.get('display_name') ?? '').trim() || username

  const problem =
    validateEmail(email) ?? validateUsername(username) ?? validatePassword(password)
  if (problem) return { error: problem }

  const supabase = await createClient()

  // username et display_name sont lus par le trigger handle_new_user
  // pour créer la ligne correspondante dans public.profiles.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, display_name: displayName } },
  })

  if (error) {
    if (/duplicate key|profiles_username_key/i.test(error.message)) {
      return { error: 'Ce pseudo est déjà pris.' }
    }
    return { error: error.message }
  }

  // Si la confirmation par e-mail est activée dans Supabase, signUp ne renvoie
  // aucune session : rediriger vers /chat ferait rebondir sur /login sans
  // explication. On affiche plutôt la consigne.
  if (!data.session) {
    return {
      error: null,
      notice: 'Compte créé. Ouvre le lien de confirmation envoyé par e-mail, puis connecte-toi.',
    }
  }

  revalidatePath('/', 'layout')
  redirect('/chat')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
