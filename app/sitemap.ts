import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://motionsites-mp4-gallery.vercel.app";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/?kind=video`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/?kind=image`, lastModified: now, changeFrequency: "daily", priority: 0.8 }
  ];
}
