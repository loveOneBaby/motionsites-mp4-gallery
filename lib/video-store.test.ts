import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

/** 用临时 DB 路径 + 无 R2 环境重新加载 video-store,实现测试隔离。 */
async function loadStore(dbPath: string) {
  process.env.VIDEOS_DB_PATH = dbPath;
  delete process.env.R2_ACCOUNT_ID;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_BUCKET;
  vi.resetModules();
  return (await import("./video-store")) as typeof import("./video-store");
}

function tempDb() {
  return path.join(os.tmpdir(), `vs-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

function item(id: string, title = "t") {
  return {
    id,
    title,
    category: "c",
    tags: [] as string[],
    src: `/x-${id}`,
    featured: false,
    createdAt: new Date().toISOString(),
    kind: "video" as const
  };
}

describe("video-store 本地模式(数据流)", () => {
  let dbPath: string;
  beforeEach(async () => {
    dbPath = tempDb();
    await fs.writeFile(dbPath, "[]", "utf8");
    vi.resetModules();
  });

  it("record 后能查到,且出现在 getVideos", async () => {
    const store = await loadStore(dbPath);
    await store.recordVideo(item("1", "hello"));
    const vs = await store.getVideos();
    expect(vs).toHaveLength(1);
    expect(vs[0].title).toBe("hello");
  });

  it("多次 record 都保留", async () => {
    const store = await loadStore(dbPath);
    await store.recordVideo(item("1"));
    await store.recordVideo(item("2"));
    expect((await store.getVideos())).toHaveLength(2);
  });

  it("findVideo 命中/未命中", async () => {
    const store = await loadStore(dbPath);
    await store.recordVideo(item("1", "t1"));
    expect((await store.findVideo("1"))?.title).toBe("t1");
    expect(await store.findVideo("missing")).toBeNull();
  });

  it("updateVideo 改标题/推荐,原 id 与其它字段不变", async () => {
    const store = await loadStore(dbPath);
    await store.recordVideo(item("1", "t1"));
    const updated = await store.updateVideo("1", { title: "t2", featured: true });
    expect(updated?.title).toBe("t2");
    expect(updated?.featured).toBe(true);
    expect(updated?.id).toBe("1");
    expect((await store.findVideo("1"))?.title).toBe("t2");
  });

  it("updateVideo 不存在的 id 返回 null", async () => {
    const store = await loadStore(dbPath);
    expect(await store.updateVideo("nope", { title: "x" })).toBeNull();
  });

  it("deleteVideo 删除并返回被删项;再查为 null", async () => {
    const store = await loadStore(dbPath);
    await store.recordVideo(item("1", "t1"));
    const del = await store.deleteVideo("1");
    expect(del?.id).toBe("1");
    expect(await store.findVideo("1")).toBeNull();
  });

  it("deleteVideo 不存在的 id 返回 null", async () => {
    const store = await loadStore(dbPath);
    expect(await store.deleteVideo("nope")).toBeNull();
  });
});

describe("video-store 纯函数", () => {
  it("cleanText", async () => {
    const store = await loadStore(tempDb());
    expect(store.cleanText("", "fb")).toBe("fb");
    expect(store.cleanText("  hi ", "fb")).toBe("hi");
    expect(store.cleanText(undefined, "fb")).toBe("fb");
    expect(store.cleanText(123 as unknown as string, "fb")).toBe("fb");
  });

  it("parseTags", async () => {
    const store = await loadStore(tempDb());
    expect(store.parseTags("a, b ,c")).toEqual(["a", "b", "c"]);
    expect(store.parseTags("")).toEqual([]);
    expect(store.parseTags(undefined)).toEqual([]);
  });

  it("safeExtension / kindOfExtension", async () => {
    const store = await loadStore(tempDb());
    expect(store.safeExtension("x.MP4", new Set([".mp4"]), ".mp4")).toBe(".mp4");
    expect(store.safeExtension("x.txt", new Set([".mp4"]), ".mp4")).toBe(".mp4");
    expect(store.kindOfExtension(".jpg")).toBe("image");
    expect(store.kindOfExtension(".mp4")).toBe("video");
    expect(store.kindOfExtension(".txt")).toBeNull();
  });
});
