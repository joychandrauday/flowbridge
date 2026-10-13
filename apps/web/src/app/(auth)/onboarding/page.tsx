import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import OnboardingForm from './onboarding-form'

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (session.user.workspaceId) redirect('/dashboard')

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4">
      <OnboardingForm name={session.user.name ?? undefined} email={session.user.email ?? undefined} />
    </div>
  )
}