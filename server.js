// ============================================================
//  SmartStay Hotel Demo — WebSocket Server
//  Node.js + ws + express
// ============================================================

const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Serve the two views ───────────────────────────────────
app.get("/client", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "client.html"))
);
app.get("/control", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "control.html"))
);

// ─── Initial State ─────────────────────────────────────────
const ROOMS_INIT = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  number: `${Math.floor(i / 2) + 1}0${(i % 2) + 1}`,
  floor: Math.floor(i / 2) + 1,
  guest: [
    { name: "Carlos Méndez",   phone: "+17875550101" },
    { name: "Ana Torres",      phone: "+17875550102" },
    { name: "Luis Fernández",  phone: "+17875550103" },
    { name: "María Rodríguez", phone: "+17875550104" },
    { name: "Jorge Castillo",  phone: "+17875550105" },
    { name: "Sofía Herrera",   phone: "+17875550106" },
    { name: "Pedro Vargas",    phone: "+17875550107" },
    { name: "Lucía Morales",   phone: "+17875550108" },
    { name: "Diego Ruiz",      phone: "+17875550109" },
    { name: "Elena Cruz",      phone: "+17875550110" },
  ][i],
  hvacMode: "comfort",   // comfort | idle
  lightsOn: true,
  guestPresent: true,
  status: "occupied",    // occupied | empty | cleaning | maintenance
  activeStaff: null,
  staffEnteredAt: null,
  tokenId: `GUE-${String(i + 1).padStart(3, "0")}`,
}));

const STAFF = [
  { id: "C001", name: "María González", role: "cleaning",     avatar: "MG" },
  { id: "C002", name: "Rosa Pérez",     role: "cleaning",     avatar: "RP" },
  { id: "C003", name: "Carmen López",   role: "cleaning",     avatar: "CL" },
  { id: "C004", name: "Ana Martínez",   role: "cleaning",     avatar: "AM" },
  { id: "C005", name: "Luisa Díaz",     role: "cleaning",     avatar: "LD" },
  { id: "M001", name: "Roberto Vega",   role: "maintenance",  avatar: "RV" },
  { id: "M002", name: "Felipe Soto",    role: "maintenance",  avatar: "FS" },
];

let state = {
  rooms: JSON.parse(JSON.stringify(ROOMS_INIT)),
  events: [],
  biLogs: [],
  whatsappLog: [],
};

// ─── Helpers ───────────────────────────────────────────────
function nowFull() {
  return new Date().toLocaleString("es-PR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}
function nowTime() {
  return new Date().toLocaleTimeString("es-PR", { hour12: false });
}
function elapsed(fromMs) {
  const diff = Math.floor((Date.now() - fromMs) / 1000);
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
}

function addEvent(text, type = "info") {
  const ev = { id: Date.now() + Math.random(), text, type, time: nowTime() };
  state.events = [ev, ...state.events].slice(0, 60);
  return ev;
}

// ─── WhatsApp Simulation (swap real call here later) ───────
async function sendWhatsApp(to, name, message) {
  const entry = { to, name, message, time: nowFull(), sent: true };
  state.whatsappLog = [entry, ...state.whatsappLog].slice(0, 50);
  console.log(`[WhatsApp SIM] → ${to}: ${message}`);

  // ── To enable real WhatsApp later, uncomment & fill: ──
  /*
  const res = await fetch("https://graph.facebook.com/v19.0/YOUR_PHONE_ID/messages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.WA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\D/g, ""),
      type: "text",
      text: { body: message },
    }),
  });
  const data = await res.json();
  console.log("[WhatsApp REAL]", data);
  */

  return entry;
}

// ─── Broadcast to all clients ──────────────────────────────
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

function broadcastState() {
  broadcast({ type: "STATE", payload: { ...state, staff: STAFF } });
}

// ─── Action handlers ───────────────────────────────────────
function handleToggleGuest(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;
  const entering = !room.guestPresent;

  if (entering) {
    room.guestPresent = true;
    room.hvacMode = room._prevHvac || "comfort";
    room.lightsOn = room._prevLights !== undefined ? room._prevLights : true;
    room._prevHvac = undefined;
    room._prevLights = undefined;
    room.status = room.activeStaff
      ? (room.activeStaff.role === "cleaning" ? "cleaning" : "maintenance")
      : "occupied";
    addEvent(`🔑 ${room.guest.name} entró · Hab. ${room.number} · HVAC→Comfort · Luces→ON`, "guest_in");
  } else {
    room._prevHvac = room.hvacMode;
    room._prevLights = room.lightsOn;
    room.guestPresent = false;
    room.hvacMode = "idle";
    room.lightsOn = false;
    room.status = room.activeStaff
      ? (room.activeStaff.role === "cleaning" ? "cleaning" : "maintenance")
      : "empty";
    addEvent(`🚶 ${room.guest.name} salió · Hab. ${room.number} · HVAC→Idle · Luces→OFF`, "guest_out");
  }
}

async function handleSendStaff(roomId, staffId) {
  const room = state.rooms.find(r => r.id === roomId);
  const staff = STAFF.find(s => s.id === staffId);
  if (!room || !staff) return;

  // Check staff not already assigned
  const alreadyAssigned = state.rooms.some(r => r.activeStaff?.id === staffId);
  if (alreadyAssigned) return;

  room.activeStaff = staff;
  room.staffEnteredAt = Date.now();
  room.status = staff.role === "cleaning" ? "cleaning" : "maintenance";

  const message = staff.role === "cleaning"
    ? `Estimado/a ${room.guest.name}, le informamos que ${staff.name} está realizando la limpieza en su habitación ${room.number}. Gracias por su comprensión. — Hotel SmartStay`
    : `Estimado/a ${room.guest.name}, le informamos que ${staff.name} de Mantenimiento está atendiendo su habitación ${room.number}. Lo resolveremos a la brevedad. — Hotel SmartStay`;

  await sendWhatsApp(room.guest.phone, room.guest.name, message);

  addEvent(
    `${staff.role === "cleaning" ? "🧹" : "🔧"} ${staff.name} → Hab. ${room.number} · WhatsApp enviado a ${room.guest.name}`,
    staff.role
  );

  // Open BI log
  state.biLogs.push({
    id: `${roomId}-${Date.now()}`,
    roomId,
    room: `Hab. ${room.number}`,
    staff: staff.name,
    staffId: staff.id,
    type: staff.role,
    start: nowFull(),
    end: null,
    duration: null,
  });
}

function handleRemoveStaff(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room || !room.activeStaff) return;

  const dur = elapsed(room.staffEnteredAt);
  const endTime = nowFull();

  addEvent(`✅ ${room.activeStaff.name} completó · Hab. ${room.number} · ${dur}`, "complete");

  // Close BI log
  const log = state.biLogs.find(l => l.roomId === roomId && !l.end);
  if (log) { log.end = endTime; log.duration = dur; }

  room.activeStaff = null;
  room.staffEnteredAt = null;
  room.status = room.guestPresent ? "occupied" : "empty";
}

function handleReset() {
  state = {
    rooms: JSON.parse(JSON.stringify(ROOMS_INIT)),
    events: [],
    biLogs: [],
    whatsappLog: [],
  };
  addEvent("🔄 Sistema reiniciado", "info");
}

// ─── WebSocket message router ──────────────────────────────
wss.on("connection", (ws) => {
  console.log("[WS] Client connected");
  // Send full state on connect
  ws.send(JSON.stringify({ type: "STATE", payload: { ...state, staff: STAFF } }));

  ws.on("message", async (raw) => {
    try {
      const { action, payload } = JSON.parse(raw);
      switch (action) {
        case "TOGGLE_GUEST":   handleToggleGuest(payload.roomId); break;
        case "SEND_STAFF":     await handleSendStaff(payload.roomId, payload.staffId); break;
        case "REMOVE_STAFF":   handleRemoveStaff(payload.roomId); break;
        case "RESET":          handleReset(); break;
      }
      broadcastState();
    } catch (e) {
      console.error("[WS] Error:", e.message);
    }
  });

  ws.on("close", () => console.log("[WS] Client disconnected"));
});

// ─── REST fallback (optional polling) ─────────────────────
app.get("/api/state", (req, res) => {
  res.json({ ...state, staff: STAFF });
});

// ─── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🏨 SmartStay Server running on port ${PORT}`);
  console.log(`   Client view : http://localhost:${PORT}/client`);
  console.log(`   Control view: http://localhost:${PORT}/control\n`);
});
