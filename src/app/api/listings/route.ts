import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json([
    { id: 1, name: "Pikachu", price: 10 },
    { id: 2, name: "Charizard", price: 100 }
  ]);
}

