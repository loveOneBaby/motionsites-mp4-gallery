"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
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

/** 用 XHR 直传到 R2 预签名地址,带上传进度。 */
function putFile(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`上传失败 (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("网络错误,上传失败。"));
    xhr.send(file);
  });
}

type UploadUrls = {
  video: { key: string; uploadUrl: string; contentType: string };
  poster?: { key: string; uploadUrl: string; contentType: string };
};

/** 从视频文件名生成可读标题。 */
function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 60) || "未命名视频";
}

/** 用 <video> + <canvas> 从视频中截取一帧作为封面图。失败返回 null。 */
function generatePoster(videoFile: File): Promise<File | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const url = URL.createObjectURL(videoFile);
    let settled = false;
    const finish = (result: File | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timeout = setTimeout(() => finish(null), 10000);

    video.onloadedmetadata = () => {
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const seekTo = dur > 0 ? Math.min(Math.max(dur * 0.2, 0.1), 2) : 0.1;
      try {
        video.currentTime = seekTo;
      } catch {
        finish(null);
      }
    };
    video.onseeked = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        finish(null);
        return;
      }
      try {
        const maxW = 960;
        const scale = Math.min(1, maxW / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            finish(null);
            return;
          }
          const base = videoFile.name.replace(/\.[^.]+$/, "");
          finish(new File([blob], `${base}-poster.jpg`, { type: "image/jpeg" }));
        }, "image/jpeg", 0.82);
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

export default function AdminUploader({ initialVideos }: AdminUploaderProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [generating, setGenerating] = useState(false);
  const posterInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const savedPassword = window.localStorage.getItem("motionsites-admin-password");
    if (savedPassword) setPassword(savedPassword);
  }, []);

  // 释放封面预览的 object URL,避免内存泄漏。
  useEffect(() => {
    return () => {
      if (posterPreview) URL.revokeObjectURL(posterPreview);
    };
  }, [posterPreview]);

  function savePassword(value: string) {
    setPassword(value);
    window.localStorage.setItem("motionsites-admin-password", value);
  }

  async function onVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      setVideoFile(null);
      return;
    }
    setVideoFile(file);
    setTitle(titleFromFilename(file.name));

    setGenerating(true);
    setMessage("已生成标题,正在从视频截取封面…");
    const poster = await generatePoster(file).catch(() => null);
    setGenerating(false);

    if (poster) {
      setPosterFile(poster);
      setPosterPreview(URL.createObjectURL(poster));
      setMessage("已自动生成标题与封面,可编辑后点“上传视频”。");
    } else {
      setPosterFile(null);
      setPosterPreview(null);
      setMessage("标题已生成;封面自动截取失败(浏览器无法解码该视频),可手动选择封面图。");
    }
  }

  function onPosterChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
  }

  function removePoster() {
    setPosterFile(null);
    setPosterPreview(null);
    if (posterInputRef.current) posterInputRef.current.value = "";
  }

  function resetForm(form: HTMLFormElement) {
    form.reset();
    setVideoFile(null);
    setPosterFile(null);
    setPosterPreview(null);
    setTitle("");
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

    const form = event.currentTarget;
    const formData = new FormData(form);

    if (!videoFile) {
      setMessage("请选择视频文件。");
      return;
    }

    const authHeaders = password ? { "x-admin-password": password } : undefined;

    setBusy(true);
    setMessage("获取上传地址…");

    try {
      // 1) 向服务端申请预签名直传地址(视频 + 可选封面)
      const urlResponse = await fetch(apiPath("/api/videos/upload-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          video: {
            filename: videoFile.name,
            contentType: videoFile.type || "video/mp4",
            size: videoFile.size
          },
          poster: posterFile
            ? {
                filename: posterFile.name,
                contentType: posterFile.type || "image/jpeg",
                size: posterFile.size
              }
            : null
        })
      });

      const urls = (await urlResponse.json()) as UploadUrls & { error?: string };
      if (!urlResponse.ok) {
        throw new Error(urls.error || "获取上传地址失败。");
      }

      // 2) 浏览器直接 PUT 到 R2(带进度)
      await putFile(urls.video.uploadUrl, videoFile, urls.video.contentType, (pct) =>
        setMessage(`正在上传视频 ${pct}%`)
      );

      if (posterFile && urls.poster) {
        setMessage("正在上传封面图…");
        await putFile(urls.poster.uploadUrl, posterFile, urls.poster.contentType, () => undefined);
      }

      // 3) 回传元数据,写入图库
      setMessage("保存记录…");
      const recordResponse = await fetch(apiPath("/api/videos"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          title,
          category: String(formData.get("category") || ""),
          tags: String(formData.get("tags") || ""),
          featured: formData.get("featured") === "on",
          videoKey: urls.video.key,
          posterKey: urls.poster?.key
        })
      });

      const payload = (await recordResponse.json()) as { error?: string; video?: VideoItem };
      if (!recordResponse.ok || !payload.video) {
        throw new Error(payload.error || "保存失败。");
      }

      resetForm(form);
      setVideos((current) => [payload.video!, ...current]);
      setMessage("上传成功。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败。");
    } finally {
      setBusy(false);
    }
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
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder="选择视频后自动生成,可编辑"
          />
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
          <input
            name="video"
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            required
            onChange={onVideoChange}
          />
        </label>

        <label>
          封面图(自动从视频截取,可更换)
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {posterPreview && (
              <img
                src={posterPreview}
                alt="封面预览"
                style={{ width: 96, height: 54, objectFit: "cover", borderRadius: 6 }}
              />
            )}
            <button
              type="button"
              onClick={() => posterInputRef.current?.click()}
              disabled={generating}
              className="pill-button small"
            >
              {posterFile ? "更换封面" : "选择封面(可选)"}
            </button>
            {posterFile && (
              <button type="button" onClick={removePoster} className="pill-button small">
                移除
              </button>
            )}
            <input
              ref={posterInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onPosterChange}
              style={{ display: "none" }}
            />
          </div>
          {generating && (
            <span style={{ fontSize: 12, color: "#888" }}>正在从视频截取封面…</span>
          )}
        </label>

        <label className="checkbox-row">
          <input name="featured" type="checkbox" />
          <span>在顶部大卡片中推荐该视频</span>
        </label>

        <button
          className="pill-button upload-submit"
          type="submit"
          disabled={busy || generating || isStaticPreview}
        >
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
