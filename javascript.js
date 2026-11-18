/* =====================================================================
   javascript.js — toàn bộ code GameHub, theo thứ tự:
   1) offline-firebase  — chế độ thử khi không có Firebase
   2) games-arcade      — 16 game arcade
      + 13 game bài & đối kháng (TG.*: Tài Xỉu, Bầu Cua, Xóc Đĩa, Xì Dách, Poker, Tiến Lên, Caro, Cờ Tướng…)
   3) nền tảng          — tên/avatar, phòng online, bàn chơi chung (TABLE), xếp hạng, quản trị, chat, điều hướng
   ===================================================================== */


/* #####################  OFFLINE-FIREBASE.JS  ##################### */
/* =====================================================================
   offline-firebase.js — chế độ thử khi không có Firebase
   Bắt chước Firebase Realtime DB (bản compat) bằng localStorage:
   chơi đơn, đấu AI, và nhiều tab trên cùng máy chơi với nhau.
   Chỉ bật khi Firebase không tải được hoặc URL có ?local=1.
   ===================================================================== */
(function(){
  if(window.firebase && !/[?&]local=1/.test(location.search)) return;
  const LK='fakefb';
  let MEM='{}';   // dự phòng khi trình duyệt chặn localStorage
  const read=()=>{ try{ return JSON.parse(localStorage.getItem(LK)||MEM)||{}; }catch(e){ try{ return JSON.parse(MEM); }catch(_){ return {}; } } };
  const write=t=>{ MEM=JSON.stringify(t); try{ localStorage.setItem(LK, MEM); }catch(e){} };
  const parts=p=>(p||'').split('/').filter(Boolean);
  const getAt=(t,p)=>{ let o=t; for(const k of parts(p)){ if(o==null||typeof o!=='object') return null; o=o[k]; } return o===undefined?null:o; };
  const TS={'.sv':'timestamp'};
  function norm(v){ // giống Firebase: bỏ null, bỏ object/array rỗng, thay timestamp
    if(v===undefined||v===null) return null;
    if(v && typeof v==='object' && v['.sv']==='timestamp') return Date.now();
    if(Array.isArray(v)){ const a=v.map(norm); if(a.every(x=>x===null)) return null; return a; }
    if(typeof v==='object'){ const o={}; let n=0; for(const k in v){ const x=norm(v[k]); if(x!==null){ o[k]=x; n++; } } return n?o:null; }
    return v;
  }
  function setAt(t,p,v){ const ks=parts(p); v=norm(v); if(!ks.length) return v||{}; let o=t, stack=[];
    for(let i=0;i<ks.length-1;i++){ if(o[ks[i]]==null||typeof o[ks[i]]!=='object') o[ks[i]]={}; stack.push([o,ks[i]]); o=o[ks[i]]; }
    if(v===null) delete o[ks[ks.length-1]]; else o[ks[ks.length-1]]=v;
    for(let i=stack.length-1;i>=0;i--){ const [par,k]=stack[i]; if(par[k] && typeof par[k]==='object' && !Object.keys(par[k]).length) delete par[k]; }
    return t; }
  const lock=fn=>{ try{ if(navigator.locks && navigator.locks.request) return navigator.locks.request('fakefb', async()=>fn()); }catch(e){} return Promise.resolve(fn()); };
  const L=new Set();
  function notify(){ const t=read(); for(const l of L){ const v=getAt(t,l.p), s=JSON.stringify(v); if(s!==l.last){ l.last=s; try{ l.cb(snap(l.p, v)); }catch(e){ console.error(e); } } } }
  addEventListener('storage', e=>{ if(e.key===LK) notify(); });
  const snap=(p,v)=>({ key:parts(p).slice(-1)[0]||null, val:()=>v==null?null:JSON.parse(JSON.stringify(v)), exists:()=>v!=null, forEach(f){ if(v&&typeof v==='object') for(const k in v) if(f(snap(p+'/'+k,v[k]))===true) return true; return false; } });
  const discs=[]; addEventListener('pagehide',()=>{ const t=read(); discs.forEach(([p,v])=>setAt(t,p,v)); write(t); });
  function Ref(p){ this.path=parts(p).join('/'); this.key=parts(p).slice(-1)[0]||null; }
  Ref.prototype={
    child(c){ return new Ref(this.path+'/'+c); },
    async set(v){ await lock(()=>write(setAt(read(),this.path,v))); notify(); },
    async update(o){ await lock(()=>{ const t=read(); for(const k in o) setAt(t,this.path+'/'+k,o[k]); write(t); }); notify(); },
    remove(){ return this.set(null); },
    push(v){ const k='-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); const r=new Ref(this.path+'/'+k); const pr=v===undefined?Promise.resolve():r.set(v); r.then=(a,b)=>pr.then(()=>a&&a(r),b); return r; },
    async once(){ if(this.path==='.info/serverTimeOffset') return snap(this.path,0); return snap(this.path, getAt(read(),this.path)); },
    on(ev,cb){ if(this.path==='.info/serverTimeOffset'){ setTimeout(()=>cb(snap(this.path,0)),0); return cb; } if(this.path==='.info/connected'){ setTimeout(()=>cb(snap(this.path,true)),0); return cb; }
      const v=getAt(read(),this.path), l={p:this.path,cb,last:JSON.stringify(v)}; L.add(l); setTimeout(()=>cb(snap(this.path,v)),0); return cb; },
    off(ev,cb){ for(const l of [...L]) if(l.p===this.path && (!cb||l.cb===cb)) L.delete(l); },
    onDisconnect(){ const p=this.path; return { set:async v=>{ discs.push([p,v]); }, remove:async()=>{ discs.push([p,null]); }, cancel:async()=>{ for(let i=discs.length-1;i>=0;i--) if(discs[i][0]===p) discs.splice(i,1); } }; },
    orderByChild(c){ const self=this; return { limitToLast(n){ return { once: async()=>{ const o=getAt(read(),self.path)||{}; const e=Object.entries(o).sort((a,b)=>(a[1][c]||0)-(b[1][c]||0)).slice(-n); return snap(self.path, Object.fromEntries(e)); } }; } }; },
  };
  const db={ ref:p=>new Ref(p||'') };
  const database=()=>db; database.ServerValue={TIMESTAMP:TS};
  window.firebase={ apps:[], initializeApp(c){ this.apps.push(c); return {}; }, database };
  window.__FAKEFB=true;
  // xóa phòng/online cũ hơn 1 ngày cho gọn
  try{ const t=read(), now=Date.now(); ['rooms'].forEach(k=>{ for(const id in (t[k]||{})) if(now-(t[k][id].ts||now)>864e5) delete t[k][id]; }); write(t); }catch(e){}
})();


/* #####################  GAMES-ARCADE.JS  ##################### */
/* =====================================================================
   games-arcade.js — 16 game arcade (Tháo Đinh, Sudoku, 2048, ...)
   Mỗi game là một module độc lập; gọi ARC.* để báo điểm/kết quả online.
   ===================================================================== */
var ARC = null;

const TD=(()=>{

const W = 400, H = 720;
const BOARD = { x: 12, y: 190, w: 376, h: 520 };
const SR = 13;
const COLORS = [
  { n: 'Đỏ',    c: '#ef4444', d: '#7f1d1d', l: '#fecaca' },
  { n: 'Xanh',  c: '#3b82f6', d: '#1e3a8a', l: '#bfdbfe' },
  { n: 'Lá',    c: '#22c55e', d: '#14532d', l: '#bbf7d0' },
  { n: 'Vàng',  c: '#facc15', d: '#854d0e', l: '#fef9c3' },
  { n: 'Tím',   c: '#a855f7', d: '#581c87', l: '#e9d5ff' },
  { n: 'Cam',   c: '#f97316', d: '#7c2d12', l: '#fed7aa' },
  { n: 'Hồng',  c: '#ec4899', d: '#831843', l: '#fbcfe8' },
  { n: 'Ngọc',  c: '#06b6d4', d: '#164e63', l: '#a5f3fc' },
];
const PLANK_HUES = [28, 200, 140, 260, 330, 45, 170, 10, 220, 90];

const cv = document.getElementById('td-c'), ctx = cv.getContext('2d');
let scale = 1, dpr = 1;
function resize() {
  const wrap = document.querySelector('#view-thao-dinh .wrap');
  const availW = Math.min(wrap.clientWidth, 460);
  const availH = window.innerHeight - document.querySelector('#view-thao-dinh .vhead').offsetHeight - document.querySelector('#view-thao-dinh .bar').offsetHeight - 30;
  scale = Math.max(0.45, Math.min(availW / W, availH / H));
  dpr = window.devicePixelRatio || 1;
  cv.style.width = W * scale + 'px'; cv.style.height = H * scale + 'px';
  cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
}
window.addEventListener('resize', ()=>{ if(active) resize(); });

// ---------- helpers ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
let rng = Math.random;
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
function toWorld(p, lx, ly){const c=Math.cos(p.a), s=Math.sin(p.a);return {x:p.cx+lx*c-ly*s, y:p.cy+lx*s+ly*c}}
function toLocal(p, x, y){const c=Math.cos(p.a), s=Math.sin(p.a), dx=x-p.cx, dy=y-p.cy;return {x:dx*c+dy*s, y:-dx*s+dy*c}}
function rr(x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function circle(x,y,r){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2)}
const ease = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;

// ---------- sound ----------
let AC = null;
function sfx(type){
  try{
    if(!AC) AC = new (window.AudioContext||window.webkitAudioContext)();
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    if(type==='pop'){o.type='triangle';o.frequency.setValueAtTime(520,t);o.frequency.exponentialRampToValueAtTime(980,t+.08);g.gain.setValueAtTime(.18,t);g.gain.exponentialRampToValueAtTime(.001,t+.15);o.start(t);o.stop(t+.16)}
    else if(type==='no'){o.type='square';o.frequency.setValueAtTime(160,t);g.gain.setValueAtTime(.08,t);g.gain.exponentialRampToValueAtTime(.001,t+.15);o.start(t);o.stop(t+.16)}
    else if(type==='box'){o.type='sine';o.frequency.setValueAtTime(660,t);o.frequency.setValueAtTime(880,t+.08);o.frequency.setValueAtTime(1320,t+.16);g.gain.setValueAtTime(.16,t);g.gain.exponentialRampToValueAtTime(.001,t+.35);o.start(t);o.stop(t+.36)}
    else if(type==='win'){o.type='sine';[523,659,784,1046].forEach((f,i)=>o.frequency.setValueAtTime(f,t+i*.11));g.gain.setValueAtTime(.18,t);g.gain.exponentialRampToValueAtTime(.001,t+.7);o.start(t);o.stop(t+.72)}
    else if(type==='lose'){o.type='sawtooth';o.frequency.setValueAtTime(300,t);o.frequency.exponentialRampToValueAtTime(90,t+.5);g.gain.setValueAtTime(.1,t);g.gain.exponentialRampToValueAtTime(.001,t+.55);o.start(t);o.stop(t+.56)}
  }catch(e){}
}

// ---------- level generation ----------
function cornersIn(p){
  for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
    const q = toWorld(p, sx*p.len/2, sy*p.w/2);
    if(q.x<BOARD.x+6||q.x>BOARD.x+BOARD.w-6||q.y<BOARD.y+6||q.y>BOARD.y+BOARD.h-6) return false;
  }
  return true;
}
function genLevel(L){
  rng = mulberry32(L*9973+17);
  const nPl = Math.min(4 + Math.floor(L*1.6), 18);
  const pts = [], planks = [];
  const angs = [0,0,Math.PI/2,Math.PI/2,Math.PI/4,-Math.PI/4,Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3];
  for(let i=0;i<nPl;i++){
    for(let tries=0;tries<250;tries++){
      const len = 105 + rng()*(L<4?150:125), w = 38;
      const p = { cx: BOARD.x+30+rng()*(BOARD.w-60), cy: BOARD.y+30+rng()*(BOARD.h-60), a: angs[Math.floor(rng()*angs.length)],
                  len, w, layer: planks.length, hue: PLANK_HUES[planks.length%PLANK_HUES.length], state:'fixed', omega:0, vy:0, spin:0, screws:[] };
      if(!cornersIn(p)) continue;
      const ex = len/2 - 20;
      const wp = [toWorld(p,-ex,0), toWorld(p,ex,0)];
      if(wp.some(q=>pts.some(o=>dist(q,o)<34))) continue;
      p.screws = [{lx:-ex,ly:0,removed:false,shake:0},{lx:ex,ly:0,removed:false,shake:0}];
      wp.forEach(q=>pts.push(q));
      planks.push(p); break;
    }
  }
  // make total a multiple of 3 by adding middle screws
  let total = planks.reduce((s,p)=>s+p.screws.length,0);
  let need = (3 - total%3) % 3;
  const order = shuffle(planks.slice());
  for(const strict of [true,false]){
    for(const p of order){
      if(!need) break;
      if(p.screws.length>2) continue;
      const q = toWorld(p,0,0);
      if(strict && pts.some(o=>dist(q,o)<34)) continue;
      p.screws.push({lx:0,ly:0,removed:false,shake:0}); pts.push(q); need--;
    }
  }
  total = planks.reduce((s,p)=>s+p.screws.length,0);
  const nBoxes = total/3;
  const nCol = Math.min(2 + Math.floor((L-1)/2), COLORS.length, nBoxes);
  const boxColors = [];
  for(let k=0;k<nBoxes;k++) boxColors.push(k % nCol);
  const screwColors = shuffle(boxColors.flatMap(c=>[c,c,c]));
  let k = 0;
  for(const p of shuffle(planks.slice())) for(const s of p.screws) s.color = screwColors[k++];
  return { planks, queue: shuffle(boxColors.slice()) };
}

// ---------- game state ----------
let S;
function savedLevel(){try{return Math.max(1, parseInt(localStorage.getItem('thaodinh_level'))||1)}catch(e){return 1}}
function saveLevel(l){try{localStorage.setItem('thaodinh_level', l)}catch(e){}}

function startLevel(L){
  const g = genLevel(L);
  S = { level:L, planks:g.planks, queue:g.queue, boxes:[null,null], cap:5, tray:[null,null,null,null,null],
        flights:[], hints:3, slots:1, over:false, hint:null, winTimer:-1, total: g.planks.reduce((s,p)=>s+p.screws.length,0), done:0 };
  S.boxes[0] = nextBox(); S.boxes[1] = nextBox();
  document.getElementById('td-lvl').textContent = 'Màn ' + L;
  hideOverlay(); updateButtons();
}
function nextBox(){ if(!S.queue.length) return null; return { color:S.queue.shift(), filled:0, reserved:0, appear:0, closing:-1 }; }

function boxRect(i){return {x:22+i*184, y:14, w:172, h:74}}
function boxSlot(i,j){const r=boxRect(i);return {x:r.x+36+j*50, y:r.y+46}}
function traySlot(j){const sp=Math.min(60, 352/S.cap);return {x:W/2+(j-(S.cap-1)/2)*sp, y:150}}

function screwWorld(p,s){return toWorld(p,s.lx,s.ly)}
function isBlocked(p,q){
  for(const o of S.planks){
    if(o.layer<=p.layer || o.state==='fall') continue;
    const l = toLocal(o,q.x,q.y);
    if(Math.abs(l.x) < o.len/2 + SR*0.55 && Math.abs(l.y) < o.w/2 + SR*0.55){
      // rounded ends: check capsule shape
      const hx = Math.max(0, Math.abs(l.x) - (o.len/2 - o.w/2));
      if(Math.hypot(hx, l.y) < o.w/2 + SR*0.55) return true;
    }
  }
  return false;
}
function acceptBox(color){
  for(let i=0;i<2;i++){const b=S.boxes[i]; if(b && b.closing<0 && b.color===color && b.filled+b.reserved<3) return i;}
  return -1;
}
function freeScrews(){
  const out=[];
  for(const p of S.planks){ if(p.state==='fall') continue;
    for(const s of p.screws){ if(s.removed) continue; const q=screwWorld(p,s); if(!isBlocked(p,q)) out.push({p,s,q}); } }
  return out;
}

function removeScrew(p,s,q){
  let dest = null;
  const bi = acceptBox(s.color);
  if(bi>=0){ const b=S.boxes[bi]; dest={type:'box', i:bi, slot:b.filled+b.reserved}; b.reserved++; }
  else { const j=S.tray.indexOf(null); if(j<0){ s.shake=.4; sfx('no'); return; }
         dest={type:'tray', j}; S.tray[j]={color:s.color, landed:false}; }
  s.removed = true; S.done++; if(ARC) ARC.prog('thao-dinh', Math.round(S.done*100/S.total));
  if(S.hint && S.hint.s===s) S.hint=null;
  const left = p.screws.filter(x=>!x.removed);
  if(left.length===0){ p.spin = p.state==='pivot'? p.omega : (Math.random()-.5)*3; p.state='fall'; p.vy = -60; }
  else if(left.length===1){ p.state='pivot'; p.pivot=left[0]; p.pivotW=screwWorld(p,left[0]); }
  S.flights.push({ x:q.x, y:q.y, color:s.color, rot:p.a, t:0, dur:.55, dest });
  sfx('pop');
}

function flightTarget(f){
  if(f.dest.type==='box') return boxSlot(f.dest.i, f.dest.slot);
  return traySlot(f.dest.j);
}
function land(f){
  if(f.dest.type==='box'){
    const b=S.boxes[f.dest.i]; b.reserved--; b.filled++;
    if(b.filled===3){ b.closing=0; sfx('box'); }
  } else {
    S.tray[f.dest.j].landed = true;
    sweepTray();
  }
}
function sweepTray(){
  for(let j=0;j<S.tray.length;j++){
    const t=S.tray[j]; if(!t||!t.landed) continue;
    const bi=acceptBox(t.color); if(bi<0) continue;
    const b=S.boxes[bi]; const from=traySlot(j);
    S.flights.push({ x:from.x, y:from.y, color:t.color, rot:0, t:.12, dur:.5, dest:{type:'box', i:bi, slot:b.filled+b.reserved} });
    b.reserved++; S.tray[j]=null;
  }
}

// ---------- input ----------
cv.addEventListener('pointerdown', e=>{
  if(S.over) return;
  const r = cv.getBoundingClientRect();
  const x = (e.clientX-r.left)/r.width*W, y = (e.clientY-r.top)/r.height*H;
  let best = null;
  for(const p of S.planks){ if(p.state==='fall') continue;
    for(const s of p.screws){ if(s.removed) continue;
      const q=screwWorld(p,s), d=Math.hypot(q.x-x,q.y-y);
      if(d<SR+9 && (!best || p.layer>best.p.layer || (p.layer===best.p.layer && d<best.d))) best={p,s,q,d}; } }
  if(!best) return;
  if(isBlocked(best.p,best.q)){ best.s.shake=.4; sfx('no'); flashCover(best.p,best.q); return; }
  removeScrew(best.p,best.s,best.q);
});
function flashCover(p,q){
  for(const o of S.planks){ if(o.layer<=p.layer||o.state==='fall') continue;
    const l=toLocal(o,q.x,q.y); if(Math.abs(l.x)<o.len/2+SR && Math.abs(l.y)<o.w/2+SR) o.flash=.5; }
}

document.getElementById('td-bRestart').onclick = ()=>startLevel(S.level);
document.getElementById('td-bHint').onclick = ()=>{
  if(S.over||S.hints<=0) return;
  const fs = freeScrews(); if(!fs.length) return;
  const good = fs.filter(f=>acceptBox(f.s.color)>=0);
  const pick = (good.length?good:fs)[0];
  S.hint = { s:pick.s, t:2.5 }; S.hints--; updateButtons();
};
document.getElementById('td-bSlot').onclick = ()=>addSlot();
function addSlot(){
  if(S.slots<=0) return;
  S.slots--; S.cap++; S.tray.push(null);
  if(S.over){ S.over=false; hideOverlay(); }
  updateButtons();
}
function updateButtons(){
  document.getElementById('td-hintN').textContent=S.hints;
  document.getElementById('td-slotN').textContent=S.slots;
  document.getElementById('td-bHint').disabled=S.hints<=0;
  document.getElementById('td-bSlot').disabled=S.slots<=0;
}

// ---------- overlay ----------
const ov=document.getElementById('td-overlay');
function showOverlay(icon,title,text,btns){
  document.getElementById('td-ovIcon').textContent=icon;
  document.getElementById('td-ovTitle').textContent=title;
  document.getElementById('td-ovText').textContent=text;
  const box=document.getElementById('td-ovBtns'); box.innerHTML='';
  btns.forEach(b=>{const el=document.createElement('button');el.textContent=b.label;el.className=b.cls||'';el.onclick=b.fn;box.appendChild(el)});
  ov.classList.remove('hidden');
}
function hideOverlay(){ov.classList.add('hidden')}

function checkEnd(){
  if(S.over || S.flights.length || S.boxes.some(b=>b&&b.closing>=0)) return;
  const allOut = S.planks.every(p=>p.screws.every(s=>s.removed));
  if(allOut && S.tray.every(t=>t===null)){
    if(S.winTimer<0) S.winTimer=.7;
    return;
  }
  if(S.tray.indexOf(null)<0){
    const canMove = freeScrews().some(f=>acceptBox(f.s.color)>=0);
    if(!canMove){
      S.over=true; sfx('lose');
      const btns=[];
      if(S.slots>0) btns.push({label:'＋ Thêm 1 ô để chơi tiếp', cls:'green', fn:addSlot});
      btns.push({label:'↺ Chơi lại màn '+S.level, cls:'primary', fn:()=>startLevel(S.level)});
      showOverlay('😵','Khay đầy rồi!','Không còn chỗ để đặt vít. Hãy để ý màu hộp trước khi tháo nhé.',btns);
    }
  }
}

// ---------- update ----------
function update(dt){
  for(const p of S.planks){
    if(p.flash>0) p.flash-=dt;
    for(const s of p.screws) if(s.shake>0) s.shake-=dt;
    if(p.state==='pivot'){
      const s=p.pivot, pv=p.pivotW;
      for(let k=0;k<2;k++){
        const h=dt/2, c=Math.cos(p.a), sn=Math.sin(p.a);
        const vx=-(s.lx*c - s.ly*sn), vy=-(s.lx*sn + s.ly*c), L=Math.hypot(vx,vy);
        if(L>4){ const phi=Math.atan2(vx,vy); p.omega += ((1500/L)*Math.sin(phi) - 1.6*p.omega)*h; p.a += p.omega*h; }
      }
      const c=Math.cos(p.a), sn=Math.sin(p.a);
      p.cx = pv.x - (s.lx*c - s.ly*sn); p.cy = pv.y - (s.lx*sn + s.ly*c);
    } else if(p.state==='fall' && !p.gone){
      p.vy += 1700*dt; p.cy += p.vy*dt; p.a += p.spin*dt;
      if(p.cy > H+300) p.gone = true;
    }
  }
  for(let i=S.flights.length-1;i>=0;i--){
    const f=S.flights[i]; f.t+=dt;
    if(f.t>=f.dur){ S.flights.splice(i,1); land(f); }
  }
  for(let i=0;i<2;i++){
    const b=S.boxes[i]; if(!b) continue;
    if(b.appear<1) b.appear=Math.min(1,b.appear+dt*3.5);
    if(b.closing>=0){ b.closing+=dt; if(b.closing>=.6){ S.boxes[i]=nextBox(); sweepTray(); } }
  }
  if(S.hint){ S.hint.t-=dt; if(S.hint.t<=0) S.hint=null; }
  if(S.winTimer>=0 && !S.over){
    S.winTimer-=dt;
    if(S.winTimer<0){
      S.over=true; sfx('win'); if(ARC) ARC.done('thao-dinh', ARC.inRace('thao-dinh') ? {} : {vk:'thao-dinh', v:S.level}); if(!(ARC && ARC.inRace('thao-dinh'))) saveLevel(S.level+1);
      showOverlay('🎉','Xuất sắc!','Bạn đã tháo hết '+S.total+' con vít ở màn '+S.level+'.',
        [{label:'Màn tiếp theo ▶', cls:'primary', fn:()=>startLevel(S.level+1)}]);
    }
  }
  checkEnd();
}

// ---------- draw ----------
function drawScrew(x,y,ci,sc=1,rot=0,alpha=1){
  const col=COLORS[ci];
  ctx.save(); ctx.globalAlpha*=alpha; ctx.translate(x,y); ctx.scale(sc,sc);
  ctx.fillStyle='rgba(0,0,0,.35)'; circle(1.5,3,SR); ctx.fill();
  ctx.rotate(rot);
  const g=ctx.createRadialGradient(-4,-5,1,0,0,SR); g.addColorStop(0,col.l); g.addColorStop(.55,col.c); g.addColorStop(1,col.c);
  ctx.fillStyle=g; circle(0,0,SR); ctx.fill();
  ctx.lineWidth=2; ctx.strokeStyle=col.d; ctx.stroke();
  ctx.strokeStyle=col.d; ctx.lineWidth=3.4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-5.5,0); ctx.lineTo(5.5,0); ctx.moveTo(0,-5.5); ctx.lineTo(0,5.5); ctx.stroke();
  ctx.restore();
}
function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#3b4a63'); g.addColorStop(1,'#1e293b');
  ctx.fillStyle=g; rr(0,0,W,H,18); ctx.fill();
}
function drawBoxes(){
  for(let i=0;i<2;i++){
    const r=boxRect(i), b=S.boxes[i];
    // placeholder
    ctx.fillStyle='rgba(15,23,42,.35)'; rr(r.x,r.y,r.w,r.h,16); ctx.fill();
    if(!b){ ctx.fillStyle='rgba(148,163,184,.5)'; ctx.font='700 15px "Baloo 2"'; ctx.textAlign='center'; ctx.fillText('✓ Xong', r.x+r.w/2, r.y+r.h/2+5); continue; }
    const col=COLORS[b.color];
    ctx.save();
    let sc=.6+.4*ease(b.appear), dy=0, alpha=b.appear;
    if(b.closing>=0){ const u=Math.max(0,(b.closing-.25)/.35); dy=-40*ease(u); alpha=1-u; }
    ctx.globalAlpha=alpha;
    ctx.translate(r.x+r.w/2, r.y+r.h/2+dy); ctx.scale(sc,sc); ctx.translate(-(r.x+r.w/2), -(r.y+r.h/2));
    ctx.fillStyle=col.d; rr(r.x,r.y+4,r.w,r.h,16); ctx.fill();
    const g=ctx.createLinearGradient(0,r.y,0,r.y+r.h); g.addColorStop(0,col.l); g.addColorStop(.35,col.c); g.addColorStop(1,col.c);
    ctx.fillStyle=g; rr(r.x,r.y,r.w,r.h,16); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.9)'; ctx.font='800 13px "Baloo 2"'; ctx.textAlign='center';
    ctx.fillText('HỘP '+col.n.toUpperCase()+'  '+b.filled+'/3', r.x+r.w/2, r.y+19);
    for(let j=0;j<3;j++){ const s=boxSlot(i,j); ctx.fillStyle='rgba(0,0,0,.35)'; circle(s.x,s.y,SR+2); ctx.fill(); }
    for(let j=0;j<b.filled;j++){ const s=boxSlot(i,j); drawScrew(s.x,s.y,b.color,.92); }
    if(b.closing>=0){ // lid
      const u=Math.min(1,b.closing/.25);
      ctx.fillStyle=col.d; rr(r.x-4, r.y-30+30*ease(u), r.w+8, 22, 10); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.25)'; rr(r.x+6, r.y-26+30*ease(u), r.w-12, 5, 3); ctx.fill();
    }
    ctx.restore();
  }
  // next preview
  ctx.textAlign='left'; ctx.font='700 13px "Baloo 2"'; ctx.fillStyle='#cbd5e1';
  ctx.fillText('Tiếp theo:', 24, 106);
  const nx=S.queue.slice(0,7);
  nx.forEach((c,k)=>{ctx.fillStyle=COLORS[c].c; circle(100+k*20,102,6.5); ctx.fill(); ctx.strokeStyle=COLORS[c].d; ctx.lineWidth=1.5; ctx.stroke();});
  if(S.queue.length>7){ctx.fillStyle='#94a3b8'; ctx.fillText('+'+(S.queue.length-7), 100+7*20-4, 106);}
  if(!nx.length){ctx.fillStyle='#64748b'; ctx.fillText('hết', 100, 106);}
  ctx.textAlign='right'; ctx.fillStyle='#cbd5e1';
  ctx.fillText('Vít: '+S.done+'/'+S.total, W-24, 106);
}
function drawTray(){
  const full = S.tray.indexOf(null)<0;
  ctx.fillStyle = full ? 'rgba(127,29,29,.75)' : 'rgba(15,23,42,.6)'; rr(14,118,W-28,64,18); ctx.fill();
  ctx.strokeStyle = full ? '#f87171' : 'rgba(148,163,184,.35)'; ctx.lineWidth=2; ctx.stroke();
  for(let j=0;j<S.cap;j++){
    const s=traySlot(j);
    ctx.fillStyle='rgba(0,0,0,.45)'; circle(s.x,s.y,SR+3); ctx.fill();
    ctx.strokeStyle='rgba(148,163,184,.25)'; ctx.lineWidth=1.5; ctx.stroke();
    const t=S.tray[j]; if(t&&t.landed) drawScrew(s.x,s.y,t.color,.92);
  }
  ctx.textAlign='left'; ctx.font='700 11px "Baloo 2"'; ctx.fillStyle='rgba(203,213,225,.6)';
  ctx.fillText('KHAY CHỜ', 26, 132);
}
function drawBoard(){
  ctx.save();
  const g=ctx.createLinearGradient(0,BOARD.y,0,BOARD.y+BOARD.h); g.addColorStop(0,'#c4a27a'); g.addColorStop(1,'#a5835c');
  ctx.fillStyle=g; rr(BOARD.x,BOARD.y,BOARD.w,BOARD.h,18); ctx.fill();
  ctx.clip();
  ctx.fillStyle='rgba(80,50,20,.18)';
  for(let x=BOARD.x+12;x<BOARD.x+BOARD.w;x+=24) for(let y=BOARD.y+12;y<BOARD.y+BOARD.h;y+=24){ circle(x,y,2.2); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle='#7c5a36'; ctx.lineWidth=4; rr(BOARD.x,BOARD.y,BOARD.w,BOARD.h,18); ctx.stroke();
}
function drawPlanks(time){
  for(const p of S.planks){
    if(p.gone) continue;
    ctx.save(); ctx.translate(p.cx,p.cy); ctx.rotate(p.a);
    // shadow
    ctx.fillStyle='rgba(40,20,0,.25)'; rr(-p.len/2+3,-p.w/2+5,p.len,p.w,p.w/2); ctx.fill();
    ctx.fillStyle=`hsla(${p.hue},70%,70%,.84)`; rr(-p.len/2,-p.w/2,p.len,p.w,p.w/2); ctx.fill();
    ctx.lineWidth=2.5; ctx.strokeStyle = p.flash>0 ? `rgba(239,68,68,${.4+.6*Math.abs(Math.sin(time*25))})` : `hsla(${p.hue},50%,36%,.95)`;
    if(p.flash>0) ctx.lineWidth=4;
    ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.3)'; rr(-p.len/2+10,-p.w/2+5,p.len-20,5,3); ctx.fill();
    for(const s of p.screws){
      ctx.fillStyle='rgba(30,20,10,.65)'; circle(s.lx,s.ly,10.5); ctx.fill();
      ctx.strokeStyle=`hsla(${p.hue},45%,30%,.9)`; ctx.lineWidth=1.5; ctx.stroke();
    }
    ctx.restore();
    for(const s of p.screws){
      if(s.removed) continue;
      const q=screwWorld(p,s);
      const sx = s.shake>0 ? Math.sin(s.shake*70)*3.5 : 0;
      drawScrew(q.x+sx,q.y,s.color,1,p.a);
      if(S.hint && S.hint.s===s){
        ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.globalAlpha=.6+.4*Math.sin(time*10);
        circle(q.x,q.y,SR+6+3*Math.sin(time*10)); ctx.stroke(); ctx.globalAlpha=1;
      }
    }
  }
}
function drawFlights(){
  for(const f of S.flights){
    const u=Math.min(1,f.t/f.dur), tg=flightTarget(f);
    let x,y,sc,rot;
    if(u<.25){ const k=u/.25; x=f.x; y=f.y-8*k; sc=1+.35*k; rot=f.rot+k*8; }
    else { const v=ease((u-.25)/.75); x=f.x+(tg.x-f.x)*v; y=(f.y-8)+(tg.y-f.y+8)*v-70*Math.sin(Math.PI*v); sc=1.35-.43*v; rot=f.rot+8+v*6; }
    drawScrew(x,y,f.color,sc,rot);
  }
}
let last=performance.now(), running=false, active=false;
function frame(now){
  if(!active){running=false;return;}
  const dt=Math.min(1/30,(now-last)/1000); last=now;
  update(dt);
  ctx.setTransform(scale*dpr,0,0,scale*dpr,0,0);
  ctx.clearRect(0,0,W,H);
  drawBackground(); drawBoard(); drawPlanks(now/1000); drawBoxes(); drawTray(); drawFlights();
  requestAnimationFrame(frame);
}
startLevel(savedLevel());
return {
  race(o){ startLevel(o.level||1); },
  activate(){ active=true; resize(); last=performance.now(); if(!running){running=true;requestAnimationFrame(frame);} },
  deactivate(){ active=false; },
  best(){ return savedLevel(); }
};

})();



/* ================= SUDOKU ================= */
const SD = (() => {
  const $ = id => document.getElementById(id);
  const LEVELS = [
    { k:'easy',   n:'Dễ',          clues:42, c:'#16a34a', s:'#14532d', st:'★' },
    { k:'medium', n:'Trung bình',  clues:35, c:'#0891b2', s:'#164e63', st:'★★' },
    { k:'hard',   n:'Khó',         clues:30, c:'#2563eb', s:'#1e3a8a', st:'★★★' },
    { k:'expert', n:'Chuyên gia',  clues:26, c:'#9333ea', s:'#581c87', st:'★★★★' },
    { k:'master', n:'Siêu khó',    clues:22, c:'#dc2626', s:'#7f1d1d', st:'★★★★★' },
  ];
  const MAXHINT = 3;
  let st = null, active = false, cells = [], padBtns = [];

  // ---------- storage (localStorage + in-memory fallback) ----------
  const MEM = {};
  function load(k, d){ try{ const v = localStorage.getItem(k); if(v) return JSON.parse(v); }catch(e){} return k in MEM ? JSON.parse(MEM[k]) : d; }
  function save(k, v){ const s=JSON.stringify(v); MEM[k]=s; try{ localStorage.setItem(k, s); }catch(e){} }
  const stats = () => load('sd_stats', {});
  const saves = () => load('sd_saves', {});   // { levelKey: gameState } — one unfinished game per level
  function latestSave(){ const s=saves(); let best=null; for(const k in s){ if(!best || (s[k].updated||0)>(best.updated||0)) best=s[k]; } return best; }

  // ---------- solver / generator ----------
  const R = i => (i/9)|0, C = i => i%9, B = i => ((R(i)/3)|0)*3 + ((C(i)/3)|0);
  const PEERS = [];
  for(let i=0;i<81;i++){ const s=new Set(); for(let j=0;j<81;j++) if(j!==i && (R(j)===R(i)||C(j)===C(i)||B(j)===B(i))) s.add(j); PEERS.push([...s]); }
  const pop = m => { let n=0; while(m){ m&=m-1; n++; } return n; };
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

  function countSolutions(g, limit){
    g = g.slice();
    const rows=new Array(9).fill(0), cols=new Array(9).fill(0), boxes=new Array(9).fill(0);
    for(let i=0;i<81;i++) if(g[i]){ const b=1<<g[i]; if((rows[R(i)]|cols[C(i)]|boxes[B(i)])&b) return 0; rows[R(i)]|=b; cols[C(i)]|=b; boxes[B(i)]|=b; }
    let count = 0;
    (function rec(){
      if(count>=limit) return;
      let best=-1, bm=0, bn=10;
      for(let i=0;i<81;i++){ if(g[i]) continue;
        const m = ~(rows[R(i)]|cols[C(i)]|boxes[B(i)]) & 0x3FE, n = pop(m);
        if(n<bn){ bn=n; best=i; bm=m; if(n===0) return; } }
      if(best<0){ count++; return; }
      const r=R(best), c=C(best), bx=B(best);
      for(let d=1; d<=9; d++){ const b=1<<d; if(!(bm&b)) continue;
        g[best]=d; rows[r]|=b; cols[c]|=b; boxes[bx]|=b;
        rec();
        g[best]=0; rows[r]&=~b; cols[c]&=~b; boxes[bx]&=~b;
        if(count>=limit) return; }
    })();
    return count;
  }
  function fullGrid(){
    const g = new Array(81).fill(0);
    (function rec(i){
      if(i===81) return true;
      const ds = shuffle([1,2,3,4,5,6,7,8,9]);
      for(const d of ds){ if(PEERS[i].some(j=>g[j]===d)) continue; g[i]=d; if(rec(i+1)) return true; }
      g[i]=0; return false;
    })(0);
    return g;
  }
  function generate(clues){
    let bestPuz=null, bestSol=null, bestN=99;
    for(let attempt=0; attempt<(clues<=26?6:1); attempt++){
      const sol = fullGrid(), puz = sol.slice();
      let filled = 81;
      // remove in symmetric pairs first for a nicer look, then singles
      const order = shuffle([...Array(41).keys()]);
      for(const i of order){ if(filled<=clues) break;
        const j = 80-i, vi=puz[i], vj=puz[j];
        puz[i]=0; puz[j]=0;
        if(countSolutions(puz,2)===1) filled -= (i===j?1:2); else { puz[i]=vi; puz[j]=vj; } }
      for(const i of shuffle([...Array(81).keys()])){ if(filled<=clues) break; if(!puz[i]) continue;
        const v=puz[i]; puz[i]=0;
        if(countSolutions(puz,2)===1) filled--; else puz[i]=v; }
      if(filled<bestN){ bestN=filled; bestPuz=puz; bestSol=sol; }
      if(filled<=clues) break;
    }
    return { puz:bestPuz, sol:bestSol };
  }

  // ---------- views ----------
  function fmt(t){ const m=Math.floor(t/60), s=t%60; return (m<10?'0':'')+m+':'+(s<10?'0':'')+s; }
  function showPick(){
    $('sd-pick').style.display='block'; $('sd-game').style.display='none';
    $('sd-lvname').textContent='Chọn cấp';
    const s = stats(), sv = saves(), box=$('sd-levels'); box.innerHTML='';
    LEVELS.forEach((L,idx)=>{
      const x = s[L.k]||{}, g = sv[L.k];
      const row = document.createElement('div'); row.className='lvrow';
      const b = document.createElement('button'); b.className='lvbtn'; b.style.setProperty('--c',L.c); b.style.setProperty('--s',L.s);
      const rec = x.wins ? 'Thắng '+x.wins+' ván<br>Tốt nhất '+fmt(x.best) : 'Chưa thắng ván nào';
      const prog = g ? `<br><span class="paused">⏸ Đang dở · ${progress(g)}% · ${fmt(g.time)}</span>` : '';
      b.innerHTML = `<span>${L.n}<br><span class="stars">${L.st}</span></span><small>${rec}${prog}</small>`;
      b.onclick = ()=> g ? resume(g) : newGame(idx);
      row.appendChild(b);
      if(g){ const n=document.createElement('button'); n.className='newbtn'; n.innerHTML='<b>↻</b>Ván mới'; n.onclick=()=>newGame(idx); row.appendChild(n); }
      box.appendChild(row);
    });
    const last = latestSave(), rb = $('sd-resume');
    if(last){ rb.style.display='block'; rb.textContent='▶ Chơi tiếp ván '+LEVELS[last.level].n+' đang dở ('+progress(last)+'% · '+fmt(last.time)+')'; rb.onclick=()=>resume(last); }
    else rb.style.display='none';
  }
  function progress(g){ let n=0,e=0; for(let i=0;i<81;i++) if(!g.puz[i]){ e++; if(g.val[i]===g.sol[i]) n++; } return e? Math.floor(n*100/e) : 100; }
  function resume(g){ st=g; st.sel=-1; startView(); }
  function newGame(idx){
    const box=$('sd-levels'); box.style.opacity=.5;
    setTimeout(()=>{
      const g = generate(LEVELS[idx].clues);
      st = { level:idx, puz:g.puz, sol:g.sol, val:g.puz.slice(), notes:new Array(81).fill(0), hinted:[],
             sel:-1, mis:0, hints:MAXHINT, time:0, notesMode:false, hist:[], over:false, id:Date.now()+'-'+Math.random() };
      persist();
      box.style.opacity=1;
      startView();
    }, 30);
  }
  function startView(){
    $('sd-pick').style.display='none'; $('sd-game').style.display='flex';
    $('sd-lvname').textContent = LEVELS[st.level].n;
    hideOv();
    if(st.over) showResult();
    render();
  }

  // ---------- build board ----------
  function build(){
    const bd=$('sd-board');
    for(let i=0;i<81;i++){
      const d=document.createElement('div'); d.className='cell';
      if(C(i)===2||C(i)===5) d.classList.add('br');
      if(R(i)===2||R(i)===5) d.classList.add('bb');
      if(C(i)===8) d.style.borderRight='none';
      if(R(i)===8) d.style.borderBottom='none';
      d.addEventListener('pointerdown', e=>{ e.preventDefault(); if(st && !st.over){ st.sel=i; render(); } });
      bd.appendChild(d); cells.push(d);
    }
    const pad=$('sd-pad');
    for(let d=1; d<=9; d++){ const b=document.createElement('button'); b.innerHTML=d+'<small></small>'; b.onclick=()=>input(d); pad.appendChild(b); padBtns.push(b); }
    $('sd-undo').onclick=undo; $('sd-erase').onclick=erase; $('sd-hint').onclick=hint;
    $('sd-notes').onclick=()=>{ if(!st) return; st.notesMode=!st.notesMode; render(); };
    $('sd-back').onclick=()=>{ if($('sd-game').style.display!=='none'){ persist(); showPick(); } else go(''); };
    document.addEventListener('keydown', e=>{
      if(!active || !st || $('sd-game').style.display==='none' || st.over) return;
      if(e.key>='1'&&e.key<='9'){ input(+e.key); e.preventDefault(); }
      else if(e.key==='Backspace'||e.key==='Delete'||e.key==='0'){ erase(); e.preventDefault(); }
      else if(e.key==='n'||e.key==='N'){ st.notesMode=!st.notesMode; render(); }
      else if(e.key==='z' && (e.ctrlKey||e.metaKey)){ undo(); e.preventDefault(); }
      else if(e.key.startsWith('Arrow')){
        let s = st.sel<0 ? 40 : st.sel, r=R(s), c=C(s);
        if(e.key==='ArrowUp') r=(r+8)%9; if(e.key==='ArrowDown') r=(r+1)%9;
        if(e.key==='ArrowLeft') c=(c+8)%9; if(e.key==='ArrowRight') c=(c+1)%9;
        st.sel=r*9+c; render(); e.preventDefault();
      }
    });
    setInterval(()=>{ if(active && st && !st.over && $('sd-game').style.display!=='none' && !document.hidden){ st.time++; $('sd-time').textContent=fmt(st.time); if(st.time%5===0) persist(); } }, 1000);
  }

  // ---------- actions ----------
  const snap = () => st.hist.push({ val:st.val.slice(), notes:st.notes.slice() });
  function input(d){
    if(!st||st.over||st.sel<0||st.puz[st.sel]) return;
    const i=st.sel;
    if(st.val[i] && st.val[i]===st.sol[i]) return; // correct cell is locked
    if(st.notesMode){
      if(st.val[i]) return;
      snap(); st.notes[i]^=(1<<d); render(); persist(); return;
    }
    if(d!==st.sol[i]){
      // wrong move: not filled in — shake the cell, flash the number, count a mistake
      st.mis++;
      const c=cells[i]; c.classList.remove('bad'); void c.offsetWidth; c.classList.add('bad');
      const old=c.querySelector('.badnum'); if(old) old.remove();
      const bn=document.createElement('div'); bn.className='badnum'; bn.textContent=d; c.appendChild(bn);
      setTimeout(()=>{ bn.remove(); c.classList.remove('bad'); }, 600);
      $('sd-mis').textContent=st.mis; persist(); return;
    }
    snap();
    st.val[i]=d; st.notes[i]=0;
    for(const j of PEERS[i]) st.notes[j]&=~(1<<d);
    flashUnits(i); if(ARC) ARC.prog('sudoku', progress(st));
    render(); checkWin(); persist();
  }
  function flashUnits(i){
    const groups=[ [...Array(9).keys()].map(c=>R(i)*9+c), [...Array(9).keys()].map(r=>r*9+C(i)),
                   [...Array(81).keys()].filter(j=>B(j)===B(i)) ];
    for(const g of groups) if(g.every(j=>st.val[j]===st.sol[j])) g.forEach(j=>{ cells[j].classList.remove('flash'); void cells[j].offsetWidth; cells[j].classList.add('flash'); });
  }
  function erase(){
    if(!st||st.over||st.sel<0||st.puz[st.sel]) return;
    const i=st.sel;
    if(st.val[i] && st.val[i]===st.sol[i]) return;
    if(!st.val[i] && !st.notes[i]) return;
    snap(); if(st.val[i]) st.val[i]=0; else st.notes[i]=0;
    render(); persist();
  }
  function undo(){
    if(!st||st.over||!st.hist.length) return;
    const h=st.hist.pop(); st.val=h.val; st.notes=h.notes; render(); persist();
  }
  function hint(){
    if(!st||st.over||st.hints<=0) return;
    let i = st.sel;
    if(i<0 || st.val[i]===st.sol[i]){
      const empty=[...Array(81).keys()].filter(j=>st.val[j]!==st.sol[j]);
      if(!empty.length) return;
      i = empty[Math.floor(Math.random()*empty.length)];
    }
    snap(); st.val[i]=st.sol[i]; st.notes[i]=0; st.hinted.push(i); st.hints--; st.sel=i;
    for(const j of PEERS[i]) st.notes[j]&=~(1<<st.sol[i]);
    flashUnits(i); if(ARC) ARC.prog('sudoku', progress(st)); render(); checkWin(); persist();
  }
  function checkWin(){
    if(st.val.every((v,i)=>v===st.sol[i])){
      st.over='win'; if(ARC) ARC.done('sudoku', {vk:'sudoku-'+LEVELS[st.level].k, v:st.time});
      const s=stats(), k=LEVELS[st.level].k, x=s[k]||{wins:0,best:0};
      x.wins=(x.wins||0)+1; st.newBest = !x.best || st.time<x.best; if(st.newBest) x.best=st.time;
      s[k]=x; save('sd_stats',s); persist(); showResult();
    }
  }
  function persist(){
    if(!st) return;
    const s=saves(), k=LEVELS[st.level].k;
    if(st.over) { if(s[k] && s[k].id===st.id) delete s[k]; }
    else { st.updated=Date.now(); s[k]=st; }
    save('sd_saves', s);
  }

  // ---------- overlay ----------
  function showOv(icon,title,text,btns){
    $('sd-ovIcon').textContent=icon; $('sd-ovTitle').textContent=title; $('sd-ovText').textContent=text;
    const b=$('sd-ovBtns'); b.innerHTML='';
    btns.forEach(x=>{ const e=document.createElement('button'); e.textContent=x.label; e.className=x.cls||''; e.onclick=x.fn; b.appendChild(e); });
    $('sd-overlay').classList.remove('hidden');
  }
  function hideOv(){ $('sd-overlay').classList.add('hidden'); }
  function showResult(){
    const L=LEVELS[st.level];
    const next = Math.min(st.level+1, LEVELS.length-1);
    if(st.over==='win'){
      const btns=[{label:'Ván mới — '+L.n, cls:'primary', fn:()=>newGame(st.level)}];
      if(st.level<LEVELS.length-1) btns.push({label:'Thử cấp '+LEVELS[next].n+' ▶', cls:'green', fn:()=>newGame(next)});
      btns.push({label:'Chọn cấp độ', fn:()=>{ hideOv(); showPick(); }});
      showOv('🏆','Hoàn thành!', `Cấp ${L.n} · ${fmt(st.time)}${st.newBest?' · Kỷ lục mới!':''} · ${st.mis} lỗi`, btns);
    }
  }

  // ---------- render ----------
  function render(){
    if(!st) return;
    const sel=st.sel, sv = sel>=0 ? st.val[sel] : 0;
    const counts=new Array(10).fill(0);
    for(let i=0;i<81;i++) if(st.val[i] && st.val[i]===st.sol[i]) counts[st.val[i]]++;
    for(let i=0;i<81;i++){
      const d=cells[i], v=st.val[i];
      let cls='cell'+((C(i)===2||C(i)===5)?' br':'')+((R(i)===2||R(i)===5)?' bb':'');
      if(st.puz[i]) cls+=' given';
      else if(v && v!==st.sol[i]) cls+=' wrong';
      else if(st.hinted.includes(i)) cls+=' hinted';
      if(i===sel) cls+=' sel';
      else if(sv && v===sv) cls+=' same';
      else if(sel>=0 && (R(i)===R(sel)||C(i)===C(sel)||B(i)===B(sel))) cls+=' peer';
      if(d.classList.contains('flash')) cls+=' flash';
      d.className=cls;
      if(v){ d.textContent=v; }
      else if(st.notes[i]){
        let h='<div class="notes">';
        for(let k=1;k<=9;k++) h+= `<span class="${sv===k?'hl':''}">${st.notes[i]&(1<<k)?k:''}</span>`;
        d.innerHTML=h+'</div>';
      } else d.textContent='';
    }
    padBtns.forEach((b,k)=>{ const n=k+1; b.classList.toggle('done', counts[n]>=9); b.querySelector('small').textContent = 9-counts[n]; });
    $('sd-mis').textContent=st.mis;
    $('sd-hn').textContent=st.hints;
    $('sd-time').textContent=fmt(st.time);
    $('sd-notes').classList.toggle('on', st.notesMode);
    $('sd-hint').disabled = st.hints<=0;
  }

  build();
  return {
    race(o){ hideOv(); newGame(o.level||0); },
    activate(){ active=true; if(st && !st.over && $('sd-game').style.display!=='none') render(); else showPick(); },
    deactivate(){ active=false; persist(); },
    summary(){ const s=stats(); const w=Object.values(s).reduce((a,x)=>a+(x.wins||0),0); return w? 'Đã thắng '+w+' ván' : 'Chưa chơi'; },
    _gen: generate, _count: countSolutions
  };
})();

/* ================= SHARED HELPERS ================= */
const store = {
  _m:{},
  get(k,d){ try{ const v=localStorage.getItem(k); if(v!=null) return JSON.parse(v); }catch(e){} return k in this._m ? JSON.parse(this._m[k]) : d; },
  set(k,v){ const s=JSON.stringify(v); this._m[k]=s; try{ localStorage.setItem(k,s); }catch(e){} }
};
function mkOverlay(id){
  const el=document.getElementById(id);
  return {
    show(icon,title,text,btns){
      el.innerHTML='';
      const c=document.createElement('div'); c.className='card';
      c.innerHTML=`<div class="ic">${icon}</div><h2>${title}</h2><p>${text}</p>`;
      btns.forEach(b=>{ const e=document.createElement('button'); e.textContent=b.label; e.className=b.cls||''; e.onclick=b.fn; c.appendChild(e); });
      el.appendChild(c); el.classList.remove('hidden');
    },
    hide(){ el.classList.add('hidden'); },
    get on(){ return !el.classList.contains('hidden'); }
  };
}
const fmtT = t => String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
function shuf(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function onSwipe(el, cb){
  let sx=0, sy=0, pid=null;
  el.addEventListener('pointerdown', e=>{ pid=e.pointerId; sx=e.clientX; sy=e.clientY; });
  el.addEventListener('pointerup', e=>{
    if(pid!==e.pointerId) return; pid=null;
    const dx=e.clientX-sx, dy=e.clientY-sy;
    if(Math.max(Math.abs(dx),Math.abs(dy))<22){ cb('tap',e); return; }
    cb(Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up'), e);
  });
}
const KEYDIR = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right' };

/* ================= 2048 ================= */
const G2048 = (() => {
  const $=id=>document.getElementById(id), ov=mkOverlay('g2-ov'), board=$('g2-board');
  const COL={2:['#eee4da','#776e65'],4:['#ede0c8','#776e65'],8:['#f2b179','#fff'],16:['#f59563','#fff'],32:['#f67c5f','#fff'],64:['#f65e3b','#fff'],128:['#edcf72','#fff'],256:['#edcc61','#fff'],512:['#edc850','#fff'],1024:['#edc53f','#fff'],2048:['#edc22e','#fff']};
  let tiles=[], score=0, best=store.get('g2_best',0), won=false, over=false, nid=1, busy=false, undoSnap=null;
  const divs=new Map();
  for(let i=0;i<16;i++){ const b=document.createElement('div'); b.className='bg'; board.appendChild(b); }
  const geom=()=>{ const W=board.clientWidth, gap=W*.025; return { gap, cell:(W-gap*5)/4 }; };
  const pos=(r,c,g)=>[g.gap+c*(g.cell+g.gap), g.gap+r*(g.cell+g.gap)];
  function layoutBg(){ const g=geom(); board.querySelectorAll('.bg').forEach((b,i)=>{ const [x,y]=pos(i>>2,i&3,g); b.style.cssText=`width:${g.cell}px;height:${g.cell}px;transform:translate(${x}px,${y}px)`; }); }
  function render(){
    const g=geom(), alive=new Set();
    for(const t of tiles){
      alive.add(t.id);
      let d=divs.get(t.id);
      if(!d){ d=document.createElement('div'); d.className='tile'; d.innerHTML='<div class="in"></div>'; board.appendChild(d); divs.set(t.id,d); if(t.isNew) d.firstChild.classList.add('new'); }
      const [x,y]=pos(t.r,t.c,g), inn=d.firstChild, col=COL[t.v]||['#3c3a32','#fff'];
      d.style.width=d.style.height=g.cell+'px';
      d.style.transform=`translate(${x}px,${y}px)`;
      d.style.zIndex=t.dead?1:2;
      inn.style.background=col[0]; inn.style.color=col[1];
      inn.style.fontSize=(g.cell*(t.v<100?.48:t.v<1000?.4:t.v<10000?.32:.26))+'px';
      inn.textContent=t.v;
      if(t.pop){ inn.classList.remove('merge'); void inn.offsetWidth; inn.classList.add('merge'); t.pop=false; }
      t.isNew=false;
    }
    for(const [id,d] of divs) if(!alive.has(id)){ d.remove(); divs.delete(id); }
    $('g2-score').textContent=score; $('g2-best').textContent=best;
    $('g2-undo').disabled=!undoSnap;
  }
  function addRandom(){
    const e=[]; for(let r=0;r<4;r++) for(let c=0;c<4;c++) if(!tiles.some(t=>t.r===r&&t.c===c)) e.push([r,c]);
    if(!e.length) return; const [r,c]=e[Math.floor(Math.random()*e.length)];
    tiles.push({ id:nid++, v:Math.random()<.9?2:4, r, c, isNew:true });
  }
  const snapshot=()=>({ tiles:tiles.map(t=>({v:t.v,r:t.r,c:t.c})), score, won });
  function restore(s){ for(const d of divs.values()) d.remove(); divs.clear(); tiles=s.tiles.map(t=>({...t,id:nid++})); score=s.score; won=s.won; over=false; }
  const save=()=>store.set('g2_state', over?null:snapshot());
  function newGame(){ tiles=[]; score=0; won=false; over=false; undoSnap=null; for(const d of divs.values()) d.remove(); divs.clear(); addRandom(); addRandom(); ov.hide(); render(); save(); }
  function move(dir){
    if(busy||over||ov.on) return;
    const grid=[...Array(4)].map(()=>Array(4).fill(null)); tiles.forEach(t=>grid[t.r][t.c]=t);
    const snap=snapshot(); let moved=false, gained=0;
    for(let i=0;i<4;i++){
      const at=k=> dir==='left'?[i,k] : dir==='right'?[i,3-k] : dir==='up'?[k,i] : [3-k,i];
      let target=0, last=null;
      for(let k=0;k<4;k++){
        const [r,c]=at(k), t=grid[r][c]; if(!t) continue;
        if(last && last.v===t.v){ t.r=last.r; t.c=last.c; t.dead=true; last.nv=last.v*2; gained+=last.v*2; moved=true; last=null; }
        else { const [nr,nc]=at(target++); if(nr!==t.r||nc!==t.c) moved=true; t.r=nr; t.c=nc; last=t; }
      }
    }
    if(!moved) return;
    undoSnap=snap; busy=true; render();
    setTimeout(()=>{
      tiles=tiles.filter(t=>!t.dead);
      for(const t of tiles) if(t.nv){ t.v=t.nv; delete t.nv; t.pop=true; }
      score+=gained; if(score>best){ best=score; store.set('g2_best',best); }
      addRandom(); busy=false; if(ARC) ARC.prog('2048', score); render(); check(); save();
    }, 115);
  }
  function check(){
    if(!won && tiles.some(t=>t.v>=2048)){
      won=true;
      ov.show('🏆','2048!','Bạn đã ghép được ô 2048. Chơi tiếp để phá kỷ lục nhé?',[{label:'Chơi tiếp',cls:'primary',fn:()=>ov.hide()},{label:'Ván mới',fn:newGame}]);
      return;
    }
    if(tiles.length<16) return;
    const g=[...Array(4)].map(()=>Array(4).fill(0)); tiles.forEach(t=>g[t.r][t.c]=t.v);
    for(let r=0;r<4;r++) for(let c=0;c<4;c++){ if(c<3&&g[r][c]===g[r][c+1]) return; if(r<3&&g[r][c]===g[r+1][c]) return; }
    over=true; if(ARC) ARC.done('2048', {vk:'2048', v:score});
    ov.show('😵','Hết nước đi!','Điểm của bạn: '+score+(score>=best&&score>0?' · Kỷ lục mới!':''),[{label:'↻ Chơi lại',cls:'primary',fn:newGame},{label:'↶ Hoàn tác 1 bước',fn:undo}]);
  }
  function undo(){ if(!undoSnap||busy) return; restore(undoSnap); undoSnap=null; ov.hide(); render(); save(); }
  $('g2-new').onclick=newGame; $('g2-undo').onclick=undo;
  onSwipe(board, d=>{ if(d!=='tap') move(d); });
  document.addEventListener('keydown', e=>{ if(current!=='2048') return; const d=KEYDIR[e.key]; if(d){ e.preventDefault(); move(d); } });
  window.addEventListener('resize', ()=>{ if(current==='2048'){ layoutBg(); render(); } });
  const saved=store.get('g2_state',null);
  if(saved && saved.tiles && saved.tiles.length) restore(saved);
  return {
    race(){ layoutBg(); newGame(); },
    activate(){ layoutBg(); if(!tiles.length) newGame(); else render(); },
    deactivate(){},
    summary(){ return best? 'Kỷ lục '+best : 'Chưa chơi'; }
  };
})();

/* ================= DÒ MÌN ================= */
const MINES = (() => {
  const $=id=>document.getElementById(id), ov=mkOverlay('ms-ov'), board=$('ms-board');
  const LV=[{k:'easy',n:'Dễ 9×9',r:9,c:9,m:10},{k:'med',n:'Vừa 11×14',r:14,c:11,m:24},{k:'hard',n:'Khó 13×18',r:18,c:13,m:42}];
  const NUMC=['','#60a5fa','#4ade80','#f87171','#c084fc','#fb923c','#22d3ee','#f1f5f9','#94a3b8'];
  let lv=store.get('ms_lv',0), R, C, M, mine, open, flag, cnt, started, over, time, opened, boom, flagMode=false, cells=[], lpTimer=null, lpFired=false;
  const nb=i=>{ const r=Math.floor(i/C), c=i%C, out=[]; for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){ if(!dr&&!dc) continue; const rr=r+dr, cc=c+dc; if(rr>=0&&rr<R&&cc>=0&&cc<C) out.push(rr*C+cc); } return out; };
  function seg(){
    const s=$('ms-seg'); s.innerHTML='';
    LV.forEach((L,i)=>{ const b=document.createElement('button'); b.textContent=L.n; b.className=i===lv?'on':''; b.onclick=()=>{ lv=i; store.set('ms_lv',i); setup(); }; s.appendChild(b); });
  }
  function setup(){
    ({r:R,c:C,m:M}=LV[lv]);
    mine=new Array(R*C).fill(false); open=new Array(R*C).fill(false); flag=new Array(R*C).fill(false); cnt=new Array(R*C).fill(0);
    started=false; over=false; time=0; opened=0; boom=-1;
    const W=Math.min(window.innerWidth*.94,460), cs=Math.max(22,Math.min(40,Math.floor((W-6)/C)));
    board.style.setProperty('--cs',cs+'px'); board.style.gridTemplateColumns=`repeat(${C}, calc(var(--cs) - 2px))`;
    board.innerHTML=''; cells=[];
    for(let i=0;i<R*C;i++){
      const d=document.createElement('div'); d.className='ms-cell';
      d.addEventListener('pointerdown', e=>{ lpFired=false; if(e.button===2) return; clearTimeout(lpTimer);
        lpTimer=setTimeout(()=>{ lpFired=true; toggleFlag(i); try{ navigator.vibrate&&navigator.vibrate(25); }catch(_){} }, 380); });
      d.addEventListener('pointerup', e=>{ if(e.button===2) return; clearTimeout(lpTimer); if(lpFired) return;
        if(flagMode && !open[i]) toggleFlag(i); else act(i); });
      d.addEventListener('pointerleave', ()=>clearTimeout(lpTimer));
      d.addEventListener('pointercancel', ()=>clearTimeout(lpTimer));
      d.addEventListener('contextmenu', e=>{ e.preventDefault(); if(lpFired) return; toggleFlag(i); });
      board.appendChild(d); cells.push(d);
    }
    ov.hide(); seg(); render();
  }
  function placeMines(safe){
    const ban=new Set([safe,...nb(safe)]), pool=[];
    for(let i=0;i<R*C;i++) if(!ban.has(i)) pool.push(i);
    shuf(pool).slice(0,M).forEach(i=>mine[i]=true);
    for(let i=0;i<R*C;i++) cnt[i]=nb(i).filter(j=>mine[j]).length;
    started=true;
  }
  function act(i){
    if(over||flag[i]) return;
    if(!started) placeMines(i);
    if(open[i]) chord(i); else reveal(i);
    render(); checkWin();
  }
  function reveal(i){
    if(open[i]||flag[i]) return;
    if(mine[i]){ lose(i); return; }
    const st=[i];
    while(st.length){
      const j=st.pop(); if(open[j]||flag[j]) continue;
      open[j]=true; opened++;
      if(cnt[j]===0) for(const k of nb(j)) if(!open[k]&&!mine[k]) st.push(k);
    }
  }
  function chord(i){
    if(!cnt[i]) return;
    const ns=nb(i); if(ns.filter(j=>flag[j]).length!==cnt[i]) return;
    for(const j of ns) if(!flag[j]&&!open[j]){ reveal(j); if(over) return; }
  }
  function toggleFlag(i){ if(over||open[i]) return; flag[i]=!flag[i]; render(); }
  function lose(i){
    over=true; boom=i; render();
    setTimeout(()=>ov.show('💥','Trúng mìn rồi!','Thời gian: '+fmtT(time)+'. Thử lại nhé!',[{label:'↻ Chơi lại',cls:'primary',fn:setup}]), 700);
  }
  function checkWin(){
    if(over || opened!==R*C-M) return;
    over=true; for(let i=0;i<R*C;i++) if(mine[i]) flag[i]=true; render();
    const b=store.get('ms_best',{}), k=LV[lv].k, nb_=!b[k]||time<b[k]; if(nb_){ b[k]=time; store.set('ms_best',b); } if(ARC) ARC.done('mines', {vk:'mines-'+k, v:time});
    setTimeout(()=>ov.show('😎','Rà mìn thành công!','Cấp '+LV[lv].n+' · '+fmtT(time)+(nb_?' · Kỷ lục mới!':' · Kỷ lục '+fmtT(b[k])),[{label:'↻ Ván mới',cls:'primary',fn:setup}]), 400);
  }
  function render(){
    let flags=0;
    for(let i=0;i<R*C;i++){
      const d=cells[i]; let cls='ms-cell', txt='', col='';
      if(flag[i]) flags++;
      if(open[i]){ cls+=' open'; if(cnt[i]){ txt=cnt[i]; col=NUMC[cnt[i]]; } }
      else if(over && mine[i] && !flag[i]){ cls+=' open'; txt='💣'; if(i===boom) cls+=' boom'; }
      else if(flag[i]){ txt = over&&!mine[i] ? '❌' : '🚩'; }
      d.className=cls; d.textContent=txt; d.style.color=col;
    }
    if(ARC && started) ARC.prog('mines', Math.floor(opened*100/(R*C-M))); $('ms-left').textContent=M-flags; $('ms-time').textContent=fmtT(time);
    const fb=$('ms-flag'); fb.classList.toggle('on',flagMode); fb.textContent=flagMode?'🚩 Cắm cờ':'⛏️ Đào';
  }
  $('ms-flag').onclick=()=>{ flagMode=!flagMode; render(); };
  $('ms-new').onclick=setup;
  setInterval(()=>{ if(current==='mines' && started && !over && !document.hidden){ time++; $('ms-time').textContent=fmtT(time); } },1000);
  return {
    race(o){ lv=o.level||0; flagMode=false; setup(); },
    activate(){ if(!mine) setup(); },
    deactivate(){},
    summary(){ const b=store.get('ms_best',{}); return b.easy||b.med||b.hard ? 'Kỷ lục '+(b.hard?'Khó '+fmtT(b.hard):b.med?'Vừa '+fmtT(b.med):'Dễ '+fmtT(b.easy)) : 'Chưa chơi'; }
  };
})();

/* ================= RẮN SĂN MỒI ================= */
const SNAKE = (() => {
  const $=id=>document.getElementById(id), cv=$('sn-c'), ctx=cv.getContext('2d'), ov=mkOverlay('sn-ov');
  const N=20;
  let size=400, dpr=1, snake, dir, q, food, bonus, score, eaten, speed, state='ready', acc=0, last=0, best=store.get('sn_best',0), active=false, running=false;
  function resize(){
    size=Math.min(window.innerWidth*.92, 420, Math.max(240, window.innerHeight-340));
    size=Math.floor(size/N)*N; dpr=window.devicePixelRatio||1;
    cv.style.width=cv.style.height=size+'px'; cv.width=cv.height=Math.round(size*dpr);
  }
  function freeCell(){
    let p; do{ p={x:Math.floor(Math.random()*N), y:Math.floor(Math.random()*N)}; }
    while(snake.some(s=>s.x===p.x&&s.y===p.y) || (food&&food.x===p.x&&food.y===p.y) || (bonus&&bonus.x===p.x&&bonus.y===p.y));
    return p;
  }
  function reset(intro){
    snake=[{x:7,y:10},{x:6,y:10},{x:5,y:10}]; dir={x:1,y:0}; q=[]; score=0; eaten=0; speed=150; food=null; bonus=null;
    food=freeCell(); state='ready'; hud();
    if(intro) ov.show('🐍','Rắn săn mồi','Ăn mồi để dài ra. Đừng đâm vào tường hay vào chính mình!',[{label:'▶ Bắt đầu',cls:'primary',fn:start}]);
    else ov.hide();
  }
  function start(){ ov.hide(); state='play'; last=performance.now(); acc=0; }
  function pause(){ if(state!=='play') return; state='paused'; ov.show('⏸','Tạm dừng','Điểm hiện tại: '+score,[{label:'▶ Tiếp tục',cls:'primary',fn:start},{label:'↻ Chơi lại',fn:()=>{reset(false);start();}}]); }
  function turn(d){
    const v={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}[d]; if(!v) return;
    if(state==='ready') start(); if(state!=='play') return;
    const ref=q.length?q[q.length-1]:dir;
    if((v.x===-ref.x&&v.y===-ref.y)||(v.x===ref.x&&v.y===ref.y)) return;
    if(q.length<3) q.push(v);
  }
  function step(){
    if(q.length) dir=q.shift();
    const h={x:snake[0].x+dir.x, y:snake[0].y+dir.y};
    if(h.x<0||h.y<0||h.x>=N||h.y>=N||snake.slice(0,-1).some(s=>s.x===h.x&&s.y===h.y)) return die();
    snake.unshift(h); let grow=false;
    if(h.x===food.x&&h.y===food.y){ score++; eaten++; grow=true; speed=Math.max(65,speed-3); food=freeCell(); if(eaten%5===0 && !bonus) bonus={...freeCell(), t:6}; }
    if(bonus && h.x===bonus.x&&h.y===bonus.y){ score+=5; grow=true; bonus=null; }
    if(!grow) snake.pop();
    if(ARC) ARC.prog('snake', score); hud();
  }
  function die(){
    state='dead'; if(ARC) ARC.done('snake', {vk:'snake', v:score}); const nb=score>best; if(nb){ best=score; store.set('sn_best',best); } hud();
    ov.show('💥','Rắn đâm rồi!','Điểm: '+score+(nb?' · Kỷ lục mới!':' · Kỷ lục '+best),[{label:'↻ Chơi lại',cls:'primary',fn:()=>{reset(false);start();}}]);
  }
  function hud(){ $('sn-score').textContent=score; $('sn-best').textContent=best; }
  function draw(now){
    const c=size/N; ctx.setTransform(dpr,0,0,dpr,0,0);
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){ ctx.fillStyle=(x+y)%2?'#1e293b':'#233148'; ctx.fillRect(x*c,y*c,c,c); }
    // food
    ctx.fillStyle='#ef4444'; ctx.beginPath(); ctx.arc(food.x*c+c/2, food.y*c+c/2+1, c*.38, 0, 7); ctx.fill();
    ctx.fillStyle='#22c55e'; ctx.beginPath(); ctx.ellipse(food.x*c+c*.62, food.y*c+c*.18, c*.16, c*.08, -.6, 0, 7); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(food.x*c+c*.38, food.y*c+c*.42, c*.09, 0, 7); ctx.fill();
    if(bonus){
      const pulse=1+.12*Math.sin(now/120);
      ctx.save(); ctx.translate(bonus.x*c+c/2, bonus.y*c+c/2); ctx.scale(pulse,pulse);
      ctx.fillStyle='#facc15'; ctx.beginPath();
      for(let k=0;k<10;k++){ const r=k%2?c*.2:c*.48, a=-Math.PI/2+k*Math.PI/5; ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r); }
      ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.strokeStyle='rgba(250,204,21,.6)'; ctx.lineWidth=2; ctx.beginPath();
      ctx.arc(bonus.x*c+c/2, bonus.y*c+c/2, c*.62, -Math.PI/2, -Math.PI/2+Math.PI*2*Math.max(0,bonus.t)/6); ctx.stroke();
    }
    // snake
    snake.forEach((s,i)=>{
      const k=i/Math.max(1,snake.length-1);
      ctx.fillStyle=`hsl(${142-k*20},${70-k*15}%,${55-k*22}%)`;
      const p=i===0?1:2, r=c*.32;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(s.x*c+p, s.y*c+p, c-2*p, c-2*p, r) : ctx.rect(s.x*c+p, s.y*c+p, c-2*p, c-2*p); ctx.fill();
    });
    const h=snake[0], cx=h.x*c+c/2, cy=h.y*c+c/2, px=-dir.y, py=dir.x;
    for(const sgn of [-1,1]){
      const ex=cx+dir.x*c*.15+px*sgn*c*.2, ey=cy+dir.y*c*.15+py*sgn*c*.2;
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(ex,ey,c*.13,0,7); ctx.fill();
      ctx.fillStyle='#0f172a'; ctx.beginPath(); ctx.arc(ex+dir.x*c*.05,ey+dir.y*c*.05,c*.07,0,7); ctx.fill();
    }
  }
  function frame(now){
    if(!active){ running=false; return; }
    const dt=now-last; last=now;
    if(state==='play'){
      acc+=dt; while(acc>=speed && state==='play'){ acc-=speed; step(); }
      if(bonus){ bonus.t-=dt/1000; if(bonus.t<=0) bonus=null; }
    }
    draw(now); requestAnimationFrame(frame);
  }
  onSwipe(cv, d=>{ if(d==='tap'){ if(state==='ready') start(); } else turn(d); });
  document.querySelectorAll('#view-snake .dpad button').forEach(b=>b.addEventListener('pointerdown', e=>{ e.preventDefault(); turn(b.dataset.d); }));
  $('sn-pause').onclick=()=>{ if(state==='play') pause(); else if(state==='paused') start(); };
  document.addEventListener('keydown', e=>{
    if(current!=='snake') return;
    const d=KEYDIR[e.key]; if(d){ e.preventDefault(); turn(d); }
    else if(e.key===' '||e.key==='p'||e.key==='P'){ e.preventDefault(); if(state==='play') pause(); else if(state==='paused'||state==='ready') start(); }
  });
  window.addEventListener('resize', ()=>{ if(active) resize(); });
  reset(true);
  return {
    race(){ reset(false); start(); },
    activate(){ active=true; resize(); if(state==='ready') reset(true); last=performance.now(); if(!running){ running=true; requestAnimationFrame(frame); } },
    deactivate(){ pause(); active=false; },
    summary(){ return best? 'Kỷ lục '+best+' điểm' : 'Chưa chơi'; }
  };
})();

/* ================= XẾP HÌNH ================= */
const TETRIS = (() => {
  const $=id=>document.getElementById(id), cv=$('tt-c'), ctx=cv.getContext('2d'), nv=$('tt-next'), nctx=nv.getContext('2d'), ov=mkOverlay('tt-ov');
  const COLS=10, ROWS=20;
  const SHAPES={ I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], J:[[1,0,0],[1,1,1],[0,0,0]], L:[[0,0,1],[1,1,1],[0,0,0]], O:[[1,1],[1,1]], S:[[0,1,1],[1,1,0],[0,0,0]], T:[[0,1,0],[1,1,1],[0,0,0]], Z:[[1,1,0],[0,1,1],[0,0,0]] };
  const COLR={ I:'#22d3ee', J:'#3b82f6', L:'#f97316', O:'#facc15', S:'#22c55e', T:'#a855f7', Z:'#ef4444' };
  let grid, cur, next, bag=[], score=0, lines=0, level=1, best=store.get('tt_best',0), state='ready', cs=24, dpr=1, active=false, running=false, last=0, dropAcc=0, lockAcc=0, lockMoves=0, clearing=null;
  const rot=m=>m.map((row,r)=>row.map((_,c)=>m[m.length-1-c][r]));
  const nextType=()=>{ if(!bag.length) bag=shuf(Object.keys(SHAPES)); return bag.pop(); };
  function resize(){
    const availH=window.innerHeight-310, availW=Math.min(window.innerWidth,520)*.94-100;
    cs=Math.max(14, Math.min(30, Math.floor(Math.min(availW/COLS, availH/ROWS))));
    dpr=window.devicePixelRatio||1;
    cv.style.width=COLS*cs+'px'; cv.style.height=ROWS*cs+'px'; cv.width=Math.round(COLS*cs*dpr); cv.height=Math.round(ROWS*cs*dpr);
    nv.width=nv.height=Math.round(72*dpr);
  }
  function reset(intro){
    grid=[...Array(ROWS)].map(()=>Array(COLS).fill(null)); bag=[]; next=null; score=0; lines=0; level=1; clearing=null;
    spawn(); state='ready'; hud();
    if(intro) ov.show('🧱','Xếp hình','Xếp các khối thành hàng ngang đầy đủ để xóa hàng. Đừng để khối chạm đỉnh!',[{label:'▶ Bắt đầu',cls:'primary',fn:start}]);
    else ov.hide();
  }
  function start(){ ov.hide(); state='play'; last=performance.now(); }
  function pause(){ if(state!=='play') return; state='paused'; ov.show('⏸','Tạm dừng','Điểm hiện tại: '+score,[{label:'▶ Tiếp tục',cls:'primary',fn:start},{label:'↻ Chơi lại',fn:()=>{reset(false);start();}}]); }
  function collide(m,x,y){
    for(let r=0;r<m.length;r++) for(let c=0;c<m.length;c++) if(m[r][c]){
      const X=x+c, Y=y+r; if(X<0||X>=COLS||Y>=ROWS) return true; if(Y>=0&&grid[Y][X]) return true; }
    return false;
  }
  function spawn(){
    const t=next||nextType(); next=nextType();
    const m=SHAPES[t].map(r=>r.slice());
    cur={ t, m, x:Math.floor((COLS-m.length)/2), y:t==='I'?-1:0 };
    lockAcc=0; lockMoves=0; dropAcc=0;
    if(collide(cur.m,cur.x,cur.y)) gameOver();
    drawNext();
  }
  const onGround=()=>collide(cur.m,cur.x,cur.y+1);
  function touchLock(){ if(onGround() && lockMoves<15){ lockAcc=0; lockMoves++; } }
  function move(dx){ if(state!=='play'||!cur) return; if(!collide(cur.m,cur.x+dx,cur.y)){ cur.x+=dx; touchLock(); } }
  function rotate(dir){
    if(state!=='play'||!cur||cur.t==='O') return;
    let m=rot(cur.m); if(dir<0) m=rot(rot(m));
    for(const [kx,ky] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1]]) if(!collide(m,cur.x+kx,cur.y+ky)){ cur.m=m; cur.x+=kx; cur.y+=ky; touchLock(); return; }
  }
  function soft(){ if(state!=='play'||!cur) return; if(!onGround()){ cur.y++; score+=1; dropAcc=0; hud(); } }
  function hard(){ if(state!=='play'||!cur) return; let n=0; while(!onGround()){ cur.y++; n++; } score+=2*n; lock(); }
  function lock(){
    for(let r=0;r<cur.m.length;r++) for(let c=0;c<cur.m.length;c++) if(cur.m[r][c]){
      const Y=cur.y+r; if(Y<0){ cur=null; gameOver(); return; } grid[Y][cur.x+c]=cur.t; }
    const full=[]; for(let r=0;r<ROWS;r++) if(grid[r].every(v=>v)) full.push(r);
    cur=null;
    if(full.length) clearing={ rows:full, t:0 }; else spawn();
    hud();
  }
  function gameOver(){
    state='over'; if(ARC) ARC.done('tetris', {vk:'tetris', v:score}); const nb=score>best; if(nb){ best=score; store.set('tt_best',best); } hud();
    ov.show('🧱','Kết thúc!','Điểm: '+score+' · '+lines+' hàng'+(nb?' · Kỷ lục mới!':''),[{label:'↻ Chơi lại',cls:'primary',fn:()=>{reset(false);start();}}]);
  }
  function update(dt){
    if(state!=='play') return;
    if(clearing){
      clearing.t+=dt;
      if(clearing.t>=.2){
        const n=clearing.rows.length;
        grid=grid.filter((_,r)=>!clearing.rows.includes(r));
        while(grid.length<ROWS) grid.unshift(Array(COLS).fill(null));
        lines+=n; score+=[0,100,300,500,800][n]*level; level=1+Math.floor(lines/10);
        clearing=null; spawn(); hud();
      }
      return;
    }
    if(!cur) return;
    if(onGround()){ lockAcc+=dt; if(lockAcc>=.5) lock(); }
    else { dropAcc+=dt*1000; const iv=Math.max(60, 800*Math.pow(.84,level-1)); if(dropAcc>=iv){ dropAcc=0; cur.y++; } }
  }
  function block(c2,x,y,s,col,alpha=1){
    c2.globalAlpha=alpha; c2.fillStyle=col; c2.fillRect(x+1,y+1,s-2,s-2);
    c2.fillStyle='rgba(255,255,255,.3)'; c2.fillRect(x+1,y+1,s-2,s*.18);
    c2.fillStyle='rgba(0,0,0,.25)'; c2.fillRect(x+1,y+s*.8,s-2,s*.2-1);
    c2.globalAlpha=1;
  }
  function draw(){
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,COLS*cs,ROWS*cs);
    ctx.strokeStyle='rgba(148,163,184,.08)'; ctx.lineWidth=1;
    for(let x=1;x<COLS;x++){ ctx.beginPath(); ctx.moveTo(x*cs+.5,0); ctx.lineTo(x*cs+.5,ROWS*cs); ctx.stroke(); }
    for(let y=1;y<ROWS;y++){ ctx.beginPath(); ctx.moveTo(0,y*cs+.5); ctx.lineTo(COLS*cs,y*cs+.5); ctx.stroke(); }
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(grid[r][c]){
      if(clearing && clearing.rows.includes(r)){ ctx.fillStyle=`rgba(255,255,255,${1-clearing.t*4})`; ctx.fillRect(c*cs,r*cs,cs,cs); }
      else block(ctx,c*cs,r*cs,cs,COLR[grid[r][c]]);
    }
    if(cur){
      let gy=cur.y; while(!collide(cur.m,cur.x,gy+1)) gy++;
      for(let r=0;r<cur.m.length;r++) for(let c=0;c<cur.m.length;c++) if(cur.m[r][c]){
        if(gy+r>=0){ ctx.strokeStyle=COLR[cur.t]; ctx.globalAlpha=.45; ctx.lineWidth=2; ctx.strokeRect((cur.x+c)*cs+2,(gy+r)*cs+2,cs-4,cs-4); ctx.globalAlpha=1; }
        if(cur.y+r>=0) block(ctx,(cur.x+c)*cs,(cur.y+r)*cs,cs,COLR[cur.t]);
      }
    }
  }
  function drawNext(){
    nctx.setTransform(dpr,0,0,dpr,0,0); nctx.clearRect(0,0,72,72);
    if(!next) return;
    const m=SHAPES[next], s=15;
    let minr=9,maxr=-1,minc=9,maxc=-1;
    m.forEach((row,r)=>row.forEach((v,c)=>{ if(v){ minr=Math.min(minr,r); maxr=Math.max(maxr,r); minc=Math.min(minc,c); maxc=Math.max(maxc,c); } }));
    const ox=(72-(maxc-minc+1)*s)/2, oy=(72-(maxr-minr+1)*s)/2;
    m.forEach((row,r)=>row.forEach((v,c)=>{ if(v) block(nctx, ox+(c-minc)*s, oy+(r-minr)*s, s, COLR[next]); }));
  }
  function hud(){ if(ARC) ARC.prog('tetris', score); $('tt-score').textContent=score; $('tt-lines').textContent=lines; $('tt-level').textContent=level; $('tt-best').textContent=best; }
  function frame(now){
    if(!active){ running=false; return; }
    const dt=Math.min(.05,(now-last)/1000); last=now;
    update(dt); draw(); requestAnimationFrame(frame);
  }
  // touch gestures on board
  let ps=null;
  cv.addEventListener('pointerdown', e=>{ ps={x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,t:Date.now(),moved:false}; try{ cv.setPointerCapture(e.pointerId); }catch(_){} });
  cv.addEventListener('pointermove', e=>{
    if(!ps||state!=='play') return; const st=cs*.9;
    while(e.clientX-ps.lx>st){ move(1); ps.lx+=st; ps.moved=true; }
    while(ps.lx-e.clientX>st){ move(-1); ps.lx-=st; ps.moved=true; }
    if(Math.abs(e.clientY-ps.y)>Math.abs(e.clientX-ps.x)) while(e.clientY-ps.ly>st*1.3){ soft(); ps.ly+=st*1.3; ps.moved=true; }
  });
  cv.addEventListener('pointerup', e=>{
    if(!ps) return; const dx=e.clientX-ps.x, dy=e.clientY-ps.y, dt=Date.now()-ps.t;
    if(state==='ready'){ start(); ps=null; return; }
    if(dy>70 && dt<260 && Math.abs(dy)>Math.abs(dx)*2) hard();
    else if(!ps.moved && Math.hypot(dx,dy)<14) rotate(1);
    ps=null;
  });
  function hold(el, fn, repeat){
    let t1=null, t2=null;
    const stop=()=>{ clearTimeout(t1); clearInterval(t2); };
    el.addEventListener('pointerdown', e=>{ e.preventDefault(); if(state==='ready'){ start(); return; } fn(); if(repeat){ t1=setTimeout(()=>{ t2=setInterval(fn,55); },170); } });
    ['pointerup','pointerleave','pointercancel'].forEach(ev=>el.addEventListener(ev,stop));
  }
  hold($('tt-l'),()=>move(-1),true); hold($('tt-rr'),()=>move(1),true); hold($('tt-d'),soft,true);
  hold($('tt-r'),()=>rotate(1),false); hold($('tt-h'),hard,false);
  $('tt-pause').onclick=()=>{ if(state==='play') pause(); else if(state==='paused') start(); };
  document.addEventListener('keydown', e=>{
    if(current!=='tetris') return;
    const k=e.key;
    if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(k)) e.preventDefault();
    if(state==='ready' && (k===' '||k==='Enter')){ start(); return; }
    if(k==='p'||k==='P'||k==='Escape'){ if(state==='play') pause(); else if(state==='paused') start(); return; }
    if(k==='ArrowLeft') move(-1); else if(k==='ArrowRight') move(1); else if(k==='ArrowDown') soft();
    else if(k==='ArrowUp'||k==='x'||k==='X') rotate(1); else if(k==='z'||k==='Z') rotate(-1); else if(k===' ') hard();
  });
  window.addEventListener('resize', ()=>{ if(active){ resize(); drawNext(); } });
  reset(true);
  return {
    race(){ reset(false); start(); },
    activate(){ active=true; resize(); drawNext(); last=performance.now(); if(!running){ running=true; requestAnimationFrame(frame); } },
    deactivate(){ pause(); active=false; },
    summary(){ return best? 'Kỷ lục '+best+' điểm' : 'Chưa chơi'; }
  };
})();

/* ================= LẬT HÌNH ================= */
const MEMO = (() => {
  const $=id=>document.getElementById(id), ov=mkOverlay('mm-ov'), gridEl=$('mm-grid');
  const LV=[{k:'l1',n:'Dễ',cols:4,pairs:6},{k:'l2',n:'Vừa',cols:4,pairs:8},{k:'l3',n:'Khó',cols:5,pairs:10},{k:'l4',n:'Siêu khó',cols:6,pairs:15}];
  const EMO=['🍎','🍌','🍇','🍉','🍓','🍒','🍍','🥝','🥑','🌽','🥕','🍄','🌸','🌻','🌵','🐶','🐱','🦊','🐼','🐸','🐙','🦋','🐢','🚗','🚀','⚽','🎸','🎈','💎','⭐','🍦','🧁','🐳','🦄','🌈','🎁'];
  let lv=store.get('mm_lv',0), cards=[], first=-1, lock=false, moves=0, found=0, time=0, started=false, over=false;
  function seg(){
    const s=$('mm-seg'); s.innerHTML='';
    LV.forEach((L,i)=>{ const b=document.createElement('button'); b.textContent=L.n+' ('+L.pairs*2+')'; b.className=i===lv?'on':''; b.onclick=()=>{ lv=i; store.set('mm_lv',i); setup(); }; s.appendChild(b); });
  }
  function setup(){
    const L=LV[lv]; const pick=shuf(EMO.slice()).slice(0,L.pairs);
    cards=shuf([...pick,...pick]).map(e=>({e,open:false,done:false}));
    first=-1; lock=false; moves=0; found=0; time=0; started=false; over=false;
    gridEl.style.gridTemplateColumns=`repeat(${L.cols},1fr)`; gridEl.style.setProperty('--cols',L.cols);
    gridEl.innerHTML='';
    cards.forEach((c,i)=>{
      const d=document.createElement('div'); d.className='mm-card';
      d.innerHTML=`<div class="mm-in"><div class="mm-f">?</div><div class="mm-b">${c.e}</div></div>`;
      d.addEventListener('click',()=>flip(i)); gridEl.appendChild(d); c.el=d;
    });
    ov.hide(); seg(); hud();
  }
  function flip(i){
    if(MP){ mpFlip(i); return; }
    const c=cards[i];
    if(lock||over||c.open||c.done) return;
    started=true; c.open=true; c.el.classList.add('open');
    if(first<0){ first=i; return; }
    const a=cards[first]; moves++; first=-1;
    if(a.e===c.e){
      setTimeout(()=>{ a.done=c.done=true; a.open=c.open=false; a.el.classList.add('done'); c.el.classList.add('done'); found++; hud(); checkWin(); },250);
    } else {
      lock=true;
      setTimeout(()=>{ a.el.classList.add('bad'); c.el.classList.add('bad'); },250);
      setTimeout(()=>{ a.open=c.open=false; [a,c].forEach(x=>x.el.classList.remove('open','bad')); lock=false; },850);
    }
    hud();
  }
  function checkWin(){
    if(found<LV[lv].pairs) return;
    over=true; const b=store.get('mm_best',{}), k=LV[lv].k, nb=!b[k]||moves<b[k].moves||(moves===b[k].moves&&time<b[k].time);
    if(nb){ b[k]={moves,time}; store.set('mm_best',b); } if(ARC) ARC.done('memory', {vk:'memory-'+k, v:moves});
    const stars=moves<=LV[lv].pairs*1.5?'⭐⭐⭐':moves<=LV[lv].pairs*2.2?'⭐⭐':'⭐';
    ov.show('🎉','Tìm đủ '+found+' cặp!',stars+' · '+moves+' lượt · '+fmtT(time)+(nb?' · Kỷ lục mới!':' · Kỷ lục '+b[k].moves+' lượt'),
      [{label:'↻ Ván mới',cls:'primary',fn:setup}].concat(lv<LV.length-1?[{label:'Thử cấp '+LV[lv+1].n+' ▶',cls:'green',fn:()=>{ lv++; store.set('mm_lv',lv); setup(); }}]:[]));
  }
  function hud(){ $('mm-moves').textContent=moves; $('mm-pairs').textContent=found+'/'+LV[lv].pairs; $('mm-time').textContent=fmtT(time); }

  /* ---- online theo lượt ---- */
  let MP=null;
  function mpInit(set, n, round, rnd){
    const L=LV[set.level||0], pool=EMO.slice(), pick=[];
    for(let k=0;k<L.pairs;k++) pick.push(pool.splice(Math.floor(rnd()*pool.length),1)[0]);
    const d=[...pick,...pick]; for(let i=d.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
    const sc={}; for(let s=1;s<=n;s++) sc['s'+s]=0;
    return { lv:set.level||0, d, k:d.map(()=>0), op:[], t:((round-1)%n)+1, sc, mv:0, o:0 };
  }
  function mpStart(ctx){ MP=Object.assign({ state:null, built:'', resolving:false }, ctx); ov.hide(); relabel('memory',['ĐẾN LƯỢT','SỐ CẶP','ĐÃ LẬT']); }
  function mpBuild(s){
    const L=LV[s.lv]; gridEl.style.gridTemplateColumns=`repeat(${L.cols},1fr)`; gridEl.style.setProperty('--cols',L.cols);
    gridEl.innerHTML='';
    cards=s.d.map((e,i)=>{ const el=document.createElement('div'); el.className='mm-card'; el.innerHTML=`<div class="mm-in"><div class="mm-f">?</div><div class="mm-b">${e}</div></div>`; el.addEventListener('click',()=>flip(i)); gridEl.appendChild(el); return { e, el }; });
    MP.built=s.d.join('');
  }
  function mpApply(s){
    if(!MP || !s || !s.d) return;
    MP.state=s; const op=s.op||[];
    if(MP.built!==s.d.join('')) mpBuild(s);
    cards.forEach((c,i)=>{ c.el.classList.toggle('done', !!s.k[i]); c.el.classList.toggle('open', op.includes(i) && !s.k[i]); c.el.dataset.s = s.k[i] || ''; });
    const nm = x => MP.seats[x] ? MP.seats[x].a+' '+MP.seats[x].n : '?';
    $('mm-moves').textContent = s.o ? 'Hết' : (s.t===MP.mySeat ? 'Bạn' : nm(s.t));
    $('mm-pairs').textContent = Object.keys(MP.seats).map(x=>MP.seats[x].a+(s.sc['s'+x]||0)).join(' ');
    $('mm-time').textContent = s.mv+' lượt';
    if(op.length===2 && s.t===MP.mySeat && !MP.resolving && !s.o){
      MP.resolving=true;
      const [a,b]=op, same=s.d[a]===s.d[b];
      if(!same) setTimeout(()=>{ cards[a].el.classList.add('bad'); cards[b].el.classList.add('bad'); }, 250);
      setTimeout(()=>{
        if(!MP) return;
        const ns=JSON.parse(JSON.stringify(MP.state)); ns.op=[]; ns.mv=(ns.mv||0)+1;
        if(same){ ns.k[a]=ns.k[b]=ns.t; ns.sc['s'+ns.t]=(ns.sc['s'+ns.t]||0)+1; if(ns.k.every(x=>x)) ns.o=1; }
        else ns.t = ns.t % MP.n + 1;
        cards[a].el.classList.remove('bad'); cards[b].el.classList.remove('bad');
        MP.resolving=false; ARC.turnMove('memory', ns);
      }, same ? 550 : 1150);
    }
  }
  function mpFlip(i){
    const s=MP.state; if(!s || s.o || s.t!==MP.mySeat || MP.resolving) return;
    const op=s.op||[]; if(op.length>=2 || s.k[i] || op.includes(i)) return;
    const ns=JSON.parse(JSON.stringify(s)); ns.op=op.concat(i);
    cards[i].el.classList.add('open'); MP.state=ns; ARC.turnMove('memory', ns);
  }
  function mpStop(){ MP=null; cards=[]; relabel('memory',null); setup(); }
  function mpResult(s, ps){
    const rows=ps.map(p=>({ id:p.id, n:p.n, a:p.a, k:s.sc['s'+p.seat]||0, txt:(s.sc['s'+p.seat]||0)+' cặp' })).sort((a,b)=>b.k-a.k);
    let r=0, last=null; rows.forEach((x,i)=>{ if(x.k!==last){ r=i+1; last=x.k; } x.rank=r; }); return rows;
  }
  $('mm-new').onclick=setup;
  setInterval(()=>{ if(current==='memory' && started && !over && !document.hidden){ time++; $('mm-time').textContent=fmtT(time); } },1000);
  return {
    mpInit, mpStart, mpApply, mpStop, mpResult,
    activate(){ if(!cards.length && !MP) setup(); },
    deactivate(){},
    summary(){ const b=store.get('mm_best',{}); const n=Object.keys(b).length; return n? 'Đã phá đảo '+n+'/4 cấp' : 'Chưa chơi'; }
  };
})();

/* ================= CỜ CARO ================= */
const CARO = (() => {
  const $=id=>document.getElementById(id), cv=$('cr-c'), ctx=cv.getContext('2d'), ov=mkOverlay('cr-ov');
  const N=15, MODES=[{k:'easy',n:'🤖 Máy dễ'},{k:'hard',n:'🧠 Máy khó'},{k:'pvp',n:'👥 2 người'}];
  let mode=store.get('cr_mode',0), b, turn, over, hist, winLine, thinking=false, size=400, cs=26, dpr=1, active=false;
  const PAT=[['xxxxx',1e6],['_xxxx_',1e5],['xxxx_',1.2e4],['_xxxx',1.2e4],['xxx_x',1.1e4],['x_xxx',1.1e4],['xx_xx',1.1e4],
    ['__xxx_',5e3],['_xxx__',5e3],['_xx_x_',4e3],['_x_xx_',4e3],['_xxx_',800],['xxx__',500],['__xxx',500],
    ['xx_x_',400],['_x_xx',400],['x_xx_',400],['_xx_x',400],['__xx__',300],['_xx__',150],['__xx_',150],['_x_x_',120],['xx___',40],['___xx',40]];
  function seg(){
    const s=$('cr-seg'); s.innerHTML='';
    MODES.forEach((M,i)=>{ const e=document.createElement('button'); e.textContent=M.n; e.className=i===mode?'on':''; e.onclick=()=>{ mode=i; store.set('cr_mode',i); newGame(); }; s.appendChild(e); });
  }
  function resize(){
    size=Math.min(window.innerWidth*.94, 460, Math.max(280, window.innerHeight-320));
    cs=Math.floor(size/N); size=cs*N; dpr=window.devicePixelRatio||1;
    cv.style.width=cv.style.height=size+'px'; cv.width=cv.height=Math.round(size*dpr); draw();
  }
  function newGame(){ b=new Array(N*N).fill(0); turn=1; over=false; hist=[]; winLine=null; thinking=false; ov.hide(); seg(); hud(); draw(); }
  function lineAt(i,p){
    const r=Math.floor(i/N), c=i%N;
    for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      const cells=[i];
      for(const s of [1,-1]){ let rr=r+dr*s, cc=c+dc*s; while(rr>=0&&rr<N&&cc>=0&&cc<N&&b[rr*N+cc]===p){ cells.push(rr*N+cc); rr+=dr*s; cc+=dc*s; } }
      if(cells.length>=5) return cells;
    }
    return null;
  }
  function place(i){
    b[i]=turn; hist.push(i);
    const w=lineAt(i,turn);
    if(w){ winLine=w; over=true; finish(turn); }
    else if(hist.length===N*N){ over=true; finish(0); }
    else turn=3-turn;
    hud(); draw();
  }
  function finish(p){
    if(MP){ MP.o = p || 3; return; }
    const M=MODES[mode].k, rec=store.get('cr_rec',{}), x=rec[M]||{w:0,l:0,d:0};
    let icon, title;
    if(M==='pvp'){ icon=p?(p===1?'❌':'⭕'):'🤝'; title=p?(p===1?'❌ thắng!':'⭕ thắng!'):'Hòa cờ!'; if(p===1)x.w++; else if(p===2)x.l++; else x.d++; }
    else { if(p===1){ icon='🏆'; title='Bạn thắng!'; x.w++; } else if(p===2){ icon='🤖'; title='Máy thắng rồi!'; x.l++; } else { icon='🤝'; title='Hòa cờ!'; x.d++; } }
    rec[M]=x; store.set('cr_rec',rec);
    setTimeout(()=>ov.show(icon,title,'Thành tích '+MODES[mode].n+': '+x.w+' thắng – '+x.l+' thua – '+x.d+' hòa',[{label:'↻ Ván mới',cls:'primary',fn:newGame},{label:'Xem lại bàn cờ',fn:()=>ov.hide()}]), 600);
  }
  function evalCell(i,p){
    const r=Math.floor(i/N), c=i%N; let total=0;
    for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      let s='';
      for(let k=-4;k<=4;k++){
        const rr=r+dr*k, cc=c+dc*k;
        if(k===0) s+='x'; else if(rr<0||rr>=N||cc<0||cc>=N) s+='o';
        else { const v=b[rr*N+cc]; s+= v===p?'x' : v===0?'_' : 'o'; }
      }
      let bestP=1;
      for(const [pat,sc] of PAT){
        if(sc<=bestP) continue;
        for(let st=Math.max(0,4-pat.length+1); st<=Math.min(4,9-pat.length); st++) if(s.substr(st,pat.length)===pat){ bestP=sc; break; }
      }
      total+=bestP;
    }
    return total;
  }
  function aiMove(){
    if(over) return;
    let cand=[];
    if(!hist.length) cand=[Math.floor(N/2)*N+Math.floor(N/2)];
    else for(let i=0;i<N*N;i++){
      if(b[i]) continue; const r=Math.floor(i/N), c=i%N; let near=false;
      for(let dr=-2;dr<=2&&!near;dr++) for(let dc=-2;dc<=2;dc++){ const rr=r+dr, cc=c+dc; if(rr>=0&&rr<N&&cc>=0&&cc<N&&b[rr*N+cc]){ near=true; break; } }
      if(near) cand.push(i);
    }
    const hard=MODES[mode].k==='hard';
    const scored=cand.map(i=>({ i, s: evalCell(i,2)*(hard?1.05:1) + evalCell(i,1)*(hard?1:.55) + Math.random()*(hard?5:60) }));
    scored.sort((a,b)=>b.s-a.s);
    let pick=scored[0];
    if(!hard && scored.length>2 && scored[0].s<9e3){ pick=scored[Math.floor(Math.random()*Math.min(3,scored.length))]; }
    place(pick.i); thinking=false; hud();
  }
  function hud(){
    if(MP){ const nm=s=>MP.seats[s]?MP.seats[s].a+' '+MP.seats[s].n:'?', sy=s=>s===1?'❌':'⭕';
      $('cr-turn').textContent = over ? 'Kết thúc' : turn===MP.mySeat ? 'Bạn ('+sy(turn)+')' : nm(turn)+' ('+sy(turn)+')';
      $('cr-rec').textContent = '❌ '+nm(1)+' · ⭕ '+nm(2); return; }
    const ai=MODES[mode].k!=='pvp';
    $('cr-turn').textContent = over ? 'Kết thúc' : ai ? (turn===1?'Bạn (❌)':'Máy đang nghĩ… (⭕)') : (turn===1?'❌ đi':'⭕ đi');
    const x=(store.get('cr_rec',{})[MODES[mode].k])||{w:0,l:0,d:0};
    $('cr-rec').textContent=x.w+' – '+x.l+' – '+x.d;
    $('cr-undo').disabled=!hist.length||thinking;
  }
  function draw(){
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const g=ctx.createLinearGradient(0,0,size,size); g.addColorStop(0,'#f0c98b'); g.addColorStop(1,'#dcae6c');
    ctx.fillStyle=g; ctx.fillRect(0,0,size,size);
    ctx.strokeStyle='rgba(120,72,30,.55)'; ctx.lineWidth=1;
    for(let k=0;k<N;k++){ const p=k*cs+cs/2+.5; ctx.beginPath(); ctx.moveTo(cs/2,p); ctx.lineTo(size-cs/2,p); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p,cs/2); ctx.lineTo(p,size-cs/2); ctx.stroke(); }
    ctx.fillStyle='rgba(120,72,30,.7)';
    for(const [r,c] of [[3,3],[3,11],[11,3],[11,11],[7,7]]){ ctx.beginPath(); ctx.arc(c*cs+cs/2,r*cs+cs/2,2.5,0,7); ctx.fill(); }
    if(!b) return;
    const lastI=hist[hist.length-1];
    for(let i=0;i<N*N;i++){
      if(!b[i]) continue;
      const x=(i%N)*cs+cs/2, y=Math.floor(i/N)*cs+cs/2, r=cs*.32;
      if(i===lastI){ ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillRect(x-cs/2+1,y-cs/2+1,cs-2,cs-2); }
      ctx.lineCap='round'; ctx.lineWidth=Math.max(2.5,cs*.12);
      if(b[i]===1){ ctx.strokeStyle='#dc2626'; ctx.beginPath(); ctx.moveTo(x-r,y-r); ctx.lineTo(x+r,y+r); ctx.moveTo(x+r,y-r); ctx.lineTo(x-r,y+r); ctx.stroke(); }
      else { ctx.strokeStyle='#1d4ed8'; ctx.beginPath(); ctx.arc(x,y,r*1.05,0,7); ctx.stroke(); }
    }
    if(winLine){
      const pts=winLine.map(i=>({x:(i%N)*cs+cs/2, y:Math.floor(i/N)*cs+cs/2})).sort((a,b)=>a.x-b.x||a.y-b.y);
      ctx.strokeStyle='rgba(22,163,74,.85)'; ctx.lineWidth=cs*.22; ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); ctx.lineTo(pts[pts.length-1].x,pts[pts.length-1].y); ctx.stroke();
    }
  }
  cv.addEventListener('pointerdown', e=>{
    if(MP){ if(over||turn!==MP.mySeat) return; const rc=cv.getBoundingClientRect(), c=Math.floor((e.clientX-rc.left)/rc.width*N), r=Math.floor((e.clientY-rc.top)/rc.height*N);
      if(r<0||r>=N||c<0||c>=N) return; const i=r*N+c; if(b[i]) return; place(i); ARC.turnMove('caro', mpState()); return; }
    if(over||thinking) return;
    const ai=MODES[mode].k!=='pvp'; if(ai&&turn!==1) return;
    const rc=cv.getBoundingClientRect(), c=Math.floor((e.clientX-rc.left)/rc.width*N), r=Math.floor((e.clientY-rc.top)/rc.height*N);
    if(r<0||r>=N||c<0||c>=N) return; const i=r*N+c; if(b[i]) return;
    place(i);
    if(ai && !over){ thinking=true; hud(); setTimeout(aiMove, 280); }
  });
  $('cr-undo').onclick=()=>{
    if(thinking||!hist.length) return;
    const ai=MODES[mode].k!=='pvp';
    // vs AI: roll back until it's the player's turn again (removes the AI reply + your move)
    do { b[hist.pop()]=0; } while(ai && hist.length%2!==0);
    over=false; winLine=null; ov.hide();
    turn = hist.length%2===0 ? 1 : 2;
    hud(); draw();
  };

  /* ---- online ---- */
  let MP=null;
  const mpState = () => ({ b:b.join(''), t:turn, h:hist.slice(), w:winLine||null, o:(MP&&MP.o)||0 });
  function mpInit(set, n, round){ return { b:'0'.repeat(N*N), t:((round-1)%2)+1, h:[], w:null, o:0 }; }
  function mpStart(ctx){ MP=Object.assign({ o:0 }, ctx); ov.hide(); relabel('caro',['ĐẾN LƯỢT','NGƯỜI CHƠI']); b=new Array(N*N).fill(0); hist=[]; winLine=null; over=false; thinking=false; }
  function mpApply(s){ if(!MP || !s || !s.b) return; b=s.b.split('').map(Number); turn=s.t; hist=s.h||[]; winLine=s.w||null; MP.o=s.o||0; over=!!s.o; thinking=false; hud(); draw(); }
  function mpStop(){ MP=null; relabel('caro',null); newGame(); }
  function mpResult(s, ps){ return ps.map(p=>({ id:p.id, n:p.n, a:p.a, rank: s.o===3?1:(p.seat===s.o?1:2), txt: s.o===3?'Hòa':(p.seat===s.o?'Thắng':'Thua') })).sort((a,b)=>a.rank-b.rank); }
  $('cr-new').onclick=newGame;
  window.addEventListener('resize', ()=>{ if(active) resize(); });
  newGame();
  return {
    mpInit, mpStart, mpApply, mpStop, mpResult,
    activate(){ active=true; resize(); seg(); hud(); },
    deactivate(){ active=false; },
    summary(){ const r=store.get('cr_rec',{}), w=(r.easy?.w||0)+(r.hard?.w||0); return w? 'Thắng máy '+w+' ván' : 'Chưa chơi'; }
  };
})();

/* ================= SHARED: sound ================= */
let _ac=null;
function beep(freq, dur=.12, type='sine', vol=.15){
  try{
    if(!_ac) _ac=new (window.AudioContext||window.webkitAudioContext)();
    const t=_ac.currentTime, o=_ac.createOscillator(), g=_ac.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t); o.connect(g); g.connect(_ac.destination);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+dur); o.start(t); o.stop(t+dur+.02);
  }catch(e){}
}
function fitCanvas(cv, W, H, extraH){
  const sc=Math.min(Math.min(window.innerWidth,520)*.94/W, Math.max(320, window.innerHeight-extraH)/H);
  const dpr=window.devicePixelRatio||1;
  cv.style.width=W*sc+'px'; cv.style.height=H*sc+'px'; cv.width=Math.round(W*sc*dpr); cv.height=Math.round(H*sc*dpr);
  return { sc, dpr };
}

/* ================= LINE 98 ================= */
const LINE98 = (() => {
  const $=id=>document.getElementById(id), ov=mkOverlay('ln-ov'), board=$('ln-board'), N=9;
  const COL=[['#ef4444','#7f1d1d'],['#3b82f6','#1e3a8a'],['#22c55e','#14532d'],['#facc15','#854d0e'],['#a855f7','#581c87'],['#06b6d4','#164e63'],['#f97316','#7c2d12']];
  let g, next, sel=-1, busy=false, score=0, best=store.get('ln_best',0), cells=[];
  for(let i=0;i<N*N;i++){ const d=document.createElement('div'); d.className='ln-c'; d.addEventListener('click',()=>click(i)); board.appendChild(d); cells.push(d); }
  const empties=()=>{ const e=[]; for(let i=0;i<N*N;i++) if(!g[i]) e.push(i); return e; };
  const rand3=()=>[0,1,2].map(()=>1+Math.floor(Math.random()*COL.length));
  function ballHTML(c,cls=''){ return `<div class="ln-ball ${cls}" style="--c:${COL[c-1][0]};--d:${COL[c-1][1]}"></div>`; }
  function render(fresh=[]){
    for(let i=0;i<N*N;i++) cells[i].innerHTML = g[i] ? ballHTML(g[i], (i===sel?'sel':'')+(fresh.includes(i)?' grow':'')) : '';
    $('ln-next').innerHTML=next.map(c=>ballHTML(c)).join('');
    $('ln-score').textContent=score; $('ln-best').textContent=best;
  }
  const save=()=>store.set('ln_state',{g,next,score});
  function newGame(){ g=new Array(N*N).fill(0); score=0; sel=-1; busy=false; next=rand3(); ov.hide(); const f=spawn(5); next=rand3(); render(f); save(); }
  function spawn(n, colors){
    const placed=[];
    for(let k=0;k<n;k++){ const e=empties(); if(!e.length) break; const i=e[Math.floor(Math.random()*e.length)]; g[i]=colors?colors[k]:1+Math.floor(Math.random()*COL.length); placed.push(i); }
    return placed;
  }
  function path(a,b){
    const prev=new Array(N*N).fill(-1); prev[a]=a; const q=[a];
    while(q.length){ const i=q.shift(); if(i===b) break; const r=Math.floor(i/N), c=i%N;
      for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){ const rr=r+dr, cc=c+dc; if(rr<0||rr>=N||cc<0||cc>=N) continue; const j=rr*N+cc; if(prev[j]>=0||g[j]) continue; prev[j]=i; q.push(j); } }
    if(prev[b]<0) return null;
    const p=[b]; while(p[0]!==a) p.unshift(prev[p[0]]); return p;
  }
  function lines(list){
    const out=new Set();
    for(const i of list){ const col=g[i]; if(!col) continue; const r=Math.floor(i/N), c=i%N;
      for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
        const run=[i];
        for(const s of [1,-1]){ let rr=r+dr*s, cc=c+dc*s; while(rr>=0&&rr<N&&cc>=0&&cc<N&&g[rr*N+cc]===col){ run.push(rr*N+cc); rr+=dr*s; cc+=dc*s; } }
        if(run.length>=5) run.forEach(j=>out.add(j));
      } }
    return [...out];
  }
  function clearBalls(list, done){
    list.forEach(i=>{ const b=cells[i].firstChild; if(b) b.classList.add('pop'); });
    const n=list.length; score+=n*2+(n-5)*(n-5)*2; if(score>best){ best=score; store.set('ln_best',best); } if(ARC) ARC.prog('line98', score);
    beep(660,.1); setTimeout(()=>beep(990,.15),90);
    setTimeout(()=>{ list.forEach(i=>g[i]=0); done(); }, 300);
  }
  function click(i){
    if(busy||ov.on) return;
    if(g[i]){ sel = sel===i ? -1 : i; render(); return; }
    if(sel<0) return;
    const p=path(sel,i);
    if(!p){ cells[i].classList.remove('no'); void cells[i].offsetWidth; cells[i].classList.add('no'); beep(150,.12,'square',.08); return; }
    busy=true; const col=g[sel]; let k=0; sel=-1;
    const stepper=setInterval(()=>{
      g[p[k]]=0; k++; g[p[k]]=col; render();
      if(k===p.length-1){ clearInterval(stepper); after(i); }
    }, 32);
  }
  function after(i){
    const l=lines([i]);
    if(l.length){ clearBalls(l, ()=>{ busy=false; render(); save(); }); return; }
    const f=spawn(3,next); next=rand3(); render(f);
    const l2=lines(f);
    const finish=()=>{ busy=false; render(); save(); if(!empties().length) gameOver(); };
    if(l2.length) clearBalls(l2, finish); else finish();
  }
  function gameOver(){
    store.set('ln_state',null); if(ARC) ARC.done('line98', {vk:'line98', v:score});
    ov.show('🎱','Hết chỗ rồi!','Điểm: '+score+(score>=best&&score>0?' · Kỷ lục mới!':' · Kỷ lục '+best),[{label:'↻ Ván mới',cls:'primary',fn:newGame}]);
  }
  $('ln-new').onclick=newGame;
  const s=store.get('ln_state',null);
  if(s&&s.g){ g=s.g; next=s.next; score=s.score; }
  return {
    race(){ newGame(); },
    activate(){ if(!g) newGame(); else render(); },
    deactivate(){},
    summary(){ return best? 'Kỷ lục '+best : 'Chưa chơi'; }
  };
})();

/* ================= CHIM BAY ================= */
const FLAPPY = (() => {
  const $=id=>document.getElementById(id), cv=$('fl-c'), ctx=cv.getContext('2d'), ov=mkOverlay('fl-ov');
  const W=360, H=540, GROUND=480, BX=95, R=14, PW=60, GAP=150;
  let sc=1, dpr=1, bird, pipes, score, best=store.get('fl_best',0), state='ready', active=false, running=false, last=0, t=0, spawnT=0, gx=0;
  function reset(){ bird={y:240,v:0}; pipes=[]; score=0; spawnT=0; state='ready'; ov.hide(); $('fl-best').textContent='Kỷ lục '+best; }
  function flap(){
    if(ov.on) return;
    if(state==='ready') state='play';
    if(state==='play'){ bird.v=-320; beep(720,.06,'triangle',.08); }
  }
  function die(){
    if(state!=='play') return; state='dead'; beep(140,.3,'sawtooth',.1);
    if(ARC) ARC.done('flappy', {vk:'flappy', v:score}); const nb=score>best; if(nb){ best=score; store.set('fl_best',best); }
    $('fl-best').textContent='Kỷ lục '+best;
    const medal = score>=40?'🥇':score>=20?'🥈':score>=10?'🥉':'🐤';
    setTimeout(()=>ov.show(medal,'Điểm: '+score, nb?'Kỷ lục mới!':'Kỷ lục: '+best,[{label:'↻ Bay lại',cls:'primary',fn:reset}]), 500);
  }
  function update(dt){
    t+=dt;
    const speed=150+Math.min(80,score*2.5);
    if(state!=='dead') gx=(gx-speed*dt)%24;
    if(state==='ready'){ bird.y=240+Math.sin(t*4)*8; return; }
    bird.v+=1050*dt; bird.y+=bird.v*dt;
    if(bird.y<R){ bird.y=R; bird.v=0; }
    if(bird.y>GROUND-R){ bird.y=GROUND-R; die(); return; }
    if(state!=='play') return;
    spawnT-=dt;
    if(spawnT<=0){ spawnT=1.5; const gy=110+Math.random()*(GROUND-220-GAP/2)+GAP/2-40; pipes.push({x:W+10, gy:Math.max(90+GAP/2,Math.min(GROUND-70-GAP/2,gy)), passed:false}); }
    for(const p of pipes){
      p.x-=speed*dt;
      if(!p.passed && p.x+PW<BX-R){ p.passed=true; score++; beep(1040,.08,'sine',.1); if(ARC) ARC.prog('flappy', score); }
      // collision (circle vs two rects)
      for(const [y1,y2] of [[0,p.gy-GAP/2],[p.gy+GAP/2,GROUND]]){
        const cx=Math.max(p.x,Math.min(BX,p.x+PW)), cy=Math.max(y1,Math.min(bird.y,y2));
        if(Math.hypot(BX-cx,bird.y-cy)<R-2){ die(); return; }
      }
    }
    pipes=pipes.filter(p=>p.x>-PW-10);
  }
  function draw(){
    ctx.setTransform(sc*dpr,0,0,sc*dpr,0,0);
    const sky=ctx.createLinearGradient(0,0,0,GROUND); sky.addColorStop(0,'#38bdf8'); sky.addColorStop(1,'#bae6fd');
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,.85)';
    for(let k=0;k<4;k++){ const x=((k*120 + gx*0.3*5) % (W+120) + W+120) % (W+120) - 60, y=60+k*45%120; ctx.beginPath(); ctx.ellipse(x,y,38,14,0,0,7); ctx.ellipse(x+22,y-8,24,14,0,0,7); ctx.fill(); }
    ctx.fillStyle='#86efac'; for(let k=0;k<8;k++){ ctx.beginPath(); ctx.arc(k*55+((gx*0.5)%55),GROUND+5,40,Math.PI,0); ctx.fill(); }
    for(const p of pipes){
      for(const [y1,y2,lipY] of [[0,p.gy-GAP/2,p.gy-GAP/2-22],[p.gy+GAP/2,GROUND,p.gy+GAP/2]]){
        const g=ctx.createLinearGradient(p.x,0,p.x+PW,0); g.addColorStop(0,'#16a34a'); g.addColorStop(.4,'#4ade80'); g.addColorStop(1,'#15803d');
        ctx.fillStyle=g; ctx.fillRect(p.x,y1,PW,y2-y1);
        ctx.fillRect(p.x-5,lipY,PW+10,22); ctx.strokeStyle='#14532d'; ctx.lineWidth=2; ctx.strokeRect(p.x-5,lipY,PW+10,22); ctx.strokeRect(p.x,y1,PW,y2-y1);
      }
    }
    ctx.fillStyle='#a16207'; ctx.fillRect(0,GROUND,W,H-GROUND);
    ctx.fillStyle='#65a30d'; ctx.fillRect(0,GROUND,W,14);
    ctx.fillStyle='#4d7c0f'; for(let x=gx;x<W;x+=24){ ctx.beginPath(); ctx.moveTo(x,GROUND+14); ctx.lineTo(x+12,GROUND); ctx.lineTo(x+24,GROUND+14); ctx.fill(); }
    // bird
    ctx.save(); ctx.translate(BX,bird.y); ctx.rotate(Math.max(-.5,Math.min(1.2,bird.v/550)));
    ctx.fillStyle='#facc15'; ctx.beginPath(); ctx.ellipse(0,0,R+3,R,0,0,7); ctx.fill(); ctx.strokeStyle='#a16207'; ctx.lineWidth=2; ctx.stroke();
    const flapA=Math.sin(t*(state==='play'?22:10))*5;
    ctx.fillStyle='#fde68a'; ctx.beginPath(); ctx.ellipse(-5,2+flapA*.4,9,5+flapA*.3,-.3,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(7,-5,6,0,7); ctx.fill();
    ctx.fillStyle='#0f172a'; ctx.beginPath(); ctx.arc(9,-5,2.6,0,7); ctx.fill();
    ctx.fillStyle='#f97316'; ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(24,3); ctx.lineTo(12,7); ctx.closePath(); ctx.fill();
    ctx.restore();
    // score
    ctx.font='800 46px "Baloo 2", sans-serif'; ctx.textAlign='center'; ctx.lineWidth=6; ctx.strokeStyle='#0f172a'; ctx.fillStyle='#fff';
    if(state!=='ready'){ ctx.strokeText(score,W/2,70); ctx.fillText(score,W/2,70); }
    else { ctx.font='800 24px "Baloo 2", sans-serif'; ctx.strokeText('Chạm để bay!',W/2,170); ctx.fillText('Chạm để bay!',W/2,170); }
  }
  function frame(now){
    if(!active){ running=false; return; }
    const dt=Math.min(.033,(now-last)/1000); last=now; update(dt); draw(); requestAnimationFrame(frame);
  }
  cv.addEventListener('pointerdown', e=>{ e.preventDefault(); flap(); });
  document.addEventListener('keydown', e=>{ if(current!=='flappy') return; if(e.key===' '||e.key==='ArrowUp'||e.key==='w'){ e.preventDefault(); if(state==='dead'&&ov.on) reset(); else flap(); } });
  window.addEventListener('resize', ()=>{ if(active) ({sc,dpr}=fitCanvas(cv,W,H,230)); });
  reset();
  return {
    race(){ reset(); },
    activate(){ active=true; ({sc,dpr}=fitCanvas(cv,W,H,230)); if(state==='play') state='ready'; last=performance.now(); if(!running){ running=true; requestAnimationFrame(frame); } },
    deactivate(){ active=false; if(state==='play') reset(); },
    summary(){ return best? 'Kỷ lục '+best : 'Chưa chơi'; }
  };
})();

/* ================= PHÁ GẠCH ================= */
const BREAKOUT = (() => {
  const $=id=>document.getElementById(id), cv=$('bo-c'), ctx=cv.getContext('2d'), ov=mkOverlay('bo-ov');
  const W=360, H=520, PY=480, BR=7;
  const ROWC=['#ef4444','#f97316','#facc15','#22c55e','#06b6d4','#3b82f6','#a855f7','#ec4899','#f43f5e'];
  let sc=1, dpr=1, pad, ball, bricks, lives, level, score, best=store.get('bo_best',0), state='ready', active=false, running=false, last=0, keys={}, parts=[];
  function layout(L){
    const rows=Math.min(4+L,9), cols=8, bw=(W-20)/cols, bh=18, out=[], pat=(L-1)%5;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      if(pat===1 && (r+c)%2) continue;
      if(pat===2 && (c<Math.floor(r/2) || c>=cols-Math.floor(r/2))) continue;
      if(pat===3 && (c===3||c===4) && r%2===0) continue;
      if(pat===4 && r%3===1 && c%3!==0) continue;
      const hp = (L>=3 && r<Math.min(3,Math.floor(L/2))) ? 2 : 1;
      out.push({ x:10+c*bw+2, y:60+r*(bh+5), w:bw-4, h:bh, hp, col:ROWC[r%ROWC.length] });
    }
    return out;
  }
  function newGame(){ lives=3; level=1; score=0; loadLevel(); state='ready'; ov.hide(); hud(); }
  function loadLevel(){ bricks=layout(level); pad={x:W/2,w:Math.max(56,78-level*2)}; resetBall(); }
  function resetBall(){ ball={x:pad.x,y:PY-BR-1,vx:0,vy:0,stuck:true}; }
  const speed=()=>290+level*18;
  function launch(){ if(ov.on) return; if(state==='ready') state='play'; if(state==='play'&&ball.stuck){ const a=(Math.random()-.5)*.8; ball.vx=Math.sin(a)*speed(); ball.vy=-Math.cos(a)*speed(); ball.stuck=false; } }
  function hud(){ if(ARC) ARC.prog('breakout', score); $('bo-score').textContent=score; $('bo-level').textContent=level; $('bo-lives').textContent='❤'.repeat(Math.max(0,lives))||'–'; $('bo-best').textContent=best; }
  function pause(){ if(state!=='play') return; state='paused'; ov.show('⏸','Tạm dừng','Màn '+level+' · '+score+' điểm',[{label:'▶ Tiếp tục',cls:'primary',fn:()=>{ ov.hide(); state='play'; last=performance.now(); }},{label:'↻ Chơi lại từ đầu',fn:newGame}]); }
  function burst(x,y,col){ for(let k=0;k<8;k++) parts.push({x,y,vx:(Math.random()-.5)*220,vy:(Math.random()-.8)*220,t:.5,col}); }
  function update(dt){
    for(const p of parts){ p.t-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=500*dt; } parts=parts.filter(p=>p.t>0);
    if(keys.left) pad.x-=420*dt; if(keys.right) pad.x+=420*dt;
    pad.x=Math.max(pad.w/2,Math.min(W-pad.w/2,pad.x));
    if(state!=='play') { if(ball.stuck){ ball.x=pad.x; } return; }
    if(ball.stuck){ ball.x=pad.x; return; }
    const steps=Math.ceil(Math.hypot(ball.vx,ball.vy)*dt/4);
    for(let s=0;s<steps;s++){
      const h=dt/steps; ball.x+=ball.vx*h; ball.y+=ball.vy*h;
      if(ball.x<BR){ ball.x=BR; ball.vx=Math.abs(ball.vx); beep(400,.03,'square',.04); }
      if(ball.x>W-BR){ ball.x=W-BR; ball.vx=-Math.abs(ball.vx); beep(400,.03,'square',.04); }
      if(ball.y<BR){ ball.y=BR; ball.vy=Math.abs(ball.vy); beep(400,.03,'square',.04); }
      if(ball.vy>0 && ball.y+BR>=PY && ball.y+BR<=PY+12 && Math.abs(ball.x-pad.x)<=pad.w/2+BR){
        const k=(ball.x-pad.x)/(pad.w/2), a=Math.max(-1,Math.min(1,k))*1.05, sp=speed();
        ball.vx=Math.sin(a)*sp; ball.vy=-Math.cos(a)*sp; ball.y=PY-BR; beep(520,.05,'triangle',.08);
      }
      for(const b of bricks){
        if(b.hp<=0) continue;
        const cx=Math.max(b.x,Math.min(ball.x,b.x+b.w)), cy=Math.max(b.y,Math.min(ball.y,b.y+b.h));
        if(Math.hypot(ball.x-cx,ball.y-cy)>BR) continue;
        const ox=Math.min(ball.x+BR-b.x, b.x+b.w-(ball.x-BR)), oy=Math.min(ball.y+BR-b.y, b.y+b.h-(ball.y-BR));
        if(ox<oy) ball.vx=-ball.vx; else ball.vy=-ball.vy;
        b.hp--; score+=b.hp>0?5:10; beep(b.hp>0?600:880,.06,'sine',.1);
        if(b.hp<=0) burst(b.x+b.w/2,b.y+b.h/2,b.col);
        if(score>best){ best=score; store.set('bo_best',best); }
        hud(); break;
      }
      if(ball.y>H+20){
        lives--; hud(); beep(160,.3,'sawtooth',.1);
        if(lives<=0){ state='over'; if(ARC) ARC.done('breakout', {vk:'breakout', v:score}); ov.show('💔','Hết mạng!','Màn '+level+' · '+score+' điểm'+(score>=best&&score>0?' · Kỷ lục mới!':''),[{label:'↻ Chơi lại',cls:'primary',fn:newGame}]); }
        else resetBall();
        return;
      }
    }
    if(bricks.every(b=>b.hp<=0)){
      state='ready'; beep(784,.15); setTimeout(()=>beep(1046,.2),120);
      ov.show('🎉','Qua màn '+level+'!','Điểm: '+score,[{label:'Màn '+(level+1)+' ▶',cls:'primary',fn:()=>{ level++; if(lives<5) lives++; loadLevel(); ov.hide(); hud(); }}]);
    }
  }
  function draw(){
    ctx.setTransform(sc*dpr,0,0,sc*dpr,0,0);
    const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#1e1b4b'); g.addColorStop(1,'#0f172a'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    for(const b of bricks){ if(b.hp<=0) continue;
      ctx.fillStyle=b.col; ctx.beginPath(); ctx.roundRect?ctx.roundRect(b.x,b.y,b.w,b.h,4):ctx.rect(b.x,b.y,b.w,b.h); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.3)'; ctx.fillRect(b.x+3,b.y+2,b.w-6,4);
      if(b.hp>1){ ctx.strokeStyle='#fff'; ctx.lineWidth=2.5; ctx.stroke(); } }
    for(const p of parts){ ctx.globalAlpha=p.t*2; ctx.fillStyle=p.col; ctx.fillRect(p.x-2,p.y-2,4,4); } ctx.globalAlpha=1;
    const pg=ctx.createLinearGradient(0,PY,0,PY+12); pg.addColorStop(0,'#fbbf24'); pg.addColorStop(1,'#d97706');
    ctx.fillStyle=pg; ctx.beginPath(); ctx.roundRect?ctx.roundRect(pad.x-pad.w/2,PY,pad.w,12,6):ctx.rect(pad.x-pad.w/2,PY,pad.w,12); ctx.fill();
    ctx.fillStyle='#fff'; ctx.shadowColor='#93c5fd'; ctx.shadowBlur=10; ctx.beginPath(); ctx.arc(ball.x,ball.y,BR,0,7); ctx.fill(); ctx.shadowBlur=0;
    if(ball.stuck && !ov.on){ ctx.font='700 18px "Baloo 2", sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#e2e8f0'; ctx.fillText('Chạm để phóng bóng',W/2,H/2+60); }
  }
  function frame(now){ if(!active){ running=false; return; } const dt=Math.min(.033,(now-last)/1000); last=now; update(dt); draw(); requestAnimationFrame(frame); }
  const toX=e=>{ const r=cv.getBoundingClientRect(); return (e.clientX-r.left)/r.width*W; };
  let dragging=false;
  cv.addEventListener('pointerdown', e=>{ dragging=true; pad.x=toX(e); launch(); try{ cv.setPointerCapture(e.pointerId); }catch(_){} });
  cv.addEventListener('pointermove', e=>{ if(dragging||e.pointerType==='mouse') pad.x=toX(e); });
  cv.addEventListener('pointerup', ()=>dragging=false);
  document.addEventListener('keydown', e=>{ if(current!=='breakout') return;
    if(e.key==='ArrowLeft'||e.key==='a'){ keys.left=true; e.preventDefault(); } if(e.key==='ArrowRight'||e.key==='d'){ keys.right=true; e.preventDefault(); }
    if(e.key===' '){ e.preventDefault(); launch(); } if(e.key==='p'||e.key==='P'){ if(state==='play') pause(); } });
  document.addEventListener('keyup', e=>{ if(e.key==='ArrowLeft'||e.key==='a') keys.left=false; if(e.key==='ArrowRight'||e.key==='d') keys.right=false; });
  $('bo-pause').onclick=()=>{ if(state==='play') pause(); };
  window.addEventListener('resize', ()=>{ if(active) ({sc,dpr}=fitCanvas(cv,W,H,300)); });
  newGame();
  return {
    race(){ newGame(); },
    activate(){ active=true; ({sc,dpr}=fitCanvas(cv,W,H,300)); last=performance.now(); if(!running){ running=true; requestAnimationFrame(frame); } },
    deactivate(){ pause(); active=false; },
    summary(){ return best? 'Kỷ lục '+best : 'Chưa chơi'; }
  };
})();

/* ================= XẾP SỐ ================= */
const SLIDE = (() => {
  const $=id=>document.getElementById(id), ov=mkOverlay('sl-ov'), board=$('sl-board');
  const SIZES=[3,4,5];
  let n=SIZES[store.get('sl_lv',1)], t=[], moves=0, time=0, started=false, done=false, divs={};
  function seg(){ const s=$('sl-seg'); s.innerHTML=''; SIZES.forEach((k,i)=>{ const b=document.createElement('button'); b.textContent=k+'×'+k; b.className=k===n?'on':''; b.onclick=()=>{ n=k; store.set('sl_lv',i); setup(); }; s.appendChild(b); }); }
  function setup(){
    t=[...Array(n*n).keys()].map(i=>(i+1)%(n*n));
    let e=n*n-1, prev=-1;
    for(let k=0;k<n*n*60;k++){
      const r=Math.floor(e/n), c=e%n, opts=[];
      if(r>0) opts.push(e-n); if(r<n-1) opts.push(e+n); if(c>0) opts.push(e-1); if(c<n-1) opts.push(e+1);
      const pick=opts.filter(o=>o!==prev); const j=pick[Math.floor(Math.random()*pick.length)];
      t[e]=t[j]; t[j]=0; prev=e; e=j;
    }
    if(t.every((v,i)=>v===(i+1)%(n*n))) return setup();
    moves=0; time=0; started=false; done=false;
    board.innerHTML=''; divs={};
    for(let v=1; v<n*n; v++){ const d=document.createElement('div'); d.className='sl-t'; d.textContent=v; d.addEventListener('pointerdown',e=>{ e.preventDefault(); tap(t.indexOf(v)); }); board.appendChild(d); divs[v]=d; }
    ov.hide(); seg(); render(); hud();
  }
  function render(){
    const W=board.clientWidth||360, gap=W*.02, s=(W-gap*(n+1))/n;
    for(let i=0;i<n*n;i++){ const v=t[i]; if(!v) continue; const d=divs[v];
      d.style.width=d.style.height=s+'px'; d.style.fontSize=s*.42+'px';
      d.style.transform=`translate(${gap+(i%n)*(s+gap)}px,${gap+Math.floor(i/n)*(s+gap)}px)`;
      d.classList.toggle('ok', v===i+1); }
  }
  function tap(i){
    if(done) return;
    const e=t.indexOf(0), r=Math.floor(i/n), c=i%n, er=Math.floor(e/n), ec=e%n;
    if(r!==er && c!==ec) return;
    const step = r===er ? (c<ec?-1:1) : (r<er?-n:n);
    let cur=e; while(cur!==i){ t[cur]=t[cur+step]; cur+=step; } t[i]=0;
    moves++; started=true; if(ARC) ARC.prog('slide', Math.round(t.filter((v,k)=>v===k+1).length*100/(n*n-1))); beep(500+Math.random()*80,.04,'triangle',.06); render(); hud();
    if(t.every((v,k)=>v===(k+1)%(n*n))){
      done=true; const b=store.get('sl_best',{}), k=n+'x'+n, nb=!b[k]||moves<b[k].moves;
      if(nb){ b[k]={moves,time}; store.set('sl_best',b); } if(ARC) ARC.done('slide', {vk:'slide-'+n, v:time});
      beep(784,.15); setTimeout(()=>beep(1046,.25),120);
      setTimeout(()=>ov.show('🧩','Xếp xong '+n+'×'+n+'!',moves+' nước · '+fmtT(time)+(nb?' · Kỷ lục mới!':''),[{label:'↻ Trộn ván mới',cls:'primary',fn:setup}].concat(n<5?[{label:'Thử '+(n+1)+'×'+(n+1)+' ▶',cls:'green',fn:()=>{ n++; store.set('sl_lv',SIZES.indexOf(n)); setup(); }}]:[])),400);
    }
  }
  function hud(){ $('sl-moves').textContent=moves; $('sl-time').textContent=fmtT(time); const b=store.get('sl_best',{})[n+'x'+n]; $('sl-best').textContent=b?b.moves+' nước':'—'; }
  $('sl-new').onclick=setup;
  setInterval(()=>{ if(current==='slide'&&started&&!done&&!document.hidden){ time++; $('sl-time').textContent=fmtT(time); } },1000);
  window.addEventListener('resize', ()=>{ if(current==='slide') render(); });
  return {
    race(o){ n=SIZES[o.level==null?1:o.level]; setup(); },
    activate(){ if(!t.length) setup(); else render(); },
    deactivate(){},
    summary(){ const b=store.get('sl_best',{}); const k=Object.keys(b); return k.length? 'Đã giải '+k.join(', ').replace(/x/g,'×') : 'Chưa chơi'; }
  };
})();

/* ================= THẢ CỜ 4 ================= */
const CONNECT4 = (() => {
  const $=id=>document.getElementById(id), ov=mkOverlay('c4-ov'), boardEl=$('c4-board');
  const R=6, C=7, MODES=[{k:'easy',n:'🤖 Máy dễ'},{k:'hard',n:'🧠 Máy khó'},{k:'pvp',n:'👥 2 người'}];
  let mode=store.get('c4_mode',0), b, turn, over, thinking=false, winCells=[], lastDrop=null, cells=[];
  for(let r=0;r<R;r++) for(let c=0;c<C;c++){ const d=document.createElement('div'); d.className='c4-c'; d.addEventListener('click',()=>human(c)); boardEl.appendChild(d); cells.push(d); }
  function seg(){ const s=$('c4-seg'); s.innerHTML=''; MODES.forEach((M,i)=>{ const e=document.createElement('button'); e.textContent=M.n; e.className=i===mode?'on':''; e.onclick=()=>{ mode=i; store.set('c4_mode',i); newGame(); }; s.appendChild(e); }); }
  function newGame(){ b=[...Array(R)].map(()=>Array(C).fill(0)); turn=1; over=false; thinking=false; winCells=[]; lastDrop=null; ov.hide(); seg(); render(); }
  const rowFor=(bd,c)=>{ for(let r=R-1;r>=0;r--) if(!bd[r][c]) return r; return -1; };
  function winner(bd){
    for(let r=0;r<R;r++) for(let c=0;c<C;c++){ const p=bd[r][c]; if(!p) continue;
      for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){ const cs=[[r,c]];
        for(let k=1;k<4;k++){ const rr=r+dr*k, cc=c+dc*k; if(rr<0||rr>=R||cc<0||cc>=C||bd[rr][cc]!==p) break; cs.push([rr,cc]); }
        if(cs.length===4) return {p,cs}; } }
    return null;
  }
  function drop(c){
    const r=rowFor(b,c); if(r<0) return false;
    b[r][c]=turn; lastDrop=[r,c]; beep(turn===1?440:330,.08,'triangle',.1);
    const w=winner(b);
    if(w){ over=true; winCells=w.cs; finish(w.p); }
    else if(b[0].every(v=>v)){ over=true; finish(0); }
    else turn=3-turn;
    render(); return true;
  }
  function finish(p){
    if(MP){ MP.o = p || 3; return; }
    const M=MODES[mode].k, rec=store.get('c4_rec',{}), x=rec[M]||{w:0,l:0,d:0};
    if(p===1)x.w++; else if(p===2)x.l++; else x.d++; rec[M]=x; store.set('c4_rec',rec);
    const pvp=M==='pvp';
    const [icon,title] = p===0?['🤝','Hòa!'] : pvp?[p===1?'🔴':'🟡',(p===1?'🔴 Đỏ':'🟡 Vàng')+' thắng!'] : p===1?['🏆','Bạn thắng!']:['🤖','Máy thắng!'];
    setTimeout(()=>ov.show(icon,title,'Thành tích '+MODES[mode].n+': '+x.w+' – '+x.l+' – '+x.d,[{label:'↻ Ván mới',cls:'primary',fn:newGame},{label:'Xem bàn cờ',fn:()=>ov.hide()}]),700);
  }
  function human(c){
    if(MP){ if(over||turn!==MP.mySeat) return; if(!drop(c)) return; ARC.turnMove('connect4', mpState()); return; }
    if(over||thinking) return;
    const ai=MODES[mode].k!=='pvp'; if(ai&&turn!==1) return;
    if(!drop(c)) return;
    if(ai&&!over){ thinking=true; render(); setTimeout(()=>{ drop(aiPick()); thinking=false; render(); },350); }
  }
  // ---- AI: negamax with alpha-beta ----
  function scoreWin(w,p){ const me=w.filter(v=>v===p).length, op=w.filter(v=>v===3-p).length, e=4-me-op;
    if(me===4) return 1000; if(me===3&&e===1) return 6; if(me===2&&e===2) return 2; if(op===3&&e===1) return -5; return 0; }
  function heur(bd,p){
    let s=0; for(let r=0;r<R;r++) if(bd[r][3]===p) s+=3;
    for(let r=0;r<R;r++) for(let c=0;c<C;c++) for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      const er=r+dr*3, ec=c+dc*3; if(er<0||er>=R||ec<0||ec>=C) continue;
      s+=scoreWin([0,1,2,3].map(k=>bd[r+dr*k][c+dc*k]),p); }
    return s;
  }
  const ORDER=[3,2,4,1,5,0,6];
  function negamax(bd,depth,a,bt,p){
    const w=winner(bd); if(w) return w.p===p ? 100000+depth : -100000-depth;
    if(bd[0].every(v=>v)) return 0;
    if(depth===0) return heur(bd,p)-heur(bd,3-p);
    let best=-Infinity;
    for(const c of ORDER){ const r=rowFor(bd,c); if(r<0) continue;
      bd[r][c]=p; const v=-negamax(bd,depth-1,-bt,-a,3-p); bd[r][c]=0;
      if(v>best) best=v; if(v>a) a=v; if(a>=bt) break; }
    return best;
  }
  function aiPick(){
    const hard=MODES[mode].k==='hard', depth=hard?6:2;
    const valid=ORDER.filter(c=>rowFor(b,c)>=0);
    if(!hard && Math.random()<.25) return valid[Math.floor(Math.random()*valid.length)];
    let best=-Infinity, pick=valid[0];
    for(const c of valid){ const r=rowFor(b,c); b[r][c]=2; const v=-negamax(b,depth-1,-Infinity,Infinity,1)+Math.random()*.5; b[r][c]=0; if(v>best){ best=v; pick=c; } }
    return pick;
  }
  function render(){
    for(let r=0;r<R;r++) for(let c=0;c<C;c++){
      const d=cells[r*C+c], v=b[r][c];
      if(!v){ d.innerHTML=''; continue; }
      const isNew=lastDrop&&lastDrop[0]===r&&lastDrop[1]===c, win=winCells.some(([wr,wc])=>wr===r&&wc===c);
      const want='c4-d p'+v+(win?' win':'');
      let disc=d.firstChild;
      if(!disc){
        disc=document.createElement('div'); d.appendChild(disc);
        if(isNew){ disc.style.setProperty('--d',r+1); disc.dataset.f='1'; disc.addEventListener('animationend',ev=>{ if(ev.animationName==='c4fall'){ delete disc.dataset.f; disc.classList.remove('fall'); } }); }
      }
      disc.className=want+(disc.dataset.f?' fall':'');
    }
    const ai=MODES[mode].k!=='pvp';
    if(MP){ const nm=s=>MP.seats[s]?MP.seats[s].a+' '+MP.seats[s].n:'?', sy=s=>s===1?'🔴':'🟡'; $('c4-turn').textContent = over?'Kết thúc' : turn===MP.mySeat ? 'Bạn ('+sy(turn)+')' : nm(turn)+' ('+sy(turn)+')'; $('c4-rec').textContent='🔴 '+nm(1)+' · 🟡 '+nm(2); return; }
    $('c4-turn').textContent= over?'Kết thúc' : ai?(turn===1?'Bạn (🔴)':'Máy đang nghĩ… (🟡)') : (turn===1?'🔴 Đỏ đi':'🟡 Vàng đi');
    const x=(store.get('c4_rec',{})[MODES[mode].k])||{w:0,l:0,d:0}; $('c4-rec').textContent=x.w+' – '+x.l+' – '+x.d;
  }

  /* ---- online ---- */
  let MP=null;
  const mpState = () => ({ b:b.map(r=>r.join('')).join(''), t:turn, w:winCells.length?winCells:null, o:(MP&&MP.o)||0, ld:lastDrop });
  function mpInit(set, n, round){ return { b:'0'.repeat(R*C), t:((round-1)%2)+1, w:null, o:0, ld:null }; }
  function mpStart(ctx){ MP=Object.assign({ o:0 }, ctx); ov.hide(); relabel('connect4',['ĐẾN LƯỢT','NGƯỜI CHƠI']); b=[...Array(R)].map(()=>Array(C).fill(0)); winCells=[]; lastDrop=null; over=false; thinking=false; cells.forEach(c=>c.innerHTML=''); }
  function mpApply(s){ if(!MP || !s || !s.b) return; for(let r=0;r<R;r++) for(let c=0;c<C;c++) b[r][c]=+s.b[r*C+c]; turn=s.t; winCells=s.w||[]; MP.o=s.o||0; over=!!s.o; lastDrop=s.ld||null; render(); }
  function mpStop(){ MP=null; relabel('connect4',null); newGame(); }
  function mpResult(s, ps){ return ps.map(p=>({ id:p.id, n:p.n, a:p.a, rank: s.o===3?1:(p.seat===s.o?1:2), txt: s.o===3?'Hòa':(p.seat===s.o?'Thắng':'Thua') })).sort((a,b)=>a.rank-b.rank); }
  $('c4-new').onclick=newGame;
  newGame();
  return {
    mpInit, mpStart, mpApply, mpStop, mpResult,
    activate(){ seg(); render(); },
    deactivate(){},
    summary(){ const r=store.get('c4_rec',{}), w=(r.easy?.w||0)+(r.hard?.w||0); return w? 'Thắng máy '+w+' ván' : 'Chưa chơi'; }
  };
})();

/* ================= ĐẬP CHUỘT ================= */
const WHACK = (() => {
  const $=id=>document.getElementById(id), ov=mkOverlay('wh-ov'), gridEl=$('wh-grid');
  const DUR=30;
  let holes=[], score=0, left=DUR, best=store.get('wh_best',0), state='ready', timer=null, spawner=null, startAt=0;
  for(let i=0;i<9;i++){
    const h=document.createElement('div'); h.className='wh-h'; h.innerHTML='<div class="wh-m"></div>';
    h.addEventListener('pointerdown', e=>{ e.preventDefault(); hit(i); });
    gridEl.appendChild(h); holes.push({el:h, type:null, until:0, hide:null});
  }
  function intro(){ state='ready'; score=0; left=DUR; hud(); ov.show('🔨','Đập chuột','Bạn có 30 giây. Chuột ló lên càng lúc càng nhanh!',[{label:'▶ Bắt đầu',cls:'primary',fn:start}]); }
  function start(){
    ov.hide(); state='play'; score=0; left=DUR; startAt=performance.now(); hud();
    clearInterval(timer); timer=setInterval(()=>{ left--; hud(); if(left<=0) end(); },1000);
    loop();
  }
  function loop(){
    if(state!=='play') return;
    const el=(performance.now()-startAt)/1000;
    const free=holes.map((h,i)=>i).filter(i=>!holes[i].type);
    const n = el>18 && Math.random()<.35 ? 2 : 1;
    for(let k=0;k<n&&free.length;k++){
      const i=free.splice(Math.floor(Math.random()*free.length),1)[0], h=holes[i];
      const r=Math.random(); h.type = r<.13?'bomb': r<.22?'gold':'mole';
      h.el.firstChild.textContent = h.type==='bomb'?'💣':h.type==='gold'?'🐿️':'🐹';
      h.el.classList.remove('hit'); h.el.classList.add('up');
      const stay=Math.max(520, 1100-el*20);
      clearTimeout(h.hide); h.hide=setTimeout(()=>down(i), stay);
    }
    spawner=setTimeout(loop, Math.max(330, 800-el*16));
  }
  function down(i){ const h=holes[i]; h.el.classList.remove('up'); setTimeout(()=>{ if(!h.el.classList.contains('up')) h.type=null; },130); }
  function fx(h,txt,col){ const f=document.createElement('div'); f.className='wh-fx'; f.textContent=txt; f.style.color=col; h.el.appendChild(f); setTimeout(()=>f.remove(),600); }
  function hit(i){
    const h=holes[i]; if(state!=='play'||!h.type||h.el.classList.contains('hit')||!h.el.classList.contains('up')) return;
    if(h.type==='bomb'){ score=Math.max(0,score-5); fx(h,'−5','#f87171'); beep(120,.25,'sawtooth',.12); gridEl.animate([{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'none'}],{duration:250}); }
    else { const p=h.type==='gold'?3:1; score+=p; fx(h,'+'+p, h.type==='gold'?'#fde047':'#fff'); beep(h.type==='gold'?1200:820,.07,'square',.08); }
    h.el.classList.add('hit'); clearTimeout(h.hide); h.hide=setTimeout(()=>down(i),180); hud();
  }
  function end(){
    state='over'; clearInterval(timer); clearTimeout(spawner);
    holes.forEach((h,i)=>{ clearTimeout(h.hide); down(i); });
    const nb=score>best; if(nb){ best=score; store.set('wh_best',best); } hud(); if(ARC) ARC.done('whack', {vk:'whack', v:score});
    ov.show(score>=40?'🏆':'🔨','Hết giờ!','Bạn đập được '+score+' điểm'+(nb?' · Kỷ lục mới!':' · Kỷ lục '+best),[{label:'↻ Chơi lại',cls:'primary',fn:start}]);
  }
  function hud(){ if(ARC) ARC.prog('whack', score); $('wh-score').textContent=score; $('wh-time').textContent=left; $('wh-best').textContent='Kỷ lục '+best; }
  return {
    race(){ start(); },
    activate(){ if(state!=='play') intro(); },
    deactivate(){ if(state==='play'){ clearInterval(timer); clearTimeout(spawner); holes.forEach((h,i)=>{ clearTimeout(h.hide); down(i); }); state='ready'; } },
    summary(){ return best? 'Kỷ lục '+best : 'Chưa chơi'; }
  };
})();

/* ================= TÍNH NHẨM ================= */
const MATHG = (() => {
  const $=id=>document.getElementById(id), ov=mkOverlay('mt-ov');
  const LV=[{k:'easy',n:'Dễ'},{k:'med',n:'Vừa'},{k:'hard',n:'Khó'}];
  let lv=store.get('mt_lv',0), score=0, left=60, streak=0, ans=0, state='ready', timer=null, lockAns=false;
  const ri=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
  function seg(){ const s=$('mt-seg'); s.innerHTML=''; LV.forEach((L,i)=>{ const b=document.createElement('button'); b.textContent=L.n; b.className=i===lv?'on':''; b.onclick=()=>{ if(state==='play') return; lv=i; store.set('mt_lv',i); seg(); intro(); }; s.appendChild(b); }); }
  function question(){
    let a,b,op,r;
    const k=LV[lv].k, ops = k==='easy'?['+','−'] : k==='med'?['+','−','×'] : ['+','−','×','÷'];
    op=ops[ri(0,ops.length-1)];
    if(op==='+'){ const m=k==='easy'?10:k==='med'?50:200; a=ri(1,m); b=ri(1,m); r=a+b; }
    else if(op==='−'){ const m=k==='easy'?20:k==='med'?100:300; a=ri(2,m); b=ri(1,a); r=a-b; }
    else if(op==='×'){ const m=k==='med'?10:15; a=ri(2,m); b=ri(2,k==='med'?10:12); r=a*b; }
    else { b=ri(2,12); r=ri(2,15); a=b*r; }
    ans=r; $('mt-q').textContent=`${a} ${op} ${b} = ?`; $('mt-q').className='mt-q';
    const opts=new Set([r]);
    while(opts.size<4){ const d=ri(1,Math.max(3,Math.round(Math.abs(r)*.15)+2))*(Math.random()<.5?-1:1); const v=r+d; if(v>=0) opts.add(v); if(opts.size<4 && Math.random()<.2) opts.add(r+10*(Math.random()<.5?-1:1)>0?r+10:r+1); }
    const box=$('mt-ans'); box.innerHTML='';
    shuf([...opts]).forEach(v=>{ const bt=document.createElement('button'); bt.textContent=v; bt.addEventListener('pointerdown',e=>{ e.preventDefault(); pick(v,bt); }); box.appendChild(bt); });
    lockAns=false;
  }
  function pick(v,bt){
    if(state!=='play'||lockAns) return; lockAns=true;
    if(v===ans){ streak++; score+=1+Math.floor(streak/5); bt.classList.add('right'); $('mt-q').classList.add('good'); beep(880,.08,'sine',.1); if(streak%5===0){ left+=3; } }
    else { streak=0; left=Math.max(0,left-3); bt.classList.add('wrong'); $('mt-q').classList.add('bad'); beep(160,.15,'square',.08);
      [...$('mt-ans').children].forEach(b=>{ if(+b.textContent===ans) b.classList.add('right'); }); }
    hud(); setTimeout(()=>{ if(state==='play') question(); }, v===ans?220:650);
  }
  function intro(){ state='ready'; clearInterval(timer); score=0; left=60; streak=0; hud(); $('mt-q').textContent='?'; $('mt-ans').innerHTML='';
    ov.show('➗','Tính nhẩm nhanh','Cấp '+LV[lv].n+' · 60 giây. Sẵn sàng chưa?',[{label:'▶ Bắt đầu',cls:'primary',fn:start}]); }
  function start(){ ov.hide(); state='play'; score=0; left=60; streak=0; hud(); question(); clearInterval(timer); timer=setInterval(()=>{ left--; hud(); if(left<=0) end(); },1000); }
  function end(){
    state='over'; clearInterval(timer); const b=store.get('mt_best',{}), k=LV[lv].k, nb=score>(b[k]||0); if(nb){ b[k]=score; store.set('mt_best',b); } hud(); if(ARC) ARC.done('math', {vk:'math-'+k, v:score});
    ov.show('⏰','Hết giờ!','Cấp '+LV[lv].n+': '+score+' điểm'+(nb?' · Kỷ lục mới!':' · Kỷ lục '+(b[k]||0)),[{label:'↻ Chơi lại',cls:'primary',fn:start},{label:'Đổi cấp độ',fn:()=>{ ov.hide(); state='ready'; }}]);
  }
  function hud(){ if(ARC) ARC.prog('math', score); $('mt-score').textContent=score; $('mt-time').textContent=Math.max(0,left); $('mt-streak').textContent=streak; $('mt-best').textContent='Kỷ lục '+((store.get('mt_best',{})[LV[lv].k])||0); }
  document.addEventListener('keydown', e=>{ if(current!=='math'||state!=='play') return; const n=+e.key; if(n>=1&&n<=4){ const bt=$('mt-ans').children[n-1]; if(bt) pick(+bt.textContent,bt); } });
  return {
    race(o){ lv=o.level||0; seg(); start(); },
    activate(){ seg(); if(state!=='play') intro(); },
    deactivate(){ if(state==='play'){ clearInterval(timer); state='ready'; } },
    summary(){ const b=store.get('mt_best',{}); const m=Math.max(0,...Object.values(b)); return m? 'Kỷ lục '+m+' điểm' : 'Chưa chơi'; }
  };
})();

/* ================= SIMON ================= */
const SIMON = (() => {
  const $=id=>document.getElementById(id), ov=mkOverlay('si-ov');
  const pads=[...document.querySelectorAll('#si-pad .si-b')], TONE=[392,330,262,196];
  let seq=[], pos=0, state='ready', best=store.get('si_best',0), token=0;
  function light(i,ms){ pads[i].classList.add('lit'); beep(TONE[i],ms/1000,'triangle',.18); setTimeout(()=>pads[i].classList.remove('lit'),ms); }
  function intro(){ state='ready'; seq=[]; $('si-round').textContent='–'; $('si-best').textContent='Kỷ lục '+best;
    ov.show('🎵','Simon nhớ màu','Nhớ và bấm lại chuỗi màu. Bật âm thanh để dễ nhớ hơn!',[{label:'▶ Bắt đầu',cls:'primary',fn:()=>{ ov.hide(); seq=[]; nextRound(); }}]); }
  function nextRound(){
    seq.push(Math.floor(Math.random()*4)); pos=0; state='show'; if(ARC) ARC.prog('simon', seq.length-1); $('si-round').textContent=seq.length;
    const my=++token, gap=Math.max(220, 520-seq.length*18);
    seq.forEach((p,k)=>setTimeout(()=>{ if(my===token) light(p,gap*.75); }, 600+k*gap));
    setTimeout(()=>{ if(my===token) state='input'; }, 600+seq.length*gap);
  }
  pads.forEach((el,i)=>el.addEventListener('pointerdown', e=>{
    e.preventDefault(); if(state!=='input') return;
    light(i,220);
    if(seq[pos]!==i){ state='over'; token++; beep(110,.5,'sawtooth',.15);
      const r=seq.length-1, nb=r>best; if(nb){ best=r; store.set('si_best',best); } if(ARC) ARC.done('simon', {vk:'simon', v:r});
      setTimeout(()=>ov.show('🙈','Sai rồi!','Bạn nhớ được '+r+' màu'+(nb?' · Kỷ lục mới!':' · Kỷ lục '+best),[{label:'↻ Chơi lại',cls:'primary',fn:()=>{ ov.hide(); seq=[]; nextRound(); }}]),400);
      return; }
    pos++;
    if(pos===seq.length){ state='wait'; setTimeout(nextRound,700); }
  }));
  return {
    race(){ ov.hide(); seq=[]; nextRound(); },
    activate(){ if(state==='ready'||state==='over') intro(); },
    deactivate(){ token++; if(state!=='ready') { state='ready'; } },
    summary(){ return best? 'Kỷ lục '+best+' màu' : 'Chưa chơi'; }
  };
})();



/* ================= BẮN MÁY BAY ================= */
const SHOOTER = (() => {
  const $=id=>document.getElementById(id), cv=$('sh-c'), ctx=cv.getContext('2d'), ov=mkOverlay('sh-ov');
  const W=360, H=540;
  let sc=1, dpr=1, P, bul, ebul, foes, parts, pups, stars, score, lives, power, t, spawnT, bossT, boss, best=store.get('sh_best',0), state='ready', active=false, running=false, last=0, keys={}, fireT=0, drag=null, flash=0;
  function reset(){
    P={x:W/2,y:H-80,inv:0}; bul=[]; ebul=[]; foes=[]; parts=[]; pups=[]; score=0; lives=3; power=1; t=0; spawnT=1; bossT=55; boss=null; flash=0;
    stars=[...Array(50)].map(()=>({x:Math.random()*W,y:Math.random()*H,v:30+Math.random()*90,s:Math.random()*1.6+.4}));
    state='ready'; ov.hide(); hud();
  }
  function hud(){ $('sh-score').textContent=score; $('sh-lives').textContent='❤'.repeat(Math.max(0,lives))||'—'; $('sh-best').textContent=best; $('sh-lv').textContent=1+Math.floor(t/30); }
  function boom(x,y,c,n){ for(let k=0;k<n;k++){ const a=Math.random()*7, v=40+Math.random()*180; parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l:.4+Math.random()*.5,c}); } }
  function addScore(v){ score+=v; if(ARC) ARC.prog('shooter', score); hud(); }
  function spawn(){
    const lv=1+Math.floor(t/30), r=Math.random();
    if(r<.12+lv*.02 && t>20) foes.push({k:'c',x:40+Math.random()*(W-80),y:-40,vx:0,vy:45,hp:8+lv*2,mx:8+lv*2,r:26,ft:1.2,pts:500});
    else if(r<.45) { const x=30+Math.random()*(W-60); foes.push({k:'b',x,y:-20,ox:x,vy:85+lv*6,hp:2,mx:2,r:15,ft:.8+Math.random(),ph:Math.random()*6,pts:150}); }
    else { const x=20+Math.random()*(W-40), n=Math.random()<.4?3:1; for(let k=0;k<n;k++) foes.push({k:'a',x:Math.max(18,Math.min(W-18,x+(k-1)*34)),y:-20-k*26,vy:120+lv*10,hp:1,mx:1,r:13,pts:100}); }
  }
  function hitPlayer(){
    if(P.inv>0 || state!=='play') return; lives--; power=Math.max(1,power-1); P.inv=2.2; flash=.25; boom(P.x,P.y,'#f97316',26); beep(160,.3,'sawtooth',.12); hud();
    if(lives<=0) over();
  }
  function over(){
    state='dead'; boom(P.x,P.y,'#facc15',60);
    if(ARC) ARC.done('shooter', {vk:'shooter', v:score});
    const nb=score>best; if(nb){ best=score; store.set('sh_best',best); } hud();
    setTimeout(()=>ov.show(score>=20000?'🏆':score>=8000?'🥇':score>=3000?'🥈':'✈️','Điểm: '+score.toLocaleString('vi-VN'), nb?'Kỷ lục mới!':'Kỷ lục: '+best.toLocaleString('vi-VN'),[{label:'↻ Bay lại',cls:'primary',fn:reset}]), 700);
  }
  function update(dt){
    for(const s of stars){ s.y+=s.v*dt*(state==='play'?1:.4); if(s.y>H){ s.y=0; s.x=Math.random()*W; } }
    parts.forEach(p=>{ p.x+=p.vx*dt; p.y+=p.vy*dt; p.l-=dt; }); parts=parts.filter(p=>p.l>0);
    flash=Math.max(0,flash-dt);
    if(state!=='play') return;
    t+=dt; P.inv=Math.max(0,P.inv-dt);
    // điều khiển bàn phím
    const sp=280; let dx=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0), dy=(keys.ArrowDown||keys.s?1:0)-(keys.ArrowUp||keys.w?1:0);
    P.x+=dx*sp*dt; P.y+=dy*sp*dt; P.x=Math.max(18,Math.min(W-18,P.x)); P.y=Math.max(H*.35,Math.min(H-28,P.y));
    // bắn tự động
    fireT-=dt; if(fireT<=0){ fireT=.16;
      const sh=[[0,-520]]; if(power>=2){ sh.length=0; sh.push([-6,-520],[6,-520]); } if(power>=3) sh.push([-150,-490],[150,-490]); if(power>=4) sh.push([-70,-510],[70,-510]);
      sh.forEach(([vx,vy],k)=>bul.push({x:P.x+(power>=2&&k<2?(k?7:-7):0),y:P.y-20,vx,vy})); }
    bul.forEach(b=>{ b.x+=b.vx*dt; b.y+=b.vy*dt; }); bul=bul.filter(b=>b.y>-10&&b.x>-10&&b.x<W+10);
    ebul.forEach(b=>{ b.x+=b.vx*dt; b.y+=b.vy*dt; }); ebul=ebul.filter(b=>b.y<H+10&&b.y>-10&&b.x>-10&&b.x<W+10);
    // sinh địch
    if(!boss){ spawnT-=dt; if(spawnT<=0){ spawnT=Math.max(.35, 1.1-t/120); spawn(); }
      bossT-=dt; if(bossT<=0){ const lv=1+Math.floor(t/30); boss={k:'boss',x:W/2,y:-70,vx:70,vy:40,hp:70+lv*30,mx:70+lv*30,r:46,ft:1,pts:3000+lv*500}; foes.push(boss); beep(110,.6,'square',.08); } }
    const aim=(f,spd,spread)=>{ const a=Math.atan2(P.y-f.y,P.x-f.x); (spread||[0]).forEach(o=>ebul.push({x:f.x,y:f.y+f.r*.6,vx:Math.cos(a+o)*spd,vy:Math.sin(a+o)*spd})); };
    for(const f of foes){
      if(f.k==='b'){ f.ph+=dt*3; f.x=f.ox+Math.sin(f.ph)*50; }
      if(f.k==='boss'){ if(f.y<90) f.y+=f.vy*dt; f.x+=f.vx*dt; if(f.x<60||f.x>W-60) f.vx*=-1; }
      else f.y+=f.vy*dt*(f.k==='c'&&f.y>120?.25:1);
      if(f.ft!=null){ f.ft-=dt; if(f.ft<=0){
        if(f.k==='b'){ f.ft=1.6+Math.random(); aim(f,190); }
        else if(f.k==='c'){ f.ft=1.4; aim(f,170,[-.25,0,.25]); }
        else { f.ft=f.hp<f.mx/2?.55:.9; if(Math.random()<.5) aim(f,200,[-.35,-.12,.12,.35]); else for(let k=0;k<10;k++){ const a=k/10*Math.PI*2+t; ebul.push({x:f.x,y:f.y,vx:Math.cos(a)*140,vy:Math.sin(a)*140+40}); } } } }
      for(const b of bul){ if(b.hit) continue; if(Math.hypot(b.x-f.x,b.y-f.y)<f.r+4){ b.hit=1; f.hp--; boom(b.x,b.y,'#fde68a',3);
        if(f.hp<=0 && !f.dead){ f.dead=1; addScore(f.pts); boom(f.x,f.y,f.k==='boss'?'#f43f5e':'#fb923c',f.k==='boss'?90:f.k==='c'?40:18); beep(f.k==='boss'?90:300,.2,'square',.07);
          if(f.k==='boss'){ boss=null; bossT=60; ebul=[]; pups.push({x:f.x,y:f.y,k:'L'},{x:f.x+30,y:f.y,k:'P'}); }
          else if(Math.random()<(f.k==='c'?.7:.06)) pups.push({x:f.x,y:f.y,k:Math.random()<.2?'L':Math.random()<.5?'S':'P'}); } } }
      if(!f.dead && Math.hypot(f.x-P.x,f.y-P.y)<f.r+12){ if(f.k!=='boss'){ f.dead=1; boom(f.x,f.y,'#fb923c',18); } hitPlayer(); }
    }
    bul=bul.filter(b=>!b.hit);
    foes=foes.filter(f=>!f.dead && f.y<H+60);
    if(boss && !foes.includes(boss)) boss=null;
    for(const b of ebul){ if(Math.hypot(b.x-P.x,b.y-P.y)<9){ b.y=H+99; hitPlayer(); } }
    pups.forEach(p=>{ p.y+=90*dt; if(Math.hypot(p.x-P.x,p.y-P.y)<24){ p.y=H+99; beep(880,.1,'triangle',.1);
      if(p.k==='P'){ if(power<4) power++; else addScore(500); } else if(p.k==='L'){ if(lives<5) lives++; else addScore(1000); hud(); } else { P.inv=Math.max(P.inv,5); } } });
    pups=pups.filter(p=>p.y<H+20);
    if(Math.floor(t)!==Math.floor(t-dt)) hud();
  }
  function plane(x,y,s,col,dir){ ctx.save(); ctx.translate(x,y); ctx.scale(s,s*dir); ctx.fillStyle=col;
    ctx.beginPath(); ctx.moveTo(0,-20); ctx.lineTo(5,-6); ctx.lineTo(20,4); ctx.lineTo(20,9); ctx.lineTo(5,5); ctx.lineTo(4,14); ctx.lineTo(10,19); ctx.lineTo(-10,19); ctx.lineTo(-4,14); ctx.lineTo(-5,5); ctx.lineTo(-20,9); ctx.lineTo(-20,4); ctx.lineTo(-5,-6); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(0,-6,2.6,6,0,0,7); ctx.fill(); ctx.restore(); }
  function draw(){
    ctx.setTransform(sc*dpr,0,0,sc*dpr,0,0);
    const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#020617'); g.addColorStop(1,'#1e1b4b'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#fff'; for(const s of stars){ ctx.globalAlpha=.3+s.s/3; ctx.fillRect(s.x,s.y,s.s,s.s*2); } ctx.globalAlpha=1;
    for(const p of pups){ ctx.fillStyle=p.k==='P'?'#22c55e':p.k==='L'?'#ef4444':'#38bdf8'; ctx.beginPath(); ctx.arc(p.x,p.y,11,0,7); ctx.fill(); ctx.fillStyle='#fff'; ctx.font='800 13px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(p.k==='P'?'P':p.k==='L'?'♥':'S',p.x,p.y+1); }
    for(const f of foes){
      if(f.k==='a') plane(f.x,f.y,.75,'#f87171',-1);
      else if(f.k==='b') plane(f.x,f.y,.85,'#fb923c',-1);
      else if(f.k==='c') plane(f.x,f.y,1.45,'#a855f7',-1);
      else { plane(f.x,f.y,2.6,'#e11d48',-1); ctx.fillStyle='#fde047'; ctx.beginPath(); ctx.arc(f.x,f.y+4,9,0,7); ctx.fill(); }
      if(f.mx>2){ ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(f.x-f.r,f.y-f.r-10,f.r*2,4); ctx.fillStyle='#4ade80'; ctx.fillRect(f.x-f.r,f.y-f.r-10,f.r*2*f.hp/f.mx,4); }
    }
    ctx.fillStyle='#fde047'; for(const b of bul) ctx.fillRect(b.x-1.5,b.y-7,3,12);
    ctx.fillStyle='#f472b6'; for(const b of ebul){ ctx.beginPath(); ctx.arc(b.x,b.y,4,0,7); ctx.fill(); }
    for(const p of parts){ ctx.globalAlpha=Math.max(0,p.l*2); ctx.fillStyle=p.c; ctx.fillRect(p.x-2,p.y-2,4,4); } ctx.globalAlpha=1;
    if(state!=='dead' && !(P.inv>0 && Math.floor(P.inv*10)%2)){
      ctx.fillStyle='rgba(56,189,248,.5)'; ctx.beginPath(); ctx.ellipse(P.x,P.y+22,4,6+Math.random()*5,0,0,7); ctx.fill();
      plane(P.x,P.y,1.15,'#38bdf8',1);
      if(P.inv>2.3){ ctx.strokeStyle='rgba(56,189,248,.7)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(P.x,P.y,28,0,7); ctx.stroke(); } }
    if(boss){ ctx.fillStyle='#fff'; ctx.font='800 13px "Baloo 2",sans-serif'; ctx.textAlign='center'; ctx.fillText('⚠ TRÙM ⚠',W/2,22); }
    if(flash){ ctx.fillStyle=`rgba(239,68,68,${flash})`; ctx.fillRect(0,0,W,H); }
    if(state==='ready'){ ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.font='800 26px "Baloo 2",sans-serif'; ctx.fillText('Chạm để cất cánh!',W/2,H/2-30); ctx.font='600 14px "Baloo 2",sans-serif'; ctx.fillStyle='#cbd5e1'; ctx.fillText('Kéo ngón tay để lái — máy bay tự bắn',W/2,H/2); }
  }
  function frame(now){ if(!active){ running=false; return; } const dt=Math.min(.033,(now-last)/1000); last=now; update(dt); draw(); requestAnimationFrame(frame); }
  const pt=e=>{ const r=cv.getBoundingClientRect(); return { x:(e.clientX-r.left)/r.width*W, y:(e.clientY-r.top)/r.height*H }; };
  cv.addEventListener('pointerdown', e=>{ e.preventDefault(); if(ov.on) return; if(state==='ready') state='play'; const p=pt(e); drag={x:p.x,y:p.y,px:P.x,py:P.y}; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e=>{ if(!drag || state!=='play') return; const p=pt(e); P.x=Math.max(18,Math.min(W-18,drag.px+(p.x-drag.x)*1.3)); P.y=Math.max(H*.35,Math.min(H-28,drag.py+(p.y-drag.y)*1.3)); });
  cv.addEventListener('pointerup', ()=>drag=null); cv.addEventListener('pointercancel', ()=>drag=null);
  document.addEventListener('keydown', e=>{ if(current!=='shooter') return; if(e.key.startsWith('Arrow')||'wasd '.includes(e.key)) e.preventDefault(); keys[e.key]=true; if(state==='ready') state='play'; if(e.key===' ' && state==='dead' && ov.on) reset(); });
  document.addEventListener('keyup', e=>{ keys[e.key]=false; });
  window.addEventListener('resize', ()=>{ if(active) ({sc,dpr}=fitCanvas(cv,W,H,250)); });
  reset();
  return {
    race(){ reset(); },
    activate(){ active=true; ({sc,dpr}=fitCanvas(cv,W,H,250)); last=performance.now(); if(!running){ running=true; requestAnimationFrame(frame); } },
    deactivate(){ active=false; keys={}; if(state==='play'){ state='ready'; } },
    summary(){ return best ? 'Kỷ lục '+best.toLocaleString('vi-VN') : 'Chưa chơi'; }
  };
})();

/* =====================================================================
   13 GAME BÀN CHƠI NHIỀU NGƯỜI — mỗi game là một module TG[key]
     init(P, set, rng, now)        → trạng thái ban đầu (P = danh sách ghế)
     act(s, i, a, now, rng)        → người ở ghế i làm hành động a (true = có thay đổi)
     tick(s, now, rng)             → đồng hồ, chuyển giai đoạn, máy chơi (true = có thay đổi)
     view(s, me, ui, now)          → HTML phần thân bàn (me = ghế của mình, -1 = đang xem)
     score(s,i) / badge(s,i,me)    → chữ hiện cạnh tên người chơi
     result(s)                     → [{i, rank, txt}] khi s.over
   Chỉ trọng tài (chủ phòng) gọi act/tick; mọi người chỉ gọi view.
   ===================================================================== */
const TG = {};
const TGU = {
  money: n => (n<0?'−':'')+Math.abs(Math.round(n)).toLocaleString('vi-VN'),
  ri: (rng,a,b) => a+Math.floor(rng()*(b-a+1)),
  phase(s, ph, ms, now){ s.ph=ph; s.dl = ms ? now+ms : 0; s.dlLen = ms||0; s.bt = {}; },
  log(s, txt, k, now){ s.log = { ts:now, txt, k:k||'' }; },
  // máy chơi: chờ ngẫu nhiên a..b ms rồi mới hành động
  bot(s, i, now, rng, a, b){ s.bt = s.bt||{}; if(s.bt[i]==null){ s.bt[i] = now + a + rng()*(b-a); return false; } return now >= s.bt[i]; },
  /* Firebase bỏ null / {} / [] khi lưu → dựng lại mảng theo ghế */
  fix(s, M){
    if(!s || !s.P || !M) return s;
    if(!Array.isArray(s.P)) s.P=Object.values(s.P);
    const per=M.per||{};
    Object.keys(per).forEach(k=>{ const o=s[k], def=per[k];
      s[k]=s.P.map((_,i)=>{ const v=o==null?undefined:o[i]; return v==null ? (typeof def==='function'?def():def) : v; }); });
    (M.lists||[]).forEach(k=>{ s[k] = s[k] ? Object.values(s[k]) : []; });
    if(M.fix) M.fix(s);
    return s;
  },
  die(n, cls){ const F={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]}[n]||[];
    let h='<div class="die '+(cls||'')+'">'; for(let k=0;k<9;k++) h+='<i'+(F.includes(k)?' class="on"':'')+'></i>'; return h+'</div>'; },
  btn(act, label, cls, dis){ return `<button class="tbtn ${cls||''}" data-act='${JSON.stringify(act)}'${dis?' disabled':''}>${label}</button>`; },
  // xếp hạng theo điểm (bằng điểm thì đồng hạng)
  rank(vals, desc, fmt){ const idx=vals.map((v,i)=>i).sort((a,b)=>desc===false?vals[a]-vals[b]:vals[b]-vals[a]);
    let r=0, last=null; return idx.map((i,k)=>{ if(vals[i]!==last){ r=k+1; last=vals[i]; } return { i, rank:r, txt:fmt?fmt(vals[i],i):String(vals[i]) }; }); },
  shuffle(a, rng){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; },
  leaderUnique(sc, target){ const m=Math.max(...sc); return m>=target && sc.filter(x=>x===m).length===1; },
};

/* ---------------------------------------------------------------------
   KHUNG CHUNG CHO GAME CÁ CƯỢC: Tài Xỉu, Bầu Cua, Xóc Đĩa
   Đặt cược (nhiều ô) → lắc → trả thưởng. Hết số ván: ai nhiều xu nhất thắng.
   --------------------------------------------------------------------- */
function betGame(cfg){
  const START = 1000, BET_MS = cfg.betMs || 20000;
  const sumB = b => Object.values(b||{}).reduce((x,y)=>x+y,0);
  const alive = (s,i) => s.chips[i] > 0;
  function newRound(s, now){
    s.round++; s.bets=s.P.map(()=>({})); s.done=s.P.map((p,i)=>alive(s,i)?0:1); s.delta=s.P.map(()=>0); s.out=null;
    TGU.phase(s, 'bet', BET_MS, now);
  }
  return {
    about: cfg.about,
    per:{ bets:()=>({}), done:0, delta:0, chips:0 }, lists:['hist'],
    init(P, set, rng, now){ const s={ P, chips:P.map(()=>START), rounds:set.rounds||10, round:0, hist:[] }; newRound(s, now); return s; },
    act(s, i, a, now){
      if(s.ph!=='bet' || !alive(s,i)) return false;
      if(a.t==='add'){
        if(!cfg.opts.some(o=>o.k===a.k)) return false;
        (cfg.exclusive||[]).forEach(g=>{ if(g.includes(a.k)) g.forEach(k=>{ if(k!==a.k) delete s.bets[i][k]; }); });
        const amt=Math.min(Math.floor(+a.amt||0), s.chips[i]-sumB(s.bets[i])); if(amt<=0) return false;
        s.bets[i][a.k]=(s.bets[i][a.k]||0)+amt; s.done[i]=0; return true;
      }
      if(a.t==='clear'){ s.bets[i]={}; s.done[i]=0; return true; }
      if(a.t==='done'){ s.done[i]=1; return true; }
      return false;
    },
    tick(s, now, rng){
      if(s.ph==='bet'){
        let ch=false;
        s.P.forEach((p,i)=>{ if(p.bot && !s.done[i] && alive(s,i) && TGU.bot(s,i,now,rng,1500,8000)){
          (cfg.bot(s,i,rng)||[]).forEach(([k,amt])=>{ const v=Math.min(Math.max(10,Math.round(amt/10)*10), s.chips[i]-sumB(s.bets[i])); if(v>0) s.bets[i][k]=(s.bets[i][k]||0)+v; });
          s.done[i]=1; ch=true; } });
        if(now>=s.dl || s.done.every(x=>x)){ s.out=cfg.roll(rng); TGU.phase(s,'roll',2600,now); return true; }
        return ch;
      }
      if(s.ph==='roll' && now>=s.dl){
        let best=-1, bi=-1;
        s.P.forEach((p,i)=>{ let dlt=0; Object.entries(s.bets[i]).forEach(([k,b])=>{ const m=cfg.mult(s.out,k); dlt += m>0 ? b*m : -b; }); s.delta[i]=dlt; s.chips[i]+=dlt; if(dlt>best){ best=dlt; bi=i; } });
        s.hist.push(cfg.hist(s.out)); if(s.hist.length>16) s.hist.shift();
        TGU.log(s, cfg.outText(s.out) + (best>0 ? '  ·  🎉 '+s.P[bi].n+' +'+TGU.money(best) : ''), best>0?'win':'', now);
        TGU.phase(s,'res',4200,now); return true;
      }
      if(s.ph==='res' && now>=s.dl){
        if(s.round>=s.rounds || !s.P.some((p,i)=>alive(s,i))){ s.over=1; s.dl=0; const w=s.chips.indexOf(Math.max(...s.chips)); TGU.log(s,'🏁 Kết thúc! '+s.P[w].n+' giàu nhất: '+TGU.money(s.chips[w])+' xu','big',now); return true; }
        newRound(s, now); return true;
      }
      return false;
    },
    label: s => 'Ván '+s.round+'/'+s.rounds,
    score: (s,i) => TGU.money(s.chips[i])+' xu',
    badge(s,i){ if(!alive(s,i) && s.ph==='bet') return '💸 Hết xu'; if(s.ph==='bet') return s.done[i] ? (sumB(s.bets[i])?'✅ '+TGU.money(sumB(s.bets[i])):'⏭ Nghỉ') : (sumB(s.bets[i])?'✍️ Đang cược':'🤔');
      if(s.ph==='res' && s.delta[i]) return (s.delta[i]>0?'+':'')+TGU.money(s.delta[i]); return ''; },
    result: s => TGU.rank(s.chips, true, v=>TGU.money(v)+' xu'),
    ui(v, ui){ ui.amt=v.amt; },
    prep(a, ui, s, me){
      if(a.t!=='add') return a;
      const avail=s.chips[me]-sumB(s.bets[me]);
      if(avail<=0){ toast('💸 Hết xu để cược'); return null; }
      a.amt = ui.amt==='all' ? avail : Math.min(ui.amt||100, avail); return a;
    },
    view(s, me, ui){
      const canBet = s.ph==='bet' && me>=0 && alive(s,me), amt=ui.amt||100;
      const stage = s.ph==='bet' ? cfg.idle(s) + '<div class="bg-msg">Đặt cược đi! ⏳</div>'
                  : s.ph==='roll' ? cfg.shake() : cfg.show(s.out) + '<div class="bg-res">'+cfg.outText(s.out)+'</div>';
      let h = `<div class="bg ${cfg.cls}"><div class="bg-stage">${stage}</div>`;
      h += `<div class="bg-hist">${s.hist.slice(-14).map(x=>`<span class="hh ${x.c}">${x.t}</span>`).join('')||'<small>Chưa có ván nào</small>'}</div>`;
      h += '<div class="bg-opts">' + cfg.opts.map(o=>{
        const tot=s.P.reduce((x,p,i)=>x+(s.bets[i][o.k]||0),0), mine=me>=0?(s.bets[me][o.k]||0):0;
        const who=s.P.filter((p,i)=>s.bets[i][o.k]).map(p=>p.a).join('');
        const win = s.ph==='res' && cfg.mult(s.out,o.k)>0;
        return `<button class="bg-opt ${o.cls||''}${win?' win':''}${mine?' mine':''}" data-act='{"t":"add","k":"${o.k}"}'${canBet?'':' disabled'}>
          <span class="ic">${o.ic}</span><b>${o.lb}</b><small>${o.sub}</small>${tot?`<span class="tot">${TGU.money(tot)}</span>`:''}${mine?`<span class="mn">Bạn: ${TGU.money(mine)}</span>`:''}<span class="who">${who}</span></button>`; }).join('') + '</div>';
      if(me>=0){
        const avail=s.chips[me]-sumB(s.bets[me]);
        if(canBet){
          h += `<div class="bg-chips">${[50,100,200,500,'all'].map(v=>`<button class="chip${amt===v?' on':''}" data-ui='{"amt":${JSON.stringify(v)}}'>${v==='all'?'Tất tay':TGU.money(v)}</button>`).join('')}</div>`;
          h += `<div class="bg-ctl"><span>Còn cược được: <b>${TGU.money(avail)}</b> xu</span>${TGU.btn({t:'clear'},'↺ Xóa cược','gray',!sumB(s.bets[me]))}${TGU.btn({t:'done'}, s.done[me]?'✅ Đã xong':(sumB(s.bets[me])?'✓ Xong':'⏭ Bỏ ván này'),'green',s.done[me])}</div>`;
        } else if(!alive(s,me)) h += '<div class="bg-msg">💸 Bạn đã hết xu — ngồi xem mọi người chơi tiếp nhé</div>';
        else if(s.ph==='res') h += `<div class="bg-msg big ${s.delta[me]>0?'up':s.delta[me]<0?'down':''}">${s.delta[me]>0?'🎉 Bạn thắng +'+TGU.money(s.delta[me]):s.delta[me]<0?'😢 Bạn thua '+TGU.money(s.delta[me]):'Ván này bạn không cược'}</div>`;
      }
      return h + '</div>';
    }
  };
}

/* ---------- 🎲 TÀI XỈU ---------- */
const sum3 = d => d[0]+d[1]+d[2], triple = d => d[0]===d[1] && d[1]===d[2];
TG.taixiu = betGame({
  cls:'tx', exclusive:[['tai','xiu']],
  about:'Mỗi ván đặt cược TÀI (tổng 11–17) hoặc XỈU (4–10). Ra bộ ba giống nhau (bão) thì nhà cái ăn hết. Mỗi người có 1.000 xu; hết số ván ai nhiều xu nhất thắng.',
  opts:[{k:'xiu',ic:'⚪',lb:'XỈU',sub:'4 – 10 · ăn 1:1',cls:'big xiu'},{k:'tai',ic:'🔴',lb:'TÀI',sub:'11 – 17 · ăn 1:1',cls:'big tai'}],
  roll: rng => [1,2,3].map(()=>1+Math.floor(rng()*6)),
  mult: (d,k) => triple(d) ? -1 : ((sum3(d)>=11) === (k==='tai') ? 1 : -1),
  outText: d => triple(d) ? '💥 BÃO '+d[0]+'-'+d[1]+'-'+d[2]+' — nhà cái ăn hết!' : (sum3(d)>=11?'🔴 TÀI':'⚪ XỈU')+' · '+sum3(d)+' điểm',
  hist: d => ({ t: triple(d)?'B':sum3(d), c: triple(d)?'bao':sum3(d)>=11?'tai':'xiu' }),
  idle: () => '<div class="dice3">'+[1,2,3].map(()=>'<div class="die q">?</div>').join('')+'</div>',
  shake: () => '<div class="dice3 shaking">'+[3,5,2].map(n=>TGU.die(n)).join('')+'</div><div class="bg-msg">Đang lắc…</div>',
  show: d => '<div class="dice3 land">'+d.map(n=>TGU.die(n)).join('')+'</div><div class="bg-sum">'+sum3(d)+'</div>',
  bot(s,i,rng){ const last=s.hist[s.hist.length-1]; const side = last && rng()<.55 ? (last.c==='tai'?'tai':'xiu') : (rng()<.5?'tai':'xiu'); return [[side, s.chips[i]*(.08+rng()*.25)]]; },
});

/* ---------- 🦀 BẦU CUA ---------- */
const BC = [['bau','🍐','Bầu'],['cua','🦀','Cua'],['tom','🦐','Tôm'],['ca','🐟','Cá'],['ga','🐓','Gà'],['nai','🦌','Nai']];
const bcIc = k => (BC.find(x=>x[0]===k)||['','?'])[1];
TG.baucua = betGame({
  cls:'bc',
  about:'Đặt cược vào các con vật, 3 xúc xắc lắc ra: mỗi mặt trùng con bạn cược ăn 1 lần tiền cược (trùng 3 mặt ăn gấp 3), không trùng thì mất. Mỗi người 1.000 xu, cược được nhiều con.',
  opts: BC.map(([k,ic,lb])=>({ k, ic, lb, sub:'ăn 1 – 3' })),
  roll: rng => [1,2,3].map(()=>BC[Math.floor(rng()*6)][0]),
  mult: (d,k) => { const n=d.filter(x=>x===k).length; return n>0 ? n : -1; },
  outText: d => 'Ra: '+d.map(k=>bcIc(k)+' '+BC.find(x=>x[0]===k)[2]).join(' · '),
  hist: d => ({ t: d.map(bcIc).join(''), c:'bc' }),
  idle: () => '<div class="dice3">'+[1,2,3].map(()=>'<div class="bcd q">?</div>').join('')+'</div>',
  shake: () => '<div class="bowl shaking">🥣</div><div class="bg-msg">Đang lắc…</div>',
  show: d => '<div class="dice3 land">'+d.map(k=>`<div class="bcd">${bcIc(k)}</div>`).join('')+'</div>',
  bot(s,i,rng){ const n=rng()<.5?1:2, out=[]; for(let k=0;k<n;k++) out.push([BC[Math.floor(rng()*6)][0], s.chips[i]*(.05+rng()*.12)]); return out; },
});

/* ---------- 🎰 XÓC ĐĨA (Chẵn Lẻ) ---------- */
const reds = c => c.filter(x=>x).length;
TG.chanle = betGame({
  cls:'xd', exclusive:[['chan','le']],
  about:'Nhà cái xóc 4 đồng xu đỏ/trắng. Cược CHẴN (số đỏ là 0, 2, 4) hoặc LẺ (1, 3) ăn 1:1; cược 4 đỏ / 4 trắng ăn 1:10; 3 đỏ 1 trắng hoặc 3 trắng 1 đỏ ăn 1:3. Mỗi người 1.000 xu.',
  opts:[{k:'chan',ic:'⚪⚪',lb:'CHẴN',sub:'ăn 1:1',cls:'big chan'},{k:'le',ic:'🔴⚪',lb:'LẺ',sub:'ăn 1:1',cls:'big le'},
        {k:'do4',ic:'🔴🔴🔴🔴',lb:'4 Đỏ',sub:'ăn 1:10'},{k:'trang4',ic:'⚪⚪⚪⚪',lb:'4 Trắng',sub:'ăn 1:10'},
        {k:'do3',ic:'🔴🔴🔴⚪',lb:'3 Đỏ',sub:'ăn 1:3'},{k:'trang3',ic:'⚪⚪⚪🔴',lb:'3 Trắng',sub:'ăn 1:3'}],
  roll: rng => [1,2,3,4].map(()=>rng()<.5),
  mult(c,k){ const r=reds(c); return k==='chan'?(r%2===0?1:-1) : k==='le'?(r%2?1:-1) : k==='do4'?(r===4?10:-1) : k==='trang4'?(r===0?10:-1) : k==='do3'?(r===3?3:-1) : k==='trang3'?(r===1?3:-1) : -1; },
  outText: c => { const r=reds(c); return (r%2===0?'⚪ CHẴN':'🔴 LẺ')+' · '+r+' đỏ '+(4-r)+' trắng'; },
  hist: c => ({ t: reds(c)%2===0?'C':'L', c: reds(c)%2===0?'chan':'le' }),
  idle: () => '<div class="plate"><div class="bowlc">🥣</div></div>',
  shake: () => '<div class="plate shaking"><div class="bowlc">🥣</div></div><div class="bg-msg">Xóc xóc xóc…</div>',
  show: c => '<div class="plate open">'+c.map(x=>`<span class="coin ${x?'r':'w'}"></span>`).join('')+'</div>',
  bot(s,i,rng){ const out=[[rng()<.5?'chan':'le', s.chips[i]*(.08+rng()*.2)]]; if(rng()<.25) out.push([['do4','trang4','do3','trang3'][Math.floor(rng()*4)], s.chips[i]*.04]); return out; },
});

/* ---------- ✊ OẲN TÙ TÌ (nhiều người) ---------- */
const OTT = { r:['✊','Búa'], p:['✋','Bao'], s:['✌️','Kéo'] }, BEATS = { r:'s', s:'p', p:'r' };
TG.oantuti = {
  per:{ sc:0, pick:'' },
  about:'Mỗi lượt mọi người cùng ra Búa / Bao / Kéo. Nếu chỉ có 2 kiểu trên bàn, những ai ra kiểu thắng được +1 điểm; có đủ 3 kiểu hoặc cùng 1 kiểu thì hòa. Ai đủ điểm trước thắng.',
  init(P, set, rng, now){ const s={ P, sc:P.map(()=>0), target:set.target||5, round:0 }; this.nr(s, now); return s; },
  nr(s, now){ s.round++; s.pick=s.P.map(()=>''); s.win=''; TGU.phase(s,'pick',10000,now); },
  act(s,i,a){ if(s.ph!=='pick' || a.t!=='pick' || !OTT[a.v]) return false; s.pick[i]=a.v; return true; },
  tick(s, now, rng){
    if(s.ph==='pick'){
      let ch=false; s.P.forEach((p,i)=>{ if(p.bot && !s.pick[i] && TGU.bot(s,i,now,rng,1000,5000)){ s.pick[i]='rps'[Math.floor(rng()*3)]; ch=true; } });
      if(now>=s.dl || s.pick.every(x=>x)){
        s.pick=s.pick.map(x=>x||'rps'[Math.floor(rng()*3)]);
        const kinds=[...new Set(s.pick)];
        if(kinds.length===2){ const w = BEATS[kinds[0]]===kinds[1] ? kinds[0] : kinds[1]; s.win=w;
          const names=s.P.filter((p,i)=>s.pick[i]===w).map(p=>p.n); s.pick.forEach((x,i)=>{ if(x===w) s.sc[i]++; });
          TGU.log(s, OTT[w][0]+' '+OTT[w][1]+' thắng! '+names.join(', ')+' +1', 'win', now); }
        else { s.win=''; TGU.log(s, '🤝 Hòa! '+(kinds.length===1?'Ai cũng ra '+OTT[kinds[0]][1]:'Đủ cả Búa, Bao, Kéo'), '', now); }
        TGU.phase(s,'res',3400,now); return true;
      }
      return ch;
    }
    if(s.ph==='res' && now>=s.dl){
      if(TGU.leaderUnique(s.sc, s.target)){ s.over=1; s.dl=0; const w=s.sc.indexOf(Math.max(...s.sc)); TGU.log(s,'🏆 '+s.P[w].n+' vô địch Oẳn Tù Tì!','big',now); return true; }
      this.nr(s, now); return true;
    }
    return false;
  },
  label: s => 'Lượt '+s.round+' · ai đủ '+s.target+' điểm thắng',
  score: (s,i) => s.sc[i]+' đ',
  badge: (s,i) => s.ph==='pick' ? (s.pick[i]?'✅ Đã ra':'🤔') : (s.pick[i] ? OTT[s.pick[i]][0]+(s.win===s.pick[i]?' +1':'') : ''),
  result: s => TGU.rank(s.sc, true, v=>v+' điểm'),
  view(s, me){
    if(s.ph==='pick'){
      const mine = me>=0 ? s.pick[me] : '';
      return `<div class="ott"><div class="bg-msg">${mine?'Bạn ra <b>'+OTT[mine][1]+'</b> — có thể đổi trước khi hết giờ':'Ra gì đây? 🤔'}</div>
        <div class="ott-btns">${Object.keys(OTT).map(k=>`<button class="ottb${mine===k?' on':''}" data-act='{"t":"pick","v":"${k}"}'${me<0?' disabled':''}><span>${OTT[k][0]}</span>${OTT[k][1]}</button>`).join('')}</div></div>`;
    }
    return `<div class="ott"><div class="ott-grid">${s.P.map((p,i)=>`<div class="ottc${s.win&&s.pick[i]===s.win?' win':''}${s.win&&s.pick[i]!==s.win?' lose':''}${i===me?' me':''}"><span class="big">${OTT[s.pick[i]][0]}</span><b>${escH(p.n)}</b></div>`).join('')}</div></div>`;
  }
};

/* ---------- 🎲 XÚC XẮC CHIẾN ---------- */
const xxVal = d => triple(d) ? 100+sum3(d) : sum3(d);
TG.xucxac = {
  per:{ sc:0, dice:0, rr:0, kept:0, gain:0 },
  about:'Mỗi lượt ai cũng lắc 3 xúc xắc (được lắc lại 1 lần nếu chưa ưng). Tổng cao nhất được +1 điểm; ra bộ ba (bão) thắng luôn và được +2. Ai đủ điểm trước thắng.',
  init(P, set, rng, now){ const s={ P, sc:P.map(()=>0), target:set.target||5, round:0 }; this.nr(s, now); return s; },
  nr(s, now){ s.round++; s.dice=s.P.map(()=>0); s.rr=s.P.map(()=>0); s.kept=s.P.map(()=>0); s.gain=s.P.map(()=>0); TGU.phase(s,'roll',15000,now); },
  roll: rng => [1,2,3].map(()=>1+Math.floor(rng()*6)),
  act(s,i,a,now,rng){
    if(s.ph!=='roll') return false;
    if(a.t==='roll' && !s.dice[i]){ s.dice[i]=this.roll(rng); return true; }
    if(a.t==='reroll' && s.dice[i] && !s.rr[i] && !s.kept[i]){ s.dice[i]=this.roll(rng); s.rr[i]=1; s.kept[i]=1; return true; }
    if(a.t==='keep' && s.dice[i]){ s.kept[i]=1; return true; }
    return false;
  },
  tick(s, now, rng){
    if(s.ph==='roll'){
      let ch=false;
      s.P.forEach((p,i)=>{ if(!p.bot || s.kept[i]) return;
        if(!s.dice[i]){ if(TGU.bot(s,i,now,rng,800,3500)){ s.dice[i]=this.roll(rng); s.bt[i]=null; ch=true; } }
        else if(TGU.bot(s,i,now,rng,700,2000)){ if(sum3(s.dice[i])<10 && !triple(s.dice[i]) && !s.rr[i]){ s.dice[i]=this.roll(rng); s.rr[i]=1; } s.kept[i]=1; ch=true; } });
      if(now>=s.dl || s.kept.every(x=>x)){
        s.dice=s.dice.map(d=>d||this.roll(rng)); s.kept=s.kept.map(()=>1);
        const v=s.dice.map(xxVal), top=Math.max(...v), w=v.map((x,i)=>x===top?i:-1).filter(i=>i>=0), pts=top>100?2:1;
        w.forEach(i=>{ s.sc[i]+=pts; s.gain[i]=pts; });
        TGU.log(s, (top>100?'💥 BÃO! ':'🎲 ')+w.map(i=>s.P[i].n).join(', ')+' thắng lượt +'+pts+' ('+(top>100?'bộ '+s.dice[w[0]][0]:top+' điểm')+')', 'win', now);
        TGU.phase(s,'res',3600,now); return true;
      }
      return ch;
    }
    if(s.ph==='res' && now>=s.dl){
      if(TGU.leaderUnique(s.sc, s.target)){ s.over=1; s.dl=0; const w=s.sc.indexOf(Math.max(...s.sc)); TGU.log(s,'🏆 '+s.P[w].n+' là Vua Xúc Xắc!','big',now); return true; }
      this.nr(s, now); return true;
    }
    return false;
  },
  label: s => 'Lượt '+s.round+' · ai đủ '+s.target+' điểm thắng',
  score: (s,i) => s.sc[i]+' đ',
  badge: (s,i) => s.ph==='roll' ? (s.kept[i]?'✅ Xong':s.dice[i]?'🎲 Đã lắc':'🤔') : (s.gain[i]?'+'+s.gain[i]:''),
  result: s => TGU.rank(s.sc, true, v=>v+' điểm'),
  view(s, me){
    let h='<div class="xx">';
    if(me>=0){
      const d=s.dice[me];
      h += `<div class="xx-me">${d ? '<div class="dice3 land">'+d.map(n=>TGU.die(n)).join('')+'</div><div class="bg-sum">'+(triple(d)?'💥 Bão!':sum3(d)+' điểm')+'</div>' : '<div class="cup">🥤</div>'}</div>`;
      if(s.ph==='roll'){
        if(!d) h += `<div class="bg-ctl c">${TGU.btn({t:'roll'},'🎲 Lắc!','big green')}</div>`;
        else if(!s.kept[me]) h += `<div class="bg-ctl c">${TGU.btn({t:'reroll'},'🔁 Lắc lại (1 lần)','gray')}${TGU.btn({t:'keep'},'✋ Giữ','green')}</div>`;
        else h += '<div class="bg-msg">✅ Đã chốt — chờ mọi người</div>';
      }
    }
    h += '<div class="xx-all">'+s.P.map((p,i)=>{ if(i===me) return ''; const show = s.ph==='res';
      return `<div class="xxc${s.gain[i]?' win':''}"><b>${escH(p.a)} ${escH(p.n)}</b>${show && s.dice[i] ? '<div class="dice3 sm">'+s.dice[i].map(n=>TGU.die(n,'sm')).join('')+'</div>' : `<span class="cup sm">${s.dice[i]?'🥤':'…'}</span>`}</div>`; }).join('')+'</div>';
    return h+'</div>';
  }
};

/* ---------- 🔢 ĐẾM NHANH ---------- */
const SM_EMO = ['🍎','🍌','🍇','⭐','🐟','🌸','🍄','🎈'];
function smQ(level, rng){
  const ri=(a,b)=>TGU.ri(rng,a,b);
  if(rng()<.45){ // đếm hình
    const kinds=TGU.shuffle(SM_EMO.slice(), rng).slice(0, 3+level), target=kinds[0], n=10+level*6+ri(0,6), g=[];
    for(let k=0;k<n;k++) g.push(kinds[Math.floor(rng()*kinds.length)]);
    const ans=g.filter(x=>x===target).length;
    return { txt:'Có bao nhiêu '+target+' ?', g, ans, opts:smOpts(ans, rng, 1) };
  }
  let a,b,op,ans;
  const ops = level===0?['+','−']:level===1?['+','−','×']:['+','−','×','÷'];
  op=ops[Math.floor(rng()*ops.length)];
  const M = [12,40,99][level];
  if(op==='+'){ a=ri(2,M); b=ri(2,M); ans=a+b; } else if(op==='−'){ a=ri(5,M+10); b=ri(1,a); ans=a-b; }
  else if(op==='×'){ a=ri(2,level===2?15:9); b=ri(2,9); ans=a*b; } else { b=ri(2,9); ans=ri(2,12); a=b*ans; }
  return { txt:`${a} ${op} ${b} = ?`, ans, opts:smOpts(ans, rng, Math.max(2,Math.round(ans*.12))) };
}
function smOpts(ans, rng, spread){ const o=new Set([ans]); let guard=0; while(o.size<4 && guard++<50){ const v=ans+(rng()<.5?-1:1)*(1+Math.floor(rng()*spread*2)); if(v>=0) o.add(v); } let k=1; while(o.size<4) o.add(ans+(k++)); return TGU.shuffle([...o], rng); }
TG.speedmath = {
  per:{ sc:0, an:null },
  about:'Câu hỏi tính nhẩm hoặc đếm hình hiện ra cho cả bàn. Đúng nhanh nhất +3, nhì +2, các bạn đúng sau +1; trả lời sai thì mất lượt câu đó. Hết số câu ai nhiều điểm nhất thắng.',
  init(P, set, rng, now){ const s={ P, sc:P.map(()=>0), qs:set.qs||10, qn:0, level:set.level==null?1:set.level }; this.nq(s, now, rng); return s; },
  nq(s, now, rng){ s.qn++; s.q=smQ(s.level, rng); s.an=s.P.map(()=>null); s.ord=0; TGU.phase(s,'q',14000,now); },
  act(s,i,a,now){
    if(s.ph!=='q' || a.t!=='ans' || s.an[i]) return false;
    const ok = +a.v===s.q.ans; let g=0; if(ok){ s.ord++; g = s.ord===1?3:s.ord===2?2:1; s.sc[i]+=g; }
    s.an[i]={ v:+a.v, ok:ok?1:0, g }; return true;
  },
  tick(s, now, rng){
    if(s.ph==='q'){
      let ch=false; s.P.forEach((p,i)=>{ if(p.bot && !s.an[i] && TGU.bot(s,i,now,rng,2500,10000)){ const ok=rng()<.72; this.act(s,i,{t:'ans',v: ok?s.q.ans:s.q.opts.find(x=>x!==s.q.ans)},now); ch=true; } });
      if(now>=s.dl || s.an.every(x=>x)){
        const first=s.an.findIndex(x=>x&&x.g===3);
        TGU.log(s, first>=0 ? '⚡ '+s.P[first].n+' nhanh nhất! Đáp án: '+s.q.ans : '😮 Không ai đúng — đáp án là '+s.q.ans, first>=0?'win':'', now);
        TGU.phase(s,'res',3200,now); return true;
      }
      return ch;
    }
    if(s.ph==='res' && now>=s.dl){
      if(s.qn>=s.qs){ s.over=1; s.dl=0; const w=s.sc.indexOf(Math.max(...s.sc)); TGU.log(s,'🏆 '+s.P[w].n+' nhanh trí nhất!','big',now); return true; }
      this.nq(s, now, rng); return true;
    }
    return false;
  },
  label: s => 'Câu '+s.qn+'/'+s.qs,
  score: (s,i) => s.sc[i]+' đ',
  badge: (s,i) => !s.an || !s.an[i] ? (s.ph==='q'?'🤔':'') : s.ph==='q' ? '✅ Đã chọn' : (s.an[i].ok?'+'+s.an[i].g:'❌'),
  result: s => TGU.rank(s.sc, true, v=>v+' điểm'),
  view(s, me){
    const q=s.q, my = me>=0 ? s.an[me] : null, show = s.ph==='res';
    let h=`<div class="sm"><div class="sm-q">${escH(q.txt)}</div>`;
    if(q.g) h+=`<div class="sm-grid">${q.g.map(e=>`<span>${e}</span>`).join('')}</div>`;
    h += '<div class="sm-opts">'+q.opts.map(v=>{ const cls = show ? (v===q.ans?'right':(my&&my.v===v?'wrong':'')) : (my&&my.v===v?'picked':'');
      return `<button class="smo ${cls}" data-act='{"t":"ans","v":${v}}'${(me<0||my||show)?' disabled':''}>${v}</button>`; }).join('')+'</div>';
    if(my && !show) h+=`<div class="bg-msg">${my.ok?'✅ Đúng rồi! +'+my.g:'❌ Sai mất rồi — chờ câu sau'}</div>`;
    return h+'</div>';
  }
};

/* ---------- 🎯 SỐ MAY MẮN ---------- */
TG.guessnumber = {
  per:{ sc:0, g:0, gain:0 },
  about:'Máy nghĩ một số bí mật từ 1 đến 100. Mọi người cùng đoán: ai gần nhất được +2 (trúng chóc +4), gần nhì +1. Hết số ván ai nhiều điểm nhất thắng.',
  init(P, set, rng, now){ const s={ P, sc:P.map(()=>0), rounds:set.rounds||5, round:0 }; this.nr(s, now, rng); return s; },
  nr(s, now, rng){ s.round++; s.secret=1+Math.floor(rng()*100); s.g=s.P.map(()=>0); s.gain=s.P.map(()=>0); TGU.phase(s,'guess',20000,now); },
  act(s,i,a){ const v=Math.round(+a.v); if(s.ph!=='guess' || a.t!=='guess' || !(v>=1&&v<=100)) return false; s.g[i]=v; return true; },
  tick(s, now, rng){
    if(s.ph==='guess'){
      let ch=false; s.P.forEach((p,i)=>{ if(p.bot && !s.g[i] && TGU.bot(s,i,now,rng,2000,9000)){ s.g[i]=Math.max(1,Math.min(100,Math.round(50+(rng()-.5)*90))); ch=true; } });
      if(now>=s.dl || s.g.every(x=>x)){
        const ds=s.g.map(v=>v?Math.abs(v-s.secret):999), sorted=[...new Set(ds.filter(x=>x<999))].sort((a,b)=>a-b);
        ds.forEach((x,i)=>{ if(x===999) return; if(x===sorted[0]) s.gain[i]= x===0?4:2; else if(x===sorted[1]) s.gain[i]=1; s.sc[i]+=s.gain[i]; });
        const w=ds.map((x,i)=>x===sorted[0]?i:-1).filter(i=>i>=0);
        TGU.log(s, '🎯 Số bí mật: '+s.secret+(w.length? (sorted[0]===0?' — TRÚNG CHÓC: ':' — gần nhất: ')+w.map(i=>s.P[i].n).join(', '):''), sorted[0]===0?'big':'win', now);
        TGU.phase(s,'res',4500,now); return true;
      }
      return ch;
    }
    if(s.ph==='res' && now>=s.dl){
      if(s.round>=s.rounds){ s.over=1; s.dl=0; const w=s.sc.indexOf(Math.max(...s.sc)); TGU.log(s,'🏆 '+s.P[w].n+' may mắn nhất!','big',now); return true; }
      this.nr(s, now, rng); return true;
    }
    return false;
  },
  label: s => 'Ván '+s.round+'/'+s.rounds,
  score: (s,i) => s.sc[i]+' đ',
  badge: (s,i) => s.ph==='guess' ? (s.g[i]?'🔒 Đã đoán':'🤔') : (s.g[i]? s.g[i]+(s.gain[i]?' (+'+s.gain[i]+')':'') : '—'),
  result: s => TGU.rank(s.sc, true, v=>v+' điểm'),
  ui(v, ui, s, me, send){
    ui.num = ui.num||'';
    if(v.k==='del') ui.num=ui.num.slice(0,-1);
    else if(v.k==='ok'){ const n=+ui.num; if(n>=1&&n<=100){ send({t:'guess', v:n}); ui.sent=n; ui.num=''; } else toast('Nhập số từ 1 đến 100'); }
    else if(ui.num.length<3) ui.num=(ui.num+v.k).replace(/^0+/,'');
  },
  view(s, me, ui){
    if(s.ph==='res'){
      const marks=s.P.map((p,i)=>s.g[i]?`<span class="gn-m${s.gain[i]?' win':''}" style="left:${s.g[i]}%">${escH(p.a)}<i>${s.g[i]}</i></span>`:'').join('');
      return `<div class="gn"><div class="gn-secret">🎯 ${s.secret}</div><div class="gn-line"><span class="gn-s" style="left:${s.secret}%">▼</span>${marks}</div><div class="gn-ax"><span>1</span><span>50</span><span>100</span></div></div>`;
    }
    if(me<0) return '<div class="gn"><div class="bg-msg">Mọi người đang đoán…</div></div>';
    const mine=s.g[me];
    return `<div class="gn"><div class="gn-disp">${ui.num||'<small>Nhập số 1 – 100</small>'}</div>${mine?`<div class="bg-msg">🔒 Bạn đã đoán <b>${mine}</b> — đoán lại để đổi</div>`:''}
      <div class="gn-pad">${[1,2,3,4,5,6,7,8,9,'del',0,'ok'].map(k=>`<button class="pk${k==='ok'?' ok':''}" data-ui='{"k":"${k}"}'>${k==='del'?'⌫':k==='ok'?'✓ Chốt':k}</button>`).join('')}</div></div>`;
  }
};

/* ---------- ⚡ PHẢN XẠ ---------- */
TG.phanxa = {
  per:{ sc:0, tp:null, gain:0 },
  about:'Chờ ô chuyển sang XANH rồi bấm thật nhanh! Nhanh nhất +3, nhì +2, ba +1. Bấm sớm khi còn đỏ hoặc lúc ô nháy xanh dương đánh lừa thì bị −1. Thời gian được đo ngay trên máy từng người nên công bằng.',
  init(P, set, rng, now){ const s={ P, sc:P.map(()=>0), rounds:set.rounds||5, round:0 }; this.nr(s, now); return s; },
  nr(s, now){ s.round++; s.tp=s.P.map(()=>null); s.gain=s.P.map(()=>0); s.goAt=0; s.dec=0; TGU.phase(s,'ready',2500,now); },
  act(s,i,a,now){
    if(a.t!=='tap' || s.tp[i] || !['ready','wait','go'].includes(s.ph)) return false;
    if(a.early || s.ph!=='go' && now < s.goAt-150) s.tp[i]={ e:1 };
    else s.tp[i]={ ms: Math.max(80, Math.min(3000, Math.round(+a.ms||3000))) };
    return true;
  },
  tick(s, now, rng){
    if(s.ph==='ready' && now>=s.dl){ s.goAt = now+1500+rng()*3500; s.dec = rng()<.4 ? now+400+rng()*Math.max(200,s.goAt-now-1100) : 0; s.bms=s.P.map(()=>Math.round(220+rng()*330)); TGU.phase(s,'wait',0,now); return true; }
    if(s.ph==='wait' && now>=s.goAt){ s.ph='go'; s.dl=s.goAt+3000; s.dlLen=3000; return true; }
    if(s.ph==='go'){
      let ch=false; s.P.forEach((p,i)=>{ if(p.bot && !s.tp[i] && now>=s.goAt+s.bms[i]){ s.tp[i]={ ms:s.bms[i] }; ch=true; } });
      if(now>=s.dl || s.tp.every(x=>x)){
        const ok=s.tp.map((t,i)=>t&&t.ms?i:-1).filter(i=>i>=0).sort((a,b)=>s.tp[a].ms-s.tp[b].ms);
        ok.slice(0,3).forEach((i,k)=>{ s.gain[i]=3-k; s.sc[i]+=3-k; });
        s.tp.forEach((t,i)=>{ if(t&&t.e){ s.gain[i]=-1; s.sc[i]-=1; } });
        TGU.log(s, ok.length ? '⚡ '+s.P[ok[0]].n+' nhanh nhất: '+s.tp[ok[0]].ms+' ms' : '😴 Không ai bấm kịp!', ok.length?'win':'', now);
        TGU.phase(s,'res',3500,now); return true;
      }
      return ch;
    }
    if(s.ph==='res' && now>=s.dl){
      if(s.round>=s.rounds){ s.over=1; s.dl=0; const w=s.sc.indexOf(Math.max(...s.sc)); TGU.log(s,'🏆 '+s.P[w].n+' phản xạ thần sầu!','big',now); return true; }
      this.nr(s, now); return true;
    }
    return false;
  },
  label: s => 'Ván '+s.round+'/'+s.rounds,
  score: (s,i) => s.sc[i]+' đ',
  badge: (s,i) => { const t=s.tp&&s.tp[i]; if(!t) return ''; if(t.e) return '⛔ Sớm'; return s.ph==='res' ? t.ms+'ms'+(s.gain[i]?' +'+s.gain[i]:'') : '✅'; },
  result: s => TGU.rank(s.sc, true, v=>v+' điểm'),
  tap(s, me, ui, send, now){
    if(me<0 || ui.tapRound===s.round || !['ready','wait','go'].includes(s.ph)) return;
    ui.tapRound=s.round;
    if(now < s.goAt || !s.goAt){ ui.my='early'; send({ t:'tap', early:1 }); beep(150,.2,'square',.1); }
    else { const ms = ui.goRound===s.round && ui.goPerf ? performance.now()-ui.goPerf : now-s.goAt; ui.my=Math.round(ms); send({ t:'tap', ms }); beep(900,.08); }
    const pad=document.getElementById('px-pad'); if(pad) this.paint(s, me, ui, pad, Net.now());
  },
  paint(s, me, ui, pad, now){
    let cls='red', txt='Chờ…';
    if(s.ph==='res'){ cls='done'; txt = s.tp[me]&&s.tp[me].ms ? s.tp[me].ms+' ms' : s.tp[me]&&s.tp[me].e ? '⛔ Bấm sớm' : '—'; }
    else if(s.goAt && now>=s.goAt){ cls='green'; txt='BẤM!'; if(ui.goRound!==s.round){ ui.goRound=s.round; ui.goPerf=performance.now(); } }
    else if(s.dec && now>=s.dec && now<s.dec+450){ cls='blue'; txt='⚠️ CHƯA!'; }
    else if(s.ph==='ready'){ txt='Chuẩn bị…'; }
    if(ui.tapRound===s.round && s.ph!=='res'){ cls+=' tapped'; txt = ui.my==='early' ? '⛔ Sớm quá!' : '✅ '+ui.my+' ms'; }
    pad.className='px-pad '+cls; pad.firstChild.textContent=txt;
  },
  after(s, me, ui, body){
    const pad=body.querySelector('#px-pad'); if(!pad) return;
    const loop=()=>{ const p=document.getElementById('px-pad'); if(!p || current!=='table') { ui.raf=0; return; } const st=TGU._cur ? TGU._cur() : s; if(!st){ ui.raf=0; return; } this.paint(st, me, ui, p, Net.now()); ui.raf=requestAnimationFrame(loop); };
    if(!ui.raf) ui.raf=requestAnimationFrame(loop); else this.paint(s, me, ui, pad, Net.now());
  },
  view(s, me){
    if(me<0) return '<div class="px"><div id="px-pad" class="px-pad red"><span>Đang xem…</span></div></div>';
    return `<div class="px"><div id="px-pad" class="px-pad red" data-tap="1"><span>Chờ…</span></div><div class="bg-msg">Chạm vào ô khi nó chuyển sang <b style="color:#22c55e">XANH LÁ</b>. Xanh dương là bẫy!</div></div>`;
  }
};

/* =====================================================================
   GAME BÀI: Xì Dách, Poker (Texas Hold'em) — chung bộ bài 52 lá
   Lá bài = số 0..51: hạng = c%13 (0 = 2 … 8 = 10, 9 = J, 10 = Q, 11 = K, 12 = A), chất = c/13 (♠ ♣ ♦ ♥)
   ===================================================================== */
const CRK = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'], CSU = ['♠','♣','♦','♥'];
const cR = c => c%13, cS = c => Math.floor(c/13);
TGU.deck = rng => TGU.shuffle([...Array(52).keys()], rng);
TGU.card = (c, cls) => c==null || c<0 ? `<span class="pc back ${cls||''}"></span>`
  : `<span class="pc ${cS(c)>=2?'red':''} ${cls||''}"><b>${CRK[cR(c)]}</b><i>${CSU[cS(c)]}</i></span>`;
TGU.cards = (arr, cls, hide) => '<div class="pcs">'+(arr||[]).map((c,k)=>TGU.card(hide&&hide(k)?-1:c, cls)).join('')+'</div>';

/* ---------- 🃏 XÌ DÁCH (nhà cái là máy) ---------- */
const XD = {
  // giá trị tốt nhất ≤ 21 (A = 10/11 khi có 2 lá; 1/10 khi 3 lá trở lên)
  val(h){ if(!h || !h.length) return 0; let base=0, aces=0;
    h.forEach(c=>{ const r=cR(c); if(r===12) aces++; else base += r>=8 ? 10 : r+2; });
    const opts = h.length<=2 ? [10,11] : [1,10]; let best=-1, low=99;
    const go=(k,sum)=>{ if(k===aces){ if(sum<=21) best=Math.max(best,sum); low=Math.min(low,sum); return; } opts.forEach(v=>go(k+1,sum+v)); };
    go(0, base); return best>=0 ? best : low; },
  ten: c => cR(c)>=8 && cR(c)<=11,
  special(h){ if(!h || h.length!==2) return 0; const a=h.filter(c=>cR(c)===12).length;
    if(a===2) return 3; if(a===1 && h.some(XD.ten)) return 2; return 0; },        // 3 = xì bàn, 2 = xì dách
  kind(h){ const sp=XD.special(h); if(sp) return sp; const v=XD.val(h);
    if(v>21) return -1;                         // quắc
    if(h.length===5) return 1.5;                // ngũ linh
    return 0; },
  name(h){ const k=XD.kind(h), v=XD.val(h); return k===3?'Xì Bàn':k===2?'Xì Dách':k===1.5?'Ngũ Linh':k===-1?'Quắc '+v:v+' điểm'; },
};
TG.xidach = {
  per:{ chips:0, bet:0, hand:()=>[], st:'', gain:0 },
  about:'Nhà cái là máy. Mỗi ván đặt cược rồi được chia 2 lá. Xì Bàn (2 lá A) ăn ×3, Xì Dách (A + 10/J/Q/K) ăn ×2, Ngũ Linh (5 lá ≤ 21) ăn ×2. Phải đủ 16 điểm mới được dằn; quá 21 là quắc. Nhà cái rút tới khi đủ 15. Hết số ván, ai nhiều xu nhất thắng.',
  init(P, set, rng, now){ const s={ P, chips:P.map(()=>1000), rounds:set.rounds||10, round:0, dh:[] }; this.nr(s, now); return s; },
  lists:['dh','deck'],
  alive: (s,i) => s.chips[i] > 0,
  nr(s, now){ s.round++; s.bet=s.P.map((p,i)=>0); s.hand=s.P.map(()=>[]); s.st=s.P.map((p,i)=>this.alive(s,i)?'':'out'); s.gain=s.P.map(()=>0); s.dh=[]; s.deck=[]; TGU.phase(s,'bet',15000,now); },
  act(s,i,a,now,rng){
    if(s.st[i]==='out') return false;
    if(s.ph==='bet' && a.t==='bet' && !s.bet[i]){ s.bet[i]=Math.max(10, Math.min(s.chips[i], Math.round(+a.v||0))); return true; }
    if(s.ph==='play' && s.st[i]==='play'){
      if(a.t==='hit' && s.hand[i].length<5){ s.hand[i].push(s.deck.pop()); this.chk(s,i); return true; }
      if(a.t==='stand' && XD.val(s.hand[i])>=16){ s.st[i]='stand'; return true; }
    }
    return false;
  },
  chk(s,i){ const h=s.hand[i], v=XD.val(h); if(v>21 || h.length===5 || v===21) s.st[i]='stand'; },
  deal(s, now, rng){
    s.deck=TGU.deck(rng);
    s.P.forEach((p,i)=>{ if(s.st[i]==='out') return; if(!s.bet[i]) s.bet[i]=Math.min(100, s.chips[i]); s.hand[i]=[s.deck.pop(), s.deck.pop()]; s.st[i]='play'; });
    s.dh=[s.deck.pop(), s.deck.pop()];
    const dsp=XD.special(s.dh);
    if(dsp){ TGU.log(s, '😱 Nhà cái '+(dsp===3?'XÌ BÀN':'XÌ DÁCH')+'!', 'lose', now); this.settle(s, now); return; }
    s.P.forEach((p,i)=>{ if(s.st[i]==='play' && XD.special(s.hand[i])) s.st[i]='bj'; });
    TGU.phase(s,'play',25000,now);
  },
  settle(s, now){
    const dk=XD.kind(s.dh), dv=XD.val(s.dh);
    s.P.forEach((p,i)=>{ if(s.st[i]==='out') return; const h=s.hand[i], k=XD.kind(h), v=XD.val(h), b=s.bet[i]; let g=0;
      if(dk>=2){ g = k===dk ? 0 : k>dk ? b*k : -b*dk; }
      else if(k>=2) g = b*k;
      else if(k===-1) g = dk===-1 ? 0 : -b;
      else if(v<16 && k!==1.5) g = -b;                                   // chưa đủ tuổi
      else if(k===1.5) g = dk===1.5 ? 0 : b*2;
      else if(dk===1.5) g = -b*2;
      else if(dk===-1) g = b;
      else g = v>dv ? b : v<dv ? -b : 0;
      s.gain[i]=g; s.chips[i]=Math.max(0, s.chips[i]+g); s.st[i]='done'; });
    const w=s.gain.reduce((a,g)=>a+(g>0),0), l=s.gain.reduce((a,g)=>a+(g<0),0);
    if(!s.log || s.log.ts!==now) TGU.log(s, '🃏 Nhà cái: '+XD.name(s.dh)+' — '+w+' người thắng, '+l+' người thua', w>=l?'win':'lose', now);
    TGU.phase(s,'res',4500,now);
  },
  tick(s, now, rng){
    let ch=false;
    if(s.ph==='bet'){
      s.P.forEach((p,i)=>{ if(p.bot && !s.bet[i] && s.st[i]!=='out' && TGU.bot(s,i,now,rng,600,3000)){ s.bet[i]=Math.max(10, Math.round(s.chips[i]*(.05+rng()*.15)/10)*10); ch=true; } });
      if(now>=s.dl || s.P.every((p,i)=>s.st[i]==='out'||s.bet[i])){ this.deal(s, now, rng); return true; }
      return ch;
    }
    if(s.ph==='play'){
      s.P.forEach((p,i)=>{ if(!p.bot || s.st[i]!=='play' || !TGU.bot(s,i,now,rng,700,1800)) return; s.bt[i]=null;
        const v=XD.val(s.hand[i]); if(v<16 || (v<18 && rng()<.45 && s.hand[i].length<5)){ s.hand[i].push(s.deck.pop()); this.chk(s,i); } else s.st[i]='stand'; ch=true; });
      if(now>=s.dl){ s.P.forEach((p,i)=>{ if(s.st[i]!=='play') return; while(XD.val(s.hand[i])<16 && s.hand[i].length<5) s.hand[i].push(s.deck.pop()); s.st[i]='stand'; }); }
      if(s.P.every((p,i)=>s.st[i]!=='play')){ TGU.phase(s,'dealer',0,now); s.nx=now+900; return true; }
      return ch;
    }
    if(s.ph==='dealer'){
      if(now<s.nx) return false;
      const v=XD.val(s.dh);
      // nhà cái rút tới khi đủ 15; 15–16 rút tiếp nếu đa số người chơi đang cao hơn
      const live=s.P.map((p,i)=>i).filter(i=>s.st[i]==='stand' && XD.kind(s.hand[i])===0), hi=live.filter(i=>XD.val(s.hand[i])>v).length;
      if(s.dh.length<5 && (v<15 || (v<17 && hi*2>live.length))){ s.dh.push(s.deck.pop()); s.nx=now+900; return true; }
      this.settle(s, now); return true;
    }
    if(s.ph==='res' && now>=s.dl){
      const alive=s.P.filter((p,i)=>s.chips[i]>0).length;
      if(s.round>=s.rounds || !alive){ s.over=1; s.dl=0; const w=s.chips.indexOf(Math.max(...s.chips)); TGU.log(s,'🏆 '+s.P[w].n+' thắng với '+TGU.money(s.chips[w])+' xu!','big',now); return true; }
      this.nr(s, now); return true;
    }
    return false;
  },
  label: s => 'Ván '+s.round+'/'+s.rounds,
  score: (s,i) => TGU.money(s.chips[i])+' xu',
  badge(s,i){ const st=s.st[i]; if(st==='out') return '💸 Hết xu';
    if(s.ph==='bet') return s.bet[i]?'💰 '+TGU.money(s.bet[i]):'🤔';
    if(s.ph==='res') return s.gain[i]>0?'+'+TGU.money(s.gain[i]):s.gain[i]<0?TGU.money(s.gain[i]):'Hòa';
    return st==='play'?'🤔 '+s.hand[i].length+' lá':st==='bj'?'🔥':'✋ Dằn'; },
  result: s => TGU.rank(s.chips, true, v=>TGU.money(v)+' xu'),
  ui(v, ui){ if(v.k==='amt') ui.amt=v.v; },
  view(s, me, ui){
    const showAll = s.ph==='res', dealerOpen = s.ph==='dealer' || s.ph==='res';
    let h = '<div class="xd2"><div class="felt">';
    h += `<div class="xd-dealer"><small>🎩 Nhà cái</small>${s.dh.length ? TGU.cards(s.dh,'',k=>!dealerOpen&&k===1) : TGU.cards([-1,-1])}${dealerOpen&&s.dh.length?`<b class="xd-v">${XD.name(s.dh)}</b>`:''}</div>`;
    h += '<div class="xd-others">'+s.P.map((p,i)=>{ if(i===me || s.st[i]==='out') return ''; const hd=s.hand[i];
      return `<div class="xd-o${s.gain[i]>0?' win':s.gain[i]<0?' lose':''}"><small>${escH(p.a)} ${escH(p.n)}</small>${hd.length?TGU.cards(hd,'sm',()=>!showAll):'<span class="xd-wait">'+(s.bet[i]?'💰':'…')+'</span>'}${showAll&&hd.length?'<b>'+XD.name(hd)+'</b>':''}</div>`; }).join('')+'</div>';
    h += '</div>';
    if(me<0) return h+'</div>';
    const hd=s.hand[me], st=s.st[me];
    if(st==='out') return h+'<div class="bg-msg">💸 Bạn đã hết xu — ngồi xem nhé</div></div>';
    if(s.ph==='bet'){
      if(s.bet[me]) return h+`<div class="bg-msg">💰 Đã cược <b>${TGU.money(s.bet[me])}</b> xu — chờ chia bài…</div></div>`;
      const amt=Math.min(ui.amt||100, s.chips[me]);
      return h+`<div class="bg-msg">Chọn mức cược (còn ${TGU.money(s.chips[me])} xu)</div><div class="bg-chips">${[...new Set([50,100,200,500].filter(v=>v<s.chips[me]).concat([s.chips[me]]))].map(v=>`<button class="chip${v===amt?' on':''}" data-ui='{"k":"amt","v":${v}}'>${v===s.chips[me]?'Tất tay':v}</button>`).join('')}</div><div class="bg-ctl c">${TGU.btn({t:'bet',v:amt},'🃏 Cược '+TGU.money(amt),'big green')}</div></div>`;
    }
    const v=XD.val(hd);
    h += `<div class="xd-me">${TGU.cards(hd,'lg deal')}<div class="bg-sum">${XD.name(hd)}${s.bet[me]?' · cược '+TGU.money(s.bet[me]):''}</div></div>`;
    if(s.ph==='play' && st==='play'){
      h += `<div class="bg-ctl c">${TGU.btn({t:'hit'},'➕ Rút bài','big', hd.length>=5)}${TGU.btn({t:'stand'},v<16?'Chưa đủ 16':'✋ Dằn','big green', v<16)}</div>`;
    } else if(s.ph==='play') h += `<div class="bg-msg">${st==='bj'?'🔥 Bạn có '+XD.name(hd)+'!':'✋ Đã dằn'} — chờ mọi người</div>`;
    else if(s.ph==='dealer') h += '<div class="bg-msg">🎩 Nhà cái đang rút bài…</div>';
    else if(s.ph==='res') h += `<div class="bg-msg big ${s.gain[me]>0?'win':s.gain[me]<0?'lose':''}">${s.gain[me]>0?'🎉 Thắng +'+TGU.money(s.gain[me]):s.gain[me]<0?'😢 Thua '+TGU.money(s.gain[me]):'🤝 Hòa'}</div>`;
    return h+'</div>';
  }
};

/* ---------- ♠️ POKER TEXAS HOLD'EM ---------- */
const PK = {
  // điểm của 5 lá: [loại, ...hạng] → số so sánh được
  ev5(cs){ const r=cs.map(cR).sort((a,b)=>b-a), fl=cs.every(c=>cS(c)===cS(cs[0]));
    let st=-1; const u=[...new Set(r)]; if(u.length===5){ if(u[0]-u[4]===4) st=u[0]; else if(u[0]===12&&u[1]===3) st=3; }
    const cnt={}; r.forEach(x=>cnt[x]=(cnt[x]||0)+1); const g=Object.entries(cnt).map(([k,v])=>[v,+k]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
    let cat, ks;
    if(st>=0&&fl){ cat=8; ks=[st]; } else if(g[0][0]===4){ cat=7; ks=[g[0][1],g[1][1]]; } else if(g[0][0]===3&&g[1][0]===2){ cat=6; ks=[g[0][1],g[1][1]]; }
    else if(fl){ cat=5; ks=r; } else if(st>=0){ cat=4; ks=[st]; } else if(g[0][0]===3){ cat=3; ks=g.map(x=>x[1]); } else if(g[0][0]===2&&g[1][0]===2){ cat=2; ks=g.map(x=>x[1]); }
    else if(g[0][0]===2){ cat=1; ks=g.map(x=>x[1]); } else { cat=0; ks=r; }
    let v=cat; for(let k=0;k<5;k++) v=v*13+(ks[k]||0); return v; },
  best(cs){ let b=-1; const n=cs.length; if(n<5) return -1;
    for(let a=0;a<n;a++)for(let b2=a+1;b2<n;b2++){ const five=cs.filter((_,k)=>k!==a&&k!==b2); if(n===7){ const v=PK.ev5(five); if(v>b) b=v; } }
    if(n===5) return PK.ev5(cs); if(n===6){ for(let a=0;a<6;a++){ const v=PK.ev5(cs.filter((_,k)=>k!==a)); if(v>b) b=v; } } return b; },
  cat: v => Math.floor(v/Math.pow(13,5)),
  NAMES: ['Mậu thầu','Một đôi','Hai đôi','Sám cô','Sảnh','Thùng','Cù lũ','Tứ quý','Thùng phá sảnh'],
};
TG.poker = {
  per:{ stack:0, hole:()=>[], bet:0, tot:0, fold:0, allin:0, acted:0, won:0, show:0 },
  lists:['board','deck'],
  about:'Texas Hold\'em: mỗi người 1.000 chip, 2 lá tẩy + 5 lá chung. Mù nhỏ/lớn 10/20, tăng gấp đôi mỗi 5 ván. Theo, tố, bỏ hoặc tất tay; có chia pot phụ khi tất tay. Lật bài ai có 5 lá mạnh nhất ăn pot.',
  init(P, set, rng, now){ const s={ P, stack:P.map(()=>1000), hands:set.rounds||0, hn:0, btn:Math.floor(rng()*P.length), board:[] }; this.nh(s, now, rng); return s; },
  live: (s,i) => s.stack[i]>0 || s.tot[i]>0,
  nh(s, now, rng){
    const n=s.P.length; s.hn++;
    s.bb = 20*Math.pow(2, Math.floor((s.hn-1)/5)); const sb=s.bb/2;
    s.deck=TGU.deck(rng); s.board=[]; s.hole=s.P.map(()=>[]); s.bet=s.P.map(()=>0); s.tot=s.P.map(()=>0); s.fold=s.P.map((p,i)=>s.stack[i]>0?0:1);
    s.allin=s.P.map(()=>0); s.acted=s.P.map(()=>0); s.won=s.P.map(()=>0); s.show=s.P.map(()=>0); s.street=0; s.pot=0; s.res='';
    const nx=i=>{ for(let k=1;k<=n;k++){ const j=(i+k)%n; if(!s.fold[j]) return j; } return i; };
    s.btn=nx(s.btn);
    const alive=s.P.map((p,i)=>i).filter(i=>!s.fold[i]);
    alive.forEach(i=>{ s.hole[i]=[s.deck.pop(), s.deck.pop()]; });
    const sbI = alive.length===2 ? s.btn : nx(s.btn), bbI = nx(sbI);
    this.put(s, sbI, sb); this.put(s, bbI, s.bb); s.cur=s.bb; s.minR=s.bb; s.sbI=sbI; s.bbI=bbI;
    s.turn=nx(bbI); this.skip(s); this.startTurn(s, now);
    TGU.phase(s,'play',0,now); this.startTurn(s, now);
    TGU.log(s,'🂠 Ván '+s.hn+' — mù '+TGU.money(sb)+'/'+TGU.money(s.bb),'',now);
  },
  put(s,i,amt){ const a=Math.min(amt, s.stack[i]); s.stack[i]-=a; s.bet[i]+=a; s.tot[i]+=a; if(!s.stack[i]) s.allin[i]=1; return a; },
  canAct: (s,i) => !s.fold[i] && !s.allin[i],
  skip(s){ const n=s.P.length; for(let k=0;k<n && !this.canAct(s,s.turn);k++) s.turn=(s.turn+1)%n; },
  startTurn(s, now){ s.dl = now+25000; s.dlLen=25000; s.bt={}; },
  act(s,i,a,now){
    if(s.ph!=='play' || s.turn!==i || !this.canAct(s,i)) return false;
    const need=s.cur-s.bet[i];
    if(a.t==='fold'){ s.fold[i]=1; TGU.log(s, s.P[i].n+' bỏ bài','',now); }
    else if(a.t==='check'){ if(need>0) return false; }
    else if(a.t==='call'){ if(need<=0) return false; this.put(s,i,need); }
    else if(a.t==='raise'){ const to=Math.round(+a.to||0), max=s.bet[i]+s.stack[i];
      if(to>=max){ return this.act(s,i,{t:'allin'},now); }
      if(to < s.cur+s.minR) return false;
      s.minR=to-s.cur; s.cur=to; this.put(s,i,to-s.bet[i]); s.acted=s.acted.map(()=>0); TGU.log(s, s.P[i].n+' tố lên '+TGU.money(to),'',now); }
    else if(a.t==='allin'){ const to=s.bet[i]+s.stack[i]; if(to>s.cur){ if(to-s.cur>=s.minR) { s.minR=to-s.cur; s.acted=s.acted.map(()=>0); } s.cur=to; } this.put(s,i,s.stack[i]); TGU.log(s,'🔥 '+s.P[i].n+' TẤT TAY '+TGU.money(to)+'!','big',now); }
    else return false;
    s.acted[i]=1; this.advance(s, now); return true;
  },
  advance(s, now){
    const n=s.P.length, inH=s.P.map((p,i)=>i).filter(i=>!s.fold[i]);
    if(inH.length===1){ return this.showdown(s, now); }
    const act=inH.filter(i=>!s.allin[i]);
    const done = act.every(i=>s.acted[i] && s.bet[i]===s.cur) && (act.length>0 || true);
    if(!done && !(act.length<=1 && act.every(i=>s.bet[i]>=s.cur))){ s.turn=(s.turn+1)%n; this.skip(s); this.startTurn(s, now); return; }
    // hết vòng cược
    s.pot += s.bet.reduce((a,b)=>a+b,0); s.bet=s.bet.map(()=>0); s.cur=0; s.minR=s.bb; s.acted=s.acted.map(()=>0);
    if(s.street>=3) return this.showdown(s, now);
    s.street++; if(s.street===1) s.board.push(s.deck.pop(), s.deck.pop(), s.deck.pop()); else s.board.push(s.deck.pop());
    if(act.length<=1){ s.ph='run'; s.dl=0; s.nx=now+1300; return; }       // mọi người tất tay → lật dần
    s.turn=(s.btn+1)%n; this.skip(s); this.startTurn(s, now);
  },
  showdown(s, now){
    s.pot += s.bet.reduce((a,b)=>a+b,0); s.bet=s.bet.map(()=>0);
    const inH=s.P.map((p,i)=>i).filter(i=>!s.fold[i]);
    const val=s.P.map((p,i)=>!s.fold[i] && s.board.length===5 ? PK.best(s.hole[i].concat(s.board)) : -1);
    if(inH.length===1){ const w=inH[0]; s.won[w]=s.tot.reduce((a,b)=>a+b,0); s.stack[w]+=s.won[w]; TGU.log(s,'💰 '+s.P[w].n+' ăn pot '+TGU.money(s.won[w]),'win',now); }
    else {
      inH.forEach(i=>s.show[i]=1);
      // chia pot chính + pot phụ
      const lv=[...new Set(s.tot.filter(x=>x>0))].sort((a,b)=>a-b); let prev=0;
      lv.forEach(L=>{ const amt=s.tot.reduce((a,t)=>a+Math.max(0,Math.min(t,L)-prev),0); const el=inH.filter(i=>s.tot[i]>=L);
        if(amt>0){ const top=Math.max(...el.map(i=>val[i])); const ws=el.filter(i=>val[i]===top);
          if(!ws.length){ s.P.forEach((p,i)=>{ const g=Math.max(0,Math.min(s.tot[i],L)-prev); s.stack[i]+=g; }); prev=L; return; }   // tiền tố không ai theo → trả lại
          const share=Math.floor(amt/ws.length); ws.forEach((i,k)=>{ const g=share+(k===0?amt-share*ws.length:0); s.won[i]+=g; s.stack[i]+=g; }); }
        prev=L; });
      const top=s.P.map((p,i)=>i).filter(i=>s.won[i]>0).sort((a,b)=>s.won[b]-s.won[a]);
      s.res = top.map(i=>s.P[i].n+' ('+PK.NAMES[PK.cat(val[i])]+')').join(', ');
      TGU.log(s,'🏆 '+top.map(i=>s.P[i].n).join(', ')+' thắng '+TGU.money(s.won[top[0]])+' — '+PK.NAMES[PK.cat(val[top[0]])],'win',now);
    }
    s.pot=0; TGU.phase(s,'res',5500,now);
  },
  botMove(s,i,rng){
    const need=s.cur-s.bet[i], h=s.hole[i], pot=s.pot+s.bet.reduce((a,b)=>a+b,0);
    let str;
    if(!s.board.length){ const a=cR(h[0]), b=cR(h[1]), hi=Math.max(a,b), lo=Math.min(a,b);
      str = (a===b ? .55+a/26 : (hi+lo)/26*.7) + (cS(h[0])===cS(h[1])?.06:0) + (hi-lo<=2?.04:0); }
    else { const v=PK.best(h.concat(s.board).concat(s.board.length<3?[]:[])) ; const c = s.board.length+2>=5 ? PK.cat(v) : 0;
      str = [.25,.5,.68,.78,.85,.88,.94,.98,1][c] + (c===1 && Math.max(...s.board.map(cR)) <= Math.max(cR(h[0]),cR(h[1])) ? .1 : 0); }
    str += (rng()-.5)*.2;
    const odds = need/(pot+need+1);
    if(need>0 && str<odds+.15 && !(need<=s.bb && rng()<.5)) return {t:'fold'};
    if(str>.8 && rng()<.6){ const to=s.cur+Math.max(s.minR, Math.round(pot*(.5+rng()*.5)/10)*10); return to>=s.bet[i]+s.stack[i] ? {t:'allin'} : {t:'raise',to}; }
    if(str>.62 && need===0 && rng()<.4) return {t:'raise', to:s.cur+Math.max(s.minR, Math.round(pot*.5/10)*10)};
    return need>0 ? (need>=s.stack[i] ? (str>.7?{t:'allin'}:{t:'fold'}) : {t:'call'}) : {t:'check'};
  },
  tick(s, now, rng){
    if(s.ph==='play'){
      const i=s.turn, p=s.P[i];
      if(!this.canAct(s,i)){ this.advance(s, now); return true; }
      if(p && p.bot && this.canAct(s,i) && TGU.bot(s,i,now,rng,900,2200)){ const m=this.botMove(s,i,rng); if(!this.act(s,i,m,now)) this.act(s,i,s.cur>s.bet[i]?{t:'call'}:{t:'check'},now) || this.act(s,i,{t:'fold'},now); return true; }
      if(now>=s.dl){ this.act(s,i, s.cur>s.bet[i] ? {t:'fold'} : {t:'check'}, now); return true; }
      return false;
    }
    if(s.ph==='run' && now>=s.nx){
      if(s.board.length<5){ s.board.push(s.deck.pop()); s.nx=now+1300; return true; }
      this.showdown(s, now); return true;
    }
    if(s.ph==='res' && now>=s.dl){
      const alive=s.P.filter((p,i)=>s.stack[i]>0).length;
      if(alive<=1 || (s.hands && s.hn>=s.hands)){ s.over=1; s.dl=0; const w=s.stack.indexOf(Math.max(...s.stack)); TGU.log(s,'🏆 '+s.P[w].n+' là vua bàn Poker!','big',now); return true; }
      this.nh(s, now, rng); return true;
    }
    return false;
  },
  turn: s => s.ph==='play' ? s.turn : -1,
  label: s => 'Ván '+s.hn+(s.hands?'/'+s.hands:'')+' · mù '+TGU.money(s.bb/2)+'/'+TGU.money(s.bb),
  score: (s,i) => TGU.money(s.stack[i]),
  badge(s,i){ if(s.ph==='res') return s.won[i]>0?'+'+TGU.money(s.won[i]):s.fold[i]&&!s.tot[i]?'':s.fold[i]?'Bỏ':'';
    if(s.fold[i]) return s.stack[i]||s.tot[i]?'🚫 Bỏ':'💸 Hết';
    const tag=(i===s.btn?'Ⓓ ':'')+(i===s.sbI?'SB ':'')+(i===s.bbI?'BB ':'');
    return tag+(s.allin[i]?'🔥 All-in':s.bet[i]?'⬤ '+TGU.money(s.bet[i]):''); },
  result: s => TGU.rank(s.stack, true, v=>TGU.money(v)+' chip'),
  ui(v, ui, s, me){ if(v.k==='r'){ ui.r = v.v; } if(v.k==='ropen') ui.ro=!ui.ro; },
  view(s, me, ui){
    const pot=s.pot+s.bet.reduce((a,b)=>a+b,0);
    let h='<div class="pkr"><div class="felt pkf">';
    h += `<div class="pk-pot">Pot <b>${TGU.money(pot)}</b></div>`;
    h += '<div class="pk-board">'+[0,1,2,3,4].map(k=>s.board[k]!=null?TGU.card(s.board[k],'deal'):'<span class="pc slot"></span>').join('')+'</div>';
    h += '<div class="pk-seats">'+s.P.map((p,i)=>{ if(i===me) return ''; const sh=s.show[i]&&s.ph==='res';
      return `<div class="pk-s${s.turn===i&&s.ph==='play'?' turn':''}${s.fold[i]?' fold':''}${s.won[i]?' win':''}"><small>${escH(p.a)} ${escH(p.n)}</small>${s.hole[i].length?TGU.cards(s.hole[i],'sm',()=>!sh):''}${sh&&s.board.length===5?'<b>'+PK.NAMES[PK.cat(PK.best(s.hole[i].concat(s.board)))]+'</b>':''}</div>`; }).join('')+'</div>';
    h += '</div>';
    if(me<0) return h+'</div>';
    const hole=s.hole[me];
    if(!hole.length) return h+'<div class="bg-msg">💸 Bạn đã hết chip — ngồi xem nhé</div></div>';
    const v = s.board.length>=3 ? PK.best(hole.concat(s.board)) : -1;
    h += `<div class="pk-me">${TGU.cards(hole,'lg')}<div class="bg-sum">${s.fold[me]?'🚫 Đã bỏ':v>=0?PK.NAMES[PK.cat(v)]:(cR(hole[0])===cR(hole[1])?'Đôi '+CRK[cR(hole[0])]:'Bài tẩy')}</div></div>`;
    if(s.ph==='play' && s.turn===me && this.canAct(s,me)){
      const need=s.cur-s.bet[me], max=s.bet[me]+s.stack[me], minTo=Math.min(max, s.cur+s.minR);
      const steps=[minTo, s.cur+Math.round(pot/2/10)*10, s.cur+pot, max].filter((x,k,a)=>x>=minTo&&x<=max&&a.indexOf(x)===k).sort((a,b)=>a-b);
      const to = steps.includes(ui.r) ? ui.r : steps[0];
      h += `<div class="bg-ctl c">${TGU.btn({t:'fold'},'🚫 Bỏ','gray')}${need>0?TGU.btn({t:'call'},need>=s.stack[me]?'🔥 Tất tay '+TGU.money(s.stack[me]):'✅ Theo '+TGU.money(need),'green'):TGU.btn({t:'check'},'✅ Xem','green')}${max>s.cur?`<button class="tbtn" data-ui='{"k":"ropen"}'>⬆ Tố</button>`:''}</div>`;
      if(ui.ro && max>s.cur) h += `<div class="pk-raise">${steps.map(x=>`<button class="chip${x===to?' on':''}" data-ui='{"k":"r","v":${x}}'>${x===max?'All-in':TGU.money(x)}</button>`).join('')}${TGU.btn(to>=max?{t:'allin'}:{t:'raise',to}, '⬆ Tố lên '+TGU.money(to),'big')}</div>`;
    } else if(s.ph==='play') h += `<div class="bg-msg">${s.fold[me]?'Chờ ván sau…':s.allin[me]?'🔥 Bạn đã tất tay':'⏳ '+escH(s.P[s.turn].n)+' đang suy nghĩ…'}</div>`;
    else if(s.ph==='run') h += '<div class="bg-msg">🂠 Lật bài…</div>';
    else if(s.ph==='res') h += `<div class="bg-msg big ${s.won[me]?'win':''}">${s.won[me]?'🎉 Bạn ăn '+TGU.money(s.won[me]):s.res?'Thắng: '+escH(s.res):'Ván kết thúc'}</div>`;
    return h+'</div>';
  }
};

/* ---------- 🏹 TIẾN LÊN — luật dùng chung (nhận diện bộ, chặt heo, tới trắng) ---------- */
const TL_R=['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
const TL_S=['♠','♣','♦','♥'];
const TL_TWO=12;
const tlV=c=>TL_R.indexOf(c.slice(0,-1))*4+TL_S.indexOf(c.slice(-1));
const tlRk=c=>TL_R.indexOf(c.slice(0,-1));
const tlSort=h=>[...(h||[])].sort((a,b)=>tlV(a)-tlV(b));
const tlRed=c=>c.slice(-1)==='♥'||c.slice(-1)==='♦';
const TL_PTS={4:[3,1,-1,-3],3:[2,0,-2],2:[1,-1]};
function tlType(cards){
  if(!cards||!cards.length)return null;
  const c=tlSort(cards),n=c.length,rk=c.map(tlRk),top=tlV(c[n-1]),same=rk.every(r=>r===rk[0]);
  if(n===1)return{t:'single',n,top,rk:rk[0]};
  if(same&&n===2)return{t:'pair',n,top,rk:rk[0]};
  if(same&&n===3)return{t:'triple',n,top,rk:rk[0]};
  if(same&&n===4)return{t:'quad',n,top,rk:rk[0]};
  if(rk.includes(TL_TWO))return null;
  if(n>=3&&rk.every((r,i)=>i===0||r===rk[i-1]+1))return{t:'straight',n,top,rk:rk[n-1]};
  if(n>=6&&n%2===0){let ok=true;for(let i=0;i<n;i+=2){if(rk[i]!==rk[i+1])ok=false;if(i>0&&rk[i]!==rk[i-2]+1)ok=false}
    if(ok)return{t:'pairseq',n,top,rk:rk[n-1],pairs:n/2}}
  return null;
}
function tlName(t){
  if(!t)return'';
  if(t.t==='single')return t.rk===TL_TWO?'Heo':'Lá đơn';
  if(t.t==='pair')return t.rk===TL_TWO?'Đôi heo':'Đôi';
  if(t.t==='triple')return'Bộ ba';if(t.t==='quad')return'Tứ quý';
  if(t.t==='straight')return'Sảnh '+t.n+' lá';
  return t.pairs+' đôi thông';
}
const tlHeoPts=cards=>cards.reduce((s,c)=>s+(tlRk(c)===TL_TWO?(tlRed(c)?3:2):0),0);
// play có chặn được pile không? chop = điểm chặt (0 nếu đánh thường)
function tlBeat(pile,play){
  const Q=tlType(play);if(!Q)return{ok:false};
  if(!pile||!pile.length)return{ok:true,chop:0};
  const P=tlType(pile);if(!P)return{ok:false};
  if(Q.t===P.t&&Q.n===P.n)return{ok:Q.top>P.top,chop:0};
  const b3=Q.t==='pairseq'&&Q.pairs===3,b4=Q.t==='pairseq'&&Q.pairs===4,quad=Q.t==='quad';
  if(P.t==='single'&&P.rk===TL_TWO&&(b3||quad||b4))return{ok:true,chop:tlHeoPts(pile)};
  if(P.t==='pair'&&P.rk===TL_TWO&&(quad||b4))return{ok:true,chop:tlHeoPts(pile)};
  if(P.t==='pairseq'&&P.pairs===3&&(quad||b4))return{ok:true,chop:4};
  if(P.t==='quad'&&b4)return{ok:true,chop:6};
  return{ok:false};
}
// tới trắng
function tlInstant(hand){
  const cnt={};hand.forEach(c=>{const r=tlRk(c);cnt[r]=(cnt[r]||0)+1});
  if(cnt[TL_TWO]===4)return'Tứ quý heo';
  if(Object.keys(cnt).map(Number).filter(r=>r!==TL_TWO).length===12)return'Sảnh rồng';
  if(Object.values(cnt).reduce((s,v)=>s+Math.floor(v/2),0)>=6)return'6 đôi';
  const pr=Object.keys(cnt).map(Number).filter(r=>r!==TL_TWO&&cnt[r]>=2).sort((a,b)=>a-b);
  let run=1;for(let i=1;i<pr.length;i++){run=pr[i]===pr[i-1]+1?run+1:1;if(run>=5)return'5 đôi thông'}
  return null;
}
/* ---------- liệt kê các nước đánh (cho máy & gợi ý) ---------- */
function tlCombos(hand){
  const h=tlSort(hand),by={},out=[];
  h.forEach(c=>{(by[tlRk(c)]=by[tlRk(c)]||[]).push(c)});
  h.forEach(c=>out.push([c]));
  for(const r in by){const g=by[r];
    for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++)out.push([g[i],g[j]]);
    if(g.length>=3){out.push(g.slice(0,3));if(g.length===4){out.push([g[0],g[1],g[3]]);out.push([g[0],g[2],g[3]]);out.push([g[1],g[2],g[3]]);out.push(g.slice())}}}
  for(let s=0;s<12;s++){if(!by[s])continue;const seq=[by[s][0]];
    for(let r=s+1;r<12&&by[r];r++){if(r-s+1>=3)for(const tc of by[r])out.push([...seq,tc]);seq.push(by[r][0])}}
  for(let s=0;s<12;s++){if(!(by[s]&&by[s].length>=2))continue;const seq=[by[s][0],by[s][1]];
    for(let r=s+1;r<12&&by[r]&&by[r].length>=2;r++){if(r-s+1>=3){out.push([...seq,by[r][0],by[r][1]]);out.push([...seq,...by[r].slice(-2)])}seq.push(by[r][0],by[r][1])}}
  return out;
}

const TL_SEQ = ['🥇','🥈','🥉','4️⃣'];
const TL_SAY = {
  chop: ['Mày hả bưởi 🍊','Chếc gồi con ơi 💀','Ét ô ét chưaaa 🆘','Khét lẹt luôn 🔥','U là trời chặt nè 😱','Ăn gạch nha cưng 🧱','Xu cà na rồi 😭','Mai đẹt ti ni 🪦','Khóc tiếng Mán đi 😭','Hong có cửa đâu 🚪','Đi về mà khóc 🚶','Tấu hài ghê ta 🤡','Chằm Zn chưa 😵','Nằm im ăn chặt 🔪','Báo nhà luôn á 📢','Cạu quá đi 😤','Hết cứu chữa 🏥','Dảk dảk bủh bủh 💀','Ô kê la chưa 👌','Chặt đẹp hông bây 🔪','Toang thật rồi em 💥','Cúp điện luôn á ⚡','Bay màu nha con 🎨'],
  ngang: ['Ngang hông bất ngờ 😮','Bẻ lái gắt cực 🏎️','Tới công chuyện 🔥','Đỉnh kout luôn 🏔️','Real khôn lỏi 🤨','Pha này căng đét ⚡','Lụm liền tay 🤲','Ảo ma Canada 🍁'],
  heo: ['Heo nè đỡ đi 🐷','Heo nè cưng 🐷','Mlem mlem con heo 😋','Thả heo nha 🐽','Đỡ con heo zìa 🐖','Heo bay tán loạn 🐷💨','Ụt ụt gòi nha 🐽','Lùa heo về chuồng 🚜','Heo tới, xu cà na 🐷','Ăn con heo đi cưng 🍖','Heo rừng tới nha 🐗','Hức con heo zô 🐽','Đỡ hông nổi đâu 🐷','Hai con heo bự nè 🐷🐷','Heo nái zìa làng 🐖'],
  white: ['Tới trắng, đỉnh nóc 🚀','Khỏi bàn luôn á 🎉','Bài thần thánh 🃏','Số hưởng vô đối 🍀','Trời thương con ghê 🙏','Ảo ma Canada thật 🍁','Mai đẹt ti ni là đây ✨'],
  win: ['Dọn sạch, bai nha 😎','Về nhất ez game 🥇','Cạn bài trước nha 👋','GG no re luôn 🎮','Flex cái nhất 💅','Trùm cuối là tui 👑','Đỉnh của chóp 🏆','Mai đẹt ti ni 🌟','Hết nước chấm 🫗'],
  pass: ['Bỏ lượt nha 🙅','Thôi cho qua ✋','Em xin kiếu ván này 😮‍💨','Bài xấu quá bỏ 😔','Hẹn ván sau nha 👋','Né cái đã 🫣','Bỏ, hông ham 💤','Ô pải phơ, bỏ 🫠','Đợi heo rồi tính 🐷','Giữ bài, bỏ lượt 🤐'],
  de: ['Đè nèeee 😤','Nín chưa cưng 😏','Tuổi gì mà đòi 👶','Đỡ nổi hông 😮','Trên cơ nha 💪','Dí tới luôn 🔥','Hơn một bậc hà 📈','Chịu thua đi em 🙃','Gọi anh sư phụ 🥋','Ăn đè cho nhớ 🍚','Có chừa chưa 😎','Lớn hơn xíu hà 🤏','Đạp lên mà đi 👟','Khôn hồn thì né 🫵','Real là trên cơ 🤨','Cột sống luôn nha 🦴']
};
const tlSay = a => a[Math.floor(Math.random()*a.length)];
const TL_COL = ['#38bdf8','#f472b6','#fbbf24','#4ade80','#a78bfa','#fb923c','#2dd4bf','#f87171'];
const tlPcInner = c => { const r=c.slice(0,-1), su=c.slice(-1); return `<span class="pc-i tl"><b>${r}</b><i>${su}</i></span><span class="pc-mid">${su}</span><span class="pc-i br"><b>${r}</b><i>${su}</i></span>`; };
const tlCardH = (c, cls, sel) => `<span class="pc ${tlRed(c)?'red':''} ${cls||''}${sel?' sel':''}">${tlPcInner(c)}</span>`;
TG.tienlen = {
  per:{ sc:0, wins:0, hand:()=>[], pass:0, game:0 },
  lists:['pile','ranks','cong','res'],
  about:'Tiến Lên Miền Nam 2–4 người, mỗi người 13 lá. Ván đầu ai giữ lá nhỏ nhất (3♠) đi trước. Heo bị chặt bởi 3 đôi thông / tứ quý / 4 đôi thông; thối heo, cóng bị phạt; có tới trắng. Hết số ván ai nhiều điểm nhất thắng.',
  init(P, set, rng, now){ const s={ P, sc:P.map(()=>0), wins:P.map(()=>0), rounds:set.rounds||5, gn:0, tmr:set.tmr==null?25:set.tmr, lastW:-1 }; this.deal(s, now, rng); return s; },
  nm: (s,i) => s.P[i].a+' '+s.P[i].n,
  setTurn(s, i, now){ s.turn=i; s.dl = s.tmr ? now+s.tmr*1000 : 0; s.dlLen = s.tmr*1000; s.bt={}; },
  deal(s, now, rng){
    const n=s.P.length, deck=[]; for(const r of TL_R) for(const u of TL_S) deck.push(r+u);
    TGU.shuffle(deck, rng); s.gn++;
    s.hand=s.P.map((p,i)=>tlSort(deck.slice(i*13, i*13+13)));
    s.pile=[]; s.pileBy=-1; s.pass=s.P.map(()=>0); s.ranks=[]; s.cong=[]; s.game=s.P.map(()=>0); s.chop=0; s.chopV=-1; s.res=[]; s.must=''; s.say=null; s.dealt=now;
    TGU.phase(s,'play',0,now);
    for(let i=0;i<n;i++){ const why=tlInstant(s.hand[i]); if(why){
      s.P.forEach((p,j)=>{ if(j===i) return; const pen=3+tlHeoPts(s.hand[j]); s.game[j]-=pen; s.game[i]+=pen; });
      s.say={ i, t:tlSay(TL_SAY.white), ts:now };
      this.finish(s, [i], now, '⚡ TỚI TRẮNG! '+this.nm(s,i)+' quá đẳng cấp — '+why); return; } }
    s.hold = now + 1900;   // tạm dừng ~1.9s để chia bài xong mới đánh
    let lead = s.lastW>=0 && s.lastW<n ? s.lastW : -1;
    if(lead<0){ let low=null; s.hand.forEach((h,i)=>{ if(!low || tlV(h[0])<tlV(low.c)) low={i,c:h[0]}; }); lead=low.i; s.must=low.c; }
    this.setTurn(s, lead, now);
    TGU.log(s, '🏁 Ván '+s.gn+' — '+this.nm(s,lead)+' đi trước', '', now);
  },
  next(s, from, pileBy){
    const n=s.P.length, has=i=>s.hand[i].length>0;
    for(let k=1;k<=n;k++){ const i=(from+k)%n; if(i===pileBy){ if(has(i)) return {turn:i, nr:true}; continue; } if(has(i) && !s.pass[i]) return {turn:i, nr:false}; }
    for(let k=1;k<=n;k++){ const i=(pileBy+k)%n; if(has(i)) return {turn:i, nr:true}; }
    return {turn:-1, nr:true};
  },
  newRound(s, i, now){ s.pile=[]; s.pileBy=-1; s.pass=s.P.map(()=>0); s.chop=0; s.chopV=-1; if(!s.log || s.log.ts!==now) TGU.log(s,'🆕 '+this.nm(s,i)+' được đi tự do','',now); },
  // 4 đôi thông được chặt ngang (không cần tới lượt) khi trên bàn là heo hoặc bom
  ngang(s, i, cards){
    if(s.ph!=='play' || !s.pile.length || s.pileBy===i || !s.hand[i].length) return false;
    const Q=tlType(cards); if(!Q || Q.t!=='pairseq' || Q.pairs<4) return false;
    if(!cards.every(c=>s.hand[i].includes(c))) return false;
    const r=tlBeat(s.pile, cards), P=tlType(s.pile); return r.ok && ((P.rk===TL_TWO && r.chop>0) || s.chop>0);
  },
  ngangOpts(s, i){ if(i<0 || s.ph!=='play' || !s.pile.length || s.pileBy===i || !s.hand[i] || s.hand[i].length<8) return [];
    return tlCombos(s.hand[i]).filter(c=>this.ngang(s,i,c)); },
  // bom còn trên tay (để phạt thối): tứ quý 4 · 3 đôi thông 4 · 4 đôi thông 6
  bombs(hand){
    const cnt={}; (hand||[]).forEach(c=>{ const r=tlRk(c); if(r!==TL_TWO) cnt[r]=(cnt[r]||0)+1; });
    let pts=0; const names=[];
    Object.keys(cnt).forEach(r=>{ if(cnt[r]===4){ pts+=4; names.push('tứ quý'); cnt[r]=0; } });
    const rs=Object.keys(cnt).map(Number).filter(r=>cnt[r]>=2).sort((a,b)=>a-b); let run=[];
    const flush=()=>{ let k=run.length; while(k>=3){ if(k>=4){ pts+=6; names.push('4 đôi thông'); k-=4; } else { pts+=4; names.push('3 đôi thông'); k-=3; } } run=[]; };
    rs.forEach(r=>{ if(run.length && r!==run[run.length-1]+1) flush(); run.push(r); }); flush();
    return { pts, names };
  },
  // các bộ đánh được ngay lúc này (đúng lượt)
  plays(s, me){ if(me<0 || s.ph!=='play' || s.turn!==me) return []; return tlCombos(s.hand[me]).filter(c=>!this.check(s,me,c)); },
  // bộ chứa lá c chặn được bài trên bàn, nước yếu trước, bom sau cùng
  cands(s, me, c){ const bomb=x=>{ const t=tlType(x); return t.t==='quad'||t.t==='pairseq'; };
    return this.plays(s,me).filter(x=>x.includes(c)).sort((a,b)=>(bomb(a)-bomb(b)) || (tlType(a).top-tlType(b).top) || (a.length-b.length)); },
  check(s, i, cards){
    if(s.ph!=='play') return 'Chưa đến lượt!';
    if(s.turn!==i) return this.ngang(s, i, cards) ? '' : 'Chưa đến lượt!';
    if(!cards || !cards.length) return 'Chọn bài trước!';
    if(!cards.every(c=>s.hand[i].includes(c))) return 'Bài không có trên tay';
    if(!tlType(cards)) return 'Bộ bài không hợp lệ';
    if(s.must && !cards.includes(s.must)) return 'Nước đầu phải có lá '+s.must;
    if(!tlBeat(s.pile, cards).ok) return s.pile.length ? 'Không chặn được bài trên bàn' : 'Bộ bài không hợp lệ';
    return '';
  },
  act(s, i, a, now){
    if(s.hold && now < s.hold) return false;
    if(a.t==='next'){ if(s.ph!=='res' || s.over) return false; this.deal(s, now, rng||Math.random); return true; }
    if(a.t==='end'){ if(s.ph!=='res' || s.over) return false; s.over=1; s.dl=0; const w=s.sc.indexOf(Math.max(...s.sc)); TGU.log(s,'🏆 '+this.nm(s,w)+' vô địch Tiến Lên!','big',now); return true; }
    if(a.t==='pass'){ if(s.ph!=='play' || s.turn!==i || !s.pile.length) return false;
      s.pass[i]=1; s.passed={ i, t:tlSay(TL_SAY.pass), ts:now }; const nx=this.next(s, i, s.pileBy); if(nx.nr) this.newRound(s, nx.turn, now); this.setTurn(s, nx.turn, now); return true; }
    if(a.t!=='play') return false;
    const cards=(a.c||[]).filter(x=>typeof x==='string'); if(this.check(s,i,cards)) return false;
    const res=tlBeat(s.pile, cards), P=tlType(s.pile), ngang = s.turn!==i;
    s.hand[i]=s.hand[i].filter(c=>!cards.includes(c));
    // điểm chặt chỉ tính theo heo: heo đen 2, heo đỏ 3 (đôi heo cộng 2 lá); bom không cộng thêm
    let chop=0; const victim=s.pileBy;
    if(P && P.rk===TL_TWO && (P.t==='single'||P.t==='pair') && res.chop) chop=res.chop;
    else if(s.chop && s.chopV>=0 && P && (P.t==='quad'||P.t==='pairseq')){
      // chặt chồng: hoàn lại lần chặt trước, người bị chặt sau cùng lãnh nguyên điểm heo
      s.game[s.chopV]+=s.chop; s.game[victim]-=s.chop; chop=s.chop;
    }
    if(chop){ s.game[i]+=chop; s.game[victim]-=chop;
      TGU.log(s,'💥 '+this.nm(s,i)+(ngang?' CHẶT NGANG ':' CHẶT ')+this.nm(s,victim)+'  '+(s.chop?'(chồng) ':'')+'+'+chop,'big',now);
      s.say={ i, t:tlSay(ngang?TL_SAY.ngang:TL_SAY.chop), ts:now }; }
    else if(s.pile.length && P){ if(tlType(cards).rk===TL_TWO && Math.random()<.6) s.say={ i, t:tlSay(TL_SAY.heo), ts:now }; else if(Math.random()<.4) s.say={ i, t:tlSay(TL_SAY.de), ts:now }; }
    if(ngang) s.pass[i]=0;
    s.chopV = chop ? victim : -1;
    s.chop=chop; s.pile=tlSort(cards); s.pileBy=i; s.must='';
    if(!s.hand[i].length){ s.ranks.push(i);
      if(s.ranks.length===1) s.cong=s.P.map((p,j)=>j).filter(j=>j!==i && s.hand[j].length===13);
      if(!chop) TGU.log(s, TL_SEQ[s.ranks.length-1]+' '+this.nm(s,i)+' về '+['nhất','nhì','ba'][s.ranks.length-1]+'!','win',now);
      if(s.ranks.length===1) s.say={ i, t:tlSay(TL_SAY.win), ts:now }; }
    const left=s.P.map((p,j)=>j).filter(j=>s.hand[j].length);
    if(left.length<=1){ this.finish(s, s.ranks, now); return true; }
    const nx=this.next(s, i, i); if(nx.nr) this.newRound(s, nx.turn, now);
    this.setTurn(s, nx.turn, now); return true;
  },
  finish(s, ranks, now, why){
    const n=s.P.length; let full=[...ranks, ...s.P.map((p,i)=>i).filter(i=>!ranks.includes(i))];
    const cong=s.cong.filter(i=>full.includes(i)); full=[...full.filter(i=>!cong.includes(i)), ...cong];
    const notes=s.P.map((p,i)=>s.game[i]>0?'Chặt +'+s.game[i]+' ':s.game[i]<0?'Bị chặt '+s.game[i]+' ':'');
    if(!why){
      const pts=TL_PTS[n]||TL_PTS[4]; full.forEach((i,k)=>{ s.game[i]+=pts[Math.min(k,pts.length-1)]; });
      cong.forEach(i=>{ s.game[i]-=3; s.game[full[0]]+=3; notes[i]+='Cóng −3 '; });
      const last=full[n-1];
      if(!cong.includes(last)){
        const th=tlHeoPts(s.hand[last]); if(th){ s.game[last]-=th; s.game[full[0]]+=th; notes[last]+='Thối heo −'+th+' '; }
        const tb=this.bombs(s.hand[last]); if(tb.pts){ s.game[last]-=tb.pts; s.game[full[0]]+=tb.pts; notes[last]+='Thối '+tb.names.join(', ')+' −'+tb.pts; }
      }
    } else { full.forEach(i=>{ notes[i] = i===full[0] ? (why.split('— ')[1]||'') : 'Tới trắng '+s.game[i]; }); }
    s.res=full.map((i,k)=>({ i, rank:why?(k?2:1):k+1, pts:s.game[i], note:notes[i] }));
    full.forEach(i=>{ s.sc[i]+=s.game[i]; }); s.wins[full[0]]++; s.lastW=full[0];
    s.turn=-1; TGU.log(s, why || '🏆 '+this.nm(s,full[0])+' thắng ván!', 'big', now);
    TGU.phase(s,'res',0,now);
  },
  pick(s, i, hint){
    const hand=s.hand[i], pile=s.pile; if(!hand.length) return null;
    if(tlBeat(pile,hand).ok && tlType(hand) && (!s.must||hand.includes(s.must))) return hand.slice();
    const cand=tlCombos(hand).filter(c=>tlBeat(pile,c).ok && (!s.must||c.includes(s.must)));
    if(!cand.length) return null;
    const bomb=c=>{ const t=tlType(c); return t.t==='quad'||t.t==='pairseq'; }, has2=c=>c.some(x=>tlRk(x)===TL_TWO);
    const cost=c=>tlType(c).top+(has2(c)?40:0)+(bomb(c)?60:0);
    if(!pile.length){ const low=hand[0], wl=cand.filter(c=>c.includes(low)&&!bomb(c)), nb=cand.filter(c=>!bomb(c));
      const pool=wl.length?wl:nb.length?nb:cand; pool.sort((a,b)=>(b.length-a.length)||cost(a)-cost(b)); return pool[0]; }
    cand.sort((a,b)=>cost(a)-cost(b)); const best=cand[0], P=tlType(pile);
    // còn bài nhiều thì giữ heo / bom, trừ khi đối thủ sắp hết bài
    const danger=s.hand.some((h,j)=>j!==i && h.length && h.length<=3);
    if(!hint && !danger && (has2(best)||bomb(best)) && hand.length-best.length>4 && P.rk!==TL_TWO && Math.random()<.6) return null;
    return best;
  },
  tick(s, now, rng){
    if(s.hold && now < s.hold) return false;
    if(s.ph==='play' && s.pile.length && (tlType(s.pile).rk===TL_TWO || s.chop)){
      for(let j=0;j<s.P.length;j++){ if(!s.P[j].bot || j===s.turn) continue; const o=this.ngangOpts(s,j); if(o.length && rng()<.2) return this.act(s,j,{t:'play',c:o[0]},now); }
    }
    if(s.ph==='play'){
      const i=s.turn; if(i<0) return false; const p=s.P[i];
      if(p.bot && TGU.bot(s,i,now,rng,900,2200)){ const c=this.pick(s,i,false); if(c && this.act(s,i,{t:'play',c},now)) return true; return this.act(s,i,{t:'pass'},now) || this.act(s,i,{t:'play',c:[s.must||s.hand[i][0]]},now); }
      if(s.dl && now>=s.dl){ if(s.pile.length) return this.act(s,i,{t:'pass'},now); return this.act(s,i,{t:'play',c:[s.must||s.hand[i][0]]},now); }
      return false;
    }
    return false;
  },
  turn: s => s.ph==='play' ? s.turn : -1,
  label: s => 'Ván '+s.gn+'/'+s.rounds,
  score: (s,i) => (s.sc[i]>0?'+':'')+s.sc[i]+' đ',
  badge(s,i){ if(s.ph==='res'){ const r=s.res.find(x=>x.i===i); return r ? TL_SEQ[r.rank-1]+' '+(r.pts>0?'+':'')+r.pts : ''; }
    const n=s.hand[i].length; return n ? '🂠 '+n+(s.pass[i]?' · bỏ':'') : TL_SEQ[s.ranks.indexOf(i)]||'✅'; },
  result: s => TGU.rank(s.sc, true, (v,i)=>(v>0?'+':'')+v+' điểm · '+s.wins[i]+' ván nhất'),
  status(s, me, now){
    const RK=['🥇','🥈','🥉','😿'];
    if(s.ph==='res'){
      if(s.log && now-s.log.ts < 6500 && s.log.k==='big') return { txt: escH(s.log.txt), cls:'big' };
      return { txt: s.res.map(r=>`<b>${RK[Math.min(r.rank-1,3)]} ${escH(this.nm(s,r.i))}</b>`).join(' · '), cls:'win' };
    }
    if(s.hold && now < s.hold) return { txt:'🃏 <b>Đang chia bài…</b>', cls:'' };
    const fresh = s.log && now-s.log.ts < 4500, big = fresh && ['big','win','lose'].includes(s.log.k);
    if(s.ph==='play' && s.turn===me && !big) return { txt:'✋ <b>Tới lượt bạn!</b>', cls:'me' };
    if(fresh) return { txt: escH(s.log.txt), cls: s.log.k||'' };
    if(s.ph==='play' && s.turn>=0) return { txt:'⏳ Lượt của <b>'+escH(this.nm(s,s.turn))+'</b>', cls:'' };
    return null;
  },
  // chủ phòng dừng giữa chừng: chốt điểm các ván đã chơi xong
  partial(s){ const done = s.ph==='res' ? s.gn : s.gn-1; if(done<1) return null;
    return { rows:TGU.rank(s.sc, true, (v,i)=>(v>0?'+':'')+v+' điểm · '+s.wins[i]+' ván nhất'), note:'⏹ Dừng sau '+done+'/'+s.rounds+' ván' }; },
  // các kiểu xếp bài trên tay (chỉ đổi thứ tự hiển thị)
  SORTS: ['Theo số','Theo chất','Theo bộ'],
  arrange(hand, mode){
    const h=tlSort(hand.slice()); const rk=c=>tlV(c)>>2, su=c=>TL_S.indexOf(c.slice(-1));
    if(mode===1) return h.sort((a,b)=>su(a)-su(b)||tlV(a)-tlV(b));
    if(mode!==2) return h;
    // theo bộ: sảnh dài nhất → tứ quý/ba/đôi → bài lẻ
    const by={}; h.forEach(c=>(by[rk(c)]=by[rk(c)]||[]).push(c));
    const rs=Object.keys(by).map(Number).filter(r=>r!==TL_TWO).sort((a,b)=>a-b);
    let best=[], cur=[]; rs.forEach(r=>{ cur = cur.length && r===cur[cur.length-1]+1 ? cur.concat(r) : [r]; if(cur.length>best.length) best=cur; });
    const out=[], used=new Set();
    if(best.length>=3) best.forEach(r=>{ const c=by[r].find(x=>!used.has(x)); used.add(c); out.push(c); });
    const left=h.filter(c=>!used.has(c)), g={}; left.forEach(c=>(g[rk(c)]=g[rk(c)]||[]).push(c));
    Object.values(g).filter(x=>x.length>=2).sort((a,b)=>b.length-a.length||rk(a[0])-rk(b[0])).forEach(x=>x.forEach(c=>{ used.add(c); out.push(c); }));
    return out.concat(h.filter(c=>!used.has(c)));
  },
  apOn(){ try{ return localStorage.getItem('tl_ap')==='1'; }catch(e){ return false; } },
  ui(v, ui, s, me, send){
    ui.sel = (ui.sel||[]).filter(c=>me>=0 && s.hand[me].includes(c));
    if(v.k==='c'){
      const my = s.ph==='play' && s.turn===me;
      if(my && s.pile.length){
        const cand=this.cands(s, me, v.c);
        if(cand.length){
          const k = ui.tapC===v.c ? (ui.tapK||0)+1 : 0;
          if(k>=cand.length){ ui.sel=[]; ui.tapC=null; return; }       // chạm hết vòng → bỏ chọn
          ui.sel=cand[k].slice(); ui.tapC=v.c; ui.tapK=k; ui.tapN=cand.length; return;
        }
      }
      ui.tapC=null; const k=ui.sel.indexOf(v.c); if(k>=0) ui.sel.splice(k,1); else ui.sel.push(v.c); }
    else if(v.k==='ngang'){ const o=this.ngangOpts(s, me); if(o.length) send({ t:'play', c:o[0] }); }
    else if(v.k==='ap'){ ui.ap=!this.apOn(); try{ localStorage.setItem('tl_ap', ui.ap?'1':'0'); }catch(e){} toast(ui.ap?'🤖 Tự bỏ lượt: BẬT — vòng nào không chặn được sẽ tự bỏ':'🤖 Tự bỏ lượt: TẮT'); }
    else if(v.k==='clr'){ ui.sel=[]; ui.tapC=null; }
    else if(v.k==='sort'){ ui.sort=((ui.sort||0)+1)%3; toast('🔀 Xếp bài: '+this.SORTS[ui.sort]); }
    else if(v.k==='hint'){ ui.tapC=null; const p=this.pick(s, me, true); if(p) ui.sel=p.slice(); else toast('🤔 Không có bài chặn được — bỏ lượt thôi'); }
    else if(v.k==='next'){ send({ t:'next' }); }
    else if(v.k==='end'){ send({ t:'end' }); }
  },
  prep(a, ui, s, me){
    if(a.t!=='play') { ui.sel=[]; return a; }
    const cards=(ui.sel||[]).slice(), err=this.check(s, me, cards); if(err){ toast('⚠️ '+err); return null; }
    ui.sel=[]; ui.tapC=null; return { t:'play', c:cards };
  },
  after(s, me, ui, body, send){
    if(!send || me<0 || s.ph!=='play' || s.turn!==me || !s.pile.length || !this.apOn()) return;
    const key=s.gn+'|'+s.pileBy+'|'+s.pile.join('');
    if(ui.apKey===key || this.plays(s, me).length) return;
    ui.apKey=key; setTimeout(()=>send({ t:'pass' }), 900);
  },
  ownSeats: true,
  noBanner: true,      // tự vẽ ghế quanh bàn → ẩn dải người chơi phía trên
  // vị trí quanh bàn: mình ở dưới, người đánh kế tiếp ở bên phải (đi ngược chiều kim đồng hồ)
  spot(n, o){ return n===2 ? ['b','t'][o] : n===3 ? ['b','r','l'][o] : ['b','r','t','l'][o]; },
  seat(s, i, me, base, now, dealE, dStep, N){
    now = now || Date.now(); dStep=dStep||40; N=N||s.P.length;
    const p=s.P[i], n=s.hand[i].length, turn=s.ph==='play' && s.turn===i, rk=s.ranks.indexOf(i), res=s.ph==='res' ? s.res.find(r=>r.i===i) : null;
    const pos=this.spot(s.P.length, (i-base+s.P.length)%s.P.length);
    let st = res ? `<b class="${res.pts>0?'up':res.pts<0?'dn':''}">${TL_SEQ[res.rank-1]||''} ${res.pts>0?'+':''}${res.pts}</b>`
      : rk>=0 ? `<b class="up">${TL_SEQ[rk]} Về ${['nhất','nhì','ba'][rk]||''}</b>`
      : turn ? '<b class="go">✍️ Đang đánh</b>' : s.pass[i] && s.pile.length ? '<b class="ps">⏭ Bỏ lượt</b>' : '';
    let cards='';
    if(pos!=='b'){
      if(s.ph==='res' && n) cards=`<div class="tl4-open">${s.hand[i].map(c=>tlCardH(c,'xs')).join('')}</div>`;
      else if(n){ const cap=pos==='t'?13:8;
        let reveal=n; if(dealE<9999) reveal=Math.max(0,Math.min(n,Math.floor((dealE/dStep - i)/N)+1));
        const show=Math.min(reveal,cap);
        const backs=[...Array(show)].map((_,k)=>{ const o=i+k*N, de=dealE-o*dStep; return de>=0&&de<420 ? `<span class="pc back xs dealin" style="animation-delay:${-Math.max(0,de)}ms"></span>` : '<span class="pc back xs"></span>'; }).join('');
        cards=`<div class="tl4-fan">${backs}</div><em class="tl4-n${reveal<=2&&reveal>0?' warn':''}">${reveal} lá</em>`; }
    }
    const passB = s.passed && s.passed.i===i && now-s.passed.ts<2600 ? s.passed.t : '';
    const chatT = TGU.chat ? TGU.chat(p.id) : '';
    const say = passB ? `<div class="tl4-bubble pass" style="animation-delay:-${now-s.passed.ts}ms">${escH(passB)}</div>` : chatT ? `<div class="tl4-bubble chat">${escH(chatT)}</div>` : '';
    const winner = s.ph==='res' && s.res && s.res[0] && s.res[0].i===i;
    const king = winner ? '<span class="tl4-king drop">👑</span>' : (s.gn>1 && s.lastW===i && s.ph==='play' ? '<span class="tl4-king">👑</span>' : '');
    return `<div class="tl4-z z-${pos}${turn?' turn':''}${i===me?' me':''}${s.pass[i]&&s.pile.length&&!turn?' passed':''}${rk>=0?' done':''}${king?' king':''}${winner?' winner':''}" style="--pc:${TL_COL[i%TL_COL.length]}">${say}
      <div class="tl4-av">${king}${escH(p.a)}${TGU.emo?TGU.emo(p.id):''}</div>
      <div class="tl4-info"><span class="tl4-nm">${escH(p.n)}</span>${st?`<span class="tl4-st">${st}</span>`:''}</div>${cards}</div>`;
  },
  view(s, me, ui, now){
    now = now || Date.now();
    const sel=(ui.sel||[]).filter(c=>me>=0 && s.hand[me].includes(c)); ui.sel=sel;
    const base = me>=0 ? me : 0, pt=tlType(s.pile);
    if(ui.dealKey!==s.gn){ ui.dealKey=s.gn; ui.dealAt=Date.now(); }
    const N=s.P.length, dStep=Math.max(24, Math.round(1900/(N*13)));
    const dealE = Date.now()-(ui.dealAt||0), dealTot=(N*13)*dStep+420, dealing = dealE<dealTot;
    const shake = s.chop && ui.flyAt && Date.now()-ui.flyAt<700 && ui.flySig===s.gn+'|'+s.pileBy+'|'+s.pile.join('');
    let h='<div class="tlx tl4">';
    // bảng điểm (CSS đưa sang trái trên máy tính, thành dải ngang trên điện thoại)
    const order=s.P.map((p,i)=>i).sort((a,b)=>s.sc[b]-s.sc[a]), top=Math.max(...s.sc);
    h += '<div class="tl-scores"><div class="tl-sc-h">🏆 Điểm</div>'+order.map(i=>`<div class="tl-sc-r${i===me?' me':''}${s.sc[i]===top&&top>0?' lead':''}" style="--pc:${TL_COL[i%TL_COL.length]}"><span class="tl-sc-a">${escH(s.P[i].a)}</span><span class="tl-sc-n">${escH(s.P[i].n)}</span><b class="tl-sc-v">${(s.sc[i]>0?'+':'')+s.sc[i]}</b><small>${s.wins[i]}🥇</small></div>`).join('')+'</div>';
    h += `<div class="tl4-table${shake?' chopped':''}">`;
    if(s.ph==='play' && !s.pile.length) h += '<div class="tl4-wm">TIẾN LÊN</div>';
    s.P.forEach((p,i)=>{ h += this.seat(s, i, me, base, now, dealing?dealE:9999, dStep, N); });
    if(dealing && dealE<dealTot-150 && s.ph==='play') h += `<div class="tl4-deck" style="opacity:${Math.max(0,1-dealE/dealTot)};transform:translate(-50%,-50%) scale(${Math.max(.55,1.3-dealE/dealTot)})">${'<span class="pc back"></span>'.repeat(6)}</div>`;
    h += '<div class="tl4-mid">';
    if(s.ph==='res'){
      h += '<div class="tl4-confetti">'+[...Array(16)].map((_,k)=>`<i style="--x:${(k*6.3-5).toFixed(0)}%;--d:${(k%5)*.15}s;--c:${TL_COL[k%TL_COL.length]}"></i>`).join('')+'</div>';
      h += '<div class="tl-res">'+s.res.map(r=>`<div class="tl-rr${r.i===me?' me':''}"><span>${TL_SEQ[r.rank-1]||r.rank}</span><b>${escH(this.nm(s,r.i))}</b><em class="${r.pts>0?'up':r.pts<0?'dn':''}">${r.pts>0?'+':''}${r.pts}</em><small>${escH(r.note||'')}</small></div>`).join('')+'</div>';
      let host=false; try{ host = typeof ARC!=='undefined' && ARC._t && ARC._t.host(); }catch(e){}
      if(host && !s.over) h += `<div class="tl-res-ctl"><button class="tbtn green big" data-ui='{"k":"next"}'>🔄 Ván mới</button><button class="tbtn gray big" data-ui='{"k":"end"}'>🏁 Kết thúc trận</button></div>`;
      else if(s.over) h += `<div class="tl-res-ctl"><div class="tl-champ">🏆 ${escH(this.nm(s,s.sc.indexOf(Math.max(...s.sc))))} vô địch!</div></div>`;
      else h += `<div class="tl-res-ctl"><div class="tl-wait">⏳ Chờ chủ phòng chia ván mới…</div></div>`;
    } else if(s.pile.length){
      const sig=s.gn+'|'+s.pileBy+'|'+s.pile.join(''), nowMs=Date.now();
      if(ui.flySig!==sig){ ui.flySig=sig; ui.flyAt=nowMs; }
      const el=nowMs-(ui.flyAt||0), from=this.spot(s.P.length, (s.pileBy-base+s.P.length)%s.P.length);
      const fly = el<600 ? ` fly fly-${from}${s.chop?' chop':''}" style="animation-delay:-${el}ms` : '';
      h += `<div class="tl-pile"><div class="pcs tl-pc${fly}">${s.pile.map(c=>tlCardH(c,'')).join('')}</div></div>`;
    } else {
      h += `<div class="tl-pile empty">${s.must && s.ph==='play' ? 'Phải đánh có lá <b>'+s.must+'</b>' : ''}</div>`;
    }
    if(s.say && now-s.say.ts < 2600) h += `<div class="tl4-pop" style="--pc:${TL_COL[s.say.i%TL_COL.length]};animation-delay:-${now-s.say.ts}ms">${escH(s.say.t)}</div>`;
    h += `</div></div>`;
    if(me<0) return h+'<div class="bg-msg">👀 Bạn đang xem</div></div>';
    const hand=this.arrange(s.hand[me], ui.sort||0), my=s.ph==='play' && s.turn===me;
    const plays = my ? this.plays(s, me) : [], ok1 = new Set(); plays.forEach(x=>x.forEach(c=>ok1.add(c)));
    const ngo = this.ngangOpts(s, me);
    if(hand.length){
      h += `<div class="tl-hand flat${my?' my':''}">${hand.map((c,k)=>{ const dim=my&&s.pile.length&&!ok1.has(c)?' dim':''; const o=me+k*N;
        if(dealing && dealE < o*dStep) return '';
        const de=dealing?(dealE-o*dStep):9999;
        const card = de<420 ? `<span class="pc lg dealin${sel.includes(c)?' sel':''}${tlRed(c)?' red':''}" style="animation-delay:${-Math.max(0,de)}ms">${tlPcInner(c)}</span>` : tlCardH(c,'lg',sel.includes(c));
        return `<span class="tl-card${dim}" data-ui='${JSON.stringify({k:'c',c})}' style="z-index:${k}">${card}</span>`; }).join('')}</div>`;
      if(s.ph==='play'){
        const t=tlType(sel), ok=my && !this.check(s, me, sel);
        const tap = ui.tapC && ui.tapN>1 && sel.length ? ` <small class="tl-tap">bộ ${ui.tapK+1}/${ui.tapN} · chạm lá đó lần nữa để đổi</small>` : '';
        h += `<div class="bg-msg">${my ? (sel.length ? (t?tlName(t)+(ok?' ✅':' — không chặn được'):'❌ Không thành bộ')+tap : s.pile.length && !plays.length ? '😕 Không có bài chặn được — bỏ lượt thôi'+(this.apOn()?' (đang tự bỏ…)':'') : '👉 Tới lượt bạn! Chạm 1 lá để tự chọn bộ') : '⏳ '+escH(this.nm(s,s.turn))+' đang đánh…'}</div>`;
        if(ngo.length) h += `<div class="bg-ctl c"><button class="tbtn big red tl-ngang" data-ui='{"k":"ngang"}'>💥 CHẶT NGANG bằng 4 đôi thông!</button></div>`;
        if(my){
          h += `<div class="tl-util"><button class="util ${this.apOn()?'on':''}" data-ui='{"k":"ap"}' title="Tự bỏ những vòng không chặn được">🤖 Tự bỏ: ${this.apOn()?'Bật':'Tắt'}</button><button class="util" data-ui='{"k":"sort"}' title="Đổi cách xếp bài">🔀 ${this.SORTS[ui.sort||0]}</button><button class="util" data-ui='{"k":"hint"}'>💡 Gợi ý</button>${sel.length?`<button class="util" data-ui='{"k":"clr"}'>✖ Bỏ chọn</button>`:''}</div>`;
          h += `<div class="tl-main">${s.pile.length?TGU.btn({t:'pass'},'⏭ Bỏ lượt','gray big pass'):''}${TGU.btn({t:'play'},'🃏 ĐÁNH BÀI','green big play',!ok)}</div>`;
        } else h += `<div class="tl-util"><button class="util" data-ui='{"k":"sort"}'>🔀 ${this.SORTS[ui.sort||0]}</button></div>`;
      }
    } else if(s.ph==='play') h += `<div class="bg-msg win">${TL_SEQ[s.ranks.indexOf(me)]||'✅'} Bạn đã hết bài — chờ ván kết thúc</div>`;
    return h+'</div>';
  }
};

/* ---------- ⚔️ CARO (Gomoku) ---------- */
const GM_DIR=[[0,1],[1,0],[1,1],[1,-1]];
const GM = {
  at:(b,n,r,c)=> r<0||c<0||r>=n||c>=n ? '#' : b[r*n+c],
  // dài nhất qua ô k cho quân p + số đầu bị chặn
  line(b,n,k,p,dr,dc){ const r=Math.floor(k/n), c=k%n; let len=1, ends=0, cells=[k];
    for(const sg of [1,-1]){ let rr=r+dr*sg, cc=c+dc*sg; while(GM.at(b,n,rr,cc)===p){ len++; cells.push(rr*n+cc); rr+=dr*sg; cc+=dc*sg; } if(GM.at(b,n,rr,cc)!=='.') ends++; }
    return { len, ends, cells }; },
  win(b,n,k,p,block){ for(const [dr,dc] of GM_DIR){ const L=GM.line(b,n,k,p,dr,dc); if(L.len>=5 && !(block && L.ends===2)) return L.cells; } return null; },
  val(len, ends){ if(len>=5) return 1e6; if(ends===2) return 0; return [0,[10,2],[300,50],[5000,500],[100000,12000]][len][ends]||0; },
  score(b,n,k,p){ let v=0; for(const [dr,dc] of GM_DIR){ const L=GM.line(b,n,k,p,dr,dc); v+=GM.val(Math.min(L.len,5), L.len>=5?0:L.ends); } return v; },
  best(b,n,p,rng){ const o=p==='x'?'o':'x'; let best=-1, bk=-1, any=false;
    for(let k=0;k<n*n;k++){ if(b[k]!=='.') continue; const r=Math.floor(k/n), c=k%n; let near=false;
      for(let dr=-2;dr<=2&&!near;dr++) for(let dc=-2;dc<=2;dc++){ const x=GM.at(b,n,r+dr,c+dc); if(x==='x'||x==='o'){ near=true; break; } }
      if(!near) continue; any=true;
      const sb=b.slice(0,k)+p+b.slice(k+1), so=b.slice(0,k)+o+b.slice(k+1);
      const v=GM.score(sb,n,k,p)*1.1 + GM.score(so,n,k,o) + rng()*5; if(v>best){ best=v; bk=k; } }
    return any ? bk : Math.floor(n/2)*n+Math.floor(n/2); },
};
TG.gomoku = {
  per:{ sc:0 },
  about:'Hai người lần lượt đặt quân X / O. Ai có 5 quân liền hàng (ngang, dọc, chéo) trước thắng ván. Có thể bật luật chặn 2 đầu. Thắng đủ số ván đã chọn là vô địch; mỗi ván đổi người đi trước.',
  init(P, set, rng, now){ const s={ P, sc:P.map(()=>0), n:set.size||20, block:set.block?1:0, target:set.target||2, tmr:set.tmr==null?30:set.tmr, gn:0, first:Math.floor(rng()*2) }; this.ng(s, now); return s; },
  ng(s, now){ s.gn++; s.b='.'.repeat(s.n*s.n); s.last=-1; s.wl=[]; s.mv=0; s.first=1-s.first; s.wnr=-1; TGU.phase(s,'play',0,now); this.setTurn(s, s.first, now); },
  sym: i => i===0?'x':'o',
  setTurn(s,i,now){ s.turn=i; s.dl=s.tmr?now+s.tmr*1000:0; s.dlLen=s.tmr*1000; s.bt={}; },
  act(s,i,a,now){
    if(s.ph!=='play' || s.turn!==i || a.t!=='mv') return false;
    const k=+a.k; if(!(k>=0 && k<s.n*s.n) || s.b[k]!=='.') return false;
    const p=this.sym(i); s.b=s.b.slice(0,k)+p+s.b.slice(k+1); s.last=k; s.mv++;
    const w=GM.win(s.b, s.n, k, p, s.block);
    if(w){ s.wl=w; s.wnr=i; s.sc[i]++; TGU.log(s,'🎉 '+s.P[i].n+' thắng ván '+s.gn+'!','win',now); TGU.phase(s,'res',4000,now); s.turn=-1; return true; }
    if(s.mv>=s.n*s.n){ TGU.log(s,'🤝 Hòa — kín bàn!','',now); TGU.phase(s,'res',3000,now); s.turn=-1; return true; }
    this.setTurn(s, 1-i, now); return true;
  },
  tick(s, now, rng){
    if(s.ph==='play'){ const i=s.turn, p=s.P[i];
      if(p.bot && TGU.bot(s,i,now,rng,500,1300)) return this.act(s,i,{t:'mv',k:GM.best(s.b,s.n,this.sym(i),rng)},now);
      if(s.dl && now>=s.dl){ TGU.log(s,'⏰ '+p.n+' hết giờ — máy đánh hộ','',now); return this.act(s,i,{t:'mv',k:GM.best(s.b,s.n,this.sym(i),rng)},now); }
      return false; }
    if(s.ph==='res' && now>=s.dl){
      if(Math.max(...s.sc)>=s.target){ s.over=1; s.dl=0; const w=s.sc.indexOf(Math.max(...s.sc)); TGU.log(s,'🏆 '+s.P[w].n+' vô địch Caro!','big',now); return true; }
      this.ng(s, now); return true; }
    return false;
  },
  turn: s => s.ph==='play' ? s.turn : -1,
  label: s => 'Ván '+s.gn+' · thắng '+s.target+' ván là vô địch'+(s.block?' · chặn 2 đầu':''),
  score: (s,i) => (i===0?'❌ ':'⭕ ')+s.sc[i],
  badge: (s,i) => s.ph==='play' && s.turn===i ? '✍️ Đang đi' : s.wnr===i ? '🎉 Thắng' : '',
  result: s => TGU.rank(s.sc, true, v=>v+' ván thắng'),
  view(s, me){
    const n=s.n, wl=new Set(s.wl), my=s.ph==='play' && s.turn===me;
    let h=`<div class="gmk"><div class="bg-msg">${s.ph==='play' ? (my?'👉 Tới lượt bạn ('+(me===0?'❌':'⭕')+')':'⏳ '+escH(s.P[s.turn].n)+' đang nghĩ…') : s.wnr>=0 ? '🎉 '+escH(s.P[s.wnr].n)+' thắng ván!' : '🤝 Hòa'}</div>`;
    h += `<div class="gm-b${my?' my':''}" style="--n:${n}">`;
    for(let k=0;k<n*n;k++){ const v=s.b[k];
      h += v==='.' ? (my?`<i data-act='{"t":"mv","k":${k}}'></i>`:'<i></i>') : `<i class="${v}${k===s.last?' last':''}${wl.has(k)?' w':''}">${v==='x'?'✕':'◯'}</i>`; }
    return h+'</div></div>';
  }
};

/* ---------- 🀄 CỜ TƯỚNG ---------- */
const XQ = {
  START: 'rnbakabnr'+'.........'+'.c.....c.'+'p.p.p.p.p'+'.........'+'.........'+'P.P.P.P.P'+'.C.....C.'+'.........'+'RNBAKABNR',
  red: ch => ch>='A' && ch<='Z', side: ch => ch==='.'?'':(ch>='A'&&ch<='Z'?'r':'b'),
  NAME: { K:'帥',A:'仕',B:'相',N:'傌',R:'俥',C:'炮',P:'兵', k:'將',a:'士',b:'象',n:'馬',r:'車',c:'砲',p:'卒' },
  VN: { k:'Tướng',a:'Sĩ',b:'Tượng',n:'Mã',r:'Xe',c:'Pháo',p:'Tốt' },
  VAL: { k:10000,a:200,b:200,n:400,r:900,c:450,p:100 },
  inPal: (r,c,sd) => c>=3 && c<=5 && (sd==='r' ? r>=7 : r<=2),
  // nước đi giả hợp lệ (chưa xét tự chiếu) của quân ở ô k
  pmoves(b, k){
    const ch=b[k], sd=XQ.side(ch), t=ch.toLowerCase(), r=Math.floor(k/9), c=k%9, out=[];
    const own=x=>XQ.side(x)===sd, add=(rr,cc)=>{ if(rr<0||rr>9||cc<0||cc>8) return; const x=b[rr*9+cc]; if(!own(x)) out.push(rr*9+cc); };
    const at=(rr,cc)=> rr<0||rr>9||cc<0||cc>8 ? '#' : b[rr*9+cc];
    if(t==='k'){ [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{ if(XQ.inPal(r+dr,c+dc,sd)) add(r+dr,c+dc); }); }
    else if(t==='a'){ [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc])=>{ if(XQ.inPal(r+dr,c+dc,sd)) add(r+dr,c+dc); }); }
    else if(t==='b'){ [[2,2],[2,-2],[-2,2],[-2,-2]].forEach(([dr,dc])=>{ const rr=r+dr, cc=c+dc; if(sd==='r'?rr<5:rr>4) return; if(at(r+dr/2,c+dc/2)==='.') add(rr,cc); }); }
    else if(t==='n'){ [[2,1,1,0],[2,-1,1,0],[-2,1,-1,0],[-2,-1,-1,0],[1,2,0,1],[-1,2,0,1],[1,-2,0,-1],[-1,-2,0,-1]].forEach(([dr,dc,lr,lc])=>{ if(at(r+lr,c+lc)==='.') add(r+dr,c+dc); }); }
    else if(t==='r'||t==='c'){ [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{ let rr=r+dr, cc=c+dc, jumped=false;
        while(at(rr,cc)!=='#'){ const x=at(rr,cc);
          if(t==='r'){ if(x==='.') add(rr,cc); else { if(!own(x)) add(rr,cc); break; } }
          else if(!jumped){ if(x==='.') add(rr,cc); else jumped=true; }
          else if(x!=='.'){ if(!own(x)) add(rr,cc); break; }
          rr+=dr; cc+=dc; } }); }
    else if(t==='p'){ const f=sd==='r'?-1:1; add(r+f,c); if(sd==='r'?r<=4:r>=5){ add(r,c-1); add(r,c+1); } }
    return out;
  },
  mv: (b,f,t) => { const a=b.split(''); a[t]=a[f]; a[f]='.'; return a.join(''); },
  king: (b,sd) => b.indexOf(sd==='r'?'K':'k'),
  attacked(b, sd){ // tướng phe sd đang bị chiếu?
    const kk=XQ.king(b,sd); if(kk<0) return true; const ok=XQ.king(b, sd==='r'?'b':'r');
    if(ok>=0 && ok%9===kk%9){ let clear=true; for(let x=Math.min(kk,ok)+9;x<Math.max(kk,ok);x+=9) if(b[x]!=='.'){ clear=false; break; } if(clear) return true; }
    for(let k=0;k<90;k++){ const x=b[k]; if(x==='.'||XQ.side(x)===sd) continue; if(XQ.pmoves(b,k).includes(kk)) return true; }
    return false; },
  legal(b, sd){ const out=[]; for(let k=0;k<90;k++){ if(XQ.side(b[k])!==sd) continue; XQ.pmoves(b,k).forEach(t=>{ if(!XQ.attacked(XQ.mv(b,k,t), sd)) out.push([k,t]); }); } return out; },
  eval(b){ let v=0; for(let k=0;k<90;k++){ const x=b[k]; if(x==='.') continue; const t=x.toLowerCase(), r=Math.floor(k/9), c=k%9, rd=XQ.red(x);
      let p=XQ.VAL[t]; if(t==='p' && (rd?r<=4:r>=5)) p += 90 - Math.abs(c-4)*10; if(t==='n'||t==='c') p += 12-Math.abs(c-4)*3; v += rd?p:-p; } return v; },
  search(b, sd, d, al, be){
    if(d===0) return (sd==='r'?1:-1)*XQ.eval(b);
    let best=-1e9; const ms=[];
    for(let k=0;k<90;k++){ if(XQ.side(b[k])!==sd) continue; XQ.pmoves(b,k).forEach(t=>ms.push([k,t, b[t]==='.'?0:XQ.VAL[b[t].toLowerCase()]])); }
    ms.sort((x,y)=>y[2]-x[2]);
    for(const [f,t,cap] of ms){ if(cap>=10000) return 1e6+d; const v=-XQ.search(XQ.mv(b,f,t), sd==='r'?'b':'r', d-1, -be, -al); if(v>best) best=v; if(v>al) al=v; if(al>=be) break; }
    return best; },
  best(b, sd, level, rng){ const ms=XQ.legal(b, sd); if(!ms.length) return null; let best=-1e9, bm=ms[0];
    const d=Math.max(1,Math.min(3,level)); TGU.shuffle(ms, rng);
    for(const [f,t] of ms){ const v=-XQ.search(XQ.mv(b,f,t), sd==='r'?'b':'r', d-1, -1e9, 1e9) + (level<2?rng()*120:rng()*8); if(v>best){ best=v; bm=[f,t]; } }
    return bm; },
};
TG.cotuong = {
  per:{ sc:0 },
  about:'Cờ Tướng đầy đủ luật: Tướng không được đối mặt, không được tự để bị chiếu, Mã bị cản chân, Tượng bị cản mắt và không qua sông, Pháo ăn cách 1 quân. Chiếu bí hoặc hết nước là thua. Người cầm Đỏ đi trước.',
  init(P, set, rng, now){ const s={ P, sc:P.map(()=>0), level:set.level||2, tmr:set.tmr==null?60:set.tmr, b:XQ.START, mvn:0, last:'' , red:Math.floor(rng()*2) }; s.turn=s.red; TGU.phase(s,'play',0,now); this.setTurn(s,s.turn,now); s.chk=0; return s; },
  sd: (s,i) => i===s.red ? 'r' : 'b',
  setTurn(s,i,now){ s.turn=i; s.dl=s.tmr?now+s.tmr*1000:0; s.dlLen=s.tmr*1000; s.bt={}; },
  end(s, w, txt, now){ s.wnr=w; if(w>=0) s.sc[w]=1; s.over=1; s.dl=0; s.turn=-1; s.ph='res'; TGU.log(s, txt, 'big', now); return true; },
  act(s,i,a,now){
    if(s.ph!=='play' || s.over) return false;
    if(a.t==='resign') return this.end(s, 1-i, '🏳️ '+s.P[i].n+' xin thua — '+s.P[1-i].n+' thắng!', now);
    if(s.turn!==i || a.t!=='mv') return false;
    const sd=this.sd(s,i), f=+a.f, t=+a.t2;
    if(XQ.side(s.b[f])!==sd || !XQ.pmoves(s.b,f).includes(t)) return false;
    const nb=XQ.mv(s.b,f,t); if(XQ.attacked(nb, sd)) return false;
    const cap=s.b[t]; s.b=nb; s.last=f+'-'+t; s.mvn++;
    const op=1-i, osd=this.sd(s,op), chk=XQ.attacked(nb, osd); s.chk=chk?1:0;
    if(!XQ.legal(nb, osd).length) return this.end(s, i, (chk?'♚ CHIẾU BÍ! ':'🔒 Hết nước đi! ')+s.P[i].n+' thắng!', now);
    if(s.mvn>=300) return this.end(s, -1, '🤝 Hòa — quá 300 nước', now);
    if(chk) TGU.log(s,'⚠️ Chiếu tướng!','lose',now); else if(cap!=='.') TGU.log(s, s.P[i].n+' ăn '+XQ.VN[cap.toLowerCase()],'',now);
    this.setTurn(s, op, now); return true;
  },
  tick(s, now, rng){
    if(s.ph!=='play' || s.over) return false;
    const i=s.turn, p=s.P[i];
    if(p.bot && TGU.bot(s,i,now,rng,500,1200)){ const m=XQ.best(s.b, this.sd(s,i), s.level, rng); if(!m) return this.end(s,1-i,'🔒 Hết nước đi!',now); return this.act(s,i,{t:'mv',f:m[0],t2:m[1]},now); }
    if(s.dl && now>=s.dl) return this.end(s, 1-i, '⏰ '+p.n+' hết giờ — '+s.P[1-i].n+' thắng!', now);
    return false;
  },
  turn: s => s.ph==='play' ? s.turn : -1,
  label: s => 'Nước '+(s.mvn+1)+(s.chk?' · ⚠️ đang bị chiếu':''),
  score: (s,i) => i===s.red ? '🔴 Đỏ' : '⚫ Đen',
  badge: (s,i) => s.wnr===i ? '🏆 Thắng' : s.ph==='play' && s.turn===i ? '✍️ Đang đi' : '',
  result: s => s.P.map((p,i)=>({ i, rank: s.wnr===-1||s.wnr==null ? 1 : s.wnr===i ? 1 : 2, txt: s.wnr===i ? 'Thắng' : s.wnr===-1 ? 'Hòa' : 'Thua' })).sort((a,b)=>a.rank-b.rank),
  ui(v, ui, s, me, send){
    if(me<0 || s.turn!==me || s.ph!=='play') return;
    const sd=this.sd(s,me);
    if(ui.sel!=null && ui.sel!==v.k && (ui.mv||[]).includes(v.k)){ send({t:'mv',f:ui.sel,t2:v.k}); ui.sel=null; ui.mv=[]; return; }
    if(XQ.side(s.b[v.k])===sd){ ui.sel=v.k; ui.mv=XQ.pmoves(s.b,v.k).filter(t=>!XQ.attacked(XQ.mv(s.b,v.k,t),sd)); }
    else { ui.sel=null; ui.mv=[]; }
  },
  view(s, me, ui){
    const flip = me>=0 && this.sd(s,me)==='b', my = s.ph==='play' && s.turn===me;
    const mv=new Set(my?ui.mv||[]:[]), last=(s.last||'').split('-').map(Number);
    let h=`<div class="xq"><div class="bg-msg">${s.ph!=='play' ? '🏁 Ván đã kết thúc' : my ? '👉 Tới lượt bạn ('+(this.sd(s,me)==='r'?'🔴 Đỏ':'⚫ Đen')+')'+(s.chk?' — ⚠️ Đang bị chiếu!':'') : '⏳ '+escH(s.P[s.turn].n)+' đang nghĩ…'}</div>`;
    h += `<div class="xq-b${flip?' flip':''}"><div class="xq-river"><span>楚 河</span><span>漢 界</span></div>`;
    for(let k=0;k<90;k++){ const x=s.b[k], r=Math.floor(k/9), c=k%9, rr=flip?9-r:r, cc=flip?8-c:c;
      const cls=['xq-c']; if(x!=='.') cls.push('pc-'+XQ.side(x)); if(k===ui.sel && my) cls.push('sel'); if(mv.has(k)) cls.push('mv'); if(last.includes(k)) cls.push('last');
      if(x!=='.' && x.toLowerCase()==='k' && s.chk && XQ.side(x)===this.sd(s,s.turn)) cls.push('chk');
      h += `<i class="${cls.join(' ')}" style="--r:${rr};--c:${cc}" ${my?`data-ui='{"k":${k}}'`:''}>${x!=='.'?XQ.NAME[x]:''}</i>`; }
    h += '</div>';
    if(me>=0 && s.ph==='play') h += `<div class="bg-ctl c">${TGU.btn({t:'resign'},'🏳️ Xin thua','gray')}</div>`;
    return h+'</div>';
  }
};


/* ---------- ⚫ CỜ LẬT (Othello / Reversi) ---------- */
const OT = {
  D: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],
  // trọng số ô: góc rất quý, ô sát góc nguy hiểm
  W: [100,-20,10,5,5,10,-20,100, -20,-50,-2,-2,-2,-2,-50,-20, 10,-2,1,1,1,1,-2,10, 5,-2,1,0,0,1,-2,5,
      5,-2,1,0,0,1,-2,5, 10,-2,1,1,1,1,-2,10, -20,-50,-2,-2,-2,-2,-50,-20, 100,-20,10,5,5,10,-20,100],
  START: '.'.repeat(27)+'ox......xo'+'.'.repeat(27),
  flips(b, k, p){ if(b[k]!=='.') return []; const o=p==='x'?'o':'x', r=Math.floor(k/8), c=k%8, out=[];
    for(const [dr,dc] of OT.D){ const line=[]; let rr=r+dr, cc=c+dc;
      while(rr>=0&&rr<8&&cc>=0&&cc<8 && b[rr*8+cc]===o){ line.push(rr*8+cc); rr+=dr; cc+=dc; }
      if(line.length && rr>=0&&rr<8&&cc>=0&&cc<8 && b[rr*8+cc]===p) out.push(...line); }
    return out; },
  moves(b, p){ const m=[]; for(let k=0;k<64;k++) if(b[k]==='.' && OT.flips(b,k,p).length) m.push(k); return m; },
  play(b, k, p){ const a=b.split(''); a[k]=p; OT.flips(b,k,p).forEach(x=>a[x]=p); return a.join(''); },
  count: (b, p) => b.split('').filter(x=>x===p).length,
  eval(b, p){ const o=p==='x'?'o':'x'; let v=0; for(let k=0;k<64;k++){ if(b[k]===p) v+=OT.W[k]; else if(b[k]===o) v-=OT.W[k]; }
    return v + 5*(OT.moves(b,p).length-OT.moves(b,o).length); },
  search(b, p, d, al, be){
    const o=p==='x'?'o':'x', ms=OT.moves(b,p);
    if(!ms.length){ if(!OT.moves(b,o).length){ const diff=OT.count(b,p)-OT.count(b,o); return diff*1000; } return d? -OT.search(b,o,d-1,-be,-al) : OT.eval(b,p); }
    if(!d) return OT.eval(b,p);
    let best=-1e9; for(const k of ms){ const v=-OT.search(OT.play(b,k,p), o, d-1, -be, -al); if(v>best) best=v; if(v>al) al=v; if(al>=be) break; } return best; },
  best(b, p, level, rng){ const ms=OT.moves(b,p); if(!ms.length) return -1; const o=p==='x'?'o':'x';
    const d=[1,1,2,4][level]||2; let best=-1e9, bk=ms[0];
    TGU.shuffle(ms, rng).forEach(k=>{ const v=-OT.search(OT.play(b,k,p), o, d-1, -1e9, 1e9) + (level<2?rng()*60:rng()*2); if(v>best){ best=v; bk=k; } });
    return bk; },
};
TG.othello = {
  per:{ sc:0 },
  about:'Bàn 8×8, quân Đen đi trước. Đặt quân sao cho kẹp được quân đối thủ giữa 2 quân mình (ngang, dọc, chéo) — các quân bị kẹp lật sang màu mình. Không có nước hợp lệ thì mất lượt. Hết bàn ai nhiều quân hơn thắng ván.',
  init(P, set, rng, now){ const s={ P, sc:P.map(()=>0), target:set.target||2, level:set.level||2, tmr:set.tmr==null?30:set.tmr, gn:0, first:Math.floor(rng()*2) }; this.ng(s, now); return s; },
  ng(s, now){ s.gn++; s.b=OT.START; s.last=-1; s.fl=''; s.wnr=-1; s.first=1-s.first; TGU.phase(s,'play',0,now); this.setTurn(s, s.first, now);
    TGU.log(s, '⚫ Ván '+s.gn+' — '+s.P[s.first].n+' cầm Đen đi trước', '', now); },
  // người đi trước ván này cầm Đen (x)
  sym: (s,i) => i===s.first ? 'x' : 'o',
  setTurn(s,i,now){ s.turn=i; s.dl=s.tmr?now+s.tmr*1000:0; s.dlLen=s.tmr*1000; s.bt={}; },
  endGame(s, now){
    const cx=OT.count(s.b,'x'), co=OT.count(s.b,'o'), bi=s.first, wi=1-s.first;
    s.wnr = cx>co ? bi : co>cx ? wi : -1; if(s.wnr>=0) s.sc[s.wnr]++;
    TGU.log(s, s.wnr>=0 ? '🎉 '+s.P[s.wnr].n+' thắng ván '+s.gn+' ('+Math.max(cx,co)+'–'+Math.min(cx,co)+')' : '🤝 Hòa '+cx+'–'+co, s.wnr>=0?'win':'', now);
    s.turn=-1; TGU.phase(s,'res',4500,now); return true; },
  act(s,i,a,now){
    if(s.ph!=='play' || s.turn!==i || a.t!=='mv') return false;
    const k=+a.k, p=this.sym(s,i), f=OT.flips(s.b,k,p); if(!(k>=0&&k<64) || !f.length) return false;
    s.b=OT.play(s.b,k,p); s.last=k; s.fl=f.join(',');
    const j=1-i, q=this.sym(s,j);
    if(OT.moves(s.b,q).length){ this.setTurn(s,j,now); return true; }
    if(OT.moves(s.b,p).length){ TGU.log(s,'⏭ '+s.P[j].n+' không có nước đi — mất lượt','',now); this.setTurn(s,i,now); return true; }
    return this.endGame(s, now);
  },
  tick(s, now, rng){
    if(s.ph==='play'){ const i=s.turn, p=s.P[i];
      if(p.bot && TGU.bot(s,i,now,rng,600,1400)) return this.act(s,i,{t:'mv',k:OT.best(s.b,this.sym(s,i),s.level,rng)},now);
      if(s.dl && now>=s.dl){ TGU.log(s,'⏰ '+p.n+' hết giờ — máy đi hộ','',now); return this.act(s,i,{t:'mv',k:OT.best(s.b,this.sym(s,i),1,rng)},now); }
      return false; }
    if(s.ph==='res' && now>=s.dl){
      if(Math.max(...s.sc)>=s.target){ s.over=1; s.dl=0; const w=s.sc.indexOf(Math.max(...s.sc)); TGU.log(s,'🏆 '+s.P[w].n+' vô địch Cờ Lật!','big',now); return true; }
      this.ng(s, now); return true; }
    return false;
  },
  turn: s => s.ph==='play' ? s.turn : -1,
  label: s => 'Ván '+s.gn+' · thắng '+s.target+' ván là vô địch',
  score(s,i){ const p=this.sym(s,i); return (p==='x'?'⚫ ':'⚪ ')+OT.count(s.b,p); },
  badge: (s,i) => s.ph==='play' && s.turn===i ? '✍️ Đang đi' : (s.sc[i]?'🏅 '+s.sc[i]+' ván':''),
  result: s => TGU.rank(s.sc, true, v=>v+' ván thắng'),
  view(s, me){
    const my = s.ph==='play' && s.turn===me, mv = new Set(my ? OT.moves(s.b, this.sym(s,me)) : []), fl=new Set((s.fl||'').split(',').filter(x=>x).map(Number));
    const cx=OT.count(s.b,'x'), co=OT.count(s.b,'o');
    let h=`<div class="oth"><div class="oth-sc"><span class="${s.turn===s.first?'on':''}">⚫ ${cx}</span><span class="${s.turn===1-s.first?'on':''}">⚪ ${co}</span></div>`;
    h += `<div class="bg-msg">${s.ph==='play' ? (my ? '👉 Tới lượt bạn ('+(this.sym(s,me)==='x'?'⚫ Đen':'⚪ Trắng')+') — chọn ô có chấm' : '⏳ '+escH(s.P[s.turn].n)+' đang nghĩ…') : s.wnr>=0 ? '🎉 '+escH(s.P[s.wnr].n)+' thắng ván!' : '🤝 Hòa'}</div>`;
    h += '<div class="oth-b">';
    for(let k=0;k<64;k++){ const v=s.b[k];
      h += v==='.' ? (mv.has(k) ? `<i class="hint" data-act='{"t":"mv","k":${k}}'></i>` : '<i></i>')
                   : `<i><b class="${v}${k===s.last?' last':''}${fl.has(k)?' flip':''}"></b></i>`; }
    return h+'</div></div>';
  }
};

/* ---------- 🚢 BẮN TÀU (Battleship) ---------- */
const BT = {
  FLEET: { 8:[4,3,3,2,2], 10:[5,4,3,3,2] },
  NAMES: { 5:'Hàng không mẫu hạm', 4:'Tuần dương hạm', 3:'Khu trục hạm', 2:'Tàu tuần tra' },
  place(n, rng){ // xếp ngẫu nhiên, các tàu không chạm nhau
    for(let tries=0;tries<500;tries++){
      const occ=new Set(), ships=[]; let ok=true;
      for(const L of BT.FLEET[n]){ let placed=false;
        for(let g=0; g<200 && !placed; g++){ const hz=rng()<.5, r=Math.floor(rng()*(hz?n:n-L+1)), c=Math.floor(rng()*(hz?n-L+1:n)); const cells=[];
          for(let k=0;k<L;k++) cells.push(hz ? r*n+c+k : (r+k)*n+c);
          const bad=cells.some(x=>{ const rr=Math.floor(x/n), cc=x%n; for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){ const y=(rr+dr)*n+cc+dc; if(rr+dr>=0&&rr+dr<n&&cc+dc>=0&&cc+dc<n&&occ.has(y)) return true; } return false; });
          if(!bad){ cells.forEach(x=>occ.add(x)); ships.push(cells.join(',')); placed=true; } }
        if(!placed){ ok=false; break; } }
      if(ok) return ships;
    }
    return null; },
  cells: sh => sh.split(',').map(Number),
  sunk: (ship, shots) => BT.cells(ship).every(x=>shots[x]==='x'),
  // máy bắn: săn quanh ô trúng chưa chìm, không có thì bắn ô ca-rô ngẫu nhiên
  aim(shots, ships, n, rng){
    const hits=[]; for(let k=0;k<n*n;k++) if(shots[k]==='x' && !ships.some(s=>BT.cells(s).includes(k) && BT.sunk(s,shots))) hits.push(k);
    const free=k=>k>=0 && k<n*n && shots[k]==='.';
    if(hits.length){
      const cand=[];
      if(hits.length>=2){ const hz=Math.floor(hits[0]/n)===Math.floor(hits[1]/n);
        const line=hits.filter(h=>hz ? Math.floor(h/n)===Math.floor(hits[0]/n) : h%n===hits[0]%n).sort((a,b)=>a-b);
        const a=line[0], b=line[line.length-1];
        if(hz){ if(a%n>0 && free(a-1)) cand.push(a-1); if(b%n<n-1 && free(b+1)) cand.push(b+1); } else { if(free(a-n)) cand.push(a-n); if(free(b+n)) cand.push(b+n); } }
      if(!cand.length) hits.forEach(h=>{ const r=Math.floor(h/n), c=h%n; [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr,dc])=>{ if(r+dr>=0&&r+dr<n&&c+dc>=0&&c+dc<n&&free((r+dr)*n+c+dc)) cand.push((r+dr)*n+c+dc); }); });
      if(cand.length) return cand[Math.floor(rng()*cand.length)];
    }
    const all=[]; for(let k=0;k<n*n;k++) if(free(k)) all.push(k);
    const par=all.filter(k=>(Math.floor(k/n)+k%n)%2===0);
    const pool=par.length?par:all; return pool[Math.floor(rng()*pool.length)];
  },
};
TG.bantau = {
  per:{ sc:0, ships:()=>[], shots:'', rdy:0 },
  about:'Mỗi người có một hạm đội giấu trên bàn của mình (bấm "Xếp lại" để đổi vị trí). Lần lượt chọn ô trên bàn đối thủ để bắn: 💥 trúng, 🌊 trượt. Bắn trúng được bắn tiếp. Đánh chìm hết tàu đối thủ trước là thắng ván.',
  init(P, set, rng, now){ const s={ P, sc:P.map(()=>0), n:set.size||10, target:set.target||1, again:set.again==null?1:set.again, tmr:set.tmr==null?30:set.tmr, gn:0, first:Math.floor(rng()*2) }; this.ng(s, now, rng); return s; },
  ng(s, now, rng){ s.gn++; s.first=1-s.first; s.wnr=-1; s.last=-1; s.lastBy=-1;
    s.ships=s.P.map(()=>BT.place(s.n, rng)); s.shots=s.P.map(()=>'.'.repeat(s.n*s.n)); s.rdy=s.P.map(p=>p.bot?1:0);
    TGU.phase(s,'place',45000,now); s.turn=-1; },
  setTurn(s,i,now){ s.turn=i; s.dl=s.tmr?now+s.tmr*1000:0; s.dlLen=s.tmr*1000; s.bt={}; },
  left: (s,i) => s.ships[i].filter(sh=>!BT.sunk(sh, s.shots[i])).length,
  act(s,i,a,now,rng){
    if(s.ph==='place'){
      if(a.t==='shuffle' && !s.rdy[i]){ s.ships[i]=BT.place(s.n, rng||Math.random); return true; }
      if(a.t==='ready' && !s.rdy[i]){ s.rdy[i]=1; return true; }
      return false; }
    if(s.ph!=='fire' || s.turn!==i || a.t!=='fire') return false;
    const j=1-i, k=+a.k; if(!(k>=0 && k<s.n*s.n) || s.shots[j][k]!=='.') return false;
    const hitShip=s.ships[j].find(sh=>BT.cells(sh).includes(k));
    s.shots[j]=s.shots[j].slice(0,k)+(hitShip?'x':'o')+s.shots[j].slice(k+1); s.last=k; s.lastBy=i;
    if(hitShip){
      if(BT.sunk(hitShip, s.shots[j])){
        // tàu chìm: đánh dấu các ô xung quanh là nước (không thể có tàu)
        BT.cells(hitShip).forEach(x=>{ const r=Math.floor(x/s.n), c=x%s.n; for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){ const rr=r+dr, cc=c+dc, y=rr*s.n+cc; if(rr>=0&&rr<s.n&&cc>=0&&cc<s.n&&s.shots[j][y]==='.') s.shots[j]=s.shots[j].slice(0,y)+'o'+s.shots[j].slice(y+1); } });
        const L=BT.cells(hitShip).length;
        TGU.log(s,'💥 '+s.P[i].n+' đánh chìm '+BT.NAMES[L]+' ('+L+' ô)!','big',now);
        if(!this.left(s,j)){ s.wnr=i; s.sc[i]++; s.turn=-1; TGU.log(s,'🏆 '+s.P[i].n+' đánh chìm cả hạm đội!','win',now); TGU.phase(s,'res',6000,now); return true; }
      } else TGU.log(s,'💥 Trúng!','',now);
      this.setTurn(s, s.again ? i : j, now); return true;
    }
    this.setTurn(s, j, now); return true;
  },
  tick(s, now, rng){
    if(s.ph==='place'){
      if(now>=s.dl || s.rdy.every(x=>x)){ TGU.phase(s,'fire',0,now); this.setTurn(s, s.first, now); TGU.log(s,'🚀 Khai hỏa! '+s.P[s.first].n+' bắn trước','',now); return true; }
      return false; }
    if(s.ph==='fire'){ const i=s.turn, p=s.P[i];
      if(p.bot && TGU.bot(s,i,now,rng,700,1500)) return this.act(s,i,{t:'fire',k:BT.aim(s.shots[1-i], s.ships[1-i], s.n, rng)},now,rng);
      if(s.dl && now>=s.dl){ TGU.log(s,'⏰ '+p.n+' hết giờ — bắn đại','',now); return this.act(s,i,{t:'fire',k:BT.aim(s.shots[1-i], s.ships[1-i], s.n, rng)},now,rng); }
      return false; }
    if(s.ph==='res' && now>=s.dl){
      if(Math.max(...s.sc)>=s.target){ s.over=1; s.dl=0; const w=s.sc.indexOf(Math.max(...s.sc)); TGU.log(s,'🏆 '+s.P[w].n+' là Đô đốc!','big',now); return true; }
      this.ng(s, now, rng); return true; }
    return false;
  },
  turn: s => s.ph==='fire' ? s.turn : -1,
  label: s => 'Ván '+s.gn+(s.target>1?' · thắng '+s.target+' ván':'')+' · bàn '+s.n+'×'+s.n,
  score(s,i){ return '🚢 '+this.left(s,i)+'/'+s.ships[i].length; },
  badge: (s,i) => s.ph==='place' ? (s.rdy[i]?'✅ Sẵn sàng':'⚓ Đang xếp') : s.ph==='fire' && s.turn===i ? '🎯 Đang bắn' : s.wnr===i ? '🏆' : (s.sc[i]?'🏅 '+s.sc[i]:''),
  result: s => TGU.rank(s.sc, true, v=>v+' ván thắng'),
  grid(s, owner, show, act){ const n=s.n, sh=s.shots[owner], cells=new Set(); if(show) s.ships[owner].forEach(x=>BT.cells(x).forEach(c=>cells.add(c)));
    const sunkSet=new Set(); s.ships[owner].forEach(x=>{ if(BT.sunk(x,sh)) BT.cells(x).forEach(c=>sunkSet.add(c)); });
    let h=`<div class="bt-g${act?' act':''}" style="--n:${n}">`;
    for(let k=0;k<n*n;k++){ const v=sh[k], cls=[]; if(cells.has(k)) cls.push('ship'); if(v==='x') cls.push(sunkSet.has(k)?'sunk':'hit'); if(v==='o') cls.push('miss'); if(k===s.last && s.lastBy!==owner) cls.push('last');
      h += `<i class="${cls.join(' ')}"${act&&v==='.'?` data-act='{"t":"fire","k":${k}}'`:''}></i>`; }
    return h+'</div>'; },
  view(s, me){
    const op = me>=0 ? 1-me : 1, my = s.ph==='fire' && s.turn===me;
    if(s.ph==='place'){
      if(me<0) return '<div class="bg-msg">⚓ Hai bên đang xếp tàu…</div>';
      return `<div class="bt"><div class="bg-msg">⚓ Hạm đội của bạn${s.rdy[me]?' — chờ đối thủ…':''}</div>${this.grid(s, me, true, false)}
        <div class="bt-fleet">${BT.FLEET[s.n].map(L=>'<span>'+'■'.repeat(L)+'</span>').join('')}</div>
        ${s.rdy[me]?'':`<div class="bg-ctl c">${TGU.btn({t:'shuffle'},'🔀 Xếp lại','gray')}${TGU.btn({t:'ready'},'✅ Sẵn sàng','green big')}</div>`}</div>`; }
    const showOp = s.ph==='res';
    let h=`<div class="bt"><div class="bg-msg">${s.ph==='fire' ? (my?'🎯 Tới lượt bạn — chọn ô để bắn':'⏳ '+escH(s.P[s.turn].n)+' đang ngắm…') : s.wnr>=0 ? '🏆 '+escH(s.P[s.wnr].n)+' thắng ván!' : ''}</div>`;
    h += `<div class="bt-lbl">🎯 Bàn của ${escH(s.P[op].n)} · còn ${this.left(s,op)} tàu</div>${this.grid(s, op, showOp, my)}`;
    if(me>=0) h += `<div class="bt-lbl">⚓ Hạm đội của bạn · còn ${this.left(s,me)} tàu</div><div class="bt-mine">${this.grid(s, me, true, false)}</div>`;
    return h+'</div>';
  }
};

/* ---------- 🐴 CÁ NGỰA (Ludo) ---------- */
const CN = {
  // 52 ô đường chính trên lưới 15×15 (theo chiều kim đồng hồ, bắt đầu từ ô xuất phát của màu 0)
  PATH: (()=>{ const p=[]; const seg=(r,c,dr,dc,n)=>{ for(let k=0;k<n;k++) p.push([r+dr*k,c+dc*k]); };
    seg(6,1,0,1,5); seg(5,6,-1,0,6); p.push([0,7]); p.push([0,8]); seg(1,8,1,0,5); seg(6,9,0,1,6); p.push([7,14]); p.push([8,14]);
    seg(8,13,0,-1,5); seg(9,8,1,0,6); p.push([14,7]); p.push([14,6]); seg(13,6,-1,0,5); seg(8,5,0,-1,6); p.push([7,0]); p.push([6,0]); return p; })(),
  HOME: [ k=>[7,1+k], k=>[1+k,7], k=>[7,13-k], k=>[13-k,7] ],     // 5 ô về đích của từng màu
  YARD: [ [[1.5,1.5],[1.5,3.5],[3.5,1.5],[3.5,3.5]], [[1.5,10.5],[1.5,12.5],[3.5,10.5],[3.5,12.5]], [[10.5,10.5],[10.5,12.5],[12.5,10.5],[12.5,12.5]], [[10.5,1.5],[10.5,3.5],[12.5,1.5],[12.5,3.5]] ],
  COL: ['r','g','y','b'], CNAME: ['Đỏ','Xanh lá','Vàng','Xanh dương'], HORSE:['🔴','🟢','🟡','🔵'],
  SAFE: new Set([0,8,13,21,26,34,39,47]),
  // vị trí: -1 chuồng, 0..50 đường chính (tính từ ô xuất phát), 51..55 đường về, 56 đã về đích
  cell(col, pos){ if(pos<0 || pos>=56) return null; if(pos<=50) return CN.PATH[(col*13+pos)%52]; return CN.HOME[col](pos-51); },
  abs: (col,pos) => pos>=0 && pos<=50 ? (col*13+pos)%52 : -1,
};
TG.cangua = {
  per:{ hs:()=>[-1,-1,-1,-1], col:0, done:0 },
  lists:['ranks'],
  about:'2–4 người, mỗi người 4 ngựa trong chuồng. Đổ được 6 mới xuất chuồng; đổ 6 hoặc đá được ngựa đối thủ thì được đổ tiếp. Ngựa đi đủ một vòng rồi vào đường về đích (phải đổ vừa đúng). Đứng trên ô có ★ thì không bị đá. Ai đưa đủ 4 ngựa về đích trước thắng.',
  init(P, set, rng, now){ const n=P.length, cols= n===2?[0,2]: n===3?[0,1,2]:[0,1,2,3];
    const s={ P, hs:P.map(()=>[-1,-1,-1,-1]), col:cols.slice(0,n), done:P.map(()=>0), ranks:[], tmr:set.tmr==null?20:set.tmr, die:0, six:0 };
    TGU.phase(s,'roll',0,now); this.setTurn(s, Math.floor(rng()*n), now); return s; },
  setTurn(s,i,now){ s.turn=i; s.ph='roll'; s.die=0; s.dl=s.tmr?now+s.tmr*1000:0; s.dlLen=s.tmr*1000; s.bt={}; },
  legal(s,i){ const d=s.die, out=[]; s.hs[i].forEach((p,h)=>{ if(p===56) return; if(p<0){ if(d===6) out.push(h); return; } if(p+d<=56) out.push(h); }); return out; },
  nextTurn(s, i, now){ const n=s.P.length; for(let k=1;k<=n;k++){ const j=(i+k)%n; if(!s.done[j]) return this.setTurn(s, j, now); } },
  act(s,i,a,now,rng){
    if(s.turn!==i || s.over) return false;
    if(a.t==='roll' && s.ph==='roll'){ s.die=1+Math.floor((rng||Math.random)()*6); s.rolls=(s.rolls||0)+1;
      const L=this.legal(s,i);
      if(!L.length){ s.ph='skip'; s.dl=now+1300; s.dlLen=1300; s.bt={}; }
      else { s.ph='move'; s.dl=s.tmr?now+s.tmr*1000:0; s.dlLen=s.tmr*1000; s.bt={}; }
      return true; }
    if(a.t==='mv' && s.ph==='move'){ const h=+a.h; if(!this.legal(s,i).includes(h)) return false;
      const c=s.col[i]; let p=s.hs[i][h]; p = p<0 ? 0 : p+s.die; s.hs[i][h]=p; let bonus = s.die===6, kick=false;
      const ab=CN.abs(c,p);
      if(ab>=0 && !CN.SAFE.has(ab)) s.hs.forEach((hs,j)=>{ if(j===i) return; hs.forEach((q,k)=>{ if(CN.abs(s.col[j],q)===ab){ hs[k]=-1; kick=true; TGU.log(s,'🦶 '+s.P[i].n+' đá ngựa '+s.P[j].n+' về chuồng!','big',now); } }); });
      if(kick) bonus=true;
      if(p===56){ TGU.log(s,'🏁 Ngựa của '+s.P[i].n+' về đích!','win',now); bonus=true;
        if(s.hs[i].every(x=>x===56)){ s.done[i]=1; s.ranks.push(i); TGU.log(s,'🏆 '+s.P[i].n+' về đích đủ 4 ngựa!','big',now);
          this.finish(s, now); return true; } }
      if(bonus){ s.six=(s.six||0)+1; if(s.six>=3){ s.six=0; this.nextTurn(s,i,now); } else this.setTurn(s,i,now); }
      else { s.six=0; this.nextTurn(s,i,now); }
      return true; }
    return false;
  },
  prog: (s,i) => s.hs[i].reduce((a,p)=>a+(p<0?0:p+1),0),
  finish(s, now){ const rest=s.P.map((p,i)=>i).filter(i=>!s.ranks.includes(i)).sort((a,b)=>this.prog(s,b)-this.prog(s,a)); s.ranks=s.ranks.concat(rest); s.over=1; s.dl=0; s.turn=-1; s.ph='res'; },
  botPick(s,i){ const L=this.legal(s,i), c=s.col[i]; let best=-1e9, bh=L[0];
    L.forEach(h=>{ const p0=s.hs[i][h], p=p0<0?0:p0+s.die, ab=CN.abs(c,p); let v=0;
      if(p0<0) v+=60; if(p===56) v+=80; if(p>50 && p0<=50) v+=40;
      if(ab>=0) s.hs.forEach((hs,j)=>{ if(j!==i) hs.forEach(q=>{ if(CN.abs(s.col[j],q)===ab && !CN.SAFE.has(ab)) v+=100; }); });
      if(ab>=0 && CN.SAFE.has(ab)) v+=15;
      // nguy hiểm: ngựa địch đứng sau 1..6 ô
      const danger=a=>a>=0 && !CN.SAFE.has(a) && s.hs.some((hs,j)=>j!==i && hs.some(q=>{ const b=CN.abs(s.col[j],q); return b>=0 && ((a-b+52)%52)>=1 && ((a-b+52)%52)<=6; }));
      if(danger(ab)) v-=35; if(danger(CN.abs(c,p0))) v+=25; v+=p*.5;
      if(v>best){ best=v; bh=h; } });
    return bh; },
  tick(s, now, rng){
    if(s.over) return false; const i=s.turn, p=s.P[i];
    if(s.ph==='skip' && now>=s.dl){ if(s.die===6) this.setTurn(s,i,now); else this.nextTurn(s,i,now); return true; }
    if(s.ph==='roll' && (p.bot ? TGU.bot(s,i,now,rng,500,1100) : s.dl && now>=s.dl)) return this.act(s,i,{t:'roll'},now,rng);
    if(s.ph==='move' && (p.bot ? TGU.bot(s,i,now,rng,500,1000) : s.dl && now>=s.dl)) return this.act(s,i,{t:'mv',h:this.botPick(s,i)},now,rng);
    return false;
  },
  turn: s => s.over ? -1 : s.turn,
  label: s => s.P.length+' người · ai về đủ 4 ngựa trước thắng',
  score(s,i){ return CN.HORSE[s.col[i]]+' '+s.hs[i].filter(x=>x===56).length+'/4'; },
  badge(s,i){ if(s.done[i]) return '🏆 Về đích'; if(s.turn!==i) return ''; return s.ph==='roll'?'🎲 Đổ…':s.die?'🎲 '+s.die:''; },
  result(s){ return s.ranks.map((i,k)=>({ i, rank:k+1, txt:s.hs[i].filter(x=>x===56).length+'/4 ngựa về đích' })); },
  view(s, me){
    const my = !s.over && s.turn===me, L = my && s.ph==='move' ? this.legal(s,me) : [];
    const occ={};    // "r,c" → [{seat,h}]
    s.P.forEach((p,i)=>s.hs[i].forEach((pos,h)=>{ const c=CN.cell(s.col[i],pos); if(c){ const k=c.join(','); (occ[k]=occ[k]||[]).push({i,h}); } }));
    let h='<div class="cn"><div class="cn-b">';
    // nền: chuồng 4 góc + đích giữa
    [[0,0,'r'],[0,9,'g'],[9,9,'y'],[9,0,'b']].forEach(([r,c,k])=>h+=`<div class="cn-yard ${k}" style="--r:${r};--c:${c}"></div>`);
    h += '<div class="cn-mid"></div>';
    CN.PATH.forEach(([r,c],ix)=>{ const st=ix%13===0, cls=st?' st '+CN.COL[ix/13]:''; h+=`<div class="cn-c${cls}${CN.SAFE.has(ix)?' safe':''}" style="--r:${r};--c:${c}"></div>`; });
    [0,1,2,3].forEach(col=>{ for(let k=0;k<5;k++){ const [r,c]=CN.HOME[col](k); h+=`<div class="cn-c home ${CN.COL[col]}" style="--r:${r};--c:${c}"></div>`; } });
    // ngựa
    Object.entries(occ).forEach(([k,list])=>{ const [r,c]=k.split(',').map(Number);
      list.forEach((o,z)=>{ const can=o.i===me && L.includes(o.h);
        h+=`<div class="cn-h ${CN.COL[s.col[o.i]]}${can?' can':''}${list.length>1?' stk':''}" style="--r:${r};--c:${c};--z:${z}"${can?` data-act='{"t":"mv","h":${o.h}}'`:''}>🐴</div>`; }); });
    s.P.forEach((p,i)=>s.hs[i].forEach((pos,hh)=>{ if(pos>=0) return; const [r,c]=CN.YARD[s.col[i]][hh]; const can=i===me && L.includes(hh);
      h+=`<div class="cn-h ${CN.COL[s.col[i]]} yd${can?' can':''}" style="--r:${r-.5};--c:${c-.5}"${can?` data-act='{"t":"mv","h":${hh}}'`:''}>🐴</div>`; }));
    const fin=s.P.map((p,i)=>s.hs[i].filter(x=>x===56).length?`<span class="${CN.COL[s.col[i]]}">${'🐴'.repeat(s.hs[i].filter(x=>x===56).length)}</span>`:'').join('');
    h += `<div class="cn-fin">${fin}</div></div>`;
    const who = s.over ? '' : `${CN.HORSE[s.col[s.turn]]} ${escH(s.P[s.turn].n)}`;
    h += `<div class="cn-ctl">${s.die?`<div class="cn-die">${TGU.die(s.die)}</div>`:''}<div class="bg-msg">${s.over?'🏁 Kết thúc!': my ? (s.ph==='roll'?'👉 Tới lượt bạn — đổ xúc xắc!': s.ph==='move'?'👉 Chọn ngựa đang nhấp nháy để đi '+s.die+' bước':'😕 Không đi được ngựa nào') : '⏳ '+who+(s.ph==='roll'?' đang đổ…':' đang đi…')}</div>`;
    if(my && s.ph==='roll') h += TGU.btn({t:'roll'},'🎲 Đổ xúc xắc','big green');
    if(me>=0) h += `<div class="cn-me">Bạn là ngựa <b class="${CN.COL[s.col[me]]}">${CN.HORSE[s.col[me]]} ${CN.CNAME[s.col[me]]}</b></div>`;
    return h+'</div></div>';
  }
};

/* ---------- 🔘 Ô ĂN QUAN ---------- */
// 12 ô theo vòng: 0 = quan trái, 1..5 = dân của người 1, 6 = quan phải, 7..11 = dân của người 2
const OQ = {
  mine: (i,k) => i===0 ? k>=1&&k<=5 : k>=7&&k<=11,
  // gieo từ ô k theo hướng d; trả về {b, q, gain, gq, path}
  sim(b0, q0, k, d){
    const b=b0.slice(), q=q0.slice(), path=[]; let gain=0, gq=0, hand=b[k], pos=k; b[k]=0;
    const isQ=x=>x===0||x===6, empty=x=>b[x]===0 && !(isQ(x) && q[x/6]), nxt=x=>(x+d+12)%12;
    for(let guard=0; guard<400; guard++){
      while(hand>0){ pos=nxt(pos); b[pos]++; hand--; path.push(pos); }
      const nx=nxt(pos);
      if(isQ(nx) && !empty(nx)) break;                               // gặp ô quan → mất lượt
      if(!isQ(nx) && b[nx]>0){ hand=b[nx]; b[nx]=0; pos=nx; continue; } // bốc ô kế rải tiếp
      let e=nx;                                                       // ô kế trống → ăn ô sau (ăn liên tiếp)
      while(empty(e)){ const t=nxt(e); if(empty(t)) break; gain+=b[t]; b[t]=0; if(isQ(t) && q[t/6]){ q[t/6]=0; gq++; } path.push(-1-t); e=nxt(t); }
      break;
    }
    return { b, q, gain, gq, path };
  },
  pts: (g, gq) => g + gq*10,
};
TG.oanquan = {
  per:{ cap:0, capq:0 },
  about:'Trò chơi dân gian 2 người: 10 ô dân (mỗi ô 5 sỏi) và 2 ô quan. Tới lượt, chọn một ô dân bên mình và hướng rải — rải mỗi ô một viên. Hết sỏi: ô kế còn sỏi thì bốc rải tiếp; ô kế trống mà ô sau có sỏi thì ăn (ăn liên tiếp được); gặp quan hoặc 2 ô trống thì mất lượt. Hết dân bên mình phải rải 5 viên đã ăn. Ăn hết 2 quan là hết ván — quan tính 10 điểm.',
  init(P, set, rng, now){ const s={ P, b:[0,5,5,5,5,5,0,5,5,5,5,5], q:[1,1], cap:[0,0], capq:[0,0], level:set.level||2, tmr:set.tmr==null?30:set.tmr, last:'', borrow:[0,0] };
    TGU.phase(s,'play',0,now); this.setTurn(s, Math.floor(rng()*2), now); return s; },
  score(s,i){ return OQ.pts(s.cap[i], s.capq[i])+' đ'; },
  setTurn(s,i,now){ s.turn=i; s.dl=s.tmr?now+s.tmr*1000:0; s.dlLen=s.tmr*1000; s.bt={};
    // hết dân bên mình → rải 5 viên đã ăn (thiếu thì vay đối thủ)
    const own=[1,2,3,4,5].map(k=>i===0?k:k+6);
    if(!s.over && own.every(k=>s.b[k]===0)){ let take=Math.min(5, s.cap[i]); s.cap[i]-=take; if(take<5){ const need=5-take; s.cap[1-i]-=need; s.borrow[i]+=need; take=5; }
      own.forEach(k=>s.b[k]=1); TGU.log(s,'🫳 '+s.P[i].n+' hết dân — rải 5 viên ra bàn','',now); } },
  moves(s,i){ const m=[]; for(let k=0;k<12;k++) if(OQ.mine(i,k) && s.b[k]>0){ m.push([k,1]); m.push([k,-1]); } return m; },
  act(s,i,a,now){
    if(s.ph!=='play' || s.turn!==i || a.t!=='mv') return false;
    const k=+a.k, d=+a.d===1?1:-1; if(!OQ.mine(i,k) || !s.b[k]) return false;
    const r=OQ.sim(s.b, s.q, k, d); s.b=r.b; s.q=r.q; s.cap[i]+=r.gain; s.capq[i]+=r.gq; s.last=r.path.join(',');
    if(r.gain||r.gq) TGU.log(s, '😋 '+s.P[i].n+' ăn '+(r.gq?r.gq+' quan + ':'')+r.gain+' dân', r.gq?'big':'', now);
    if(!s.q[0] && !s.q[1]){ this.end(s, now); return true; }
    this.setTurn(s, 1-i, now); return true;
  },
  end(s, now){
    // hết quan: dân còn bên ai về người đó
    [0,1].forEach(i=>{ for(let k=0;k<12;k++) if(OQ.mine(i,k)){ s.cap[i]+=s.b[k]; s.b[k]=0; } });
    const p=[0,1].map(i=>OQ.pts(s.cap[i],s.capq[i]));
    s.wnr = p[0]>p[1]?0:p[1]>p[0]?1:-1; s.over=1; s.dl=0; s.turn=-1; s.ph='res';
    TGU.log(s, s.wnr>=0 ? '🏆 '+s.P[s.wnr].n+' thắng '+p[s.wnr]+'–'+p[1-s.wnr]+'!' : '🤝 Hòa '+p[0]+'–'+p[1], 'big', now); },
  best(s,i,level,rng){ const ms=this.moves(s,i); let best=-1e9, bm=ms[0];
    TGU.shuffle(ms, rng).forEach(([k,d])=>{ const r=OQ.sim(s.b,s.q,k,d); let v=OQ.pts(r.gain,r.gq)+rng()*(level<2?6:.5);
      if(level>=2){ let opp=0; const j=1-i; for(let x=0;x<12;x++) if(OQ.mine(j,x) && r.b[x]) for(const dd of [1,-1]){ const r2=OQ.sim(r.b,r.q,x,dd); opp=Math.max(opp,OQ.pts(r2.gain,r2.gq)); } v-=opp*(level>=3?1:.6); }
      if(v>best){ best=v; bm=[k,d]; } });
    return bm; },
  tick(s, now, rng){
    if(s.ph!=='play' || s.over) return false; const i=s.turn, p=s.P[i];
    if((p.bot && TGU.bot(s,i,now,rng,700,1500)) || (s.dl && now>=s.dl)){ const m=this.best(s,i,p.bot?s.level:1,rng); if(!m){ this.end(s,now); return true; } return this.act(s,i,{t:'mv',k:m[0],d:m[1]},now); }
    return false;
  },
  turn: s => s.over ? -1 : s.turn,
  label: s => 'Quan còn: '+(s.q[0]?'⬅':'')+(s.q[1]?' ➡':'')+(!s.q[0]&&!s.q[1]?'hết':''),
  badge: (s,i) => s.capq[i] ? '👑×'+s.capq[i] : s.turn===i ? '✍️ Đang đi' : '',
  result: s => { const p=[0,1].map(i=>OQ.pts(s.cap[i],s.capq[i])); return TGU.rank(p, true, v=>v+' điểm'); },
  ui(v, ui, s, me, send){ if(v.k!=null){ ui.sel = ui.sel===v.k ? null : v.k; } if(v.d!=null && ui.sel!=null){ send({t:'mv',k:ui.sel,d:v.d}); ui.sel=null; } },
  view(s, me, ui){
    const flip = me===1, my = s.ph==='play' && s.turn===me, path=new Set((s.last||'').split(',').filter(x=>x!=='').map(Number));
    const stones = n => n>8 ? `<em>${n}</em>` : '<span class="oq-st">'+'●'.repeat(n)+'</span>';
    const cell=(k)=>{ const can = my && OQ.mine(me,k) && s.b[k]>0; return `<div class="oq-c${path.has(k)?' p':''}${path.has(-1-k)?' eat':''}${ui.sel===k?' sel':''}${can?' can':''}"${can?` data-ui='{"k":${k}}'`:''}>${stones(s.b[k])}<small>${s.b[k]}</small></div>`; };
    const quan=(k)=>`<div class="oq-q${k===0?' l':' r'}${path.has(-1-k)?' eat':''}">${s.q[k/6]?'<b class="oq-big">◉</b>':''}${s.b[k]?stones(s.b[k]):''}<small>${s.q[k/6]?'Quan':''}${s.b[k]?' +'+s.b[k]:''}</small></div>`;
    // người 0 ở dưới (1..5 trái→phải), người 1 ở trên (11..7 trái→phải); lật bàn cho người 1
    const top = flip ? [5,4,3,2,1] : [11,10,9,8,7], bot = flip ? [7,8,9,10,11] : [1,2,3,4,5], L = flip ? 6 : 0, R = flip ? 0 : 6;
    let h=`<div class="oq"><div class="bg-msg">${s.over?'🏁 Hết quan — kết thúc ván!':my?(ui.sel!=null?'👉 Chọn hướng rải':'👉 Tới lượt bạn — chọn một ô dân bên dưới'):'⏳ '+escH(s.P[s.turn].n)+' đang rải…'}</div>`;
    h += `<div class="oq-b">${quan(L)}<div class="oq-rows"><div class="oq-row">${top.map(cell).join('')}</div><div class="oq-row">${bot.map(cell).join('')}</div></div>${quan(R)}</div>`;
    if(my && ui.sel!=null) h += `<div class="bg-ctl c"><button class="tbtn big" data-ui='{"d":-1}'>⬅ Rải sang trái</button><button class="tbtn big" data-ui='{"d":1}'>Rải sang phải ➡</button></div>`;
    h += `<div class="oq-cap">${s.P.map((p,i)=>`<span>${escH(p.a)} ${escH(p.n)}: <b>${s.capq[i]?'👑×'+s.capq[i]+' + ':''}${s.cap[i]} dân</b></span>`).join('')}</div>`;
    return h+'</div>';
  }
};


/* #####################  JAVASCRIPT.JS  ##################### */
/* =====================================================================
   javascript.js — nền tảng GameHub
   Firebase/Net, hồ sơ người chơi, phòng online, đua & đối kháng,
   bảng xếp hạng, sảnh và điều hướng. Nạp sau games-arcade.js.
   ===================================================================== */
/* =====================================================================
   GÓC GAME ONLINE — NỀN TẢNG (Firebase Realtime DB, dùng chung với GameHub)
   Dữ liệu nằm dưới nhánh  arcade/  để không đụng tới  rooms/  của GameHub:
     arcade/online/{pid}            ai đang online
     arcade/rooms/{code}            phòng chơi (mã 3 số)
     arcade/rooms/{code}/chat       chat trong phòng
     arcade/matches/{id}            lịch sử trận
     arcade/stats/{pid}             thành tích từng người (đã chơi / thắng)
     arcade/best/{bảng}/{pid}       điểm cao nhất từng bảng xếp hạng
   ===================================================================== */
const FB_CONFIG = {
  apiKey: "AIzaSyBQMU_ALSlqg_p_5ul-5GxRrmbJ3WmasK0",
  authDomain: "caro-game-277bd.firebaseapp.com",
  databaseURL: "https://caro-game-277bd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "caro-game-277bd",
  storageBucket: "caro-game-277bd.firebasestorage.app",
  messagingSenderId: "523400466614",
  appId: "1:523400466614:web:86cdfbe8d6fe1c575d9617"
};
const ROOT = 'arcade';

/* ---------------- Danh mục game cho chế độ nhiều người ---------------- */
const LIM  = { k:'limit', n:'Giới hạn', opts:[[60,'1 phút'],[120,'2 phút'],[180,'3 phút'],[300,'5 phút']], def:120 };
const TLIM = { k:'limit', n:'Giới hạn', opts:[[180,'3 phút'],[300,'5 phút'],[600,'10 phút'],[900,'15 phút']], def:600 };
const RND  = { k:'rounds', n:'Số ván', opts:[[5,'5 ván'],[10,'10 ván'],[15,'15 ván']], def:10 };
const TMR  = { k:'tmr', n:'Mỗi nước', opts:[[15,'15 giây'],[30,'30 giây'],[0,'Không giới hạn']], def:30 };
const REG = {
  'thao-dinh':{ n:'Tháo Đinh',  i:'🔩', mp:'race', metric:'time',  max:8, set:[{k:'level',n:'Màn',opts:[[1,'1'],[3,'3'],[5,'5'],[8,'8'],[12,'12'],[20,'20']],def:3},TLIM] },
  'sudoku':   { n:'Sudoku',     i:'🔢', mp:'race', metric:'time',  max:8, set:[{k:'level',n:'Cấp',opts:[[0,'Dễ'],[1,'Trung bình'],[2,'Khó'],[3,'Chuyên gia'],[4,'Siêu khó']],def:0},TLIM] },
  '2048':     { n:'2048',       i:'🟧', mp:'race', metric:'score', max:8, set:[LIM] },
  'mines':    { n:'Dò mìn',     i:'💣', mp:'race', metric:'time',  max:8, set:[{k:'level',n:'Cấp',opts:[[0,'Dễ'],[1,'Vừa'],[2,'Khó']],def:0},TLIM] },
  'snake':    { n:'Rắn săn mồi',i:'🐍', mp:'race', metric:'score', max:8, set:[LIM] },
  'tetris':   { n:'Xếp hình',   i:'🧱', mp:'race', metric:'score', max:8, set:[LIM] },
  'memory':   { n:'Lật hình',   i:'🃏', mp:'turn', min:2, max:4,  set:[{k:'level',n:'Số thẻ',opts:[[0,'12'],[1,'16'],[2,'20'],[3,'30']],def:1}] },
  'line98':   { n:'Line 98',    i:'🔴', mp:'race', metric:'score', max:8, set:[LIM] },
  'flappy':   { n:'Chim bay',   i:'🐤', mp:'race', metric:'score', max:8, set:[LIM] },
  'shooter':  { n:'Bắn Máy Bay', i:'✈️', mp:'race', metric:'score', max:8, set:[LIM] },
  'breakout': { n:'Phá gạch',   i:'🏓', mp:'race', metric:'score', max:8, set:[LIM] },
  'slide':    { n:'Xếp số',     i:'🔟', mp:'race', metric:'time',  max:8, set:[{k:'level',n:'Cỡ',opts:[[0,'3×3'],[1,'4×4'],[2,'5×5']],def:1},TLIM] },
  'connect4': { n:'Thả cờ 4',   i:'🟡', mp:'turn', min:2, max:2,  set:[] },
  'whack':    { n:'Đập chuột',  i:'🔨', mp:'race', metric:'score', max:8, set:[], fixed:40 },
  'math':     { n:'Tính nhẩm',  i:'➗', mp:'race', metric:'score', max:8, set:[{k:'level',n:'Cấp',opts:[[0,'Dễ'],[1,'Vừa'],[2,'Khó']],def:0}], fixed:130 },
  'simon':    { n:'Simon',      i:'🎵', mp:'race', metric:'score', max:8, set:[LIM] },
  /* ---- bàn chơi nhiều người (chủ phòng làm trọng tài, có máy chơi cùng) ---- */
  'taixiu':     { n:'Tài Xỉu',      i:'🎲', mp:'table', min:1, max:8, bots:3, set:[RND] },
  'baucua':     { n:'Bầu Cua',      i:'🦀', mp:'table', min:1, max:8, bots:3, set:[RND] },
  'chanle':     { n:'Xóc Đĩa',      i:'🎰', mp:'table', min:1, max:8, bots:3, set:[RND] },
  'xucxac':     { n:'Xúc Xắc Chiến',i:'🎲', mp:'table', min:2, max:8, bots:3, set:[{k:'target',n:'Thắng khi đủ',opts:[[3,'3 điểm'],[5,'5 điểm'],[7,'7 điểm']],def:5}] },
  'oantuti':    { n:'Oẳn Tù Tì',    i:'✊', mp:'table', min:2, max:8, bots:3, set:[{k:'target',n:'Thắng khi đủ',opts:[[3,'3 điểm'],[5,'5 điểm'],[7,'7 điểm']],def:5}] },
  'speedmath':  { n:'Đếm Nhanh',    i:'🔢', mp:'table', min:2, max:8, bots:3, set:[{k:'qs',n:'Số câu',opts:[[10,'10'],[15,'15'],[20,'20']],def:10},{k:'level',n:'Độ khó',opts:[[0,'Dễ'],[1,'Vừa'],[2,'Khó']],def:1}] },
  'guessnumber':{ n:'Số May Mắn',   i:'🎯', mp:'table', min:2, max:8, bots:3, set:[{k:'rounds',n:'Số ván',opts:[[5,'5'],[7,'7'],[10,'10']],def:5}] },
  'phanxa':     { n:'Phản Xạ',      i:'⚡', mp:'table', min:2, max:8, bots:3, set:[{k:'rounds',n:'Số ván',opts:[[5,'5'],[7,'7'],[10,'10']],def:5}] },
  'xidach':     { n:'Xì Dách',      i:'🃏', mp:'table', min:1, max:6, bots:2, set:[RND] },
  'poker':      { n:'Poker',        i:'♠️', mp:'table', min:2, max:6, bots:3, set:[{k:'rounds',n:'Kết thúc',opts:[[0,'Khi còn 1 người'],[10,'Sau 10 ván'],[20,'Sau 20 ván']],def:10}] },
  'gomoku':     { n:'Caro 20×20',   i:'⚔️', mp:'table', min:2, max:2, bots:1, set:[{k:'size',n:'Bàn cờ',opts:[[15,'15×15'],[20,'20×20']],def:20},{k:'block',n:'Luật chặn 2 đầu',opts:[[0,'Không'],[1,'Có']],def:0},{k:'target',n:'Thắng khi đủ',opts:[[1,'1 ván'],[2,'2 ván'],[3,'3 ván']],def:2},TMR] },
  'cotuong':    { n:'Cờ Tướng',     i:'🀄', mp:'table', min:2, max:2, bots:1, set:[{k:'level',n:'Máy',opts:[[1,'Dễ'],[2,'Vừa'],[3,'Khó']],def:2},{k:'tmr',n:'Mỗi nước',opts:[[30,'30 giây'],[60,'60 giây'],[0,'Không giới hạn']],def:60}] },
  'othello':    { n:'Cờ Lật',       i:'⚫', mp:'table', min:2, max:2, bots:1, set:[{k:'level',n:'Máy',opts:[[1,'Dễ'],[2,'Vừa'],[3,'Khó']],def:2},{k:'target',n:'Thắng khi đủ',opts:[[1,'1 ván'],[2,'2 ván'],[3,'3 ván']],def:2},TMR] },
  'bantau':     { n:'Bắn Tàu',      i:'🚢', mp:'table', min:2, max:2, bots:1, set:[{k:'size',n:'Bàn',opts:[[8,'8×8 (nhanh)'],[10,'10×10']],def:10},{k:'again',n:'Trúng được bắn tiếp',opts:[[1,'Có'],[0,'Không']],def:1},{k:'target',n:'Thắng khi đủ',opts:[[1,'1 ván'],[2,'2 ván'],[3,'3 ván']],def:1},TMR] },
  'cangua':     { n:'Cá Ngựa',      i:'🐴', mp:'table', min:2, max:4, bots:3, set:[{k:'tmr',n:'Mỗi lượt',opts:[[15,'15 giây'],[20,'20 giây'],[0,'Không giới hạn']],def:20}] },
  'oanquan':    { n:'Ô Ăn Quan',    i:'🔘', mp:'table', min:2, max:2, bots:1, set:[{k:'level',n:'Máy',opts:[[1,'Dễ'],[2,'Vừa'],[3,'Khó']],def:2},TMR] },
  'tienlen':    { n:'Tiến Lên',     i:'🏹', mp:'table', min:2, max:4, bots:3, set:[{k:'rounds',n:'Số ván',opts:[[3,'3'],[5,'5'],[10,'10'],[20,'20']],def:5},{k:'tmr',n:'Mỗi lượt',opts:[[15,'15 giây'],[25,'25 giây'],[40,'40 giây']],def:25}] },
};
/* Bảng xếp hạng: [mã bảng, tên, chiều (max/min), định dạng (n điểm, t thời gian, lv màn, mv lượt)] */
const BOARDS = {
  'thao-dinh':[['thao-dinh','Màn cao nhất','max','lv']],
  'sudoku':[['sudoku-easy','Dễ','min','t'],['sudoku-medium','Trung bình','min','t'],['sudoku-hard','Khó','min','t'],['sudoku-expert','Chuyên gia','min','t'],['sudoku-master','Siêu khó','min','t']],
  '2048':[['2048','Điểm','max','n']],
  'mines':[['mines-easy','Dễ','min','t'],['mines-med','Vừa','min','t'],['mines-hard','Khó','min','t']],
  'snake':[['snake','Điểm','max','n']], 'tetris':[['tetris','Điểm','max','n']],
  'memory':[['memory-l1','12 thẻ','min','mv'],['memory-l2','16 thẻ','min','mv'],['memory-l3','20 thẻ','min','mv'],['memory-l4','30 thẻ','min','mv'],['_wins','Thắng online','max','w']],
  'connect4':[['_wins','Thắng online','max','w']],
  'line98':[['line98','Điểm','max','n']], 'flappy':[['flappy','Điểm','max','n']], 'shooter':[['shooter','Điểm','max','n']], 'breakout':[['breakout','Điểm','max','n']],
  'slide':[['slide-3','3×3','min','t'],['slide-4','4×4','min','t'],['slide-5','5×5','min','t']],
  'whack':[['whack','Điểm','max','n']],
  'math':[['math-easy','Dễ','max','n'],['math-med','Vừa','max','n'],['math-hard','Khó','max','n']],
  'simon':[['simon','Số màu nhớ được','max','n']],
};
['taixiu','baucua','chanle','xucxac','oantuti','speedmath','guessnumber','phanxa','xidach','poker','gomoku','cotuong','tienlen','othello','bantau','cangua','oanquan'].forEach(k=>{ BOARDS[k]=[['_wins','Số trận thắng','max','w']]; });
const fmtVal = (v,f) => f==='t' ? fmtT(v) : f==='lv' ? 'Màn '+v : f==='mv' ? v+' lượt' : f==='w' ? v+' thắng' : String(v);
const AVATARS = ['😎','🦊','🐼','🦁','🐸','🦄','🤖','👻','🐯','🐧','🦋','🎃','🐔','🦆','🐙','🐳','🦀','🐉','🐮','🐷','🐹','🍄','🤡','🥸','🔥','🌈','🎯','⚡'];
const escH = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg, ms){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'), ms||2200); }
function relabel(view, arr){ // đổi nhãn ô thống kê khi chơi online, arr=null để trả lại
  document.querySelectorAll('#view-'+view+' .scores .stat small').forEach((e,i)=>{ if(e.dataset.o==null) e.dataset.o=e.textContent; e.textContent = arr && arr[i] ? arr[i] : e.dataset.o; });
}
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

/* ---------------- Net: Firebase thật, hoặc giả lập trên 1 máy ---------------- */
const Net = (() => {
  let mode = null, db = null, offset = 0, onConn = [];
  let readyRes; const ready = new Promise(r => readyRes = r);
  const forceLocal = /[?&]local=1/.test(location.search);
  // ---- local backend (nhiều tab cùng máy, dùng localStorage) ----
  const LK = 'arcade_localdb';
  const lread = () => { try{ return JSON.parse(localStorage.getItem(LK)) || {}; }catch(e){ return {}; } };
  const lwrite = t => { try{ localStorage.setItem(LK, JSON.stringify(t)); }catch(e){} };
  const parts = p => p.split('/').filter(Boolean);
  function lget(t,p){ let o=t; for(const k of parts(p)){ if(o==null || typeof o!=='object') return null; o=o[k]; } return o===undefined ? null : o; }
  function lset(t,p,v){
    const ks=parts(p); let o=t;
    for(let i=0;i<ks.length-1;i++){ if(o[ks[i]]==null || typeof o[ks[i]]!=='object') o[ks[i]]={}; o=o[ks[i]]; }
    if(v===null || v===undefined) delete o[ks[ks.length-1]]; else o[ks[ks.length-1]] = v;
    return t;
  }
  // ghi tuần tự giữa các tab (Web Locks) để không đè dữ liệu của nhau
  const withLock = fn => (navigator.locks && navigator.locks.request) ? navigator.locks.request('arcade_localdb', async ()=>{ fn(); }) : Promise.resolve(fn());
  const lis = new Set();
  function notify(){ const t=lread(); for(const l of lis){ const v=lget(t,l.p), s=JSON.stringify(v); if(s!==l.last){ l.last=s; try{ l.cb(v==null?null:JSON.parse(s)); }catch(e){ console.error(e); } } } }
  window.addEventListener('storage', e => { if(e.key===LK) notify(); });
  const discs = [];
  window.addEventListener('pagehide', () => { if(mode!=='local') return; const t=lread(); discs.forEach(([p,v])=>lset(t,p,v)); lwrite(t); });
  const clean = v => v===undefined ? null : JSON.parse(JSON.stringify(v));
  const SERVER_TS = '__ts__';
  function fill(v){ // thay mốc thời gian máy chủ ở chế độ local
    if(v===SERVER_TS) return Date.now();
    if(v && typeof v==='object'){ for(const k in v) v[k]=fill(v[k]); }
    return v;
  }

  function init(){
    try{
      if(!window.firebase) throw new Error('no firebase');
      if(!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
      db = firebase.database(); mode = 'firebase';
      db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
      db.ref('.info/connected').on('value', s => { if(s.val()) onConn.forEach(f=>{ try{ f(); }catch(e){} }); });
    }catch(e){ mode = 'local'; }
    readyRes(mode);
    if(mode==='local') setTimeout(()=>onConn.forEach(f=>f()), 0);
  }
  const fail = e => { console.error(e); toast('⚠️ Không ghi được dữ liệu online: '+(e && e.code || e && e.message || e)); };

  const api = {
    ready, init,
    get mode(){ return mode; },
    TS: SERVER_TS,
    now(){ return Date.now() + offset; },
    onConnected(f){ onConn.push(f); if(mode) setTimeout(f,0); },
    async get(p){ await ready; if(mode==='firebase'){ const s=await db.ref(p).once('value'); return s.val(); } const v=lget(lread(),p); return v==null?null:JSON.parse(JSON.stringify(v)); },
    async set(p,v){ await ready; v=clean(v);
      if(mode==='firebase') return db.ref(p).set(rts(v)).catch(fail);
      await withLock(()=>lwrite(lset(lread(),p,fill(v)))); notify(); },
    async update(p,obj){ await ready; obj=clean(obj);
      if(mode==='firebase') return db.ref(p).update(rts(obj)).catch(fail);
      await withLock(()=>{ const t=lread(); for(const k in obj) lset(t, p+'/'+k, fill(obj[k])); lwrite(t); }); notify(); },
    remove(p){ return api.set(p,null); },
    async push(p,v){ await ready;
      if(mode==='firebase'){ const r=db.ref(p).push(); await r.set(rts(clean(v))).catch(fail); return r.key; }
      const k=Date.now().toString(36)+Math.random().toString(36).slice(2,6); await api.set(p+'/'+k, v); return k; },
    on(p, cb){
      let off=false, unsub=()=>{};
      ready.then(()=>{
        if(off) return;
        if(mode==='firebase'){ const r=db.ref(p), h=s=>cb(s.val()); r.on('value', h, fail); unsub=()=>r.off('value', h); }
        else { const v=lget(lread(),p), l={p,cb,last:JSON.stringify(v)}; lis.add(l); cb(v==null?null:JSON.parse(l.last)); unsub=()=>lis.delete(l); }
      });
      return () => { off=true; unsub(); };
    },
    async onDisc(p, v){ await ready;
      if(mode==='firebase'){ const r=db.ref(p).onDisconnect(); return (v===null ? r.remove() : r.set(rts(clean(v)))).catch(()=>{}); }
      discs.push([p, v]); },
    async cancelDisc(p){ await ready; if(mode==='firebase') return db.ref(p).onDisconnect().cancel().catch(()=>{}); for(let i=discs.length-1;i>=0;i--) if(discs[i][0]===p) discs.splice(i,1); },
    async recent(p, child, n){ await ready; let o;
      if(mode==='firebase'){ const s=await db.ref(p).orderByChild(child).limitToLast(n).once('value'); o=s.val()||{}; }
      else o=lget(lread(),p)||{};
      return Object.entries(o).map(([k,v])=>Object.assign({_k:k}, v)).sort((a,b)=>(b[child]||0)-(a[child]||0)).slice(0,n); }
  };
  function rts(v){ // đổi '__ts__' thành serverTimestamp của Firebase
    if(v===SERVER_TS) return firebase.database.ServerValue.TIMESTAMP;
    if(v && typeof v==='object'){ for(const k in v) v[k]=rts(v[k]); }
    return v;
  }
  return api;
})();

/* ---------------- Hồ sơ người chơi ----------------
   Chế độ thử 1 máy: mỗi tab là một người chơi riêng (lưu trong sessionStorage) */
const LOCAL_MODE = /[?&]local=1/.test(location.search) || !!window.__FAKEFB || !window.firebase;
const pstore = LOCAL_MODE ? {
  get(k,d){ try{ const v=sessionStorage.getItem(k); if(v!=null) return JSON.parse(v); }catch(e){} return d; },
  set(k,v){ try{ sessionStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
} : store;
const ME = {
  p: pstore.get('arcade_profile', null),
  get id(){ return this.p && this.p.id; }, get n(){ return this.p && this.p.n; }, get a(){ return this.p && this.p.a; },
  get c(){ return (this.p && this.p.c) || '#8b5cf6'; },
  save(n, a, c){ this.p = { id: (this.p && this.p.id) || 'p'+Math.random().toString(36).slice(2,10), n, a, c }; pstore.set('arcade_profile', this.p); syncHub(); }
};
/* GameHub cũ đọc người chơi qua window.HUB và khởi động bằng window.onHubReady */
let hubStarted=false;
function syncHub(){
  if(!ME.id) return;
  window.HUB = { name:ME.n, av:ME.a, id:ME.id };
  const cav=document.getElementById('cav'), cn=document.getElementById('cname');
  if(cav) cav.textContent=ME.a; if(cn) cn.textContent=ME.n;
  if(hubStarted) return; hubStarted=true;
  if(window.onHubReady) window.onHubReady(); else window.hubReady=true;
}
function showToast(m, ms){ toast(m, ms); }

/* =====================================================================
   ARC — điều phối chơi đơn / đua / theo lượt. Các game gọi:
     ARC.prog(key, x)            tiến độ (điểm, hoặc % hoàn thành)
     ARC.done(key, {vk, v})      kết thúc ván (vk = bảng xếp hạng, v = giá trị)
     ARC.race(key)               đang đua game này không?
     ARC.turnMove(key, state)    gửi trạng thái sau nước đi (game theo lượt)
   ===================================================================== */
ARC = (() => {
  const $ = id => document.getElementById(id);
  let code=null, room=null, unsubRoom=null, unsubChat=null, resumeWanted=false;
  let race=null;   // {key, round, startAt, limit, settings, finished, score, pct, lastSent}
  let turn=null;   // {key, round}
  let realRandom = Math.random;
  let countedLocal = pstore.get('arcade_counted', {});
  const P = p => ROOT+'/'+p;

  /* ---------- tiện ích ---------- */
  function seed(s){ Math.random = mulberry(s); }
  function unseed(){ Math.random = realRandom; }
  const playersOf = d => Object.entries((d && d.players) || {}).map(([id,p])=>Object.assign({id}, p)).sort((a,b)=>(a.seat||0)-(b.seat||0));
  const online = p => p.on !== false;
  function leaderId(d){ const ps=playersOf(d).filter(p=>online(p)&&!p.bot); if(d.players && d.players[d.host] && online(d.players[d.host])) return d.host; return ps.length ? ps[0].id : null; }
  const amLeader = d => leaderId(d) === ME.id;
  const isHost = d => d && d.host === ME.id;
  const settingsDefault = key => { const o={}; (REG[key].set||[]).forEach(s=>o[s.k]=s.def); return o; };

  /* ---------- best / stats ---------- */
  async function best(vk, v){
    if(!ME.id || v==null || isNaN(v)) return;
    const b = Object.values(BOARDS).flat().find(x=>x[0]===vk); if(!b) return;
    const cur = await Net.get(P('best/'+vk+'/'+ME.id));
    const better = !cur || (b[2]==='max' ? v>cur.v : v<cur.v);
    if(better) Net.set(P('best/'+vk+'/'+ME.id), { n:ME.n, a:ME.a, v, at:Net.TS });
  }
  async function countStats(key, list, roundKey){
    if(countedLocal[roundKey]) return;
    const mine = list.find(x=>x.id===ME.id); if(!mine) return;
    countedLocal[roundKey]=1; pstore.set('arcade_counted', countedLocal);
    const cur = (await Net.get(P('stats/'+ME.id+'/g/'+key))) || { p:0, w:0 };
    cur.p++; if(mine.rank===1 && list.length>1) cur.w++;
    await Net.update(P('stats/'+ME.id), { n:ME.n, a:ME.a, ['g/'+key]:cur });
    if(REG[key].mp!=='race' && mine.rank===1 && list.length>1){
      const b=(await Net.get(P('best/_wins-'+key+'/'+ME.id))) || {v:0};
      Net.set(P('best/_wins-'+key+'/'+ME.id), { n:ME.n, a:ME.a, v:(b.v||0)+1, at:Net.TS });
    }
  }

  /* ---------- API cho các game ---------- */
  const api = {
    race(key){ return race && race.key===key && !race.finished ? race : null; },
    inRace(key){ return !!(race && race.key===key); },
    turn(key){ return turn && turn.key===key ? turn : null; },
    prog(key, x){
      if(!race || race.key!==key || race.finished) return;
      if(REG[key].metric==='score') race.score = x; else race.pct = x;
      sendProg();
    },
    done(key, r){
      if(r && r.vk) best(r.vk, r.v);
      if(!race || race.key!==key || race.finished) return;
      if(REG[key].metric==='score' && r && r.v!=null) race.score = r.v;
      finishRace(false);
    },
    turnMove(key, state){ if(!turn || turn.key!==key || !code) return; Net.set(P('rooms/'+code+'/state'), state); },
    best,
    get code(){ return code; }, get room(){ return room; },
  };

  /* ---------- đua ---------- */
  function elapsed(){ return race ? Math.max(0, (Net.now()-race.startAt)/1000) : 0; }
  let progTimer=null;
  function sendProg(){
    if(progTimer) return;
    progTimer = setTimeout(()=>{ progTimer=null; if(!race || !code) return;
      Net.update(P('rooms/'+code+'/players/'+ME.id), { score:race.score||0, pct:race.pct||0 }); }, 600);
  }
  function finishRace(dnf){
    if(!race || race.finished) return;
    race.finished = true;
    const t = Math.round(elapsed()*10)/10;
    const upd = { done:true, dnf:!!dnf, score:race.score||0, pct: dnf ? (race.pct||0) : 100, time: t };
    Net.update(P('rooms/'+code+'/players/'+ME.id), upd);
    toast(dnf ? '⏱ Hết giờ!' : '🏁 Bạn đã về đích! Chờ mọi người…');
    renderBar();
  }
  function beginRace(d){
    race = { key:d.game, round:d.round, startAt:d.startAt, limit:(REG[d.game].fixed || (d.settings && d.settings.limit) || 600), settings:d.settings||{}, finished:false, score:0, pct:0, started:false };
    seed(d.seed);
    document.body.classList.add('mp');
    go(d.game);
    const cd = $('cd'); cd.classList.add('on');
    const tick = () => {
      if(!race || race.round!==d.round) { cd.classList.remove('on'); return; }
      const left = Math.ceil((race.startAt - Net.now())/1000);
      if(left>0){ cd.querySelector('b').textContent=left; cd.querySelector('small').textContent=REG[race.key].i+' '+REG[race.key].n+' — chuẩn bị!'; beep(520,.08); setTimeout(tick, Math.min(1000, race.startAt-Net.now()-(left-1)*1000)); return; }
      cd.classList.remove('on'); beep(880,.2);
      race.started = true;
      if(current!==race.key) go(race.key);
      try{ GAMES[race.key].race(race.settings); }catch(e){ console.error(e); toast('Lỗi khởi động game: '+e.message); }
      renderBar();
    };
    tick();
  }
  function endRace(){
    if(!race) return;
    race=null; unseed(); document.body.classList.remove('mp'); $('cd').classList.remove('on');
    renderBar();
  }
  setInterval(() => {
    if(race && race.started){
      if(!race.finished && elapsed() >= race.limit){
        if(REG[race.key].metric==='score') finishRace(false); else finishRace(true);
      }
      renderBarTime();
    }
    if(room && code && room.status==='playing' && amLeader(room)) checkFinalize(room);
  }, 500);

  function rankRace(d){
    const key=d.game, m=REG[key].metric;
    const ps = playersOf(d).filter(p=>p.r===d.round);
    let rows;
    if(m==='score'){
      rows = ps.map(p=>({ id:p.id, n:p.n, a:p.a, k:p.score||0, txt:(p.score||0)+' điểm'+(p.on===false&&!p.done?' (rời)':'') })).sort((a,b)=>b.k-a.k);
      let r=0, last=null; rows.forEach((x,i)=>{ if(x.k!==last){ r=i+1; last=x.k; } x.rank=r; });
    } else {
      const fin = ps.filter(p=>p.done && !p.dnf).sort((a,b)=>a.time-b.time);
      const un  = ps.filter(p=>!(p.done && !p.dnf)).sort((a,b)=>(b.pct||0)-(a.pct||0));
      rows = fin.map((p,i)=>({ id:p.id, n:p.n, a:p.a, rank:i+1, txt:fmtT(Math.round(p.time)) }))
        .concat(un.map((p,i)=>({ id:p.id, n:p.n, a:p.a, rank:fin.length+1+i, txt:'Chưa xong ('+(p.pct||0)+'%)' })));
    }
    return rows;
  }
  function checkFinalize(d){
    if(d.result && d.result.round===d.round) return;
    const key=d.game;
    if(REG[key].mp==='table'){ const rows=TABLE.resultIfOver(d); if(rows) finalize(d, rows); return; }
    if(REG[key].mp==='race'){
      const ps = playersOf(d).filter(p=>p.r===d.round);
      const lim = REG[key].fixed || (d.settings && d.settings.limit) || 600;
      const timeUp = Net.now() > d.startAt + (lim+4)*1000;
      const allDone = ps.length && ps.every(p=>p.done || p.on===false);
      if(timeUp || allDone) finalize(d, rankRace(d));
    } else {
      const s=d.state||{}, ps=playersOf(d).filter(p=>p.r===d.round);
      const left = ps.filter(p=>p.on===false);
      if(s.o){ finalize(d, GAMES[key].mpResult(s, ps)); }
      else if(left.length && ps.length-left.length<=1){
        const rows = ps.map(p=>({ id:p.id, n:p.n, a:p.a, rank: p.on===false?2:1, txt: p.on===false?'Bỏ cuộc':'Thắng' }));
        finalize(d, rows);
      }
    }
  }
  function finalize(d, list, note){
    const res = { round:d.round, list, at:Net.TS }; if(note) res.note=note;
    Net.update(P('rooms/'+code), { status:'done', result:res });
    const m = { g:d.game, at:Net.TS, mode:REG[d.game].mp, list }; if(note) m.note=note;
    Net.set(P('matches/'+code+'_'+d.round+'_'+d.startAt), m);
  }

  /* ---------- theo lượt ---------- */
  function beginTurn(d){
    turn = { key:d.game, round:d.round };
    document.body.classList.add('mp');
    go(d.game);
    const ps = playersOf(d).filter(p=>p.r===d.round);
    const me = ps.find(p=>p.id===ME.id);
    const seats = {}; ps.forEach(p=>seats[p.seat]={ n:p.n, a:p.a, id:p.id });
    GAMES[d.game].mpStart({ mySeat: me ? me.seat : 0, seats, n: ps.length, settings:d.settings||{} });
    renderBar();
  }
  function endTurn(){
    if(!turn) return; const k=turn.key; turn=null;
    try{ GAMES[k].mpStop(); }catch(e){}
    document.body.classList.remove('mp'); renderBar();
  }

  /* ---------- thanh trạng thái khi đang đấu ---------- */
  function renderBarTime(){
    const t=$('rb-time'); if(!t || !race) return;
    const lim=race.limit, e=elapsed();
    t.textContent = '⏱ '+fmtT(Math.floor(e))+(lim<900?' / '+fmtT(lim):'');
  }
  function renderBar(){
    const bar=$('rbar');
    if(!(race || turn) || !room){ bar.classList.remove('on'); return; }
    bar.classList.add('on');
    const key = room.game, ps = playersOf(room).filter(p=>p.r===room.round);
    let chips;
    if(race){
      const m=REG[key].metric;
      const sorted = ps.slice().sort((a,b)=> m==='score' ? (b.score||0)-(a.score||0) : ((b.done&&!b.dnf)-(a.done&&!a.dnf)) || (m==='time'&&a.done&&b.done ? a.time-b.time : (b.pct||0)-(a.pct||0)));
      chips = sorted.map((p,i)=>`<span class="rchip${p.id===ME.id?' me':''}${p.on===false?' off':''}">${['🥇','🥈','🥉'][i]||(i+1)+'.'} ${escH(p.a)} ${escH(p.n)} <b>${m==='score' ? (p.score||0) : p.done&&!p.dnf ? '🏁 '+fmtT(Math.round(p.time)) : (p.pct||0)+'%'}</b></span>`).join('');
    } else {
      const s=room.state||{};
      chips = ps.map(p=>`<span class="rchip${p.id===ME.id?' me':''}${s.t===p.seat&&!s.o?' turn':''}${p.on===false?' off':''}">${escH(p.a)} ${escH(p.n)}${s.sc? ' <b>'+(s.sc[p.seat]||0)+'</b>':''}</span>`).join('');
    }
    bar.innerHTML = `<span class="rcode">#${escH(code)}</span>${race?'<span class="rtime" id="rb-time"></span>':''}<div class="rchips">${chips}</div><button class="rquit" id="rb-quit">✖</button>`;
    $('rb-quit').onclick = () => confirmBox('Thoát trận?', race ? 'Bạn sẽ bị tính là chưa hoàn thành.' : 'Bạn sẽ bị xử thua.', 'Thoát', ()=>{
      if(race && !race.finished) finishRace(true);
      leaveRoom();
    });
    renderBarTime();
  }

  /* ---------- phòng ---------- */
  const BOT_NAMES=[['Robo Tèo','🤖'],['Robo Tí','👾'],['Robo Bin','🦾'],['Robo Mít','🛸'],['Robo Na','🧠'],['Robo Ổi','🎃'],['Robo Xoài','🐙']];
  function botEntry(d, i){ const used=new Set(playersOf(d).map(p=>p.id)); let k=1; while(used.has('__AI__'+k)) k++; const b=BOT_NAMES[(k-1)%BOT_NAMES.length]; return ['__AI__'+k, { n:b[0], a:b[1], bot:true, on:true, seat:100+k }]; }
  async function addBot(){ const d=room; if(!d||!isHost(d)||d.status==='playing') return; if(playersOf(d).length>=REG[d.game].max) return toast('Bàn đã đủ người'); const [id,v]=botEntry(d); await Net.update(P('rooms/'+code+'/players'), { [id]:v }); }
  async function kick(id){ if(!room||!isHost(room)||room.status==='playing'||id===ME.id) return; await Net.update(P('rooms/'+code+'/players'), { [id]:null }); }
  async function createRoom(key, opts){
    if(!ME.id) return go('setup');
    opts = opts || {};
    let c;
    for(let k=0;k<12;k++){ c=String(100+Math.floor(realRandom()*900)); const ex=await Net.get(P('rooms/'+c)); const ex2=await Net.get('rooms/'+c); if(!ex2 && (!ex || (ex.created && Net.now()-ex.created>6*3600e3))) break; }
    const d0 = { game:key, host:ME.id, status:'lobby', round:0, created:Net.TS, settings:settingsDefault(key), solo:!!opts.solo,
      players:{ [ME.id]:{ n:ME.n, a:ME.a, seat:1, on:true } } };
    for(let k=0;k<(opts.bots||0);k++){ const [id,v]=botEntry(d0); d0.players[id]=v; }
    await Net.set(P('rooms/'+c), d0);
    enterRoom(c);
  }
  async function joinRoom(c){
    c=String(c||'').trim();
    if(!/^\d{3}$/.test(c)) return toast('⚠️ Mã phòng gồm 3 chữ số');
    if(!ME.id){ pstore.set('arcade_pending', c); return go('setup'); }
    const d = await Net.get(P('rooms/'+c));
    if(!d) return toast('❌ Không tìm thấy phòng #'+c);
    const ps = playersOf(d);
    if(!(d.players && d.players[ME.id])){
      if(ps.length >= REG[d.game].max) return toast('❌ Phòng đã đủ người');
      const seat = Math.max(0, ...ps.map(p=>p.seat||0)) + 1;
      await Net.update(P('rooms/'+c+'/players'), { [ME.id]:{ n:ME.n, a:ME.a, seat, on:true } });
    }
    enterRoom(c);
  }
  function enterRoom(c){
    if(code && code!==c) leaveRoom(true);
    code=c; pstore.set('arcade_room', c);
    history.replaceState(null, '', location.pathname + '?arc=' + c + (/[?&]local=1/.test(location.search)?'&local=1':'') + location.hash);
    const pp = P('rooms/'+c+'/players/'+ME.id);
    Net.update(pp, { on:true, n:ME.n, a:ME.a });
    Net.onDisc(pp+'/on', false);
    if(unsubRoom) unsubRoom();
    unsubRoom = Net.on(P('rooms/'+c), d => onRoom(d));
    if(unsubChat) unsubChat();
    unsubChat = Net.on(P('rooms/'+c+'/chat'), ch => renderChat(ch));
    presence('Phòng #'+c);
    if(current!=='room') go('room'); else renderRoom();
  }
  async function leaveRoom(silent){
    if(!code) return;
    const c=code, d=room;
    if(race) endRace(); if(turn) endTurn(); TABLE.leave();
    if(unsubRoom) unsubRoom(); if(unsubChat) unsubChat(); unsubRoom=unsubChat=null;
    Net.cancelDisc(P('rooms/'+c+'/players/'+ME.id+'/on'));
    code=null; room=null; pstore.set('arcade_room', null);
    history.replaceState(null,'', location.pathname + (/[?&]local=1/.test(location.search)?'?local=1':'') + location.hash);
    if(d){
      const others = playersOf(d).filter(p=>p.id!==ME.id && online(p) && !p.bot);
      if(!others.length) await Net.remove(P('rooms/'+c));
      else {
        const upd = { ['players/'+ME.id]: null };
        if(d.host===ME.id) upd.host = others[0].id;
        await Net.update(P('rooms/'+c), upd);
      }
    }
    presence('Sảnh');
    if(!silent) go('');
  }
  function onRoom(d){
    if(!code) return;
    if(!d){ toast('Phòng đã đóng'); const c=code; code=null; if(race) endRace(); if(turn) endTurn(); if(unsubRoom) unsubRoom(); if(unsubChat) unsubChat(); pstore.set('arcade_room',null); if(c) go(''); return; }
    if(d.players && !d.players[ME.id]){ toast('Bạn đã rời phòng'); leaveRoom(); return; }
    room = d;
    const me = (d.players||{})[ME.id] || {};
    // vào ván mới
    if(d.status==='playing' && me.r===d.round){
      if(REG[d.game].mp==='table'){
        TABLE.onRoom(d, true);
        if(resumeWanted){ resumeWanted=false; TABLE.open(d); }
      } else if(REG[d.game].mp==='race'){
        if(!race || race.round!==d.round) beginRace(d);
        if(resumeWanted){ resumeWanted=false; go(d.game); }
      } else {
        if(!turn || turn.round!==d.round) beginTurn(d);
        if(d.state) GAMES[d.game].mpApply(d.state);
        if(resumeWanted){ resumeWanted=false; go(d.game); }
      }
    } else if(resumeWanted && d.status!=='playing') resumeWanted=false;
    // ván kết thúc
    if(d.status==='done' && d.result){
      countStats(d.game, d.result.list, code+'_'+d.result.round+'_'+(d.startAt||0));
      if(race && race.round===d.round){ endRace(); setTimeout(()=>go('room'), 300); }
      if(turn && turn.round===d.round){ const k=turn.key; if(d.state) GAMES[k].mpApply(d.state); setTimeout(()=>{ endTurn(); go('room'); }, 1800); }
    }
    if(REG[d.game].mp==='table' && !(d.status==='playing' && me.r===d.round)) TABLE.onRoom(d, false);
    if(d.status==='lobby'){ if(race) endRace(); if(turn) endTurn(); }
    renderBar();
    if(current==='room') renderRoom();
  }
  async function startGame(){
    const d=room; if(!d || !isHost(d)) return;
    const key=d.game, R=REG[key], ps=playersOf(d).filter(online);
    if((R.mp==='turn'||R.mp==='table') && (ps.length<R.min || ps.length>R.max)) return toast('⚠️ Game này cần '+(R.min===R.max?R.min:R.min+'–'+R.max)+' người'+(R.bots?' — bấm 🤖 Thêm máy':''));
    const round=(d.round||0)+1, upd={ status:'playing', round, seed:Math.floor(realRandom()*2e9), startAt:Net.now()+(R.mp==='race'?3600:0), result:null };
    ps.forEach((p,i)=>{ upd['players/'+p.id+'/r']=round; upd['players/'+p.id+'/seat']=i+1;
      Object.assign(upd, { ['players/'+p.id+'/done']:false, ['players/'+p.id+'/dnf']:false, ['players/'+p.id+'/score']:0, ['players/'+p.id+'/pct']:0, ['players/'+p.id+'/time']:null }); });
    if(R.mp==='turn') upd.state = GAMES[key].mpInit(d.settings||{}, ps.length, round, mulberry(upd.seed));
    if(R.mp==='table'){ upd.acts=null; upd.emo=null; upd.state = TABLE.init(key, ps.map(p=>({ id:p.id, n:p.n, a:p.a, bot:!!p.bot })), d.settings||{}, round, mulberry(upd.seed)); }
    await Net.update(P('rooms/'+code), upd);
  }
  async function backToLobby(){ if(room && isHost(room)) Net.update(P('rooms/'+code), { status:'lobby', state:null }); }
  // chủ phòng dừng ván giữa chừng: các ván đã chơi xong vẫn được tính điểm và ghi vào lịch sử
  function stopTable(){
    if(!room || !isHost(room)) return;
    if(room.status==='playing' && REG[room.game] && REG[room.game].mp==='table'){
      const p = TABLE.partial(room);
      if(p && p.rows && p.rows.length){ finalize(room, p.rows, p.note || '⏹ Dừng sớm'); return; }
    }
    backToLobby();
  }
  function setSetting(k, v){ if(room && isHost(room) && room.status!=='playing') Net.update(P('rooms/'+code+'/settings'), { [k]:v }); }

  /* ---------- giao diện phòng ---------- */
  function renderRoom(){
    const el=$('room-body'); if(!el) return;
    if(!room){ el.innerHTML='<div class="empty">Đang kết nối phòng…</div>'; return; }
    const d=room, R=REG[d.game], ps=playersOf(d), host=isHost(d);
    $('room-title').textContent = R.i+' '+R.n;
    const link = location.href.split('?')[0].split('#')[0] + '?arc=' + code + (/[?&]local=1/.test(location.search)?'&local=1':'');
    let h = `<div class="rcard codebox"><small>MÃ PHÒNG</small><b>${escH(code)}</b><button class="blue" id="rm-copy">📋 Copy link mời</button><div class="lnk">${escH(link)}</div></div>`;
    // kết quả ván trước
    if(d.result && d.result.list){
      h += `<div class="rcard"><div class="rh">🏆 Kết quả ván ${d.result.round}${d.result.note?` <small class="rnote">${escH(d.result.note)}</small>`:''}</div>` + d.result.list.map(x=>`<div class="rrow${x.id===ME.id?' me':''}"><span class="rk">${['🥇','🥈','🥉'][x.rank-1]||x.rank+'.'}</span><span class="ra">${escH(x.a)}</span><span class="rn">${escH(x.n)}</span><span class="rv">${escH(x.txt)}</span></div>`).join('') + `</div>`;
    }
    // người chơi
    const canEdit = host && d.status!=='playing' && R.mp==='table';
    h += `<div class="rcard"><div class="rh">👥 Người chơi (${ps.length}/${R.max})</div>` + ps.map(p=>`<div class="rrow${p.id===ME.id?' me':''}"><span class="ra">${escH(p.a)}</span><span class="rn">${escH(p.n)}${p.id===d.host?' 👑':''}${p.id===ME.id?' (bạn)':''}</span><span class="rv">${p.bot?'🤖 máy':p.on===false?'<i class="dot off"></i>mất kết nối':'<i class="dot"></i>online'}</span>${canEdit&&p.id!==ME.id?`<button class="kick" data-kick="${escH(p.id)}">✕</button>`:''}</div>`).join('')
      + (canEdit && ps.length<R.max ? `<button class="blue" id="rm-bot">🤖 Thêm máy chơi cùng</button>` : '') + `</div>`;
    // cài đặt
    if((R.set||[]).length){
      h += `<div class="rcard"><div class="rh">⚙️ Cài đặt${host?'':' (chủ phòng chọn)'}</div>` + R.set.map(s=>`<div class="sline"><span>${s.n}</span><div class="seg">${s.opts.map(([v,l])=>`<button class="${(d.settings||{})[s.k]==v?'on':''}" ${host&&d.status!=='playing'?'':'disabled'} data-k="${s.k}" data-v="${v}">${l}</button>`).join('')}</div></div>`).join('') + `</div>`;
    }
    // hành động
    const modeTxt = R.mp==='race' ? 'Đua cùng đề: mọi người chơi cùng một màn, xếp hạng theo '+(R.metric==='score'?'điểm':'thời gian hoàn thành')+'.' : R.mp==='table' ? TABLE.about(d.game) : 'Đối kháng theo lượt, '+(R.min===R.max?R.min:R.min+'–'+R.max)+' người.';
    h += `<div class="rcard"><div class="mtxt">${modeTxt}</div>`;
    if(d.status==='playing') h += `<button class="primary big" id="rm-rejoin">${R.mp==='table' && (d.players[ME.id]||{}).r!==d.round ? '👀 Xem trận đang chơi' : '▶ Vào trận đang chơi'}</button>`;
    else if(host) h += `<button class="primary big" id="rm-start">▶ ${d.round?'Chơi ván mới':'Bắt đầu'}</button>`;
    else h += `<div class="wait">⏳ Đang chờ chủ phòng bắt đầu…</div>`;
    h += `<button id="rm-leave">🚪 Rời phòng</button></div>`;
    // chat
    h += `<div class="rcard"><div class="rh">💬 Chat</div><div class="chat" id="chat"></div><form class="cin" id="cform"><button type="button" class="ebtn" id="cemo2" title="Chọn emoji">😊</button><input id="cmsg" maxlength="120" placeholder="Nhắn gì đó…" autocomplete="off"><button class="blue">➤</button></form></div>`;
    el.innerHTML = h;
    $('rm-copy').onclick = () => { try{ navigator.clipboard.writeText(link).then(()=>toast('✅ Đã copy link'), ()=>toast(link, 5000)); }catch(e){ toast(link,5000); } };
    $('rm-leave').onclick = () => leaveRoom();
    if($('rm-start')) $('rm-start').onclick = startGame;
    if($('rm-bot')) $('rm-bot').onclick = addBot;
    el.querySelectorAll('[data-kick]').forEach(b=>b.onclick=()=>kick(b.dataset.kick));
    if($('rm-rejoin') && R.mp==='table') $('rm-rejoin').onclick = () => { TABLE.open(d); };
    else if($('rm-rejoin')) $('rm-rejoin').onclick = () => { const me=d.players[ME.id]; if(me.r!==d.round) return toast('Ván này đã bắt đầu trước khi bạn vào — chờ ván sau nhé'); if(REG[d.game].mp==='race'){ if(race) go(d.game); else beginRace(d); } else { if(!turn) beginTurn(d); else go(d.game); GAMES[d.game].mpApply(d.state||{}); } };
    el.querySelectorAll('.seg button[data-k]').forEach(b => b.onclick = () => setSetting(b.dataset.k, isNaN(+b.dataset.v)?b.dataset.v:+b.dataset.v));
    EmojiPicker.attach($('cmsg'), $('cemo2'));
    $('cform').onsubmit = e => { e.preventDefault(); EmojiPicker.close(); const m=$('cmsg').value.trim(); if(!m) return; $('cmsg').value=''; Net.push(P('rooms/'+code+'/chat'), { id:ME.id, n:ME.n, a:ME.a, t:m, ts:Net.TS }); };
    renderChat(lastChat);
  }
  let lastChat=null;
  function renderChat(ch){
    lastChat=ch; const el=$('chat'); if(!el) return;
    const items=Object.values(ch||{}).sort((a,b)=>(a.ts||0)-(b.ts||0)).slice(-40);
    el.innerHTML = items.length ? items.map(m=>`<div class="cm"><b>${escH(m.a)} ${escH(m.n)}:</b> ${escH(m.t)}</div>`).join('') : '<div class="empty">Chưa có tin nhắn</div>';
    el.scrollTop = el.scrollHeight;
  }

  /* ---------- online / sảnh ---------- */
  let where='Sảnh';
  // nhật ký người chơi / thiết bị — chỉ xem được trong trang Quản trị (có mã PIN)
  async function logVisit(){
    try{
      let dev = store.get('gh_device', null);
      if(!dev){ dev = 'd'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); store.set('gh_device', dev); }
      const path = P('visitors/'+dev);
      const prev = await Net.get(path) || {};
      const upd = { n:ME.n||'(chưa đặt tên)', a:ME.a||'', pid:ME.id||'', ua:(navigator.userAgent||'').slice(0,200),
        lang:navigator.language||'', scr:(screen.width||0)+'x'+(screen.height||0), tz:(Intl.DateTimeFormat().resolvedOptions().timeZone||''),
        last:Net.TS, visits:(prev.visits||0)+1 };
      if(!prev.first) upd.first = Net.TS;
      if(prev.ip) upd.ip = prev.ip;
      Net.update(path, upd);
      if(!LOCAL_MODE){ try{
        const ctl = new AbortController(); const tm=setTimeout(()=>ctl.abort(), 4000);
        const r = await fetch('https://api.ipify.org?format=json', { signal:ctl.signal }); clearTimeout(tm);
        const j = await r.json(); if(j && j.ip) Net.update(path, { ip:j.ip });
      }catch(e){} }
    }catch(e){}
  }
  function presence(w){
    if(w) where=w; if(!ME.id) return;
    const p=P('online/'+ME.id);
    Net.set(p, { n:ME.n, a:ME.a, w:where, ts:Net.TS }); Net.onDisc(p, null);
  }
  Net.onConnected(()=>{ presence(); if(code){ Net.update(P('rooms/'+code+'/players/'+ME.id), { on:true }); Net.onDisc(P('rooms/'+code+'/players/'+ME.id+'/on'), false); } });
  let roomsCache={}, legacyRooms={};
  function watchLobby(){
    Net.on(P('online'), o => { const n=Object.keys(o||{}).length; $('m-online').textContent = '🟢 '+n+' online'; });
    let cleanedA=false, cleanedL=false;
    Net.on(P('rooms'), rs => { roomsCache=rs||{}; renderOpenRooms(); if(!cleanedA){ cleanedA=true; autoClean(roomsCache, true); } });
    Net.on('rooms', rs => { legacyRooms=rs||{}; renderOpenRooms(); if(!cleanedL){ cleanedL=true; autoClean(legacyRooms, false); } });
  }
  // phòng quá 24 giờ thì tự xóa (ai mở sảnh cũng dọn giúp)
  function autoClean(rs, arcade){
    const now=Net.now(), DAY=24*3600e3;
    Object.entries(rs||{}).forEach(([id,v])=>{
      const t = arcade ? v && v.created : v && v.ts;
      if(t && now-t > DAY){ if(arcade) Net.remove(P('rooms/'+id)); else { Net.remove('rooms/'+id); Net.remove('chats/'+id); } }
    });
  }
  async function joinAny(c){
    c=String(c||'').trim();
    if(!/^\d{3}$/.test(c)) return toast('⚠️ Mã phòng gồm 3 chữ số');
    const a = await Net.get(P('rooms/'+c));
    if(a) return joinRoom(c);
    toast('❌ Không tìm thấy phòng #'+c);
  }
  function openRooms(key){
    return Object.entries(roomsCache).map(([c,d])=>Object.assign({c}, d))
      .filter(d=>d.status!=='closed' && !d.solo && (!key || d.game===key) && REG[d.game] && playersOf(d).some(p=>online(p)&&!p.bot) && (!d.created || Net.now()-d.created < 6*3600e3))
      .sort((a,b)=>(b.created||0)-(a.created||0));
  }
  function roomItem(d){
    const ps=playersOf(d), R=REG[d.game];
    return `<div class="ritem"><span class="ri">${R.i}</span><div class="rinfo"><b>${escH(R.n)} <span class="rcd">#${d.c}</span></b><small>${ps.map(p=>escH(p.a)).join(' ')} · ${ps.length}/${R.max} · ${d.status==='playing'?'đang chơi':'đang chờ'}</small></div><button class="green" onclick="ARC.joinRoom('${d.c}')">Vào</button></div>`;
  }
  function renderOpenRooms(){
    const el=$('m-rooms'); if(!el) return;
    const list=openRooms();
    const html = list.slice(0,10).map(roomItem);
    el.innerHTML = html.length ? html.join('') : '<div class="empty">Chưa có phòng nào — tạo phòng rồi gửi mã cho bạn bè nhé!</div>';
    const gs=$('gs-rooms'); if(gs && gs.dataset.k){ const l2=openRooms(gs.dataset.k); gs.innerHTML = l2.length ? l2.map(roomItem).join('') : '<div class="empty">Chưa có phòng nào cho game này</div>'; }
  }

  /* ---------- bảng chọn chế độ cho từng game ---------- */
  function openGame(key){
    if(!REG[key]){ toast('⚠️ Trang đang dùng bản cũ — bấm Ctrl+F5 (hoặc kéo xuống để tải lại) rồi thử lại', 4500); return; }
    const R=REG[key], sh=$('gsheet');
    const mpTxt = R.mp==='race' ? `Đua 1–${R.max} người, cùng một đề` : R.mp==='table' ? `${R.min===R.max?R.max:'Tối đa '+R.max} người, mời bạn bằng mã phòng` : `Đối kháng ${R.min===R.max?R.min:R.min+'–'+R.max} người`;
    sh.innerHTML = `<div class="sheet"><div class="sh-h"><span class="sh-i">${R.i}</span><b>${escH(R.n)}</b><button class="ghost" id="gs-x">✕</button></div>
      <button class="primary big" id="gs-solo">${R.mp==='table'?'🤖 Chơi với máy':'🎮 Chơi đơn'}</button>
      <button class="blue big" id="gs-create">👥 Tạo phòng online <small>${mpTxt}</small></button>
      <div class="joinrow"><input id="gs-code" maxlength="3" inputmode="numeric" placeholder="Mã phòng"><button class="green" id="gs-join">Vào</button></div>
      <div class="rh">Phòng đang mở</div><div id="gs-rooms" data-k="${key}"></div>
      <button class="ghost wide" id="gs-rank">🏆 Bảng xếp hạng ${escH(R.n)}</button></div>`;
    sh.classList.add('on');
    const close=()=>sh.classList.remove('on');
    $('gs-x').onclick=close; sh.onclick=e=>{ if(e.target===sh) close(); };
    $('gs-solo').onclick=()=>{ close(); if(R.mp==='table') createRoom(key, { bots:R.bots, solo:true }); else go(key); };
    $('gs-create').onclick=()=>{ close(); createRoom(key); };
    $('gs-join').onclick=()=>{ close(); joinRoom($('gs-code').value); };
    $('gs-code').onkeydown=e=>{ if(e.key==='Enter'){ close(); joinRoom(e.target.value); } };
    $('gs-rank').onclick=()=>{ close(); rankGame=key; rankBoard=0; go('rank'); };
    renderOpenRooms();
  }
  function confirmBox(title, text, ok, fn){
    const sh=$('gsheet');
    sh.innerHTML=`<div class="sheet small"><b class="sh-t">${escH(title)}</b><p>${escH(text)}</p><div class="row2"><button id="cf-no">Ở lại</button><button class="primary" id="cf-ok">${escH(ok)}</button></div></div>`;
    sh.classList.add('on'); $('cf-no').onclick=()=>sh.classList.remove('on'); $('cf-ok').onclick=()=>{ sh.classList.remove('on'); fn(); };
  }

  /* ---------- bảng xếp hạng ---------- */
  let rankGame='2048', rankBoard=0, rankTab='best';
  async function renderRank(){
    const gEl=$('rk-games'), bEl=$('rk-boards'), list=$('rk-list');
    gEl.innerHTML = Object.keys(REG).map(k=>`<button class="${k===rankGame?'on':''}" data-g="${k}">${REG[k].i} ${escH(REG[k].n)}</button>`).join('');
    gEl.querySelectorAll('button').forEach(b=>b.onclick=()=>{ rankGame=b.dataset.g; rankBoard=0; renderRank(); });
    document.querySelectorAll('#rk-tabs button').forEach(b=>{ b.classList.toggle('on', b.dataset.t===rankTab); b.onclick=()=>{ rankTab=b.dataset.t; renderRank(); }; });
    gEl.style.display = bEl.style.display = rankTab==='best' ? '' : 'none';
    list.innerHTML='<div class="empty">Đang tải…</div>';
    if(rankTab==='best'){
      const boards=BOARDS[rankGame]||[];
      bEl.innerHTML = boards.length>1 ? boards.map((b,i)=>`<button class="${i===rankBoard?'on':''}" data-i="${i}">${escH(b[1])}</button>`).join('') : '';
      bEl.querySelectorAll('button').forEach(b=>b.onclick=()=>{ rankBoard=+b.dataset.i; renderRank(); });
      const b=boards[rankBoard]; if(!b){ list.innerHTML='<div class="empty">Chưa có bảng</div>'; return; }
      const vk = b[0]==='_wins' ? '_wins-'+rankGame : b[0];
      const data = await Net.get(P('best/'+vk)) || {};
      const rows = Object.entries(data).map(([id,x])=>Object.assign({id},x)).sort((x,y)=> b[2]==='max' ? y.v-x.v : x.v-y.v).slice(0,30);
      list.innerHTML = rows.length ? rows.map((x,i)=>`<div class="rrow${x.id===ME.id?' me':''}"><span class="rk">${['🥇','🥈','🥉'][i]||(i+1)+'.'}</span><span class="ra">${escH(x.a)}</span><span class="rn">${escH(x.n)}</span><span class="rv">${escH(fmtVal(x.v,b[3]))}</span></div>`).join('') : '<div class="empty">Chưa có ai trên bảng này. Chơi một ván để ghi danh!</div>';
    } else if(rankTab==='matches'){
      const ms = await Net.recent(P('matches'), 'at', 40);
      list.innerHTML = ms.length ? ms.map(m=>{ const R=REG[m.g]||{i:'🎮',n:m.g}; const d=new Date(m.at||0);
        return `<div class="mrow"><div class="mh">${R.i} <b>${escH(R.n)}</b> <small>${m.mode==='race'?'đua':'đối kháng'}${m.note?' · '+escH(m.note):''} · ${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</small></div>`
          + (m.list||[]).map(x=>`<div class="rrow sm${x.id===ME.id?' me':''}"><span class="rk">${['🥇','🥈','🥉'][x.rank-1]||x.rank+'.'}</span><span class="ra">${escH(x.a)}</span><span class="rn">${escH(x.n)}</span><span class="rv">${escH(x.txt)}</span></div>`).join('') + '</div>'; }).join('')
        : '<div class="empty">Chưa có trận online nào được ghi lại.</div>';
    } else {
      const s = await Net.get(P('stats/'+ME.id)) || {};
      const g = s.g || {}; const keys=Object.keys(g);
      let tp=0, tw=0; keys.forEach(k=>{ tp+=g[k].p||0; tw+=g[k].w||0; });
      list.innerHTML = `<div class="mystat"><div><small>TRẬN ONLINE</small><b>${tp}</b></div><div><small>THẮNG</small><b>${tw}</b></div><div><small>TỈ LỆ</small><b>${tp?Math.round(tw*100/tp):0}%</b></div></div>`
        + (keys.length ? keys.map(k=>`<div class="rrow"><span class="ra">${REG[k]?REG[k].i:'🎮'}</span><span class="rn">${escH(REG[k]?REG[k].n:k)}</span><span class="rv">${g[k].w||0} thắng / ${g[k].p||0} trận</span></div>`).join('') : '<div class="empty">Bạn chưa chơi trận online nào.</div>');
    }
  }

  /* ---------- màn hình nhập tên ---------- */
  const AVCATS = {
    'Mặt':['😎','😀','😁','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😜','🤪','🤓','🧐','🥳','😏','😴','🤠','🥸','🤡','👻','💀','👽','🤖','😺','🎃'],
    'Thú':['🦊','🐼','🦁','🐯','🐸','🦄','🐧','🐔','🦆','🐙','🐳','🦀','🐉','🐮','🐷','🐹','🐰','🐨','🐻','🐵','🦋','🐢','🦉','🐺','🐶','🐱','🦖','🐍'],
    'Đồ ăn':['🍕','🍔','🍟','🌮','🍣','🍜','🍩','🍪','🍰','🧁','🍦','🍉','🍓','🍒','🍍','🥑','🌽','🍄','🧋','☕'],
    'Khác':['⚡','🔥','🌈','⭐','🌙','☀️','🎯','🎮','🎲','🏀','⚽','🎸','🚀','💎','👑','🍀','🌸','🌻','🎈','🎁']
  };
  const AVCOLS = ['#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#3b82f6','#ef4444','#64748b'];
  function renderSetup(){
    let av = ME.a || '😎', col = ME.c, cat = Object.keys(AVCATS).find(k=>AVCATS[k].includes(av)) || 'Mặt';
    $('su-name').value = ME.n || '';
    const prev=()=>{ $('su-prev').textContent=av; $('su-prev').style.background=col; $('su-pname').textContent=$('su-name').value.trim()||'Tên của bạn'; };
    const cats=()=>{ $('su-cats').innerHTML=Object.keys(AVCATS).map(k=>`<button type="button" class="${k===cat?'on':''}" data-c="${k}">${k}</button>`).join('');
      $('su-cats').querySelectorAll('button').forEach(b=>b.onclick=()=>{ cat=b.dataset.c; cats(); grid(); }); };
    const grid=()=>{ const row=$('su-av'); row.innerHTML='';
      AVCATS[cat].forEach(a=>{ const b=document.createElement('button'); b.type='button'; b.className='av'+(a===av?' on':''); b.textContent=a; b.onclick=()=>{ av=a; grid(); prev(); }; row.appendChild(b); }); };
    const cols=()=>{ $('su-col').innerHTML=AVCOLS.map(c=>`<button type="button" class="avc${c===col?' on':''}" style="background:${c}" data-c="${c}"></button>`).join('');
      $('su-col').querySelectorAll('button').forEach(b=>b.onclick=()=>{ col=b.dataset.c; cols(); prev(); }); };
    cats(); grid(); cols(); prev();
    $('su-name').oninput=prev;
    $('su-rand').onclick=()=>{ const ks=Object.keys(AVCATS); cat=ks[Math.floor(Math.random()*ks.length)]; av=AVCATS[cat][Math.floor(Math.random()*AVCATS[cat].length)]; col=AVCOLS[Math.floor(Math.random()*AVCOLS.length)]; cats(); grid(); cols(); prev(); };
    $('su-custom').oninput=e=>{ const v=[...e.target.value.trim()].slice(0,2).join(''); if(v){ av=v; grid(); prev(); } };
    $('su-form').onsubmit = e => { e.preventDefault(); const n=$('su-name').value.trim().slice(0,16); if(!n){ $('su-name').focus(); return toast('⚠️ Nhập tên trước đã'); }
      ME.save(n, av, col); renderProfile(); presence(); logVisit();
      const pend = pstore.get('arcade_pending', null); pstore.set('arcade_pending', null);
      if(pend) joinRoom(pend); else go('menu'); };
  }
  function renderProfile(){ $('m-me').innerHTML = ME.id ? `<span class="pa" style="background:${escH(ME.c)}">${escH(ME.a)}</span><b>${escH(ME.n)}</b><small>✏️</small>` : 'Đặt tên'; $('m-mode').textContent = Net.mode==='firebase' && !window.__FAKEFB ? '🟢 Máy chủ online' : '🟠 Chế độ thử: dữ liệu lưu trên máy này'; }

  /* ---------- khởi động ---------- */
  api._t = { room:()=>room, code:()=>code, leader:()=>!!room && amLeader(room), host:()=>!!room && isHost(room), startGame, backToLobby, stopTable, P };
  api.openGame=openGame; api.joinAny=joinAny; api.createRoom=createRoom; api.joinRoom=joinRoom; api.leaveRoom=leaveRoom; api.backToLobby=backToLobby;
  api.renderRoom=renderRoom; api.renderRank=renderRank; api.visitorsPath=()=>P('visitors'); api.renderSetup=renderSetup; api.renderProfile=renderProfile;
  api.boot = async () => {
    Net.init(); await Net.ready;
    renderProfile(); watchLobby(); syncHub(); logVisit();
    const q = new URLSearchParams(location.search).get('arc');
    const saved = pstore.get('arcade_room', null);
    if(!ME.id){ if(q) pstore.set('arcade_pending', q); go('setup'); return; }
    if(q){ resumeWanted=true; joinRoom(q); } else if(saved){ resumeWanted=true; joinRoom(saved).catch(()=>{ resumeWanted=false; }); }
  };
  return api;
})();

/* =====================================================================
   BÀN CHƠI NHIỀU NGƯỜI (13 game bài & party)
   - Trạng thái ván ở arcade/rooms/{code}/state. CHỈ "trọng tài" (chủ phòng,
     hoặc người kế tiếp nếu chủ phòng rớt mạng) được ghi trạng thái.
   - Người chơi gửi nước đi vào arcade/rooms/{code}/acts; trọng tài xử lý
     theo thứ tự, chạy máy chơi và đồng hồ, rồi ghi trạng thái mới.
   - Mỗi game là một module TG[key]: init / act / tick / view / score / result
   ===================================================================== */
const TABLE = (() => {
  const $=id=>document.getElementById(id);
  let d=null, key=null, round=null, ui={}, unsubActs=null, unsubChat=null, acts={}, seen=new Set(), lastLog=0,
      leaderState=null, leaderRound=null, chatN=0, chatSeen=0, chatList=[], doneTimer=null;
  const code = () => ARC._t.code();
  TGU._cur = () => d && d.state;
  const chatBub = {};
  TGU.chat = id => { const c=chatBub[id]; return c && Net.now()-c.ts < 5000 ? c.t : ''; };
  const AP = sub => ROOT+'/rooms/'+code()+'/'+sub;

  function init(k, seats, set, rnd, rng){ const s = TG[k].init(seats, set, rng, Net.now()); s.P = seats; s.v = 1; return JSON.parse(JSON.stringify(s)); }
  const about = k => (TG[k] && TG[k].about) || '';
  const mySeat = s => s && s.P ? s.P.findIndex(p=>p.id===ME.id) : -1;
  // kết quả tạm khi chủ phòng dừng giữa chừng (null = chưa có gì để ghi)
  function partial(dd){
    const s=dd.state && TGU.fix(JSON.parse(JSON.stringify(dd.state)), TG[dd.game]), M=TG[dd.game]; if(!s || !M) return null;
    let r=null;
    if(M.partial) r=M.partial(s);
    else { const prog=(s.gn||s.round||s.hn||1)>1 || s.ph==='res'; if(prog) r={ rows:M.result(s), note:'⏹ Dừng sớm' }; }
    if(!r || !r.rows || !r.rows.length) return null;
    return { note:r.note, rows:r.rows.map(x=>({ id:s.P[x.i].id, n:s.P[x.i].n, a:s.P[x.i].a, rank:x.rank, txt:x.txt })) };
  }
  function resultIfOver(dd){
    const s=dd.state && TGU.fix(dd.state, TG[dd.game]); if(!s || !s.over) return null;
    return TG[dd.game].result(s).map(r=>({ id:s.P[r.i].id, n:s.P[r.i].n, a:s.P[r.i].a, rank:r.rank, txt:r.txt }));
  }

  /* ---------- theo dõi phòng ---------- */
  function onRoom(dd, participant){
    if(dd && dd.state && TG[dd.game]) TGU.fix(dd.state, TG[dd.game]);
    d=dd; key=dd.game;
    if(dd.status==='playing'){
      if(participant && round!==dd.round){ start(dd); return; }
      if(current==='table') render();
    } else if(dd.status==='done'){
      if(current==='table'){ render(); clearTimeout(doneTimer); doneTimer=setTimeout(()=>{ if(current==='table'){ stop(); go('room'); } }, 4200); }
    } else if(current==='table'){ stop(); go('room'); }
  }
  function start(dd){ d=dd; key=dd.game; round=dd.round; ui={}; seen=new Set(); lastLog=Net.now(); leaderState=null; subscribe(); document.body.classList.add('mp'); if(current!=='table') go('table'); else render(); }
  function open(dd){ start(dd); }
  function stop(){ document.body.classList.remove('mp'); stopAlert(); lastTurnMe=false; }
  function leave(){ stop(); if(unsubActs){ unsubActs(); unsubActs=null; } if(unsubChat){ unsubChat(); unsubChat=null; } d=null; round=null; leaderState=null; chatN=chatSeen=0; }
  function subscribe(){
    if(!unsubActs) unsubActs = Net.on(AP('acts'), a=>{ acts=a||{}; work(); });
    if(!unsubChat) unsubChat = Net.on(AP('chat'), ch=>{ chatList=Object.values(ch||{}).sort((a,b)=>(a.ts||0)-(b.ts||0)); const n=chatList.length;
      const m=chatList[n-1], fresh = m && Net.now()-(m.ts||0) < 8000;   // chỉ nổi bong bóng cho tin mới, không nổi lại lịch sử cũ lúc vào phòng
      if(n>chatN && fresh){ if(m.id) chatBub[m.id]={ t:m.t, ts:Net.now() }; if(current==='table' && !pinned && m.n!==ME.n) toast(m.a+' '+m.n+': '+m.t, 2600); render(); }
      chatN=n; if(current==='table' && !pinned && !$('gsheet').classList.contains('on')) badge(); else { chatSeen=n; badge(); } renderChatSheet(); });
  }
  function send(a){ if(!code()) return; Net.push(AP('acts'), { by:ME.id, a, ts:Net.TS }); }

  /* ---------- trọng tài ---------- */
  function fresh(){
    if(!d || d.status!=='playing' || !d.state) return null;
    if(leaderState && leaderRound===d.round && (leaderState.v||0) >= (d.state.v||0)) return leaderState;
    return TGU.fix(JSON.parse(JSON.stringify(d.state)), TG[d.game]);
  }
  function work(){
    if(!d || d.status!=='playing' || !d.state || !ARC._t.leader()) return;
    const s=fresh(); if(!s || s.over) return;
    const M=TG[d.game]; let changed=false; const rm={};
    Object.keys(acts).sort().forEach(k=>{
      rm[k]=null; if(seen.has(k)) return; seen.add(k);
      const x=acts[k]; if(!x || !x.a) return;
      const i=s.P.findIndex(p=>p.id===x.by); if(i<0) return;
      try{ if(M.act(s, i, x.a, Net.now(), Math.random)) changed=true; }catch(e){ console.error('act', e); }
    });
    if(Object.keys(rm).length) Net.update(AP('acts'), rm);
    try{ if(M.tick(s, Net.now(), Math.random)) changed=true; }catch(e){ console.error('tick', e); }
    leaderState=s; leaderRound=d.round;               // giữ cả hẹn giờ của máy dù chưa đổi gì
    if(changed){ s.v=(s.v||0)+1; Net.set(AP('state'), JSON.parse(JSON.stringify(s))); }   // Firebase không nhận undefined
  }
  setInterval(work, 250);

  /* ---------- báo hiệu tới lượt khi đang ở tab khác ---------- */
  let turnAlert=false, titleTimer=null, origTitle=document.title, lastTurnMe=false, chimeTimer=null;
  function chime(){ try{ beep(880,.12,'sine',.12); setTimeout(()=>beep(1175,.14,'sine',.12),140); }catch(e){} }
  function startAlert(){
    if(turnAlert) return; turnAlert=true;
    let on=false; clearInterval(titleTimer);
    titleTimer=setInterval(()=>{ on=!on; document.title = on ? '🔔 TỚI LƯỢT BẠN!' : origTitle; }, 700);
    chime(); clearInterval(chimeTimer); chimeTimer=setInterval(()=>{ if(document.hidden) chime(); }, 5000);
  }
  function stopAlert(){ if(!turnAlert && document.title===origTitle) return; turnAlert=false; clearInterval(titleTimer); clearInterval(chimeTimer); titleTimer=chimeTimer=null; document.title=origTitle; }
  function checkTurn(s, me, turn){
    const myTurn = me>=0 && turn===me && !s.over && d && d.status==='playing';
    if(myTurn && !lastTurnMe){ chime(); if(document.hidden) startAlert(); }   // vừa tới lượt
    else if(myTurn && document.hidden && !turnAlert) startAlert();
    if(!myTurn) stopAlert();
    lastTurnMe = myTurn;
  }
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden){ if(lastTurnMe) startAlert(); } else stopAlert(); });

  /* ---------- giao diện ---------- */
  TGU.emo = id => emoOf(id);
  function emoOf(id){ const e=d && d.emo && d.emo[id]; if(!e) return ''; const el=Net.now()-(e.ts||0); return el<5000 ? `<i class="tbp-e" style="animation-delay:${-el}ms">${escH(e.e)}</i>` : ''; }
  function banner(log){
    const el=document.createElement('div'); el.className='tb-banner '+(log.k||''); el.textContent=log.txt; $('arc').appendChild(el); setTimeout(()=>el.remove(), 2300);
    if(log.k==='win'){ beep(784,.12); setTimeout(()=>beep(1046,.22),120); } else if(log.k==='lose'){ beep(220,.25,'sawtooth',.1); } else if(log.k==='big'){ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,.15),i*110)); } else beep(600,.07);
  }
  function badge(){ const b=$('tb-chatn'); if(b){ const n=chatN-chatSeen; b.textContent=n>9?'9+':n; b.style.display=n>0?'':'none'; } }
  function render(){
    const body=$('tb-body'); if(!body) return;
    if(!d || !d.state){ body.innerHTML='<div class="empty">Đang chia bàn…</div>'; return; }
    const s=d.state, M=TG[key], R=REG[key], me=mySeat(s), turn=M.turn ? M.turn(s) : -1;
    $('tb-title').textContent=R.i+' '+R.n;
    $('tb-round').textContent=M.label ? M.label(s) : '';
    $('tb-players').style.display = M.ownSeats ? 'none' : '';
    $('tb-players').innerHTML = M.ownSeats ? '' : s.P.map((p,i)=>{ const st=(d.players||{})[p.id]||{}; const b=M.badge?M.badge(s,i,me):'';
      const cb=TGU.chat?TGU.chat(p.id):''; return `<div class="tbp${i===me?' me':''}${i===turn&&!s.over?' turn':''}${st.on===false&&!p.bot?' off':''}">${cb?`<span class="tbp-chat">${escH(cb)}</span>`:''}<span class="tbp-a">${escH(p.a)}${emoOf(p.id)}</span><span class="tbp-n">${escH(p.n)}</span><b class="tbp-s">${escH(M.score(s,i))}</b>${b?`<span class="tbp-b">${escH(b)}</span>`:''}</div>`; }).join('');
    let html = me<0 ? '<div class="tb-spec">👀 Bạn đang xem — chờ ván sau để vào chơi</div>' : '';
    if(s.over && d.status!=='playing'){ html += '<div class="tb-final">🏁 Kết thúc! Đang tổng kết…</div>'; }
    try{ html += M.view(s, me, ui, Net.now()); }catch(e){ console.error(e); html += '<div class="empty">Lỗi hiển thị: '+escH(e.message)+'</div>'; }
    body.innerHTML = html;
    checkTurn(s, me, turn);
    if(M.after) try{ M.after(s, me, ui, body, send); }catch(e){ console.error(e); }
    const stv=$('tb-status'); if(M.status){ const st=M.status(s, me, Net.now()); if(st && st.txt){ stv.style.display=''; stv.className='tb-status '+(st.cls||''); stv.innerHTML=st.txt; } else stv.style.display='none'; } else stv.style.display='none';
    if(s.log && s.log.ts>lastLog){ lastLog=s.log.ts; if(Net.now()-s.log.ts<4000 && !M.noBanner) banner(s.log); }
    $('tb-host').style.display = ARC._t.host() ? '' : 'none';
    frame();
  }
  function frame(){
    if(current!=='table' || !d || !d.state) return;
    const s=d.state, bar=$('tb-timer');
    if(s.dl && !s.over){ const left=Math.max(0,s.dl-Net.now()), len=s.dlLen||15000, mine=(M2=>M2&&M2.turn&&M2.turn(s)===mySeat(s))(TG[key]); bar.style.display=''; bar.classList.toggle('low', left<6000); bar.classList.toggle('mine', !!mine); bar.firstChild.style.width=Math.min(100,left*100/len)+'%'; bar.firstChild.style.background=left<6000?'#ef4444':mine?'#22c55e':'#fbbf24'; bar.lastChild.textContent=Math.ceil(left/1000)+'s'; }
    else bar.style.display='none';
    const M=TG[key]; if(M && M.frame) try{ M.frame(s, mySeat(s), ui, $('tb-body'), Net.now()); }catch(e){}
  }
  setInterval(frame, 100);
  setInterval(()=>{ if(current==='table' && d && d.emo && Object.values(d.emo).some(e=>Net.now()-(e.ts||0)<5200)) render(); }, 1000);

  // bấm trên bàn: data-act='{"t":"bet",...}'  |  data-ui = thao tác cục bộ (chọn mức cược, chọn bài…)
  document.addEventListener('click', e=>{
    if(current!=='table' || !d || !d.state) return;
    const t=e.target.closest('[data-act],[data-ui]'); if(!t || !$('tb-body').contains(t)) return;
    const M=TG[key], s=d.state, me=mySeat(s); if(me<0) return;
    if(t.dataset.ui!=null){ if(M.ui) M.ui(JSON.parse(t.dataset.ui), ui, s, me, send); render(); return; }
    let a=JSON.parse(t.dataset.act); if(M.prep){ a=M.prep(a, ui, s, me); if(!a){ render(); return; } }
    send(a); beep(660,.04,'triangle',.06);
    if(M.optimistic) { M.optimistic(a, ui, s, me); render(); }
  });
  document.addEventListener('pointerdown', e=>{
    if(current!=='table' || !d || !d.state) return;
    const t=e.target.closest('[data-tap]'); if(!t) return; e.preventDefault();
    const M=TG[key]; if(M.tap) M.tap(d.state, mySeat(d.state), ui, send, Net.now());
  });

  /* ---------- nút trên đầu bàn ---------- */
  function emo(e){ if(code()) Net.set(AP('emo/'+ME.id), { e, ts:Net.TS }); }
  /* chat: mở dạng bảng nổi, hoặc ghim 📌 cố định ở cuối bàn chơi (nhớ lựa chọn trên máy) */
  let pinned = (()=>{ try{ const v=localStorage.getItem('tb_pin'); return v==null ? window.innerWidth>=900 : v==='1'; }catch(e){ return false; } })();
  const chatHTML = () => chatList.slice(-50).map(m=>`<div class="cm${m.n===ME.n&&m.a===ME.a?' mine':''}"><b>${escH(m.a)} ${escH(m.n)}:</b> ${escH(m.t)}</div>`).join('') || '<div class="empty">Chưa có tin nhắn</div>';
  function renderChatSheet(){
    ['tbc-list','tbd-list'].forEach(id=>{ const box=document.getElementById(id); if(!box) return; const atEnd=box.scrollHeight-box.scrollTop-box.clientHeight<40; box.innerHTML=chatHTML(); if(atEnd||id==='tbc-list') box.scrollTop=box.scrollHeight; });
  }
  function sendChat(inp){ EmojiPicker.close(); const m=inp.value.trim(); if(!m || !code()) return; inp.value=''; Net.push(AP('chat'), { id:ME.id, n:ME.n, a:ME.a, t:m, ts:Net.TS }); }
  function setPin(on){ pinned=on; try{ localStorage.setItem('tb_pin', on?'1':'0'); }catch(e){} chatSeen=chatN; badge(); renderDock(); }
  function renderDock(){
    const dk=$('tb-dock'); if(!dk) return;
    $('tb-chat').classList.toggle('pinon', pinned);
    if(!pinned){ dk.innerHTML=''; dk.classList.remove('on'); return; }
    dk.classList.add('on');
    dk.innerHTML=`<div class="tbd-h"><b>💬 Chat</b><button type="button" class="tbd-pin on" id="tbd-pin" title="Bỏ ghim">📌 Bỏ ghim</button></div><div class="chat tbd-list" id="tbd-list"></div>
      <form class="cin" id="tbd-f"><button type="button" class="ebtn" id="tbd-e">😊</button><input id="tbd-m" maxlength="120" placeholder="Nhắn gì đó…" autocomplete="off"><button class="blue">➤</button></form>`;
    renderChatSheet();
    $('tbd-pin').onclick=()=>setPin(false);
    EmojiPicker.attach($('tbd-m'), $('tbd-e'));
    $('tbd-f').onsubmit=ev=>{ ev.preventDefault(); sendChat($('tbd-m')); };
  }
  function openChat(){
    const sh=$('gsheet'); chatSeen=chatN; badge();
    if(pinned){ const i=$('tbd-m'); if(i){ i.focus(); i.scrollIntoView({block:'nearest'}); } return; }
    sh.innerHTML=`<div class="sheet"><div class="sh-h"><b>💬 Chat bàn chơi</b><span class="sh-sp"></span><button type="button" class="tbd-pin" id="tbc-pin" title="Ghim khung chat cố định dưới bàn chơi">📌 Ghim</button><button class="ghost" id="tbc-x">✕</button></div><div class="chat" id="tbc-list" style="max-height:45vh"></div>
      <form class="cin" id="tbc-f"><button type="button" class="ebtn" id="tbc-e">😊</button><input id="tbc-m" maxlength="120" placeholder="Nhắn gì đó…" autocomplete="off"><button class="blue">➤</button></form></div>`;
    sh.classList.add('on'); renderChatSheet();
    $('tbc-x').onclick=()=>{ sh.classList.remove('on'); EmojiPicker.close(); };
    $('tbc-pin').onclick=()=>{ sh.classList.remove('on'); EmojiPicker.close(); setPin(true); setTimeout(()=>{ const i=$('tbd-m'); if(i) i.focus(); },50); };
    sh.onclick=ev=>{ if(ev.target===sh){ sh.classList.remove('on'); EmojiPicker.close(); } };
    EmojiPicker.attach($('tbc-m'), $('tbc-e'));
    $('tbc-f').onsubmit=ev=>{ ev.preventDefault(); sendChat($('tbc-m')); };
  }
  document.addEventListener('keydown', ev=>{ if(ev.key==='Escape'){ const sh=$('gsheet'); if(sh && sh.classList.contains('on')){ sh.classList.remove('on'); EmojiPicker.close(); } } });
  function hostMenu(){
    const sh=$('gsheet');
    sh.innerHTML=`<div class="sheet small"><b class="sh-t">Chủ phòng</b><p>Dừng ván này? ${TG[key]&&d&&d.state&&partial(d)?'Điểm các ván đã chơi xong sẽ được <b>chốt và ghi vào lịch sử</b>.':'Chưa có ván nào chơi xong nên sẽ không ghi kết quả.'}</p><div class="row2"><button id="hm-no">Chơi tiếp</button><button class="primary" id="hm-ok">⏹ Dừng ván</button></div></div>`;
    sh.classList.add('on'); $('hm-no').onclick=()=>sh.classList.remove('on'); $('hm-ok').onclick=()=>{ sh.classList.remove('on'); ARC._t.stopTable(); };
  }
  function bind(){
    $('tb-room').onclick=()=>{ stop(); go('room'); };
    $('tb-chat').onclick=openChat;
    renderDock();
    $('tb-host').onclick=hostMenu;
    $('tb-emo').innerHTML=['😂','😎','👏','🔥','😡','😭','🙏','💸','🤑','🎉'].map(e=>`<button data-e="${e}">${e}</button>`).join('');
    $('tb-emo').onclick=ev=>{ const b=ev.target.closest('[data-e]'); if(b){ emo(b.dataset.e); b.classList.add('pop'); setTimeout(()=>b.classList.remove('pop'),300); } };
  }
  if(document.readyState!=='loading') setTimeout(bind,0); else document.addEventListener('DOMContentLoaded', bind);
  return { init, about, onRoom, open, leave, render, resultIfOver, partial, activate(){ if(d && d.status==='playing') document.body.classList.add('mp'); render(); badge(); } };
})();

/* ================= QUẢN TRỊ: XÓA PHÒNG ================= */
/* PIN chỉ để ẩn trang quản trị (Rules của Firebase đang mở cho mọi người).
   Mã băm PIN lưu ở admin/pin — chỉ ghi được lần đầu (xem Rules); muốn đổi PIN thì xóa nút admin trên Firebase Console. */
const ADMIN = (() => {
  const $=id=>document.getElementById(id);
  const LEG = {caro:'⚔️ Caro 20×20',taixiu:'🎲 Tài Xỉu',xidach:'🃏 Xì Dách',cotuong:'🀄 Cờ Tướng',baucua:'🦀 Bầu Cua',oantuti:'✊ Oẳn Tù Tì',speedmath:'🔢 Đếm Nhanh',guessnumber:'🎯 Số May Mắn',poker:'♠️ Poker',tienlen:'🏹 Tiến Lên',chanle:'🎰 Xóc Đĩa',xucxac:'🎲 Xúc Xắc Chiến',phanxa:'⚡ Phản Xạ'};
  let unlocked=false, pinHash=null, leg={}, arc={}, onl={}, vis={}, subs=[], filter='all', tab='rooms';
  async function sha(t){
    try{ const b=await crypto.subtle.digest('SHA-256', new TextEncoder().encode('gamehub-admin:'+t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
    catch(e){ let h=0; for(const ch of 'gamehub-admin:'+t) h=(h*31+ch.charCodeAt(0))|0; return 'x'+(h>>>0).toString(16); }
  }
  const ago = t => { if(!t) return '?'; const m=Math.max(0,Math.round((Net.now()-t)/60000)); return m<1?'vừa xong':m<60?m+' phút trước':m<1440?Math.floor(m/60)+' giờ trước':Math.floor(m/1440)+' ngày trước'; };
  function legPlayers(v){
    if(v.tlPlayers) return Object.values(v.tlPlayers).map(p=>(p.av||'')+(p.name||'')).join(', ');
    if(v.pkPlayers) return Object.values(v.pkPlayers).map(p=>(p.av||'')+(p.name||'')).join(', ');
    return [(v.hav||'')+(v.hn||''), v.gnm?(v.gav||'')+v.gnm:''].filter(Boolean).join(', ');
  }
  function rows(){
    const out=[], now=Net.now();
    Object.entries(leg).forEach(([id,v])=>{ if(!v) return; out.push({ kind:'l', id, name:LEG[v.game]||('🎮 '+(v.gn||v.game)), who:legPlayers(v), st:v.status==='waiting'?'đang chờ':v.status==='playing'?'đang chơi':(v.status||'?'), t:v.ts, empty:false, old:v.ts&&now-v.ts>6*3600e3 }); });
    Object.entries(arc).forEach(([id,v])=>{ if(!v) return; const ps=Object.values(v.players||{}); const on=ps.filter(p=>p.on!==false).length;
      out.push({ kind:'a', id, name:REG[v.game]?REG[v.game].i+' '+REG[v.game].n:'🕹️ '+v.game, who:ps.map(p=>(p.a||'')+(p.n||'')).join(', '), st:(v.status==='playing'?'đang chơi':v.status==='done'?'xong ván':'đang chờ')+' · '+on+'/'+ps.length+' online', t:v.created, empty:on===0, old:v.created&&now-v.created>6*3600e3 }); });
    return out.sort((a,b)=>(b.t||0)-(a.t||0));
  }
  async function del(kind,id){ if(kind==='l'){ await Net.remove('rooms/'+id); await Net.remove('chats/'+id); } else await Net.remove(ROOT+'/rooms/'+id); }
  function ask(title, text, fn){
    const sh=$('gsheet');
    sh.innerHTML=`<div class="sheet small"><b class="sh-t">${escH(title)}</b><p>${escH(text)}</p><div class="row2"><button id="ad-no">Thôi</button><button class="primary" id="ad-ok" style="background:#dc2626;box-shadow:0 4px 0 #7f1d1d">Xóa</button></div></div>`;
    sh.classList.add('on'); $('ad-no').onclick=()=>sh.classList.remove('on'); $('ad-ok').onclick=()=>{ sh.classList.remove('on'); fn(); };
  }
  async function bulk(list, label){
    if(!list.length) return toast('Không có phòng nào để xóa');
    ask(label, 'Xóa '+list.length+' phòng? Ai đang ở trong phòng sẽ bị đưa ra sảnh.', async ()=>{ for(const r of list) await del(r.kind, r.id); toast('🗑 Đã xóa '+list.length+' phòng'); });
  }
  const vago = t => { if(!t) return '?'; const d=new Date(t); return d.toLocaleDateString('vi-VN')+' '+d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}); };
  function visRows(){
    return Object.entries(vis).map(([id,v])=>({ id, ...v })).sort((a,b)=>(b.last||0)-(a.last||0));
  }
  function uaShort(ua){ ua=ua||''; let os='?', br='?';
    if(/Windows NT 10/.test(ua))os='Windows 10/11'; else if(/Windows/.test(ua))os='Windows'; else if(/iPhone|iPad|iOS/.test(ua))os='iPhone/iPad'; else if(/Android/.test(ua))os='Android'; else if(/Mac OS X/.test(ua))os='macOS'; else if(/Linux/.test(ua))os='Linux';
    if(/Edg\//.test(ua))br='Edge'; else if(/OPR\/|Opera/.test(ua))br='Opera'; else if(/Chrome\//.test(ua))br='Chrome'; else if(/Firefox/.test(ua))br='Firefox'; else if(/Safari/.test(ua))br='Safari';
    return br+' · '+os; }
  function visitorsPanel(){
    const list=visRows(), today=list.filter(v=>v.last&&Net.now()-v.last<24*3600e3).length;
    $('ad-body').innerHTML = tabBar() + `
      <div class="mystat"><div><small>THIẾT BỊ ĐÃ CHƠI</small><b>${list.length}</b></div><div><small>HÔM NAY</small><b>${today}</b></div><div><small>TỔNG LƯỢT VÀO</small><b>${list.reduce((s,v)=>s+(v.visits||0),0)}</b></div></div>
      <small class="mtxt">Danh sách các thiết bị đã mở game, chỉ bạn xem được ở trang này. IP chỉ ghi được khi chơi trên web thật (GitHub Pages), không ghi khi chạy ngoại tuyến.</small>
      <div class="rcard">${list.length ? list.map(v=>`<div class="rrow adrow"><span class="ra">${escH(v.a||'👤')}</span><div class="rn"><b>${escH(v.n||'?')}</b><small>${escH(uaShort(v.ua))}${v.ip?' · <b style="color:#38bdf8">'+escH(v.ip)+'</b>':' · IP: —'}<br>${escH(v.scr||'')} · ${escH(v.tz||'')} · vào ${v.visits||1} lần<br>Lần đầu ${vago(v.first)} · Gần nhất ${vago(v.last)}</small></div><button class="addel" data-vis="${escH(v.id)}">🗑</button></div>`).join('') : '<div class="empty">Chưa có ai mở game 🙂</div>'}</div>
      ${list.length?`<button id="ad-visclr" style="background:#dc2626;box-shadow:0 4px 0 #7f1d1d">Xóa toàn bộ nhật ký người chơi</button>`:''}
      <button class="ghost wide" id="ad-lock">🔒 Khóa trang quản trị trên máy này</button>`;
    $('ad-lock').onclick=()=>{ store.set('gh_admin',null); unlocked=false; render(); };
    $('ad-body').querySelectorAll('[data-f-tab]').forEach(b=>b.onclick=()=>{ tab=b.dataset.fTab; panel(); });
    $('ad-body').querySelectorAll('.addel').forEach(b=>b.onclick=()=>{ const id=b.dataset.vis; ask('Xóa thiết bị này?','Xóa khỏi nhật ký (nếu họ mở lại sẽ hiện lại).', async ()=>{ await Net.remove(ROOT+'/visitors/'+id); toast('🗑 Đã xóa'); }); });
    const clr=$('ad-visclr'); if(clr) clr.onclick=()=>ask('Xóa toàn bộ?','Xóa hết nhật ký người chơi?', async ()=>{ await Net.remove(ROOT+'/visitors'); toast('🗑 Đã xóa nhật ký'); });
  }
  function tabBar(){ return `<div class="seg" style="margin-bottom:10px">${[['rooms','🧹 Phòng chơi'],['visitors','👥 Người chơi']].map(([k,l])=>`<button data-f-tab="${k}" class="${tab===k?'on':''}">${l}</button>`).join('')}</div>`; }
  function panel(){
    if(tab==='visitors') return visitorsPanel();
    const all=rows(), L=all.filter(r=>r.kind==='l').length, A=all.length-L;
    const shown=all.filter(r=>filter==='all'||(filter==='old'&&r.old)||(filter==='empty'&&r.empty)||(filter==='l'&&r.kind==='l')||(filter==='a'&&r.kind==='a'));
    $('ad-body').innerHTML = tabBar() + `<div class="mystat"><div><small>PHÒNG GAME BÀI</small><b>${L}</b></div><div><small>PHÒNG GAME MỚI</small><b>${A}</b></div><div><small>ĐANG ONLINE</small><b>${Object.keys(onl).length}</b></div></div>
      <div class="rcard"><div class="rh" style="margin:0">🧹 Dọn nhanh</div>
        <button class="blue" id="ad-c1">Xóa phòng quá 6 giờ (${all.filter(r=>r.old).length})</button>
        <button class="blue" id="ad-c2">Xóa phòng game mới không còn ai online (${all.filter(r=>r.empty).length})</button>
        <button id="ad-c3" style="background:#dc2626;box-shadow:0 4px 0 #7f1d1d">Xóa TẤT CẢ phòng (${all.length})</button>
        <small class="mtxt">Phòng quá 24 giờ cũng được tự xóa mỗi khi có người mở sảnh.</small></div>
      <div class="seg" id="ad-f">${[['all','Tất cả'],['l','Game bài'],['a','Game mới'],['old','Quá 6 giờ'],['empty','Không ai online']].map(([k,l])=>`<button data-f="${k}" class="${filter===k?'on':''}">${l}</button>`).join('')}</div>
      <div class="rcard">${shown.length ? shown.map(r=>`<div class="rrow adrow"><div class="rn"><b>${escH(r.name)} <span class="rcd">#${escH(r.id)}</span></b><small>${escH(r.who||'—')}<br>${escH(r.st)} · tạo ${ago(r.t)}${r.old?' · ⚠️ cũ':''}</small></div><button class="addel" data-k="${r.kind}" data-id="${escH(r.id)}">🗑</button></div>`).join('') : '<div class="empty">Không có phòng nào 🎉</div>'}</div>
      <button class="ghost wide" id="ad-lock">🔒 Khóa trang quản trị trên máy này</button>`;
    $('ad-c1').onclick=()=>bulk(all.filter(r=>r.old),'Xóa phòng quá 6 giờ');
    $('ad-c2').onclick=()=>bulk(all.filter(r=>r.empty),'Xóa phòng không còn ai');
    $('ad-c3').onclick=()=>bulk(all,'Xóa TẤT CẢ phòng');
    $('ad-lock').onclick=()=>{ store.set('gh_admin',null); unlocked=false; render(); };
    $('ad-f').querySelectorAll('button').forEach(b=>b.onclick=()=>{ filter=b.dataset.f; panel(); });
    $('ad-body').querySelectorAll('[data-f-tab]').forEach(b=>b.onclick=()=>{ tab=b.dataset.fTab; panel(); });
    $('ad-body').querySelectorAll('.addel').forEach(b=>b.onclick=()=>{ const r=shown.find(x=>x.id===b.dataset.id&&x.kind===b.dataset.k); ask('Xóa phòng #'+b.dataset.id+'?', (r?r.name+' — '+(r.who||''):''), async ()=>{ await del(b.dataset.k,b.dataset.id); toast('🗑 Đã xóa phòng #'+b.dataset.id); }); });
  }
  function watch(){
    if(subs.length) return;
    subs.push(Net.on('rooms', v=>{ leg=v||{}; if(unlocked && current==='admin') panel(); }));
    subs.push(Net.on(ROOT+'/rooms', v=>{ arc=v||{}; if(unlocked && current==='admin') panel(); }));
    subs.push(Net.on(ROOT+'/online', v=>{ onl=v||{}; if(unlocked && current==='admin') panel(); }));
    subs.push(Net.on(ROOT+'/visitors', v=>{ vis=v||{}; if(unlocked && current==='admin' && tab==='visitors') panel(); }));
  }
  function form(title, sub, btn, two, onOk){
    $('ad-body').innerHTML=`<form class="rcard setup" id="ad-form" style="margin-top:20px"><div class="avprev"><div class="avbig" style="background:#334155">🛠</div><div class="avname">${title}</div></div><p class="mtxt" style="text-align:center">${sub}</p>
      <input id="ad-p1" type="password" inputmode="numeric" maxlength="12" placeholder="Mã PIN (4–12 số)" autocomplete="off">
      ${two?'<input id="ad-p2" type="password" inputmode="numeric" maxlength="12" placeholder="Nhập lại mã PIN" autocomplete="off">':''}
      <button class="primary big">${btn}</button></form>`;
    $('ad-p1').focus();
    $('ad-form').onsubmit=e=>{ e.preventDefault(); onOk($('ad-p1').value.trim(), two?$('ad-p2').value.trim():null); };
  }
  async function render(){
    $('ad-body').innerHTML='<div class="empty">Đang tải…</div>';
    pinHash = await Net.get('admin/pin');
    if(pinHash && store.get('gh_admin',null)===pinHash) unlocked=true;
    if(unlocked){ watch(); panel(); return; }
    if(!pinHash) return form('Tạo mã PIN quản trị','Lần đầu sử dụng: đặt mã PIN để mở trang này. Chỉ đặt được 1 lần — muốn đổi thì xóa mục <b>admin</b> trên Firebase Console.','Lưu mã PIN',true, async (a,b)=>{
      if(!/^\d{4,12}$/.test(a)) return toast('⚠️ PIN gồm 4–12 chữ số'); if(a!==b) return toast('⚠️ Hai lần nhập không khớp');
      const h=await sha(a); await Net.set('admin/pin', h);
      const back=await Net.get('admin/pin'); if(back!==h) return toast('❌ Không lưu được — kiểm tra Rules (mục admin)');
      store.set('gh_admin',h); unlocked=true; toast('✅ Đã tạo mã PIN'); render(); });
    form('Trang quản trị','Nhập mã PIN để quản lý phòng chơi.','Mở khóa',false, async a=>{
      const h=await sha(a); if(h!==pinHash) return toast('❌ Sai mã PIN');
      store.set('gh_admin',h); unlocked=true; render(); });
  }
  return { render };
})();

/* ================= BỘ CHỌN EMOJI CHO CHAT ================= */
const EmojiPicker = (() => {
  const CATS = [
    ['🕘','Gần đây',null],
    ['😀','Mặt cười','😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 🤡 👻 👽 🤖 💩'],
    ['👍','Cử chỉ','👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦵 👀 🧠 🫡 🤷 🤦 🙇 💁 🙋 🙅 🙆'],
    ['❤️','Tim','❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡'],
    ['🎉','Chơi game','🎉 🎊 🏆 🥇 🥈 🥉 🏅 🎮 🎲 🃏 🀄 ♠️ ♥️ ♦️ ♣️ 🎯 🎰 🧩 ♟️ 💰 💸 💵 🪙 💎 👑 🚀 💣 🔔 📢 ⏰ ✅ ❌ ❓ ❗ 🆗 🆒 🆕 🔝'],
    ['🍜','Ăn uống','🍜 🍲 🍛 🍣 🍱 🍙 🍚 🥟 🍤 🍗 🍖 🍕 🍔 🍟 🌭 🥪 🌮 🥗 🍿 🍩 🍪 🎂 🍰 🧁 🍦 🍫 🍬 🍉 🍓 🍒 🍑 🥭 🍍 🥥 🍌 ☕ 🧋 🍵 🥤 🍺 🍻 🥂'],
    ['🐶','Con vật','🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦆 🦉 🐺 🐗 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🦖 🐙 🦀 🐠 🐬 🐳 🦈']
  ];
  let pop=null, target=null, cat=1;
  const recent = () => store.get('emo_recent', []);
  function build(){
    pop=document.createElement('div'); pop.className='emo-pop'; document.body.appendChild(pop);
    pop.addEventListener('pointerdown', e=>e.preventDefault());   // giữ con trỏ trong ô chat
    pop.addEventListener('click', e=>{
      const t=e.target.closest('button'); if(!t) return;
      if(t.dataset.cat!=null){ cat=+t.dataset.cat; render(); return; }
      if(t.dataset.e) insert(t.dataset.e);
    });
    document.addEventListener('pointerdown', e=>{ if(pop.classList.contains('on') && !pop.contains(e.target) && !e.target.closest('.ebtn')) close(); });
    window.addEventListener('resize', close);
  }
  function render(){
    const list = cat===0 ? recent() : CATS[cat][2].split(' ');
    pop.innerHTML = '<div class="emo-tabs">'+CATS.map((c,i)=>`<button data-cat="${i}" class="${i===cat?'on':''}" title="${c[1]}">${c[0]}</button>`).join('')+'</div>'
      + '<div class="emo-title">'+CATS[cat][1]+'</div>'
      + '<div class="emo-grid">'+(list.length ? list.map(e=>`<button data-e="${e}">${e}</button>`).join('') : '<div class="emo-empty">Chưa dùng emoji nào</div>')+'</div>';
  }
  function place(btn){
    const r=btn.getBoundingClientRect(), W=Math.min(310, window.innerWidth-16);
    pop.style.width=W+'px';
    pop.style.left=Math.max(8, Math.min(r.left, window.innerWidth-W-8))+'px';
    if(r.top>290){ pop.style.top=''; pop.style.bottom=(window.innerHeight-r.top+8)+'px'; }
    else { pop.style.bottom=''; pop.style.top=(r.bottom+8)+'px'; }
  }
  function open(input, btn){
    if(!pop) build();
    if(pop.classList.contains('on') && target===input){ close(); return; }
    target=input; cat = recent().length ? 0 : 1; render(); place(btn); pop.classList.add('on');
  }
  function close(){ if(pop) pop.classList.remove('on'); }
  function insert(e){
    const i=target; if(!i) return;
    const s = i.selectionStart==null ? i.value.length : i.selectionStart, en = i.selectionEnd==null ? s : i.selectionEnd;
    if(i.maxLength>0 && (i.value.length - (en-s) + e.length) > i.maxLength) return toast('Tin nhắn dài quá rồi');
    i.value = i.value.slice(0,s) + e + i.value.slice(en);
    const pos = s + e.length;
    try{ i.setSelectionRange(pos,pos); }catch(_){}
    if(!matchMedia('(pointer:coarse)').matches) i.focus({ preventScroll:true });   // điện thoại: không bật bàn phím
    store.set('emo_recent', [e, ...recent().filter(x=>x!==e)].slice(0,32));
  }
  function attach(input, btn){ if(!input || !btn) return; btn.onclick = ev => { ev.preventDefault(); open(input, btn); }; }
  return { attach, close };
})();

/* ================= ROUTER ================= */
const GAMES = { 'thao-dinh': TD, 'sudoku': SD, '2048': G2048, 'mines': MINES, 'snake': SNAKE, 'tetris': TETRIS, 'memory': MEMO, 'line98': LINE98, 'flappy': FLAPPY, 'shooter': SHOOTER, 'breakout': BREAKOUT, 'slide': SLIDE, 'connect4': CONNECT4, 'whack': WHACK, 'math': MATHG, 'simon': SIMON };
const PAGES = ['menu','room','rank','setup','admin','table'];
let current = null;
function go(name){ location.hash = name || 'menu'; }
function route(){
  const raw = (location.hash||'').replace('#','');
  let h = raw;
  if(!GAMES[h] && !PAGES.includes(h)) h = raw==='' ? 'setup' : 'menu';
  if(h!=='setup' && !ME.id) h='setup';
  if((h==='room'||h==='table') && !ARC.code) h='menu';
  if(current && GAMES[current] && current!==h) GAMES[current].deactivate();
  document.querySelectorAll('#arc .view').forEach(v=>v.classList.remove('on'));
  document.getElementById('view-'+h).classList.add('on');
  const prev=current; current = h;
  if(GAMES[h]) { if(prev!==h) GAMES[h].activate(); }
  else if(h==='room') ARC.renderRoom();
  else if(h==='rank') ARC.renderRank();
  else if(h==='setup') ARC.renderSetup();
  else if(h==='admin') ADMIN.render();
  else if(h==='table') TABLE.activate();
  else {
    ARC.renderProfile();
    if(h!=='menu'){ window.scrollTo(0,0); return; }
    document.getElementById('m-thao-dinh').textContent='Đang ở màn '+TD.best();
    for(const k in GAMES){ const el=document.getElementById('m-'+k); if(el && GAMES[k].summary && k!=='thao-dinh') el.textContent=GAMES[k].summary(); }
  }
  window.scrollTo(0,0);
}
window.addEventListener('hashchange', route);
route();
ARC.boot();
