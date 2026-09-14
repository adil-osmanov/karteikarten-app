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

    // ConradNeural is an excellent, natural sounding German voice.
    // KatjaNeural is a female option. Let's use ConradNeural.
    const tts = new EdgeTTS({
      voice: "de-DE-KillianNeural",
      lang: "de-DE",
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    });

    // Write to a temporary file, read it into buffer, then delete it.
    const tempFilePath = path.join(os.tmpdir(), `tts-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);
    
    await tts.ttsPromise(text, tempFilePath);
    
    const audioBuffer = fs.readFileSync(tempFilePath);
    fs.unlinkSync(tempFilePath); // Cleanup

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