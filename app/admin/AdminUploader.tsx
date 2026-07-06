"use client";

import { FormEvent, useEffect, useState } from "react";
import type { VideoItem } from "../../lib/video-store";

type AdminUploaderProps = {
  initialVideos: VideoItem[];
};

const isStaticPreview = process.env.NEXT_PUBLIC_STATIC_PREVIEW === "true";

function withBasePath(path?: string) {
  if (!path) return undefined;
  if (/^(https?:)?\/\//.test(path) || path.startsWith("data:")) return path;

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${normalized}`;
}

function apiPath(path: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return `${basePath}${path}`;
}

export default function AdminUploader({ initialVideos }: AdminUploaderProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const savedPassword = window.localStorage.getItem("motionsites-admin-password");
    if (savedPassword) setPassword(savedPassword);
  }, []);

  function savePassword(value: string) {
    setPassword(value);
    window.localStorage.setItem("motionsites-admin-password", value);
  }

  async function refreshVideos() {
    if (isStaticPreview) {
      setMessage("GitHub Pages 预览为只读。请运行 Node 应用或部署到服务器后再上传视频。");
      return;
    }

    const response = await fetch(apiPath("/api/videos"), { cache: "no-store" });
    const payload = (await response.json()) as { videos: VideoItem[] };
    setVideos(payload.videos);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStaticPreview) {
      setMessage("GitHub Pages 预览为只读。请运行 Node 应用或部署到服务器后再上传视频。");
      return;
    }

    setBusy(true);
    setMessage("上传中…");

    const form = event.currentTarget;
    const formData = new FormData(form);

    const response = await fetch(apiPath("/api/videos"), {
      method: "POST",
      body: formData,
      headers: password ? { "x-admin-password": password } : undefined
    });

    const payload = (await response.json()) as { error?: string; video?: VideoItem };

    if (!response.ok || !payload.video) {
      setMessage(payload.error || "上传失败。");
      setBusy(false);
      return;
    }

    form.reset();
    setVideos((current) => [payload.video!, ...current]);
    setMessage("上传成功。");
    setBusy(false);
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("确定从图库中删除该视频吗?");
    if (!confirmed) return;

    if (isStaticPreview) {
      setMessage("GitHub Pages 预览为只读。请运行 Node 应用或部署到服务器后再删除视频。");
      return;
    }

    const response = await fetch(apiPath(`/api/videos/${id}`), {
      method: "DELETE",
      headers: password ? { "x-admin-password": password } : undefined
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(payload.error || "删除失败。");
      return;
    }

    setVideos((current) => current.filter((video) => video.id !== id));
    setMessage("已删除。");
  }

  return (
    <section className="admin-grid">
      <form className="upload-panel" onSubmit={handleUpload}>
        {isStaticPreview && (
          <p className="status-message static-preview-note">
            GitHub Pages 静态预览:此处禁用上传和删除操作。
          </p>
        )}
        <label>
          管理密码
          <input
            value={password}
            onChange={(event) => savePassword(event.target.value)}
            type="password"
            placeholder="来自 ADMIN_PASSWORD 的值"
            autoComplete="current-password"
          />
        </label>

        <label>
          标题
          <input name="title" required placeholder="极光山谷循环" />
        </label>

        <label>
          分类
          <input name="category" required defaultValue="动态背景" />
        </label>

        <label>
          标签
          <input name="tags" placeholder="电影级, 云朵, 梦幻" />
        </label>

        <label>
          MP4 / WebM / MOV 文件
          <input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" required />
        </label>

        <label>
          封面图(可选)
          <input name="poster" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        </label>

        <label className="checkbox-row">
          <input name="featured" type="checkbox" />
          <span>在顶部大卡片中推荐该视频</span>
        </label>

        <button className="pill-button upload-submit" type="submit" disabled={busy || isStaticPreview}>
          {busy ? "上传中…" : "上传视频"}
        </button>

        {message && <p className="status-message">{message}</p>}
      </form>

      <div className="admin-list-panel">
        <div className="admin-list-heading">
          <h2>图库</h2>
          <button type="button" onClick={refreshVideos} disabled={isStaticPreview}>刷新</button>
        </div>

        <div className="admin-video-list">
          {videos.map((video) => (
            <article className="admin-video-row" key={video.id}>
              <video src={withBasePath(video.src)} poster={withBasePath(video.poster)} muted playsInline preload="metadata" />
              <div>
                <strong>{video.title}</strong>
                <span>{video.category}</span>
                {video.featured && <em>推荐</em>}
              </div>
              <button type="button" onClick={() => handleDelete(video.id)} disabled={isStaticPreview}>删除</button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
