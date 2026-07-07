"use client";

import { ChangeEvent, CSSProperties, DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import type { VideoItem } from "../../lib/video-store";

type AdminUploaderProps = {
  initialVideos: VideoItem[];
};

const isStaticPreview = process.env.NEXT_PUBLIC_STATIC_PREVIEW === "true";
const LARGE_FILE = 50 * 1024 * 1024; // 50MB 以上提醒

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
  media: { key: string; uploadUrl: string; contentType: string };
  poster?: { key: string; uploadUrl: string; contentType: string };
  thumb?: { key: string; uploadUrl: string; contentType: string };
};

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

function kindOf(file: File): "video" | "image" {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  return IMAGE_EXTS.includes(ext) ? "image" : "video";
}

function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 60) || "未命名媒体";
}

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

/** 用 <img> + <canvas> 给图片生成一张缩略图(网格用,宽边 ≤480)。失败返回 null。 */
function generateImageThumb(imageFile: File, maxW = 480): Promise<File | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);
    let settled = false;
    const finish = (result: File | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timeout = setTimeout(() => finish(null), 8000);
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          finish(null);
          return;
        }
        const scale = Math.min(1, maxW / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            finish(null);
            return;
          }
          const base = imageFile.name.replace(/\.[^.]+$/, "");
          finish(new File([blob], `${base}-thumb.jpg`, { type: "image/jpeg" }));
        }, "image/jpeg", 0.8);
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

type Status = "pending" | "uploading" | "done" | "error";

type QueueItem = {
  id: string;
  file: File;
  kind: "video" | "image";
  title: string;
  preview: string | null;
  status: Status;
  progress: number;
  error?: string;
  warning?: string;
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AdminUploader({ initialVideos }: AdminUploaderProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [category, setCategory] = useState("动态背景");
  const [tags, setTags] = useState("");
  const [featured, setFeatured] = useState(false);
  const [dragging, setDragging] = useState(false);

  // 行内编辑
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editFeatured, setEditFeatured] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  // 鉴权状态:null=检查中,false=未登录,true=已登录
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loginPw, setLoginPw] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const posterPromises = useRef<Map<string, Promise<File | null>>>(new Map());
  const thumbPromises = useRef<Map<string, Promise<File | null>>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isStaticPreview) {
      setAuthed(false);
      return;
    }
    fetch(apiPath("/api/auth/me"))
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginBusy(true);
    setMessage("");
    try {
      const res = await fetch(apiPath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPw })
      });
      if (res.ok) {
        setAuthed(true);
        setLoginPw("");
      } else {
        const data = (await res.json()) as { error?: string };
        setMessage(data.error || "登录失败。");
      }
    } catch {
      setMessage("网络错误,登录失败。");
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    await fetch(apiPath("/api/auth/logout"), { method: "POST" });
    setAuthed(false);
    setQueue([]);
  }

  function addFiles(fileList: FileList | File[]) {
    if (isStaticPreview) {
      setMessage("GitHub Pages 预览为只读。请运行 Node 应用或部署到服务器后再上传。");
      return;
    }
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const newItems: QueueItem[] = files.map((file) => {
      const kind = kindOf(file);
      return {
        id: newId(),
        file,
        kind,
        title: titleFromFilename(file.name),
        preview: kind === "image" ? URL.createObjectURL(file) : null,
        status: "pending" as Status,
        progress: 0,
        warning: file.size > LARGE_FILE
          ? `文件较大(${Math.round(file.size / 1024 / 1024)} MB),上传可能较慢`
          : undefined
      };
    });
    setQueue((q) => [...q, ...newItems]);
    setMessage(`已添加 ${newItems.length} 个文件,可编辑标题后点“全部上传”。`);

    for (const item of newItems) {
      if (item.kind !== "video") continue;
      const p = generatePoster(item.file).catch(() => null);
      posterPromises.current.set(item.id, p);
      p.then((poster) => {
        setQueue((q) =>
          q.map((it) =>
            it.id === item.id
              ? { ...it, preview: poster ? URL.createObjectURL(poster) : null }
              : it
          )
        );
      });
    }

    // 为图片项异步生成缩略图(网格用)
    for (const item of newItems) {
      if (item.kind !== "image") continue;
      thumbPromises.current.set(item.id, generateImageThumb(item.file).catch(() => null));
    }
  }

  function onFilePick(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files) addFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    const item = queue.find((it) => it.id === id);
    if (item?.preview) URL.revokeObjectURL(item.preview);
    posterPromises.current.delete(id);
    thumbPromises.current.delete(id);
    setQueue((q) => q.filter((it) => it.id !== id));
  }

  function clearFinished() {
    setQueue((q) => {
      q.forEach((it) => {
        if (it.preview && (it.status === "done" || it.status === "error")) {
          URL.revokeObjectURL(it.preview);
        }
      });
      return q.filter((it) => it.status !== "done" && it.status !== "error");
    });
  }

  async function uploadOne(item: QueueItem): Promise<VideoItem> {
    // cookie 同源自动携带,无需密码头。
    const poster =
      item.kind === "video"
        ? await (posterPromises.current.get(item.id) ?? Promise.resolve(null))
        : null;
    const thumb =
      item.kind === "image"
        ? await (thumbPromises.current.get(item.id) ?? Promise.resolve(null))
        : null;

    const urlResponse = await fetch(apiPath("/api/videos/upload-url"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media: {
          filename: item.file.name,
          contentType: item.file.type || (item.kind === "image" ? "image/jpeg" : "video/mp4"),
          size: item.file.size
        },
        poster: poster
          ? { filename: poster.name, contentType: poster.type || "image/jpeg", size: poster.size }
          : null,
        thumb: thumb
          ? { filename: thumb.name, contentType: thumb.type || "image/jpeg", size: thumb.size }
          : null
      })
    });
    const urls = (await urlResponse.json()) as UploadUrls & { error?: string };
    if (!urlResponse.ok) throw new Error(urls.error || "获取上传地址失败。");

    await putFile(urls.media.uploadUrl, item.file, urls.media.contentType, (pct) =>
      updateItem(item.id, { progress: pct })
    );
    if (poster && urls.poster) {
      await putFile(urls.poster.uploadUrl, poster, urls.poster.contentType, () => undefined);
    }
    if (thumb && urls.thumb) {
      await putFile(urls.thumb.uploadUrl, thumb, urls.thumb.contentType, () => undefined);
    }

    const recordResponse = await fetch(apiPath("/api/videos"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title,
        category,
        tags,
        featured,
        mediaKey: urls.media.key,
        posterKey: urls.poster?.key,
        thumbKey: urls.thumb?.key,
        kind: item.kind
      })
    });
    const payload = (await recordResponse.json()) as { error?: string; video?: VideoItem };
    if (!recordResponse.ok || !payload.video) throw new Error(payload.error || "保存失败。");
    return payload.video;
  }

  async function uploadAll(event: FormEvent) {
    event.preventDefault();
    if (isStaticPreview) {
      setMessage("GitHub Pages 预览为只读。");
      return;
    }
    const pending = queue.filter((it) => it.status !== "done" && it.status !== "uploading");
    if (pending.length === 0) {
      setMessage("没有待上传的文件。");
      return;
    }
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const item of pending) {
      updateItem(item.id, { status: "uploading", progress: 0, error: undefined });
      try {
        await uploadOne(item);
        ok += 1;
        updateItem(item.id, { status: "done", progress: 100 });
      } catch (error) {
        fail += 1;
        updateItem(item.id, { status: "error", error: error instanceof Error ? error.message : "上传失败。" });
      }
    }
    setMessage(`批量上传完成:成功 ${ok} 个,失败 ${fail} 个。`);
    setBusy(false);
    if (ok > 0) await refreshVideos();
  }

  async function refreshVideos() {
    if (isStaticPreview) {
      setMessage("GitHub Pages 预览为只读。");
      return;
    }
    const response = await fetch(apiPath("/api/videos"), { cache: "no-store" });
    const payload = (await response.json()) as { videos: VideoItem[] };
    setVideos(payload.videos);
  }

  function startEdit(video: VideoItem) {
    setEditingId(video.id);
    setEditTitle(video.title);
    setEditCategory(video.category);
    setEditTags(video.tags.join(", "));
    setEditFeatured(video.featured);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    setEditBusy(true);
    try {
      const res = await fetch(apiPath(`/api/videos/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          category: editCategory,
          tags: editTags,
          featured: editFeatured
        })
      });
      const data = (await res.json()) as { error?: string; video?: VideoItem };
      if (!res.ok || !data.video) {
        setMessage(data.error || "保存失败。");
        return;
      }
      setVideos((curr) => curr.map((v) => (v.id === id ? data.video! : v)));
      setEditingId(null);
      setMessage("已更新。");
    } catch {
      setMessage("网络错误,保存失败。");
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("确定从图库中删除该媒体吗?");
    if (!confirmed) return;

    if (isStaticPreview) {
      setMessage("GitHub Pages 预览为只读。");
      return;
    }

    const response = await fetch(apiPath(`/api/videos/${id}`), { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error || "删除失败。");
      return;
    }
    setVideos((current) => current.filter((video) => video.id !== id));
    setMessage("已删除。");
  }

  const dropZoneStyle: CSSProperties = {
    border: `2px dashed ${dragging ? "#4f7cff" : "#ccc"}`,
    borderRadius: 12,
    padding: 20,
    textAlign: "center",
    background: dragging ? "rgba(79,124,255,0.08)" : "transparent",
    cursor: "pointer",
    transition: "all 0.15s"
  };
  const thumbStyle: CSSProperties = { width: 48, height: 36, objectFit: "cover", borderRadius: 4 };
  const placeholderStyle: CSSProperties = {
    width: 48, height: 36, borderRadius: 4, background: "#222", color: "#aaa",
    fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center"
  };

  // 静态预览:只读提示
  if (isStaticPreview) {
    return (
      <section className="admin-grid">
        <p className="status-message static-preview-note">
          GitHub Pages 静态预览:此处禁用上传和删除操作。请访问可运行服务端的部署(如 Vercel)以上传。
        </p>
        <div className="admin-list-panel">
          <div className="admin-list-heading"><h2>图库</h2></div>
          <div className="admin-video-list">
            {videos.map((video) => (
              <article className="admin-video-row" key={video.id}>
                {video.kind === "image" ? (
                  <img src={withBasePath(video.src)} alt={video.title} style={{ width: 80, height: 45, objectFit: "cover", borderRadius: 4 }} />
                ) : (
                  <video src={withBasePath(video.src)} poster={withBasePath(video.poster)} muted playsInline preload="metadata" />
                )}
                <div><strong>{video.title}</strong><span>{video.category}</span>{video.featured && <em>推荐</em>}</div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // 检查登录状态
  if (authed === null) {
    return <section className="admin-grid"><p className="status-message">正在检查登录状态…</p></section>;
  }

  // 未登录:登录表单
  if (!authed) {
    return (
      <section className="admin-grid">
        <form className="upload-panel" onSubmit={login} style={{ maxWidth: 360 }}>
          <h2 style={{ marginTop: 0 }}>管理员登录</h2>
          <label>
            管理密码
            <input
              type="password"
              value={loginPw}
              onChange={(e) => setLoginPw(e.target.value)}
              required
              autoFocus
              autoComplete="current-password"
            />
          </label>
          <button className="pill-button upload-submit" type="submit" disabled={loginBusy}>
            {loginBusy ? "登录中…" : "登录"}
          </button>
          {message && <p className="status-message">{message}</p>}
        </form>
      </section>
    );
  }

  // 已登录:上传界面
  return (
    <section className="admin-grid">
      <form className="upload-panel" onSubmit={uploadAll}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>上传</h2>
          <button type="button" onClick={logout} className="pill-button small">退出登录</button>
        </div>

        <div
          style={dropZoneStyle}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <p style={{ margin: 0 }}>{dragging ? "松开即可添加" : "把视频/图片拖到此处,或点击选择"}</p>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#888" }}>支持批量;视频自动生成标题与封面,图片作为图库项</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp,image/gif"
            onChange={onFilePick}
            style={{ display: "none" }}
          />
        </div>

        <label>
          分类(应用于本批全部)
          <input value={category} onChange={(e) => setCategory(e.target.value)} required />
        </label>
        <label>
          标签(逗号分隔,应用于本批全部)
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="电影级, 云朵, 梦幻" />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          <span>推荐本批到顶部大卡片</span>
        </label>

        {queue.length > 0 && (
          <div className="admin-video-list" style={{ flexDirection: "column" }}>
            {queue.map((item) => (
              <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #eee" }}>
                {item.preview ? <img src={item.preview} alt="" style={thumbStyle} /> : <div style={placeholderStyle}>视频</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    value={item.title}
                    onChange={(e) => updateItem(item.id, { title: e.target.value })}
                    disabled={item.status === "done"}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                  <div style={{ fontSize: 11, color: "#888" }}>
                    {item.kind === "image" ? "图片" : "视频"} · {item.file.name}
                  </div>
                  {item.warning && <div style={{ fontSize: 11, color: "#b80" }}>{item.warning}</div>}
                  {item.status === "uploading" && (
                    <div style={{ height: 4, background: "#eee", borderRadius: 2, marginTop: 4 }}>
                      <div style={{ width: `${item.progress}%`, height: "100%", background: "#4f7cff", borderRadius: 2 }} />
                    </div>
                  )}
                  {item.status === "error" && <div style={{ fontSize: 11, color: "#d33" }}>{item.error}</div>}
                  {item.status === "done" && <div style={{ fontSize: 11, color: "#3a9" }}>已上传</div>}
                </div>
                {item.status !== "uploading" && item.status !== "done" && (
                  <button type="button" onClick={() => removeItem(item.id)} className="pill-button small">移除</button>
                )}
              </div>
            ))}
            <button type="button" onClick={clearFinished} className="pill-button small" style={{ marginTop: 8, alignSelf: "flex-start" }}>清除已完成</button>
          </div>
        )}

        <button className="pill-button upload-submit" type="submit" disabled={busy || queue.length === 0}>
          {busy ? "上传中…" : `全部上传(${queue.filter((it) => it.status !== "done").length})`}
        </button>
        {message && <p className="status-message">{message}</p>}
      </form>

      <div className="admin-list-panel">
        <div className="admin-list-heading">
          <h2>图库</h2>
          <button type="button" onClick={refreshVideos}>刷新</button>
        </div>
        <div className="admin-video-list">
          {videos.map((video) => {
            const editing = editingId === video.id;
            return (
              <article
                className="admin-video-row"
                key={video.id}
                style={editing ? { flexWrap: "wrap" } : undefined}
              >
                {video.kind === "image" ? (
                  <img src={withBasePath(video.thumb || video.src)} alt={video.title} style={{ width: 80, height: 45, objectFit: "cover", borderRadius: 4 }} />
                ) : (
                  <video src={withBasePath(video.src)} poster={withBasePath(video.poster)} muted playsInline preload="metadata" />
                )}
                {editing ? (
                  <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="标题" />
                    <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="分类" />
                    <input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="标签,逗号分隔" />
                    <label className="checkbox-row">
                      <input type="checkbox" checked={editFeatured} onChange={(e) => setEditFeatured(e.target.checked)} />
                      <span>推荐</span>
                    </label>
                  </div>
                ) : (
                  <div>
                    <strong>{video.title}</strong>
                    <span>{video.category}</span>
                    {video.featured && <em>推荐</em>}
                  </div>
                )}
                {editing ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="pill-button small" onClick={() => saveEdit(video.id)} disabled={editBusy}>
                      {editBusy ? "保存中…" : "保存"}
                    </button>
                    <button type="button" className="pill-button small" onClick={cancelEdit} disabled={editBusy}>取消</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="pill-button small" onClick={() => startEdit(video)}>编辑</button>
                    <button type="button" onClick={() => handleDelete(video.id)}>删除</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
