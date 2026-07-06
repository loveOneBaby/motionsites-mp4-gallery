import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

export type VideoItem = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  src: string;
  poster?: string;
  featured: boolean;
  createdAt: string;
};

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "videos.json");
const UPLOAD_DIR = path.join(ROOT, "public", "uploads");
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const POSTER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, "[]\n", "utf8");
  }
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

  return slug || "video";
}

function cleanText(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function parseTags(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];

  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function safeExtension(fileName: string, allowed: Set<string>, fallback: string) {
  const ext = path.extname(fileName).toLowerCase();
  return allowed.has(ext) ? ext : fallback;
}

async function readJson(): Promise<VideoItem[]> {
  await ensureStore();
  const raw = await fs.readFile(DB_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw || "[]");

  if (!Array.isArray(parsed)) return [];

  return parsed.filter((item): item is VideoItem => {
    return Boolean(
      item &&
        typeof item === "object" &&
        "id" in item &&
        "title" in item &&
        "src" in item
    );
  });
}

async function writeJson(videos: VideoItem[]) {
  await ensureStore();
  await fs.writeFile(DB_PATH, `${JSON.stringify(videos, null, 2)}\n`, "utf8");
}

export async function getVideos() {
  const videos = await readJson();

  return videos.sort((a, b) => {
    const featuredDiff = Number(b.featured) - Number(a.featured);
    if (featuredDiff !== 0) return featuredDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function saveUploadedVideo(formData: FormData) {
  const video = formData.get("video");

  if (!(video instanceof File) || video.size === 0) {
    throw new Error("Please upload a valid video file.");
  }

  if (video.size > MAX_VIDEO_BYTES) {
    throw new Error("Video is too large. The local demo limit is 250 MB.");
  }

  const title = cleanText(formData.get("title"), "Untitled Video");
  const category = cleanText(formData.get("category"), "Animated Background");
  const tags = parseTags(formData.get("tags"));
  const featured = formData.get("featured") === "on" || formData.get("featured") === "true";

  const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const baseName = `${id}-${slugify(title)}`;
  const videoExt = safeExtension(video.name, VIDEO_EXTENSIONS, ".mp4");
  const videoFileName = `${baseName}${videoExt}`;
  const videoPath = path.join(UPLOAD_DIR, videoFileName);
  const videoBuffer = Buffer.from(await video.arrayBuffer());
  await fs.writeFile(videoPath, videoBuffer);

  const poster = formData.get("poster");
  let posterUrl: string | undefined;

  if (poster instanceof File && poster.size > 0) {
    const posterExt = safeExtension(poster.name, POSTER_EXTENSIONS, ".jpg");
    const posterFileName = `${baseName}-poster${posterExt}`;
    const posterPath = path.join(UPLOAD_DIR, posterFileName);
    const posterBuffer = Buffer.from(await poster.arrayBuffer());
    await fs.writeFile(posterPath, posterBuffer);
    posterUrl = `/uploads/${posterFileName}`;
  }

  const item: VideoItem = {
    id,
    title,
    category,
    tags,
    src: `/uploads/${videoFileName}`,
    poster: posterUrl,
    featured,
    createdAt: new Date().toISOString()
  };

  const videos = await readJson();
  await writeJson([item, ...videos]);

  return item;
}

function uploadAssetPath(url: string | undefined) {
  if (!url || !url.startsWith("/uploads/")) return null;

  const filePath = path.join(ROOT, "public", url);
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(UPLOAD_DIR)) return null;
  return normalized;
}

async function safeUnlink(url: string | undefined) {
  const filePath = uploadAssetPath(url);
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore missing files. Metadata should still be cleaned up.
  }
}

export async function deleteVideo(id: string) {
  const videos = await readJson();
  const target = videos.find((video) => video.id === id);

  if (!target) return null;

  await writeJson(videos.filter((video) => video.id !== id));
  await safeUnlink(target.src);
  await safeUnlink(target.poster);

  return target;
}
