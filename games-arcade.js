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

