import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Shell } from '@/components/Shell'
import { readDevState } from '@/core/dev-state'
import { VERSION } from '@/core/version'

export const metadata: Metadata = {
  title: 'dodo',
  description: 'Markdown docs',
  appleWebApp: { capable: true, title: 'dodo', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Only `pnpm dev` can switch between the local DB and prod. See scripts/dev.sh.
  const env = process.env.NODE_ENV === 'development' ? (readDevState()?.env ?? 'dev') : undefined
  return (
    <html lang="en" data-env={env}>
      <body>
        <Shell version={VERSION}>{children}</Shell>
      </body>
    </html>
  )
}
