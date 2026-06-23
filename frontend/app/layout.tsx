import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "YieldGarden — Stake SEED, Earn ETH",
  description: "Stake SEED tokens and earn ETH rewards that accrue every second, proportional to your stake.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
