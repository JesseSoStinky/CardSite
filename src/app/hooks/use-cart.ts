// src/hooks/use-cart.ts
"use client"

import { useState, useEffect } from 'react'
import { useAuth } from './use-auth'
import toast from 'react-hot-toast'

export interface CartItem {
  id: string
  listingId: string
  quantity: number
  listing: {
    id: string
    title: string
    price: number
    images: string[]
    cardName: string
    condition: string
  }
}

export function useCart() {
  const { user, isAuthenticated } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)

  // Load cart items on mount
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
        toast.error(error.message || 'Failed to add to cart')
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
        toast.error('Failed to update quantity')
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
        toast.error('Failed to remove item')
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
      }
    } catch (error) {
      console.error('Failed to clear cart:', error)
      toast.error('Failed to clear cart')
    }
  }

  const itemCount = items.reduce((total, item) => total + item.quantity, 0)
  const totalPrice = items.reduce((total, item) => total + (item.listing.price * item.quantity), 0)

  return {
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
}

// src/app/api/cart/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const addToCartSchema = z.object({
  listingId: z.string(),
  quantity: z.number().min(1).default(1),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cartItems = await prisma.cartItem.findMany({
      where: { userId: session.user.id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            images: true,
            cardName: true,
            condition: true,
            quantity: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Filter out items for inactive/sold listings
    const activeItems = cartItems.filter(item => 
      item.listing.status === 'ACTIVE' && item.listing.quantity > 0
    )

    return NextResponse.json(activeItems)
  } catch (error) {
    console.error('Cart fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { listingId, quantity } = addToCartSchema.parse(body)

    // Check if listing exists and is available
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    })

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (listing.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Listing is not available' }, { status: 400 })
    }

    if (listing.sellerId === session.user.id) {
      return NextResponse.json({ error: 'Cannot add your own listing to cart' }, { status: 400 })
    }

    if (quantity > listing.quantity) {
      return NextResponse.json({ error: 'Not enough items in stock' }, { status: 400 })
    }

    // Check if item is already in cart
    const existingItem = await prisma.cartItem.findUnique({
      where: {
        userId_listingId: {
          userId: session.user.id,
          listingId,
        },
      },
    })

    if (existingItem) {
      // Update quantity
      const newQuantity = existingItem.quantity + quantity
      if (newQuantity > listing.quantity) {
        return NextResponse.json({ error: 'Not enough items in stock' }, { status: 400 })
      }

      const updatedItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      })

      return NextResponse.json(updatedItem)
    } else {
      // Create new cart item
      const cartItem = await prisma.cartItem.create({
        data: {
          userId: session.user.id,
          listingId,
          quantity,
        },
      })

      return NextResponse.json(cartItem, { status: 201 })
    }
  } catch (error) {
    console.error('Add to cart error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.cartItem.deleteMany({
      where: { userId: session.user.id },
    })

    return NextResponse.json({ message: 'Cart cleared' })
  } catch (error) {
    console.error('Clear cart error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// src/app/api/cart/[itemId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const updateQuantitySchema = z.object({
  quantity: z.number().min(1),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { quantity } = updateQuantitySchema.parse(body)

    const cartItem = await prisma.cartItem.findFirst({
      where: {
        id: params.itemId,
        userId: session.user.id,
      },
      include: {
        listing: true,
      },
    })

    if (!cartItem) {
      return NextResponse.json({ error: 'Cart item not found' }, { status: 404 })
    }

    if (quantity > cartItem.listing.quantity) {
      return NextResponse.json({ error: 'Not enough items in stock' }, { status: 400 })
    }

    const updatedItem = await prisma.cartItem.update({
      where: { id: params.itemId },
      data: { quantity },
    })

    return NextResponse.json(updatedItem)
  } catch (error) {
    console.error('Update cart item error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cartItem = await prisma.cartItem.findFirst({
      where: {
        id: params.itemId,
        userId: session.user.id,
      },
    })

    if (!cartItem) {
      return NextResponse.json({ error: 'Cart item not found' }, { status: 404 })
    }

    await prisma.cartItem.delete({
      where: { id: params.itemId },
    })

    return NextResponse.json({ message: 'Item removed from cart' })
  } catch (error) {
    console.error('Remove cart item error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
