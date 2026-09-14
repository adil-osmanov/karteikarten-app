const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');

async function test() {
  const tts = new EdgeTTS({
    voice: 'de-DE-ConradNeural', // Awesome German voice
    lang: 'de-DE',
  });
  const filepath = '/tmp/test.mp3';
  await tts.ttsPromise('Guten Tag, wie geht es dir?', filepath);
  console.log('Size:', fs.statSync(filepath).size);
}
test().catch(console.error);
