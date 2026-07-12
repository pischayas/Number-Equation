import { useState, useEffect, useCallback, useRef, useMemo } from "react";

/* ─── DATA ──────────────────────────────────────────────── */
const NUM_CONF=[[0,5,1],[1,6,1],[2,6,1],[3,5,1],[4,5,2],[5,4,2],[6,4,2],[7,4,2],[8,4,2],[9,4,2],[10,2,3],[11,1,4],[12,2,3],[13,1,6],[14,1,4],[15,1,4],[16,1,4],[17,1,6],[18,1,4],[19,1,7],[20,1,5]];
const OP_CONF=[{s:"+",p:2,w:null},{s:"-",p:2,w:null},{s:"×",p:2,w:null},{s:"÷",p:2,w:null},{s:"+/-",p:1,w:["+","-"]},{s:"×/÷",p:1,w:["×","÷"]}];
const POS_POOL=[4,4,4,5,5,5,6,6,6,7,7,7];
const MAX_OPS=4;

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
function evalSide(toks){
  if(!toks.length||toks[0].type!=="num"||toks.length%2===0)return null;
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

/* ─── SOUND ENGINE (Web Audio API) ──────────────────────── */
function useSounds(){
  const ctx=useRef(null);
  const getCtx=()=>{
    if(!ctx.current)ctx.current=new(window.AudioContext||window.webkitAudioContext)();
    if(ctx.current.state==="suspended")ctx.current.resume();
    return ctx.current;
  };
  const p=(fn)=>{try{fn(getCtx());}catch(e){}};
  const osc=(ac,freq,type,vol,dur,delay=0)=>{
    const o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(ac.destination);
    o.type=type;o.frequency.value=freq;
    const t=ac.currentTime+delay;
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.start(t);o.stop(t+dur+0.05);
  };
  return{
    click:()=>p(ac=>osc(ac,900,"sine",0.07,0.06)),
    place:()=>p(ac=>{osc(ac,300,"sine",0.12,0.08);const o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.type="sine";o.frequency.setValueAtTime(280,ac.currentTime);o.frequency.exponentialRampToValueAtTime(60,ac.currentTime+0.1);g.gain.setValueAtTime(0.14,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.1);o.start();o.stop(ac.currentTime+0.12);}),
    ret:()=>p(ac=>osc(ac,500,"sine",0.07,0.08)),
    draw:()=>p(ac=>{osc(ac,600,"sine",0.07,0.05);osc(ac,400,"sine",0.05,0.06,0.04);}),
    correct:()=>p(ac=>{[[523,0],[659,0.08],[784,0.16],[1047,0.24]].forEach(([f,d])=>osc(ac,f,"triangle",0.13,0.35,d));}),
    combo:(n)=>p(ac=>{const b=523*(1+(n-2)*0.08);[[b,0],[b*1.25,0.07],[b*1.5,0.14],[b*2,0.21]].forEach(([f,d])=>osc(ac,f,"triangle",0.12,0.28,d));}),
    wrong:()=>p(ac=>{const o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.type="sawtooth";o.frequency.setValueAtTime(180,ac.currentTime);o.frequency.exponentialRampToValueAtTime(60,ac.currentTime+0.3);g.gain.setValueAtTime(0.1,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.3);o.start();o.stop(ac.currentTime+0.32);}),
    event:()=>p(ac=>{[[392,0],[494,0.15],[587,0.3]].forEach(([f,d])=>osc(ac,f,"sine",0.09,0.45,d));}),
    pass:()=>p(ac=>{osc(ac,400,"sine",0.07,0.12);osc(ac,300,"sine",0.05,0.14,0.08);}),
    goalDone:()=>p(ac=>{[[784,0],[988,0.09],[1175,0.18],[1568,0.27]].forEach(([f,d])=>osc(ac,f,"triangle",0.11,0.3,d));}),
    achievement:()=>p(ac=>{[[523,0],[659,0.06],[784,0.12],[1047,0.18],[1319,0.26]].forEach(([f,d])=>osc(ac,f,"triangle",0.1,0.4,d));}),
    timer:()=>p(ac=>osc(ac,800,"square",0.05,0.05)),
    timerEnd:()=>p(ac=>osc(ac,400,"sawtooth",0.12,0.5)),
    gameOver:()=>p(ac=>{[[262,0],[330,0.2],[392,0.4],[523,0.65]].forEach(([f,d])=>osc(ac,f,"triangle",0.12,0.9,d));}),
    start:()=>p(ac=>{[[392,0],[523,0.12],[659,0.24],[784,0.38]].forEach(([f,d])=>osc(ac,f,"triangle",0.1,0.5,d));}),
  };
}

/* ─── SMALL COMPONENTS ───────────────────────────────────── */
const G={bg:"#07090F",gold:"#C8A84B",green:"#64DC9E",coral:"#E87040"};

function NumCard({card,sel,tiny,onClick}){
  const gold=card.points>=5;
  const w=tiny?46:62,h=tiny?64:86;
  return(<button onClick={onClick} style={{width:w,height:h,flexShrink:0,borderRadius:10,cursor:"pointer",background:gold?"#1C2C08":"#132040",border:`2px solid ${sel?"#FFD700":gold?"#A89030":"#2A4880"}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transform:sel?"scale(1.1)":"scale(1)",boxShadow:sel?"0 0 0 2.5px #FFD700,0 0 18px #FFD70038":"0 2px 8px rgba(0,0,0,.5)",transition:"all .12s",position:"relative",outline:"none"}}>
    <span style={{fontFamily:"Georgia,serif",fontWeight:900,fontSize:tiny?19:30,color:gold?"#FFE890":"#C8E4FF",lineHeight:1}}>{card.value}</span>
    <span style={{fontSize:7,color:gold?"#A89030":"#304870",fontFamily:"monospace",marginTop:2}}>{card.points}pt</span>
    {sel&&<span style={{position:"absolute",top:-5,right:-5,width:11,height:11,background:"#FFD700",borderRadius:"50%",boxShadow:"0 0 8px #FFD700"}}/>}
  </button>);
}
function OpCard({card,sel,tiny,onBoard,onClick,onToggle}){
  const wild=!!card.wild;
  const w=tiny?40:52,h=tiny?58:74;
  return(<button onClick={onClick} style={{width:w,height:h,flexShrink:0,borderRadius:10,cursor:"pointer",background:wild?"#20103A":"#0C2018",border:`2px solid ${sel?"#FFD700":wild?"#6030A0":"#1E5030"}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transform:sel?"scale(1.1)":"scale(1)",boxShadow:sel?"0 0 0 2.5px #FFD700":"0 2px 8px rgba(0,0,0,.5)",transition:"all .12s",position:"relative",outline:"none"}}>
    <span style={{fontFamily:"Georgia,serif",fontWeight:900,fontSize:tiny?17:26,color:wild?"#C8A0FF":"#80E8B8",lineHeight:1}}>{onBoard&&wild?card.resolved:card.symbol}</span>
    {onBoard&&wild&&<button onClick={e=>{e.stopPropagation();onToggle&&onToggle();}} style={{position:"absolute",bottom:-9,left:"50%",transform:"translateX(-50%)",fontSize:9,background:"#5828A0",color:"#EEE",border:"none",borderRadius:4,padding:"1px 6px",cursor:"pointer",zIndex:10,fontFamily:"monospace"}}>⇌</button>}
    <span style={{fontSize:7,color:wild?"#6828A0":"#1E5030",fontFamily:"monospace",marginTop:2}}>{card.points}pt</span>
    {sel&&<span style={{position:"absolute",top:-5,right:-5,width:11,height:11,background:"#FFD700",borderRadius:"50%"}}/>}
  </button>);
}
function BoardSlot({card,idx,eqPos,hasSel,onPlace,onReturn,onToggle}){
  if(idx===eqPos-1)return(<div style={{width:50,height:70,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:10,border:"2.5px solid #C8A84B",background:"linear-gradient(160deg,#0C1820,#060E14)",boxShadow:"0 0 14px #C8A84B20"}}><span style={{fontFamily:"Georgia,serif",fontWeight:900,fontSize:34,color:"#FFE070",lineHeight:1}}>=</span><span style={{color:"#C8A84B40",fontSize:7,fontFamily:"monospace"}}>P{eqPos}</span></div>);
  if(!card)return(<button onClick={()=>hasSel&&onPlace(idx)} style={{width:50,height:70,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,border:`2px ${hasSel?"solid":"dashed"} ${hasSel?"#FFD70055":"#FFFFFF12"}`,background:hasSel?"#FFD70006":"transparent",cursor:hasSel?"pointer":"default",transition:"all .2s",outline:"none"}}><span style={{color:"#FFFFFF10",fontSize:10,fontFamily:"monospace"}}>{idx+1}</span></button>);
  return card.type==="num"?<NumCard card={card} tiny onBoard onClick={()=>onReturn(idx)}/>:<OpCard card={card} tiny onBoard onClick={()=>onReturn(idx)} onToggle={()=>onToggle(idx)}/>;
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

  const addLog=(m,c="#66788A")=>setLog(p=>[{m,c,k:uid()},...p].slice(0,7));
  const doFlash=(m,c=G.coral)=>{setFlash({m,c});setTimeout(()=>setFlash(null),1800);};

  const checkAchievement=useCallback((state)=>{
    const earned=ACHIEVEMENTS.find(a=>a.cond(state));
    if(earned){setAchievement(earned);snd.achievement();setTimeout(()=>setAchievement(null),2500);}
  },[]);

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
    const evCard=d.evts[0]||EVENTS[0];
    let d2={...d,evts:d.evts.slice(1)};
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
    setOpsUsed({"+":0,"-":0,"×":0,"÷":0});setLog([]);
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
  const toggleWild=idx=>{
    const card=board[idx];if(!card?.wild)return;
    const b=[...board];const i=card.wild.indexOf(card.resolved);
    b[idx]={...card,resolved:card.wild[(i+1)%card.wild.length]};
    setBoard(b);snd.click();
  };
  const undoAction=()=>{
    if(!undoState)return;
    setBoard(undoState.board);setHand(undoState.hand);setSel(null);setUndoState(null);snd.ret();
    addLog("ย้อนการวาง");
  };
  const drawOp=()=>{
    if(!decks||phase!=="play")return;
    if(hand.ops.length>=MAX_OPS){doFlash(`เครื่องหมายเต็มแล้ว (สูงสุด ${MAX_OPS} ใบ)`,"#C8A84B");return;}
    const{drawn,dk}=drawO(decks,1);
    if(!drawn.length){doFlash("กองเครื่องหมายหมดแล้ว");return;}
    setDecks(dk);setHand(h=>({...h,ops:[...h.ops,...drawn]}));
    snd.draw();addLog(`จั่ว: ${drawn[0].symbol}`,G.green);
  };
  const showHintFn=()=>{
    if(hintUsed>=diff.hintMax){doFlash(`ใช้ Hint ครบ ${diff.hintMax} ครั้งแล้ว`,"#C8A84B");return;}
    setHintUsed(h=>h+1);setShowHint(true);
  };

  const submit=()=>{
    if(phase!=="play")return;
    const r=validateBoard(board,eqPos);
    if(!r.ok){snd.wrong();doFlash("✗ "+r.msg);addLog("✗ "+r.msg,G.coral);return;}
    const{pts,notes}=calcScore(board,ev,lk,firstRound,combo);
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
    setResult({ok:true,pts:totalPts,basePts:pts,goalBonus,notes,eq:`${r.lv} = ${r.rv}`,c:nc});
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
      </div>
    </div>
  );

  /* ── DIFFICULTY SELECT ── */
  if(phase==="diff")return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,background:"radial-gradient(ellipse at 50% -10%,#0A1830,#050A12,#030609)"}}>
      <div style={{maxWidth:300,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:36,marginBottom:6}}>🎮</div>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:900,color:"#E8F4FF",margin:0}}>เลือกระดับความยาก</h2>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
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
        </div>
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
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:G.bg,color:"#E8F4FF",fontFamily:"system-ui,-apple-system,sans-serif",maxWidth:500,margin:"0 auto"}}>

      {/* Flash */}
      {flash&&<div style={{position:"fixed",top:62,left:"50%",transform:"translateX(-50%)",background:flash.c+"1A",color:flash.c,border:`1px solid ${flash.c}50`,borderRadius:12,padding:"7px 18px",fontSize:13,fontFamily:"monospace",fontWeight:"bold",zIndex:1000,pointerEvents:"none",whiteSpace:"nowrap"}}>{flash.m}</div>}
      {/* Achievement */}
      {achievement&&<div style={{position:"fixed",top:100,left:"50%",transform:"translateX(-50%)",background:"#1A2A10",color:"#C8E840",border:"1px solid #90B02050",borderRadius:14,padding:"10px 20px",fontSize:14,fontFamily:"monospace",fontWeight:"bold",zIndex:1001,pointerEvents:"none",textAlign:"center",boxShadow:"0 0 30px #90B02030"}}>{achievement.icon} {achievement.text}</div>}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:"1px solid #FFFFFF0D",background:"#050810",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",gap:10,fontSize:11,fontFamily:"monospace",alignItems:"center"}}>
          <span style={{color:diff.col,fontSize:12}}>{diff.icon}</span>
          <span style={{color:"#FFFFFF35"}}>รอบ <b style={{color:"#B8D4F0"}}>{round}</b></span>
          <span style={{color:"#FFFFFF25"}}>🃏<span style={{color:"#B8D4F0"}}>{decks?.nums.length||0}</span></span>
          {diff.timer>0&&timeLeft>0&&<span style={{color:timeLeft<=5?G.coral:G.gold,fontWeight:900,fontSize:14,fontFamily:"monospace",border:`1px solid ${timeLeft<=5?G.coral:G.gold}50`,borderRadius:6,padding:"1px 7px"}}>⏱{timeLeft}</span>}
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{color:G.gold,fontSize:28,fontWeight:900,fontFamily:"Georgia,serif",lineHeight:1}}>{score}</div>
          <div style={{color:G.gold+"35",fontSize:8,fontFamily:"monospace",letterSpacing:"0.15em"}}>SCORE</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {combo>1&&<div style={{color:G.coral,fontWeight:900,fontSize:14}}>🔥×{combo}</div>}
          <button onClick={showHintFn} style={{color:hintUsed>=diff.hintMax?"#FFFFFF20":G.gold+"70",border:`1px solid ${hintUsed>=diff.hintMax?"#FFFFFF10":G.gold+"28"}`,background:"transparent",borderRadius:8,padding:"5px 9px",fontSize:12,cursor:"pointer",fontFamily:"monospace"}}
            title={`Hint เหลือ ${diff.hintMax-hintUsed}/${diff.hintMax}`}>💡{diff.hintMax-hintUsed}</button>
        </div>
      </div>

      {/* Event */}
      {ev&&<div style={{margin:"8px 14px 0",padding:"8px 12px",borderRadius:12,display:"flex",alignItems:"center",gap:10,background:"#18100680",border:`1px solid ${ev.col}30`}}>
        <span style={{fontSize:20}}>{ev.icon}</span>
        <div><span style={{color:ev.col,fontWeight:700,fontSize:12,fontFamily:"monospace",letterSpacing:"0.05em"}}>{ev.name}</span><span style={{color:"#FFFFFF35",fontSize:12,marginLeft:8}}>{ev.id==="lucky"?`เลขมงคล: ${lk}`:ev.desc}</span></div>
      </div>}

      {/* Round Goal */}
      {goal&&<div style={{margin:"5px 14px 0",padding:"7px 12px",borderRadius:10,display:"flex",alignItems:"center",gap:8,background:goalDone?"#0A2010":"#0A1020",border:`1px solid ${goalDone?"#64DC9E60":"#3060A050"}`}}>
        <span style={{fontSize:16}}>{goalDone?"✅":goal.icon}</span>
        <div><span style={{color:goalDone?G.green:"#5080C0",fontWeight:600,fontSize:11,fontFamily:"monospace"}}>เป้าหมาย: {goal.text}</span><span style={{color:"#FFFFFF30",fontSize:11,marginLeft:6}}>(+{goal.bonus}pt)</span></div>
      </div>}

      {/* Position Selection */}
      {phase==="position"&&posCards.length>0&&<div style={{padding:"10px 14px 0"}}>
        <div style={{color:"#FFFFFF28",fontSize:10,fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:8}}>🎲 เลือกตำแหน่งของ =</div>
        <div style={{display:"flex",gap:10}}>
          {posCards.map((p,i)=>(
            <button key={i} onClick={()=>choosePos(p)} style={{flex:1,padding:"14px 10px",borderRadius:14,border:"2px solid #284A70",background:"#0E1C2C",cursor:"pointer",transition:"all .15s",outline:"none"}}
              onMouseOver={e=>{e.currentTarget.style.borderColor=G.green;e.currentTarget.style.background="#142030";}}
              onMouseOut={e=>{e.currentTarget.style.borderColor="#284A70";e.currentTarget.style.background="#0E1C2C";}}>
              <div style={{fontFamily:"Georgia,serif",fontWeight:900,fontSize:46,color:"#90B8E0",lineHeight:1}}>{p}</div>
              <div style={{fontSize:10,color:"#4A7090",fontFamily:"monospace",marginTop:5}}>ซ้าย {p-1} / ขวา {8-p}</div>
              <div style={{display:"flex",gap:2,justifyContent:"center",marginTop:8}}>
                {Array(8).fill(0).map((_,j)=><div key={j} style={{width:9,height:9,borderRadius:2,background:j===p-1?"#C8A84B":j<p-1?"#3870C0":"#FFFFFF18"}}/>)}
              </div>
            </button>
          ))}
        </div>
      </div>}

      {/* Board */}
      <div style={{padding:"10px 14px 0"}}>
        <div style={{color:"#FFFFFF28",fontSize:9,fontFamily:"monospace",letterSpacing:"0.14em",marginBottom:8}}>กระดาน</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",background:"#0A1018",padding:10,borderRadius:14,border:"1px solid #FFFFFF08",boxShadow:"inset 0 2px 8px rgba(0,0,0,.4)"}}>
          {Array(8).fill(0).map((_,i)=>(
            <BoardSlot key={i} card={board[i]} idx={i} eqPos={eqPos} hasSel={!!sel&&phase==="play"} onPlace={placeCard} onReturn={returnCard} onToggle={toggleWild}/>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginTop:5}}>
          {sel&&phase==="play"&&<span style={{color:"#FFD70060",fontSize:10,fontFamily:"monospace"}}>← กดช่องกระดานเพื่อวาง</span>}
          {undoState&&phase==="play"&&<button onClick={undoAction} style={{fontSize:10,fontFamily:"monospace",background:"transparent",border:"1px solid #FFFFFF15",borderRadius:6,padding:"2px 8px",color:"#FFFFFF35",cursor:"pointer"}}>↩ undo</button>}
        </div>
      </div>

      {/* Result */}
      {phase==="result"&&result&&<div style={{margin:"8px 14px 0",padding:14,borderRadius:14,border:`1px solid ${result.ok?G.green+"45":"#FFFFFF10"}`,background:result.ok?"#081A1090":"#FFFFFF04"}}>
        {result.ok?(<>
          <div style={{color:G.green,fontWeight:700,fontSize:15,marginBottom:8}}>✓ ถูกต้อง! <span style={{fontFamily:"monospace"}}>{result.eq}</span></div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
            {result.notes.map((n,i)=><span key={i} style={{background:G.gold+"18",color:G.gold,fontSize:11,padding:"3px 9px",borderRadius:8,fontFamily:"monospace"}}>{n}</span>)}
            <span style={{background:G.green+"18",color:G.green,fontSize:11,padding:"3px 9px",borderRadius:8,fontFamily:"monospace",fontWeight:700}}>+{result.pts} pt{result.c>1?`  🔥×${result.c}`:""}</span>
          </div>
          <button onClick={nextRound} style={{width:"100%",padding:"10px 0",borderRadius:10,fontWeight:700,fontSize:14,background:"#142A1C",color:G.green,border:`1px solid ${G.green}40`,cursor:"pointer",outline:"none"}}>รอบถัดไป →</button>
        </>):(<>
          <div style={{color:"#FFFFFF35",fontSize:14,marginBottom:8}}>{diff.comboReset?"ผ่านตา — Combo Reset":"ผ่านตา"}</div>
          <button onClick={nextRound} style={{width:"100%",padding:"10px 0",borderRadius:10,fontSize:14,color:"#FFFFFF30",border:"1px solid #FFFFFF10",background:"transparent",cursor:"pointer",outline:"none"}}>รอบถัดไป →</button>
        </>)}
      </div>}

      {/* Number Hand */}
      <div style={{padding:"10px 14px 0"}}>
        <div style={{color:"#FFFFFF28",fontSize:9,fontFamily:"monospace",letterSpacing:"0.14em",marginBottom:8}}>ตัวเลขในมือ <span style={{color:"#FFFFFF15"}}>({hand.nums.length}/6)</span></div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",minHeight:68}}>
          {hand.nums.map(c=><NumCard key={c.id} card={c} sel={sel?.id===c.id} onClick={()=>pickCard("num",c)}/>)}
          {!hand.nums.length&&<span style={{color:"#FFFFFF15",fontSize:13,alignSelf:"center"}}>ไม่มีตัวเลขในมือ</span>}
        </div>
      </div>

      {/* Operator Hand */}
      <div style={{padding:"6px 14px 0"}}>
        <div style={{color:"#FFFFFF28",fontSize:9,fontFamily:"monospace",letterSpacing:"0.14em",marginBottom:8}}>
          เครื่องหมาย <span style={{color:hand.ops.length>=MAX_OPS?G.coral+"80":"#FFFFFF15"}}>({hand.ops.length}/{MAX_OPS})</span>
          {hand.ops.length>=MAX_OPS&&<span style={{color:G.coral+"70",fontSize:9,marginLeft:6}}>เต็มแล้ว — วางลงกระดานก่อน</span>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",minHeight:60}}>
          {hand.ops.map(c=><OpCard key={c.id} card={c} sel={sel?.id===c.id} onClick={()=>pickCard("op",c)}/>)}
        </div>
      </div>

      {/* Action Buttons */}
      {phase==="play"&&<div style={{display:"flex",gap:6,padding:"10px 14px"}}>
        <button onClick={drawOp} disabled={hand.ops.length>=MAX_OPS} style={{flex:1,padding:"11px 0",borderRadius:12,fontSize:12,fontFamily:"monospace",border:`1px solid ${hand.ops.length>=MAX_OPS?"#FFFFFF10":G.green+"35"}`,color:hand.ops.length>=MAX_OPS?"#FFFFFF20":G.green+"75",background:"transparent",cursor:hand.ops.length>=MAX_OPS?"not-allowed":"pointer",transition:"all .15s",outline:"none"}}>♣ จั่ว</button>
        <button onClick={submit} disabled={!canSubmit}
  style={{flex:3,padding:"11px 0",borderRadius:12,fontWeight:700,fontSize:15,
    background:canSubmit?"linear-gradient(140deg,#142A1C,#1A3824)":"#1A1A1A",
    color:canSubmit?G.green:"#FFFFFF20",
    border:`1px solid ${canSubmit?G.green+"45":"#FFFFFF08"}`,
    cursor:canSubmit?"pointer":"not-allowed",
    letterSpacing:"0.04em",
    boxShadow:canSubmit?`0 0 24px ${G.green}18`:"none",
    transition:"all .15s",outline:"none",opacity:canSubmit?1:0.45}}
  onMouseOver={e=>{if(canSubmit)e.currentTarget.style.background="linear-gradient(140deg,#1A3424,#204830)";}}
  onMouseOut={e=>{if(canSubmit)e.currentTarget.style.background="linear-gradient(140deg,#142A1C,#1A3824)";}}>
  {canSubmit?"✓ ยืนยันสมการ":"วางการ์ดทั้งสองฝั่ง ="}
</button>
        <button onClick={handlePass} style={{flex:1,padding:"11px 0",borderRadius:12,fontSize:12,fontFamily:"monospace",border:"1px solid #FFFFFF10",color:"#FFFFFF28",background:"transparent",cursor:"pointer",transition:"all .15s",outline:"none"}} onMouseOver={e=>e.currentTarget.style.color="#FFFFFF50"} onMouseOut={e=>e.currentTarget.style.color="#FFFFFF28"}>⏭ ผ่าน</button>
      </div>}

      {/* Log */}
      <div style={{padding:"0 14px 16px"}}>
        {log.map(l=><div key={l.k} style={{color:l.c,fontSize:10,fontFamily:"monospace",opacity:.6,marginBottom:3}}>{l.m}</div>)}
      </div>

      {showHint&&<HintModal hand={hand} board={board} eqPos={eqPos} onClose={()=>setShowHint(false)}/>}
    </div>
  );
}
