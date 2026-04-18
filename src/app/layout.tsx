import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  metadataBase: new URL("https://jaleel.co.za"),
  title: "JD van Staden — Software Development Engineer",
  description:
    "Software engineer at AWS with experience across backend systems, cloud infrastructure, and mobile development. Based in Cape Town, South Africa.",
  openGraph: {
    type: "website",
    locale: "en_ZA",
    siteName: "JD van Staden",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  alternates: { canonical: "/" },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "JD van Staden",
  url: "https://jaleel.co.za",
  jobTitle: "Software Development Engineer",
  worksFor: { "@type": "Organization", name: "Amazon Web Services" },
  sameAs: [
    "https://github.com/Jaleel-VS",
    "https://linkedin.com/in/jd-van-staden",
  ],
  knowsAbout: ["Java", "Python", "TypeScript", "AWS", "Spring Boot", "Kubernetes"],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme:dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        {children}
      </body>
    </html>
  )
}
