const params = new URLSearchParams(window.location.search);
const type = params.get('type') || 'celebration';
const headline = params.get('headline') || 'GOAL!';
const sub = params.get('sub') || '';
const score = params.get('score') || '';
const elapsed = params.get('elapsed') || '';

document.getElementById('headline').textContent = headline;
document.getElementById('headline').className = 'headline ' + type;
document.getElementById('sub').textContent = sub;
document.getElementById('score').textContent = score;
if (elapsed) {
  const isStatus = ['FT', 'AET', 'PEN', 'HT'].includes(elapsed);
  document.getElementById('elapsed').textContent = isStatus ? elapsed : elapsed + "'";
}

const scene = document.getElementById('scene');
scene.className = 'anim-scene ' + type;

// Emoji map
const EMOJIS = {
  tracking_started: '\u{1F440}', celebration: '\u{26BD}', sad: '\u{1F614}',
  worried: '\u{1F630}', big_lead: '\u{1F525}', match_won: '\u{1F3C6}',
  match_lost: '\u{1F494}', match_draw: '\u{1F91D}'
};

// Secondary floating emojis
const FLOAT_EMOJIS = {
  tracking_started: ['\u{1F3AF}', '\u{2B50}', '\u{1F44D}', '\u{1F4AA}'],
  celebration: ['\u{1F389}', '\u{26BD}', '\u{1F525}', '\u{2B50}', '\u{1F4AA}', '\u{1F31F}'],
  sad: ['\u{1F4A7}', '\u{2601}'],
  worried: ['\u{1F628}', '\u{1F615}', '\u{2753}'],
  big_lead: ['\u{1F525}', '\u{1F4AA}', '\u{2B50}', '\u{1F31F}', '\u{1F680}'],
  match_won: ['\u{1F389}', '\u{1F3C6}', '\u{2B50}', '\u{1F451}', '\u{1F947}'],
  match_lost: ['\u{1F4A7}', '\u{2601}', '\u{1F62D}'],
  match_draw: ['\u{1F91D}', '\u{2696}', '\u{1F937}']
};

// Confetti colors
const COLORS = {
  tracking_started: ['#818cf8', '#a78bfa', '#6366f1', '#60a5fa', '#c4b5fd'],
  celebration: ['#22c55e', '#facc15', '#3b82f6', '#f43f5e', '#a855f7', '#fb923c'],
  sad: ['#475569', '#64748b', '#334155'],
  worried: ['#f59e0b', '#fbbf24', '#d97706', '#92400e'],
  big_lead: ['#22c55e', '#10b981', '#facc15', '#3b82f6', '#a855f7'],
  match_won: ['#22c55e', '#facc15', '#3b82f6', '#f43f5e', '#a855f7', '#fbbf24'],
  match_lost: ['#475569', '#64748b', '#334155'],
  match_draw: ['#f59e0b', '#94a3b8', '#64748b', '#fbbf24']
};

// Glow colors
const GLOW_COLORS = {
  tracking_started: '#6366f1', celebration: '#22c55e', sad: '#64748b',
  worried: '#f59e0b', big_lead: '#10b981', match_won: '#facc15',
  match_lost: '#64748b', match_draw: '#f59e0b'
};

const colors = COLORS[type] || COLORS.celebration;
const isHappy = ['celebration', 'big_lead', 'match_won', 'tracking_started'].includes(type);
const isSad = ['sad', 'match_lost'].includes(type);

// 1. Glow ring
const glow = document.createElement('div');
glow.className = 'glow-ring';
glow.style.background = 'radial-gradient(circle, ' + (GLOW_COLORS[type] || '#3b82f6') + '44, transparent 70%)';
glow.style.boxShadow = '0 0 40px ' + (GLOW_COLORS[type] || '#3b82f6') + '66';
scene.appendChild(glow);

// 2. Burst rays (for positive types)
if (isHappy) {
  for (let i = 0; i < 12; i++) {
    const ray = document.createElement('div');
    ray.className = 'burst-ray';
    ray.style.transform = 'rotate(' + (i * 30) + 'deg)';
    ray.style.background = colors[i % colors.length] + '88';
    ray.style.animationDelay = (i * 0.05) + 's';
    scene.appendChild(ray);
  }
}

// 3. Confetti / Rain
if (isSad) {
  for (let i = 0; i < 20; i++) {
    const drop = document.createElement('div');
    drop.className = 'rain';
    drop.style.left = (Math.random() * 100) + '%';
    drop.style.height = (15 + Math.random() * 20) + 'px';
    drop.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
    drop.style.animationDelay = (Math.random() * 2) + 's';
    scene.appendChild(drop);
  }
} else {
  const confettiCount = isHappy ? 24 : 12;
  for (let i = 0; i < confettiCount; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = (Math.random() * 100) + '%';
    c.style.width = (4 + Math.random() * 6) + 'px';
    c.style.height = (4 + Math.random() * 6) + 'px';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDuration = (1.2 + Math.random() * 1.5) + 's';
    c.style.animationDelay = (Math.random() * 2) + 's';
    if (Math.random() > 0.5) c.style.borderRadius = '50%';
    scene.appendChild(c);
  }
}

// 4. Sparkle stars
if (isHappy) {
  const sparkles = ['\u2728', '\u2B50', '\u{1F31F}', '\u2734\uFE0F'];
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('div');
    s.className = 'sparkle';
    s.textContent = sparkles[Math.floor(Math.random() * sparkles.length)];
    s.style.left = (10 + Math.random() * 80) + '%';
    s.style.top = (10 + Math.random() * 80) + '%';
    s.style.animationDuration = (0.8 + Math.random() * 1) + 's';
    s.style.animationDelay = (Math.random() * 1.5) + 's';
    scene.appendChild(s);
  }
}

// 5. Floating mini emojis
const floaters = FLOAT_EMOJIS[type] || [];
for (let i = 0; i < Math.min(floaters.length, 4); i++) {
  const f = document.createElement('div');
  f.className = 'float-emoji';
  f.textContent = floaters[i];
  f.style.left = (15 + i * 20 + Math.random() * 10) + '%';
  f.style.bottom = '10px';
  f.style.animationDelay = (0.3 + i * 0.4) + 's';
  scene.appendChild(f);
}

// 6. Main emoji (added last so it's on top)
const mainEmoji = document.createElement('div');
mainEmoji.className = 'main-emoji';
mainEmoji.textContent = EMOJIS[type] || '\u{26BD}';
scene.appendChild(mainEmoji);

// Sound
try {
  const ctx = new AudioContext(), osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  if (type === 'tracking_started') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
  } else if (isSad) {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(330, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
  } else {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.15);
    osc.frequency.linearRampToValueAtTime(1400, ctx.currentTime + 0.3);
    osc.frequency.setValueAtTime(1400, ctx.currentTime + 0.3);
    osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
  }
} catch(e) {}

setTimeout(function() { window.close(); }, 8000);
document.body.addEventListener('click', function() { window.close(); });
