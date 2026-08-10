import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-display",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "YieldGarden — Plant SEED, harvest ETH",
  description: "Stake SEED tokens and earn ETH every second they stay planted. Watch your plot grow on Sepolia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
