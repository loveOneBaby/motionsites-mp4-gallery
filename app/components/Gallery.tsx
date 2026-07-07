"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { VideoItem } from "../../lib/video-store";

type GalleryProps = {
  videos: VideoItem[];
};

type KindFilter = "all" | "video" | "image";

function uniqueCategories(videos: VideoItem[]) {
  return Array.from(new Set(videos.map((video) => video.category))).filter(Boolean);
}

function withBasePath(path?: string) {
  if (!path) return undefined;
  if (/^(https?:)?\/\//.test(path) || path.startsWith("data:")) return path;

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${normalized}`;
}

function mediaKind(video: VideoItem): "video" | "image" {
  return video.kind === "image" ? "image" : "video";
}

function VideoCard({
  video,
  large,
  onOpen
}: {
  video: VideoItem;
  large?: boolean;
  onOpen: (video: VideoItem) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isImage = video.kind === "image";

  function playPreview() {
    if (isImage) return;
    const element = videoRef.current;
    if (!element) return;
    element.play().catch(() => undefined);
  }

  function stopPreview() {
    if (isImage) return;
    const element = videoRef.current;
    if (!element) return;
    element.pause();
    element.currentTime = 0;
  }

  return (
    <article
      className={`video-card ${large ? "video-card-large" : ""}`}
      onMouseEnter={playPreview}
      onMouseLeave={stopPreview}
    >
      <button className="video-hit-area" type="button" onClick={() => onOpen(video)}>
        {isImage ? (
          <img src={withBasePath(video.src)} alt={video.title} loading="lazy" />
        ) : (
          <video
            ref={videoRef}
            src={withBasePath(video.src)}
            poster={withBasePath(video.poster)}
            muted
            loop
            playsInline
            preload="metadata"
          />
        )}
        <span className="video-vignette" />
        <span className="card-meta">
          <strong>{video.title}</strong>
          <span>{video.category}</span>
        </span>
        {!isImage && <span className="preview-chip">预览</span>}
      </button>
    </article>
  );
}

function KindToggle({ active }: { active: KindFilter }) {
  const options: { label: string; kind: KindFilter }[] = [
    { label: "全部", kind: "all" },
    { label: "视频", kind: "video" },
    { label: "图片", kind: "image" }
  ];
  return (
    <div className="kind-toggle" role="group" aria-label="按类型筛选">
      {options.map((opt) => (
        <Link
          key={opt.kind}
          href={{ pathname: "/", query: opt.kind === "all" ? {} : { kind: opt.kind }, hash: "gallery" }}
          className={`kind-toggle-item ${active === opt.kind ? "is-active" : ""}`}
          aria-current={active === opt.kind ? "page" : undefined}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}

export default function Gallery({ videos }: GalleryProps) {
  const searchParams = useSearchParams();
  const rawKind = searchParams.get("kind");
  const kindFilter: KindFilter = rawKind === "video" || rawKind === "image" ? rawKind : "all";

  const [selected, setSelected] = useState<VideoItem | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const categories = useMemo(() => uniqueCategories(videos), [videos]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return videos.filter((video) => {
      const matchesCategory = category === "All" || video.category === category;
      const matchesKind = kindFilter === "all" || mediaKind(video) === kindFilter;
      const searchable = [video.title, video.category, ...video.tags].join(" ").toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      return matchesCategory && matchesQuery && matchesKind;
    });
  }, [videos, category, query, kindFilter]);

  const featured = filtered.slice(0, 2);
  const rest = filtered.slice(2);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <section className="gallery-section" id="gallery">
      <div className="gallery-toolbar">
        <div>
          <p className="eyebrow left">浏览图库</p>
          <h2>媒体库</h2>
        </div>

        <div className="filters">
          <KindToggle active={kindFilter} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题 / 标签"
            aria-label="搜索媒体"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="按分类筛选"
          >
            <option value="All">全部分类</option>
            {categories.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">没有符合该筛选条件的媒体。</div>
      ) : (
        <>
          <div className="featured-grid">
            {featured.map((video) => (
              <VideoCard video={video} large onOpen={setSelected} key={video.id} />
            ))}
          </div>

          <div className="video-grid">
            {rest.map((video) => (
              <VideoCard video={video} onOpen={setSelected} key={video.id} />
            ))}
          </div>
        </>
      )}

      {selected && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
          <div className="preview-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setSelected(null)} autoFocus>
              关闭
            </button>
            {selected.kind === "image" ? (
              <img
                src={withBasePath(selected.src)}
                alt={selected.title}
                style={{ maxWidth: "100%", maxHeight: "80vh", display: "block" }}
              />
            ) : (
              <video src={withBasePath(selected.src)} poster={withBasePath(selected.poster)} controls autoPlay playsInline />
            )}
            <div className="modal-copy">
              <span>{selected.category}</span>
              <h3>{selected.title}</h3>
              {selected.tags.length > 0 && <p>{selected.tags.map((tag) => `#${tag}`).join(" ")}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
