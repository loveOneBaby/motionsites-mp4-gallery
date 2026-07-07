/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "";
const defaultPagesBasePath = isGitHubPages && repositoryName ? `/${repositoryName}` : "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? defaultPagesBasePath;

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    // img/media/connect 放开 https 以允许 R2(r2.dev 公开地址、r2.cloudflarestorage.com 预签名直传)
    value:
      "default-src 'self'; img-src 'self' data: https:; media-src 'self' https: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; connect-src 'self' https:; font-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    if (isGitHubPages) return [];
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  ...(isGitHubPages
    ? {
        output: "export",
        trailingSlash: true,
        basePath,
        assetPrefix: basePath ? `${basePath}/` : undefined,
        images: {
          unoptimized: true
        }
      }
    : {})
};

export default nextConfig;
