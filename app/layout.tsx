import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-cinzel",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// TODO: the deployed origin. OG images have to be absolute URLs, so previews
// stay blank until this is real.
const SITE = "https://example.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Paardhu — Developer Portfolio",
  description:
    "A portfolio you fly through instead of scroll. Hold forward and the story arrives at distance.",
  openGraph: {
    type: "website",
    siteName: "Paardhu",
    title: "Paardhu — Developer Portfolio",
    description:
      "A portfolio you fly through instead of scroll. Hold forward and the story arrives at distance.",
    url: SITE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Paardhu — Developer Portfolio",
    description: "A portfolio you fly through instead of scroll.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${cinzel.variable} ${inter.variable}`}>{children}</body>
    </html>
  );
}
