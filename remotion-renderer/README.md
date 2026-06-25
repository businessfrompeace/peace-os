# Remotion Renderer Service

Lightweight video rendering API using `@remotion/renderer` library and Hono.

## Features

- **Motion graphics text overlays** — Render text with gradient backgrounds
- **Video clip concatenation** — Download and merge video clips from URLs or local paths
- **Caption burning** — Add WebVTT captions to videos with FFmpeg
- **Google Drive support** — Download videos directly from Google Drive URLs
- **In-memory job tracking** — Track render jobs by ID

## Endpoints

### GET /health
Health check endpoint.

### POST /upload
Upload a video file.
- **Body:** multipart/form-data with `file` field
- **Response:** `{ path: "/tmp/uploaded-..." }`

### POST /render
Queue a render job.
- **Body:** JSON with:
  - `jobId` (required) — Unique job identifier
  - `videoClips` (optional) — Array of `{ url: "..." }` or `{ path: "..." }`
  - `motionGraphics` (optional) — `{ text: "...", duration: 120 }`
  - `captions` (optional) — Array of `{ start: "00:00:00", end: "00:00:05", text: "..." }`
  - `outputPath` (optional) — Where to save the final video (default: `/tmp`)

### GET /job/:jobId
Check job status.

### GET /download/:jobId
Download the rendered video (only if job is complete).

## Building

```bash
docker build -t remotion-renderer .
docker run -p 8080:8080 remotion-renderer
```
