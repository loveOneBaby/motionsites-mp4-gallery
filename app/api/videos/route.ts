import { NextRequest, NextResponse } from "next/server";
import {
  getVideos,
  recordVideo,
  newVideoId,
  cleanText,
  parseTags
} from "../../../lib/video-store";
import { publicUrlFor } from "../../../lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;

  return request.headers.get("x-admin-password") === adminPassword;
}

export async function GET() {
  const videos = await getVideos();
  return NextResponse.json({ videos });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "管理密码无效。" }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    category?: string;
    tags?: string;
    featured?: boolean | string;
    videoKey?: string;
    posterKey?: string;
  };

  if (!body.videoKey || typeof body.videoKey !== "string") {
    return NextResponse.json({ error: "缺少视频文件标识(videoKey)。" }, { status: 400 });
  }

  try {
    const item = {
      id: newVideoId(),
      title: cleanText(body.title, "未命名视频"),
      category: cleanText(body.category, "动态背景"),
      tags: parseTags(body.tags),
      src: publicUrlFor(body.videoKey),
      poster: body.posterKey ? publicUrlFor(body.posterKey) : undefined,
      featured: body.featured === true || body.featured === "on" || body.featured === "true",
      createdAt: new Date().toISOString()
    };

    await recordVideo(item);
    return NextResponse.json({ video: item }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
