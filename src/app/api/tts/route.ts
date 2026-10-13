import { NextRequest, NextResponse } from "next/server";
import { EdgeTTS } from "node-edge-tts";
import fs from "fs";
import path from "path";
import os from "os";

// In-memory cache for server-rendered TTS to eliminate redundant EdgeTTS calls & network hops
const serverTtsCache = new Map<string, Buffer>();
const MAX_SERVER_CACHE_ITEMS = 500;

const FALLBACK_VOICES = [
  "de-DE-ConradNeural",
  "de-DE-KillianNeural",
  "de-DE-KatjaNeural",
];

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

    // Check server memory cache
    const cachedBuffer = serverTtsCache.get(cleanText);
    if (cachedBuffer) {
      return new NextResponse(cachedBuffer as unknown as BodyInit, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-TTS-Source": "cache",
        },
      });
    }

    let audioBuffer: Buffer | null = null;
    let lastError: any = null;

    // Retry across fallback voices with shorter timeout (4000ms)
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
          rate: "-5%",
          timeout: 4000,
        });

        await tts.ttsPromise(cleanText, tempFilePath);

        if (fs.existsSync(tempFilePath)) {
          audioBuffer = fs.readFileSync(tempFilePath);
          try {
            fs.unlinkSync(tempFilePath);
          } catch {}
          break;
        }
      } catch (err) {
        lastError = err;
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    if (!audioBuffer) {
      throw lastError || new Error("Failed to synthesize audio after retries");
    }

    // Save to server cache (LRU eviction)
    if (serverTtsCache.size >= MAX_SERVER_CACHE_ITEMS) {
      const oldestKey = serverTtsCache.keys().next().value;
      if (oldestKey) serverTtsCache.delete(oldestKey);
    }
    serverTtsCache.set(cleanText, audioBuffer);

    return new NextResponse(audioBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-TTS-Source": "edge",
      },
    });
  } catch (error) {
    console.error("TTS Error:", error);
    return NextResponse.json({ error: "Failed to fetch TTS" }, { status: 500 });
  }
}