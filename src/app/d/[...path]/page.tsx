import { redirect } from 'next/navigation'

// Stable doc links: /d/deploy/mini-pc opens the app at that doc.
export default async function DocLink({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  redirect(`/?doc=${path.map(encodeURIComponent).join('/')}`)
}
