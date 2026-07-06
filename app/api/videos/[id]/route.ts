import { NextRequest, NextResponse } from "next/server";
import { deleteVideo } from "../../../../lib/video-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;

  return request.headers.get("x-admin-password") === adminPassword;
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "管理密码无效。" }, { status: 401 });
  }

  const deleted = await deleteVideo(context.params.id);

  if (!deleted) {
    return NextResponse.json({ error: "未找到该视频。" }, { status: 404 });
  }

  return NextResponse.json({ video: deleted });
}
