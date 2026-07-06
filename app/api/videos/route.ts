import { NextRequest, NextResponse } from "next/server";
import { getVideos, saveUploadedVideo } from "../../../lib/video-store";

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
    return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const video = await saveUploadedVideo(formData);

    return NextResponse.json({ video }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
