import { NextRequest, NextResponse } from "next/server";
import { EdgeTTS } from "@andresaya/edge-tts";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Persistent disk cache directory in /tmp (safe for Vercel serverless and local dev)
const DISK_CACHE_DIR = path.join(os.tmpdir(), "tts_cache");
try {
  if (!fs.existsSync(DISK_CACHE_DIR)) {
    fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create tts_cache directory:", e);
}

// In-memory cache for hot words to eliminate disk I/O completely (0ms response)
const serverTtsCache = new Map<string, Buffer>();
const MAX_SERVER_CACHE_ITEMS = 1000;

const FALLBACK_VOICES = [
  "de-DE-KillianNeural",
  "de-DE-ConradNeural",
  "de-DE-BerndNeural",
  "de-DE-ChristophNeural",
  "de-DE-KasperNeural",
  "de-DE-RalfNeural",
  "de-DE-FlorianMultilingualNeural",
];

function getCacheFilename(text: string, voice: string = "default"): string {
  const hash = crypto.createHash("md5").update(`${voice}_${text.toLowerCase().trim()}`).digest("hex");
  return path.join(DISK_CACHE_DIR, `${hash}.mp3`);
}

async function fetchGoogleGermanTTS(text: string): Promise<Buffer | null> {
  try {
    const clean = text.trim();
    if (!clean) return null;

    // Google Translate TTS handles up to ~180 chars per chunk cleanly
    const chunks: string[] = [];
    if (clean.length <= 180) {
      chunks.push(clean);
    } else {
      const sentences = clean.split(/([,;:\.\?!]+\s+)/);
      let cur = "";
      for (const part of sentences) {
        if ((cur + part).length > 180) {
          if (cur.trim()) chunks.push(cur.trim());
          cur = part;
        } else {
          cur += part;
        }
      }
      if (cur.trim()) chunks.push(cur.trim());
    }

    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=de&client=tw-ob`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Referer": "https://translate.google.com/",
        },
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Google TTS status ${res.status}: ${errText.slice(0, 100)}`);
      }
      const ab = await res.arrayBuffer();
      if (!ab || ab.byteLength < 50) {
        throw new Error(`Google TTS empty buffer: ${ab ? ab.byteLength : 0}`);
      }
      buffers.push(Buffer.from(ab));
    }

    return Buffer.concat(buffers);
  } catch (err: any) {
    console.error("Google TTS fallback failed:", err);
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { text, voice } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const cleanText = text.trim();
    if (!cleanText) {
      return NextResponse.json({ error: "Empty text" }, { status: 400 });
    }

    let requestedVoice = (typeof voice === "string" && voice.trim()) ? voice.trim() : "de-DE-KillianNeural";
    if (requestedVoice.toLowerCase().includes("katja") || requestedVoice.toLowerCase().includes("female")) {
      requestedVoice = "de-DE-KillianNeural";
    }
    const cacheKey = `${requestedVoice}_${cleanText}`;

    // 1. Check in-memory RAM cache (instant 0ms)
    const ramBuffer = serverTtsCache.get(cacheKey);
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
    const diskPath = getCacheFilename(cleanText, requestedVoice);
    try {
      if (fs.existsSync(diskPath)) {
        const diskBuffer = fs.readFileSync(diskPath);
        if (diskBuffer && diskBuffer.length > 100) {
          // Promote to RAM cache
          if (serverTtsCache.size >= MAX_SERVER_CACHE_ITEMS) {
            const oldestKey = serverTtsCache.keys().next().value;
            if (oldestKey) serverTtsCache.delete(oldestKey);
          }
          serverTtsCache.set(cacheKey, diskBuffer);

          return new NextResponse(diskBuffer as unknown as BodyInit, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=31536000, immutable",
              "X-TTS-Source": "disk-cache",
            },
          });
        }
      }
    } catch {
      // Ignore disk read error and proceed to synthesis
    }

    // 3. Synthesis via Microsoft EdgeTTS
    let audioBuffer: Buffer | null = null;
    let edgeTtsError: unknown = null;

    try {
      const voiceCandidates = [
        requestedVoice,
        ...FALLBACK_VOICES.filter((v) => v !== requestedVoice),
      ];

      const tts = new EdgeTTS();

      for (let attempt = 0; attempt < voiceCandidates.length; attempt++) {
        const vName = voiceCandidates[attempt];
        try {
          const result = await tts.generate(cleanText, vName, {
            rate: "-4%",
            timeout: 3000,
          });

          if (result?.audio && result.audio.length > 100) {
            audioBuffer = Buffer.isBuffer(result.audio) ? result.audio : Buffer.from(result.audio);
            break;
          }
        } catch (err) {
          edgeTtsError = err;
          // If server returned 200 or 429 (datacenter block), retrying won't change IP
          if (String(err).includes("200") || String(err).includes("429")) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    } catch (err) {
      edgeTtsError = err;
    }

    // 4. Resilient Fallback to High-Quality Google German Neural Audio if EdgeTTS is blocked
    let source = "edge-fresh";
    let fallbackError: unknown = null;
    if (!audioBuffer || audioBuffer.length < 100) {
      console.warn("EdgeTTS unavailable (datacenter block or rate limit), using resilient fallback:", edgeTtsError);
      try {
        const fallbackBuf = await fetchGoogleGermanTTS(cleanText);
        if (fallbackBuf && fallbackBuf.length > 100) {
          audioBuffer = fallbackBuf;
          source = "google-fallback";
        }
      } catch (fErr) {
        fallbackError = fErr;
      }
    }

    if (!audioBuffer || audioBuffer.length < 100) {
      const eMsg = edgeTtsError instanceof Error ? edgeTtsError.message : String(edgeTtsError);
      const fMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`EdgeTTS failed: (${eMsg}) | Fallback failed: (${fMsg})`);
    }

    // Save to Disk Cache
    try {
      fs.writeFileSync(diskPath, audioBuffer);
    } catch {}

    // Save to RAM cache
    if (serverTtsCache.size >= MAX_SERVER_CACHE_ITEMS) {
      const oldestKey = serverTtsCache.keys().next().value;
      if (oldestKey) serverTtsCache.delete(oldestKey);
    }
    serverTtsCache.set(cacheKey, audioBuffer);

    return new NextResponse(audioBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-TTS-Source": source,
      },
    });
  } catch (error: any) {
    console.error("TTS Server Error:", error);
    return NextResponse.json({
      error: "Failed to fetch TTS",
      details: error?.message || String(error),
    }, { status: 500 });
  }
}