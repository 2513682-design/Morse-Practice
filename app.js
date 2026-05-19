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
        'tab-typing','tab-listening','tab-abbr','tab-test','typing-mode','listening-mode','abbr-mode','test-mode',
        'listen-streak','listen-correct','listen-total','listen-accuracy-ring','listen-accuracy-pct',
        'wave-visualizer','listen-morse-display','btn-play-morse','listen-speed',
        'listen-char-input','btn-listen-check','listen-history-list',
        'btn-start-test','test-intro','test-question-area','test-result-area','test-progress','test-score',
        'test-prompt','test-listen-prompt','test-typing-prompt','test-listen-input','test-char-display',
        'test-user-morse','test-visual-fb','btn-test-play','btn-test-submit','test-final-score','btn-test-retry','test-hint-space'];
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

// Anti-repetition system: shuffle bag + recent history buffer
let _shuffleBag = [];
let _recentHistory = [];
const RECENT_HISTORY_RATIO = 3; // avoid last pool.length/3 chars

function randChar(exclude = '') {
    const pool = getPool();
    const histLen = Math.max(Math.floor(pool.length / RECENT_HISTORY_RATIO), 1);

    // Refill bag if empty or pool changed
    if (_shuffleBag.length === 0 || _shuffleBag.some(c => !pool.includes(c))) {
        _shuffleBag = [...pool];
        // Fisher-Yates shuffle
        for (let i = _shuffleBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [_shuffleBag[i], _shuffleBag[j]] = [_shuffleBag[j], _shuffleBag[i]];
        }
    }

    // Pick from bag, skip if in recent history or is exclude
    let picked = null;
    for (let attempt = 0; attempt < _shuffleBag.length; attempt++) {
        const candidate = _shuffleBag[attempt];
        if (candidate !== exclude && !_recentHistory.includes(candidate)) {
            picked = candidate;
            _shuffleBag.splice(attempt, 1);
            break;
        }
    }

    // Fallback: just take first non-exclude
    if (!picked) {
        const idx = _shuffleBag.findIndex(c => c !== exclude);
        picked = _shuffleBag.splice(idx >= 0 ? idx : 0, 1)[0] || pool[0];
    }

    // Update history buffer
    _recentHistory.push(picked);
    while (_recentHistory.length > histLen) _recentHistory.shift();

    return picked;
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
    dom.tabTest.classList.toggle('active', tab === 'test');
    
    dom.typingMode.classList.toggle('active', tab === 'typing');
    dom.listeningMode.classList.toggle('active', tab === 'listening');
    dom.abbrMode.classList.toggle('active', tab === 'abbr');
    dom.testMode.classList.toggle('active', tab === 'test');
    
    if (tab === 'typing') setNewChallenge();
    else if (tab === 'listening') setNewListenChallenge();
    else if (tab === 'abbr') { if(typeof setNewAbbrChallenge==='function') setNewAbbrChallenge(); }
    else if (tab === 'test') { resetTestUI(); }
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
    dom.tabTest.addEventListener('click', () => switchTab('test'));

    dom.btnStartTest.addEventListener('click', startTest);
    dom.btnTestRetry.addEventListener('click', resetTestUI);
    dom.btnTestSubmit.addEventListener('click', checkTestAnswer);
    dom.btnTestPlay.addEventListener('click', () => playMorseAudio(MORSE_CODE[testState.questions[testState.currentIndex].char]));

    // Keyboard
    document.addEventListener('keydown', e => {
        // Skip if user is typing in an input (except listening input) or auth modal is open
        const activeEl = document.activeElement;
        const tag = activeEl?.tagName;
        const isListenInput = activeEl === dom.listenCharInput || activeEl === dom.testListenInput;
        if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !isListenInput) return;
        if (!document.getElementById('auth-modal')?.classList.contains('hidden')) return;

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
        } else if (state.tab === 'test') {
            if (activeEl === dom.testListenInput && e.key === 'Enter') { e.preventDefault(); checkTestAnswer(); return; }
            if (testState.isActive && !state.locked) {
                const isTyping = testState.questions[testState.currentIndex].type === 'typing';
                if (isTyping) {
                    if (e.code === 'Space') testHandleSpaceDown(e);
                    else if (e.code === 'Enter') { e.preventDefault(); checkTestAnswer(); }
                    else if (e.code === 'Backspace') { e.preventDefault(); testDeleteLastInput(); }
                } else {
                    if (e.code === 'Enter') { e.preventDefault(); checkTestAnswer(); }
                    else if (e.code === 'KeyR') { e.preventDefault(); playMorseAudio(MORSE_CODE[testState.questions[testState.currentIndex].char]); }
                }
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
        if (state.tab === 'test' && e.code === 'Space') testHandleSpaceUp(e);
    });
    window.addEventListener('keydown', e => { if (e.code === 'Space' && (state.tab === 'typing' || state.tab === 'abbr' || (state.tab === 'test' && testState.isActive && testState.questions[testState.currentIndex].type === 'typing'))) e.preventDefault(); });

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
        _shuffleBag = []; _recentHistory = []; // reset anti-repetition
        $$('.radio-item[data-charset]').forEach(el => el.classList.toggle('active', el.dataset.charset === state.charset));
        if (state.tab === 'typing') setNewChallenge();
        else if (state.tab === 'listening') setNewListenChallenge();
    }));

    // Hint toggle
    dom.toggleHint.addEventListener('change', () => {
        state.hintVisible = dom.toggleHint.checked;
        dom.morseHint.classList.toggle('visible', state.hintVisible);
    });

    // Morse reference toggle in settings
    const toggleMorseRef = document.getElementById('toggle-morse-ref');
    const morseRefPanel = document.getElementById('morse-ref-panel');
    if (toggleMorseRef && morseRefPanel) {
        toggleMorseRef.addEventListener('change', () => {
            morseRefPanel.classList.toggle('hidden', !toggleMorseRef.checked);
            if (toggleMorseRef.checked) buildSettingsMorseRef();
        });
    }

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

/* ---------- SETTINGS MORSE REFERENCE ---------- */
function buildSettingsMorseRef() {
    const grid = document.getElementById('settings-morse-ref');
    if (!grid || grid.children.length > 0) return; // only build once
    Object.entries(MORSE_CODE).forEach(([c, m]) => {
        const el = document.createElement('div');
        el.className = 'settings-ref-item';
        el.innerHTML = `<span class="settings-ref-char">${c}</span><span class="settings-ref-morse">${morseVisual(m)}</span>`;
        grid.appendChild(el);
    });
}

/* ---------- AUTO EXERCISE MODE ---------- */
const autoExerciseState = {
    isActive: false,
    mode: null,
    questions: [],
    currentIndex: 0
};

function generateAutoExercise(mode, length = 10) {
    if (mode !== 'typing' && mode !== 'listening') return [];
    const pool = getPool();
    const queue = [];
    for (let i = 0; i < length; i++) {
        queue.push({
            id: i + 1,
            character: pool[Math.floor(Math.random() * pool.length)],
            mode: mode
        });
    }
    return queue;
}

function toggleAutoExercise() {
    // Only support typing and listening tabs
    if (state.tab !== 'typing' && state.tab !== 'listening') {
        showFlash('Chỉ hỗ trợ Luyện gõ và Luyện nghe');
        return;
    }

    const mode = state.tab;

    if (autoExerciseState.isActive && autoExerciseState.mode === mode) {
        // Turn off
        autoExerciseState.isActive = false;
        autoExerciseState.mode = null;
        autoExerciseState.questions = [];
        autoExerciseState.currentIndex = 0;
        dom.btnAutoExercise.classList.remove('active');
        showFlash('Đã tắt Tạo bài tập tự động');
        
        // Reset to normal random mode
        if (mode === 'typing') setNewChallenge();
        else setNewListenChallenge();
    } else {
        // Turn on
        autoExerciseState.mode = mode;
        autoExerciseState.questions = generateAutoExercise(mode, 10);
        autoExerciseState.currentIndex = 0;
        autoExerciseState.isActive = true;
        dom.btnAutoExercise.classList.add('active');
        showFlash(`Bắt đầu bài tập tự động: 10 câu (${mode === 'typing' ? 'Luyện gõ' : 'Luyện nghe'})`);
        
        // Start first question of the generated exercise
        playNextAutoExerciseQuestion();
    }
}

function playNextAutoExerciseQuestion() {
    if (!autoExerciseState.isActive) return;
    
    if (autoExerciseState.currentIndex >= autoExerciseState.questions.length) {
        showFlash('Hoàn thành bài tập tự động!');
        toggleAutoExercise(); // turn off
        return;
    }

    const q = autoExerciseState.questions[autoExerciseState.currentIndex];
    
    if (q.mode === 'typing') {
        state.currentChar = q.character;
        state.currentMorse = MORSE_CODE[q.character];
        state.userInput = '';
        state.locked = false;
        dom.userMorse.textContent = '';
        dom.visualFeedback.innerHTML = '';
        dom.charDisplay.textContent = q.character;
        dom.morseHint.textContent = morseVisual(state.currentMorse);
        dom.morseHint.classList.toggle('visible', state.hintVisible);
        dom.charDisplay.classList.remove('correct', 'wrong');
        dom.morseInputDisplay.classList.remove('correct-flash', 'wrong-flash');
        highlightRef(q.character);
    } else if (q.mode === 'listening') {
        state.listenChar = q.character;
        state.listenMorse = MORSE_CODE[q.character];
        state.listenRevealed = false;
        state.locked = false;
        dom.listenMorseDisplay.textContent = '—';
        dom.listenMorseDisplay.classList.remove('revealed');
        dom.listenCharInput.value = '';
        dom.listenCharInput.classList.remove('correct-flash', 'wrong-flash');
        resetWave();
        highlightRef(q.character);
        setTimeout(() => playMorseAudio(state.listenMorse), 400);
    }
}

// Hook into existing success flow (override/intercept)
const originalCheckTyping = checkTyping;
checkTyping = function() {
    if (autoExerciseState.isActive && autoExerciseState.mode === 'typing') {
        if (!state.userInput || state.locked) return;
        state.locked = true;
        const ok = state.userInput === state.currentMorse;
        if (ok) {
            dom.charDisplay.classList.add('correct');
            dom.morseInputDisplay.classList.add('correct-flash');
            showFlash('success'); playSuccess();
            autoExerciseState.currentIndex++;
            setTimeout(playNextAutoExerciseQuestion, 600);
        } else {
            dom.charDisplay.classList.add('wrong');
            dom.morseInputDisplay.classList.add('wrong-flash');
            showFlash('error'); playError();
            dom.morseHint.textContent = morseVisual(state.currentMorse);
            dom.morseHint.classList.add('visible');
            setTimeout(() => { state.locked = false; state.userInput = ''; dom.userMorse.textContent = ''; dom.visualFeedback.innerHTML = ''; dom.charDisplay.classList.remove('wrong'); dom.morseInputDisplay.classList.remove('wrong-flash'); }, 1200);
        }
    } else {
        originalCheckTyping();
    }
};

const originalCheckListening = checkListening;
checkListening = function() {
    if (autoExerciseState.isActive && autoExerciseState.mode === 'listening') {
        if (state.locked || !state.listenChar) return;
        const val = dom.listenCharInput.value.trim().toUpperCase();
        if (!val) return;
        state.locked = true;
        const ok = val === state.listenChar;
        if (ok) {
            dom.listenCharInput.classList.add('correct-flash');
            showFlash('success'); playSuccess();
            autoExerciseState.currentIndex++;
            setTimeout(playNextAutoExerciseQuestion, 600);
        } else {
            dom.listenCharInput.classList.add('wrong-flash');
            showFlash('error'); playError();
            state.listenRevealed = true;
            dom.listenMorseDisplay.textContent = morseVisual(state.listenMorse);
            dom.listenMorseDisplay.classList.add('revealed');
            setTimeout(() => { state.locked = false; dom.listenCharInput.value = ''; dom.listenCharInput.classList.remove('wrong-flash'); }, 1500);
        }
    } else {
        originalCheckListening();
    }
};


/* ---------- TEST MODE (KIỂM TRA) ---------- */
const testState = {
    isActive: false,
    questions: [],
    currentIndex: 0,
    score: 0,
};

function generateTestQuestions(length = 15) {
    const pool = getPool();
    const q = [];
    for (let i = 0; i < length; i++) {
        // 50% typing, 50% listening
        const type = Math.random() > 0.5 ? 'typing' : 'listening';
        q.push({
            char: pool[Math.floor(Math.random() * pool.length)],
            type: type
        });
    }
    return q;
}

function startTest() {
    testState.isActive = true;
    testState.questions = generateTestQuestions(15);
    testState.currentIndex = 0;
    testState.score = 0;
    
    dom.testIntro.classList.add('hidden');
    dom.testResultArea.classList.add('hidden');
    dom.testQuestionArea.classList.remove('hidden');
    
    updateTestScoreUI();
    showTestQuestion();
}

function resetTestUI() {
    testState.isActive = false;
    dom.testIntro.classList.remove('hidden');
    dom.testQuestionArea.classList.add('hidden');
    dom.testResultArea.classList.add('hidden');
    dom.testProgress.textContent = '0';
    dom.testScore.textContent = '0';
    state.locked = false;
}

function updateTestScoreUI() {
    dom.testProgress.textContent = (testState.currentIndex + 1);
    dom.testScore.textContent = testState.score;
}

function showTestQuestion() {
    if (testState.currentIndex >= testState.questions.length) {
        finishTest();
        return;
    }
    
    const q = testState.questions[testState.currentIndex];
    state.locked = false;
    updateTestScoreUI();
    
    if (q.type === 'typing') {
        dom.testPrompt.textContent = 'Gõ mã Morse cho ký tự:';
        dom.testListenPrompt.classList.add('hidden');
        dom.testTypingPrompt.classList.remove('hidden');
        dom.testHintSpace.classList.remove('hidden');
        
        dom.testCharDisplay.textContent = q.char;
        state.userInput = '';
        dom.testUserMorse.textContent = '';
        dom.testVisualFb.innerHTML = '';
        dom.testCharDisplay.classList.remove('correct', 'wrong');
        dom.testUserMorse.classList.remove('correct-flash', 'wrong-flash');
    } else {
        dom.testPrompt.textContent = 'Nghe và nhập ký tự:';
        dom.testListenPrompt.classList.remove('hidden');
        dom.testTypingPrompt.classList.add('hidden');
        dom.testHintSpace.classList.add('hidden');
        
        dom.testListenInput.value = '';
        dom.testListenInput.classList.remove('correct-flash', 'wrong-flash');
        setTimeout(() => playMorseAudio(MORSE_CODE[q.char]), 400);
        dom.testListenInput.focus();
    }
}

function testHandleSpaceDown(e) {
    if (state.locked || state.isHolding) return;
    e.preventDefault(); state.isHolding = true; state.holdStartTime = performance.now();
    dom.testUserMorse.classList.add('focused');
}
function testHandleSpaceUp(e) {
    if (!state.isHolding) return;
    e.preventDefault(); state.isHolding = false;
    const dur = performance.now() - state.holdStartTime;
    const dash = dur >= state.holdThreshold;
    state.userInput += dash ? '-' : '.';
    if (dash) playDash(); else playDot();
    
    const fb = document.createElement('div');
    fb.className = dash ? 'fb-dash' : 'fb-dot';
    dom.testVisualFb.appendChild(fb);
    
    dom.testUserMorse.textContent = morseVisual(state.userInput);
    dom.testUserMorse.classList.remove('focused');
}
function testDeleteLastInput() {
    if (state.userInput.length > 0 && !state.locked) {
        state.userInput = state.userInput.slice(0, -1);
        dom.testUserMorse.textContent = morseVisual(state.userInput);
        if (dom.testVisualFb.lastChild) dom.testVisualFb.removeChild(dom.testVisualFb.lastChild);
    }
}

function checkTestAnswer() {
    if (state.locked || !testState.isActive) return;
    const q = testState.questions[testState.currentIndex];
    const correctMorse = MORSE_CODE[q.char];
    let isCorrect = false;

    if (q.type === 'typing') {
        if (!state.userInput) return;
        state.locked = true;
        isCorrect = state.userInput === correctMorse;
        
        if (isCorrect) {
            dom.testCharDisplay.classList.add('correct');
            dom.testUserMorse.classList.add('correct-flash');
            showFlash('success'); playSuccess();
            testState.score++;
        } else {
            dom.testCharDisplay.classList.add('wrong');
            dom.testUserMorse.classList.add('wrong-flash');
            showFlash('error'); playError();
        }
    } else {
        const val = dom.testListenInput.value.trim().toUpperCase();
        if (!val) return;
        state.locked = true;
        isCorrect = val === q.char;
        
        if (isCorrect) {
            dom.testListenInput.classList.add('correct-flash');
            showFlash('success'); playSuccess();
            testState.score++;
        } else {
            dom.testListenInput.classList.add('wrong-flash');
            showFlash('error'); playError();
            dom.testListenInput.value = `${val} (Sai, phải là ${q.char})`;
        }
    }
    
    updateTestScoreUI();
    testState.currentIndex++;
    setTimeout(showTestQuestion, isCorrect ? 800 : 1500);
}

function finishTest() {
    dom.testQuestionArea.classList.add('hidden');
    dom.testResultArea.classList.remove('hidden');
    dom.testFinalScore.textContent = `${testState.score}/${testState.questions.length}`;
    testState.isActive = false;
    
    // Save to Firestore if auth is available
    if (typeof db !== 'undefined' && auth && auth.currentUser) {
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        db.collection('users').doc(auth.currentUser.uid).collection('testResults').add({
            score: testState.score,
            total: testState.questions.length,
            date: timestamp
        }).catch(err => console.error("Lỗi lưu kết quả test:", err));
    }
}


/* ---------- INIT ---------- */
function init() {
    cacheDom();
    
    // Add missing dom reference for auto exercise button
    dom.btnAutoExercise = document.getElementById('btn-auto-exercise');
    dom.btnAutoExercise?.addEventListener('click', toggleAutoExercise);

    initParticles();
    buildRef();
    bindEvents();
    setNewChallenge();
    updateTypingScore();
    updateListenScore();
    if (typeof initAbbr === 'function') initAbbr();
    if (typeof initAnalytics === 'function') initAnalytics();
    if (typeof initAuth === 'function') initAuth();
}
init();
