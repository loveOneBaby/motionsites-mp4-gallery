import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://motionsites-mp4-gallery.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MotionSites 媒体图库",
    template: "%s · MotionSites"
  },
  description: "MotionSites 风格的动态背景与图片图库,支持视频/图片上传、悬停预览与分类筛选。",
  openGraph: {
    title: "MotionSites 媒体图库",
    description: "精选电影级 MP4 动态循环与图片,即点即预览,即取即用。",
    type: "website",
    locale: "zh_CN",
    siteName: "MotionSites 媒体图库",
    url: SITE_URL,
    images: [
      {
        url: "/samples/sunset-villa.jpg",
        width: 1200,
        height: 675,
        alt: "MotionSites 媒体图库"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "MotionSites 媒体图库",
    description: "精选电影级 MP4 动态循环与图片。",
    images: ["/samples/sunset-villa.jpg"]
  },
  robots: { index: true, follow: true }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
