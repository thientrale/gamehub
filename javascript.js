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
const REG = {
  'thao-dinh':{ n:'Tháo Đinh',  i:'🔩', mp:'race', metric:'time',  max:8, set:[{k:'level',n:'Màn',opts:[[1,'1'],[3,'3'],[5,'5'],[8,'8'],[12,'12'],[20,'20']],def:3},TLIM] },
  'sudoku':   { n:'Sudoku',     i:'🔢', mp:'race', metric:'time',  max:8, set:[{k:'level',n:'Cấp',opts:[[0,'Dễ'],[1,'Trung bình'],[2,'Khó'],[3,'Chuyên gia'],[4,'Siêu khó']],def:0},TLIM] },
  '2048':     { n:'2048',       i:'🟧', mp:'race', metric:'score', max:8, set:[LIM] },
  'mines':    { n:'Dò mìn',     i:'💣', mp:'race', metric:'time',  max:8, set:[{k:'level',n:'Cấp',opts:[[0,'Dễ'],[1,'Vừa'],[2,'Khó']],def:0},TLIM] },
  'snake':    { n:'Rắn săn mồi',i:'🐍', mp:'race', metric:'score', max:8, set:[LIM] },
  'tetris':   { n:'Xếp hình',   i:'🧱', mp:'race', metric:'score', max:8, set:[LIM] },
  'memory':   { n:'Lật hình',   i:'🃏', mp:'turn', min:2, max:4,  set:[{k:'level',n:'Số thẻ',opts:[[0,'12'],[1,'16'],[2,'20'],[3,'30']],def:1}] },
  'caro':     { n:'Cờ caro',    i:'⭕', mp:'turn', min:2, max:2,  set:[] },
  'line98':   { n:'Line 98',    i:'🔴', mp:'race', metric:'score', max:8, set:[LIM] },
  'flappy':   { n:'Chim bay',   i:'🐤', mp:'race', metric:'score', max:8, set:[LIM] },
  'breakout': { n:'Phá gạch',   i:'🏓', mp:'race', metric:'score', max:8, set:[LIM] },
  'slide':    { n:'Xếp số',     i:'🔟', mp:'race', metric:'time',  max:8, set:[{k:'level',n:'Cỡ',opts:[[0,'3×3'],[1,'4×4'],[2,'5×5']],def:1},TLIM] },
  'connect4': { n:'Thả cờ 4',   i:'🟡', mp:'turn', min:2, max:2,  set:[] },
  'whack':    { n:'Đập chuột',  i:'🔨', mp:'race', metric:'score', max:8, set:[], fixed:40 },
  'math':     { n:'Tính nhẩm',  i:'➗', mp:'race', metric:'score', max:8, set:[{k:'level',n:'Cấp',opts:[[0,'Dễ'],[1,'Vừa'],[2,'Khó']],def:0}], fixed:130 },
  'simon':    { n:'Simon',      i:'🎵', mp:'race', metric:'score', max:8, set:[LIM] },
};
/* Bảng xếp hạng: [mã bảng, tên, chiều (max/min), định dạng (n điểm, t thời gian, lv màn, mv lượt)] */
const BOARDS = {
  'thao-dinh':[['thao-dinh','Màn cao nhất','max','lv']],
  'sudoku':[['sudoku-easy','Dễ','min','t'],['sudoku-medium','Trung bình','min','t'],['sudoku-hard','Khó','min','t'],['sudoku-expert','Chuyên gia','min','t'],['sudoku-master','Siêu khó','min','t']],
  '2048':[['2048','Điểm','max','n']],
  'mines':[['mines-easy','Dễ','min','t'],['mines-med','Vừa','min','t'],['mines-hard','Khó','min','t']],
  'snake':[['snake','Điểm','max','n']], 'tetris':[['tetris','Điểm','max','n']],
  'memory':[['memory-l1','12 thẻ','min','mv'],['memory-l2','16 thẻ','min','mv'],['memory-l3','20 thẻ','min','mv'],['memory-l4','30 thẻ','min','mv'],['_wins','Thắng online','max','w']],
  'caro':[['_wins','Thắng online','max','w']], 'connect4':[['_wins','Thắng online','max','w']],
  'line98':[['line98','Điểm','max','n']], 'flappy':[['flappy','Điểm','max','n']], 'breakout':[['breakout','Điểm','max','n']],
  'slide':[['slide-3','3×3','min','t'],['slide-4','4×4','min','t'],['slide-5','5×5','min','t']],
  'whack':[['whack','Điểm','max','n']],
  'math':[['math-easy','Dễ','max','n'],['math-med','Vừa','max','n'],['math-hard','Khó','max','n']],
  'simon':[['simon','Số màu nhớ được','max','n']],
};
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
  let code=null, room=null, unsubRoom=null, unsubChat=null;
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
  function leaderId(d){ const ps=playersOf(d).filter(online); if(d.players && d.players[d.host] && online(d.players[d.host])) return d.host; return ps.length ? ps[0].id : null; }
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
    if(REG[key].mp==='turn' && mine.rank===1 && list.length>1){
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
  function finalize(d, list){
    const res = { round:d.round, list, at:Net.TS };
    Net.update(P('rooms/'+code), { status:'done', result:res });
    Net.set(P('matches/'+code+'_'+d.round+'_'+d.startAt), { g:d.game, at:Net.TS, mode:REG[d.game].mp, list });
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
  async function createRoom(key){
    if(!ME.id) return go('setup');
    let c;
    for(let k=0;k<12;k++){ c=String(100+Math.floor(realRandom()*900)); const ex=await Net.get(P('rooms/'+c)); const ex2=await Net.get('rooms/'+c); if(!ex2 && (!ex || (ex.created && Net.now()-ex.created>6*3600e3))) break; }
    await Net.set(P('rooms/'+c), { game:key, host:ME.id, status:'lobby', round:0, created:Net.TS, settings:settingsDefault(key),
      players:{ [ME.id]:{ n:ME.n, a:ME.a, seat:1, on:true } } });
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
    if(race) endRace(); if(turn) endTurn();
    if(unsubRoom) unsubRoom(); if(unsubChat) unsubChat(); unsubRoom=unsubChat=null;
    Net.cancelDisc(P('rooms/'+c+'/players/'+ME.id+'/on'));
    code=null; room=null; pstore.set('arcade_room', null);
    history.replaceState(null,'', location.pathname + (/[?&]local=1/.test(location.search)?'?local=1':'') + location.hash);
    if(d){
      const others = playersOf(d).filter(p=>p.id!==ME.id && online(p));
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
      if(REG[d.game].mp==='race'){
        if(!race || race.round!==d.round) beginRace(d);
      } else {
        if(!turn || turn.round!==d.round) beginTurn(d);
        if(d.state) GAMES[d.game].mpApply(d.state);
      }
    }
    // ván kết thúc
    if(d.status==='done' && d.result){
      countStats(d.game, d.result.list, code+'_'+d.result.round+'_'+(d.startAt||0));
      if(race && race.round===d.round){ endRace(); setTimeout(()=>go('room'), 300); }
      if(turn && turn.round===d.round){ const k=turn.key; if(d.state) GAMES[k].mpApply(d.state); setTimeout(()=>{ endTurn(); go('room'); }, 1800); }
    }
    if(d.status==='lobby'){ if(race) endRace(); if(turn) endTurn(); }
    renderBar();
    if(current==='room') renderRoom();
  }
  async function startGame(){
    const d=room; if(!d || !isHost(d)) return;
    const key=d.game, R=REG[key], ps=playersOf(d).filter(online);
    if(R.mp==='turn' && (ps.length<R.min || ps.length>R.max)) return toast('⚠️ Game này cần '+(R.min===R.max?R.min:R.min+'–'+R.max)+' người');
    const round=(d.round||0)+1, upd={ status:'playing', round, seed:Math.floor(realRandom()*2e9), startAt:Net.now()+(R.mp==='race'?3600:0), result:null };
    ps.forEach((p,i)=>{ upd['players/'+p.id+'/r']=round; upd['players/'+p.id+'/seat']=i+1;
      Object.assign(upd, { ['players/'+p.id+'/done']:false, ['players/'+p.id+'/dnf']:false, ['players/'+p.id+'/score']:0, ['players/'+p.id+'/pct']:0, ['players/'+p.id+'/time']:null }); });
    if(R.mp==='turn') upd.state = GAMES[key].mpInit(d.settings||{}, ps.length, round, mulberry(upd.seed));
    await Net.update(P('rooms/'+code), upd);
  }
  async function backToLobby(){ if(room && isHost(room)) Net.update(P('rooms/'+code), { status:'lobby', state:null }); }
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
      h += `<div class="rcard"><div class="rh">🏆 Kết quả ván ${d.result.round}</div>` + d.result.list.map(x=>`<div class="rrow${x.id===ME.id?' me':''}"><span class="rk">${['🥇','🥈','🥉'][x.rank-1]||x.rank+'.'}</span><span class="ra">${escH(x.a)}</span><span class="rn">${escH(x.n)}</span><span class="rv">${escH(x.txt)}</span></div>`).join('') + `</div>`;
    }
    // người chơi
    h += `<div class="rcard"><div class="rh">👥 Người chơi (${ps.length}/${R.max})</div>` + ps.map(p=>`<div class="rrow${p.id===ME.id?' me':''}"><span class="ra">${escH(p.a)}</span><span class="rn">${escH(p.n)}${p.id===d.host?' 👑':''}${p.id===ME.id?' (bạn)':''}</span><span class="rv">${p.on===false?'<i class="dot off"></i>mất kết nối':'<i class="dot"></i>online'}</span></div>`).join('') + `</div>`;
    // cài đặt
    if((R.set||[]).length){
      h += `<div class="rcard"><div class="rh">⚙️ Cài đặt${host?'':' (chủ phòng chọn)'}</div>` + R.set.map(s=>`<div class="sline"><span>${s.n}</span><div class="seg">${s.opts.map(([v,l])=>`<button class="${(d.settings||{})[s.k]==v?'on':''}" ${host&&d.status!=='playing'?'':'disabled'} data-k="${s.k}" data-v="${v}">${l}</button>`).join('')}</div></div>`).join('') + `</div>`;
    }
    // hành động
    const modeTxt = R.mp==='race' ? 'Đua cùng đề: mọi người chơi cùng một màn, xếp hạng theo '+(R.metric==='score'?'điểm':'thời gian hoàn thành')+'.' : 'Đối kháng theo lượt, '+(R.min===R.max?R.min:R.min+'–'+R.max)+' người.';
    h += `<div class="rcard"><div class="mtxt">${modeTxt}</div>`;
    if(d.status==='playing') h += `<button class="primary big" id="rm-rejoin">▶ Vào trận đang chơi</button>`;
    else if(host) h += `<button class="primary big" id="rm-start">▶ ${d.round?'Chơi ván mới':'Bắt đầu'}</button>`;
    else h += `<div class="wait">⏳ Đang chờ chủ phòng bắt đầu…</div>`;
    h += `<button id="rm-leave">🚪 Rời phòng</button></div>`;
    // chat
    h += `<div class="rcard"><div class="rh">💬 Chat</div><div class="chat" id="chat"></div><form class="cin" id="cform"><input id="cmsg" maxlength="120" placeholder="Nhắn gì đó…" autocomplete="off"><button class="blue">➤</button></form></div>`;
    el.innerHTML = h;
    $('rm-copy').onclick = () => { try{ navigator.clipboard.writeText(link).then(()=>toast('✅ Đã copy link'), ()=>toast(link, 5000)); }catch(e){ toast(link,5000); } };
    $('rm-leave').onclick = () => leaveRoom();
    if($('rm-start')) $('rm-start').onclick = startGame;
    if($('rm-rejoin')) $('rm-rejoin').onclick = () => { const me=d.players[ME.id]; if(me.r!==d.round) return toast('Ván này đã bắt đầu trước khi bạn vào — chờ ván sau nhé'); if(REG[d.game].mp==='race'){ if(race) go(d.game); else beginRace(d); } else { if(!turn) beginTurn(d); else go(d.game); GAMES[d.game].mpApply(d.state||{}); } };
    el.querySelectorAll('.seg button[data-k]').forEach(b => b.onclick = () => setSetting(b.dataset.k, isNaN(+b.dataset.v)?b.dataset.v:+b.dataset.v));
    $('cform').onsubmit = e => { e.preventDefault(); const m=$('cmsg').value.trim(); if(!m) return; $('cmsg').value=''; Net.push(P('rooms/'+code+'/chat'), { n:ME.n, a:ME.a, t:m, ts:Net.TS }); };
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
  function presence(w){
    if(w) where=w; if(!ME.id) return;
    const p=P('online/'+ME.id);
    Net.set(p, { n:ME.n, a:ME.a, w:where, ts:Net.TS }); Net.onDisc(p, null);
  }
  Net.onConnected(()=>{ presence(); if(code){ Net.update(P('rooms/'+code+'/players/'+ME.id), { on:true }); Net.onDisc(P('rooms/'+code+'/players/'+ME.id+'/on'), false); } });
  let roomsCache={}, legacyRooms={};
  function watchLobby(){
    Net.on(P('online'), o => { const n=Object.keys(o||{}).length; $('m-online').textContent = '🟢 '+n+' online'; });
    Net.on(P('rooms'), rs => { roomsCache=rs||{}; renderOpenRooms(); });
    Net.on('rooms', rs => { legacyRooms=rs||{}; renderOpenRooms(); });
  }
  async function joinAny(c){
    c=String(c||'').trim();
    if(!/^\d{3}$/.test(c)) return toast('⚠️ Mã phòng gồm 3 chữ số');
    const a = await Net.get(P('rooms/'+c)), l = await Net.get('rooms/'+c);
    if(a && l){
      const sh=$('gsheet');
      sh.innerHTML=`<div class="sheet small"><b class="sh-t">Có 2 phòng #${c}</b><p>Bạn muốn vào phòng nào?</p><div class="row2"><button class="blue" id="ja-a">${REG[a.game]?REG[a.game].i+' '+escH(REG[a.game].n):'Arcade'}</button><button class="primary" id="ja-l">${escH((l.icon||'🎮')+' '+(l.gn||'GameHub'))}</button></div></div>`;
      sh.classList.add('on'); $('ja-a').onclick=()=>{ sh.classList.remove('on'); joinRoom(c); }; $('ja-l').onclick=()=>{ sh.classList.remove('on'); window.joinRoom(c); };
      return;
    }
    if(a) return joinRoom(c);
    if(l && window.joinRoom) return window.joinRoom(c);
    toast('❌ Không tìm thấy phòng #'+c);
  }
  function openRooms(key){
    return Object.entries(roomsCache).map(([c,d])=>Object.assign({c}, d))
      .filter(d=>d.status!=='closed' && (!key || d.game===key) && REG[d.game] && playersOf(d).some(online) && (!d.created || Net.now()-d.created < 6*3600e3))
      .sort((a,b)=>(b.created||0)-(a.created||0));
  }
  function roomItem(d){
    const ps=playersOf(d), R=REG[d.game];
    return `<div class="ritem"><span class="ri">${R.i}</span><div class="rinfo"><b>${escH(R.n)} <span class="rcd">#${d.c}</span></b><small>${ps.map(p=>escH(p.a)).join(' ')} · ${ps.length}/${R.max} · ${d.status==='playing'?'đang chơi':'đang chờ'}</small></div><button class="green" onclick="ARC.joinRoom('${d.c}')">Vào</button></div>`;
  }
  function renderOpenRooms(){
    const el=$('m-rooms'); if(!el) return;
    const list=openRooms();
    const leg=Object.entries(legacyRooms).filter(([,v])=>v && v.status==='waiting' && v.pub && (!v.ts || Net.now()-v.ts<6*3600e3))
      .map(([id,v])=>`<div class="ritem"><span class="ri">${escH(v.icon||'🎮')}</span><div class="rinfo"><b>${escH(v.gn||'')} <span class="rcd">#${escH(id)}</span></b><small>${escH(v.hav||'')} ${escH(v.hn||'')} · đang chờ</small></div><button class="green" onclick="window.joinRoom('${escH(id)}')">Vào</button></div>`);
    const html = list.slice(0,8).map(roomItem).concat(leg.slice(0,8));
    el.innerHTML = html.length ? html.join('') : '<div class="empty">Chưa có phòng nào — tạo phòng rồi gửi mã cho bạn bè nhé!</div>';
    const gs=$('gs-rooms'); if(gs && gs.dataset.k){ const l2=openRooms(gs.dataset.k); gs.innerHTML = l2.length ? l2.map(roomItem).join('') : '<div class="empty">Chưa có phòng nào cho game này</div>'; }
  }

  /* ---------- bảng chọn chế độ cho từng game ---------- */
  function openGame(key){
    const R=REG[key], sh=$('gsheet');
    const mpTxt = R.mp==='race' ? `Đua 1–${R.max} người, cùng một đề` : `Đối kháng ${R.min===R.max?R.min:R.min+'–'+R.max} người`;
    sh.innerHTML = `<div class="sheet"><div class="sh-h"><span class="sh-i">${R.i}</span><b>${escH(R.n)}</b><button class="ghost" id="gs-x">✕</button></div>
      <button class="primary big" id="gs-solo">🎮 Chơi đơn</button>
      <button class="blue big" id="gs-create">👥 Tạo phòng online <small>${mpTxt}</small></button>
      <div class="joinrow"><input id="gs-code" maxlength="3" inputmode="numeric" placeholder="Mã phòng"><button class="green" id="gs-join">Vào</button></div>
      <div class="rh">Phòng đang mở</div><div id="gs-rooms" data-k="${key}"></div>
      <button class="ghost wide" id="gs-rank">🏆 Bảng xếp hạng ${escH(R.n)}</button></div>`;
    sh.classList.add('on');
    const close=()=>sh.classList.remove('on');
    $('gs-x').onclick=close; sh.onclick=e=>{ if(e.target===sh) close(); };
    $('gs-solo').onclick=()=>{ close(); go(key); };
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
        return `<div class="mrow"><div class="mh">${R.i} <b>${escH(R.n)}</b> <small>${m.mode==='race'?'đua':'đối kháng'} · ${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</small></div>`
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
      ME.save(n, av, col); renderProfile(); presence();
      const pend = pstore.get('arcade_pending', null); pstore.set('arcade_pending', null);
      if(pend) joinRoom(pend); else go('menu'); };
  }
  function renderProfile(){ $('m-me').innerHTML = ME.id ? `<span class="pa" style="background:${escH(ME.c)}">${escH(ME.a)}</span><b>${escH(ME.n)}</b><small>✏️</small>` : 'Đặt tên'; $('m-mode').textContent = Net.mode==='firebase' && !window.__FAKEFB ? '🟢 Máy chủ online' : '🟠 Chế độ thử: dữ liệu lưu trên máy này'; }

  /* ---------- khởi động ---------- */
  api.openGame=openGame; api.joinAny=joinAny; api.createRoom=createRoom; api.joinRoom=joinRoom; api.leaveRoom=leaveRoom; api.backToLobby=backToLobby;
  api.renderRoom=renderRoom; api.renderRank=renderRank; api.renderSetup=renderSetup; api.renderProfile=renderProfile;
  api.boot = async () => {
    Net.init(); await Net.ready;
    renderProfile(); watchLobby(); syncHub();
    const q = new URLSearchParams(location.search).get('arc');
    const saved = pstore.get('arcade_room', null);
    if(!ME.id){ if(q) pstore.set('arcade_pending', q); go('setup'); return; }
    if(q) joinRoom(q); else if(saved) joinRoom(saved).catch(()=>{});
  };
  return api;
})();

/* ================= ROUTER ================= */
const GAMES = { 'thao-dinh': TD, 'sudoku': SD, '2048': G2048, 'mines': MINES, 'snake': SNAKE, 'tetris': TETRIS, 'memory': MEMO, 'caro': CARO, 'line98': LINE98, 'flappy': FLAPPY, 'breakout': BREAKOUT, 'slide': SLIDE, 'connect4': CONNECT4, 'whack': WHACK, 'math': MATHG, 'simon': SIMON };
const PAGES = ['menu','room','rank','setup','gh'];
let current = null;
function go(name){ location.hash = name || 'menu'; }
function route(){
  const raw = (location.hash||'').replace('#','');
  let h = raw;
  if(!GAMES[h] && !PAGES.includes(h)) h = raw==='' ? 'setup' : 'menu';
  if(h!=='setup' && !ME.id) h='setup';
  if(h==='room' && !ARC.code) h='menu';
  if(current && GAMES[current] && current!==h) GAMES[current].deactivate();
  if(current==='gh' && h!=='gh' && window.GH_leave) window.GH_leave();
  document.getElementById('ghx').classList.toggle('on', h==='gh');
  document.querySelectorAll('#arc .view').forEach(v=>v.classList.remove('on'));
  if(h!=='gh') document.getElementById('view-'+h).classList.add('on');
  const prev=current; current = h;
  if(GAMES[h]) { if(prev!==h) GAMES[h].activate(); }
  else if(h==='room') ARC.renderRoom();
  else if(h==='rank') ARC.renderRank();
  else if(h==='setup') ARC.renderSetup();
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
