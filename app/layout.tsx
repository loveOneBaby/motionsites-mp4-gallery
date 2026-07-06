import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MotionSites MP4 Gallery",
  description: "A MotionSites-style MP4 preview gallery with admin uploads."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
