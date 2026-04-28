/* ============================================================
   MORSE TRAINER — Error Detection & Analytics Engine
   ============================================================ */

/* ---------- DATA STORE ---------- */
const Analytics = {
    // Per-char TYPING stats: { total, errors, errorMap: { wrongMorse: count } }
    charStats: {},

    // Error type counters (typing/abbr modes)
    errorTypes: {
        extraDot:0, extraDash:0, missDot:0, missDash:0,
        dotForDash:0, dashForDot:0, tooShort:0, tooLong:0,
    },

    // Typing confusion pairs: 'A→N': count
    confusionPairs: {},

    // LISTENING stats: { char: { total, errors, guessMap: { guessedChar: count } } }
    listenStats: {},

    // Listening confusion pairs: 'A→N': count  (heard A, typed N)
    listenConfusions: {},

    // Session timeline: { ts, char, ok, mode:'type'|'listen'|'abbr' }
    sessionLog: [],
};

/* ---------- KNOWN CONFUSION PAIRS ---------- */
// Các cặp dễ nhầm lẫn nổi tiếng trong Morse
const KNOWN_CONFUSIONS = [
    ['A','N'],['E','T'],['I','S'],['M','O'],
    ['R','L'],['D','B'],['G','W'],['K','C'],
    ['U','V'],['F','L'],['P','X'],['Y','Q'],
    ['H','S'],['5','H'],['6','B'],['7','G'],
    ['8','O'],['4','V'],
];

/* ---------- RECORD TYPING ATTEMPT ---------- */
function recordAttempt(char, correctMorse, userMorse, isCorrect) {
    if (!char || !correctMorse) return;
    if (!Analytics.charStats[char]) Analytics.charStats[char] = { total:0, errors:0, errorMap:{} };
    const cs = Analytics.charStats[char];
    cs.total++;
    Analytics.sessionLog.push({ ts:Date.now(), char, ok:isCorrect, mode:'type' });
    if (!isCorrect) {
        cs.errors++;
        if (userMorse) {
            cs.errorMap[userMorse] = (cs.errorMap[userMorse]||0)+1;
            detectErrorType(correctMorse, userMorse);
            detectConfusion(char, userMorse);
        }
    }
    saveAnalytics();
}

/* ---------- RECORD LISTENING ATTEMPT ---------- */
function recordListenAttempt(char, correctMorse, typedChar, isCorrect) {
    if (!char) return;
    if (!Analytics.listenStats[char]) Analytics.listenStats[char] = { total:0, errors:0, guessMap:{} };
    const ls = Analytics.listenStats[char];
    ls.total++;
    Analytics.sessionLog.push({ ts:Date.now(), char, ok:isCorrect, mode:'listen' });
    if (!isCorrect && typedChar && typedChar !== char) {
        ls.errors++;
        ls.guessMap[typedChar] = (ls.guessMap[typedChar]||0)+1;
        // Listening confusion: heard char, guessed typedChar
        const key = char+'→'+typedChar;
        Analytics.listenConfusions[key] = (Analytics.listenConfusions[key]||0)+1;
        // Also feed typing confusion detection for shared heatmap
        Analytics.charStats[char] = Analytics.charStats[char] || { total:0, errors:0, errorMap:{} };
    }
    saveAnalytics();
}

/* ---------- DETECT ERROR TYPE ---------- */
function detectErrorType(correct, user) {
    const et = Analytics.errorTypes;
    const cLen = correct.length, uLen = user.length;

    if (uLen < cLen) et.tooShort++;
    else if (uLen > cLen) et.tooLong++;

    // Symbol-level diff (align by min length)
    const minLen = Math.min(cLen, uLen);
    for (let i = 0; i < minLen; i++) {
        if (correct[i] === '.' && user[i] === '-') et.dashForDot++;
        if (correct[i] === '-' && user[i] === '.') et.dotForDash++;
    }

    // Count extra/missing per type
    const cDots  = (correct.match(/\./g) || []).length;
    const cDashs = (correct.match(/-/g)  || []).length;
    const uDots  = (user.match(/\./g)    || []).length;
    const uDashs = (user.match(/-/g)     || []).length;

    if (uDots  > cDots)  et.extraDot  += uDots  - cDots;
    if (uDots  < cDots)  et.missDot   += cDots  - uDots;
    if (uDashs > cDashs) et.extraDash += uDashs - cDashs;
    if (uDashs < cDashs) et.missDash  += cDashs - uDashs;
}

/* ---------- DETECT CONFUSION ---------- */
function detectConfusion(char, userMorse) {
    // Try to reverse-lookup what char they "typed"
    const typed = MORSE_TO_CHAR[userMorse];
    if (!typed || typed === char) return;

    const key = char + '→' + typed;
    Analytics.confusionPairs[key] = (Analytics.confusionPairs[key] || 0) + 1;
}

/* ---------- GET ERROR RATE ---------- */
function getErrorRate(char) {
    const cs = Analytics.charStats[char];
    if (!cs || cs.total === 0) return 0;
    return cs.errors / cs.total;
}

/* ---------- GET WEAKEST TYPING CHARS ---------- */
function getWeakestChars(n = 8) {
    return Object.entries(Analytics.charStats)
        .filter(([, cs]) => cs.total >= 2)
        .sort((a, b) => (b[1].errors/b[1].total) - (a[1].errors/a[1].total))
        .slice(0, n)
        .map(([char, cs]) => ({
            char,
            errorRate: Math.round(cs.errors/cs.total*100),
            total: cs.total, errors: cs.errors,
        }));
}

/* ---------- GET WEAKEST LISTENING CHARS ---------- */
function getWeakestListenChars(n = 8) {
    return Object.entries(Analytics.listenStats)
        .filter(([, ls]) => ls.total >= 2)
        .sort((a, b) => (b[1].errors/b[1].total) - (a[1].errors/a[1].total))
        .slice(0, n)
        .map(([char, ls]) => ({
            char,
            errorRate: Math.round(ls.errors/ls.total*100),
            total: ls.total, errors: ls.errors,
            // top misheard-as char
            topGuess: Object.entries(ls.guessMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || '?',
        }));
}

/* ---------- GET TOP TYPING CONFUSION PAIRS ---------- */
function getTopConfusions(n = 4) {
    return Object.entries(Analytics.confusionPairs)
        .sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([key, count]) => {
            const [from, to] = key.split('→');
            return { from, to, count, fromMorse:MORSE_CODE[from]||'', toMorse:MORSE_CODE[to]||'' };
        });
}

/* ---------- GET TOP LISTENING CONFUSION PAIRS ---------- */
function getTopListenConfusions(n = 5) {
    return Object.entries(Analytics.listenConfusions)
        .sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([key, count]) => {
            const [heard, typed] = key.split('→');
            return { heard, typed, count,
                heardMorse: MORSE_CODE[heard]||'',
                typedMorse: MORSE_CODE[typed]||'' };
        });
}

/* ---------- GET DOMINANT ERROR TYPES ---------- */
function getDominantErrors(n = 3) {
    const labels = {
        dotForDash:  { label: 'Gõ · thay vì —',  icon: '·→—', tip: 'Hãy giữ phím lâu hơn để tạo dấu gạch' },
        dashForDot:  { label: 'Gõ — thay vì ·',  icon: '—→·', tip: 'Hãy nhấn nhanh hơn để tạo dấu chấm' },
        tooShort:    { label: 'Nhập thiếu ký hiệu', icon: '⊘',  tip: 'Đếm kỹ số ký hiệu trước khi Enter' },
        tooLong:     { label: 'Nhập thừa ký hiệu', icon: '+',  tip: 'Dừng lại và kiểm tra trước khi Enter' },
        extraDot:    { label: 'Thêm · dư',         icon: '·+', tip: 'Chú ý số dấu chấm trong mã' },
        extraDash:   { label: 'Thêm — dư',         icon: '—+', tip: 'Chú ý số dấu gạch trong mã' },
        missDot:     { label: 'Thiếu ·',           icon: '·-', tip: 'Mã cần nhiều dấu chấm hơn' },
        missDash:    { label: 'Thiếu —',           icon: '—-', tip: 'Mã cần nhiều dấu gạch hơn' },
    };
    return Object.entries(Analytics.errorTypes)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key, count]) => ({ ...labels[key], key, count }));
}

/* ---------- BUILD SUGGESTIONS ---------- */
function buildSuggestions() {
    const tips = [];
    const totalAttempts = Analytics.sessionLog.length;
    if (totalAttempts < 5) {
        return [{ priority:0, icon:'🎯', title:'Hãy luyện thêm!',
            desc:'Cần ít nhất 5 lần thử để phân tích lỗi của bạn.' }];
    }

    // Recent trend (all modes)
    const last20 = Analytics.sessionLog.slice(-20);
    const recentRate = last20.filter(l=>l.ok).length / last20.length;
    if (recentRate > 0.85)
        tips.push({ priority:10, icon:'🔥', title:'Đang tiến bộ tốt!',
            desc:`${Math.round(recentRate*100)}% đúng trong 20 lần gần nhất. Thử chế độ nhanh hơn hoặc luyện viết tắt!` });
    else if (recentRate < 0.5)
        tips.push({ priority:9, icon:'⚡', title:'Cần cải thiện',
            desc:'Dưới 50% gần đây. Bật gợi ý Morse trong Cài đặt, luyện chậm lại.' });

    // Typing error types
    getDominantErrors(3).forEach(e => {
        if (e?.count >= 2)
            tips.push({ priority:8, icon:'🔎', title:e.label, desc:e.tip+` (${e.count} lần)` });
    });

    // Typing weak chars
    const weak = getWeakestChars(6);
    if (weak.length > 0)
        tips.push({ priority:7, icon:'⌨️', title:'Gõ yếu: '+weak.slice(0,3).map(w=>`${w.char}(${w.errorRate}%)`).join(', '),
            desc:'Hãy dành thêm thời gian luyện những ký tự này trong chế độ Luyện gõ.' });
    weak.slice(0,2).forEach(w => {
        if (w.errorRate >= 60)
            tips.push({ priority:6, icon:'🎓', title:`Gõ ${w.char} = ${morseVisual(MORSE_CODE[w.char]||'')}`,
                desc:`Sai ${w.errors}/${w.total} lần (${w.errorRate}%). Nhớ mã: ${morseVisual(MORSE_CODE[w.char]||'')}.` });
    });

    // Typing confusions
    getTopConfusions(2).forEach(c => {
        if (c.count >= 2)
            tips.push({ priority:5, icon:'🔀', title:`Gõ nhầm ${c.from}↔${c.to}`,
                desc:`${c.from}=${morseVisual(c.fromMorse)} vs ${c.to}=${morseVisual(c.toMorse)}. Nhầm ${c.count} lần.` });
    });

    // Listening weak chars
    const listenWeak = getWeakestListenChars(6);
    if (listenWeak.length > 0)
        tips.push({ priority:7, icon:'👂', title:'Nghe yếu: '+listenWeak.slice(0,3).map(w=>`${w.char}(${w.errorRate}%)`).join(', '),
            desc:'Những ký tự này khó nhận ra khi nghe. Dùng tốc độ Chậm để luyện lại.' });
    listenWeak.slice(0,2).forEach(w => {
        if (w.errorRate >= 60)
            tips.push({ priority:6, icon:'🔊', title:`Nghe ${w.char} = ${morseVisual(MORSE_CODE[w.char]||'')}`,
                desc:`Hay nhầm với "${w.topGuess}". Nghe lại nhiều lần ở tốc độ Chậm.` });
    });

    // Listening confusions
    getTopListenConfusions(2).forEach(c => {
        if (c.count >= 2)
            tips.push({ priority:5, icon:'👂', title:`Nghe nhầm ${c.heard}→${c.typed}`,
                desc:`Nghe ${c.heard}(${morseVisual(c.heardMorse)}) nhưng đoán ${c.typed}(${morseVisual(c.typedMorse)}). Nhầm ${c.count} lần.` });
    });

    // Known confusions (proactive)
    KNOWN_CONFUSIONS.forEach(([a,b]) => {
        const csA=Analytics.charStats[a], csB=Analytics.charStats[b];
        if (csA?.errors>0 && csB?.errors>0)
            tips.push({ priority:4, icon:'⚠️', title:`Cặp dễ nhầm: ${a}&${b}`,
                desc:`${a}=${morseVisual(MORSE_CODE[a])} vs ${b}=${morseVisual(MORSE_CODE[b])}. Cặp kinh điển hay bị nhầm!` });
    });

    // Timing tip
    const et = Analytics.errorTypes;
    if (et.dotForDash+et.dashForDot > 5)
        tips.push({ priority:3, icon:'⏱️', title:'Điều chỉnh ngưỡng giữ phím',
            desc:'Nhầm · và — nhiều. Thử điều chỉnh ngưỡng trong Cài đặt.' });

    // Cross-mode tip
    const typeLogs  = Analytics.sessionLog.filter(l=>l.mode==='type').length;
    const listenLogs = Analytics.sessionLog.filter(l=>l.mode==='listen').length;
    if (typeLogs > 20 && listenLogs < 5)
        tips.push({ priority:3, icon:'🎧', title:'Thử luyện nghe!',
            desc:'Bạn đã luyện gõ nhiều. Hãy thử chế độ Luyện nghe để rèn khả năng nhận âm.' });
    if (listenLogs > 20 && typeLogs < 5)
        tips.push({ priority:3, icon:'⌨️', title:'Thử luyện gõ!',
            desc:'Bạn đã luyện nghe nhiều. Hãy thử chế độ Luyện gõ để rèn tay.' });

    if (totalAttempts >= 50)
        tips.push({ priority:2, icon:'🏆', title:`${totalAttempts} lần thử!`,
            desc:'Bạn đã luyện rất chăm chỉ. Tiếp tục phát huy!' });

    return tips.sort((a,b)=>b.priority-a.priority).slice(0,6);
}

/* ---------- PERSIST / RESTORE ---------- */
function saveAnalytics() {
    try {
        localStorage.setItem('morseAnalytics', JSON.stringify({
            charStats: Analytics.charStats,
            errorTypes: Analytics.errorTypes,
            confusionPairs: Analytics.confusionPairs,
            listenStats: Analytics.listenStats,
            listenConfusions: Analytics.listenConfusions,
        }));
    } catch(e) {}
}

function loadAnalytics() {
    try {
        const raw = localStorage.getItem('morseAnalytics');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.charStats)      Object.assign(Analytics.charStats, data.charStats);
        if (data.errorTypes)     Object.assign(Analytics.errorTypes, data.errorTypes);
        if (data.confusionPairs) Object.assign(Analytics.confusionPairs, data.confusionPairs);
        if (data.listenStats)    Object.assign(Analytics.listenStats, data.listenStats);
        if (data.listenConfusions) Object.assign(Analytics.listenConfusions, data.listenConfusions);
    } catch(e) {}
}

function resetAnalytics() {
    Analytics.charStats = {};
    Analytics.errorTypes = { extraDot:0,extraDash:0,missDot:0,missDash:0,dotForDash:0,dashForDot:0,tooShort:0,tooLong:0 };
    Analytics.confusionPairs = {};
    Analytics.listenStats = {};
    Analytics.listenConfusions = {};
    Analytics.sessionLog = [];
    localStorage.removeItem('morseAnalytics');
    renderAnalyticsPanel();
}

/* ---------- RENDER PANEL ---------- */
function renderAnalyticsPanel() {
    const panel = document.getElementById('analytics-panel');
    if (!panel) return;
    const body = panel.querySelector('#analytics-body');
    if (!body) return;

    const suggestions = buildSuggestions();
    const weak = getWeakestChars(18);
    const confusions = getTopConfusions(6);
    const totalAttempts = Analytics.sessionLog.length;
    const totalCorrect  = Analytics.sessionLog.filter(l => l.ok).length;
    const overallAcc    = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0;
    const practicedCount = Object.keys(Analytics.charStats).length;

    body.innerHTML = `
    <!-- COL 1: Overview + Suggestions -->
    <div class="an-section an-col-1">
        <div class="an-section-title">📈 Tổng quan phiên luyện</div>
        <div class="an-overview">
            <div class="an-stat">
                <span class="an-stat-val">${totalAttempts}</span>
                <span class="an-stat-lbl">Lần thử</span>
            </div>
            <div class="an-stat">
                <span class="an-stat-val ${overallAcc>=80?'good':overallAcc>=50?'mid':'bad'}">${overallAcc}%</span>
                <span class="an-stat-lbl">Chính xác</span>
            </div>
            <div class="an-stat">
                <span class="an-stat-val">${practicedCount}</span>
                <span class="an-stat-lbl">Ký tự</span>
            </div>
        </div>
        <div class="an-section-title" style="margin-top:4px">💡 Gợi ý cá nhân hoá</div>
        <div class="an-suggestions">
            ${suggestions.map(s => `
            <div class="an-tip">
                <span class="an-tip-icon">${s.icon}</span>
                <div class="an-tip-body">
                    <div class="an-tip-title">${s.title}</div>
                    <div class="an-tip-desc">${s.desc}</div>
                </div>
            </div>`).join('')}
        </div>
    </div>

    <!-- COL 2: Heatmap + Confusion pairs -->
    <div class="an-section an-col-2">
        <div class="an-section-title">🔥 Bản đồ nhiệt ký tự yếu</div>
        ${weak.length > 0
          ? `<div class="an-heatmap">
            ${weak.map(w => {
                const lvl = w.errorRate >= 70 ? 'hot' : w.errorRate >= 40 ? 'warm' : 'cool';
                return `<div class="an-heat-cell ${lvl}" title="${w.char}: ${w.errorRate}% sai (${w.errors}/${w.total})">
                    <span class="an-heat-char">${w.char}</span>
                    <span class="an-heat-rate">${w.errorRate}%</span>
                </div>`;
            }).join('')}
          </div>`
          : '<div class="an-empty">Chưa đủ dữ liệu để hiển thị.</div>'}

        <div class="an-section-title" style="margin-top:8px">🔀 Cặp ký tự hay nhầm</div>
        ${confusions.length > 0
          ? `<div class="an-confusions">
            ${confusions.map(c => `
            <div class="an-conf-row">
                <div class="an-conf-pair">
                    <span class="an-conf-char">${c.from}</span>
                    <span class="an-conf-arrow">→</span>
                    <span class="an-conf-char wrong">${c.to}</span>
                </div>
                <div class="an-conf-detail">
                    <span class="an-conf-morse">${morseVisual(c.fromMorse)}</span>
                    <span class="an-conf-sep">vs</span>
                    <span class="an-conf-morse dim">${morseVisual(c.toMorse)}</span>
                </div>
                <div class="an-conf-count">${c.count}×</div>
            </div>`).join('')}
          </div>`
          : '<div class="an-empty">Chưa phát hiện cặp nhầm lẫn.</div>'}
    </div>

    <!-- COL 3: Typing errors + Listening analytics -->
    <div class="an-section an-col-3">
        <div class="an-section-title">📊 Lỗi khi gõ (theo loại)</div>
        <div class="an-error-bars">${renderErrorBars()}</div>

        <div class="an-section-title" style="margin-top:10px">👂 Ký tự khó nghe nhất</div>
        ${(()=>{
            const lw = getWeakestListenChars(12);
            if (!lw.length) return '<div class="an-empty">Chưa có dữ liệu luyện nghe.</div>';
            return `<div class="an-heatmap">${lw.map(w=>{
                const lvl=w.errorRate>=70?'hot':w.errorRate>=40?'warm':'cool';
                return `<div class="an-heat-cell ${lvl}" title="${w.char}: nghe sai ${w.errorRate}% — hay nhầm với ${w.topGuess}">
                    <span class="an-heat-char">${w.char}</span>
                    <span class="an-heat-rate">${w.errorRate}%</span>
                </div>`;
            }).join('')}</div>`;
        })()}

        <div class="an-section-title" style="margin-top:10px">🔊 Nhầm khi nghe</div>
        ${(()=>{
            const lc = getTopListenConfusions(5);
            if (!lc.length) return '<div class="an-empty">Chưa phát hiện nhầm lẫn.</div>';
            return `<div class="an-confusions">${lc.map(c=>`
            <div class="an-conf-row">
                <div class="an-conf-pair">
                    <span class="an-conf-char">${c.heard}</span>
                    <span class="an-conf-arrow">→</span>
                    <span class="an-conf-char wrong">${c.typed}</span>
                </div>
                <div class="an-conf-detail">
                    <span class="an-conf-morse">${morseVisual(c.heardMorse)}</span>
                    <span class="an-conf-sep">vs</span>
                    <span class="an-conf-morse dim">${morseVisual(c.typedMorse)}</span>
                </div>
                <div class="an-conf-count">${c.count}×</div>
            </div>`).join('')}</div>`;
        })()}
    </div>

    <!-- FOOTER: full width -->
    <div class="an-footer">
        <button id="btn-reset-analytics" class="an-reset-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
            Xoá dữ liệu phân tích
        </button>
    </div>`;

    document.getElementById('btn-reset-analytics')?.addEventListener('click', () => {
        if (confirm('Xoá toàn bộ dữ liệu phân tích?')) resetAnalytics();
    });
}

function renderErrorBars() {
    const et = Analytics.errorTypes;
    const labels = {
        dotForDash: '· → —', dashForDot: '— → ·',
        tooShort: 'Thiếu ký hiệu', tooLong: 'Thừa ký hiệu',
        extraDot: '· thừa', missDot: '· thiếu',
        extraDash: '— thừa', missDash: '— thiếu',
    };
    const max = Math.max(...Object.values(et), 1);
    return Object.entries(et)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([key, val]) => {
            const pct = Math.round(val / max * 100);
            return `<div class="an-bar-row">
                <span class="an-bar-lbl">${labels[key]}</span>
                <div class="an-bar-track">
                    <div class="an-bar-fill" style="width:${pct}%"></div>
                </div>
                <span class="an-bar-val">${val}</span>
            </div>`;
        }).join('') || '<div class="an-empty">Chưa có dữ liệu lỗi.</div>';
}

/* ---------- INIT ---------- */
function initAnalytics() {
    loadAnalytics();

    // Wire open/close button
    const btnOpen  = document.getElementById('btn-analytics');
    const panel    = document.getElementById('analytics-panel');
    const overlay  = document.getElementById('overlay');
    const btnClose = document.getElementById('close-analytics');

    if (btnOpen) btnOpen.addEventListener('click', () => {
        renderAnalyticsPanel();
        panel.classList.remove('hidden');
        overlay.classList.remove('hidden');
    });
    if (btnClose) btnClose.addEventListener('click', closeAnalyticsPanel);
    overlay?.addEventListener('click', closeAnalyticsPanel);
}

function closeAnalyticsPanel() {
    document.getElementById('analytics-panel')?.classList.add('hidden');
    // Only hide overlay if no other panel open
    const settingsOpen = !document.getElementById('settings-panel')?.classList.contains('hidden');
    if (!settingsOpen) {
        document.getElementById('overlay')?.classList.add('hidden');
    }
}
