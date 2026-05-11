# ChantGPT 🏆

AI-powered World Cup anthem generator. Users describe their team and get back a real sung song with lyrics and music.

## Files

- `index.html` — the website frontend
- `api/generate.js` — the backend that calls Claude + ElevenLabs
- `vercel.json` — Vercel configuration

## Deploy to Vercel

1. Upload this folder to a GitHub repository
2. Import the repo on vercel.com
3. Add these environment variables in Vercel project settings:
   - `ANTHROPIC_API_KEY` = your Anthropic API key (sk-ant-...)
   - `ELEVENLABS_API_KEY` = your ElevenLabs API key (sk_...)
4. Deploy!

## How it works

1. User types a prompt describing their anthem
2. Claude writes the lyrics + a music style description
3. ElevenLabs turns it into a real audio file with vocals
4. The song plays directly on the page
