// src/app/page.tsx
"use client";

import React, { useEffect, useState } from "react";

type Listing = {
  id: number;
  name: string;
  price: number;
};

export default function HomePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchListings() {
      try {
        const res = await fetch("/api/listings");
        const data: Listing[] = await res.json();
        setListings(data);
      } catch (err) {
        console.error("Failed to fetch listings:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, []);

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Welcome to TCG Marketplace!</h1>
      <p>Your Pokémon card trading site is up and running.</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Listings</h2>
        {loading && <p>Loading listings...</p>}
        {!loading && listings.length === 0 && <p>No listings found.</p>}
        <ul>
          {listings.map((listing) => (
            <li key={listing.id}>
              {listing.name} — ${listing.price.toFixed(2)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

