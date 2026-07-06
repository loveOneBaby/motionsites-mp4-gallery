import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MotionSites MP4 图库",
  description: "MotionSites 风格的 MP4 预览图库,支持后台上传。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
