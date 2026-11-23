  // =========================
  // Firebase (CDN modular)
  // =========================
  import { initializeApp, deleteApp } from "./vendor/firebase-12.11.0/firebase-app.js";

  import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    onAuthStateChanged,
    signOut,
    deleteUser as deleteAuthUser
  } from "./vendor/firebase-12.11.0/firebase-auth.js";

  import {
  getFirestore,
  collection, doc, getDoc, getDocFromServer, getDocs, addDoc, writeBatch,
  setDoc, updateDoc, deleteDoc,
  query, orderBy, limit, where, startAfter,
  serverTimestamp,
  getCountFromServer,
  increment,
  runTransaction
} from "./vendor/firebase-12.11.0/firebase-firestore.js";


  const firebaseConfig = {
    apiKey: "AIzaSyDmdS1mt12tyWOE48U2As-53vtdQT7esPg",
    authDomain: "control-acceso-cd3db.firebaseapp.com",
    projectId: "control-acceso-cd3db",
    storageBucket: "control-acceso-cd3db.firebasestorage.app",
    messagingSenderId: "98995699294",
    appId: "1:98995699294:web:dd1b6b639525fd06a5fecf"
  };

  const fbApp = initializeApp(firebaseConfig);
  const auth = getAuth(fbApp);
  const db = getFirestore(fbApp);

  async function loadFeatureDependencies(names, featureLabel){
    try{
      if(!window.AppDependencies) throw new Error("El cargador local no está disponible.");
      await window.AppDependencies.loadMany(Array.isArray(names) ? names : [names]);
      return true;
    }catch(error){
      console.error(`No se pudo cargar ${featureLabel || "el módulo"}:`, error);
      toast("No se pudo abrir el módulo", `No fue posible cargar ${featureLabel || "los componentes necesarios"}. Revisa la conexión y vuelve a intentar.`, "bad", 5200);
      return false;
    }
  }

  
/* =========================
   Colecciones
========================= */

  const COL_VISITAS = "visitas";
  const COL_VISITANTES = "visitantes";
  const COL_VALES_ACTIVOS = "vales_activos";
  const COL_VALES_PERSONAL = "vales_personal";
  const COL_BITACORA = "bitacora_guardia";
  const COL_RONDINERO_PUNTOS = "rondinero_puntos";
  const COL_RONDINERO_RUTAS = "rondinero_rutas";
  const COL_RONDINERO_RONDINES = "rondinero_rondines";
  const COL_RONDINERO_EVENTOS = "rondinero_eventos";
  const COL_SESIONES = "presence";
  const COL_USERS = "users";
  const COL_RESUMEN_DIARIO = "resumen_diario";
  const COL_APP_CONFIG = "app_config";
  const QR_EARLY_BLOCK_MIN = 15; // Proveedores: habilitar 15 min antes
  const QR_LATE_BLOCK_MIN = 15; // Proveedores
  const VISITOR_QR_LATE_BLOCK_MIN = 60; // Visitantes: 1 hora

  function qrLateBlockMin(v = {}){
    const tipo = String(v.tipoVisita || v.tipoAcceso || "proveedor").toLowerCase();
    return tipo === "visitante" ? Number.POSITIVE_INFINITY : QR_LATE_BLOCK_MIN;
  }

  function normalizarQrVisitanteRetrasado(v={}){
    const tipo = String(v.tipoVisita || v.tipoAcceso || "proveedor").toLowerCase();
    if(tipo !== "visitante" || v.status !== "programado" || v.qrDesactivadoMotivo !== "RETRASO") return false;
    v.qrActivo = true;
    v.qrDesactivadoMotivo = "";
    v.qrDesactivadoMin = null;
    v.qrDesactivadoTs = null;
    v.qrReactivadoTs = Date.now();
    v.updatedTs = Date.now();
    return true;
  }

  const VALES_ACTIVOS_LOOKBACK_DAYS = 30;

  const CLOUD_READ_TTL = {
    visitasDia: 5 * 60 * 1000,
    valesActivos: 10 * 60 * 1000,
    valesPersonal: 5 * 60 * 1000,
    bitacora: 3 * 60 * 1000,
    rondinero: 3 * 60 * 1000,
    pendientesUsuarios: 5 * 60 * 1000
  };
  const cloudReadCache = {
    visitasDia: new Map(),
    bitacora: new Map(),
    rondinero: 0,
    valesActivos: 0,
    valesPersonal: 0,
    pendientesUsuarios: { ts: 0, count: 0 }
  };

  function shouldReadCloudStamp(lastTs, ttlMs, force = false){
    return force || !lastTs || (Date.now() - lastTs) >= ttlMs;
  }

  function markCloudRead(mapOrKey, key = null){
    if(mapOrKey instanceof Map){
      mapOrKey.set(key, Date.now());
      return;
    }
    cloudReadCache[mapOrKey] = Date.now();
  }
/* =========================
   Roles
========================= */

  const ROLES = {
    PENDIENTE: "pendiente",
    ADMIN: "admin",
    COORDINADOR: "coordinador",
    JEFE: "jefe",
    JEFE_RESTRINGIDO: "jefe_restringido",
    JEFE_COMPRAS: "jefe_compras",
    JEFE_TI: "jefe_ti",
    COMPRAS: "compras",
    ANFITRION: "anfitrion",
    GUARDIA: "guardia",
    CALIDAD: "calidad",
    CONTRALORIA: "contraloria",
    SERVICIO_MEDICO: "servicio_medico",
    RECEPCIONISTA: "recepcionista",
    PROVEEDOR: "proveedor",
  };
  const ALL_ROLES = Object.values(ROLES);

  const ALL_PERMS = [
    "ver_dashboard_proveedores","ver_dashboard_visitantes","ver_historial","ver_ficha","crear_cita","crear_cita_visitante","escanear_qr",
    "registrar_entrada","ver_documentos","dictaminar","despachar",
    "registrar_salida","exportar_excel","limpiar_finalizados",
    "reactivar_qr","eliminar","ver_qr","buscar_proveedor",
    "admin_roles","admin_proveedores","ver_citas_compras",
    "editar_cita","cancelar_cita",
    "ver_vales_activos","crear_vale_activo","autorizar_vale_activo","ver_historial_vales_activos",
    "registrar_salida_activo","registrar_regreso_activo",
    "ver_vales_personal","crear_vale_personal","autorizar_vale_personal","ver_permisos_imss","crear_permiso_imss","ver_historial_vales_personal",
    "registrar_salida_personal","registrar_regreso_personal",
    "ver_bitacora_guardia","crear_bitacora_guardia",
    "rondinero_ver","rondinero_ejecutar","rondinero_configurar","rondinero_reportes",
    "ver_sesiones_activas","ver_reportes","ver_reporte_cambios","ver_reporte_nominas","autorizar_vale_personal_emergencia"
  ];

 
const PERMISOS = {
  [ROLES.ADMIN]: ALL_PERMS,
  [ROLES.COORDINADOR]: ALL_PERMS.filter(p =>
    p !== "autorizar_vale_activo" &&
    p !== "autorizar_vale_personal" &&
    p !== "ver_historial_vales_personal" &&
    p !== "ver_reporte_nominas" &&
    p !== "ver_reporte_cambios"
  ),

  [ROLES.GUARDIA]: [
    "ver_dashboard_proveedores",
    "ver_dashboard_visitantes",
    "ver_historial",
    "ver_reportes",
    "ver_ficha",
    "escanear_qr",
    "registrar_entrada",
    "registrar_salida",
    "ver_qr",
    "ver_vales_activos",
    "ver_historial_vales_activos",
    "registrar_salida_activo",
    "registrar_regreso_activo",
    "ver_vales_personal",
    "registrar_salida_personal",
    "registrar_regreso_personal",
    "ver_historial_vales_personal",
    "ver_bitacora_guardia",
    "crear_bitacora_guardia",
    "rondinero_ver",
    "rondinero_ejecutar"
  ],

  [ROLES.CALIDAD]: [
    "ver_dashboard_proveedores",
    "ver_dashboard_visitantes",
    "ver_historial",
    "ver_reportes",
    "ver_ficha",
    "escanear_qr",          // ✅ CLAVE
    "ver_documentos",
    "dictaminar",
    "despachar",
    "ver_qr"
  ],

[ROLES.JEFE_TI]: [
  "ver_dashboard_visitantes",
  "ver_historial",
  "ver_reportes",
  "ver_ficha",
  "crear_cita_visitante",
  "ver_qr",
  "ver_citas_compras",
  "ver_vales_activos",
  "crear_vale_activo",
  "autorizar_vale_activo",
  "ver_vales_personal",
  "crear_vale_personal"
],

[ROLES.JEFE_COMPRAS]: [
  "ver_dashboard_proveedores",
  "ver_dashboard_visitantes",
  "ver_historial",
  "ver_reportes",
  "crear_cita",
  "crear_cita_visitante",
  "ver_citas_compras",
  "exportar_excel",
  "ver_qr",
  "reactivar_qr",
  "admin_proveedores",
  "ver_vales_activos",
  "crear_vale_activo",
  "ver_vales_personal",
  "crear_vale_personal",
  "autorizar_vale_personal"
],

  [ROLES.COMPRAS]: [
    "ver_dashboard_proveedores",
    "ver_dashboard_visitantes",
    "ver_historial",
    "ver_reportes",
    "ver_ficha",
    "crear_cita",
    "exportar_excel",
    "ver_documentos",
    "ver_qr",
    "ver_citas_compras",
    "editar_cita",
    "cancelar_cita",
    "ver_vales_activos",
    "crear_vale_activo",
    "ver_vales_personal",
    "crear_vale_personal"
  ],

  [ROLES.ANFITRION]: [
    "crear_cita_visitante",
    "ver_vales_activos",
    "crear_vale_activo",
    "ver_vales_personal",
    "crear_vale_personal"
  ],

  [ROLES.CONTRALORIA]: [
    "ver_dashboard_proveedores",
    "ver_dashboard_visitantes",
    "ver_historial",
    "ver_reportes",
    "ver_reporte_cambios",
    "ver_ficha",
    "exportar_excel",
    "ver_documentos",
    "ver_qr",
    "ver_vales_activos",
    "autorizar_vale_activo",
    "ver_vales_personal",
    "autorizar_vale_personal",
    "rondinero_ver",
    "rondinero_reportes"
  ],

  [ROLES.SERVICIO_MEDICO]: [
    "ver_vales_personal",
    "ver_permisos_imss",
    "crear_permiso_imss"
  ],

  [ROLES.RECEPCIONISTA]: [
    "ver_dashboard_visitantes",
    "ver_historial",
    "ver_ficha",
    "ver_citas_compras",
    "ver_vales_activos",
    "ver_vales_personal",
    "autorizar_vale_personal_emergencia"
  ],

  [ROLES.JEFE]: [
    "crear_cita_visitante",
    "ver_vales_activos",
    "crear_vale_activo",
    "autorizar_vale_activo",
    "ver_vales_personal",
    "crear_vale_personal",
    "autorizar_vale_personal"
  ],

  [ROLES.JEFE_RESTRINGIDO]: [
    "crear_cita_visitante",
    "ver_vales_activos",
    "crear_vale_activo",
    "autorizar_vale_activo",
    "ver_vales_personal",
    "crear_vale_personal",
    "autorizar_vale_personal"
  ],

  [ROLES.PROVEEDOR]: [
    "ver_qr",
    "buscar_proveedor"
  ],

  [ROLES.PENDIENTE]: []
};


let rolePermOverrides = {};
let rolePermsLoaded = false;
let _selectedRolePermRole = ROLES.ADMIN;
const ROLE_PERMS_DOC_ID = "role_permissions";
const ROLE_PERMS_SCHEMA_VERSION = 8;

const PERM_LABELS = {
  ver_dashboard_proveedores: "Ver dashboard de proveedores",
  ver_dashboard_visitantes: "Ver dashboard de visitantes",
  ver_historial: "Ver historial",
  ver_ficha: "Ver ficha",
  crear_cita: "Crear cita proveedor",
  crear_cita_visitante: "Crear cita visitante",
  escanear_qr: "Escanear QR",
  registrar_entrada: "Registrar entrada",
  ver_documentos: "Ver documentos",
  dictaminar: "Dictaminar calidad",
  despachar: "Despachar",
  registrar_salida: "Registrar salida",
  exportar_excel: "Exportar Excel",
  limpiar_finalizados: "Limpiar finalizados",
  reactivar_qr: "Reactivar QR",
  eliminar: "Eliminar registros",
  ver_qr: "Ver QR",
  buscar_proveedor: "Portal proveedor",
  admin_roles: "Administrar usuarios y roles",
  admin_proveedores: "Administrar proveedores",
  ver_citas_compras: "Ver citas compras",
  editar_cita: "Editar cita",
  cancelar_cita: "Cancelar cita",
  ver_vales_activos: "Ver vales activos",
  crear_vale_activo: "Crear vale activo",
  autorizar_vale_activo: "Autorizar vale activo",
  registrar_salida_activo: "Registrar salida activo",
  registrar_regreso_activo: "Registrar regreso activo",
  ver_vales_personal: "Ver vales personal",
  crear_vale_personal: "Crear vale personal",
  autorizar_vale_personal: "Autorizar vale personal",
  autorizar_vale_personal_emergencia: "Autorizar vale personal por emergencia",
  ver_permisos_imss: "Ver permisos IMSS",
  crear_permiso_imss: "Crear permisos IMSS",
  ver_historial_vales_personal: "Ver historial de vales de personal",
  ver_historial_vales_activos: "Ver historial de vales de activos",
  registrar_salida_personal: "Registrar salida personal",
  registrar_regreso_personal: "Registrar regreso personal",
  ver_bitacora_guardia: "Ver bit\u00e1cora guardia",
  crear_bitacora_guardia: "Crear bit\u00e1cora guardia",
  rondinero_ver: "Ver Rondinero",
  rondinero_ejecutar: "Ejecutar Rondinero",
  rondinero_configurar: "Configurar Rondinero",
  rondinero_reportes: "Reportes Rondinero",
  ver_sesiones_activas: "Ver usuarios logeados",
  ver_reportes: "Ver reportes generales",
  ver_reporte_cambios: "Ver cambios en citas",
  ver_reporte_nominas: "Ver reporte para Nóminas"
};

const PERM_GROUPS = [
  { title:"Dashboard y consultas", perms:["ver_dashboard_proveedores","ver_dashboard_visitantes","ver_ficha","ver_qr","buscar_proveedor","ver_citas_compras"] },
  { title:"Reportes", perms:["ver_historial","ver_reportes","ver_reporte_cambios","ver_reporte_nominas","exportar_excel"] },
  { title:"Citas y acceso", perms:["crear_cita","crear_cita_visitante","editar_cita","cancelar_cita","escanear_qr","registrar_entrada","registrar_salida","reactivar_qr"] },
  { title:"Calidad y documentos", perms:["ver_documentos","dictaminar","despachar"] },
  { title:"Limpieza", perms:["limpiar_finalizados","eliminar"] },
  { title:"Vales de personal", perms:["ver_vales_personal","crear_vale_personal","autorizar_vale_personal","autorizar_vale_personal_emergencia","registrar_salida_personal","registrar_regreso_personal","ver_permisos_imss","crear_permiso_imss","ver_historial_vales_personal"] },
  { title:"Vales de activos", perms:["ver_vales_activos","crear_vale_activo","autorizar_vale_activo","registrar_salida_activo","registrar_regreso_activo","ver_historial_vales_activos"] },
  { title:"Guardia y Rondinero", perms:["ver_bitacora_guardia","crear_bitacora_guardia","rondinero_ver","rondinero_ejecutar","rondinero_configurar","rondinero_reportes"] },
  { title:"Administraci\u00f3n", perms:["admin_roles","admin_proveedores","ver_sesiones_activas"] }
];

function normalizePermList(perms, role=""){
  const allowed = new Set(ALL_PERMS);
  const clean = Array.from(new Set((Array.isArray(perms) ? perms : []).filter(p => allowed.has(p))));
  if(role === ROLES.ADMIN && !clean.includes("admin_roles")) clean.push("admin_roles");
  return clean;
}

function roleLabel(role){
  if(role === ROLES.JEFE_TI) return "Jefe de TI";
  if(role === ROLES.JEFE_RESTRINGIDO) return "Jefe restringido";
  if(role === ROLES.SERVICIO_MEDICO) return "Servicio M\u00e9dico";
  if(role === ROLES.RECEPCIONISTA) return "Recepcionista";
  return String(role || "").replace(/_/g, " ").toUpperCase();
}

function permLabel(perm){
  return PERM_LABELS[perm] || String(perm || "").replace(/_/g, " ");
}

function getPermsForRole(role){
  const r = String(role || "");
  if(Array.isArray(rolePermOverrides[r])) return normalizePermList(rolePermOverrides[r], r);
  return normalizePermList(PERMISOS[r] || [], r);
}

const VALE_ACTIVO_AUTORIZADOR_ROLES = [
  ROLES.JEFE,
  ROLES.JEFE_TI,
  ROLES.CONTRALORIA
];

const VALE_PERSONAL_AUTORIZADOR_ROLES = [
  ROLES.JEFE,
  ROLES.JEFE_RESTRINGIDO,
  ROLES.JEFE_COMPRAS,
  ROLES.CONTRALORIA,
  ROLES.ADMIN
];

function canRoleAuthorizeValeActivo(role){
  return getPermsForRole(role).includes("autorizar_vale_activo");
}

function canRoleAuthorizeValePersonal(role){
  return getPermsForRole(role).includes("autorizar_vale_personal");
}

function canAuthorizeAnyValeRole(role){
  return canRoleAuthorizeValeActivo(role) || canRoleAuthorizeValePersonal(role);
}

let proveedoresCache = [];
let proveedoresLoaded = false;
let proveedoresLoading = false;
let proveedoresLoadedTs = 0;
let valeActivoAutorizadoresCache = [];
let valeActivoAutorizadoresTs = 0;
let valePersonalAutorizadoresCache = [];
let valePersonalAutorizadoresTs = 0;
let valePersonalPerfilesCache = [];
const PROVEEDORES_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
let lockView = false;
let currentView = "login";
let moduleReturnView = "dashboard_proveedores";
let chartAreaInstance = null;
let chartEstadoInstance = null;
let chartDictamenInstance = null;
let chartTiempoInstance = null;
let chartIncidenciasInstance = null;
let chartPuntualidadInstance = null;

async function ensureProveedoresLoaded(){
  if (proveedoresLoaded || proveedoresLoading) return;

  const local = loadProveedoresLocalCache();
  if(local.length){
    proveedoresCache = local;
    proveedoresLoaded = true;
    proveedoresLoadedTs = Number(localStorage.getItem("proveedores_cache_ts_v1") || Date.now());
    return;
  }

  proveedoresLoading = true;
  try {
    await loadProveedores();
    proveedoresLoaded = true;
  } catch (e) {
    console.error("Error cargando proveedores", e);
  } finally {
    proveedoresLoading = false;
  }
}

// =========================
// Seguridad: PIN Admin
// =========================
const PIN_TTL_MS = 5 * 60 * 1000;  // 5 minutos
const PIN_SESSION_KEY = "adminPinOkTs";
