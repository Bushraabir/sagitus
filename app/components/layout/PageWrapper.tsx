//app/components/layout/PageWrapper.tsx
import { ReactNode } from 'react'
import { cn } from '@/app/lib/utils/cn'

interface Props {
  children: ReactNode
  className?: string
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '5xl' | '7xl'
  withBottomNav?: boolean
}

export default function PageWrapper({
  children,
  className,
  maxWidth = '7xl',
  withBottomNav = true,
}: Props) {
  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '5xl': 'max-w-5xl', 
    '7xl': 'max-w-7xl',
  }[maxWidth]

  return (
    <main className={cn(
      'mx-auto px-4 sm:px-6 lg:px-8 py-8',
      withBottomNav && 'pb-24 md:pb-10',
      maxWidthClass,
      className
    )}>
      {children}
    </main>
  )
}