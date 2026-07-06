/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "";
const defaultPagesBasePath = isGitHubPages && repositoryName ? `/${repositoryName}` : "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? defaultPagesBasePath;

const nextConfig = {
  reactStrictMode: true,
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
