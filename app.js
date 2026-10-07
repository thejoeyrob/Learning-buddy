(() => {
  'use strict';

  const BANK = window.NOVA_QUESTION_BANK || [];
  const SUBJECTS = window.NOVA_SUBJECTS || {};
  const RESOURCES = window.NOVA_RESOURCES || [];
  const SCHOOL_FOCUS = window.NOVA_SCHOOL_FOCUS || null;
  const KEY = 'nova-learning-grade5-v3';
  const SUBJECT_NAMES = Object.keys(SUBJECTS);

  const els = {
    auth: document.getElementById('authScreen'), shell: document.getElementById('appShell'), home: document.getElementById('homeView'),
    subject: document.getElementById('subjectView'), progress: document.getElementById('progressView'), session: document.getElementById('sessionOverlay'),
    sessionStage: document.getElementById('sessionStage'), sessionFill: document.getElementById('sessionProgressFill'), sessionCount: document.getElementById('sessionStepCount'),
    parent: document.getElementById('parentOverlay'), parentGate: document.getElementById('parentGate'), parentDash: document.getElementById('parentDashboard'), toast: document.getElementById('toast')
  };

  const defaultState = () => ({
    version: 3,
    setup: false,
    learner: { name:'', pinHash:'', createdAt:'' },
    parent: { pinHash:'', weeklyGoal:5, sessionLength:15 },
    settings: { speech:true, hints:true },
    progress: { subject:{}, strand:{}, unit:{}, question:{}, history:[], wrong:[], studyDates:[] }
  });

  let state = loadState();
  let learnerUnlocked = false;
  let parentUnlocked = false;
  let currentView = 'home';
  let currentSubject = SUBJECT_NAMES[0] || '';
  let currentMode = null;
  let session = null;
  let deferredInstall = null;
  let toastTimer = null;

  function loadState(){
    try{
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if(!raw) return defaultState();
      const d = defaultState();
      return {
        ...d, ...raw,
        learner:{...d.learner,...(raw.learner||{})}, parent:{...d.parent,...(raw.parent||{})}, settings:{...d.settings,...(raw.settings||{})},
        progress:{...d.progress,...(raw.progress||{}),subject:{...(raw.progress?.subject||{})},strand:{...(raw.progress?.strand||{})},unit:{...(raw.progress?.unit||{})},question:{...(raw.progress?.question||{})},history:[...(raw.progress?.history||[])],wrong:[...(raw.progress?.wrong||[])],studyDates:[...(raw.progress?.studyDates||[])]}
      };
    }catch(e){ return defaultState(); }
  }
  function saveState(){ localStorage.setItem(KEY, JSON.stringify(state)); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
  function pct(c,t){ return t ? Math.round((c/t)*100) : 0; }
  function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  function todayKey(d=new Date()){ return d.toISOString().slice(0,10); }
  function dateLabel(iso){ const d=new Date(iso); return d.toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
  function modeLabel(mode){ return mode==='module'?'Learning module':mode==='lesson'?'Guided lesson':'Quiz / test'; }
  function modeIcon(mode){ return mode==='module'?'✦':mode==='lesson'?'▣':'✓'; }
  function getSubjectConfig(name){ return SUBJECTS[name] || {accent:'#6c5ce7',tint:'#f0efff',units:[],desc:'',icon:'assets/math.svg'}; }
  function unitKey(subject,unitId){ return subject+'::'+unitId; }
  function unitProgress(subject,unitId){ return state.progress.unit[unitKey(subject,unitId)] || {module:0,lesson:0,quiz:0,last:null}; }
  function subjectStats(subject){ return state.progress.subject[subject] || {correct:0,total:0,sessions:0}; }
  function strandStats(subject,strand){ return state.progress.strand[subject+'::'+strand] || {correct:0,total:0}; }
  function subjectProgress(subject){
    const cfg=getSubjectConfig(subject), s=subjectStats(subject), completed=cfg.units.reduce((n,u)=>{const p=unitProgress(subject,u.id);return n+(p.module>0||p.lesson>0||p.quiz>0?1:0)},0);
    const coverage=cfg.units.length?Math.round(completed/cfg.units.length*100):0;
    const accuracy=s.total?pct(s.correct,s.total):0;
    return s.total>=5?Math.round(accuracy*.72+coverage*.28):coverage;
  }
  function allSessions(){ return state.progress.history.length; }
  function totalAnswers(){ return Object.values(state.progress.subject).reduce((n,s)=>n+(s.total||0),0); }
  function totalCorrect(){ return Object.values(state.progress.subject).reduce((n,s)=>n+(s.correct||0),0); }
  function totalMinutes(){ return Math.round(state.progress.history.reduce((n,h)=>n+((h.durationSec||0)/60),0)); }
  function studyStreak(){
    const set=new Set(state.progress.studyDates); let n=0; const d=new Date();
    for(let i=0;i<365;i++){const k=todayKey(d); if(set.has(k)){n++; d.setDate(d.getDate()-1);} else if(i===0){d.setDate(d.getDate()-1);} else break;}
    return n;
  }
  async function pinHash(pin){
    const value='nova-learning::'+String(pin);
    if(window.crypto?.subtle){
      const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
      return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }
    let h=2166136261; for(const ch of value){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);} return 'f'+(h>>>0).toString(16);
  }
  function toast(msg){ clearTimeout(toastTimer); els.toast.textContent=msg; els.toast.classList.remove('hidden'); toastTimer=setTimeout(()=>els.toast.classList.add('hidden'),1800); }
  function setView(name){
    currentView=name;
    [els.home,els.subject,els.progress].forEach(v=>v.classList.add('hidden'));
    document.getElementById(name+'View')?.classList.remove('hidden');
    document.getElementById('navHome').classList.toggle('active',name==='home');
    document.getElementById('navProgress').classList.toggle('active',name==='progress');
    if(name==='home') renderHome(); if(name==='subject') renderSubject(); if(name==='progress') renderChildProgress();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  /* ---------- authentication ---------- */
  function renderAuth(){
    els.shell.classList.add('hidden'); els.auth.classList.remove('hidden');
    if(!state.setup){
      els.auth.innerHTML=`
      <div class="auth-card">
        <div class="auth-copy">
          <span class="kicker">NEW HOME LEARNING SPACE</span>
          <h1>Meet Ms. Nova.</h1>
          <p>A simple Grade 5 learning studio built around lessons, small knowledge checks and a parent-only progress dashboard. Start by creating the learner profile.</p>
          <form id="setupForm" class="form-grid">
            <div class="field"><label for="setupName">Learner name</label><input id="setupName" maxlength="24" autocomplete="given-name" placeholder="First name" required><small>This is the name Ms. Nova uses for greetings.</small></div>
            <div class="pin-row">
              <div class="field"><label for="learnerPin">Learner PIN (optional)</label><input id="learnerPin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" placeholder="4–6 digits"><small>Leave blank for one-tap learner sign in.</small></div>
              <div class="field"><label for="parentPin">Parent PIN</label><input id="parentPin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" placeholder="4–6 digits" required><small>Locks the parent dashboard and settings.</small></div>
            </div>
            <button class="primary-button wide" type="submit">Create learning profile</button>
          </form>
        </div>
        <div class="auth-art"><img src="assets/ms-nova.png" alt="Ms. Nova, the Nova Learning Studio teacher mascot"><div class="art-label"><strong>Learn it. Try it. Explain it.</strong><p>Every module and lesson includes quick checks so progress comes from understanding, not just tapping through screens.</p></div></div>
      </div>`;
      document.getElementById('setupForm').addEventListener('submit',async e=>{
        e.preventDefault(); const name=document.getElementById('setupName').value.trim(); const lp=document.getElementById('learnerPin').value.trim(); const pp=document.getElementById('parentPin').value.trim();
        if(!name) return toast('Enter the learner name.'); if(lp && !/^\d{4,6}$/.test(lp)) return toast('Learner PIN must be 4–6 digits.'); if(!/^\d{4,6}$/.test(pp)) return toast('Parent PIN must be 4–6 digits.');
        state.setup=true; state.learner.name=name; state.learner.pinHash=lp?await pinHash(lp):''; state.learner.createdAt=new Date().toISOString(); state.parent.pinHash=await pinHash(pp); saveState(); learnerUnlocked=true; enterApp();
      });
    } else {
      const needsPin=!!state.learner.pinHash;
      els.auth.innerHTML=`
      <div class="auth-card">
        <div class="auth-copy">
          <span class="kicker">WELCOME BACK</span>
          <h1>Hi, ${esc(state.learner.name)}.</h1>
          <p>${needsPin?'Enter your learner PIN to pick up exactly where you left off.':'Your learning progress is ready on this device.'}</p>
          <form id="loginForm" class="form-grid">
            ${needsPin?'<div class="field"><label for="loginPin">Learner PIN</label><input id="loginPin" class="pin-input" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off" required></div>':''}
            <button class="primary-button wide" type="submit">Continue as ${esc(state.learner.name)}</button>
          </form>
          <div class="auth-actions"><button id="authParent" class="secondary-button">Parent access</button><button id="changeProfile" class="link-button">Reset this device profile</button></div>
        </div>
        <div class="auth-art"><img src="assets/ms-nova.png" alt="Ms. Nova"><div class="art-label"><strong>Ready for another step?</strong><p>Your lessons, checks, quizzes and progress are stored locally on this device.</p></div></div>
      </div>`;
      document.getElementById('loginForm').addEventListener('submit',async e=>{
        e.preventDefault(); if(needsPin){const entered=document.getElementById('loginPin').value; if(await pinHash(entered)!==state.learner.pinHash) return toast('That learner PIN is not correct.');}
        learnerUnlocked=true; enterApp();
      });
      document.getElementById('authParent').onclick=()=>openParent();
      document.getElementById('changeProfile').onclick=()=>{ if(confirm('Reset this local learner profile? This erases progress stored on this device.')){localStorage.removeItem(KEY);state=defaultState();renderAuth();} };
    }
  }
  function enterApp(){ els.auth.classList.add('hidden'); els.shell.classList.remove('hidden'); setView('home'); }
  function signOut(){ learnerUnlocked=false; parentUnlocked=false; els.shell.classList.add('hidden'); renderAuth(); }

  /* ---------- home / subjects ---------- */
  function renderHome(){
    const name=state.learner.name || 'Learner'; const overall=totalAnswers()?pct(totalCorrect(),totalAnswers()):0; const streak=studyStreak();
    const completedToday=state.progress.history.filter(h=>todayKey(new Date(h.date))===todayKey()).length;
    const subjectCards=SUBJECT_NAMES.map(subject=>{
      const c=getSubjectConfig(subject), p=subjectProgress(subject), s=subjectStats(subject);
      return `<button class="subject-card" data-subject="${esc(subject)}" style="--accent:${c.accent}">
        <img src="${c.icon}" alt=""><div class="subject-body"><div class="subject-title-row"><h3>${esc(subject)}</h3><span class="progress-pill">${p?p+'%':'New'}</span></div><p>${esc(c.desc)}</p><div class="subject-meter"><i style="width:${p}%;background:${c.accent}"></i></div><div class="subject-footer"><span>${c.units.length} learning units</span><span>${s.total?pct(s.correct,s.total)+'% checks':'Start here'} →</span></div></div>
      </button>`;
    }).join('');
    const focus=SCHOOL_FOCUS?`<div class="focus-card"><div><span class="kicker" style="color:#facc15">SCHOOL FOCUS</span><h3 style="margin:6px 0 0;font-size:22px">${esc(SCHOOL_FOCUS.title)}</h3><p>${esc(SCHOOL_FOCUS.subtitle)}</p><div class="tags">${SCHOOL_FOCUS.standards.map(s=>`<span class="tag">${esc(s)}</span>`).join('')}</div></div><button id="focusStart" class="primary-button">Start focus quiz</button></div>`:'';
    els.home.innerHTML=`
      <section class="hero">
        <div class="hero-copy"><span class="kicker">YOUR HOME LEARNING DASHBOARD</span><h1>Hi, ${esc(name)}. What shall we learn today?</h1><p>Choose a subject, then decide whether you want to learn a concept, take a guided lesson, or test what you know.</p><div class="hero-actions"><button id="continueBtn" class="primary-button">Continue learning</button><button id="dailyMixBtn" class="secondary-button">Quick daily mix</button></div></div>
        <div class="hero-image"><img src="assets/ms-nova.png" alt="Ms. Nova"></div><div class="speech-chip">“I’ll teach a little, check your understanding, and give you a hint whenever you need one.”</div>
      </section>
      <section class="today-strip"><div class="today-card"><div class="today-icon">✦</div><div><small>Today</small><strong>${completedToday?completedToday+' session'+(completedToday===1?'':'s')+' complete':'Ready when you are'}</strong><small>Parent goal: ${state.parent.weeklyGoal} learning days this week</small></div></div><div class="mini-stat"><span class="label">Learning streak</span><strong>${streak} day${streak===1?'':'s'}</strong><small>Regular practice matters more than perfect scores.</small></div><div class="mini-stat"><span class="label">Knowledge checks</span><strong>${totalAnswers().toLocaleString()}</strong><small>${totalAnswers()?overall+'% correct overall':'Build your first results'}</small></div><div class="mini-stat"><span class="label">Question library</span><strong>${BANK.length.toLocaleString()}+</strong><small>Across Grade 5 subjects and enrichment.</small></div></section>
      <div class="section-head"><div><span class="eyebrow">CHOOSE A SUBJECT</span><h2>Your learning library</h2><p>Big buttons, simple choices, no teams and no leaderboards.</p></div></div>
      <section class="subject-grid">${subjectCards}</section>${focus}`;
    els.home.querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>{currentSubject=b.dataset.subject;currentMode=null;setView('subject');});
    document.getElementById('continueBtn').onclick=()=>continueLearning();
    document.getElementById('dailyMixBtn').onclick=()=>startDailyMix();
    if(document.getElementById('focusStart')) document.getElementById('focusStart').onclick=()=>startFocusQuiz();
  }
  function continueLearning(){
    const last=state.progress.history[0];
    if(last && SUBJECTS[last.subject]){ currentSubject=last.subject; currentMode=last.mode==='quiz'?'lesson':last.mode; setView('subject'); }
    else { currentSubject='Mathematics'; currentMode='module'; setView('subject'); }
  }
  function renderSubject(){
    const subject=currentSubject, cfg=getSubjectConfig(subject), mode=currentMode;
    const activities=[
      {mode:'module',icon:'✦',title:'Learning module',text:'A short visual concept tour with two knowledge checks and hints.',time:'6–10 minutes'},
      {mode:'lesson',icon:'▣',title:'Guided lesson',text:'Teach, example, guided checks and a small independent challenge.',time:'12–20 minutes'},
      {mode:'quiz',icon:'✓',title:'Quiz / test',text:'Ten questions to see what you know. No hints and results at the end.',time:'8–15 minutes'}
    ];
    const units=cfg.units.map((u,i)=>{
      const p=unitProgress(subject,u.id), done=(p.module||0)+(p.lesson||0)+(p.quiz||0); const status=done?`${done} completed`:'New';
      return `<button class="unit-card" data-unit="${u.id}" ${mode?'':'disabled'} style="${mode?'':'opacity:.55;cursor:not-allowed'}"><span class="unit-number" style="background:${cfg.tint};color:${cfg.accent}">${i+1}</span><span><h4>${esc(u.title)}</h4><p>${esc(u.summary)}</p></span><span class="unit-status">${status}${mode?' →':''}</span></button>`;
    }).join('');
    els.subject.innerHTML=`
      <div class="back-row"><button id="backHome" class="back-button">← Home</button></div>
      <section class="subject-hero" style="background:linear-gradient(135deg,#fff,${cfg.tint})"><div><span class="eyebrow" style="color:${cfg.accent}">GRADE 5 SUBJECT</span><h1>${esc(subject)}</h1><p>${esc(cfg.desc)}</p><small class="muted"><b>Curriculum basis:</b> ${esc(cfg.standardsNote)}</small></div><img src="${cfg.icon}" alt=""></section>
      <div class="section-head"><div><span class="eyebrow" style="color:${cfg.accent}">STEP 1</span><h2>Choose an activity</h2><p>Pick how you want to work before choosing a topic.</p></div></div>
      <section class="activity-grid">${activities.map(a=>`<button class="activity-card" data-mode="${a.mode}" style="${mode===a.mode?`box-shadow:0 0 0 3px ${cfg.accent}33,var(--soft);background:${cfg.tint}`:''}"><span class="activity-icon">${a.icon}</span><h3>${a.title}</h3><p>${a.text}</p><small>${a.time}</small></button>`).join('')}</section>
      ${mode?`<div class="mode-banner"><div><strong>${modeIcon(mode)} ${modeLabel(mode)} selected</strong><br><span>Now choose what ${state.learner.name||'the learner'} wants to work on.</span></div><button id="changeMode" class="secondary-button">Change</button></div>`:''}
      <div class="section-head"><div><span class="eyebrow" style="color:${cfg.accent}">STEP 2</span><h2>Choose a learning unit</h2><p>${mode?'Each unit follows the same simple flow.':'Choose an activity above first.'}</p></div></div>
      <section class="unit-grid">${units}</section>`;
    document.getElementById('backHome').onclick=()=>setView('home');
    els.subject.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{currentMode=b.dataset.mode;renderSubject();});
    if(document.getElementById('changeMode')) document.getElementById('changeMode').onclick=()=>{currentMode=null;renderSubject();};
    if(mode) els.subject.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>startUnit(subject,b.dataset.unit,mode));
  }

  /* ---------- question selection ---------- */
  function questionsForUnit(subject,unit,count){
    let pool=BANK.filter(q=>q.subject===subject && (!unit.strands?.length || unit.strands.includes(q.strand)));
    if(!pool.length) pool=BANK.filter(q=>q.subject===subject);
    const wrong=new Set(state.progress.wrong); const weak=pool.filter(q=>{const s=strandStats(subject,q.strand);return s.total>=3 && pct(s.correct,s.total)<70;});
    const preferred=[...shuffle(pool.filter(q=>wrong.has(q.id))),...shuffle(weak),...shuffle(pool)]; const result=[];
    for(const q of preferred){if(result.length>=count)break;if(!result.some(x=>x.id===q.id))result.push(q);}
    return result;
  }
  function questionsByStandards(subject,standards,count){
    let pool=BANK.filter(q=>q.subject===subject && standards.includes(q.standard)); if(!pool.length)pool=BANK.filter(q=>q.subject===subject); return shuffle(pool).slice(0,count);
  }

  /* ---------- learning session ---------- */
  function startUnit(subject,unitId,mode){
    const cfg=getSubjectConfig(subject), unit=cfg.units.find(u=>u.id===unitId); if(!unit)return;
    const qCount=mode==='module'?2:mode==='lesson'?4:10, qs=questionsForUnit(subject,unit,qCount);
    const steps=[];
    if(mode==='module'){
      steps.push({type:'info',title:unit.title,kicker:'Big idea',body:unit.summary,idea:unit.teach[0],example:null});
      steps.push({type:'info',title:'How it works',kicker:'Learn',body:unit.teach[1]||unit.teach[0],idea:unit.teach[2]||'',example:unit.example});
      if(qs[0])steps.push({type:'question',q:qs[0],showFeedback:true,hints:true,label:'Knowledge check'});
      steps.push({type:'info',title:'One more step',kicker:'Connect it',body:unit.teach[2]||unit.summary,idea:'Try to explain the idea in your own words. Explaining is a powerful check of understanding.',example:unit.challenge});
      if(qs[1])steps.push({type:'question',q:qs[1],showFeedback:true,hints:true,label:'Knowledge check'});
      steps.push({type:'recap',title:'Module complete',body:`You explored ${unit.title} and checked your understanding along the way.`});
    } else if(mode==='lesson'){
      steps.push({type:'info',title:unit.title,kicker:'Lesson start',body:unit.summary,idea:'Before we begin, think about what you already know about this topic.',example:null});
      if(qs[0])steps.push({type:'question',q:qs[0],showFeedback:true,hints:true,label:'Warm-up check'});
      steps.push({type:'info',title:'Teach it clearly',kicker:'Learn',body:unit.teach[0],idea:unit.teach[1]||'',example:unit.example});
      if(qs[1])steps.push({type:'question',q:qs[1],showFeedback:true,hints:true,label:'Knowledge check'});
      steps.push({type:'info',title:'Build the idea',kicker:'Go deeper',body:unit.teach[2]||unit.teach[1]||unit.summary,idea:'Use the example as a model, but explain the reasoning—not only the final answer.',example:unit.challenge});
      if(qs[2])steps.push({type:'question',q:qs[2],showFeedback:true,hints:true,label:'Guided check'});
      if(qs[3])steps.push({type:'question',q:qs[3],showFeedback:true,hints:true,label:'Independent check'});
      steps.push({type:'recap',title:'Lesson complete',body:`You learned, practised and explained ${unit.title}. Your checks are now in your progress dashboard.`});
    } else {
      qs.forEach((q,i)=>steps.push({type:'question',q,showFeedback:false,hints:false,label:`Question ${i+1}`}));
      steps.push({type:'recap',title:'Test complete',body:'Your result is ready.'});
    }
    session={subject,unit,mode,steps,index:0,answers:[],started:Date.now(),finished:false};
    const style=getSubjectConfig(subject); els.session.style.setProperty('--session-accent',style.accent);els.session.style.setProperty('--session-tint',style.tint);els.session.classList.remove('hidden');renderSessionStep();
  }
  function startFocusQuiz(){
    const standards=SCHOOL_FOCUS?.standards||[]; const qs=questionsByStandards('Mathematics',standards,12); const unit={id:'school-focus',title:'Current School Math Focus',summary:'A mixed check of the standards in the supplied school practice.',teach:[],example:'',challenge:'',standards:standards.join(' · '),strands:[]};
    session={subject:'Mathematics',unit,mode:'quiz',steps:[...qs.map((q,i)=>({type:'question',q,showFeedback:false,hints:false,label:`Question ${i+1}`})),{type:'recap',title:'Focus check complete',body:'Your current-school-focus result is ready.'}],index:0,answers:[],started:Date.now(),finished:false};
    const style=getSubjectConfig('Mathematics');els.session.style.setProperty('--session-accent',style.accent);els.session.style.setProperty('--session-tint',style.tint);els.session.classList.remove('hidden');renderSessionStep();
  }
  function startDailyMix(){
    const subjects=['Mathematics','English Language Arts','Science','Social Studies']; const qs=[];
    for(const s of subjects){ const cfg=getSubjectConfig(s); const u=cfg.units[Math.floor(Math.random()*cfg.units.length)]; qs.push(...questionsForUnit(s,u,2)); }
    const mixedUnit={id:'daily-mix',title:'Daily Mix',summary:'A short mixed-subject check.',teach:[],example:'',challenge:'',standards:'Grade 5 mixed review',strands:[]};
    session={subject:'Mixed',unit:mixedUnit,mode:'quiz',steps:[...shuffle(qs).slice(0,8).map((q,i)=>({type:'question',q,showFeedback:false,hints:false,label:`Question ${i+1}`})),{type:'recap',title:'Daily mix complete',body:'Nice work across several subjects.'}],index:0,answers:[],started:Date.now(),finished:false};
    els.session.style.setProperty('--session-accent','#6c5ce7');els.session.style.setProperty('--session-tint','#f0efff');els.session.classList.remove('hidden');renderSessionStep();
  }
  function renderSessionStep(){
    if(!session)return; const step=session.steps[session.index]; const total=session.steps.length; els.sessionFill.style.width=`${Math.round((session.index/Math.max(1,total-1))*100)}%`; els.sessionCount.textContent=`${Math.min(session.index+1,total)} / ${total}`;
    if(step.type==='info') renderInfoStep(step); else if(step.type==='question') renderQuestionStep(step); else renderRecapStep(step);
  }
  function coachHeader(kicker,title){ return `<div class="coach-row"><div class="coach-avatar"><img src="assets/ms-nova.png" alt="Ms. Nova"></div><div class="coach-copy"><small>${esc(kicker)}</small><h2>${esc(title)}</h2></div></div>`; }
  function renderInfoStep(step){
    els.sessionStage.innerHTML=`<article class="lesson-card">${coachHeader(step.kicker,step.title)}<div class="lesson-content"><p>${esc(step.body)}</p>${step.idea?`<div class="big-idea"><strong>Key idea</strong>${esc(step.idea)}</div>`:''}${step.example?`<div class="example-box"><small>${step.kicker==='Connect it'?'TRY THIS':'WORKED / CONCRETE EXAMPLE'}</small><p>${esc(step.example)}</p></div>`:''}<div class="lesson-next">${state.settings.speech?'<button id="readStep" class="secondary-button">🔊 Read aloud</button>':''}<button id="nextStep" class="primary-button">Continue →</button></div></div></article>`;
    if(document.getElementById('readStep')) document.getElementById('readStep').onclick=()=>speak(`${step.title}. ${step.body}. ${step.idea||''}. ${step.example||''}`);
    document.getElementById('nextStep').onclick=nextSessionStep;
  }
  function renderQuestionStep(step){
    const q=step.q, prior=session.answers.find(a=>a.step===session.index); const passage=q.passage?`<div class="passage"><b>Read this:</b><br>${esc(q.passage)}</div>`:'';
    let answers=''; if(q.type==='mc'&&Array.isArray(q.choices)) answers=`<div class="choices">${shuffle(q.choices).map(c=>`<button class="choice" data-choice="${encodeURIComponent(c)}">${esc(c)}</button>`).join('')}</div>`; else answers=`<input id="textAnswer" class="answer-input" autocomplete="off" inputmode="${q.type==='numeric'?'decimal':'text'}" placeholder="Type your answer">`;
    els.sessionStage.innerHTML=`<article class="lesson-card check-card">${coachHeader(step.label||'Knowledge check',session.mode==='quiz'?'Show what you know':'Quick knowledge check')}<div class="lesson-content">${passage}<div class="check-prompt">${esc(q.prompt)}</div>${answers}<div class="check-actions">${step.hints&&state.settings.hints?'<button id="hintBtn" class="secondary-button">Hint</button>':''}${state.settings.speech?'<button id="readQuestion" class="secondary-button">🔊 Read aloud</button>':''}<button id="submitAnswer" class="primary-button">${session.mode==='quiz'?'Save answer':'Check answer'}</button></div><div id="hintPanel" class="hint-panel hidden"></div><div id="feedbackPanel" class="feedback-panel hidden"></div></div></article>`;
    let selected='';
    els.sessionStage.querySelectorAll('.choice').forEach(b=>b.onclick=()=>{if(prior)return;els.sessionStage.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');selected=decodeURIComponent(b.dataset.choice);});
    if(document.getElementById('hintBtn')) document.getElementById('hintBtn').onclick=()=>{const h=document.getElementById('hintPanel');h.textContent=q.hint||'Slow down, identify what the question is asking, and eliminate answers that do not fit.';h.classList.remove('hidden');};
    if(document.getElementById('readQuestion')) document.getElementById('readQuestion').onclick=()=>speak(`${q.passage||''}. ${q.prompt}`);
    document.getElementById('submitAnswer').onclick=()=>{
      if(session.answers.some(a=>a.step===session.index)) return nextSessionStep();
      const value=q.type==='mc'?selected:(document.getElementById('textAnswer')?.value||'').trim(); if(!value)return toast('Choose or enter an answer first.');
      const correct=normalize(value)===normalize(q.answer); session.answers.push({step:session.index,qid:q.id,subject:q.subject,correct,given:value,answer:q.answer}); recordAnswer(q,correct);
      const submit=document.getElementById('submitAnswer');
      if(step.showFeedback){
        els.sessionStage.querySelectorAll('.choice').forEach(b=>{const v=decodeURIComponent(b.dataset.choice);b.disabled=true;if(normalize(v)===normalize(q.answer))b.classList.add('correct');if(b.classList.contains('selected')&&!correct)b.classList.add('wrong');});
        const fb=document.getElementById('feedbackPanel');fb.className='feedback-panel '+(correct?'good':'bad');fb.innerHTML=`<strong>${correct?'Correct — good reasoning.':'Not quite yet.'}</strong><br>${esc(q.explanation||'Review the key idea and try a similar question next time.')}${!correct?`<br><b>Answer:</b> ${esc(q.answer)}`:''}`;fb.classList.remove('hidden');submit.textContent='Continue →';
      } else { submit.textContent='Next →'; toast('Answer saved'); }
    };
  }
  function renderRecapStep(step){
    if(!session.finished) finishSession(); const answers=session.answers, correct=answers.filter(a=>a.correct).length, total=answers.length, score=pct(correct,total); const isQuiz=session.mode==='quiz'; const message=isQuiz?(score>=90?'Excellent result.':score>=70?'Good result — review the missed ideas next.':'This test found useful areas to revisit.'):'You worked through teaching and knowledge checks, not just a score.';
    const review=isQuiz?answers.map((a,i)=>`<div class="review-row"><b>${a.correct?'✓':'•'}</b><span>${a.correct?'Correct':`Review: ${esc(a.answer)}`}</span></div>`).join(''):'';
    els.sessionStage.innerHTML=`<article class="lesson-card"><div class="quiz-summary"><div class="score-orb">${total?score+'%':'✓'}</div><span class="eyebrow">${esc(modeLabel(session.mode))}</span><h1>${esc(step.title)}</h1><p>${esc(message)}</p>${isQuiz?`<p><b>${correct} of ${total}</b> knowledge checks correct.</p><div class="quiz-review">${review}</div>`:`<div class="big-idea"><strong>What happens next</strong>${esc(step.body)}</div>`}<div class="hero-actions" style="justify-content:center"><button id="sessionHome" class="primary-button">Back to learning</button>${session.subject!=='Mixed'&&session.unit.id!=='school-focus'?'<button id="repeatUnit" class="secondary-button">Try another activity</button>':''}</div></div></article>`;
    document.getElementById('sessionHome').onclick=closeSession;
    if(document.getElementById('repeatUnit')) document.getElementById('repeatUnit').onclick=()=>{const s=session.subject;closeSession();currentSubject=s;currentMode=null;setView('subject');};
  }
  function nextSessionStep(){ if(!session)return; if(session.index<session.steps.length-1){session.index++;renderSessionStep();} }
  function normalize(v){ return String(v??'').trim().toLowerCase().replace(/,/g,'').replace(/\s+/g,' ').replace(/[.$]/g,''); }
  function recordAnswer(q,correct){
    const subject=q.subject||session.subject, strand=q.strand||'General';
    state.progress.subject[subject] ||= {correct:0,total:0,sessions:0}; state.progress.subject[subject].total++; if(correct)state.progress.subject[subject].correct++;
    const sk=subject+'::'+strand; state.progress.strand[sk] ||= {correct:0,total:0}; state.progress.strand[sk].total++; if(correct)state.progress.strand[sk].correct++;
    state.progress.question[q.id] ||= {correct:0,total:0}; state.progress.question[q.id].total++; if(correct)state.progress.question[q.id].correct++;
    if(correct) state.progress.wrong=state.progress.wrong.filter(id=>id!==q.id); else if(!state.progress.wrong.includes(q.id)) state.progress.wrong.push(q.id);
    state.progress.wrong=state.progress.wrong.slice(-400); saveState();
  }
  function finishSession(){
    if(!session||session.finished)return;session.finished=true; const correct=session.answers.filter(a=>a.correct).length,total=session.answers.length,durationSec=Math.max(20,Math.round((Date.now()-session.started)/1000));
    if(session.subject!=='Mixed'){
      const up=unitProgress(session.subject,session.unit.id); up[session.mode]=(up[session.mode]||0)+1; up.last=new Date().toISOString(); state.progress.unit[unitKey(session.subject,session.unit.id)]=up;
      state.progress.subject[session.subject] ||= {correct:0,total:0,sessions:0}; state.progress.subject[session.subject].sessions=(state.progress.subject[session.subject].sessions||0)+1;
    }
    state.progress.history.unshift({date:new Date().toISOString(),subject:session.subject,unitId:session.unit.id,unitTitle:session.unit.title,mode:session.mode,correct,total,durationSec}); state.progress.history=state.progress.history.slice(0,250);
    const tk=todayKey(); if(!state.progress.studyDates.includes(tk)) state.progress.studyDates.push(tk); state.progress.studyDates=state.progress.studyDates.slice(-400); saveState();
  }
  function closeSession(){ if(!session)return; if(!session.finished && session.answers.length && !confirm('Leave this session? Your completed checks are saved, but the activity will not be marked complete.'))return; els.session.classList.add('hidden');session=null; if(currentView==='home')renderHome(); else if(currentView==='progress')renderChildProgress(); else renderSubject(); }
  function speak(text){ if(!('speechSynthesis'in window))return toast('Read aloud is not available on this device.'); speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text);u.rate=.94;speechSynthesis.speak(u); }

  /* ---------- child progress ---------- */
  function renderChildProgress(){
    const sessions=allSessions(),answers=totalAnswers(),accuracy=answers?pct(totalCorrect(),answers):0,streak=studyStreak();
    const cards=SUBJECT_NAMES.map(s=>{const c=getSubjectConfig(s),p=subjectProgress(s),st=subjectStats(s);return `<div class="progress-subject"><div class="row"><div><h3>${esc(s)}</h3><small>${st.total?st.total+' checks completed':'Not started yet'}</small></div><b style="color:${c.accent}">${p}%</b></div><div class="bar"><i style="width:${p}%;background:${c.accent}"></i></div></div>`}).join('');
    const recent=state.progress.history.slice(0,8).map(h=>`<div class="recent-item"><div><strong>${esc(h.unitTitle)}</strong><small>${esc(h.subject)} · ${modeLabel(h.mode)} · ${dateLabel(h.date)}</small></div><span class="score-chip">${h.total?pct(h.correct,h.total)+'%':'Done'}</span></div>`).join('')||'<p class="muted">Complete a lesson or quiz and it will appear here.</p>';
    els.progress.innerHTML=`<section class="progress-hero"><span class="kicker" style="color:#facc15">MY LEARNING</span><h1>${esc(state.learner.name)}’s progress</h1><p>This page keeps the learner view simple: subjects practised, recent work and steady progress.</p><div class="star-row">${Array.from({length:Math.min(8,Math.max(1,sessions))},()=>'<span class="star">★</span>').join('')}</div></section><section class="today-strip"><div class="mini-stat"><span class="label">Sessions</span><strong>${sessions}</strong><small>Learning modules, lessons and quizzes.</small></div><div class="mini-stat"><span class="label">Overall accuracy</span><strong>${answers?accuracy+'%':'—'}</strong><small>${answers.toLocaleString()} knowledge checks.</small></div><div class="mini-stat"><span class="label">Streak</span><strong>${streak} day${streak===1?'':'s'}</strong><small>Keep it steady, not stressful.</small></div><div class="mini-stat"><span class="label">Study time</span><strong>${totalMinutes()} min</strong><small>Approximate active session time.</small></div></section><div class="section-head"><div><span class="eyebrow">SUBJECTS</span><h2>How each area is going</h2></div></div><section class="progress-subjects">${cards}</section><div class="section-head"><div><span class="eyebrow">RECENT</span><h2>Latest learning</h2></div></div><section class="recent-list">${recent}</section>`;
  }

  /* ---------- parent dashboard ---------- */
  function openParent(){ parentUnlocked=false; els.parent.classList.remove('hidden');els.parentDash.classList.add('hidden');els.parentGate.classList.remove('hidden');renderParentGate(); }
  function closeParent(){ els.parent.classList.add('hidden');parentUnlocked=false; }
  function renderParentGate(){
    els.parentGate.innerHTML=`<div class="gate-head"><div><span class="kicker">PARENT / HOME EDUCATOR</span><h2>Parent dashboard</h2></div><button id="closeParentGate" class="round-button">✕</button></div><p>Enter the parent PIN created during setup. This lock is designed to keep settings and reports out of the learner’s normal flow.</p><form id="parentPinForm" class="form-grid"><div class="field"><label for="parentPinLogin">Parent PIN</label><input id="parentPinLogin" class="pin-input" inputmode="numeric" maxlength="6" autocomplete="off" required></div><button class="primary-button wide" type="submit">Open dashboard</button></form>`;
    document.getElementById('closeParentGate').onclick=closeParent; document.getElementById('parentPinForm').onsubmit=async e=>{e.preventDefault();const p=document.getElementById('parentPinLogin').value;if(await pinHash(p)!==state.parent.pinHash)return toast('Parent PIN is not correct.');parentUnlocked=true;els.parentGate.classList.add('hidden');els.parentDash.classList.remove('hidden');renderParentDashboard('overview');};
  }
  function renderParentDashboard(tab='overview'){
    const tabs=[['overview','Overview'],['curriculum','Curriculum'],['resources','Teaching resources'],['settings','Settings'],['data','Data']];
    els.parentDash.innerHTML=`<header class="parent-head"><div><small>PARENT / HOME EDUCATOR</small><h1>${esc(state.learner.name)}’s learning dashboard</h1></div><button id="closeParent" class="round-button light">✕</button></header><nav class="parent-tabs">${tabs.map(([id,label])=>`<button data-tab="${id}" class="parent-tab ${tab===id?'active':''}">${label}</button>`).join('')}</nav><main class="parent-body" id="parentBody"></main>`;
    document.getElementById('closeParent').onclick=closeParent; els.parentDash.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>renderParentDashboard(b.dataset.tab)); const body=document.getElementById('parentBody');
    if(tab==='overview') body.innerHTML=parentOverviewHTML();
    if(tab==='curriculum') body.innerHTML=parentCurriculumHTML();
    if(tab==='resources') body.innerHTML=parentResourcesHTML();
    if(tab==='settings'){body.innerHTML=parentSettingsHTML();wireParentSettings();}
    if(tab==='data'){body.innerHTML=parentDataHTML();wireParentData();}
  }
  function parentOverviewHTML(){
    const answers=totalAnswers(),accuracy=answers?pct(totalCorrect(),answers):0; const week=weekData(); const max=Math.max(1,...week.map(d=>d.minutes));
    const bars=week.map(d=>`<div class="day-col"><div class="day-bar"><i style="height:${Math.max(3,Math.round(d.minutes/max*100))}%"></i></div><small>${d.label}<br>${d.minutes}m</small></div>`).join('');
    const subjectRows=SUBJECT_NAMES.map(s=>{const st=subjectStats(s),c=getSubjectConfig(s),p=subjectProgress(s);return `<div class="admin-subject-row"><div><strong>${esc(s)}</strong><br><small>${st.total?pct(st.correct,st.total)+'% accuracy · '+st.total+' checks':'No checks yet'}</small><div class="bar"><i style="width:${p}%;background:${c.accent}"></i></div></div><b>${p}%</b></div>`}).join('');
    const weak=weakestStrands().slice(0,5); const weakHTML=weak.length?weak.map(x=>`<div class="weak-item"><strong>${esc(x.strand)}</strong><br><small>${esc(x.subject)} · ${x.accuracy}% across ${x.total} checks</small></div>`).join(''):'<p class="muted">There is not enough attempt data yet to identify a reliable weak area.</p>';
    return `<section class="admin-stats"><div class="admin-stat"><span>Sessions</span><strong>${allSessions()}</strong></div><div class="admin-stat"><span>Knowledge checks</span><strong>${answers.toLocaleString()}</strong></div><div class="admin-stat"><span>Overall accuracy</span><strong>${answers?accuracy+'%':'—'}</strong></div><div class="admin-stat"><span>Study time</span><strong>${totalMinutes()}m</strong></div></section><section class="dashboard-grid"><div class="admin-card"><h3>Last 7 days</h3><div class="week-chart">${bars}</div></div><div class="admin-card"><h3>Suggested next focus</h3><div class="weak-list">${weakHTML}</div></div></section><section class="dashboard-grid"><div class="admin-card"><h3>Subject progress</h3>${subjectRows}</div><div class="admin-card"><h3>How to read this</h3><p class="muted">Accuracy is one signal, not the whole picture. The dashboard also records completed modules, lessons, quizzes, study days and repeated weak strands. A short re-teaching lesson is usually a better response to a weak strand than simply giving a longer test.</p><p class="muted"><b>Current weekly goal:</b> ${state.parent.weeklyGoal} learning days.</p></div></section>`;
  }
  function weekData(){
    const out=[]; for(let i=6;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);const key=todayKey(d);const seconds=state.progress.history.filter(h=>todayKey(new Date(h.date))===key).reduce((n,h)=>n+(h.durationSec||0),0);out.push({key,label:d.toLocaleDateString(undefined,{weekday:'short'}),minutes:Math.round(seconds/60)});} return out;
  }
  function weakestStrands(){
    const arr=[]; for(const [key,s] of Object.entries(state.progress.strand)){if((s.total||0)<3)continue; const split=key.indexOf('::'),subject=key.slice(0,split),strand=key.slice(split+2);arr.push({subject,strand,total:s.total,accuracy:pct(s.correct,s.total)});} return arr.sort((a,b)=>a.accuracy-b.accuracy||b.total-a.total);
  }
  function parentCurriculumHTML(){
    const blocks=SUBJECT_NAMES.map(s=>{const cfg=getSubjectConfig(s);return `<details class="curriculum-subject"><summary>${esc(s)} — ${cfg.units.length} units</summary><div class="curriculum-units"><p class="muted" style="font-size:12px">${esc(cfg.standardsNote)}</p>${cfg.units.map(u=>{const p=unitProgress(s,u.id),count=(p.module||0)+(p.lesson||0)+(p.quiz||0);return `<div class="curriculum-unit"><span><b>${esc(u.title)}</b><br><small class="muted">${esc(u.standards)}</small></span><span>${count?count+' completed':'Not started'}</span></div>`}).join('')}</div></details>`}).join('');
    return `<div class="admin-card"><h3>Grade 5 learning map</h3><p class="muted">Core subjects follow Indiana Grade 5 standards and the supplied ILEARN-style math focus. Health and Creative Arts are additional home-learning enrichment. Learning modules and lessons use short knowledge checks with hints; quizzes do not show hints.</p><div class="curriculum-table">${blocks}</div></div>`;
  }
  function parentResourcesHTML(){
    return `<div class="admin-card"><h3>Teaching-resource foundation</h3><p class="muted">The app’s lessons and questions are original. These public educator resources were used to structure standards coverage and lesson approaches; the app does not copy their lesson text.</p><div class="resource-list">${RESOURCES.map(r=>`<div class="resource-item"><strong>${esc(r.title)}</strong><p>${esc(r.subject)} — ${esc(r.note)}</p><a href="${esc(r.url)}" target="_blank" rel="noopener">Open source resource ↗</a></div>`).join('')}</div></div>`;
  }
  function parentSettingsHTML(){
    return `<div class="admin-card"><h3>Learner & home-learning settings</h3><form id="parentSettingsForm" class="form-grid"><div class="settings-grid"><div class="field"><label for="adminName">Learner name</label><input id="adminName" maxlength="24" value="${esc(state.learner.name)}"></div><div class="field"><label for="weeklyGoal">Weekly learning-day goal</label><select id="weeklyGoal">${[3,4,5,6,7].map(n=>`<option value="${n}" ${n===Number(state.parent.weeklyGoal)?'selected':''}>${n} days</option>`).join('')}</select></div><div class="field"><label for="sessionLength">Typical lesson length</label><select id="sessionLength">${[10,15,20,25,30].map(n=>`<option value="${n}" ${n===Number(state.parent.sessionLength)?'selected':''}>${n} minutes</option>`).join('')}</select></div><div class="field"><label for="newLearnerPin">New learner PIN</label><input id="newLearnerPin" inputmode="numeric" maxlength="6" placeholder="Leave blank to keep current"><small>Use 0000 to remove the learner PIN.</small></div></div><label class="toggle-line"><span><b>Read-aloud buttons</b><br><small class="muted">Show device voice controls during learning.</small></span><input id="speechSetting" type="checkbox" ${state.settings.speech?'checked':''}></label><label class="toggle-line"><span><b>Hints during learning checks</b><br><small class="muted">Hints are never shown in quiz/test mode.</small></span><input id="hintSetting" type="checkbox" ${state.settings.hints?'checked':''}></label><button class="primary-button" type="submit">Save settings</button></form><hr style="border:0;border-top:1px solid var(--line);margin:24px 0"><h3>Change parent PIN</h3><form id="parentPinChange" class="form-grid"><div class="pin-row"><div class="field"><label for="newParentPin">New parent PIN</label><input id="newParentPin" inputmode="numeric" maxlength="6" placeholder="4–6 digits" required></div><div class="field"><label for="confirmParentPin">Confirm PIN</label><input id="confirmParentPin" inputmode="numeric" maxlength="6" placeholder="Repeat" required></div></div><button class="secondary-button" type="submit">Change parent PIN</button></form></div>`;
  }
  function wireParentSettings(){
    document.getElementById('parentSettingsForm').onsubmit=async e=>{e.preventDefault();const name=document.getElementById('adminName').value.trim();if(!name)return toast('Learner name cannot be blank.');state.learner.name=name;state.parent.weeklyGoal=Number(document.getElementById('weeklyGoal').value);state.parent.sessionLength=Number(document.getElementById('sessionLength').value);state.settings.speech=document.getElementById('speechSetting').checked;state.settings.hints=document.getElementById('hintSetting').checked;const lp=document.getElementById('newLearnerPin').value.trim();if(lp){if(lp==='0000')state.learner.pinHash='';else if(/^\d{4,6}$/.test(lp))state.learner.pinHash=await pinHash(lp);else return toast('Learner PIN must be 4–6 digits.');}saveState();toast('Settings saved.');renderParentDashboard('settings');if(learnerUnlocked)renderHome();};
    document.getElementById('parentPinChange').onsubmit=async e=>{e.preventDefault();const a=document.getElementById('newParentPin').value,b=document.getElementById('confirmParentPin').value;if(!/^\d{4,6}$/.test(a))return toast('Parent PIN must be 4–6 digits.');if(a!==b)return toast('The parent PINs do not match.');state.parent.pinHash=await pinHash(a);saveState();toast('Parent PIN changed.');document.getElementById('parentPinChange').reset();};
  }
  function parentDataHTML(){ return `<div class="admin-card"><h3>Progress data</h3><p class="muted">This flat PWA is local-first: the learner profile and progress stay in this browser/device. Export a backup before clearing browser data or moving devices. A cloud-sync backend can be added later if required.</p><div class="data-actions"><button id="exportJson" class="primary-button">Export full backup</button><button id="exportCsv" class="secondary-button">Export session CSV</button><label class="secondary-button" style="display:inline-flex;align-items:center;cursor:pointer">Import backup<input id="importJson" type="file" accept="application/json" hidden></label><button id="resetData" class="danger-button">Reset progress</button></div><div class="big-idea" style="margin-top:20px"><strong>Privacy note</strong>No account data is sent to a server in this build. The PIN prevents casual access inside the app but is not a substitute for device security.</div></div>`; }
  function wireParentData(){
    document.getElementById('exportJson').onclick=()=>downloadBlob(JSON.stringify(state,null,2),'nova-learning-backup.json','application/json');
    document.getElementById('exportCsv').onclick=()=>{const rows=[['Date','Subject','Unit','Activity','Correct','Total','Minutes'],...state.progress.history.map(h=>[h.date,h.subject,h.unitTitle,modeLabel(h.mode),h.correct,h.total,Math.round((h.durationSec||0)/60)])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');downloadBlob(csv,'nova-learning-sessions.csv','text/csv');};
    document.getElementById('importJson').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const incoming=JSON.parse(reader.result);if(!incoming.setup||!incoming.learner||!incoming.progress)throw new Error('Invalid');if(confirm('Replace the current local profile and progress with this backup?')){localStorage.setItem(KEY,JSON.stringify(incoming));state=loadState();toast('Backup imported.');renderParentDashboard('overview');}}catch(err){toast('That file is not a valid Nova Learning backup.');}};reader.readAsText(f);};
    document.getElementById('resetData').onclick=()=>{if(confirm('Reset learning progress but keep the learner and parent setup?')){state.progress=defaultState().progress;saveState();toast('Progress reset.');renderParentDashboard('overview');if(learnerUnlocked)renderHome();}};
  }
  function downloadBlob(text,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),500);}

  /* ---------- app chrome ---------- */
  document.getElementById('homeBtn').onclick=()=>setView('home');
  document.getElementById('navHome').onclick=()=>setView('home');
  document.getElementById('navProgress').onclick=()=>setView('progress');
  document.getElementById('navLogout').onclick=signOut;
  document.getElementById('parentBtn').onclick=openParent;
  document.getElementById('sessionClose').onclick=closeSession;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;document.getElementById('installBtn').classList.remove('hidden');});
  document.getElementById('installBtn').onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;document.getElementById('installBtn').classList.add('hidden');};
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

  renderAuth();
})();
