import { NextRequest, NextResponse } from "next/server";
import { EdgeTTS } from "node-edge-tts";
import fs from "fs";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    let audioBuffer: Buffer | null = null;
    let lastError: any = null;

    // Retry up to 2 times in case of intermittent Microsoft Edge TTS socket drops
    for (let attempt = 0; attempt < 2; attempt++) {
      const tempFilePath = path.join(
        os.tmpdir(),
        `tts-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`
      );

      try {
        const tts = new EdgeTTS({
          voice: "de-DE-ConradNeural",
          lang: "de-DE",
          outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          rate: "-5%",
          timeout: 8000,
        });

        await tts.ttsPromise(text, tempFilePath);

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
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    if (!audioBuffer) {
      throw lastError || new Error("Failed to synthesize audio after retries");
    }

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("TTS Error:", error);
    return NextResponse.json({ error: "Failed to fetch TTS" }, { status: 500 });
  }
}