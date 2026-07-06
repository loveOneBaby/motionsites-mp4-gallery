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
      <header className="top-nav" aria-label="Main navigation">
        <a className="brand" href={withBasePath("/")} aria-label="MotionSites home">
          <span className="brand-mark">M</span>
          <span>motionsites</span>
        </a>

        <nav className="nav-links">
          <a href="#gallery">Sections <em>NEW</em></a>
          <a href="#gallery">Backgrounds <em>NEW</em></a>
          <a href="mailto:hello@example.com">Contact Us</a>
          <a href={withBasePath("/admin")}>Admin</a>
          <a className="pill-button small" href={withBasePath("/admin")}>Upload</a>
        </nav>
      </header>

      <section className="hero-section">
        <p className="eyebrow">NEW VIDEOS ADDED DAILY</p>
        <h1>
          Jaw-dropping
          <span>Animated Backgrounds</span>
        </h1>
        <p className="hero-copy">
          A curated collection of cinematic MP4 loops, ready to preview and publish.
        </p>
        <a className="pill-button hero-button" href="#gallery">
          Go Unlimited <span aria-hidden="true">→</span>
        </a>
      </section>

      <Gallery videos={videos} />
    </main>
  );
}
