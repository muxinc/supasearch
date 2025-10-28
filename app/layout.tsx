import type { Metadata } from "next";
import { Bebas_Neue, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Supasearch",
  description: "Find the clips you are looking for",
  openGraph: {
    title: "Supasearch",
    description: "Find the clips you are looking for",
    images: [
      {
        url: "/supasearch.png",
        alt: "Supasearch",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Supasearch",
    description: "Find the clips you are looking for",
    images: ["/supasearch.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bebasNeue.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
