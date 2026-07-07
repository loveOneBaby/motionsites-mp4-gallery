import { NextRequest, NextResponse } from "next/server";
import { createPresignedPut } from "../../../../lib/r2";
import { isAuthorized } from "../../../../lib/auth";
import {
  MAX_VIDEO_BYTES,
  VIDEO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  safeExtension,
  newVideoId
} from "../../../../lib/video-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FileSpec = { filename?: string; contentType?: string; size?: number };

type ObjectKind = "media" | "poster" | "thumb";

function buildObjectSpec(file: FileSpec, kind: ObjectKind) {
  // media:视频或图片;poster/thumb:仅图片。
  const allowed = kind === "media" ? new Set([...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]) : IMAGE_EXTENSIONS;
  const fallback = kind === "media" ? ".mp4" : ".jpg";
  const ext = safeExtension(file.filename || "", allowed, fallback);
  const contentType = file.contentType || (kind === "media" ? "video/mp4" : "image/jpeg");
  const folder = kind === "poster" ? "uploads/posters" : kind === "thumb" ? "uploads/thumbs" : "uploads/media";
  const key = `${folder}/${newVideoId()}${ext}`;
  return { key, contentType };
}

async function presign(spec: { key: string; contentType: string }) {
  return { key: spec.key, uploadUrl: await createPresignedPut(spec), contentType: spec.contentType };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "未登录或管理密码无效。" }, { status: 401 });
  }

  const body = (await request.json()) as {
    media?: FileSpec;
    poster?: FileSpec | null;
    thumb?: FileSpec | null;
  };

  const media = body.media;
  if (!media || !media.filename || typeof media.size !== "number") {
    return NextResponse.json({ error: "缺少文件信息。" }, { status: 400 });
  }
  if (media.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "文件过大。限制为 250 MB。" }, { status: 413 });
  }

  try {
    const result: {
      media: { key: string; uploadUrl: string; contentType: string };
      poster?: { key: string; uploadUrl: string; contentType: string };
      thumb?: { key: string; uploadUrl: string; contentType: string };
    } = { media: await presign(buildObjectSpec(media, "media")) };

    if (body.poster && body.poster.filename) {
      result.poster = await presign(buildObjectSpec(body.poster, "poster"));
    }
    if (body.thumb && body.thumb.filename) {
      result.thumb = await presign(buildObjectSpec(body.thumb, "thumb"));
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取上传地址失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
