/* Abbreviations Mode Logic */
const ABBREVIATIONS=[
{abbr:'CQ',meaning:'Gọi tất cả các trạm'},{abbr:'DE',meaning:'Từ (người gửi)'},
{abbr:'K',meaning:'Mời phát (Over)'},{abbr:'SK',meaning:'Kết thúc liên lạc'},
{abbr:'AR',meaning:'Kết thúc bản tin'},{abbr:'BT',meaning:'Ngắt / Tạm dừng'},
{abbr:'SOS',meaning:'Tín hiệu cầu cứu'},{abbr:'73',meaning:'Lời chào thân ái'},
{abbr:'88',meaning:'Yêu thương và hôn'},{abbr:'QTH',meaning:'Vị trí của tôi là...'},
{abbr:'QSL',meaning:'Xác nhận đã nhận'},{abbr:'QRZ',meaning:'Ai đang gọi?'},
{abbr:'QRM',meaning:'Bị nhiễu sóng'},{abbr:'QRN',meaning:'Nhiễu tĩnh điện'},
{abbr:'QSO',meaning:'Cuộc liên lạc'},{abbr:'QRS',meaning:'Phát chậm hơn'},
{abbr:'QRQ',meaning:'Phát nhanh hơn'},{abbr:'RST',meaning:'Báo cáo tín hiệu'},
{abbr:'TNX',meaning:'Cảm ơn'},{abbr:'UR',meaning:'Của bạn'},
{abbr:'R',meaning:'Đã nhận / Roger'},{abbr:'AGN',meaning:'Nhắc lại'},
{abbr:'PSE',meaning:'Xin vui lòng'},{abbr:'HW',meaning:'Như thế nào'},
{abbr:'WX',meaning:'Thời tiết'},{abbr:'ES',meaning:'Và'},
{abbr:'FB',meaning:'Tốt lắm (Fine Business)'},{abbr:'GM',meaning:'Chào buổi sáng'},
{abbr:'GE',meaning:'Chào buổi tối'},{abbr:'GA',meaning:'Chào buổi chiều'},
{abbr:'GN',meaning:'Chúc ngủ ngon'},{abbr:'CUL',meaning:'Hẹn gặp lại'},
{abbr:'OM',meaning:'Bạn (Old Man)'},{abbr:'YL',meaning:'Cô gái trẻ'},
{abbr:'XYL',meaning:'Vợ'},{abbr:'HPE',meaning:'Hy vọng'},
{abbr:'MSG',meaning:'Tin nhắn'},{abbr:'RPT',meaning:'Nhắc lại'},
{abbr:'PWR',meaning:'Công suất'},{abbr:'ANT',meaning:'Ăng-ten'}
];

const abbrState={
    current:null,letterIdx:0,userInput:'',
    streak:0,correct:0,total:0,locked:false,
    isHolding:false,holdStartTime:0,holdAnimFrame:null
};

function abbrDom(){return{
    word:$('#abbr-word'),meaning:$('#abbr-meaning'),letters:$('#abbr-letters'),
    hint:$('#abbr-hint'),inputDisplay:$('#abbr-input-display'),
    userMorse:$('#abbr-user-morse'),vf:$('#abbr-visual-feedback'),
    holdInd:$('#abbr-hold-indicator'),holdBar:$('#abbr-hold-bar'),
    streak:$('#abbr-streak'),correct:$('#abbr-correct'),total:$('#abbr-total'),
    ring:$('#abbr-accuracy-ring'),pct:$('#abbr-accuracy-pct'),
    history:$('#abbr-history-list'),refTable:$('#abbr-ref-table'),
    toggleTable:$('#toggle-abbr-table')
};}

let ad;

function initAbbr(){
    ad=abbrDom();
    buildAbbrRefTable();
    ad.toggleTable.addEventListener('change',()=>{
        ad.refTable.classList.toggle('hidden',!ad.toggleTable.checked);
    });
    setNewAbbrChallenge();
    updateAbbrScore();
}

function randAbbr(){
    let a;do{a=ABBREVIATIONS[Math.floor(Math.random()*ABBREVIATIONS.length)];}
    while(a===abbrState.current&&ABBREVIATIONS.length>1);return a;
}

function setNewAbbrChallenge(){
    const a=randAbbr();
    abbrState.current=a;abbrState.letterIdx=0;abbrState.userInput='';abbrState.locked=false;
    ad.word.textContent=a.abbr;ad.meaning.textContent=a.meaning;
    ad.word.classList.remove('correct','wrong');
    ad.word.style.animation='none';ad.word.offsetHeight;ad.word.style.animation='';
    ad.userMorse.textContent='';ad.vf.innerHTML='';
    ad.inputDisplay.classList.remove('correct-flash','wrong-flash');
    renderAbbrLetters();
    updateAbbrHint();
}

function renderAbbrLetters(){
    ad.letters.innerHTML='';
    abbrState.current.abbr.split('').forEach((ch,i)=>{
        const el=document.createElement('div');el.className='abbr-letter';el.textContent=ch;
        if(i<abbrState.letterIdx)el.classList.add('done');
        if(i===abbrState.letterIdx)el.classList.add('current');
        ad.letters.appendChild(el);
    });
}

function updateAbbrHint(){
    const ch=abbrState.current.abbr[abbrState.letterIdx];
    if(!ch)return;
    const m=MORSE_CODE[ch];
    ad.hint.textContent=morseVisual(m);
    ad.hint.classList.toggle('visible',state.hintVisible);
}

function updateAbbrScore(){
    ad.streak.textContent=abbrState.streak;
    ad.correct.textContent=abbrState.correct;
    ad.total.textContent=abbrState.total;
    updateAccuracyRing(ad.ring,ad.pct,abbrState.correct,abbrState.total);
}

function abbrSpaceDown(e){
    if(abbrState.locked||abbrState.isHolding)return;
    e.preventDefault();abbrState.isHolding=true;abbrState.holdStartTime=performance.now();
    ad.holdInd.classList.add('active');abbrAnimHold();
    ad.inputDisplay.classList.add('focused');
}

function abbrSpaceUp(e){
    if(!abbrState.isHolding)return;
    e.preventDefault();abbrState.isHolding=false;cancelAnimationFrame(abbrState.holdAnimFrame);
    const dur=performance.now()-abbrState.holdStartTime;
    const dash=dur>=state.holdThreshold;
    abbrState.userInput+=dash?'-':'.';
    if(dash)playDash();else playDot();
    const el=document.createElement('div');el.className=dash?'fb-dash':'fb-dot';ad.vf.appendChild(el);
    ad.userMorse.textContent=morseVisual(abbrState.userInput);
    ad.holdInd.classList.remove('active');ad.holdBar.style.width='0%';
    ad.inputDisplay.classList.remove('focused');
}

function abbrAnimHold(){
    if(!abbrState.isHolding)return;
    const p=Math.min((performance.now()-abbrState.holdStartTime)/state.holdThreshold*100,100);
    ad.holdBar.style.width=p+'%';
    ad.holdBar.style.background=p>=100?'linear-gradient(90deg,var(--blue-300),var(--blue-100))':'';
    abbrState.holdAnimFrame=requestAnimationFrame(abbrAnimHold);
}

function checkAbbrLetter(){
    if(!abbrState.userInput||abbrState.locked)return;
    const ch=abbrState.current.abbr[abbrState.letterIdx];
    const expected=MORSE_CODE[ch];
    const ok=abbrState.userInput===expected;
    const pills=ad.letters.querySelectorAll('.abbr-letter');

    if(ok){
        if (typeof recordAttempt === 'function') recordAttempt(ch, expected, abbrState.userInput, true);
        pills[abbrState.letterIdx].classList.remove('current');
        pills[abbrState.letterIdx].classList.add('done');
        playSuccess();abbrState.letterIdx++;
        if(abbrState.letterIdx>=abbrState.current.abbr.length){
            abbrState.locked=true;abbrState.total++;abbrState.correct++;abbrState.streak++;
            ad.word.classList.add('correct');ad.inputDisplay.classList.add('correct-flash');
            showFlash('success');
            addHistory('abbr-history-list',abbrState.current.abbr,
                abbrState.current.abbr.split('').map(c=>morseVisual(MORSE_CODE[c])).join(' / '),'','ok');
            const hItem=document.getElementById('abbr-history-list').firstChild;
            if(hItem)hItem.querySelector('.h-morse').textContent=abbrState.current.meaning;
            updateAbbrScore();
            setTimeout(setNewAbbrChallenge,800);
        } else {
            abbrState.userInput='';ad.userMorse.textContent='';ad.vf.innerHTML='';
            renderAbbrLetters();updateAbbrHint();
        }
    } else {
        if (typeof recordAttempt === 'function') recordAttempt(ch, expected, abbrState.userInput, false);
        pills[abbrState.letterIdx].classList.add('wrong-letter');
        playError();ad.inputDisplay.classList.add('wrong-flash');
        ad.hint.textContent=morseVisual(expected);ad.hint.classList.add('visible');
        setTimeout(()=>{
            pills[abbrState.letterIdx].classList.remove('wrong-letter');
            ad.inputDisplay.classList.remove('wrong-flash');
            abbrState.userInput='';ad.userMorse.textContent='';ad.vf.innerHTML='';
            renderAbbrLetters();
        },800);
    }
}

function abbrDeleteLast(){
    if(abbrState.userInput.length>0&&!abbrState.locked){
        abbrState.userInput=abbrState.userInput.slice(0,-1);
        ad.userMorse.textContent=morseVisual(abbrState.userInput);
        if(ad.vf.lastChild)ad.vf.removeChild(ad.vf.lastChild);
    }
}

function abbrSkip(){
    abbrState.streak=0;abbrState.total++;updateAbbrScore();
    addHistory('abbr-history-list',abbrState.current.abbr,'','',false);
    const hItem=document.getElementById('abbr-history-list').firstChild;
    if(hItem)hItem.querySelector('.h-morse').textContent=abbrState.current.meaning;
    setNewAbbrChallenge();
}

function buildAbbrRefTable(){
    ad.refTable.innerHTML='';
    ABBREVIATIONS.forEach(a=>{
        const morse=a.abbr.split('').map(c=>morseVisual(MORSE_CODE[c]||'')).join('  ');
        const row=document.createElement('div');row.className='abbr-ref-row';
        row.innerHTML=`<span class="abbr-ref-code">${a.abbr}</span><span class="abbr-ref-meaning">${a.meaning}</span><span class="abbr-ref-morse">${morse}</span>`;
        ad.refTable.appendChild(row);
    });
}

// Override addHistory to handle abbr correctly
const _origAddHistory = typeof addHistory==='function' ? addHistory : null;
function abbrAddHistory(containerId,char,morse,userMorse,ok){
    const container=document.getElementById(containerId);
    const empty=container.querySelector('.history-empty');if(empty)empty.remove();
    const el=document.createElement('div');
    el.className='history-item '+(ok?'h-correct':'h-wrong');
    el.innerHTML=`<span class="h-icon">${ok?'✓':'✗'}</span><span class="h-char">${char}</span><span class="h-morse"></span>`;
    container.insertBefore(el,container.firstChild);
    while(container.children.length>15)container.removeChild(container.lastChild);
}
