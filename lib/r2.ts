import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 对象存储配置(仅服务端使用,绝不可在客户端组件中引用)。
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
// 公开访问基础域名(自定义域名或 https://pub-xxxx.r2.dev),用于拼接视频播放 URL。
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error(
      "R2 未配置:请在 .env.local 中设置 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET。"
    );
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
    });
  }
  return cachedClient;
}

export function isR2Configured(): boolean {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

/** 根据对象 key 拼接公开访问 URL。 */
export function publicUrlFor(key: string): string {
  if (!R2_PUBLIC_BASE_URL) {
    throw new Error(
      "R2_PUBLIC_BASE_URL 未设置:请在 .env.local 中设置 R2 公开访问域名(如 https://cdn.example.com 或 https://pub-xxxx.r2.dev)。"
    );
  }
  return `${R2_PUBLIC_BASE_URL}/${key.replace(/^\/+/, "")}`;
}

/** 为浏览器直传生成预签名 PUT URL(10 分钟内有效)。 */
export async function createPresignedPut({
  key,
  contentType
}: {
  key: string;
  contentType: string;
}): Promise<string> {
  const url = await getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType
    }),
    { expiresIn: 600 }
  );
  return url;
}

/** 根据公开 URL 删除对应 R2 对象(仅删除属于本 R2 域名的对象,本地样例不动)。 */
export async function deleteR2ObjectByUrl(url?: string): Promise<void> {
  if (!url || !R2_PUBLIC_BASE_URL || !url.startsWith(R2_PUBLIC_BASE_URL)) return;
  const key = url.slice(R2_PUBLIC_BASE_URL.length).replace(/^\/+/, "");
  if (!key) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}
