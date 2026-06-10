import { createClient } from 'redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, style, tone } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
  const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;

  if (!ANTHROPIC_KEY || !ELEVENLABS_KEY) {
    return res.status(500).json({ error: 'API keys not configured. Please add them in Vercel environment variables.' });
  }

  // ── Daily site-wide cap ──────────────────────────────────────────────────
  const DAILY_CAP = 100;

  try {
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();

    const today = new Date().toISOString().slice(0, 10); // e.g. "2026-06-08"
    const key = `songs:${today}`;

    const count = await client.incr(key);

    // Set expiry to 25 hours so it auto-cleans up
    if (count === 1) {
      await client.expire(key, 90000);
    }

    await client.disconnect();

    if (count > DAILY_CAP) {
      return res.status(429).json({
        error: `ChantGPT has hit its daily limit of ${DAILY_CAP} songs! Come back tomorrow for more anthems. 🎵`
      });
    }
  } catch (e) {
    // If Redis fails, allow the request through so the site keeps working
    console.error('Redis error:', e.message);
  }

  // ── Step 1: Generate lyrics with Claude ──────────────────────────────────
  let title  = 'Your Anthem';
  let lyrics = '';
  let stylePrompt = '';

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Write a World Cup football anthem based on this description: "${prompt}"
Style: ${style || 'anthem'}
Tone: ${tone || 'fun, silly and anthemic — more terrace banter than rock concert'}

Instructions:
- First line must be: TITLE: [your creative song title]
- Second line must be: STYLE_PROMPT: [a short 10-15 word music description for an AI music generator, e.g. "playful singalong anthem, pub crowd chanting, brass band, upbeat, cheerful, bouncy"]
- Then write the full song lyrics with sections labelled in square brackets like [Verse 1], [Chorus], [Bridge] etc.
- Include 1 verse, a chorus, a bridge, then a final chorus
- IMPORTANT: The entire song must be very short — maximum 2 lines per section, 6-8 words per line
- Think of it like a chant, not a full song — short, repetitive, easy to sing
- Make it fun, silly and singable — think terrace chants, crowd participation, daft rhymes
- It should make people laugh AND want to sing along
- Use football references throughout`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error('Claude error: ' + claudeData.error.message);

    const text = claudeData.content?.map(b => b.text || '').join('') || '';

    const titleMatch = text.match(/^TITLE:\s*(.+)/m);
    if (titleMatch) title = titleMatch[1].trim().replace(/[*_]/g, '');

    const styleMatch = text.match(/^STYLE_PROMPT:\s*(.+)/m);
    if (styleMatch) stylePrompt = styleMatch[1].trim();

    lyrics = text
      .replace(/^TITLE:\s*.+\n?/m, '')
      .replace(/^STYLE_PROMPT:\s*.+\n?/m, '')
      .trim();

  } catch (e) {
    return res.status(500).json({ error: 'Failed to generate lyrics: ' + e.message });
  }

  // ── Step 2: Generate song audio with ElevenLabs ──────────────────────────
  try {
    const musicPrompt = `${stylePrompt}. Include vocals singing these lyrics: ${lyrics.slice(0, 600)}`;

    const elRes = await fetch('https://api.elevenlabs.io/v1/music', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_KEY
      },
      body: JSON.stringify({
        prompt: musicPrompt,
        music_length_ms: 60000,
        model_id: 'music_v1'
      })
    });

    if (!elRes.ok) {
      const errText = await elRes.text();
      throw new Error(`ElevenLabs error (${elRes.status}): ${errText}`);
    }

    const audioBuffer = await elRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    const audioUrl    = `data:audio/mpeg;base64,${audioBase64}`;

    return res.status(200).json({ title, lyrics, audioUrl, stylePrompt });

  } catch (e) {
    return res.status(200).json({
      title,
      lyrics,
      audioUrl: null,
      audioError: 'Audio generation failed: ' + e.message
    });
  }
}
