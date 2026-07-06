import AdminUploader from "./AdminUploader";
import { getVideos } from "../../lib/video-store";

export const dynamic = "force-dynamic";

function withBasePath(path: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (path === "/") return `${basePath}/`;
  return `${basePath}${path}`;
}

export default async function AdminPage() {
  const videos = await getVideos();

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a className="brand" href={withBasePath("/")}>
          <span className="brand-mark">M</span>
          <span>motionsites</span>
        </a>
        <a className="pill-button small" href={withBasePath("/")}>View site</a>
      </header>

      <section className="admin-hero">
        <p className="eyebrow left">ADMIN UPLOAD</p>
        <h1>Upload MP4 backgrounds</h1>
        <p>
          Add cinematic background loops, posters, categories, and tags. New uploads appear on the homepage immediately.
        </p>
      </section>

      <AdminUploader initialVideos={videos} />
    </main>
  );
}
