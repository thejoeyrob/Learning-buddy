const CACHE='nova-learning-grade5-v3';
const ASSETS=['./','./index.html','./styles.css','./app.js','./curriculum.js','./question-bank.js','./extras.js','./math-extras.js','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png','./assets/ms-nova.png','./assets/math.svg','./assets/ela.svg','./assets/science.svg','./assets/social.svg','./assets/cs.svg','./assets/health.svg','./assets/arts.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;}).catch(()=>caches.match('./index.html'))));});
