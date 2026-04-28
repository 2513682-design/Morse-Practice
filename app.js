/* ============================================
   MORSE TRAINER - Full Application Logic
   ============================================ */

const MORSE_CODE = {
    'A':'.-','B':'-...','C':'-.-.','D':'-..','E':'.','F':'..-.','G':'--.','H':'....',
    'I':'..','J':'.---','K':'-.-','L':'.-..','M':'--','N':'-.','O':'---','P':'.--.',
    'Q':'--.-','R':'.-.','S':'...','T':'-','U':'..-','V':'...-','W':'.--','X':'-..-',
    'Y':'-.--','Z':'--..',
    '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-',
    '5':'.....','6':'-....','7':'--...','8':'---..','9':'----.'
};
const MORSE_TO_CHAR = {};
for (const [c, m] of Object.entries(MORSE_CODE)) MORSE_TO_CHAR[m] = c;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

/* ---------- STATE ---------- */
const state = {
    tab: 'typing', charset: 'letters', soundEnabled: true, hintVisible: false,
    holdThreshold: 180, currentChar: '', currentMorse: '', userInput: '',
    streak: 0, correct: 0, total: 0, isHolding: false, holdStartTime: 0, holdAnimFrame: null,
    audioCtx: null, locked: false,
    // Listening
    listenChar: '', listenMorse: '', listenStreak: 0, listenCorrect: 0, listenTotal: 0,
    isPlaying: false, listenRevealed: false,
};

/* ---------- DOM ---------- */
const dom = {};
function cacheDom() {
    const ids = ['char-display','morse-hint','user-morse','morse-input-display','visual-feedback',
        'hold-indicator','hold-bar','streak','correct','total','accuracy-ring','accuracy-pct',
        'btn-sound','btn-settings','settings-panel','close-settings','overlay','ref-content',
        'result-flash','toggle-hint','threshold-range','threshold-value','particles-canvas',
        'history-list','btn-toggle-sidebar','sidebar',
        'tab-typing','tab-listening','tab-abbr','typing-mode','listening-mode','abbr-mode',
        'listen-streak','listen-correct','listen-total','listen-accuracy-ring','listen-accuracy-pct',
        'wave-visualizer','listen-morse-display','btn-play-morse','listen-speed',
        'listen-char-input','btn-listen-check','listen-history-list'];
    ids.forEach(id => { dom[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id); });
}

/* ---------- AUDIO ---------- */
function initAudio() { if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playTone(dur, freq = 650) {
    if (!state.soundEnabled) return;
    initAudio(); const ctx = state.audioCtx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type = 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + dur / 1000);
}
function playDot() { playTone(80, 650); }
function playDash() { playTone(240, 650); }
function playSuccess() {
    if (!state.soundEnabled) return; initAudio(); const ctx = state.audioCtx;
    [523,659,784].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'sine';
        o.frequency.setValueAtTime(f, ctx.currentTime + i * .1);
        g.gain.setValueAtTime(0.1, ctx.currentTime + i * .1);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * .1 + .2);
        o.start(ctx.currentTime + i * .1); o.stop(ctx.currentTime + i * .1 + .2);
    });
}
function playError() {
    if (!state.soundEnabled) return; initAudio(); const ctx = state.audioCtx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type = 'square';
    o.frequency.setValueAtTime(200, ctx.currentTime);
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + .3);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + .3);
}

/* ---------- HELPERS ---------- */
function getPool() {
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), N = '0123456789'.split('');
    return state.charset === 'letters' ? L : state.charset === 'numbers' ? N : [...L, ...N];
}
function randChar(exclude = '') {
    const p = getPool(); let c;
    do { c = p[Math.floor(Math.random() * p.length)]; } while (c === exclude && p.length > 1);
    return c;
}
function morseVisual(s) { return s.split('').map(c => c === '.' ? '·' : '—').join(' '); }

function updateAccuracyRing(ringEl, pctEl, correct, total) {
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;
    const circumference = 2 * Math.PI * 17; // r=17
    const offset = circumference * (1 - pct / 100);
    ringEl.style.strokeDashoffset = offset;
    pctEl.textContent = pct + '%';
}

/* ---------- TYPING MODE ---------- */
function setNewChallenge() {
    const ch = randChar(state.currentChar);
    state.currentChar = ch; state.currentMorse = MORSE_CODE[ch]; state.userInput = ''; state.locked = false;
    dom.userMorse.textContent = ''; dom.visualFeedback.innerHTML = '';
    dom.charDisplay.textContent = ch;
    dom.morseHint.textContent = morseVisual(state.currentMorse);
    dom.morseHint.classList.toggle('visible', state.hintVisible);
    dom.charDisplay.classList.remove('correct', 'wrong');
    dom.charDisplay.style.animation = 'none'; dom.charDisplay.offsetHeight; dom.charDisplay.style.animation = '';
    dom.morseInputDisplay.classList.remove('correct-flash', 'wrong-flash');
    highlightRef(ch);
}

function updateTypingScore() {
    dom.streak.textContent = state.streak;
    dom.correct.textContent = state.correct;
    dom.total.textContent = state.total;
    updateAccuracyRing(dom.accuracyRing, dom.accuracyPct, state.correct, state.total);
}

function handleSpaceDown(e) {
    if (state.locked || state.isHolding) return;
    e.preventDefault(); state.isHolding = true; state.holdStartTime = performance.now();
    dom.holdIndicator.classList.add('active'); animateHoldBar();
    dom.morseInputDisplay.classList.add('focused');
}
function handleSpaceUp(e) {
    if (!state.isHolding) return;
    e.preventDefault(); state.isHolding = false; cancelAnimationFrame(state.holdAnimFrame);
    const dur = performance.now() - state.holdStartTime;
    const dash = dur >= state.holdThreshold;
    state.userInput += dash ? '-' : '.';
    if (dash) playDash(); else playDot();
    addFb(dash ? 'dash' : 'dot');
    dom.userMorse.textContent = morseVisual(state.userInput);
    dom.holdIndicator.classList.remove('active'); dom.holdBar.style.width = '0%';
    dom.morseInputDisplay.classList.remove('focused');
}
function animateHoldBar() {
    if (!state.isHolding) return;
    const p = Math.min((performance.now() - state.holdStartTime) / state.holdThreshold * 100, 100);
    dom.holdBar.style.width = p + '%';
    dom.holdBar.style.background = p >= 100 ? 'linear-gradient(90deg,var(--blue-300),var(--blue-100))' : '';
    state.holdAnimFrame = requestAnimationFrame(animateHoldBar);
}
function addFb(type) {
    const el = document.createElement('div');
    el.className = type === 'dot' ? 'fb-dot' : 'fb-dash';
    dom.visualFeedback.appendChild(el);
}

function checkTyping() {
    if (!state.userInput || state.locked) return;
    state.locked = true; state.total++;
    const ok = state.userInput === state.currentMorse;
    if (ok) {
        state.correct++; state.streak++;
        dom.charDisplay.classList.add('correct');
        dom.morseInputDisplay.classList.add('correct-flash');
        showFlash('success'); playSuccess();
    } else {
        state.streak = 0;
        dom.charDisplay.classList.add('wrong');
        dom.morseInputDisplay.classList.add('wrong-flash');
        showFlash('error'); playError();
        dom.morseHint.textContent = morseVisual(state.currentMorse);
        dom.morseHint.classList.add('visible');
    }
    addHistory('history-list', state.currentChar, state.currentMorse, state.userInput, ok);
    if (typeof recordAttempt === 'function') recordAttempt(state.currentChar, state.currentMorse, state.userInput, ok);
    updateTypingScore();
    setTimeout(setNewChallenge, ok ? 600 : 1200);
}

function deleteLastInput() {
    if (state.userInput.length > 0 && !state.locked) {
        state.userInput = state.userInput.slice(0, -1);
        dom.userMorse.textContent = morseVisual(state.userInput);
        if (dom.visualFeedback.lastChild) dom.visualFeedback.removeChild(dom.visualFeedback.lastChild);
    }
}

/* ---------- LISTENING MODE ---------- */
function setNewListenChallenge() {
    const ch = randChar(state.listenChar);
    state.listenChar = ch; state.listenMorse = MORSE_CODE[ch]; state.listenRevealed = false; state.locked = false;
    dom.listenMorseDisplay.textContent = '—'; dom.listenMorseDisplay.classList.remove('revealed');
    dom.listenCharInput.value = '';
    dom.listenCharInput.classList.remove('correct-flash', 'wrong-flash');
    resetWave();
    highlightRef(ch);
    // Auto play after short delay
    setTimeout(() => playMorseAudio(state.listenMorse), 400);
}

function updateListenScore() {
    dom.listenStreak.textContent = state.listenStreak;
    dom.listenCorrect.textContent = state.listenCorrect;
    dom.listenTotal.textContent = state.listenTotal;
    updateAccuracyRing(dom.listenAccuracyRing, dom.listenAccuracyPct, state.listenCorrect, state.listenTotal);
}

function getSpeedMs() {
    const v = dom.listenSpeed.value;
    return v === 'slow' ? { dot: 150, dash: 450, gap: 150, freq: 600 }
         : v === 'fast' ? { dot: 60, dash: 180, gap: 60, freq: 700 }
         : { dot: 100, dash: 300, gap: 100, freq: 650 };
}

async function playMorseAudio(morse) {
    if (state.isPlaying) return;
    state.isPlaying = true; initAudio();
    dom.btnPlayMorse.classList.add('playing');
    const sp = getSpeedMs();
    const bars = dom.waveVisualizer.querySelectorAll('.wave-bar');

    for (let i = 0; i < morse.length; i++) {
        const isDot = morse[i] === '.';
        const dur = isDot ? sp.dot : sp.dash;
        // Animate bars
        animateWaveBars(bars, dur);
        // Play tone
        const ctx = state.audioCtx;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'sine';
        o.frequency.setValueAtTime(sp.freq, ctx.currentTime);
        g.gain.setValueAtTime(0.18, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
        o.start(ctx.currentTime); o.stop(ctx.currentTime + dur / 1000);
        await sleep(dur + sp.gap);
    }
    resetWave();
    state.isPlaying = false;
    dom.btnPlayMorse.classList.remove('playing');
    // Reveal morse text
    dom.listenMorseDisplay.textContent = morseVisual(morse);
    dom.listenMorseDisplay.classList.add('revealed');
    state.listenRevealed = true;
    dom.listenCharInput.focus();
}

function animateWaveBars(bars, duration) {
    bars.forEach((b, i) => {
        const h = 8 + Math.random() * 44;
        setTimeout(() => { b.style.height = h + 'px'; b.classList.add('active'); }, i * 20);
    });
    setTimeout(() => {
        bars.forEach(b => { b.style.height = '8px'; b.classList.remove('active'); });
    }, duration);
}

function resetWave() {
    const bars = dom.waveVisualizer.querySelectorAll('.wave-bar');
    bars.forEach(b => { b.style.height = '8px'; b.classList.remove('active'); });
}

function checkListening() {
    const answer = dom.listenCharInput.value.trim().toUpperCase();
    if (!answer || state.locked) return;
    state.locked = true; state.listenTotal++;
    const ok = answer === state.listenChar;
    if (ok) {
        state.listenCorrect++; state.listenStreak++;
        dom.listenCharInput.classList.add('correct-flash');
        showFlash('success'); playSuccess();
    } else {
        state.listenStreak = 0;
        dom.listenCharInput.classList.add('wrong-flash');
        showFlash('error'); playError();
        // Show correct answer
        dom.listenCharInput.value = state.listenChar;
    }
    addHistory('listen-history-list', state.listenChar, state.listenMorse, ok ? state.listenMorse : '?', ok);
    if (typeof recordListenAttempt === 'function') recordListenAttempt(state.listenChar, state.listenMorse, answer, ok);
    else if (typeof recordAttempt === 'function') recordAttempt(state.listenChar, state.listenMorse, ok ? state.listenMorse : '', ok);
    updateListenScore();
    setTimeout(setNewListenChallenge, ok ? 600 : 1200);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------- HISTORY ---------- */
function addHistory(containerId, char, morse, userMorse, ok) {
    const container = document.getElementById(containerId);
    // Remove empty placeholder
    const empty = container.querySelector('.history-empty');
    if (empty) empty.remove();

    const el = document.createElement('div');
    el.className = 'history-item ' + (ok ? 'h-correct' : 'h-wrong');
    el.innerHTML = `
        <span class="h-icon">${ok ? '✓' : '✗'}</span>
        <span class="h-char">${char}</span>
        <span class="h-morse">${morseVisual(morse)}</span>
    `;
    container.insertBefore(el, container.firstChild);
    // Keep max 15 items
    while (container.children.length > 15) container.removeChild(container.lastChild);
}

/* ---------- SIDEBAR REFERENCE ---------- */
function buildRef() {
    dom.refContent.innerHTML = '';
    Object.entries(MORSE_CODE).forEach(([c, m]) => {
        const el = document.createElement('div');
        el.className = 'ref-item'; el.dataset.char = c;
        el.innerHTML = `<span class="ref-char">${c}</span><span class="ref-morse">${morseVisual(m)}</span>`;
        dom.refContent.appendChild(el);
    });
}
function highlightRef(char) {
    $$('.ref-item').forEach(el => el.classList.toggle('highlight', el.dataset.char === char));
}

/* ---------- FLASH ---------- */
function showFlash(type) {
    dom.resultFlash.className = type;
    setTimeout(() => dom.resultFlash.classList.add('hidden'), 400);
}

/* ---------- PARTICLES ---------- */
function initParticles() {
    const c = dom.particlesCanvas, ctx = c.getContext('2d');
    let pts = [];
    const N = 35;
    function resize() { c.width = innerWidth; c.height = innerHeight; }
    function create() { return { x: Math.random()*c.width, y: Math.random()*c.height, vx:(Math.random()-.5)*.25, vy:(Math.random()-.5)*.25, s: Math.random()*1.5+.5, o: Math.random()*.25+.08 }; }
    function draw() {
        ctx.clearRect(0, 0, c.width, c.height);
        pts.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
            if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2);
            ctx.fillStyle = `rgba(38,112,255,${p.o})`; ctx.fill();
        });
        for (let i = 0; i < pts.length; i++) for (let j = i+1; j < pts.length; j++) {
            const d = Math.hypot(pts[i].x-pts[j].x, pts[i].y-pts[j].y);
            if (d < 130) { ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y);
                ctx.strokeStyle = `rgba(38,112,255,${.05*(1-d/130)})`; ctx.lineWidth = .5; ctx.stroke(); }
        }
        requestAnimationFrame(draw);
    }
    resize(); pts = Array.from({length:N}, create); draw();
    addEventListener('resize', resize);
}

/* ---------- TABS ---------- */
function switchTab(tab) {
    state.tab = tab;
    dom.tabTyping.classList.toggle('active', tab === 'typing');
    dom.tabListening.classList.toggle('active', tab === 'listening');
    dom.tabAbbr.classList.toggle('active', tab === 'abbr');
    dom.typingMode.classList.toggle('active', tab === 'typing');
    dom.listeningMode.classList.toggle('active', tab === 'listening');
    dom.abbrMode.classList.toggle('active', tab === 'abbr');
    if (tab === 'typing') setNewChallenge();
    else if (tab === 'listening') setNewListenChallenge();
    else { if(typeof setNewAbbrChallenge==='function') setNewAbbrChallenge(); }
}

/* ---------- MOBILE TOUCH BUTTONS ---------- */
function bindMobileBtns(containerId, handlers) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.touch-btn').forEach(btn => {
        const action = btn.dataset.action;
        if (!action || !handlers[action]) return;
        btn.addEventListener('touchstart', e => {
            e.preventDefault(); e.stopPropagation();
            initAudio(); // ensure audio context on first touch
            handlers[action]();
        }, { passive: false });
        btn.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            initAudio();
            handlers[action]();
        });
    });
}

/* ---------- EVENTS ---------- */
function bindEvents() {
    // Tabs
    dom.tabTyping.addEventListener('click', () => switchTab('typing'));
    dom.tabListening.addEventListener('click', () => switchTab('listening'));
    dom.tabAbbr.addEventListener('click', () => switchTab('abbr'));

    // Keyboard
    document.addEventListener('keydown', e => {
        if (!$('#settings-panel').classList.contains('hidden')) {
            if (e.key === 'Escape') closeSettings();
            return;
        }
        if (state.tab === 'typing') {
            switch (e.code) {
                case 'Space': handleSpaceDown(e); break;
                case 'Enter': e.preventDefault(); checkTyping(); break;
                case 'Backspace': e.preventDefault(); deleteLastInput(); break;
                case 'Escape': e.preventDefault(); state.streak = 0; updateTypingScore(); setNewChallenge(); break;
            }
        } else if (state.tab === 'abbr') {
            switch (e.code) {
                case 'Space': abbrSpaceDown(e); break;
                case 'Enter': e.preventDefault(); checkAbbrLetter(); break;
                case 'Backspace': e.preventDefault(); abbrDeleteLast(); break;
                case 'Escape': e.preventDefault(); abbrSkip(); break;
            }
        } else {
            if (e.target === dom.listenCharInput) {
                if (e.key === 'Enter') { e.preventDefault(); checkListening(); return; }
                return;
            }
            switch (e.code) {
                case 'KeyR': e.preventDefault(); playMorseAudio(state.listenMorse); break;
                case 'Enter': e.preventDefault(); checkListening(); break;
                case 'Escape': e.preventDefault(); state.listenStreak = 0; updateListenScore(); setNewListenChallenge(); break;
            }
        }
    });
    document.addEventListener('keyup', e => {
        if (state.tab === 'typing' && e.code === 'Space') handleSpaceUp(e);
        if (state.tab === 'abbr' && e.code === 'Space') abbrSpaceUp(e);
    });
    window.addEventListener('keydown', e => { if (e.code === 'Space' && (state.tab === 'typing' || state.tab === 'abbr')) e.preventDefault(); });

    // Sound toggle
    dom.btnSound.addEventListener('click', () => {
        state.soundEnabled = !state.soundEnabled;
        dom.btnSound.classList.toggle('active', state.soundEnabled);
        document.body.classList.toggle('sound-muted', !state.soundEnabled);
        initAudio();
    });

    // Settings
    dom.btnSettings.addEventListener('click', () => { dom.settingsPanel.classList.remove('hidden'); dom.overlay.classList.remove('hidden'); });
    dom.closeSettings.addEventListener('click', closeSettings);
    dom.overlay.addEventListener('click', closeSettings);

    // Sidebar
    dom.btnToggleSidebar.addEventListener('click', () => dom.sidebar.classList.toggle('collapsed'));

    // Charset
    $$('input[name="charset"]').forEach(inp => inp.addEventListener('change', e => {
        state.charset = e.target.value;
        $$('.radio-item[data-charset]').forEach(el => el.classList.toggle('active', el.dataset.charset === state.charset));
        if (state.tab === 'typing') setNewChallenge(); else setNewListenChallenge();
    }));

    // Hint toggle
    dom.toggleHint.addEventListener('change', () => {
        state.hintVisible = dom.toggleHint.checked;
        dom.morseHint.classList.toggle('visible', state.hintVisible);
    });

    // Threshold
    dom.thresholdRange.addEventListener('input', () => {
        state.holdThreshold = parseInt(dom.thresholdRange.value);
        dom.thresholdValue.textContent = state.holdThreshold;
    });

    // Listening controls
    dom.btnPlayMorse.addEventListener('click', () => playMorseAudio(state.listenMorse));
    dom.btnListenCheck.addEventListener('click', checkListening);

    // Touch support (typing)
    document.addEventListener('touchstart', e => {
        if (e.target.closest('#header,.panel,#overlay,#sidebar,.listen-input-wrapper')) return;
        if (state.tab === 'typing' && !state.locked) {
            e.preventDefault(); state.isHolding = true; state.holdStartTime = performance.now();
            dom.holdIndicator.classList.add('active'); animateHoldBar();
            dom.morseInputDisplay.classList.add('focused');
        } else if (state.tab === 'abbr' && !abbrState.locked) {
            e.preventDefault(); abbrSpaceDown(e);
        }
    }, { passive: false });
    document.addEventListener('touchend', e => {
        if (state.tab === 'typing' && state.isHolding) {
            state.isHolding = false; cancelAnimationFrame(state.holdAnimFrame);
            const dur = performance.now() - state.holdStartTime;
            const dash = dur >= state.holdThreshold;
            state.userInput += dash ? '-' : '.';
            if (dash) playDash(); else playDot();
            addFb(dash ? 'dash' : 'dot');
            dom.userMorse.textContent = morseVisual(state.userInput);
            dom.holdIndicator.classList.remove('active'); dom.holdBar.style.width = '0%';
            dom.morseInputDisplay.classList.remove('focused');
        } else if (state.tab === 'abbr' && abbrState.isHolding) {
            abbrSpaceUp(e);
        }
    });

    // Mobile touch buttons — typing mode
    bindMobileBtns('typing-touch-btns', {
        dot()  { if (state.locked) return; state.userInput += '.'; playDot(); addFb('dot'); dom.userMorse.textContent = morseVisual(state.userInput); },
        dash() { if (state.locked) return; state.userInput += '-'; playDash(); addFb('dash'); dom.userMorse.textContent = morseVisual(state.userInput); },
        delete: deleteLastInput,
        check:  checkTyping,
        skip()  { state.streak = 0; updateTypingScore(); setNewChallenge(); },
    });

    // Mobile touch buttons — abbr mode
    bindMobileBtns('abbr-touch-btns', {
        dot()  { if (typeof abbrState !== 'undefined' && abbrState.locked) return; abbrState.userInput += '.'; playDot(); const el = document.createElement('div'); el.className = 'fb-dot'; ad.vf.appendChild(el); ad.userMorse.textContent = morseVisual(abbrState.userInput); },
        dash() { if (typeof abbrState !== 'undefined' && abbrState.locked) return; abbrState.userInput += '-'; playDash(); const el = document.createElement('div'); el.className = 'fb-dash'; ad.vf.appendChild(el); ad.userMorse.textContent = morseVisual(abbrState.userInput); },
        delete: function() { if (typeof abbrDeleteLast === 'function') abbrDeleteLast(); },
        check:  function() { if (typeof checkAbbrLetter === 'function') checkAbbrLetter(); },
        skip:   function() { if (typeof abbrSkip === 'function') abbrSkip(); },
    });
}

function closeSettings() {
    dom.settingsPanel.classList.add('hidden');
    dom.overlay.classList.add('hidden');
}

/* ---------- INIT ---------- */
function init() {
    cacheDom();
    initParticles();
    buildRef();
    bindEvents();
    setNewChallenge();
    updateTypingScore();
    updateListenScore();
    if (typeof initAbbr === 'function') initAbbr();
    if (typeof initAnalytics === 'function') initAnalytics();
}
init();
