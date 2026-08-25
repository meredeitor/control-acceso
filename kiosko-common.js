import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmdS1mt12tyWOE48U2As-53vtdQT7esPg",
  authDomain: "control-acceso-cd3db.firebaseapp.com",
  projectId: "control-acceso-cd3db",
  storageBucket: "control-acceso-cd3db.firebasestorage.app",
  messagingSenderId: "98995699294",
  appId: "1:98995699294:web:dd1b6b639525fd06a5fecf"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export const AREAS = [
  "Aduana piel",
  "Aduana Exótico",
  "Aduana Peleteria",
  "Avíos",
  "Otros"
];

export const MOTIVOS = [
  "Entrega",
  "Recolección",
  "Visita",
  "Entrevista",
  "Junta",
  "Servicio",
  "Pago",
  "Exámen médico",
  "Otro"
];

export const PERSONAS = [
  "Mayela Reynaga",
  "Sara Guereca",
  "Princess Alvarez",
  "Paola Palomares",
  "Anaís Rojas",
  "Miriam Landeros",
  "Jesus Mendoza",
  "Lilia Blancarte",
  "Nancy Villalpando",
  "Ángel Reyes",
  "Montserrat Campos",
  "Fernanda Ortiz",
  "Mario Barrios",
  "Jaime Hernández",
  "Antonio Gutiérrez",
  "Jaret Fernández",
  "Maru Medina",
  "Alejandro Herrera",
  "Javier Sánchez",
  "Ivonne Soto",
  "Joselyn Paz",
  "Juana Ávila",
  "Marcela Chacón",
  "Adaneli Aguilera",
  "Andrea González",
  "Soraya Rodríguez",
  "Diego Guillen",
  "Alfredo García",
  "Edgar Cruz",
  "Nathalie Hernández",
  "Renata Díaz",
  "Jorge Olvera",
  "Daniela Sustaita",
  "Uriel Reyes",
  "Yolanda Hurtado",
  "Sergio Palomares",
  "Daniel López",
  "Cesar Reyes",
  "Rafael Pichardo",
  "Ricardo Rivera",
  "Jaqueline Gómez",
  "Tisbet González",
  "Miriam García",
  "Mónica Torres",
  "Hugo Reyes",
  "Cristóbal Gutiérrez",
  "Wendy Parada",
  "Héctor Ríos",
  "Sergio Sánchez",
  "Ambrosio Becerra",
  "Luis Salas",
  "Daniel García",
  "Refugio Araujo",
  "Oscar Sanchez",
  "Jesús Rodríguez",
  "Martha Rodríguez",
  "Luis Torres",
  "María Torres"
];

export const AREA_CAPACITY = {
  "Avíos": 2,
  "Aduana Peleteria": 2
};

export const SLOT_MINUTES = 30;
export const AGENDA_START = 8;
export const AGENDA_END = 18;

export function capArea(area){
  return AREA_CAPACITY[area] || 1;
}

export function generarSlots(){
  const slots = [];
  for(let h = AGENDA_START; h < AGENDA_END; h++){
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

export function dayBoundsFromISO(dateISO){
  const start = new Date(`${dateISO}T00:00:00`).getTime();
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

export async function fetchCitasByDate(dateISO){
  await ensureKioskoAuth();
  const { start, end } = dayBoundsFromISO(dateISO);
  const q = query(
    collection(db, "visitas"),
    where("fechaHoraTs", ">=", start),
    where("fechaHoraTs", "<", end),
    limit(500)
  );
  const snap = await getDocs(q);
  const citas = [];
  snap.forEach(d => citas.push({ id: d.id, ...d.data() }));
  return citas;
}

export function slotOcupadas(citas, dateISO, area, hora){
  if(!dateISO || !area || !hora) return 0;
  const slotTs = new Date(`${dateISO}T${hora}`).getTime();
  const slotWindowMs = SLOT_MINUTES * 60 * 1000;
  return citas.filter(v => {
    const ts =
      typeof v.fechaHoraTs === "number" ? v.fechaHoraTs :
      v.fechaHora ? new Date(v.fechaHora).getTime() :
      NaN;
    return (
      v.area === area &&
      v.status !== "cancelado" &&
      v.status !== "rechazado" &&
      Number.isFinite(ts) &&
      Math.abs(ts - slotTs) < slotWindowMs
    );
  }).length;
}


export async function fetchPersonasVisita(){
  await ensureKioskoAuth();
  const snap = await getDoc(doc(db, "app_config", "personas_visita"));
  const personas = snap.exists() && Array.isArray(snap.data().personas) ? snap.data().personas : [];
  return personas.filter(p => p.activo !== false).map(p => p.nombre).filter(Boolean);
}

export function fillSelect(id, values, placeholder = "Seleccione..."){
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option>${escapeHtml(v)}</option>`).join("");
}

export function escapeHtml(value = ""){
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[ch]));
}

export function toast(message, type = "info"){
  const box = document.getElementById("toast");
  if(!box) return;
  box.textContent = message;
  box.className = `toast show ${type}`;
  setTimeout(() => box.classList.remove("show"), 3600);
}

export function setupKioskoTheme(buttonId = "btnTheme"){
  const KEY = "ui_theme";
  const THEMES = ["dark", "light", "mint", "desert", "copper"];
  const LABELS = {
    dark: "Tema: Oscuro",
    light: "Tema: Claro",
    mint: "Tema: Menta",
    desert: "Tema: Desierto",
    copper: "Tema: Cobre"
  };
  const btn = document.getElementById(buttonId);
  const apply = (mode) => {
    const nextMode = THEMES.includes(mode) ? mode : "dark";
    document.documentElement.dataset.theme = nextMode;
    try{ localStorage.setItem(KEY, nextMode); }catch{}
    if(btn) btn.textContent = LABELS[nextMode] || "Tema";
  };

  let saved = "dark";
  try{ saved = localStorage.getItem(KEY) || "dark"; }catch{}
  apply(saved);

  if(btn){
    btn.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme || "dark";
      const idx = Math.max(0, THEMES.indexOf(current));
      const next = THEMES[(idx + 1) % THEMES.length];
      apply(next);
    });
  }
}

export async function ensureKioskoAuth(){
  if(auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function loginKiosko(email, password){
  await signInWithEmailAndPassword(auth, email, password);
  return getKioskoUserProfile();
}

export async function logoutKiosko(){
  await signOut(auth);
}

export async function getKioskoUserProfile(){
  const user = auth.currentUser;
  if(!user || user.isAnonymous) return null;
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.exists() ? snap.data() : {};
  return {
    uid: user.uid,
    email: user.email || "",
    role: data.role || "",
    nombre: data.nombre || data.name || data.displayName || user.email || "Usuario"
  };
}

export async function requireKioskoLogin(){
  const profile = await getKioskoUserProfile();
  if(!profile) throw new Error("Debes iniciar sesion para generar vales.");
  if(!["admin", "anfitrion"].includes(profile.role)){
    throw new Error("Tu usuario no tiene permiso para autorizar vales.");
  }
  return profile;
}

const VALE_AUTH_PERMISSION = {
  activo: "autorizar_vale_activo",
  personal: "autorizar_vale_personal"
};

const DEFAULT_VALE_AUTH_ROLES = {
  autorizar_vale_activo: new Set(["admin", "jefe", "jefe_ti", "contraloria"]),
  autorizar_vale_personal: new Set(["admin", "jefe", "jefe_compras", "contraloria"])
};

async function fetchRolePermissionOverrides(){
  try{
    const snap = await getDoc(doc(db, "app_config", "role_permissions"));
    const roles = snap.exists() ? (snap.data()?.roles || {}) : {};
    return roles && typeof roles === "object" ? roles : {};
  }catch(err){
    console.warn("No se pudo cargar la configuración de permisos de roles; se usarán permisos base.", err);
    return {};
  }
}

function roleHasValePermission(role, permission, overrides){
  const configured = overrides?.[role];
  if(Array.isArray(configured)) return configured.includes(permission);
  return DEFAULT_VALE_AUTH_ROLES[permission]?.has(role) || false;
}

export async function fetchValeAutorizadores(tipo = "personal"){
  await ensureKioskoAuth();
  const normalizedType = tipo === "activo" ? "activo" : "personal";
  const permission = VALE_AUTH_PERMISSION[normalizedType];
  const [usersSnap, rolePermissionOverrides] = await Promise.all([
    getDocs(query(collection(db, "users"), limit(300))),
    fetchRolePermissionOverrides()
  ]);
  const arr = [];
  usersSnap.forEach(d => {
    const u = { uid: d.id, ...d.data() };
    if(u.eliminado) return;
    if(u.aprobado === false) return;
    if(!roleHasValePermission(u.role, permission, rolePermissionOverrides)) return;
    arr.push({
      uid: u.uid,
      nombre: u.nombre || u.email || "Usuario",
      email: u.email || "",
      role: u.role || ""
    });
  });
  return arr.sort((a,b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

export const fetchValeActivoAutorizadores = fetchValeAutorizadores;

export async function crearSolicitudCita(data){
  const user = await ensureKioskoAuth();
  const id = `K-${Date.now()}`;
  const tipo = String(data.tipoVisita || data.tipoAcceso || "proveedor").toLowerCase();
  const coleccion = tipo === "visitante" ? "visitantes" : "visitas";
  const ref = doc(db, coleccion, id);
  const fechaHoraTs = new Date(data.fechaHora).getTime();
  const payload = {
    id,
    ...data,
    fechaHoraTs,
    status: "pendiente_autorizacion",
    qrActivo: false,
    createdByUid: user.uid,
    createdByEmail: user.isAnonymous ? "kiosko_anonimo" : (user.email || ""),
    createdByName: data.createdByName || data.createdBySource || (user.isAnonymous ? "Kiosko" : (user.email || "")),
    createdBySource: data.createdBySource || "kiosko",
    createdTs: Date.now(),
    updatedTs: Date.now(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(ref, payload);
  return payload;
}

export async function crearSolicitudValeActivo(data){
  const user = await ensureKioskoAuth();
  const id = `KVA-${Date.now()}`;
  const ref = doc(db, "vales_activos", id);
  const payload = {
    id,
    folio: data.folio || id,
    ...data,
    status: "pendiente_autorizacion",
    qrActivo: true,
    createdByUid: user.uid,
    createdByEmail: user.isAnonymous ? "kiosko_anonimo" : (user.email || ""),
    createdBySource: data.createdBySource || "kiosko_vales_activos",
    createdTs: Date.now(),
    updatedTs: Date.now(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(ref, payload);
  return payload;
}

export async function crearSolicitudValePersonal(data){
  const user = await ensureKioskoAuth();
  const id = `KVP-${Date.now()}`;
  const ref = doc(db, "vales_personal", id);
  const payload = {
    id,
    folio: data.folio || id,
    ...data,
    status: "pendiente_autorizacion",
    qrActivo: false,
    createdByUid: user.uid,
    createdByEmail: user.isAnonymous ? "kiosko_anonimo" : (user.email || ""),
    createdBySource: data.createdBySource || "kiosko_vales_personal",
    createdTs: Date.now(),
    updatedTs: Date.now(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(ref, payload);
  return payload;
}
