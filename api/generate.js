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
  const KV_URL         = process.env.UPSTASH_KV_REST_API_URL;
  const KV_TOKEN       = process.env.UPSTASH_KV_REST_API_TOKEN;

  if (!ANTHROPIC_KEY || !ELEVENLABS_KEY) {
    return res.status(500).json({ error: 'API keys not configured. Please add them in Vercel environment variables.' });
  }

  // ── Daily site-wide cap ──────────────────────────────────────────────────
  const DAILY_CAP = 250;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `songs:${today}`;

    const incrRes = await fetch(`${KV_URL}/incr/${key}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const { result: count } = await incrRes.json();

    if (count === 1) {
      await fetch(`${KV_URL}/expire/${key}/90000`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    }

    if (count > DAILY_CAP) {
      return res.status(429).json({ error: 'daily_cap' });
    }
  } catch (e) {
    console.error('KV error:', e.message);
    return res.status(500).json({ error: 'Service temporarily unavailable. Please try again.' });
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
- Include 1 verse, a chorus, then a final chorus — no bridge
- Keep each section to 4-5 lines — punchy and singable, not too wordy
- The chorus is the main hook — singalong, daft, punchy
- The final chorus should feel bigger — add an extra chant line, a repeated phrase, or a "the whole crowd joins in" moment to make it feel like a climax
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
const musicPrompt = `${stylePrompt}. Vocals start immediately within the first 5 seconds, no long intro. Include vocals singing these lyrics: ${lyrics.slice(0, 600)}`;

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
