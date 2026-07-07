import { NextRequest, NextResponse } from "next/server";
import { deleteVideo, findVideo, updateVideo, cleanText, parseTags } from "../../../../lib/video-store";
import { deleteR2ObjectByUrl } from "../../../../lib/r2";
import { isAuthorized } from "../../../../lib/auth";
import { revalidatePath } from "next/cache";

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
    if (target.thumb) await deleteR2ObjectByUrl(target.thumb);
  } catch {
    return NextResponse.json(
      { error: "删除存储对象失败,元数据已保留,请重试。" },
      { status: 500 }
    );
  }

  await deleteVideo(context.params.id);
  revalidatePath("/", "page");
  return NextResponse.json({ video: target });
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "未登录或管理密码无效。" }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    category?: string;
    tags?: string | string[];
    featured?: boolean;
  };

  const patch: {
    title?: string;
    category?: string;
    tags?: string[];
    featured?: boolean;
  } = {};
  if (typeof body.title === "string") patch.title = cleanText(body.title, "未命名媒体");
  if (typeof body.category === "string") patch.category = cleanText(body.category, "动态背景");
  if (typeof body.tags === "string") patch.tags = parseTags(body.tags);
  else if (Array.isArray(body.tags)) patch.tags = body.tags;
  if (typeof body.featured === "boolean") patch.featured = body.featured;

  const updated = await updateVideo(context.params.id, patch);
  if (!updated) {
    return NextResponse.json({ error: "未找到该媒体。" }, { status: 404 });
  }

  revalidatePath("/", "page");
  return NextResponse.json({ video: updated });
}
