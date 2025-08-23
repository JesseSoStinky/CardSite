// src/lib/stripe.ts
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// src/app/api/create-payment-intent/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stripe } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { shippingAddressId } = await request.json()

    if (!shippingAddressId) {
      return NextResponse.json({ error: 'Shipping address required' }, { status: 400 })
    }

    // Get cart items
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: session.user.id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            quantity: true,
            status: true,
          },
        },
      },
    })

    if (cartItems.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    // Validate cart items are still available
    for (const item of cartItems) {
      if (item.listing.status !== 'ACTIVE') {
        return NextResponse.json({ 
          error: `Item "${item.listing.title}" is no longer available` 
        }, { status: 400 })
      }
      if (item.quantity > item.listing.quantity) {
        return NextResponse.json({ 
          error: `Not enough stock for "${item.listing.title}"` 
        }, { status: 400 })
      }
    }

    // Calculate total
    const total = cartItems.reduce(
      (sum, item) => sum + (item.listing.price * item.quantity), 
      0
    )

    // Verify shipping address belongs to user
    const shippingAddress = await prisma.address.findFirst({
      where: {
        id: shippingAddressId,
        userId: session.user.id,
      },
    })

    if (!shippingAddress) {
      return NextResponse.json({ error: 'Invalid shipping address' }, { status: 400 })
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        userId: session.user.id,
        shippingAddressId,
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      total,
      items: cartItems,
    })
  } catch (error) {
    console.error('Create payment intent error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// src/app/api/confirm-purchase/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stripe } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { paymentIntentId } = await request.json()

    // Verify payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    if (paymentIntent.metadata.userId !== session.user.id) {
      return NextResponse.json({ error: 'Payment intent mismatch' }, { status: 400 })
    }

    // Get cart items
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: session.user.id },
      include: {
        listing: true,
      },
    })

    if (cartItems.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    // Create purchase and purchase items in a transaction
    const purchase = await prisma.$transaction(async (tx) => {
      // Create the purchase
      const newPurchase = await tx.purchase.create({
        data: {
          buyerId: session.user.id,
          total: paymentIntent.amount / 100, // Convert from cents
          status: 'PAID',
          stripePaymentId: paymentIntentId,
          shippingAddressId: paymentIntent.metadata.shippingAddressId,
        },
      })

      // Create purchase items and update listing quantities
      for (const cartItem of cartItems) {
        // Create purchase item
        await tx.purchaseItem.create({
          data: {
            purchaseId: newPurchase.id,
            listingId: cartItem.listingId,
            quantity: cartItem.quantity,
            price: cartItem.listing.price,
          },
        })

        // Update listing quantity
        const updatedListing = await tx.listing.update({
          where: { id: cartItem.listingId },
          data: {
            quantity: {
              decrement: cartItem.quantity,
            },
          },
        })

        // Mark listing as sold if quantity reaches 0
        if (updatedListing.quantity === 0) {
          await tx.listing.update({
            where: { id: cartItem.listingId },
            data: { status: 'SOLD' },
          })
        }
      }

      // Clear the cart
      await tx.cartItem.deleteMany({
        where: { userId: session.user.id },
      })

      return newPurchase
    })

    return NextResponse.json({ 
      success: true, 
      purchaseId: purchase.id 
    })
  } catch (error) {
    console.error('Confirm purchase error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// src/app/checkout/page.tsx
"use client"

import { useEffect, useState } from 'react'
import { useCart } from '@/hooks/use-cart'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { MapPin, CreditCard, Package, CheckCircle } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface Address {
  id: string
  type: string
  firstName: string
  lastName: string
  street: string
  city: string
  state: string
  zipCode: string
  country: string
  phone?: string
  isDefault: boolean
}

function CheckoutForm() {
  const { items, totalPrice, clearCart } = useCart()
  const { user } = useAuth()
  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [newAddress, setNewAddress] = useState({
    firstName: '',
    lastName: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
  })
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [clientSecret, setClientSecret] = useState<string>('')
  const [step, setStep] = useState<'address' | 'payment' | 'success'>('address')
  const [purchaseId, setPurchaseId] = useState<string>('')

  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()

  useEffect(() => {
    fetchAddresses()
  }, [])

  const fetchAddresses = async () => {
    try {
      const response = await fetch('/api/addresses')
      if (response.ok) {
        const data = await response.json()
        setAddresses(data)
        // Select default address if available
        const defaultAddr = data.find((addr: Address) => addr.isDefault)
        if (defaultAddr) {
          setSelectedAddress(defaultAddr.id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch addresses:', error)
    }
  }

  const handleAddAddress = async () => {
    try {
      const response = await fetch('/api/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newAddress,
          type: 'SHIPPING',
        }),
      })

      if (response.ok) {
        const address = await response.json()
        setAddresses([...addresses, address])
        setSelectedAddress(address.id)
        setShowAddressForm(false)
        setNewAddress({
          firstName: '',
          lastName: '',
          street: '',
          city: '',
          state: '',
          zipCode: '',
          phone: '',
        })
        toast.success('Address added successfully')
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to add address')
      }
    } catch (error) {
      console.error('Failed to add address:', error)
      toast.error('Failed to add address')
    }
  }

  const handleProceedToPayment = async () => {
    if (!selectedAddress) {
      toast.error('Please select a shipping address')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shippingAddressId: selectedAddress,
        }),
      })

      if (response.ok) {
        const { clientSecret } = await response.json()
        setClientSecret(clientSecret)
        setStep('payment')
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to create payment intent')
      }
    } catch (error) {
      console.error('Failed to create payment intent:', error)
      toast.error('Failed to proceed to payment')
    } finally {
      setLoading(false)
    }
  }

  const handlePayment = async () => {
    if (!stripe || !elements || !clientSecret) return

    setLoading(true)

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: elements.getElement(CardElement)!,
        billing_details: {
          name: user?.name || '',
          email: user?.email || '',
        },
      },
    })

    if (error) {
      toast.error(error.message || 'Payment failed')
      setLoading(false)
      return
    }

    if (paymentIntent.status === 'succeeded') {
      // Confirm purchase on server
      try {
        const response = await fetch('/api/confirm-purchase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentIntentId: paymentIntent.id,
          }),
        })

        if (response.ok) {
          const { purchaseId } = await response.json()
          setPurchaseId(purchaseId)
          setStep('success')
          clearCart()
        } else {
          toast.error('Failed to confirm purchase')
        }
      } catch (error) {
        console.error('Failed to confirm purchase:', error)
        toast.error('Failed to confirm purchase')
      }
    }

    setLoading(false)
  }

  if (items.length === 0 && step !== 'success') {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <h2 className="mt-4 text-lg font-medium">Your cart is empty</h2>
          <Button className="mt-4" onClick={() => router.push('/')}>
            Continue Shopping
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-green-600" />
          <h1 className="mt-4 text-2xl font-bold">Order Confirmed!</h1>
          <p className="mt-2 text-gray-600">
            Your order has been placed successfully. You'll receive a confirmation email shortly.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Order ID: {purchaseId}
          </p>
          <div className="mt-8 space-y-2">
            <Button className="w-full" onClick={() => router.push('/orders')}>
              View My Orders
            </Button>
            <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
              Continue Shopping
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">Checkout</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {step === 'address' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  Shipping Address
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {addresses.length > 0 && (
                  <div className="space-y-3">
                    {addresses.map((address) => (
                      <label
                        key={address.id}
                        className={`block p-4 border rounded-lg cursor-pointer ${
                          selectedAddress === address.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-gray-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="address"
                          value={address.id}
                          checked={selectedAddress === address.id}
                          onChange={(e) => setSelectedAddress(e.target.value)}
                          className="sr-only"
                        />
                        <div>
                          <p className="font-semibold">
                            {address.firstName} {address.lastName}
                          </p>
                          <p className="text-sm text-gray-600">{address.street}</p>
                          <p className="text-sm text-gray-600">
                            {address.city}, {address.state} {address.zipCode}
                          </p>
                          {address.phone && (
                            <p className="text-sm text-gray-600">{address.phone}</p>
                          )}
                          {address.isDefault && (
                            <Badge variant="secondary" className="mt-2">Default</Badge>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {showAddressForm ? (
                  <div className="border rounded-lg p-4 space-y-4">
                    <h3 className="font-semibold">Add New Address</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          value={newAddress.firstName}
                          onChange={(e) => setNewAddress({ ...newAddress, firstName: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          value={newAddress.lastName}
                          onChange={(e) => setNewAddress({ ...newAddress, lastName: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="street">Street Address</Label>
                      <Input
                        id="street"
                        value={newAddress.street}
                        onChange={(e) => setNewAddress({ ...newAddress, street: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={newAddress.city}
                          onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          value={newAddress.state}
                          onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="zipCode">ZIP Code</Label>
                        <Input
                          id="zipCode"
                          value={newAddress.zipCode}
                          onChange={(e) => setNewAddress({ ...newAddress, zipCode: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone (Optional)</Label>
                      <Input
                        id="phone"
                        value={newAddress.phone}
                        onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                      />
                    </div>
                    <div className="flex space-x-2">
                      <Button onClick={handleAddAddress}>Save Address</Button>
                      <Button variant="outline" onClick={() => setShowAddressForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setShowAddressForm(true)}>
                    Add New Address
                  </Button>
                )}

                <Button
                  onClick={handleProceedToPayment}
                  disabled={!selectedAddress || loading}
                  className="w-full"
                >
                  {loading ? 'Processing...' : 'Proceed to Payment'}
                </Button>
              </CardContent>
            </Card>
          )}

          {step === 'payment' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="h-5 w-5 mr-2" />
                  Payment Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <CardElement
                    options={{
                      style: {
                        base: {
                          fontSize: '16px',
                          color: '#424770',
                          '::placeholder': {
                            color: '#aab7c4',
                          },
                        },
                      },
                    }}
                  />
                </div>

                <div className="flex space-x-2">
                  <Button variant="outline" onClick={() => setStep('address')}>
                    Back to Address
                  </Button>
                  <Button
                    onClick={handlePayment}
                    disabled={!stripe || loading}
                    className="flex-1"
                  >
                    {loading ? 'Processing...' : `Pay ${totalPrice.toFixed(2)}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center space-x-3">
                    {item.listing.images && item.listing.images.length > 0 ? (
                      <Image
                        src={item.listing.images[0]}
                        alt={item.listing.cardName}
                        width={50}
                        height={70}
                        className="rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-16 bg-gray-200 rounded flex items-center justify-center">
                        <span className="text-xs text-gray-400">No Image</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.listing.title}</p>
                      <p className="text-xs text-gray-600">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-medium">
                      ${(item.listing.price * item.quantity).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="text-green-600">FREE</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>$0.00</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/signin?callbackUrl=/checkout')
    }
  }, [isAuthenticated, router])

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h2 className="text-lg font-medium">Please sign in to continue</h2>
          <Button className="mt-4" onClick={() => router.push('/auth/signin')}>
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm />
    </Elements>
  )
}

// src/components/ui/label.tsx
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
