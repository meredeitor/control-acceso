  // =========================
  // App UI + lógica
  // =========================
  (() => {
    "use strict";
    const $ = (sel, root=document) => root.querySelector(sel);
    const appEl = $("#app");
    const toasts = $("#toasts");
    let qSearch = $("#qSearch");
    let dashboardSearchTerm = "";
    let dashboardPendingOnly = false;
    let providerDashboardMobileStatus = "programados";
    let visitorDashboardMobileStatus = "programados";
    let valePersonalMobileStatus = "pendientes";
    let valeActivoMobileStatus = "pendientes";
    const valeSearchTerms = { personal:"", activos:"" };

    function limpiarCorreoAutocompletadoEnBuscadoresVales(){
      const email = String(currentUser?.email || "").trim().toLowerCase();
      if(!email) return;
      [
        ["valeSearchPersonal", "personal"],
        ["valeSearchActivos", "activos"]
      ].forEach(([id, tipo]) => {
        const input = document.getElementById(id);
        if(!input || document.activeElement === input) return;
        if(String(input.value || "").trim().toLowerCase() !== email) return;
        input.value = "";
        valeSearchTerms[tipo] = "";
      });
    }

    function vigilarAutocompletadoEnBuscadoresVales(){
      [0, 120, 500, 1500].forEach(delay => setTimeout(limpiarCorreoAutocompletadoEnBuscadoresVales, delay));
    }
    const netDot = $("#netDot");
    const netText = $("#netText");
    const actionsBar = $("#actionsBar");
    const sidebarEl = document.getElementById('sidebar');
    const sbOverlay = document.getElementById('sbOverlay');
    const sbProveedoresSub = document.getElementById('sbProveedoresSub');
    const sbVisitantesSub = document.getElementById('sbVisitantesSub');
    const sbValesSub = document.getElementById('sbValesSub');
    const sbGuardiaSub = document.getElementById('sbGuardiaSub');
    const sbReportesSub = document.getElementById('sbReportesSub');
    const sbHelpSub = document.getElementById('sbHelpSub');
    const sbConfigSub = document.getElementById('sbConfigSub');
    const sbConfigChip = document.getElementById('sbConfigChip');
    const sbExportSub = document.getElementById('sbExportSub');
    const sbExportChip = document.getElementById('sbExportChip');
    const btnHamb = document.getElementById('btnHamb');

    const userPill = $("#userPill");

    const LS_USER = "pv_usuario_actual";
    const LS_KEY = "visitas_v3";
    const LS_VALES_KEY = "vales_activos_v1";
    const LS_VALES_PERSONAL_KEY = "vales_personal_v1";
    const LS_BITACORA_KEY = "bitacora_guardia_v1";
    const LS_RONDINERO_PUNTOS_KEY = "rondinero_puntos_v1";
    const LS_RONDINERO_RUTAS_KEY = "rondinero_rutas_v1";
    const LS_RONDINERO_RONDINES_KEY = "rondinero_rondines_v1";
    const LS_RONDINERO_EVENTOS_KEY = "rondinero_eventos_v1";
    const LS_LAST_VISITAS_PUSH_TS = "visitas_last_cloud_push_ts_v1";
    const LS_LAST_DEPURACION_30D = "ultima_depuracion_30d_v1";

    const Status = {
      PROGRAMADO:"programado",
      LLEGADO:"llegado",
      DENTRO:"dentro",
      DESPACHADO:"despachado",
      FINALIZADO:"finalizado",
      CANCELADO:"cancelado",
      PENDIENTE_AUTORIZACION:"pendiente_autorizacion"
    };

    function visitaStatusRank(status){
      return {
        [Status.PENDIENTE_AUTORIZACION]:-1,
        [Status.PROGRAMADO]:0,
        [Status.LLEGADO]:1,
        [Status.DENTRO]:2,
        [Status.DESPACHADO]:3,
        [Status.FINALIZADO]:4,
        [Status.CANCELADO]:5
      }[status] ?? -2;
    }

    function reconcileVisitaStatus(v={}){
      if(!v || typeof v !== "object") return false;
      const tipo = String(v.tipoVisita || v.tipoAcceso || "").toLowerCase();
      const esRegistroAcceso = tipo === "proveedor" || tipo === "visitante" || typeof v.fechaHoraTs === "number";
      if(!esRegistroAcceso) return false;
      const original = v.status;
      let expected = original;
      if(v.canceladoTs || original === Status.CANCELADO){
        expected = Status.CANCELADO;
      }else if(v.salidaTs){
        expected = Status.FINALIZADO;
      }else if(!isVisitante(v) && v.dictamen?.ts){
        expected = Status.DESPACHADO;
      }else if(v.entradaTs){
        expected = Status.DENTRO;
      }else if(v.llegadaTs){
        expected = Status.LLEGADO;
      }
      if(expected === original) return false;
      v.status = expected;
      if(expected === Status.FINALIZADO || expected === Status.CANCELADO) v.qrActivo = false;
      return true;
    }

    const ValeStatus = {
      GENERADO: "generado",
      PENDIENTE: "pendiente_autorizacion",
      FUERA: "fuera",
      REGRESO_CANCELADO: "regreso_cancelado"
    };

    let currentUser = null; // {uid,email,role,nombre}

async function loadRolePermsConfig(force=false){
  if(rolePermsLoaded && !force) return rolePermOverrides;
  try{
    const snap = await getDoc(doc(db, COL_APP_CONFIG, ROLE_PERMS_DOC_ID));
    const data = snap.exists() ? snap.data() : {};
    const roles = data.roles || {};
    const isLegacyConfig = Number(data.permissionsVersion || 1) < ROLE_PERMS_SCHEMA_VERSION;
    const next = {};
    ALL_ROLES.forEach(role => {
      if(Array.isArray(roles[role])){
        const legacyDashboard = roles[role].includes("ver_dashboard");
        const migrated = normalizePermList(roles[role], role);
        if(isLegacyConfig && legacyDashboard){
          if(!migrated.includes("ver_dashboard_visitantes")) migrated.push("ver_dashboard_visitantes");
          if(![ROLES.ANFITRION, ROLES.JEFE_TI, ROLES.RECEPCIONISTA].includes(role) && !migrated.includes("ver_dashboard_proveedores")) migrated.push("ver_dashboard_proveedores");
        }
        if(isLegacyConfig && legacyDashboard && !migrated.includes("ver_reportes")){
          migrated.push("ver_reportes");
        }
        if(isLegacyConfig && [ROLES.ADMIN, ROLES.CONTRALORIA].includes(role) && !migrated.includes("ver_reporte_cambios")){
          migrated.push("ver_reporte_cambios");
        }
        if(isLegacyConfig && [ROLES.ADMIN, ROLES.GUARDIA].includes(role) && !migrated.includes("ver_historial_vales_personal")){
          migrated.push("ver_historial_vales_personal");
        }
        if(isLegacyConfig && [ROLES.ADMIN, ROLES.GUARDIA].includes(role) && !migrated.includes("ver_historial_vales_activos")){
          migrated.push("ver_historial_vales_activos");
        }
        if(isLegacyConfig && role === ROLES.ADMIN && !migrated.includes("ver_reporte_nominas")){
          migrated.push("ver_reporte_nominas");
        }
        if(isLegacyConfig && role === ROLES.RECEPCIONISTA && !migrated.includes("autorizar_vale_personal_emergencia")){
          migrated.push("autorizar_vale_personal_emergencia");
        }
        if(isLegacyConfig && role === ROLES.JEFE_COMPRAS && !migrated.includes("crear_cita_visitante")){
          migrated.push("crear_cita_visitante");
        }
        next[role] = migrated;
      }
    });
    rolePermOverrides = next;
    rolePermsLoaded = true;
  }catch(e){
    console.warn("No se pudo cargar configuraci\u00f3n de permisos", e);
    rolePermsLoaded = true;
  }
  return rolePermOverrides;
}

async function saveRolePermsConfig(role, perms){
  if(!requirePerm("admin_roles", "Solo ADMIN puede editar permisos de roles.")) return false;
  if(!(await requireAdminPin("modificar permisos de rol"))) return false;
  const clean = normalizePermList(perms, role);
  const roles = { ...rolePermOverrides, [role]: clean };
  await setDoc(doc(db, COL_APP_CONFIG, ROLE_PERMS_DOC_ID), {
    roles,
    permissionsVersion: ROLE_PERMS_SCHEMA_VERSION,
    updatedTs: Date.now(),
    updatedAt: serverTimestamp(),
    updatedByUid: currentUser?.uid || "",
    updatedByRole: currentUser?.role || ""
  }, { merge:true });
  rolePermOverrides = roles;
  rolePermsLoaded = true;
  return true;
}

    let visitas = loadVisitasLocal();
    let valesActivos = loadValesActivosLocal();
    let valesPersonal = loadValesPersonalLocal();

    async function normalizarQrVisitantesRetrasados(){
      const restaurados = visitas.filter(normalizarQrVisitanteRetrasado);
      if(!restaurados.length) return;
      saveVisitasLocal();
      if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
        await Promise.all(restaurados.map(v => cloudUpsertVisita(v).catch(error => console.warn("No se pudo reactivar QR de visitante:",error))));
      }
    }
    let historialValesPersonalCache = [];
    let historialValesActivosCache = [];
    let reporteNominasCache = [];
    let registroManualPersonalHasta = Number(sessionStorage.getItem("registro_manual_personal_hasta") || 0);
    let registroManualPersonalMotivo = sessionStorage.getItem("registro_manual_personal_motivo") || "";
    let registroManualPersonalTimer = null;

    function registroManualPersonalActivo(){
      if(Date.now() < registroManualPersonalHasta) return true;
      registroManualPersonalHasta = 0;
      registroManualPersonalMotivo = "";
      sessionStorage.removeItem("registro_manual_personal_hasta");
      sessionStorage.removeItem("registro_manual_personal_motivo");
      return false;
    }

    function cerrarRegistroManualPersonal(){
      if(registroManualPersonalTimer) clearTimeout(registroManualPersonalTimer);
      registroManualPersonalTimer = null;
      registroManualPersonalHasta = 0;
      registroManualPersonalMotivo = "";
      sessionStorage.removeItem("registro_manual_personal_hasta");
      sessionStorage.removeItem("registro_manual_personal_motivo");
    }

    function programarCierreRegistroManualPersonal(){
      if(registroManualPersonalTimer) clearTimeout(registroManualPersonalTimer);
      const restante = registroManualPersonalHasta - Date.now();
      if(restante <= 0) return cerrarRegistroManualPersonal();
      registroManualPersonalTimer = setTimeout(async () => {
        cerrarRegistroManualPersonal();
        if(currentView === "vales_personal"){
          toast("Registro manual oculto","Terminó el periodo de habilitación de 5 minutos.","ok",3000);
          await renderValesPersonal();
        }
      }, restante + 100);
    }

    async function toggleRegistroManualPersonal(){
      if(registroManualPersonalActivo()){
        cerrarRegistroManualPersonal();
        toast("Registro manual oculto","Los movimientos vuelven a requerir lectura de QR.","ok",2600);
        return renderValesPersonal();
      }
      if(!(await requireFreshUserPin("habilitar temporalmente el registro manual"))) return;
      const motivo = prompt("Motivo obligatorio para habilitar el registro manual:")?.trim() || "";
      if(motivo.length < 5){
        toast("Motivo requerido","Escribe un motivo de al menos 5 caracteres.","warn",3600);
        return;
      }
      registroManualPersonalHasta = Date.now() + (5 * 60 * 1000);
      registroManualPersonalMotivo = motivo;
      sessionStorage.setItem("registro_manual_personal_hasta", String(registroManualPersonalHasta));
      sessionStorage.setItem("registro_manual_personal_motivo", motivo);
      programarCierreRegistroManualPersonal();
      toast("Registro manual habilitado","Los botones estarán disponibles durante 5 minutos o hasta realizar un movimiento.","warn",4200);
      await renderValesPersonal();
    }
    let bitacoraGuardia = loadBitacoraLocal();
    let rondineroPuntos = loadRondineroPuntosLocal();
    let rondineroRutas = loadRondineroRutasLocal();
    let rondineroRondines = loadRondineroRondinesLocal();
    let rondineroEventos = loadRondineroEventosLocal();
    let rondineroGuardiaCred = loadRondineroGuardiaCred();
    let rondineroAdminTab = "puntos";
    let rondineroHistSearch = "";
    let rondineroHistGuardia = "";
    let rondineroHistDesde = "";
    let rondineroHistHasta = "";
    let _rondRutaEditorId = null;
    let _rondRutaEditorPuntoIds = [];
    let _rondRutaEditorDraft = null;
    let _returnToEditCitaId = null;
    let _returnToEditMode = false;
    let _returnToCitasComprasMode = false;


    // -------------------------
    // Helpers
    // -------------------------
    
   function renderReporteCambios(){
  if(!requirePerm("ver_reporte_cambios", "No tienes permiso para ver cambios en citas.")) return;
  currentView = "reporte_cambios";
  let rolFiltro = ""; // estado local del filtro

  function filtrarYRenderizar(){
    const registros = visitas
      .filter(v => Array.isArray(v.historialCambios))
      .flatMap(v =>
        v.historialCambios.map(h => ({
          citaId: v.id,
          proveedor: v.proveedor,
          ...h
        }))
      )
      .filter(r => !rolFiltro || r.rol === rolFiltro)
      .sort((a,b) => b.ts - a.ts);

    const tbody = document.getElementById("repCambiosBody");
    if(!tbody) return;

    tbody.innerHTML = registros.map(r => `
      <tr>
        <td>${new Date(r.ts).toLocaleString()}</td>
        <td>${esc(r.citaId)}</td>
        <td>${esc(r.proveedor)}</td>
        <td>${esc(r.campo)}</td>
        <td>${esc(r.antes)}</td>
        <td><b>${esc(r.despues)}</b></td>
        <td>${esc(r.usuario)}</td>
        <td><span class="pill">${esc(r.rol)}</span></td>
      </tr>
    `).join("");
  }

  appEl.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div>
          <h2>📜 Reporte de Cambios en Citas</h2>
          <div style="color:var(--muted);font-size:12px;">
            Auditoría de modificaciones por usuario y rol
          </div>
        </div>
        <div class="row">
          <button class="secondary" data-action="home">Volver</button>
        </div>
      </div>

      <div class="divider"></div>

      <!-- ✅ FILTRO POR ROL -->
      <div class="row" style="gap:12px;align-items:flex-end;">
        <div style="min-width:220px;">
          <label>Filtrar por rol</label>
          <select id="repRol">
            <option value="">Todos</option>
            <option value="admin">ADMIN</option>
            <option value="compras">COMPRAS</option>
            <option value="calidad">CALIDAD</option>
            <option value="guardia">GUARDIA</option>
            <option value="contraloria">CONTRALORÍA</option>
            <option value="pendiente">PENDIENTE</option>
          </select>
        </div>
      </div>

      <div class="divider"></div>

      <table class="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Cita</th>
            <th>Proveedor</th>
            <th>Campo</th>
            <th>Antes</th>
            <th>Después</th>
            <th>Usuario</th>
            <th>Rol</th>
          </tr>
        </thead>
        <tbody id="repCambiosBody"></tbody>
      </table>
    </div>
  `;

  // eventos
  const selRol = document.getElementById("repRol");
  if(selRol){
    selRol.onchange = () => {
      rolFiltro = selRol.value;
      filtrarYRenderizar();
    };
  }

  // render inicial
  filtrarYRenderizar();
}

    function registrarCambio(v, campo, antes, despues, accion="editar"){
  if(String(antes ?? "") === String(despues ?? "")) return;

  if(!Array.isArray(v.historialCambios)){
    v.historialCambios = [];
  }

  v.historialCambios.push({
    ts: Date.now(),
    campo,
    antes: antes ?? "",
    despues: despues ?? "",
    usuario: currentUser?.email || "",
    rol: currentUser?.role || "",
    accion
  });
}

    async function normalizarUsuariosViejos(){
  if(!currentUser || currentUser.role !== ROLES.ADMIN){
    toast("Seguridad","Solo ADMIN puede normalizar usuarios","bad");
    return;
  }

  const snap = await getDocs(collection(db, COL_USERS));
  let total = 0;
  let actualizados = 0;

  for(const docSnap of snap.docs){
    total++;
    const u = docSnap.data();
    const update = {};

    if(u.aprobado === undefined) update.aprobado = true;
    if(!u.nombre) update.nombre = u.email || "";
    if(u.empresa === undefined) update.empresa = "";
    if(u.area === undefined) update.area = "";
    if(u.telefono === undefined) update.telefono = "";
    if(u.solicitadoTs === undefined){
      update.solicitadoTs = u.createdTs || Date.now();
    }
    if(!u.createdAt && u.createdTs){
      update.createdAt = new Date(u.createdTs);
    }

    if(Object.keys(update).length > 0){
      Object.assign(update, userProfileAudit("normalizar_perfil_admin"));
      await updateDoc(doc(db, COL_USERS, docSnap.id), update);
      actualizados++;
    }
  }

  toast(
    "Normalización completa",
    `${actualizados} de ${total} usuarios actualizados`,
    "ok",
    4500
  );
}

    const AREAS = [
  "Aduana piel",
  "Aduana Exótico",
  "Aduana Peleteria",
  "Avíos", 
  "Otros"
];

// =========================
// Capacidad por área (citas simultáneas por horario)
// =========================
const AREA_CAPACITY = {
  "Aduana Peleteria": 1,
  "Avíos": 1,
  "Otros": 1
};
function capArea(area){
  return AREA_CAPACITY[area] || 1; // default: 1
}

function citaConsumeCapacidad(v = {}){
  return v.status !== Status.CANCELADO;
}


const SLOT_MINUTES = 30;      // bloques visuales
const MIN_DIFF_MINUTES = 30;  // anticipación mínima para citas de proveedores del mismo día
const AGENDA_START = 8;      // 08:00
const AGENDA_END = 17;       // 17:00

function generarSlots(){
  const slots = [];
  for(let h = AGENDA_START; h < AGENDA_END; h++){
    slots.push(`${String(h).padStart(2,"0")}:00`);
    slots.push(`${String(h).padStart(2,"0")}:30`);
  }
  return slots;
}

function horarioCitaPermitido(fechaHoraISO){
  if(!fechaHoraISO) return false;
  const fecha = new Date(fechaHoraISO);
  if(Number.isNaN(fecha.getTime())) return false;
  const minutos = fecha.getHours() * 60 + fecha.getMinutes();
  return minutos < (AGENDA_END * 60);
}

function citaNoEsPasada(fechaHoraISO, baseTs = Date.now()){
  if(!fechaHoraISO) return false;
  const ts = new Date(fechaHoraISO).getTime();
  return Number.isFinite(ts) && ts >= (baseTs - 30 * 1000);
}

function validarCitaNoPasada(fechaHoraISO){
  if(citaNoEsPasada(fechaHoraISO)) return true;
  const cita = new Date(fechaHoraISO);
  const citaTxt = Number.isNaN(cita.getTime()) ? "la fecha seleccionada" : cita.toLocaleString();
  toast("Horario vencido", `No se puede agendar una cita en ${citaTxt}. Selecciona una hora futura.`, "warn", 4200);
  return false;
}

function citaProveedorCumpleAnticipacion(fechaHoraISO, baseTs = Date.now()){
  if(!fechaHoraISO) return false;
  const citaTs = new Date(fechaHoraISO).getTime();
  if(!Number.isFinite(citaTs)) return false;
  const cita = new Date(citaTs);
  const base = new Date(baseTs);
  // La anticipación solo se exige para citas del día actual. Las fechas futuras
  // continúan disponibles desde cualquier hora.
  if(!isSameDay(cita, base)) return citaTs > baseTs;
  return citaTs >= baseTs + (MIN_DIFF_MINUTES * 60 * 1000);
}

function citaProveedorEstaEnBloque(fechaHoraISO){
  if(!fechaHoraISO) return false;
  const cita = new Date(fechaHoraISO);
  if(Number.isNaN(cita.getTime())) return false;
  return (cita.getMinutes() === 0 || cita.getMinutes() === 30) && cita.getSeconds() === 0;
}

function mostrarReglaAgendaProveedor(baseTs = Date.now()){
  const primeraHoraTs = minimoFechaHoraProveedorTs(baseTs);
  const primeraHora = new Date(primeraHoraTs).toLocaleTimeString("es-MX", { hour:"2-digit", minute:"2-digit" });
  toast(
    "Agenda con 30 minutos de anticipación",
    `Las citas de proveedores deben generarse al menos ${MIN_DIFF_MINUTES} minutos antes y solo se programan en horarios cerrados (:00 o :30). El siguiente horario que puedes seleccionar es ${primeraHora}, siempre que tenga disponibilidad.`,
    "warn",
    6800
  );
}

function validarBloqueCitaProveedor(fechaHoraISO, baseTs = Date.now()){
  if(citaProveedorEstaEnBloque(fechaHoraISO)) return true;
  mostrarReglaAgendaProveedor(baseTs);
  return false;
}

function validarAnticipacionCitaProveedor(fechaHoraISO, baseTs = Date.now()){
  if(citaProveedorCumpleAnticipacion(fechaHoraISO, baseTs)) return true;
  mostrarReglaAgendaProveedor(baseTs);
  return false;
}

function minimoFechaHoraProveedorTs(baseTs = Date.now()){
  const limiteTs = baseTs + (MIN_DIFF_MINUTES * 60 * 1000);
  // Las citas operan en bloques cerrados :00 y :30. El primer horario ofrecido
  // es el siguiente bloque que además cumple la anticipación completa.
  const bloqueMs = SLOT_MINUTES * 60 * 1000;
  return Math.ceil(limiteTs / bloqueMs) * bloqueMs;
}

function aplicarMinimoFechaHoraProveedor(input, baseTs = Date.now()){
  if(!input) return;
  input.min = datetimeLocalValue(minimoFechaHoraProveedorTs(baseTs));
}

function datetimeLocalValue(ts = Date.now()){
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function proveedorCitaKey({ proveedorCodigo = "", proveedor = "" } = {}){
  const codigo = String(proveedorCodigo || "").trim().toLowerCase();
  if(codigo) return `codigo:${codigo}`;
  const nombre = String(proveedor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return `nombre:${nombre}`;
}

function citaVencidaSinLlegada(v, nowTs = Date.now()){
  if(!v || v.status !== Status.PROGRAMADO) return false;
  if(typeof v.fechaHoraTs !== "number") return false;
  if(v.llegadaTs || v.entradaTs || v.salidaTs) return false;
  if(v.qrDesactivadoMotivo === "RETRASO") return true;
  return v.fechaHoraTs < (nowTs - qrLateBlockMin(v) * 60 * 1000);
}

function validarReagendaProveedor({ proveedorCodigo, proveedor, fechaHoraTs, excludeId = null } = {}){
  const key = proveedorCitaKey({ proveedorCodigo, proveedor });
  if(!key || key === "nombre:") return true;
  const nowTs = Date.now();
  const hoy = new Date(nowTs);
  const nuevaEsDeHoy = typeof fechaHoraTs === "number" && isSameDay(fechaHoraTs, hoy);
  // La restricción evita reagendas repetidas durante el día actual, pero no debe
  // bloquear una cita legítima programada para mañana o una fecha posterior.
  if(!nuevaEsDeHoy) return true;
  const mismoProveedor = (v) => !isVisitante(v) && proveedorCitaKey(v) === key && (!excludeId || v.id !== excludeId);
  const esCitaDeHoy = (v) => typeof v.fechaHoraTs === "number" && isSameDay(v.fechaHoraTs, hoy);
  const vencidas = visitas.filter(v => mismoProveedor(v) && esCitaDeHoy(v) && citaVencidaSinLlegada(v, nowTs));
  if(!vencidas.length) return true;

  const recuperacionesActivas = visitas.filter(v =>
    mismoProveedor(v) &&
    esCitaDeHoy(v) &&
    v.status === Status.PROGRAMADO &&
    typeof v.fechaHoraTs === "number" &&
    v.fechaHoraTs >= (nowTs - 30 * 1000) &&
    !citaVencidaSinLlegada(v, nowTs)
  );

  const nuevaEsFutura = typeof fechaHoraTs === "number" && fechaHoraTs >= (nowTs - 30 * 1000);
  if(nuevaEsFutura && recuperacionesActivas.length >= 1){
    toast(
      "Reagenda limitada",
      "Este proveedor ya tiene una cita vencida y una reagenda activa. Finaliza, cancela o atiende esa cita antes de crear otra.",
      "warn",
      5200
    );
    return false;
  }
  return true;
}
function obtenerCitasDeHoy(){
  const hoy = new Date();
  return visitas.filter(v =>
    typeof v.fechaHoraTs === "number" &&
    isSameDay(v.fechaHoraTs, hoy)
  );
}

function slotOcupado(area, slotHora, citasHoy){
  const [h, m] = slotHora.split(":").map(Number);
  const slotTs = new Date();
  slotTs.setHours(h, m, 0, 0);

  const cap = capArea(area);
  const slotWindowMs = SLOT_MINUTES * 60 * 1000;

  // Cuenta cuántas citas existen en ese horario PARA ESA ÁREA (misma ventana de 30 min)
  const ocupadas = citasHoy.filter(v => {
    if(!citaConsumeCapacidad(v)) return false;
    if(v.area !== area) return false;
    if(typeof v.fechaHoraTs !== "number") return false;
    return Math.abs(v.fechaHoraTs - slotTs.getTime()) < slotWindowMs;
  }).length;

  // Ocupado si ya se alcanzó la capacidad del área
  return ocupadas >= cap;
}

async function goNuevaCita(){
  const tipo = arguments[0] === "visitante" ? "visitante" : "proveedor";
  setActiveSb(tipo === "visitante" ? "nuevo_visitante" : "nuevo");   // ✅ CLAVE
  lockView = true;        // 🔒 bloquea auto-render
  currentView = tipo === "visitante" ? "nuevo_visitante" : "nuevo";
  rememberModuleReturn(currentView);
  sbClose();
  await renderNuevo(tipo);
}


    async function getPendingUsersCount(force = false){
  try{
    if(!shouldReadCloudStamp(cloudReadCache.pendientesUsuarios.ts, CLOUD_READ_TTL.pendientesUsuarios, force)){
      return cloudReadCache.pendientesUsuarios.count || 0;
    }
    const q = query(
      collection(db, COL_USERS),
      where("role", "==", ROLES.PENDIENTE)
    );
    const snap = await getCountFromServer(q);
    const count = snap.data().count || 0;
    cloudReadCache.pendientesUsuarios = { ts: Date.now(), count };
    return count;
  }catch(e){
    console.warn("No se pudo contar pendientes", e);
    cloudReadCache.pendientesUsuarios.ts = Date.now();
    return cloudReadCache.pendientesUsuarios.count || 0;
  }
}

function loadProveedoresLocalCache(){
  try{
    const raw = localStorage.getItem("proveedores_cache_v1");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}

function saveProveedoresLocalCache(list){
  try{
    localStorage.setItem("proveedores_cache_v1", JSON.stringify(list || []));
    localStorage.setItem("proveedores_cache_ts_v1", String(Date.now()));
  }catch{}
}
function esc(s=""){
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[ch]));
}

function getTipoVisita(v={}){
  return String(v.tipoVisita || v.tipoAcceso || "proveedor").toLowerCase() === "visitante"
    ? "visitante"
    : "proveedor";
}

function isVisitante(v={}){
  return getTipoVisita(v) === "visitante";
}

function getTipoVisitaLabel(v={}){
  return isVisitante(v) ? "Visitante" : "Proveedor";
}

function getModalidadVisitante(v={}){
  if(!isVisitante(v)) return "";
  const modalidad = String(v.modalidadVisita || "").trim().toLowerCase();
  if(modalidad === "devolucion" || v.visitaDevolucion === true) return "devolucion";
  if(modalidad === "especial" || v.visitaEspecial === true) return "especial";
  return "normal";
}

function getModalidadVisitanteLabel(v={}){
  const modalidad = getModalidadVisitante(v);
  if(modalidad === "especial") return "Visita especial";
  if(modalidad === "devolucion") return "Devolución";
  return "Visita normal";
}

function getModalidadVisitanteClass(v={}){
  const modalidad = getModalidadVisitante(v);
  return modalidad === "especial" ? "visita-especial" : modalidad === "devolucion" ? "visita-devolucion" : "";
}

function renderModalidadVisitantePill(v={}){
  if(!isVisitante(v)) return "";
  const modalidad = getModalidadVisitante(v);
  const cssClass = modalidad === "especial" ? "visita-especial-pill" : modalidad === "devolucion" ? "visita-devolucion-pill" : "visita-normal-pill";
  return `<span class="pill ${cssClass}"><span class="dot ${modalidad === "especial" ? "warn" : modalidad === "devolucion" ? "brand" : "info"}"></span>${esc(getModalidadVisitanteLabel(v))}</span>`;
}

function getNombreAcceso(v={}){
  if(!isVisitante(v)) return v.proveedor || "Proveedor";
  const list = getVisitantesLista(v);
  return v.nombreVisitante || list[0] || v.proveedor || "Visitante";
}

function getEmpresaAcceso(v={}){
  return isVisitante(v)
    ? (v.empresa || "Visitante")
    : (v.empresa || "");
}

function getVisitantesLista(v={}){
  if(Array.isArray(v.visitantesLista)){
    return v.visitantesLista.map(x => String(x || "").trim()).filter(Boolean);
  }
  const raw = String(v.visitantesTexto || v.listaVisitantes || "").trim();
  return raw ? raw.split(/\r?\n|,/).map(x => x.trim()).filter(Boolean) : [];
}

function getVisitanteResumen(v={}){
  const list = getVisitantesLista(v);
  const principal = v.nombreVisitante || v.proveedor || "Visitante";
  return list.length ? `${principal} + ${list.length}` : principal;
}

function renderVisitanteExtraPills(v={}){
  if(!isVisitante(v)) return "";
  const list = getVisitantesLista(v);
  return `
    ${v.empresa ? `<span class="pill"><span class="dot info"></span>Empresa: ${esc(v.empresa)}</span>` : ""}
    ${v.personaVisita ? `<span class="pill"><span class="dot brand"></span>Visita a: ${esc(v.personaVisita)}</span>` : ""}
    ${list.length ? `<span class="pill"><span class="dot info"></span>${list.length} acompañante${list.length > 1 ? "s" : ""}</span>` : ""}
    ${list.length ? `<span class="pill" title="${esc(list.join(", "))}"><span class="dot info"></span>${esc(list.slice(0,3).join(", "))}${list.length > 3 ? "..." : ""}</span>` : ""}
    ${v.motivo ? `<span class="pill"><span class="dot warn"></span>${esc(v.motivo)}</span>` : ""}
    <span class="pill"><span class="dot ${v.qrActivo ? "ok" : "bad"}"></span>${v.qrActivo ? "QR Activo" : "QR Inactivo"}</span>
    <span class="pill"><span class="dot info"></span>ID: ${esc(v.id)}</span>
  `;
}

function getSearchTextVisita(v={}){
  return [
    getTipoVisitaLabel(v),
    getNombreAcceso(v),
    getEmpresaAcceso(v),
    v.proveedorCodigo,
    v.personaVisita,
    ...(isVisitante(v) ? getVisitantesLista(v) : []),
    v.area,
    v.motivo,
    v.id
  ].map(x => String(x || "").toLowerCase()).join(" ");
}

function canCreateAnyCita(){
  return hasPerm("crear_cita") || hasPerm("crear_cita_visitante");
}

function canCreateProveedorCita(){
  return hasPerm("crear_cita");
}

function canCreateVisitanteCita(){
  return hasPerm("crear_cita") || hasPerm("crear_cita_visitante");
}

function isVisitanteOnlyRole(){
  return [ROLES.ANFITRION, ROLES.JEFE_TI, ROLES.RECEPCIONISTA].includes(currentUser?.role);
}

function canSeeVisita(v={}){
  if(isVisitanteOnlyRole()) return isVisitante(v);
  return true;
}

function normalizeDashboardTipo(tipo = "proveedores"){
  return String(tipo || "").toLowerCase() === "visitantes" ? "visitantes" : "proveedores";
}

function dashboardTipoMatches(v={}, tipo="proveedores"){
  const normalized = normalizeDashboardTipo(tipo);
  return normalized === "visitantes" ? isVisitante(v) : !isVisitante(v);
}

function getActiveDashboardTipo(){
  if(currentView === "dashboard_visitantes") return "visitantes";
  return "proveedores";
}

function rememberModuleReturn(view = currentView){
  if(view === "dashboard_visitantes" || view === "nuevo_visitante"){
    moduleReturnView = "dashboard_visitantes";
  }else if(view === "dashboard_proveedores" || view === "nuevo" || view === "proveedor"){
    moduleReturnView = "dashboard_proveedores";
  }else if(view === "vales_activos" || view === "vale_qr"){
    moduleReturnView = "vales_activos";
  }else if(view === "proximos_vales_personal"){
    moduleReturnView = "proximos_vales_personal";
  }else if(view === "vales_personal" || view === "vale_personal_qr" || view === "vale_personal_operacion"){
    moduleReturnView = "vales_personal";
  }else if(view === "historial_vales_personal"){
    moduleReturnView = "historial_vales_personal";
  }else if(view === "historial_vales_activos"){
    moduleReturnView = "historial_vales_activos";
  }else if(view === "reporte_nominas"){
    moduleReturnView = "reporte_nominas";
  }else if(view === "bitacora_guardia"){
    moduleReturnView = "bitacora_guardia";
  }else if(view === "rondinero" || view === "rondinero_detalle" || view === "rondinero_qr"){
    moduleReturnView = "rondinero";
  }else if(view === "rondinero_guardia" || view === "rondinero_guardia_scanner"){
    moduleReturnView = "rondinero_guardia";
  }
  return moduleReturnView;
}

function rememberModuleReturnForVisita(v = {}){
  moduleReturnView = isVisitante(v) ? "dashboard_visitantes" : "dashboard_proveedores";
  return moduleReturnView;
}

function renderVisitaReturnDashboard(){
  if(moduleReturnView === "dashboard_visitantes") return renderDashboardHoy("visitantes");
  if(moduleReturnView === "dashboard_proveedores") return renderDashboardHoy("proveedores");
  return renderModuleHome();
}

function renderModuleHome(){
  currentView = "module_home";
  try{ setActiveSb(""); }catch{}
  if(qSearch){qSearch.value="";qSearch.style.display="none";}

  const firstName = esc(String(currentUser?.nombre || currentUser?.name || "").trim().split(/\s+/)[0] || "");
  const menuIcons = {dashboard_proveedores:"📊",nuevo:"📅",citas_proveedores:"🗂️",dashboard_visitantes:"📈",nuevo_visitante:"➕",citas_visitantes:"📋",vales_personal:"📊",nuevo_vale_personal:"➕",proximos_vales_personal:"📅",vales_activos:"📊",nuevo_vale_activo:"➕",historial_vales_personal:"🕘",historial_vales_activos:"🧭",scan:"▦",bitacora_guardia:"📝",rondinero:"🛡️",historial:"🕘",reportes:"📊",reporte_encuesta_visitantes:"😊",reporte_nominas:"🧾",reporte_cambios:"↻",export_excel:"X",export_pdf:"PDF",mi_cuenta:"🔒",mi_pin:"🔐",roles:"👥",role_permissions:"🔑",personas_visita:"📇",proveedores:"🚚",sesiones_activas:"●",eliminarfinalizados:"🗑️",duplicados_vales_personal:"🧹",depurar_30d:"📆",depurar_base:"⚠️",help_guide:"?",help_about:"ⓘ"};
  const link = (key,label,show=true,description="") => show ? `<button class="access-menu-link" data-sb="${key}"><span class="access-kiosk-icon" aria-hidden="true">${menuIcons[key] || "•"}</span><span class="access-kiosk-label">${label}</span>${description ? `<span class="access-kiosk-description">${description}</span>` : ""}</button>` : "";
  const group = (title,description,icon,iconClass,items) => {
    const links = items.filter(Boolean).join("");
    return links ? `<details class="access-menu-group"><summary class="access-menu-group-head"><span class="access-home-icon ${iconClass}">${icon}</span><div><h3>${title}</h3><p>${description}</p></div><span class="access-menu-caret" aria-hidden="true">›</span></summary><div class="access-menu-links">${links}</div></details>` : "";
  };
  const groups = [
    group("Proveedores","Citas y control de accesos","🚚","provider",[
      link("dashboard_proveedores","Dashboard",hasPerm("ver_dashboard_proveedores")),link("nuevo","Nueva cita",canCreateProveedorCita() && !isVisitanteOnlyRole()),link("citas_proveedores","Consultar citas",hasPerm("ver_citas_compras") && !isVisitanteOnlyRole())]),
    group("Visitantes","Registro y seguimiento","👥","visitor",[
      link("dashboard_visitantes","Dashboard",hasPerm("ver_dashboard_visitantes")),link("nuevo_visitante","Nueva cita",canCreateVisitanteCita()),link("citas_visitantes","Consultar citas",hasPerm("ver_citas_compras"))]),
    group("Vales de Personal","Permisos de salida y entrada","👤","vales",[
      link("vales_personal","Dashboard",hasPerm("ver_vales_personal"),"Operación del día"),
      link("nuevo_vale_personal",hasPerm("crear_permiso_imss") && !hasPerm("crear_vale_personal") ? "Nuevo permiso IMSS" : "Nuevo vale",hasPerm("crear_vale_personal") || hasPerm("crear_permiso_imss"),"Generar un nuevo permiso de personal"),
      link("proximos_vales_personal","Próximos vales",hasPerm("ver_vales_personal"),"Permisos programados para fechas posteriores"),
      link("historial_vales_personal","Historial",hasPerm("ver_historial_vales_personal") && [ROLES.ADMIN,ROLES.GUARDIA].includes(currentUser?.role),"Recorrido completo de vales de personal")]),
    group("Vales de Activo","Control de salida y regreso de activos","📦","provider",[
      link("vales_activos","Dashboard",hasPerm("ver_vales_activos"),"Operación de activos"),
      link("nuevo_vale_activo","Nuevo vale",hasPerm("crear_vale_activo"),"Generar un nuevo vale de activo"),
      link("historial_vales_activos","Historial",hasPerm("ver_historial_vales_activos") && [ROLES.ADMIN,ROLES.GUARDIA].includes(currentUser?.role),"Recorrido de Vales de Activo")]),
    group("Guardia y Rondinero","Operación de seguridad","🛡","rounds",[
      link("scan","Escáner de accesos",hasPerm("escanear_qr"),"Proveedores, visitantes y vales"),link("bitacora_guardia","Bitácora",hasPerm("ver_bitacora_guardia")),link("rondinero","Rondinero",hasPerm("rondinero_ver"))]),
    group("Reportes","Consultas y exportaciones","📊","provider",[
      link("historial","Historial",hasPerm("ver_historial")),link("reportes","Indicadores",hasPerm("ver_reportes")),link("reporte_encuesta_visitantes","Encuesta recepción",[ROLES.ADMIN,ROLES.RECEPCIONISTA].includes(currentUser?.role),"Satisfacción del servicio de recepción"),link("reporte_nominas","Reporte Nóminas",currentUser?.role === ROLES.ADMIN && hasPerm("ver_reporte_nominas"),"Minutos excedentes por colaborador"),link("reporte_cambios","Cambios",hasPerm("ver_reporte_cambios")),link("export_excel","Exportar Excel",hasPerm("exportar_excel")),link("export_pdf","Exportar PDF",hasPerm("exportar_excel"))]),
    group("Configuración","Usuarios y seguridad","⚙","visitor",[
      link("mi_cuenta","Mi cuenta",true,"Cambiar contraseña y revisar seguridad"),link("mi_pin","Mi PIN",canConfigurePin()),link("roles","Usuarios",hasPerm("admin_roles")),link("role_permissions","Roles y permisos",hasPerm("admin_roles")),link("personas_visita","Directorio",currentUser?.role === ROLES.ADMIN),link("proveedores","Catálogo proveedores",currentUser?.role === ROLES.ADMIN),link("sesiones_activas","Sesiones activas",hasPerm("ver_sesiones_activas"))]),
    group("Mantenimiento de datos","Herramientas administrativas de eliminación","⚠","vales",[
      link("eliminarfinalizados","Finalizados de hoy",currentUser?.role === ROLES.ADMIN && hasPerm("limpiar_finalizados"),"Elimina únicamente visitas finalizadas del día"),
      link("duplicados_vales_personal","Duplicados de vales",currentUser?.role === ROLES.ADMIN && hasPerm("eliminar"),"Detecta y elimina copias repetidas; conserva el registro con mayor avance"),
      link("depurar_30d","Retención de 30 días",currentUser?.role === ROLES.ADMIN && hasPerm("eliminar"),"Elimina registros cerrados con más de 30 días"),
      link("resumen_depurar_30d","Último resumen",currentUser?.role === ROLES.ADMIN && hasPerm("eliminar"),"Consulta el resultado persistente de la última depuración"),
      link("depurar_base","Depuración hasta hoy",currentUser?.role === ROLES.ADMIN && hasPerm("eliminar"),"Elimina registros históricos hasta hoy; conserva futuros")]),
    group("Ayuda","Información y asistencia","?","vales",[link("help_guide","Guía rápida"),link("help_about","Acerca de")])
  ].filter(Boolean).join("");
  appEl.innerHTML = `
    <section class="access-home">
      <div class="access-sky-decor" aria-hidden="true">
        <svg viewBox="0 0 230 132" role="presentation">
          <g class="access-sky-day">
            <g stroke="#f5b928" stroke-width="4" stroke-linecap="round" opacity=".82">
              <path d="M174 7v11M174 68v11M139 43h-11M220 43h-11M149 18l-8-8M199 68l8 8M149 68l-8 8M199 18l8-8"/>
            </g>
            <circle cx="174" cy="43" r="23" fill="#ffd75e"/>
            <circle cx="167" cy="36" r="12" fill="#ffe993" opacity=".7"/>
            <g class="access-sky-cloud" fill="#fff" stroke="#d7e9fa" stroke-width="1.5">
              <path d="M82 82c2-13 12-21 25-19 5-14 26-15 33-2 13-3 25 6 25 19 0 9-7 16-17 16H97c-10 0-17-6-15-14Z"/>
            </g>
            <g class="access-sky-cloud is-second" fill="#f7fbff" stroke="#d7e9fa" stroke-width="1.5" opacity=".9">
              <path d="M24 105c1-9 9-15 18-13 5-10 20-10 25 0 10-2 18 5 18 14 0 7-5 12-13 12H37c-8 0-14-5-13-13Z"/>
            </g>
          </g>
          <g class="access-sky-night">
            <path d="M178 17a34 34 0 1 0 29 54 31 31 0 0 1-29-54Z" fill="#dcecff"/>
            <path d="M182 24a27 27 0 0 0 18 42 27 27 0 0 1-18-42Z" fill="#ffffff" opacity=".72"/>
            <g fill="#b9dcff">
              <circle class="access-sky-star" cx="116" cy="23" r="3"/><circle class="access-sky-star" cx="137" cy="52" r="2.4"/>
              <circle class="access-sky-star" cx="215" cy="18" r="2.2"/><circle class="access-sky-star" cx="220" cy="78" r="3"/>
              <circle class="access-sky-star" cx="91" cy="68" r="2"/><circle class="access-sky-star" cx="151" cy="91" r="2.6"/>
              <path class="access-sky-star" d="M52 31l2.4 6.2 6.2 2.4-6.2 2.4-2.4 6.2-2.4-6.2-6.2-2.4 6.2-2.4Z"/>
              <path class="access-sky-star" d="M104 100l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/>
            </g>
          </g>
        </svg>
      </div>
      <div class="access-home-welcome"><h2>Bienvenido${firstName ? `, ${firstName}` : ""}</h2><p>Selecciona una opción para gestionar el control de accesos.</p></div>
      <div class="access-menu-grid">${groups || `<div style="color:#68779b">No hay módulos disponibles para este perfil.</div>`}</div>
      <div class="access-home-scene" aria-hidden="true"><svg viewBox="0 0 560 275"><defs><linearGradient id="homeSky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e4f4ff"/><stop offset="1" stop-color="#cce9ff"/></linearGradient><linearGradient id="homeBuilding" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8cc8f5"/><stop offset="1" stop-color="#4b91cf"/></linearGradient></defs><path fill="url(#homeSky)" d="M0 86 90 55l92 24 103-45 118 39 157-55v257H0z"/><path fill="#c2e3f8" d="m0 147 106-46 70 21 98-54 121 47 165-66v226H0z"/><ellipse cx="80" cy="250" rx="58" ry="12" fill="#a7d1ec"/><path fill="#7caaca" d="M48 238h12l4-78-11-13-10 14z"/><circle cx="54" cy="139" r="27" fill="#8bbbd3"/><circle cx="38" cy="160" r="22" fill="#83b1ca"/><circle cx="69" cy="162" r="24" fill="#92c1d7"/><path fill="url(#homeBuilding)" d="M172 118h290v132H172z"/><path fill="#2879bd" d="M151 107 327 53l171 53v19H151z"/><path fill="#d8efff" d="M194 138h90v112h-90z"/><path fill="#2e6eaa" d="M304 135h118v115H304z"/><path fill="#78b9e7" d="M320 151h38v82h-38zM371 151h35v82h-35z"/><path fill="#f5fbff" d="M422 155h25v95h-25z"/><path fill="#de3d3d" d="M0 236h178v12H0z"/><path fill="#fff" d="m8 236 18 12h22l-18-12zm52 0 18 12h22l-18-12zm52 0 18 12h22l-18-12z"/><path fill="#5e8db2" d="M12 225h6v37h-6zm150 0h6v37h-6z"/></svg></div>
    </section>`;
}

function isDashboardView(){
  return currentView === "dashboard_proveedores" || currentView === "dashboard_visitantes";
}

function renderActiveDashboard(){
  return renderDashboardHoy(getActiveDashboardTipo());
}

function localDateKeyFromTs(ts){
  if(typeof ts !== "number") return "";
  const d = new Date(ts);
  if(Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeSummaryKey(value){
  return String(value || "sin_valor")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "sin_valor";
}

function resumenVisitaDimensions(v={}){
  const fechaKey = localDateKeyFromTs(Number(v.fechaHoraTs));
  if(!fechaKey) return null;
  return {
    fechaKey,
    statusKey: safeSummaryKey(v.status || "sin_status"),
    tipoKey: safeSummaryKey(getTipoVisita(v)),
    areaKey: safeSummaryKey(v.area || "sin_area"),
    countable: v.status !== Status.CANCELADO
  };
}

function addResumenDeltaToBatch(batch, dims, delta){
  if(!dims || !delta) return;
  const ref = doc(db, COL_RESUMEN_DIARIO, dims.fechaKey);
  const update = {
    fecha: dims.fechaKey,
    updatedTs: Date.now(),
    updatedAt: serverTimestamp()
  };

  if(dims.countable){
    update.total = increment(delta);
    update[`status.${dims.statusKey}`] = increment(delta);
    update[`tipo.${dims.tipoKey}`] = increment(delta);
    update[`area.${dims.areaKey}`] = increment(delta);
  }

  batch.set(ref, update, { merge: true });
}

function addResumenDiffToBatch(batch, before, after){
  const oldDims = resumenVisitaDimensions(before || {});
  const newDims = resumenVisitaDimensions(after || {});
  if(oldDims) addResumenDeltaToBatch(batch, oldDims, -1);
  if(newDims) addResumenDeltaToBatch(batch, newDims, 1);
}

async function rebuildResumenDiarioFromList(fechaKey, list){
  if(!fechaKey || !Array.isArray(list)) return;

  const summary = {
    fecha: fechaKey,
    total: 0,
    status: {},
    tipo: {},
    area: {},
    rebuiltTs: Date.now(),
    rebuiltAt: serverTimestamp(),
    updatedTs: Date.now(),
    updatedAt: serverTimestamp()
  };

  list.forEach(v => {
    const dims = resumenVisitaDimensions(v);
    if(!dims || dims.fechaKey !== fechaKey || !dims.countable) return;
    summary.total++;
    summary.status[dims.statusKey] = (summary.status[dims.statusKey] || 0) + 1;
    summary.tipo[dims.tipoKey] = (summary.tipo[dims.tipoKey] || 0) + 1;
    summary.area[dims.areaKey] = (summary.area[dims.areaKey] || 0) + 1;
  });

  await setDoc(doc(db, COL_RESUMEN_DIARIO, fechaKey), summary, { merge: false });
}

function splitDocTokens(value=""){
  return String(value || "")
    .split(/[\s,;|/]+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function normalizeFacturasOc(v={}){
  const src = Array.isArray(v.facturasOc) ? v.facturasOc : [];
  const rels = src.map(r => ({
    facturaNo: String(r?.facturaNo || "").trim(),
    ocNos: Array.isArray(r?.ocNos) ? r.ocNos.map(x => String(x || "").trim()).filter(Boolean) : splitDocTokens(r?.ocNos || "")
  })).filter(r => r.facturaNo || r.ocNos.length);

  if(rels.length) return rels;

  const facturas = splitDocTokens(v.facturaNo || "");
  const ocs = splitDocTokens(v.ocNo || "");

  if(facturas.length){
    return facturas.map((facturaNo, idx) => ({
      facturaNo,
      ocNos: idx === 0 ? ocs : []
    }));
  }

  if(ocs.length) return [{ facturaNo: "", ocNos: ocs }];
  return [{ facturaNo: "", ocNos: [] }];
}

function renderFacturaOcItem(rel={}, idx=0, editorId="facturasOcEditor"){
  const facturaNo = rel?.facturaNo || "";
  const ocNos = Array.isArray(rel?.ocNos) ? rel.ocNos.join(", ") : String(rel?.ocNos || "");
  return `
    <div class="factura-oc-item" data-index="${idx}">
      <div>
        <label>Factura ${idx + 1}</label>
        <input class="js-factura-no" maxlength="100" placeholder="Ej. FAC-88921" value="${esc(facturaNo)}">
      </div>
      <div>
        <label>OC relacionadas</label>
        <textarea class="js-oc-nos" rows="1" placeholder="Ej. 12345, 67890">${esc(ocNos)}</textarea>
      </div>
      <button class="secondary factura-oc-remove" type="button" data-action="removeFacturaOc" data-editor="${esc(editorId)}" title="Quitar factura">x</button>
    </div>
  `;
}

function renderFacturaOcEditor(relaciones, editorId="facturasOcEditor"){
  const rows = (relaciones && relaciones.length ? relaciones : [{ facturaNo:"", ocNos:[] }]);
  return `
    <div class="factura-oc-editor" id="${esc(editorId)}">
      <div class="factura-oc-head">
        <div>
          <label>Facturas y Ordenes de Compra</label>
          <div class="factura-oc-hint">Agrega una fila por factura y escribe maximo 8 OC de 5 caracteres, separadas por coma, espacio o salto de linea.</div>
        </div>
        <button class="secondary" type="button" data-action="addFacturaOc" data-editor="${esc(editorId)}">Agregar factura</button>
      </div>
      <div class="factura-oc-list">
        ${rows.map((r, i) => renderFacturaOcItem(r, i, editorId)).join("")}
      </div>
    </div>
  `;
}

function syncFacturasOcEditorNumbers(editor){
  if(!editor) return;
  editor.querySelectorAll(".factura-oc-item").forEach((row, idx) => {
    row.dataset.index = String(idx);
    const label = row.querySelector("label");
    if(label) label.textContent = `Factura ${idx + 1}`;
  });
}

function collectFacturaOcFromDom(editorId="facturasOcEditor"){
  const editor = document.getElementById(editorId);
  if(!editor) return { facturasOc: [], facturaNo: "", ocNo: "" };

  const rows = Array.from(editor.querySelectorAll(".factura-oc-item"));
  const facturasOc = [];

  for(const row of rows){
    const facturaNo = (row.querySelector(".js-factura-no")?.value || "").trim();
    const ocNos = splitDocTokens(row.querySelector(".js-oc-nos")?.value || "");

    if(!facturaNo && !ocNos.length) continue;

   
if(!facturaNo && !ocNos.length){
  // fila vacía → ignorar
  continue;
}


    if(!ocNos.length){
      toast("OC requerida", `La factura ${facturaNo} necesita al menos una OC.`, "warn", 3200);
      return null;
    }

    if(ocNos.length > 8){
      toast("Limite de OC", `La factura ${facturaNo} solo puede tener maximo 8 ordenes de compra.`, "warn", 4200);
      return null;
    }

    const invalid = ocNos.find(oc => oc.length !== 5);
    if(invalid){
      toast("OC invalida", `La OC ${invalid} debe tener exactamente 5 caracteres.`, "warn", 3600);
      return null;
    }

    facturasOc.push({ facturaNo, ocNos });
  }

  return {
    facturasOc,
    facturaNo: facturasOc.map(r => r.facturaNo).join(", "),
    ocNo: [...new Set(facturasOc.flatMap(r => r.ocNos))].join(", ")
  };
}

function formatFacturasOc(v={}){
  const rels = normalizeFacturasOc(v).filter(r => r.facturaNo || r.ocNos.length);
  if(!rels.length) return "-";
  return rels.map(r => `${r.facturaNo || "Sin factura"}: ${(r.ocNos || []).join(", ") || "Sin OC"}`).join(" | ");
}
function renderFacturasOcReadonly(v={}){
  const rels = normalizeFacturasOc(v).filter(r => r.facturaNo || r.ocNos.length);
  if(!rels.length){
    return `
      <div class="pill qr-detail-row">
        <span style="color:var(--muted)">Factura / OC</span>
        <b style="color:var(--text)">-</b>
      </div>
    `;
  }

  return `
    <div class="factura-oc-editor factura-oc-readonly">
      <div class="factura-oc-head">
        <label>Facturas y Ordenes de Compra</label>
      </div>
      <div class="factura-oc-list">
        ${rels.map((r, idx) => `
          <div class="factura-oc-item">
            <div>
              <label>Factura ${idx + 1}</label>
              <div class="pill qr-detail-row"><span style="color:var(--muted)">No. Factura</span><b style="color:var(--text)">${esc(r.facturaNo || "-")}</b></div>
            </div>
            <div>
              <label>OC relacionadas</label>
              <div class="pill qr-detail-row"><span style="color:var(--muted)">OC</span><b style="color:var(--text)">${esc((r.ocNos || []).join(", ") || "-")}</b></div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function toast(title, msg, type="info", ttl=2600){
      const badgeColor =
        type==="ok" ? "var(--ok)" :
        type==="warn" ? "var(--warn)" :
        type==="bad" ? "var(--bad)" : "var(--info)";
      const el = document.createElement("div");
      el.className = "toast";
      el.innerHTML = `
        <span class="badge" style="background:${badgeColor}"></span>
        <div><b>${esc(title)}</b><p>${esc(msg)}</p></div>
      `;
      toasts.appendChild(el);
      setTimeout(()=>el.remove(), ttl);
    }

    function hasPerm(perm){
      if(!currentUser) return false;
      const perms = getPermsForRole(currentUser.role);
      return perms.includes(perm);
    }

    function requirePerm(perm, msg){
      if(hasPerm(perm)) return true;
      toast("Acceso denegado", msg || "No tienes permiso.", "bad", 3200);
      return false;
    }

// ===================================================
// REPORTES – FUNCIONES DE CÁLCULO (PASO 2)
// ===================================================

// 1️⃣ Filtro por rango de fechas (fechaHoraTs)
function filterVisitasByRange(visitas, fromTs, toTs){
  return visitas.filter(v =>
    typeof v.fechaHoraTs === "number" &&
    v.fechaHoraTs >= fromTs &&
    v.fechaHoraTs <= toTs
  );
}

// 2️⃣ Filtro por área (si area === "" → todas)
function filterByArea(visitas, area){
  if(!area) return visitas;
  return visitas.filter(v => v.area === area);
}

// 3️⃣ Conteo de visitas por área
function countByArea(visitas){
  const out = {};
  visitas.forEach(v => {
    const a = v.area || "Sin área";
    out[a] = (out[a] || 0) + 1;
  });
  return out; // { "Avíos": 10, "Aduana Peleteria": 5, ... }
}

// 4️⃣ Conteo por status
function countByStatus(visitas){
  const out = {};
  visitas.forEach(v => {
    const s = v.status || "desconocido";
    out[s] = (out[s] || 0) + 1;
  });
  return out; // { programado: 4, dentro: 2, finalizado: 10 }
}

// 5️⃣ Dictamen de calidad (solo cuando existe)
function dictamenStats(visitas){
  const stats = { aceptado: 0, rechazado: 0, pendiente: 0 };

  visitas.forEach(v => {
    if(v.dictamen && v.dictamen.estado){
      const e = v.dictamen.estado.toLowerCase();
      if(stats[e] !== undefined){
        stats[e]++;
      }
    }
  });

  return stats;
}

// 6️⃣ Tiempo promedio por área (minutos)
function avgTiempoPorArea(visitas){
  const buckets = {};
  const counts = {};

  visitas.forEach(v => {
    if(
      typeof v.entradaTs === "number" &&
      typeof v.salidaTs === "number" &&
      v.salidaTs > v.entradaTs
    ){
      const area = v.area || "Sin área";
      const mins = (v.salidaTs - v.entradaTs) / 60000;

      buckets[area] = (buckets[area] || 0) + mins;
      counts[area] = (counts[area] || 0) + 1;
    }
  });

  const promedios = {};
  Object.keys(buckets).forEach(area => {
    promedios[area] = Math.round(buckets[area] / counts[area]);
  });

  return promedios; // { "Avíos": 42, "Aduana Peleteria": 55 }
}

// 7️⃣ Incidencias por área
function incidenciasPorArea(visitas){
  const out = {};
  visitas.forEach(v => {
    const inc = (v.dictamen?.incidencia || "SIN_INCIDENCIAS").trim();
    if(inc && inc !== "SIN_INCIDENCIAS"){
      const area = v.area || "Sin área";
      out[area] = (out[area] || 0) + 1;
    }
  });
  return out;
}

// 8️⃣ KPIs generales
function calcKPIs(visitas){
  const total = visitas.length;
  let totalTiempo = 0;
  let conteoTiempo = 0;
  let rechazos = 0;
  let incidencias = 0;

  visitas.forEach(v => {
    if(v.entradaTs && v.salidaTs && v.salidaTs > v.entradaTs){
      totalTiempo += (v.salidaTs - v.entradaTs);
      conteoTiempo++;
    }

    if(v.dictamen?.estado === "rechazado"){
      rechazos++;
    }

    // ✅ Incidencias tomadas de Revisión de Calidad
    const inc = (v.dictamen?.incidencia || "SIN_INCIDENCIAS").trim();
    if(inc && inc !== "SIN_INCIDENCIAS"){
      incidencias++;
    }
  });

  return {
    total,
    tiempoPromedioMin: conteoTiempo ? Math.round((totalTiempo / conteoTiempo) / 60000) : 0,
    pctRechazo: total ? Math.round((rechazos / total) * 100) : 0,
    incidencias,
  };
}

function renderChartVisitasPorArea(visitas){
  const dataByArea = countByArea(visitas);

  const labels = Object.keys(dataByArea);
  const values = Object.values(dataByArea);

  const ctx = document.getElementById("chartArea");
  if(!ctx) return;

  // Destruir gráfica previa (si existe)
  if(chartAreaInstance){
    chartAreaInstance.destroy();
  }

  chartAreaInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
     datasets: [{
      label: "Visitas",
      data: values,
      backgroundColor: "rgba(59,130,246,.75)",
      borderColor: "rgba(59,130,246,1)",
      borderWidth: 1,
      borderRadius: 6
     }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.raw} visitas`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}

function renderChartEstados(visitas){
  // Usa tu función del Paso 2
  const byStatus = countByStatus(visitas);

  // Orden fijo (para que siempre se vea igual)
  const labels = ["programado","llegado","dentro","despachado","finalizado"];
  const values = labels.map(k => byStatus[k] || 0);

  const ctx = document.getElementById("chartEstado");
  if(!ctx) return;

  // Destruye instancia previa (evita "valores viejos" y encimados)
  if(chartEstadoInstance){
    chartEstadoInstance.destroy();
  }

  chartEstadoInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Programados","Llegaron","Dentro","Despachados","Finalizados"],
      datasets: [{
        data: values,
        backgroundColor: [
          "rgba(56,189,248,.85)",  // programado (info)
          "rgba(250,204,21,.85)",  // llegado (warn)
          "rgba(34,197,94,.85)",   // dentro (ok)
          "rgba(59,130,246,.85)",  // despachado (brand)
          "rgba(148,163,184,.65)"  // finalizado (muted)
        ],
        legend: {
  position: "bottom",
  labels: {
    color: "#e5e7eb",
    boxWidth: 10,
    padding: 14
  }
},
        borderColor: "rgba(255,255,255,.10)",
        borderWidth: 1,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // recomendado cuando controlas la altura del contenedor [1](https://www.chartjs.org/docs/latest/configuration/responsive.html)
      cutout: "60%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#e5e7eb", boxWidth: 10 }
        },
        tooltip: {
          callbacks: {
            label: (c) => ` ${c.label}: ${c.raw}`
          }
        }
      }
    }
  });
}

function renderChartDictamen(visitas){
  const s = dictamenStats(visitas); // { aceptado, rechazado, pendiente }

  const labels = ["Aceptado", "Rechazado", "Pendiente"];
  const values = [s.aceptado || 0, s.rechazado || 0, s.pendiente || 0];

  const total = values.reduce((a,b)=>a+b,0);

  const ctx = document.getElementById("chartDictamen");
  if(!ctx) return;

  // Evita instancias viejas
  if(chartDictamenInstance){
    chartDictamenInstance.destroy();
  }

  // Si no hay dictámenes, muestra un donut "vacío" informativo
  const dataToPlot = total > 0 ? values : [1];
  const labelsToPlot = total > 0 ? labels : ["Sin dictámenes"];

  chartDictamenInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labelsToPlot,
      datasets: [{
        data: dataToPlot,
        backgroundColor: total > 0
          ? [
              "rgba(34,197,94,.85)",  // Aceptado (ok)
              "rgba(239,68,68,.85)",  // Rechazado (bad)
              "rgba(250,204,21,.85)"  // Pendiente (warn)
            ]
          : ["rgba(148,163,184,.35)"], // "Sin dictámenes"
        borderColor: "rgba(255,255,255,.10)",
        borderWidth: 1,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#e5e7eb", boxWidth: 10 }
        },
        tooltip: {
          callbacks: {
            label: (c) => {
              if(total === 0) return " Sin dictámenes";
              const val = c.raw || 0;
              const pct = total ? Math.round((val/total)*100) : 0;
              return ` ${c.label}: ${val} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderChartTiempoPorArea(visitas){
  const proms = avgTiempoPorArea(visitas); // { "Avíos": 42, "Aduana Peleteria": 55, ... }

  // Orden: por minutos desc (más tardado arriba)
  const entries = Object.entries(proms)
    .map(([area, min]) => [area, Number(min) || 0])
    .filter(([,min]) => min > 0)
    .sort((a,b) => b[1] - a[1]);

  const ctx = document.getElementById("chartTiempo");
  if(!ctx) return;

  // Si no hay datos de tiempos, limpia la gráfica y muestra "—"
  if(chartTiempoInstance){
    chartTiempoInstance.destroy();
    chartTiempoInstance = null;
  }
  if(entries.length === 0){
    // Deja el canvas vacío; opcionalmente puedes mostrar un toast
    return;
  }

  const labels = entries.map(e => e[0]);
  const values = entries.map(e => e[1]);

  chartTiempoInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Minutos promedio",
        data: values,
        backgroundColor: "rgba(34,197,94,.75)", // verde
        borderColor: "rgba(34,197,94,.95)",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => ` ${c.raw} min`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => `${v}m`
          }
        },
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: false
          }
        }
      }
    }
  });
}

function renderChartIncidenciasPorArea(visitas){
  const byArea = incidenciasPorArea(visitas); // ✅ ya basado en Calidad

  // Ordena desc por incidencias
  const entries = Object.entries(byArea)
    .map(([area, n]) => [area || "Sin área", Number(n) || 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const ctx = document.getElementById("chartIncidencias");
  if(!ctx) return;

  // ✅ Destruye instancia previa
  if(chartIncidenciasInstance){
    try { chartIncidenciasInstance.destroy(); } catch(e){}
    chartIncidenciasInstance = null;
  }

  // ✅ Placeholder si no hay incidencias
  if(entries.length === 0){
    chartIncidenciasInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Sin incidencias (Calidad)"],
        datasets: [{
          label: "Incidencias",
          data: [0],
          backgroundColor: "rgba(148,163,184,.45)",
          borderColor: "rgba(148,163,184,.75)",
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: () => " 0 incidencia(s)" } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { ticks: { maxRotation: 0, autoSkip: false } }
        }
      }
    });
    return;
  }

  const labels = entries.map(e => e[0]);
  const values = entries.map(e => e[1]);

  chartIncidenciasInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Incidencias",
        data: values,
        backgroundColor: "rgba(250,204,21,.8)",
        borderColor: "rgba(250,204,21,1)",
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${c.raw} incidencia(s)` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { ticks: { maxRotation: 0, autoSkip: false } }
      }
    }
  });
}

function renderChartPuntualidad(aTiempo, tarde, noShow){
  const canvas = document.getElementById("chartPuntualidad");
  if(!canvas){
    console.warn("chartPuntualidad: no existe el canvas #chartPuntualidad");
    return;
  }

  // ✅ Chart.js disponible?
  if(!window.Chart){
    toast("Chart.js", "La librería Chart.js aún no está lista. Intenta de nuevo.", "warn", 3200);
    console.warn("window.Chart no existe (Chart.js no cargó)");
    return;
  }

  const ctx = canvas.getContext("2d");
  if(!ctx) return;

  // ✅ Destruye instancia previa
  if(chartPuntualidadInstance){
    try{ chartPuntualidadInstance.destroy(); }catch(e){}
    chartPuntualidadInstance = null;
  }

  const at = Number(aTiempo) || 0;
  const ta = Number(tarde) || 0;
  const ns = Number(noShow) || 0;
  const total = at + ta + ns;

  // Placeholder si no hay datos
  if(total === 0){
    chartPuntualidadInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Sin datos"],
        datasets: [{
          data: [1],
          backgroundColor: ["rgba(148,163,184,.35)"],
          borderColor: "rgba(255,255,255,.10)",
          borderWidth: 1,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom", labels: { color: "#e5e7eb", boxWidth: 10 } },
          tooltip: { callbacks: { label: () => " Sin datos" } }
        }
      }
    });
    return;
  }

  chartPuntualidadInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["A tiempo", "Tarde", "No show"],
      datasets: [{
        data: [at, ta, ns],
        backgroundColor: [
          "rgba(34,197,94,.85)",   // ok
          "rgba(250,204,21,.85)",  // warn
          "rgba(239,68,68,.85)"    // bad
        ],
        borderColor: "rgba(255,255,255,.10)",
        borderWidth: 1,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#e5e7eb", boxWidth: 10 }
        },
        tooltip: {
          callbacks: {
            label: (c) => {
              const val = c.raw || 0;
              const pct = total ? Math.round((val/total)*100) : 0;
              return ` ${c.label}: ${val} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// -------------------------
// Sidebar (Opción A)
// -------------------------
function sbOpen(){
  if(!sidebarEl) return;
  sidebarEl.classList.add('open');
  if(sbOverlay) sbOverlay.classList.add('show');
}
function sbClose(){
  if(!sidebarEl) return;
  sidebarEl.classList.remove('open');
  if(sbOverlay) sbOverlay.classList.remove('show');
}
function sbToggle(){
  if(!sidebarEl) return;
  (sidebarEl.classList.contains('open')) ? sbClose() : sbOpen();
}
function setActiveSb(key){
  document.querySelectorAll('[data-sb]').forEach(el=>{
    if(el.dataset.sb === key) el.setAttribute('aria-current','page');
    else el.removeAttribute('aria-current');
  });
}

function setSbExpanded(btn, sub, expanded){
  if(!btn || !sub) return;
  sub.classList.toggle('open', !!expanded);
  btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function toggleSbSub(btn, sub){
  if(!btn || !sub) return;
  setSbExpanded(btn, sub, !sub.classList.contains('open'));
}

function collapseSidebarSubs(){
  setSbExpanded(document.getElementById('sbProveedoresToggle'), sbProveedoresSub, false);
  setSbExpanded(document.getElementById('sbVisitantesToggle'), sbVisitantesSub, false);
  setSbExpanded(document.getElementById('sbValesToggle'), sbValesSub, false);
  setSbExpanded(document.getElementById('sbGuardiaToggle'), sbGuardiaSub, false);
  setSbExpanded(document.getElementById('sbReportesToggle'), sbReportesSub, false);
  setSbExpanded(document.getElementById('sbHelpToggle'), sbHelpSub, false);
  setSbExpanded(document.getElementById('sbExportToggle'), sbExportSub, false);
  setSbExpanded(document.getElementById('sbConfigToggle'), sbConfigSub, false);
}

function helpAboutHtml(){
  return `
    <div class="help-about-hero">
      <span class="help-about-logo brand-shield" role="img" aria-label="Escudo de Caborca Access Control"></span>
      <div>
        <h2>Caborca Access Control</h2>
        <p>Plataforma unificada para gestionar accesos, visitas y movimientos internos.</p>
        <span class="help-version">Versión ${esc(APP_VERSION)}</span>
      </div>
    </div>
    <div class="help-grid">
      <section class="help-panel">
        <h4>Acerca de la aplicación</h4>
        <p>Caborca Access Control centraliza el registro y seguimiento de proveedores, visitantes, vales de personal, vales de activos, actividades de guardia y rondines de seguridad.</p>
        <p>Incluye códigos QR, escaneo de gafetes, autorizaciones por rol, controles de entrada y salida, reportes operativos y funcionamiento con respaldo local.</p>
        <p>Rondinero permite dar de alta los puntos primero y configurar después su ubicación física. Al operar, valida mediante GPS que la tablet esté dentro del radio autorizado y conserva distancia y precisión como evidencia.</p>
      </section>
      <section class="help-panel">
        <h4>Módulos principales</h4>
        <ul>
          <li>Proveedores y visitantes</li>
          <li>Vales de personal y activos</li>
          <li>Guardia, bitácora y Rondinero</li>
          <li>Reportes, usuarios y permisos</li>
        </ul>
      </section>
      <section class="help-panel">
        <h4>Estado de la aplicación</h4>
        <p>Versión cargada: <b>${esc(APP_VERSION)}</b>. Usa el diagnóstico para revisar navegador, conexión, caché y service worker sin consultar información operativa.</p>
        <div class="row"><button type="button" class="secondary" data-action="openAppDiagnostics">Diagnóstico</button><button type="button" class="secondary" data-action="repairAppCache">Reparar aplicación</button></div>
      </section>
      <section class="help-panel">
        <h4>Versiones recientes</h4>
        <div class="help-changelog">
          <div class="help-release"><b>v268</b><span>Administración puede registrar la hora real de regreso de un vale de personal abierto desde el historial, con PIN y motivo.</span></div>
          <div class="help-release"><b>v267</b><span>Vales de activo incorpora un menú de retorno y amplía las opciones de tipo y motivo en la app y el kiosco.</span></div>
          <div class="help-release"><b>v266</b><span>Jefe de Desarrollo puede recibir y autorizar vales de personal asignados.</span></div>
          <div class="help-release"><b>v265</b><span>Agrega los roles Desarrollo y Jefe de Desarrollo para agendar proveedores y crear vales de activo. Jefe de Desarrollo también puede crear vales de personal.</span></div>
          <div class="help-release"><b>v264</b><span>Los iconos de acción de Vales de personal se alinean horizontalmente en teléfonos.</span></div>
          <div class="help-release"><b>v263</b><span>Los iconos de las tarjetas de Vales de personal tienen el tamaño compacto de Proveedores en teléfonos.</span></div>
          <div class="help-release"><b>v262</b><span>Vales de activo incorpora el detalle del vale, edición antes de autorizar, salida sin regreso, solicitud por WhatsApp y opciones de residuos. Las tarjetas de Vales de personal usan iconos con tooltip.</span></div>
          <div class="help-release"><b>v261</b><span>El inicio de sesión carga el permiso individual para autorizar vales de activo asignados.</span></div>
          <div class="help-release"><b>v260</b><span>El Kanban de Vales de activo adopta el diseño compacto de Proveedores: estado, folio, departamento, datos del activo, autorizador, progreso de firmas e iconos alineados. Firmas y responsables utiliza tipografía proporcional y permanece plegado para ahorrar espacio.</span></div>
          <div class="help-release"><b>v259</b><span>Los vales de activo presentan firmas electrónicas auditables de Elaboró, Autorizó, Guardia de salida y Guardia de regreso. La salida y el regreso continúan exigiendo escanear y validar el gafete del guardia antes de cambiar el estado.</span></div>
          <div class="help-release"><b>v258</b><span>Los vales de personal pendientes muestran por separado Compartir QR para el colaborador y Solicitar autorización para el autorizador. WhatsApp abre la aplicación instalada y conserva la pantalla del QR al regresar, tanto en la aplicación como en el kiosco.</span></div>
          <div class="help-release"><b>v257</b><span>Jefe de Compras puede crear citas y generar QR de visitantes. La aplicación migra el permiso guardado sin ampliar sus facultades de Guardia, edición, cancelación o autorización especial.</span></div>
          <div class="help-release"><b>v256</b><span>El buscador de Proveedores conserva el teclado y el texto durante la captura en tablet y telefono. Facturas y ordenes de compra se ajustan a una columna y muestran el contenido completo en pantallas tactiles.</span></div>
          <div class="help-release"><b>v255</b><span>Las citas de visitantes permiten elegir Visita normal, Visita especial o Devolución. Cada modalidad se identifica en tarjetas, ficha e historial; Visita especial conserva su autorización y Devolución utiliza el flujo normal.</span></div>
          <div class="help-release"><b>v254</b><span>Nueva aplicación modular con dependencias locales y carga optimizada. Las aduanas Peletería, Avíos y Otros permiten una sola cita por horario.</span></div>
          <div class="help-release"><b>v253</b><span>El tema guardado se aplica antes del primer render para evitar el destello oscuro al abrir la aplicación con el tema claro.</span></div>
          <div class="help-release"><b>v249</b><span>Los vales de personal admiten nóminas de practicantes con formato P más tres dígitos, por ejemplo P064, sin confundirlas con nóminas numéricas; el modal individual aprovecha mejor la altura disponible y evita desplazamiento vertical innecesario.</span></div>
          <div class="help-release"><b>v248</b><span>La columna Acciones de Citas de proveedores utiliza botones compactos con iconos y tooltips para ver QR, editar y cancelar; Ver QR aparece únicamente en citas programadas y permite regresar al listado.</span></div>
          <div class="help-release"><b>v247</b><span>Las tarjetas programadas del dashboard de proveedores incorporan un botón compacto con icono para abrir el QR de la cita, sin alterar su estado; el control se oculta después de registrar la llegada.</span></div>
          <div class="help-release"><b>v246</b><span>Los vales individuales y cada integrante de los vales grupales requieren una nómina numérica de exactamente 4 dígitos; se bloquean letras y valores como “Varios”, y las alertas de validación se muestran correctamente sobre el modal.</span></div>
          <div class="help-release"><b>v245</b><span>Los avisos de vales de personal abren directamente la aplicación instalada de WhatsApp en computadora, teléfono o tablet, evitando WhatsApp Web y pestañas adicionales del navegador.</span></div>
          <div class="help-release"><b>v244</b><span>Los vales de personal con tiempo excedido incluyen un aviso manual por WhatsApp al autorizador o, como alternativa, a quien creó el vale; el mensaje informa el tiempo fuera y solicita verificar el registro de entrada con el guardia.</span></div>
          <div class="help-release"><b>v243</b><span>Los vales de personal pueden generarse en modalidad grupal con captura manual de 2 a 10 integrantes, responsable, un solo QR y autorización, movimientos conjuntos o individuales, seguimiento por persona y desglose separado en el reporte de Nóminas.</span></div>
          <div class="help-release"><b>v242</b><span>La retención de 30 días consulta Firebase directamente, protege registros abiertos, muestra una vista previa, procesa eliminaciones confirmadas por bloques y conserva un resumen administrativo con encontrados, protegidos, eliminados y fallidos.</span></div>
          <div class="help-release"><b>v241</b><span>Se incorpora el rol Jefe restringido. Puede gestionar vales de colaboradores normales, pero sus propios vales y los de otros jefes restringidos solo pueden ser generados y autorizados por un Jefe normal o Administrador, identificando al colaborador por número de nómina.</span></div>
          <div class="help-release"><b>v240</b><span>Los gafetes de colaboradores se identifican exclusivamente con el formato QR NOMINA:número. Cuando no existe un vale utilizable, el escáner muestra una pantalla persistente que distingue pendientes, cancelados, desactivados, fechas diferentes y fallas de conexión, con opciones para reintentar o volver.</span></div>
          <div class="help-release"><b>v239</b><span>El historial desplegable de las citas inactivas por retraso conserva fondo claro y texto oscuro legible en todos los temas.</span></div>
          <div class="help-release"><b>v238</b><span>Las citas de proveedores del mismo día requieren 30 minutos de anticipación y horarios cerrados cada media hora. La agenda bloquea horarios de otras áreas, calcula el siguiente bloque permitido y conecta el selector de fecha con la capacidad real del área antes de generar el QR.</span></div>
          <div class="help-release"><b>v237</b><span>Las reglas de Servicio Médico distinguen correctamente la salida a consulta IMSS de la entrada posterior a las 8:15: esta última ya no requiere una hora programada de salida para guardarse en Firebase.</span></div>
          <div class="help-release"><b>v236</b><span>Los estados de proveedores y visitantes se reconcilian con las evidencias reales del recorrido: llegada, entrada, dictamen y salida. Se impide que un dispositivo desactualizado retroceda el Kanban y Administrador o Coordinador reparan registros inconsistentes al sincronizar.</span></div>
          <div class="help-release"><b>v235</b><span>La creación de visitantes espera la confirmación de Firebase antes de generar el QR, evitando pases locales que Guardia no puede validar. Los dashboards consultan la nube según los permisos configurados para cada rol y Servicio Médico puede operar visitantes con las reglas autorizadas.</span></div>
          <div class="help-release"><b>v234</b><span>Las tarjetas de Proveedores, Visitantes, Vales de personal y Vales de activos incorporan un historial desplegable con la fecha, hora y responsable de cada movimiento. El botón compacto de reloj se integra con las acciones y conserva tamaño uniforme en celular.</span></div>
          <div class="help-release"><b>v233</b><span>Enfermería puede generar correctamente permisos IMSS de Entrada posterior a las 8:15, conservando el tipo Permiso IMSS y diferenciando errores de permisos y conexión al guardar en Firebase.</span></div>
          <div class="help-release"><b>v232</b><span>La restricción de reagendas de proveedores mantiene el bloqueo para citas repetidas del día actual, pero permite programar normalmente una nueva cita para mañana o fechas posteriores.</span></div>
          <div class="help-release"><b>v231</b><span>Los perfiles de usuario incorporan número de nómina para impedir la autoautorización de vales de personal; la administración compacta sus acciones con iconos y simplifica la tabla ocultando Empresa.</span></div>
          <div class="help-release"><b>v230</b><span>El Reporte para Nóminas separa minutos de entrada y salida a cobrar, excluye permisos IMSS sin horario límite, pendientes sin regreso y duplicados, y aparta duraciones anómalas para revisión antes de totalizarlas.</span></div>
          <div class="help-release"><b>v229</b><span>Los permisos de Servicio Médico separan Salida a consulta IMSS, con hora programada y regreso sin horario límite, de Entrada posterior a las 8:15, que oculta la hora de salida y calcula el retraso real. Los vales normales de entrada conservan el mismo cálculo automático desde las 8:15 a. m.</span></div>
          <div class="help-release"><b>v223</b><span>Prevención reforzada de vales de personal duplicados y administración segura de perfiles incompletos, evitando que las sesiones anónimas de kiosco creen usuarios vacíos.</span></div>
          <div class="help-release"><b>v222</b><span>Las visitas pueden crearse y editarse después de las 5:00 p. m.; el límite de agenda se conserva exclusivamente para las citas de proveedores.</span></div>
          <div class="help-release"><b>v221</b><span>Las pestañas móviles de Proveedores y Visitantes se distribuyen uniformemente en el ancho de la pantalla, sin desplazamiento horizontal.</span></div>
          <div class="help-release"><b>v220</b><span>Las cuatro pestañas móviles de Vales se distribuyen uniformemente en la pantalla y el último estado se muestra como Finalizado.</span></div>
          <div class="help-release"><b>v219</b><span>Los dashboards muestran KPI operativos en el orden Citas/Vales de hoy, Dentro/Fuera y Finalizados; los pendientes permanecen disponibles en sus columnas y accesos.</span></div>
          <div class="help-release"><b>v218</b><span>Rondinero conserva un caché local compacto, excluye fotografías históricas y puede iniciar en modo en línea cuando Firebase confirma el recorrido aunque el almacenamiento del dispositivo esté restringido.</span></div>
          <div class="help-release"><b>v217</b><span>El escáner general procesa únicamente la primera detección de cada apertura, evitando consultas duplicadas a Firebase y mensajes repetidos al leer vales.</span></div>
          <div class="help-release"><b>v216</b><span>El PIN de seguridad deja de ser interpretado como contraseña por el navegador y se evita que el correo autocompletado invada los buscadores de vales.</span></div>
          <div class="help-release"><b>v215</b><span>Autorización inmediata de vales de personal basada en el permiso configurado para el rol, con PIN, registro del responsable y bloqueo de autoautorización.</span></div>
          <div class="help-release"><b>v214</b><span>Mejora de legibilidad para proveedores con QR inactivo por retraso: encabezado sin traslapes, textos blancos y etiquetas con mayor contraste en temas claro y oscuro.</span></div>
          <div class="help-release"><b>v213</b><span>Nuevo diseño responsivo para los dashboards de Proveedores, Visitantes, Vales de Personal y Vales de Activo, con tarjetas compactas, navegación móvil, filtros por estado y distribución optimizada para teléfono, tablet y computadora.</span></div>
          <div class="help-release"><b>v212</b><span>Después de crear un vale de personal se puede autorizar inmediatamente mediante el modal flotante de PIN o dejarlo pendiente, y en ambos casos se abre el QR para compartirlo. Se evita el autollenado del correo en la búsqueda y se unifica Compartir QR con el botón verde e ícono de WhatsApp.</span></div>
          <div class="help-release"><b>v211</b><span>Se limita y compacta la caché local de vales de personal para evitar errores de almacenamiento, conservando los vales actuales y futuros sin eliminar información de Firebase.</span></div>
          <div class="help-release"><b>v210</b><span>Se corrige el registro de entrada mediante botón y QR para proveedores y visitantes, conservando las validaciones, permisos y formularios existentes.</span></div>
          <div class="help-release"><b>v209</b><span>La sincronización diaria consulta únicamente los módulos autorizados para cada rol y ahora muestra mensajes específicos para errores de sesión, permisos, índices o conexión.</span></div>
          <div class="help-release"><b>v208</b><span>Las citas de Visitantes ya no desactivan su QR por retraso. Los QR antiguos bloqueados únicamente por retraso se reactivan al sincronizar, mientras se conservan los bloqueos por cancelación, salida, desactivación manual o falta de autorización.</span></div>
          <div class="help-release"><b>v207</b><span>La tarjeta roja de Tiempo excedido conserva el fondo, resplandor y contraste correcto también en el tema claro, sin afectar las tarjetas normales.</span></div>
          <div class="help-release"><b>v206</b><span>Los vales de personal con tiempo excedido utilizan una tarjeta de alerta roja con resplandor, encabezado destacado y minutos de retraso visibles, conservando el estado Fuera y el registro normal del regreso.</span></div>
          <div class="help-release"><b>v205</b><span>Cuando un Jefe genera un vale de personal y él mismo es el autorizador asignado, puede autorizarlo inmediatamente con su PIN o dejarlo pendiente para atenderlo después. El QR se activa únicamente al completar la autorización inmediata.</span></div>
          <div class="help-release"><b>v204</b><span>Los vales de personal que exceden el tiempo permanecen en Fuera y se muestran en rojo con los minutos excedidos, sin regresar a Pendiente ni solicitar una nueva autorización del jefe. Los registros antiguos pendientes de reautorización se normalizan automáticamente.</span></div>
          <div class="help-release"><b>v203</b><span>La limpieza de vales duplicados reconoce copias aunque existan variaciones internas en autorizador, departamento o tiempo, comparando la fecha, nómina, colaborador y tipo dentro de una ventana de 30 minutos.</span></div>
          <div class="help-release"><b>v202</b><span>La ventana integrada de validación del PIN se presenta nuevamente como un modal flotante, centrado y adaptable en computadora, tablet y celular.</span></div>
          <div class="help-release"><b>v201</b><span>La validación del PIN administrativo utiliza una ventana segura integrada en la aplicación, compatible con navegadores internos, móviles y aplicaciones instaladas.</span></div>
          <div class="help-release"><b>v200</b><span>La creación de vales de personal queda protegida contra pulsaciones y reintentos duplicados mediante un identificador único por formulario. Mantenimiento incorpora detección y limpieza segura de copias repetidas, conservando el vale con mayor recorrido.</span></div>
          <div class="help-release"><b>v199</b><span>Los dashboards de Vales incorporan una barra ordenada con total, búsqueda y acciones adaptables a celular y tablet. En Visitantes se ocultan el dictamen pendiente de Calidad y Factura / OC, conservando el aviso real de Pendiente autorización.</span></div>
          <div class="help-release"><b>v198</b><span>El tiempo de los vales deja de avanzar al registrar el regreso, finalizar una salida sin regreso o cancelar el vale; los estados Regreso / Finalizado conservan la duración exacta del recorrido.</span></div>
          <div class="help-release"><b>v197</b><span>Las salidas sin regreso pendientes se normalizan como Finalizadas y se muestran en Regreso / Finalizado. Después de una reautorización, dashboard, historial y Nóminas conservan el tiempo completo desde la salida original hasta el regreso.</span></div>
          <div class="help-release"><b>v196</b><span>Los vales distinguen Salida sin regreso, que finaliza y desactiva el QR en el primer registro, de Sin horario estimado de regreso, que mantiene el QR activo, mide el tiempo transcurrido y permite registrar el regreso sin bloqueo por excedente.</span></div>
          <div class="help-release"><b>v195</b><span>Los permisos de salida IMSS se habilitan 5 minutos antes de la hora programada y permanecen vigentes hasta las 6:00 p.m. del mismo día, incluso para permisos creados previamente.</span></div>
          <div class="help-release"><b>v194</b><span>La ventana de salida de los permisos IMSS se amplía: el QR funciona desde 5 minutos antes y hasta 1 hora después de la hora programada, incluyendo permisos creados previamente con el límite anterior.</span></div>
          <div class="help-release"><b>v193</b><span>Los vales de entrada posterior a las 8:15 permanecen vigentes durante toda la fecha indicada: permiten registrar una llegada anticipada con cero minutos o calcular el retraso real después de esa hora. La ventana corta se conserva exclusivamente para salidas IMSS.</span></div>
          <div class="help-release"><b>v192</b><span>La autorización de vales de activo se asigna individualmente desde Usuarios y exige que la persona habilitada sea el autorizador seleccionado. La salida y el regreso requieren escanear el gafete QR de un guardia activo, cuya identidad queda registrada en el recorrido.</span></div>
          <div class="help-release"><b>v191</b><span>Vales de Personal y Vales de Activo se presentan como apartados independientes, con accesos propios a Dashboard, Nuevo vale e Historial. Se incorporan Próximos vales con autorización anticipada y QR habilitado únicamente en la fecha programada, historial completo de activos y Rondinero con orden obligatorio y omisiones justificadas.</span></div>
          <div class="help-release"><b>v190</b><span>Los permisos de Roles separan el acceso a Dashboard de proveedores y Dashboard de visitantes, permitiendo mostrar cualquiera de ellos de forma independiente sin alterar los accesos existentes.</span></div>
          <div class="help-release"><b>v189</b><span>Nuevo módulo administrativo de Mantenimiento de datos con limpieza de visitas finalizadas del día, retención de 30 días y depuración histórica hasta hoy, protegido por permisos, confirmación y PIN.</span></div>
          <div class="help-release"><b>v188</b><span>Rondinero unifica Historial y Cumplimiento por guardia en una vista jerárquica con métricas, recorridos desplegables, búsqueda, filtros por guardia y fecha, y acciones administrativas auditadas para ver, editar o eliminar.</span></div>
          <div class="help-release"><b>v187</b><span>La portada incorpora un fondo temático animado: sol y nubes en modo claro, y luna con estrellas en modo oscuro, adaptable a celulares y tablets.</span></div>
          <div class="help-release"><b>v186</b><span>El rol Recepcionista incorpora automáticamente el permiso de autorización de emergencia en configuraciones de roles existentes, mostrando la acción en vales ordinarios de salida pendientes.</span></div>
          <div class="help-release"><b>v185</b><span>La pantalla de inicio de sesión sustituye la recuperación de contraseña por correo por una indicación clara para contactar al administrador cuando el usuario no pueda entrar.</span></div>
          <div class="help-release"><b>v184</b><span>Nuevo rol Recepcionista con autorización de visitantes, consulta de encuestas y vales, PIN propio y autorización auditada de vales personales únicamente por emergencia. También se corrigió la encuesta para operar sobre el registro de visitantes.</span></div>
          <div class="help-release"><b>v183</b><span>Encuesta de satisfacción del servicio de recepción cada segunda salida de visitantes y nuevo reporte administrativo con índice, participación, distribución y detalle por periodo.</span></div>
          <div class="help-release"><b>v182</b><span>Nueva sección Mi cuenta para que cada usuario cambie su propia contraseña confirmando la contraseña actual, con requisitos de seguridad y sin depender del correo de recuperación.</span></div>
          <div class="help-release"><b>v181</b><span>El Jefe de Compras sólo consulta los vales de personal asignados para su autorización y los vales de activos creados por su cuenta.</span></div>
          <div class="help-release"><b>v180</b><span>El rol Jefe de Compras puede crear y modificar su propio PIN desde Configuración → Mi PIN, con validación completa en Firebase.</span></div>
          <div class="help-release"><b>v179</b><span>Nuevo Reporte para Nóminas, exclusivo para Administrador, con filtros por periodo y colaborador, acumulado de minutos excedentes, detalle de permisos finalizados y exportación a Excel.</span></div>
          <div class="help-release"><b>v178</b><span>Nuevo Historial de vales de personal, exclusivo para Guardia y Administrador, con filtros, recorrido cronológico completo, responsables de cada registro y cálculo de minutos excedentes.</span></div>
          <div class="help-release"><b>v177</b><span>La administración de Roles, permisos y usuarios se adapta correctamente a teléfonos, con controles reorganizados, permisos en una columna y desplazamiento contenido.</span></div>
          <div class="help-release"><b>v176</b><span>Nuevo rol Servicio Médico y Permiso IMSS con salida programada: el QR se habilita 5 minutos antes, vence 30 minutos después y registra intentos fuera de horario, salida real y guardia responsable.</span></div>
          <div class="help-release"><b>v175</b><span>La autorización de vales de personal se confirma directamente en Firebase y el escáner reintenta automáticamente la consulta, diferenciando un QR inválido de un problema de conexión o sincronización.</span></div>
          <div class="help-release"><b>v174</b><span>Los dashboards de Vales de personal y Vales de activos incorporan un botón Actualizar que consulta nuevamente Firebase sin abandonar el módulo.</span></div>
          <div class="help-release"><b>v173</b><span>Los vales de personal permiten abrir WhatsApp con un mensaje sencillo dirigido al autorizador, los datos del vale y un enlace directo al módulo para revisarlo.</span></div>
          <div class="help-release"><b>v172</b><span>El botón Cerrar sesión de la pantalla Solicitud pendiente ejecuta correctamente el cierre de la cuenta y regresa al acceso.</span></div>
          <div class="help-release"><b>v171</b><span>Flujo operativo corregido al escanear vales de personal, opciones completas de tiempo autorizado con entrada posterior a las 8:15 a.m. y nueva identidad visual unificada para los kioscos.</span></div>
          <div class="help-release"><b>v170</b><span>Imagen visual renovada en los dashboards de Proveedores, Visitantes, Vales y Rondinero, con tarjetas adaptables, temas claro y oscuro y el acceso general renombrado como Escáner de accesos.</span></div>
          <div class="help-release"><b>v169</b><span>El rol Jefe puede crear y modificar su propio PIN con una regla restringida que impide cambiar otros datos de usuario.</span></div>
          <div class="help-release"><b>v168</b><span>Iconos de instalación específicos para iPhone y Android, con fondo sólido, tamaños correctos y referencias versionadas para evitar que Safari genere un icono con inicial.</span></div>
          <div class="help-release"><b>v167</b><span>Los tableros de Vales de personal y Vales de activos muestran dos columnas en tablets, conservando una columna en celulares pequeños.</span></div>
          <div class="help-release"><b>v166</b><span>El dashboard conserva su vista al buscar, actualizar o terminar la sincronización inicial, evitando regresos inesperados al menú principal.</span></div>
          <div class="help-release"><b>v165</b><span>Compatibilidad reforzada con Safari en iPhone: carga con tiempo máximo de espera, respaldo local más rápido e instalación de la PWA resistente a fallos de librerías externas.</span></div>
          <div class="help-release"><b>v164</b><span>Nueva interfaz adaptable con menú principal por módulos y roles, identidad visual renovada, temas claro y oscuro, acceso y recuperación de contraseña modernizados, y arranque de Rondinero con respuesta inmediata y mensajes claros de validación y sincronización.</span></div>
          <div class="help-release"><b>v163</b><span>Confirmación visible y persistente al guardar Mi PIN, con indicador de proceso y mensajes claros si Firestore rechaza el cambio.</span></div>
          <div class="help-release"><b>v162</b><span>Mejor contraste del inicio de sesión en temas claros y diagnóstico visible del envío de correos para recuperar la contraseña.</span></div>
          <div class="help-release"><b>v161</b><span>Generación y descarga de PDF completo desde el detalle del rondín, incluyendo puntos, GPS, novedades y fotografías.</span></div>
          <div class="help-release"><b>v160</b><span>Recuperación de contraseña por correo desde la pantalla de inicio de sesión mediante Firebase Authentication.</span></div>
          <div class="help-release"><b>v159</b><span>El rol Jefe ve únicamente los vales de personal donde está asignado como autorizador y cuenta con un menú compacto y ordenado.</span></div>
          <div class="help-release"><b>v158</b><span>El menú Configuración del rol Jefe muestra únicamente la opción Mi PIN.</span></div>
          <div class="help-release"><b>v157</b><span>El rol Jefe inicia directamente en el dashboard de Vales de Personal y el botón Inicio regresa a ese módulo.</span></div>
          <div class="help-release"><b>v156</b><span>El porcentaje de cumplimiento de Rondinero ahora se calcula con puntos visitados entre puntos esperados, incluso en recorridos incompletos.</span></div>
          <div class="help-release"><b>v155</b><span>Las novedades y sus fotografías ahora aparecen dentro de la tarjeta del punto relacionado en el detalle del rondín.</span></div>
          <div class="help-release"><b>v154</b><span>Editor visual de rutas con controles para agregar, quitar, subir y bajar puntos sin introducir números manualmente.</span></div>
          <div class="help-release"><b>v153</b><span>Edición y orden de rutas de Rondinero, más fotografía opcional comprimida para evidenciar novedades sin Firebase Storage.</span></div>
          <div class="help-release"><b>v152</b><span>El selector de tema ahora permanece dentro del encabezado en celulares y tablets, sin cubrir el nombre de la aplicación.</span></div>
          <div class="help-release"><b>v151</b><span>El alta masiva ahora recupera perfiles faltantes y verifica en el servidor que cada usuario quede guardado.</span></div>
          <div class="help-release"><b>v150</b><span>Alta masiva de usuarios desde Administración sin cerrar la sesión del administrador.</span></div>
          <div class="help-release"><b>v149</b><span>Botón de tema flotante y visible en celulares y tablets.</span></div>
          <div class="help-release"><b>v148</b><span>Recarga manual del catálogo de proveedores desde el formulario Nueva cita.</span></div>
          <div class="help-release"><b>v147</b><span>Edición de puntos Rondinero sin cambiar su QR, GPS ni rutas asociadas.</span></div>
          <div class="help-release"><b>v146</b><span>Alta anticipada de puntos Rondinero con configuración GPS posterior.</span></div>
          <div class="help-release"><b>v145</b><span>Validación GPS de puntos Rondinero, radio configurable y evidencia de ubicación en el historial.</span></div>
          <div class="help-release"><b>v144</b><span>Autorizadores de vales filtrados por permisos configurados en Roles.</span></div>
          <div class="help-release"><b>v143</b><span>Kioscos independientes para vales de personal y vales de activos.</span></div>
          <div class="help-release"><b>v142</b><span>Nuevo menú de Ayuda, Acerca de y Guía rápida.</span></div>
          <div class="help-release"><b>v140</b><span>Tiempos de espera, permanencia y duración total de visitantes.</span></div>
          <div class="help-release"><b>v139</b><span>Permisos configurables para reportes.</span></div>
          <div class="help-release"><b>v138</b><span>Mejoras al administrador de roles.</span></div>
          <div class="help-release"><b>v135</b><span>Lectura de gafetes para vales de personal.</span></div>
        </div>
      </section>
      <section class="help-panel">
        <h4>Créditos</h4>
        <p>Aplicación desarrollada para la operación de Caborca Suite.</p>
        <p><b>Desarrollado por Hermenegildo Pérez.</b></p>
      </section>
    </div>`;
}

function helpGuideHtml(){
  return `
    <div class="help-guide">
      <details open><summary>Inicio y navegación</summary><div class="help-guide-content"><p>Abre las secciones desde el menú lateral. Las opciones visibles dependen de tu rol. Usa Inicio para volver al tablero principal de tu perfil y Sincronizar cuando necesites actualizar la información de la nube. En el rol <b>Jefe</b>, la pantalla principal es <b>Vales de Personal</b> y el menú se presenta de forma compacta en el orden Vales, Configuración y Ayuda.</p><p>Si no puedes iniciar sesión o necesitas restablecer tu contraseña, ponte en contacto con el administrador.</p><p>En celulares y tablets, el botón compacto <b>Tema</b> permanece en el encabezado para cambiar rápidamente a un diseño claro cuando haya mucha luz.</p></div></details>
      <details><summary>Visitantes</summary><div class="help-guide-content"><ol><li>Programa la visita o autoriza una solicitud pendiente.</li><li>Al escanear el QR se registra la llegada y comienza el tiempo de espera.</li><li>Usa <b>Dar acceso</b> para registrar gafete y entrada.</li><li>Al salir, registra la salida para finalizar y obtener los tiempos de espera, permanencia y total.</li></ol></div></details>
      <details><summary>Proveedores</summary><div class="help-guide-content"><ol><li>Crea la cita con proveedor, empresa, área y documentación.</li><li>Si un proveedor recién registrado no aparece en la búsqueda, pulsa <b>Cargar proveedores</b> para actualizar el catálogo desde Firebase sin salir del formulario.</li><li>El guardia escanea el QR y registra la entrada.</li><li>Calidad puede dictaminar la entrega cuando corresponda.</li><li>La salida finaliza el registro y desactiva el QR.</li></ol></div></details>
      <details><summary>Vales de personal</summary><div class="help-guide-content">Genera el vale con número de nómina y datos del permiso. Puede utilizarse el QR del vale o escanear el QR del gafete, cuyo contenido debe ser exactamente <b>NOMINA:número</b>, por ejemplo <b>NOMINA:1951</b>. El flujo continúa con autorización, salida y regreso del colaborador. <b>Salida sin regreso</b> finaliza el vale y desactiva el QR en el primer registro. <b>Sin horario estimado de regreso</b> mantiene el QR activo, mide el tiempo transcurrido y permite registrar el regreso sin bloquearse por excedente. Para el rol <b>Jefe</b>, solo se muestran los vales donde su UID o correo coincide con el autorizador asignado. Una <b>Entrada posterior a las 8:15</b>, normal o emitida por Servicio Médico, es válida durante toda la fecha indicada: si llega antes registra cero minutos y si llega después calcula el retraso real desde las 8:15 a. m. En <b>Salida a consulta IMSS</b>, Servicio Médico define la hora programada, el QR se habilita 5 minutos antes y permanece vigente hasta las 6:00 p. m.; el tiempo fuera se mide hasta registrar el regreso, sin horario límite. Guardia y Administrador disponen de <b>Vales → Historial</b>, donde se presenta el recorrido completo, responsables, tiempo real y minutos excedentes.</div></details>
      <details><summary>Vales de activos</summary><div class="help-guide-content">Registra el activo, responsable, motivo y vigencia. El autorizador debe estar habilitado individualmente desde Usuarios y confirmar con su PIN. Para registrar la salida o el regreso, el guardia debe escanear su gafete QR; Firebase valida que corresponda a un guardia activo y guarda su identidad en el recorrido.</div></details>
      <details><summary>Guardia y Rondinero</summary><div class="help-guide-content"><ol><li>El administrador puede dar de alta todos los puntos y rutas sin estar físicamente en cada ubicación. Los puntos nuevos quedan identificados como <b>GPS pendiente</b>.</li><li>Usa <b>Editar punto</b> para corregir nombre, ubicación descriptiva, descripción, orden o radio. La edición conserva el QR, las coordenadas y las rutas asociadas.</li><li>En la pestaña <b>Rutas</b>, usa <b>Editar y ordenar</b>. El editor visual permite agregar o quitar puntos y cambiar la secuencia con los botones <b>Subir</b> y <b>Bajar</b>. La lista de arriba hacia abajo será el orden exacto del recorrido.</li><li>Después debe acudir a cada punto y pulsar <b>Configurar GPS</b> una vez. El sistema guarda sus coordenadas y un radio permitido de 30 metros.</li><li>Un punto con GPS pendiente puede administrarse, incluirse en rutas e imprimirse, pero no puede registrarse durante un rondín.</li><li>El guardia inicia el rondín y permite a la aplicación utilizar la ubicación precisa de la tablet.</li><li>Los puntos deben registrarse en el orden exacto definido en la ruta. Si un punto no puede visitarse, usa <b>Omitir con justificación</b>, captura el motivo y, opcionalmente, una fotografía. La omisión queda auditada y reduce el cumplimiento.</li><li>Al escanear un QR, Rondinero comprueba que la tablet esté dentro del radio autorizado. Un QR fotografiado y escaneado desde otro lugar será rechazado.</li><li>Al reportar una novedad selecciona el punto relacionado; el último punto escaneado aparece preseleccionado. También puede tomar una fotografía opcional, comprimida como JPEG de máximo 640 px y 180 KB sin Firebase Storage.</li><li>En el detalle, cada novedad y su fotografía se muestran dentro de la misma tarjeta del punto para revisarlas de un vistazo.</li><li>El cumplimiento se calcula dividiendo los puntos visitados entre los puntos esperados. Un rondín incompleto conserva su avance real en lugar de mostrar automáticamente 0%.</li><li>Desde <b>Detalle del recorrido</b>, pulsa <b>Generar PDF</b> para descargar el reporte completo paginado con datos del rondín, todos los puntos, evidencia GPS, novedades y fotografías.</li><li><b>Historial por guardia</b> unifica historial y cumplimiento: busca por texto, filtra por guardia o fechas y despliega cada guardia para consultar sus recorridos. El administrador también puede editar datos administrativos o eliminar un registro finalizado con PIN y auditoría.</li><li>El historial registra hora, distancia al punto, precisión GPS y la fotografía de la novedad como evidencia.</li><li>Si la precisión supera 40 metros, el registro se bloquea; muévete a un área abierta y vuelve a intentarlo.</li></ol></div></details>
      <details><summary>Reportes</summary><div class="help-guide-content">Historial permite consultar registros por fecha. Reportes presenta indicadores de visitas, tiempos, calidad y puntualidad. <b>Encuesta recepción</b>, disponible para Administrador y Recepcionista, muestra las encuestas aplicadas cada segunda salida de visitantes, el índice de servicio, participación, distribución de calificaciones y detalle por periodo. El <b>Reporte para Nóminas</b>, visible únicamente para Administrador, concentra los permisos de personal finalizados, minutos autorizados, tiempo real y minutos excedentes por colaborador, con detalle y exportación a Excel. El reporte no calcula importes ni aplica descuentos automáticamente.</div></details>
      <details><summary>Usuarios, roles y permisos</summary><div class="help-guide-content"><p>El administrador aprueba usuarios, asigna roles y configura permisos. Los cambios en Roles afectan qué módulos y acciones puede utilizar cada perfil. En <b>Dashboard y consultas</b>, los permisos <b>Ver dashboard de proveedores</b> y <b>Ver dashboard de visitantes</b> se asignan por separado.</p><p>Cada usuario puede entrar a <b>Configuración → Mi cuenta</b> para cambiar su propia contraseña. Debe confirmar la contraseña actual y crear una nueva de al menos 10 caracteres con mayúscula, minúscula, número y símbolo.</p><p>Para dar de alta varias cuentas, entra a <b>Configuración → Usuarios</b> y pulsa <b>Agregar usuarios</b>. Pega una fila por persona con el formato <b>Nombre; Correo; Contraseña temporal; Rol; Área; Empresa; Teléfono</b>. También puedes copiar filas desde Excel; las columnas separadas por tabulaciones se reconocen automáticamente.</p><p>Si una cuenta ya existe en Authentication pero no tiene perfil en Firestore, vuelve a incluirla con su contraseña temporal: la aplicación reconstruirá el documento en <b>users</b> y lo verificará directamente en el servidor.</p></div></details>
      <details><summary>Mantenimiento de datos</summary><div class="help-guide-content"><p>Disponible únicamente para el Administrador. Permite eliminar visitas finalizadas del día, aplicar una retención de 30 días o depurar registros históricos hasta hoy. Las acciones sensibles requieren confirmación y PIN administrativo.</p></div></details>
      <details><summary>PIN de autorización</summary><div class="help-guide-content"><p>Administrador, Jefe, Jefe de Compras, Guardia y los perfiles autorizadores habilitados pueden crear o modificar su propio PIN desde <b>Configuración → Mi PIN</b>. El PIN es personal y se utiliza para confirmar acciones sensibles.</p></div></details>
      <details><summary>Problemas frecuentes</summary><div class="help-guide-content"><ul><li>Si no aparece un cambio, actualiza la página para cargar la versión más reciente.</li><li>Si una operación indica falta de permisos, consulta al administrador.</li><li>Si no hay Internet, evita cerrar la sesión hasta recuperar la conexión y sincronizar.</li><li>Verifica que la cámara y la ubicación precisa tengan permiso antes de escanear códigos QR.</li><li>Si Rondinero indica <b>GPS impreciso</b>, colócate en un área abierta, activa la ubicación precisa y vuelve a intentar.</li><li>Si indica <b>Punto sin GPS</b>, un administrador debe acudir al punto y configurarlo desde Rondinero.</li></ul></div></details>
    </div>`;
}

function openHelpModal(section='about'){
  const modal = document.getElementById('helpModal');
  const title = document.getElementById('helpModalTitle');
  const subtitle = document.getElementById('helpModalSubtitle');
  const body = document.getElementById('helpModalBody');
  if(!modal || !title || !subtitle || !body) return;
  const guide = section === 'guide';
  title.textContent = guide ? 'Guía rápida' : 'Acerca de';
  subtitle.textContent = guide ? 'Consulta rápida de las funciones principales' : `Caborca Access Control ${APP_VERSION}`;
  body.innerHTML = guide ? helpGuideHtml() : helpAboutHtml();
  modal.classList.add('show');
  modal.querySelector('[data-action="closeHelpModal"]')?.focus();
}

function closeHelpModal(){
  document.getElementById('helpModal')?.classList.remove('show');
}

function canShowConfig(){
  return canConfigurePin() || (!!currentUser && (currentUser.role === ROLES.ADMIN) && hasPerm('admin_roles'));
}

function canConfigurePin(){
  return !!currentUser && (
    currentUser.role === ROLES.ADMIN ||
    currentUser.role === ROLES.JEFE ||
    currentUser.role === ROLES.JEFE_COMPRAS ||
    currentUser.role === ROLES.GUARDIA ||
    currentUser.role === ROLES.RECEPCIONISTA ||
    canAuthorizeAnyValeRole(currentUser.role) ||
    hasPerm("autorizar_vale_activo") ||
    hasPerm("autorizar_vale_personal")
  );
}

function paintSidebar(){
  if(!sidebarEl) return;
  sidebarEl.classList.toggle('role-jefe', [ROLES.JEFE, ROLES.JEFE_RESTRINGIDO].includes(currentUser?.role));

  // 🔒 Bloqueo total para usuarios PENDIENTE
  if(!currentUser || currentUser.role === ROLES.PENDIENTE){
    sidebarEl.querySelectorAll('.sb-btn, .sb-section').forEach(el=>{
      // solo dejar visible "cerrar sesión"
      if(el.dataset?.sb !== 'logout') {
        el.style.display = 'none';
      }
    });

    // Cerrar submenús por seguridad visual
    collapseSidebarSubs();

    return;
  }

  // ===============================
  // Navegación principal
  // ===============================
const dashProveedores  = sidebarEl.querySelector('[data-sb="dashboard_proveedores"]');
const dashVisitantes  = sidebarEl.querySelector('[data-sb="dashboard_visitantes"]');
const nuevo = sidebarEl.querySelector('[data-sb="nuevo"]');
const nuevoVisitante = sidebarEl.querySelector('[data-sb="nuevo_visitante"]');
const hist  = sidebarEl.querySelector('[data-sb="historial"]');
const reportesBtn = sidebarEl.querySelector('[data-sb="reportes"]');
const reporteNominasBtn = sidebarEl.querySelector('[data-sb="reporte_nominas"]');
const scan  = sidebarEl.querySelector('[data-sb="scan"]');
const vales = sidebarEl.querySelector('[data-sb="vales_activos"]');
const valesPersonalBtn = sidebarEl.querySelector('[data-sb="vales_personal"]');
const proximosValesPersonalBtn = sidebarEl.querySelector('[data-sb="proximos_vales_personal"]');
const historialValesPersonalBtn = sidebarEl.querySelector('[data-sb="historial_vales_personal"]');
const historialValesActivosBtn = sidebarEl.querySelector('[data-sb="historial_vales_activos"]');
const bitacoraBtn = sidebarEl.querySelector('[data-sb="bitacora_guardia"]');
const rondineroBtn = sidebarEl.querySelector('[data-sb="rondinero"]');
const groupProveedores = sidebarEl.querySelector('[data-sb="grupo_proveedores"]');
const groupVisitantes = sidebarEl.querySelector('[data-sb="grupo_visitantes"]');
const groupVales = sidebarEl.querySelector('[data-sb="grupo_vales"]');
const groupGuardia = sidebarEl.querySelector('[data-sb="grupo_guardia"]');
const groupReportes = sidebarEl.querySelector('[data-sb="grupo_reportes"]');

if(dashProveedores)  dashProveedores.style.display  = hasPerm('ver_dashboard_proveedores') ? '' : 'none';
if(dashVisitantes)  dashVisitantes.style.display  = hasPerm('ver_dashboard_visitantes') ? '' : 'none';
if(nuevo) nuevo.style.display = canCreateProveedorCita() && !isVisitanteOnlyRole() ? '' : 'none';
if(nuevoVisitante) nuevoVisitante.style.display = canCreateVisitanteCita() ? '' : 'none';
if(hist)  hist.style.display  = hasPerm('ver_historial') ? '' : 'none';
if(reportesBtn) reportesBtn.style.display = hasPerm('ver_reportes') ? '' : 'none';
if(reporteNominasBtn) reporteNominasBtn.style.display = currentUser?.role === ROLES.ADMIN && hasPerm('ver_reporte_nominas') ? '' : 'none';
if(scan)  scan.style.display  = hasPerm('escanear_qr') ? '' : 'none';
if(vales) vales.style.display = hasPerm('ver_vales_activos') ? '' : 'none';
if(valesPersonalBtn) valesPersonalBtn.style.display = hasPerm('ver_vales_personal') ? '' : 'none';
if(proximosValesPersonalBtn) proximosValesPersonalBtn.style.display = hasPerm('ver_vales_personal') ? '' : 'none';
if(historialValesPersonalBtn) historialValesPersonalBtn.style.display = hasPerm('ver_historial_vales_personal') && [ROLES.ADMIN,ROLES.GUARDIA].includes(currentUser?.role) ? '' : 'none';
if(historialValesActivosBtn) historialValesActivosBtn.style.display = hasPerm('ver_historial_vales_activos') && [ROLES.ADMIN,ROLES.GUARDIA].includes(currentUser?.role) ? '' : 'none';
if(bitacoraBtn) bitacoraBtn.style.display = hasPerm('ver_bitacora_guardia') ? '' : 'none';
if(rondineroBtn) rondineroBtn.style.display = hasPerm('rondinero_ver') ? '' : 'none';
  // ===============================
  // Exportar (Excel / PDF)
  // ===============================
  const exp  = sidebarEl.querySelector('[data-sb="export"]');
  const expX = sidebarEl.querySelector('[data-sb="export_excel"]');
  const expP = sidebarEl.querySelector('[data-sb="export_pdf"]');

  const canExport = hasPerm('exportar_excel');

  if(exp)  exp.style.display  = canExport ? '' : 'none';
  if(expX) expX.style.display = canExport ? '' : 'none';
  if(expP) expP.style.display = canExport ? '' : 'none';

  collapseSidebarSubs();

  // ===============================
  // Configuración (ADMIN + PIN)
  // ===============================
  const showCfg = canShowConfig(); // ADMIN o usuario que necesita PIN para autorizar
  const cfgToggle = document.getElementById('sbConfigToggle');
  const sesionesBtn = sidebarEl.querySelector('[data-sb="sesiones_activas"]');
  const rolesPermBtn = sidebarEl.querySelector('[data-sb="role_permissions"]');
  const usuariosBtn = sidebarEl.querySelector('[data-sb="roles"]');
  const personasBtn = sidebarEl.querySelector('[data-sb="personas_visita"]');
  const miPinBtn = sidebarEl.querySelector('[data-sb="mi_pin"]');
  const eliminarFinalizadosBtn = sidebarEl.querySelector('[data-sb="eliminarfinalizados"]');
  const depurarBaseBtn = sidebarEl.querySelector('[data-sb="depurar_base"]');
  const depurar30dBtn = sidebarEl.querySelector('[data-sb="depurar_30d"]');
  const resumenDepurar30dBtn = sidebarEl.querySelector('[data-sb="resumen_depurar_30d"]');

  if(cfgToggle) cfgToggle.style.display = showCfg ? '' : 'none';
  if(sesionesBtn) sesionesBtn.style.display = hasPerm('ver_sesiones_activas') ? '' : 'none';
  if(rolesPermBtn) rolesPermBtn.style.display = hasPerm('admin_roles') ? '' : 'none';
  if(usuariosBtn) usuariosBtn.style.display = hasPerm('admin_roles') ? '' : 'none';
  if(personasBtn) personasBtn.style.display = currentUser?.role === ROLES.ADMIN ? '' : 'none';
  if(miPinBtn) miPinBtn.style.display = canConfigurePin() ? '' : 'none';
  if(eliminarFinalizadosBtn) eliminarFinalizadosBtn.style.display = currentUser?.role === ROLES.ADMIN && hasPerm('limpiar_finalizados') ? '' : 'none';
  if(depurarBaseBtn) depurarBaseBtn.style.display = currentUser?.role === ROLES.ADMIN && hasPerm('eliminar') ? '' : 'none';
  if(depurar30dBtn) depurar30dBtn.style.display = currentUser?.role === ROLES.ADMIN && hasPerm('eliminar') ? '' : 'none';
  if(resumenDepurar30dBtn) resumenDepurar30dBtn.style.display = currentUser?.role === ROLES.ADMIN && hasPerm('eliminar') ? '' : 'none';

  // El rol Jefe solo administra su PIN; no debe ver herramientas administrativas.
  if([ROLES.JEFE, ROLES.JEFE_RESTRINGIDO].includes(currentUser?.role) && sbConfigSub){
    sbConfigSub.querySelectorAll(':scope > .sb-btn').forEach(item => {
      item.style.display = item.dataset.sb === 'mi_pin' ? '' : 'none';
    });
    if(cfgToggle) cfgToggle.style.display = '';
  }
  setSbExpanded(document.getElementById('sbConfigToggle'), sbConfigSub, false);
  
  const citasProveedores = sidebarEl.querySelector('[data-sb="citas_proveedores"]');
  const citasVisitantes = sidebarEl.querySelector('[data-sb="citas_visitantes"]');
if(citasProveedores) citasProveedores.style.display = hasPerm('ver_citas_compras') && !isVisitanteOnlyRole() ? '' : 'none';
if(citasVisitantes) citasVisitantes.style.display = hasPerm('ver_citas_compras') ? '' : 'none';

// Reporte de Cambios: configurable desde Roles
const btnCambios = sidebarEl.querySelector('[data-sb="reporte_cambios"]');
if(btnCambios) btnCambios.style.display = hasPerm("ver_reporte_cambios") ? "" : "none";

const hasProveedoresItems =
  hasPerm('ver_dashboard_proveedores') ||
  (canCreateProveedorCita() && !isVisitanteOnlyRole()) ||
  (hasPerm('ver_citas_compras') && !isVisitanteOnlyRole());
const hasVisitantesItems =
  hasPerm('ver_dashboard_visitantes') ||
  canCreateVisitanteCita() ||
  hasPerm('ver_citas_compras');
const hasValesItems = hasPerm('ver_vales_activos') || hasPerm('ver_vales_personal') || ((hasPerm('ver_historial_vales_personal') || hasPerm('ver_historial_vales_activos')) && [ROLES.ADMIN,ROLES.GUARDIA].includes(currentUser?.role));
const hasGuardiaItems = hasPerm('escanear_qr') || hasPerm('ver_bitacora_guardia') || hasPerm('rondinero_ver');
const hasReportesItems = hasPerm('ver_historial') || hasPerm('ver_reportes') || hasPerm('ver_reporte_cambios') || (currentUser?.role === ROLES.ADMIN && hasPerm('ver_reporte_nominas')) || hasPerm('exportar_excel');

if(groupProveedores) groupProveedores.style.display = hasProveedoresItems ? '' : 'none';
if(groupVisitantes) groupVisitantes.style.display = hasVisitantesItems ? '' : 'none';
if(groupVales) groupVales.style.display = hasValesItems ? '' : 'none';
if(groupGuardia) groupGuardia.style.display = hasGuardiaItems ? '' : 'none';
if(groupReportes) groupReportes.style.display = hasReportesItems ? '' : 'none';

  // ===============================
  // Logout (siempre visible con sesión)
  // ===============================
  const logout = sidebarEl.querySelector('[data-sb="logout"]');
  if(logout) logout.style.display = currentUser ? '' : 'none';
}

document.addEventListener('click', async (e)=>{
  
const sb = e.target.closest('[data-sb]');
if(sb && !e.target.closest('[data-no-sb]')){
  // sigue flujo normal del sidebar
} else if(sb){
  return;
}
if(!sb) return;

  const key = sb.dataset.sb;

  if(key === 'grupo_proveedores'){
    toggleSbSub(document.getElementById('sbProveedoresToggle'), sbProveedoresSub);
    return;
  }
  if(key === 'grupo_visitantes'){
    toggleSbSub(document.getElementById('sbVisitantesToggle'), sbVisitantesSub);
    return;
  }
  if(key === 'grupo_vales'){
    toggleSbSub(document.getElementById('sbValesToggle'), sbValesSub);
    return;
  }
  if(key === 'grupo_guardia'){
    toggleSbSub(document.getElementById('sbGuardiaToggle'), sbGuardiaSub);
    return;
  }
  if(key === 'grupo_reportes'){
    toggleSbSub(document.getElementById('sbReportesToggle'), sbReportesSub);
    return;
  }
  if(key === 'grupo_ayuda'){
    toggleSbSub(document.getElementById('sbHelpToggle'), sbHelpSub);
    return;
  }
  if(key === 'help_about'){
    sbClose();
    openHelpModal('about');
    return;
  }
  if(key === 'help_guide'){
    sbClose();
    openHelpModal('guide');
    return;
  }
  if(key === 'export'){
  toggleSbSub(document.getElementById('sbExportToggle'), sbExportSub);
  return;
 }
 if(key === 'config'){
    toggleSbSub(document.getElementById('sbConfigToggle'), sbConfigSub);
    return;
  }
  if(key === 'dashboard' || key === 'dashboard_proveedores'){
    setActiveSb('dashboard_proveedores');
    sbClose();
    await renderDashboardHoy("proveedores");
    return;
  }
  if(key === 'dashboard_visitantes'){
    setActiveSb('dashboard_visitantes');
    sbClose();
    await renderDashboardHoy("visitantes");
    return;
  }
  if(key === 'nuevo'){
    sbClose();
    await goNuevaCita("proveedor");
    return;
  }
  if(key === 'nuevo_visitante'){
    sbClose();
    await goNuevaCita("visitante");
    return;
  }
  if(key === 'historial'){
    setActiveSb('historial');
    sbClose();
    await renderHistorial();
    return;
  }
  if(key === 'citas_compras' || key === 'citas_proveedores'){
  setActiveSb('citas_proveedores');
  sbClose();
  await renderCitasCompras("proveedores");
  return;
}
  if(key === 'citas_visitantes'){
  setActiveSb('citas_visitantes');
  sbClose();
  await renderCitasCompras("visitantes");
  return;
}
  if(key === 'vales_activos'){
  setActiveSb('vales_activos');
  sbClose();
  await renderValesActivos();
  return;
}
  if(key === 'nuevo_vale_activo'){
  sbClose();
  await renderValesActivos();
  await openValeModal();
  return;
}
  if(key === 'vales_personal'){
  setActiveSb('vales_personal');
  sbClose();
  await renderValesPersonal();
  return;
}
  if(key === 'nuevo_vale_personal'){
  sbClose();
  await renderValesPersonal();
  await openValePersonalModal();
  return;
}
  if(key === 'proximos_vales_personal'){
  setActiveSb('proximos_vales_personal');
  sbClose();
  await renderProximosValesPersonal();
  return;
}
  if(key === 'historial_vales_personal'){
  setActiveSb('historial_vales_personal');
  sbClose();
  await renderHistorialValesPersonal();
  return;
}
  if(key === 'historial_vales_activos'){
  setActiveSb('historial_vales_activos');
  sbClose();
  await renderHistorialValesActivos();
  return;
}
  if(key === 'bitacora_guardia'){
  setActiveSb('bitacora_guardia');
  sbClose();
  await renderBitacoraGuardia();
  return;
}
  if(key === 'rondinero'){
  setActiveSb('rondinero');
  sbClose();
  await renderRondinero();
  return;
}
  if(key === 'scan'){
  setActiveSb('scan');
  sbClose();
  await renderScanner();
  return;
}
  if (key === 'reportes'){
  if(!requirePerm("ver_reportes", "No tienes permiso para ver reportes.")) return;
  setActiveSb('reportes');
  sbClose();
  await renderReportes();
  return;
  }
  if(key === 'reporte_nominas'){
  setActiveSb('reporte_nominas');
  sbClose();
  await renderReporteNominas();
  return;
  }
  if(key === 'reporte_encuesta_visitantes'){
  setActiveSb('reportes');
  sbClose();
  await renderReporteEncuestaVisitantes();
  return;
  }
  if(key === 'roles'){
    setActiveSb('config');
    sbClose();
    await renderAdminRoles();
    return;
  }
  if(key === 'personas_visita'){
    setActiveSb('config');
    sbClose();
    await renderPersonasVisita();
    return;
  }
  if(key === 'role_permissions'){
    setActiveSb('config');
    sbClose();
    await renderRolePermissions();
    return;
  }
  if(key === 'mi_pin'){
    setActiveSb('config');
    sbClose();
    await renderMiPin();
    return;
  }
  if(key === 'mi_cuenta'){
    setActiveSb('config');
    sbClose();
    renderMiCuenta();
    return;
  }
if(key === "proveedores"){
  setActiveSb("config");
  sbClose();
  return renderAdminProveedores();
}
if(key === "sesiones_activas"){
  setActiveSb("config");
  sbClose();
  return renderSesionesActivas();
}
  if(key === 'eliminarfinalizados'){
    setActiveSb('config');
    sbClose();
    if(confirm('¿Borrar FINALIZADOS del día?')) limpiarFinalizadosHoy();
    return;
  }
  if (key === "export_excel_all") {
  sbClose();
  await exportExcelHastaHoy();
  return;
 } 
 if (key === "depurar_base") {
  sbClose();
  await depurarBaseHastaHoy();
  return;
}
if (key === "depurar_30d") {
  sbClose();
  await depurarBaseRetencion30Dias();
  return;
}
if (key === "resumen_depurar_30d") {
  sbClose();
  mostrarResumenDepuracion30();
  return;
}
if (key === "duplicados_vales_personal") {
  sbClose();
  await limpiarDuplicadosValesPersonal();
  return;
}
  if(key === 'export_excel'){
  setActiveSb('export');
  sbClose();
  const hd = document.getElementById('histDate');
  if(hd && hd.value){
    const d = new Date(hd.value + 'T00:00:00');
    const list = visitas.filter(v => typeof v.fechaHoraTs === 'number' && isSameDay(v.fechaHoraTs, d));
    await exportExcelFor(list, hd.value);
  } else {
    const today = new Date();
    const list = visitas.filter(v => typeof v.fechaHoraTs === 'number' && isSameDay(v.fechaHoraTs, today));
    await exportExcelFor(list, 'HOY');
  }
  return;
 }
 if(key === 'export_pdf'){
  setActiveSb('export');
  sbClose();
  const hd = document.getElementById('histDate');
  if(hd && hd.value){
    const d = new Date(hd.value + 'T00:00:00');
    const list = visitas.filter(v => typeof v.fechaHoraTs === 'number' && isSameDay(v.fechaHoraTs, d));
    exportPdfFor(list, hd.value);
  } else {
    const today = new Date();
    const list = visitas.filter(v => typeof v.fechaHoraTs === 'number' && isSameDay(v.fechaHoraTs, today));
    exportPdfFor(list, 'HOY');
  }
  return;
 }
 if(key === 'logout'){
    sbClose();
    await doLogout();
    return;
  }
  if (key === 'reporte_cambios') {
  if(!requirePerm("ver_reporte_cambios", "No tienes permiso para ver cambios en citas.")) return;
  setActiveSb('reporte_cambios');
  sbClose();
  renderReporteCambios();
  return;
}

});

const helpModalEl = document.getElementById("helpModal");
if(helpModalEl) helpModalEl.addEventListener("click", e => { if(e.target === helpModalEl) closeHelpModal(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && helpModalEl?.classList.contains("show")) closeHelpModal(); });

if(btnHamb){ btnHamb.addEventListener('click', (e)=>{ e.preventDefault(); renderHome(); }); }
if(sbOverlay){ sbOverlay.addEventListener('click', sbClose); }


    
// -------------------------
// PIN Admin (sesión)
// -------------------------
async function hashPin(pin){
  const data = new TextEncoder().encode(String(pin || ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getCurrentAdminPinHash(){
  if(!currentUser?.uid) return "";
  const snap = await getDoc(doc(db, COL_USERS, currentUser.uid));
  const data = snap.exists() ? (snap.data() || {}) : {};
  return data.pinHash || "";
}

function requestPinModal(actionLabel="esta acción"){
  return new Promise(resolve => {
    document.getElementById("securityPinModal")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "securityPinModal";
    overlay.className = "modal-overlay show";
    overlay.style.display = "flex";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="securityPinTitle" style="max-width:430px;">
        <div class="modal-head"><div><h2 id="securityPinTitle" style="margin:0;">Validar PIN</h2><small>Autorización de seguridad</small></div></div>
        <div class="modal-body">
          <p style="margin-top:0;color:var(--muted);">Ingresa tu PIN para ${esc(actionLabel)}.</p>
          <label for="securityPinInput">PIN</label>
          <input id="securityPinInput" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" name="caborca_security_pin_code" maxlength="12" aria-label="PIN de seguridad" data-lpignore="true" data-1p-ignore="true" style="-webkit-text-security:disc;">
          <div class="divider"></div>
          <div class="row"><button type="button" id="securityPinAccept">Continuar</button><button type="button" id="securityPinCancel" class="secondary">Cancelar</button></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector("#securityPinInput");
    input.value = "";
    input.addEventListener("input", () => {
      if(/\D/.test(input.value)) input.value = "";
      limpiarCorreoAutocompletadoEnBuscadoresVales();
    });
    const finish = value => { overlay.remove(); resolve(value); };
    overlay.querySelector("#securityPinAccept").addEventListener("click",()=>finish(input.value.trim()));
    overlay.querySelector("#securityPinCancel").addEventListener("click",()=>finish(""));
    overlay.addEventListener("click",event=>{ if(event.target===overlay) finish(""); });
    input.addEventListener("keydown",event=>{ if(event.key==="Enter") finish(input.value.trim()); else if(event.key==="Escape") finish(""); });
    vigilarAutocompletadoEnBuscadoresVales();
    requestAnimationFrame(()=>{ input.value = ""; input.focus(); });
  });
}

async function requireAdminPin(actionLabel = "esta acción"){
  if(!currentUser || currentUser.role !== ROLES.ADMIN){
    toast("Acceso denegado", "Solo ADMIN puede realizar esta acción.", "bad", 3200);
    return false;
  }
  const now = Date.now();
  const lastOk = Number(sessionStorage.getItem(PIN_SESSION_KEY) || 0);
  if(now - lastOk < PIN_TTL_MS) return true;
  const savedHash = await getCurrentAdminPinHash();
  if(!savedHash){
    toast("PIN requerido", "Configura tu PIN en Configuración > Mi PIN.", "warn", 4200);
    await renderMiPin();
    return false;
  }
  const pin = await requestPinModal(actionLabel);
  if(!pin) return false;
  const pinHash = await hashPin(pin);
  if(pinHash === savedHash){
    sessionStorage.setItem(PIN_SESSION_KEY, String(now));
    toast("PIN validado", "Acción autorizada.", "ok", 1800);
    return true;
  }
  toast("PIN incorrecto", "Acción cancelada.", "bad", 3000);
  return false;
}

async function requireUserPin(actionLabel = "esta acción"){
  if(!currentUser?.uid){
    toast("Acceso denegado", "Inicia sesión para realizar esta acción.", "bad", 3200);
    return false;
  }
  const now = Date.now();
  const lastOk = Number(sessionStorage.getItem(PIN_SESSION_KEY) || 0);
  if(now - lastOk < PIN_TTL_MS) return true;
  const savedHash = await getCurrentAdminPinHash();
  if(!savedHash){
    toast("PIN requerido", "Configura tu PIN en Configuración > Mi PIN.", "warn", 4200);
    await renderMiPin();
    return false;
  }
  const pin = await requestPinModal(actionLabel);
  if(!pin) return false;
  const pinHash = await hashPin(pin);
  if(pinHash === savedHash){
    sessionStorage.setItem(PIN_SESSION_KEY, String(now));
    toast("PIN validado", "Acción autorizada.", "ok", 1800);
    return true;
  }
  toast("PIN incorrecto", "Acción cancelada.", "bad", 3000);
  return false;
}
async function requireFreshUserPin(actionLabel = "esta acción"){
  if(!currentUser?.uid){
    toast("Acceso denegado", "Inicia sesión para realizar esta acción.", "bad", 3200);
    return false;
  }
  const savedHash = await getCurrentAdminPinHash();
  if(!savedHash){
    toast("PIN requerido", "Configura tu PIN en Configuración > Mi PIN.", "warn", 4200);
    await renderMiPin();
    return false;
  }
  const pin = await requestPinModal(actionLabel);
  if(!pin) return false;
  if(await hashPin(pin) === savedHash){
    toast("PIN validado", "Acción autorizada.", "ok", 1800);
    return true;
  }
  toast("PIN incorrecto", "Acción cancelada.", "bad", 3000);
  return false;
}
function fmt(ts){
      if(!ts) return "-";
      return new Date(ts).toLocaleString();
    }

    function calcDuration(v){
      if(!v.entradaTs || !v.salidaTs) return null;
      const diff = v.salidaTs - v.entradaTs;
      if(diff < 0) return null;
      const mins = Math.floor(diff / 60000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
    }

    function elapsedMinutes(fromTs, toTs=Date.now()){
      const from = Number(fromTs || 0);
      const to = Number(toTs || 0);
      if(!from || !to || to < from) return null;
      return Math.max(0, Math.floor((to - from) / 60000));
    }

    function elapsedLabel(mins){
      if(mins === null || !Number.isFinite(mins)) return "-";
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `${h}h ${m}m` : `${m} min`;
    }

    function waitLevel(mins){
      if(mins <= 5) return { name:"VERDE", color:"var(--ok)", bg:"rgba(34,197,94,.12)" };
      if(mins <= 10) return { name:"AMARILLO", color:"var(--warn)", bg:"rgba(245,158,11,.14)" };
      return { name:"ROJO", color:"var(--bad)", bg:"rgba(239,68,68,.12)" };
    }

    function visitTimeMetrics(v, now=Date.now()){
      const llegada = Number(v?.llegadaTs || 0);
      const entrada = Number(v?.entradaTs || 0);
      const salida = Number(v?.salidaTs || 0);
      return {
        espera: llegada ? elapsedMinutes(llegada, entrada || now) : null,
        dentro: entrada ? elapsedMinutes(entrada, salida || now) : null,
        total: llegada ? elapsedMinutes(llegada, salida || now) : null
      };
    }

    function liveTimePill(label, fromTs, toTs=0, includeLevel=false){
      const mins = elapsedMinutes(fromTs, toTs || Date.now());
      if(mins === null) return "";
      const level = waitLevel(mins);
      const style = includeLevel ? `background:${level.bg};border-color:${level.color};` : "";
      return `<span class="pill" style="${style}" data-visit-time-from="${Number(fromTs)}" data-visit-time-to="${Number(toTs || 0)}" data-visit-time-label="${esc(label)}" data-visit-time-level="${includeLevel ? "1" : "0"}">
        <span class="dot ${includeLevel ? "" : "info"}" style="${includeLevel ? `background:${level.color}` : ""}"></span>
        <span data-time-text>${esc(label)}: <b>${esc(elapsedLabel(mins))}</b>${includeLevel ? ` · ${level.name}` : ""}</span>
      </span>`;
    }

    function refreshVisitTimeDisplays(){
      document.querySelectorAll("[data-visit-time-from]").forEach(el => {
        const from = Number(el.dataset.visitTimeFrom || 0);
        const fixedTo = Number(el.dataset.visitTimeTo || 0);
        const label = el.dataset.visitTimeLabel || "Tiempo";
        const mins = elapsedMinutes(from, fixedTo || Date.now());
        if(mins === null) return;
        const includeLevel = el.dataset.visitTimeLevel === "1";
        const level = waitLevel(mins);
        const target = el.querySelector("[data-time-text]");
        if(target) target.innerHTML = `${esc(label)}: <b>${esc(elapsedLabel(mins))}</b>${includeLevel ? ` · ${level.name}` : ""}`;
        if(includeLevel){
          el.style.background = level.bg;
          el.style.borderColor = level.color;
          const dot = el.querySelector(".dot");
          if(dot) dot.style.background = level.color;
        }
      });
    }

    setInterval(refreshVisitTimeDisplays, 15000);

    function updateNet(){
      const on = navigator.onLine;
      netDot.className = "dot " + (on ? "ok" : "bad");
      netText.textContent = on ? "En línea" : "Sin conexión";
    }

    function dayBounds(dateObj){
      const d = new Date(dateObj);
      d.setHours(0,0,0,0);
      const start = d.getTime();
      const end = start + 24*60*60*1000;
      return { start, end };
    }

    function isSameDay(ts, dateObj){
      const { start, end } = dayBounds(dateObj);
      return ts >= start && ts < end;
    }

    function parseLocalDateEndTs(value){
      if(!value) return null;
      const ts = new Date(String(value).slice(0,10) + "T23:59:59.999").getTime();
      return Number.isFinite(ts) ? ts : null;
    }

    function parseLocalDateStartTs(value){
      if(!value) return null;
      const ts = new Date(String(value).slice(0,10) + "T00:00:00").getTime();
      return Number.isFinite(ts) ? ts : null;
    }

    function getValePurgeTs(v={}){
      const byDate = parseLocalDateEndTs(v.fecha);
      if(byDate !== null) return byDate;
      return typeof v.createdTs === "number" ? v.createdTs : null;
    }

    function getRegistroPurgeTs(row={}){
      const byDate = parseLocalDateEndTs(row.fecha);
      if(byDate !== null) return byDate;
      const candidates = [row.fechaHoraTs, row.inicioTs, row.finTs, row.updatedTs, row.createdTs];
      for(const value of candidates){
        const ts = Number(value);
        if(Number.isFinite(ts) && ts > 0) return ts;
      }
      return null;
    }

    function getFechaKeyForPurge(row={}){
      if(row.fecha) return String(row.fecha).slice(0,10);
      const ts = getRegistroPurgeTs(row);
      return typeof ts === "number" ? localDateKeyFromTs(ts) : null;
    }

    function getValeDisplayTs(v={}){
      const byDate = parseLocalDateStartTs(v.fecha);
      if(byDate !== null) return byDate;
      return typeof v.createdTs === "number" ? v.createdTs : null;
    }

    function daysAgoStartTs(days){
      const d = new Date();
      d.setDate(d.getDate() - Number(days || 0));
      d.setHours(0,0,0,0);
      return d.getTime();
    }

    function isRolDesarrollo(role=currentUser?.role){
      return [ROLES.DESARROLLO, ROLES.JEFE_DESARROLLO].includes(role);
    }

    async function cloudFetchValesPropios(collectionName){
      if(!currentUser?.uid) return [];
      const snap = await getDocs(query(collection(db, collectionName), where("createdByUid", "==", currentUser.uid), limit(300)));
      return snap.docs.map(d => ({ ...d.data(), id:d.id }));
    }

    function isValeActivoVisible(v={}){
      if(isRolDesarrollo() && v.createdByUid !== currentUser.uid) return false;
      if(currentUser?.role === ROLES.JEFE_COMPRAS){
        const currentUid = String(currentUser?.uid || "");
        const currentEmail = String(currentUser?.email || "").trim().toLowerCase();
        const isOwn = (
          (v.createdByUid && String(v.createdByUid) === currentUid) ||
          (v.createdByEmail && String(v.createdByEmail).trim().toLowerCase() === currentEmail)
        );
        if(!isOwn) return false;
      }
      const activeStatuses = [ValeStatus.GENERADO, ValeStatus.PENDIENTE, ValeStatus.FUERA];
      if(activeStatuses.includes(v.status)) return true;
      const ts = getValeDisplayTs(v);
      return typeof ts === "number" && ts >= daysAgoStartTs(VALES_ACTIVOS_LOOKBACK_DAYS);
    }

    function renderCurrentAfterDepuracion(){
      if(currentView === "vales_activos") return renderValesActivos();
      if(currentView === "vales_personal") return renderValesPersonal();
      return renderModuleHome();
    }

    // -------------------------
    // Local persistence
    // -------------------------
    function loadVisitasLocal(){
      try{
        const raw = localStorage.getItem(LS_KEY);
        if(!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      }catch{ return []; }
    }

    function saveVisitasLocal(){
      try{
        localStorage.setItem(LS_KEY, JSON.stringify(visitas));
        return true;
      }catch(e){
        console.warn(e);
        toast("Almacenamiento", "No se pudo guardar local.", "warn", 3600);
        return false;
      }
    }

    function loadValesActivosLocal(){
      try{
        const raw = localStorage.getItem(LS_VALES_KEY);
        if(!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      }catch{ return []; }
    }

    function saveValesActivosLocal(){
      try{
        localStorage.setItem(LS_VALES_KEY, JSON.stringify(valesActivos));
        return true;
      }catch(e){
        console.warn(e);
        toast("Almacenamiento", "No se pudieron guardar vales localmente.", "warn", 3600);
        return false;
      }
    }

    async function cloudUpsertValeActivo(v){
      const ref = doc(db, COL_VALES_ACTIVOS, String(v.id));
      await setDoc(ref, {
        ...v,
        updatedTs: Date.now(),
        updatedAt: serverTimestamp(),
        updatedByUid: currentUser?.uid || "",
        updatedByEmail: currentUser?.email || ""
      }, { merge: true });
    }

    async function cloudDeleteValeActivo(id){
      await deleteDoc(doc(db, COL_VALES_ACTIVOS, String(id)));
    }

    async function cloudFetchValeActivoById(id){
      const snap = await getDoc(doc(db, COL_VALES_ACTIVOS, String(id)));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }

    async function cloudFetchValesActivos(){
      if(isRolDesarrollo()) return cloudFetchValesPropios(COL_VALES_ACTIVOS);
      if(currentUser?.role === ROLES.JEFE_COMPRAS){
        const currentUid = String(currentUser?.uid || "");
        const currentEmail = String(currentUser?.email || "").trim();
        const scopedQueries = [];
        if(currentUid){
          scopedQueries.push(query(collection(db, COL_VALES_ACTIVOS), where("createdByUid", "==", currentUid), limit(200)));
        }
        if(currentEmail){
          scopedQueries.push(query(collection(db, COL_VALES_ACTIVOS), where("createdByEmail", "==", currentEmail), limit(200)));
        }
        if(!scopedQueries.length) return [];
        const results = await Promise.all(scopedQueries.map(q => getDocs(q)));
        const scopedMap = new Map();
        results.forEach(snap => snap.forEach(d => scopedMap.set(d.id, { id:d.id, ...d.data() })));
        return Array.from(scopedMap.values()).filter(isValeActivoVisible);
      }

      const activeStatuses = [ValeStatus.GENERADO, ValeStatus.PENDIENTE, ValeStatus.FUERA];
      const cutoffTs = daysAgoStartTs(VALES_ACTIVOS_LOOKBACK_DAYS);
      const activeQ = query(
        collection(db, COL_VALES_ACTIVOS),
        where("status", "in", activeStatuses),
        limit(150)
      );
      const recentQ = query(
        collection(db, COL_VALES_ACTIVOS),
        where("createdTs", ">=", cutoffTs),
        orderBy("createdTs", "desc"),
        limit(150)
      );
      const [activeSnap, recentSnap] = await Promise.all([getDocs(activeQ), getDocs(recentQ)]);
      const map = new Map();
      activeSnap.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
      recentSnap.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
      return Array.from(map.values());
    }

    async function cloudFetchHistorialValesActivos(){
      const q = query(collection(db, COL_VALES_ACTIVOS), orderBy("createdTs", "desc"), limit(500));
      const snap = await getDocs(q);
      const arr = [];
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
      return arr;
    }

    async function syncValesActivos(force = false){
      if(!navigator.onLine || !currentUser || currentUser.role === ROLES.PENDIENTE) return;
      if(!shouldReadCloudStamp(cloudReadCache.valesActivos, CLOUD_READ_TTL.valesActivos, force)) return;
      try{
        const cloud = await cloudFetchValesActivos();
        valesActivos = mergeById(valesActivos, cloud);
        saveValesActivosLocal();
        markCloudRead("valesActivos");
      }catch(e){
        console.warn(e);
        markCloudRead("valesActivos");
        toast("Vales", "No se pudieron sincronizar vales de activos.", "warn", 3200);
      }
    }

    async function saveValesActivos(){
      if(!saveValesActivosLocal()) return false;
      return true;
    }

    function loadValesPersonalLocal(){
      try{
        const raw = localStorage.getItem(LS_VALES_PERSONAL_KEY);
        if(!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      }catch{ return []; }
    }

    function compactValesPersonalLocal(list, retentionDays = 35, maxItems = 400){
      const cutoff = new Date();
      cutoff.setHours(0,0,0,0);
      cutoff.setDate(cutoff.getDate() - retentionDays);
      const cutoffISO = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,"0")}-${String(cutoff.getDate()).padStart(2,"0")}`;
      return [...(Array.isArray(list) ? list : [])]
        .filter(v => {
          const fecha = String(v?.fecha || "");
          if(fecha) return fecha >= cutoffISO;
          const ts = Number(v?.createdTs || v?.updatedTs || 0);
          return ts > 0 && ts >= cutoff.getTime();
        })
        .sort((a,b) => Number(b.updatedTs || b.createdTs || 0) - Number(a.updatedTs || a.createdTs || 0))
        .slice(0, maxItems);
    }

    function saveValesPersonalLocal(){
      const compacted = compactValesPersonalLocal(valesPersonal);
      try{
        localStorage.setItem(LS_VALES_PERSONAL_KEY, JSON.stringify(compacted));
        valesPersonal = compacted;
        return true;
      }catch(e){
        console.warn(e);
        // Si el navegador ya alcanzó su cuota, conserva únicamente hoy y fechas futuras.
        const today = new Date();
        const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
        const essential = compacted.filter(v => String(v?.fecha || "") >= todayISO).slice(0,200);
        try{
          localStorage.setItem(LS_VALES_PERSONAL_KEY, JSON.stringify(essential));
          valesPersonal = essential;
          console.warn("Se redujo la caché local de vales de personal por límite de almacenamiento.");
          return true;
        }catch(fallbackError){
          console.warn(fallbackError);
          toast("Almacenamiento", "El navegador no tiene espacio para guardar la caché de vales. Los datos continúan en Firebase.", "warn", 4800);
          return false;
        }
      }
    }

    async function cloudUpsertValePersonal(v){
      const ref = doc(db, COL_VALES_PERSONAL, String(v.id));
      await setDoc(ref, {
        ...v,
        updatedTs: Date.now(),
        updatedAt: serverTimestamp(),
        updatedByUid: currentUser?.uid || "",
        updatedByEmail: currentUser?.email || ""
      }, { merge: true });
    }

    async function cloudDeleteValePersonal(id){
      await deleteDoc(doc(db, COL_VALES_PERSONAL, String(id)));
    }

    async function cloudFetchValePersonalById(id){
      const snap = await getDoc(doc(db, COL_VALES_PERSONAL, String(id)));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }

    async function cloudFetchValePersonalByIdReliable(id, attempts = 3){
      const ref = doc(db, COL_VALES_PERSONAL, String(id));
      let confirmedRead = false;
      let lastError = null;
      for(let attempt = 1; attempt <= attempts; attempt++){
        try{
          const snap = await getDocFromServer(ref);
          confirmedRead = true;
          if(snap.exists()) return { vale:{ id:snap.id, ...snap.data() }, confirmedRead:true, error:null };
        }catch(error){
          lastError = error;
          console.warn(`Consulta de vale personal ${attempt}/${attempts}:`, error);
        }
        if(attempt < attempts){
          await new Promise(resolve => setTimeout(resolve, 650));
        }
      }
      return { vale:null, confirmedRead, error:lastError };
    }

    async function cloudFetchValesPersonalByNomina(nomina){
      const nominaKey = String(nomina || "").trim();
      const qIndividual = query(
        collection(db, COL_VALES_PERSONAL),
        where("nomina", "==", nominaKey),
        limit(20)
      );
      const qGrupal = query(
        collection(db, COL_VALES_PERSONAL),
        where("nominasIntegrantes", "array-contains", nominaKey),
        limit(20)
      );
      const [individualSnap, grupalSnap] = await Promise.all([getDocs(qIndividual), getDocs(qGrupal)]);
      const map = new Map();
      individualSnap.forEach(d => map.set(d.id, { id:d.id, ...d.data() }));
      grupalSnap.forEach(d => map.set(d.id, { id:d.id, ...d.data() }));
      return Array.from(map.values());
    }

    function esAutorizadorAsignadoValePersonal(v){
      const uid = currentUser?.uid;
      const email = String(currentUser?.email || "").trim().toLowerCase();
      return Boolean((uid && v.autorizadorUid === uid) || (email && String(v.autorizadorEmail || "").trim().toLowerCase() === email));
    }

    async function cloudFetchValesPersonalJefeDesarrollo(){
      const uid = currentUser?.uid;
      if(!uid) return [];
      const ref = collection(db, COL_VALES_PERSONAL);
      const reads = [cloudFetchValesPropios(COL_VALES_PERSONAL)];
      if(hasPerm("autorizar_vale_personal")){
        const assignments = [["autorizadorUid", uid], ["autorizadorEmail", String(currentUser.email || "").trim().toLowerCase()]];
        for(const [field,value] of assignments){
          if(value) reads.push(getDocs(query(ref, where(field, "==", value), limit(300))).then(snap => snap.docs.map(d => ({ ...d.data(), id:d.id }))));
        }
      }
      const rows = (await Promise.all(reads)).flat();
      return Array.from(new Map(rows.map(v => [v.id,v])).values());
    }

    async function cloudFetchValesPersonal(){
      if(currentUser?.role === ROLES.JEFE_DESARROLLO){
        return (await cloudFetchValesPersonalJefeDesarrollo()).filter(v => v.fecha === todayISO());
      }
      if([ROLES.JEFE_COMPRAS, ROLES.JEFE_RESTRINGIDO].includes(currentUser?.role)){
        const currentUid = String(currentUser?.uid || "");
        const currentEmail = String(currentUser?.email || "").trim().toLowerCase();
        const scopedQueries = [];
        if(currentUid){
          scopedQueries.push(query(collection(db, COL_VALES_PERSONAL), where("autorizadorUid", "==", currentUid), limit(200)));
        }
        if(currentEmail){
          scopedQueries.push(query(collection(db, COL_VALES_PERSONAL), where("autorizadorEmail", "==", currentEmail), limit(200)));
        }
        if(!scopedQueries.length) return [];
        const results = await Promise.all(scopedQueries.map(q => getDocs(q)));
        const scopedMap = new Map();
        results.forEach(snap => snap.forEach(d => scopedMap.set(d.id, { id:d.id, ...d.data() })));
        return Array.from(scopedMap.values()).filter(v => String(v.fecha || "") === todayISO());
      }

      const fecha = todayISO();
      const q = query(
        collection(db, COL_VALES_PERSONAL),
        where("fecha", "==", fecha),
        limit(200)
      );
      const snap = await getDocs(q);
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      return arr;
    }

    async function cloudFetchProximosValesPersonal(){
      if(currentUser?.role === ROLES.JEFE_DESARROLLO){
        return (await cloudFetchValesPersonalJefeDesarrollo()).filter(v => v.fecha > todayISO());
      }
      const currentUid = String(currentUser?.uid || "");
      const currentEmail = String(currentUser?.email || "").trim().toLowerCase();
      if([ROLES.JEFE, ROLES.JEFE_RESTRINGIDO, ROLES.JEFE_COMPRAS].includes(currentUser?.role)){
        const scopedQueries = [];
        if(currentUid) scopedQueries.push(query(collection(db, COL_VALES_PERSONAL), where("autorizadorUid", "==", currentUid), limit(300)));
        if(currentEmail) scopedQueries.push(query(collection(db, COL_VALES_PERSONAL), where("autorizadorEmail", "==", currentEmail), limit(300)));
        const results = await Promise.all(scopedQueries.map(item => getDocs(item)));
        const map = new Map();
        results.forEach(snap => snap.forEach(d => map.set(d.id, { id:d.id, ...d.data() })));
        return Array.from(map.values()).filter(v => String(v.fecha || "") > todayISO());
      }
      const q = query(collection(db, COL_VALES_PERSONAL), where("fecha", ">", todayISO()), orderBy("fecha", "asc"), limit(500));
      const snap = await getDocs(q);
      const arr = [];
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
      return arr;
    }

    async function cloudFetchHistorialValesPersonal(){
      const q = query(collection(db, COL_VALES_PERSONAL), orderBy("createdTs", "desc"), limit(500));
      const snap = await getDocs(q);
      const arr = [];
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
      return arr;
    }

    async function cloudFetchReporteNominas(desde, hasta){
      const constraints = [];
      if(desde) constraints.push(where("fecha", ">=", desde));
      if(hasta) constraints.push(where("fecha", "<=", hasta));
      constraints.push(orderBy("fecha", "desc"), limit(1000));
      const snap = await getDocs(query(collection(db, COL_VALES_PERSONAL), ...constraints));
      const arr = [];
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
      return arr;
    }

    async function syncValesPersonal(force = false){
      if(!navigator.onLine || !currentUser || currentUser.role === ROLES.PENDIENTE) return;
      if(!shouldReadCloudStamp(cloudReadCache.valesPersonal, CLOUD_READ_TTL.valesPersonal, force)) return;
      try{
        const cloud = await cloudFetchValesPersonal();
        valesPersonal = mergeById(valesPersonal, cloud);
        saveValesPersonalLocal();
        markCloudRead("valesPersonal");
      }catch(e){
        console.warn(e);
        markCloudRead("valesPersonal");
        toast("Vales", "No se pudieron sincronizar vales de personal.", "warn", 3200);
      }
    }

    async function saveValesPersonal(){
      if(!saveValesPersonalLocal()) return false;
      return true;
    }

    function loadBitacoraLocal(){
      try{
        const raw = localStorage.getItem(LS_BITACORA_KEY);
        if(!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      }catch{ return []; }
    }

    function saveBitacoraLocal(){
      try{
        localStorage.setItem(LS_BITACORA_KEY, JSON.stringify(bitacoraGuardia));
        return true;
      }catch(e){
        console.warn(e);
        toast("Almacenamiento", "No se pudo guardar la bitácora localmente.", "warn", 3600);
        return false;
      }
    }

    async function cloudUpsertBitacora(entry){
      await setDoc(doc(db, COL_BITACORA, String(entry.id)), {
        ...entry,
        updatedTs: Date.now(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    async function cloudDeleteBitacora(id){
      await deleteDoc(doc(db, COL_BITACORA, String(id)));
    }

    async function cloudFetchBitacoraByDate(fechaISO){
      const q = query(
        collection(db, COL_BITACORA),
        where("fecha", "==", fechaISO),
        limit(200)
      );
      const snap = await getDocs(q);
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      return arr;
    }

    async function syncBitacora(fechaISO, force = false){
      if(!navigator.onLine || !currentUser || currentUser.role === ROLES.PENDIENTE) return;
      const cacheKey = String(fechaISO || todayISO());
      if(!shouldReadCloudStamp(cloudReadCache.bitacora.get(cacheKey), CLOUD_READ_TTL.bitacora, force)) return;
      try{
        const cloud = await cloudFetchBitacoraByDate(fechaISO);
        bitacoraGuardia = mergeById(bitacoraGuardia, cloud);
        saveBitacoraLocal();
        markCloudRead(cloudReadCache.bitacora, cacheKey);
      }catch(e){
        console.warn(e);
        markCloudRead(cloudReadCache.bitacora, cacheKey);
        toast("Bitácora", "No se pudo sincronizar la bitácora.", "warn", 3200);
      }
    }

    function loadRondineroPuntosLocal(){
      try{
        const raw = localStorage.getItem(LS_RONDINERO_PUNTOS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      }catch{ return []; }
    }

    function loadRondineroRutasLocal(){
      try{
        const raw = localStorage.getItem(LS_RONDINERO_RUTAS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      }catch{ return []; }
    }

    function loadRondineroRondinesLocal(){
      try{
        const raw = localStorage.getItem(LS_RONDINERO_RONDINES_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      }catch{ return []; }
    }

    function loadRondineroEventosLocal(){
      try{
        const raw = localStorage.getItem(LS_RONDINERO_EVENTOS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      }catch{ return []; }
    }

    function rondineroLocalSnapshot(stripActivePhotos=false){
      const activos = rondineroRondines.filter(r => r?.status === "en_curso");
      const historicos = rondineroRondines
        .filter(r => r?.status !== "en_curso")
        .sort((a,b) => Number(b.updatedTs || b.createdTs || 0) - Number(a.updatedTs || a.createdTs || 0))
        .slice(0, 25);
      const rondines = [...activos, ...historicos];
      const idsActivos = new Set(activos.map(r => String(r.id)));
      const idsCache = new Set(rondines.map(r => String(r.id)));
      const eventosActivos = rondineroEventos
        .filter(ev => idsActivos.has(String(ev.rondinId || "")))
        .sort((a,b) => Number(b.updatedTs || b.createdTs || b.ts || 0) - Number(a.updatedTs || a.createdTs || a.ts || 0))
        .map(ev => {
          const conservarFoto = !stripActivePhotos;
          return conservarFoto ? ev : { ...ev, fotoDataUrl:"", fotoLocalOmitida:!!ev.fotoDataUrl };
        });
      const eventosHistoricos = rondineroEventos
        .filter(ev => idsCache.has(String(ev.rondinId || "")) && !idsActivos.has(String(ev.rondinId || "")))
        .sort((a,b) => Number(b.updatedTs || b.createdTs || b.ts || 0) - Number(a.updatedTs || a.createdTs || a.ts || 0))
        .slice(0, 100)
        .map(ev => ({ ...ev, fotoDataUrl:"", fotoLocalOmitida:!!ev.fotoDataUrl }));
      const eventos = [...eventosActivos, ...eventosHistoricos];
      return { rondines, eventos };
    }

    function writeRondineroLocal(snapshot){
      localStorage.setItem(LS_RONDINERO_PUNTOS_KEY, JSON.stringify(rondineroPuntos));
      localStorage.setItem(LS_RONDINERO_RUTAS_KEY, JSON.stringify(rondineroRutas));
      localStorage.setItem(LS_RONDINERO_RONDINES_KEY, JSON.stringify(snapshot.rondines));
      localStorage.setItem(LS_RONDINERO_EVENTOS_KEY, JSON.stringify(snapshot.eventos));
    }

    function saveRondineroLocal(){
      try{
        writeRondineroLocal(rondineroLocalSnapshot(false));
        return true;
      }catch(e){
        console.warn("Rondinero: caché local lleno; se intentará compactar.", e);
        try{
          localStorage.removeItem(LS_RONDINERO_RONDINES_KEY);
          localStorage.removeItem(LS_RONDINERO_EVENTOS_KEY);
          writeRondineroLocal(rondineroLocalSnapshot(false));
          toast("Almacenamiento optimizado", "Se liberó historial local de Rondinero. Las evidencias permanecen en Firebase.", "info", 4200);
          return true;
        }catch(compactError){
          console.warn("Rondinero: el dispositivo rechazó incluso el caché mínimo.", compactError);
          try{
            writeRondineroLocal(rondineroLocalSnapshot(true));
            toast("Caché mínimo", "El dispositivo no conservó fotografías localmente; se respaldarán en Firebase mientras haya conexión.", "warn", 5200);
            return true;
          }catch(minimalError){
            console.warn("Rondinero: almacenamiento local no disponible.", minimalError);
            toast("Almacenamiento restringido", navigator.onLine ? "Se intentará continuar usando Firebase." : "Libera espacio o habilita el almacenamiento del navegador para trabajar sin conexión.", "warn", 5200);
            return false;
          }
        }
      }
    }

    async function cloudUpsertRondineroPunto(punto){
      await setDoc(doc(db, COL_RONDINERO_PUNTOS, String(punto.id)), {
        ...punto,
        updatedTs: Date.now(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    async function cloudUpsertRondineroRuta(ruta){
      await setDoc(doc(db, COL_RONDINERO_RUTAS, String(ruta.id)), {
        ...ruta,
        updatedTs: Date.now(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    async function cloudUpsertRondineroRondin(rondin){
      await setDoc(doc(db, COL_RONDINERO_RONDINES, String(rondin.id)), {
        ...rondin,
        updatedTs: Date.now(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    async function cloudUpsertRondineroEvento(evento){
      await setDoc(doc(db, COL_RONDINERO_EVENTOS, String(evento.id)), {
        ...evento,
        updatedTs: Date.now(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    async function cloudDeleteRondineroRondin(id){
      await deleteDoc(doc(db, COL_RONDINERO_RONDINES, String(id)));
    }

    async function cloudDeleteRondineroEvento(id){
      await deleteDoc(doc(db, COL_RONDINERO_EVENTOS, String(id)));
    }

    async function cloudDeleteResumenDiario(fechaKey){
      if(!fechaKey) return;
      await deleteDoc(doc(db, COL_RESUMEN_DIARIO, String(fechaKey)));
    }

    async function syncRondinero(force = false){
      if(!navigator.onLine || !currentUser || currentUser.role === ROLES.PENDIENTE) return;
      if(!shouldReadCloudStamp(cloudReadCache.rondinero, CLOUD_READ_TTL.rondinero, force)) return;
      try{
        const puntosSnap = await getDocs(query(collection(db, COL_RONDINERO_PUNTOS), limit(300)));
        const puntos = [];
        puntosSnap.forEach(d => puntos.push({ id: d.id, ...d.data() }));
        rondineroPuntos = mergeById(rondineroPuntos, puntos);

        const rutasSnap = await getDocs(query(collection(db, COL_RONDINERO_RUTAS), limit(200)));
        const rutas = [];
        rutasSnap.forEach(d => rutas.push({ id: d.id, ...d.data() }));
        rondineroRutas = mergeById(rondineroRutas, rutas);

        const rondinesSnap = await getDocs(query(collection(db, COL_RONDINERO_RONDINES), orderBy("createdTs", "desc"), limit(100)));
        const rondines = [];
        rondinesSnap.forEach(d => rondines.push({ id: d.id, ...d.data() }));
        rondineroRondines = mergeById(rondineroRondines, rondines);

        const eventosSnap = await getDocs(query(collection(db, COL_RONDINERO_EVENTOS), orderBy("createdTs", "desc"), limit(500)));
        const eventos = [];
        eventosSnap.forEach(d => eventos.push({ id: d.id, ...d.data() }));
        rondineroEventos = mergeById(rondineroEventos, eventos);

        saveRondineroLocal();
        markCloudRead("rondinero");
      }catch(e){
        console.warn(e);
        markCloudRead("rondinero");
        toast("Rondinero", "No se pudo sincronizar Rondinero.", "warn", 3200);
      }
    }

    async function syncRondineroGuardia(force = false){
      if(!navigator.onLine || !currentUser || currentUser.role === ROLES.PENDIENTE) return;
      if(!shouldReadCloudStamp(cloudReadCache.rondinero, CLOUD_READ_TTL.rondinero, force)) return;
      try{
        const puntosSnap = await getDocs(query(collection(db, COL_RONDINERO_PUNTOS), limit(300)));
        const puntos = [];
        puntosSnap.forEach(d => puntos.push({ id: d.id, ...d.data() }));
        rondineroPuntos = mergeById(rondineroPuntos, puntos);

        const rutasSnap = await getDocs(query(collection(db, COL_RONDINERO_RUTAS), limit(200)));
        const rutas = [];
        rutasSnap.forEach(d => rutas.push({ id: d.id, ...d.data() }));
        rondineroRutas = mergeById(rondineroRutas, rutas);

        const rondinesSnap = await getDocs(query(
          collection(db, COL_RONDINERO_RONDINES),
          where("operadorUid", "==", currentUser.uid),
          limit(50)
        ));
        const rondines = [];
        rondinesSnap.forEach(d => rondines.push({ id: d.id, ...d.data() }));
        rondineroRondines = mergeById(rondineroRondines, rondines);

        const eventosSnap = await getDocs(query(
          collection(db, COL_RONDINERO_EVENTOS),
          where("operadorUid", "==", currentUser.uid),
          limit(300)
        ));
        const eventos = [];
        eventosSnap.forEach(d => eventos.push({ id: d.id, ...d.data() }));
        rondineroEventos = mergeById(rondineroEventos, eventos);

        saveRondineroLocal();
        markCloudRead("rondinero");
      }catch(e){
        console.warn(e);
        markCloudRead("rondinero");
        toast("Rondinero", "No se pudo sincronizar tu rondín.", "warn", 3200);
      }
    }

    async function touchActiveSession(online = true){
      if(!navigator.onLine || !currentUser?.uid) return;
      try{
        await setDoc(doc(db, COL_SESIONES, String(currentUser.uid)), {
          uid: currentUser.uid,
          email: currentUser.email || "",
          nombre: currentUser.nombre || currentUser.email || "",
          role: currentUser.role || "",
          online,
          lastSeenTs: Date.now(),
          lastSeenAt: serverTimestamp(),
          userAgent: navigator.userAgent || "",
          updatedTs: Date.now()
        }, { merge: true });
      }catch(e){
        console.warn("No se pudo actualizar sesión activa:", e);
      }
    }

    async function fetchActiveSessions(){
      const q = query(collection(db, COL_SESIONES), limit(300));
      const snap = await getDocs(q);
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      return arr.sort((a,b)=>(b.lastSeenTs || 0) - (a.lastSeenTs || 0));
    }

    async function renderSesionesActivas(){
      if(!requirePerm("ver_sesiones_activas","Solo ADMIN puede ver usuarios logeados.")) return;
      currentView = "sesiones_activas";
      try{ setActiveSb("config"); }catch{}
      appEl.innerHTML = `
        <div class="card">
          <div class="row" style="justify-content:space-between; align-items:flex-start;">
            <div>
              <h2 style="margin:0 0 4px;">Usuarios logeados</h2>
              <div style="color:var(--muted);font-size:12px;">Sesiones activas por última actividad registrada.</div>
            </div>
            <div class="row">
              <button class="secondary" data-action="sesionesActivas">Recargar</button>
              <button class="secondary" data-action="home">Volver</button>
            </div>
          </div>
          <div class="divider"></div>
          <div id="sesionesWrap" style="overflow:auto;">
            <div style="color:var(--muted);font-size:12px;">Cargando sesiones...</div>
          </div>
        </div>
      `;

      try{
        const rows = await fetchActiveSessions();
        const now = Date.now();
        const wrap = document.getElementById("sesionesWrap");
        wrap.innerHTML = `
          <table class="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Última actividad</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(s => {
                const active = s.online && typeof s.lastSeenTs === "number" && (now - s.lastSeenTs) <= 5 * 60 * 1000;
                const seen = s.lastSeenTs ? new Date(s.lastSeenTs).toLocaleString() : "-";
                return `
                  <tr>
                    <td><b>${esc(s.nombre || "-")}</b></td>
                    <td>${esc(s.email || "-")}</td>
                    <td>${esc(s.role || "-")}</td>
                    <td><span class="pill"><span class="dot ${active ? "ok" : "muted"}"></span>${active ? "Activo" : "Inactivo"}</span></td>
                    <td>${esc(seen)}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        `;
      }catch(e){
        console.warn(e);
        const wrap = document.getElementById("sesionesWrap");
        if(wrap) wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;">No se pudieron cargar sesiones.</div>`;
        toast("Sesiones","No se pudieron cargar usuarios logeados.","bad",3200);
      }
    }

   function mergeById(localArr, cloudArr){
  const map = new Map();

  // Conserva locales para no perder capturas offline antes de subirlas.
  for(const v of localArr){
    reconcileVisitaStatus(v);
    const id = String(v.id);
    map.set(id, v);
  }

  // La nube pisa al local cuando ambos comparten id.
  for(const v of cloudArr){
    reconcileVisitaStatus(v);
    map.set(String(v.id), v);
  }

  // Ordena por la marca mas reciente disponible.
  return Array.from(map.values())
    .sort((a,b) => ((b.updatedTs || b.createdTs || 0) - (a.updatedTs || a.createdTs || 0)));
}

    // -------------------------
    // IndexedDB (docs OC/Factura)
    // -------------------------
    const DB_NAME = "proveedores_db";
    const DB_VER = 2;
    const STORE_DOCS = "docs";

    function idbOpen(){
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
          const dbx = req.result;
          if(!dbx.objectStoreNames.contains(STORE_DOCS)){
            dbx.createObjectStore(STORE_DOCS);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async function idbSetDoc(key, blob){
      const dbx = await idbOpen();
      return new Promise((resolve, reject) => {
        const tx = dbx.transaction(STORE_DOCS, "readwrite");
        tx.objectStore(STORE_DOCS).put(blob, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }

    async function idbGetDoc(key){
      const dbx = await idbOpen();
      return new Promise((resolve, reject) => {
        const tx = dbx.transaction(STORE_DOCS, "readonly");
        const req = tx.objectStore(STORE_DOCS).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    async function idbDelDoc(key){
      const dbx = await idbOpen();
      return new Promise((resolve, reject) => {
        const tx = dbx.transaction(STORE_DOCS, "readwrite");
        tx.objectStore(STORE_DOCS).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }

    // -------------------------
    // Firebase: user profile
    // -------------------------
    function userProfileIsComplete(profile={}, uid=""){
      const resolvedUid = String(uid || profile.uid || profile.id || "").trim();
      const email = String(profile.email || "").trim();
      const nombre = String(profile.nombre || profile.name || profile.displayName || "").trim();
      return !!resolvedUid && !!email && !!nombre;
    }

    function userProfileAudit(action, actor={}){
      const uid = String(actor.uid || currentUser?.uid || auth.currentUser?.uid || "").trim();
      const email = String(actor.email || currentUser?.email || auth.currentUser?.email || "").trim();
      return {
        profileLastAction: String(action || "actualizar_perfil"),
        profileLastActionTs: Date.now(),
        profileLastActionByUid: uid,
        profileLastActionByEmail: email
      };
    }

    async function ensureUserProfile(user){
      if(!user?.uid) throw new Error("No se recibió un UID válido para el perfil.");
      if(user.isAnonymous) throw new Error("Una sesión anónima de kiosco no puede crear perfiles en users.");
      const email = String(user.email || "").trim();
      const nombre = String(user.displayName || email).trim();
      if(!email || !nombre) throw new Error("La cuenta no tiene correo o nombre suficiente para crear su perfil.");
      const ref = doc(db, COL_USERS, user.uid);
      const snap = await getDoc(ref);
      if(!snap.exists()){
        await setDoc(ref, {
          uid: user.uid,
          email,
          nombre,
          role: ROLES.PENDIENTE,      // ✅ rol por defecto
          createdTs: Date.now(),
          createdAt: serverTimestamp(),
          ...userProfileAudit("crear_perfil_inicio_sesion", user)
        });
        return { uid:user.uid, email, nombre, role: ROLES.PENDIENTE };
      }
      const data = snap.data() || {};
      if(!userProfileIsComplete(data, user.uid)){
        throw new Error("El perfil existe, pero está incompleto. Solicita al administrador repararlo.");
      }
      return { ...data, uid:user.uid, email:data.email || email, nombre:data.nombre || nombre, role: data.role || ROLES.PENDIENTE };
    }

    // -------------------------
    // Firebase: visitas CRUD
    // -------------------------
    function colAcceso(v){
      return isVisitante(v) ? COL_VISITANTES : COL_VISITAS;
    }

    async function cloudUpsertVisita(v){
      const ref = doc(db, colAcceso(v), String(v.id));
      const oldSnap = await getDoc(ref);
      const before = oldSnap.exists() ? { id: oldSnap.id, ...oldSnap.data() } : null;
      const after = {
        ...(before || {}),
        ...v,
        updatedTs: Date.now(),
        updatedAt: serverTimestamp(),
        updatedByUid: currentUser?.uid || "",
        updatedByEmail: currentUser?.email || ""
      };
      reconcileVisitaStatus(after);
      if(before){
        const canonicalBefore = { ...before };
        reconcileVisitaStatus(canonicalBefore);
        if(visitaStatusRank(canonicalBefore.status) > visitaStatusRank(after.status)){
          after.status = canonicalBefore.status;
          after.qrActivo = canonicalBefore.qrActivo;
        }
      }
      if(v && typeof v === "object"){
        v.status = after.status;
        v.qrActivo = after.qrActivo;
      }
      const batch = writeBatch(db);
      batch.set(ref, after, { merge: true });
      addResumenDiffToBatch(batch, before, after);
      await batch.commit();
    }

    async function cloudDeleteVisita(id){
      const local = visitas.find(v => String(v.id) === String(id));
      const ref = doc(db, local ? colAcceso(local) : COL_VISITAS, String(id));
      const oldSnap = await getDoc(ref);
      const before = oldSnap.exists() ? { id: oldSnap.id, ...oldSnap.data() } : null;
      const batch = writeBatch(db);
      batch.delete(ref);
      addResumenDiffToBatch(batch, before, null);
      await batch.commit();
    }

    function cloudDayReadAccess(){
      return {
        proveedores: hasPerm("ver_dashboard_proveedores"),
        visitantes: hasPerm("ver_dashboard_visitantes")
      };
    }

    async function cloudFetchByDay(dateObj){
      const { start, end } = dayBounds(dateObj);
      const access = cloudDayReadAccess();
      // Query por rango en fechaHoraTs (misma field), sin pedir índices compuestos
      const qProveedores = query(
        collection(db, COL_VISITAS),
        where("fechaHoraTs", ">=", start),
        where("fechaHoraTs", "<", end),
        orderBy("fechaHoraTs", "desc"),
        limit(currentUser?.role === ROLES.PROVEEDOR ? 10 : 500)
      );
      const qVisitantes = query(
        collection(db, COL_VISITANTES),
        where("fechaHoraTs", ">=", start),
        where("fechaHoraTs", "<", end),
        orderBy("fechaHoraTs", "desc"),
        limit(500)
      );
      const reads = [];
      if(access.proveedores) reads.push({ tipo:"proveedores", promise:getDocs(qProveedores) });
      if(access.visitantes) reads.push({ tipo:"visitantes", promise:getDocs(qVisitantes) });
      if(!reads.length) return [];

      const results = await Promise.allSettled(reads.map(read => read.promise));
      const fulfilled = results.filter(result => result.status === "fulfilled");
      if(!fulfilled.length){
        const error = results.find(result => result.status === "rejected")?.reason;
        throw error || new Error("No fue posible leer las colecciones permitidas para el rol actual.");
      }
      const arr = [];
      results.forEach((result, index) => {
        const tipo = reads[index].tipo;
        if(result.status === "rejected"){
          console.warn(`No se pudo leer ${tipo}:`, result.reason);
          return;
        }
        result.value.forEach(d => {
          const data = { id: d.id, ...d.data() };
          if(tipo === "visitantes"){
            arr.push({ ...data, tipoVisita:"visitante", tipoAcceso:"visitante" });
          }else if(!isVisitante(data)){
            arr.push(data);
          }
        });
      });
      return arr;
    }

    function cloudReadErrorMessage(error){
      const code = String(error?.code || "").toLowerCase();
      if(code.includes("permission-denied")) return "Tu sesión no tiene permiso para consultar este módulo.";
      if(code.includes("failed-precondition")) return "Firestore requiere un índice para completar esta consulta.";
      if(code.includes("unavailable") || code.includes("network")) return "Firebase no respondió. Revisa la conexión a Internet.";
      if(code.includes("unauthenticated")) return "La sesión venció. Cierra sesión e ingresa nuevamente.";
      return "No se pudo actualizar la información del día.";
    }

    function cloudCreateVisitaErrorMessage(error){
      const code = String(error?.code || "").toLowerCase();
      if(code.includes("permission-denied")) return "Firebase rechazó el permiso de escritura. Verifica que el rol tenga autorización para crear visitantes.";
      if(code.includes("unavailable") || code.includes("network")) return "Firebase no respondió. Revisa la conexión e inténtalo nuevamente.";
      if(code.includes("unauthenticated")) return "La sesión venció. Cierra sesión e ingresa nuevamente.";
      return "Firebase no confirmó el guardado. La cita y el QR no fueron generados.";
    }

    async function syncDay(dateObj, force = false){
      if(!navigator.onLine) return;
      const d = dateObj instanceof Date ? dateObj : new Date(dateObj || Date.now());
      const cacheKey = d.toISOString().slice(0,10);
      if(!shouldReadCloudStamp(cloudReadCache.visitasDia.get(cacheKey), CLOUD_READ_TTL.visitasDia, force)) return;
      try{
        const cloud = await cloudFetchByDay(d);
        const inconsistentes = cloud.filter(v => reconcileVisitaStatus(v));
        visitas = mergeById(visitas, cloud);
        saveVisitasLocal();
        if(inconsistentes.length && [ROLES.ADMIN,ROLES.COORDINADOR].includes(currentUser?.role)){
          const reparaciones = inconsistentes.slice(0, 25).map(v => {
            v.statusReconciliadoTs = Date.now();
            v.statusReconciliadoPor = currentUser?.email || currentUser?.uid || "";
            return cloudUpsertVisita(v);
          });
          const resultados = await Promise.allSettled(reparaciones);
          const corregidos = resultados.filter(result => result.status === "fulfilled").length;
          if(corregidos) console.info(`Estados reconciliados en Firebase: ${corregidos}`);
        }
        if(cloudDayReadAccess().visitantes){
          try{
            await normalizarQrVisitantesRetrasados();
          }catch(normalizeError){
            console.warn("No se pudieron normalizar los QR de visitantes:", normalizeError);
          }
        }
        // El resumen diario se mantiene con deltas en cloudUpsertVisita/cloudDeleteVisita.
        // Reconstruirlo en cada sync genera escrituras repetidas y puede inflar la cuota gratuita.
        markCloudRead(cloudReadCache.visitasDia, cacheKey);
      }catch(e){
        console.warn(e);
        markCloudRead(cloudReadCache.visitasDia, cacheKey);
        toast("Sync", cloudReadErrorMessage(e), "warn", 3800);
      }
    }

    // Evita spam de toasts
let _lastSyncToastTs = 0;

function _maybeToastSync(msg, type="warn", ttl=3200){
  const now = Date.now();
  // máximo 1 toast cada 20s
  if(now - _lastSyncToastTs < 20000) return;
  _lastSyncToastTs = now;
  toast("Sync", msg, type, ttl);
}

function sanitizeForFirestore(obj){
  // Elimina undefined y valores no serializables
  const out = {};
  for(const [k,v] of Object.entries(obj || {})){
    if(v === undefined) continue;
    if(v instanceof File || v instanceof Blob) continue; // Firestore no acepta blobs tipo File aquí
    // Evita NaN
    if(typeof v === "number" && Number.isNaN(v)) continue;
    // Arrays / objetos anidados: sanea recursivo
    if(v && typeof v === "object" && !Array.isArray(v)){
      out[k] = sanitizeForFirestore(v);
    } else if(Array.isArray(v)){
      out[k] = v.map(x => (x && typeof x === "object") ? sanitizeForFirestore(x) : x)
              .filter(x => x !== undefined);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function pushRecentToCloud(){
  if(!navigator.onLine) return;
  if(!currentUser || currentUser.role === ROLES.PENDIENTE) return;

  try{
    const sorted = [...visitas].sort((a,b)=>((b.updatedTs||b.createdTs||0)-(a.updatedTs||a.createdTs||0)));
    const lastPushTs = Number(localStorage.getItem(LS_LAST_VISITAS_PUSH_TS) || 0);
    const changed = lastPushTs
      ? sorted.filter(v => Number(v.updatedTs || v.createdTs || 0) > lastPushTs)
      : sorted.slice(0, 10);
    const top = changed.slice(0, 10);
    if(!top.length) return;

    // IMPORTANTE: sanitiza antes de mandar
    await Promise.all(top.map(v => cloudUpsertVisita(sanitizeForFirestore(v))));
    const maxSentTs = Math.max(lastPushTs, ...top.map(v => Number(v.updatedTs || v.createdTs || 0)).filter(Boolean));
    localStorage.setItem(LS_LAST_VISITAS_PUSH_TS, String(maxSentTs || Date.now()));
  }catch(e){
  console.warn("pushRecentToCloud (ignorado):", e?.code, e?.message);

  // 🔇 NO mostrar toast en auto-sync
  // El guardado principal ya ocurrió
}
}

function valePersonalDuplicateSignature(v={}){
  const clean = value => String(value || "").trim().toLowerCase().replace(/\s+/g," ");
  const nomina = esValePersonalGrupal(v)
    ? v.integrantes.map(item => normalizarNominaPerfil(item.nomina)).filter(Boolean).sort().join(",")
    : clean(v.nomina).replace(/^0+(?=\d)/,"");
  const colaborador = nomina || clean(v.nombreColaborador);
  const salidaProgramada = Number(v.salidaProgramadaTs || 0);
  const horario = salidaProgramada > 0
    ? new Date(salidaProgramada).toISOString().slice(0,16)
    : "";
  return [
    clean(v.fecha),
    colaborador,
    clean(valePersonalMovimientoLabel(v)),
    clean(v.tiempoAutorizado),
    horario
  ].join("|");
}

function valePersonalActivoParaDuplicado(v={}){
  return [ValeStatus.PENDIENTE, ValeStatus.GENERADO, ValeStatus.FUERA].includes(v.status);
}

function encontrarValePersonalActivoEquivalente(list=[], candidate={}){
  const candidateKey = valePersonalDuplicateSignature(candidate);
  return list.find(existing =>
    String(existing.id || "") !== String(candidate.id || "") &&
    valePersonalActivoParaDuplicado(existing) &&
    valePersonalDuplicateSignature(existing) === candidateKey
  ) || null;
}

function valePersonalProgressScore(v={}){
  let score = 0;
  if(v.regresoTs || v.finalizadoTs || v.canceladoTs) score += 100;
  if(v.salidaTs || v.llegadaTs) score += 60;
  if(v.autorizadoTs || v.autorizadoPorUid || v.autorizadoPor) score += 30;
  if(v.status === ValeStatus.REGRESO_CANCELADO) score += 20;
  else if(v.status === ValeStatus.FUERA) score += 15;
  else if(v.status === ValeStatus.GENERADO) score += 10;
  if(Array.isArray(v.historial)) score += Math.min(v.historial.length,9);
  return score;
}

function detectarDuplicadosValesPersonal(list=[]){
  const groups = new Map();
  list.forEach(v => {
    const key = valePersonalDuplicateSignature(v);
    if(!key || key.startsWith("|")) return;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(v);
  });
  const duplicates = [];
  const clusters = [];
  groups.forEach(items => {
    if(items.length < 2) return;
    const ranked = [...items].sort((a,b)=>valePersonalProgressScore(b)-valePersonalProgressScore(a) || Number(a.createdTs||0)-Number(b.createdTs||0));
    const keep = ranked[0];
    const remove = ranked.slice(1);
    clusters.push({ keep, remove });
    duplicates.push(...remove);
  });
  return { clusters, duplicates };
}

async function limpiarDuplicadosValesPersonal(){
  if(currentUser?.role !== ROLES.ADMIN || !requirePerm("eliminar","Solo ADMIN puede limpiar vales duplicados.")) return;
  if(!navigator.onLine) return toast("Sin conexión","Conéctate a internet para verificar y limpiar los duplicados en Firebase.","warn",4200);
  if(!(await requireAdminPin("limpiar vales de personal duplicados"))) return;

  let cloud = [];
  try{
    cloud = await cloudFetchHistorialValesPersonal();
  }catch(error){
    console.error(error);
    return toast("No se pudo revisar","Firebase no respondió. No se eliminó ningún vale.","bad",4800);
  }
  const { clusters, duplicates } = detectarDuplicadosValesPersonal(cloud);
  if(!duplicates.length) return toast("Sin duplicados","No se encontraron permisos equivalentes con la misma fecha, nómina, movimiento, tiempo autorizado y horario programado.","ok",5200);

  const preview = clusters.slice(0,8).map(group => {
    const v = group.keep;
    return `• ${v.nombreColaborador || "Sin nombre"} · nómina ${v.nomina || "-"} · ${v.fecha || "-"}: ${group.remove.length} copia(s)`;
  }).join("\n");
  const extra = clusters.length > 8 ? `\n• ...y ${clusters.length-8} grupo(s) más` : "";
  const ok = confirm(
    `LIMPIEZA DE VALES DUPLICADOS\n\nSe detectaron ${duplicates.length} copias en ${clusters.length} grupo(s).\n\n${preview}${extra}\n\nSe conservará en cada grupo el vale con autorización o mayor recorrido. Si empatan, se conserva el más antiguo.\n\n¿Deseas eliminar únicamente las copias detectadas?`
  );
  if(!ok) return;

  const results = await Promise.allSettled(duplicates.map(v => cloudDeleteValePersonal(v.id)));
  const deletedIds = new Set();
  results.forEach((result,index) => { if(result.status === "fulfilled") deletedIds.add(String(duplicates[index].id)); });
  valesPersonal = mergeById(valesPersonal, cloud).filter(v => !deletedIds.has(String(v.id)));
  saveValesPersonalLocal();
  const failed = duplicates.length - deletedIds.size;
  if(failed){
    toast("Limpieza parcial",`Se eliminaron ${deletedIds.size} copias y ${failed} no pudieron eliminarse. Puedes ejecutar la revisión nuevamente.`,"warn",6000);
  }else{
    toast("Duplicados eliminados",`Se eliminaron ${deletedIds.size} copias y se conservaron ${clusters.length} vales válidos.`,"ok",5200);
  }
  renderModuleHome();
}

async function depurarBaseHastaHoy() {
  if (currentUser?.role !== ROLES.ADMIN || !requirePerm("eliminar", "Solo ADMIN puede depurar la base.")) return;
  if (!(await requireAdminPin("depurar la base de datos"))) return;

  const ok = confirm(
    "⚠️ DEPURACIÓN DE BASE DE DATOS\n\n" +
    "Se eliminarán TODOS los registros con fecha ≤ HOY en:\n" +
    "• Citas de proveedores\n" +
    "• Citas de visitantes\n" +
    "• Vales de salida de activos\n" +
    "• Vales de salida de personal\n" +
    "• Bitácora de novedades\n" +
    "• Rondines y eventos del Rondinero\n" +
    "• Resúmenes diarios relacionados\n\n" +
    "✅ Se conservarán SOLO registros futuros.\n\n" +
    "No se borrarán usuarios, proveedores, puntos QR ni rutas.\n\n" +
    "¿Deseas continuar?"
  );
  if (!ok) return;

  const hoyTs = new Date().setHours(23, 59, 59, 999);

  const citasBorrar = visitas.filter(v =>
    typeof v.fechaHoraTs === "number" &&
    v.fechaHoraTs <= hoyTs
  );
  const proveedoresBorrar = citasBorrar.filter(v => !isVisitante(v)).length;
  const visitantesBorrar = citasBorrar.filter(v => isVisitante(v)).length;
  const valesActivosBorrar = valesActivos.filter(v => {
    const ts = getValePurgeTs(v);
    return typeof ts === "number" && ts <= hoyTs;
  });
  const valesPersonalBorrar = valesPersonal.filter(v => {
    const ts = getValePurgeTs(v);
    return typeof ts === "number" && ts <= hoyTs;
  });
  const bitacoraBorrar = bitacoraGuardia.filter(entry => {
    const ts = getRegistroPurgeTs(entry);
    return typeof ts === "number" && ts <= hoyTs;
  });
  const rondinesBorrar = rondineroRondines.filter(r => {
    const ts = getRegistroPurgeTs(r);
    return typeof ts === "number" && ts <= hoyTs;
  });
  const eventosBorrar = rondineroEventos.filter(ev => {
    const ts = getRegistroPurgeTs(ev);
    return typeof ts === "number" && ts <= hoyTs;
  });
  const resumenKeysBorrar = Array.from(new Set(
    citasBorrar.map(getFechaKeyForPurge).filter(Boolean)
  ));
  const totalBorrar = citasBorrar.length + valesActivosBorrar.length + valesPersonalBorrar.length + bitacoraBorrar.length + rondinesBorrar.length + eventosBorrar.length + resumenKeysBorrar.length;

  if (!totalBorrar) {
    toast("Depuración", "No hay registros a eliminar.", "info");
    return;
  }

  toast("Depurando", `Borrando ${totalBorrar} registros…`, "warn", 3000);

  // 🔥 Borra documentos locales (IndexedDB)
  for (const v of citasBorrar) {
    if (v.ocFileKey) await idbDelDoc(v.ocFileKey).catch(() => {});
    if (v.facturaFileKey) await idbDelDoc(v.facturaFileKey).catch(() => {});
  }

  // 🔥 Borra en Firestore (best effort)
  if (navigator.onLine) {
    await Promise.all(
      [
        ...citasBorrar.map(v => cloudDeleteVisita(v.id).catch(() => {})),
        ...valesActivosBorrar.map(v => cloudDeleteValeActivo(v.id).catch(() => {})),
        ...valesPersonalBorrar.map(v => cloudDeleteValePersonal(v.id).catch(() => {})),
        ...bitacoraBorrar.map(entry => cloudDeleteBitacora(entry.id).catch(() => {})),
        ...rondinesBorrar.map(r => cloudDeleteRondineroRondin(r.id).catch(() => {})),
        ...eventosBorrar.map(ev => cloudDeleteRondineroEvento(ev.id).catch(() => {})),
        ...resumenKeysBorrar.map(fechaKey => cloudDeleteResumenDiario(fechaKey).catch(() => {}))
      ]
    );
  }

  // ✅ Mantener SOLO futuras
  visitas = visitas.filter(v =>
    typeof v.fechaHoraTs === "number" &&
    v.fechaHoraTs > hoyTs
  );
  valesActivos = valesActivos.filter(v => {
    const ts = getValePurgeTs(v);
    return !(typeof ts === "number" && ts <= hoyTs);
  });
  valesPersonal = valesPersonal.filter(v => {
    const ts = getValePurgeTs(v);
    return !(typeof ts === "number" && ts <= hoyTs);
  });
  bitacoraGuardia = bitacoraGuardia.filter(entry => {
    const ts = getRegistroPurgeTs(entry);
    return !(typeof ts === "number" && ts <= hoyTs);
  });
  rondineroRondines = rondineroRondines.filter(r => {
    const ts = getRegistroPurgeTs(r);
    return !(typeof ts === "number" && ts <= hoyTs);
  });
  rondineroEventos = rondineroEventos.filter(ev => {
    const ts = getRegistroPurgeTs(ev);
    return !(typeof ts === "number" && ts <= hoyTs);
  });

  saveVisitasLocal();
  saveValesActivosLocal();
  saveValesPersonalLocal();
  saveBitacoraLocal();
  saveRondineroLocal();

  toast(
    "Depuración completa",
    `Se eliminaron ${totalBorrar} registros: ${proveedoresBorrar} proveedores, ${visitantesBorrar} visitantes, ${valesActivosBorrar.length} vales de activos, ${valesPersonalBorrar.length} vales de personal, ${bitacoraBorrar.length} bitácora, ${rondinesBorrar.length} rondines, ${eventosBorrar.length} eventos y ${resumenKeysBorrar.length} resúmenes.`,
    "ok",
    3000
  );

  renderCurrentAfterDepuracion();
}

function cerrarPanelDepuracion30(){
  document.getElementById("depuracion30StatusOverlay")?.remove();
}

function mostrarProgresoDepuracion30(titulo, detalle, progreso=""){
  cerrarPanelDepuracion30();
  const overlay = document.createElement("div");
  overlay.id = "depuracion30StatusOverlay";
  overlay.className = "modal-overlay";
  overlay.style.display = "flex";
  overlay.innerHTML = `
    <div class="modal" role="status" aria-live="polite" style="max-width:560px;">
      <div style="display:flex;gap:14px;align-items:center;">
        <div style="width:44px;height:44px;border-radius:50%;border:5px solid #dbeafe;border-top-color:#2563eb;animation:spin 1s linear infinite;flex:0 0 auto;"></div>
        <div>
          <h3 style="margin:0 0 6px;">${esc(titulo)}</h3>
          <p id="depuracion30ProgressText" style="margin:0;color:var(--muted);">${esc(detalle)}</p>
          <strong id="depuracion30ProgressCount" style="display:block;margin-top:8px;">${esc(progreso)}</strong>
        </div>
      </div>
      <p style="margin:18px 0 0;color:var(--muted);font-size:13px;">No cierres esta pestaña mientras el proceso esté activo.</p>
    </div>`;
  document.body.appendChild(overlay);
}

function actualizarProgresoDepuracion30(detalle, progreso=""){
  const text = document.getElementById("depuracion30ProgressText");
  const count = document.getElementById("depuracion30ProgressCount");
  if(text) text.textContent = detalle;
  if(count) count.textContent = progreso;
}

function guardarResumenDepuracion30(reporte){
  try{ localStorage.setItem(LS_LAST_DEPURACION_30D, JSON.stringify(reporte)); }catch(error){ console.warn("No se pudo guardar el resumen de depuración:", error); }
}

function cargarResumenDepuracion30(){
  try{
    const raw = localStorage.getItem(LS_LAST_DEPURACION_30D);
    return raw ? JSON.parse(raw) : null;
  }catch{ return null; }
}

function mostrarResumenDepuracion30(reporte = cargarResumenDepuracion30()){
  cerrarPanelDepuracion30();
  if(!reporte){
    toast("Sin resumen", "Todavía no se ha completado una depuración de 30 días en este dispositivo.", "info", 4800);
    return;
  }
  const detalle = reporte.detalle || {};
  const estadoColor = reporte.estado === "completa" ? "#16a34a" : reporte.estado === "sin_cambios" ? "#2563eb" : "#d97706";
  const estadoTexto = reporte.estado === "completa" ? "Completada" : reporte.estado === "sin_cambios" ? "Sin registros eliminables" : "Completada parcialmente";
  const overlay = document.createElement("div");
  overlay.id = "depuracion30StatusOverlay";
  overlay.className = "modal-overlay";
  overlay.style.display = "flex";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="depuracion30ResumenTitulo" style="max-width:720px;max-height:88vh;overflow:auto;">
      <div class="modal-head">
        <div>
          <h3 id="depuracion30ResumenTitulo" style="margin:0;">Resultado de la última depuración</h3>
          <small>${esc(reporte.fechaHora || "Fecha no disponible")}</small>
        </div>
        <button type="button" class="secondary" id="cerrarResumenDepuracion30" aria-label="Cerrar">Cerrar</button>
      </div>
      <div style="margin:16px 0;padding:14px;border:1px solid ${estadoColor};border-radius:14px;background:color-mix(in srgb, ${estadoColor} 10%, transparent);">
        <strong style="color:${estadoColor};">${esc(estadoTexto)}</strong>
        <div style="margin-top:5px;">Retención aplicada: anteriores al ${esc(reporte.limiteFecha || "-")}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:16px;">
        <div class="tarjeta"><small>Encontrados</small><strong style="display:block;font-size:24px;">${Number(reporte.encontrados || 0)}</strong></div>
        <div class="tarjeta"><small>Protegidos</small><strong style="display:block;font-size:24px;">${Number(reporte.protegidos || 0)}</strong></div>
        <div class="tarjeta"><small>Confirmados</small><strong style="display:block;font-size:24px;">${Number(reporte.confirmados || 0)}</strong></div>
        <div class="tarjeta"><small>Fallidos</small><strong style="display:block;font-size:24px;">${Number(reporte.fallidos || 0)}</strong></div>
      </div>
      <div style="border:1px solid var(--line);border-radius:14px;overflow:hidden;">
        ${[
          ["Proveedores", detalle.proveedores], ["Visitantes", detalle.visitantes],
          ["Vales de activos", detalle.valesActivos], ["Vales de personal", detalle.valesPersonal],
          ["Bitácora", detalle.bitacora], ["Rondines", detalle.rondines],
          ["Eventos de rondines", detalle.eventos], ["Resúmenes diarios", detalle.resumenes]
        ].map(([label,value]) => `<div style="display:flex;justify-content:space-between;gap:16px;padding:10px 14px;border-bottom:1px solid var(--line);"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></div>`).join("")}
      </div>
      ${reporte.fallidos ? `<p style="margin:14px 0 0;color:#b45309;">Los registros fallidos permanecieron tanto en Firebase como en la caché local y pueden revisarse en una ejecución posterior.</p>` : ""}
      <p style="margin:14px 0 0;color:var(--muted);font-size:13px;">Este resumen queda guardado en este dispositivo hasta que se realice otra depuración.</p>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("cerrarResumenDepuracion30")?.addEventListener("click", cerrarPanelDepuracion30, { once:true });
}

async function depurarBaseRetencion30Dias() {
  if (currentUser?.role !== ROLES.ADMIN || !requirePerm("eliminar", "Solo ADMIN puede depurar la base.")) return;
  if (!navigator.onLine) {
    toast("Conexión requerida", "La depuración de 30 días solo puede ejecutarse con conexión a Firebase.", "warn", 5200);
    return;
  }
  if (!(await requireAdminPin("consultar y depurar registros mayores a 30 días"))) return;

  const RETENCION_DIAS = 30;
  const corte = new Date();
  corte.setHours(0, 0, 0, 0);
  corte.setDate(corte.getDate() - RETENCION_DIAS);
  const limiteTs = corte.getTime();
  const limiteFecha = localDateKeyFromTs(limiteTs);
  const PAGE_SIZE = 200;

  const QUERY_TIMEOUT_MS = 15000;
  async function consultarAntiguos(coleccion, campo, limiteValor, etiqueta){
    const rows = [];
    let cursor = null;
    let pagina = 0;
    do{
      pagina++;
      if(pagina > 100) throw new Error(`La consulta de ${etiqueta} superó el límite seguro de páginas.`);
      actualizarProgresoDepuracion30(`Consultando ${etiqueta}…`, `Página ${pagina} · ${rows.length} registros encontrados`);
      const parts = [where(campo, "<", limiteValor), orderBy(campo, "asc")];
      if(cursor) parts.push(startAfter(cursor));
      parts.push(limit(PAGE_SIZE));
      let timer = null;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Firebase tardó más de ${QUERY_TIMEOUT_MS / 1000} segundos al consultar ${etiqueta}.`)), QUERY_TIMEOUT_MS);
      });
      let snap;
      try{
        snap = await Promise.race([getDocs(query(collection(db, coleccion), ...parts)), timeout]);
      }finally{
        clearTimeout(timer);
      }
      snap.forEach(item => rows.push({ id:item.id, ...item.data(), _purgeCollection:coleccion }));
      cursor = snap.size === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null;
    }while(cursor);
    return rows;
  }

  async function consultarCampos(coleccion, etiqueta, campos){
    const lists = [];
    for(const [campo, limiteValor] of campos){
      lists.push(await consultarAntiguos(coleccion, campo, limiteValor, etiqueta));
    }
    return unirCandidatos(...lists);
  }

  function unirCandidatos(...lists){
    const map = new Map();
    lists.flat().forEach(row => map.set(`${row._purgeCollection}:${row.id}`, row));
    return Array.from(map.values());
  }

  function esVisitaCerrada(v){
    return [Status.FINALIZADO, Status.CANCELADO].includes(v.status) || Boolean(v.salidaTs || v.canceladoTs);
  }
  function esValeCerrado(v){
    return v.status === ValeStatus.REGRESO_CANCELADO || Boolean(v.regresoTs || v.finalizadoTs || v.canceladoTs || v.salidaSinRegresoFinalizadaTs);
  }
  function esRondinCerrado(r){
    return ["completado", "incompleto", "cancelado"].includes(String(r.status || "").toLowerCase()) && Boolean(r.finTs || r.canceladoTs);
  }
  function esRealmenteAntiguo(row, tipo){
    const ts = tipo === "vale" ? getValePurgeTs(row) : getRegistroPurgeTs(row);
    return typeof ts === "number" && ts < limiteTs;
  }

  mostrarProgresoDepuracion30("Revisando Firebase", "Consultando registros anteriores al periodo de retención…", "Preparando vista previa");

  let proveedores = [], visitantes = [], activos = [], personal = [], bitacora = [], rondines = [], eventos = [], resumenes = [];
  try{
    proveedores = await consultarCampos(COL_VISITAS, "citas de proveedores", [["fechaHoraTs", limiteTs], ["createdTs", limiteTs]]);
    visitantes = await consultarCampos(COL_VISITANTES, "citas de visitantes", [["fechaHoraTs", limiteTs], ["createdTs", limiteTs]]);
    activos = await consultarCampos(COL_VALES_ACTIVOS, "vales de activos", [["fecha", limiteFecha], ["createdTs", limiteTs]]);
    personal = await consultarCampos(COL_VALES_PERSONAL, "vales de personal", [["fecha", limiteFecha], ["createdTs", limiteTs]]);
    bitacora = await consultarCampos(COL_BITACORA, "bitácora", [["fecha", limiteFecha], ["createdTs", limiteTs]]);
    rondines = await consultarCampos(COL_RONDINERO_RONDINES, "rondines", [["createdTs", limiteTs]]);
    eventos = await consultarCampos(COL_RONDINERO_EVENTOS, "eventos de rondines", [["createdTs", limiteTs]]);
    resumenes = await consultarCampos(COL_RESUMEN_DIARIO, "resúmenes diarios", [["fecha", limiteFecha]]);
  }catch(error){
    cerrarPanelDepuracion30();
    console.error("No se pudo preparar la depuración:", error);
    const detalle = String(error?.message || "");
    toast("No se pudo revisar Firebase", detalle || cloudReadErrorMessage(error), "bad", 7200);
    return;
  }

  const accesosTodos = [...proveedores, ...visitantes].filter(row => esRealmenteAntiguo(row, "registro"));
  const accesosEliminar = accesosTodos.filter(esVisitaCerrada);
  const accesosProtegidos = accesosTodos.filter(row => !esVisitaCerrada(row));
  const activosTodos = activos.filter(row => esRealmenteAntiguo(row, "vale"));
  const activosEliminar = activosTodos.filter(esValeCerrado);
  const activosProtegidos = activosTodos.filter(row => !esValeCerrado(row));
  const personalTodos = personal.filter(row => esRealmenteAntiguo(row, "vale"));
  const personalEliminar = personalTodos.filter(esValeCerrado);
  const personalProtegidos = personalTodos.filter(row => !esValeCerrado(row));
  const bitacoraEliminar = bitacora.filter(row => esRealmenteAntiguo(row, "registro"));
  const rondinesTodos = rondines.filter(row => esRealmenteAntiguo(row, "registro"));
  const rondinesEliminar = rondinesTodos.filter(esRondinCerrado);
  const rondinesProtegidos = rondinesTodos.filter(row => !esRondinCerrado(row));
  const rondinesCerradosIds = new Set(rondinesEliminar.map(row => String(row.id)));
  const rondinesAbiertosIds = new Set(rondinesProtegidos.map(row => String(row.id)));
  const eventosAntiguos = eventos.filter(row => esRealmenteAntiguo(row, "registro"));
  const eventosEliminar = eventosAntiguos.filter(row => !row.rondinId || rondinesCerradosIds.has(String(row.rondinId)));
  const eventosProtegidos = eventosAntiguos.filter(row => row.rondinId && (rondinesAbiertosIds.has(String(row.rondinId)) || !rondinesCerradosIds.has(String(row.rondinId))));
  const fechasProtegidas = new Set(accesosProtegidos.map(getFechaKeyForPurge).filter(Boolean));
  const resumenesEliminar = resumenes.filter(row => row.fecha && !fechasProtegidas.has(String(row.fecha).slice(0,10)));
  const protegidosTotal = accesosProtegidos.length + activosProtegidos.length + personalProtegidos.length + rondinesProtegidos.length + eventosProtegidos.length;
  const eliminar = [...accesosEliminar, ...activosEliminar, ...personalEliminar, ...bitacoraEliminar, ...rondinesEliminar, ...eventosEliminar, ...resumenesEliminar];
  const encontradosTotal = accesosTodos.length + activosTodos.length + personalTodos.length + bitacoraEliminar.length + rondinesTodos.length + eventosAntiguos.length + resumenes.length;
  const detalleResumen = {
    proveedores: accesosEliminar.filter(row => row._purgeCollection === COL_VISITAS).length,
    visitantes: accesosEliminar.filter(row => row._purgeCollection === COL_VISITANTES).length,
    valesActivos: activosEliminar.length,
    valesPersonal: personalEliminar.length,
    bitacora: bitacoraEliminar.length,
    rondines: rondinesEliminar.length,
    eventos: eventosEliminar.length,
    resumenes: resumenesEliminar.length
  };

  if(!eliminar.length){
    const reporte = {
      fechaHora: new Date().toLocaleString(), estado:"sin_cambios", limiteFecha,
      encontrados:encontradosTotal, protegidos:protegidosTotal, confirmados:0, fallidos:0,
      detalle:detalleResumen
    };
    guardarResumenDepuracion30(reporte);
    mostrarResumenDepuracion30(reporte);
    return;
  }

  cerrarPanelDepuracion30();
  const proveedoresEliminar = detalleResumen.proveedores;
  const visitantesEliminar = detalleResumen.visitantes;
  const confirmacion = confirm(
    `VISTA PREVIA · RETENCIÓN DE ${RETENCION_DIAS} DÍAS\n\n` +
    `Se eliminarán únicamente registros cerrados anteriores al ${limiteFecha}:\n` +
    `• Proveedores finalizados/cancelados: ${proveedoresEliminar}\n` +
    `• Visitantes finalizados/cancelados: ${visitantesEliminar}\n` +
    `• Vales de activos finalizados/cancelados: ${activosEliminar.length}\n` +
    `• Vales de personal finalizados/cancelados: ${personalEliminar.length}\n` +
    `• Bitácora: ${bitacoraEliminar.length}\n` +
    `• Rondines cerrados: ${rondinesEliminar.length}\n` +
    `• Eventos de rondines cerrados: ${eventosEliminar.length}\n` +
    `• Resúmenes diarios sin accesos abiertos: ${resumenesEliminar.length}\n\n` +
    `TOTAL A ELIMINAR: ${eliminar.length}\n` +
    `REGISTROS ABIERTOS PROTEGIDOS: ${protegidosTotal}\n\n` +
    `No se borrarán usuarios, proveedores del catálogo, puntos QR, rutas ni registros abiertos.\n\n` +
    `¿Deseas continuar?`
  );
  if(!confirmacion) return;
  if(!navigator.onLine){
    toast("Conexión perdida", "No se eliminó ningún registro. Restablece Internet e inténtalo nuevamente.", "bad", 5200);
    return;
  }

  mostrarProgresoDepuracion30("Depurando Firebase", "Eliminando únicamente los registros cerrados confirmados en la vista previa…", `0 de ${eliminar.length}`);
  const confirmados = [];
  const fallidos = [];
  const BATCH_SIZE = 350;
  for(let i = 0; i < eliminar.length; i += BATCH_SIZE){
    const bloque = eliminar.slice(i, i + BATCH_SIZE);
    actualizarProgresoDepuracion30(`Procesando bloque ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(eliminar.length / BATCH_SIZE)}…`, `${confirmados.length} de ${eliminar.length} confirmados`);
    const batch = writeBatch(db);
    bloque.forEach(row => batch.delete(doc(db, row._purgeCollection, String(row.id))));
    try{
      await batch.commit();
      confirmados.push(...bloque);
      actualizarProgresoDepuracion30("Firebase confirmó el bloque más reciente.", `${confirmados.length} de ${eliminar.length} confirmados`);
    }catch(error){
      console.error(`Falló bloque de depuración ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
      fallidos.push(...bloque);
    }
  }

  const clavesConfirmadas = new Set(confirmados.map(row => `${row._purgeCollection}:${row.id}`));
  const fueEliminado = (coleccion, id) => clavesConfirmadas.has(`${coleccion}:${id}`);
  visitas = visitas.filter(row => !fueEliminado(colAcceso(row), row.id));
  valesActivos = valesActivos.filter(row => !fueEliminado(COL_VALES_ACTIVOS, row.id));
  valesPersonal = valesPersonal.filter(row => !fueEliminado(COL_VALES_PERSONAL, row.id));
  bitacoraGuardia = bitacoraGuardia.filter(row => !fueEliminado(COL_BITACORA, row.id));
  rondineroRondines = rondineroRondines.filter(row => !fueEliminado(COL_RONDINERO_RONDINES, row.id));
  rondineroEventos = rondineroEventos.filter(row => !fueEliminado(COL_RONDINERO_EVENTOS, row.id));

  for(const row of confirmados.filter(item => [COL_VISITAS, COL_VISITANTES].includes(item._purgeCollection))){
    if(row.ocFileKey) await idbDelDoc(row.ocFileKey).catch(() => {});
    if(row.facturaFileKey) await idbDelDoc(row.facturaFileKey).catch(() => {});
  }
  saveVisitasLocal();
  saveValesActivosLocal();
  saveValesPersonalLocal();
  saveBitacoraLocal();
  saveRondineroLocal();

  const reporte = {
    fechaHora:new Date().toLocaleString(), estado:fallidos.length ? "parcial" : "completa", limiteFecha,
    encontrados:encontradosTotal, protegidos:protegidosTotal,
    confirmados:confirmados.length, fallidos:fallidos.length, detalle:detalleResumen
  };
  guardarResumenDepuracion30(reporte);
  renderCurrentAfterDepuracion();
  mostrarResumenDepuracion30(reporte);
}
// -------------------------
// Auto-Sync dashboard (cada 5 min solo si está visible)
// -------------------------
let _autoSyncTimer = null;
const DASHBOARD_AUTO_REFRESH_MS = 5 * 60 * 1000;
function stopAutoSync(){
  if(_autoSyncTimer){ clearInterval(_autoSyncTimer); _autoSyncTimer = null; }
}
function startAutoSync(){
  stopAutoSync();
  if(!currentUser || currentUser.role === ROLES.PENDIENTE) return;
  if(!hasPerm("ver_dashboard_proveedores") && !hasPerm("ver_dashboard_visitantes")) return;
  _autoSyncTimer = setInterval(async ()=>{
    try{
      if(document.visibilityState !== 'visible') return;
      if(!isDashboardView()) return;
      updateNet();
      if(!navigator.onLine) return;
      await syncDay(new Date());
      await touchActiveSession(true);
      await pushRecentToCloud();
      if(isDashboardView()) renderActiveDashboard();
    }catch(e){}
  }, DASHBOARD_AUTO_REFRESH_MS);
}
window.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible' && currentUser && navigator.onLine){
    touchActiveSession(true).catch(()=>{});
  }

  if(document.visibilityState === 'visible' && currentUser && navigator.onLine && isDashboardView()){
    syncDay(new Date()).catch(()=>{});
    pushRecentToCloud().catch(()=>{});
  }
});

    async function saveVisitas(){
      if(!saveVisitasLocal()) return false;
      // nube best effort
      pushRecentToCloud();
      return true;
    }

    // -------------------------
    // Login / Logout UI
    // -------------------------
    const AUTH_TIMEOUT_MS = 12000;
    const PROFILE_TIMEOUT_MS = 10000;
    const PERMISSIONS_TIMEOUT_MS = 10000;
    let authFlowToken = 0;
    let authCredentialsTimedOut = false;
    let pendingAuthInlineError = "";

    function withAuthTimeout(promise, timeoutMs, code){
      let timer;
      return Promise.race([
        Promise.resolve(promise).finally(() => clearTimeout(timer)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), timeoutMs); })
      ]);
    }

    function setAuthProgress(stage, failed=false){
      const box = document.getElementById("authProgress");
      if(!box) return;
      box.hidden = false;
      const order = ["credentials","profile","permissions","authorized"];
      const activeIndex = order.indexOf(stage);
      box.querySelectorAll("[data-auth-stage]").forEach(step => {
        const index = order.indexOf(step.dataset.authStage);
        step.classList.toggle("done", !failed && index < activeIndex || (!failed && stage === "authorized" && index === activeIndex));
        step.classList.toggle("active", !failed && index === activeIndex && stage !== "authorized");
        step.classList.toggle("failed", failed && index === activeIndex);
      });
    }

    function clearAuthInlineError(){
      const errorBox = document.getElementById("authInlineError");
      if(errorBox){ errorBox.hidden = true; errorBox.textContent = ""; }
      document.querySelectorAll(".access-auth-form input").forEach(input => input.removeAttribute("aria-invalid"));
    }

    function showAuthInlineError(message, fieldId=""){
      const errorBox = document.getElementById("authInlineError");
      if(errorBox){
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.setAttribute("role","alert");
        errorBox.scrollIntoView({ block:"nearest", behavior:"smooth" });
      }
      if(fieldId) document.getElementById(fieldId)?.setAttribute("aria-invalid","true");
      const button = document.getElementById("btnLogin");
      if(button){ button.disabled = false; button.textContent = "Entrar"; }
    }

    function authErrorMessage(error){
      const code = String(error?.code || "").toLowerCase();
      if(code.includes("auth/invalid-credential") || code.includes("auth/wrong-password") || code.includes("auth/user-not-found")) return "El correo o la contraseña no son correctos. Verifica los datos e inténtalo nuevamente.";
      if(code.includes("auth/invalid-email")) return "El formato del correo electrónico no es válido.";
      if(code.includes("auth/user-disabled")) return "Esta cuenta está deshabilitada. Comunícate con el administrador.";
      if(code.includes("auth/too-many-requests")) return "Se realizaron demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
      if(code.includes("auth/network-request-failed")) return "No fue posible conectar con Firebase. Revisa Internet y vuelve a intentarlo.";
      if(code.includes("auth_timeout")) return "La validación de credenciales tardó demasiado. Revisa tu conexión y pulsa Entrar nuevamente.";
      if(code.includes("profile_timeout")) return "La consulta del perfil tardó demasiado. Revisa tu conexión y vuelve a intentarlo.";
      if(code.includes("permissions_timeout")) return "La carga de permisos tardó demasiado. Revisa tu conexión y vuelve a intentarlo.";
      return error?.message || "No fue posible completar el inicio de sesión.";
    }

    function setAuthShell(enabled){
      document.body.classList.toggle("auth-mode", Boolean(enabled));
      if(enabled) sbClose();
    }

    async function doLogout(){
      await touchActiveSession(false);
      stopAutoSync();
      try{ await signOut(auth); }catch{}
      localStorage.removeItem(LS_USER);
 sessionStorage.removeItem(PIN_SESSION_KEY);
 currentUser = null;
      paintHeader();
      renderLogin();
    }

    function paintHeader(){
  // Opción A: el header solo muestra estado/red, usuario y búsqueda.
  // Los botones de navegación viven en el sidebar.
  [...actionsBar.querySelectorAll("button[data-top], button[data-action]")].forEach(b => b.remove());
  const hamb = document.getElementById("btnHamb");
  if(!currentUser){
    userPill.style.display = "none";
    if(qSearch) qSearch.style.display = "none";
    if(hamb) hamb.style.display = "none";
    return;
  }
  if(hamb) hamb.style.display = "";
  const logoutBtn = document.createElement("button");
  logoutBtn.id = "btnLogoutTop";
  logoutBtn.type = "button";
  logoutBtn.dataset.top = "logout";
  logoutBtn.title = "Cerrar sesión";
  logoutBtn.setAttribute("aria-label", "Cerrar sesión");
  logoutBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="M14 8l4 4-4 4"/><path d="M8 12h10"/></svg>`;
  actionsBar.appendChild(logoutBtn);
  userPill.style.display = "";
  const dot = currentUser.role === ROLES.ADMIN ? "bad" : (currentUser.role === ROLES.PENDIENTE ? "warn" : "ok");
  userPill.innerHTML = `<span class="dot ${dot}"></span>${esc(currentUser.nombre)} • ${esc(String(currentUser.role||"").toUpperCase())}`;
  if(qSearch){
    qSearch.style.display = "";
    qSearch.placeholder = (currentUser.role === ROLES.PROVEEDOR)
    ? "Ingresa ID (del QR)..."
    : (isVisitanteOnlyRole() ? "Buscar visitante..." : "Buscar proveedor / visitante / empresa...");
  }
}

  function renderLogin(){
  const bootstrapEmail = document.getElementById("initialLoginEmail")?.value || "";
  const bootstrapPass = document.getElementById("initialLoginPass")?.value || "";
  setAuthShell(true);
  currentView = "login";
  dashboardSearchTerm = "";
  if(qSearch){
    qSearch.value = "";
    qSearch.style.display = "none";
  }
  userPill.style.display = "none";

  let isRegister = false;

  function render(){
    appEl.innerHTML = isRegister ? renderRegisterForm() : renderLoginForm();

    if(!isRegister && bootstrapEmail){
      const emailInput = document.getElementById("loginEmail");
      const passInput = document.getElementById("loginPass");
      if(emailInput) emailInput.value = bootstrapEmail;
      if(passInput) passInput.value = bootstrapPass;
    }

    if(!isRegister && pendingAuthInlineError){
      const message = pendingAuthInlineError;
      pendingAuthInlineError = "";
      showAuthInlineError(message);
    }

    const authThemeBtn = document.querySelector("[data-auth-theme]");
    const syncAuthTheme = () => {
      if(!authThemeBtn) return;
      const mode = document.documentElement.getAttribute("data-theme") || "dark";
      authThemeBtn.textContent = mode === "light" ? "☀" : "☾";
      authThemeBtn.title = mode === "light" ? "Tema claro. Cambiar a oscuro." : "Tema oscuro. Cambiar a claro.";
      authThemeBtn.setAttribute("aria-label", authThemeBtn.title);
    };
    syncAuthTheme();
    if(authThemeBtn) authThemeBtn.onclick = () => {
      toggleTheme();
      authThemeBtn.animate([{transform:"rotate(-30deg) scale(.7)"},{transform:"rotate(12deg) scale(1.15)"},{transform:"rotate(0) scale(1)"}],{duration:420,easing:"ease"});
      syncAuthTheme();
    };

    // ---- Eventos LOGIN ----
    const btnLogin = document.getElementById("btnLogin");
    ["loginEmail","loginPass"].forEach(id => document.getElementById(id)?.addEventListener("input", () => {
      clearAuthInlineError();
      const progress = document.getElementById("authProgress");
      if(progress) progress.hidden = true;
    }));

if (btnLogin) {

    btnLogin.onclick = async () => {

    const email = $("#loginEmail").value.trim();
    const pass  = $("#loginPass").value.trim();

    if (!email || !pass) {
      return toast(
        "Faltan datos",
        "Correo y contraseña",
        "warn"
      );
    }

    clearAuthInlineError();
    const flowToken = ++authFlowToken;
    authCredentialsTimedOut = false;
    setAuthProgress("credentials");
    btnLogin.disabled = true;
    btnLogin.textContent = "Validando…";
    let credentialsAccepted = false;

    try {
      await withAuthTimeout(signInWithEmailAndPassword(auth, email, pass), AUTH_TIMEOUT_MS, "AUTH_TIMEOUT");
      if(flowToken !== authFlowToken) return;
      credentialsAccepted = true;
      setAuthProgress("profile");

    } catch (error) {
      console.error("Error de login:", error);
      authCredentialsTimedOut = String(error?.code || "").toUpperCase().includes("AUTH_TIMEOUT");
      authFlowToken++;
      if(authCredentialsTimedOut && auth.currentUser) signOut(auth).catch(()=>{});
      setAuthProgress("credentials", true);
      showAuthInlineError(authErrorMessage(error), String(error?.code || "").includes("invalid-email") ? "loginEmail" : "");

    } finally {
      if(!credentialsAccepted && btnLogin.isConnected){ btnLogin.disabled = false; btnLogin.textContent = "Entrar"; }

    }

  };

}

    // ---- Eventos REGISTRO ----
    const btnCreate = document.getElementById("btnCreate");
    if(btnCreate){
      btnCreate.onclick = async () => {
        const data = {
          nombre: $("#regNombre").value.trim(),
          empresa: $("#regEmpresa").value.trim(),
          telefono: $("#regTelefono").value.trim(),
          area: $("#regArea").value.trim(),
          email: $("#regEmail").value.trim(),
          pass: $("#regPass").value.trim(),
        };

        if(!data.nombre || !data.empresa || !data.email || !data.pass){
          return toast(
            "Faltan datos",
            "Nombre, empresa, correo y contraseña obligatorios",
            "warn"
          );
        }

        const cred = await createUserWithEmailAndPassword(auth, data.email, data.pass);

        await setDoc(doc(db, COL_USERS, cred.user.uid), {
          uid: cred.user.uid,
          email: data.email,
          nombre: data.nombre,
          empresa: data.empresa,
          telefono: data.telefono || "",
          area: data.area || "",
          role: ROLES.PENDIENTE,
          aprobado: false,
          solicitadoTs: Date.now(),
          createdAt: serverTimestamp(),
          ...userProfileAudit("crear_perfil_registro", cred.user)
        });

        toast("Registro enviado","Cuenta pendiente de aprobación","ok",3000);
        isRegister = false;
        render();
      };
    }

    // ---- Cambiar vista ----
    document.querySelectorAll("[data-switch]").forEach(b=>{
      b.onclick = () => {
        isRegister = !isRegister;
        render();
      };
    });
  }

  render();
}

function renderLoginForm(){
  return `
  <section class="access-auth-view">
    <article class="access-auth-card">
      <div class="access-auth-brand">
        <button class="auth-theme-toggle" type="button" data-auth-theme aria-label="Cambiar tema">☾</button>
        <div class="access-auth-brand-content">
          <img class="access-auth-shield" src="icon-shield-master.png" alt="Escudo de Caborca Access Control">
          <div class="access-auth-brand-name"><span>Caborca</span><span>Access Control</span></div>
          <p class="access-auth-brand-copy">Control seguro para proveedores, visitantes, vales de salida y rondines.</p>
          <div class="access-auth-features"><span>Acceso seguro</span><span>Control centralizado</span><span>Operación móvil</span></div>
        </div>
      </div>

      <div class="access-auth-form">
        <h2>Iniciar sesión</h2>
        <p class="auth-intro">Ingresa tus datos para acceder a Caborca Access Control.</p>
        <label>Correo electrónico</label>
        <input id="loginEmail" type="email" autocomplete="email" />

        <label>Contraseña</label>
        <input id="loginPass" type="password" autocomplete="current-password" />

        <button id="btnLogin">Entrar</button>
        <div id="authProgress" class="auth-progress" hidden aria-live="polite">
          <div class="auth-progress-step" data-auth-stage="credentials">Cargando credenciales…</div>
          <div class="auth-progress-step" data-auth-stage="profile">Validando perfil…</div>
          <div class="auth-progress-step" data-auth-stage="permissions">Validando permisos…</div>
          <div class="auth-progress-step" data-auth-stage="authorized">Acceso autorizado</div>
        </div>
        <div id="authInlineError" class="auth-inline-error" hidden></div>
        <p class="auth-admin-help">Si no puedes entrar, ponte en contacto con el administrador.<br><a href="./diagnostico.html">Abrir diagnóstico del dispositivo</a></p>

        <p class="access-auth-switch">
          ¿No tienes cuenta?
          <b data-switch>Agregar cuenta</b>
        </p>
      </div>
    </article>
  </section>
  `;
}

function renderRegisterForm(){
  return `
  <section class="access-auth-view">
    <article class="access-auth-card">
      <div class="access-auth-brand">
        <button class="auth-theme-toggle" type="button" data-auth-theme aria-label="Cambiar tema">☾</button>
        <div class="access-auth-brand-content">
          <img class="access-auth-shield" src="icon-shield-master.png" alt="Escudo de Caborca Access Control">
          <div class="access-auth-brand-name"><span>Caborca</span><span>Access Control</span></div>
          <p class="access-auth-brand-copy">Solicita una cuenta; un administrador revisará y asignará tu acceso.</p>
          <div class="access-auth-features"><span>Registro protegido</span><span>Permisos por rol</span></div>
        </div>
      </div>

      <div class="access-auth-form">
        <h2>Agregar cuenta</h2>
        <p class="auth-intro">Completa la información requerida para solicitar acceso.</p>
        <label>Nombre completo *</label>
        <input id="regNombre" autocomplete="name" />

        <label>Empresa / Proveedor *</label>
        <input id="regEmpresa" />

        <label>Teléfono</label>
        <input id="regTelefono" autocomplete="tel" />

        <label>Área</label>
        <input id="regArea" />

        <label>Correo electrónico *</label>
        <input id="regEmail" type="email" autocomplete="email" />

        <label>Contraseña *</label>
        <input id="regPass" type="password" autocomplete="new-password" />

        <button id="btnCreate">Crear cuenta pendiente</button>

        <p class="access-auth-switch">
          ¿Ya tienes cuenta?
          <b data-switch>Iniciar sesión</b>
        </p>
      </div>
    </article>
  </section>
  `;
}
// -------------------------
    // Views: Pendiente / Dashboard  / Historial
    // -------------------------
    function getCounts(list){
      return {
        programados: list.filter(v => v.status === Status.PROGRAMADO),
        llegados: list.filter(v => v.status === Status.LLEGADO),
        dentro: list.filter(v => v.status === Status.DENTRO),
        despachados: list.filter(v => v.status === Status.DESPACHADO),
        finalizados: list.filter(v => v.status === Status.FINALIZADO),
      };
    }

    function renderPendiente(){
  currentView = "pendiente";
  appEl.innerHTML = `
    <div class="card" style="max-width:520px;margin:50px auto;text-align:center;">
      <div class="logo" style="margin:0 auto 14px;">⏳</div>

      <h2 style="margin:0 0 8px;">Tu solicitud está en revisión</h2>

      <p style="margin:0;color:var(--muted);font-size:13px;">
        Un administrador debe validar tu información y asignarte un rol.
      </p>

      <div class="divider"></div>

      <div class="pill" style="justify-content:center;margin-bottom:10px;">
        <span class="dot warn"></span>
        Estado: <b style="margin-left:6px;">PENDIENTE</b>
      </div>

      <p style="margin:0;color:var(--muted);font-size:12px;">
        Este proceso suele ser rápido.  
        Si ya pasó un tiempo, contacta al administrador.
      </p>

      <div class="divider"></div>

      <button class="secondary" data-action="logout">Cerrar sesión</button>
    </div>
  `;
}
    function qrRetrasoAutorizado(v){
      if(!v || typeof v.fechaHoraTs !== "number") return false;
      const limiteTs = v.fechaHoraTs + (qrLateBlockMin(v) * 60 * 1000);
      return typeof v.qrReactivadoTs === "number" && v.qrReactivadoTs >= limiteTs;
    }
    function bloquearProveedorAntesDeVentana(v, nowTs = Date.now()){
      if(!v || isVisitante(v) || typeof v.fechaHoraTs !== "number") return false;
      const habilitadoTs = v.fechaHoraTs - (QR_EARLY_BLOCK_MIN * 60 * 1000);
      if(nowTs >= habilitadoTs) return false;
      const hora = new Date(habilitadoTs).toLocaleTimeString("es-MX", { hour:"2-digit", minute:"2-digit" });
      toast("Cita aún no habilitada",`El acceso estará disponible 15 minutos antes, a las ${hora}.`,"warn",4600);
      rememberModuleReturnForVisita(v);
      renderVisitaReturnDashboard();
      return true;
    }
    function qrInactivoPorImpuntualidad(v){
      if(!v || v.status !== Status.PROGRAMADO) return false;
      if(isVisitante(v)) return false;
      if(typeof v.fechaHoraTs !== "number") return false;
      const limiteTs = v.fechaHoraTs + (qrLateBlockMin(v) * 60 * 1000);
      if(qrRetrasoAutorizado(v)) return false;
      if(v.qrDesactivadoMotivo === "RETRASO") return true;
      return Date.now() > limiteTs;
    }
    function citaBloqueadaPorRetraso(v){
      return qrInactivoPorImpuntualidad(v);
    }

    function fechaCreacionCita(v){
      if(!v) return "-";
      if(typeof v.createdTs === "number") return new Date(v.createdTs).toLocaleString();
      if(v.createdAt?.toDate) return v.createdAt.toDate().toLocaleString();
      if(typeof v.createdAt?.seconds === "number") return new Date(v.createdAt.seconds * 1000).toLocaleString();
      if(v.createdAt) return new Date(v.createdAt).toLocaleString();
      return "-";
    }

    function creadorCitaNombre(v){
      const savedName = String(v?.createdByName || v?.createdByNombre || "").trim();
      if(savedName) return savedName;
      return String(v?.createdByEmail || v?.createdByUid || "-").trim() || "-";
    }

    function kanbanTimestamp(value){
      if(typeof value === "number" && Number.isFinite(value)) return value;
      if(value?.toMillis) return Number(value.toMillis()) || 0;
      if(typeof value?.seconds === "number") return value.seconds * 1000;
      if(value){ const parsed = new Date(value).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
      return 0;
    }

    function kanbanDateTime(ts){
      const n = kanbanTimestamp(ts);
      return n ? new Date(n).toLocaleString("es-MX", { dateStyle:"medium", timeStyle:"short" }) : "";
    }

    function visitaKanbanEvents(v={}){
      const events=[];
      const push=(ts,title,detail="")=>{ const n=kanbanTimestamp(ts); if(n) events.push({ts:n,title,detail}); };
      push(v.createdTs || v.createdAt, isVisitante(v) ? "Visita generada" : "Cita generada", creadorCitaNombre(v));
      push(v.autorizacionTs, v.autorizacionEstado === "rechazada" ? "Solicitud rechazada" : "Solicitud autorizada", v.autorizacionPorNombre || v.autorizacionPorEmail || "");
      push(v.llegadaTs, "Llegada registrada", "Lectura de QR");
      push(v.entradaTs, "Entrada registrada", v.guardNombre || "Guardia no registrado");
      push(v.dictamen?.ts, "Despacho / dictamen", v.dictamen?.por || "Calidad no registrada");
      push(v.salidaTs, "Salida y finalización", v.salidaPor || "Usuario no registrado");
      push(v.canceladoTs, "Cita cancelada", v.canceladoPor || "Usuario no registrado");
      return events.sort((a,b)=>a.ts-b.ts);
    }

    function renderKanbanDetailsButton(){
      return `<button type="button" class="secondary kanban-details-toggle" data-action="toggleKanbanDetails" data-no-sb="true" aria-expanded="false" aria-label="Mostrar detalles de movimientos" title="Detalles de movimientos">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
      </button>`;
    }

    function renderKanbanMovementPanel(events=[], hidden=true){
      const list = Array.isArray(events) ? events : [];
      return `
        <div class="kanban-movement-details" data-action="kanbanDetailsNoop" data-no-sb="true" ${hidden ? "hidden" : ""}>
          ${list.length ? `<ol class="kanban-movement-list">${list.map(event=>`
            <li class="kanban-movement-item"><div><strong>${esc(event.title)}</strong><small>${esc(kanbanDateTime(event.ts))}${event.detail ? ` · ${esc(event.detail)}` : ""}</small></div></li>
          `).join("")}</ol>` : `<small style="color:var(--muted)">Aún no hay movimientos registrados.</small>`}
        </div>`;
    }

    function toggleKanbanDetails(button){
      const card = button?.closest(".provider-kanban-card,.vale-personal-card");
      const panel = card?.querySelector(".kanban-movement-details");
      if(!panel) return;
      const expand = panel.hidden;
      panel.hidden = !expand;
      button.setAttribute("aria-expanded", String(expand));
      button.setAttribute("aria-label", expand ? "Ocultar detalles de movimientos" : "Mostrar detalles de movimientos");
      button.title = expand ? "Ocultar detalles" : "Detalles de movimientos";
    }

    function pillCitaCreada(v){
      const creador = creadorCitaNombre(v);
      return `
        <span class="pill pill-multiline">
          <span style="display:grid; gap:4px; min-width:0;">
            <span style="display:flex; align-items:flex-start; gap:7px; min-width:0;">
              <span class="dot info" style="margin-top:4px; flex:0 0 auto;"></span>
              <span>Cita creada: ${esc(fechaCreacionCita(v))}</span>
            </span>
            ${creador && creador !== "-" ? `
              <span style="display:flex; align-items:flex-start; gap:7px; min-width:0;">
                <span class="dot brand" style="margin-top:4px; flex:0 0 auto;"></span>
                <span>Creada por: ${esc(creador)}</span>
              </span>
            ` : ""}
          </span>
        </span>
      `;
    }

    function buscarCitaPorId(id){
      return visitas.find(x => String(x.id) === String(id)) || _comprasCache.find(x => String(x.id) === String(id));
    }

    function bloquearAccionCitaRetrasada(id, actionLabel="esta acción"){
      const v = buscarCitaPorId(id);
      if(!citaBloqueadaPorRetraso(v)) return false;
      toast(
        "Cita bloqueada",
        `No se puede ${actionLabel}. Reactiva el QR desde ADMIN para desbloquear la cita.`,
        "bad",
        4200
      );
      return true;
    }
    async function resolverAutorizacionVisita(id, autorizar){
      const v = buscarCitaPorId(id);
      if(!v || v.status !== Status.PENDIENTE_AUTORIZACION){
        toast("Solicitud no disponible", "La visita ya fue atendida o no existe.", "warn", 3200);
        return;
      }
      const esSolicitudVisitante = isVisitante(v);
      const puedeResolverVisitante = esSolicitudVisitante && [ROLES.ADMIN,ROLES.RECEPCIONISTA].includes(currentUser?.role);
      const puedeResolverProveedor = !esSolicitudVisitante && currentUser?.role === ROLES.COMPRAS;
      if(!puedeResolverVisitante && !puedeResolverProveedor){
        toast("Acceso denegado",
          esSolicitudVisitante ? "Sólo Administrador o Recepcionista puede autorizar visitantes." : "Sólo Compras puede autorizar proveedores.",
          "bad", 3200);
        return;
      }
      const accion = autorizar ? "autorizar esta solicitud" : "rechazar esta solicitud";
      const pinValido = esSolicitudVisitante && currentUser?.role === ROLES.ADMIN ? await requireAdminPin(accion) : await requireUserPin(accion);
      if(!pinValido) return;
      if(!autorizar && !confirm(`¿Rechazar la solicitud de "${getNombreAcceso(v)}"?`)) return;

      const estadoAnterior = v.status;
      const ahora = Date.now();
      v.status = autorizar ? Status.PROGRAMADO : Status.CANCELADO;
      v.qrActivo = Boolean(autorizar);
      v.autorizacionEstado = autorizar ? "autorizada" : "rechazada";
      v.autorizacionTs = ahora;
      v.autorizacionPorUid = currentUser.uid;
      v.autorizacionPorEmail = currentUser.email || "";
      v.autorizacionPorNombre = currentUser.nombre || "";
      v.autorizacionPorRol = currentUser.role;
      v.updatedTs = ahora;
      registrarCambio(v, "status", estadoAnterior, v.status, autorizar ? "autorizar" : "rechazar");

      try{
        saveVisitasLocal();
        await cloudUpsertVisita(v);
        toast(autorizar ? "Visita autorizada" : "Visita rechazada",
          autorizar ? "La cita quedó programada y su QR está activo." : "La solicitud fue rechazada.",
          autorizar ? "ok" : "warn", 3200);
        renderActiveDashboard();
      }catch(e){
        console.error(e);
        v.status = estadoAnterior;
        v.qrActivo = false;
        saveVisitasLocal();
        toast("No se pudo guardar", e?.message || "Revisa conexión y permisos.", "bad", 4200);
      }
    }

    function renderDashboardHoy(tipoDashboard = getActiveDashboardTipo()){
      const dashboardTipo = normalizeDashboardTipo(tipoDashboard);
      const dashboardPerm = dashboardTipo === "visitantes" ? "ver_dashboard_visitantes" : "ver_dashboard_proveedores";
      if(!requirePerm(dashboardPerm,"Tu rol no puede ver este dashboard.")) return;
      currentView = dashboardTipo === "visitantes" ? "dashboard_visitantes" : "dashboard_proveedores";
      rememberModuleReturn(currentView);
      try{ setActiveSb(currentView); }catch{}

      const today = new Date();
      const term = (dashboardSearchTerm || "").trim().toLowerCase();
      const dashboardTitle = dashboardTipo === "visitantes" ? "Visitantes" : "Proveedores";
      const modernDashboard = true;
      const dashboardHeroIcon = dashboardTipo === "visitantes" ? "👥" : "🚚";
      const dashboardHeroTitle = dashboardTipo === "visitantes" ? "Dashboard de visitantes" : "Proveedores";
      const dashboardHeroText = dashboardTipo === "visitantes"
        ? "Registro, seguimiento y permanencia de visitantes en planta."
        : "Control de citas, llegadas y permanencia en planta.";
      const searchPlaceholder = dashboardTipo === "visitantes"
        ? "Buscar visitante, empresa o anfitrión..."
        : "Buscar proveedor, empresa o material...";

      // ✅ SOLO HOY: filtra por fechaHoraTs
     const todayList = visitas
  .filter(v =>
    typeof v.fechaHoraTs === "number" &&
    isSameDay(v.fechaHoraTs, today) &&
    v.status !== Status.CANCELADO &&
    canSeeVisita(v) &&
    dashboardTipoMatches(v, dashboardTipo)
  )
  // ✅ ORDEN POR HORARIO: de más temprano a más tarde
  .sort((a, b) => a.fechaHoraTs - b.fechaHoraTs);


      const filtered = !term ? todayList : todayList.filter(v =>
        getSearchTextVisita(v).includes(term)
      );
      const pendingAuth = filtered.filter(v => v.status === Status.PENDIENTE_AUTORIZACION);
      const boardList = dashboardPendingOnly ? pendingAuth : filtered.filter(v => v.status !== Status.PENDIENTE_AUTORIZACION);

      const { programados, llegados, dentro, despachados, finalizados } = getCounts(boardList);
      const resumenDashboard = getCounts(filtered);
      const showDespachados = dashboardTipo !== "visitantes";

      const scanBtn = hasPerm("escanear_qr") ? `
        <button class="secondary"
                data-action="scan"
                data-from="${esc(currentView)}">
          Escanear QR
        </button>
      ` : "";

      const dashboardMobileStatus = dashboardTipo === "proveedores" ? providerDashboardMobileStatus : visitorDashboardMobileStatus;
      const col = (title, dotClass, items, stageKey="") => `
        <div class="col ${modernDashboard ? "provider-stage" : ""} ${dashboardMobileStatus === stageKey ? "active" : ""}" data-stage="${esc(stageKey)}">
          ${modernDashboard ? `
            <div class="provider-stage-head"><span class="provider-stage-dot" aria-hidden="true"></span><span>${esc(title)}</span><span class="provider-stage-count">${items.length}</span></div>
            <div class="provider-stage-list">
              ${items.length ? items.map(card).join("") : `<div class="provider-empty"><span class="provider-empty-icon" aria-hidden="true">${stageKey === "programados" ? "▣" : stageKey === "llegados" ? "▤" : stageKey === "dentro" ? "⌂" : stageKey === "despachados" ? "□" : "✓"}</span><strong>Sin registros</strong><span>${stageKey === "programados" ? "No hay citas programadas en este alcance." : "Los registros aparecerán aquí al avanzar en el proceso."}</span></div>`}
            </div>
          ` : `
          
<div class="card">
  <div class="title">
    <span class="dot ${dotClass}" style="margin-right:8px;"></span>
    ${esc(title)}
  </div>

  <div class="big">${items.length}</div>
</div>

          <br>
          ${items.length ? items.map(card).join("") : `<div style="color:var(--muted);font-size:12px;">Sin registros</div>`}
          `}
        </div>
      `;

      function card(v){
        const cita = v.fechaHora ? new Date(v.fechaHora).toLocaleString() : "-";
        const tipo = getTipoVisita(v);
        const tipoLabel = getTipoVisitaLabel(v);
        const nombreAcceso = getNombreAcceso(v);
        const empresaAcceso = getEmpresaAcceso(v);
        const dict = (v.dictamen?.estado || "pendiente").toLowerCase();
        const dictLabel = (v.dictamen?.estado || "pendiente").toUpperCase();
        const incKey = (v.dictamen?.incidencia || "").trim();
const INC_LABEL = {
  "SIN_INCIDENCIAS": "Sin Incidencias",
  "ERROR_ADMINISTRATIVO": "ERROR ADMINISTRATIVO",
  "SIN_DOCUMENTOS": "SIN DOCUMENTOS",
  "FALTANTES": "FALTANTES",
  "EXCEDENTES": "EXCEDENTES",
  "FUERA_DE_ESPECIFICACION": "FUERA DE ESPECIFICACIÓN"
};
const incLabel = INC_LABEL[incKey] || "";
const showInc = !!incLabel && incKey !== "SIN_INCIDENCIAS";
        const qrVencido = qrInactivoPorImpuntualidad(v);
        let docColor="bad";
        if(v.ocNo && v.facturaNo) docColor="ok";
        else if(v.ocNo || v.facturaNo) docColor="warn";
        if(dashboardTipo === "visitantes"){
          const statusMeta = {
            [Status.PROGRAMADO]: ["Programado","programado"],
            [Status.LLEGADO]: ["Llegó","llegado"],
            [Status.DENTRO]: ["Dentro","dentro"],
            [Status.FINALIZADO]: ["Finalizado","finalizado"],
            [Status.PENDIENTE_AUTORIZACION]: ["","pendiente"]
          }[v.status] || [String(v.status || "Registro"),""];
          const visitorName = getVisitanteResumen(v) || nombreAcceso;
          const initials = visitorName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0)).join("").toUpperCase() || "VI";
          const horaCita = typeof v.fechaHoraTs === "number" ? new Date(v.fechaHoraTs).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) : "Sin hora";
          const createdDate = typeof v.createdTs === "number" ? new Date(v.createdTs) : v.createdAt?.toDate ? v.createdAt.toDate() : typeof v.createdAt?.seconds === "number" ? new Date(v.createdAt.seconds * 1000) : v.createdAt ? new Date(v.createdAt) : null;
          const createdTime = createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) : "";
          const creatorName = creadorCitaNombre(v);
          return `
            <article class="tarjeta history-card provider-visit-card provider-kanban-card visitor-kanban-card status-${esc(statusMeta[1])} ${getModalidadVisitanteClass(v)}" data-action="ficha" data-id="${esc(v.id)}" tabindex="0" aria-label="Abrir detalle de ${esc(visitorName)}">
              <div class="provider-card-top">
                <span class="provider-avatar" aria-hidden="true">${esc(initials)}</span>
                <span class="provider-card-name"><strong>${esc(visitorName)}</strong><small>${esc(empresaAcceso || "Visitante")}</small></span>
                ${statusMeta[0] ? `<span class="provider-state-chip">${esc(statusMeta[0])}</span>` : ""}
              </div>
              <div class="provider-card-ops">
                <span title="Hora de cita">◷ &nbsp;<b>${esc(horaCita)}</b></span>
                <span title="Persona o área visitada">⌖ &nbsp;${esc(v.visitaA || v.area || "Recepción")}</span>
              </div>
              ${createdTime || (creatorName && creatorName !== "-") ? `<div class="provider-card-created">Creada${createdTime ? ` ${esc(createdTime)}` : ""}${creatorName && creatorName !== "-" ? ` · ${esc(creatorName)}` : ""}</div>` : ""}
              <div class="provider-card-secondary">
                ${v.motivo ? `<span class="provider-mini-pill">${esc(v.motivo)}</span>` : ""}
                <span class="provider-mini-pill modalidad-${esc(getModalidadVisitante(v))}">${esc(getModalidadVisitanteLabel(v))}</span>
                ${v.gafeteNo ? `<span class="provider-mini-pill">Gafete ${esc(v.gafeteNo)}</span>` : ""}
                ${v.status === Status.LLEGADO ? liveTimePill("Espera", v.llegadaTs, 0, true) : ""}
                ${v.status === Status.DENTRO ? liveTimePill("Dentro", v.entradaTs, 0, false) : ""}
                ${v.incidenciasSalida ? `<span class="provider-mini-pill alert">Incidencia</span>` : ""}
                <span class="provider-card-actions">${renderKanbanDetailsButton()}<button class="secondary" data-action="ficha" data-id="${esc(v.id)}" data-no-sb="true" aria-label="Ver ficha" title="Ver ficha">◉</button></span>
              </div>
              ${renderKanbanMovementPanel(visitaKanbanEvents(v))}
              ${v.status === Status.LLEGADO && hasPerm("registrar_entrada") ? `<button class="ok" data-action="entrada" data-id="${esc(v.id)}" data-no-sb="true" style="margin-top:9px;width:100%">Dar acceso</button>` : ""}
              ${v.status === Status.PENDIENTE_AUTORIZACION && [ROLES.ADMIN,ROLES.RECEPCIONISTA].includes(currentUser?.role) ? `<div class="row" style="margin-top:9px"><button class="ok" data-action="autorizarVisita" data-id="${esc(v.id)}" data-no-sb="true">Autorizar</button><button class="bad" data-action="rechazarVisita" data-id="${esc(v.id)}" data-no-sb="true">Rechazar</button></div>` : ""}
            </article>`;
        }
        if(dashboardTipo === "proveedores"){
          const statusMeta = {
            [Status.PROGRAMADO]: ["Programado","programado"],
            [Status.LLEGADO]: ["Llegó","llegado"],
            [Status.DENTRO]: ["Dentro","dentro"],
            [Status.DESPACHADO]: ["Despachado","despachado"],
            [Status.FINALIZADO]: ["Finalizado","finalizado"],
            [Status.PENDIENTE_AUTORIZACION]: ["Pendiente","pendiente"]
          }[v.status] || [String(v.status || "Registro"),""];
          const initials = nombreAcceso.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0)).join("").toUpperCase() || "PR";
          const horaCita = typeof v.fechaHoraTs === "number" ? new Date(v.fechaHoraTs).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) : "Sin hora";
          const docsLabel = v.ocNo && v.facturaNo ? "Docs completos" : v.ocNo || v.facturaNo ? "Docs parciales" : "Docs pendientes";
          const createdDate = typeof v.createdTs === "number" ? new Date(v.createdTs) : v.createdAt?.toDate ? v.createdAt.toDate() : typeof v.createdAt?.seconds === "number" ? new Date(v.createdAt.seconds * 1000) : v.createdAt ? new Date(v.createdAt) : null;
          const createdTime = createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}) : "";
          const creatorName = creadorCitaNombre(v);
          const dictamenLabel = dict === "pendiente" ? "Dictamen pendiente" : `Dictamen ${dictLabel.toLowerCase()}`;
          return `
            <article class="tarjeta history-card provider-visit-card provider-kanban-card status-${esc(statusMeta[1])} ${qrVencido ? "qr-vencido" : ""}" data-action="ficha" data-id="${esc(v.id)}" tabindex="0" aria-label="Abrir detalle de ${esc(nombreAcceso)}">
              ${qrVencido ? `<div class="qr-banda-inactivo">QR inactivo por retraso</div>` : ""}
              <div class="provider-card-top">
                <span class="provider-avatar" aria-hidden="true">${esc(initials)}</span>
                <span class="provider-card-name"><strong>${esc(nombreAcceso)}</strong><small>${esc(empresaAcceso || tipoLabel)}</small></span>
                <span class="provider-state-chip">${esc(statusMeta[0])}</span>
              </div>
              <div class="provider-card-ops">
                <span title="Hora de cita">◷ &nbsp;<b>${esc(horaCita)}</b></span>
                <span title="Área de destino">⌖ &nbsp;${esc(v.area || "Área no indicada")}</span>
              </div>
              ${createdTime || (creatorName && creatorName !== "-") ? `<div class="provider-card-created" title="${esc(`Cita creada: ${fechaCreacionCita(v)} · ${creatorName}`)}">Creada${createdTime ? ` ${esc(createdTime)}` : ""}${creatorName && creatorName !== "-" ? ` · ${esc(creatorName)}` : ""}</div>` : ""}
              ${v.status === Status.DENTRO ? `<div class="provider-card-secondary">${liveTimePill("Dentro", v.entradaTs, 0, false)}</div>` : ""}
              <div class="provider-card-secondary">
                ${v.ocNo ? `<span class="provider-mini-pill" title="Orden de compra">▧ OC ${esc(v.ocNo)}</span>` : ""}
                <span class="provider-mini-pill ${docColor === "ok" ? "" : "alert"}">${docColor === "ok" ? "✓" : "!"} ${esc(docsLabel)}</span>
                <span class="provider-mini-pill ${dict === "pendiente" ? "alert" : dict === "aprobado" ? "success" : ""}">${dict === "aprobado" ? "✓" : dict === "pendiente" ? "◷" : "!"} ${esc(dictamenLabel)}</span>
                ${showInc ? `<span class="provider-mini-pill alert">! ${esc(incLabel)}</span>` : ""}
                ${v.materialRecibir ? `<span class="provider-mini-pill" title="Material">${esc(v.materialRecibir)}</span>` : ""}
                <span class="provider-card-actions">${v.status === Status.PROGRAMADO ? `<button class="secondary" data-action="verQR" data-id="${esc(v.id)}" data-no-sb="true" aria-label="Ver QR" title="Ver QR"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><rect x="3" y="3" width="6" height="6" rx="1"></rect><rect x="15" y="3" width="6" height="6" rx="1"></rect><rect x="3" y="15" width="6" height="6" rx="1"></rect><path d="M15 15h2v2h-2zM19 15h2v4h-2M15 19h2v2h-2M19 21h2"></path></svg></button>` : ""}${renderKanbanDetailsButton()}<button class="secondary" data-action="ficha" data-id="${esc(v.id)}" data-no-sb="true" aria-label="Ver ficha" title="Ver ficha">◉</button></span>
              </div>
              ${renderKanbanMovementPanel(visitaKanbanEvents(v))}
              ${v.status === Status.PENDIENTE_AUTORIZACION && currentUser?.role === ROLES.COMPRAS ? `<div class="row" style="margin-top:9px"><button class="ok" data-action="autorizarVisita" data-id="${esc(v.id)}" data-no-sb="true">Autorizar</button><button class="bad" data-action="rechazarVisita" data-id="${esc(v.id)}" data-no-sb="true">Rechazar</button></div>` : ""}
              ${qrVencido && currentUser?.role === ROLES.ADMIN ? `<button class="secondary" data-action="reactivar" data-id="${esc(v.id)}" data-no-sb="true" style="margin-top:9px;width:100%">Reactivar</button>` : ""}
            </article>`;
        }
        return `
          <div class="tarjeta history-card ${modernDashboard ? "provider-visit-card" : ""} tipo-${esc(tipo)} ${getModalidadVisitanteClass(v)} ${qrVencido ? "qr-vencido" : ""}" data-action="ficha" data-id="${esc(v.id)}">
            ${qrVencido ? `<div class="qr-banda-inactivo">QR inactivo por retraso</div>` : ""}
            <strong>${esc(isVisitante(v) ? getVisitanteResumen(v) : nombreAcceso)}</strong>
            <small>${esc(empresaAcceso || tipoLabel)}</small>
            <div class="meta">
              <span class="pill"><span class="dot brand"></span>ID: ${esc(v.id)}</span>
              <span class="pill"><span class="dot ${tipo === "visitante" ? "brand" : "info"}"></span>${esc(tipoLabel)}</span>
              ${isVisitante(v) ? renderModalidadVisitantePill(v) : ""}
              ${tipo === "proveedor" ? `<span class="pill"><span class="dot info"></span>${esc(v.area || "Área")}</span>` : ""}
              <span class="pill"><span class="dot warn"></span>${esc(cita)}</span>
              ${pillCitaCreada(v)}
              ${renderVisitanteExtraPills(v)}
              ${v.status === Status.PENDIENTE_AUTORIZACION ? `<span class="pill warn"><span class="dot warn"></span>Pendiente autorización</span>` : ""}
              ${tipo === "proveedor" ? `<span class="pill"><span class="dot ${docColor}"></span>Docs</span>` : ""}
              ${v.ocNo ? `
  <span class="pill oc-pill" title="Orden de Compra">
    <span class="dot info"></span>
    OC: ${esc(v.ocNo)}
  </span>
` : ""}
              ${v.materialRecibir ? `
  <span class="pill material-pill" title="Material a recibir">
    <span class="dot info"></span>
    ${esc(v.materialRecibir)}
  </span>
` : ""}
              ${tipo === "proveedor" ? `<span class="badge-dictamen ${esc(dict)}">
  <span class="bdot"></span> ${esc(dictLabel)}
</span>
${incLabel ? `
  <span class="pill" style="
    margin-left:-6px;
    border-top-left-radius: 10px;
    border-bottom-left-radius: 10px;
    padding: 4px 10px;
    ${showInc ? "background: rgba(250,204,21,.14); border-color: rgba(250,204,21,.35); color:#fde68a;" 
              : "background: rgba(148,163,184,.10); border-color: rgba(148,163,184,.20); color: var(--muted);"}
  ">
    <span class="dot ${showInc ? "warn" : "muted"}"></span>
    ${esc(incLabel)}
  </span>
` : ""}` : ""}
              ${v.gafeteNo ? `<span class="pill"><span class="dot info"></span>Gafete: ${esc(v.gafeteNo)}</span>` : ""}
              ${v.incidenciasSalida ? `<span class="pill"><span class="dot warn"></span>Incidencia</span>` : ""}
            </div>
            ${isVisitante(v) && v.status === Status.LLEGADO ? `
              <div class="row" style="margin-top:10px;">
                ${liveTimePill("Espera", v.llegadaTs, 0, true)}
                ${hasPerm("registrar_entrada") ? `<button class="ok" data-action="entrada" data-id="${esc(v.id)}" data-no-sb="true">Dar acceso</button>` : ""}
              </div>
            ` : ""}
            ${isVisitante(v) && v.status === Status.DENTRO ? `
              <div class="row" style="margin-top:10px;">
                ${liveTimePill("Espera para acceso", v.llegadaTs, v.entradaTs, false)}
                ${liveTimePill("Tiempo dentro", v.entradaTs, 0, false)}
              </div>
            ` : ""}
            ${isVisitante(v) && v.status === Status.FINALIZADO ? `
              <div class="row" style="margin-top:10px;">
                ${liveTimePill("Espera", v.llegadaTs, v.entradaTs, false)}
                ${liveTimePill("Dentro", v.entradaTs, v.salidaTs, false)}
                ${liveTimePill("Total", v.llegadaTs, v.salidaTs, false)}
              </div>
            ` : ""}
            ${v.status === Status.PENDIENTE_AUTORIZACION && ((isVisitante(v) && [ROLES.ADMIN,ROLES.RECEPCIONISTA].includes(currentUser?.role)) || (!isVisitante(v) && currentUser?.role === ROLES.COMPRAS)) ? `
              <div class="row" style="margin-top:10px;">
                <button class="ok" data-action="autorizarVisita" data-id="${esc(v.id)}" data-no-sb="true">Autorizar</button>
                <button class="bad" data-action="rechazarVisita" data-id="${esc(v.id)}" data-no-sb="true">Rechazar</button>
              </div>
            ` : ""}
            ${qrVencido && currentUser?.role === ROLES.ADMIN ? `<button class="secondary" data-action="reactivar" data-id="${esc(v.id)}" style="margin-top:10px; width:100%;">Reactivar</button>` : ""}
          </div>
        `;
      }

      const dashboardContent = dashboardPendingOnly ? `
        <div class="card">
          <div class="row" style="justify-content:space-between; margin-bottom:10px;">
            <div>
              <h2 style="margin:0 0 4px;">Pendientes de autorización - ${esc(dashboardTitle)}</h2>
              <div style="color:var(--muted); font-size:12px;">Solicitudes creadas desde kiosko que aún no liberan acceso.</div>
            </div>
            <button class="secondary" data-action="togglePendingAuth" data-no-sb="true">Volver al dashboard</button>
          </div>
          <div class="dashboard-pending-list">
            ${pendingAuth.length ? pendingAuth.map(card).join("") : `<div style="color:var(--muted);font-size:12px;">Sin pendientes de autorización</div>`}
          </div>
        </div>
      ` : `
        <div class="provider-mobile-tabs" role="tablist" aria-label="Estado de ${dashboardTipo}">
          ${[["programados","Programados",programados.length],["llegados","Llegaron",llegados.length],["dentro","Dentro",dentro.length],...(showDespachados ? [["despachados","Despachados",despachados.length]] : []),["finalizados","Finalizados",finalizados.length]].map(([key,label,count])=>`<button class="provider-mobile-tab ${dashboardMobileStatus === key ? "active" : ""}" data-action="${dashboardTipo === "proveedores" ? "providerMobileStage" : "visitorMobileStage"}" data-stage="${key}" data-no-sb="true" role="tab" aria-selected="${dashboardMobileStatus === key}">${label}<b>${count}</b></button>`).join("")}
        </div>
        <div class="provider-kanban-scroll">
        <div class="grid ${showDespachados ? "cols-5" : "cols-4"} provider-kanban-board">
          ${col("Programados","info",programados,"programados")}
          ${col("Llegaron","warn",llegados,"llegados")}
          ${col("Dentro","ok",dentro,"dentro")}
          ${showDespachados ? col("Despachados","brand",despachados,"despachados") : ""}
          ${col("Finalizados","muted",finalizados,"finalizados")}
        </div>
        </div>
      `;

      appEl.innerHTML = `
        <section class="${modernDashboard ? "provider-dashboard-modern" : ""} provider-kanban-dashboard ${dashboardTipo === "visitantes" ? "visitor-kanban-dashboard" : ""}">
        ${modernDashboard ? `
          <div class="provider-dashboard-hero">
            <div class="provider-dashboard-hero-copy">
              <div class="provider-dashboard-hero-icon" aria-hidden="true">${dashboardHeroIcon}</div>
              <div>
                <h2>${dashboardHeroTitle}</h2>
                <p>${dashboardHeroText}</p>
              </div>
            </div>
            <div class="provider-dashboard-date"><span aria-hidden="true">▣</span>${new Date().toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"})}</div>
          </div>
        ` : ""}
        ${modernDashboard ? `
        <div class="dashboard-toolbar provider-summary-tools">
          <div class="provider-summary" aria-label="Resumen de ${dashboardTipo}">
            <div class="provider-summary-item"><span class="provider-summary-icon" aria-hidden="true">▣</span><span class="provider-summary-copy"><strong>${filtered.length}</strong><span>Citas de hoy</span></span></div>
            <div class="provider-summary-item ok"><span class="provider-summary-icon" aria-hidden="true">⌂</span><span class="provider-summary-copy"><strong>${resumenDashboard.dentro.length}</strong><span>Dentro</span></span></div>
            <div class="provider-summary-item final"><span class="provider-summary-icon" aria-hidden="true">✓</span><span class="provider-summary-copy"><strong>${resumenDashboard.finalizados.length}</strong><span>Finalizados</span></span></div>
          </div>
          <div class="provider-toolbar-actions">
            <label class="provider-search-wrap"><span aria-hidden="true">⌕</span><input id="dashSearch" type="search" autocomplete="off" placeholder="${esc(searchPlaceholder)}" value="${esc(dashboardSearchTerm)}" aria-label="Buscar ${dashboardTipo}"></label>
            <button class="secondary provider-icon-button" data-action="sync" data-no-sb="true" aria-label="Actualizar" title="Actualizar">↻</button>
            ${hasPerm("escanear_qr") ? `<button class="provider-scan-button" data-action="scan" data-from="${esc(currentView)}" aria-label="Escanear QR"><span aria-hidden="true">▦</span> Escanear QR</button>` : ""}
            <button class="dashboard-pending-pill ${dashboardPendingOnly ? "active" : ""}" data-action="togglePendingAuth" data-no-sb="true" aria-pressed="${dashboardPendingOnly ? "true" : "false"}"><span class="dot warn"></span> Pendientes: <b>${pendingAuth.length}</b></button>
          </div>
        </div>
        ` : `<div class="dashboard-toolbar">
          <div class="pill">
            <span class="dot brand"></span> ${esc(dashboardTitle)}: <b style="color:var(--text);">${new Date().toLocaleDateString()}</b>
          </div>
          <span class="pill">Total: <b style="color:var(--text); margin-left:6px;">${filtered.length}</b></span>
          <button class="dashboard-pending-pill ${dashboardPendingOnly ? "active" : ""}"
                  data-action="togglePendingAuth"
                  data-no-sb="true"
                  aria-pressed="${dashboardPendingOnly ? "true" : "false"}">
            <span class="dot warn"></span> Pendientes de autorización: <b>${pendingAuth.length}</b>
          </button>
          <input id="dashSearch"
           placeholder="${esc(searchPlaceholder)}"
           value="${esc(dashboardSearchTerm)}"
           style="max-width:190px; margin-left:auto;" />
          <button class="secondary" data-action="sync" data-no-sb="true">Actualizar</button>
          ${scanBtn}
        </div>`}

        ${dashboardContent}
        ${modernDashboard ? `<div class="provider-mobile-navigation" aria-label="Navegación de ${dashboardTipo}">
          ${hasPerm("escanear_qr") ? `<button class="provider-mobile-scan" data-action="scan" data-from="${esc(currentView)}" aria-label="Escanear QR"><span aria-hidden="true">▦</span> Escanear QR</button>` : ""}
          <div class="provider-mobile-nav-row">
            <button data-action="home" aria-label="Ir al menú principal"><span class="provider-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8"></path><path d="M5.5 9.5V21h13V9.5"></path><path d="M9.5 21v-7h5v7"></path></svg></span><small>Inicio</small></button>
            <button class="active" data-action="sync" data-no-sb="true" aria-label="Actualizar ${dashboardTipo}"><span class="provider-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M6.1 8.2A7 7 0 0 1 18.7 7L20 12"></path><path d="M17.9 15.8A7 7 0 0 1 5.3 17L4 12"></path></svg></span><small>Actualizar</small></button>
            <button class="${dashboardPendingOnly ? "pending-active" : ""}" data-action="togglePendingAuth" data-no-sb="true" aria-label="Mostrar pendientes por autorizar: ${pendingAuth.length}" aria-pressed="${dashboardPendingOnly ? "true" : "false"}"><span class="provider-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-7 7v4l-2 3h18l-2-3v-4a7 7 0 0 0-7-7Z"></path><path d="M9.5 20h5"></path></svg></span><span class="provider-nav-count">${pendingAuth.length}</span><small>Por autorizar</small></button>
          </div>
        </div>` : ""}
        </section>
      `;
    
    }

    async function renderHistorial(){
 try{ setActiveSb('historial'); }catch{}
      if(!requirePerm("ver_historial","Tu rol no puede ver historial.")) return;
      currentView = "historial";

      const todayISO = new Date().toISOString().slice(0,10);
      const defaultHistTipo = isVisitanteOnlyRole() ? "visitantes" : getActiveDashboardTipo();

      appEl.innerHTML = `
        <div class="card">
          <div class="row" style="justify-content:space-between;">
            <div>
              <h2 style="margin:0 0 4px;">Historial de Visitas</h2>
              <div style="color:var(--muted); font-size:12px;">Selecciona un día para ver sus registros.</div>
            </div>
            <div class="row">
              <button class="secondary" data-action="home">Volver</button>
            </div>
          </div>

          <div class="divider"></div>

          <div class="row">
        <div style="min-width:220px;">
          <label>Día</label>
          <input type="date" id="histDate" value="${todayISO}">
        </div>
        <div style="min-width:220px;">
          <label>Tabla</label>
          <select id="histTipo">
            <option value="proveedores" ${defaultHistTipo === "proveedores" ? "selected" : ""}>Proveedores</option>
            <option value="visitantes" ${defaultHistTipo === "visitantes" ? "selected" : ""}>Visitantes</option>
          </select>
        </div>
        <div style="min-width:220px;">
          <label>&nbsp;</label>
          <button class="secondary" data-action="histLoad">Cargar día</button>
            </div>
          </div>

          <div class="divider"></div>
          <div id="histWrap" style="min-height:80px;color:var(--muted);font-size:12px;">
            Selecciona un día y presiona "Cargar día".
          </div>
        </div>
      `;
    }

async function cloudFetchByRange(fromTs, toTs){
  const qProveedores = query(
    collection(db, COL_VISITAS),
    where("fechaHoraTs", ">=", fromTs),
    where("fechaHoraTs", "<=", toTs),
    orderBy("fechaHoraTs", "desc"),
    limit(1000)
  );
  const qVisitantes = query(
    collection(db, COL_VISITANTES),
    where("fechaHoraTs", ">=", fromTs),
    where("fechaHoraTs", "<=", toTs),
    orderBy("fechaHoraTs", "desc"),
    limit(1000)
  );
  const [proveedoresRes, visitantesRes] = await Promise.allSettled([getDocs(qProveedores), getDocs(qVisitantes)]);
  if(proveedoresRes.status === "rejected" && visitantesRes.status === "rejected"){
    throw proveedoresRes.reason || visitantesRes.reason;
  }
  const arr = [];
  const snap = proveedoresRes.status === "fulfilled" ? proveedoresRes.value : null;
  const visitantesSnap = visitantesRes.status === "fulfilled" ? visitantesRes.value : null;
  if(proveedoresRes.status === "rejected") console.warn("No se pudo leer visitas por rango:", proveedoresRes.reason);
  if(visitantesRes.status === "rejected") console.warn("No se pudo leer visitantes por rango:", visitantesRes.reason);
  snap?.forEach(d => {
    const data = { id: d.id, ...d.data() };
    if(!isVisitante(data)) arr.push(data);
  });
  visitantesSnap?.forEach(d => arr.push({ id: d.id, ...d.data(), tipoVisita:"visitante", tipoAcceso:"visitante" }));
  return arr;
}

function existeCitaEnHorarioExcluding(fechaHoraISO, area, excludeId){
  if(!fechaHoraISO || !area) return false;
  const ts = new Date(fechaHoraISO).getTime();
  const cap = capArea(area);
  const slotWindowMs = SLOT_MINUTES * 60 * 1000;

  const ocupadas = visitas.filter(v =>
    String(v.id) !== String(excludeId) &&
    citaConsumeCapacidad(v) &&
    v.area === area &&
    typeof v.fechaHoraTs === "number" &&
    Math.abs(v.fechaHoraTs - ts) < slotWindowMs
  ).length;

  return ocupadas >= cap;
}

let _comprasCache = []; // cache de la vista (rango cargado)
let _citasTipoFiltro = "proveedores";

async function renderCitasCompras(tipoFiltro = getActiveDashboardTipo()){
  if(!requirePerm("ver_citas_compras","Solo COMPRAS puede ver esta tabla.")) return;
  currentView = "citas_compras";
  _citasTipoFiltro = normalizeDashboardTipo(tipoFiltro);
  const citasTitle = _citasTipoFiltro === "visitantes" ? "Citas de visitantes" : "Citas de proveedores";
  const citasSearch = _citasTipoFiltro === "visitantes" ? "Visitante / Empresa / ID..." : "Proveedor / Empresa / ID...";

  // defaults: hoy -> +30 días
  const today = new Date();
  const todayISO = today.toISOString().slice(0,10);
  const plus30 = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10);

  appEl.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div>
          <h2 style="margin:0 0 4px;">${esc(citasTitle)}</h2>
          <div style="color:var(--muted);font-size:12px;">
            Tabla independiente para ${_citasTipoFiltro === "visitantes" ? "visitantes" : "proveedores"}.
          </div>
        </div>
        <div class="row">
          <button class="secondary" data-action="home">Volver</button>
        </div>
      </div>

      <div class="divider"></div>

      <div class="row" style="gap:12px; flex-wrap:wrap;">
        <div style="min-width:180px;">
          <label>Fecha inicio</label>
          <input type="date" id="ccFrom" value="${todayISO}">
        </div>
        <div style="min-width:180px;">
          <label>Fecha fin</label>
          <input type="date" id="ccTo" value="${plus30}">
        </div>
        <div style="min-width:220px;">
          <label>Área</label>
          <select id="ccArea">
            <option value="">Todas</option>
            ${AREAS.map(a=>`<option value="${a}">${a}</option>`).join("")}
          </select>
        </div>
        <div style="min-width:200px;">
          <label>Estatus</label>
          <select id="ccStatus">
            <option value="">Todos</option>
            <option value="${Status.PROGRAMADO}">Programado</option>
            <option value="${Status.PENDIENTE_AUTORIZACION}">Pendiente autorizacion</option>
            <option value="${Status.LLEGADO}">Llegó</option>
            <option value="${Status.DENTRO}">Dentro</option>
            ${_citasTipoFiltro === "visitantes" ? "" : `<option value="${Status.DESPACHADO}">Despachado</option>`}
            <option value="${Status.FINALIZADO}">Finalizado</option>
            <option value="${Status.CANCELADO}">Cancelado</option>
          </select>
        </div>
        <div style="min-width:240px; flex:1;">
          <label>Buscar</label>
          <input id="ccSearch" placeholder="${esc(citasSearch)}">
        </div>
        <div style="align-self:flex-end;">
          <button class="secondary" data-action="ccLoad">Cargar</button>
        </div>
      </div>

      <div class="divider"></div>

      <div id="ccWrap" style="overflow:auto;">
        <div style="color:var(--muted);font-size:12px;">Presiona "Cargar".</div>
      </div>
    </div>
  `;
}

async function loadCitasCompras(){
  if(!requirePerm("ver_citas_compras")) return;
  const wrap = document.getElementById("ccWrap");
  if(!wrap) return;

  const from = document.getElementById("ccFrom").value;
  const to = document.getElementById("ccTo").value;
  const areaSel = document.getElementById("ccArea").value;
  const statusSel = document.getElementById("ccStatus").value;
  const term = (document.getElementById("ccSearch").value || "").trim().toLowerCase();

  if(!from || !to){
    toast("Filtros incompletos","Selecciona rango de fechas","warn");
    return;
  }

  const fromTs = new Date(from + "T00:00:00").getTime();
  const toTs = new Date(to + "T23:59:59").getTime();

  wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;">Cargando citas…</div>`;

  try{
    if(navigator.onLine){
      const cloud = await cloudFetchByRange(fromTs, toTs);
      visitas = mergeById(visitas, cloud);
      saveVisitasLocal();
    }else{
      toast("Sin conexión","Mostrando solo lo disponible en local","warn",2600);
    }

    // 1) BASE por rango (sin filtros de área)
    let baseList = visitas.filter(v =>
      typeof v.fechaHoraTs === "number" &&
      v.fechaHoraTs >= fromTs &&
      v.fechaHoraTs <= toTs &&
      dashboardTipoMatches(v, _citasTipoFiltro)
    );

    // 2) Aplica filtros que NO son área (status + búsqueda)
    if(statusSel) baseList = baseList.filter(v => v.status === statusSel);

    if(term){
      baseList = baseList.filter(v =>
        getSearchTextVisita(v).includes(term)
      );
    }

    // 3) TABLA: ahora sí filtra por área seleccionada (si hay)
    const tableList = areaSel ? baseList.filter(v => v.area === areaSel) : baseList;

    _comprasCache = tableList;
    paintCitasComprasTable(tableList, baseList); // 👈 ahora recibe ambos

  }catch(e){
    console.error(e);
    wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;">Error cargando citas (Rules/Internet).</div>`;
    toast("Compras","No se pudieron cargar citas. Revisa Rules/Conexión.","bad",4200);
  }
}

function paintCitasComprasTable(tableList, baseList){
  const wrap = document.getElementById("ccWrap");
  if(!wrap) return;

  // ---------- Resumen por área (sobre baseList) ----------
  const counts = {};
  (baseList || []).forEach(v=>{
    const a = (v.area && String(v.area).trim()) ? v.area : "Sin área";
    counts[a] = (counts[a] || 0) + 1;
  });

  // Orden sugerido: las AREAS conocidas primero, luego extras, luego "Sin área"
  const known = (typeof AREAS !== "undefined" && Array.isArray(AREAS)) ? AREAS : [];
  const extras = Object.keys(counts).filter(a => a !== "Sin área" && !known.includes(a)).sort();
  const orderedAreas = [...known, ...extras, ...(counts["Sin área"] ? ["Sin área"] : [])];

  const totalBase = (baseList || []).length;

  const chip = (areaName, n, isAll=false)=>{
    const dotClass =
      isAll ? "brand" :
      (n > 0 ? "ok" : "warn");

    const style =
      (isAll || n > 0)
        ? ""
        : "opacity:.55; filter:saturate(.8);";

    // Usa data-action para que lo agarre tu listener global
    return `
      <span class="pill"
            style="cursor:pointer; ${style}"
            data-action="ccChipArea"
            data-area="${esc(areaName)}">
        <span class="dot ${dotClass}"></span>
        ${isAll ? "Todas" : esc(areaName)}
        <b style="color:var(--text); margin-left:6px;">${n}</b>
        ${totalBase ? `<span style="color:var(--muted); margin-left:6px;">(${Math.round((n/totalBase)*100)}%)</span>` : ""}
      </span>
    `;
  };

  const resumenHtml = `
    <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:10px;">
      ${chip("__ALL__", totalBase, true)}
      ${orderedAreas.map(a => chip(a, counts[a] || 0)).join("")}
    </div>
  `;

  // ---------- Badges de estatus ----------
  const badge = (s)=>{
    const map = {
      [Status.PROGRAMADO]: ["info","PROGRAMADO"],
      [Status.LLEGADO]: ["warn","LLEGÓ"],
      [Status.DENTRO]: ["ok","DENTRO"],
      [Status.DESPACHADO]: ["brand","DESPACHADO"],
      [Status.FINALIZADO]: ["muted","FINALIZADO"],
      [Status.CANCELADO]: ["bad","CANCELADO"],
    };
    const [dot,label] = map[s] || ["muted", (s||"").toUpperCase()];
    return `<span class="pill"><span class="dot ${dot}"></span>${label}</span>`;
  };

  // ---------- Tabla ----------
  wrap.innerHTML = `
    ${resumenHtml}

    <div class="row" style="margin-bottom:10px;">
      <span class="pill">Mostrando: <b style="color:var(--text); margin-left:6px;">${(tableList||[]).length}</b></span>
      <span class="pill" style="margin-left:auto;">Total rango: <b style="color:var(--text); margin-left:6px;">${totalBase}</b></span>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Nombre</th>
          <th>Persona</th>
          <th>Área</th>
          <th>Motivo</th>
          <th>Estatus</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${(tableList||[]).map(v=>{
          const fecha = v.fechaHora ? new Date(v.fechaHora).toLocaleString() : "-";
          const bloqueada = citaBloqueadaPorRetraso(v);
          const canEdit = hasPerm("editar_cita") && v.status !== Status.CANCELADO && v.status !== Status.FINALIZADO && !bloqueada;
          const canCancel = hasPerm("cancelar_cita") && v.status !== Status.CANCELADO && v.status !== Status.FINALIZADO && !bloqueada;

          return `
            <tr>
              <td>${esc(fecha)}<br>${pillCitaCreada(v)}</td>
              <td>${esc(getTipoVisitaLabel(v))}${isVisitante(v) ? `<br><small>${esc(getModalidadVisitanteLabel(v))}</small>` : ""}</td>
              <td><b>${esc(getNombreAcceso(v)||"-")}</b><br><code>${esc(v.id)}</code></td>
              <td>${esc(v.personaVisita||"-")}</td>
              <td>${esc(v.area||"-")}</td>
              <td>${esc(v.motivo||"-")}</td>
              <td>${badge(v.status)}</td>
              <td style="white-space:nowrap;">
                <div class="citas-action-buttons">
                  ${_citasTipoFiltro === "proveedores" && v.status === Status.PROGRAMADO && hasPerm("ver_qr") ? `<button class="secondary citas-icon-action" data-action="ccTableVerQR" data-id="${esc(v.id)}" aria-label="Ver QR" title="Ver QR"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="6" height="6" rx="1"></rect><rect x="15" y="3" width="6" height="6" rx="1"></rect><rect x="3" y="15" width="6" height="6" rx="1"></rect><path d="M15 15h2v2h-2zM19 15h2v4h-2M15 19h2v2h-2M19 21h2"></path></svg></button>` : ""}
                  <button class="secondary citas-icon-action" data-action="ccEdit" data-id="${esc(v.id)}" aria-label="Editar cita" title="Editar cita" ${canEdit?"":"disabled"}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"></path><path d="m14 7 3 3"></path></svg></button>
                  <button class="danger citas-icon-action" data-action="ccCancel" data-id="${esc(v.id)}" aria-label="Cancelar cita" title="Cancelar cita" ${canCancel?"":"disabled"}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6M15 9l-6 6"></path></svg></button>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function valeStatusLabel(status){
  const map = {
    [ValeStatus.GENERADO]: "Generado",
    [ValeStatus.PENDIENTE]: "Pendiente/Autorización",
    [ValeStatus.FUERA]: "Fuera",
    [ValeStatus.REGRESO_CANCELADO]: "Regreso"
  };
  return map[status] || "Generado";
}

function valeStatusDot(status){
  const map = {
    [ValeStatus.GENERADO]: "info",
    [ValeStatus.PENDIENTE]: "warn",
    [ValeStatus.FUERA]: "bad",
    [ValeStatus.REGRESO_CANCELADO]: "ok"
  };
  return map[status] || "info";
}

function getValeCounts(list){
  return {
    generados: list.filter(v => v.status === ValeStatus.GENERADO),
    pendientes: list.filter(v => v.status === ValeStatus.PENDIENTE),
    fuera: list.filter(v => v.status === ValeStatus.FUERA),
    regresoCancelado: list.filter(v => v.status === ValeStatus.REGRESO_CANCELADO),
  };
}

async function ensureValeActivoAutorizadores(force=false){
  const fresh = Date.now() - valeActivoAutorizadoresTs < 10 * 60 * 1000;
  if(!force && fresh && valeActivoAutorizadoresCache.length) return valeActivoAutorizadoresCache;

  try{
    const snap = await getDocs(query(collection(db, COL_USERS), limit(300)));
    const arr = [];
    snap.forEach(d => {
      const u = { uid: d.id, id: d.id, ...d.data() };
      if(u.eliminado) return;
      if(u.aprobado === false) return;
      if(u.puedeAutorizarValeActivo !== true) return;
      arr.push(u);
    });

    valeActivoAutorizadoresCache = arr.sort((a,b) =>
      String(a.nombre || a.email || "").localeCompare(String(b.nombre || b.email || ""))
    );
    valeActivoAutorizadoresTs = Date.now();
  }catch(e){
    console.warn("No se pudieron cargar autorizadores de vale activo", e);
    if(currentUser?.puedeAutorizarValeActivo === true){
      valeActivoAutorizadoresCache = [{
        uid: currentUser.uid,
        nombre: currentUser.nombre || currentUser.email || "",
        email: currentUser.email || "",
        role: currentUser.role
      }];
      valeActivoAutorizadoresTs = Date.now();
    }
  }

  return valeActivoAutorizadoresCache;
}

async function ensureValePersonalAutorizadores(force=false){
  const fresh = Date.now() - valePersonalAutorizadoresTs < 10 * 60 * 1000;
  if(!force && fresh && valePersonalAutorizadoresCache.length) return valePersonalAutorizadoresCache;

  try{
    const snap = await getDocs(query(collection(db, COL_USERS), limit(300)));
    const arr = [];
    const perfiles = [];
    snap.forEach(d => {
      const u = { uid: d.id, id: d.id, ...d.data() };
      if(u.eliminado) return;
      if(u.aprobado === false) return;
      perfiles.push(u);
      if(!canRoleAuthorizeValePersonal(u.role)) return;
      arr.push(u);
    });

    valePersonalPerfilesCache = perfiles;
    valePersonalAutorizadoresCache = arr.sort((a,b) =>
      String(a.nombre || a.email || "").localeCompare(String(b.nombre || b.email || ""))
    );
    valePersonalAutorizadoresTs = Date.now();
  }catch(e){
    console.warn("No se pudieron cargar autorizadores de vale personal", e);
    valePersonalAutorizadoresCache = [];
    valePersonalPerfilesCache = [];
    valePersonalAutorizadoresTs = Date.now();
  }

  return valePersonalAutorizadoresCache;
}

function renderValeActivoAutorizadorOptions(){
  if(!valeActivoAutorizadoresCache.length){
    return `<option value="">No hay autorizadores disponibles</option>`;
  }

  return `<option value="">-- Selecciona autorizador --</option>` + valeActivoAutorizadoresCache.map(u => `
    <option
      value="${esc(u.uid || u.id || "")}"
      data-email="${esc(u.email || "")}"
      data-nombre="${esc(u.nombre || u.email || "")}"
      data-role="${esc(u.role || "")}"
    >
      ${esc(u.nombre || u.email || "Usuario")}
    </option>
  `).join("");
}

function isValeActivoBackupAuthorizer(){
  return currentUser?.role === ROLES.CONTRALORIA;
}

function canCurrentUserAuthorizeValeActivo(v={}){
  if(isValeActivoBackupAuthorizer()) return true;
  if(currentUser?.puedeAutorizarValeActivo !== true) return false;
  if(!v.autorizadorUid && !v.autorizadorEmail) return true;

  const currentUid = String(currentUser?.uid || "");
  const currentEmail = String(currentUser?.email || "").toLowerCase();
  return (
    (v.autorizadorUid && String(v.autorizadorUid) === currentUid) ||
    (v.autorizadorEmail && String(v.autorizadorEmail).toLowerCase() === currentEmail)
  );
}

function normalizarNominaPerfil(value){
  const raw = String(value || "").trim().toUpperCase();
  if(/^P\d+$/.test(raw)) return raw;
  return raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function perfilesValePersonalPorNomina(nomina){
  const key = normalizarNominaPerfil(nomina);
  if(!key) return [];
  return valePersonalPerfilesCache.filter(u => normalizarNominaPerfil(u.nomina || u.noNomina || u.numeroNomina) === key);
}

function perfilValePersonalPorNomina(nomina){
  const matches = perfilesValePersonalPorNomina(nomina);
  return matches.length === 1 ? matches[0] : null;
}

function esPerfilJefeRestringido(perfil={}){
  return perfil?.role === ROLES.JEFE_RESTRINGIDO;
}

function esValePersonalGrupal(v={}){
  return v.esGrupal === true && Array.isArray(v.integrantes) && v.integrantes.length > 0;
}

function integrantesValePersonal(v={}){
  if(esValePersonalGrupal(v)) return v.integrantes;
  return [{
    id:v.colaboradorUid || v.nomina || "individual",
    nombre:v.nombreColaborador || "",
    nomina:v.nomina || "",
    departamento:v.departamento || "",
    colaboradorUid:v.colaboradorUid || "",
    colaboradorRole:v.colaboradorRole || "",
    status:v.status,
    salidaTs:v.salidaTs || null,
    regresoTs:v.regresoTs || null,
    llegadaTs:v.llegadaTs || null,
    canceladoTs:v.canceladoTs || null,
    salidaSinRegresoFinalizadaTs:v.salidaSinRegresoFinalizadaTs || null
  }];
}

function valePersonalIncluyeNomina(v={}, nomina=""){
  const key = normalizarNominaPerfil(nomina);
  return !!key && integrantesValePersonal(v).some(item => normalizarNominaPerfil(item.nomina) === key);
}

function estadoIntegrantesValePersonal(v={}){
  const integrantes = integrantesValePersonal(v);
  return {
    total:integrantes.length,
    pendientes:integrantes.filter(item => item.status === ValeStatus.PENDIENTE).length,
    inicio:integrantes.filter(item => item.status === ValeStatus.GENERADO).length,
    fuera:integrantes.filter(item => item.status === ValeStatus.FUERA).length,
    finalizados:integrantes.filter(item => item.status === ValeStatus.REGRESO_CANCELADO).length
  };
}

function esPreviewValeGrupalLocal(){
  return new URLSearchParams(location.search).has("valeGrupalLocal");
}

function esValeDeJefeRestringido(v={}){
  if(esValePersonalGrupal(v)){
    return v.integrantes.some(item => item.colaboradorRole === ROLES.JEFE_RESTRINGIDO || esPerfilJefeRestringido(perfilValePersonalPorNomina(item.nomina)));
  }
  if(v.colaboradorRole === ROLES.JEFE_RESTRINGIDO) return true;
  return esPerfilJefeRestringido(perfilValePersonalPorNomina(v.nomina));
}

function puedeGestionarValeDeJefeRestringido(role=currentUser?.role){
  return [ROLES.JEFE, ROLES.ADMIN].includes(role);
}

function mensajeRestriccionJefeRestringido(){
  toast(
    "Autorización restringida",
    "Solo su Jefe o el Administrador puede autorizar este vale. Elija el nombre de su Jefe en el campo de autorización.",
    "warn",
    6200
  );
}

function autorizadoresValePersonalParaPerfil(perfilColaborador=null){
  if(!esPerfilJefeRestringido(perfilColaborador)) return valePersonalAutorizadoresCache;
  return valePersonalAutorizadoresCache.filter(u => [ROLES.JEFE, ROLES.ADMIN].includes(u.role));
}

function renderValePersonalAutorizadorOptions(perfilColaborador=null){
  const autorizadores = autorizadoresValePersonalParaPerfil(perfilColaborador);
  if(!autorizadores.length){
    return `<option value="">No hay autorizadores disponibles</option>`;
  }

  return `<option value="">-- Selecciona autorizador --</option>` + autorizadores.map(u => `
    <option
      value="${esc(u.uid || u.id || "")}"
      data-email="${esc(u.email || "")}"
      data-nombre="${esc(u.nombre || u.email || "")}"
      data-role="${esc(u.role || "")}"
      data-telefono="${esc(u.telefono || "")}"
    >
      ${esc(u.nombre || u.email || "Usuario")}
    </option>
  `).join("");
}

function canCurrentUserAuthorizeValePersonal(v={}){
  if(!hasPerm("autorizar_vale_personal")) return false;
  if(!canRoleAuthorizeValePersonal(currentUser?.role)) return false;
  if(currentUser?.role === ROLES.JEFE_DESARROLLO && (v.status !== ValeStatus.PENDIENTE || !esAutorizadorAsignadoValePersonal(v))) return false;
  if(esValeDeJefeRestringido(v) && !puedeGestionarValeDeJefeRestringido()) return false;
  return !isValePersonalDelUsuarioActual(v);
}

function normalizarIdentidadValePersonal(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function isValePersonalDelUsuarioActual(v={}){
  const currentUid = String(currentUser?.uid || "");
  if(esValePersonalGrupal(v)){
    const nominaUsuario = normalizarIdentidadValePersonal(currentUser?.nomina);
    const nombreUsuario = normalizarIdentidadValePersonal(currentUser?.nombre);
    return v.integrantes.some(item =>
      (currentUid && item.colaboradorUid && String(item.colaboradorUid) === currentUid) ||
      (nominaUsuario && normalizarIdentidadValePersonal(item.nomina) === nominaUsuario) ||
      (nombreUsuario && normalizarIdentidadValePersonal(item.nombre) === nombreUsuario)
    );
  }
  if(currentUid && v.colaboradorUid && String(v.colaboradorUid) === currentUid) return true;

  const nominaUsuario = normalizarIdentidadValePersonal(currentUser?.nomina);
  const nominaVale = normalizarIdentidadValePersonal(v.nomina);
  if(nominaUsuario && nominaVale && nominaUsuario === nominaVale) return true;

  const nombreUsuario = normalizarIdentidadValePersonal(currentUser?.nombre);
  const nombreVale = normalizarIdentidadValePersonal(v.nombreColaborador);
  return !!nombreUsuario && !!nombreVale && nombreUsuario === nombreVale;
}

function validarAutoautorizacionValePersonal(v={}){
  if(esValeDeJefeRestringido(v) && !puedeGestionarValeDeJefeRestringido()){
    mensajeRestriccionJefeRestringido();
    return false;
  }
  if(!isValePersonalDelUsuarioActual(v)) return true;
  toast(
    "Autoautorización no permitida",
    "Puedes crear tu propio vale, pero debe autorizarlo otra persona cuyo rol tenga el permiso Autorizar vales de personal.",
    "warn",
    5200
  );
  return false;
}
