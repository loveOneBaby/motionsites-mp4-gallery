import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { isR2Configured, getJsonMetadata, putJsonMetadata } from "./r2";

export type VideoItem = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  src: string;
  poster?: string;
  featured: boolean;
  createdAt: string;
  /** 媒体类型:视频或图片。旧数据没有该字段时按视频处理。 */
  kind?: "video" | "image";
};

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "videos.json");

export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
export const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v"]);
export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

/** 判断媒体扩展名属于视频还是图片。 */
export function kindOfExtension(ext: string): "video" | "image" | null {
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  return null;
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

function isValidItem(item: unknown): item is VideoItem {
  return Boolean(
    item &&
      typeof item === "object" &&
      "id" in item &&
      "title" in item &&
      "src" in item
  );
}

/** 只读本地样例数据(用于无 R2 时的回退:GitHub Pages 静态构建、本地无 .env.local)。 */
async function readBundledSamples(): Promise<VideoItem[]> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
  } catch {
    return [];
  }
}

async function readJson(): Promise<VideoItem[]> {
  if (!isR2Configured()) return readBundledSamples();
  // R2 读取:对象缺失(404)用内置样例作种子;其它错误向上抛出,
  // 避免写操作误把内置样例当真实数据写回(导致已上传记录被覆盖丢失)。
  const data = await getJsonMetadata<VideoItem[]>();
  if (Array.isArray(data)) return data.filter(isValidItem);
  return readBundledSamples();
}

// 单进程写串行化,降低并发覆盖风险(跨实例/多用户仍需数据库,见 README)。
let writeChain: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function writeJson(videos: VideoItem[]) {
  // 配置了 R2 时写到 R2;否则写本地(仅本地开发用,serverless 下走 R2 分支)。
  if (isR2Configured()) {
    await putJsonMetadata(videos);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => undefined);
  await fs.writeFile(DB_PATH, `${JSON.stringify(videos, null, 2)}\n`, "utf8");
}

export async function getVideos() {
  // 读取出错时兜底用内置样例展示(仅展示,不影响写路径)。
  let videos: VideoItem[];
  try {
    videos = await readJson();
  } catch {
    videos = await readBundledSamples();
  }

  return videos.sort((a, b) => {
    const featuredDiff = Number(b.featured) - Number(a.featured);
    if (featuredDiff !== 0) return featuredDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/** 按 id 查找(只读),供删除流程先拿到对象 URL 再删元数据。 */
export async function findVideo(id: string): Promise<VideoItem | null> {
  const videos = await readJson();
  return videos.find((video) => video.id === id) ?? null;
}

/** 记录一条已上传到 R2 的视频元数据。 */
export async function recordVideo(item: VideoItem): Promise<VideoItem> {
  return withWriteLock(async () => {
    const videos = await readJson();
    await writeJson([item, ...videos]);
    return item;
  });
}

/** 仅删除元数据记录,返回被删除项(由调用方负责清理 R2 对象)。 */
export async function deleteVideo(id: string): Promise<VideoItem | null> {
  return withWriteLock(async () => {
    const videos = await readJson();
    const target = videos.find((video) => video.id === id);
    if (!target) return null;
    await writeJson(videos.filter((video) => video.id !== id));
    return target;
  });
}
