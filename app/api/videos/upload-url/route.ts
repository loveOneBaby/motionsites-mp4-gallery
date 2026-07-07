import { NextRequest, NextResponse } from "next/server";
import { createPresignedPut } from "../../../../lib/r2";
import {
  MAX_VIDEO_BYTES,
  VIDEO_EXTENSIONS,
  POSTER_EXTENSIONS,
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

function buildObjectSpec(file: FileSpec, kind: "video" | "poster") {
  const allowed = kind === "video" ? VIDEO_EXTENSIONS : POSTER_EXTENSIONS;
  const fallback = kind === "video" ? ".mp4" : ".jpg";
  const ext = safeExtension(file.filename || "", allowed, fallback);
  const contentType = file.contentType || (kind === "video" ? "video/mp4" : "image/jpeg");
  const folder = kind === "video" ? "uploads/videos" : "uploads/posters";
  const key = `${folder}/${newVideoId()}${ext}`;
  return { key, contentType };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "管理密码无效。" }, { status: 401 });
  }

  const body = (await request.json()) as { video?: FileSpec; poster?: FileSpec | null };
  const video = body.video;

  if (!video || !video.filename || typeof video.size !== "number") {
    return NextResponse.json({ error: "缺少视频文件信息。" }, { status: 400 });
  }

  if (video.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "视频过大。限制为 250 MB。" }, { status: 413 });
  }

  try {
    const videoSpec = buildObjectSpec(video, "video");
    const videoUploadUrl = await createPresignedPut({
      key: videoSpec.key,
      contentType: videoSpec.contentType
    });

    const result: {
      video: { key: string; uploadUrl: string; contentType: string };
      poster?: { key: string; uploadUrl: string; contentType: string };
    } = {
      video: {
        key: videoSpec.key,
        uploadUrl: videoUploadUrl,
        contentType: videoSpec.contentType
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
