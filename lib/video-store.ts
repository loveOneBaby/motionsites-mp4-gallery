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

export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
export const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v"]);
export const POSTER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, "[]\n", "utf8");
  }
}

/** 生成新的视频记录 ID。 */
export function newVideoId(): string {
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

export function parseTags(value: unknown): string[] {
  if (typeof value !== "string") return [];

  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** 取文件扩展名,不在允许集合内则用 fallback。 */
export function safeExtension(fileName: string, allowed: Set<string>, fallback: string): string {
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

/** 记录一条已上传到 R2 的视频元数据。 */
export async function recordVideo(item: VideoItem): Promise<VideoItem> {
  const videos = await readJson();
  await writeJson([item, ...videos]);
  return item;
}

/** 仅删除元数据记录,返回被删除项(由调用方负责清理 R2 对象)。 */
export async function deleteVideo(id: string): Promise<VideoItem | null> {
  const videos = await readJson();
  const target = videos.find((video) => video.id === id);

  if (!target) return null;

  await writeJson(videos.filter((video) => video.id !== id));
  return target;
}
