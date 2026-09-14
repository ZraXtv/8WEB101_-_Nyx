import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { login } from '@/app/auth/actions'

export const metadata: Metadata = { title: 'Connexion — Nyx' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return <AuthForm mode="login" action={login} next={next} />
}
