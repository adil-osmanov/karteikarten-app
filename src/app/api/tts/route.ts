import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Persistent disk cache directory in /tmp (safe for Vercel serverless and local dev)
const DISK_CACHE_DIR = path.join(os.tmpdir(), "tts_cache_male");
try {
  if (!fs.existsSync(DISK_CACHE_DIR)) {
    fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create tts_cache_male directory:", e);
}

// In-memory cache for hot words to eliminate network latency (0ms response)
const serverTtsCache = new Map<string, Buffer>();
const MAX_SERVER_CACHE_ITEMS = 2000;

// STRICTLY MALE GERMAN NEURAL VOICES ONLY
const MALE_VOICES = [
  "de-DE-KillianNeural",
  "de-DE-ConradNeural",
  "de-DE-BerndNeural",
  "de-DE-ChristophNeural",
  "de-DE-KasperNeural",
  "de-DE-RalfNeural",
];

interface TokenInfo {
  region: string;
  token: string;
  expiredAt: number;
}
let cachedTokenInfo: TokenInfo | null = null;

async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(signature);
}

function getUtcDateFormat(): string {
  return (new Date()).toUTCString().replace(/GMT/, "").trim() + " GMT";
}

async function signTranslatorEndpoint(urlStr: string): Promise<string> {
  const url = urlStr.split("://")[1];
  const encodedUrl = encodeURIComponent(url);
  const uuidStr = crypto.randomUUID().replace(/-/g, "");
  const formattedDate = getUtcDateFormat().toLowerCase();
  const bytesToSign = `MSTranslatorAndroidApp${encodedUrl}${formattedDate}${uuidStr}`.toLowerCase();
  const secretKey = Buffer.from(
    "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==",
    "base64"
  );
  const signData = await hmacSha256(secretKey, bytesToSign);
  const signBase64 = Buffer.from(signData).toString("base64");
  return `MSTranslatorAndroidApp::${signBase64}::${formattedDate}::${uuidStr}`;
}

async function getMicrosoftEndpointToken(): Promise<{ region: string; token: string }> {
  const nowSec = Date.now() / 1000;
  // Reuse cached token if valid for at least another 2 minutes
  if (cachedTokenInfo && cachedTokenInfo.expiredAt > nowSec + 120) {
    return { region: cachedTokenInfo.region, token: cachedTokenInfo.token };
  }

  const endpointUrl = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
  const clientId = crypto.randomUUID().replace(/-/g, "");
  const signature = await signTranslatorEndpoint(endpointUrl);

  const res = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Accept-Language": "zh-Hans",
      "X-ClientVersion": "4.0.530a 5fe1dc6c",
      "X-UserId": "0f04d16a175c411e",
      "X-HomeGeographicRegion": "zh-Hans-CN",
      "X-ClientTraceId": clientId,
      "X-MT-Signature": signature,
      "User-Agent": "okhttp/4.5.0",
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": "0",
    },
  });

  if (!res.ok) {
    throw new Error(`Microsoft auth endpoint returned ${res.status}`);
  }

  const data = await res.json();
  const token = data.t;
  const region = data.r || "westeurope";

  let expiredAt = nowSec + 600;
  try {
    const payloadPart = token.split(".")[1];
    if (payloadPart) {
      const decoded = JSON.parse(Buffer.from(payloadPart, "base64").toString("utf-8"));
      if (decoded.exp) expiredAt = decoded.exp;
    }
  } catch {}

  cachedTokenInfo = { region, token, expiredAt };
  return { region, token };
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&apos;";
      default: return c;
    }
  });
}

function getCacheFilename(text: string, voice: string = "default"): string {
  const hash = crypto.createHash("md5").update(`male_ms_${voice}_${text.toLowerCase().trim()}`).digest("hex");
  return path.join(DISK_CACHE_DIR, `${hash}.mp3`);
}

async function synthesizeMicrosoftNeural(text: string, voice: string): Promise<Buffer> {
  const { region, token } = await getMicrosoftEndpointToken();
  const ttsUrl = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const ssml = `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="de-DE">
    <voice name="${voice}">
        <prosody rate="-4%" pitch="0%" volume="100">${escapeXml(text)}</prosody>
    </voice>
</speak>`;

  const response = await fetch(ttsUrl, {
    method: "POST",
    headers: {
      "Authorization": token,
      "Content-Type": "application/ssml+xml",
      "User-Agent": "okhttp/4.5.0",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
    },
    body: ssml,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Microsoft Speech API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const arrayBuf = await response.arrayBuffer();
  if (!arrayBuf || arrayBuf.byteLength < 100) {
    throw new Error("Microsoft Speech API returned empty audio");
  }

  return Buffer.from(arrayBuf);
}

export async function POST(req: NextRequest) {
  try {
    const { text, voice } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const cleanText = text.replace(/\|/g, "").replace(/___+/g, "").trim();
    if (!cleanText) {
      return NextResponse.json({ error: "Empty text" }, { status: 400 });
    }

    // Strictly enforce male German voice
    let requestedVoice = "de-DE-KillianNeural";
    if (typeof voice === "string" && voice.trim() && MALE_VOICES.includes(voice.trim())) {
      requestedVoice = voice.trim();
    }
    const cacheKey = `male_ms_${requestedVoice}_${cleanText}`;

    // 1. In-memory RAM cache check (0ms response)
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

    // 2. Persistent disk cache check (~1ms response)
    const diskPath = getCacheFilename(cleanText, requestedVoice);
    try {
      if (fs.existsSync(diskPath)) {
        const diskBuffer = fs.readFileSync(diskPath);
        if (diskBuffer && diskBuffer.length > 100) {
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
    } catch {}

    // 3. Network synthesis via official Microsoft Cognitive Services REST API
    let audioBuffer: Buffer | null = null;
    let lastError: unknown = null;

    const candidateVoices = [
      requestedVoice,
      ...MALE_VOICES.filter((v) => v !== requestedVoice),
    ];

    for (const vName of candidateVoices) {
      try {
        audioBuffer = await synthesizeMicrosoftNeural(cleanText, vName);
        if (audioBuffer && audioBuffer.length > 100) {
          break;
        }
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }

    if (!audioBuffer || audioBuffer.length < 100) {
      throw lastError || new Error("Failed to synthesize audio with Microsoft Neural Voices");
    }

    // Save to Disk Cache in /tmp
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
        "X-TTS-Source": "microsoft-neural-male",
      },
    });
  } catch (error: any) {
    console.error("Microsoft TTS Server Error:", error);
    return NextResponse.json({
      error: "Microsoft TTS failed",
      details: error?.message || String(error),
    }, { status: 500 });
  }
}