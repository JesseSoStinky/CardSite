// src/app/api/addresses/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const createAddressSchema = z.object({
  type: z.enum(['SHIPPING', 'BILLING']),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  street: z.string().min(1, 'Street address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zipCode: z.string().min(1, 'ZIP code is required'),
  country: z.string().default('US'),
  phone: z.string().optional(),
  isDefault: z.boolean().default(false),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const addresses = await prisma.address.findMany({
      where: { userId: session.user.id },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json(addresses)
  } catch (error) {
    console.error('Addresses fetch error:', error)
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
    const data = createAddressSchema.parse(body)

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: {
          userId: session.user.id,
          type: data.type,
        },
        data: { isDefault: false },
      })
    }

    const address = await prisma.address.create({
      data: {
        ...data,
        userId: session.user.id,
      },
    })

    return NextResponse.json(address, { status: 201 })
  } catch (error) {
    console.error('Create address error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// src/app/api/addresses/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const updateAddressSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  street: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  zipCode: z.string().min(1).optional(),
  phone: z.string().optional(),
  isDefault: z.boolean().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = updateAddressSchema.parse(body)

    // Verify address belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!existingAddress) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: {
          userId: session.user.id,
          type: existingAddress.type,
          id: { not: params.id },
        },
        data: { isDefault: false },
      })
    }

    const updatedAddress = await prisma.address.update({
      where: { id: params.id },
      data,
    })

    return NextResponse.json(updatedAddress)
  } catch (error) {
    console.error('Update address error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify address belongs to user
    const address = await prisma.address.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!address) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    }

    await prisma.address.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: 'Address deleted' })
  } catch (error) {
    console.error('Delete address error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// src/app/api/listings/[id]/reviews/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const createReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { rating, comment } = createReviewSchema.parse(body)

    // Check if listing exists
    const listing = await prisma.listing.findUnique({
      where: { id: params.id },
    })

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Prevent sellers from reviewing their own listings
    if (listing.sellerId === session.user.id) {
      return NextResponse.json({ error: 'Cannot review your own listing' }, { status: 400 })
    }

    // Check if user has already reviewed this listing
    const existingReview = await prisma.review.findUnique({
      where: {
        userId_listingId: {
          userId: session.user.id,
          listingId: params.id,
        },
      },
    })

    if (existingReview) {
      return NextResponse.json({ error: 'You have already reviewed this listing' }, { status: 400 })
    }

    const review = await prisma.review.create({
      data: {
        userId: session.user.id,
        listingId: params.id,
        rating,
        comment,
      },
      include: {
        user: {
          select: {
            name: true,
            image: true,
          },
        },
      },
    })

    return NextResponse.json(review, { status: 201 })
  } catch (error) {
    console.error('Create review error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// prisma/seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'pokemon-cards' },
      update: {},
      create: {
        name: 'Pokémon Cards',
        slug: 'pokemon-cards',
        description: 'Trading cards from the Pokémon universe',
      },
    }),
    prisma.category.upsert({
      where: { slug: 'magic-the-gathering' },
      update: {},
      create: {
        name: 'Magic: The Gathering',
        slug: 'magic-the-gathering',
        description: 'Magic: The Gathering cards and sets',
      },
    }),
    prisma.category.upsert({
      where: { slug: 'yu-gi-oh' },
      update: {},
      create: {
        name: 'Yu-Gi-Oh!',
        slug: 'yu-gi-oh',
        description: 'Yu-Gi-Oh! trading cards',
      },
    }),
  ])

  // Create a demo user
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@tcgmarket.com' },
    update: {},
    create: {
      email: 'demo@tcgmarket.com',
      name: 'Demo User',
      emailVerified: new Date(),
    },
  })

  // Create demo listings
  const pokemonCategory = categories.find(c => c.slug === 'pokemon-cards')!
  
  const listings = [
    {
      title: 'Charizard Base Set Shadowless - PSA 9',
      description: `Beautiful PSA 9 Charizard from the Base Set Shadowless edition. This is one of the most iconic Pokémon cards ever made. The card has been professionally graded and is in mint condition.
      
Features:
- PSA 9 graded
- Shadowless Base Set
- No whitening on edges
- Perfect centering
- Stored in protective case

This is a must-have for any serious Pokémon collector!`,
      cardName: 'Charizard',
      setName: 'Base Set Shadowless',
      rarity: 'Rare Holo',
      cardNumber: '4/102',
      price: 299.99,
      quantity: 1,
      condition: 'MINT',
      images: [
        'https://images.pokemontcg.io/base1/4_hires.png',
      ],
      sellerId: demoUser.id,
      categoryId: pokemonCategory.id,
    },
    {
      title: 'Pikachu Yellow Cheeks Error - Near Mint',
      description: `Rare Pikachu with the yellow cheeks error from Base Set. This is the corrected version that was printed later, making it quite sought after by collectors.
      
Condition: Near Mint
- Minimal edge wear
- Clean surface
- No creases or bends
- Stored in penny sleeve and top loader`,
      cardName: 'Pikachu',
      setName: 'Base Set',
      rarity: 'Common',
      cardNumber: '58/102',
      price: 45.00,
      quantity: 2,
      condition: 'NEAR_MINT',
      images: [
        'https://images.pokemontcg.io/base1/58_hires.png',
      ],
      sellerId: demoUser.id,
      categoryId: pokemonCategory.id,
    },
    {
      title: 'Blastoise Base Set Unlimited - Excellent',
      description: `Classic Blastoise from Base Set Unlimited. Great card for collectors or players alike.
      
The card shows light play with:
- Slight edge whitening
- Minor surface wear
- Still displays beautifully
- Great for budget collectors`,
      cardName: 'Blastoise',
      setName: 'Base Set Unlimited',
      rarity: 'Rare Holo',
      cardNumber: '2/102',
      price: 89.99,
      quantity: 1,
      condition: 'LIGHTLY_PLAYED',
      images: [
        'https://images.pokemontcg.io/base1/2_hires.png',
      ],
      sellerId: demoUser.id,
      categoryId: pokemonCategory.id,
    },
    {
      title: 'Venusaur Base Set - Good Condition',
      description: `Venusaur from the original Base Set. This card has seen some play but still looks great.
      
Condition details:
- Moderate edge wear
- Some surface scratching
- Colors still vibrant
- No major damage or bends`,
      cardName: 'Venusaur',
      setName: 'Base Set',
      rarity: 'Rare Holo',
      cardNumber: '15/102',
      price: 65.00,
      quantity: 1,
      condition: 'MODERATELY_PLAYED',
      images: [
        'https://images.pokemontcg.io/base1/15_hires.png',
      ],
      sellerId: demoUser.id,
      categoryId: pokemonCategory.id,
    },
    {
      title: 'Alakazam Base Set - Played',
      description: `Alakazam from Base Set. This card shows heavy play but is still a great addition to any collection.
      
Condition:
- Heavy edge wear
- Surface wear visible
- Some whitening
- No tears or major damage
- Perfect for budget collectors`,
      cardName: 'Alakazam',
      setName: 'Base Set',
      rarity: 'Rare Holo',
      cardNumber: '1/102',
      price: 25.00,
      quantity: 3,
      condition: 'HEAVILY_PLAYED',
      images: [
        'https://images.pokemontcg.io/base1/1_hires.png',
      ],
      sellerId: demoUser.id,
      categoryId: pokemonCategory.id,
    },
    {
      title: 'Machamp Base Set First Edition',
      description: `First Edition Machamp from Base Set. Every starter deck came with this card, but First Edition versions are still collectible.
      
This copy is in near mint condition:
- Clean edges
- Bright colors
- Minimal wear
- First Edition stamp clear`,
      cardName: 'Machamp',
      setName: 'Base Set',
      rarity: 'Rare Holo',
      cardNumber: '8/102',
      price: 15.99,
      quantity: 5,
      condition: 'NEAR_MINT',
      images: [
        'https://images.pokemontcg.io/base1/8_hires.png',
      ],
      sellerId: demoUser.id,
      categoryId: pokemonCategory.id,
    },
  ]

  for (const listing of listings) {
    await prisma.listing.upsert({
      where: { id: `${listing.cardName.toLowerCase()}-${listing.setName.toLowerCase().replace(/\s+/g, '-')}` },
      update: {},
      create: {
        id: `${listing.cardName.toLowerCase()}-${listing.setName.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substr(2, 9)}`,
        ...listing,
      },
    })
  }

  // Create demo address
  await prisma.address.upsert({
    where: { id: 'demo-address-1' },
    update: {},
    create: {
      id: 'demo-address-1',
      userId: demoUser.id,
      type: 'SHIPPING',
      firstName: 'John',
      lastName: 'Doe',
      street: '123 Main Street',
      city: 'Anytown',
      state: 'CA',
      zipCode: '90210',
      country: 'US',
      phone: '(555) 123-4567',
      isDefault: true,
    },
  })

  console.log('✅ Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

// .env.local (updated)
# Database
DATABASE_URL="postgresql://tcg:secret@db:5432/tcg"

# NextAuth
NEXTAUTH_SECRET="super-secret-key-change-in-production"
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth (optional - for Google sign-in)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Email (optional - for magic link sign-in)
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your-email@gmail.com
EMAIL_SERVER_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com

# Stripe
STRIPE_SECRET_KEY=sk_test_yourkey
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_yourkey
STRIPE_WEBHOOK_SECRET=whsec_yourkey

# MinIO (S3)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio123
S3_BUCKET=tcg-marketplace

# postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

# next.config.js (updated)
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
  },
  images: {
    domains: [
      'images.pokemontcg.io',
      'localhost',
      'minio',
    ],
  },
}

module.exports = nextConfig

# Docker configuration updates
# docker-compose.yml (updated)
version: "3.9"

services:
  db:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_USER: tcg
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: tcg
    volumes:
      - db-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tcg -d tcg"]
      interval: 10s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4
    restart: always
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@local.com
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - db

  minio:
    image: minio/minio
    restart: always
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    volumes:
      - minio-data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  createbucket:
    image: minio/mc
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        sleep 5;
        mc alias set local http://minio:9000 minio minio123;
        mc mb --ignore-existing local/tcg-marketplace;
        mc anonymous set public local/tcg-marketplace;
        exit 0;
      "

  migrate:
    build: .
    command: ["pnpm", "prisma", "migrate", "deploy"]
    env_file:
      - .env.local
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./prisma:/app/prisma

  seed:
    build: .
    command: ["pnpm", "run", "db:seed"]
    env_file:
      - .env.local
    depends_on:
      - migrate
    volumes:
      - ./prisma:/app/prisma

  web:
    build: .
    restart: always
    command: ["pnpm", "start"]
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    depends_on:
      - migrate
      - minio
    volumes:
      - ./public:/app/public

volumes:
  db-data:
  minio-data:d]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: params.id },
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
        reviews: {
          include: {
            user: {
              select: {
                name: true,
                image: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            reviews: true,
          },
        },
      },
    })

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    return NextResponse.json(listing)
  } catch (error) {
    console.error('Listing fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// src/app/api/listings/[i
