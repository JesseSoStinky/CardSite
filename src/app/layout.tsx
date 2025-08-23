// src/app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "TCG Marketplace",
  description: "Buy and sell Pokémon cards",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

