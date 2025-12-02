import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import { SiteChrome, SiteFooter } from "@/components/site-chrome"

const inter = Inter({ subsets: ["latin"] })

export const viewport = {
  width: "device-width",
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL("https://melinux.net"),
  title: {
    default: "MeLinux – Accounting, Tax, Payroll, Consulting in Cyprus",
    template: "%s | MeLinux",
  },
  description: "Accounting, legal and consulting services in Cyprus. Tax, payroll, registration, investments, and business consulting.",
  keywords: [
    "accounting",
    "tax",
    "payroll",
    "consulting",
    "company registration",
    "investments",
    "cyprus",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "https://melinux.net/",
    title: "MeLinux – Accounting, Tax, Payroll, Consulting in Cyprus",
    description: "Accounting, legal and consulting services for businesses in Cyprus.",
    siteName: "MeLinux",
    images: [{ url: "/logo.png", width: 1200, height: 630, alt: "MeLinux" }],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "MeLinux – Accounting, Tax, Payroll, Consulting",
    description: "Accounting, legal and consulting services in Cyprus.",
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/favicon.png", sizes: "any" },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-primary focus:text-primary-foreground focus:px-3 focus:py-2 focus:rounded"
        >
          Skip to content
        </a>
        <Script id="ld-org" type="application/ld+json" strategy="afterInteractive">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "MeLinux Ltd.",
            url: "https://melinux.net/",
            logo: "https://melinux.net/logo.png",
            sameAs: [],
            address: {
              "@type": "PostalAddress",
              streetAddress: "Protara Leoforos No.259M, Kykladon B Block M, Flat 3",
              addressLocality: "Paralimni",
              postalCode: "5291",
              addressCountry: "CY",
            },
          })}
        </Script>
        <Script id="ld-website" type="application/ld+json" strategy="afterInteractive">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "MeLinux",
            url: "https://melinux.net/",
          })}
        </Script>
        <SiteChrome />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
