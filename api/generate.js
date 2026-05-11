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
Tone: ${tone || 'triumphant and epic'}

Instructions:
- First line must be: TITLE: [your creative song title]
- Second line must be: STYLE_PROMPT: [a short 10-15 word music description for an AI music generator, e.g. "upbeat samba anthem, male choir, stadium crowd, brass instruments, triumphant"]
- Then write the full song lyrics with sections labelled in square brackets like [Verse 1], [Chorus], [Bridge] etc.
- Include 2 verses, a chorus (repeated), and a bridge
- Make it genuinely singable, exciting and anthemic
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
    const elRes = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_KEY
      },
      body: JSON.stringify({
        text: `${stylePrompt}. Lyrics: ${lyrics.slice(0, 800)}`,
        duration_seconds: 30,
        prompt_influence: 0.5
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
    // Return lyrics even if audio fails, so user gets something
    return res.status(200).json({
      title,
      lyrics,
      audioUrl: null,
      error: 'Audio generation failed: ' + e.message
    });
  }
}
