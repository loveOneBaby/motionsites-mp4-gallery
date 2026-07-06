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
          <a href="#gallery">板块 <em>新</em></a>
          <a href="#gallery">背景 <em>新</em></a>
          <a href="mailto:hello@example.com">联系我们</a>
          <a href={withBasePath("/admin")}>管理</a>
          <a className="pill-button small" href={withBasePath("/admin")}>上传</a>
        </nav>
      </header>

      <section className="hero-section">
        <p className="eyebrow">每日上新</p>
        <h1>
          惊艳的
          <span>动态背景</span>
        </h1>
        <p className="hero-copy">
          精选电影级 MP4 动态循环,即点即预览,即取即用。
        </p>
        <a className="pill-button hero-button" href="#gallery">
          无限畅享 <span aria-hidden="true">→</span>
        </a>
      </section>

      <Gallery videos={videos} />
    </main>
  );
}
