import { NextRequest, NextResponse } from "next/server";
import { createPresignedPut } from "../../../../lib/r2";
import {
  MAX_VIDEO_BYTES,
  VIDEO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  safeExtension,
  newVideoId
} from "../../../../lib/video-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;

  return request.headers.get("x-admin-password") === adminPassword;
}

type FileSpec = { filename?: string; contentType?: string; size?: number };

function buildObjectSpec(file: FileSpec, kind: "media" | "poster") {
  // media:视频或图片;poster:仅图片。
  const allowed = kind === "media" ? new Set([...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]) : IMAGE_EXTENSIONS;
  const fallback = kind === "media" ? ".mp4" : ".jpg";
  const ext = safeExtension(file.filename || "", allowed, fallback);
  const contentType = file.contentType || (kind === "poster" ? "image/jpeg" : "video/mp4");
  const folder = kind === "poster" ? "uploads/posters" : "uploads/media";
  const key = `${folder}/${newVideoId()}${ext}`;
  return { key, contentType };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "管理密码无效。" }, { status: 401 });
  }

  const body = (await request.json()) as { media?: FileSpec; poster?: FileSpec | null };

  const media = body.media;
  if (!media || !media.filename || typeof media.size !== "number") {
    return NextResponse.json({ error: "缺少文件信息。" }, { status: 400 });
  }

  if (media.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "文件过大。限制为 250 MB。" }, { status: 413 });
  }

  try {
    const mediaSpec = buildObjectSpec(media, "media");
    const mediaUploadUrl = await createPresignedPut({
      key: mediaSpec.key,
      contentType: mediaSpec.contentType
    });

    const result: {
      media: { key: string; uploadUrl: string; contentType: string };
      poster?: { key: string; uploadUrl: string; contentType: string };
    } = {
      media: {
        key: mediaSpec.key,
        uploadUrl: mediaUploadUrl,
        contentType: mediaSpec.contentType
      }
    };

    const poster = body.poster;
    if (poster && poster.filename) {
      const posterSpec = buildObjectSpec(poster, "poster");
      const posterUploadUrl = await createPresignedPut({
        key: posterSpec.key,
        contentType: posterSpec.contentType
      });
      result.poster = {
        key: posterSpec.key,
        uploadUrl: posterUploadUrl,
        contentType: posterSpec.contentType
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取上传地址失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
