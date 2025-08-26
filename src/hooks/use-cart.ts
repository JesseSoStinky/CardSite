// src/hooks/use-cart.ts
"use client"

import { useState, useEffect, createContext, useContext } from 'react'
import { useAuth } from './use-auth'
import toast from 'react-hot-toast'

export interface CartItem {
  id: string
  listingId: string
  quantity: number
  createdAt: string
  listing: {
    id: string
    title: string
    price: number
    images: string[]
    cardName: string
    condition: string
    quantity: number
    seller: {
      id: string
      name: string
    }
  }
}

interface CartContextType {
  items: CartItem[]
  loading: boolean
  itemCount: number
  totalPrice: number
  addItem: (listingId: string, quantity?: number) => Promise<void>
  updateQuantity: (itemId: string, quantity: number) => Promise<void>
  removeItem: (itemId: string) => Promise<void>
  clearCart: () => Promise<void>
  loadCart: () => Promise<void>
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)

  // Load cart items when user authentication status changes
  useEffect(() => {
    if (isAuthenticated) {
      loadCart()
    } else {
      setItems([])
    }
  }, [isAuthenticated])

  const loadCart = async () => {
    if (!isAuthenticated) return
    
    setLoading(true)
    try {
      const response = await fetch('/api/cart')
      if (response.ok) {
        const data = await response.json()
        setItems(data)
      } else if (response.status === 401) {
        // User is not authenticated, clear cart
        setItems([])
      }
    } catch (error) {
      console.error('Failed to load cart:', error)
      toast.error('Failed to load cart')
    } finally {
      setLoading(false)
    }
  }

  const addItem = async (listingId: string, quantity: number = 1) => {
    if (!isAuthenticated) {
      toast.error('Please sign in to add items to cart')
      return
    }

    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ listingId, quantity }),
      })

      if (response.ok) {
        await loadCart()
        toast.success('Added to cart')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to add to cart')
      }
    } catch (error) {
      console.error('Failed to add to cart:', error)
      toast.error('Failed to add to cart')
    }
  }

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      return removeItem(itemId)
    }

    try {
      const response = await fetch(`/api/cart/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quantity }),
      })

      if (response.ok) {
        await loadCart()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update quantity')
      }
    } catch (error) {
      console.error('Failed to update quantity:', error)
      toast.error('Failed to update quantity')
    }
  }

  const removeItem = async (itemId: string) => {
    try {
      const response = await fetch(`/api/cart/${itemId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await loadCart()
        toast.success('Removed from cart')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to remove item')
      }
    } catch (error) {
      console.error('Failed to remove item:', error)
      toast.error('Failed to remove item')
    }
  }

  const clearCart = async () => {
    try {
      const response = await fetch('/api/cart', {
        method: 'DELETE',
      })

      if (response.ok) {
        setItems([])
        toast.success('Cart cleared')
      } else {
        toast.error('Failed to clear cart')
      }
    } catch (error) {
      console.error('Failed to clear cart:', error)
      toast.error('Failed to clear cart')
    }
  }

  const itemCount = items.reduce((total, item) => total + item.quantity, 0)
  const totalPrice = items.reduce((total, item) => total + (item.listing.price * item.quantity), 0)

  const value: CartContextType = {
    items,
    loading,
    itemCount,
    totalPrice,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    loadCart,
  }

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
