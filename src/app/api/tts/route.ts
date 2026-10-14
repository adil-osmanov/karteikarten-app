import { NextRequest, NextResponse } from "next/server";
import { EdgeTTS } from "node-edge-tts";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

// Persistent disk cache directory (survives server restarts & page refreshes)
const DISK_CACHE_DIR = path.join(process.cwd(), ".tts_cache");
try {
  if (!fs.existsSync(DISK_CACHE_DIR)) {
    fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create .tts_cache directory:", e);
}

// In-memory cache for hot words to eliminate disk I/O completely (1ms response)
const serverTtsCache = new Map<string, Buffer>();
const MAX_SERVER_CACHE_ITEMS = 1000;

const FALLBACK_VOICES = [
  "de-DE-KillianNeural",
  "de-DE-ConradNeural",
  "de-DE-KatjaNeural",
];

function getCacheFilename(text: string): string {
  const hash = crypto.createHash("md5").update(text.toLowerCase().trim()).digest("hex");
  return path.join(DISK_CACHE_DIR, `${hash}.mp3`);
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const cleanText = text.trim();
    if (!cleanText) {
      return NextResponse.json({ error: "Empty text" }, { status: 400 });
    }

    // 1. Check in-memory RAM cache (instant 0ms)
    const ramBuffer = serverTtsCache.get(cleanText);
    if (ramBuffer) {
      return new NextResponse(ramBuffer as unknown as BodyInit, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-TTS-Source": "ram-cache",
        },
      });
    }

    // 2. Check persistent disk cache (instant ~1ms)
    const diskPath = getCacheFilename(cleanText);
    try {
      if (fs.existsSync(diskPath)) {
        const diskBuffer = fs.readFileSync(diskPath);
        if (diskBuffer && diskBuffer.length > 100) {
          // Promote to RAM cache
          if (serverTtsCache.size >= MAX_SERVER_CACHE_ITEMS) {
            const oldestKey = serverTtsCache.keys().next().value;
            if (oldestKey) serverTtsCache.delete(oldestKey);
          }
          serverTtsCache.set(cleanText, diskBuffer);

          return new NextResponse(diskBuffer as unknown as BodyInit, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=31536000, immutable",
              "X-TTS-Source": "disk-cache",
            },
          });
        }
      }
    } catch (e) {
      // Ignore disk read error and proceed to network synthesis
    }

    // 3. Network synthesis via EdgeTTS with voice fallback
    let audioBuffer: Buffer | null = null;
    let lastError: any = null;

    for (let attempt = 0; attempt < FALLBACK_VOICES.length; attempt++) {
      const voice = FALLBACK_VOICES[attempt];
      const tempFilePath = path.join(
        os.tmpdir(),
        `tts-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`
      );

      try {
        const tts = new EdgeTTS({
          voice,
          lang: "de-DE",
          outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          rate: "-4%",
          timeout: 4500,
        });

        await tts.ttsPromise(cleanText, tempFilePath);

        if (fs.existsSync(tempFilePath)) {
          const tempBuf = fs.readFileSync(tempFilePath);
          if (tempBuf && tempBuf.length > 100) {
            audioBuffer = tempBuf;
            // Write to persistent disk cache asynchronously/safely
            try {
              fs.writeFileSync(diskPath, tempBuf);
            } catch (err) {}
          }
          try {
            fs.unlinkSync(tempFilePath);
          } catch {}
          if (audioBuffer) break;
        }
      } catch (err) {
        lastError = err;
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (!audioBuffer) {
      throw lastError || new Error("Failed to synthesize audio after retries");
    }

    // Save to RAM cache
    if (serverTtsCache.size >= MAX_SERVER_CACHE_ITEMS) {
      const oldestKey = serverTtsCache.keys().next().value;
      if (oldestKey) serverTtsCache.delete(oldestKey);
    }
    serverTtsCache.set(cleanText, audioBuffer);

    return new NextResponse(audioBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-TTS-Source": "edge-fresh",
      },
    });
  } catch (error) {
    console.error("TTS Server Error:", error);
    return NextResponse.json({ error: "Failed to fetch TTS" }, { status: 500 });
  }
}