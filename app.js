(() => {
  'use strict';

  const BANK = window.LB_QUESTION_BANK || [];
  const SUBJECTS = window.LB_SUBJECTS || {};
  const RESOURCES = window.LB_RESOURCES || [];
  const SCHOOL_FOCUS = window.LB_SCHOOL_FOCUS || null;
  const KEY = 'learning-buddy-grade5-v9';
  const PREVIOUS_KEYS = ['learning-buddy-grade5-v8','learning-buddy-grade5-v7','learning-buddy-grade5-v4','nova-learning-grade5-v3'];
  const SUBJECT_NAMES = Object.keys(SUBJECTS);
  const BUDDIES = [
    {id:'alex',name:'Alex',img:'buddy-alex.jpg',line:'We’ll figure it out together.',vibe:'Puzzle pro'},
    {id:'mia',name:'Mia',img:'buddy-mia.jpg',line:'Let’s make this easy to understand.',vibe:'Creative thinker'},
    {id:'leo',name:'Leo',img:'buddy-leo.jpg',line:'Ready for the next challenge?',vibe:'Challenge seeker'},
    {id:'maya',name:'Maya',img:'buddy-maya.jpg',line:'Small steps. Big progress.',vibe:'Positive explorer'},
    {id:'noah',name:'Noah',img:'buddy-noah.jpg',line:'I’ll help you spot the pattern.',vibe:'Pattern finder'},
    {id:'zara',name:'Zara',img:'buddy-zara.jpg',line:'Let’s learn it your way.',vibe:'Bright explorer'}
  ];
  function currentBuddy(){ return BUDDIES.find(b=>b.id===state?.learner?.buddy) || BUDDIES[0]; }
  function buddyById(id){ return BUDDIES.find(b=>b.id===id) || BUDDIES[0]; }
  function buddyChoices(selected, name='setupBuddy'){
    return `<div class="buddy-grid">${BUDDIES.map(b=>`<label class="buddy-option ${b.id===selected?'selected':''}"><input type="radio" name="${name}" value="${b.id}" ${b.id===selected?'checked':''}><span class="buddy-portrait"><img src="${b.img}" alt="${esc(b.name)} learning buddy"></span><strong>${esc(b.name)}</strong><small>${esc(b.vibe)}</small><i>✓</i></label>`).join('')}</div>`;
  }


  const els = {
    auth: document.getElementById('authScreen'), shell: document.getElementById('appShell'), home: document.getElementById('homeView'),
    subject: document.getElementById('subjectView'), progress: document.getElementById('progressView'), session: document.getElementById('sessionOverlay'),
    sessionStage: document.getElementById('sessionStage'), sessionFill: document.getElementById('sessionProgressFill'), sessionCount: document.getElementById('sessionStepCount'),
    parent: document.getElementById('parentOverlay'), parentGate: document.getElementById('parentGate'), parentDash: document.getElementById('parentDashboard'), toast: document.getElementById('toast')
  };

  const defaultState = () => ({
    version: 7,
    setup: false,
    learner: { name:'', pinHash:'', createdAt:'', buddy:'alex' },
    parent: { pinHash:'', weeklyGoal:5, sessionLength:15 },
    device: { role:'', familyCode:'', parentToken:'', childToken:'', linked:false, linkCode:'' },
    assignment: { active:null, lastSync:null, pendingCompletion:null },
    settings: { speech:true, hints:true },
    progress: { subject:{}, strand:{}, unit:{}, question:{}, history:[], wrong:[], studyDates:[] }
  });

  let state = loadState();
  const incomingLearnerInvite = learnerInviteFromUrl();
  if(incomingLearnerInvite && !state.device.parentToken && !state.device.childToken){ state.device.role='child'; saveState(); }
  let learnerUnlocked = false;
  let parentUnlocked = false;
  let currentView = 'home';
  let currentSubject = SUBJECT_NAMES[0] || '';
  let currentMode = null;
  let session = null;
  let deferredInstall = null;
  let toastTimer = null;
  let activeAssignment = state.assignment?.active || null;
  let parentSnapshot = null;
  let pendingAssignmentId = null;
  let syncTimer = null;

  function loadState(){
    try{
      let stored = localStorage.getItem(KEY);
      if(!stored){ for(const k of PREVIOUS_KEYS){ const old=localStorage.getItem(k); if(old){stored=old;break;} } }
      const raw = JSON.parse(stored || 'null');
      if(!raw) return defaultState();
      const d = defaultState();
      return {
        ...d, ...raw,
        learner:{...d.learner,...(raw.learner||{})},
        parent:{...d.parent,...(raw.parent||{})},
        device:{...d.device,...(raw.device||{})},
        assignment:{...d.assignment,...(raw.assignment||{})},
        settings:{...d.settings,...(raw.settings||{})},
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
  function getSubjectConfig(name){ return SUBJECTS[name] || {accent:'#6c5ce7',tint:'#f0efff',units:[],desc:'',icon:'math.jpg'}; }
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
  function localDateKey(d=new Date()){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
  function learnerInviteFromUrl(){
    try{
      const q=new URLSearchParams(location.search);
      const family=String(q.get('family')||'').trim().toUpperCase();
      const link=String(q.get('link')||'').trim().toUpperCase();
      const role=String(q.get('lbrole')||'').trim().toLowerCase();
      if((role==='child'||(family&&link)) && family && link) return {family,link};
    }catch(e){}
    return null;
  }
  function learnerInviteUrl(){
    const family=String(state.device.familyCode||parentSnapshot?.family_code||'').trim().toUpperCase();
    const link=String(state.device.linkCode||'').trim().toUpperCase();
    if(!family||!link) return '';
    try{
      const u=new URL(location.href);
      u.search=''; u.hash='';
      u.searchParams.set('lbrole','child');
      u.searchParams.set('family',family);
      u.searchParams.set('link',link);
      return u.toString();
    }catch(e){ return ''; }
  }
  function clearLearnerInviteFromUrl(){
    try{
      const u=new URL(location.href);
      ['lbrole','family','link'].forEach(k=>u.searchParams.delete(k));
      history.replaceState({},'',u.pathname+(u.search||'')+(u.hash||''));
    }catch(e){}
  }
  function cloudConfig(){
    let local={}; try{ local=JSON.parse(localStorage.getItem('learning-buddy-cloud-config')||'{}'); }catch(e){}
    const base=window.LB_CLOUD_CONFIG||{};
    return {url:String(local.url||base.url||'').replace(/\/$/,''),key:String(local.key||base.key||'')};
  }
  function cloudReady(){ const c=cloudConfig(); return /^https:\/\//.test(c.url) && c.key.length>20; }
  function saveCloudConfig(url,key){ localStorage.setItem('learning-buddy-cloud-config',JSON.stringify({url:String(url||'').trim().replace(/\/$/,''),key:String(key||'').trim()})); }
  async function cloudRpc(name,payload={}){
    const c=cloudConfig(); if(!cloudReady()) throw new Error('Cloud connection is not configured.');
    const res=await fetch(`${c.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{'apikey':c.key,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const text=await res.text(); let data=null; try{data=text?JSON.parse(text):null}catch(e){data=text}
    if(!res.ok) throw new Error(data?.message||data?.error_description||data?.hint||`Cloud error ${res.status}`);
    return data;
  }
  function cloudStatusText(){ return navigator.onLine ? (cloudReady()?'Connected configuration':'Cloud setup needed') : 'Offline'; }
  async function syncChild(silent=true){
    if(!state.device.childToken || !cloudReady()) return false;
    try{
      if(state.assignment.pendingCompletion){
        const p=state.assignment.pendingCompletion;
        try{
          await cloudRpc('lb_child_complete',{p_child_token:state.device.childToken,p_assignment_id:p.assignmentId,p_result:p.result,p_progress_snapshot:p.progress});
          state.assignment.pendingCompletion=null; saveState();
        }catch(err){ if(!navigator.onLine) return false; }
      }
      const data=await cloudRpc('lb_child_snapshot',{p_child_token:state.device.childToken,p_local_date:localDateKey()});
      if(data?.learner_name) state.learner.name=data.learner_name;
      if(data?.buddy_id) state.learner.buddy=data.buddy_id;
      if(data?.progress_snapshot && Object.keys(data.progress_snapshot).length) state.progress={...defaultState().progress,...data.progress_snapshot};
      activeAssignment=data?.assignment||null;
      if(state.assignment.pendingCompletion && activeAssignment?.id===state.assignment.pendingCompletion.assignmentId){ activeAssignment={...activeAssignment,status:'complete',result:state.assignment.pendingCompletion.result}; }
      state.assignment.active=activeAssignment; state.assignment.lastSync=new Date().toISOString(); saveState();
      if(!silent) toast('Today’s task refreshed.');
      return true;
    }catch(err){ if(!silent) toast(err.message||'Could not refresh right now.'); return false; }
  }
  async function refreshParentRemote(silent=true){
    if(!state.device.parentToken || !cloudReady()) return false;
    try{
      parentSnapshot=await cloudRpc('lb_parent_snapshot',{p_parent_token:state.device.parentToken});
      if(parentSnapshot?.learner_name) state.learner.name=parentSnapshot.learner_name;
      if(parentSnapshot?.buddy_id) state.learner.buddy=parentSnapshot.buddy_id;
      if(parentSnapshot?.progress_snapshot && Object.keys(parentSnapshot.progress_snapshot).length) state.progress={...defaultState().progress,...parentSnapshot.progress_snapshot};
      state.device.familyCode=parentSnapshot?.family_code||state.device.familyCode; saveState();
      if(!silent) toast('Parent dashboard refreshed.');
      return true;
    }catch(err){ if(!silent) toast(err.message||'Could not refresh right now.'); return false; }
  }
  function setView(name){
    currentView=name;
    [els.home,els.subject,els.progress].forEach(v=>v.classList.add('hidden'));
    document.getElementById(name+'View')?.classList.remove('hidden');
    document.getElementById('navHome').classList.toggle('active',name==='home');
    document.getElementById('navProgress').classList.toggle('active',name==='progress');
    if(name==='home') renderHome(); if(name==='subject') renderSubject(); if(name==='progress') renderChildProgress();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function stopSyncLoop(){ if(syncTimer){clearInterval(syncTimer);syncTimer=null;} }
  function startSyncLoop(role){
    stopSyncLoop();
    const tick=async()=>{
      if(document.hidden || !navigator.onLine) return;
      if(role==='child' && state.device.childToken && learnerUnlocked){
        const ok=await syncChild(true);
        if(ok && currentView==='home') renderHome();
      }
      if(role==='parent' && state.device.parentToken && parentUnlocked){
        const ok=await refreshParentRemote(true);
        if(ok && !els.parent.classList.contains('hidden')){
          const tab=els.parentDash.querySelector('.parent-tab.active')?.dataset.tab || 'today';
          renderParentDashboard(tab);
        }
      }
    };
    syncTimer=setInterval(tick, role==='child'?15000:20000);
  }

  /* ---------- authentication ---------- */
  function roleCard(role,icon,title,copy){ return `<button class="role-card" data-role="${role}"><span>${icon}</span><strong>${title}</strong><small>${copy}</small></button>`; }
  function renderAuth(){
    stopSyncLoop(); document.body.classList.remove('child-focus-mode');
    els.shell.classList.add('hidden'); els.auth.classList.remove('hidden'); els.parent.classList.add('hidden');
    const role=state.device?.role||'';
    if(!role){
      els.auth.innerHTML=`<div class="auth-card role-setup-card"><div class="auth-copy"><span class="kicker">LEARNING BUDDY · CONNECTED HOME LEARNING</span><h1>Who is using this device?</h1><p>Set each device once. The parent chooses today’s lesson from their phone; the learner opens straight onto the task.</p><div class="role-grid">${roleCard('parent','👨‍👩‍👧','Parent device','Choose and monitor today’s learning.')}${roleCard('child','⭐','Learner device','Open straight to today’s task.')}</div>${state.setup?'<div class="migration-note"><b>Existing Learning Buddy data found.</b><br>Your saved learner progress will stay on this device while you connect it.</div>':''}</div><div class="auth-art role-art"><img src="${currentBuddy().img}" alt="Learning Buddy"><div class="art-label"><strong>One task. One clear start.</strong><p>No subject hunting or menu maze for the learner.</p></div></div></div>`;
      els.auth.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{state.device.role=b.dataset.role;saveState();renderAuth();});
      return;
    }
    if(role==='parent') return renderParentDeviceAuth();
    return renderChildDeviceAuth();
  }
  function cloudSetupFields(){ const c=cloudConfig(); if(cloudReady()) return `<div class="cloud-setup-box"><div class="connection-line"><span class="status-dot online"></span><div><strong>Cloud connected</strong><small>Parent and learner devices can sync.</small></div></div></div>`; return `<div class="cloud-setup-box"><div class="connection-line"><span class="status-dot"></span><div><strong>Cloud connection</strong><small>${esc(cloudStatusText())}</small></div></div><p class="muted">Cross-device sync needs a dedicated Supabase project. Enter its public project URL and publishable key here, or put them in cloud-config.js before deployment.</p><div class="settings-grid"><div class="field"><label for="cloudUrl">Supabase project URL</label><input id="cloudUrl" value="${esc(c.url)}" placeholder="https://…supabase.co"></div><div class="field"><label for="cloudKey">Publishable key</label><input id="cloudKey" value="${esc(c.key)}" placeholder="sb_publishable_…"></div></div></div>`; }
  function renderParentDeviceAuth(){
    if(!state.device.parentToken){
      els.auth.innerHTML=`<div class="auth-card setup-card parent-device-setup"><div class="auth-copy"><span class="kicker">PARENT DEVICE SETUP</span><h1>Set the learning from your phone.</h1><p>Create the connected learner once. You’ll get a family code and a temporary link code for the child’s device.</p><form id="parentCloudSetup" class="form-grid">${cloudSetupFields()}<div class="field"><label for="setupName">Learner name</label><input id="setupName" maxlength="24" value="${esc(state.learner.name||'')}" placeholder="First name" required></div><div class="field"><label>Choose their Learning Buddy</label>${buddyChoices(state.learner.buddy||'alex','setupBuddy')}</div><div class="field"><label for="parentPin">Parent PIN on this device</label><input id="parentPin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" placeholder="4–6 digits" required><small>This only protects the parent dashboard on this phone.</small></div><button class="primary-button wide" type="submit">Create connected learner →</button><button id="switchDeviceRole" class="link-button" type="button">This should be a learner device</button></form></div><div class="auth-art"><img src="${currentBuddy().img}" alt=""><div class="art-label"><strong>You set the plan.</strong><p>The child gets a simple welcome, today’s note and one Start button.</p></div></div></div>`;
      els.auth.querySelectorAll('input[name="setupBuddy"]').forEach(r=>r.addEventListener('change',()=>els.auth.querySelectorAll('.buddy-option').forEach(o=>o.classList.toggle('selected',o.querySelector('input').checked))));
      document.getElementById('switchDeviceRole').onclick=()=>{state.device.role='child';saveState();renderAuth();};
      document.getElementById('parentCloudSetup').onsubmit=async e=>{e.preventDefault();const url=document.getElementById('cloudUrl')?.value.trim(),key=document.getElementById('cloudKey')?.value.trim();if(url||key)saveCloudConfig(url,key);if(!cloudReady())return toast('Add the Supabase project URL and publishable key first.');const name=document.getElementById('setupName').value.trim();const pin=document.getElementById('parentPin').value.trim();const buddy=document.querySelector('input[name="setupBuddy"]:checked')?.value||'alex';if(!name)return toast('Enter the learner name.');if(!/^\d{4,6}$/.test(pin))return toast('Parent PIN must be 4–6 digits.');try{const data=await cloudRpc('lb_create_family',{p_learner_name:name,p_buddy_id:buddy});state.setup=true;state.learner.name=name;state.learner.buddy=buddy;state.parent.pinHash=await pinHash(pin);state.device.parentToken=data.parent_token;state.device.familyCode=data.family_code;state.device.linkCode=data.child_link_code;saveState();parentUnlocked=true;await enterParentApp(true,'connection');}catch(err){toast(err.message||'Could not create the connected learner.');}};
      return;
    }
    els.auth.innerHTML=`<div class="auth-card"><div class="auth-copy"><span class="kicker">PARENT DEVICE</span><h1>${esc(state.learner.name||'Learner')}’s Learning Buddy</h1><p>Open the parent dashboard to set today’s lesson and see progress from the learner device.</p><form id="parentDeviceLogin" class="form-grid"><div class="field"><label for="parentPinLogin">Parent PIN</label><input id="parentPinLogin" class="pin-input" inputmode="numeric" maxlength="6" autocomplete="off" required></div><button class="primary-button wide" type="submit">Open parent dashboard</button></form><div class="auth-actions"><button id="changeRoleParent" class="link-button">Change this device role</button></div></div><div class="auth-art"><img src="${currentBuddy().img}" alt=""><div class="art-label"><strong>Today’s learning, from your phone.</strong><p>Assign a lesson, write a short note and see when it is completed.</p></div></div></div>`;
    document.getElementById('parentDeviceLogin').onsubmit=async e=>{e.preventDefault();const pin=document.getElementById('parentPinLogin').value;if(await pinHash(pin)!==state.parent.pinHash)return toast('Parent PIN is not correct.');parentUnlocked=true;await enterParentApp(true);};
    document.getElementById('changeRoleParent').onclick=()=>{if(confirm('Change the role of this device? The cloud family remains intact.')){state.device.role='';state.device.parentToken='';saveState();renderAuth();}};
  }
  function renderChildDeviceAuth(){
    if(state.device.childToken){ setTimeout(()=>enterChildApp(),0); return; }
    const invite=learnerInviteFromUrl();
    const familyValue=invite?.family||state.device.familyCode||'';
    const linkValue=invite?.link||'';
    const inviteNotice=invite?`<div class="migration-note invite-ready"><b>✓ Parent invitation ready</b><br>The family and link codes are already filled in. Tap Connect once.</div>`:'';
    els.auth.innerHTML=`<div class="auth-card child-link-card"><div class="auth-copy"><span class="kicker">LEARNER DEVICE</span><h1>${invite?'Your Learning Buddy is ready.':'Connect to your grown-up.'}</h1><p>${invite?'Your parent has sent the setup link. Connect this device once, then it will open straight to today’s learning.':'This is a one-time link. After that, Learning Buddy opens straight onto today’s work.'}</p>${inviteNotice}<form id="childLinkForm" class="form-grid">${cloudSetupFields()}<div class="pin-row"><div class="field"><label for="familyCode">Family code</label><input id="familyCode" maxlength="8" autocapitalize="characters" value="${esc(familyValue)}" placeholder="8 characters" required></div><div class="field"><label for="linkCode">Link code</label><input id="linkCode" maxlength="6" autocapitalize="characters" value="${esc(linkValue)}" placeholder="6 characters" required></div></div><button class="primary-button wide" type="submit">${invite?'Connect Learning Buddy':'Connect this learner device'} →</button><button id="switchDeviceRole" class="link-button" type="button">This should be a parent device</button></form></div><div class="auth-art"><img src="${currentBuddy().img}" alt=""><div class="art-label"><strong>Then it stays simple.</strong><p>Welcome → today’s task → Start.</p></div></div></div>`;
    document.getElementById('switchDeviceRole').onclick=()=>{state.device.role='parent';saveState();renderAuth();};
    document.getElementById('childLinkForm').onsubmit=async e=>{e.preventDefault();const url=document.getElementById('cloudUrl')?.value.trim(),key=document.getElementById('cloudKey')?.value.trim();if(url||key)saveCloudConfig(url,key);if(!cloudReady())return toast('Cloud connection is not ready.');const family=document.getElementById('familyCode').value.trim().toUpperCase(),link=document.getElementById('linkCode').value.trim().toUpperCase();try{const data=await cloudRpc('lb_child_claim',{p_family_code:family,p_link_code:link});state.setup=true;state.device.childToken=data.child_token;state.device.familyCode=data.family_code;state.device.linked=true;state.learner.name=data.learner_name||state.learner.name;state.learner.buddy=data.buddy_id||state.learner.buddy;if(data.progress_snapshot&&Object.keys(data.progress_snapshot).length)state.progress={...defaultState().progress,...data.progress_snapshot};saveState();clearLearnerInviteFromUrl();await enterChildApp();}catch(err){toast(err.message||'That family/link code did not work.');}};
  }
  async function enterChildApp(){ learnerUnlocked=true; parentUnlocked=false; document.body.classList.add('child-focus-mode'); els.auth.classList.add('hidden'); els.shell.classList.remove('hidden'); document.getElementById('parentBtn').classList.add('hidden'); document.getElementById('navLogout').classList.add('hidden'); await syncChild(true); setView('home'); startSyncLoop('child'); }
  async function enterParentApp(refresh=false,tab='today'){ learnerUnlocked=false; parentUnlocked=true; document.body.classList.remove('child-focus-mode'); els.auth.classList.add('hidden');els.shell.classList.add('hidden');els.parent.classList.remove('hidden');els.parentGate.classList.add('hidden');els.parentDash.classList.remove('hidden');if(refresh)await refreshParentRemote(true);renderParentDashboard(tab);startSyncLoop('parent'); }
  function signOut(){ learnerUnlocked=false; parentUnlocked=false; stopSyncLoop(); els.shell.classList.add('hidden'); els.parent.classList.add('hidden'); renderAuth(); }

  /* ---------- home / subjects ---------- */
  function renderHome(){
    const name=state.learner.name||'Learner', buddy=currentBuddy(), a=activeAssignment||state.assignment.active;
    const assignmentReady=a && a.assigned_for===localDateKey();
    const completed=assignmentReady && a.status==='complete';
    const cfg=assignmentReady?getSubjectConfig(a.subject):null;
    const mode=a?.mode||'lesson';
    const result=a?.result||null;
    const planLine=mode==='quiz'?'Answer the questions, check your result, then you’re done.':mode==='module'?'Learn the idea, try a few examples, then do a quick knowledge check.':'Learn it, try it with your buddy, then finish with a short knowledge check.';
    let main='';
    if(assignmentReady && !completed){
      main=`<section class="child-task-focus"><div class="task-art"><img src="${cfg.icon}" alt="${esc(a.subject)}"><span>${esc(a.subject)}</span></div><span class="eyebrow">TODAY’S LEARNING</span><h2>${esc(a.title||a.unit_title)}</h2><p class="task-plan">${esc(planLine)}</p><div class="assignment-meta"><span>${esc(modeLabel(mode))}</span><span>${esc(a.unit_title)}</span></div><button id="startTodayTask" class="primary-button child-start-button">${a.status==='in_progress'?'Continue':'Start'} →</button></section>`;
    }else if(completed){
      const score=Number(result?.total||0)?Math.round((Number(result.correct||0)/Number(result.total))*100):null;
      main=`<section class="child-task-focus complete"><div class="celebrate-star">★</div><span class="eyebrow">ALL DONE FOR TODAY</span><h2>Great work, ${esc(name)}!</h2><p>You finished <b>${esc(a.title||a.unit_title)}</b>. Your grown-up can already see that it’s complete.</p>${score!==null?`<div class="child-score"><strong>${score}%</strong><span>${esc(a.subject)} · ${esc(modeLabel(mode))}</span></div>`:''}<button id="refreshToday" class="secondary-button">Check for a new task</button></section>`;
    }else{
      main=`<section class="child-task-focus waiting"><div class="waiting-buddy"><img src="${buddy.img}" alt="${esc(buddy.name)}"></div><span class="eyebrow">TODAY’S LEARNING</span><h2>You’re ready.</h2><p>Your grown-up hasn’t set today’s task yet. When they do, it will appear here automatically.</p><button id="refreshToday" class="primary-button child-start-button">Check now</button></section>`;
    }
    els.home.innerHTML=`<section class="simple-child-welcome"><div><span class="kicker">WELCOME BACK</span><h1>Hi, ${esc(name)}.</h1><p>${assignmentReady?(completed?'You’ve completed today’s learning.':'Here’s what you’re doing today.'):'Your task will appear here when it’s ready.'}</p></div><div class="simple-buddy"><img src="${buddy.img}" alt="${esc(buddy.name)}"><span><b>${esc(buddy.name)}</b><small>${esc(buddy.line)}</small></span></div></section>${main}<div class="child-sync-line"><span class="status-dot ${navigator.onLine&&cloudReady()?'online':''}"></span><span>${navigator.onLine?(state.assignment.lastSync?'Updated '+new Date(state.assignment.lastSync).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Connected'):'Offline — today’s task will sync when you reconnect'}</span></div>`;
    if(document.getElementById('startTodayTask'))document.getElementById('startTodayTask').onclick=startAssignedTask;
    if(document.getElementById('refreshToday'))document.getElementById('refreshToday').onclick=async()=>{const b=document.getElementById('refreshToday');b.disabled=true;b.textContent='Checking…';await syncChild(false);renderHome();};
  }
  async function startAssignedTask(){
    const a=activeAssignment||state.assignment.active;if(!a)return toast('No task is set for today.');
    const cfg=getSubjectConfig(a.subject),unit=cfg.units.find(u=>u.id===a.unit_id);if(!unit)return toast('This task needs to be re-assigned by the parent.');
    try{ if(state.device.childToken&&cloudReady()){const updated=await cloudRpc('lb_child_start',{p_child_token:state.device.childToken,p_assignment_id:a.id});activeAssignment={...a,...updated};state.assignment.active=activeAssignment;saveState();} }catch(err){toast('Starting offline — progress will sync when possible.');}
    pendingAssignmentId=a.id;currentSubject=a.subject;currentMode=a.mode;startUnit(a.subject,a.unit_id,a.mode);
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
    session={subject,unit,mode,steps,index:0,answers:[],started:Date.now(),finished:false,assignmentId:pendingAssignmentId||null}; pendingAssignmentId=null;
    const style=getSubjectConfig(subject); els.session.style.setProperty('--session-accent',style.accent);els.session.style.setProperty('--session-tint',style.tint);els.session.classList.remove('hidden');renderSessionStep();
  }
  function startFocusQuiz(){
    const standards=SCHOOL_FOCUS?.standards||[]; const qs=questionsByStandards('Mathematics',standards,12); const unit={id:'school-focus',title:'Current School Math Focus',summary:'A mixed check of the standards in the supplied school practice.',teach:[],example:'',challenge:'',standards:standards.join(' · '),strands:[]};
    session={subject:'Mathematics',unit,mode:'quiz',steps:[...qs.map((q,i)=>({type:'question',q,showFeedback:false,hints:false,label:`Question ${i+1}`})),{type:'recap',title:'Focus check complete',body:'Your current-school-focus result is ready.'}],index:0,answers:[],started:Date.now(),finished:false};
    const style=getSubjectConfig('Mathematics');els.session.style.setProperty('--session-accent',style.accent);els.session.style.setProperty('--session-tint',style.tint);els.session.classList.remove('hidden');renderSessionStep();
  }
  function startDailyMix(count=8,title='Daily Mix',summary='A short mixed-subject check.'){
    const subjects=['Mathematics','English Language Arts','Science','Social Studies']; const qs=[];
    for(const s of subjects){ const cfg=getSubjectConfig(s); const u=cfg.units[Math.floor(Math.random()*cfg.units.length)]; qs.push(...questionsForUnit(s,u,Math.max(2,Math.ceil(count/subjects.length)))); }
    const mixedUnit={id:title==='Quick 4'?'quick-four':'daily-mix',title,summary,teach:[],example:'',challenge:'',standards:'Grade 5 mixed review',strands:[]};
    session={subject:'Mixed',unit:mixedUnit,mode:'quiz',steps:[...shuffle(qs).slice(0,count).map((q,i)=>({type:'question',q,showFeedback:false,hints:false,label:`Question ${i+1}`})),{type:'recap',title:`${title} complete!`,body:'Nice work across several subjects.'}],index:0,answers:[],started:Date.now(),finished:false};
    els.session.style.setProperty('--session-accent','#1f6fff');els.session.style.setProperty('--session-tint','#eaf4ff');els.session.classList.remove('hidden');renderSessionStep();
  }
  function startSurpriseLesson(){
    const subject=SUBJECT_NAMES[Math.floor(Math.random()*SUBJECT_NAMES.length)]; const cfg=getSubjectConfig(subject);
    if(!cfg.units.length)return toast('No lesson is available yet.');
    const unit=cfg.units[Math.floor(Math.random()*cfg.units.length)]; currentSubject=subject;currentMode='module';startUnit(subject,unit.id,'module');
  }
  function startChallengeFive(){
    const subject=SUBJECT_NAMES[Math.floor(Math.random()*SUBJECT_NAMES.length)]; const cfg=getSubjectConfig(subject);
    if(!cfg.units.length)return toast('No challenge is available yet.');
    const unit=cfg.units[Math.floor(Math.random()*cfg.units.length)]; const qs=questionsForUnit(subject,unit,5);
    const challengeUnit={...unit,id:'challenge-'+unit.id,title:'Challenge: '+unit.title};
    session={subject,unit:challengeUnit,mode:'quiz',steps:[...qs.map((q,i)=>({type:'question',q,showFeedback:false,hints:false,label:`Challenge ${i+1}`})),{type:'recap',title:'Challenge complete!',body:'You took on five checks without hints.'}],index:0,answers:[],started:Date.now(),finished:false};
    const style=getSubjectConfig(subject);els.session.style.setProperty('--session-accent',style.accent);els.session.style.setProperty('--session-tint',style.tint);els.session.classList.remove('hidden');renderSessionStep();
  }
  function renderSessionStep(){
    if(!session)return; const step=session.steps[session.index]; const total=session.steps.length; els.sessionFill.style.width=`${Math.round((session.index/Math.max(1,total-1))*100)}%`; els.sessionCount.textContent=`${Math.min(session.index+1,total)} / ${total}`;
    if(step.type==='info') renderInfoStep(step); else if(step.type==='question') renderQuestionStep(step); else renderRecapStep(step);
  }
  function coachHeader(kicker,title){ const b=currentBuddy(); return `<div class="coach-row"><div class="coach-avatar"><img src="${b.img}" alt="${esc(b.name)} learning buddy"></div><div class="coach-copy"><small>${esc(b.name)} · ${esc(kicker)}</small><h2>${esc(title)}</h2></div></div>`; }
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
    if(!session.finished) finishSession(); const answers=session.answers, correct=answers.filter(a=>a.correct).length, total=answers.length, score=pct(correct,total); const isQuiz=session.mode==='quiz'; const message=isQuiz?(score>=90?'Brilliant work — you smashed it!':score>=70?'Strong work — you’re getting it.':'Good effort — now we know what to practise next.'):'Nice work — you learned it, tried it and checked your understanding.';
    const review=isQuiz?answers.map((a,i)=>`<div class="review-row"><b>${a.correct?'✓':'•'}</b><span>${a.correct?'Correct':`Review: ${esc(a.answer)}`}</span></div>`).join(''):'';
    els.sessionStage.innerHTML=`<article class="lesson-card"><div class="quiz-summary"><div class="score-orb">${total?score+'%':'✓'}</div><span class="eyebrow">${esc(modeLabel(session.mode))}</span><h1>${esc(step.title)}</h1><p>${esc(message)}</p>${isQuiz?`<p><b>${correct} of ${total}</b> correct · <b>+${correct} ★</b> earned</p><div class="quiz-review">${review}</div>`:`<div class="big-idea"><strong>What happens next</strong>${esc(step.body)}</div>`}<div class="hero-actions" style="justify-content:center"><button id="sessionHome" class="primary-button">${session.assignmentId?'Finish for today':'Back to learning'}</button>${!session.assignmentId&&session.subject!=='Mixed'&&session.unit.id!=='school-focus'?'<button id="repeatUnit" class="secondary-button">Try another activity</button>':''}</div></div></article>`;
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
    if(session.assignmentId){
      const result={correct,total,durationSec,subject:session.subject,unitId:session.unit.id,unitTitle:session.unit.title,mode:session.mode,completedAt:new Date().toISOString()};
      if(activeAssignment){ activeAssignment={...activeAssignment,status:'complete',result}; state.assignment.active=activeAssignment; }
      state.assignment.pendingCompletion={assignmentId:session.assignmentId,result,progress:state.progress}; saveState();
      if(state.device.childToken&&cloudReady()) cloudRpc('lb_child_complete',{p_child_token:state.device.childToken,p_assignment_id:session.assignmentId,p_result:result,p_progress_snapshot:state.progress}).then(x=>{activeAssignment={...(activeAssignment||{}),...x};state.assignment.active=activeAssignment;state.assignment.pendingCompletion=null;state.assignment.lastSync=new Date().toISOString();saveState();}).catch(()=>{});
    }
  }
  function closeSession(){ if(!session)return; if(!session.finished && session.answers.length && !confirm('Leave this session? Your completed checks are saved, but the activity will not be marked complete.'))return; const assigned=!!session.assignmentId; els.session.classList.add('hidden');session=null; if(assigned){currentView='home';renderHome();window.scrollTo({top:0,behavior:'smooth'});} else if(currentView==='home')renderHome(); else if(currentView==='progress')renderChildProgress(); else renderSubject(); }
  function speak(text){ if(!('speechSynthesis'in window))return toast('Read aloud is not available on this device.'); speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text);u.rate=.94;speechSynthesis.speak(u); }

  /* ---------- child progress ---------- */
  function renderChildProgress(){
    const sessions=allSessions(),answers=totalAnswers(),accuracy=answers?pct(totalCorrect(),answers):0,streak=studyStreak();
    const cards=SUBJECT_NAMES.map(s=>{const c=getSubjectConfig(s),p=subjectProgress(s),st=subjectStats(s);return `<div class="progress-subject"><div class="row"><div><h3>${esc(s)}</h3><small>${st.total?st.total+' checks completed':'Not started yet'}</small></div><b style="color:${c.accent}">${p}%</b></div><div class="bar"><i style="width:${p}%;background:${c.accent}"></i></div></div>`}).join('');
    const recent=state.progress.history.slice(0,8).map(h=>`<div class="recent-item"><div><strong>${esc(h.unitTitle)}</strong><small>${esc(h.subject)} · ${modeLabel(h.mode)} · ${dateLabel(h.date)}</small></div><span class="score-chip">${h.total?pct(h.correct,h.total)+'%':'Done'}</span></div>`).join('')||'<p class="muted">Complete a lesson or quiz and it will appear here.</p>';
    els.progress.innerHTML=`<section class="progress-hero"><span class="kicker" style="color:#facc15">MY LEARNING</span><h1>${esc(state.learner.name)}’s progress</h1><p>This page keeps the learner view simple: subjects practised, recent work and steady progress.</p><div class="star-row">${Array.from({length:Math.min(8,Math.max(1,sessions))},()=>'<span class="star">★</span>').join('')}</div></section><section class="today-strip"><div class="mini-stat"><span class="label">Sessions</span><strong>${sessions}</strong><small>Learning modules, lessons and quizzes.</small></div><div class="mini-stat"><span class="label">Overall accuracy</span><strong>${answers?accuracy+'%':'—'}</strong><small>${answers.toLocaleString()} knowledge checks.</small></div><div class="mini-stat"><span class="label">Streak</span><strong>${streak} day${streak===1?'':'s'}</strong><small>Keep it steady, not stressful.</small></div><div class="mini-stat"><span class="label">Study time</span><strong>${totalMinutes()} min</strong><small>Approximate active session time.</small></div></section><div class="section-head"><div><span class="eyebrow">SUBJECTS</span><h2>How each area is going</h2></div></div><section class="progress-subjects">${cards}</section><div class="section-head"><div><span class="eyebrow">RECENT</span><h2>Latest learning</h2></div></div><section class="recent-list">${recent}</section>`;
  }

  function openBuddyChooser(){
    const existing=document.getElementById('buddyChooserOverlay'); if(existing) existing.remove();
    const wrap=document.createElement('section'); wrap.id='buddyChooserOverlay'; wrap.className='buddy-chooser-overlay';
    wrap.innerHTML=`<div class="buddy-chooser-card"><div class="buddy-chooser-head"><div><span class="kicker">YOUR LEARNING BUDDY</span><h2>Who should learn with you?</h2><p>Pick any buddy. Your lessons and progress stay exactly the same.</p></div><button id="closeBuddyChooser" class="round-button" aria-label="Close">✕</button></div>${buddyChoices(currentBuddy().id,'quickBuddy')}</div>`;
    document.body.appendChild(wrap);
    document.getElementById('closeBuddyChooser').onclick=()=>wrap.remove();
    wrap.addEventListener('click',e=>{ if(e.target===wrap) wrap.remove(); });
    wrap.querySelectorAll('input[name="quickBuddy"]').forEach(r=>r.addEventListener('change',()=>{ state.learner.buddy=r.value; saveState(); wrap.remove(); renderHome(); toast(buddyById(r.value).name+' is now your learning buddy.'); }));
  }

  /* ---------- parent dashboard ---------- */
  function openParent(){ if(state.device.role==='parent'&&state.device.parentToken){enterParentApp(true);return;} toast('Use a device set up as the parent device.'); }
  function closeParent(){ els.parent.classList.add('hidden');parentUnlocked=false;renderAuth(); }
  function renderParentGate(){ renderAuth(); }
  function renderParentDashboard(tab='today'){
    const tabs=[['today','Today'],['overview','Progress'],['curriculum','Curriculum'],['settings','Learner'],['connection','Connection']];
    els.parentDash.innerHTML=`<header class="parent-head"><div><small>PARENT · CONNECTED VIEW</small><h1>${esc(state.learner.name||'Learner')}’s Learning Buddy</h1></div><div class="parent-head-actions"><button id="refreshParent" class="round-button light" title="Refresh">↻</button><button id="closeParent" class="round-button light">✕</button></div></header><nav class="parent-tabs">${tabs.map(([id,label])=>`<button data-tab="${id}" class="parent-tab ${tab===id?'active':''}">${label}</button>`).join('')}</nav><main class="parent-body" id="parentBody"></main>`;
    document.getElementById('closeParent').onclick=closeParent;document.getElementById('refreshParent').onclick=async()=>{await refreshParentRemote(false);renderParentDashboard(tab);};els.parentDash.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>renderParentDashboard(b.dataset.tab));const body=document.getElementById('parentBody');
    if(tab==='today'){body.innerHTML=parentTodayHTML();wireParentToday();}
    if(tab==='overview')body.innerHTML=parentOverviewHTML();
    if(tab==='curriculum')body.innerHTML=parentCurriculumHTML();
    if(tab==='settings'){body.innerHTML=parentSettingsHTML();wireParentSettings();}
    if(tab==='connection'){body.innerHTML=parentConnectionHTML();wireParentConnection();}
  }
  function assignmentFor(date=localDateKey()){ return (parentSnapshot?.assignments||[]).find(a=>a.assigned_for===date)||null; }
  function parentTodayHTML(){
    const a=assignmentFor(),initialSubject=a?.subject&&SUBJECTS[a.subject]?a.subject:(SUBJECT_NAMES[0]||''),cfg=getSubjectConfig(initialSubject),units=cfg.units;
    const status=a?`<div class="assignment-status ${a.status}"><span>${a.status==='complete'?'✓':a.status==='in_progress'?'▶':'●'}</span><div><strong>${a.status==='complete'?'Completed':a.status==='in_progress'?'In progress':'Ready on learner device'}</strong><small>${esc(a.title||a.unit_title)}${a.result?.total?` · ${Math.round(a.result.correct/a.result.total*100)}%`:''}</small></div></div>`:`<div class="assignment-status empty"><span>＋</span><div><strong>No task set for today</strong><small>Choose one below. It will appear on the learner device automatically.</small></div></div>`;
    return `<section class="parent-today-hero"><div><span class="kicker">TODAY’S PLAN</span><h2>Set one clear task for ${esc(state.learner.name||'the learner')}.</h2><p>The child sees a welcome, your note and one large Start button. Subjects and lesson menus stay on the parent side.</p></div>${status}</section><div class="dashboard-grid parent-task-grid"><section class="admin-card"><h3>Set today’s lesson or task</h3><form id="assignTodayForm" class="form-grid"><div class="settings-grid"><div class="field"><label for="assignSubject">Subject</label><select id="assignSubject">${SUBJECT_NAMES.map(x=>`<option ${x===initialSubject?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label for="assignMode">Activity</label><select id="assignMode"><option value="module" ${a?.mode==='module'?'selected':''}>Learning module</option><option value="lesson" ${(!a||a?.mode==='lesson')?'selected':''}>Guided lesson</option><option value="quiz" ${a?.mode==='quiz'?'selected':''}>Quiz / test</option></select></div></div><div class="field"><label for="assignUnit">Topic</label><select id="assignUnit">${units.map(u=>`<option value="${esc(u.id)}" ${u.id===a?.unit_id?'selected':''}>${esc(u.title)}</option>`).join('')}</select></div><div class="field"><label for="assignTitle">What should today’s task be called?</label><input id="assignTitle" maxlength="100" value="${esc(a?.title||'Today’s learning task')}" placeholder="Today’s learning task"></div><button class="primary-button wide" type="submit">${a?'Update today’s task':'Send today’s task'} →</button></form></section><section class="admin-card parent-preview-card"><span class="eyebrow">CHILD VIEW PREVIEW</span><div class="preview-phone"><div class="preview-buddy"><img src="${currentBuddy().img}" alt=""><div><small>WELCOME BACK</small><strong>Hi, ${esc(state.learner.name||'Learner')}.</strong></div></div><div class="preview-task"><b id="previewTitle">${esc(a?.title||'Today’s learning task')}</b><button>Start →</button></div></div></section></div>`;
  }
  function wireParentToday(){
    const subject=document.getElementById('assignSubject'),unit=document.getElementById('assignUnit'),title=document.getElementById('assignTitle'),mode=document.getElementById('assignMode');
    const selectedUnit=()=>getSubjectConfig(subject.value).units.find(x=>x.id===unit.value);
    const updatePreview=()=>{const u=selectedUnit();document.getElementById('previewTitle').textContent=title.value.trim()||u?.title||'Today’s learning task';};
    const repopulate=()=>{const cfg=getSubjectConfig(subject.value);unit.innerHTML=cfg.units.map(u=>`<option value="${esc(u.id)}">${esc(u.title)}</option>`).join('');updatePreview();};
    subject.onchange=repopulate;unit.onchange=updatePreview;mode.onchange=updatePreview;title.oninput=updatePreview;
    updatePreview();
    document.getElementById('assignTodayForm').onsubmit=async e=>{e.preventDefault();const cfg=getSubjectConfig(subject.value),u=cfg.units.find(x=>x.id===unit.value);if(!u)return toast('Choose a topic.');try{await cloudRpc('lb_parent_assign',{p_parent_token:state.device.parentToken,p_assigned_for:localDateKey(),p_subject:subject.value,p_unit_id:u.id,p_unit_title:u.title,p_mode:mode.value,p_title:title.value.trim()||u.title,p_note:''});await refreshParentRemote(true);toast('Today’s task is ready on the learner device.');renderParentDashboard('today');}catch(err){toast(err.message||'Could not send the task.');}};
  }
  function parentOverviewHTML(){
    const answers=totalAnswers(),accuracy=answers?pct(totalCorrect(),answers):0,assignments=parentSnapshot?.assignments||[],done=assignments.filter(a=>a.status==='complete').length,recent=assignments.slice(0,8).map(a=>`<div class="recent-item"><div><strong>${esc(a.title||a.unit_title)}</strong><small>${esc(a.assigned_for)} · ${esc(a.subject)} · ${esc(modeLabel(a.mode))}</small></div><span class="score-chip">${a.status==='complete'?(a.result?.total?Math.round(a.result.correct/a.result.total*100)+'%':'Done'):a.status==='in_progress'?'Started':'Set'}</span></div>`).join('')||'<p class="muted">No assigned tasks yet.</p>';
    const subjectRows=SUBJECT_NAMES.map(s=>{const st=subjectStats(s),c=getSubjectConfig(s),p=subjectProgress(s);return `<div class="admin-subject-row"><div><strong>${esc(s)}</strong><br><small>${st.total?pct(st.correct,st.total)+'% accuracy · '+st.total+' checks':'No checks yet'}</small><div class="bar"><i style="width:${p}%;background:${c.accent}"></i></div></div><b>${p}%</b></div>`}).join('');
    return `<section class="admin-stats"><div class="admin-stat"><span>Assigned tasks</span><strong>${assignments.length}</strong></div><div class="admin-stat"><span>Completed</span><strong>${done}</strong></div><div class="admin-stat"><span>Knowledge checks</span><strong>${answers}</strong></div><div class="admin-stat"><span>Overall accuracy</span><strong>${answers?accuracy+'%':'—'}</strong></div></section><section class="dashboard-grid"><div class="admin-card"><h3>Subject progress</h3>${subjectRows}</div><div class="admin-card"><h3>Recent assigned work</h3><div class="recent-list">${recent}</div></div></section>`;
  }
  function parentCurriculumHTML(){
    const blocks=SUBJECT_NAMES.map(s=>{const cfg=getSubjectConfig(s);return `<details class="curriculum-subject"><summary>${esc(s)} — ${cfg.units.length} units</summary><div class="curriculum-units"><p class="muted" style="font-size:12px">${esc(cfg.standardsNote)}</p>${cfg.units.map(u=>`<div class="curriculum-unit"><span><b>${esc(u.title)}</b><br><small class="muted">${esc(u.summary)}</small></span><button class="tiny-assign" data-quick-subject="${esc(s)}" data-quick-unit="${esc(u.id)}">Set for today</button></div>`).join('')}</div></details>`}).join('');
    setTimeout(()=>document.querySelectorAll('[data-quick-subject]').forEach(b=>b.onclick=()=>{renderParentDashboard('today');setTimeout(()=>{const sel=document.getElementById('assignSubject');if(!sel)return;sel.value=b.dataset.quickSubject;sel.dispatchEvent(new Event('change'));document.getElementById('assignUnit').value=b.dataset.quickUnit;},0);}),0);
    return `<div class="admin-card"><h3>Grade 5 learning map</h3><p class="muted">Browse the curriculum here, then set a unit directly as today’s task.</p><div class="curriculum-table">${blocks}</div></div>`;
  }
  function parentSettingsHTML(){
    return `<div class="admin-card"><h3>Learner profile</h3><form id="parentSettingsForm" class="form-grid"><div class="field"><label>Learning buddy</label>${buddyChoices(currentBuddy().id,'adminBuddy')}</div><div class="field"><label for="adminName">Learner name</label><input id="adminName" maxlength="24" value="${esc(state.learner.name)}"></div><label class="toggle-line"><span><b>Read-aloud buttons</b><br><small class="muted">Useful inside guided learning.</small></span><input id="speechSetting" type="checkbox" ${state.settings.speech?'checked':''}></label><label class="toggle-line"><span><b>Hints in learning activities</b><br><small class="muted">Quiz/test mode still hides hints.</small></span><input id="hintSetting" type="checkbox" ${state.settings.hints?'checked':''}></label><button class="primary-button" type="submit">Save learner profile</button></form><hr style="border:0;border-top:1px solid var(--line);margin:24px 0"><h3>Parent device PIN</h3><form id="parentPinChange" class="form-grid"><div class="pin-row"><div class="field"><label for="newParentPin">New PIN</label><input id="newParentPin" inputmode="numeric" maxlength="6" required></div><div class="field"><label for="confirmParentPin">Confirm PIN</label><input id="confirmParentPin" inputmode="numeric" maxlength="6" required></div></div><button class="secondary-button" type="submit">Change PIN</button></form></div>`;
  }
  function wireParentSettings(){
    document.querySelectorAll('input[name="adminBuddy"]').forEach(r=>r.addEventListener('change',()=>document.querySelectorAll('#parentSettingsForm .buddy-option').forEach(o=>o.classList.toggle('selected',o.querySelector('input').checked))));
    document.getElementById('parentSettingsForm').onsubmit=async e=>{e.preventDefault();const name=document.getElementById('adminName').value.trim(),buddy=document.querySelector('input[name="adminBuddy"]:checked')?.value||state.learner.buddy;if(!name)return toast('Learner name cannot be blank.');try{await cloudRpc('lb_parent_update_profile',{p_parent_token:state.device.parentToken,p_learner_name:name,p_buddy_id:buddy});state.learner.name=name;state.learner.buddy=buddy;state.settings.speech=document.getElementById('speechSetting').checked;state.settings.hints=document.getElementById('hintSetting').checked;saveState();await refreshParentRemote(true);toast('Learner profile updated.');renderParentDashboard('settings');}catch(err){toast(err.message||'Could not save the profile.');}};
    document.getElementById('parentPinChange').onsubmit=async e=>{e.preventDefault();const a=document.getElementById('newParentPin').value,b=document.getElementById('confirmParentPin').value;if(!/^\d{4,6}$/.test(a))return toast('Parent PIN must be 4–6 digits.');if(a!==b)return toast('The PINs do not match.');state.parent.pinHash=await pinHash(a);saveState();toast('Parent PIN changed.');e.target.reset();};
  }
  function parentConnectionHTML(){
    const linked=!!parentSnapshot?.child_linked,code=state.device.familyCode||parentSnapshot?.family_code||'—',link=state.device.linkCode||'',invite=learnerInviteUrl();
    return `<div class="dashboard-grid"><section class="admin-card"><h3>Connect the learner device</h3><div class="connection-line"><span class="status-dot ${cloudReady()?'online':''}"></span><div><strong>${cloudReady()?'Learning Buddy cloud is connected':'Cloud setup needed'}</strong><small>${esc(cloudStatusText())}</small></div></div><div class="family-code"><small>FAMILY CODE</small><strong>${esc(code)}</strong></div><p class="muted">The easiest setup is to generate a temporary learner link, then send it to the child’s phone or tablet. The link expires after 24 hours and can only be claimed once.</p><button id="newLinkCode" class="primary-button">${linked?'Link a replacement learner device':'Generate learner setup link'}</button>${link?`<div class="link-code-result"><small>LEARNER LINK READY</small><strong>${esc(link)}</strong><span>Family ${esc(code)} · expires after 24 hours</span></div><button id="shareLearnerLink" class="secondary-button wide">Share learner setup link</button><button id="copyLearnerLink" class="link-button wide">Copy setup link</button>`:''}</section><section class="admin-card"><h3>Learner device</h3><div class="assignment-status ${linked?'complete':'empty'}"><span>${linked?'✓':'○'}</span><div><strong>${linked?'Learner device connected':'Not linked yet'}</strong><small>${linked?'Tasks and results sync across devices.':'Send the setup link, open it on the learner device, then tap Connect once.'}</small></div></div>${invite?`<p class="muted">If sharing is unavailable, use family code <b>${esc(code)}</b> and link code <b>${esc(link)}</b>.</p>`:''}<button id="resetParentDevice" class="danger-button">Disconnect this parent device</button></section></div>`;
  }
  async function shareLearnerSetupLink(copyOnly=false){
    const url=learnerInviteUrl(); if(!url) return toast('Generate a learner setup link first.');
    const text=`Open this Learning Buddy link on the learner device. The setup codes are filled in automatically.`;
    try{
      if(!copyOnly && navigator.share){ await navigator.share({title:'Learning Buddy learner setup',text,url}); return; }
      if(navigator.clipboard?.writeText){ await navigator.clipboard.writeText(url); toast('Learner setup link copied.'); return; }
    }catch(err){ if(err?.name==='AbortError') return; }
    window.prompt('Copy this learner setup link:',url);
  }
  function wireParentConnection(){
    document.getElementById('newLinkCode').onclick=async()=>{try{const data=await cloudRpc('lb_parent_regenerate_link',{p_parent_token:state.device.parentToken});state.device.linkCode=data.child_link_code;state.device.familyCode=data.family_code;saveState();toast('Learner setup link created.');renderParentDashboard('connection');}catch(err){toast(err.message||'Could not create a link code.');}};
    document.getElementById('shareLearnerLink')?.addEventListener('click',()=>shareLearnerSetupLink(false));
    document.getElementById('copyLearnerLink')?.addEventListener('click',()=>shareLearnerSetupLink(true));
    document.getElementById('resetParentDevice').onclick=()=>{if(confirm('Disconnect this parent phone from the family? This does not delete the cloud learner or their progress.')){state.device.parentToken='';state.device.role='';state.device.linkCode='';saveState();closeParent();}};
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
  const syncWhenVisible=()=>{
    if(document.hidden)return;
    if(state.device.role==='child'&&state.device.childToken&&learnerUnlocked)syncChild(true).then(()=>{if(currentView==='home')renderHome();});
    if(state.device.role==='parent'&&state.device.parentToken&&parentUnlocked)refreshParentRemote(true).then(()=>{if(!els.parent.classList.contains('hidden')){const tab=els.parentDash.querySelector('.parent-tab.active')?.dataset.tab||'today';renderParentDashboard(tab);}});
  };
  window.addEventListener('online',syncWhenVisible);
  window.addEventListener('focus',syncWhenVisible);
  document.addEventListener('visibilitychange',syncWhenVisible);

  renderAuth();
})();
