import { Suspense } from "react";
import Link from "next/link";
import Gallery from "./components/Gallery";
import { getVideos } from "../lib/video-store";

export const dynamic = "force-dynamic";

function withBasePath(path: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (path === "/") return `${basePath}/`;
  return `${basePath}${path}`;
}

export default async function Home() {
  const videos = await getVideos();

  return (
    <main className="site-shell">
      <header className="top-nav" aria-label="主导航">
        <a className="brand" href={withBasePath("/")} aria-label="MotionSites 首页">
          <span className="brand-mark">M</span>
          <span>motionsites</span>
        </a>

        <nav className="nav-links">
          <Link href={{ pathname: "/", query: { kind: "video" }, hash: "gallery" }}>视频</Link>
          <Link href={{ pathname: "/", query: { kind: "image" }, hash: "gallery" }}>图片</Link>
          <a href="mailto:hello@example.com">联系我们</a>
          <Link href="/admin" className="pill-button small">管理</Link>
        </nav>
      </header>

      <section className="hero-section">
        <p className="eyebrow">每日上新</p>
        <h1>
          惊艳的
          <span>动态背景与图片</span>
        </h1>
        <p className="hero-copy">
          精选电影级 MP4 循环与图片,即点即预览,即取即用。
        </p>
        <Link className="pill-button hero-button" href={{ pathname: "/", hash: "gallery" }}>
          无限畅享 <span aria-hidden="true">→</span>
        </Link>
      </section>

      <Suspense fallback={null}>
        <Gallery videos={videos} />
      </Suspense>
    </main>
  );
}
