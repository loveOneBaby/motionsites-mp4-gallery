import { NextRequest, NextResponse } from "next/server";
import { deleteVideo } from "../../../../lib/video-store";
import { deleteR2ObjectByUrl } from "../../../../lib/r2";

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

  // 尽力清理 R2 对象;失败不阻塞元数据已删除的结果。
  await Promise.all([
    deleteR2ObjectByUrl(deleted.src).catch(() => undefined),
    deleteR2ObjectByUrl(deleted.poster).catch(() => undefined)
  ]);

  return NextResponse.json({ video: deleted });
}
