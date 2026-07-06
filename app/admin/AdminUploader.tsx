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
      setMessage("GitHub Pages preview is read-only. Run the Node app or deploy to a server to upload videos.");
      return;
    }

    const response = await fetch(apiPath("/api/videos"), { cache: "no-store" });
    const payload = (await response.json()) as { videos: VideoItem[] };
    setVideos(payload.videos);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStaticPreview) {
      setMessage("GitHub Pages preview is read-only. Run the Node app or deploy to a server to upload videos.");
      return;
    }

    setBusy(true);
    setMessage("Uploading...");

    const form = event.currentTarget;
    const formData = new FormData(form);

    const response = await fetch(apiPath("/api/videos"), {
      method: "POST",
      body: formData,
      headers: password ? { "x-admin-password": password } : undefined
    });

    const payload = (await response.json()) as { error?: string; video?: VideoItem };

    if (!response.ok || !payload.video) {
      setMessage(payload.error || "Upload failed.");
      setBusy(false);
      return;
    }

    form.reset();
    setVideos((current) => [payload.video!, ...current]);
    setMessage("Uploaded successfully.");
    setBusy(false);
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this video from the library?");
    if (!confirmed) return;

    if (isStaticPreview) {
      setMessage("GitHub Pages preview is read-only. Run the Node app or deploy to a server to delete videos.");
      return;
    }

    const response = await fetch(apiPath(`/api/videos/${id}`), {
      method: "DELETE",
      headers: password ? { "x-admin-password": password } : undefined
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(payload.error || "Delete failed.");
      return;
    }

    setVideos((current) => current.filter((video) => video.id !== id));
    setMessage("Deleted.");
  }

  return (
    <section className="admin-grid">
      <form className="upload-panel" onSubmit={handleUpload}>
        {isStaticPreview && (
          <p className="status-message static-preview-note">
            Static GitHub Pages preview: upload and delete actions are disabled here.
          </p>
        )}
        <label>
          Admin password
          <input
            value={password}
            onChange={(event) => savePassword(event.target.value)}
            type="password"
            placeholder="Value from ADMIN_PASSWORD"
            autoComplete="current-password"
          />
        </label>

        <label>
          Title
          <input name="title" required placeholder="Aurora valley loop" />
        </label>

        <label>
          Category
          <input name="category" required defaultValue="Animated Background" />
        </label>

        <label>
          Tags
          <input name="tags" placeholder="cinematic, clouds, dreamy" />
        </label>

        <label>
          MP4 / WebM / MOV file
          <input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" required />
        </label>

        <label>
          Poster image, optional
          <input name="poster" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        </label>

        <label className="checkbox-row">
          <input name="featured" type="checkbox" />
          <span>Feature this video in the large top cards</span>
        </label>

        <button className="pill-button upload-submit" type="submit" disabled={busy || isStaticPreview}>
          {busy ? "Uploading..." : "Upload video"}
        </button>

        {message && <p className="status-message">{message}</p>}
      </form>

      <div className="admin-list-panel">
        <div className="admin-list-heading">
          <h2>Library</h2>
          <button type="button" onClick={refreshVideos} disabled={isStaticPreview}>Refresh</button>
        </div>

        <div className="admin-video-list">
          {videos.map((video) => (
            <article className="admin-video-row" key={video.id}>
              <video src={withBasePath(video.src)} poster={withBasePath(video.poster)} muted playsInline preload="metadata" />
              <div>
                <strong>{video.title}</strong>
                <span>{video.category}</span>
                {video.featured && <em>Featured</em>}
              </div>
              <button type="button" onClick={() => handleDelete(video.id)} disabled={isStaticPreview}>Delete</button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
