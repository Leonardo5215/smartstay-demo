// ============================================================
//  SmartStay Hotel Demo v2 — WebSocket Server
// ============================================================
const express = require("express");
const http    = require("http");
const { WebSocketServer } = require("ws");
const path    = require("path");

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.get("/client",  (_, res) => res.sendFile(path.join(__dirname, "public", "client.html")));
app.get("/control", (_, res) => res.sendFile(path.join(__dirname, "public", "control.html")));

// ─── Constants ────────────────────────────────────────────────────────────────
const KWH_PRICE_DOP = 9.53;
const HVAC_KWH_HR   = 1.5;
const LIGHTS_KWH_HR = 0.15;
const TOTAL_KWH_HR  = HVAC_KWH_HR + LIGHTS_KWH_HR;

const BLOCKS      = ["A","B","C","D"];
const BLOCK_NAMES = { A:"Ala Norte", B:"Ala Sur", C:"Ala Este", D:"Ala Oeste" };

const OCCUPIED_PATTERN = [
  true,true,false,true,false,
  true,false,true,true,false,
  false,true,true,false,true,
  true,true,false,false,true
];

const GUESTS = [
  {name:"Carlos Méndez",   phone:"+18095550101"},{name:"Ana Torres",      phone:"+18095550102"},
  {name:"Luis Fernández",  phone:"+18095550103"},{name:"María Rodríguez", phone:"+18095550104"},
  {name:"Jorge Castillo",  phone:"+18095550105"},{name:"Sofía Herrera",   phone:"+18095550106"},
  {name:"Pedro Vargas",    phone:"+18095550107"},{name:"Lucía Morales",   phone:"+18095550108"},
  {name:"Diego Ruiz",      phone:"+18095550109"},{name:"Elena Cruz",      phone:"+18095550110"},
  {name:"Roberto Vidal",   phone:"+18095550111"},{name:"Carmen Santos",   phone:"+18095550112"},
  {name:"Miguel Ángel",    phone:"+18095550113"},{name:"Patricia Lima",   phone:"+18095550114"},
  {name:"Fernando Díaz",   phone:"+18095550115"},{name:"Isabel Moreno",   phone:"+18095550116"},
  {name:"Alejandro Reyes", phone:"+18095550117"},{name:"Gabriela Torres", phone:"+18095550118"},
  {name:"Sebastián Cruz",  phone:"+18095550119"},{name:"Valentina López", phone:"+18095550120"},
];

const STAFF = [
  {id:"C001",name:"María González",role:"cleaning",    avatar:"MG"},
  {id:"C002",name:"Rosa Pérez",    role:"cleaning",    avatar:"RP"},
  {id:"C003",name:"Carmen López",  role:"cleaning",    avatar:"CL"},
  {id:"C004",name:"Ana Martínez",  role:"cleaning",    avatar:"AM"},
  {id:"C005",name:"Luisa Díaz",    role:"cleaning",    avatar:"LD"},
  {id:"M001",name:"Roberto Vega",  role:"maintenance", avatar:"RV"},
  {id:"M002",name:"Felipe Soto",   role:"maintenance", avatar:"FS"},
];

function makeRooms() {
  return BLOCKS.flatMap((block, bi) =>
    Array.from({length:5}, (_,ri) => {
      const idx = bi*5+ri;
      const occ = OCCUPIED_PATTERN[idx];
      return {
        id: idx+1, block, blockName: BLOCK_NAMES[block],
        number: `${block}${String(ri+1).padStart(2,"0")}`,
        floor: ri+1, guest: GUESTS[idx],
        hvacMode:  occ?"comfort":"idle",
        lightsOn:  occ,
        guestPresent: occ,
        status:    occ?"occupied":"empty",
        activeStaff:null, staffEnteredAt:null,
        tokenId:`GUE-${String(idx+1).padStart(3,"0")}`,
        idleSince: occ ? null : Date.now(),
      };
    })
  );
}

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  rooms:[], events:[], biLogs:[], whatsappLog:[], energyLog:[],
  dayStart: Date.now(),
};
state.rooms = makeRooms();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const nowFull = () => new Date().toLocaleString("es-DO",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
const nowTime = () => new Date().toLocaleTimeString("es-DO",{hour12:false});
const fmtDOP  = n => `DOP $${Number(n).toFixed(2)}`;
const fmtKwh  = n => `${Number(n).toFixed(3)} kWh`;
const elapsedStr = from => { const s=Math.floor((Date.now()-from)/1000); return `${Math.floor(s/60)}m ${s%60}s`; };
const elapsedHrs = from => (Date.now()-from)/3600000;

function addEvent(text,type="info"){
  state.events=[{id:Date.now()+Math.random(),text,type,time:nowTime()},...state.events].slice(0,80);
}

// ─── Energy ───────────────────────────────────────────────────────────────────
function computeLiveEnergy(){
  let kwh=0;
  state.rooms.forEach(r=>{ if(r.idleSince) kwh+=elapsedHrs(r.idleSince)*TOTAL_KWH_HR; });
  state.energyLog.forEach(e=>kwh+=Number(e.kwh));
  return {kwh, dop:kwh*KWH_PRICE_DOP};
}

function closeEnergySession(r){
  if(!r.idleSince) return;
  const hrs=elapsedHrs(r.idleSince);
  const kwh=hrs*TOTAL_KWH_HR;
  if(hrs>0.0001) state.energyLog.push({
    roomId:r.id, room:`Hab. ${r.number}`, block:r.block,
    start:new Date(r.idleSince).toLocaleString("es-DO"),
    end:nowFull(), hoursIdle:hrs.toFixed(4), kwh, dop:kwh*KWH_PRICE_DOP,
  });
  r.idleSince=null;
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
async function sendWhatsApp(to,name,message){
  state.whatsappLog=[{to,name,message,time:nowFull(),sent:true},...state.whatsappLog].slice(0,60);
  console.log(`[WA SIM] ${to}: ${message}`);
}

// ─── Actions ──────────────────────────────────────────────────────────────────
function handleToggleGuest(roomId){
  const r=state.rooms.find(x=>x.id===roomId); if(!r) return;
  if(!r.guestPresent){
    closeEnergySession(r);
    r.guestPresent=true; r.hvacMode=r._prevHvac||"comfort";
    r.lightsOn=r._prevLights!==undefined?r._prevLights:true;
    r._prevHvac=undefined; r._prevLights=undefined;
    r.status=r.activeStaff?(r.activeStaff.role==="cleaning"?"cleaning":"maintenance"):"occupied";
    addEvent(`🔑 ${r.guest.name} entró · Hab. ${r.number} · HVAC→Comfort · 💡ON`,"guest_in");
  } else {
    r._prevHvac=r.hvacMode; r._prevLights=r.lightsOn;
    r.guestPresent=false; r.hvacMode="idle"; r.lightsOn=false; r.idleSince=Date.now();
    r.status=r.activeStaff?(r.activeStaff.role==="cleaning"?"cleaning":"maintenance"):"empty";
    addEvent(`🚶 ${r.guest.name} salió · Hab. ${r.number} · HVAC→Idle · 🌑OFF ⚡`,"guest_out");
  }
}

async function handleSendStaff(roomId,staffId){
  const r=state.rooms.find(x=>x.id===roomId);
  const s=STAFF.find(x=>x.id===staffId);
  if(!r||!s||state.rooms.some(x=>x.activeStaff?.id===staffId)) return;
  r.activeStaff=s; r.staffEnteredAt=Date.now();
  r.status=s.role==="cleaning"?"cleaning":"maintenance";
  const msg=s.role==="cleaning"
    ?`Estimado/a ${r.guest.name}, ${s.name} está realizando la limpieza en su habitación ${r.number}. Gracias. — SmartStay`
    :`Estimado/a ${r.guest.name}, ${s.name} de Mantenimiento atiende su habitación ${r.number}. — SmartStay`;
  await sendWhatsApp(r.guest.phone,r.guest.name,msg);
  addEvent(`${s.role==="cleaning"?"🧹":"🔧"} ${s.name} → Hab. ${r.number} · 📱${r.guest.name}`,s.role);
  state.biLogs.push({
    id:`${roomId}-${Date.now()}`,roomId,
    room:`Hab. ${r.number}`,block:r.block,
    staff:s.name,staffId:s.id,type:s.role,
    start:nowFull(),end:null,duration:null,
    date:new Date().toLocaleDateString("es-DO"),
  });
}

function handleRemoveStaff(roomId){
  const r=state.rooms.find(x=>x.id===roomId); if(!r||!r.activeStaff) return;
  const dur=elapsedStr(r.staffEnteredAt);
  addEvent(`✅ ${r.activeStaff.name} completó · Hab. ${r.number} · ${dur}`,"complete");
  const log=state.biLogs.find(l=>l.roomId===roomId&&!l.end);
  if(log){log.end=nowFull();log.duration=dur;}
  r.activeStaff=null; r.staffEnteredAt=null;
  r.status=r.guestPresent?"occupied":"empty";
}

function handleReset(){
  state={rooms:makeRooms(),events:[],biLogs:[],whatsappLog:[],energyLog:[],dayStart:Date.now()};
  addEvent("🔄 Sistema reiniciado","info");
}

// ─── Report ───────────────────────────────────────────────────────────────────
function buildReportData(){
  const energy=computeLiveEnergy();
  const completed=state.biLogs.filter(l=>l.end);
  const cleanings=completed.filter(l=>l.type==="cleaning");
  const maints=completed.filter(l=>l.type==="maintenance");
  function avgDur(logs){
    if(!logs.length) return "—";
    const secs=logs.map(l=>{const m=l.duration?.match(/(\d+)m\s*(\d+)s/);return m?parseInt(m[1])*60+parseInt(m[2]):0;});
    const avg=secs.reduce((a,b)=>a+b,0)/secs.length;
    return `${Math.floor(avg/60)}m ${Math.round(avg%60)}s`;
  }
  const occupied=state.rooms.filter(r=>["occupied","cleaning","maintenance"].includes(r.status)).length;
  const blockSummary=BLOCKS.map(b=>{
    const br=state.rooms.filter(r=>r.block===b);
    return {block:b,name:BLOCK_NAMES[b],occupied:br.filter(r=>["occupied","cleaning","maintenance"].includes(r.status)).length,total:br.length,idle:br.filter(r=>r.hvacMode==="idle").length};
  });
  const staffSummary={};
  completed.forEach(l=>{if(!staffSummary[l.staff])staffSummary[l.staff]={cleaning:0,maintenance:0};staffSummary[l.staff][l.type]++;});
  const date=new Date().toLocaleDateString("es-DO",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  return {
    date,occupied,totalRooms:state.rooms.length,
    occPct:Math.round((occupied/state.rooms.length)*100),
    idleNow:state.rooms.filter(r=>r.hvacMode==="idle").length,
    cleanings:cleanings.length,avgCleanDur:avgDur(cleanings),
    maints:maints.length,avgMaintDur:avgDur(maints),
    energy,blockSummary,staffSummary,
    generatedAt:nowFull(),
  };
}

async function sendDailyReport(){
  const d=buildReportData();
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
body{font-family:Georgia,serif;background:#f8f9fa;margin:0;padding:0}
.w{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)}
.hd{background:#0a0f1c;padding:32px;text-align:center}.hd h1{color:#00d4c8;font-size:28px;margin:0;letter-spacing:3px}
.hd p{color:#475569;font-size:12px;margin:8px 0 0}.badge{display:inline-block;background:#0d1525;color:#00d4c8;padding:4px 14px;border-radius:20px;font-size:11px;margin-top:12px}
.sec{padding:24px 32px;border-bottom:1px solid #f1f5f9}.sec h2{font-size:12px;color:#94a3b8;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px}
.krow{display:flex;gap:10px;flex-wrap:wrap}.kpi{flex:1;min-width:90px;background:#f8fafc;border-radius:8px;padding:14px;text-align:center;border:1px solid #e2e8f0}
.kpi .v{font-size:26px;font-weight:700;color:#0a0f1c;line-height:1}.kpi .l{font-size:10px;color:#94a3b8;margin-top:4px}
.ebox{background:#0a0f1c;border-radius:10px;padding:20px;text-align:center}
.ebox .big{font-size:36px;font-weight:700;color:#f59e0b;line-height:1}.ebox .sub{color:#64748b;font-size:11px;margin-top:8px}.ebox .kwh{font-size:18px;color:#94a3b8;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f8fafc;padding:8px 10px;text-align:left;color:#64748b;font-weight:600;font-size:10px;text-transform:uppercase}
td{padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#334155}
.ft{background:#f8fafc;padding:20px;text-align:center}.ft p{color:#94a3b8;font-size:10px;margin:0}
</style></head><body><div class="w">
<div class="hd"><h1>SMARTSTAY</h1><p>RESUMEN EJECUTIVO DIARIO</p><div class="badge">${d.date}</div></div>
<div class="sec"><h2>Ocupación</h2><div class="krow">
<div class="kpi"><div class="v">${d.occPct}%</div><div class="l">Ocupación</div></div>
<div class="kpi"><div class="v">${d.occupied}/${d.totalRooms}</div><div class="l">Habitaciones</div></div>
<div class="kpi"><div class="v">${d.idleNow}</div><div class="l">HVAC Idle ahora</div></div>
</div></div>
<div class="sec"><h2>Ahorro Energético</h2><div class="ebox">
<div class="big">${fmtDOP(d.energy.dop)}</div><div class="kwh">${fmtKwh(d.energy.kwh)}</div>
<div class="sub">Acumulado hoy · DOP$9.53/kWh · HVAC 1.5kWh + Luces 0.15kWh por hab.</div>
</div></div>
<div class="sec"><h2>Personal</h2><div class="krow">
<div class="kpi"><div class="v">${d.cleanings}</div><div class="l">Limpiezas</div></div>
<div class="kpi"><div class="v">${d.avgCleanDur}</div><div class="l">Prom. limpieza</div></div>
<div class="kpi"><div class="v">${d.maints}</div><div class="l">Mantenimientos</div></div>
<div class="kpi"><div class="v">${d.avgMaintDur}</div><div class="l">Prom. mant.</div></div>
</div></div>
<div class="sec"><h2>Por Ala</h2><table><thead><tr><th>Ala</th><th>Nombre</th><th>Ocup.</th><th>Idle</th></tr></thead><tbody>
${d.blockSummary.map(b=>`<tr><td><b>${b.block}</b></td><td>${b.name}</td><td>${b.occupied}/${b.total}</td><td>${b.idle}</td></tr>`).join("")}
</tbody></table></div>
${Object.keys(d.staffSummary).length?`<div class="sec"><h2>Por Empleado</h2><table><thead><tr><th>Empleado</th><th>Limpiezas</th><th>Mant.</th></tr></thead><tbody>
${Object.entries(d.staffSummary).map(([n,s])=>`<tr><td>${n}</td><td>${s.cleaning}</td><td>${s.maintenance}</td></tr>`).join("")}
</tbody></table></div>`:""}
<div class="ft"><p>Generado: ${d.generatedAt} · SmartStay Hotel Intelligence · HA Yellow Token System</p></div>
</div></body></html>`;

  const recipients=[
    {email:process.env.EMAIL_GM||"gerente@hotel.com",name:"Gerente General"},
    {email:process.env.EMAIL_OPS||"operaciones@hotel.com",name:"Gerente de Operaciones"},
    {email:process.env.EMAIL_FIN||"finanzas@hotel.com",name:"Director Financiero"},
  ];
  console.log("[Email SIM] →",recipients.map(r=>r.email).join(", "));
  /* REAL SendGrid:
  const sg=require("@sendgrid/mail"); sg.setApiKey(process.env.SENDGRID_API_KEY);
  for(const r of recipients) await sg.send({to:r.email,from:"noreply@smartstay.com",
    subject:`SmartStay — Resumen ${new Date().toLocaleDateString("es-DO")}`,html});
  */
  addEvent(`📧 Resumen ejecutivo enviado a ${recipients.length} destinatarios`,"info");
  return {success:true,recipients:recipients.map(r=>r.email),report:d,html};
}

function scheduleNightReport(){
  const now=new Date(), next=new Date();
  next.setHours(23,0,0,0); if(next<=now) next.setDate(next.getDate()+1);
  setTimeout(async()=>{ await sendDailyReport(); broadcastState(); scheduleNightReport(); }, next-now);
  console.log(`[Scheduler] Reporte a las 23:00 en ~${Math.round((next-now)/60000)} min`);
}
scheduleNightReport();

// ─── REST ─────────────────────────────────────────────────────────────────────
app.get("/api/state", (_,res)=>res.json({...state,staff:STAFF,energy:computeLiveEnergy()}));
app.post("/api/report", async(_,res)=>{ const r=await sendDailyReport(); broadcastState(); res.json(r); });
app.get("/api/export/csv",(_,res)=>{
  const rows=["Habitacion,Bloque,Personal,Tipo,Inicio,Fin,Duracion,Fecha"];
  state.biLogs.forEach(l=>rows.push(`${l.room},${l.block},${l.staff},${l.type},"${l.start}","${l.end||"En curso"}",${l.duration||"-"},${l.date}`));
  res.setHeader("Content-Type","text/csv");
  res.setHeader("Content-Disposition","attachment; filename=smartstay_bi.csv");
  res.send(rows.join("\n"));
});
app.get("/api/export/json",(_,res)=>res.json({biLogs:state.biLogs,energy:computeLiveEnergy(),generatedAt:nowFull()}));

// ─── WebSocket ────────────────────────────────────────────────────────────────
function broadcastState(){
  const energy=computeLiveEnergy();
  const msg=JSON.stringify({type:"STATE",payload:{...state,staff:STAFF,energy}});
  wss.clients.forEach(ws=>{if(ws.readyState===1)ws.send(msg);});
}

wss.on("connection",ws=>{
  ws.send(JSON.stringify({type:"STATE",payload:{...state,staff:STAFF,energy:computeLiveEnergy()}}));
  ws.on("message",async raw=>{
    try{
      const {action,payload}=JSON.parse(raw);
      switch(action){
        case "TOGGLE_GUEST": handleToggleGuest(payload.roomId); break;
        case "SEND_STAFF":   await handleSendStaff(payload.roomId,payload.staffId); break;
        case "REMOVE_STAFF": handleRemoveStaff(payload.roomId); break;
        case "SEND_REPORT":  await sendDailyReport(); break;
        case "RESET":        handleReset(); break;
      }
      broadcastState();
    }catch(e){console.error("[WS]",e.message);}
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>{
  console.log(`\n🏨 SmartStay v2 · :${PORT}`);
  console.log(`   /client  → http://localhost:${PORT}/client`);
  console.log(`   /control → http://localhost:${PORT}/control\n`);
});
