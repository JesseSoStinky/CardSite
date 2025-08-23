// src/app/api/listings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const createListingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  price: z.number().min(0.01, 'Price must be greater than 0'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  condition: z.enum(['MINT', 'NEAR_MINT', 'LIGHTLY_PLAYED', 'MODERATELY_PLAYED', 'HEAVILY_PLAYED', 'DAMAGED']),
  cardName: z.string().min(1, 'Card name is required'),
  setName: z.string().optional(),
  rarity: z.string().optional(),
  cardNumber: z.string().optional(),
  categoryId: z.string().min(1, 'Category is required'),
  images: z.array(z.string()).default([]),
})

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  condition: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  sortBy: z.enum(['createdAt', 'price', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.string().default('1'),
  limit: z.string().default('20'),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const params = searchSchema.parse(Object.fromEntries(searchParams))

    const page = parseInt(params.page)
    const limit = parseInt(params.limit)
    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {
      status: 'ACTIVE',
      quantity: { gt: 0 },
    }

    if (params.q) {
      where.OR = [
        { title: { contains: params.q, mode: 'insensitive' } },
        { cardName: { contains: params.q, mode: 'insensitive' } },
        { description: { contains: params.q, mode: 'insensitive' } },
        { setName: { contains: params.q, mode: 'insensitive' } },
      ]
    }

    if (params.category) {
      where.categoryId = params.category
    }

    if (params.condition) {
      where.condition = params.condition
    }

    if (params.minPrice || params.maxPrice) {
      where.price = {}
      if (params.minPrice) where.price.gte = parseFloat(params.minPrice)
      if (params.maxPrice) where.price.lte = parseFloat(params.maxPrice)
    }

    // Build orderBy
    const orderBy: any = {}
    orderBy[params.sortBy] = params.sortOrder

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              reviews: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.listing.count({ where }),
    ])

    return NextResponse.json({
      listings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Listings fetch error:', error)
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
    const data = createListingSchema.parse(body)

    const listing = await prisma.listing.create({
      data: {
        ...data,
        sellerId: session.user.id,
      },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        category: true,
      },
    })

    return NextResponse.json(listing, { status: 201 })
  } catch (error) {
    console.error('Create listing error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// src/app/page.tsx
"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Filter, Star, ShoppingCart } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useCart } from '@/hooks/use-cart'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface Listing {
  id: string
  title: string
  cardName: string
  price: number
  condition: string
  images: string[]
  seller: {
    id: string
    name: string
    image: string
  }
  category: {
    name: string
    slug: string
  }
  _count: {
    reviews: number
  }
}

interface ListingsResponse {
  listings: Listing[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

const conditionColors = {
  'MINT': 'bg-green-100 text-green-800',
  'NEAR_MINT': 'bg-green-100 text-green-700',
  'LIGHTLY_PLAYED': 'bg-yellow-100 text-yellow-800',
  'MODERATELY_PLAYED': 'bg-orange-100 text-orange-800',
  'HEAVILY_PLAYED': 'bg-red-100 text-red-700',
  'DAMAGED': 'bg-red-100 text-red-800',
}

export default function HomePage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  })
  
  const { addItem } = useCart()
  const router = useRouter()

  useEffect(() => {
    fetchListings()
  }, [])

  const fetchListings = async (params?: Record<string, string>) => {
    setLoading(true)
    try {
      const searchParams = new URLSearchParams(params)
      const response = await fetch(`/api/listings?${searchParams}`)
      
      if (response.ok) {
        const data: ListingsResponse = await response.json()
        setListings(data.listings)
        setPagination(data.pagination)
      } else {
        toast.error('Failed to load listings')
      }
    } catch (error) {
      console.error('Failed to fetch listings:', error)
      toast.error('Failed to load listings')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      fetchListings({ q: searchQuery.trim() })
    }
  }

  const handleAddToCart = async (listingId: string) => {
    await addItem(listingId, 1)
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-12 w-96 bg-gray-200 rounded mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-gray-200 h-80 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to TCG Marketplace
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Buy and sell Pokémon cards with collectors worldwide
        </p>
        
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <Input
            type="search"
            placeholder="Search for cards, sets, or sellers..."
            className="pl-12 pr-4 h-12 text-lg"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button type="submit" className="absolute right-2 top-1/2 transform -translate-y-1/2">
            Search
          </Button>
        </form>
      </div>

      {/* Filters */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">
          Featured Cards ({pagination.total} results)
        </h2>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </div>
      </div>

      {/* Listings Grid */}
      {listings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No listings found.</p>
          <Button className="mt-4" asChild>
            <Link href="/sell">List Your First Card</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {listings.map((listing) => (
            <Card key={listing.id} className="group hover:shadow-lg transition-shadow">
              <CardHeader className="p-0">
                <div className="aspect-[3/4] relative overflow-hidden rounded-t-lg">
                  {listing.images && listing.images.length > 0 ? (
                    <Image
                      src={listing.images[0]}
                      alt={listing.cardName}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-400">No Image</span>
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <Badge 
                      className={conditionColors[listing.condition as keyof typeof conditionColors]}
                    >
                      {listing.condition.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-4">
                <Link 
                  href={`/listing/${listing.id}`}
                  className="block hover:text-primary transition-colors"
                >
                  <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                    {listing.title}
                  </h3>
                  <p className="text-gray-600 text-sm mb-2">{listing.cardName}</p>
                </Link>
                
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl font-bold text-primary">
                    ${listing.price.toFixed(2)}
                  </span>
                  <div className="flex items-center text-sm text-gray-500">
                    <Star className="h-4 w-4 mr-1 fill-yellow-400 text-yellow-400" />
                    <span>{listing._count.reviews} reviews</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                  <span>by {listing.seller.name}</span>
                  <Badge variant="outline">{listing.category.name}</Badge>
                </div>
                
                <Button 
                  className="w-full" 
                  size="sm"
                  onClick={() => handleAddToCart(listing.id)}
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Add to Cart
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center mt-8 space-x-2">
          <Button 
            variant="outline"
            disabled={pagination.page === 1}
            onClick={() => fetchListings({ page: (pagination.page - 1).toString() })}
          >
            Previous
          </Button>
          
          <span className="flex items-center px-4">
            Page {pagination.page} of {pagination.pages}
          </span>
          
          <Button 
            variant="outline"
            disabled={pagination.page === pagination.pages}
            onClick={() => fetchListings({ page: (pagination.page + 1).toString() })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
