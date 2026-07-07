import { NextRequest, NextResponse } from "next/server";
import { restoreMetadataBackup } from "../../../../lib/r2";
import { isAuthorized } from "../../../../lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 用上一版备份覆盖主元数据(R2 Object Versioning 不可用时的应急回滚)。 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "未登录或管理密码无效。" }, { status: 401 });
  }
  const ok = await restoreMetadataBackup();
  if (!ok) {
    return NextResponse.json({ error: "没有可用的上一版备份。" }, { status: 404 });
  }
  revalidatePath("/", "page");
  return NextResponse.json({ ok: true });
}
