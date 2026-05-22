let lyricsText = '';

// ── PROGRESS STEPS ──
function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el  = document.getElementById('step' + i);
    const dot = el.querySelector('.step-dot');
    if      (i < n)  { el.className = 'step done';   dot.textContent = '✓'; }
    else if (i === n) { el.className = 'step active'; dot.textContent = i;   }
    else              { el.className = 'step';        dot.textContent = i;   }
  }
}

// ── HELPERS ──
function delay(ms)   { return new Promise(r => setTimeout(r, ms)); }
function escHtml(t)  { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── MAIN GENERATE FUNCTION ──
async function generate() {
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) { document.getElementById('prompt').focus(); return; }

  const btn = document.getElementById('genBtn');
  btn.disabled    = true;
  btn.textContent = '🎵 COMPOSING...';

  document.getElementById('progressSection').style.display = 'block';
  document.getElementById('outputSection').style.display   = 'none';
  document.getElementById('errorBox').style.display        = 'none';
  document.getElementById('progressSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  setStep(1);

  try {
    const res  = await fetch('/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt })
    });

    const data = await res.json();
    if (!res.ok)    throw new Error(data.error || 'Server error');
    if (data.error) throw new Error(data.error);

    setStep(2); await delay(700);
    setStep(3); await delay(700);
    setStep(4); await delay(500);

    lyricsText = data.lyrics;
    document.getElementById('songTitle').textContent = data.title || 'Your Anthem';

    if (data.audioUrl) {
      document.getElementById('audioPlayer').src  = data.audioUrl;
      document.getElementById('downloadBtn').href = data.audioUrl;
    }

    if (data.audioError) {
      const eb = document.getElementById('errorBox');
      eb.textContent   = 'Audio issue: ' + data.audioError;
      eb.style.display = 'block';
    }

    // Render lyrics — $1 preserves the text inside [Verse 1], [Chorus] etc.
    const rendered = escHtml(data.lyrics)
      .replace(/\[([^\]]+)\]/g, '<span class="section-tag">[$1]</span>')
      .replace(/\n/g, '<br>');
    document.getElementById('lyricsBox').innerHTML = rendered;

    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('outputSection').style.display   = 'block';
    document.getElementById('outputSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch(e) {
    document.getElementById('progressSection').style.display = 'none';
    const eb = document.getElementById('errorBox');
    eb.textContent   = 'Something went wrong: ' + e.message;
    eb.style.display = 'block';
  }

  btn.disabled    = false;
  btn.textContent = 'MAKE MY WORLD CUP SONG';
}

// ── COPY LYRICS ──
function copyLyrics() {
  if (!lyricsText) return;
  navigator.clipboard.writeText(lyricsText).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = 'Copy Lyrics', 2000);
  });
}
