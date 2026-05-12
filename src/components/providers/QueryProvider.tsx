'use client'

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router

  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (error instanceof Error && error.message === 'Unauthorized') {
              routerRef.current.push('/sign-in')
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof Error && error.message === 'Unauthorized') return false
              return failureCount < 3
            },
          },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
