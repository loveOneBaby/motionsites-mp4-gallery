# MotionSites MP4 Gallery

A MotionSites-inspired Next.js gallery for previewing cinematic MP4 background loops. The homepage shows featured video cards, hover-to-preview playback, filtering, search, and a modal player. The admin page lets you upload MP4/WebM/MOV files into local project storage for a simple self-hosted workflow.

## Local development

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
http://localhost:3000/admin
```

The local upload backend stores metadata in `data/videos.json` and files in `public/uploads`.

## GitHub Pages preview pipeline

This project includes a read-only GitHub Pages preview workflow at:

```text
.github/workflows/pages.yml
```

When code is pushed to `main`, GitHub Actions will:

1. Install dependencies.
2. Remove the server upload API only inside the temporary CI workspace.
3. Build a static Next.js export.
4. Deploy the `out` folder to GitHub Pages.

For a repository named `motionsites-mp4-gallery` under `loveOneBaby`, the preview URL will be:

```text
https://loveonebaby.github.io/motionsites-mp4-gallery/
```

## Push to GitHub as a public repository

```bash
git init
git branch -M main
git add .
git commit -m "Add MotionSites MP4 gallery with GitHub Pages preview"
gh repo create loveOneBaby/motionsites-mp4-gallery --public --source=. --remote=origin --push
```

Then go to the repository on GitHub:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

After the `Deploy preview to GitHub Pages` workflow finishes, open the Pages URL from the workflow summary or the repository Pages settings.

## If you already created the repo as private

Run this from the project directory:

```bash
gh repo edit loveOneBaby/motionsites-mp4-gallery \
  --visibility public \
  --accept-visibility-change-consequences
```

Then check:

```bash
gh repo view loveOneBaby/motionsites-mp4-gallery --json visibility
```


## Fix GitHub Pages 404

If the preview URL returns 404, the most common cause is that the first push went to `master` while the Pages workflow was waiting for `main`, or Pages was not set to GitHub Actions. This package's workflow now runs on any pushed branch, but using `main` is still recommended.

From the project directory, run:

```bash
git branch -M main
git push -u origin main

gh api --method POST repos/loveOneBaby/motionsites-mp4-gallery/pages \
  -f build_type=workflow || \
gh api --method PUT repos/loveOneBaby/motionsites-mp4-gallery/pages \
  -f build_type=workflow

gh workflow run pages.yml -R loveOneBaby/motionsites-mp4-gallery --ref main
gh run watch -R loveOneBaby/motionsites-mp4-gallery
```

Then open:

```text
https://loveonebaby.github.io/motionsites-mp4-gallery/
```

## Important deployment note

GitHub Pages is static hosting, so it can preview the gallery UI and bundled sample MP4 files, but it cannot run the upload API. The `/admin` page is intentionally read-only in the Pages preview.

For real uploads in production, deploy the Node/Next.js app to a server that supports persistent storage, or move video assets to object storage such as S3, Cloudflare R2, or Supabase Storage.

## Scripts

```bash
npm run dev      # local development
npm run build    # production build
npm run start    # run production server after build
```
