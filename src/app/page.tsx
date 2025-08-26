// src/app/page.tsx
"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Filter, Star, ShoppingCart, TrendingUp, Package, Users } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useCart } from '@/hooks/use-cart'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { formatPrice, getConditionColor, getConditionLabel } from '@/lib/utils'

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
    image?: string
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

interface Category {
  id: string
  name: string
  slug: string
  _count?: {
    listings: number
  }
}

const featuredCategories = [
  {
    name: "Pokémon",
    slug: "pokemon-cards",
    image: "https://images.pokemontcg.io/base1/4_hires.png",
    color: "from-blue-500 to-purple-600"
  },
  {
    name: "Magic: The Gathering",
    slug: "magic-the-gathering", 
    image: "https://images.pokemontcg.io/base1/2_hires.png",
    color: "from-purple-500 to-pink-600"
  },
  {
    name: "Yu-Gi-Oh!",
    slug: "yu-gi-oh",
    image: "https://images.pokemontcg.io/base1/15_hires.png",
    color: "from-yellow-500 to-red-600"
  }
]

export default function HomePage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedCondition, setSelectedCondition] = useState<string>('')
  const [priceRange, setPriceRange] = useState({ min: '', max: '' })
  const [sortBy, setSortBy] = useState<'createdAt' | 'price' | 'title'>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  })
  
  const { addItem, itemCount } = useCart()
  const router = useRouter()

  useEffect(() => {
    fetchListings()
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories')
      if (response.ok) {
        const data = await response.json()
        setCategories(data)
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    }
  }

  const fetchListings = async (params?: Record<string, string>) => {
    setLoading(true)
    try {
      const searchParams = new URLSearchParams({
        page: '1',
        limit: '20',
        sortBy,
        sortOrder,
        ...params
      })

      if (searchQuery) searchParams.set('q', searchQuery)
      if (selectedCategory) searchParams.set('category', selectedCategory)
      if (selectedCondition) searchParams.set('condition', selectedCondition)
      if (priceRange.min) searchParams.set('minPrice', priceRange.min)
      if (priceRange.max) searchParams.set('maxPrice', priceRange.max)

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
    fetchListings()
  }

  const handleAddToCart = async (listingId: string) => {
    await addItem(listingId, 1)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedCategory('')
    setSelectedCondition('')
    setPriceRange({ min: '', max: '' })
    setSortBy('createdAt')
    setSortOrder('desc')
    fetchListings()
  }

  if (loading && listings.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-8">
            {/* Hero skeleton */}
            <div className="text-center space-y-4">
              <div className="h-12 w-96 bg-gray-200 rounded mx-auto"></div>
              <div className="h-6 w-128 bg-gray-200 rounded mx-auto"></div>
              <div className="h-12 w-full max-w-2xl bg-gray-200 rounded mx-auto"></div>
            </div>
            
            {/* Categories skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
            
            {/* Listings skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-gray-200 h-80 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
            Welcome to TCG Marketplace
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            The premier destination for trading card collectors. Buy, sell, and discover rare cards with confidence.
          </p>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="max-w-4xl mx-auto relative mb-8">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <Input
                  type="search"
                  placeholder="Search for cards, sets, or sellers..."
                  className="pl-12 h-14 text-lg border-2 shadow-lg"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button type="submit" size="lg" className="h-14 px-8">
                Search
              </Button>
            </div>
          </form>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto mb-12">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Package className="h-8 w-8 text-blue-600 mr-2" />
                <span className="text-2xl font-bold text-gray-900">{pagination.total}</span>
              </div>
              <p className="text-gray-600">Active Listings</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Users className="h-8 w-8 text-green-600 mr-2" />
                <span className="text-2xl font-bold text-gray-900">1,000+</span>
              </div>
              <p className="text-gray-600">Trusted Sellers</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="h-8 w-8 text-purple-600 mr-2" />
                <span className="text-2xl font-bold text-gray-900">50k+</span>
              </div>
              <p className="text-gray-600">Cards Sold</p>
            </div>
          </div>
        </div>

        {/* Featured Categories */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-center mb-8">Popular Categories</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredCategories.map((category) => (
              <Card key={category.slug} className="group hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer"
                    onClick={() => {setSelectedCategory(category.slug); fetchListings({category: category.slug})}}>
                <div className={`h-32 bg-gradient-to-br ${category.color} relative`}>
                  <div className="absolute inset-0 bg-black/20"></div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-white text-xl font-bold">{category.name}</h3>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-500" />
              <span className="font-semibold">Filters:</span>
            </div>
            
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border rounded-md px-3 py-2"
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            {/* Condition Filter */}
            <select
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="border rounded-md px-3 py-2"
            >
              <option value="">All Conditions</option>
              <option value="MINT">Mint</option>
              <option value="NEAR_MINT">Near Mint</option>
              <option value="LIGHTLY_PLAYED">Lightly Played</option>
              <option value="MODERATELY_PLAYED">Moderately Played</option>
              <option value="HEAVILY_PLAYED">Heavily Played</option>
              <option value="DAMAGED">Damaged</option>
            </select>

            {/* Price Range */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Min $"
                value={priceRange.min}
                onChange={(e) => setPriceRange({...priceRange, min: e.target.value})}
                className="w-20"
                type="number"
              />
              <span>-</span>
              <Input
                placeholder="Max $"
                value={priceRange.max}
                onChange={(e) => setPriceRange({...priceRange, max: e.target.value})}
                className="w-20"
                type="number"
              />
            </div>

            {/* Sort */}
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-')
                setSortBy(field as any)
                setSortOrder(order as any)
              }}
              className="border rounded-md px-3 py-2"
            >
              <option value="createdAt-desc">Newest First</option>
              <option value="createdAt-asc">Oldest First</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="title-asc">Name: A to Z</option>
              <option value="title-desc">Name: Z to A</option>
            </select>

            <Button onClick={fetchListings} variant="default">
              Apply Filters
            </Button>
            
            <Button onClick={clearFilters} variant="outline">
              Clear All
            </Button>
          </div>
        </div>

        {/* Results Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">
            {searchQuery ? `Results for "${searchQuery}"` : 'Featured Cards'} 
            <span className="text-gray-500 text-lg ml-2">({pagination.total} results)</span>
          </h2>
        </div>

        {/* Listings Grid */}
        {listings.length === 0 ? (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 text-lg mb-2">No listings found.</p>
            <p className="text-gray-400 mb-4">Try adjusting your search filters or browse our featured categories.</p>
            <Button onClick={() => router.push('/sell')} size="lg">
              List Your First Card
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {listings.map((listing) => (
                <Card key={listing.id} className="group hover:shadow-xl transition-all duration-300 overflow-hidden">
                  <CardHeader className="p-0">
                    <div className="aspect-[3/4] relative overflow-hidden">
                      {listing.images && listing.images.length > 0 ? (
                        <Image
                          src={listing.images[0]}
                          alt={listing.cardName}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                          <Package className="h-12 w-12 text-gray-400" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge className={getConditionColor(listing.condition)}>
                          {getConditionLabel(listing.condition)}
                        </Badge>
                      </div>
                      <div className="absolute top-2 left-2">
                        <Badge variant="secondary" className="text-xs">
                          {listing.category.name}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-4">
                    <Link 
                      href={`/listing/${listing.id}`}
                      className="block hover:text-primary transition-colors"
                    >
                      <h3 className="font-semibold text-lg mb-1 line-clamp-2 group-hover:text-primary transition-colors">
                        {listing.title}
                      </h3>
                      <p className="text-gray-600 text-sm mb-2">{listing.cardName}</p>
                    </Link>
                    
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-2xl font-bold text-primary">
                        {formatPrice(listing.price)}
                      </span>
                      <div className="flex items-center text-sm text-gray-500">
                        <Star className="h-4 w-4 mr-1 fill-yellow-400 text-yellow-400" />
                        <span>{listing._count.reviews}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                      <span>by {listing.seller.name}</span>
                      {listing.seller.image && (
                        <Image
                          src={listing.seller.image}
                          alt={listing.seller.name}
                          width={20}
                          height={20}
                          className="rounded-full"
                        />
                      )}
                    </div>
                    
                    <Button 
                      className="w-full group-hover:bg-primary/90 transition-colors" 
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

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex justify-center items-center space-x-4 mt-8">
                <Button 
                  variant="outline"
                  disabled={pagination.page === 1}
                  onClick={() => fetchListings({ page: (pagination.page - 1).toString() })}
                >
                  Previous
                </Button>
                
                <div className="flex items-center space-x-2">
                  {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                    const page = i + Math.max(1, pagination.page - 2)
                    if (page <= pagination.pages) {
                      return (
                        <Button
                          key={page}
                          variant={page === pagination.page ? "default" : "outline"}
                          size="sm"
                          onClick={() => fetchListings({ page: page.toString() })}
                        >
                          {page}
                        </Button>
                      )
                    }
                  })}
                </div>
                
                <Button 
                  variant="outline"
                  disabled={pagination.page === pagination.pages}
                  onClick={() => fetchListings({ page: (pagination.page + 1).toString() })}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}

        {/* Newsletter/CTA Section */}
        <section className="mt-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Trading?</h2>
          <p className="text-xl mb-6 opacity-90">
            Join thousands of collectors buying and selling on TCG Marketplace
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" onClick={() => router.push('/sell')}>
              Start Selling
            </Button>
            <Button size="lg" variant="outline" className="text-white border-white hover:bg-white hover:text-purple-600">
              Browse More Cards
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
