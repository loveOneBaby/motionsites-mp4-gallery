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
        <a className="pill-button small" href={withBasePath("/")}>查看站点</a>
      </header>

      <section className="admin-hero">
        <p className="eyebrow left">后台上传</p>
        <h1>上传 MP4 动态背景</h1>
        <p>
          添加电影级动态背景、封面图、分类和标签。新上传的内容会立即出现在首页。
        </p>
      </section>

      <AdminUploader initialVideos={videos} />
    </main>
  );
}
