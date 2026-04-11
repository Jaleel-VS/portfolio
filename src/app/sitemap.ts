import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://jaleel.co.za", lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
  ]
}
