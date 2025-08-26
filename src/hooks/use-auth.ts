// src/hooks/use-auth.ts
"use client"

import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export interface User {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
}

export function useAuth() {
  const { data: session, status } = useSession()
  const router = useRouter()
  
  const user: User | null = session?.user ? {
    id: session.user.id as string,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  } : null

  const isLoading = status === "loading"
  const isAuthenticated = !!session && !!user

  const login = async (provider?: string, callbackUrl?: string) => {
    try {
      const result = await signIn(provider, { 
        callbackUrl: callbackUrl || window.location.href,
        redirect: false 
      })
      
      if (result?.error) {
        throw new Error(result.error)
      }
      
      if (result?.url) {
        router.push(result.url)
      }
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }

  const logout = async (callbackUrl?: string) => {
    try {
      await signOut({ 
        callbackUrl: callbackUrl || '/',
        redirect: false 
      })
      router.push(callbackUrl || '/')
    } catch (error) {
      console.error('Logout error:', error)
      throw error
    }
  }

  // Redirect functions for protected routes
  const requireAuth = (redirectTo = '/auth/signin') => {
    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        router.push(`${redirectTo}?callbackUrl=${encodeURIComponent(window.location.href)}`)
      }
    }, [isLoading, isAuthenticated, redirectTo])

    return isAuthenticated
  }

  const requireGuest = (redirectTo = '/') => {
    useEffect(() => {
      if (!isLoading && isAuthenticated) {
        router.push(redirectTo)
      }
    }, [isLoading, isAuthenticated, redirectTo])

    return !isAuthenticated && !isLoading
  }

  return {
    user,
    session,
    isLoading,
    isAuthenticated,
    login,
    logout,
    requireAuth,
    requireGuest,
  }
}
