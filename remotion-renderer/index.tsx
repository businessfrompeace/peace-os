/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { renderMedia } from "@remotion/renderer";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const app = new Hono();

const jobStore = new Map<string, any>();

const MotionGraphicsComposition = ({ text, duration = 120 }) => {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        fontSize: 48,
        color: "white",
        fontWeight: "bold",
        textAlign: "center",
        padding: 40,
      }}
    >
      {text}
    </div>
  );
};

async function downloadVideo(url: string, outputPath: string): Promise<string> {
  const filename = `clip-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
  const filepath = path.join(outputPath, filename);
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return filepath;
  } catch (e) {
    throw new Error(`Failed to download ${url}: ${String(e)}`);
  }
}

app.get("/health", async (c) => {
  return c.json({ status: "ok", storage: "in-memory" });
});

app.post("/upload", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return c.json({ error: "file field required and must be a file" }, 400);
    }

    const outputPath = "/tmp";
    const filename = `uploaded-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filepath = path.join(outputPath, filename);

    const buffer = await file.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));

    return c.json({ path: filepath });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      500
    );
  }
});

app.post("/render", async (c) => {
  try {
    let body: any = {};
    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await c.req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      for (const [key, value] of formData.entries()) {
        if (typeof value === "string") {
          try {
            body[key] = JSON.parse(value);
          } catch {
            body[key] = value;
          }
        } else {
          body[key] = value;
        }
      }
    } else {
      body = await c.req.json();
    }

    let {
      jobId,
      motionGraphics,
      videoClips = [],
      mp4Files = [],
      captions = [],
      outputPath = "/tmp",
    } = body;

    if (typeof videoClips === "string") {
      try {
        videoClips = JSON.parse(videoClips);
      } catch {
        videoClips = [];
      }
    }
    if (!Array.isArray(videoClips)) {
      videoClips = [];
    }

    console.log(`[${jobId}] Request received`);
    console.log(`[${jobId}] videoClips type: ${typeof videoClips}, length: ${Array.isArray(videoClips) ? videoClips.length : 'not an array'}`);
    console.log(`[${jobId}] videoClips content: ${JSON.stringify(videoClips)}`);

    if (!jobId) {
      return c.json({ error: "jobId required" }, 400);
    }

    jobStore.set(jobId, {
      status: "processing",
      startTime: Date.now(),
    });

    let finalPath: string;

    if (videoClips && videoClips.length > 0) {
      try {
        console.log(`[${jobId}] Processing ${videoClips.length} video clips`);
        
        const downloadedClips = [];
        for (let i = 0; i < videoClips.length; i++) {
          const clip = videoClips[i];
          console.log(`[${jobId}] Clip ${i}: ${JSON.stringify(clip)}`);
          
          let clipPath: string;
          
          if (clip.url) {
            console.log(`[${jobId}] Downloading clip from URL: ${clip.url}`);
            clipPath = await downloadVideo(clip.url, outputPath);
          } else if (clip.path) {
            console.log(`[${jobId}] Using local clip path: ${clip.path}`);
            clipPath = clip.path;
            if (!fs.existsSync(clipPath)) {
              throw new Error(`File not found: ${clipPath}`);
            }
          } else {
            throw new Error(`Clip ${i} must have either 'url' or 'path'. Got: ${JSON.stringify(clip)}`);
          }

          downloadedClips.push({
            path: clipPath,
            startFrame: clip.startFrame || 0,
            endFrame: clip.endFrame || 300,
          });
        }

        console.log(`[${jobId}] Building concat list with ${downloadedClips.length} clips`);
        
        const concatList = downloadedClips
          .map((clip) => `file '${clip.path}'`)
          .join("\n");
        const concatFile = path.join(outputPath, `concat-${jobId}.txt`);
        fs.writeFileSync(concatFile, concatList);
        
        console.log(`[${jobId}] Concat file:\n${concatList}`);

        finalPath = path.join(outputPath, `final-${jobId}.mp4`);
        const ffmpegCmd = `ffmpeg -f concat -safe 0 -i ${concatFile} -c copy ${finalPath}`;
        console.log(`[${jobId}] Running: ${ffmpegCmd}`);
        
        execSync(ffmpegCmd, { stdio: "pipe" });
        console.log(`[${jobId}] FFmpeg concat completed`);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(`[${jobId}] Video processing error: ${errorMsg}`);
        console.error(`[${jobId}] Stack: ${e instanceof Error ? e.stack : 'no stack'}`);
        
        jobStore.set(jobId, {
          status: "failed",
          error: `Video processing failed: ${errorMsg}`,
        });
        return c.json(
          { error: "Video processing failed", details: errorMsg },
          500
        );
      }
    } 
    else if (motionGraphics) {
      try {
        const motionPath = path.join(outputPath, `motion-${jobId}.mp4`);
        await renderMedia({
          composition: {
            id: "motion-graphics",
            durationInFrames: motionGraphics.duration || 120,
            fps: 30,
            width: 1920,
            height: 1080,
            component: MotionGraphicsComposition,
            props: { text: motionGraphics.text || "Motion Graphics" },
          },
          serveUrl: "http://localhost:3000",
          codec: "h264",
          outputLocation: motionPath,
        });

        const inputFiles = [motionPath, ...mp4Files];
        const concatList = inputFiles
          .map((f) => `file '${f}'`)
          .join("\n");
        const concatFile = path.join(outputPath, `concat-${jobId}.txt`);
        fs.writeFileSync(concatFile, concatList);

        finalPath = path.join(outputPath, `final-${jobId}.mp4`);
        execSync(
          `ffmpeg -f concat -safe 0 -i ${concatFile} -c copy ${finalPath}`,
          { stdio: "pipe" }
        );
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(`[${jobId}] Motion graphics error: ${errorMsg}`);
        
        jobStore.set(jobId, {
          status: "failed",
          error: "Motion graphics render failed",
        });
        return c.json(
          { error: "Motion graphics render failed", details: errorMsg },
          500
        );
      }
    } else {
      return c.json(
        { error: "Either motionGraphics or videoClips required" },
        400
      );
    }

    let outputFile = finalPath;
    if (captions && captions.length > 0) {
      const captionVtt = captions
        .map((c) => `${c.start} --> ${c.end}\n${c.text}`)
        .join("\n\n");
      const vttFile = path.join(outputPath, `captions-${jobId}.vtt`);
      fs.writeFileSync(vttFile, `WEBVTT\n\n${captionVtt}`);

      const captionedPath = path.join(outputPath, `captioned-${jobId}.mp4`);
      try {
        execSync(
          `ffmpeg -i ${finalPath} -vf subtitles=${vttFile} ${captionedPath}`,
          { stdio: "pipe" }
        );
        outputFile = captionedPath;
      } catch (e) {
        console.warn(`[${jobId}] Caption burning failed, continuing without captions`);
      }
    }

    const fileSize = fs.statSync(outputFile).size;
    jobStore.set(jobId, {
      status: "complete",
      outputPath: outputFile,
      fileSize: fileSize,
      completedAt: Date.now(),
    });

    console.log(`[${jobId}] Render complete: ${outputFile} (${fileSize} bytes)`);

    return c.json({
      jobId,
      status: "complete",
      outputPath: outputFile,
      fileSize,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Render endpoint error: ${errorMsg}`);
    console.error(`Stack: ${error instanceof Error ? error.stack : 'no stack'}`);
    
    try {
      const body = await c.req.json();
      const jobId = body.jobId;
      if (jobId) {
        jobStore.set(jobId, {
          status: "failed",
          error: errorMsg,
        });
      }
    } catch {}
    return c.json(
      { error: errorMsg },
      500
    );
  }
});

app.get("/job/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const job = jobStore.get(jobId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json(job);
});

app.get("/download/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const job = jobStore.get(jobId);

  if (!job || job.status !== "complete") {
    return c.json({ error: "Job not ready" }, 400);
  }

  const file = Bun.file(job.outputPath);
  return c.body(file);
});

const port = parseInt(Bun.env.PORT || "8080");
Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`Server running on port ${port}`);
