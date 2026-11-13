/* =====================================================================
   GameHub — 13 game bài & đối kháng online (code gốc của GameHub cũ)
   Chạy trên Firebase dùng chung; cần javascript.js nạp trước.
   ===================================================================== */
// Global error handler for iOS Safari debugging
window.addEventListener('error',function(e){
  var ga=document.getElementById('garea');
  if(ga&&ga.children.length===0){
    ga.innerHTML='<div style="padding:16px;color:#ef4444;font-size:12px;background:rgba(239,68,68,.1);border-radius:12px;margin:12px;word-break:break-all"><b>⚠️ JS Error:</b><br>'+(e.message||'unknown')+'<br><small>'+(e.filename||'')+'<br>L'+(e.lineno||0)+'</small></div>';
  }
});
window.addEventListener('unhandledrejection',function(e){
  console.error('unhandled rejection',e.reason);
});

(function(){
"use strict";
if(!window.firebase){
  const msg=()=>toast('🃏 Không tải được Firebase');
  window.openLobby=msg; window.joinRoom=msg; window.goHome=()=>go('menu');
  return;
}
// Dùng chung kết nối Firebase với cả trang (khởi tạo trong javascript.js).
// Các hàm dưới đây giữ đúng cách gọi kiểu module cũ: ref(db,path), set(ref,v)...
const db=firebase.database();
const ref=(d,p)=>p==null?d.ref():d.ref(p);
const set=(r,v)=>r.set(v), update=(r,v)=>r.update(v), remove=r=>r.remove();
const get=r=>r.once('value');
const onValue=(r,cb,err)=>{r.on('value',cb,err);return()=>r.off('value',cb)};
const off=(r,t,cb)=>r.off(t,cb);
const push=(r,v)=>v===undefined?r.push():r.push(v);
const serverTimestamp=()=>firebase.database.ServerValue.TIMESTAMP;

const me=()=>window.HUB||{name:'Khách',av:'😎',id:'g0'};
const AI='__AI__',AI_A='🤖',AI_N='Robo AI 🤖';
const G={
  caro:{n:'Caro',i:'⚔️'},taixiu:{n:'Tài Xỉu',i:'🎲'},xidach:{n:'Xì Dách',i:'🃏'},
  cotuong:{n:'Cờ Tướng',i:'🀄'},baucua:{n:'Bầu Cua',i:'🦀'},oantuti:{n:'Oẳn Tù Tì',i:'✊'},
  speedmath:{n:'Đếm Nhanh',i:'🔢'},guessnumber:{n:'Số May Mắn',i:'🎯'},
  tienlen:{n:'Tiến Lên',i:'🏹'},poker:{n:'Poker',i:'♠️'},chanle:{n:'Chẵn Lẻ',i:'🎰'},
  xucxac:{n:'Xúc Xắc Chiến',i:'🎲'},phanxa:{n:'Phản Xạ',i:'⚡'}
};

let room=null,role=null,gU=null,cU=null,liveD=null,lastRes=null;
let cvs=null,ctx=null,cTmr=null,cLast=null,xTmr=null;
let txR=false,bcR=false;

const uid=()=>String(Math.floor(100+Math.random()*900)); // 3-digit numeric code
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
window.closeModal=()=>document.getElementById('ovl').classList.remove('on');
function modal(e,t,s){document.getElementById('mem').textContent=e;document.getElementById('mtitle').textContent=t;document.getElementById('msub').textContent=s;document.getElementById('ovl').classList.add('on')}
const showH=()=>{document.getElementById('room').classList.remove('show');document.getElementById('ovl').classList.remove('on');if(location.hash==='#menu')route();else go('menu')};
const showR=()=>{document.getElementById('room').classList.add('show');if(location.hash!=='#gh')go('gh')};
function resetA(){
  cvs=null;ctx=null;lastRes=null;liveD=null;cLast=null;
  if(cTmr){clearInterval(cTmr);cTmr=null}if(xTmr){clearInterval(xTmr);xTmr=null}
  document.getElementById('garea').innerHTML='';document.getElementById('cmsgs').innerHTML='';{const cv=document.getElementById('caro-vote');if(cv)cv.remove();}
}
window.goHome=()=>{if(room)leaveRoom();else showH()};

// PUBLIC ROOMS
onValue(ref(db,'rooms'),snap=>{
  const all=snap.val()||{},open=Object.entries(all).filter(([,v])=>v.status==='waiting'&&v.pub);
  const el=document.getElementById('rlist');
  if(!open.length){el.innerHTML='<div class="empty">Chưa có phòng nào</div>';return}
  el.innerHTML=open.map(([id,v])=>`<div class="ritem"><div><b style="font-size:13px">${v.icon||'🎮'} ${v.gn||''} — ${v.hav||''}${v.hn||''}</b><div style="font-size:11px;color:var(--muted2)"><span style="font-family:monospace;color:var(--purple)">#${id}</span></div></div><button class="btn btn-g btn-sm" onclick="joinRoom('${id}')">Vào</button></div>`).join('');
});

// LOBBY
window.openLobby=function(game){
  resetA();showR();const g=G[game];
  const hasAI=['caro','taixiu','xidach','baucua','oantuti','speedmath','guessnumber','cotuong','tienlen','poker','xucxac','phanxa','chanle'].includes(game);
  const aiBtn=hasAI?'<button class="btn btn-y" onclick="createRoom(\''+game+'\',true)">🤖 Chơi với AI</button><div class="divider">hoặc</div>':'';
  document.getElementById('garea').innerHTML='<div class="lobby">'
    +'<div class="lobby-title">'+g.i+' '+g.n+'</div>'
    +'<div class="lobby-sub">Chơi với bạn bè hoặc AI!</div>'
    +aiBtn
    +'<button class="btn btn-p" onclick="createRoom(\''+game+'\',false)">👥 Chơi với bạn bè</button>'
    +'<div class="divider">hoặc vào phòng</div>'
    +'<div class="joinrow"><input type="text" id="jcode" placeholder="···" maxlength="3" inputmode="numeric" pattern="[0-9]*" style="font-size:26px;font-weight:900;letter-spacing:8px;text-align:center;padding:12px 8px;border:2px solid var(--purple);border-radius:12px;background:var(--s2);color:var(--text);width:100%" />'
    +'<button class="btn btn-p" style="width:auto;padding:12px 20px;border-radius:12px;font-size:15px;white-space:nowrap" onclick="joinRoom(document.getElementById(\'jcode\').value.trim())">→ Vào</button></div>'
    +'<button class="btn btn-g" onclick="goHome()">← Quay lại</button>'
    +'</div>';
  const jc=document.getElementById('jcode');
  if(jc)jc.onkeydown=function(e){if(e.key==='Enter')joinRoom(this.value.trim());};
}

// CREATE & JOIN
function initData(game,h,ai){
  const g=G[game],d={game,gn:g.n,icon:g.i,hn:h.name,hav:h.av,hid:h.id,
    status:ai?'playing':'waiting',pub:!ai,ts:serverTimestamp()};
  if(ai){d.gid=AI;d.gnm=AI_N;d.gav=AI_A;d.isAI=true}
  if(game==='caro'){const c={};for(let r=0;r<20;r++){c[r]={};for(let k=0;k<20;k++)c[r][k]=null}
    Object.assign(d,{cells:c,turn:null,winner:null,winLine:null,score:{h:0,g:0,d:0},caroTime:null,caroStatus:'waiting',caroReady:{host:false,guest:false},caroLastLoser:null})}
  if(game==='taixiu'){const w={[h.id]:5e5};if(ai)w[AI]=5e5;Object.assign(d,{dice:[1,1,1],phase:'bet',bets:{},coins:{},wallets:w})}
  if(game==='xidach'){const pl={[h.id]:{name:h.name,av:h.av,coins:5e5,bet:0,hand:[],done:false}};
    if(ai)pl[AI]={name:AI_N,av:AI_A,coins:5e5,bet:0,hand:[],done:false};
    Object.assign(d,{xp:'lobby',players:pl,deck:[],xdDone:{},xdResult:{},xdDelta:{},xdShow:false,xdTime:0,xdSpecials:{}})}
  if(game==='cotuong')Object.assign(d,{ctBoard:initCT(),ctTurn:'red',ctStatus:'playing',ctScore:{r:0,b:0}});
  // CT AI: red=host, black=AI guest
  if(game==='tienlen'){const p={[h.id]:{name:h.name,av:h.av,hand:[],done:false,ready:false}};if(ai){p[AI]={name:AI_N,av:AI_A,hand:[],done:false,ready:true}}Object.assign(d,{tlPhase:'waiting',tlPlayers:p,tlPile:[],tlTurn:null,tlPass:{},tlWinner:null,tlMaxPlayers:4})}
  if(game==='poker'){const p={[h.id]:{name:h.name,av:h.av,hand:[],chips:1000,bet:0,folded:false,allin:false}};if(ai)p[AI]={name:AI_N,av:AI_A,hand:[],chips:1000,bet:0,folded:false,allin:false};Object.assign(d,{pkPhase:'waiting',pkPlayers:p,pkDeck:[],pkCommunity:[],pkPot:0,pkTurn:h.id,pkRound:'preflop',pkBigBlind:20,pkBet:0})}
  if(game==='xucxac')Object.assign(d,{xxPhase:'ready',xxDice:{},xxScore:{h:0,g:0},xxRound:1});
  if(game==='phanxa')Object.assign(d,{pxPhase:'waiting',pxSignal:false,pxWinner:null,pxScore:{h:0,g:0},pxRound:1});
  if(game==='chanle'){Object.assign(d,{clPhase:'bet',clBets:{},clCoins:{},clWallets:{[h.id]:1000},clResult:null,clSecret:null})}
  if(game==='baucua'){const w={[h.id]:5e5};if(ai)w[AI]=5e5;Object.assign(d,{bcp:'bet',bcDice:[0,0,0],bcBets:{},bcCoins:{},bcW:w,bcResult:null})}
  if(game==='oantuti')Object.assign(d,{otp:'choose',otC:{},otScore:{h:0,g:0},otRound:1,otRes:null,otWinner:null});
  if(game==='speedmath'){const q=smQ();Object.assign(d,{smp:'ready',smQ2:null,smA:{},smRound:1,smScore:{h:0,g:0},smWinner:null})}
  if(game==='guessnumber')Object.assign(d,{gnp:'guess',gnS:Math.ceil(Math.random()*100),gnG:{},gnRound:1,gnScore:{h:0,g:0},gnW:null});
  return d;
}
window.createRoom=async function(game,ai){
  resetA();const id=uid();room=id;role='host';const h=me();
  await set(ref(db,`rooms/${id}`),initData(game,h,ai));
  history.replaceState(null,'',`${location.pathname}?room=${id}`);
  listen2(id,game);sysMsg(`${h.av} ${h.name} tạo phòng`);
  if(ai)sysMsg(`${AI_A} ${AI_N} vào phòng`);
};
window.joinRoom=async function(id){
  if(!id){showToast('⚠️ Nhập mã phòng!');return}
  // id already numeric
  let snap;try{snap=await get(ref(db,`rooms/${id}`))}catch(e){showToast('❌ Lỗi kết nối!');return}
  if(!snap.exists()){showToast('❌ Không tìm thấy!');return}
  const d=snap.val();
  const hSelf=me();
  // Allow rejoin if you were previously in this room
  if(d.hid===hSelf.id){
    // Rejoining as host
    resetA();room=id;role='host';
    history.replaceState(null,'',`${location.pathname}?room=${id}`);
    listen2(id,d.game);sysMsg(`${hSelf.av} ${hSelf.name} quay lại`);return;
  }
  if(d.gid===hSelf.id){
    // Rejoining as guest
    resetA();room=id;role='guest';
    history.replaceState(null,'',`${location.pathname}?room=${id}`);
    listen2(id,d.game);sysMsg(`${hSelf.av} ${hSelf.name} quay lại`);return;
  }
  if(d.game==='tienlen'&&d.tlPlayers&&d.tlPlayers[hSelf.id]){resetA();room=id;role='guest';history.replaceState(null,'',`${location.pathname}?room=${id}`);listen2(id,d.game);sysMsg(`${hSelf.av} ${hSelf.name} quay lại`);return}
  if(d.game==='tienlen'&&(d.tlPhase||'waiting')!=='waiting'){showToast('⏳ Bàn đang chơi — chờ ván sau rồi vào lại nhé');return}
  if(d.gid&&d.status!=='waiting'&&d.game!=='tienlen'){showToast('❌ Phòng đã đầy!');return}
  resetA();room=id;role='guest';const h=me();
  const u={gid:h.id,gnm:h.name,gav:h.av,status:d.game==='tienlen'?d.status:'playing',pub:d.game==='tienlen'?Object.keys(d.tlPlayers||{}).length+1<4:false,...(d.game==='caro'?{caroStatus:'ready','caroReady/host':false,'caroReady/guest':false}:{})};
  if(d.game==='xidach')u[`players/${h.id}`]={name:h.name,av:h.av,coins:5e5,bet:0,hand:[],done:false};
  if(d.game==='taixiu')u[`wallets/${h.id}`]=5e5;
  if(d.game==='baucua')u[`bcW/${h.id}`]=5e5;
  if(d.game==='chanle')u[`clWallets/${h.id}`]=1000;
  if(d.game==='tienlen'){if(Object.keys(d.tlPlayers||{}).length>=4){showToast('❌ Phòng đã đủ 4 người!');room=null;role=null;return}u[`tlPlayers/${h.id}`]={name:h.name,av:h.av,hand:[],done:false,ready:false}}
  if(d.game==='poker')u[`pkPlayers/${h.id}`]={name:h.name,av:h.av,hand:[],chips:1000,bet:0,folded:false,allin:false};
  await update(ref(db,`rooms/${id}`),u);
  history.replaceState(null,'',`${location.pathname}?room=${id}`);
  listen2(id,d.game);sysMsg(`${h.av} ${h.name} vào phòng`);
};
function listen2(id,game){
  showR();if(gU){try{off(ref(db,`rooms/${id}`))}catch(e){}gU=null}
  gU=onValue(ref(db,`rooms/${id}`),snap=>{
    if(!snap.exists()){leaveLocal();return}
    const d=snap.val();liveD=d;
    const fn={caro:renderCaro,taixiu:renderTX,xidach:renderXD,cotuong:renderCT,baucua:renderBC,oantuti:renderOT,speedmath:renderSM,guessnumber:renderGN,tienlen:renderTL,poker:renderPK,chanle:renderCL,xucxac:renderXX,phanxa:renderPX};
    try{if(fn[game])fn[game](d,id);}catch(e){document.getElementById('garea').innerHTML='<div style="padding:20px;color:#ef4444;font-size:13px;background:rgba(239,68,68,.1);border-radius:12px;margin:16px;word-break:break-all"><b>⚠️ Lỗi render:</b><br>'+String(e)+'<br><br><small>'+((e&&e.stack)||'').slice(0,300)+'</small></div>';console.error('renderErr',e);}
    document.getElementById('ocnt').textContent=(d.gid?2:1)+' online';
    if(d.isAI&&role==='host')aiReact(d,id,game);
    // Poker: host advances game when pkNeedAdvance is set (by guest's action)
    if(game==='poker'&&role==='host'&&d.pkNeedAdvance&&d.pkPhase==='playing'){
      pkNext2();
    }
  });
  listenChat(id);
}
function mkW(id){
  const lnk=`${location.href.split('?')[0]}?room=${id}`;
  const b=document.createElement('div');b.className='wbox';b.id='wbox';
  b.innerHTML=`<div class="pulse">⏳</div><div style="font-size:16px;font-weight:800">Đang chờ bạn bè...</div><div class="lbox" onclick="copyL('${lnk}')">${lnk}</div><small style="color:var(--muted)">👆 Click để copy</small>`;
  document.getElementById('garea').prepend(b);
}
const rmW=()=>{const w=document.getElementById('wbox');if(w)w.remove()};

// ── CARO ──
const NC=20,NR=20,WIN=5;
const CARO_TIME=15; // giây/lượt
function getCaroSZ(){const w=document.getElementById('garea')?.clientWidth||window.innerWidth;return Math.min(560,w-24)}
const gc=(cells,r,col)=>{if(!cells||!cells[r])return null;return cells[r][col]||null};
const clC=cells=>{const o={};for(let r=0;r<NR;r++){o[r]={};for(let k=0;k<NC;k++)o[r][k]=gc(cells,r,k)}return o};

function renderCaro(d,id){
  const hn=(d.hav||'')+(d.hn||'Host'),gn=d.gnm?(d.gav||'')+(d.gnm):'Chờ...';

  if(!document.getElementById('cboard')){
    document.getElementById('garea').innerHTML=`
      <div class="gtop">
        <div class="gtitle">⚔️ Caro <span class="cbadge" onclick="copyL('${location.href.split('?')[0]}?room=${id}')">#${id} 📋</span></div>
        <div class="gbtns"><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div>
      </div>
      <div class="prow">
        <div class="ppill" id="px"><span class="sx">✕</span><span id="pxn" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">…</span></div>
        <div class="tmid" id="tmid">VS</div>
        <div class="ppill" id="po"><span class="so">○</span><span id="pon" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">…</span></div>
      </div>
      <div id="ctmr" style="width:100%;max-width:560px;display:none">
        <div style="display:flex;align-items:center;gap:10px;padding:4px 0">
          <div style="flex:1;height:6px;background:var(--s3);border-radius:3px;overflow:hidden">
            <div id="ctmrbar" style="height:100%;width:100%;background:var(--green);transition:width 1s linear;border-radius:3px"></div>
          </div>
          <span id="ctmrtxt" style="font-size:13px;font-weight:800;color:var(--green);min-width:32px;text-align:right">${CARO_TIME}s</span>
        </div>
      </div>
      <canvas id="cboard" width="560" height="560"></canvas>
      <div class="scrow">
        <div class="sc"><div class="scl">✕ Thắng</div><div class="scv scvx" id="scx">0</div></div>
        <div class="sc"><div class="scl">Hòa</div><div class="scv scvd" id="scd">0</div></div>
        <div class="sc"><div class="scl">○ Thắng</div><div class="scv scvo" id="sco">0</div></div>
      </div>`;
    cvs=document.getElementById('cboard');ctx=cvs.getContext('2d');
    const SZ2=getCaroSZ();cvs.width=SZ2*2;cvs.height=SZ2*2;cvs.style.width=SZ2+'px';cvs.style.height=SZ2+'px';cvs.style.maxWidth='100%';
    cvs.addEventListener('click',caroClick);
    cvs.addEventListener('touchend',e=>{e.preventDefault();const t=e.changedTouches[0];caroClick({clientX:t.clientX,clientY:t.clientY})},{passive:false});
    window._caroResize=()=>{if(!cvs)return;const S=getCaroSZ();cvs.width=S*2;cvs.height=S*2;cvs.style.width=S+'px';cvs.style.height=S+'px';if(liveD)drawCaro(liveD.cells||{},liveD.winLine||null,liveD.lastMove||null)};
    window.addEventListener('resize',window._caroResize);
  }

  // Update player names
  const pxnEl=document.getElementById('pxn'),ponEl=document.getElementById('pon');
  if(pxnEl)pxnEl.textContent=hn;
  if(ponEl)ponEl.textContent=gn;

  // ── READY PHASE: cả 2 bấm sẵn sàng ──
  if(d.caroStatus==='ready'){
    const myReady=d.caroReady?.[role]||false;
    const hostReady=d.caroReady?.host||false;
    const guestReady=d.caroReady?.guest||false;
    const readyHtml=`<div style="background:var(--s1);border:1.5px solid var(--b2);border-radius:14px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:14px;max-width:360px;width:100%;text-align:center">
      <div style="font-size:28px">⚔️</div>
      <div style="font-size:16px;font-weight:800">Sẵn sàng chiến chưa?</div>
      <div style="display:flex;gap:16px;justify-content:center;width:100%">
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--muted2)">${hn}</div>
          <div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;background:${hostReady?'rgba(16,185,129,.2)':'var(--s3)'};border:2px solid ${hostReady?'var(--green)':'var(--b2)'}">${hostReady?'✅':'⏳'}</div>
        </div>
        <div style="font-size:20px;color:var(--muted);align-self:center">VS</div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--muted2)">${gn}</div>
          <div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;background:${guestReady?'rgba(16,185,129,.2)':'var(--s3)'};border:2px solid ${guestReady?'var(--green)':'var(--b2)'}">${guestReady?'✅':'⏳'}</div>
        </div>
      </div>
      ${!myReady
        ?`<button class="btn btn-p" onclick="caroSetReady()" style="max-width:200px;border-radius:10px">✅ Tôi sẵn sàng!</button>`
        :`<div style="font-size:13px;color:var(--green);font-weight:600">✅ Đã sẵn sàng — chờ đối thủ...</div>`}
      <div style="font-size:12px;color:var(--muted2)">Cả hai sẵn sàng → tự động bắt đầu</div>
    </div>`;
    // Insert/update ready box
    let rb=document.getElementById('caro-ready');
    if(!rb){rb=document.createElement('div');rb.id='caro-ready';rb.style.cssText='display:flex;justify-content:center;width:100%;margin-bottom:4px';document.getElementById('garea').insertBefore(rb,document.getElementById('cboard'))}
    rb.innerHTML=readyHtml;
    // Hide canvas during ready
    const cv=document.getElementById('cboard');if(cv)cv.style.display='none';
    const tmr=document.getElementById('ctmr');if(tmr)tmr.style.display='none';
    document.getElementById('tmid').textContent='⏳';
    document.getElementById('px').className='ppill';
    document.getElementById('po').className='ppill';
    rmW();return;
  }

  // Hide ready box once game starts
  const rb=document.getElementById('caro-ready');if(rb)rb.remove();
  const cv2=document.getElementById('cboard');if(cv2)cv2.style.display='block';

  // ── WAITING for 2nd player ──
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();

  const myT=d.turn===role&&d.caroStatus==='playing';
  document.getElementById('px').className='ppill'+(d.turn==='host'&&d.caroStatus==='playing'?' ax':'');
  document.getElementById('po').className='ppill'+(d.turn==='guest'&&d.caroStatus==='playing'?' ao':'');
  if(cv2)cv2.className=myT?'':'wait';
  document.getElementById('tmid').textContent=d.caroStatus==='ready'?'⏳':myT?'🎯 Bạn':d.caroStatus==='finished'?'⏹':'⏳ Chờ';

  const sc=d.score||{};
  document.getElementById('scx').textContent=sc.h||0;
  document.getElementById('sco').textContent=sc.g||0;
  document.getElementById('scd').textContent=sc.d||0;

  drawCaro(d.cells||{},d.winLine||null,d.lastMove||null);

  // Timer bar
  const td=document.getElementById('ctmr'),tb=document.getElementById('ctmrbar'),tt=document.getElementById('ctmrtxt');
  if(td&&d.caroStatus==='playing'&&d.caroTime!=null){
    td.style.display='block';
    const t=d.caroTime||0;
    const col=t>7?'var(--green)':t>4?'var(--yellow)':'var(--red)';
    if(tb){tb.style.width=(t/CARO_TIME*100)+'%';tb.style.background=col}
    if(tt){tt.textContent=t+'s';tt.style.color=col}
  }else if(td)td.style.display='none';

  // Host drives timer
  if(d.caroStatus==='playing'&&role==='host'){
    const tk=d.turn+'_'+(d.lastMove?d.lastMove.join(','):'x');
    if(cLast!==tk){cLast=tk;startCaroTimer(d,id)}
  }else if(d.caroStatus!=='playing'){if(cTmr){clearInterval(cTmr);cTmr=null}cLast=null}

  // Result modal + vote next round
  const rk=(d.winner||'x')+(d.caroStatus==='finished'?'1':'0');
  if(d.caroStatus==='finished'){
    // Show board result first, then vote panel after 2.5s
    const rk2=(d.winner||'x');
    if(lastRes!==rk2){
      lastRes=rk2;
      // Keep board visible to see win line, then show vote
      setTimeout(()=>renderCaroVote(d,hn,gn),2500);
    }else if(document.getElementById('caro-vote')){
      renderCaroVote(d,hn,gn); // update vote state if already showing
    }
  }

}

function renderCaroVote(d,hn,gn){
  const iw=d.winner===role,no=!d.winner,wn=d.winner==='host'?hn:gn;
  const vote=d.caroVote||{};
  const myVote=vote[role];
  const oppVote=vote[role==='host'?'guest':'host'];

  let panel=document.getElementById('caro-vote');
  if(!panel){
    panel=document.createElement('div');
    panel.id='caro-vote';
    panel.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px';
    document.getElementById('ghx').appendChild(panel);
  }

  // Handle opponent leaving immediately
  if(oppVote==='leave'){showCaroOpponentLeft();return;}
  const oppStatus=oppVote==='next'
    ?'<div style="font-size:13px;color:var(--green);font-weight:600;margin-top:4px">✅ Đối thủ muốn chơi tiếp</div>'
    :'<div style="font-size:13px;color:var(--muted2);margin-top:4px">⏳ Chờ đối thủ chọn...</div>';

  panel.innerHTML=`<div style="background:var(--s1);border:1px solid var(--b2);border-radius:20px;padding:28px 24px;max-width:320px;width:100%;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;animation:pi .25s ease">
    <div style="font-size:52px">${no?'🤝':iw?'🏆':'😢'}</div>
    <div style="font-size:22px;font-weight:900">${no?'Hòa!':iw?'Bạn thắng!':'Thua rồi!'}</div>
    <div style="font-size:14px;color:var(--muted2)">${no?'Không ai thắng.':wn+' thắng ván này!'}</div>
    ${!myVote?`
      <div style="display:flex;flex-direction:column;gap:8px;width:100%">
        <button class="btn btn-p" onclick="caroVote('next')" style="border-radius:12px;padding:14px;font-size:15px">🔄 Ván tiếp</button>
        <button class="btn btn-d" onclick="caroVote('leave')" style="border-radius:12px;padding:12px;font-size:14px">🚪 Thoát phòng</button>
      </div>
    `:`
      <div style="font-size:14px;color:${myVote==='next'?'var(--green)':'var(--red)'};font-weight:700">
        ${myVote==='next'?'✅ Bạn muốn chơi tiếp':'❌ Bạn đã chọn thoát'}
      </div>
    `}
    ${oppStatus}
  </div>`;
}

function showCaroOpponentLeft(){
  const panel=document.getElementById('caro-vote');
  if(!panel)return;
  panel.innerHTML=`<div style="background:var(--s1);border:1px solid var(--b2);border-radius:20px;padding:28px 24px;max-width:320px;width:100%;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">
    <div style="font-size:48px">👋</div>
    <div style="font-size:18px;font-weight:900">Đối thủ đã rời phòng</div>
    <div style="font-size:13px;color:var(--muted2)">Ván đấu kết thúc — đối thủ đã chọn thoát.</div>
    <button class="btn btn-g" onclick="caroGoHome()" style="border-radius:12px;max-width:200px">🏠 Về trang chủ</button>
  </div>`;
}

window.caroSetReady=async function(){
  if(!room)return;
  await update(ref(db,`rooms/${room}`),{[`caroReady/${role}`]:true});
  // Check if both ready → start
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  if(d.caroReady?.host&&d.caroReady?.guest){
    // Determine first turn: loser of last game goes first; default host
    const firstTurn=d.caroLastLoser||'host';
    await update(ref(db,`rooms/${room}`),{caroStatus:'playing',turn:firstTurn,caroTime:CARO_TIME});
  }
};

function startCaroTimer(d,id){
  if(cTmr){clearInterval(cTmr);cTmr=null}
  let t=CARO_TIME;
  cTmr=setInterval(async()=>{
    if(!room||!liveD||liveD.caroStatus!=='playing'){clearInterval(cTmr);cTmr=null;return}
    t=Math.max(0,t-1);
    try{await update(ref(db,`rooms/${room}`),{caroTime:t})}catch(e){}
    if(t<=0){
      clearInterval(cTmr);cTmr=null;
      const sn=await get(ref(db,`rooms/${room}`));if(!sn.exists())return;
      const d2=sn.val();if(d2.caroStatus!=='playing')return;
      // Auto-play random empty cell for current player
      const emp=[];for(let r=0;r<NR;r++)for(let c=0;c<NC;c++)if(!gc(d2.cells,r,c))emp.push([r,c]);
      if(!emp.length)return;
      const[row,col]=emp[Math.floor(Math.random()*emp.length)];
      const cells=clC(d2.cells);cells[row][col]=d2.turn;
      const wl=checkCW(cells,row,col);
      const sc={...(d2.score||{h:0,g:0,d:0})};let st='playing',wn=null;
      if(wl){st='finished';wn=d2.turn;if(d2.turn==='host')sc.h=(sc.h||0)+1;else sc.g=(sc.g||0)+1}
      cLast=null;
      await update(ref(db,`rooms/${room}`),{
        cells,turn:d2.turn==='host'?'guest':'host',caroStatus:st,
        lastMove:[row,col],winner:wn||null,winLine:wl||null,score:sc,caroTime:CARO_TIME,
        ...(wn?{caroLastLoser:wn==='host'?'guest':'host'}:{})
      });
    }
  },1000);
}

function drawCaro(cells,wl,lm){
  if(!ctx||!cvs)return;
  const SZ=cvs.width/2,CS=SZ/NC;
  ctx.save();ctx.scale(2,2);
  ctx.clearRect(0,0,SZ,SZ);ctx.fillStyle='#11111e';ctx.beginPath();ctx.roundRect(0,0,SZ,SZ,8);ctx.fill();
  ctx.strokeStyle='#ffffff0c';ctx.lineWidth=1;
  for(let i=0;i<=NC;i++){ctx.beginPath();ctx.moveTo(i*CS,0);ctx.lineTo(i*CS,SZ);ctx.stroke()}
  for(let i=0;i<=NR;i++){ctx.beginPath();ctx.moveTo(0,i*CS);ctx.lineTo(SZ,i*CS);ctx.stroke()}
  if(lm){const[r,c]=lm;ctx.fillStyle='rgba(255,255,255,.06)';ctx.fillRect(c*CS+1,r*CS+1,CS-2,CS-2)}
  for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){
    const v=gc(cells,r,c);if(!v)continue;
    const cx=c*CS+CS/2,cy=r*CS+CS/2,R=CS*.31;
    if(v==='host'){ctx.strokeStyle='#8b5cf6';ctx.lineWidth=CS*.13;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(cx-R,cy-R);ctx.lineTo(cx+R,cy+R);ctx.stroke();ctx.beginPath();ctx.moveTo(cx+R,cy-R);ctx.lineTo(cx-R,cy+R);ctx.stroke()}
    else{ctx.strokeStyle='#ec4899';ctx.lineWidth=CS*.11;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke()}
  }
  if(wl&&wl.length){
    const[r0,c0]=wl[0],[r1,c1]=wl[wl.length-1];
    ctx.strokeStyle='rgba(255,215,0,.9)';ctx.lineWidth=4;ctx.lineCap='round';ctx.shadowColor='#ffd700';ctx.shadowBlur=12;
    ctx.beginPath();ctx.moveTo(c0*CS+CS/2,r0*CS+CS/2);ctx.lineTo(c1*CS+CS/2,r1*CS+CS/2);ctx.stroke();
    ctx.shadowBlur=0;
  }
  ctx.restore();
}

function caroClick(e){
  const d=liveD;if(!d||!room||d.caroStatus!=='playing')return;
  if(d.turn!==role){showToast('⏳ Chưa đến lượt!');return}
  const rect=cvs.getBoundingClientRect();
  const SZ=cvs.width/2,CS=SZ/NC;
  const col=Math.floor((e.clientX-rect.left)*cvs.width/rect.width/2/CS);
  const row=Math.floor((e.clientY-rect.top)*cvs.height/rect.height/2/CS);
  if(row<0||row>=NR||col<0||col>=NC)return;
  if(gc(d.cells,row,col)){showToast('❌ Ô đã có quân!');return}
  const cells=clC(d.cells);cells[row][col]=role;
  const wl=checkCW(cells,row,col);
  let full=true;for(let r=0;r<NR&&full;r++)for(let c=0;c<NC&&full;c++)if(!gc(cells,r,c))full=false;
  const sc={...(d.score||{h:0,g:0,d:0})};let st='playing',wn=null;
  if(wl){st='finished';wn=role;if(role==='host')sc.h=(sc.h||0)+1;else sc.g=(sc.g||0)+1}
  else if(full){st='finished';sc.d=(sc.d||0)+1}
  cLast=null;
  update(ref(db,`rooms/${room}`),{
    cells,turn:role==='host'?'guest':'host',caroStatus:st,
    lastMove:[row,col],winner:wn||null,winLine:wl||null,score:sc,caroTime:CARO_TIME,
    ...(wn?{caroLastLoser:wn==='host'?'guest':'host'}:{})
  });
}

function checkCW(cells,r,c){
  const v=gc(cells,r,c);if(!v)return null;
  for(const[dr,dc]of[[0,1],[1,0],[1,1],[1,-1]]){
    const line=[[r,c]];
    for(const s of[-1,1]){let nr=r+dr*s,nc=c+dc*s;while(nr>=0&&nr<NR&&nc>=0&&nc<NC&&gc(cells,nr,nc)===v){line.push([nr,nc]);nr+=dr*s;nc+=dc*s}}
    if(line.length>=WIN)return line;
  }return null;
}

window.caroGoHome=function(){
  const p=document.getElementById('caro-vote');if(p)p.remove();
  if(cTmr){clearInterval(cTmr);cTmr=null}
  leaveLocal();
};

window.caroVote=async function(choice){
  if(!room)return;
  await update(ref(db,`rooms/${room}`),{[`caroVote/${role}`]:choice});
  if(choice==='leave'){
    // Remove vote panel and leave
    const p=document.getElementById('caro-vote');if(p)p.remove();
    leaveRoom();
    return;
  }
  // Check if both voted 'next'
  const sn=await get(ref(db,`rooms/${room}`));if(!sn.exists())return;
  const d=sn.val(),vote=d.caroVote||{};
  if(vote.host==='next'&&vote.guest==='next'){
    // Both want next round — reset board
    lastRes=null;cLast=null;
    const p=document.getElementById('caro-vote');if(p)p.remove();
    if(cTmr){clearInterval(cTmr);cTmr=null}
    const cells={};for(let r=0;r<NR;r++){cells[r]={};for(let k=0;k<NC;k++)cells[r][k]=null}
    const firstTurn=d.caroLastLoser||'host';
    await update(ref(db,`rooms/${room}`),{
      cells,caroStatus:'ready',turn:null,lastMove:null,winner:null,winLine:null,
      caroTime:null,caroReady:{host:false,guest:false},caroVote:{}
    });
  }
};

// ── TÀI XỈU ──
const DF=['','⚀','⚁','⚂','⚃','⚄','⚅'],TX_C=[5000,10000,20000,50000,100000];
function renderTX(d,id){
  const h=me();
  if(!document.getElementById('txw')){
    document.getElementById('garea').innerHTML=`<div class="gtop"><div class="gtitle">🎲 Tài Xỉu <span class="cbadge" onclick="copyL('${location.href.split('?')[0]}?room=${id}')">#${id} 📋</span></div><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div>
    <div id="txw" style="width:100%;max-width:460px;display:flex;flex-direction:column;gap:12px;padding-bottom:32px">
      <div style="background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:10px">
        <div class="drow"><div class="die" id="d0">⚀</div><div class="die" id="d1">⚁</div><div class="die" id="d2">⚂</div></div>
        <div id="txr" style="font-size:28px;font-weight:900;opacity:0">—</div><div id="txs" style="font-size:13px;color:var(--muted2)"></div>
      </div>
      <div id="txbet" style="background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px"></div>
      <div id="txpl" style="background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px"></div>
      <button class="btn btn-y" id="txroll" onclick="txRoll()" disabled style="border-radius:14px;padding:16px;font-size:16px">🎲 Lắc xúc xắc</button>
      <div id="txres2" style="display:none;background:var(--s2);border:1px solid var(--b2);border-radius:14px;padding:14px;flex-direction:column;gap:8px"></div>
    </div>`;
  }
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();
  const dice=d.dice||[1,1,1];for(let i=0;i<3;i++){const el=document.getElementById('d'+i);if(el)el.textContent=DF[dice[i]]}
  const sum=dice.reduce((a,b)=>a+b,0);const rs=document.getElementById('txr'),ss=document.getElementById('txs');
  if(d.phase==='result'){const tai=sum>=11;if(rs){rs.textContent=tai?'TÀI 🔼':'XỈU 🔽';rs.style.color=tai?'var(--green)':'var(--pink)';rs.style.opacity='1'}if(ss)ss.textContent='Tổng: '+sum}
  else{if(rs)rs.style.opacity='0';if(ss)ss.textContent=''}
  const myBet=d.bets?.[h.id],myCoin=d.coins?.[h.id]||TX_C[0],myW=d.wallets?.[h.id]||5e5;
  const betEl=document.getElementById('txbet');
  if(betEl){betEl.innerHTML=`<div style="font-size:11px;font-weight:700;color:var(--muted2);text-transform:uppercase;letter-spacing:1px">💰 Cược & Chọn</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${TX_C.map(v=>`<div class="chip${myCoin===v?' on':''}" onclick="${d.phase==='bet'?'txSC('+v+')':''}">${v>=1000?v/1000+'K':v}</div>`).join('')}<div class="chip${myCoin===myW&&myW>0?' on':''}" onclick="${d.phase==='bet'?'txSC('+myW+')':''}">All In</div></div>
    <div style="display:flex;gap:8px"><button onclick="${d.phase==='bet'?'txBet_tai()':''}" style="flex:1;padding:13px;border:2px solid ${myBet==='tai'?'var(--green)':'var(--b2)'};background:${myBet==='tai'?'rgba(16,185,129,.15)':'var(--s2)'};color:${myBet==='tai'?'var(--green)':'var(--text)'};border-radius:12px;text-align:center;font-weight:800;cursor:${d.phase==='bet'?'pointer':'default'};font-family:inherit;border-width:2px" ${d.phase!=='bet'?'disabled':''}>🔼 TÀI<div style="font-size:11px;font-weight:400">11–17</div></button>
    <button onclick="${d.phase==='bet'?'txBet_xiu()':''}" style="flex:1;padding:13px;border:2px solid ${myBet==='xiu'?'var(--pink)':'var(--b2)'};background:${myBet==='xiu'?'rgba(236,72,153,.15)':'var(--s2)'};color:${myBet==='xiu'?'var(--pink)':'var(--text)'};border-radius:12px;text-align:center;font-weight:800;cursor:${d.phase==='bet'?'pointer':'default'};font-family:inherit;border-width:2px" ${d.phase!=='bet'?'disabled':''}>🔽 XỈU<div style="font-size:11px;font-weight:400">4–10</div></button></div>
    <div style="font-size:13px;font-weight:700;color:var(--gold);text-align:center">${myBet?'✅ '+(myBet==='tai'?'TÀI':'XỈU')+' — '+myCoin.toLocaleString()+' xu':'Chọn mức cược'}</div>
    <div style="font-size:12px;color:var(--muted2);text-align:center">Ví: <b style="color:var(--gold)">${myW.toLocaleString()}</b> xu</div>`}
  const bets=d.bets||{},coins=d.coins||{},wallets=d.wallets||{};
  const players=[{id:d.hid,name:(d.hav||'')+(d.hn||'')}];if(d.gid)players.push({id:d.gid,name:(d.gav||'')+(d.gnm||'')});
  const plEl=document.getElementById('txpl');
  if(plEl)plEl.innerHTML=`<div style="font-size:11px;font-weight:700;color:var(--muted2);text-transform:uppercase">Người chơi</div>`+
    players.map(p=>{const b=bets[p.id],co=coins[p.id]||0,w=wallets[p.id]||5e5;
      return`<div style="display:flex;justify-content:space-between;align-items:center;background:${p.id===h.id?'rgba(139,92,246,.08)':'var(--s3)'};border:1px solid ${p.id===h.id?'var(--purple)':'transparent'};border-radius:8px;padding:8px 12px">
        <span style="font-size:13px;font-weight:600">${p.name}</span>
        <div style="text-align:right"><div style="font-size:12px;color:var(--gold);font-weight:700">${w.toLocaleString()} xu</div>${b?`<div style="font-size:11px;color:${b==='tai'?'var(--green)':'var(--pink)'};">${b.toUpperCase()} ${co.toLocaleString()}</div>`:''}</div>
      </div>`}).join('');
  const allBet=players.every(p=>bets[p.id]);const rb=document.getElementById('txroll');if(rb)rb.disabled=!(role==='host'&&allBet&&d.phase==='bet');
  const rr=document.getElementById('txres2');
  if(rr&&d.phase==='result'){rr.style.display='flex';rr.style.flexDirection='column';rr.style.gap='8px';const tai2=sum>=11;
    rr.innerHTML='<div style="font-size:11px;font-weight:700;color:var(--muted2);text-transform:uppercase;text-align:center">Kết quả</div>'+
      players.map(p=>{const b=bets[p.id],co=coins[p.id]||0,win=(b==='tai')===tai2;
        return`<div style="display:flex;justify-content:space-between"><span style="font-weight:600">${p.name}</span><span style="font-weight:900;color:${win?'var(--green)':'var(--red)'}">${win?'🏆 +':'💀 -'}${co.toLocaleString()}</span></div>`;
      }).join('')+(role==='host'?`<button class="btn btn-p" style="margin-top:4px" onclick="txNext()">Ván tiếp →</button>`:`<div style="font-size:12px;color:var(--muted);text-align:center">Chờ host...</div>`);
  }else if(rr)rr.style.display='none';
}
window.txSC=async function(v){if(!room)return;await update(ref(db,`rooms/${room}/coins`),{[me().id]:v})};
window.txBet_tai=()=>window.txBet('tai');
window.txBet_xiu=()=>window.txBet('xiu');
window.txBet=async function(c){if(!room)return;const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();if(d.phase!=='bet'){showToast('⛔');return}const h=me(),coin=d.coins?.[h.id]||TX_C[0],w=d.wallets?.[h.id]||5e5;if(coin>w){showToast('❌ Không đủ xu!');return}await update(ref(db,`rooms/${room}/bets`),{[h.id]:c});showToast(c==='tai'?'🔼 TÀI!':'🔽 XỈU!')};
window.txRoll=async function(){
  if(txR||role!=='host')return;txR=true;
  const iv=setInterval(()=>{for(let i=0;i<3;i++){const el=document.getElementById('d'+i);if(el){el.textContent=DF[Math.ceil(Math.random()*6)];el.classList.add('roll')}}},80);
  await new Promise(r=>setTimeout(r,900));clearInterval(iv);for(let i=0;i<3;i++){const el=document.getElementById('d'+i);if(el)el.classList.remove('roll')}
  txR=false;const dice=[Math.ceil(Math.random()*6),Math.ceil(Math.random()*6),Math.ceil(Math.random()*6)];
  const sum=dice.reduce((a,b)=>a+b,0);const tai=sum>=11;
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  const bets=d.bets||{},coins=d.coins||{},wallets={...(d.wallets||{})};
  const players=[{id:d.hid},{id:d.gid}].filter(p=>p.id);
  players.forEach(p=>{const b=bets[p.id],co=coins[p.id]||0,w=wallets[p.id]||5e5,win=(b==='tai')===tai;wallets[p.id]=Math.max(0,w+(win?co:-co))});
  await update(ref(db,`rooms/${room}`),{dice,phase:'result',wallets});
};
window.txNext=async()=>update(ref(db,`rooms/${room}`),{dice:[1,1,1],phase:'bet',bets:{},coins:{}});

// ── BẦU CUA ──
const BC_A=['🦐','🦀','🐟','🦌','🐦','🏺'],BC_N=['Tôm','Cua','Cá','Nai','Gà','Bầu'],BC_C=[5000,10000,20000,50000,100000];
function renderBC(d,id){
  const h=me();
  if(!document.getElementById('bcw')){
    document.getElementById('garea').innerHTML='<div class="gtop"><div class="gtitle">🦀 Bầu Cua <span class="cbadge" onclick="copyL(window.location.href)">#'+id+'</span></div><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div><div id="bcw" style="width:100%;max-width:480px;display:flex;flex-direction:column;gap:12px;padding-bottom:20px"></div>';
  }
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();
  const wrap=document.getElementById('bcw');if(!wrap)return;
  const phase=d.bcp||'bet',dice=d.bcDice||[0,0,0];
  const bets=d.bcBets||{},coins=d.bcCoins||{},wallets=d.bcW||{};
  const myBets=bets[h.id]||{},myCoin=coins[h.id]||BC_C[0],myW=wallets[h.id]||5e5;
  const players=[{id:d.hid,name:(d.hav||'')+(d.hn||'')}];
  if(d.gid)players.push({id:d.gid,name:(d.gav||'')+(d.gnm||'')});

  let html='';

  // ── Dice display ──
  html+=`<div style="background:linear-gradient(135deg,#1a1208,#0f0c06);border:2px solid #8b6914;border-radius:16px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:14px">
    <div style="display:flex;gap:16px;justify-content:center">
      ${dice.map((v,i)=>`<div style="width:80px;height:80px;background:linear-gradient(135deg,#2a1f08,#1a1208);border:2px solid ${phase==='result'&&v?'#c9a227':'#5a4010'};border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:42px;transition:all .3s;box-shadow:${phase==='result'&&v?'0 0 20px rgba(201,162,39,.3)':'none'}">${v?BC_A[v-1]:'❓'}</div>`).join('')}
    </div>
    ${phase==='result'
      ?`<div style="font-size:13px;font-weight:700;color:#c9a227">${dice.map(v=>v?BC_N[v-1]:'?').join(' · ')}</div>`
      :`<div style="font-size:12px;color:#8b6914">🎲 Đang chờ lắc...</div>`}
  </div>`;

  // ── Betting grid ──
  html+=`<div style="background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:12px;font-weight:700;color:var(--muted2);text-transform:uppercase;letter-spacing:1px">🎯 Đặt cược</div>
      <div style="font-size:12px;color:var(--gold);font-weight:700">Ví: ${myW.toLocaleString()} xu</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${BC_A.map((a,i)=>{
        const myB=myBets[i]||0;
        const hits=dice.filter(v=>v===i+1).length;
        const isWin=phase==='result'&&hits>0;
        return`<div onclick="${phase==='bet'?'bcBet('+i+')':''}"
          style="background:${myB>0?'rgba(139,92,246,.15)':isWin?'rgba(16,185,129,.1)':'var(--s3)'};
                 border:2px solid ${myB>0?'var(--purple)':isWin?'var(--green)':'var(--b1)'};
                 border-radius:14px;padding:14px 8px;text-align:center;
                 cursor:${phase==='bet'?'pointer':'default'};
                 transition:all .25s;position:relative;
                 transform:${myB>0?'scale(1.02)':'scale(1)'};
                 box-shadow:${myB>0?'0 4px 16px rgba(139,92,246,.25)':'none'}">
          <div style="font-size:32px;margin-bottom:4px">${a}</div>
          <div style="font-size:12px;font-weight:700;color:${isWin?'var(--green)':'var(--muted2)'}">${BC_N[i]}</div>
          ${myB>0?`<div style="font-size:10px;font-weight:800;color:var(--purple);margin-top:3px">+${myB.toLocaleString()}</div>`:''}
          ${isWin?`<div style="position:absolute;top:-8px;right:-8px;background:var(--green);color:#000;font-size:11px;font-weight:900;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center">×${hits}</div>`:''}
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${BC_C.map(v=>`<div class="chip${myCoin===v?' on':''}" onclick="${phase==='bet'?'bcSC('+v+')':''}" style="${phase!=='bet'?'cursor:default':''};">${v>=1000?v/1000+'K':v}</div>`).join('')}
      <div class="chip${myCoin===myW&&myW>0?' on':''}" onclick="${phase==='bet'?'bcSC('+myW+')':''}">All In</div>
    </div>
    <div style="font-size:12px;text-align:center;color:var(--muted2)">Chọn mức → bấm ô để đặt <span style="color:var(--gold);font-weight:700">${myCoin.toLocaleString()} xu</span>/ô</div>
  </div>`;

  // ── Players ──
  html+=`<div style="background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px">
    <div style="font-size:11px;font-weight:700;color:var(--muted2);text-transform:uppercase;letter-spacing:1px">Người chơi & Lựa chọn</div>
    ${players.map(p=>{
      const pb=bets[p.id]||{},pw=wallets[p.id]||5e5;
      const betEntries=Object.entries(pb).filter(([,v])=>v>0);
      const betHtml=betEntries.length>0
        ?betEntries.map(([an,bet])=>`<span style="background:rgba(139,92,246,.15);border:1px solid var(--purple);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700">${BC_A[parseInt(an)]} ${BC_N[parseInt(an)]} +${bet.toLocaleString()}</span>`).join('')
        :'<span style="font-size:12px;color:var(--muted)">Chưa đặt</span>';
      return`<div style="background:${p.id===h.id?'rgba(139,92,246,.08)':'var(--s3)'};border:1.5px solid ${p.id===h.id?'var(--purple)':'var(--b1)'};border-radius:10px;padding:10px 12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:13px;font-weight:700">${p.name}</span>
          <span style="font-size:12px;color:var(--gold);font-weight:700">${pw.toLocaleString()} xu</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${betHtml}</div>
      </div>`;
    }).join('')}
  </div>`;

  // ── Roll button ──
  if(phase==='bet'&&role==='host'&&players.some(p=>Object.keys(bets[p.id]||{}).length>0)){
    html+=`<button class="btn btn-y" onclick="bcRoll()" style="border-radius:14px;padding:18px;font-size:17px;font-weight:900">🎲 Lắc bầu cua!</button>`;
  }

  // ── Result ──
  if(phase==='result'&&d.bcResult){
    html+=`<div style="background:var(--s2);border:1.5px solid var(--b2);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px">
      <div style="font-size:12px;font-weight:700;color:var(--muted2);text-transform:uppercase;text-align:center;letter-spacing:1px">Kết quả ván này</div>
      ${players.map(p=>{const dlt=d.bcResult[p.id]||0;return`<div style="display:flex;justify-content:space-between;align-items:center;background:${dlt>0?'rgba(16,185,129,.08)':dlt<0?'rgba(239,68,68,.05)':'var(--s3)'};border:1px solid ${dlt>0?'var(--green)':dlt<0?'var(--red)':'var(--b1)'};border-radius:8px;padding:10px 14px">
        <span style="font-size:13px;font-weight:700">${p.name}</span>
        <span style="font-size:16px;font-weight:900;color:${dlt>0?'var(--green)':dlt<0?'var(--red)':'var(--muted2)'}">${dlt>0?'🏆 +':'💀 '}${dlt.toLocaleString()} xu</span>
      </div>`}).join('')}
      ${role==='host'?`<button class="btn btn-p" style="margin-top:4px" onclick="bcNext()">Ván tiếp →</button>`:`<div style="font-size:12px;color:var(--muted);text-align:center">Chờ host...</div>`}
    </div>`;
  }

  wrap.innerHTML=html;
}

window.bcSC=async function(v){if(!room)return;await update(ref(db,`rooms/${room}/bcCoins`),{[me().id]:v})};
window.bcBet=async function(a){if(!room)return;const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();if(d.bcp!=='bet')return;const h=me(),coin=d.bcCoins?.[h.id]||BC_C[0],ex=d.bcBets?.[h.id]||{};ex[a]=(ex[a]||0)+coin;await update(ref(db,`rooms/${room}/bcBets`),{[h.id]:ex});showToast(`${BC_A[a]} +${coin.toLocaleString()}`)};
window.bcRoll=async function(){
  if(bcR||role!=='host')return;bcR=true;
  const dice=[Math.ceil(Math.random()*6),Math.ceil(Math.random()*6),Math.ceil(Math.random()*6)];
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  const bets=d.bcBets||{},coins=d.bcCoins||{},wallets={...(d.bcW||{})};
  const players=[{id:d.hid},{id:d.gid}].filter(p=>p.id);
  const result={};
  players.forEach(p=>{const pb=bets[p.id]||{};let dlt=0;Object.entries(pb).forEach(([an,bet])=>{const cnt=dice.filter(v=>v===parseInt(an)+1).length;dlt+=cnt>0?bet*cnt:-bet});result[p.id]=dlt;wallets[p.id]=Math.max(0,(wallets[p.id]||5e5)+dlt)});
  bcR=false;await update(ref(db,`rooms/${room}`),{bcDice:dice,bcp:'result',bcResult:result,bcW:wallets});
};
window.bcNext=async()=>update(ref(db,`rooms/${room}`),{bcp:'bet',bcDice:[0,0,0],bcBets:{},bcResult:null});

// ── OẲN TÙ TÌ ──
const OT_I=['✊','✋','✌️'],OT_N=['Búa','Giấy','Kéo'],OT_W={'0':'2','1':'0','2':'1'};
function renderOT(d,id){
  const h=me();
  if(!document.getElementById('otw')){
    document.getElementById('garea').innerHTML=`<div class="gtop"><div class="gtitle">✊ Oẳn Tù Tì <span class="cbadge" onclick="copyL('${location.href.split('?')[0]}?room=${id}')">#${id} 📋</span></div><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div>
    <div id="otw" style="width:100%;max-width:420px;display:flex;flex-direction:column;gap:14px;align-items:center;padding-bottom:20px"></div>`;
  }
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();
  const wrap=document.getElementById('otw');if(!wrap)return;
  const choices=d.otC||{},score=d.otScore||{h:0,g:0},round=d.otRound||1;
  const hn=(d.hav||'')+(d.hn||'Host'),gn=d.gnm?(d.gav||'')+(d.gnm):'Chờ...';
  const myC=choices[h.id];
  let html=`<div style="width:100%;background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:16px;text-align:center">
    <div style="font-size:12px;color:var(--muted2);margin-bottom:8px">Ván ${round} · Bo5 — Thắng 3 ván trước</div>
    <div style="display:flex;justify-content:space-around">
      <div><div style="font-size:13px;font-weight:700">${hn}</div><div style="font-size:34px;font-weight:900;color:var(--purple)">${score.h||0}</div></div>
      <div style="font-size:20px;color:var(--muted);align-self:center">VS</div>
      <div><div style="font-size:13px;font-weight:700">${gn}</div><div style="font-size:34px;font-weight:900;color:var(--pink)">${score.g||0}</div></div>
    </div>
  </div>`;
  const otp=d.otp||'choose';
  if(otp==='choose'||otp==='both_chose'){
    const both=otp==='both_chose',otherD=choices[role==='host'?d.gid:d.hid]!=null;
    html+=`<div style="font-size:14px;font-weight:700;color:var(--muted2);text-align:center">${both?'🎯 Cả hai đã chọn!':myC!=null?'✅ Đã chọn — Chờ đối thủ...':'Chọn của bạn:'}</div>
    <div style="display:flex;gap:14px;justify-content:center">
      ${OT_I.map((it,i)=>{const ch=myC===i,dis=myC!=null||both;return`<div onclick="${!dis?'otChoose('+i+')':''}" style="width:86px;height:86px;background:${ch?'rgba(139,92,246,.25)':'var(--s1)'};border:2.5px solid ${ch?'var(--purple)':'var(--b2)'};border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:${!dis?'pointer':'default'};font-size:30px;opacity:${dis&&!ch?.4:1}">
        ${it}<div style="font-size:10px;color:var(--muted2);font-weight:600">${OT_N[i]}</div></div>`}).join('')}
    </div>`;
    if(!both&&otherD&&myC==null)html+=`<div style="font-size:13px;color:var(--yellow);font-weight:600">⚡ Đối thủ đã chọn!</div>`;
    if(both)html+=role==='host'?`<button class="btn btn-y" onclick="otReveal()" style="max-width:240px;border-radius:12px;padding:14px;font-size:15px">👁 Show Hand!</button>`:`<div style="background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:12px 20px;font-size:13px;color:var(--muted2);text-align:center">⏳ Chờ host mở bài...</div>`;
  }
  if(otp==='reveal'){
    const hC=choices[d.hid],gC=choices[d.gid],myR=role==='host',myCC=myR?hC:gC,oppC=myR?gC:hC,rr=d.otRes;
    const iw=(rr==='host'&&role==='host')||(rr==='guest'&&role==='guest'),rc=rr==='draw'?'var(--muted2)':iw?'var(--green)':'var(--red)';
    html+=`<div style="display:flex;gap:24px;justify-content:center;align-items:center">
      <div style="text-align:center"><div style="font-size:48px">${myCC!=null?OT_I[myCC]:'?'}</div><div style="font-size:12px;color:var(--muted2)">Bạn</div></div>
      <div style="font-size:22px;color:var(--muted)">VS</div>
      <div style="text-align:center"><div style="font-size:48px">${oppC!=null?OT_I[oppC]:'?'}</div><div style="font-size:12px;color:var(--muted2)">Đối thủ</div></div>
    </div>
    <div style="font-size:20px;font-weight:900;color:${rc};text-align:center">${rr==='draw'?'🤝 Hòa!':iw?'🏆 Thắng!':'😢 Thua'}</div>
    ${role==='host'?`<button class="btn btn-p" style="max-width:200px" onclick="otNext()">Tiếp →</button>`:`<div style="font-size:12px;color:var(--muted)">Chờ host...</div>`}`;
  }
  if(otp==='gameover'){const w=d.otWinner,iw=(w==='host'&&role==='host')||(w==='guest'&&role==='guest');
    html+=`<div style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;padding:20px 0;width:100%">
      <div style="font-size:56px">${w==='draw'?'🤝':iw?'🏆':'😢'}</div>
      <div style="font-size:22px;font-weight:900">${iw?'Bạn thắng!':'Thua rồi!'}</div>
      <div style="font-size:13px;color:var(--muted2)">Tỉ số: ${score.h||0} - ${score.g||0}</div>
      ${role==='host'?`<button class="btn btn-p" style="max-width:200px" onclick="otRestart()">🔄 Chơi lại</button>`:`<div style="font-size:12px;color:var(--muted)">Chờ host...</div>`}
    </div>`}
  wrap.innerHTML=html;
}
window.otChoose=async function(c){if(!room)return;const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();if(d.otp!=='choose')return;const h=me();if(d.otC?.[h.id]!=null){showToast('⚠️ Đã chọn!');return}await update(ref(db,`rooms/${room}/otC`),{[h.id]:c});const sn2=await get(ref(db,`rooms/${room}`));const d2=sn2.val();if(d2.otC?.[d2.hid]!=null&&d2.otC?.[d2.gid]!=null)await update(ref(db,`rooms/${room}`),{otp:'both_chose'})};
window.otReveal=async function(){if(!room)return;const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();const c=d.otC||{},hc=c[d.hid],gc2=c[d.gid];let rr='draw';if(OT_W[String(hc)]===String(gc2))rr='host';else if(OT_W[String(gc2)]===String(hc))rr='guest';const sc={...(d.otScore||{h:0,g:0})};if(rr==='host')sc.h=(sc.h||0)+1;else if(rr==='guest')sc.g=(sc.g||0)+1;let ph='reveal',wn=null;if(sc.h>=3){ph='gameover';wn='host'}else if(sc.g>=3){ph='gameover';wn='guest'}await update(ref(db,`rooms/${room}`),{otp:ph,otRes:rr,otScore:sc,otWinner:wn||null})};
window.otNext=async function(){if(!room)return;const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();await update(ref(db,`rooms/${room}`),{otp:'choose',otC:{},otRound:(d.otRound||1)+1,otRes:null})};
window.otRestart=async()=>{if(room)await update(ref(db,`rooms/${room}`),{otp:'choose',otC:{},otScore:{h:0,g:0},otRound:1,otRes:null,otWinner:null})};

// ── XÌ DÁCH ──
const SUITS=['♠','♥','♦','♣'],RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const ndeck=()=>{const d=[];for(const s of SUITS)for(const r of RANKS)d.push(r+s);for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d};
const cVal=c=>{const r=c.slice(0,-1);if(['J','Q','K'].includes(r))return 10;if(r==='A')return 11;return parseInt(r)};
const hVal=h=>{let v=h.reduce((a,c)=>a+cVal(c),0),a=h.filter(c=>c.startsWith('A')).length;while(v>21&&a-->0)v-=10;return v};
const isRed=c=>['♥','♦'].some(s=>c.endsWith(s));
const XD_C=[5000,10000,20000,50000,100000];
function xdSP(hand){const v=hVal(hand);if(hand.length===5&&v<=21)return'ngu_linh';if(hand.length===2&&hand.filter(c=>c.startsWith('A')).length===2)return'xi_ban';return null}
function xdMult(sp){return sp==='ngu_linh'||sp==='xi_ban'?2:1}
function xdLbl(sp){return sp==='ngu_linh'?'🌟 Ngũ Linh x2':sp==='xi_ban'?'🃏 Xì Bàn x2':''}
function mkCard(c,hide){if(hide||!c)return`<div class="card-el card-back"><span style="font-size:22px">🂠</span></div>`;const r=c.slice(0,-1),s=c.slice(-1),col=isRed(c)?'#f87171':'#f0f0ff';return`<div class="card-el"><div class="card-rank" style="color:${col}">${r}</div><div class="card-suit" style="color:${col}">${s}</div></div>`}

function renderXD(d,id){
  const h=me(),players=d.players||{},xp=d.xp||'lobby',plist=Object.entries(players);
  if(!document.getElementById('xdw')){
    document.getElementById('garea').innerHTML=`<div class="gtop"><div class="gtitle">🃏 Xì Dách <span class="cbadge" onclick="copyL('${location.href.split('?')[0]}?room=${id}')">#${id} 📋</span></div><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div>
    <div id="xdw" style="width:100%;max-width:500px;display:flex;flex-direction:column;gap:10px;padding-bottom:20px"></div>`;
  }
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();
  const wrap=document.getElementById('xdw');if(!wrap)return;
  let html='';
  if(xp==='lobby'){html=`<div style="background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
    <div style="font-size:36px">🃏</div><div style="font-size:15px;font-weight:800">Phòng Xì Dách</div>
    <div style="font-size:12px;color:var(--muted2);line-height:1.6">Người chơi đấu với nhau · Bài ẩn<br>🌟 Ngũ Linh x2 · 🃏 Xì Bàn x2 · ♠️ Xì Dách x1.5<br>Vốn: <b style="color:var(--gold)">500,000 xu</b></div>
    ${plist.map(([,p])=>`<div style="display:flex;justify-content:space-between;width:100%;font-size:13px"><span>${p.av||''}${p.name}</span><span style="color:var(--gold);font-weight:700">${(p.coins||5e5).toLocaleString()} xu</span></div>`).join('')}
    ${role==='host'&&plist.length>=2?`<button class="btn btn-p" onclick="xdStart()">🃏 Bắt đầu!</button>`:`<div style="font-size:12px;color:var(--muted)">${role==='host'?'Cần ít nhất 2 người...':'Chờ host...'}</div>`}
  </div>`}
  if(xp==='bet'){const myP=players[h.id],myBet=myP?.bet||0;html=`<div style="background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px">
    <div style="font-size:22px;font-weight:900;color:var(--gold);text-align:center">${(myP?.coins||0).toLocaleString()}<div style="font-size:12px;color:var(--muted2);font-weight:400">xu còn lại</div></div>
    <div style="font-size:12px;font-weight:700;color:var(--muted2);text-transform:uppercase">💰 Mức cược</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${XD_C.map(v=>`<div class="chip${myBet===v?' on':''}" onclick="xdChip(${v})">${v>=1000?v/1000+'K':v}</div>`).join('')}<div class="chip${myBet===(myP?.coins||0)&&myBet>0?' on':''}" onclick="xdChip(${myP?.coins||0})">All In</div></div>
    <div style="font-size:13px;font-weight:700;color:var(--gold);text-align:center">${myBet?'✅ Cược: '+myBet.toLocaleString()+' xu':'Chọn mức cược'}</div>
    ${plist.map(([pid,p])=>`<div style="display:flex;justify-content:space-between;font-size:12px"><span>${p.av||''}${p.name}</span><span style="color:${p.bet?'var(--gold)':'var(--muted)'}">${p.bet?p.bet.toLocaleString()+' xu':'Chưa đặt'}</span></div>`).join('')}
    ${role==='host'&&plist.every(([,p])=>p.bet>0)?`<button class="btn btn-p" onclick="xdDeal()">🃏 Phát bài!</button>`:`<div style="font-size:12px;color:var(--muted);text-align:center">Chờ tất cả đặt cược...</div>`}
  </div>`}
  if(xp==='play'||xp==='result'){
    const showAll=xp==='result'||d.xdShow,timeLeft=d.xdTime||0,MAX_T=15;
    const pct=Math.round(timeLeft/MAX_T*100),col=timeLeft>5?'var(--green)':timeLeft>3?'var(--yellow)':'var(--red)';
    if(xp==='play')html+=`<div style="display:flex;align-items:center;gap:10px;background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:10px 14px;width:100%;max-width:500px">
      <span style="font-size:18px">⏱</span><div style="flex:1"><div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${col};transition:width 1s linear;border-radius:3px"></div></div>
      <div style="font-size:11px;color:var(--muted2);margin-top:3px">${plist.every(([pid])=>d.xdDone?.[pid])?'✅ Tất cả đã dừng':'Hết giờ tự rút bài ≥16đ'}</div></div>
      <span style="font-size:15px;font-weight:900;color:${col};min-width:26px;text-align:right">${timeLeft}s</span></div>`;
    plist.forEach(([pid,p])=>{
      const ph=p.hand||[],isMe=pid===h.id,pDone=d.xdDone?.[pid],showThis=showAll||isMe;
      const pv=showThis?hVal(ph):0,bust=showThis&&pv>21,sp=showThis?xdSP(ph):null;
      let badge='',bg='var(--s1)',brd='var(--b1)';
      if(xp==='result'){const res=d.xdResult?.[pid];if(res==='bust'){badge=`<span style="background:rgba(239,68,68,.2);color:var(--red);font-size:11px;font-weight:800;padding:3px 8px;border-radius:99px">💀 Quắc</span>`;bg='rgba(239,68,68,.05)';brd='var(--red)'}else if(res==='push'){badge=`<span style="background:rgba(107,107,144,.2);color:var(--muted2);font-size:11px;font-weight:800;padding:3px 8px;border-radius:99px">🤝 Hòa</span>`}else if(res==='lose'){badge=`<span style="background:rgba(239,68,68,.2);color:var(--red);font-size:11px;font-weight:800;padding:3px 8px;border-radius:99px">😢 Thua</span>`;bg='rgba(239,68,68,.05)';brd='var(--red)'}else if(res){const spL=xdLbl(sp);badge=`<span style="background:rgba(16,185,129,.2);color:var(--green);font-size:11px;font-weight:800;padding:3px 8px;border-radius:99px">${spL||'🏆 Thắng'}</span>`;bg='rgba(16,185,129,.06)';brd='var(--green)'}}
      html+=`<div style="background:${bg};border:1.5px solid ${isMe?'var(--purple)':brd};border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;font-weight:700">${p.av||''}${p.name}${pDone&&xp==='play'?'<span style="color:var(--green);font-size:11px;margin-left:6px">✅</span>':''}</span>
          <div style="display:flex;align-items:center;gap:8px">${badge}<span style="font-size:12px;color:var(--gold);font-weight:700">${(p.coins||0).toLocaleString()} xu</span></div>
        </div>
        <div class="hand-area">${showThis?ph.map(c=>mkCard(c)).join(''):ph.map(()=>mkCard(null,true)).join('')}</div>
        ${showThis?`<div style="font-size:12px;color:${bust?'var(--red)':pv===21?'var(--gold)':'var(--muted2)'};font-weight:${bust||pv===21?700:400}">Tổng: ${pv}${bust?' — QUẮC!':''}${sp&&(xp==='result'||isMe)?` <span style="font-size:10px;color:var(--gold);background:rgba(251,191,36,.15);padding:2px 7px;border-radius:99px;font-weight:900">${xdLbl(sp)}</span>`:''}</div>`:'<div style="font-size:12px;color:var(--muted2)">Bài ẩn 🂠</div>'}
        ${isMe&&xp==='play'&&!bust&&!pDone?`<div style="display:flex;gap:8px"><button class="btn btn-p btn-sm" onclick="xdHit()">➕ Rút</button><button class="btn btn-g btn-sm" onclick="xdStand()" ${pv<16?'disabled title="Cần ≥16đ"':''}>✋ Dừng${pv<16&&!bust?' ('+pv+'/16)':''}</button></div>`:''}
      </div>`;
    });
    const allDone=plist.every(([pid])=>d.xdDone?.[pid]);
    if(xp==='play'&&!d.xdShow){if(allDone&&role==='host')html+=`<button class="btn btn-y" onclick="xdReveal()" style="max-width:500px;width:100%;border-radius:12px;padding:14px">👁 Mở bài!</button>`;else html+=`<div style="text-align:center;font-size:12px;color:var(--muted2)">${allDone?'Chờ host mở bài...':'⏳ Hết giờ tự mở'}</div>`}
    if(xp==='result'){const delta=d.xdDelta||{};html+=`<div style="background:var(--s2);border:1px solid var(--b2);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px">
      <div style="font-size:11px;font-weight:700;color:var(--muted2);text-transform:uppercase;text-align:center">Kết quả ván này</div>
      ${plist.map(([pid,p])=>{const dlt=delta[pid]||0,sp2=d.xdSpecials?.[pid];return`<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600"><span>${p.av||''}${p.name}${sp2?`<span style="font-size:10px;color:var(--gold);margin-left:5px">${xdLbl(sp2)}</span>`:''}</span><span style="color:${dlt>0?'var(--green)':dlt<0?'var(--red)':'var(--muted2)'}">${dlt>0?'+':''}${dlt.toLocaleString()}</span></div>`}).join('')}
      ${role==='host'?`<div style="display:flex;gap:8px;margin-top:4px"><button class="btn btn-p" onclick="xdNextRound()" style="flex:1">Ván tiếp →</button><button class="btn btn-g" onclick="xdSummary()" style="flex:1">📊 Tổng kết</button></div>`:`<div style="font-size:12px;color:var(--muted);text-align:center">Chờ host...</div>`}
    </div>`}
  }
  if(xp==='summary'){html=`<div style="background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px">
    <div style="font-size:32px">📊</div><div style="font-size:16px;font-weight:900">Tổng kết phiên</div>
    ${[...plist].sort(([,a],[,b])=>(b.coins||0)-(a.coins||0)).map(([,p],i)=>{const net=(p.coins||0)-5e5;
      return`<div style="display:flex;justify-content:space-between;align-items:center;width:100%;background:${i===0?'rgba(251,191,36,.1)':'var(--s3)'};border:1.5px solid ${i===0?'var(--gold)':'var(--b1)'};border-radius:10px;padding:10px 14px">
        <div><div style="font-size:13px;font-weight:700">${i===0?'🏆 ':i===1?'🥈 ':'🥉 '}${p.av||''}${p.name}</div><div style="font-size:11px;color:var(--muted2)">${(p.coins||0).toLocaleString()} xu</div></div>
        <div style="font-size:18px;font-weight:900;color:${net>=0?'var(--green)':'var(--red)'}">${net>=0?'+':''}${net.toLocaleString()}</div>
      </div>`}).join('')}
    ${role==='host'?`<button class="btn btn-p" onclick="xdReset()">🔄 Chơi lại</button>`:`<div style="font-size:12px;color:var(--muted)">Chờ host...</div>`}
  </div>`}
  wrap.innerHTML=html;
  if(xp==='play'&&role==='host'){if(!xTmr){xTmr=setInterval(async()=>{if(!room||!liveD||liveD.xp!=='play'){clearInterval(xTmr);xTmr=null;return}const t=Math.max(0,(liveD.xdTime||0)-1);try{await update(ref(db,`rooms/${room}`),{xdTime:t})}catch(e){}if(t<=0){clearInterval(xTmr);xTmr=null;try{await xdAuto()}catch(e){}}},1000)}}else{if(xTmr){clearInterval(xTmr);xTmr=null}}
}
window.xdStart=async()=>{if(role!=='host'||!room)return;await update(ref(db,`rooms/${room}`),{xp:'bet',status:'playing'})};
window.xdChip=async function(v){if(!room)return;await update(ref(db,`rooms/${room}/players/${me().id}`),{bet:v})};
window.xdDeal=async function(){
  if(role!=='host'||!room)return;
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  const deck=ndeck(),players=d.players||{};
  const upd={xp:'play',xdShow:false,xdDone:{},xdResult:{},xdDelta:{},xdSpecials:{},xdTime:15};
  Object.keys(players).forEach(pid=>{upd[`players/${pid}/hand`]=[deck.pop(),deck.pop()];upd[`players/${pid}/done`]=false});
  upd.deck=deck;
  await update(ref(db,`rooms/${room}`),upd);
  // Check for immediate specials (xi_ban or xi_dach) after deal
  setTimeout(async()=>{
    const sn2=await get(ref(db,`rooms/${room}`));const d2=sn2.val();const pl=d2.players||{};
    const pids=Object.keys(pl);
    const specials={};
    pids.forEach(pid=>{specials[pid]=xdSP(pl[pid].hand||[])});
    const hasImmediate=pids.some(pid=>specials[pid]==='xi_ban'||specials[pid]==='xi_dach');
    if(hasImmediate){
      // Mark all as done and reveal immediately
      const doneUpd={};
      pids.forEach(pid=>{doneUpd[`xdDone/${pid}`]=true});
      await update(ref(db,`rooms/${room}`),doneUpd);
      await xdReveal();
    }
  },500);
};
window.xdHit=async function(){if(!room)return;const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();const h=me();if(d.xp!=='play'||d.xdDone?.[h.id])return;const deck=[...(d.deck||[])],hand=[...(d.players?.[h.id]?.hand||[]),deck.pop()];const v=hVal(hand),sp=xdSP(hand);const upd={[`players/${h.id}/hand`]:hand,deck};if(v>21||v===21||hand.length>=5){upd[`xdDone/${h.id}`]=true;if(sp)showToast(xdLbl(sp));else if(v>21)showToast('💀 Quắc!');else showToast('🎉 '+v+'!')}await update(ref(db,`rooms/${room}`),upd);const sn2=await get(ref(db,`rooms/${room}`));const d2=sn2.val();if(Object.keys(d2.players||{}).every(pid=>d2.xdDone?.[pid])&&role==='host')await xdReveal()};
window.xdStand=async function(){if(!room)return;const h=me();const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();if(d.xdDone?.[h.id])return;const myH=d.players?.[h.id]?.hand||[];if(hVal(myH)<16){showToast('❌ Cần ≥16 điểm!');return}await update(ref(db,`rooms/${room}`),{[`xdDone/${h.id}`]:true});const sn2=await get(ref(db,`rooms/${room}`));const d2=sn2.val();if(Object.keys(d2.players||{}).every(pid=>d2.xdDone?.[pid])&&role==='host')await xdReveal()};
async function xdAuto(){if(!room||role!=='host')return;const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();if(d.xp!=='play')return;const players=d.players||{},upd={};let deck=[...(d.deck||[])];Object.entries(players).forEach(([pid,p])=>{if(d.xdDone?.[pid])return;let hand=[...(p.hand||[])],v=hVal(hand);while(v<16&&deck.length>0&&hand.length<5){hand.push(deck.pop());v=hVal(hand)}upd[`players/${pid}/hand`]=hand;upd[`xdDone/${pid}`]=true});upd.deck=deck;await update(ref(db,`rooms/${room}`),upd);await xdReveal()}
window.xdReveal=async function(){if(!room)return;if(xTmr){clearInterval(xTmr);xTmr=null}const sn=await get(ref(db,`rooms/${room}`));if(!sn.exists())return;const d=sn.val();if(d.xp==='result')return;const players=d.players||{},plist=Object.entries(players);const vals={},sps={},mults={};plist.forEach(([pid,p])=>{vals[pid]=hVal(p.hand||[]);sps[pid]=xdSP(p.hand||[]);mults[pid]=xdMult(sps[pid])});const notBust=plist.filter(([pid])=>vals[pid]<=21);const result={},delta={};if(!notBust.length){plist.forEach(([pid,p])=>{result[pid]='bust';delta[pid]=-(p.bet||0)})}else{const spRk=sp=>sp==='xi_ban'?3:sp==='xi_dach'?2:sp==='ngu_linh'?1:0;const ranked=[...notBust].sort(([a],[b])=>{const ra=spRk(sps[a]),rb=spRk(sps[b]);if(ra!==rb)return rb-ra;return vals[b]-vals[a]});const topPid=ranked[0][0],topSp=sps[topPid],topVal=vals[topPid],topRk=spRk(topSp);const winners=ranked.filter(([pid])=>spRk(sps[pid])===topRk&&(topRk>0||vals[pid]===topVal));plist.forEach(([pid,p])=>{const v=vals[pid],b=p.bet||0;if(v>21){result[pid]='bust';delta[pid]=-b}else if(winners.find(([wp])=>wp===pid)){result[pid]=sps[pid]||'win';delta[pid]=0}else{result[pid]='lose';delta[pid]=-(b*mults[topPid])}});if(winners.length===1){const wp=winners[0][0],m=mults[wp];let win=0;plist.forEach(([pid,p])=>{if(pid!==wp){const loss=Math.abs(delta[pid]);win+=loss}});delta[wp]=win}}const upd={xp:'result',xdShow:true,xdResult:result,xdDelta:delta,xdSpecials:sps,xdTime:0};plist.forEach(([pid,p])=>{upd[`players/${pid}/coins`]=Math.max(0,(p.coins||0)+(delta[pid]||0))});await update(ref(db,`rooms/${room}`),upd)};
window.xdNextRound=async function(){if(role!=='host'||!room)return;const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();const players=d.players||{};const upd={xp:'bet',xdShow:false,xdDone:{},xdResult:{},xdDelta:{},xdSpecials:{},xdTime:0,deck:[]};Object.keys(players).forEach(pid=>{upd[`players/${pid}/hand`]=[];upd[`players/${pid}/bet`]=0;upd[`players/${pid}/done`]=false});await update(ref(db,`rooms/${room}`),upd)};
window.xdSummary=async()=>{if(room)await update(ref(db,`rooms/${room}`),{xp:'summary'})};
window.xdReset=async function(){if(role!=='host'||!room)return;const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();const players=d.players||{};const upd={xp:'lobby',xdShow:false,xdDone:{},deck:[]};Object.keys(players).forEach(pid=>{upd[`players/${pid}/coins`]=5e5;upd[`players/${pid}/hand`]=[];upd[`players/${pid}/bet`]=0;upd[`players/${pid}/done`]=false});await update(ref(db,`rooms/${room}`),upd)};

// ── CỜ TƯỚNG ──
function initCT(){const b={};for(let r=0;r<10;r++){b[r]={};for(let c=0;c<9;c++)b[r][c]=null}const bR0=['車','馬','象','士','將','士','象','馬','車'];bR0.forEach((p,c)=>b[0][c]={p,s:'black'});b[2][1]={p:'砲',s:'black'};b[2][7]={p:'砲',s:'black'};[0,2,4,6,8].forEach(c=>b[3][c]={p:'兵',s:'black'});const rR9=['俥','傌','相','仕','帥','仕','相','傌','俥'];rR9.forEach((p,c)=>b[9][c]={p,s:'red'});b[7][1]={p:'炮',s:'red'};b[7][7]={p:'炮',s:'red'};[0,2,4,6,8].forEach(c=>b[6][c]={p:'卒',s:'red'});return b}
let ctSel=null,ctMoves=[];
function ctG(board,r,c){if(r<0||r>9||c<0||c>8||!board[r])return undefined;return board[r][c]||null}
function ctMv(board,r,c){const piece=ctG(board,r,c);if(!piece)return[];const{p,s}=piece,mv=[];const ok=(r2,c2)=>{if(r2<0||r2>9||c2<0||c2>8)return false;const t=ctG(board,r2,c2);return t===null||t===undefined||(t&&t.s!==s)};
  if(p==='帥'||p==='將'){const mn=s==='red'?7:0,mx=s==='red'?9:2;for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){const nr=r+dr,nc=c+dc;if(nr>=mn&&nr<=mx&&nc>=3&&nc<=5&&ok(nr,nc))mv.push([nr,nc])}}
  else if(p==='仕'||p==='士'){const mn=s==='red'?7:0,mx=s==='red'?9:2;for(const[dr,dc]of[[-1,-1],[-1,1],[1,-1],[1,1]]){const nr=r+dr,nc=c+dc;if(nr>=mn&&nr<=mx&&nc>=3&&nc<=5&&ok(nr,nc))mv.push([nr,nc])}}
  else if(p==='象'||p==='相'){const mn=s==='red'?5:0,mx=s==='red'?9:4;for(const[dr,dc]of[[-2,-2],[-2,2],[2,-2],[2,2]]){const nr=r+dr,nc=c+dc;if(nr<mn||nr>mx||nc<0||nc>8)continue;if(ctG(board,r+dr/2,c+dc/2))continue;if(ok(nr,nc))mv.push([nr,nc])}}
  else if(p==='馬'||p==='傌'){for(const[dr,dc,br,bc]of[[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[-1,2,0,1],[1,-2,0,-1],[1,2,0,1]]){const nr=r+dr,nc=c+dc;if(nr<0||nr>9||nc<0||nc>8)continue;if(ctG(board,r+br,c+bc))continue;if(ok(nr,nc))mv.push([nr,nc])}}
  else if(p==='車'||p==='俥'){for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){let nr=r+dr,nc=c+dc;while(nr>=0&&nr<=9&&nc>=0&&nc<=8){const t=ctG(board,nr,nc);if(!t)mv.push([nr,nc]);else{if(t.s!==s)mv.push([nr,nc]);break}nr+=dr;nc+=dc}}}
  else if(p==='砲'||p==='炮'){for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){let nr=r+dr,nc=c+dc,j=false;while(nr>=0&&nr<=9&&nc>=0&&nc<=8){const t=ctG(board,nr,nc);if(!j){if(!t)mv.push([nr,nc]);else j=true}else{if(t){if(t.s!==s)mv.push([nr,nc]);break}}nr+=dr;nc+=dc}}}
  else if(p==='兵'||p==='卒'){const fw=s==='red'?-1:1,cross=s==='red'?r<=4:r>=5;if(ok(r+fw,c))mv.push([r+fw,c]);if(cross){if(ok(r,c-1))mv.push([r,c-1]);if(ok(r,c+1))mv.push([r,c+1])}}
  return mv;
}
function renderCT(d,id){
  const h=me(),myC=role==='host'?'red':'black';
  const board=d.ctBoard||{},turn=d.ctTurn||'red',sc=d.ctScore||{r:0,b:0};
  if(!document.getElementById('ctbd')){
    document.getElementById('garea').innerHTML=`<div class="gtop"><div class="gtitle">🀄 Cờ Tướng <span class="cbadge" onclick="copyL('${location.href.split('?')[0]}?room=${id}')">#${id} 📋</span></div><div class="gbtns"><button class="btn btn-g btn-sm" onclick="ctRematch()">🔄</button><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div></div>
    <div style="width:100%;max-width:460px;display:flex;flex-direction:column;gap:10px;align-items:center">
      <div style="display:flex;gap:8px;width:100%"><div id="ct-blk" style="flex:1;padding:10px 12px;border-radius:10px;text-align:center;border:2px solid var(--b1);background:var(--s1);font-size:12px;font-weight:700;transition:all .25s">⬛ <span id="ct-blkn">Guest</span></div>
      <div style="text-align:center;display:flex;flex-direction:column;justify-content:center"><div style="font-size:15px;font-weight:900;color:var(--muted2)">VS</div><div id="ct-sc" style="font-size:11px;color:var(--muted)">0-0</div></div>
      <div id="ct-red" style="flex:1;padding:10px 12px;border-radius:10px;text-align:center;border:2px solid var(--b1);background:var(--s1);font-size:12px;font-weight:700;transition:all .25s">🔴 <span id="ct-redn">Host</span></div></div>
      <div id="ct-st" style="font-size:13px;font-weight:700;text-align:center;padding:8px 16px;background:var(--s1);border-radius:8px;border:1px solid var(--b1);width:100%">Đang tải...</div>
      <div id="ctbd" style="width:100%;aspect-ratio:9/10;position:relative;background:#1a1208;border-radius:12px;border:2px solid #8b6914;overflow:hidden;min-height:280px"></div>
    </div>`;
  }
  const rn=document.getElementById('ct-redn'),bn=document.getElementById('ct-blkn');
  if(rn)rn.textContent=(d.hav||'')+(d.hn||'Host');if(bn)bn.textContent=d.gnm?(d.gav||'')+(d.gnm):'Chờ...';
  const sc2=document.getElementById('ct-sc');if(sc2)sc2.textContent=`${sc.r||0}-${sc.b||0}`;
  const rEl=document.getElementById('ct-red'),bEl=document.getElementById('ct-blk');
  if(rEl)rEl.style.borderColor=turn==='red'&&d.ctStatus==='playing'?'var(--red)':'var(--b1)';
  if(bEl)bEl.style.borderColor=turn==='black'&&d.ctStatus==='playing'?'#9ca3af':'var(--b1)';
  const isMyT=turn===myC&&d.ctStatus==='playing'&&d.gid;
  const stEl=document.getElementById('ct-st');if(stEl)stEl.textContent=d.status==='waiting'?'⏳ Chờ bạn vào...':d.ctStatus==='finished'?`${d.ctWinner==='red'?'🔴 Đỏ':'⬛ Đen'} thắng!`:isMyT?'🎯 Lượt bạn!':'⏳ Chờ đối thủ...';
  const bdEl=document.getElementById('ctbd');if(!bdEl)return;
  let canvas=bdEl.querySelector('canvas');
  if(!canvas){canvas=document.createElement('canvas');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none';bdEl.appendChild(canvas)}
  const BW=bdEl.clientWidth||320,BH=bdEl.clientHeight||355;
  canvas.width=BW*2;canvas.height=BH*2;canvas.style.width=BW+'px';canvas.style.height=BH+'px';
  const ctx2=canvas.getContext('2d');ctx2.scale(2,2);const cw=BW/9,rh=BH/10;
  ctx2.fillStyle='#1a1208';ctx2.fillRect(0,0,BW,BH);
  ctx2.strokeStyle='#8b6914';ctx2.lineWidth=0.8;
  for(let r=0;r<10;r++){const y=(r+.5)*rh;ctx2.beginPath();ctx2.moveTo(.5*cw,y);ctx2.lineTo(8.5*cw,y);ctx2.stroke()}
  for(let c=0;c<9;c++){const x=(c+.5)*cw;ctx2.beginPath();ctx2.moveTo(x,.5*rh);ctx2.lineTo(x,4.5*rh);ctx2.stroke();ctx2.beginPath();ctx2.moveTo(x,5.5*rh);ctx2.lineTo(x,9.5*rh);ctx2.stroke()}
  ctx2.lineWidth=0.6;ctx2.beginPath();ctx2.moveTo(3.5*cw,7.5*rh);ctx2.lineTo(5.5*cw,9.5*rh);ctx2.stroke();ctx2.beginPath();ctx2.moveTo(5.5*cw,7.5*rh);ctx2.lineTo(3.5*cw,9.5*rh);ctx2.stroke();ctx2.beginPath();ctx2.moveTo(3.5*cw,.5*rh);ctx2.lineTo(5.5*cw,2.5*rh);ctx2.stroke();ctx2.beginPath();ctx2.moveTo(5.5*cw,.5*rh);ctx2.lineTo(3.5*cw,2.5*rh);ctx2.stroke();
  ctx2.fillStyle='rgba(139,105,20,.5)';ctx2.font='bold 13px Inter,sans-serif';ctx2.textAlign='center';ctx2.textBaseline='middle';ctx2.fillText('楚河          漢界',BW/2,BH/2);
  ctMoves.forEach(([mr,mc])=>{const x=(mc+.5)*cw,y=(mr+.5)*rh,sz=Math.min(cw,rh)*.18;ctx2.fillStyle='rgba(251,191,36,.5)';ctx2.beginPath();ctx2.arc(x,y,sz,0,Math.PI*2);ctx2.fill()});
  if(ctSel){const[sr,sc3]=ctSel,x=(sc3+.5)*cw,y=(sr+.5)*rh,sz=Math.min(cw,rh)*.42;ctx2.strokeStyle='#fbbf24';ctx2.lineWidth=2.5;ctx2.shadowColor='#fbbf24';ctx2.shadowBlur=10;ctx2.beginPath();ctx2.arc(x,y,sz,0,Math.PI*2);ctx2.stroke();ctx2.shadowBlur=0}
  for(let r=0;r<10;r++)for(let c=0;c<9;c++){const piece=ctG(board,r,c);if(!piece)continue;const x=(c+.5)*cw,y=(r+.5)*rh,sz=Math.min(cw,rh)*.4,isR=piece.s==='red';const gr=ctx2.createRadialGradient(x-sz*.2,y-sz*.2,sz*.1,x,y,sz);if(isR){gr.addColorStop(0,'#ef4444');gr.addColorStop(1,'#7f1d1d')}else{gr.addColorStop(0,'#6b7280');gr.addColorStop(1,'#111827')}ctx2.fillStyle=gr;ctx2.beginPath();ctx2.arc(x,y,sz,0,Math.PI*2);ctx2.fill();ctx2.strokeStyle=isR?'#fca5a5':'#9ca3af';ctx2.lineWidth=1.5;ctx2.beginPath();ctx2.arc(x,y,sz,0,Math.PI*2);ctx2.stroke();ctx2.strokeStyle=isR?'rgba(252,165,165,.4)':'rgba(156,163,175,.3)';ctx2.lineWidth=1;ctx2.beginPath();ctx2.arc(x,y,sz*.78,0,Math.PI*2);ctx2.stroke();ctx2.fillStyle=isR?'#fff':'#e5e7eb';ctx2.font=`bold ${sz*.8}px Inter,sans-serif`;ctx2.textAlign='center';ctx2.textBaseline='middle';ctx2.fillText(piece.p,x,y)}
  canvas.onclick=canvas.ontouchend=function(e){e.preventDefault();const br=canvas.getBoundingClientRect();const touch=e.touches?e.touches[0]:e.changedTouches?e.changedTouches[0]:e;const mx=(touch.clientX-br.left)/br.width*BW,my=(touch.clientY-br.top)/br.height*BH;const col2=Math.floor(mx/cw),row2=Math.floor(my/rh);if(row2>=0&&row2<10&&col2>=0&&col2<9)ctClick(row2,col2,d,myC)};
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id)}else rmW();
  if(d.ctStatus==='finished'&&lastRes!==d.ctWinner){lastRes=d.ctWinner;const iw=d.ctWinner===myC;setTimeout(()=>modal(iw?'🏆':'😢',iw?'Bạn thắng!':'Thua rồi!',`${d.ctWinner==='red'?'🔴 Đỏ':'⬛ Đen'} thắng!`),300)}
}
function ctClick(r,c,d,myC){
  if(!d||d.ctStatus==='finished'||d.ctTurn!==myC)return;
  const board=d.ctBoard||{},piece=ctG(board,r,c);
  if(piece&&piece.s===myC){if(ctSel&&ctSel[0]===r&&ctSel[1]===c){ctSel=null;ctMoves=[]}else{ctSel=[r,c];ctMoves=ctMv(board,r,c)}renderCT(d,room);return}
  if(ctSel){const legal=ctMoves.some(([mr,mc])=>mr===r&&mc===c);if(legal){ctDo(ctSel[0],ctSel[1],r,c,d);ctSel=null;ctMoves=[];return}ctSel=null;ctMoves=[];renderCT(d,room)}
}
async function ctDo(r1,c1,r2,c2,d){const board=JSON.parse(JSON.stringify(d.ctBoard||{}));const piece=board[r1][c1],cap=board[r2][c2];board[r2][c2]=piece;board[r1][c1]=null;const turn=d.ctTurn==='red'?'black':'red';const sc={...(d.ctScore||{r:0,b:0})};let st='playing',wn=null;if(cap&&(cap.p==='帥'||cap.p==='將')){st='finished';wn=d.ctTurn;if(wn==='red')sc.r=(sc.r||0)+1;else sc.b=(sc.b||0)+1}const upd={ctBoard:board,ctTurn:turn,ctStatus:st,ctScore:sc};if(wn)upd.ctWinner=wn;await update(ref(db,`rooms/${room}`),upd)}
window.ctRematch=async function(){lastRes=null;ctSel=null;ctMoves=[];document.getElementById('ovl').classList.remove('on');await update(ref(db,`rooms/${room}`),{ctBoard:initCT(),ctTurn:'red',ctStatus:'playing',ctWinner:null})};

// ── ĐẾM NHANH & SỐ MAY MẮN ──
function smQ(){const ops=['+','-','×','÷'],op=ops[Math.floor(Math.random()*4)];let a,b,ans;if(op==='+'){a=Math.floor(Math.random()*50)+1;b=Math.floor(Math.random()*50)+1;ans=a+b}else if(op==='-'){a=Math.floor(Math.random()*50)+10;b=Math.floor(Math.random()*a)+1;ans=a-b}else if(op==='×'){a=Math.floor(Math.random()*12)+2;b=Math.floor(Math.random()*12)+2;ans=a*b}else{b=Math.floor(Math.random()*9)+2;ans=Math.floor(Math.random()*10)+1;a=b*ans}const w=new Set();while(w.size<3){const x=ans+Math.floor(Math.random()*20)-10;if(x!==ans&&x>0)w.add(x)}return{expr:`${a} ${op} ${b}`,answer:ans,choices:[ans,...w].sort(()=>Math.random()-.5)}}
function renderSM(d,id){
  const h=me();
  if(!document.getElementById('smw')){
    document.getElementById('garea').innerHTML='<div class="gtop"><div class="gtitle">🔢 Đếm Nhanh <span class="cbadge" onclick="copyL(window.location.href)">#'+id+'</span></div><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div><div id="smw" style="width:100%;max-width:440px;display:flex;flex-direction:column;gap:14px;align-items:center;padding-bottom:20px"></div>';
  }
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();
  const wrap=document.getElementById('smw');if(!wrap)return;
  const smp=d.smp||'ready',sc=d.smScore||{h:0,g:0},round=d.smRound||1;
  const hn=(d.hav||'')+(d.hn||'Host'),gn=d.gnm?(d.gav||'')+(d.gnm):'Chờ...';
  let html=`<div style="width:100%;background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:16px;text-align:center">
    <div style="font-size:12px;color:var(--muted2);margin-bottom:8px">Câu ${round}/10 · Ai đúng trước được điểm</div>
    <div style="display:flex;justify-content:space-around">
      <div><div style="font-size:13px;font-weight:700">${hn}</div><div style="font-size:34px;font-weight:900;color:var(--purple)">${sc.h||0}</div></div>
      <div style="font-size:20px;color:var(--muted);align-self:center">VS</div>
      <div><div style="font-size:13px;font-weight:700">${gn}</div><div style="font-size:34px;font-weight:900;color:var(--pink)">${sc.g||0}</div></div>
    </div>
  </div>`;

  if(smp==='ready'){
    html+=role==='host'
      ?`<button class="btn btn-p" onclick="smStart()" style="max-width:200px">▶️ Bắt đầu!</button>`
      :`<div style="font-size:13px;color:var(--muted2)">Chờ host bắt đầu...</div>`;
  }

  if(smp==='question'){
    const q=d.smQ2||{expr:'?',answer:0,choices:[1,2,3,4]};
    const myAns=d.smA?.[h.id];
    const timer=d.smTimer!=null?d.smTimer:5;
    const timerCol=timer>3?'var(--green)':timer>1?'var(--yellow)':'var(--red)';
    html+=`
    <div style="width:100%;display:flex;align-items:center;gap:10px;background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:10px 14px">
      <span style="font-size:18px">⏱</span>
      <div style="flex:1"><div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${timer/5*100}%;background:${timerCol};transition:width 1s linear;border-radius:3px"></div></div></div>
      <span style="font-size:15px;font-weight:900;color:${timerCol}">${timer}s</span>
    </div>
    <div style="width:100%;background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:24px;text-align:center">
      <div style="font-size:42px;font-weight:900;letter-spacing:-1px;margin-bottom:20px">${q.expr} = ?</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${(q.choices||[]).map(ch=>`<button onclick="smAns(${ch})" class="btn ${myAns===ch?'btn-p':'btn-g'}" style="padding:16px;font-size:20px;font-weight:800;border-radius:12px;min-height:60px" ${myAns!=null?'disabled':''}>${ch}</button>`).join('')}
      </div>
      ${myAns!=null?`<div style="font-size:13px;color:var(--muted2);margin-top:12px">✅ Đã chọn: <b>${myAns}</b> — Chờ đối thủ...</div>`:''}
    </div>`;
  }

  if(smp==='answer'){
    const q=d.smQ2||{expr:'?',answer:0},w=d.smWinner;
    const iw=w===role;
    const myAns=d.smA?.[h.id],oppAns=d.smA?.[role==='host'?d.gid:d.hid];
    const qAns=Number(q.answer);
    const myCorrect=Number(myAns)===qAns,oppCorrect=Number(oppAns)===qAns;
    html+=`<div style="width:100%;background:${iw?'rgba(16,185,129,.1)':'var(--s1)'};border:1.5px solid ${iw?'var(--green)':'var(--b1)'};border-radius:16px;padding:24px;text-align:center;display:flex;flex-direction:column;gap:10px">
      <div style="font-size:34px;font-weight:900">${q.expr} = <span style="color:var(--gold)">${q.answer}</span></div>
      <div style="display:flex;gap:12px;justify-content:center">
        <div style="text-align:center">
          <div style="font-size:12px;color:var(--muted2)">Bạn</div>
          <div style="font-size:20px;font-weight:900;color:${myCorrect?'var(--green)':myAns!=null?'var(--red)':'var(--muted)'}">${myAns!=null?myAns:'–'}</div>
          <div style="font-size:11px;color:${myCorrect?'var(--green)':myAns!=null?'var(--red)':'var(--muted)'}">${myCorrect?'✅ Đúng':myAns!=null?'❌ Sai':'⏱ Hết giờ'}</div>
        </div>
        <div style="font-size:20px;color:var(--muted);align-self:center">VS</div>
        <div style="text-align:center">
          <div style="font-size:12px;color:var(--muted2)">Đối thủ</div>
          <div style="font-size:20px;font-weight:900;color:${oppCorrect?'var(--green)':oppAns!=null?'var(--red)':'var(--muted)'}">${oppAns!=null?oppAns:'–'}</div>
          <div style="font-size:11px;color:${oppCorrect?'var(--green)':oppAns!=null?'var(--red)':'var(--muted)'}">${oppCorrect?'✅ Đúng':oppAns!=null?'❌ Sai':'⏱ Hết giờ'}</div>
        </div>
      </div>
      <div style="font-size:18px;font-weight:800;color:${w==='none'?'var(--muted2)':w==='draw'?'var(--muted2)':iw?'var(--green)':'var(--red)'}">
        ${w==='none'?'⏱ Hết giờ — không ai trả lời đúng!':w==='draw'?'🤝 Cả hai đều đúng!':iw?'🏆 Bạn đúng trước!':'😢 Đối thủ nhanh hơn!'}
      </div>
    </div>
    ${role==='host'?`<button class="btn btn-p" onclick="smNext()" style="max-width:200px">${round>=10?'📊 Kết quả':'Câu tiếp →'}</button>`:`<div style="font-size:12px;color:var(--muted)">Chờ host...</div>`}`;
  }

  if(smp==='gameover'){
    const w=sc.h>sc.g?'host':sc.g>sc.h?'guest':'draw',iw=w===role;
    html+=`<div style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px 0;width:100%">
      <div style="font-size:52px">${w==='draw'?'🤝':iw?'🏆':'😢'}</div>
      <div style="font-size:22px;font-weight:900">${w==='draw'?'Hòa!':iw?'Bạn thắng!':'Thua rồi!'}</div>
      <div style="font-size:13px;color:var(--muted2)">${hn} ${sc.h||0} - ${sc.g||0} ${gn}</div>
      ${role==='host'?`<button class="btn btn-p" style="max-width:200px" onclick="smRestart()">🔄 Chơi lại</button>`:`<div style="font-size:12px;color:var(--muted)">Chờ host...</div>`}
    </div>`;
  }
  wrap.innerHTML=html;
}

function smRunTimer(){
  if(smTimerInterval)clearInterval(smTimerInterval);
  let t=10;
  smTimerInterval=setInterval(async()=>{
    if(!room){clearInterval(smTimerInterval);smTimerInterval=null;return}
    t=Math.max(0,t-1);
    try{await update(ref(db,'rooms/'+room),{smTimer:t})}catch(e){}
    if(t<=0){
      clearInterval(smTimerInterval);smTimerInterval=null;
      const sn=await get(ref(db,'rooms/'+room));
      if(!sn.exists())return;
      const d2=sn.val();
      if(d2.smp!=='question')return;
      const a=d2.smA||{},q=d2.smQ2||{answer:0},qA=Number(q.answer);
      const hC=Number(a[d2.hid])===qA,gC=Number(a[d2.gid])===qA;
      let w=hC&&gC?'draw':hC?'host':gC?'guest':'none';
      const sc={...(d2.smScore||{h:0,g:0})};
      if(w==='host')sc.h=(sc.h||0)+1;
      else if(w==='guest')sc.g=(sc.g||0)+1;
      const rnd=d2.smRound||1,ph=rnd>=10?'gameover':'answer';
      await update(ref(db,'rooms/'+room),{smp:ph,smWinner:w,smScore:sc,smTimer:0});
    }
  },1000);
}

window.smStart=async function(){
  if(!room)return;
  const q=smQ();
  await update(ref(db,`rooms/${room}`),{smp:'question',smQ2:q,smA:{},smWinner:null,smTimer:10});
  if(role==='host')smRunTimer();
}
window.smAns=async function(ans){
  if(!room)return;
  const h=me();
  const sn=await get(ref(db,`rooms/${room}`));
  const d=sn.val();
  if(d.smp!=='question'||d.smA?.[h.id]!=null)return;
  await update(ref(db,`rooms/${room}/smA`),{[h.id]:ans});
  // Re-read and evaluate — BOTH players can trigger result (not just host)
  const sn2=await get(ref(db,`rooms/${room}`));
  const d2=sn2.val();
  if(d2.smp!=='question')return; // already resolved
  const a=d2.smA||{},q=d2.smQ2||{answer:0};
  const qAns=Number(q.answer);
  const hA=a[d2.hid],gA=a[d2.gid];
  const hC=Number(hA)===qAns,gC=Number(gA)===qAns;
  let w;
  if(hC&&gC) w='draw';
  else if(hC)  w='host';
  else if(gC)  w='guest';
  else if(hA!=null&&gA!=null) w='none'; // both wrong = nobody wins
  else return; // one player hasn't answered yet
  const sc={...(d2.smScore||{h:0,g:0})};
  if(w==='host')sc.h=(sc.h||0)+1;
  else if(w==='guest')sc.g=(sc.g||0)+1;
  const rnd=d2.smRound||1,ph=rnd>=10?'gameover':'answer';
  await update(ref(db,`rooms/${room}`),{smp:ph,smWinner:w,smScore:sc});
}
window.smNext=async function(){
  if(!room)return;
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  const q=smQ();
  await update(ref(db,`rooms/${room}`),{smp:'question',smQ2:q,smA:{},smRound:(d.smRound||1)+1,smWinner:null,smTimer:10});
  if(role==='host')smRunTimer();
}
window.smRestart=async function(){if(!room)return;const q=smQ();await update(ref(db,`rooms/${room}`),{smp:'question',smQ2:q,smA:{},smRound:1,smScore:{h:0,g:0},smWinner:null})};

function renderGN(d,id){const h=me();if(!document.getElementById('gnw')){document.getElementById('garea').innerHTML=`<div class="gtop"><div class="gtitle">🎯 Số May Mắn <span class="cbadge" onclick="copyL('${location.href.split('?')[0]}?room=${id}')">#${id} 📋</span></div><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div><div id="gnw" style="width:100%;max-width:420px;display:flex;flex-direction:column;gap:14px;align-items:center;padding-bottom:20px"></div>`}
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();
  const wrap=document.getElementById('gnw');if(!wrap)return;const gnp=d.gnp||'guess',sc=d.gnScore||{h:0,g:0},round=d.gnRound||1,guesses=d.gnG||{},myG=guesses[h.id];
  const hn=(d.hav||'')+(d.hn||'Host'),gn=d.gnm?(d.gav||'')+(d.gnm):'Chờ...';
  let html=`<div style="width:100%;background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:14px;display:flex;justify-content:space-around;text-align:center"><div><div style="font-size:12px;color:var(--muted2)">${hn}</div><div style="font-size:28px;font-weight:900;color:var(--purple)">${sc.h||0}</div></div><div style="font-size:13px;color:var(--muted);align-self:center">Ván ${round}</div><div><div style="font-size:12px;color:var(--muted2)">${gn}</div><div style="font-size:28px;font-weight:900;color:var(--pink)">${sc.g||0}</div></div></div>`;
  if(gnp==='guess')html+=`<div style="width:100%;background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:20px;text-align:center;display:flex;flex-direction:column;gap:12px"><div style="font-size:15px;font-weight:700">🎯 Đoán số từ 1–100</div><div style="font-size:12px;color:var(--muted2)">Ai gần số bí mật hơn thắng!</div>${myG!=null?`<div style="font-size:28px;font-weight:900;color:var(--purple)">Bạn đoán: ${myG}</div><div style="font-size:13px;color:var(--muted2)">Chờ đối thủ...</div>`:`<input type="number" id="gni" min="1" max="100" placeholder="Nhập 1–100..." style="text-align:center;font-size:20px;font-weight:800;padding:12px;border-radius:10px;background:var(--s3);border:1.5px solid var(--b2);color:var(--text);width:100%;outline:none" onkeydown="if(event.key==='Enter')gnGuess()"><button class="btn btn-p" onclick="gnGuess()" style="border-radius:10px">✅ Xác nhận</button>`}<div style="font-size:12px;color:var(--muted2)">${Object.keys(guesses).length}/2 đã đoán</div></div>`;
  if(gnp==='reveal'){const hG=guesses[d.hid]||'?',gG=guesses[d.gid]||'?',secret=d.gnS||0,w=d.gnW,iw=w===role;html+=`<div style="width:100%;background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:20px;text-align:center;display:flex;flex-direction:column;gap:12px"><div style="font-size:18px;font-weight:700;color:var(--muted2)">Số bí mật là...</div><div style="font-size:52px;font-weight:900;color:var(--gold)">${secret}</div><div style="display:flex;justify-content:space-around"><div><div style="font-size:12px;color:var(--muted2)">${hn}</div><div style="font-size:28px;font-weight:900;color:${w==='host'?'var(--green)':'var(--muted2)'}">${hG}</div><div style="font-size:11px;color:var(--muted2)">Lệch ${Math.abs(Number(hG)-secret)||0}</div></div><div style="font-size:20px;color:var(--muted);align-self:center">VS</div><div><div style="font-size:12px;color:var(--muted2)">${gn}</div><div style="font-size:28px;font-weight:900;color:${w==='guest'?'var(--green)':'var(--muted2)'}">${gG}</div><div style="font-size:11px;color:var(--muted2)">Lệch ${Math.abs(Number(gG)-secret)||0}</div></div></div><div style="font-size:18px;font-weight:900;color:${iw?'var(--green)':w==='draw'?'var(--muted2)':'var(--red)'}">${w==='draw'?'🤝 Hòa!':iw?'🏆 Bạn gần hơn!':'😢 Đối thủ gần hơn!'}</div>${role==='host'?`<button class="btn btn-p" onclick="gnNext()">Ván tiếp →</button>`:`<div style="font-size:12px;color:var(--muted)">Chờ host...</div>`}</div>`}
  wrap.innerHTML=html;
}
window.gnGuess=async function(){
  if(!room)return;
  const inp=document.getElementById('gni');
  const v=parseInt(inp?.value||0);
  if(!v||v<1||v>100){showToast('❌ Nhập 1–100!');return}
  const h=me();
  await update(ref(db,`rooms/${room}/gnG`),{[h.id]:v});
  // Both roles check — whoever completes the pair triggers reveal
  const sn=await get(ref(db,`rooms/${room}`));
  const d=sn.val();const g=d.gnG||{};
  if(g[d.hid]!=null&&g[d.gid]!=null&&d.gnp==='guess'){
    const s=d.gnS||50;
    const hD=Math.abs(Number(g[d.hid])-s),gD=Math.abs(Number(g[d.gid])-s);
    const w=hD<gD?'host':gD<hD?'guest':'draw';
    const sc={...(d.gnScore||{h:0,g:0})};
    if(w==='host')sc.h=(sc.h||0)+1;else if(w==='guest')sc.g=(sc.g||0)+1;
    await update(ref(db,`rooms/${room}`),{gnp:'reveal',gnW:w,gnScore:sc});
  }
};
window.gnNext=async function(){if(!room)return;const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();await update(ref(db,`rooms/${room}`),{gnp:'guess',gnS:Math.ceil(Math.random()*100),gnG:{},gnW:null,gnRound:(d.gnRound||1)+1})};

// ── AI ──
function aiReact(d,id,game){
  if(game==='caro'&&d.turn==='guest'&&d.caroStatus==='playing')setTimeout(()=>aiCaro(d,id),400+Math.random()*600);
  if(game==='cotuong'&&d.ctTurn==='black'&&d.ctStatus==='playing'&&d.isAI)setTimeout(()=>aiCT(d,id),600+Math.random()*800);
  if(game==='taixiu'&&d.phase==='bet'&&!d.bets?.[AI])setTimeout(()=>aiTX(id),500+Math.random()*700);
  if(game==='baucua'&&d.bcp==='bet'&&(!d.bcBets||!d.bcBets[AI]))setTimeout(()=>aiBC(id),500+Math.random()*700);
  if(game==='oantuti'&&d.otp==='choose'&&d.otC?.[d.hid]!=null&&d.otC?.[AI]==null)setTimeout(()=>aiOT(id),600+Math.random()*900);
  if(game==='xidach'&&d.xp==='bet'&&d.players?.[AI]&&!d.players[AI].bet)setTimeout(()=>aiXD(id),500+Math.random()*700);
  if(game==='xidach'&&d.xp==='play'&&!d.xdDone?.[AI]&&d.players?.[AI])setTimeout(()=>aiXDPlay(id),800+Math.random()*1000);
  if(game==='speedmath'&&d.smp==='question'&&d.smA?.[d.hid]!=null&&d.smA?.[AI]==null)setTimeout(()=>aiSM(id,d),1000+Math.random()*2000);
  if(game==='guessnumber'&&d.gnp==='guess'&&d.gnG?.[d.hid]!=null&&d.gnG?.[AI]==null)setTimeout(()=>aiGN(id,d),500+Math.random()*1000);
  if(game==='poker'&&d.pkPhase==='playing'&&d.pkTurn===AI)setTimeout(()=>aiPK(d,id),800+Math.random()*700);
}
async function aiCT(d,id){
  if(!room||!d||d.ctTurn!=='black'||d.ctStatus!=='playing')return;
  const board=d.ctBoard||{};
  // Find all black pieces and their moves
  const allMoves=[];
  for(let r=0;r<10;r++)for(let c2=0;c2<9;c2++){
    const piece=ctG(board,r,c2);
    if(!piece||piece.s!=='black')continue;
    const moves=ctMv(board,r,c2);
    moves.forEach(([mr,mc])=>allMoves.push({from:[r,c2],to:[mr,mc],piece}));
  }
  if(!allMoves.length)return;
  // Score moves: prefer capturing, then center
  let best=allMoves[0],bestS=-1;
  allMoves.forEach(m=>{
    let s=Math.random()*5;// randomness
    const target=ctG(board,m.to[0],m.to[1]);
    if(target){s+=50;if(target.p==='帥')s+=10000}// capture bonus
    // center preference
    s+=(4-Math.abs(m.to[1]-4))*2+(4-Math.abs(m.to[0]-5))*1;
    if(s>bestS){bestS=s;best=m}
  });
  await ctDo(best.from[0],best.from[1],best.to[0],best.to[1],d);
}

async function aiCaro(d,id){
  if(!room||!d||d.turn!=='guest'||d.caroStatus!=='playing')return;
  const cells=d.cells||{};
  const ME='guest',OPP='host';

  // Scan a line through (r,c) in direction (dr,dc) for given side.
  // Returns: { cnt, open, space }
  //   cnt   = consecutive pieces of 'side' touching this cell
  //   open  = number of open ends (0,1,2)
  //   space = total usable length of the window (cnt + open gaps)
  function lineInfo(bd,r,c,dr,dc,side){
    let cnt=1,open=0;
    for(const s of[-1,1]){
      let nr=r+dr*s,nc=c+dc*s;
      while(nr>=0&&nr<NR&&nc>=0&&nc<NC&&gc(bd,nr,nc)===side){cnt++;nr+=dr*s;nc+=dc*s;}
      if(nr>=0&&nr<NR&&nc>=0&&nc<NC&&gc(bd,nr,nc)===null)open++;
    }
    return{cnt,open};
  }

  // Threat score for placing at (r,c) for 'side'
  // Key insight: a "blocked-on-one-end" threat (open=1) is HALF as dangerous
  // as an "open-both-ends" threat (open=2) — because open=2 creates two attack
  // vectors while open=1 has only one.
  function threatScore(bd,r,c,side){
    let score=0;
    for(const[dr,dc]of[[0,1],[1,0],[1,1],[1,-1]]){
      const{cnt,open}=lineInfo(bd,r,c,dr,dc,side);
      if(cnt>=5)       score+=10000000;  // WIN immediately
      else if(cnt===4){
        if(open===2)   score+=500000;    // 4 both open = unstoppable
        else if(open===1) score+=100000; // 4 one open = win next
        else           score+=500;       // 4 blocked both = dead
      }
      else if(cnt===3){
        if(open===2)   score+=50000;     // 3 both open = MUST BLOCK (two ways to make 4)
        else if(open===1) score+=2000;   // 3 one open = dangerous but manageable
        else           score+=50;
      }
      else if(cnt===2){
        if(open===2)   score+=500;
        else if(open===1) score+=100;
      }
      else if(cnt===1){
        if(open===2)   score+=20;
        else if(open===1) score+=5;
      }
    }
    return score;
  }

  // Simulate placing a piece and return score
  function simulate(bd,r,c,side){
    const nb={};for(let rr=0;rr<NR;rr++){nb[rr]={};for(let cc=0;cc<NC;cc++)nb[rr][cc]=gc(bd,rr,cc)}
    nb[r][c]=side;
    return threatScore(nb,r,c,side);
  }

  // ── THREAT AWARENESS ──
  // Check whether a specific direction of OPP's 3-chain is ALREADY blocked on one side.
  // If yes, skip blocking the other end and attack instead (unless it becomes 4).
  function oppDirAlreadyBlocked(bd,r,c,dr,dc){
    // Walk in +dir from (r,c) counting OPP, then check beyond
    let n1=r+dr,nc1=c+dc,cnt=0;
    while(n1>=0&&n1<NR&&nc1>=0&&nc1<NC&&gc(bd,n1,nc1)===OPP){cnt++;n1+=dr;nc1+=dc;}
    const end1Blocked=!(n1>=0&&n1<NR&&nc1>=0&&nc1<NC&&gc(bd,n1,nc1)===null);
    let n2=r-dr,nc2=c-dc;
    while(n2>=0&&n2<NR&&nc2>=0&&nc2<NC&&gc(bd,n2,nc2)===OPP){n2-=dr;nc2-=dc;}
    const end2Blocked=!(n2>=0&&n2<NR&&nc2>=0&&nc2<NC&&gc(bd,n2,nc2)===null);
    return{end1Blocked,end2Blocked,cnt};
  }

  // Build candidates (within 2 of any existing piece)
  const cands=new Set();
  let hasAny=false;
  for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){
    if(!gc(cells,r,c))continue;
    hasAny=true;
    for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){
      const nr=r+dr,nc=c+dc;
      if(nr>=0&&nr<NR&&nc>=0&&nc<NC&&!gc(cells,nr,nc))cands.add(nr*NC+nc);
    }
  }
  if(!hasAny){
    const cr=Math.floor(NR/2)+Math.floor(Math.random()*3-1);
    const cc=Math.floor(NC/2)+Math.floor(Math.random()*3-1);
    const newC=clC(cells);newC[cr][cc]=ME;
    cLast=null;
    return update(ref(db,`rooms/${id}`),{cells:newC,turn:OPP,caroStatus:'playing',lastMove:[cr,cc],winner:null,winLine:null,score:d.score||{h:0,g:0,d:0},caroTime:CARO_TIME});
  }

  // ── MAIN EVALUATION ──
  let bestR=-1,bestC=-1,bestScore=-Infinity;

  for(const key of cands){
    const r=Math.floor(key/NC),col=key%NC;

    // ATK: how good placing ME here is (after placing)
    const atkScore=simulate(cells,r,col,ME);

    // DEF: how dangerous OPP's threats are at this cell
    const rawDef=simulate(cells,r,col,OPP);

    // ── SMART DEFENCE: adjust defence based on whether the threat is truly open ──
    // For each direction, check if OPP already has one end blocked by ME/wall.
    // If already blocked on one end AND cnt<=3 AND we're not forced → reduce defence priority.
    let adjustedDef=0;
    for(const[dr,dc]of[[0,1],[1,0],[1,1],[1,-1]]){
      // Score this direction for OPP placing at (r,col)
      const nb={};for(let rr=0;rr<NR;rr++){nb[rr]={};for(let cc=0;cc<NC;cc++)nb[rr][cc]=gc(cells,rr,cc)}
      nb[r][col]=OPP;
      const{cnt,open}=lineInfo(nb,r,col,dr,dc,OPP);

      let dirScore=0;
      if(cnt>=5)         dirScore=10000000;
      else if(cnt===4){
        if(open===2)     dirScore=500000;
        else if(open===1)dirScore=100000;
        else             dirScore=500;
      }
      else if(cnt===3){
        if(open===2){
          // Both ends open after placing: must block
          dirScore=50000;
        } else if(open===1){
          // One end open: check if the OTHER end (the blocked one) was
          // blocked by ME (AI) or by the wall/OPP piece.
          // If ME already blocked it → this is a single-direction threat,
          // NOT a double threat → lower defence priority so AI can attack.
          const{end1Blocked,end2Blocked}=oppDirAlreadyBlocked(cells,r,col,dr,dc);
          const aiBlockedOne=(end1Blocked||end2Blocked);
          dirScore=aiBlockedOne?800:2000; // still dangerous but can be deprioritised vs attack
        } else {
          dirScore=50; // dead chain
        }
      }
      else if(cnt===2){
        if(open===2)     dirScore=500;
        else if(open===1)dirScore=80;
      }
      else if(cnt===1){
        if(open===2)     dirScore=20;
      }
      adjustedDef+=dirScore;
    }

    // Final score: AI strongly prefers attacking unless defence is critical (cnt>=4 or open-3)
    // Weight: ATK × 1.2 (aggressive) + adjustedDef
    // If ATK creates a winning/near-winning move, always prefer it.
    const total=(atkScore>=10000000?atkScore*10:atkScore)*1.2+adjustedDef;

    if(total>bestScore){bestScore=total;bestR=r;bestC=col}
  }

  if(bestR<0){
    const emp=[];for(let r=0;r<NR;r++)for(let c=0;c<NC;c++)if(!gc(cells,r,c))emp.push([r,c]);
    if(!emp.length)return;
    [bestR,bestC]=emp[Math.floor(Math.random()*emp.length)];
  }

  const newC=clC(cells);newC[bestR][bestC]=ME;
  const wl=checkCW(newC,bestR,bestC);
  let full=true;for(let r=0;r<NR&&full;r++)for(let c=0;c<NC&&full;c++)if(!gc(newC,r,c))full=false;
  const sc={...(d.score||{h:0,g:0,d:0})};let st='playing',wn=null;
  if(wl){st='finished';wn=ME;sc.g=(sc.g||0)+1}
  else if(full){st='finished';sc.d=(sc.d||0)+1}
  cLast=null;
  await update(ref(db,`rooms/${id}`),{cells:newC,turn:OPP,caroStatus:st,lastMove:[bestR,bestC],winner:wn||null,winLine:wl||null,score:sc,caroTime:CARO_TIME,...(wn?{caroLastLoser:'guest'}:{})});
}
async function aiTX(id){const coin=[5000,10000,20000,50000][Math.floor(Math.random()*4)];const c=Math.random()<.5?'tai':'xiu';await update(ref(db,`rooms/${id}/bets`),{[AI]:c});await update(ref(db,`rooms/${id}/coins`),{[AI]:coin})}
async function aiBC(id){const a=Math.floor(Math.random()*6);const coin=[5000,10000,20000,50000][Math.floor(Math.random()*4)];await update(ref(db,`rooms/${id}/bcCoins`),{[AI]:coin});await update(ref(db,`rooms/${id}/bcBets`),{[AI]:{[a]:coin}})}
async function aiOT(id){const c=Math.floor(Math.random()*3);await update(ref(db,`rooms/${id}/otC`),{[AI]:c});const sn=await get(ref(db,`rooms/${id}`));const d=sn.val();if(d.otC?.[d.hid]!=null&&d.otC?.[AI]!=null)await update(ref(db,`rooms/${id}`),{otp:'both_chose'})}
async function aiXD(id){await update(ref(db,`rooms/${id}/players/${AI}`),{bet:[5000,10000,15000,20000][Math.floor(Math.random()*4)]})}
async function aiXDPlay(id){const sn=await get(ref(db,`rooms/${id}`));const d=sn.val();if(d.xp!=='play'||d.xdDone?.[AI])return;const hand=d.players?.[AI]?.hand||[],v=hVal(hand);if(v<16||(v<18&&Math.random()<.5)){const deck=[...(d.deck||[])];hand.push(deck.pop());const v2=hVal(hand);const upd={[`players/${AI}/hand`]:hand,deck};if(v2>=16)upd[`xdDone/${AI}`]=true;await update(ref(db,`rooms/${id}`),upd)}else{await update(ref(db,`rooms/${id}`),{[`xdDone/${AI}`]:true})}const sn2=await get(ref(db,`rooms/${id}`));const d2=sn2.val();if(Object.keys(d2.players||{}).every(pid=>d2.xdDone?.[pid]))await xdReveal()}
async function aiSM(id,d){const q=d.smQ2||{answer:0};const correct=Math.random()<.6;const ans=correct?q.answer:q.answer+(Math.random()<.5?-1:1)*(Math.floor(Math.random()*5)+1);await update(ref(db,`rooms/${id}/smA`),{[AI]:ans})}
async function aiGN(id,d){const s=d.gnS||50;const guess=Math.max(1,Math.min(100,s+Math.floor(Math.random()*30)-15));await update(ref(db,`rooms/${id}/gnG`),{[AI]:guess});const sn=await get(ref(db,`rooms/${id}`));const d2=sn.val();const g=d2.gnG||{};if(g[d2.hid]!=null&&g[d2.gid]!=null){const sec=d2.gnS||50,hD=Math.abs(g[d2.hid]-sec),gD=Math.abs(g[d2.gid]-sec);const w=hD<gD?'host':gD<hD?'guest':'draw';const sc={...(d2.gnScore||{h:0,g:0})};if(w==='host')sc.h=(sc.h||0)+1;else if(w==='guest')sc.g=(sc.g||0)+1;await update(ref(db,`rooms/${id}`),{gnp:'reveal',gnW:w,gnScore:sc})}}


// ── TIẾN LÊN (miền Nam) — bản mới: bàn 4 người, luật đầy đủ, chặt heo, tính điểm, đồng hồ lượt ──
const TL_R=['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
const TL_S=['♠','♣','♦','♥'];
const TL_TWO=12;
const tlV=c=>TL_R.indexOf(c.slice(0,-1))*4+TL_S.indexOf(c.slice(-1));
const tlRk=c=>TL_R.indexOf(c.slice(0,-1));
const tlSort=h=>[...(h||[])].sort((a,b)=>tlV(a)-tlV(b));
const tlRed=c=>c.slice(-1)==='♥'||c.slice(-1)==='♦';
const tlIsBot=p=>typeof p==='string'&&p.indexOf('__AI__')===0;
const tlNow=()=>(typeof Net!=='undefined'&&Net.now)?Net.now():Date.now();
const TL_BOTS=[['__AI__','Robo Tèo','🤖'],['__AI__2','Robo Tí','👾'],['__AI__3','Robo Bin','🦾']];
const TL_PTS={4:[3,1,-1,-3],3:[2,0,-2],2:[1,-1]};
const TL_EMO=['😂','😎','👏','🔥','😡','😭','🙏','💸'];
let tlSelected=[];let smTimerInterval=null;let pkRaiseAmt=0;let pkRaiseMode=false;
let tlSortMode='rank', tlLastSeq=-1, tlLastLog=0, tlBotSeq=-1, tlShowScore=false, tlTick=null, tlLastRoom=null;

/* ---------- nhận diện bộ bài ---------- */
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
function tlPick(d,pid,forHint){
  const hand=tlHands(d)[pid]||[],pile=d.tlPile||[];
  if(!hand.length)return null;
  if(tlBeat(pile,hand).ok&&(!d.tlMust||hand.includes(d.tlMust)))return hand.slice(); // đánh hết luôn
  const cand=tlCombos(hand).filter(c=>tlBeat(pile,c).ok&&(!d.tlMust||c.includes(d.tlMust)));
  if(!cand.length)return null;
  const isBomb=c=>{const t=tlType(c);return t.t==='quad'||t.t==='pairseq'};
  const has2=c=>c.some(x=>tlRk(x)===TL_TWO);
  const cost=c=>tlType(c).top+(has2(c)?40:0)+(isBomb(c)?60:0);
  if(!pile.length){
    const low=tlSort(hand)[0],withLow=cand.filter(c=>c.includes(low)&&!isBomb(c));
    const pool=withLow.length?withLow:cand.filter(c=>!isBomb(c)).length?cand.filter(c=>!isBomb(c)):cand;
    pool.sort((a,b)=>(b.length-a.length)||cost(a)-cost(b));
    return pool[0];
  }
  cand.sort((a,b)=>cost(a)-cost(b));
  const best=cand[0],P=tlType(pile);
  if(!forHint&&(has2(best)||isBomb(best))&&hand.length-best.length>4&&P.rk!==TL_TWO&&Math.random()<.6)return null;
  return best;
}
/* ---------- trạng thái ván ---------- */
function tlHands(d){const o={};(d.tlOrder||Object.keys(d.tlPlayers||{})).forEach(p=>o[p]=tlSort(d.tlPlayers?.[p]?.hand||[]));return o}
const tlNm=(d,p)=>{const x=d.tlPlayers?.[p];return x?(x.av||'')+' '+x.name:'?'};
const tlTimer=d=>d.tlTimerSec===0?0:(d.tlTimerSec||25);
function tlNext(d,from,passed,hands,pileBy){
  const order=d.tlOrder,has=p=>(hands[p]||[]).length>0,i0=order.indexOf(from);
  for(let k=1;k<=order.length;k++){const p=order[(i0+k)%order.length];
    if(p===pileBy){if(has(p))return{turn:p,newRound:true};continue}
    if(has(p)&&!passed[p])return{turn:p,newRound:false}}
  const i1=order.indexOf(pileBy);
  for(let k=1;k<=order.length;k++){const p=order[(i1+k)%order.length];if(has(p))return{turn:p,newRound:true}}
  return{turn:null,newRound:true};
}
function tlTurnFields(d,upd,turn){upd.tlTurn=turn;const T=tlTimer(d);upd.tlDeadline=T&&turn?tlNow()+T*1000:null}
function tlFinish(d,upd,hands,ranks,game,extraLog){
  const order=d.tlOrder,n=order.length,left=order.filter(p=>(hands[p]||[]).length&&!ranks.includes(p));
  let full=[...ranks,...left];
  const cong=(d.tlCong||[]).filter(p=>full.includes(p));
  full=[...full.filter(p=>!cong.includes(p)),...full.filter(p=>cong.includes(p))];
  const pts=TL_PTS[n]||TL_PTS[4],res=[],g={...game};
  full.forEach((p,i)=>{g[p]=(g[p]||0)+pts[Math.min(i,pts.length-1)]});
  const notes={};
  Object.keys(game||{}).forEach(p=>{const v=game[p];if(v)notes[p]=(v>0?'Chặt +'+v:'Bị chặt '+v)+' '});
  cong.forEach(p=>{g[p]=(g[p]||0)-3;g[full[0]]=(g[full[0]]||0)+3;notes[p]=(notes[p]||'')+'Cóng −3 '});
  const last=full[full.length-1],th=tlHeoPts(hands[last]||[]);
  if(th&&!cong.includes(last)){g[last]=(g[last]||0)-th;g[full[0]]=(g[full[0]]||0)+th;notes[last]=(notes[last]||'')+'Thối heo −'+th}
  full.forEach((p,i)=>res.push({p,rank:i+1,pts:g[p]||0,note:notes[p]||''}));
  const score={...(d.tlScore||{})},wins={...(d.tlWins||{})};
  full.forEach(p=>score[p]=(score[p]||0)+(g[p]||0));wins[full[0]]=(wins[full[0]]||0)+1;
  Object.assign(upd,{tlPhase:'finished',tlResult:res,tlScore:score,tlWins:wins,tlLastWinner:full[0],tlTurn:null,tlDeadline:null,tlGame:g,tlRanks:full});
  upd.tlLog={ts:tlNow(),k:'win',txt:extraLog||('🏆 '+tlNm(d,full[0])+' thắng ván!')};
}
// cập nhật khi actor đánh cards
function tlPlayUpd(d,actor,cards){
  if(d.tlPhase!=='playing'||d.tlTurn!==actor)return{err:'Chưa đến lượt!'};
  const hands=tlHands(d);
  if(!cards.every(c=>hands[actor].includes(c)))return{err:'Bài không có trên tay'};
  if(!tlType(cards))return{err:'Bộ bài không hợp lệ'};
  if(d.tlMust&&!cards.includes(d.tlMust))return{err:'Nước đầu phải có lá '+d.tlMust};
  const pile=d.tlPile||[],res=tlBeat(pile,cards);
  if(!res.ok)return{err:pile.length?'Không chặn được bài trên bàn':'Bộ bài không hợp lệ'};
  hands[actor]=hands[actor].filter(c=>!cards.includes(c));
  const upd={['tlPlayers/'+actor+'/hand']:hands[actor],tlPile:tlSort(cards),tlPileBy:actor,tlMust:null,tlSeq:(d.tlSeq||0)+1};
  let chop=res.chop||0;const P=tlType(pile);
  if(P&&(P.t==='quad'||P.t==='pairseq')&&d.tlPileChop)chop=(chop||4)+d.tlPileChop;
  upd.tlPileChop=chop;
  const game={...(d.tlGame||{})};
  if(chop){game[actor]=(game[actor]||0)+chop;game[d.tlPileBy]=(game[d.tlPileBy]||0)-chop;upd.tlGame=game;
    upd.tlLog={ts:tlNow(),k:'chop',txt:'💥 '+tlNm(d,actor)+' CHẶT '+tlNm(d,d.tlPileBy)+'  +'+chop}}
  const ranks=[...(d.tlRanks||[])];
  if(!hands[actor].length){
    ranks.push(actor);upd.tlRanks=ranks;
    if(ranks.length===1){const cong=d.tlOrder.filter(p=>p!==actor&&(hands[p]||[]).length===13);if(cong.length)upd.tlCong=cong}
    if(!chop)upd.tlLog={ts:tlNow(),k:'win',txt:['🥇','🥈','🥉'][ranks.length-1]+' '+tlNm(d,actor)+' về '+['nhất','nhì','ba'][ranks.length-1]+'!'};
  }
  const left=d.tlOrder.filter(p=>hands[p].length);
  if(left.length<=1){tlFinish({...d,tlCong:upd.tlCong||d.tlCong},upd,hands,ranks,game);return{upd}}
  const nx=tlNext(d,actor,d.tlPass||{},hands,actor);
  if(nx.newRound){upd.tlPile=null;upd.tlPileBy=null;upd.tlPass=null;upd.tlPileChop=0;
    if(!upd.tlLog)upd.tlLog={ts:tlNow(),k:'round',txt:'🔄 Vòng mới — '+tlNm(d,nx.turn)+' đi'}}
  tlTurnFields(d,upd,nx.turn);
  return{upd};
}
function tlPassUpd(d,actor){
  if(d.tlPhase!=='playing'||d.tlTurn!==actor)return{err:'Chưa đến lượt!'};
  if(!(d.tlPile||[]).length)return{err:'Bạn đang được đi trước, phải đánh!'};
  const passed={...(d.tlPass||{}),[actor]:true},hands=tlHands(d);
  const nx=tlNext(d,actor,passed,hands,d.tlPileBy),upd={tlPass:passed,tlSeq:(d.tlSeq||0)+1};
  if(nx.newRound){upd.tlPile=null;upd.tlPileBy=null;upd.tlPass=null;upd.tlPileChop=0;upd.tlLog={ts:tlNow(),k:'round',txt:'🔄 Vòng mới — '+tlNm(d,nx.turn)+' đi'}}
  tlTurnFields(d,upd,nx.turn);
  return{upd};
}
function tlAutoUpd(d,actor){ // hết giờ / máy chơi
  const pick=tlIsBot(actor)?tlPick(d,actor,false):null;
  if(pick)return tlPlayUpd(d,actor,pick);
  if((d.tlPile||[]).length)return tlPassUpd(d,actor);
  const hand=tlHands(d)[actor];const c=d.tlMust&&hand.includes(d.tlMust)?d.tlMust:hand[0];
  return tlPlayUpd(d,actor,[c]);
}
async function tlFresh(){const s=await get(ref(db,'rooms/'+room));return s.val()}
async function tlApply(fn){
  if(!room)return;const d=await tlFresh();if(!d)return;
  const r=fn(d);if(!r)return;if(r.err){showToast('❌ '+r.err);return}
  await update(ref(db,'rooms/'+room),r.upd);
}
/* ---------- chia bài ---------- */
async function tlDeal(){
  const d=await tlFresh();if(!d||role!=='host')return;
  const pids=Object.keys(d.tlPlayers||{});
  if(pids.length<2){showToast('⚠️ Cần ít nhất 2 người!');return}
  const order=[d.hid,...pids.filter(p=>p!==d.hid)].filter(p=>d.tlPlayers[p]).slice(0,4);
  const deck=[];for(const r of TL_R)for(const s of TL_S)deck.push(r+s);
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
  const upd={tlOrder:order,tlPhase:'playing',tlPile:null,tlPileBy:null,tlPass:null,tlPileChop:0,tlRanks:null,tlGame:null,tlCong:null,tlResult:null,
    tlRound:(d.tlRound||0)+1,tlSeq:(d.tlSeq||0)+1,status:'playing',pub:false},hands={};
  order.forEach((p,i)=>{hands[p]=tlSort(deck.slice(i*13,i*13+13));upd['tlPlayers/'+p+'/hand']=hands[p];upd['tlPlayers/'+p+'/ready']=tlIsBot(p)});
  const dd={...d,tlOrder:order,tlRound:upd.tlRound};
  // tới trắng
  for(const p of order){const why=tlInstant(hands[p]);if(why){
    const g={};order.forEach(q=>{if(q!==p){g[q]=-2;g[p]=(g[p]||0)+2}});
    tlFinish(dd,upd,hands,[p],{},'⚡ TỚI TRẮNG! '+tlNm(d,p)+' — '+why);
    const sc={...(d.tlScore||{})};order.forEach(q=>sc[q]=(sc[q]||0)+(g[q]||0));upd.tlScore=sc;upd.tlGame=g;
    upd.tlResult=order.map(q=>({p:q,rank:q===p?1:2,pts:g[q]||0,note:q===p?why:''})).sort((a,b)=>a.rank-b.rank);
    await update(ref(db,'rooms/'+room),upd);return}}
  // người đi đầu: ván đầu = người giữ lá nhỏ nhất (3♠), phải đánh lá đó; các ván sau = người thắng ván trước
  let lead=d.tlLastWinner&&order.includes(d.tlLastWinner)?d.tlLastWinner:null,must=null;
  if(!lead){let low=null;order.forEach(p=>{const c=hands[p][0];if(!low||tlV(c)<tlV(low.c))low={p,c}});lead=low.p;must=low.c}
  upd.tlMust=must;tlTurnFields(d,upd,lead);
  upd.tlLog={ts:tlNow(),k:'round',txt:'🃏 Ván '+upd.tlRound+' — '+tlNm(d,lead)+' đi trước'+(must?' (phải có '+must+')':'')};
  tlSelected=[];
  await update(ref(db,'rooms/'+room),upd);
}
/* ---------- hành động người chơi ---------- */
window.tlToggleCard=function(c){const i=tlSelected.indexOf(c);if(i>=0)tlSelected.splice(i,1);else tlSelected.push(c);if(liveD)renderTL(liveD,room)};
window.tlPlay2=async function(){if(!tlSelected.length){showToast('⚠️ Chọn bài trước!');return}const cards=[...tlSelected];
  await tlApply(d=>{const r=tlPlayUpd(d,me().id,cards);if(!r.err)tlSelected=[];return r})};
window.tlPass2=async function(){tlSelected=[];await tlApply(d=>tlPassUpd(d,me().id))};
window.tlSetReady=async function(){if(!room)return;await update(ref(db,'rooms/'+room),{['tlPlayers/'+me().id+'/ready']:true})};
window.tlStart2=tlDeal;
window.tlRestart2=tlDeal;
window.tlToLobby=async function(){if(!room||role!=='host')return;const d=await tlFresh();const n=Object.keys(d.tlPlayers||{}).length;
  const upd={tlPhase:'waiting',tlPile:null,tlPileBy:null,tlPass:null,tlTurn:null,tlResult:null,tlRanks:null,status:'waiting',pub:n<4};
  Object.keys(d.tlPlayers||{}).forEach(p=>{upd['tlPlayers/'+p+'/hand']=null;upd['tlPlayers/'+p+'/ready']=tlIsBot(p)||p===d.hid});
  await update(ref(db,'rooms/'+room),upd)};
async function tlAddBot(){const d=await tlFresh();if(role!=='host'||!d)return;const P=d.tlPlayers||{};
  if(Object.keys(P).length>=4){showToast('Bàn đã đủ 4 người');return}
  const b=TL_BOTS.find(x=>!P[x[0]]);if(!b)return;
  await update(ref(db,'rooms/'+room),{['tlPlayers/'+b[0]]:{name:b[1],av:b[2],ready:true},pub:Object.keys(P).length+1<4})}
async function tlKick(p){if(role!=='host'||!p||p===me().id)return;const d=await tlFresh();if(d.tlPhase==='playing'){showToast('Đang chơi, không mời ra được');return}
  await update(ref(db,'rooms/'+room),{['tlPlayers/'+p]:null,pub:true})}
async function tlEmo(e){if(!room)return;await update(ref(db,'rooms/'+room),{['tlEmo/'+me().id]:{e,ts:tlNow()}})}
async function tlSetTimer(s){if(role!=='host')return;await update(ref(db,'rooms/'+room),{tlTimerSec:s})}
function tlHint(){const d=liveD;if(!d)return;const p=tlPick(d,me().id,true);if(!p){showToast('🤔 Không có bài chặn được — bỏ lượt thôi');return}tlSelected=p.slice();renderTL(d,room)}
window.tlLeaveSeat=async function(){ // khách rời phòng lúc chờ: nhả ghế
  if(!liveD||liveD.game!=='tienlen'||role==='host')return;
  try{if((liveD.tlPhase||'waiting')!=='playing')await update(ref(db,'rooms/'+room),{['tlPlayers/'+me().id]:null,pub:true})}catch(e){}
};
/* ---------- đồng hồ lượt + máy chơi (máy do chủ phòng điều khiển) ---------- */
function tlLoop(){
  const d=liveD;if(!d||d.game!=='tienlen'||!room){return}
  document.querySelectorAll('[data-dl]').forEach(el=>{const dl=+el.dataset.dl,T=tlTimer(d)*1000;const left=Math.max(0,dl-tlNow());
    el.style.width=(T?Math.min(100,left*100/T):0)+'%';el.style.background=left<5000?'#ef4444':'#fbbf24';
    const t=el.parentElement.nextElementSibling;if(t&&t.classList.contains('tl-sec'))t.textContent=Math.ceil(left/1000)+'s'});
  if(d.tlPhase!=='playing'||!d.tlTurn)return;
  const turn=d.tlTurn,myId=me().id;
  if(role==='host'&&tlIsBot(turn)&&tlBotSeq!==d.tlSeq){
    tlBotSeq=d.tlSeq;const seq=d.tlSeq;
    setTimeout(()=>tlApply(dd=>dd.tlSeq===seq&&dd.tlTurn===turn?tlAutoUpd(dd,turn):null),900+Math.random()*900);return;
  }
  if(!d.tlDeadline)return;
  const over=tlNow()-d.tlDeadline;
  if(turn===myId&&over>0&&tlBotSeq!==-d.tlSeq-1){tlBotSeq=-d.tlSeq-1;const seq=d.tlSeq;showToast('⏰ Hết giờ — tự động '+((d.tlPile||[]).length?'bỏ lượt':'đánh lá nhỏ nhất'));
    tlSelected=[];tlApply(dd=>dd.tlSeq===seq&&dd.tlTurn===myId?tlAutoUpd(dd,myId):null)}
  else if(role==='host'&&turn!==myId&&over>4000&&tlBotSeq!==-d.tlSeq-1){tlBotSeq=-d.tlSeq-1;const seq=d.tlSeq;
    tlApply(dd=>dd.tlSeq===seq&&dd.tlTurn===turn?tlAutoUpd(dd,turn):null)}
}
/* ---------- giao diện ---------- */
function tlCard(c,cls){const r=c.slice(0,-1),s=c.slice(-1);
  return'<div class="tl-card'+(tlRed(c)?' red':'')+(cls?' '+cls:'')+'" data-c="'+c+'"><span class="r">'+r+'</span><span class="s1">'+s+'</span><span class="s2">'+s+'</span></div>'}
function tlBanner(txt,k){const g=document.getElementById('ghx');if(!g||!txt)return;const b=document.createElement('div');b.className='tl-banner '+(k||'');b.textContent=txt;g.appendChild(b);setTimeout(()=>b.remove(),1900)}
function tlSeat(d,p,pos){
  const x=d.tlPlayers?.[p]||{},cnt=(x.hand||[]).length,isTurn=d.tlTurn===p&&d.tlPhase==='playing';
  const passed=(d.tlPass||{})[p],rk=(d.tlRanks||[]).indexOf(p),cong=(d.tlCong||[]).includes(p);
  const emo=d.tlEmo?.[p],showEmo=emo&&tlNow()-emo.ts<3000;
  let tag='';
  if(rk>=0&&d.tlPhase==='playing')tag='<span class="tl-tag win">'+['🥇 Nhất','🥈 Nhì','🥉 Ba'][rk]+'</span>';
  else if(cong)tag='<span class="tl-tag cong">Cóng</span>';
  else if(passed)tag='<span class="tl-tag pass">Bỏ lượt</span>';
  else if(isTurn)tag='<span class="tl-tag turn">Đang đánh…</span>';
  const sc=(d.tlScore||{})[p]||0;
  return'<div class="tl-seat '+pos+(isTurn?' turn':'')+'">'
    +'<div class="tl-av">'+(x.av||'😎')+(showEmo?'<span class="tl-bub">'+emo.e+'</span>':'')+'</div>'
    +(isTurn&&d.tlDeadline?'<div class="tl-tbar"><i data-dl="'+d.tlDeadline+'"></i></div>':'')
    +'<div class="tl-nm">'+esc(x.name||'?')+'</div>'
    +(d.tlPhase==='playing'&&cnt?'<div class="tl-cnt"><span class="tl-back"></span><b>'+cnt+'</b></div>':'')
    +tag+'<div class="tl-sc">'+(sc>0?'+':'')+sc+' đ</div></div>';
}
function tlScoreBoard(d){
  const P=d.tlPlayers||{},ids=Object.keys(P).sort((a,b)=>((d.tlScore||{})[b]||0)-((d.tlScore||{})[a]||0));
  return'<div class="tl-box"><div class="tl-h">📊 Bảng điểm'+(d.tlRound?' · sau '+d.tlRound+' ván':'')+'</div>'
    +ids.map((p,i)=>'<div class="tl-row"><span>'+(i+1)+'.</span><span class="tl-ra">'+(P[p].av||'')+'</span><span class="tl-rn">'+esc(P[p].name)+'</span><span class="tl-rw">'+((d.tlWins||{})[p]||0)+' 🏆</span><b class="'+(((d.tlScore||{})[p]||0)<0?'neg':'pos')+'">'+(((d.tlScore||{})[p]||0)>0?'+':'')+((d.tlScore||{})[p]||0)+'</b></div>').join('')+'</div>';
}
const TL_RULES='<div class="tl-box tl-rules"><div class="tl-h">📖 Luật chơi</div>'
  +'🃏 13 lá/người · Thứ tự <b>3 &lt; 4 &lt; … &lt; A &lt; 2</b> · chất ♠ &lt; ♣ &lt; ♦ &lt; ♥<br>'
  +'Đánh: lá đơn, đôi, bộ ba, tứ quý, sảnh (3+ lá liên tiếp, không có 2), đôi thông (3+ đôi liên tiếp)<br>'
  +'Bỏ lượt thì mất quyền đánh tới hết vòng · Ván đầu: ai giữ 3♠ đi trước · Các ván sau: người thắng đi trước<br>'
  +'💥 <b>Chặt heo:</b> 3 đôi thông / tứ quý chặt 1 heo · tứ quý chặt đôi heo & 3 đôi thông · 4 đôi thông chặt hết (heo đen 2đ, heo đỏ 3đ)<br>'
  +'⚡ <b>Tới trắng:</b> tứ quý 2, sảnh rồng, 6 đôi, 5 đôi thông → thắng ngay<br>'
  +'🏆 Điểm (4 người): Nhất +3 · Nhì +1 · Ba −1 · Bét −3 · Cóng −3 · Thối heo (bét còn heo) bị trừ'
  +'</div>';
function renderTL(d,id){
  const h=me(),P=d.tlPlayers||{},pids=Object.keys(P),phase=d.tlPhase||'waiting';
  if(tlLastRoom!==id){tlLastRoom=id;tlLastSeq=-1;tlLastLog=d.tlLog?.ts||0;tlBotSeq=-1;tlSelected=[]}
  if(!tlTick)tlTick=setInterval(tlLoop,300);
  let wrap=document.getElementById('tlw');
  if(!wrap){
    document.getElementById('garea').innerHTML='<div class="gtop"><div class="gtitle">🏹 Tiến Lên <span class="cbadge" id="tl-code">#'+id+' 📋</span></div><div class="gbtns"><button class="btn btn-g btn-sm" id="tl-sb">📊</button><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div></div><div id="tlw" class="tlw"></div>';
    wrap=document.getElementById('tlw');
    document.getElementById('tl-code').onclick=()=>copyL(location.href.split('?')[0].split('#')[0]+'?room='+id);
    document.getElementById('tl-sb').onclick=()=>{tlShowScore=!tlShowScore;if(liveD)renderTL(liveD,room)};
    wrap.addEventListener('click',e=>{
      const t=e.target.closest('[data-a],[data-c]');if(!t||!wrap.contains(t))return;
      if(t.dataset.c&&t.closest('.tl-hand')){tlToggleCard(t.dataset.c);return}
      const a=t.dataset.a;
      if(a==='play')tlPlay2();else if(a==='pass')tlPass2();else if(a==='hint')tlHint();
      else if(a==='sort'){tlSortMode=tlSortMode==='rank'?'suit':'rank';renderTL(liveD,room)}
      else if(a==='clear'){tlSelected=[];renderTL(liveD,room)}
      else if(a==='ready')tlSetReady();else if(a==='deal')tlDeal();else if(a==='lobby')tlToLobby();
      else if(a==='bot')tlAddBot();else if(a==='kick')tlKick(t.dataset.p);
      else if(a==='emo')tlEmo(t.dataset.e);else if(a==='timer')tlSetTimer(+t.dataset.s);
      else if(a==='copy')copyL(location.href.split('?')[0].split('#')[0]+'?room='+id);
    });
  }
  rmW();
  // hiệu ứng thông báo
  if(d.tlLog&&d.tlLog.ts>tlLastLog){tlLastLog=d.tlLog.ts;if(d.tlLog.txt){tlBanner(d.tlLog.txt,d.tlLog.k);
    if(typeof beep==='function'){if(d.tlLog.k==='chop'){beep(160,.35,'sawtooth',.15);setTimeout(()=>beep(90,.4,'sawtooth',.15),150)}else if(d.tlLog.k==='win'){beep(784,.12);setTimeout(()=>beep(1046,.2),120)}else beep(520,.08)}}}
  let html='';
  // ── PHÒNG CHỜ ──
  if(phase==='waiting'){
    const host=role==='host',seats=[];
    for(let i=0;i<4;i++){const p=pids[i];
      if(p){const x=P[p];seats.push('<div class="tl-slot'+(p===h.id?' me':'')+'"><span class="tl-sav">'+(x.av||'😎')+'</span><div class="tl-sinfo"><b>'+esc(x.name)+(p===d.hid?' 👑':'')+'</b><small class="'+(x.ready||tlIsBot(p)?'ok':'')+'">'+(tlIsBot(p)?'🤖 Máy':x.ready||p===d.hid?'✅ Sẵn sàng':'⏳ Chưa sẵn sàng')+'</small></div>'+(host&&p!==h.id?'<button class="tl-x" data-a="kick" data-p="'+p+'">✕</button>':'')+'</div>')}
      else seats.push('<div class="tl-slot empty">'+(host?'<button class="btn btn-g btn-sm" data-a="bot">🤖 Thêm máy</button>':'<small>Ghế trống</small>')+'</div>')}
    html+='<div class="tl-box"><div class="tl-h">🏹 Bàn Tiến Lên · '+pids.length+'/4 người</div><div class="tl-seats">'+seats.join('')+'</div>'
      +'<div class="tl-invite" data-a="copy">📋 Mã phòng <b>#'+id+'</b> — chạm để copy link mời bạn</div></div>';
    const T=tlTimer(d);
    html+='<div class="tl-box"><div class="tl-h">⏱ Thời gian mỗi lượt'+(host?'':' (chủ phòng chọn)')+'</div><div class="tl-chips">'
      +[[15,'15 giây'],[25,'25 giây'],[40,'40 giây'],[0,'Không giới hạn']].map(([s,l])=>'<button class="tl-chip'+(T===s?' on':'')+'" '+(host?'data-a="timer" data-s="'+s+'"':'disabled')+'>'+l+'</button>').join('')+'</div></div>';
    if(d.tlRound)html+=tlScoreBoard(d);
    html+=TL_RULES;
    const mine=P[h.id]||{};
    if(!host&&!mine.ready)html+='<button class="btn btn-p tl-big" data-a="ready">✅ Tôi sẵn sàng!</button>';
    else if(!host)html+='<div class="tl-wait">✅ Đã sẵn sàng — chờ chủ phòng chia bài</div>';
    if(host){const notReady=pids.filter(p=>p!==h.id&&!P[p].ready&&!tlIsBot(p)).length;
      html+='<button class="btn btn-y tl-big" data-a="deal" '+(pids.length<2?'disabled':'')+'>'+(pids.length<2?'⏳ Cần ít nhất 2 người (thêm máy hoặc mời bạn)':'🃏 Chia bài'+(notReady?' ('+notReady+' người chưa sẵn sàng)':'!'))+'</button>'}
    wrap.innerHTML=html;return;
  }
  // ── ĐANG CHƠI / KẾT THÚC ──
  const order=(d.tlOrder||pids).filter(p=>P[p]),myIdx=order.indexOf(h.id),others=[];
  for(let k=1;k<order.length;k++)others.push(order[(Math.max(0,myIdx)+k)%order.length]);
  const pos=others.length===1?['top']:others.length===2?['right','left']:['right','top','left'];
  const pile=d.tlPile||[],pt=tlType(pile),isNew=d.tlSeq!==tlLastSeq;tlLastSeq=d.tlSeq;
  html+='<div class="tl-table">'+others.map((p,i)=>tlSeat(d,p,pos[i])).join('')
    +'<div class="tl-center">'
    +(phase==='finished'?'<div class="tl-ptype">Ván '+(d.tlRound||1)+' kết thúc</div>'
      :pile.length?'<div class="tl-pile'+(isNew?' new':'')+'">'+pile.map((c,i)=>tlCard(c,'')).join('')+'</div><div class="tl-ptype">'+tlName(pt)+' · '+esc(P[d.tlPileBy]?.name||'')+(d.tlPileChop?' 💥':'')+'</div>'
      :'<div class="tl-empty">'+(d.tlTurn===h.id?'🎯 Bạn đi trước — đánh gì cũng được'+(d.tlMust?'<br>(phải có '+d.tlMust+')':''):'⏳ '+esc(P[d.tlTurn]?.name||'')+' đang đi trước')+'</div>')
    +'</div></div>';
  // kết quả ván
  if(phase==='finished'){
    const res=d.tlResult||[];
    html+='<div class="tl-box tl-result"><div class="tl-h">🏆 Kết quả ván '+(d.tlRound||1)+'</div>'
      +res.map(r=>'<div class="tl-row'+(r.p===h.id?' me':'')+'"><span>'+(['🥇','🥈','🥉','💀'][r.rank-1]||r.rank)+'</span><span class="tl-ra">'+(P[r.p]?.av||'')+'</span><span class="tl-rn">'+esc(P[r.p]?.name||'?')+(r.note?' <small>'+esc(r.note)+'</small>':'')+'</span><b class="'+(r.pts<0?'neg':'pos')+'">'+(r.pts>0?'+':'')+r.pts+'</b></div>').join('')
      +(role==='host'?'<div class="tl-two"><button class="btn btn-y" data-a="deal">🃏 Ván tiếp</button><button class="btn btn-g" data-a="lobby">🪑 Đổi người</button></div>':'<div class="tl-wait">⏳ Chờ chủ phòng chia ván tiếp…</div>')+'</div>';
    html+=tlScoreBoard(d);
    wrap.innerHTML=html;return;
  }
  // bài của tôi
  const myHand=tlHands(d)[h.id]||[];
  tlSelected=tlSelected.filter(c=>myHand.includes(c));
  const shown=tlSortMode==='rank'?myHand:[...myHand].sort((a,b)=>TL_S.indexOf(a.slice(-1))-TL_S.indexOf(b.slice(-1))||tlV(a)-tlV(b));
  const isMyTurn=d.tlTurn===h.id,sel=new Set(tlSelected),selT=tlType(tlSelected);
  const chk=tlSelected.length?(selT?tlBeat(pile,tlSelected):{ok:false}):null;
  const myRank=(d.tlRanks||[]).indexOf(h.id);
  let status;
  if(myRank>=0)status='🎉 Bạn đã về '+['nhất','nhì','ba'][myRank]+'! Xem mọi người đánh tiếp…';
  else if(isMyTurn)status='🎯 Lượt của bạn'+(tlSelected.length?' · '+(selT?tlName(selT)+(chk.ok?(chk.chop?' 💥 chặt được!':' ✅'):' ❌ không chặn được'):'⚠️ bộ không hợp lệ'):'');
  else if((d.tlPass||{})[h.id])status='⏭ Bạn đã bỏ lượt — chờ vòng mới';
  else status='⏳ Chờ '+esc(P[d.tlTurn]?.name||'')+'…';
  const emo=d.tlEmo?.[h.id],showEmo=emo&&tlNow()-emo.ts<3000;
  html+='<div class="tl-me'+(isMyTurn?' turn':'')+'">'
    +'<div class="tl-mehead"><span class="tl-meav">'+(h.av||'😎')+(showEmo?'<span class="tl-bub">'+emo.e+'</span>':'')+'</span><div class="tl-mest">'+status+'</div>'
    +(isMyTurn&&d.tlDeadline?'<div class="tl-tbar wide"><i data-dl="'+d.tlDeadline+'"></i></div><span class="tl-sec"></span>':'')+'</div>'
    +'<div class="tl-hand">'+shown.map(c=>tlCard(c,sel.has(c)?'sel':'')).join('')+'</div>'
    +(myRank<0?'<div class="tl-acts"><button class="btn btn-g" data-a="sort">↕ '+(tlSortMode==='rank'?'Theo chất':'Theo số')+'</button><button class="btn btn-g" data-a="hint">💡 Gợi ý</button>'
      +'<button class="btn btn-g" data-a="pass" '+(isMyTurn&&pile.length?'':'disabled')+'>⏭ Bỏ</button>'
      +'<button class="btn btn-p" data-a="play" '+(isMyTurn&&chk&&chk.ok?'':'disabled')+'>▶ Đánh'+(tlSelected.length?' '+tlSelected.length+' lá':'')+'</button></div>':'')
    +'<div class="tl-emo">'+TL_EMO.map(e=>'<button data-a="emo" data-e="'+e+'">'+e+'</button>').join('')+'</div>'
    +'</div>';
  if(tlShowScore)html+=tlScoreBoard(d);
  wrap.innerHTML=html;
  // bong bóng cảm xúc tự tắt
  if(d.tlEmo&&Object.values(d.tlEmo).some(x=>tlNow()-x.ts<3000)){clearTimeout(window._tlEmoT);window._tlEmoT=setTimeout(()=>{if(liveD&&liveD.game==='tienlen')renderTL(liveD,room)},3100)}
}

// ── POKER (Texas Hold'em Heads-Up) ──
// Ranks: 2=0, 3=1, ..., A=12  |  Suits: ♠♣♦♥
const PK_RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const pkRk=card=>PK_RANKS.indexOf(card.slice(0,-1));
const pkSt=card=>card.slice(-1);

// Evaluate best 5-card hand from 5-7 cards
// Returns {rank:0-8, tb:[...tiebreakers]} — higher rank = stronger hand
// 8=Royal/Straight Flush, 7=Four of a Kind, 6=Full House, 5=Flush,
// 4=Straight, 3=Three of a Kind, 2=Two Pair, 1=One Pair, 0=High Card
function pkEval5(cards){
  if(!cards||cards.length!==5)return{rank:-1,tb:[]};
  const ranks=cards.map(pkRk).sort((a,b)=>b-a);
  const suits=cards.map(pkSt);
  const isFlush=suits.every(s=>s===suits[0]);
  // Straight check (also A-2-3-4-5 wheel)
  const r=[...ranks];
  const isNormal=r.every((v,i)=>i===0||v===r[i-1]-1);
  const isWheel=r[0]===12&&r[1]===3&&r[2]===2&&r[3]===1&&r[4]===0;
  const isStraight=isNormal||isWheel;
  const topStraight=isWheel?3:r[0]; // wheel top = 5 (index 3)
  // Frequency groups
  const freq={};ranks.forEach(v=>freq[v]=(freq[v]||0)+1);
  const g=Object.entries(freq).map(([v,n])=>({v:+v,n})).sort((a,b)=>b.n-a.n||b.v-a.v);
  // Determine hand rank
  if(isFlush&&isStraight)return{rank:8,tb:[topStraight]};
  if(g[0].n===4)return{rank:7,tb:[g[0].v,g[1].v]};
  if(g[0].n===3&&g[1]?.n===2)return{rank:6,tb:[g[0].v,g[1].v]};
  if(isFlush)return{rank:5,tb:ranks};
  if(isStraight)return{rank:4,tb:[topStraight]};
  if(g[0].n===3)return{rank:3,tb:[g[0].v,g[1].v,g[2].v]};
  if(g[0].n===2&&g[1]?.n===2)return{rank:2,tb:[g[0].v,g[1].v,g[2].v]};
  if(g[0].n===2)return{rank:1,tb:[g[0].v,...ranks.filter(v=>v!==g[0].v)]};
  return{rank:0,tb:ranks};
}

// Find best 5-card combo from 6-7 cards (brute-force C(n,5))
function pkBestHand(cards){
  let best=null,bestR={rank:-1,tb:[]};
  const n=cards.length;
  for(let i=0;i<n-4;i++)for(let j=i+1;j<n-3;j++)for(let k=j+1;k<n-2;k++)
    for(let l=k+1;l<n-1;l++)for(let m=l+1;m<n;m++){
      const h=[cards[i],cards[j],cards[k],cards[l],cards[m]];
      const r=pkEval5(h);
      if(r.rank>bestR.rank||(r.rank===bestR.rank&&compareTb(r.tb,bestR.tb)>0)){bestR=r;best=h}
    }
  return{hand:best,eval:bestR};
}

function compareTb(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d!==0)return d}return 0}

const pkHandName=[
  'Bài Cao','Một Đôi','Hai Đôi','Sám Cô','Sảnh','Thùng','Cù Lũ','Tứ Quý','Thùng Phá Sảnh / Sảnh Chúa'
];

// mkCard defined globally above

function pkActionHTML(isMe,isTurn,p,d,bb,toCall){
  if(!isMe||!isTurn||p.folded||p.allin)return'';
  const minRaise=Math.max((d.pkBet||bb)*2,bb*2);
  const maxRaise=(p.bet||0)+(p.chips||0);
  if(pkRaiseMode){
    const amt=pkRaiseAmt||minRaise;
    return'<div style="background:rgba(245,158,11,.1);border:1.5px solid rgba(245,158,11,.5);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px">'
      +'<div style="font-size:12px;color:#fbbf24;font-weight:700;text-align:center">⬆️ Chọn mức Raise</div>'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'<span style="font-size:12px;color:var(--muted2)">'+minRaise+'</span>'
      +'<input type="range" id="pkRangeIn" min="'+minRaise+'" max="'+maxRaise+'" step="'+bb+'" value="'+amt+'" oninput="pkSetRaise(this.value)" style="flex:1;accent-color:#f59e0b">'
      +'<span style="font-size:12px;color:var(--muted2)">'+maxRaise+'</span>'
      +'</div>'
      +'<div style="font-size:18px;font-weight:900;color:#fbbf24;text-align:center">'+amt+' 🪙</div>'
      +'<div style="display:flex;gap:8px">'
      +'<button onclick="pkCancelRaise()" style="flex:1;padding:10px;border-radius:10px;background:rgba(100,100,100,.5);color:#fff;font-size:13px;font-weight:800;border:none;cursor:pointer;font-family:inherit">✕ Huỷ</button>'
      +'<button onclick="pkConfirmRaise()" style="flex:2;padding:10px;border-radius:10px;background:rgba(245,158,11,.9);color:#000;font-size:13px;font-weight:800;border:none;cursor:pointer;font-family:inherit">✅ Xác nhận '+amt+' 🪙</button>'
      +'</div>'
      +'</div>';
  }
  let html='<div style="display:flex;gap:6px;flex-wrap:wrap">'
    +'<button onclick="pkFold2()" style="flex:1;min-width:56px;padding:10px 4px;border-radius:10px;background:rgba(239,68,68,.8);color:#fff;font-size:12px;font-weight:800;border:none;cursor:pointer;font-family:inherit">🚫 Fold</button>';
  if(toCall===0)html+='<button onclick="pkCheck2()" style="flex:1;min-width:56px;padding:10px 4px;border-radius:10px;background:rgba(16,185,129,.8);color:#fff;font-size:12px;font-weight:800;border:none;cursor:pointer;font-family:inherit">✋ Check</button>';
  if(toCall>0)html+='<button onclick="pkCall2()" style="flex:1;min-width:64px;padding:10px 4px;border-radius:10px;background:rgba(139,92,246,.9);color:#fff;font-size:12px;font-weight:800;border:none;cursor:pointer;font-family:inherit">📞 Call<br><small style="font-weight:400">'+Math.min(toCall,p.chips||0)+'</small></button>';
  if((p.chips||0)>toCall)html+='<button onclick="pkOpenRaise('+minRaise+')" style="flex:1;min-width:56px;padding:10px 4px;border-radius:10px;background:rgba(245,158,11,.9);color:#000;font-size:12px;font-weight:800;border:none;cursor:pointer;font-family:inherit">⬆️ Raise</button>';
  html+='<button onclick="pkAllIn2()" style="flex:1;min-width:56px;padding:10px 4px;border-radius:10px;background:rgba(220,38,38,.95);color:#fff;font-size:12px;font-weight:800;border:none;cursor:pointer;font-family:inherit">💥 All-in<br><small style="font-weight:400">'+(p.chips||0)+'</small></button>';
  html+='</div>';
  return html;
}
function renderPK(d,id){
  const h=me();
  const players=d.pkPlayers||{},pids=Object.keys(players),myP=players[h.id];
  const com=d.pkCommunity||[],pot=d.pkPot||0,phase=d.pkPhase||'waiting';
  const isMyTurn=d.pkTurn===h.id&&phase==='playing';
  // Reset raise mode when it's no longer my turn
  if(!isMyTurn&&pkRaiseMode){pkRaiseMode=false;pkRaiseAmt=0;}
  const dealer=d.pkDealer||0; // index in pids
  const bb=d.pkBigBlind||20;

  if(!document.getElementById('pkw')){
    document.getElementById('garea').innerHTML='<div class="gtop"><div class="gtitle">♠️ Poker <span class="cbadge" onclick="copyL(window.location.href)">#'+id+'</span></div><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div><div id="pkw" style="width:100%;max-width:560px;display:flex;flex-direction:column;gap:10px;padding-bottom:28px"></div>';
  }
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();
  let wrap=document.getElementById('pkw');
  if(!wrap){const ga=document.getElementById('garea');if(ga)ga.innerHTML+='<div id="pkw" style="width:100%;max-width:560px;display:flex;flex-direction:column;gap:10px;padding-bottom:28px"></div>';wrap=document.getElementById('pkw');}
  if(!wrap)return;

  const rndLabel={preflop:'Pre-Flop',flop:'Flop',turn:'Turn',river:'River',showdown:'Showdown'};
  const sbIdx=dealer%pids.length,bbIdx=(dealer+1)%pids.length;
  const sbId=pids[sbIdx],bbId=pids[bbIdx];

  let html='';

  // ── Bàn (Table) ──
  html+=`<div style="background:radial-gradient(ellipse at 50% 40%,#166534 0%,#14532d 50%,#052e16 100%);border:3px solid #15803d;border-radius:50px;padding:20px 16px;display:flex;flex-direction:column;align-items:center;gap:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="text-align:center">
        <div style="font-size:9px;color:#86efac;text-transform:uppercase;letter-spacing:2px">Pot</div>
        <div style="font-size:24px;font-weight:900;color:#fde68a">${pot.toLocaleString()} <small style="font-size:12px">🪙</small></div>
      </div>
      <div style="text-align:center">
        <div style="font-size:11px;color:#86efac;font-weight:700">${rndLabel[d.pkRound||'preflop']||''}</div>
        <div style="font-size:12px;color:${isMyTurn?'#4ade80':'#9ca3af'};font-weight:700">${phase==='waiting'?'Chờ bắt đầu':phase==='showdown'?'🃏 Showdown!':isMyTurn?'🎯 Lượt bạn!':'⏳ Chờ...'}</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:9px;color:#86efac;text-transform:uppercase;letter-spacing:2px">Blind</div>
        <div style="font-size:12px;color:#fde68a;font-weight:700">SB ${bb/2} · BB ${bb}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap">
      ${com.map(card=>mkCard(card)).join('')}
      ${Array(5-com.length).fill(0).map((_,i)=>`<div style="width:46px;height:66px;border:1.5px dashed rgba(134,239,172,.3);border-radius:8px;display:flex;align-items:center;justify-content:center;color:rgba(134,239,172,.3);font-size:16px">${['♠','♣','♦','♥'][i%4]}</div>`).join('')}
    </div>
  </div>`;

  // ── Players ──
  pids.forEach((pid,pidx)=>{
    const p=players[pid],isMe=pid===h.id,isTurn=d.pkTurn===pid&&phase==='playing';
    const isSB=pid===sbId,isBB=pid===bbId,isDealer=pidx===dealer%pids.length;
    const showH=isMe||(phase==='showdown'&&!p.folded);
    const cards=p.hand||[];
    const toCall=Math.max(0,(d.pkBet||0)-(p.bet||0));
    // Show best hand name at showdown
    let handLabel='';
    if(showH&&cards.length>=2&&com.length>=3){
      const all=[...cards,...com];
      const res=all.length>5?pkBestHand(all).eval:pkEval5(all);
      if(res.rank>=0)handLabel=pkHandName[res.rank]||'';
    }
    html+=`<div style="background:${isMe?'rgba(139,92,246,.12)':'var(--s1)'};border:2px solid ${isTurn?'#4ade80':isMe?'#8b5cf6':'var(--b1)'};border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;transition:border-color .2s${p.folded?';opacity:.4':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          <span style="font-size:20px">${p.av||'🎴'}</span>
          <span style="font-size:14px;font-weight:800">${p.name}</span>
          ${isDealer?'<span style="background:#1d4ed8;color:#fff;font-size:10px;padding:2px 7px;border-radius:99px;font-weight:800">D</span>':''}
          ${isSB?'<span style="background:#92400e;color:#fde68a;font-size:10px;padding:2px 7px;border-radius:99px;font-weight:700">SB</span>':''}
          ${isBB?'<span style="background:#5b21b6;color:#ddd6fe;font-size:10px;padding:2px 7px;border-radius:99px;font-weight:700">BB</span>':''}
          ${isTurn?'<span style="background:#4ade80;color:#000;font-size:10px;padding:2px 8px;border-radius:99px;font-weight:800">Lượt</span>':''}
          ${p.folded?'<span style="background:rgba(239,68,68,.25);color:#fca5a5;font-size:10px;padding:2px 8px;border-radius:99px">Fold</span>':''}
          ${p.allin?'<span style="background:rgba(251,191,36,.25);color:#fde68a;font-size:10px;padding:2px 8px;border-radius:99px">All-in</span>':''}
          ${handLabel?`<span style="background:rgba(139,92,246,.25);color:#c4b5fd;font-size:10px;padding:2px 8px;border-radius:99px;font-weight:700">${handLabel}</span>`:''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:17px;font-weight:900;color:#fde68a">${(p.chips||0).toLocaleString()} 🪙</div>
          ${(p.bet||0)>0?`<div style="font-size:11px;color:var(--muted2)">Đặt cược: ${p.bet}</div>`:''}
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;min-height:46px">
        ${cards.map(card=>showH?mkCard(card):`<div class="card-el card-back" style="display:flex;align-items:center;justify-content:center;font-size:22px;color:rgba(255,255,255,.2)">🂠</div>`).join('')}
        ${cards.length===0&&!p.folded?'<span style="font-size:12px;color:var(--muted)">Chờ phát bài...</span>':''}
      </div>
      ${pkActionHTML(isMe,isTurn,p,d,bb,toCall)}
    </div>`;
  });

  // ── Showdown result ──
  if(phase==='showdown'&&d.pkWinner){
    const wp=players[d.pkWinner];
    const winnerHand=wp?.hand?.length&&com.length>=3?pkBestHand([...wp.hand,...com]):null;
    html+=`<div style="background:rgba(251,191,36,.1);border:2px solid #fbbf24;border-radius:16px;padding:22px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px">
      <div style="font-size:50px">${d.pkWinner==='split'?'🤝':'🏆'}</div>
      <div style="font-size:20px;font-weight:900">${d.pkWinner==='split'?'Chia đôi pot!':wp?(wp.av||'')+' '+wp.name+' thắng!':'...'}</div>
      ${winnerHand?`<div style="font-size:14px;color:#c4b5fd;font-weight:700">${pkHandName[winnerHand.eval.rank]||''}</div>`:''}
      <div style="font-size:14px;color:#fbbf24">+${pot.toLocaleString()} 🪙</div>
      ${role==='host'?`<button class="btn btn-p" onclick="pkDeal2()" style="max-width:180px;border-radius:10px">🔄 Ván mới</button>`:`<div style="font-size:12px;color:var(--muted)">Chờ host...</div>`}
    </div>`;
  }

  // ── Start / waiting ──
  if(phase==='waiting'){
    html+=`<div style="background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="font-size:14px;font-weight:800;text-align:center">♠️ Texas Hold'em</div>
      <div style="font-size:12px;color:var(--muted2);line-height:1.8">
        🃏 Mỗi người <b>2 lá bài riêng</b> + 5 lá bài chung<br>
        📌 <b>D (Dealer) = SB</b> đánh trước pre-flop, sau sau flop<br>
        📌 <b>BB</b> đánh sau pre-flop, đánh trước từ flop<br>
        🏆 Bài mạnh nhất từ 5 lá trong 7 lá thắng pot
      </div>
      ${pids.length>=2&&role==='host'?`<button class="btn btn-p" onclick="pkDeal2()" style="border-radius:10px">♠️ Phát bài — Bắt đầu!</button>`:`<div style="text-align:center;font-size:13px;color:var(--muted2)">${role==='host'?'⏳ Cần ít nhất 2 người...':'⏳ Chờ host bắt đầu...'}</div>`}
    </div>`;
  }

  wrap.innerHTML=html;
}

// ── Poker game logic ──
// pkDealer: index of dealer (rotates each hand)
// pkStreetActed: {pid: true} — who has acted this street
// pkBet: current bet level (everyone must match this to continue)

window.pkFold2=async function(){
  if(!room)return;const h=me();
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  if(d.pkPhase!=='playing'||d.pkTurn!==h.id)return;
  await update(ref(db,`rooms/${room}`),{[`pkPlayers/${h.id}/folded`]:true,[`pkStreetActed/${h.id}`]:true});
  if(role==='host')await pkNext2();
  else{const sn2=await get(ref(db,`rooms/${room}`));await pkHostCheck(sn2.val());}
};

window.pkCheck2=async function(){
  if(!room)return;const h=me();
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  if(d.pkPhase!=='playing'||d.pkTurn!==h.id)return;
  if((d.pkBet||0)>(d.pkPlayers?.[h.id]?.bet||0)){showToast('⚠️ Phải call trước!');return}
  await update(ref(db,`rooms/${room}`),{[`pkStreetActed/${h.id}`]:true});
  if(role==='host')await pkNext2();
  else{const sn2=await get(ref(db,`rooms/${room}`));await pkHostCheck(sn2.val());}
};

window.pkCall2=async function(){
  if(!room)return;const h=me();
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  if(d.pkPhase!=='playing'||d.pkTurn!==h.id)return;
  const p=d.pkPlayers?.[h.id]||{};
  const toCall=Math.min(Math.max(0,(d.pkBet||0)-(p.bet||0)),p.chips||0);
  const upd={[`pkStreetActed/${h.id}`]:true};
  if(toCall>0){upd[`pkPlayers/${h.id}/chips`]=(p.chips||0)-toCall;upd[`pkPlayers/${h.id}/bet`]=(p.bet||0)+toCall;upd.pkPot=(d.pkPot||0)+toCall;}
  if((p.chips||0)-toCall<=0)upd[`pkPlayers/${h.id}/allin`]=true;
  await update(ref(db,`rooms/${room}`),upd);
  if(role==='host')await pkNext2();
  else{const sn2=await get(ref(db,`rooms/${room}`));await pkHostCheck(sn2.val());}
};

// pkRaise2 replaced by pkOpenRaise/pkConfirmRaise

window.pkOpenRaise=function(minAmt){
  pkRaiseMode=true;
  pkRaiseAmt=minAmt;
  if(liveD)renderPK(liveD,room);
};
window.pkCancelRaise=function(){
  pkRaiseMode=false;pkRaiseAmt=0;
  if(liveD)renderPK(liveD,room);
};
window.pkSetRaise=function(v){
  pkRaiseAmt=parseInt(v)||0;
  const el=document.querySelector('[id="pkRangeIn"]');
  // Update displayed amount
  const amtEl=el?.parentElement?.nextElementSibling;
  if(amtEl)amtEl.textContent=pkRaiseAmt+' 🪙';
  const btnEl=document.querySelector('[onclick="pkConfirmRaise()"]');
  if(btnEl)btnEl.textContent='✅ Xác nhận Raise '+pkRaiseAmt+' 🪙';
};
window.pkConfirmRaise=async function(){
  if(!room||!pkRaiseAmt)return;
  const h=me();
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  if(d.pkPhase!=='playing'||d.pkTurn!==h.id){pkRaiseMode=false;pkRaiseAmt=0;return}
  const p=d.pkPlayers?.[h.id]||{};const bb=d.pkBigBlind||20;
  const targetTotal=Math.max(pkRaiseAmt,Math.max((d.pkBet||bb)*2,bb*2));
  const addAmt=Math.min(Math.max(0,targetTotal-(p.bet||0)),p.chips||0);
  if(addAmt<=0){showToast('⚠️ Không đủ chips!');return}
  const upd={
    pkBet:(p.bet||0)+addAmt,pkPot:(d.pkPot||0)+addAmt,
    pkStreetActed:{}, // reset - everyone must respond
    [`pkPlayers/${h.id}/chips`]:(p.chips||0)-addAmt,
    [`pkPlayers/${h.id}/bet`]:(p.bet||0)+addAmt,
    [`pkStreetActed/${h.id}`]:true
  };
  if((p.chips||0)-addAmt<=0)upd[`pkPlayers/${h.id}/allin`]=true;
  pkRaiseMode=false;pkRaiseAmt=0;
  await update(ref(db,`rooms/${room}`),upd);
  if(role==='host')await pkNext2();
  else{const sn2=await get(ref(db,`rooms/${room}`));await pkHostCheck(sn2.val());}
};
window.pkAllIn2=async function(){
  if(!room)return;const h=me();
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  if(d.pkPhase!=='playing'||d.pkTurn!==h.id)return;
  const p=d.pkPlayers?.[h.id]||{};const chips=p.chips||0;
  if(!chips){showToast('⚠️ Đã hết chips!');return}
  const newBet=(p.bet||0)+chips,wasRaise=newBet>(d.pkBet||0);
  const upd={[`pkPlayers/${h.id}/chips`]:0,[`pkPlayers/${h.id}/bet`]:newBet,[`pkPlayers/${h.id}/allin`]:true,
    pkPot:(d.pkPot||0)+chips,[`pkStreetActed/${h.id}`]:true};
  if(wasRaise){upd.pkBet=newBet;upd.pkStreetActed={};upd[`pkStreetActed/${h.id}`]=true;}
  await update(ref(db,`rooms/${room}`),upd);
  if(role==='host')await pkNext2();
  else{const sn2=await get(ref(db,`rooms/${room}`));await pkHostCheck(sn2.val());}
};

// Guest triggers host to advance game (via special signal field)
async function pkHostCheck(d){
  if(!room||!d)return;
  // Signal host to call pkNext2 (host listens via onValue and handles AI/logic)
  await update(ref(db,`rooms/${room}`),{pkNeedAdvance:Date.now()});
}

async function pkNext2(){
  if(!room||role!=='host')return;
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  if(!d||d.pkPhase!=='playing')return;
  const players=d.pkPlayers||{},pids=Object.keys(players);
  const notFolded=pids.filter(pid=>!players[pid].folded);

  // Only 1 left → wins immediately
  if(notFolded.length<=1){
    const winner=notFolded[0]||pids[0];
    await update(ref(db,`rooms/${room}`),{
      pkPhase:'showdown',pkWinner:winner,pkNeedAdvance:null,
      [`pkPlayers/${winner}/chips`]:(players[winner]?.chips||0)+(d.pkPot||0)
    });return;
  }

  // All active players have acted AND bets are equal → end street
  const active=notFolded.filter(pid=>!players[pid].allin);
  const maxBet=Math.max(0,...notFolded.map(pid=>players[pid].bet||0));
  const betsEqual=active.length===0||active.every(pid=>(players[pid].bet||0)>=maxBet);
  const acted=d.pkStreetActed||{};
  const allActed=active.every(pid=>acted[pid]||players[pid].allin);

  if(betsEqual&&allActed){
    await pkDealStreet(d,players,pids,notFolded);return;
  }

  // Advance to next active player
  const cur=d.pkTurn,ci=pids.indexOf(cur);
  let next=pids[(ci+1)%pids.length],tries=0;
  while(tries<pids.length&&(players[next]?.folded||players[next]?.allin)){
    next=pids[(pids.indexOf(next)+1)%pids.length];tries++;
  }
  await update(ref(db,`rooms/${room}`),{pkTurn:next,pkNeedAdvance:null});
}

async function pkDealStreet(d,players,pids,notFolded){
  const deck=[...(d.pkDeck||[])],com=[...(d.pkCommunity||[])],rnd=d.pkRound||'preflop';
  let nextRound,newCards=[];
  const dealer=d.pkDealer||0;
  const bbId=pids[(dealer+1)%pids.length]; // BB acts first post-flop

  if(rnd==='preflop'){newCards=[deck.pop(),deck.pop(),deck.pop()];nextRound='flop'}
  else if(rnd==='flop'){newCards=[deck.pop()];nextRound='turn'}
  else if(rnd==='turn'){newCards=[deck.pop()];nextRound='river'}
  else{
    // River → Showdown: find best hand
    let bestPids=[notFolded[0]],bestEv=pkBestHand([...(players[notFolded[0]]?.hand||[]),...com]).eval;
    notFolded.slice(1).forEach(pid=>{
      const ev=pkBestHand([...(players[pid]?.hand||[]),...com]).eval;
      const cmp=ev.rank-bestEv.rank||compareTb(ev.tb,bestEv.tb);
      if(cmp>0){bestEv=ev;bestPids=[pid]}
      else if(cmp===0)bestPids.push(pid); // tie
    });
    const isTie=bestPids.length>1;
    const winner=isTie?'split':bestPids[0];
    const upd={pkPhase:'showdown',pkRound:'showdown',pkWinner:winner,pkNeedAdvance:null};
    if(isTie){
      const share=Math.floor((d.pkPot||0)/bestPids.length);
      bestPids.forEach(pid=>{upd[`pkPlayers/${pid}/chips`]=(players[pid]?.chips||0)+share});
    }else{
      upd[`pkPlayers/${winner}/chips`]=(players[winner]?.chips||0)+(d.pkPot||0);
    }
    await update(ref(db,`rooms/${room}`),upd);return;
  }
  // New street: reset bets, BB acts first post-flop
  const upd={pkCommunity:[...com,...newCards],pkDeck:deck,pkRound:nextRound,pkBet:0,pkStreetActed:{},pkNeedAdvance:null};
  pids.forEach(pid=>{upd[`pkPlayers/${pid}/bet`]=0});
  // Post-flop: BB (non-dealer) acts first
  const firstAct=pids.find(pid=>pid===bbId&&!players[pid]?.folded&&!players[pid]?.allin)
    ||pids.find(pid=>!players[pid]?.folded&&!players[pid]?.allin)||pids[0];
  upd.pkTurn=firstAct;
  await update(ref(db,`rooms/${room}`),upd);
}

window.pkDeal2=async function(){
  if(!room||role!=='host')return;
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  const pids=Object.keys(d.pkPlayers||{});
  if(pids.length<2){showToast('⚠️ Cần ít nhất 2 người!');return}
  // Build + shuffle 52-card deck
  const deck=[];
  for(const r of PK_RANKS)for(const s of['♠','♣','♦','♥'])deck.push(r+s);
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
  const prevDealer=d.pkDealer||0;
  const newDealer=(prevDealer+1)%pids.length; // rotate dealer each hand
  const sbIdx=newDealer,bbIdx=(newDealer+1)%pids.length;
  const sbId=pids[sbIdx],bbId=pids[bbIdx];
  const bb=d.pkBigBlind||20,sb=Math.max(1,Math.floor(bb/2));
  // Reset all players
  const players={};
  pids.forEach(pid=>{
    const old=d.pkPlayers[pid]||{};
    players[pid]={...old,hand:[deck.pop(),deck.pop()],bet:0,folded:false,allin:false};
  });
  // Post blinds (deduct from chips)
  const sbChips=players[sbId].chips||500,bbChips=players[bbId].chips||500;
  const sbPost=Math.min(sb,sbChips),bbPost=Math.min(bb,bbChips);
  players[sbId].bet=sbPost;players[sbId].chips=sbChips-sbPost;
  players[bbId].bet=bbPost;players[bbId].chips=bbChips-bbPost;
  if(players[sbId].chips<=0)players[sbId].allin=true;
  if(players[bbId].chips<=0)players[bbId].allin=true;
  // Pre-flop: SB (dealer) acts first; BB already acted by posting
  const preActed={[bbId]:true};
  await update(ref(db,`rooms/${room}`),{
    pkPlayers:players,pkDeck:deck,pkPhase:'playing',pkCommunity:[],
    pkPot:sbPost+bbPost,pkBet:bb,pkRound:'preflop',
    pkTurn:sbId,pkDealer:newDealer,pkStreetActed:preActed,pkWinner:null,pkNeedAdvance:null
  });
};

// AI for Poker
async function aiPK(d,id){
  if(!room||d.pkTurn!==AI||d.pkPhase!=='playing')return;
  const p=d.pkPlayers?.[AI]||{};if(p.folded||p.allin)return;
  const hand=p.hand||[],com=d.pkCommunity||[];
  let strength=0;
  if(hand.length>=2){
    const res=com.length>=3?pkBestHand([...hand,...com]).eval:pkEval5(hand.length>=5?hand:[...hand,...com.slice(0,3)]);
    strength=res.rank>=0?res.rank:0;
  }
  const bb=d.pkBigBlind||20,toCall=Math.max(0,(d.pkBet||0)-(p.bet||0));
  const rng=Math.random();
  let action;
  if(strength>=6)action=rng<0.7?'raise':'call';
  else if(strength>=4)action=rng<0.5?'call':rng<0.7?'check':'fold';
  else if(strength>=2)action=rng<0.4?'call':'fold';
  else action=rng<0.15?'call':'fold';
  if(toCall===0&&action==='fold')action='check';
  if((p.chips||0)<=0)action='allin';
  const upd={[`pkStreetActed/${AI}`]:true};
  if(action==='fold'){upd[`pkPlayers/${AI}/folded`]=true}
  else if(action==='check'){}
  else if(action==='call'){const pay=Math.min(toCall,p.chips||0);upd[`pkPlayers/${AI}/chips`]=(p.chips||0)-pay;upd[`pkPlayers/${AI}/bet`]=(p.bet||0)+pay;upd.pkPot=(d.pkPot||0)+pay;if((p.chips||0)-pay<=0)upd[`pkPlayers/${AI}/allin`]=true}
  else if(action==='raise'){const nl=Math.max((d.pkBet||bb)*2,bb*2);const add=Math.min(nl-(p.bet||0),p.chips||0);if(add>0){upd[`pkPlayers/${AI}/chips`]=(p.chips||0)-add;upd[`pkPlayers/${AI}/bet`]=(p.bet||0)+add;upd.pkBet=(p.bet||0)+add;upd.pkPot=(d.pkPot||0)+add;upd.pkStreetActed={};upd[`pkStreetActed/${AI}`]=true;if((p.chips||0)-add<=0)upd[`pkPlayers/${AI}/allin`]=true}}
  await update(ref(db,`rooms/${id}`),upd);
  await pkNext2();
}


// ── CHẴN LẺ ──
// Người tạo nắm xu (1-10), người kia đoán chẵn/lẻ
function renderCL(d,id){
  const h=me();
  if(!document.getElementById('clw')){
    document.getElementById('garea').innerHTML='<div class="gtop"><div class="gtitle">🎰 Chẵn Lẻ <span class="cbadge" onclick="copyL(location.href)">#'+id+'</span></div><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div><div id="clw" style="width:100%;max-width:460px;display:flex;flex-direction:column;gap:12px;padding-bottom:24px"></div>';
  }
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();
  let wrap=document.getElementById('clw');if(!wrap)return;
  const isHost=role==='host',phase=d.clPhase||'bet';
  const bets=d.clBets||{},wallets=d.clWallets||{};
  const myW=wallets[h.id]||1000;
  const myBet=bets[h.id]||{};
  const hn=(d.hav||'')+(d.hn||'Host'),gn=d.gnm?(d.gav||'')+(d.gnm):'Chờ...';
  const CL_CHIPS=[5,10,20,50,100];
  let selectedAmt=d.clSelectedAmt||50;
  let html='';

  // Score strip
  const walletH=wallets[d.hid]||1000,walletG=wallets[d.gid]||1000;
  html+=`<div style="display:flex;gap:8px">
    <div style="flex:1;background:var(--s1);border:1.5px solid var(--purple);border-radius:12px;padding:12px;text-align:center">
      <div style="font-size:11px;color:var(--muted2);margin-bottom:2px">${hn}</div>
      <div style="font-size:20px;font-weight:900;color:var(--gold)">${walletH.toLocaleString()} 🪙</div>
    </div>
    <div style="flex:1;background:var(--s1);border:1.5px solid var(--pink);border-radius:12px;padding:12px;text-align:center">
      <div style="font-size:11px;color:var(--muted2);margin-bottom:2px">${gn}</div>
      <div style="font-size:20px;font-weight:900;color:var(--gold)">${walletG.toLocaleString()} 🪙</div>
    </div>
  </div>`;

  if(phase==='bet'){
    if(isHost){
      // Host: pick a number 1-10
      html+=`<div style="background:var(--s1);border:1.5px solid var(--purple);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:14px;text-align:center">
        <div style="font-size:15px;font-weight:800">🤜 Bạn nắm xu</div>
        <div style="font-size:13px;color:var(--muted2)">Chọn số xu nắm (1–10), đối thủ đoán chẵn/lẻ</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          ${Array.from({length:10},(_,i)=>i+1).map(n=>`<button onclick="clSetSecret(${n})" style="width:48px;height:48px;border-radius:50%;background:${d.clSecret===n?'var(--purple)':'var(--s3)'};border:2px solid ${d.clSecret===n?'var(--purple)':'var(--b2)'};color:${d.clSecret===n?'#fff':'var(--text)'};font-size:16px;font-weight:900;cursor:pointer;font-family:inherit;transition:all .15s">${n}</button>`).join('')}
        </div>
        ${d.clSecret?`<div style="font-size:13px;color:var(--purple);font-weight:700">Đang nắm: ${d.clSecret} xu</div>`:''}
        ${d.clSecret&&bets[d.gid]!=null?`<button class="btn btn-p" onclick="clReveal()" style="border-radius:12px">🤚 Mở bàn tay!</button>`:''}
        ${d.clSecret&&!bets[d.gid]?`<div style="font-size:12px;color:var(--muted2)">⏳ Chờ đối thủ đoán...</div>`:''}
      </div>`;
    } else {
      // Guest: choose amount then pick chan/le
      const guestBet=bets[h.id];
      html+=`<div style="background:var(--s1);border:1.5px solid var(--pink);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:14px;text-align:center">
        <div style="font-size:15px;font-weight:800">🤔 Bạn đoán</div>
        <div style="font-size:13px;color:var(--muted2)">Chọn số cược rồi đoán chẵn hay lẻ</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
          ${CL_CHIPS.map(v=>`<button onclick="clPickAmt(${v})" style="padding:8px 14px;border-radius:99px;border:2px solid ${selectedAmt===v?'var(--gold)':'var(--b2)'};background:${selectedAmt===v?'rgba(251,191,36,.15)':'var(--s3)'};color:${selectedAmt===v?'var(--gold)':'var(--text)'};font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;transition:all .15s">${v}</button>`).join('')}
          <button onclick="clPickAmt(${myW})" style="padding:8px 14px;border-radius:99px;border:2px solid ${selectedAmt===myW?'var(--gold)':'var(--b2)'};background:${selectedAmt===myW?'rgba(251,191,36,.15)':'var(--s3)'};color:${selectedAmt===myW?'var(--gold)':'var(--text)'};font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;transition:all .15s">All-in (${myW})</button>
        </div>
        <div style="display:flex;gap:10px;justify-content:center">
          ${[{v:'chan',l:'CHẴN',s:'2, 4, 6, 8, 10'},{v:'le',l:'LẺ',s:'1, 3, 5, 7, 9'}].map(opt=>`<button onclick="clBet('${opt.v}')" style="flex:1;padding:18px 10px;border:2px solid ${guestBet===opt.v?'var(--green)':'var(--b2)'};background:${guestBet===opt.v?'rgba(16,185,129,.2)':'var(--s2)'};color:${guestBet===opt.v?'var(--green)':'var(--text)'};border-radius:14px;font-size:17px;font-weight:900;cursor:pointer;font-family:inherit;transition:all .2s" ${guestBet!=null?'disabled':''}>${opt.l}<div style="font-size:11px;font-weight:400;margin-top:4px;color:var(--muted2)">${opt.s}</div></button>`).join('')}
        </div>
        ${guestBet!=null?`<div style="font-size:13px;color:var(--green);font-weight:700">✅ Đã đoán: ${guestBet==='chan'?'CHẴN':'LẺ'} — Cược: ${d.clBetAmt||selectedAmt} 🪙</div>`:''}
        ${guestBet!=null?`<div style="font-size:12px;color:var(--muted2)">Chờ host mở bàn tay...</div>`:''}
      </div>`;
    }
  }

  if(phase==='result'){
    const secret=d.clSecret||0;
    const isChan=secret%2===0;
    const guestChoice=bets[d.gid];
    const guestWin=guestChoice===(isChan?'chan':'le');
    const betAmt=d.clBetAmt||50;
    const iw=(guestWin&&!isHost)||(!guestWin&&isHost);
    html+=`<div style="background:${iw?'rgba(16,185,129,.08)':'rgba(239,68,68,.05)'};border:2px solid ${iw?'var(--green)':'var(--red)'};border-radius:16px;padding:24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;width:100%">
      <div style="font-size:64px">🤚</div>
      <div style="font-size:28px;font-weight:900">Trong tay: <span style="color:var(--gold)">${secret} xu</span></div>
      <div style="font-size:18px;font-weight:700;color:${isChan?'var(--purple)':'var(--pink)'}">${isChan?'CHẴN ✓':'LẺ ✓'}</div>
      <div style="display:flex;gap:20px">
        <div style="text-align:center"><div style="font-size:12px;color:var(--muted2)">${hn}</div><div style="font-size:15px;font-weight:700;color:${!guestWin?'var(--green)':'var(--red)'}">${!guestWin?'🏆 Thắng':'😢 Thua'}</div></div>
        <div style="text-align:center"><div style="font-size:12px;color:var(--muted2)">${gn}</div><div style="font-size:15px;font-weight:700;color:${guestWin?'var(--green)':'var(--red)'}">${guestWin?'🏆 Thắng':'😢 Thua'}</div></div>
      </div>
      <div style="font-size:14px;color:var(--muted2)">Số tiền đổi chủ: ${betAmt.toLocaleString()} 🪙</div>
      ${isHost?`<button class="btn btn-p" onclick="clNext()" style="border-radius:12px;max-width:200px">Ván tiếp →</button>`:`<div style="font-size:12px;color:var(--muted)">Chờ host...</div>`}
    </div>`;
  }

  wrap.innerHTML=html;
}

window.clSetSecret=async function(n){if(!room||role!=='host')return;await update(ref(db,`rooms/${room}`),{clSecret:n})};
window.clPickAmt=async function(v){if(!room)return;await update(ref(db,`rooms/${room}`),{clSelectedAmt:v})};
window.clBet=async function(choice){
  if(!room)return;const h=me();
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  if(d?.clBets?.[h.id]!=null)return;
  const amt=d?.clSelectedAmt||50;
  const wallet=d?.clWallets?.[h.id]||1000;
  const betAmt=Math.min(amt,wallet);
  await update(ref(db,`rooms/${room}`),{[`clBets/${h.id}`]:choice,clBetAmt:betAmt});
  showToast(choice==='chan'?'✅ CHẴN!':'✅ LẺ!');
};
window.clReveal=async function(){
  if(!room||role!=='host')return;
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  const secret=d.clSecret||0,isChan=secret%2===0;
  const guestBet=d.clBets?.[d.gid];const guestWin=guestBet===(isChan?'chan':'le');
  const wallets={...(d.clWallets||{})};
  const betAmt=d.clBetAmt||50;
  if(guestWin){
    wallets[d.gid]=Math.min(9999,(wallets[d.gid]||1000)+betAmt);
    wallets[d.hid]=Math.max(0,(wallets[d.hid]||1000)-betAmt);
  }else{
    wallets[d.hid]=Math.min(9999,(wallets[d.hid]||1000)+betAmt);
    wallets[d.gid]=Math.max(0,(wallets[d.gid]||1000)-betAmt);
  }
  await update(ref(db,`rooms/${room}`),{clPhase:'result',clResult:true,clWallets:wallets});
};
window.clNext=async function(){if(!room||role!=='host')return;await update(ref(db,`rooms/${room}`),{clPhase:'bet',clBets:{},clSecret:null,clResult:null,clBetAmt:null})};


// ── XÚC XẮC CHIẾN ──
function renderXX(d,id){
  const h=me();
  if(!document.getElementById('xxw')){
    document.getElementById('garea').innerHTML='<div class="gtop"><div class="gtitle">🎲 Xúc Xắc Chiến <span class="cbadge" onclick="copyL(window.location.href)">#'+id+'</span></div><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div><div id="xxw" style="width:100%;max-width:420px;display:flex;flex-direction:column;gap:14px;align-items:center;padding-bottom:24px"></div>';
  }
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();
  const wrap=document.getElementById('xxw');if(!wrap)return;
  const hn=(d.hav||'')+(d.hn||'Host'),gn=d.gnm?(d.gav||'')+(d.gnm):'Chờ...';
  const sc=d.xxScore||{h:0,g:0},dice=d.xxDice||{},phase=d.xxPhase||'ready',round=d.xxRound||1;
  const DF=['','⚀','⚁','⚂','⚃','⚄','⚅'];
  const myDie=dice[h.id],hDie=dice[d.hid],gDie=dice[d.gid];
  let html=`<div style="width:100%;background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:16px;text-align:center">
    <div style="font-size:12px;color:var(--muted2);margin-bottom:10px">Ván ${round} · Cao hơn thắng</div>
    <div style="display:flex;justify-content:space-around;align-items:center">
      <div><div style="font-size:13px;font-weight:700;color:var(--purple)">${hn}</div><div style="font-size:40px;font-weight:900">${sc.h||0}</div></div>
      <div style="font-size:18px;color:var(--muted)">VS</div>
      <div><div style="font-size:13px;font-weight:700;color:var(--pink)">${gn}</div><div style="font-size:40px;font-weight:900">${sc.g||0}</div></div>
    </div>
  </div>`;
  if(phase==='ready'||phase==='rolled'){
    const myDiceEl=myDie?`<div style="font-size:72px">${DF[myDie]}</div><div style="font-size:13px;color:var(--gold)">Bạn: ${myDie} điểm</div>`:`<button class="btn btn-y" onclick="xxRoll()" style="max-width:200px;border-radius:12px;padding:16px;font-size:16px">🎲 Lắc xúc xắc!</button>`;
    html+=`<div style="width:100%;background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:24px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
      ${myDiceEl}
      ${myDie&&!gDie?'<div style="font-size:13px;color:var(--muted2)">✅ Đã lắc — Chờ đối thủ...</div>':''}
      ${!myDie&&gDie?'<div style="font-size:13px;color:var(--yellow);font-weight:600">⚡ Đối thủ đã lắc rồi!</div>':''}
    </div>`;
  }
  if(phase==='result'){
    const w=d.xxWinner,iw=w===role;
    html+=`<div style="background:${iw?'rgba(16,185,129,.1)':'var(--s1)'};border:1.5px solid ${iw?'var(--green)':'var(--b1)'};border-radius:14px;padding:24px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;width:100%">
      <div style="display:flex;gap:24px;justify-content:center;align-items:center">
        <div><div style="font-size:12px;color:var(--muted2)">${hn}</div><div style="font-size:56px">${DF[hDie]||'?'}</div><div style="font-size:14px;font-weight:700;color:${w==='host'?'var(--green)':'var(--muted2)'}">${hDie||'?'} điểm</div></div>
        <div style="font-size:20px;color:var(--muted)">VS</div>
        <div><div style="font-size:12px;color:var(--muted2)">${gn}</div><div style="font-size:56px">${DF[gDie]||'?'}</div><div style="font-size:14px;font-weight:700;color:${w==='guest'?'var(--green)':'var(--muted2)'}">${gDie||'?'} điểm</div></div>
      </div>
      <div style="font-size:20px;font-weight:900;color:${w==='draw'?'var(--muted2)':iw?'var(--green)':'var(--red)'}">${w==='draw'?'🤝 Hòa!':iw?'🏆 Bạn thắng!':'😢 Thua rồi!'}</div>
      ${role==='host'?`<button class="btn btn-p" onclick="xxNext()" style="max-width:200px">Ván tiếp →</button>`:`<div style="font-size:12px;color:var(--muted)">Chờ host...</div>`}
    </div>`;
  }
  wrap.innerHTML=html;
}
window.xxRoll=async function(){
  if(!room)return;const h=me();
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  if(d.xxDice?.[h.id]){showToast('⚠️ Đã lắc rồi!');return}
  const val=Math.ceil(Math.random()*6);
  await update(ref(db,`rooms/${room}`),{[`xxDice/${h.id}`]:val,xxPhase:'rolled'});
  const sn2=await get(ref(db,`rooms/${room}`));const d2=sn2.val();
  const dice=d2.xxDice||{};
  if(dice[d2.hid]&&dice[d2.gid]){
    const hV=dice[d2.hid],gV=dice[d2.gid];
    const w=hV>gV?'host':gV>hV?'guest':'draw';
    const sc={...(d2.xxScore||{h:0,g:0})};
    if(w==='host')sc.h=(sc.h||0)+1;else if(w==='guest')sc.g=(sc.g||0)+1;
    await update(ref(db,`rooms/${room}`),{xxPhase:'result',xxWinner:w,xxScore:sc});
  }
};
window.xxNext=async function(){
  if(!room||role!=='host')return;
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  await update(ref(db,`rooms/${room}`),{xxPhase:'ready',xxDice:{},xxWinner:null,xxRound:(d.xxRound||1)+1});
};

// ── PHẢN XẠ ──
let pxTimer=null;
function renderPX(d,id){
  const h=me();
  if(!document.getElementById('pxw')){
    document.getElementById('garea').innerHTML='<div class="gtop"><div class="gtitle">⚡ Phản Xạ <span class="cbadge" onclick="copyL(window.location.href)">#'+id+'</span></div><button class="btn btn-d btn-sm" onclick="leaveRoom()">Thoát</button></div><div id="pxw" style="width:100%;max-width:420px;display:flex;flex-direction:column;gap:14px;align-items:center;padding-bottom:24px"></div>';
  }
  if(d.status==='waiting'){if(!document.getElementById('wbox'))mkW(id);return}rmW();
  const wrap=document.getElementById('pxw');if(!wrap)return;
  const hn=(d.hav||'')+(d.hn||'Host'),gn=d.gnm?(d.gav||'')+(d.gnm):'Chờ...';
  const sc=d.pxScore||{h:0,g:0},phase=d.pxPhase||'waiting',round=d.pxRound||1;
  let html=`<div style="width:100%;background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:14px;text-align:center">
    <div style="font-size:12px;color:var(--muted2);margin-bottom:8px">Ván ${round} · Bấm nhanh nhất khi đèn xanh!</div>
    <div style="display:flex;justify-content:space-around">
      <div><div style="font-size:13px;font-weight:700">${hn}</div><div style="font-size:36px;font-weight:900;color:var(--purple)">${sc.h||0}</div></div>
      <div style="font-size:18px;color:var(--muted);align-self:center">VS</div>
      <div><div style="font-size:13px;font-weight:700">${gn}</div><div style="font-size:36px;font-weight:900;color:var(--pink)">${sc.g||0}</div></div>
    </div>
  </div>`;
  if(phase==='waiting'){
    html+=role==='host'?`<button class="btn btn-p" onclick="pxStart()" style="max-width:200px;border-radius:12px">▶️ Bắt đầu!</button>`:`<div style="font-size:13px;color:var(--muted2)">⏳ Chờ host bắt đầu...</div>`;
  }
  if(phase==='ready'){
    html+=`<div style="width:100%;background:var(--s2);border:2px solid var(--b2);border-radius:16px;padding:32px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px">
      <div style="font-size:64px">🔴</div>
      <div style="font-size:16px;font-weight:700;color:var(--muted2)">Chờ đèn xanh...</div>
      <div style="font-size:12px;color:var(--muted)">Đừng bấm sớm!</div>
    </div>`;
  }
  if(phase==='go'){
    const myClicked=d.pxClicked?.[h.id];
    html+=`<div onclick="${!myClicked?'pxClick()':''}" style="width:100%;background:${myClicked?'rgba(16,185,129,.2)':'var(--green)'};border:2px solid var(--green);border-radius:16px;padding:32px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px;cursor:${myClicked?'default':'pointer'};transition:all .1s;-webkit-tap-highlight-color:transparent;user-select:none">
      <div style="font-size:64px">${myClicked?'✅':'🟢'}</div>
      <div style="font-size:${myClicked?16:20}px;font-weight:${myClicked?700:900};color:${myClicked?'var(--green)':'#000'}">${myClicked?'Đã bấm!':'BẤM NGAY!'}</div>
    </div>`;
  }
  if(phase==='result'){
    const w=d.pxWinner,iw=w===role;
    const t=d.pxTime;
    html+=`<div style="background:${iw?'rgba(16,185,129,.1)':'var(--s1)'};border:1.5px solid ${iw?'var(--green)':'var(--b1)'};border-radius:14px;padding:24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;width:100%">
      <div style="font-size:48px">${w==='draw'?'🤝':iw?'🏆':'😢'}</div>
      <div style="font-size:20px;font-weight:900;color:${w==='draw'?'var(--muted2)':iw?'var(--green)':'var(--red)'}">${w==='draw'?'Hòa!':iw?'Bạn nhanh hơn!':'Đối thủ nhanh hơn!'}</div>
      ${t?`<div style="font-size:13px;color:var(--muted2)">Chênh lệch: ${t}ms</div>`:''}
      ${role==='host'?`<button class="btn btn-p" onclick="pxNext()" style="max-width:200px">Ván tiếp →</button>`:`<div style="font-size:12px;color:var(--muted)">Chờ host...</div>`}
    </div>`;
  }
  wrap.innerHTML=html;
}
window.pxStart=async function(){
  if(!room||role!=='host')return;
  await update(ref(db,`rooms/${room}`),{pxPhase:'ready',pxClicked:{},pxWinner:null,pxStartTime:null});
  // Random delay 1.5-4s then go signal
  if(pxTimer)clearTimeout(pxTimer);
  pxTimer=setTimeout(async()=>{
    const t=Date.now();
    await update(ref(db,`rooms/${room}`),{pxPhase:'go',pxStartTime:t});
  },1500+Math.random()*2500);
};
window.pxClick=async function(){
  if(!room)return;const h=me();
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  if(d.pxPhase!=='go'){showToast('⚠️ Quá sớm!');return}
  if(d.pxClicked?.[h.id]){return}
  const clickTime=Date.now()-((d.pxStartTime)||Date.now());
  await update(ref(db,`rooms/${room}`),{[`pxClicked/${h.id}`]:clickTime});
  const sn2=await get(ref(db,`rooms/${room}`));const d2=sn2.val();
  const cl=d2.pxClicked||{};
  if(cl[d2.hid]!=null&&cl[d2.gid]!=null){
    const hT=cl[d2.hid],gT=cl[d2.gid];
    const w=hT<gT?'host':gT<hT?'guest':'draw';
    const diff=Math.abs(hT-gT);
    const sc={...(d2.pxScore||{h:0,g:0})};
    if(w==='host')sc.h=(sc.h||0)+1;else if(w==='guest')sc.g=(sc.g||0)+1;
    await update(ref(db,`rooms/${room}`),{pxPhase:'result',pxWinner:w,pxScore:sc,pxTime:diff});
  }
};
window.pxNext=async function(){
  if(!room||role!=='host')return;
  const sn=await get(ref(db,`rooms/${room}`));const d=sn.val();
  await update(ref(db,`rooms/${room}`),{pxPhase:'waiting',pxClicked:{},pxWinner:null,pxRound:(d.pxRound||1)+1,pxStartTime:null});
};

// ── CHAT & UTILS ──
function listenChat(id){if(cU){try{off(ref(db,`chats/${id}`))}catch(e){}cU=null}cU=onValue(ref(db,`chats/${id}`),snap=>{const msgs=snap.val()||{};const box=document.getElementById('cmsgs');const h=me();box.innerHTML=Object.values(msgs).sort((a,b)=>a.ts-b.ts).map(m=>{if(m.sys)return`<div class="csys">${m.txt}</div>`;const im=m.uid===h.id;return`<div class="cmsg${im?' me':''}"><div class="cmh"><span style="font-size:13px">${m.av||'😊'}</span><span class="cmn${im?' me':''}">${m.name}</span></div><div class="cmb">${esc(m.txt)}</div></div>`}).join('');box.scrollTop=box.scrollHeight})}
function sysMsg(txt){if(!room)return;push(ref(db,`chats/${room}`),{sys:true,txt,ts:Date.now()})}
window.sendChat=function(){const inp=document.getElementById('cinput');const txt=inp.value.trim();if(!txt||!room)return;inp.value='';const h=me();push(ref(db,`chats/${room}`),{uid:h.id,name:h.name,av:h.av,txt,ts:Date.now()})};
window.leaveRoom=async function(){if(window.tlLeaveSeat)await window.tlLeaveSeat();if(cTmr){clearInterval(cTmr);cTmr=null}if(xTmr){clearInterval(xTmr);xTmr=null}if(gU&&room){try{off(ref(db,`rooms/${room}`))}catch(e){}gU=null}if(cU&&room){try{off(ref(db,`chats/${room}`))}catch(e){}cU=null}if(room&&role==='host')await remove(ref(db,`rooms/${room}`));leaveLocal()};
function leaveLocal(){room=null;role=null;ctSel=null;ctMoves=[];cLast=null;if(window._caroResize)window.removeEventListener('resize',window._caroResize);resetA();history.replaceState(null,'',location.pathname);document.getElementById('ovl').classList.remove('on');showH()}
window.copyL=function(l){navigator.clipboard.writeText(l).then(()=>showToast('✅ Đã copy!')).catch(()=>showToast('📋 '+l))};
function init(){onValue(ref(db,'rooms'),snap=>{const all=snap.val()||{},open=Object.entries(all).filter(([,v])=>v.status==='waiting'&&v.pub);const el=document.getElementById('rlist');if(!open.length){el.innerHTML='<div class="empty">Chưa có phòng nào</div>';return}el.innerHTML=open.map(([id,v])=>`<div class="ritem"><div><b style="font-size:13px">${v.icon||'🎮'} ${v.gn||''} — ${v.hav||''}${v.hn||''}</b><div style="font-size:11px;color:var(--muted2)"><span style="font-family:monospace;color:var(--purple)">#${id}</span></div></div><button class="btn btn-g btn-sm" onclick="joinRoom('${id}')">Vào</button></div>`).join('')});const p=new URLSearchParams(location.search);if(p.has('room'))joinRoom(p.get('room').toUpperCase())}
window.GH_leave=()=>{if(room)window.leaveRoom()};
window.GH_inRoom=()=>!!room;
window.onHubReady=init;if(window.hubReady)init();
})();
