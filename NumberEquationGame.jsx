import { useState, useEffect, useCallback, useRef, useMemo } from "react";

/* ─── DATA ──────────────────────────────────────────────── */
/* ─── MOBILE HELPERS ────────────────────────────────────── */
const vib=(p=[10])=>{try{navigator.vibrate&&navigator.vibrate(p);}catch{}};
const isMobile=()=>window.innerWidth<=520;

// Inject mobile-first CSS once
if(typeof document!=="undefined"&&!document.getElementById("ne-mobile-css")){
  const s=document.createElement("style");s.id="ne-mobile-css";
  s.textContent=`
    *{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
    body{overscroll-behavior:none;overflow-x:hidden;}
    html,body{height:100%;}
    .ne-scroll-x{overflow-x:auto;overflow-y:hidden;
      -webkit-overflow-scrolling:touch;scrollbar-width:none;}
    .ne-scroll-x::-webkit-scrollbar{display:none;}
    .ne-card-btn:active{transform:scale(0.93)!important;transition:transform 0.08s!important;}
    .ne-safe-bottom{padding-bottom:calc(60px + env(safe-area-inset-bottom,0px));}
    .ne-action-bar{
      position:fixed;bottom:0;left:0;right:0;
      padding:8px 12px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));
      background:rgba(7,9,15,0.97);backdrop-filter:blur(12px);
      border-top:1px solid rgba(255,255,255,0.08);z-index:100;
    }
    @media(min-width:521px){
      .ne-action-bar{max-width:500px;left:50%;transform:translateX(-50%);}
    }
  `;
  document.head.appendChild(s);
}

/* ─── FIREBASE SHARED LEADERBOARD ───────────────────────── */
// กรอก config จาก Firebase Console → Project settings → Web app
// ถ้าไม่มี Firebase จะใช้ localStorage แทนโดยอัตโนมัติ
const FB_CFG={
  apiKey:"YOUR_API_KEY",
  databaseURL:"https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:"YOUR_PROJECT_ID",
};
const FB_ON=FB_CFG.apiKey!=="YOUR_API_KEY";
let _fbApp=null;
if(FB_ON&&typeof firebase!=="undefined"){
  try{_fbApp=firebase.initializeApp(FB_CFG,"ne");}
  catch(e){try{_fbApp=firebase.app("ne");}catch{}}
}
const fbRef=()=>_fbApp?firebase.database(_fbApp).ref("ne_scores"):null;
const fbSave=async(entry)=>{
  const ref=fbRef();
  if(ref)try{await ref.push({...entry,ts:Date.now()});}catch(e){console.warn(e);}
  addLB(entry);
};
const fbListen=(cb)=>{
  const ref=fbRef();
  if(!ref){cb(getLB());return()=>{};}
  const h=ref.orderByChild("score").limitToLast(20).on("value",snap=>{
    const rows=[];snap.forEach(c=>rows.unshift({...c.val(),key:c.key}));
    cb(rows.slice(0,10));
  });
  return()=>ref.off("value",h);
};

const NUM_CONF=[[0,5,1],[1,6,1],[2,6,1],[3,5,1],[4,5,2],[5,4,2],[6,4,2],[7,4,2],[8,4,2],[9,4,2],[10,2,3],[11,1,4],[12,2,3],[13,1,6],[14,1,4],[15,1,4],[16,1,4],[17,1,6],[18,1,4],[19,1,7],[20,1,5]];
const OP_CONF=[{s:"+",p:2,w:null},{s:"-",p:2,w:null},{s:"×",p:2,w:null},{s:"÷",p:2,w:null},{s:"+/-",p:1,w:["+","-"]},{s:"×/÷",p:1,w:["×","÷"]}];
const POS_POOL=[4,4,4,5,5,5,6,6,6,7,7,7];
const MAX_OPS=4;

/* ─── COMPETITION ───────────────────────────────────────── */
const MAX_COMP_ROUNDS=10;
const LB_KEY="ne_leaderboard_v1";
const getLB=()=>{try{return JSON.parse(localStorage.getItem(LB_KEY)||"[]");}catch{return[];}};
const addLB=(e)=>{const s=[...getLB(),e].sort((a,b)=>b.score-a.score).slice(0,10);localStorage.setItem(LB_KEY,JSON.stringify(s));return s;};
const fmtDate=()=>new Date().toLocaleDateString("th-TH",{day:"2-digit",month:"2-digit",year:"2-digit"});

// อีเวนท์สำหรับโหมดแข่งขัน (ท้าทายกว่า)
const COMP_EVENTS=[
  {id:"speed",   icon:"⏱",name:"Speed Round",  desc:"ทำภายใน 20 วิ = +time bonus",     col:"#E87040",timer:20,bonus:true},
  {id:"finals",  icon:"🏆",name:"FINALS",       desc:"คะแนนทุกอย่าง ×1.5 รอบนี้",      col:"#C8A84B",mult:1.5},
  {id:"chain",   icon:"🔗",name:"Chain!",       desc:"ต้องใช้ผลลัพธ์รอบที่แล้วในสมการ",col:"#64DC9E",chain:true},
  {id:"wild",    icon:"🌀",name:"Wild Forced",  desc:"ต้องใช้ +/- หรือ ×/÷ อย่างน้อย 1",col:"#9060D0",wildReq:true},
  {id:"multidig",icon:"🔢",name:"Multi-Digit",  desc:"ต้องมีตัวเลขหลายหลักในสมการ",    col:"#40C8C8",multiReq:true},
  {id:"minimum", icon:"⚠️",name:"Minimum 12",  desc:"ทำ <12 pt → Combo Reset",         col:"#E87040",minPts:12},
  {id:"double",  icon:"×2",name:"Double Round", desc:"คะแนนทั้งหมดรอบนี้ ×2",           col:"#C8A84B",mult:2.0},
  {id:"nodraw",  icon:"🚫",name:"No Draw",      desc:"ห้ามจั่วเครื่องหมายรอบนี้",       col:"#66788A",noDraw:true},
];

const EVENTS=[
  {id:"double",icon:"⚡",name:"Double First",desc:"สมการแรกของรอบ ×2",col:"#C8A84B"},
  {id:"lucky",icon:"★",name:"Lucky Number",desc:"เลขมงคล: ใช้แล้ว +5",col:"#C8A84B"},
  {id:"div",icon:"÷",name:"Div Bonus",desc:"ใช้ ÷ ได้ +3 พิเศษ",col:"#64DC9E"},
  {id:"draw",icon:"🎁",name:"Free Draw",desc:"จั่วตัวเลขเพิ่ม 2 ใบ",col:"#64DC9E"},
  {id:"combo",icon:"🔥",name:"Combo Rush",desc:"Combo≥3 → ×1.5",col:"#E87040"},
  {id:"calm",icon:"🌙",name:"Calm Round",desc:"ไม่มีเอฟเฟกต์พิเศษ",col:"#66788A"},
  {id:"reshuffle",icon:"🔄",name:"Reshuffle",desc:"สับกองเครื่องหมายใหม่ทันที",col:"#64DC9E"},
  {id:"lock",icon:"🔒",name:"Pos Lock",desc:"= ตรึงตำแหน่งรอบนี้",col:"#66788A"},
];

const DIFFICULTIES={
  easy:  {name:"ผ่อนคลาย",icon:"🌱",desc:"ไม่มีเวลา · Combo ไม่ Reset · 5 Hints",timer:0,hintMax:5,comboReset:false,col:"#64DC9E"},
  normal:{name:"ปกติ",   icon:"⚡",desc:"กฎมาตรฐาน · 3 Hints",              timer:0,hintMax:3,comboReset:true, col:"#C8A84B"},
  hard:  {name:"ท้าทาย", icon:"🔥",desc:"20 วิ/ตา · 1 Hint · Combo+1 ผ่านตา",timer:20,hintMax:1,comboReset:false,col:"#E87040"},
};

const GOALS=[
  {id:"mul",  icon:"×", text:"ใช้เครื่องหมาย × ในรอบนี้",   bonus:6,  check:(b,pts,ep)=>b.some(c=>c?.type==="op"&&c.resolved==="×")},
  {id:"div",  icon:"÷", text:"ใช้เครื่องหมาย ÷ ในรอบนี้",   bonus:8,  check:(b,pts,ep)=>b.some(c=>c?.type==="op"&&c.resolved==="÷")},
  {id:"score",icon:"⭐", text:"ทำได้ ≥ 15 แต้มรอบนี้",       bonus:5,  check:(b,pts,ep)=>pts>=15},
  {id:"twodig",icon:"🔢",text:"ใช้ตัวเลข 2 หลักในสมการ",     bonus:4,  check:(b,pts,ep)=>b.some(c=>c?.type==="num"&&c.value>=10)},
  {id:"three",icon:"3×", text:"ใช้ตัวเลข 3 ตัวขึ้นไป",      bonus:7,  check:(b,pts,ep)=>b.filter(c=>c?.type==="num").length>=3},
  {id:"even", icon:"2", text:"ผลลัพธ์ต้องเป็นเลขคู่",        bonus:4,  check:(b,pts,ep)=>{const R=b.slice(ep).filter(c=>c?.type==="num");return R.length>0&&R[R.length-1].value%2===0;}},
  {id:"zero", icon:"0", text:"ใช้เลข 0 ในสมการ",             bonus:5,  check:(b,pts,ep)=>b.some(c=>c?.type==="num"&&c.value===0)},
  {id:"big",  icon:"🌟",text:"ผลรวมแต้มการ์ด ≥ 20",          bonus:8,  check:(b,pts,ep)=>pts>=20},
];

const ACHIEVEMENTS=[
  {id:"first",  icon:"🎉",text:"สมการแรก!",   cond:s=>s.eqCount>=1},
  {id:"combo3", icon:"🔥",text:"Combo ×3!",   cond:s=>s.combo>=3},
  {id:"divmaster",icon:"÷",text:"เซียนหาร!",  cond:s=>s.divUsed>=1},
  {id:"pts20",  icon:"⭐",text:"20 แต้มรอบเดียว!",cond:s=>s.lastPts>=20},
  {id:"combo5", icon:"💥",text:"Combo ×5!",   cond:s=>s.combo>=5},
  {id:"nopass", icon:"🏅",text:"ไม่เคยผ่านตา 5 รอบ!",cond:s=>s.consecutiveEq>=5},
];

/* ─── UTILS ─────────────────────────────────────────────── */
let _id=0;const uid=()=>++_id;
const shuf=a=>{const r=[...a];for(let i=r.length-1;i>0;i--){const j=0|Math.random()*(i+1);[r[i],r[j]]=[r[j],r[i]];}return r;};
const mkDecks=()=>({
  nums:shuf(NUM_CONF.flatMap(([v,c,p])=>Array(c).fill(0).map(()=>({id:uid(),type:"num",value:v,points:p})))),
  ops:shuf(OP_CONF.flatMap(({s,p,w})=>Array(6).fill(0).map(()=>({id:uid(),type:"op",symbol:s,points:p,wild:w,resolved:w?w[0]:s})))),
  opsDiscard:[],pos:shuf([...POS_POOL]),evts:shuf([...EVENTS,...EVENTS]),
});

function calcExpr(vals,ops){
  let n=[...vals],o=[...ops],i=0;
  while(i<o.length){
    if(o[i]==="×"||o[i]==="÷"){
      if(o[i]==="÷"){if(!n[i+1]||n[i]%n[i+1]!==0)return null;n.splice(i,2,n[i]/n[i+1]);}
      else n.splice(i,2,n[i]*n[i+1]);o.splice(i,1);
    }else i++;
  }
  let r=n[0];for(let i=0;i<o.length;i++){if(o[i]==="+")r+=n[i+1];else if(o[i]==="-")r-=n[i+1];else return null;}
  return r;
}
// รวมตัวเลขที่อยู่ติดกันบนกระดาน เช่น [4][4] → 44
function mergeAdjNums(toks){
  const out=[];let i=0;
  while(i<toks.length){
    if(toks[i].type==="num"){
      let val=toks[i].value,pts=toks[i].points||0,j=i+1;
      while(j<toks.length&&toks[j].type==="num"){
        val=val*10+toks[j].value;pts+=toks[j].points||0;j++;
      }
      out.push({type:"num",value:val,points:pts,merged:j-i>1});
      i=j;
    }else{out.push(toks[i]);i++;}
  }
  return out;
}

function evalSide(toks){
  if(!toks.length)return null;
  // รวมตัวเลขติดกันก่อน เช่น [4][4][-][9] → [44][-][9]
  toks=mergeAdjNums(toks);
  if(toks[0].type!=="num"||toks.length%2===0)return null;
  for(let i=0;i<toks.length;i++)if(i%2===0?toks[i].type!=="num":toks[i].type!=="op")return null;
  const vals=toks.filter(t=>t.type==="num").map(t=>t.value);
  const ops=toks.filter(t=>t.type==="op").map(t=>t.resolved);
  const wi=ops.map((o,i)=>[o,i]).filter(([o])=>o==="+/-"||o==="×/÷").map(([,i])=>i);
  if(!wi.length)return calcExpr(vals,ops);
  function try2(o2,w){if(w>=wi.length)return calcExpr(vals,o2);const idx=wi[w];for(const c of(o2[idx]==="+/-"?["+","-"]:["×","÷"])){const o3=[...o2];o3[idx]=c;const r=try2(o3,w+1);if(r!==null)return r;}return null;}
  return try2(ops,0);
}
function validateBoard(board,eqPos){
  const ei=eqPos-1;const L=board.slice(0,ei).filter(Boolean),R=board.slice(ei+1).filter(Boolean);
  if(!L.length||!R.length)return{ok:false,msg:"ต้องมีค่าทั้งสองฝั่งของ ="};
  const lv=evalSide(L),rv=evalSide(R);
  if(lv===null)return{ok:false,msg:"ฝั่งซ้ายคำนวณไม่ได้"};
  if(rv===null)return{ok:false,msg:"ฝั่งขวาคำนวณไม่ได้"};
  if(lv!==rv)return{ok:false,msg:`${lv} ≠ ${rv}`};
  return{ok:true,lv,rv};
}
function calcScore(board,ev,lk,first,combo){
  let pts=board.filter(Boolean).reduce((s,c)=>s+(c.points||0),0);
  const notes=[];
  if(ev?.id==="double"&&first){pts*=2;notes.push("×2 Double");}
  if(ev?.id==="div"&&board.some(c=>c?.type==="op"&&c.resolved==="÷")){pts+=3;notes.push("+3 Div");}
  if(ev?.id==="lucky"&&board.some(c=>c?.type==="num"&&c.value===lk)){pts+=5;notes.push("+5 Lucky!");}
  if(ev?.id==="combo"&&combo>=2){pts=Math.floor(pts*1.5);notes.push("×1.5 Combo");}
  return{pts,notes};
}

/* ─── AUDIO ENGINE ───────────────────────────────────────── */
// สร้าง/คืน AudioContext
let _ac=null;
const getAC=()=>{
  if(!_ac)_ac=new(window.AudioContext||window.webkitAudioContext)();
  if(_ac.state==="suspended")_ac.resume();
  return _ac;
};

// ── Background Music ──────────────────────────────────────
function useBGMusic(){
  const masterRef=useRef(null);
  const loopRef=useRef(null);
  const playRef=useRef(false);

  const getMaster=()=>{
    if(!masterRef.current||masterRef.current.context.state==="closed"){
      const ac=getAC();
      const g=ac.createGain();
      const rev=ac.createConvolver();
      g.gain.value=0.18;
      g.connect(ac.destination);
      masterRef.current=g;
    }
    return masterRef.current;
  };

  const BPM=96,B=60/96,H=B/2;
  // A minor pentatonic: A C D E G (multiple octaves)
  const N={
    A2:110,C3:130.81,D3:146.83,E3:164.81,G3:196,
    A3:220,C4:261.63,D4:293.66,E4:329.63,G4:392,
    A4:440,C5:523.25,D5:587.33,E5:659.25,G5:783.99,
  };

  // Melody patterns — 32 half-beats (4 bars × 8 half-beats)
  const PATS=[
    // Pat 1: rising question phrase
    [N.A3,0,N.C4,N.D4, N.E4,0,N.G4,0,  N.A4,N.G4,N.E4,0, N.D4,N.E4,0,0,
     N.G4,0,N.A4,N.C5, N.A4,0,N.G4,0,  N.E4,N.D4,N.C4,0, N.A3,0,0,0],
    // Pat 2: falling answer phrase
    [N.A4,0,N.G4,N.E4, N.D4,N.E4,0,0,  N.G4,0,N.E4,N.D4, N.C4,0,N.D4,0,
     N.E4,N.G4,N.E4,0, N.D4,N.C4,0,0,  N.A3,N.C4,N.D4,0, N.E4,0,0,0],
    // Pat 3: mid dance
    [N.E4,N.G4,N.A4,N.G4, N.E4,N.D4,N.E4,0, N.G4,N.A4,N.G4,N.E4, N.D4,0,N.E4,0,
     N.A3,N.C4,N.D4,N.E4,  N.G4,N.E4,N.D4,0, N.C4,N.D4,N.E4,N.G4, N.A4,0,0,0],
  ];
  const BASS_NOTES=[[N.A2,N.A2,N.E3,N.A2],[N.A2,N.C3,N.E3,N.G3],[N.A2,N.A2,N.D3,N.A2]];

  const osc=(ac,master,freq,type,vol,t,dur,atk=0.03,rel=0.12)=>{
    const o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(master);
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+atk);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur-rel);
    o.start(t);o.stop(t+dur+0.05);
  };

  const kick=(ac,master,t)=>{
    const o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(master);o.type="sine";
    o.frequency.setValueAtTime(160,t);o.frequency.exponentialRampToValueAtTime(35,t+0.14);
    g.gain.setValueAtTime(0.25,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
    o.start(t);o.stop(t+0.22);
  };

  const hihat=(ac,master,t,vol=0.04)=>{
    const buf=ac.createBuffer(1,ac.sampleRate*0.05,ac.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1);
    const src=ac.createBufferSource();src.buffer=buf;
    const f=ac.createBiquadFilter();f.type="highpass";f.frequency.value=8000;
    const g=ac.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.05);
    src.connect(f);f.connect(g);g.connect(master);
    src.start(t);
  };

  const scheduleSection=(ac,master,startT,patIdx)=>{
    const notes=PATS[patIdx%PATS.length];
    const bassSeq=BASS_NOTES[patIdx%BASS_NOTES.length];
    const barDur=8*H;
    const totalDur=4*barDur; // 4 bars

    // Melody
    notes.forEach((freq,i)=>{
      if(!freq)return;
      osc(ac,master,freq,"triangle",0.055,startT+i*H,H*0.88,0.02,0.1);
    });

    // Bass (one note per bar)
    bassSeq.forEach((freq,i)=>{
      osc(ac,master,freq,"sine",0.15,startT+i*barDur,barDur*0.9,0.06,0.25);
    });

    // Rhythm: kick beat 1 & 3 of each bar, hihat on 2 & 4
    for(let bar=0;bar<4;bar++){
      const bt=startT+bar*barDur;
      kick(ac,master,bt);          // beat 1
      hihat(ac,master,bt+H);       // 1.5
      kick(ac,master,bt+2*B);      // beat 3
      hihat(ac,master,bt+3*B-H);   // 3.5
      hihat(ac,master,bt+3*B);     // beat 4
      hihat(ac,master,bt+4*B-H,0.025); // 4.5
    }

    // Pad chord (very soft, plays whole section)
    [N.A3,N.E4,N.G4].forEach((f,i)=>{
      const po=ac.createOscillator(),pg=ac.createGain();
      po.connect(pg);pg.connect(master);
      po.type="sawtooth";po.frequency.value=f*(1+i*0.001); // slight detune
      pg.gain.setValueAtTime(0,startT);
      pg.gain.linearRampToValueAtTime(0.018,startT+0.5);
      pg.gain.exponentialRampToValueAtTime(0.001,startT+totalDur-0.2);
      po.start(startT);po.stop(startT+totalDur);
    });

    return totalDur;
  };

  let _patIdx=0;
  const loop=(startT)=>{
    if(!playRef.current)return;
    const ac=getAC();
    const master=getMaster();
    const dur=scheduleSection(ac,master,startT,_patIdx);
    _patIdx=(_patIdx+1)%PATS.length;
    loopRef.current=setTimeout(()=>loop(startT+dur),(dur-0.4)*1000);
  };

  const start=()=>{if(playRef.current)return;playRef.current=true;loop(getAC().currentTime+0.15);};
  const stop=()=>{playRef.current=false;clearTimeout(loopRef.current);};
  const setVol=(v)=>{const m=getMaster();if(m)m.gain.setTargetAtTime(v,getAC().currentTime,0.3);};

  return{start,stop,setVol};
}

// ── Sound Effects ─────────────────────────────────────────
function useSounds(){
  const p=(fn)=>{try{fn(getAC());}catch(e){}};
  const o=(ac,freq,type,vol,dur,delay=0,fEnd=null)=>{
    const osc=ac.createOscillator(),g=ac.createGain();
    osc.connect(g);g.connect(ac.destination);
    osc.type=type;osc.frequency.value=freq;
    if(fEnd)osc.frequency.exponentialRampToValueAtTime(fEnd,ac.currentTime+delay+dur);
    const t=ac.currentTime+delay;
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    osc.start(t);osc.stop(t+dur+0.05);
  };
  const noise=(ac,vol,dur,hpFreq=200,delay=0)=>{
    const buf=ac.createBuffer(1,ac.sampleRate*(dur+0.05),ac.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1);
    const src=ac.createBufferSource();src.buffer=buf;
    const f=ac.createBiquadFilter();f.type="highpass";f.frequency.value=hpFreq;
    const g=ac.createGain();g.gain.setValueAtTime(vol,ac.currentTime+delay);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+delay+dur);
    src.connect(f);f.connect(g);g.connect(ac.destination);src.start(ac.currentTime+delay);
  };
  return{
    // UI clicks
    click:()=>p(ac=>{o(ac,1200,"sine",0.06,0.05);o(ac,800,"sine",0.03,0.07,0.02);}),
    // Place card on board
    place:()=>p(ac=>{
      o(ac,320,"sine",0.14,0.1,0,55);           // thud
      o(ac,1000,"sine",0.04,0.04,0.01);          // tap click
      noise(ac,0.06,0.06,500,0.0);               // paper flutter
    }),
    // Return card to hand
    ret:()=>p(ac=>{o(ac,600,"sine",0.07,0.09,0,350);noise(ac,0.04,0.08,800);}),
    // Draw operator
    draw:()=>p(ac=>{
      noise(ac,0.1,0.12,200,0);                  // shuffle
      o(ac,700,"sine",0.05,0.07,0.05);
      o(ac,900,"sine",0.04,0.05,0.08);
    }),
    // ✓ Correct equation
    correct:()=>p(ac=>{
      [[523,0],[659,0.09],[784,0.18],[1047,0.27],[1319,0.38]].forEach(([f,d])=>{
        o(ac,f,"triangle",0.12,0.4,d);
      });
    }),
    // Combo sound (escalates with combo count)
    combo:(n)=>p(ac=>{
      const base=440*(1+(n-2)*0.15);
      [[base,0],[base*1.25,0.07],[base*1.5,0.14],[base*2,0.22],[base*2.5,0.32]].slice(0,n).forEach(([f,d])=>{
        o(ac,f,"triangle",0.1+n*0.01,0.35,d);
      });
    }),
    // ✗ Wrong answer
    wrong:()=>p(ac=>{
      o(ac,200,"sawtooth",0.12,0.35,0,60);
      o(ac,150,"square",0.06,0.2,0.05);
      noise(ac,0.08,0.15,100,0.02);
    }),
    // Event card reveal
    event:()=>p(ac=>{
      [[370,0],[466,0.12],[554,0.26],[740,0.42]].forEach(([f,d])=>o(ac,f,"triangle",0.09,0.5,d));
      noise(ac,0.06,0.3,1000,0.1);
    }),
    // Pass turn
    pass:()=>p(ac=>{o(ac,440,"sine",0.07,0.15,0,300);o(ac,330,"sine",0.05,0.18,0.08);}),
    // Round goal completed
    goalDone:()=>p(ac=>{
      [[880,0],[1109,0.08],[1318,0.16],[1760,0.26],[2217,0.38]].forEach(([f,d])=>o(ac,f,"triangle",0.1,0.38,d));
    }),
    // Achievement unlocked
    achievement:()=>p(ac=>{
      [[523,0],[659,0.06],[784,0.12],[1047,0.18],[1319,0.25],[1568,0.33]].forEach(([f,d])=>o(ac,f,"triangle",0.09,0.5,d));
      noise(ac,0.08,0.4,2000,0.1);
    }),
    // Timer tick (hard mode)
    timer:()=>p(ac=>{o(ac,1200,"square",0.04,0.04);}),
    timerEnd:()=>p(ac=>{o(ac,440,"sawtooth",0.12,0.6,0,200);}),
    // Combine digits
    combine:()=>p(ac=>{
      o(ac,800,"sine",0.08,0.12,0,1200);     // rising sweep
      o(ac,400,"sine",0.06,0.08,0.05);
      o(ac,1600,"triangle",0.05,0.1,0.1);    // sparkle
      noise(ac,0.05,0.1,1500,0.06);
    }),
    // Reroll (dice tumbling)
    reroll:()=>p(ac=>{
      [0,0.04,0.09,0.15,0.22].forEach(d=>{
        noise(ac,0.08-d*0.3,0.06,300,d);
        o(ac,200+d*300,"sine",0.07,0.05,d);
      });
    }),
    // New round transition
    newRound:()=>p(ac=>{
      [[330,0],[440,0.1],[554,0.2]].forEach(([f,d])=>o(ac,f,"triangle",0.08,0.4,d));
    }),
    // Game over
    gameOver:()=>p(ac=>{
      [[262,0],[330,0.2],[392,0.4],[523,0.65],[392,1.0],[330,1.35]].forEach(([f,d])=>o(ac,f,"triangle",0.11,1.0,d));
    }),
    // Start game
    start:()=>p(ac=>{
      [[392,0],[523,0.12],[659,0.22],[784,0.34],[1047,0.48]].forEach(([f,d])=>o(ac,f,"triangle",0.1,0.55,d));
    }),
  };
}


/* ─── SMALL COMPONENTS ───────────────────────────────────── */
const G={bg:"#07090F",gold:"#C8A84B",green:"#64DC9E",coral:"#E87040"};

function NumCard({card,sel,tiny,onClick,dimmed,combineTarget,multiNum,onBoard}){
  const gold=card.points>=5, cmb=!!card.combined;
  const bord=sel?"#FFD700":combineTarget?"#40D8D8":multiNum?"#D0B030":cmb?"#30A0A0":gold?"#A89030":"#2A4880";
  const txtCol=cmb?"#60E8E8":gold?"#FFE890":"#C8E4FF";
  const bg=cmb?"#082828":gold?"#1C2C08":"#132040";
  const tinyH=tiny?60:88, tinyFS=tiny?18:32;
  return(
    <button className="ne-card-btn" onClick={()=>{if(!dimmed){vib();onClick&&onClick();}}
    } style={{
      height:tinyH,width:tiny?"100%":undefined,flex:tiny?undefined:"1 1 0",minWidth:tiny?undefined:44,flexShrink:tiny?0:1,borderRadius:10,cursor:dimmed?"not-allowed":"pointer",
      background:bg,border:`2px solid ${bord}`,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      transform:sel?"scale(1.08)":combineTarget?"scale(1.04)":"scale(1)",
      boxShadow:sel?"0 0 0 2.5px #FFD700,0 0 16px #FFD70040":combineTarget?"0 0 10px #40D8D840":"0 1px 6px rgba(0,0,0,.5)",
      transition:"transform .12s,box-shadow .12s",position:"relative",outline:"none",
      opacity:dimmed?0.3:1,userSelect:"none"}}>
      <span style={{fontFamily:"Georgia,serif",fontWeight:900,fontSize:multiNum?"#C0A040":tinyFS,
        color:multiNum?"#FFE040":txtCol,lineHeight:1}}>{card.value}</span>
      {multiNum&&!cmb&&<span style={{fontSize:6,color:"#C0A040",lineHeight:1}}>↔</span>}
      {cmb&&<span style={{fontSize:6,color:"#30A0A0",lineHeight:1}}>🔗</span>}
      <span style={{fontSize:7,color:cmb?"#30A0A0":gold?"#A89030":"#304870",fontFamily:"monospace",marginTop:1}}>{card.points}pt</span>
      {sel&&<span style={{position:"absolute",top:-4,right:-4,width:10,height:10,background:"#FFD700",borderRadius:"50%",boxShadow:"0 0 8px #FFD700"}}/>}
    </button>
  );
}

function OpCard({card,sel,tiny,onBoard,onClick,onToggle,onSelect}){
  const wild=!!card.wild;
  const tinyH=tiny?54:72, tinyFS=tiny?16:26;
  if(onBoard&&wild){
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
        <button className="ne-card-btn" onClick={()=>{vib();onClick&&onClick();}}
          style={{width:"100%",height:tinyH,borderRadius:10,cursor:"pointer",background:"#20103A",
            border:"2px solid #6030A0",display:"flex",flexDirection:"column",alignItems:"center",
            justifyContent:"center",boxShadow:"0 1px 6px rgba(0,0,0,.5)",outline:"none",userSelect:"none"}}>
          <span style={{fontFamily:"Georgia,serif",fontWeight:900,fontSize:tinyFS,color:"#C8A0FF",lineHeight:1}}>{card.resolved}</span>
          <span style={{fontSize:7,color:"#6828A0",fontFamily:"monospace",marginTop:1}}>{card.points}pt</span>
        </button>
        <div style={{display:"flex",gap:4,width:"100%"}}>
          {card.wild.map(opt=>(
            <button key={opt} className="ne-card-btn" onClick={e=>{e.stopPropagation();vib([5]);onSelect&&onSelect(opt);}}
              style={{flex:1,padding:"5px 2px",borderRadius:8,cursor:"pointer",fontFamily:"Georgia,serif",
                fontWeight:900,fontSize:15,transition:"all .12s",outline:"none",userSelect:"none",
                background:card.resolved===opt?"#6030A0":"#20103A",
                color:card.resolved===opt?"#E8D0FF":"#7040A0",
                border:`1.5px solid ${card.resolved===opt?"#9060D0":"#40206080"}`,
                boxShadow:card.resolved===opt?"0 0 8px #6030A050":"none"}}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return(
    <button className="ne-card-btn" onClick={()=>{vib();onClick&&onClick();}}
      style={{height:tinyH,width:tiny?"100%":undefined,flex:tiny?undefined:"1 1 0",minWidth:tiny?undefined:42,flexShrink:tiny?0:1,borderRadius:10,cursor:"pointer",
        background:wild?"#20103A":"#0C2018",
        border:`2px solid ${sel?"#FFD700":wild?"#6030A0":"#1E5030"}`,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        transform:sel?"scale(1.08)":"scale(1)",
        boxShadow:sel?"0 0 0 2.5px #FFD700":"0 1px 6px rgba(0,0,0,.5)",
        transition:"transform .12s",position:"relative",outline:"none",userSelect:"none"}}>
      <span style={{fontFamily:"Georgia,serif",fontWeight:900,fontSize:tinyFS,color:wild?"#C8A0FF":"#80E8B8",lineHeight:1}}>{card.symbol}</span>
      <span style={{fontSize:7,color:wild?"#6828A0":"#1E5030",fontFamily:"monospace",marginTop:1}}>{card.points}pt</span>
      {sel&&<span style={{position:"absolute",top:-4,right:-4,width:10,height:10,background:"#FFD700",borderRadius:"50%"}}/>}
    </button>
  );
}

function BoardSlot({card,idx,eqPos,hasSel,onPlace,onReturn,onToggle,isMultiNum}){
  const [pressed,setPressed]=React.useState(false);
  if(idx===eqPos-1)return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      borderRadius:9,border:"2.5px solid #C8A84B",background:"linear-gradient(160deg,#0C1820,#060E14)",
      boxShadow:"0 0 12px #C8A84B20",minHeight:60}}>
      <span style={{fontFamily:"Georgia,serif",fontWeight:900,fontSize:28,color:"#FFE070",lineHeight:1}}>=</span>
      <span style={{color:"#C8A84B40",fontSize:6,fontFamily:"monospace"}}>P{eqPos}</span>
    </div>
  );
  if(!card)return(
    <button onPointerDown={()=>setPressed(true)} onPointerUp={()=>setPressed(false)}
      onPointerLeave={()=>setPressed(false)}
      onClick={()=>{if(hasSel){vib([8]);onPlace(idx);}}}
      style={{minHeight:60,borderRadius:9,cursor:hasSel?"pointer":"default",
        border:`2px ${hasSel?"solid":"dashed"} ${hasSel?pressed?"#FFD700":"#FFD70060":"#FFFFFF12"}`,
        background:hasSel?pressed?"#FFD70020":"#FFD70008":"transparent",
        display:"flex",alignItems:"center",justifyContent:"center",
        transition:"all .1s",outline:"none",userSelect:"none"}}>
      <span style={{color:"#FFFFFF10",fontSize:9,fontFamily:"monospace"}}>{idx+1}</span>
    </button>
  );
  return card.type==="num"
    ?<NumCard card={card} tiny onBoard multiNum={isMultiNum} onClick={()=>{vib([5]);onReturn(idx);}}/>
    :<OpCard card={card} tiny onBoard onClick={()=>{vib([5]);onReturn(idx);}} onToggle={()=>onToggle(idx)} onSelect={(op)=>onToggle(idx,op)}/>;
}

function HintModal({hand,board,eqPos,onClose}){
  const[txt,setTxt]=useState("");const[busy,setBusy]=useState(true);
  useEffect(()=>{
    const nh=hand.nums.map(c=>`${c.value}(${c.points}pt)`).join(",");
    const oh=hand.ops.map(c=>c.symbol).join(",");
    const bs=board.map((c,i)=>i===eqPos-1?"[=]":c?`[${c.type==="num"?c.value:c.resolved}]`:"[ ]").join("");
    fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:300,messages:[{role:"user",content:
        `เกม NUMBER EQUATION ฝึกคณิตศาสตร์\nตัวเลข: ${nh}\nเครื่องหมาย: ${oh}\nกระดาน: ${bs} (= ตำแหน่ง ${eqPos})\nแนะนำสมการ 2-3 แบบจากไพ่ในมือ ตอบภาษาไทย เช่น "6+7=13 (+12pt)"`}]})
    }).then(r=>r.json()).then(d=>{setTxt(d.content?.[0]?.text||"ลองหาคู่ตัวเลขที่บวก/ลบ/คูณ/หารกันได้");setBusy(false);})
    .catch(()=>{setTxt("ลองหาคู่ตัวเลขที่คำนวณกันได้ผลลัพธ์ที่มีในมือ");setBusy(false);});
  },[]);
  return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#0C1828",border:"1px solid #C8A84B50",borderRadius:20,padding:24,maxWidth:320,width:"100%",boxShadow:"0 0 60px rgba(200,168,75,.15)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{color:"#C8A84B",fontSize:13,fontFamily:"monospace",letterSpacing:"0.1em",fontWeight:"bold"}}>💡 AI HINT</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#FFFFFF50",fontSize:22,cursor:"pointer",padding:0,lineHeight:1}}>✕</button>
      </div>
      {busy?<div style={{color:"#FFFFFF30",fontSize:13,fontFamily:"monospace"}}>กำลังวิเคราะห์...</div>
        :<div style={{color:"#FFFFFFA0",fontSize:14,lineHeight:1.85,whiteSpace:"pre-wrap"}}>{txt}</div>}
    </div>
  </div>);
}

/* ─── MAIN GAME ──────────────────────────────────────────── */
export default function NumberEquationGame(){
  const snd=useSounds();
  const bgm=useBGMusic();
  const[muted,setMuted]=useState(false);
  const[bgmVol,setBgmVol]=useState(0.18);
  const[phase,setPhase]=useState("intro");       // intro|diff|position|play|result|gameover
  const[diff,setDiff]=useState(DIFFICULTIES.normal);
  const[decks,setDecks]=useState(null);
  const[hand,setHand]=useState({nums:[],ops:[]});
  const[board,setBoard]=useState(Array(8).fill(null));
  const[eqPos,setEqPos]=useState(5);
  const[posCards,setPosCards]=useState([]);
  const[ev,setEv]=useState(null);
  const[lk,setLk]=useState(null);
  const[goal,setGoal]=useState(null);
  const[goalDone,setGoalDone]=useState(false);
  const[score,setScore]=useState(0);
  const[round,setRound]=useState(0);
  const[combo,setCombo]=useState(0);
  const[bestCombo,setBestCombo]=useState(0);
  const[eqCount,setEqCount]=useState(0);
  const[passCount,setPassCount]=useState(0);
  const[divUsed,setDivUsed]=useState(0);
  const[consecutiveEq,setConsecutiveEq]=useState(0);
  const[lastPts,setLastPts]=useState(0);
  const[firstRound,setFirstRound]=useState(true);
  const[sel,setSel]=useState(null);
  const[undoState,setUndoState]=useState(null);
  const[result,setResult]=useState(null);
  const[log,setLog]=useState([]);
  const[showHint,setShowHint]=useState(false);
  const[hintUsed,setHintUsed]=useState(0);
  const[flash,setFlash]=useState(null);
  const[achievement,setAchievement]=useState(null);
  const[timeLeft,setTimeLeft]=useState(0);
  const[opsUsed,setOpsUsed]=useState({"+":0,"-":0,"×":0,"÷":0});
  const[combineMode,setCombineMode]=useState(false);
  const[combineCard,setCombineCard]=useState(null);
  const[rerollsLeft,setRerollsLeft]=useState(3);
  // Competition mode
  const[isComp,setIsComp]=useState(false);
  const[compName,setCompName]=useState("");
  const[leaderboard,setLeaderboard]=useState(()=>getLB());
  const[fbOnline,setFbOnline]=useState(FB_ON);
  const[showLB,setShowLB]=useState(false);
  const[prevResult,setPrevResult]=useState(null); // for chain event
  const[passCount2,setPassCount2]=useState(0);    // comp: perfect tracking
  const[compSpeedBonus,setCompSpeedBonus]=useState(0);

  const addLog=(m,c="#66788A")=>setLog(p=>[{m,c,k:uid()},...p].slice(0,7));
  const doFlash=(m,c=G.coral)=>{setFlash({m,c});setTimeout(()=>setFlash(null),1800);};

  const checkAchievement=useCallback((state)=>{
    const earned=ACHIEVEMENTS.find(a=>a.cond(state));
    if(earned){setAchievement(earned);snd.achievement();setTimeout(()=>setAchievement(null),2500);}
  },[]);

  // BGM control
  useEffect(()=>{
    if(muted){bgm.stop();return;}
    if(phase==="play"||phase==="position"){bgm.start();}
    else if(phase==="gameover"||phase==="comp_end"||phase==="intro"){bgm.stop();}
  },[phase,muted]);

  useEffect(()=>{bgm.setVol(muted?0:bgmVol);},[muted,bgmVol]);

  // Hard mode timer
  useEffect(()=>{
    if(phase!=="play"||!diff.timer)return;
    setTimeLeft(diff.timer);
    const t=setInterval(()=>{
      setTimeLeft(tl=>{
        if(tl<=1){clearInterval(t);snd.timerEnd();return 0;}
        if(tl<=6)snd.timer();
        return tl-1;
      });
    },1000);
    return()=>clearInterval(t);
  },[phase,round,diff.timer]);
  useEffect(()=>{if(phase==="play"&&diff.timer&&timeLeft===0&&round>0)handlePass();},[timeLeft]);

  const drawN=(d,n)=>({drawn:d.nums.slice(0,n),dk:{...d,nums:d.nums.slice(n)}});
  const drawO=useCallback((d,n)=>{
    let dk={...d};
    if(dk.ops.length<n&&dk.opsDiscard.length>0){dk={...dk,ops:shuf([...dk.ops,...dk.opsDiscard]),opsDiscard:[]};addLog("♻️ สับกองเครื่องหมายใหม่",G.green);}
    return{drawn:dk.ops.slice(0,n),dk:{...dk,ops:dk.ops.slice(n)}};
  },[]);

  const beginRound=useCallback((d,nums,ops,rn)=>{
    // Competition: ใช้ event pool ที่ต่างออกไป
    let evCard;
    if(isComp){
      const pool=rn>=7
        ?[...COMP_EVENTS.filter(e=>e.id==="finals"||e.id==="double"||e.id==="speed"),
           ...COMP_EVENTS.filter(e=>e.id!=="finals"&&e.id!=="double"&&e.id!=="speed")]
        :[...COMP_EVENTS,...COMP_EVENTS.filter(e=>e.id==="speed"||e.id==="wild"||e.id==="multidig")];
      evCard=pool[0|Math.random()*Math.min(pool.length,rn>=7?3:6)];
    }else{
      evCard=d.evts[0]||EVENTS[0];
    }
    let d2=isComp?{...d}:{...d,evts:d.evts.slice(1)};
    let fn=[...nums],lucky=null;
    if(evCard.id==="lucky")lucky=1+(0|Math.random()*15);
    if(evCard.id==="draw"){const{drawn:x,dk:d3}=drawN(d2,2);fn=[...fn,...x];d2=d3;}
    if(evCard.id==="reshuffle"){d2={...d2,ops:shuf([...d2.ops,...d2.opsDiscard]),opsDiscard:[]};addLog("♻️ Reshuffle!",G.green);}
    const randGoal=GOALS[0|Math.random()*GOALS.length];
    const pc=evCard.id==="lock"?[]:d2.pos.slice(0,2);
    let d3=evCard.id==="lock"?d2:{...d2,pos:d2.pos.slice(2)};
    if(d3.pos.length<4)d3={...d3,pos:shuf([...POS_POOL])};
    setDecks(d3);setHand({nums:fn,ops});setEv(evCard);setLk(lucky);
    setGoal(randGoal);setGoalDone(false);
    setPosCards(pc);setRound(rn);setFirstRound(true);setUndoState(null);
    setBoard(Array(8).fill(null));setSel(null);setResult(null);
    setPhase(evCard.id==="lock"?"play":"position");
    snd.event();
    addLog(`รอบ ${rn} · ${evCard.icon} ${evCard.name}`,evCard.col);
  },[drawO]);

  const startGame=()=>{
    _id=0;const d=mkDecks();
    const{drawn:nums,dk:d2}=drawN(d,6);
    const{drawn:ops,dk:d3}=drawO(d2,2);
    setScore(0);setCombo(0);setBestCombo(0);setEqCount(0);setPassCount(0);
    setDivUsed(0);setConsecutiveEq(0);setLastPts(0);setHintUsed(0);
    setOpsUsed({"+":0,"-":0,"×":0,"÷":0});setLog([]);setRerollsLeft(3);setCombineMode(false);setCombineCard(null);setCompName("");setShowLB(false);setPrevResult(null);setPassCount2(0);setCompSpeedBonus(0);
    snd.start();
    beginRound(d3,nums,ops,1);
  };

  const choosePos=p=>{snd.click();setEqPos(p);setPosCards([]);setPhase("play");};
  const pickCard=(from,card)=>{if(phase!=="play")return;snd.click();setSel(s=>s?.id===card.id?null:{from,id:card.id,card});};

  const placeCard=idx=>{
    if(!sel||board[idx]||idx===eqPos-1)return;
    setUndoState({board:[...board],hand:{nums:[...hand.nums],ops:[...hand.ops]}});
    const b=[...board];b[idx]={...sel.card};setBoard(b);
    if(sel.from==="num")setHand(h=>({...h,nums:h.nums.filter(c=>c.id!==sel.id)}));
    else setHand(h=>({...h,ops:h.ops.filter(c=>c.id!==sel.id)}));
    setSel(null);snd.place();
  };
  const returnCard=idx=>{
    if(phase!=="play")return;
    const card=board[idx];if(!card)return;
    const b=[...board];b[idx]=null;setBoard(b);
    if(card.type==="num")setHand(h=>({...h,nums:[...h.nums,card]}));
    else setHand(h=>({...h,ops:[...h.ops,card]}));
    setSel(null);setUndoState(null);snd.ret();
  };
  const toggleWild=(idx,op=null)=>{
    const card=board[idx];if(!card?.wild)return;
    const b=[...board];
    if(op!==null){b[idx]={...card,resolved:op};}
    else{const i=card.wild.indexOf(card.resolved);b[idx]={...card,resolved:card.wild[(i+1)%card.wild.length]};}
    setBoard(b);snd.click();
  };
  const undoAction=()=>{
    if(!undoState)return;
    setBoard(undoState.board);setHand(undoState.hand);setSel(null);setUndoState(null);snd.ret();
    addLog("ย้อนการวาง");
  };
  const drawOp=()=>{
    if(!decks||phase!=="play")return;
    if(isComp&&ev?.noDraw){doFlash("🚫 No Draw! ห้ามจั่วเครื่องหมายรอบนี้","#66788A");return;}
    const totalOps=hand.ops.length+board.filter(c=>c?.type==="op").length;
    if(totalOps>=MAX_OPS){doFlash(`เครื่องหมายเต็มแล้ว (สูงสุด ${MAX_OPS} ใบ รวมบนกระดาน)`,"#C8A84B");return;}
    const{drawn,dk}=drawO(decks,1);
    if(!drawn.length){doFlash("กองเครื่องหมายหมดแล้ว");return;}
    setDecks(dk);setHand(h=>({...h,ops:[...h.ops,...drawn]}));
    snd.draw();addLog(`จั่ว: ${drawn[0].symbol}`,G.green);
  };
  const showHintFn=()=>{
    if(hintUsed>=diff.hintMax){doFlash(`ใช้ Hint ครบ ${diff.hintMax} ครั้งแล้ว`,"#C8A84B");return;}
    setHintUsed(h=>h+1);setShowHint(true);
  };

  // ── รวมเลขโดด ─────────────────────────────────────────
  const startCombine=()=>{
    if(!sel||sel.from!=="num"||sel.card.value>9){doFlash("เลือกเลขโดด 0-9 เพื่อรวม","#C8A84B");return;}
    setCombineMode(true);setCombineCard({...sel.card});setSel(null);
    addLog(`เลือก [${sel.card.value}] — กดตัวเลขอีกตัวเพื่อรวมเป็นจำนวนหลายหลัก`,"#C8A84B");
  };
  const completeCombine=card2=>{
    if(!combineCard||card2.value>9||card2.id===combineCard.id){cancelCombine();return;}
    const nv=combineCard.value*10+card2.value;
    if(nv>99){doFlash("รวมได้สูงสุด 2 หลัก (0-99)");cancelCombine();return;}
    const merged={id:uid(),type:"num",value:nv,points:combineCard.points+card2.points,combined:true};
    setHand(h=>({...h,nums:[...h.nums.filter(c=>c.id!==combineCard.id&&c.id!==card2.id),merged]}));
    setCombineMode(false);setCombineCard(null);snd.combine();
    addLog(`🔗 [${combineCard.value}][${card2.value}] = ${nv} · ${merged.points}pt`,"#64DC9E");
  };
  const cancelCombine=()=>{setCombineMode(false);setCombineCard(null);};

  const saveCompScore=()=>{
    if(!compName.trim())return;
    const perfect=passCount===0;
    const finalScore=score+(perfect?30:0)+(compSpeedBonus>20?20:0);
    const entry={name:compName.trim(),score:finalScore,baseScore:score,
      perfect,speedBonus:compSpeedBonus,eqCount,bestCombo,
      difficulty:diff.name,date:fmtDate()};
    fbSave(entry).then(()=>{fbListen(rows=>{setLeaderboard(rows);});});
    setScore(finalScore);setShowLB(true);snd.achievement();
  };

  // ── สุ่มตัวเลขใหม่ (3 ครั้ง/เกม) ────────────────────────
  const rerollNums=()=>{
    if(rerollsLeft<=0){doFlash("ใช้สุ่มใหม่หมดแล้ว (3/3)","#C8A84B");return;}
    if(!decks||!decks.nums.length){doFlash("กองตัวเลขหมดแล้ว");return;}
    const keep=hand.nums.filter(c=>c.combined);
    const cnt=hand.nums.filter(c=>!c.combined).length;
    const{drawn,dk}=drawN(decks,Math.min(cnt,decks.nums.length));
    if(!drawn.length){doFlash("กองตัวเลขหมดแล้ว");return;}
    setDecks(dk);setHand(h=>({...h,nums:[...keep,...drawn]}));
    setRerollsLeft(r=>r-1);setCombineMode(false);setCombineCard(null);setSel(null);
    snd.reroll();addLog(`🔀 สุ่มตัวเลขใหม่ — เหลือ ${rerollsLeft-1} ครั้ง`,"#C8A84B");
  };

  const submit=()=>{
    if(phase!=="play")return;
    // Competition special checks
    if(isComp&&ev?.chain&&prevResult!==null&&!board.some(c=>c?.type==="num"&&c.value===prevResult)){
      snd.wrong();doFlash(`✗ Chain! ต้องใช้เลข ${prevResult}`);return;
    }
    if(isComp&&ev?.wildReq&&!board.some(c=>c?.type==="op"&&c.wild)){
      snd.wrong();doFlash("✗ Wild Forced! ต้องใช้ +/- หรือ ×/÷");return;
    }
    if(isComp&&ev?.multiReq){
      const hasM=board.some((c,i)=>{const ei=eqPos-1;return c?.type==="num"&&i!==ei&&((i>0&&board[i-1]?.type==="num"&&i-1!==ei)||(i<7&&board[i+1]?.type==="num"&&i+1!==ei));});
      if(!hasM){snd.wrong();doFlash("✗ Multi-Digit Required!");return;}
    }
    const r=validateBoard(board,eqPos);
    if(!r.ok){snd.wrong();doFlash("✗ "+r.msg);addLog("✗ "+r.msg,G.coral);return;}
    let _csResult=calcScore(board,ev,lk,firstRound,combo);
    let pts=_csResult.pts;const notes=_csResult.notes;
    if(isComp){
      if(ev?.mult){pts=Math.floor(pts*ev.mult);notes.push(`×${ev.mult} ${ev.name}`);}
      if(ev?.id==="speed"&&timeLeft>0){const sb=timeLeft>=15?10:timeLeft>=10?6:3;pts+=sb;notes.push(`+${sb} Speed!`);}
    }
    const nc=combo+1;
    const isDivUsed=board.some(c=>c?.type==="op"&&c.resolved==="÷");
    const newDivUsed=divUsed+(isDivUsed?1:0);
    const newConsec=consecutiveEq+1;
    // Check round goal
    let goalBonus=0,goalMet=false;
    if(goal&&!goalDone&&goal.check(board,pts,eqPos)){goalBonus=goal.bonus;goalMet=true;notes.push(`+${goal.bonus} เป้าหมาย!`);snd.goalDone();setGoalDone(true);}
    const totalPts=pts+goalBonus;
    setScore(s=>s+totalPts);setCombo(nc);setBestCombo(b=>Math.max(b,nc));
    setEqCount(n=>n+1);setLastPts(totalPts);setDivUsed(newDivUsed);setConsecutiveEq(newConsec);
    const opKey=board.filter(c=>c?.type==="op"&&["×","÷","+","-"].includes(c.resolved)).map(c=>c.resolved);
    setOpsUsed(o=>{const n2={...o};opKey.forEach(k=>{n2[k]=(n2[k]||0)+1;});return n2;});
    if(nc>1)snd.combo(nc);else snd.correct();
    setResult({ok:true,pts:totalPts,basePts:pts,goalBonus,notes,eq:`${r.lv} = ${r.rv}`,c:nc});setPrevResult(r.rv);
    addLog(`✓ ${r.lv}=${r.rv}  +${totalPts}pt${nc>1?"  🔥×"+nc:""}`,G.green);
    setFirstRound(false);setSel(null);setUndoState(null);setPhase("result");
    setTimeout(()=>checkAchievement({combo:nc,eqCount:eqCount+1,divUsed:newDivUsed,lastPts:totalPts,consecutiveEq:newConsec}),500);
  };

  const handlePass=useCallback(()=>{
    const newOps=[...hand.ops,...board.filter(c=>c?.type==="op")];
    let dk=decks;let drawn=[];
    if(newOps.length<MAX_OPS){const r=drawO(decks,1);drawn=r.drawn;dk=r.dk;}
    setDecks(dk);
    const bn=board.filter(c=>c?.type==="num");
    setHand(h=>({nums:[...h.nums,...bn],ops:[...newOps,...drawn].slice(0,MAX_OPS)}));
    setBoard(Array(8).fill(null));
    const nc=diff.comboReset?0:Math.max(0,combo-1);
    if(diff===DIFFICULTIES.hard)setCombo(c=>Math.min(c+1,3)); // hard mode: partial combo on pass
    else setCombo(nc);
    setSel(null);setUndoState(null);setPassCount(p=>p+1);setConsecutiveEq(0);
    setResult({ok:false,passed:true});setPhase("result");
    snd.pass();addLog(diff.comboReset?"ผ่านตา — Combo Reset":"ผ่านตา");
  },[hand,board,decks,combo,diff,drawO]);

  const nextRound=()=>{
    if(!decks)return;
    const used=board.filter(c=>c?.type==="op");
    let d2={...decks,opsDiscard:[...decks.opsDiscard,...used]};
    // Competition: จบหลัง MAX_COMP_ROUNDS รอบ
    if(isComp&&round>=MAX_COMP_ROUNDS){
      snd.gameOver();setPhase("comp_end");return;
    }
    const need=6-hand.nums.length;
    const{drawn:extra,dk:d3}=drawN(d2,Math.max(0,need));
    const nums=[...hand.nums,...extra];
    if(!d3.nums.length&&!nums.length){snd.gameOver();setPhase("gameover");return;}
    beginRound(d3,nums,hand.ops,round+1);
  };

  // ── can submit only when both sides of = have at least one card ──
  const canSubmit = useMemo(()=>{
    const ei=eqPos-1;
    return board.slice(0,ei).some(Boolean) && board.slice(ei+1).some(Boolean);
  },[board,eqPos]);

  /* ── INTRO ── */
  if(phase==="intro")return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,background:"radial-gradient(ellipse at 50% -10%,#0A1830 0%,#050A12 55%,#030609 100%)"}}>
      <div style={{maxWidth:300,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:88,color:G.gold,fontFamily:"Georgia,serif",lineHeight:1,marginBottom:6,filter:`drop-shadow(0 0 24px ${G.gold}50)`}}>∑</div>
        <h1 style={{fontFamily:"Georgia,serif",fontSize:40,fontWeight:900,color:"#E8F4FF",letterSpacing:"-0.5px",margin:"0 0 4px",lineHeight:1.1}}>NUMBER<br/>EQUATION</h1>
        <p style={{color:G.gold+"60",fontSize:10,fontFamily:"monospace",letterSpacing:"0.2em",marginBottom:28}}>SOLO PRACTICE MODE</p>
        <div style={{background:"#FFFFFF05",border:"1px solid #FFFFFF0D",borderRadius:16,padding:16,marginBottom:22,textAlign:"left"}}>
          {[["🃏","จั่วตัวเลข 6 ใบ · เครื่องหมายสูงสุด 4 ใบ"],["🎯","วางสมการบนกระดาน 8 ช่อง"],["🎲","เลือกตำแหน่ง = ทุกรอบ"],["⚡","อีเวนท์สุ่ม + เป้าหมายประจำรอบ"],["🔥","Combo ต่อเนื่อง → คะแนนพุ่ง"],["💡","AI ช่วยแนะนำสมการ"]].map(([ic,tx])=>(
            <div key={tx} style={{display:"flex",gap:10,marginBottom:9,alignItems:"center"}}>
              <span style={{fontSize:17,flexShrink:0}}>{ic}</span>
              <span style={{color:"#FFFFFF65",fontSize:13}}>{tx}</span>
            </div>
          ))}
        </div>
        <button onClick={()=>setPhase("diff")} style={{width:"100%",padding:"16px 0",borderRadius:16,fontWeight:900,fontSize:20,letterSpacing:"0.06em",background:`linear-gradient(140deg,${G.gold},#E8C870)`,color:"#080A10",border:"none",cursor:"pointer",fontFamily:"Georgia,serif",boxShadow:`0 0 40px ${G.gold}35`,transition:"all .15s"}} onMouseOver={e=>e.currentTarget.style.filter="brightness(1.08)"} onMouseOut={e=>e.currentTarget.style.filter=""}>เริ่มเล่น</button>
        <button onClick={()=>{setLeaderboard(getLB());setShowLB(true);setPhase("lb");}} style={{width:"100%",marginTop:10,padding:"12px 0",borderRadius:14,fontWeight:700,fontSize:15,background:"transparent",color:G.gold+"80",border:`1px solid ${G.gold}30`,cursor:"pointer",transition:"all .15s"}}>🏆 ตารางคะแนน</button>
      </div>
    </div>
  );

  /* ── DIFFICULTY SELECT ── */
  if(phase==="diff")return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,background:"radial-gradient(ellipse at 50% -10%,#0A1830,#050A12,#030609)"}}>
      <div style={{maxWidth:300,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:36,marginBottom:6}}>🎮</div>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:900,color:"#E8F4FF",margin:0}}>เลือกโหมด</h2>
        </div>
        {/* Mode buttons */}
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {/* Competition — เริ่มทันที easy+10รอบ */}
          <button onClick={()=>{snd.start();setIsComp(true);setDiff(DIFFICULTIES.easy);setTimeout(()=>{
            const d=mkDecks();const{drawn:nums,dk:d2}=drawN(d,6);const{drawn:ops,dk:d3}=drawO(d2,2);
            setScore(0);setCombo(0);setBestCombo(0);setEqCount(0);setPassCount(0);
            setDivUsed(0);setConsecutiveEq(0);setLastPts(0);setHintUsed(0);
            setOpsUsed({"+":0,"-":0,"×":0,"÷":0});setLog([]);
            setRerollsLeft(3);setCombineMode(false);setCombineCard(null);
            setCompName("");setShowLB(false);setPrevResult(null);setPassCount2(0);setCompSpeedBonus(0);
            beginRound(d3,nums,ops,1);
          },50);}}
            style={{flex:1,padding:"14px 8px",borderRadius:14,cursor:"pointer",transition:"all .15s",outline:"none",
              border:"2px solid #C8A84B60",background:"#1A160A",textAlign:"center"}}>
            <div style={{fontSize:26,marginBottom:4}}>🏆</div>
            <div style={{fontWeight:700,fontSize:14,color:"#C8A84B"}}>แข่งขัน</div>
            <div style={{fontSize:10,color:"#FFFFFF40",marginTop:2,fontFamily:"monospace"}}>{MAX_COMP_ROUNDS} รอบ · บันทึกคะแนน</div>
          </button>
          {/* Practice — เลือก difficulty */}
          <button onClick={()=>{snd.click();setIsComp(false);}}
            style={{flex:1,padding:"14px 8px",borderRadius:14,cursor:"pointer",transition:"all .15s",outline:"none",
              border:`2px solid ${!isComp?"#64DC9E60":"#FFFFFF15"}`,background:!isComp?"#081808":"#FFFFFF05",textAlign:"center"}}>
            <div style={{fontSize:26,marginBottom:4}}>🌿</div>
            <div style={{fontWeight:700,fontSize:14,color:!isComp?"#64DC9E":"#E8F4FF"}}>ฝึกซ้อม</div>
            <div style={{fontSize:10,color:"#FFFFFF40",marginTop:2,fontFamily:"monospace"}}>เล่นได้ไม่จำกัดรอบ</div>
          </button>
        </div>
        {!isComp&&<div style={{color:"#FFFFFF25",fontSize:10,fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:10}}>ระดับความยาก (ฝึกซ้อม)</div>}
        {!isComp&&<div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
          {Object.values(DIFFICULTIES).map(d=>(
            <button key={d.name} onClick={()=>{setDiff(d);snd.click();startGame();}}
              style={{padding:"14px 16px",borderRadius:14,border:`2px solid ${d.col}60`,background:d===diff?"#FFFFFF08":"transparent",cursor:"pointer",textAlign:"left",transition:"all .15s",outline:"none"}}
              onMouseOver={e=>{e.currentTarget.style.borderColor=d.col;e.currentTarget.style.background="#FFFFFF08";}}
              onMouseOut={e=>{e.currentTarget.style.borderColor=d.col+"60";e.currentTarget.style.background="transparent";}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                <span style={{fontSize:22}}>{d.icon}</span>
                <span style={{fontWeight:700,fontSize:16,color:d.col}}>{d.name}</span>
              </div>
              <div style={{color:"#FFFFFF50",fontSize:12,fontFamily:"monospace",marginLeft:32}}>{d.desc}</div>
            </button>
          ))}
        </div>}
        <button onClick={()=>setPhase("intro")} style={{width:"100%",padding:"10px",borderRadius:12,border:"1px solid #FFFFFF10",background:"transparent",color:"#FFFFFF30",cursor:"pointer",fontSize:13}}>← กลับ</button>
      </div>
    </div>
  );

  /* ── GAME OVER ── */
  if(phase==="gameover")return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,background:"radial-gradient(ellipse at 50% -10%,#0A1830,#050A12,#030609)"}}>
      <div style={{maxWidth:300,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:72,marginBottom:10}}>🏆</div>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:36,fontWeight:900,color:"#E8F4FF",margin:"0 0 3px"}}>จบเกม!</h2>
        <p style={{color:"#FFFFFF35",fontSize:10,fontFamily:"monospace",letterSpacing:"0.15em",marginBottom:22}}>กองตัวเลขหมดแล้ว</p>
        <div style={{background:"#FFFFFF05",border:"1px solid #FFFFFF0D",borderRadius:16,padding:18,marginBottom:14}}>
          {[["คะแนนรวม",score,G.gold,"38px"],["รอบที่เล่น",round,"#B8D4F0","18px"],["สมการสำเร็จ",eqCount+" ครั้ง","#B8D4F0","18px"],["ผ่านตา",passCount+" ครั้ง","#66788A","16px"],["Combo สูงสุด","×"+bestCombo,G.coral,"22px"],["เฉลี่ย/รอบ",(round?Math.round(score/round):0)+" pt","#B8D4F0","18px"]].map(([l,v,c,fs])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{color:"#FFFFFF40",fontSize:13}}>{l}</span>
              <span style={{color:c,fontSize:fs,fontWeight:900,fontFamily:"Georgia,serif"}}>{v}</span>
            </div>
          ))}
          <div style={{borderTop:"1px solid #FFFFFF10",paddingTop:10,marginTop:6}}>
            <div style={{color:"#FFFFFF30",fontSize:10,fontFamily:"monospace",marginBottom:6}}>เครื่องหมายที่ใช้</div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              {Object.entries(opsUsed).map(([op,cnt])=>(
                <div key={op} style={{background:"#FFFFFF08",borderRadius:8,padding:"4px 8px",textAlign:"center"}}>
                  <div style={{fontFamily:"Georgia,serif",fontWeight:900,fontSize:16,color:"#80E8B8"}}>{op}</div>
                  <div style={{fontSize:10,color:"#FFFFFF40",fontFamily:"monospace"}}>{cnt}×</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          {log.slice(0,3).map(l=><div key={l.k} style={{color:l.c,fontSize:10,fontFamily:"monospace",opacity:.55,marginBottom:2}}>{l.m}</div>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{snd.click();setPhase("diff");}} style={{flex:1,padding:"13px 0",borderRadius:14,fontWeight:700,fontSize:15,background:`linear-gradient(140deg,${G.gold},#E8C870)`,color:"#080A10",border:"none",cursor:"pointer"}}>เล่นอีกครั้ง</button>
          <button onClick={()=>{snd.click();setPhase("intro");}} style={{padding:"13px 14px",borderRadius:14,border:"1px solid #FFFFFF15",color:"#FFFFFF40",background:"transparent",cursor:"pointer",fontSize:13}}>🏠</button>
        </div>
      </div>
    </div>
  );

  /* ── MAIN PLAY ── */
  const opsBoardCount=board.filter(c=>c?.type==="op").length;
  const totalOpCount=hand.ops.length+opsBoardCount;
  const opsFull=totalOpCount>=MAX_OPS;

  // ── Position Selection Screen (แยกออกมาสะอาด) ──
  if(phase==="position"&&posCards.length>0)return(
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",
      background:G.bg,color:"#E8F4FF",fontFamily:"system-ui,sans-serif",
      maxWidth:520,margin:"0 auto",padding:"0 0 env(safe-area-inset-bottom,0px)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"10px 14px",borderBottom:"1px solid #FFFFFF0D",background:"#050810"}}>
        <span style={{color:"#FFFFFF35",fontSize:12,fontFamily:"monospace"}}>รอบ {round}{isComp?`/${MAX_COMP_ROUNDS}`:""}</span>
        <span style={{color:G.gold,fontSize:22,fontWeight:900,fontFamily:"Georgia,serif"}}>{score}</span>
        <span style={{color:diff.col,fontSize:16}}>{diff.icon}</span>
      </div>
      {ev&&<div style={{margin:"10px 14px 0",padding:"8px 12px",borderRadius:10,
        display:"flex",alignItems:"center",gap:8,background:"#18100680",border:`1px solid ${ev.col}30`}}>
        <span style={{fontSize:18}}>{ev.icon}</span>
        <div><span style={{color:ev.col,fontWeight:700,fontSize:12,fontFamily:"monospace"}}>{ev.name}</span>
        <span style={{color:"#FFFFFF35",fontSize:11,marginLeft:6}}>{ev.desc}</span></div>
      </div>}
      {goal&&<div style={{margin:"6px 14px 0",padding:"7px 12px",borderRadius:10,
        display:"flex",alignItems:"center",gap:8,background:"#0A102080",border:"1px solid #3060A050"}}>
        <span style={{fontSize:15}}>{goal.icon}</span>
        <span style={{color:"#5080C0",fontSize:11,fontFamily:"monospace",flex:1}}>{goal.text}</span>
        <span style={{color:"#FFFFFF30",fontSize:11,fontFamily:"monospace"}}>+{goal.bonus}pt</span>
      </div>}
      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 14px"}}>
        <div style={{color:"#FFFFFF30",fontSize:11,fontFamily:"monospace",letterSpacing:"0.12em",
          textAlign:"center",marginBottom:16}}>🎲 เลือกตำแหน่งของ =</div>
        <div style={{display:"flex",gap:12}}>
          {posCards.map((p,i)=>(
            <button key={i} onClick={()=>{vib([10]);choosePos(p);}}
              className="ne-card-btn"
              style={{flex:1,padding:"20px 10px",borderRadius:16,border:"2px solid #284A70",
                background:"#0E1C2C",cursor:"pointer",outline:"none",userSelect:"none",textAlign:"center"}}>
              <div style={{fontFamily:"Georgia,serif",fontWeight:900,fontSize:52,color:"#90B8E0",lineHeight:1}}>{p}</div>
              <div style={{fontSize:11,color:"#4A7090",fontFamily:"monospace",marginTop:6}}>ซ้าย {p-1} / ขวา {8-p}</div>
              <div style={{display:"flex",gap:2,justifyContent:"center",marginTop:10}}>
                {Array(8).fill(0).map((_,j)=><div key={j} style={{width:9,height:9,borderRadius:2,
                  background:j===p-1?"#C8A84B":j<p-1?"#3870C0":"#FFFFFF18"}}/>)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Main Play / Result ── (ไม่ scroll)
  return(
    <div style={{
      height:"100dvh",display:"flex",flexDirection:"column",overflow:"hidden",
      background:G.bg,color:"#E8F4FF",
      fontFamily:"system-ui,-apple-system,sans-serif",
      maxWidth:520,margin:"0 auto",
      paddingTop:"env(safe-area-inset-top,0px)",
    }}>

      {/* ── FLASH / ACHIEVEMENT ── */}
      {flash&&<div style={{position:"fixed",top:54,left:"50%",transform:"translateX(-50%)",
        background:flash.c+"1A",color:flash.c,border:`1px solid ${flash.c}50`,
        borderRadius:12,padding:"6px 14px",fontSize:13,fontFamily:"monospace",fontWeight:"bold",
        zIndex:999,pointerEvents:"none",whiteSpace:"nowrap"}}>{flash.m}</div>}
      {achievement&&<div style={{position:"fixed",top:90,left:"50%",transform:"translateX(-50%)",
        background:"#1A2A10",color:"#C8E840",border:"1px solid #90B02050",borderRadius:12,
        padding:"7px 16px",fontSize:13,fontFamily:"monospace",fontWeight:"bold",
        zIndex:998,pointerEvents:"none"}}>{achievement.icon} {achievement.text}</div>}

      {/* ── HEADER ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"8px 12px",borderBottom:"1px solid #FFFFFF0D",background:"#050810",
        flexShrink:0,gap:4}}>
        <div style={{display:"flex",gap:8,fontSize:11,fontFamily:"monospace",alignItems:"center"}}>
          {isComp&&<span style={{color:diff.col,fontSize:13}}>{diff.icon}</span>}
          <span style={{color:"#FFFFFF35"}}>รอบ <b style={{color:isComp&&round>=7?"#FFD700":"#B8D4F0"}}>{round}{isComp?`/${MAX_COMP_ROUNDS}`:""}</b></span>
          {isComp&&round>=7&&<span style={{color:"#FFD700",fontSize:9}}>🏆FINALS</span>}
          {diff.timer>0&&timeLeft>0&&<span style={{color:timeLeft<=5?G.coral:G.gold,fontWeight:900,
            border:`1px solid ${timeLeft<=5?G.coral:G.gold}50`,borderRadius:6,padding:"1px 6px"}}>⏱{timeLeft}</span>}
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{color:G.gold,fontSize:22,fontWeight:900,fontFamily:"Georgia,serif",lineHeight:1}}>{score}</div>
          {combo>1&&<div style={{color:G.coral,fontSize:10,fontWeight:900}}>🔥×{combo}</div>}
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center"}}>
          <button onClick={showHintFn} style={{color:hintUsed>=diff.hintMax?"#FFFFFF20":G.gold+"80",
            border:`1px solid ${hintUsed>=diff.hintMax?"#FFFFFF10":G.gold+"28"}`,background:"transparent",
            borderRadius:8,padding:"5px 7px",fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>💡{diff.hintMax-hintUsed}</button>
          <button onClick={()=>{snd.click();setMuted(m=>!m);}}
            style={{color:muted?"#FFFFFF30":"#FFFFFF60",border:"1px solid #FFFFFF12",background:"transparent",
              borderRadius:8,padding:"5px 7px",fontSize:13,cursor:"pointer"}}>{muted?"🔇":"🔊"}</button>
        </div>
      </div>

      {/* ── COMPETITION PROGRESS BAR ── */}
      {isComp&&<div style={{height:3,background:"#FFFFFF06",flexShrink:0,position:"relative"}}>
        <div style={{position:"absolute",top:0,left:0,height:"100%",transition:"width .5s",
          background:round>=7?`linear-gradient(90deg,${G.gold},#FFD700)`:`linear-gradient(90deg,#3060A0,${G.green})`,
          width:`${(round/MAX_COMP_ROUNDS)*100}%`}}/>
      </div>}

      {/* ── EVENT ── */}
      {ev&&<div style={{margin:"5px 10px 0",padding:"5px 10px",borderRadius:9,
        display:"flex",alignItems:"center",gap:8,background:"#18100680",border:`1px solid ${ev.col}25`,flexShrink:0}}>
        <span style={{fontSize:16}}>{ev.icon}</span>
        <div style={{minWidth:0,flex:1}}>
          <span style={{color:ev.col,fontWeight:700,fontSize:10,fontFamily:"monospace"}}>{ev.name}</span>
          <span style={{color:"#FFFFFF30",fontSize:10,marginLeft:6,
            display:"inline-block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"60vw"}}>
            {ev.id==="lucky"?`เลขมงคล: ${lk}`:ev.id==="chain"&&prevResult!==null?`ต้องใช้ ${prevResult}`:ev.desc}
          </span>
        </div>
      </div>}

      {/* ── GOAL ── */}
      {goal&&<div style={{margin:"4px 10px 0",padding:"5px 10px",borderRadius:9,
        display:"flex",alignItems:"center",gap:8,flexShrink:0,
        background:goalDone?"#0A201090":"#0A102080",border:`1px solid ${goalDone?G.green+"50":"#3060A040"}`}}>
        <span style={{fontSize:13}}>{goalDone?"✅":goal.icon}</span>
        <span style={{color:goalDone?G.green:"#5080C0",fontSize:10,fontFamily:"monospace",flex:1,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{goal.text}</span>
        <span style={{color:"#FFFFFF30",fontSize:10,fontFamily:"monospace",flexShrink:0}}>+{goal.bonus}pt</span>
      </div>}

      {/* ── BOARD ── */}
      <div style={{padding:"6px 10px 0",flexShrink:0}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:"3px",
          background:"#0A1018",padding:"7px",borderRadius:12,border:"1px solid #FFFFFF08"}}>
          {Array(8).fill(0).map((_,i)=>{
            const ei=eqPos-1,bcard=board[i];
            const pn=i>0&&i!==ei&&board[i-1]?.type==="num"&&i-1!==ei;
            const nn=i<7&&i!==ei&&board[i+1]?.type==="num"&&i+1!==ei;
            return <BoardSlot key={i} card={bcard} idx={i} eqPos={eqPos}
              hasSel={!!sel&&phase==="play"} isMultiNum={bcard?.type==="num"&&(pn||nn)}
              onPlace={placeCard} onReturn={returnCard} onToggle={toggleWild}/>;
          })}
        </div>
        <div style={{display:"flex",alignItems:"center",height:18,marginTop:2}}>
          {sel&&phase==="play"&&<span style={{color:"#FFD70055",fontSize:9,fontFamily:"monospace"}}>← กดช่องว่างเพื่อวาง</span>}
          {undoState&&phase==="play"&&<button onClick={undoAction}
            style={{marginLeft:"auto",fontSize:9,fontFamily:"monospace",background:"transparent",
              border:"1px solid #FFFFFF15",borderRadius:5,padding:"1px 7px",
              color:"#FFFFFF35",cursor:"pointer"}}>↩ undo</button>}
        </div>
      </div>

      {/* ── RESULT (inline, ไม่ขยาย) ── */}
      {phase==="result"&&result&&<div style={{margin:"4px 10px 0",padding:"8px 10px",borderRadius:10,
        border:`1px solid ${result.ok?G.green+"45":"#FFFFFF10"}`,
        background:result.ok?"#081A1090":"#FFFFFF04",flexShrink:0}}>
        {result.ok?(<div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{color:G.green,fontWeight:700,fontSize:13,fontFamily:"monospace"}}>{result.eq}</span>
          {result.notes.map((n,i)=><span key={i} style={{background:G.gold+"18",color:G.gold,
            fontSize:10,padding:"1px 7px",borderRadius:5,fontFamily:"monospace"}}>{n}</span>)}
          <span style={{background:G.green+"18",color:G.green,fontSize:10,
            padding:"1px 7px",borderRadius:5,fontFamily:"monospace",fontWeight:700}}>+{result.pts}pt{result.c>1?` 🔥×${result.c}`:""}</span>
        </div>):<span style={{color:"#FFFFFF35",fontSize:12}}>{diff.comboReset?"ผ่านตา — Combo Reset":"ผ่านตา"}</span>}
      </div>}

      {/* ── NUMBER HAND ── */}
      <div style={{padding:"5px 10px 0",flexShrink:0}}>
        <div style={{color:"#FFFFFF25",fontSize:9,fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:4}}>
          ตัวเลข ({hand.nums.length}/6)
          {combineMode&&<span style={{color:"#40C8C8",marginLeft:6}}>← กดตัวเลขที่ต้องการต่อท้าย [{combineCard?.value}]</span>}
        </div>
        {/* No scroll — all 6 cards in one flex row */}
        <div style={{display:"flex",gap:5,width:"100%"}}>
          {hand.nums.map(c=>(
            combineMode
              ?<NumCard key={c.id} card={c} combineTarget={c.value<=9&&c.id!==combineCard?.id}
                  dimmed={c.value>9||c.id===combineCard?.id}
                  onClick={()=>c.value<=9&&c.id!==combineCard?.id?completeCombine(c):cancelCombine()}/>
              :<NumCard key={c.id} card={c} sel={sel?.id===c.id} onClick={()=>pickCard("num",c)}/>
          ))}
          {!hand.nums.length&&<span style={{color:"#FFFFFF15",fontSize:12,padding:"20px 0"}}>ไม่มีตัวเลขในมือ</span>}
        </div>
      </div>

      {/* ── COMBINE / REROLL ── */}
      {phase==="play"&&<div style={{padding:"4px 10px 0",display:"flex",gap:6,flexShrink:0}}>
        {combineMode
          ?<button onClick={cancelCombine} style={{flex:1,padding:"7px 0",borderRadius:9,fontSize:12,
              fontFamily:"monospace",background:"#0C2020",border:"1px solid #30A0A050",
              color:"#40C8C8",cursor:"pointer",outline:"none"}}>ยกเลิกการรวม</button>
          :<>
            <button onClick={startCombine} disabled={!sel||sel.from!=="num"||sel.card.value>9}
              className="ne-card-btn" style={{flex:1,padding:"7px 0",borderRadius:9,fontSize:11,
                fontFamily:"monospace",cursor:(!sel||sel.from!=="num"||(sel.card?.value>9))?"not-allowed":"pointer",
                background:"transparent",border:`1px solid ${(!sel||sel.from!=="num"||(sel.card?.value>9))?"#FFFFFF10":"#30A0A060"}`,
                color:(!sel||sel.from!=="num"||(sel.card?.value>9))?"#FFFFFF18":"#40C8C8",
                outline:"none",opacity:(!sel||sel.from!=="num"||(sel.card?.value>9))?0.4:1}}>🔗 รวมเลข</button>
            <button onClick={rerollNums} disabled={rerollsLeft<=0}
              className="ne-card-btn" style={{flex:1,padding:"7px 0",borderRadius:9,fontSize:11,
                fontFamily:"monospace",cursor:rerollsLeft<=0?"not-allowed":"pointer",
                background:"transparent",border:`1px solid ${rerollsLeft>0?G.gold+"50":"#FFFFFF10"}`,
                color:rerollsLeft>0?G.gold:"#FFFFFF18",outline:"none",opacity:rerollsLeft<=0?0.4:1}}>
              🔀 {"●".repeat(rerollsLeft)}{"○".repeat(3-rerollsLeft)}
            </button>
          </>}
      </div>}

      {/* ── OPERATOR HAND ── */}
      <div style={{padding:"5px 10px 0",flexShrink:0}}>
        <div style={{color:"#FFFFFF25",fontSize:9,fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:4}}>
          เครื่องหมาย ({hand.ops.length}/{MAX_OPS}{opsBoardCount>0?` +${opsBoardCount}บนกระดาน`:""})
          {opsFull&&<span style={{color:G.coral+"70",marginLeft:6}}>เต็มแล้ว</span>}
          {isComp&&ev?.noDraw&&<span style={{color:"#66788A",marginLeft:6}}>🚫 ห้ามจั่ว</span>}
        </div>
        {/* No scroll — max 4 cards in one row */}
        <div style={{display:"flex",gap:5,width:"100%"}}>
          {hand.ops.map(c=><OpCard key={c.id} card={c} sel={sel?.id===c.id} onClick={()=>pickCard("op",c)}/>)}
        </div>
      </div>

      {/* ── LOG (compact 2 lines) ── */}
      <div style={{padding:"4px 10px 2px",flexShrink:0}}>
        {log.slice(0,2).map(l=><div key={l.k} style={{color:l.c,fontSize:9,fontFamily:"monospace",opacity:.6,marginBottom:1,
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.m}</div>)}
      </div>

      {/* ── BOTTOM ACTION BAR (flex ไม่ fixed) ── */}
      <div style={{marginTop:"auto",padding:"8px 10px",
        paddingBottom:"calc(8px + env(safe-area-inset-bottom,0px))",
        background:"rgba(5,8,16,0.97)",borderTop:"1px solid #FFFFFF0D",flexShrink:0}}>
        {(phase==="play")&&(
          <div style={{display:"flex",gap:6}}>
            {(()=>{const dis=opsFull||(isComp&&!!ev?.noDraw);return(
              <button onClick={drawOp} disabled={dis} className="ne-card-btn"
                style={{flex:"0 0 60px",padding:"13px 0",borderRadius:12,fontSize:12,fontFamily:"monospace",
                  border:`1px solid ${dis?"#FFFFFF08":G.green+"40"}`,
                  color:dis?"#FFFFFF18":G.green+"80",background:"transparent",
                  cursor:dis?"not-allowed":"pointer",outline:"none",opacity:dis?0.4:1}}>♣ จั่ว</button>);})()}
            <button onClick={submit} disabled={!canSubmit} className="ne-card-btn"
              style={{flex:1,padding:"13px 0",borderRadius:12,fontWeight:700,fontSize:15,
                background:canSubmit?"linear-gradient(140deg,#142A1C,#1A3824)":"#111",
                color:canSubmit?G.green:"#FFFFFF18",
                border:`1px solid ${canSubmit?G.green+"45":"#FFFFFF08"}`,
                cursor:canSubmit?"pointer":"not-allowed",letterSpacing:"0.03em",
                boxShadow:canSubmit?`0 0 18px ${G.green}18`:"none",
                transition:"all .15s",outline:"none",opacity:canSubmit?1:0.45}}>
              {canSubmit?"✓ ยืนยัน":"วางทั้งสองฝั่ง ="}
            </button>
            <button onClick={handlePass} className="ne-card-btn"
              style={{flex:"0 0 52px",padding:"13px 0",borderRadius:12,fontSize:11,fontFamily:"monospace",
                border:"1px solid #FFFFFF10",color:"#FFFFFF30",background:"transparent",
                cursor:"pointer",outline:"none"}}>⏭ ผ่าน</button>
          </div>
        )}
        {phase==="result"&&<button onClick={nextRound} className="ne-card-btn"
          style={{width:"100%",padding:"13px 0",borderRadius:12,fontWeight:700,fontSize:15,
            background:result?.ok?"linear-gradient(140deg,#142A1C,#1A3824)":"#111",
            color:result?.ok?G.green:"#FFFFFF40",
            border:`1px solid ${result?.ok?G.green+"45":"#FFFFFF10"}`,cursor:"pointer",outline:"none"}}>
          รอบถัดไป →
        </button>}
      </div>

      {/* MODALS */}
      {showHint&&<HintModal hand={hand} board={board} eqPos={eqPos} onClose={()=>setShowHint(false)}/>}

      {/* COMP END */}
      {phase==="comp_end"&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.93)",
        display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200,
        paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        <div style={{background:"#0A1020",border:"1px solid #C8A84B50",
          borderRadius:"20px 20px 0 0",padding:"22px 18px",width:"100%",maxWidth:500,maxHeight:"88vh",overflowY:"auto"}}>
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:44}}>🏆</div>
            <h2 style={{fontFamily:"Georgia,serif",fontSize:26,fontWeight:900,color:"#E8F4FF",margin:"4px 0"}}>จบการแข่งขัน!</h2>
          </div>
          <div style={{background:"#FFFFFF05",borderRadius:12,padding:12,marginBottom:12}}>
            {[["คะแนนรวม",score,G.gold,"30px"],["Combo สูงสุด","×"+bestCombo,G.coral,"19px"],["สมการสำเร็จ",eqCount+" ครั้ง","#B8D4F0","16px"],["Speed Bonus","+"+compSpeedBonus,G.green,"16px"],passCount===0?["🏅 Perfect!","+30",G.green,"16px"]:["ผ่านตา",passCount+" ครั้ง","#66788A","15px"]].map(([l,v,c,fs])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <span style={{color:"#FFFFFF45",fontSize:13}}>{l}</span>
                <span style={{color:c,fontSize:fs,fontWeight:900,fontFamily:"Georgia,serif"}}>{v}</span>
              </div>
            ))}
          </div>
          {!showLB?(<>
            <p style={{color:"#FFFFFF50",fontSize:12,marginBottom:8,textAlign:"center"}}>ใส่ชื่อเพื่อบันทึก{FB_ON?" 🟢 ออนไลน์":""}</p>
            <input value={compName} onChange={e=>setCompName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&saveCompScore()}
              placeholder="ชื่อของคุณ..."
              style={{width:"100%",padding:"11px 14px",borderRadius:11,border:"1px solid #C8A84B50",
                background:"#FFFFFF08",color:"#E8F4FF",fontSize:16,outline:"none",fontFamily:"system-ui",marginBottom:10}}
              autoFocus/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={saveCompScore} disabled={!compName.trim()}
                style={{flex:2,padding:"13px 0",borderRadius:11,fontWeight:700,fontSize:15,
                  background:compName.trim()?`linear-gradient(140deg,${G.gold},#E8C870)`:"#222",
                  color:compName.trim()?"#080A10":"#555",border:"none",cursor:compName.trim()?"pointer":"not-allowed"}}>💾 บันทึก</button>
              <button onClick={()=>setPhase("intro")}
                style={{flex:1,padding:"13px 0",borderRadius:11,border:"1px solid #FFFFFF15",
                  color:"#FFFFFF40",background:"transparent",cursor:"pointer"}}>ข้าม</button>
            </div>
          </>):(<>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{color:"#FFFFFF50",fontSize:11,fontFamily:"monospace"}}>🏆 LEADERBOARD</span>
              {FB_ON&&<span style={{fontSize:9,background:"#0A2010",color:G.green,border:`1px solid ${G.green}30`,borderRadius:6,padding:"1px 6px",fontFamily:"monospace"}}>🟢 LIVE</span>}
            </div>
            <div style={{maxHeight:220,overflowY:"auto",marginBottom:10}}>
              {leaderboard.map((e,i)=>(
                <div key={e.key||i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 8px",
                  borderRadius:9,marginBottom:4,
                  background:e.name===compName?"#1A1608":"#FFFFFF05",
                  border:`1px solid ${e.name===compName?"#C8A84B30":"#FFFFFF08"}`}}>
                  <span style={{width:22,color:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#FFFFFF35",fontSize:i<3?17:12,textAlign:"center"}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:"#E8F4FF",fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name}</div>
                    <div style={{color:"#FFFFFF30",fontSize:9,fontFamily:"monospace"}}>{e.date} · 🔥×{e.bestCombo||"-"}</div>
                  </div>
                  <span style={{color:G.gold,fontWeight:900,fontFamily:"Georgia,serif",fontSize:19}}>{e.score}</span>
                </div>
              ))}
            </div>
            <button onClick={()=>setPhase("intro")} style={{width:"100%",padding:"13px 0",borderRadius:12,fontWeight:700,fontSize:15,
              background:`linear-gradient(140deg,${G.gold},#E8C870)`,color:"#080A10",border:"none",cursor:"pointer"}}>กลับหน้าหลัก</button>
          </>)}
        </div>
      </div>}

      {/* LB SCREEN */}
      {phase==="lb"&&<div style={{position:"fixed",inset:0,background:G.bg,display:"flex",flexDirection:"column",zIndex:200,maxWidth:520,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderBottom:"1px solid #FFFFFF0D"}}>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:900,color:"#E8F4FF",margin:0}}>🏆 กระดานคะแนน</h2>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {FB_ON&&<span style={{fontSize:9,background:"#0A2010",color:G.green,border:`1px solid ${G.green}30`,borderRadius:6,padding:"2px 7px",fontFamily:"monospace"}}>🟢 LIVE</span>}
            <button onClick={()=>setPhase("intro")} style={{background:"none",border:"1px solid #FFFFFF15",color:"#FFFFFF40",borderRadius:8,padding:"6px 11px",cursor:"pointer",fontSize:13}}>✕</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 12px"}}>
          {leaderboard.length===0&&<div style={{color:"#FFFFFF20",fontSize:14,textAlign:"center",padding:"40px 0"}}>ยังไม่มีคะแนน<br/>เล่นโหมดแข่งขันแล้วบันทึกชื่อ</div>}
          {leaderboard.map((e,i)=>(
            <div key={e.key||i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 11px",borderRadius:12,marginBottom:5,
              background:i===0?"#1A1608":"#FFFFFF05",border:`1px solid ${i===0?"#C8A84B30":"#FFFFFF08"}`}}>
              <span style={{width:26,color:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#FFFFFF35",fontSize:i<3?21:12,textAlign:"center"}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"#E8F4FF",fontSize:14,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name}</div>
                <div style={{color:"#FFFFFF35",fontSize:10,fontFamily:"monospace"}}>{e.difficulty||"–"} · {e.date} · 🔥×{e.bestCombo||"–"}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{color:G.gold,fontWeight:900,fontFamily:"Georgia,serif",fontSize:21}}>{e.score}</div>
                <div style={{color:"#FFFFFF30",fontSize:9,fontFamily:"monospace"}}>{e.eqCount||"–"} eq</div>
              </div>
            </div>
          ))}
        </div>
        {!FB_ON&&<div style={{padding:"8px 12px 16px",borderTop:"1px solid #FFFFFF08"}}>
          <div style={{color:"#FFFFFF25",fontSize:10,fontFamily:"monospace",textAlign:"center",lineHeight:1.6}}>
            ⚠️ เฉพาะเครื่องนี้ — เปิดใช้ Firebase เพื่อแชร์ข้ามเครื่อง
          </div>
          {leaderboard.length>0&&<button onClick={()=>{if(window.confirm("ล้างคะแนนทั้งหมด?")){localStorage.removeItem(LB_KEY);setLeaderboard([]);}}}
            style={{width:"100%",marginTop:8,padding:"9px",borderRadius:10,border:"1px solid #E8704030",
              color:"#E87040",background:"transparent",cursor:"pointer",fontSize:12}}>🗑️ ล้างคะแนน</button>}
        </div>}
      </div>}
    </div>
  );
}
