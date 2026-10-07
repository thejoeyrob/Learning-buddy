(() => {
  const BANK = window.NOVA_QUESTION_BANK || [];
  const STANDARDS = {
    '5.M.4': {title:'Build volume with cubes', short:'Cubes, layers & base area', desc:'Understand volume by packing right rectangular prisms with unit cubes and connect the cubes to multiplication.'},
    '5.M.5': {title:'Use volume formulas', short:'V = l × w × h and B × h', desc:'Use V = l × w × h and V = B × h to solve volume problems, including missing dimensions.'},
    '5.NS.1': {title:'Compare & order numbers', short:'Fractions, mixed numbers & decimals', desc:'Compare and order fractions, mixed numbers and decimals to thousandths using number-line and place-value reasoning.'},
    '5.CA.1': {title:'Whole-number division', short:'2-digit divisors & remainders', desc:'Find whole-number quotients and remainders with up to four-digit dividends and two-digit divisors, and explain the reasoning.'},
    '5.CA.2': {title:'Solve real-world problems', short:'Multiplication, division & remainders', desc:'Solve real-world multiplication and division problems and explain what a remainder means in context.'}
  };
  const LESSONS = {
    '5.M.4': {title:'Think in layers', body:'Volume is the number of unit cubes that fill a 3D space. A rectangular prism can be counted one layer at a time. Find the cubes in one layer, then multiply by the number of layers.', example:'4 × 3 cubes in each layer = 12. With 2 layers: 12 × 2 = 24 cubic units.', remember:'Length × width gives one layer. Height tells you how many equal layers there are.'},
    '5.M.5': {title:'Two useful volume formulas', body:'For a rectangular prism, use V = l × w × h. If the base area is already known, use V = B × h. To find a missing dimension, undo multiplication with division.', example:'Base area 28 cm² and height 6 cm: V = 28 × 6 = 168 cm³.', remember:'Volume is measured in cubic units. Base area is measured in square units.'},
    '5.NS.1': {title:'Make different forms comparable', body:'Fractions, mixed numbers and decimals can be compared when you rewrite them in a common form. Decimals to thousandths are especially useful because place value lines up clearly.', example:'5/8 = 0.625, so 0.625 and 5/8 are equal.', remember:'Line up decimal points. 0.47 can be written 0.470, which makes comparison with 0.407 easier.'},
    '5.CA.1': {title:'Divide, then check', body:'When dividing by a two-digit divisor, estimate first, use partial quotients or standard division, then check with multiplication. A remainder must always be smaller than the divisor.', example:'2,437 ÷ 32 = 76 R5 because 32 × 76 = 2,432 and 2,437 − 2,432 = 5.', remember:'Check using divisor × quotient + remainder = dividend.'},
    '5.CA.2': {title:'The remainder has meaning', body:'Real-world division is not finished when you write a remainder. Decide what the remainder means. Sometimes you round up, sometimes you use only full groups, and sometimes the remainder is what is left over.', example:'157 students ÷ 40 per bus = 3 R37, but the 37 students still need a bus, so 4 buses are needed.', remember:'Ask: what does the quotient represent, and what does the remainder represent in this situation?'}
  };
  const STORAGE_KEY='novaMathStudio.v1';
  const defaultData={
    profile:{name:'Learner'},
    settings:{dailyCount:12,speech:true},
    totals:{attempts:0,correct:0},
    standards:Object.fromEntries(Object.keys(STANDARDS).map(k=>[k,{attempts:0,correct:0,last:null}])),
    history:[], mistakes:[], seen:[], streak:{count:0,lastDate:null}
  };
  let data=loadData();
  let session=null;
  let selectedChoice=null;
  let deferredPrompt=null;

  const $=id=>document.getElementById(id);
  const qsa=s=>[...document.querySelectorAll(s)];
  function loadData(){
    try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)); return merge(defaultData,saved||{});}catch(e){return structuredClone(defaultData)}
  }
  function merge(base,over){
    const out=structuredClone(base);
    Object.keys(over||{}).forEach(k=>{
      if(over[k] && typeof over[k]==='object' && !Array.isArray(over[k]) && out[k] && typeof out[k]==='object' && !Array.isArray(out[k])) out[k]={...out[k],...over[k]};
      else out[k]=over[k];
    });
    out.standards={...structuredClone(base.standards),...(over.standards||{})};
    return out;
  }
  function saveData(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}
  function pct(n,d){return d?Math.round(n/d*100):0}
  function esc(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function todayKey(){return new Date().toISOString().slice(0,10)}
  function updateStreak(){
    const t=todayKey(), last=data.streak.lastDate;
    if(last===t) return;
    if(last){const d=(new Date(t)-new Date(last))/86400000; data.streak.count=d===1?data.streak.count+1:1;} else data.streak.count=1;
    data.streak.lastDate=t; saveData();
  }

  function renderHome(){
    $('todayPlan').textContent=`${data.settings.dailyCount} questions`;
    $('overallAccuracy').textContent=data.totals.attempts?`${pct(data.totals.correct,data.totals.attempts)}%`:'—';
    $('overallAttempts').textContent=data.totals.attempts?`${data.totals.attempts} answers checked`:'No answers yet';
    $('studyStreak').textContent=`${data.streak.count} day${data.streak.count===1?'':'s'}`;
    $('mascotSpeech').textContent=data.profile.name && data.profile.name!=='Learner' ? `Ready, ${data.profile.name}? We’ll learn it, try it, then explain why it works.` : `Hi! I'm Ms. Nova. We'll learn it, try it, then explain why it works.`;
    $('skillCards').innerHTML=Object.entries(STANDARDS).map(([code,s])=>{
      const st=data.standards[code]||{attempts:0,correct:0}; const accuracy=pct(st.correct,st.attempts);
      return `<button class="skill-card" data-start-focus="${code}"><div><span class="skill-code">${code}</span><h3>${esc(s.title)}</h3><p>${esc(s.short)}</p></div><div class="skill-bottom"><span>${st.attempts?accuracy+'% recent accuracy':'Start here'}</span><span>Practice →</span></div><div class="mini-progress"><span style="width:${st.attempts?accuracy:4}%"></span></div></button>`;
    }).join('');
    qsa('[data-start-focus]').forEach(b=>b.addEventListener('click',()=>startSession({mode:'focus',standard:b.dataset.startFocus,count:data.settings.dailyCount})));
  }

  function renderLessons(){
    $('lessonTabs').innerHTML=Object.keys(LESSONS).map((k,i)=>`<button class="lesson-tab ${i===0?'active':''}" data-lesson="${k}">${k}</button>`).join('');
    qsa('[data-lesson]').forEach(b=>b.addEventListener('click',()=>showLesson(b.dataset.lesson)));
    showLesson(Object.keys(LESSONS)[0]);
  }
  function showLesson(code){
    qsa('[data-lesson]').forEach(b=>b.classList.toggle('active',b.dataset.lesson===code));
    const l=LESSONS[code];
    $('lessonContent').innerHTML=`<h3>${esc(l.title)}</h3><p>${esc(l.body)}</p><div class="worked"><div><strong>Worked example</strong><p>${esc(l.example)}</p></div><div><strong>Remember</strong><p>${esc(l.remember)}</p></div></div><button class="button secondary" style="margin-top:14px" data-learn-practice="${code}">Practice this skill</button>`;
    document.querySelector('[data-learn-practice]').addEventListener('click',()=>startSession({mode:'focus',standard:code,count:data.settings.dailyCount}));
  }

  function renderProgress(){
    $('progressCards').innerHTML=Object.entries(STANDARDS).map(([code,s])=>{
      const st=data.standards[code]||{attempts:0,correct:0,last:null}; const accuracy=pct(st.correct,st.attempts);
      const mastery=st.attempts<5?'Getting started':accuracy>=85?'Secure':accuracy>=70?'Developing':'Needs practice';
      return `<article class="progress-card card"><div class="progress-head"><div><span class="skill-code">${code}</span><h3>${esc(s.title)}</h3><p>${esc(s.desc)}</p></div><div class="mastery-pill">${st.attempts?accuracy+'%':'New'}<br><small>${mastery}</small></div></div><div class="bar"><span style="width:${st.attempts?accuracy:2}%"></span></div><div class="progress-meta"><span>${st.attempts} attempts</span><span>${st.correct} correct</span><span>${st.last?'Last practiced '+new Date(st.last).toLocaleDateString():'Not practiced yet'}</span></div></article>`;
    }).join('');
    $('historyList').innerHTML=data.history.length?data.history.slice(0,10).map(h=>`<div class="history-row"><strong>${esc(h.label)}</strong><span>${h.correct}/${h.total} correct</span><span>${new Date(h.date).toLocaleString()}</span></div>`).join(''):'<p>No sessions yet. Complete a lesson and it will appear here.</p>';
  }

  function weakestStandards(){
    return Object.keys(STANDARDS).sort((a,b)=>{
      const A=data.standards[a],B=data.standards[b];
      const scoreA=A.attempts?A.correct/A.attempts:0.45, scoreB=B.attempts?B.correct/B.attempts:0.45;
      return scoreA-scoreB;
    });
  }
  function renderParent(){
    const weak=weakestStandards()[0]; const st=data.standards[weak]; const accuracy=pct(data.totals.correct,data.totals.attempts);
    $('parentSummary').innerHTML=`<div class="section-heading"><div><p class="eyebrow">AT A GLANCE</p><h2>${esc(data.profile.name || 'Learner')}'s study summary</h2></div></div><div class="stats-grid"><div class="stat"><span class="stat-label">Questions answered</span><strong>${data.totals.attempts}</strong><small>Across all five standards</small></div><div class="stat"><span class="stat-label">Overall accuracy</span><strong>${data.totals.attempts?accuracy+'%':'—'}</strong><small>Use alongside the skill breakdown</small></div><div class="stat"><span class="stat-label">Review queue</span><strong>${data.mistakes.length}</strong><small>Questions to revisit</small></div></div><div class="source-note" style="margin-top:0"><strong>Suggested next focus: ${weak} — ${esc(STANDARDS[weak].title)}</strong><p>${st.attempts?`Current accuracy is ${pct(st.correct,st.attempts)}% across ${st.attempts} attempts.`:'This standard has not been practiced yet.'} Ms. Nova will automatically give it extra weight in mixed lessons.</p></div>`;
  }

  function normalizeAnswer(v){return String(v??'').trim().toLowerCase().replace(/,/g,'').replace(/\s+/g,' ').replace(/\s*r\s*/g,' r').replace(/r(\d+)/g,'r$1');}
  function shuffled(arr){return [...arr].sort(()=>Math.random()-.5)}
  function pickQuestions({mode='mixed',standard=null,count=12,reviewOnly=false}){
    let pool=reviewOnly?BANK.filter(q=>data.mistakes.includes(q.id)):BANK;
    if(standard) pool=pool.filter(q=>q.standard===standard);
    const seenSet=new Set(data.seen.slice(-250));
    let fresh=pool.filter(q=>!seenSet.has(q.id)); if(fresh.length<count) fresh=pool;
    const targetStandards=mode==='mixed'?weakestStandards():standard?[standard]:Object.keys(STANDARDS);
    const result=[];
    let guard=0;
    while(result.length<count && guard<5000){
      guard++;
      let candidates=fresh;
      if(mode==='mixed'){
        const weighted=targetStandards[Math.min(targetStandards.length-1,Math.floor(Math.pow(Math.random(),1.8)*targetStandards.length))];
        const by=fresh.filter(q=>q.standard===weighted && !result.some(r=>r.id===q.id));
        if(by.length)candidates=by;
      } else candidates=fresh.filter(q=>!result.some(r=>r.id===q.id));
      if(!candidates.length)break;
      const q=candidates[Math.floor(Math.random()*candidates.length)];
      if(!result.some(r=>r.id===q.id)) result.push(q);
    }
    return result;
  }

  function startSession(opts){
    const questions=pickQuestions(opts); if(!questions.length){alert('There are no review questions waiting right now.');return;}
    session={questions,index:0,correct:0,answers:[],start:Date.now(),label:opts.reviewOnly?'Mistake review':opts.standard?`${opts.standard} practice`:'Daily mixed lesson'};
    selectedChoice=null;
    $('practiceOverlay').classList.remove('hidden'); document.body.style.overflow='hidden';
    showQuestion();
  }
  function showQuestion(){
    selectedChoice=null; const q=session.questions[session.index];
    $('practiceSkill').textContent=q.skill; $('practiceCoach').textContent=coachLine(q);
    $('questionStandard').textContent=q.standard; $('questionDifficulty').textContent=`Level ${q.difficulty}`;
    $('questionPrompt').textContent=q.prompt; $('hintBox').classList.add('hidden'); $('feedbackBox').className='feedback-box hidden'; $('feedbackBox').innerHTML='';
    $('checkBtn').classList.remove('hidden'); $('nextBtn').classList.add('hidden');
    $('practiceCount').textContent=`${session.index+1} / ${session.questions.length}`;
    $('practiceProgressFill').style.width=`${(session.index/session.questions.length)*100}%`;
    $('readBtn').style.display=data.settings.speech?'inline-block':'none';
    renderAnswer(q);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function coachLine(q){
    if(q.standard==='5.NS.1') return 'Line up place values or rewrite the numbers in the same form.';
    if(q.standard==='5.CA.1') return 'Estimate first, then check your quotient with multiplication.';
    if(q.standard==='5.CA.2') return 'Ask what the remainder means in the real situation.';
    return 'Sketch the prism or think in equal layers if that helps.';
  }
  function renderAnswer(q){
    if(q.type==='mc'){
      $('answerArea').innerHTML=q.choices.map(c=>`<button class="choice" data-choice="${encodeURIComponent(c)}">${esc(c)}</button>`).join('');
      qsa('[data-choice]').forEach(b=>b.addEventListener('click',()=>{qsa('[data-choice]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');selectedChoice=decodeURIComponent(b.dataset.choice);}));
    } else {
      const ph=q.type==='numeric'?'Type your answer':'Example: 76 R5';
      $('answerArea').innerHTML=`<input id="freeAnswer" class="answer-input" inputmode="${q.type==='numeric'?'decimal':'text'}" autocomplete="off" placeholder="${ph}" />`;
      $('freeAnswer').focus();
    }
  }
  function checkAnswer(){
    const q=session.questions[session.index];
    const user=q.type==='mc'?selectedChoice:$('freeAnswer')?.value;
    if(user===null || user===undefined || String(user).trim()===''){pulse($('answerArea'));return;}
    const correct=normalizeAnswer(user)===normalizeAnswer(q.answer);
    session.answers.push({id:q.id,standard:q.standard,correct}); if(correct) session.correct++;
    data.totals.attempts++; if(correct)data.totals.correct++;
    const st=data.standards[q.standard]; st.attempts++; if(correct)st.correct++; st.last=new Date().toISOString();
    data.seen.push(q.id); if(data.seen.length>500)data.seen=data.seen.slice(-500);
    if(correct) data.mistakes=data.mistakes.filter(id=>id!==q.id); else if(!data.mistakes.includes(q.id)) data.mistakes.push(q.id);
    if(q.type==='mc') qsa('[data-choice]').forEach(b=>{const c=decodeURIComponent(b.dataset.choice); if(normalizeAnswer(c)===normalizeAnswer(q.answer))b.classList.add('correct'); else if(c===selectedChoice)b.classList.add('incorrect'); b.disabled=true;});
    else $('freeAnswer').disabled=true;
    $('feedbackBox').className=`feedback-box ${correct?'good':'retry'}`;
    $('feedbackBox').innerHTML=`<strong>${correct?'Correct — explain it back to yourself.':'Not yet — use the worked reasoning.'}</strong><div>${esc(q.explanation)}</div>`;
    $('checkBtn').classList.add('hidden'); $('nextBtn').classList.remove('hidden');
    saveData();
  }
  function nextQuestion(){
    session.index++;
    if(session.index>=session.questions.length){finishSession();return;}
    showQuestion();
  }
  function finishSession(){
    updateStreak(); const total=session.questions.length; const duration=Math.max(1,Math.round((Date.now()-session.start)/60000));
    data.history.unshift({date:new Date().toISOString(),label:session.label,correct:session.correct,total,minutes:duration}); data.history=data.history.slice(0,40); saveData();
    $('practiceOverlay').classList.add('hidden'); $('resultsOverlay').classList.remove('hidden');
    const accuracy=pct(session.correct,total); $('resultsTitle').textContent=accuracy>=85?'Strong session.':accuracy>=65?'Good progress.':'Useful practice — now we know what to revisit.';
    $('resultsSummary').textContent=`You answered ${session.correct} of ${total} correctly. The app has updated your next mixed lesson to give weaker skills more attention.`;
    $('resultsBreakdown').innerHTML=`<div><strong>${session.correct}/${total}</strong><small>Correct</small></div><div><strong>${accuracy}%</strong><small>Accuracy</small></div><div><strong>${duration} min</strong><small>Study time</small></div>`;
    $('reviewMistakes').disabled=data.mistakes.length===0; $('reviewMistakes').textContent=data.mistakes.length?`Review mistakes (${data.mistakes.length})`:'No mistakes waiting';
    renderAll();
  }
  function exitPractice(){
    if(session && session.index>0 && !confirm('Exit this lesson? Completed answers will stay saved, but this session summary will not be added.')) return;
    $('practiceOverlay').classList.add('hidden'); document.body.style.overflow=''; session=null;
  }

  function pulse(el){el.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:240});}
  function speakCurrent(){
    if(!('speechSynthesis' in window))return; speechSynthesis.cancel(); const q=session.questions[session.index]; const u=new SpeechSynthesisUtterance(q.prompt); u.rate=.94; speechSynthesis.speak(u);
  }
  function setupScratchpad(){
    const canvas=$('scratchCanvas'),ctx=canvas.getContext('2d'); let drawing=false,last=null;
    function point(e){const r=canvas.getBoundingClientRect(),t=e.touches?e.touches[0]:e;return{x:(t.clientX-r.left)*(canvas.width/r.width),y:(t.clientY-r.top)*(canvas.height/r.height)}}
    function down(e){drawing=true;last=point(e);e.preventDefault()} function move(e){if(!drawing)return;const p=point(e);ctx.strokeStyle='#173658';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;e.preventDefault()} function up(){drawing=false;last=null}
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
    $('clearScratch').addEventListener('click',()=>ctx.clearRect(0,0,canvas.width,canvas.height));
  }

  function nav(view){
    qsa('.view').forEach(v=>v.classList.toggle('active',v.id===view+'View')); qsa('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));
    if(view==='progress')renderProgress(); if(view==='parent')renderParent(); if(view==='home')renderHome(); window.scrollTo({top:0,behavior:'smooth'});
  }
  function renderSettings(){ $('learnerName').value=data.profile.name==='Learner'?'':data.profile.name; $('dailyCount').value=String(data.settings.dailyCount); $('speechToggle').checked=!!data.settings.speech; }
  function saveSettings(e){e.preventDefault();data.profile.name=$('learnerName').value.trim()||'Learner';data.settings.dailyCount=Number($('dailyCount').value)||12;data.settings.speech=$('speechToggle').checked;saveData();renderAll();nav('home');}
  function exportCSV(){
    const rows=[['Standard','Skill','Attempts','Correct','Accuracy','Last practiced']]; Object.entries(STANDARDS).forEach(([code,s])=>{const st=data.standards[code];rows.push([code,s.title,st.attempts,st.correct,st.attempts?pct(st.correct,st.attempts)+'%':'',st.last||'']);});
    rows.push([]);rows.push(['Session date','Session','Correct','Total','Minutes']);data.history.forEach(h=>rows.push([h.date,h.label,h.correct,h.total,h.minutes]));
    const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='nova-math-progress.csv';a.click();URL.revokeObjectURL(a.href);
  }
  function resetProgress(){if(!confirm('Reset all local study progress on this device? This cannot be undone.'))return;const keep={profile:data.profile,settings:data.settings};data=structuredClone(defaultData);data.profile=keep.profile;data.settings=keep.settings;saveData();renderAll();nav('home');}
  function renderAll(){renderHome();renderProgress();renderParent();renderSettings();}

  $('startDaily').addEventListener('click',()=>startSession({mode:'mixed',count:data.settings.dailyCount}));
  $('quickPractice').addEventListener('click',()=>startSession({mode:'mixed',count:5}));
  $('exitPractice').addEventListener('click',exitPractice);$('checkBtn').addEventListener('click',checkAnswer);$('nextBtn').addEventListener('click',nextQuestion);
  $('hintBtn').addEventListener('click',()=>{const q=session.questions[session.index];$('hintBox').textContent=q.hint;$('hintBox').classList.remove('hidden');});
  $('readBtn').addEventListener('click',speakCurrent);$('scratchBtn').addEventListener('click',()=>$('scratchPanel').classList.toggle('hidden'));
  $('resultsHome').addEventListener('click',()=>{$('resultsOverlay').classList.add('hidden');document.body.style.overflow='';session=null;nav('home')});
  $('reviewMistakes').addEventListener('click',()=>{$('resultsOverlay').classList.add('hidden');startSession({reviewOnly:true,mode:'mixed',count:Math.min(10,data.mistakes.length)})});
  $('settingsForm').addEventListener('submit',saveSettings);$('downloadReport').addEventListener('click',exportCSV);$('resetProgress').addEventListener('click',resetProgress);
  qsa('[data-nav]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.nav)));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').classList.remove('hidden')});
  $('installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('installBtn').classList.add('hidden')});
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  setupScratchpad();renderLessons();renderAll();
})();
