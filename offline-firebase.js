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
