import { NextRequest, NextResponse } from "next/server";
import { deleteVideo, findVideo } from "../../../../lib/video-store";
import { deleteR2ObjectByUrl } from "../../../../lib/r2";
import { isAuthorized } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "未登录或管理密码无效。" }, { status: 401 });
  }

  const target = await findVideo(context.params.id);
  if (!target) {
    return NextResponse.json({ error: "未找到该媒体。" }, { status: 404 });
  }

  // 先删 R2 对象;失败则保留元数据,避免产生断链(对象没了、记录还在)。
  try {
    await deleteR2ObjectByUrl(target.src);
    if (target.poster) await deleteR2ObjectByUrl(target.poster);
  } catch {
    return NextResponse.json(
      { error: "删除存储对象失败,元数据已保留,请重试。" },
      { status: 500 }
    );
  }

  await deleteVideo(context.params.id);
  return NextResponse.json({ video: target });
}
