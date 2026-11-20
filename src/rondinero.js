function rondineroQrText(puntoId){
  return `RONDINERO_POINT:${puntoId}`;
}

const RONDINERO_GPS_RADIO_DEFAULT_M = 30;
const RONDINERO_GPS_PRECISION_MAX_M = 40;

function obtenerUbicacionRondinero(){
  return new Promise((resolve, reject) => {
    if(!navigator.geolocation){
      reject(new Error("Este dispositivo no tiene geolocalización disponible."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitud: Number(pos.coords.latitude),
        longitud: Number(pos.coords.longitude),
        precisionMetros: Math.round(Number(pos.coords.accuracy) || 0),
        gpsTs: Number(pos.timestamp) || Date.now()
      }),
      err => {
        const mensajes = {
          1: "Activa el permiso de ubicación para validar el punto.",
          2: "No se pudo determinar la ubicación actual.",
          3: "La ubicación tardó demasiado en responder. Intenta nuevamente."
        };
        reject(new Error(mensajes[err?.code] || "No se pudo obtener la ubicación."));
      },
      { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
    );
  });
}

function distanciaMetrosRondinero(lat1, lon1, lat2, lon2){
  const rad = valor => valor * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function puntoRondineroTieneGps(punto){
  return punto?.latitud !== null && punto?.latitud !== undefined && punto?.latitud !== "" &&
    punto?.longitud !== null && punto?.longitud !== undefined && punto?.longitud !== "" &&
    Number.isFinite(Number(punto.latitud)) && Number.isFinite(Number(punto.longitud));
}

async function capturarGpsRondineroPunto(){
  if(!requirePerm("rondinero_configurar","Tu rol no puede configurar puntos.")) return;
  const btn = document.querySelector('[data-action="rondineroCapturarGps"]');
  if(btn) btn.disabled = true;
  try{
    toast("GPS","Obteniendo ubicación precisa…","info",1800);
    const gps = await obtenerUbicacionRondinero();
    if(gps.precisionMetros > RONDINERO_GPS_PRECISION_MAX_M){
      toast("GPS impreciso",`La precisión es de ±${gps.precisionMetros} m. Muévete a un área abierta e intenta otra vez.`,"warn",4500);
      return;
    }
    const latEl = document.getElementById("rondPuntoLatitud");
    const lonEl = document.getElementById("rondPuntoLongitud");
    const precisionEl = document.getElementById("rondPuntoGpsPrecision");
    if(latEl) latEl.value = gps.latitud.toFixed(7);
    if(lonEl) lonEl.value = gps.longitud.toFixed(7);
    if(precisionEl) precisionEl.textContent = `Ubicación capturada con precisión de ±${gps.precisionMetros} m.`;
    toast("GPS capturado",`Precisión ±${gps.precisionMetros} m.`,"ok",2600);
  }catch(e){
    toast("GPS requerido",e?.message || "No se pudo obtener la ubicación.","bad",4500);
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function configurarGpsRondineroPuntoExistente(id){
  if(!requirePerm("rondinero_configurar","Tu rol no puede configurar puntos.")) return;
  const punto = rondineroPuntos.find(p => String(p.id) === String(id));
  if(!punto) return;
  if(!confirm(`Debes estar físicamente en “${punto.nombre || "este punto"}”. ¿Capturar la ubicación actual?`)) return;
  try{
    toast("GPS","Obteniendo ubicación precisa…","info",1800);
    const gps = await obtenerUbicacionRondinero();
    if(gps.precisionMetros > RONDINERO_GPS_PRECISION_MAX_M){
      toast("GPS impreciso",`La precisión es de ±${gps.precisionMetros} m. Muévete a un área abierta e intenta otra vez.`,"warn",4800);
      return;
    }
    punto.latitud = gps.latitud;
    punto.longitud = gps.longitud;
    punto.radioMetros = Math.max(5, Number(punto.radioMetros) || RONDINERO_GPS_RADIO_DEFAULT_M);
    punto.gpsPrecisionCapturaMetros = gps.precisionMetros;
    punto.gpsCapturadoTs = Date.now();
    punto.gpsCapturadoPorUid = currentUser?.uid || "";
    punto.updatedTs = Date.now();
    saveRondineroLocal();
    if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
      await cloudUpsertRondineroPunto(punto);
    }
    toast("GPS configurado",`${punto.nombre}: precisión ±${gps.precisionMetros} m, radio ${punto.radioMetros} m.`,"ok",3800);
    await renderRondinero();
  }catch(e){
    console.warn(e);
    toast("GPS requerido",e?.message || "No se pudo guardar la ubicación.","bad",4800);
  }
}

function rondineroGuardiaQrText(user){
  const payload = {
    uid: String(user?.uid || user?.id || ""),
    nombre: String(user?.nombre || user?.email || "Guardia"),
    email: String(user?.email || "")
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `RONDINERO_GUARD:${encoded}`;
}

function parseRondineroGuardiaQr(qrText){
  const prefix = "RONDINERO_GUARD:";
  if(!String(qrText || "").toUpperCase().startsWith(prefix)) return null;
  try{
    const raw = qrText.slice(prefix.length).trim();
    const data = JSON.parse(decodeURIComponent(escape(atob(raw))));
    if(!data.uid || !data.nombre) return null;
    return {
      uid: String(data.uid),
      nombre: String(data.nombre),
      email: String(data.email || "")
    };
  }catch(e){
    console.warn(e);
    return null;
  }
}

function loadRondineroGuardiaCred(){
  try{
    const raw = sessionStorage.getItem("rondinero_guardia_cred_v1");
    return raw ? JSON.parse(raw) : null;
  }catch{ return null; }
}

function saveRondineroGuardiaCred(cred){
  rondineroGuardiaCred = cred || null;
  try{
    if(rondineroGuardiaCred){
      sessionStorage.setItem("rondinero_guardia_cred_v1", JSON.stringify(rondineroGuardiaCred));
    }else{
      sessionStorage.removeItem("rondinero_guardia_cred_v1");
    }
  }catch{}
}

function getRondineroPuntosActivos(){
  return rondineroPuntos
    .filter(p => p.activo !== false)
    .sort((a,b)=>(Number(a.orden)||0)-(Number(b.orden)||0) || String(a.nombre||"").localeCompare(String(b.nombre||"")));
}

function getRondineroRutasActivas(){
  return rondineroRutas
    .filter(r => r.activo !== false)
    .sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||"")));
}

function getRondineroPuntosPorRuta(rutaId){
  const ruta = rondineroRutas.find(r => String(r.id) === String(rutaId));
  const ids = Array.isArray(ruta?.puntoIds) ? ruta.puntoIds.map(String) : [];
  const activos = new Map(getRondineroPuntosActivos().map(p => [String(p.id), p]));
  return ids.map(id => activos.get(id)).filter(Boolean);
}

function getRondineroPuntosParaRondin(rondin){
  const ids = Array.isArray(rondin?.puntoIdsEsperados) ? rondin.puntoIdsEsperados.map(String) : [];
  const activos = new Map(getRondineroPuntosActivos().map(p => [String(p.id), p]));
  return ids.map(id => activos.get(id)).filter(Boolean);
}

function getRondineroPuntoSnapshot(rondin, puntoId){
  const id = String(puntoId || "");
  const actual = rondineroPuntos.find(p => String(p.id) === id);
  if(actual) return actual;
  return (Array.isArray(rondin?.puntosEsperadosSnapshot) ? rondin.puntosEsperadosSnapshot : []).find(p => String(p.id) === id) || { id, nombre:id, ubicacion:"" };
}

function getRondineroPuntosOmitidos(rondin){
  return (Array.isArray(rondin?.puntoIdsOmitidos) ? rondin.puntoIdsOmitidos : []).map(String);
}

function getRondineroSiguientePunto(rondin){
  const visitados = new Set((rondin?.puntoIdsVisitados || []).map(String));
  const omitidos = new Set(getRondineroPuntosOmitidos(rondin));
  const siguienteId = (rondin?.puntoIdsEsperados || []).map(String).find(id => !visitados.has(id) && !omitidos.has(id));
  return siguienteId ? getRondineroPuntoSnapshot(rondin, siguienteId) : null;
}

function getRondineroActivo(){
  return rondineroRondines.find(r =>
    r.status === "en_curso" &&
    String(r.operadorUid || r.guardiaUid || "") === String(currentUser?.uid || "")
  );
}

function getRondineroEventos(rondinId){
  return rondineroEventos
    .filter(e => String(e.rondinId || "") === String(rondinId || ""))
    .sort((a,b)=>(a.createdTs||0)-(b.createdTs||0));
}

function calcRondineroStats(rondines, eventos){
  const total = rondines.length;
  const completados = rondines.filter(r => r.status === "completado").length;
  const incompletos = rondines.filter(r => r.status === "incompleto").length;
  const enCurso = rondines.filter(r => r.status === "en_curso").length;
  const puntosVisitados = rondines.reduce((sum, r) => sum + ((r.puntoIdsVisitados || []).length), 0);
  const puntosEsperados = rondines.reduce((sum, r) => sum + ((r.puntoIdsEsperados || []).length), 0);
  const novedades = eventos.filter(e => e.tipo === "novedad").length;
  const conTiempo = rondines.filter(r => typeof r.tiempoTotalMin === "number" && r.tiempoTotalMin >= 0);
  const tiempoProm = conTiempo.length
    ? Math.round(conTiempo.reduce((sum, r) => sum + r.tiempoTotalMin, 0) / conTiempo.length)
    : 0;
  const cumplimiento = puntosEsperados
    ? Math.round((puntosVisitados / puntosEsperados) * 100)
    : (total ? Math.round((completados / total) * 100) : 0);
  return {
    total,
    completados,
    incompletos,
    enCurso,
    puntosVisitados,
    puntosOmitidos: Math.max(0, puntosEsperados - puntosVisitados),
    novedades,
    tiempoProm,
    cumplimiento
  };
}

function rondineroCumplimientoIndividual(r={}){
  const esperados = Array.isArray(r.puntoIdsEsperados) ? r.puntoIdsEsperados.length : 0;
  const visitados = Array.isArray(r.puntoIdsVisitados) ? r.puntoIdsVisitados.length : 0;
  if(esperados) return Math.max(0, Math.min(100, Math.round((visitados / esperados) * 100)));
  return r.status === "completado" ? 100 : 0;
}

function rondineroPromedioCumplimiento(list=[]){
  if(!list.length) return 0;
  return Math.round(list.reduce((sum,r)=>sum+rondineroCumplimientoIndividual(r),0)/list.length);
}

function rondineroEstadoLabel(status=""){
  return status === "completado" ? "Completo" : status === "incompleto" ? "Incompleto" : status === "en_curso" ? "En curso" : String(status || "Sin estado");
}

function renderRondineroPuntoCard(p){
  const tieneGps = puntoRondineroTieneGps(p);
  const radio = Math.max(5, Number(p.radioMetros) || RONDINERO_GPS_RADIO_DEFAULT_M);
  return `
    <div class="tarjeta history-card">
      <strong>${esc(p.nombre || "Punto")}</strong>
      <small>${esc(p.ubicacion || "Sin ubicación")}</small>
      <div style="margin-top:8px;color:var(--muted);font-size:12px;">${esc(p.descripcion || "")}</div>
      <div class="meta">
        <span class="pill"><span class="dot ${p.activo === false ? "bad" : "ok"}"></span>${p.activo === false ? "Inactivo" : "Activo"}</span>
        <span class="pill">Orden ${esc(p.orden || 0)}</span>
        <span class="pill"><span class="dot ${tieneGps ? "ok" : "bad"}"></span>${tieneGps ? `GPS • radio ${esc(radio)} m` : "GPS pendiente"}</span>
      </div>
      <div class="row" style="margin-top:10px;">
        <button class="secondary" data-action="rondineroQR" data-id="${esc(p.id)}" data-no-sb="true">Ver QR</button>
        ${hasPerm("rondinero_configurar") ? `<button class="secondary" data-action="rondineroEditarPunto" data-id="${esc(p.id)}" data-no-sb="true">Editar punto</button>` : ""}
        ${hasPerm("rondinero_configurar") ? `<button class="secondary" data-action="rondineroConfigurarGps" data-id="${esc(p.id)}" data-no-sb="true">${tieneGps ? "Actualizar GPS" : "Configurar GPS"}</button>` : ""}
        ${hasPerm("rondinero_configurar") ? `<button class="secondary" data-action="rondineroTogglePunto" data-id="${esc(p.id)}" data-no-sb="true">${p.activo === false ? "Activar" : "Desactivar"}</button>` : ""}
      </div>
    </div>
  `;
}

function renderRondineroRutaCard(r){
  const puntoIds = Array.isArray(r.puntoIds) ? r.puntoIds.map(String) : [];
  const nombres = puntoIds
    .map(id => rondineroPuntos.find(p => String(p.id) === id)?.nombre)
    .filter(Boolean);
  return `
    <div class="tarjeta history-card">
      <strong>${esc(r.nombre || "Ruta")}</strong>
      <small>${esc(r.turno || "Sin turno")} • ${puntoIds.length} puntos</small>
      <div style="margin-top:8px;color:var(--muted);font-size:12px;">${esc(r.descripcion || "")}</div>
      <div class="meta">
        <span class="pill"><span class="dot ${r.activo === false ? "bad" : "ok"}"></span>${r.activo === false ? "Inactiva" : "Activa"}</span>
        ${nombres.slice(0, 4).map((n, idx) => `<span class="pill">${idx + 1}. ${esc(n)}</span>`).join("")}
        ${nombres.length > 4 ? `<span class="pill">+${nombres.length - 4}</span>` : ""}
      </div>
      <div class="row" style="margin-top:10px;">
        ${hasPerm("rondinero_configurar") ? `<button class="secondary" data-action="rondineroEditarRuta" data-id="${esc(r.id)}" data-no-sb="true">Editar y ordenar</button>` : ""}
        ${hasPerm("rondinero_configurar") ? `<button class="secondary" data-action="rondineroToggleRuta" data-id="${esc(r.id)}" data-no-sb="true">${r.activo === false ? "Activar" : "Desactivar"}</button>` : ""}
      </div>
    </div>
  `;
}

async function renderRondineroGuardia(){
  if(!requirePerm("rondinero_ejecutar","Tu rol no puede ejecutar rondines.")) return;
  currentView = "rondinero_guardia";
  rememberModuleReturn(currentView);
  try{ setActiveSb("rondinero"); }catch{}
  await syncRondineroGuardia();

  const rutas = getRondineroRutasActivas();
  const activo = getRondineroActivo();
  const puntos = activo ? getRondineroPuntosParaRondin(activo) : [];
  const eventos = activo ? getRondineroEventos(activo.id) : [];
  const visitadosCount = activo ? (activo.puntoIdsVisitados || []).length : 0;
  const omitidosCount = activo ? getRondineroPuntosOmitidos(activo).length : 0;
  const totalCount = activo ? (activo.puntoIdsEsperados || []).length : 0;
  const procesadosCount = Math.min(totalCount, visitadosCount + omitidosCount);
  const avance = totalCount ? Math.round((procesadosCount / totalCount) * 100) : 0;
  const siguientePunto = activo ? getRondineroSiguientePunto(activo) : null;
  const siguienteOrden = siguientePunto ? (activo.puntoIdsEsperados || []).map(String).indexOf(String(siguientePunto.id)) + 1 : 0;
  const ultimoScan = eventos.filter(e => e.tipo === "scan").slice(-1)[0];
  const novedades = eventos.filter(e => e.tipo === "novedad").length;

  appEl.innerHTML = `
    <section class="provider-dashboard-modern rondinero-modern">
      <div class="provider-dashboard-hero">
        <div class="provider-dashboard-hero-copy">
          <div class="provider-dashboard-hero-icon" aria-hidden="true">🛡️</div>
          <div>
            <h2>Mi rondín</h2>
            <p>Escanea los puntos asignados y reporta novedades del recorrido.</p>
          </div>
        </div>
        <div class="provider-dashboard-date"><span aria-hidden="true">●</span>${new Date().toLocaleDateString()}</div>
      </div>
      <div class="dashboard-toolbar">
        <span class="pill"><span class="dot ${activo ? "ok" : "muted"}"></span>${activo ? "Rondín en curso" : "Sin rondín activo"}</span>
        <button class="secondary" data-action="rondineroRefresh">Actualizar</button>
        <button class="secondary" data-action="home">Volver</button>
      </div>

      ${activo ? `
        <div class="tarjeta history-card rondinero-guard-card">
          <div class="row" style="justify-content:space-between;align-items:flex-start;">
            <div>
              <strong>Rondín en curso</strong>
              <small>${esc(activo.guardiaNombre || "Guardia")} • ${esc(activo.rutaNombre || "Ruta")} • ${esc(activo.turno || "Sin turno")} • ${esc(new Date(activo.inicioTs || Date.now()).toLocaleString())}</small>
            </div>
            <span class="pill"><span class="dot info"></span>${procesadosCount}/${totalCount} puntos procesados</span>
          </div>
          <div style="height:10px;"></div>
          <div style="height:10px;border-radius:999px;background:rgba(148,163,184,.22);overflow:hidden;">
            <div style="width:${avance}%;height:100%;background:var(--accent);"></div>
          </div>
          <div style="margin-top:12px;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--panel2);">
            ${siguientePunto ? `<strong>Siguiente punto: ${siguienteOrden}. ${esc(siguientePunto.nombre || siguientePunto.id)}</strong><small>${esc(siguientePunto.ubicacion || "Sigue el orden definido en la ruta.")}</small>` : `<strong>Secuencia terminada</strong><small>Todos los puntos fueron visitados u omitidos con justificación.</small>`}
          </div>
          <div class="row" style="margin-top:12px;">
            <button data-action="rondineroScan" ${siguientePunto ? "" : "disabled"}>Escanear punto</button>
            <button class="secondary" data-action="rondineroOmitir" ${siguientePunto ? "" : "disabled"}>Omitir con justificación</button>
            <button class="secondary" data-action="rondineroNovedad">Reportar novedad</button>
            <button class="ok" data-action="rondineroCerrar">Cerrar rondín</button>
          </div>
        </div>

        <div class="divider"></div>
        <div class="grid rondinero-stat-grid">
          <div class="tarjeta"><strong>${visitadosCount}</strong><small>Puntos registrados</small></div>
          <div class="tarjeta"><strong>${omitidosCount}</strong><small>Omitidos justificados</small></div>
          <div class="tarjeta"><strong>${Math.max(0, totalCount - procesadosCount)}</strong><small>Puntos pendientes</small></div>
          <div class="tarjeta"><strong>${novedades}</strong><small>Novedades</small></div>
        </div>

        <div style="height:12px;"></div>
        <div class="tarjeta history-card rondinero-guard-card">
          <strong>Último registro</strong>
          <small>${ultimoScan ? esc(new Date(ultimoScan.createdTs || Date.now()).toLocaleString()) : "Aún no hay puntos registrados."}</small>
        </div>
      ` : `
        <div class="tarjeta history-card rondinero-guard-card">
          <strong>Sin rondín en curso</strong>
          <small>${rutas.length ? "Escanea la credencial del guardia y selecciona la ruta asignada." : "No hay rutas activas configuradas."}</small>
          <div style="height:10px;"></div>
          ${rondineroGuardiaCred ? `
            <div class="pill"><span class="dot ok"></span>Guardia: <b style="margin-left:6px;color:var(--text);">${esc(rondineroGuardiaCred.nombre)}</b></div>
            <div class="row" style="margin-top:10px;">
              <button class="secondary" data-action="rondineroScanGuardia">Cambiar guardia</button>
              <button class="secondary" data-action="rondineroClearGuardia">Quitar guardia</button>
            </div>
          ` : `
            <button data-action="rondineroScanGuardia">Escanear credencial de guardia</button>
          `}
          ${rutas.length && rondineroGuardiaCred ? `
            <div style="height:10px;"></div>
            <label>Ruta *</label>
            <select id="rondRutaInicio">
              ${rutas.map(r => `<option value="${esc(r.id)}">${esc(r.nombre)}${r.turno ? ` • ${esc(r.turno)}` : ""}</option>`).join("")}
            </select>
          ` : ""}
          <div style="margin-top:12px;color:var(--muted);font-size:12px;">
            ${!rutas.length
              ? "Para iniciar se necesita al menos una ruta activa con puntos asignados."
              : !rondineroGuardiaCred
                ? "Primero escanea la credencial del guardia."
                : "Todo listo. Presiona el botón para comenzar el recorrido."}
          </div>
          <div class="row" style="margin-top:10px;">
            <button data-action="rondineroIniciar">Iniciar rondín</button>
          </div>
        </div>
      `}
    </section>
  `;
}

async function renderRondinero(){
  if(!requirePerm("rondinero_ver","Tu rol no puede usar Rondinero.")) return;
  if(!hasPerm("rondinero_configurar") && !hasPerm("rondinero_reportes")){
    return renderRondineroGuardia();
  }
  currentView = "rondinero";
  rememberModuleReturn(currentView);
  try{ setActiveSb("rondinero"); }catch{}
  await syncRondinero();

  const puntos = getRondineroPuntosActivos();
  const rutas = getRondineroRutasActivas();
  const puedeConfigurar = hasPerm("rondinero_configurar");
  const puedeReportes = hasPerm("rondinero_reportes");
  const rondinesHoy = rondineroRondines.filter(r => r.fecha === todayISO());
  const eventosHoy = rondineroEventos.filter(e => e.fecha === todayISO());
  const statsHoy = calcRondineroStats(rondinesHoy, eventosHoy);
  const statsTotal = calcRondineroStats(rondineroRondines, rondineroEventos);
  const guardiasDisponibles = Array.from(new Set(rondineroRondines.map(r=>r.guardiaNombre||r.guardiaEmail||"Guardia")))
    .sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
  const desdeTs = rondineroHistDesde ? new Date(`${rondineroHistDesde}T00:00:00`).getTime() : 0;
  const hastaTs = rondineroHistHasta ? new Date(`${rondineroHistHasta}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  const searchNorm = rondineroHistSearch.trim().toLowerCase();
  const rondinesHistorialFiltrados = rondineroRondines.filter(r=>{
    const guardia=r.guardiaNombre||r.guardiaEmail||"Guardia";
    const ts=Number(r.inicioTs||r.createdTs||0);
    const haystack=[guardia,r.rutaNombre,r.turno,r.status,r.fecha].map(x=>String(x||"").toLowerCase()).join(" ");
    return (!rondineroHistGuardia||guardia===rondineroHistGuardia)
      && (!searchNorm||haystack.includes(searchNorm))
      && (!desdeTs||ts>=desdeTs)
      && (!Number.isFinite(hastaTs)||ts<=hastaTs);
  });
  const porGuardia = Object.entries(rondinesHistorialFiltrados.reduce((acc, r) => {
    const key = r.guardiaNombre || r.guardiaEmail || "Guardia";
    if(!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {})).map(([guardia, list]) => {
    const sorted = list.slice().sort((a,b)=>(b.inicioTs || b.createdTs || 0)-(a.inicioTs || a.createdTs || 0));
    const ids = new Set(list.map(r=>String(r.id)));
    const eventosGuardia = rondineroEventos.filter(e => ids.has(String(e.rondinId)));
    return { guardia, list:sorted, promedio:rondineroPromedioCumplimiento(list), ...calcRondineroStats(list, eventosGuardia) };
  }).sort((a,b)=>a.guardia.localeCompare(b.guardia,"es",{sensitivity:"base"}));
  const porTurno = Object.entries(rondineroRondines.reduce((acc, r) => {
    const key = r.turno || "Sin turno";
    if(!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {})).map(([turno, list]) => ({ turno, ...calcRondineroStats(list, rondineroEventos.filter(e => list.some(r => r.id === e.rondinId))) }));
  const tabs = [
    ...(puedeConfigurar ? [
      { key:"puntos", label:"Puntos de control" },
      { key:"rutas", label:"Rutas" }
    ] : []),
    ...(puedeReportes ? [
      { key:"historial", label:"Historial por guardia" },
      { key:"turnos", label:"Cumplimiento turno" },
    ] : [])
  ];
  if(!tabs.some(t => t.key === rondineroAdminTab)){
    rondineroAdminTab = tabs[0]?.key || "puntos";
  }
  const tabNav = `
    <div class="divider"></div>
    <div class="rondinero-tabs" role="tablist">
      ${tabs.map(t => `
        <button class="rondinero-tab ${rondineroAdminTab === t.key ? "active" : ""}" data-action="rondineroTab" data-tab="${esc(t.key)}" type="button">${esc(t.label)}</button>
      `).join("")}
    </div>
  `;
  const puntosTab = `
    <div class="divider"></div>
    <h3 style="margin:0 0 10px;">Puntos de control</h3>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
      <div><label>Nombre *</label><input id="rondPuntoNombre" placeholder="Ej. Caseta principal"></div>
      <div><label>Ubicación *</label><input id="rondPuntoUbicacion" placeholder="Ej. Acceso norte"></div>
      <div><label>Orden</label><input id="rondPuntoOrden" type="number" min="0" value="${puntos.length + 1}"></div>
      <div><label>Latitud (opcional)</label><input id="rondPuntoLatitud" type="number" step="0.0000001" placeholder="Puede configurarse después"></div>
      <div><label>Longitud (opcional)</label><input id="rondPuntoLongitud" type="number" step="0.0000001" placeholder="Puede configurarse después"></div>
      <div><label>Radio permitido (m)</label><input id="rondPuntoRadio" type="number" min="5" max="200" value="${RONDINERO_GPS_RADIO_DEFAULT_M}"></div>
      <div style="grid-column:1/-1;"><label>Descripción</label><textarea id="rondPuntoDesc" rows="2" placeholder="Referencia breve del punto"></textarea></div>
    </div>
    <div class="row" style="margin-top:10px;">
      <button class="secondary" type="button" data-action="rondineroCapturarGps">Capturar ubicación actual</button>
      <button data-action="rondineroGuardarPunto">Guardar punto</button>
    </div>
    <div id="rondPuntoGpsPrecision" style="margin-top:8px;color:var(--muted);font-size:12px;">Puedes guardar el punto ahora y configurar su GPS posteriormente desde la tarjeta del punto.</div>
    <div style="height:12px;"></div>
    <div class="dashboard-pending-list">
      ${rondineroPuntos.length ? rondineroPuntos.map(renderRondineroPuntoCard).join("") : `<div style="color:var(--muted);font-size:12px;">Sin puntos registrados.</div>`}
    </div>
  `;
  const rutasTab = `
    <div class="divider"></div>
    <h3 style="margin:0 0 10px;">Rutas de rondín</h3>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
      <div><label>Nombre de ruta *</label><input id="rondRutaNombre" placeholder="Ej. Ruta nocturna patio"></div>
      <div><label>Turno</label><select id="rondRutaTurno"><option>Día</option><option>Tarde</option><option>Noche</option><option>Mixto</option></select></div>
      <div style="grid-column:1/-1;"><label>Descripción</label><textarea id="rondRutaDesc" rows="2" placeholder="Referencia breve de la ruta"></textarea></div>
    </div>
    <div style="height:10px;"></div>
    <label>Puntos de la ruta *</label>
    <div class="dashboard-pending-list" style="max-height:260px;overflow:auto;">
      ${puntos.length ? puntos.map(p => `
        <label class="tarjeta history-card" style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;">
          <input type="checkbox" class="rondRutaPunto" value="${esc(p.id)}" style="width:auto;margin-top:3px;">
          <span><strong>${esc(p.nombre)}</strong><small>${esc(p.ubicacion || "")}</small></span>
        </label>
      `).join("") : `<div style="color:var(--muted);font-size:12px;">Registra puntos activos antes de crear rutas.</div>`}
    </div>
    <div class="row" style="margin-top:10px;"><button data-action="rondineroGuardarRuta" ${puntos.length ? "" : "disabled"}>Guardar ruta</button></div>
    <div style="height:12px;"></div>
    <div class="dashboard-pending-list">
      ${rondineroRutas.length ? rondineroRutas.map(renderRondineroRutaCard).join("") : `<div style="color:var(--muted);font-size:12px;">Sin rutas registradas.</div>`}
    </div>
  `;
  const turnosTab = `
    <div class="divider"></div>
    <h3 style="margin:0 0 10px;">Cumplimiento por turno</h3>
    <div class="dashboard-pending-list">
      ${porTurno.map(t => `
        <div class="tarjeta history-card">
          <strong>${esc(t.turno)}</strong>
          <div class="meta">
            <span class="pill">${esc(t.total)} rondines</span>
            <span class="pill" title="Puntos visitados entre puntos esperados"><span class="dot ok"></span>${esc(t.cumplimiento)}% de puntos</span>
            <span class="pill">${esc(t.completados)} completos</span>
            <span class="pill">${esc(t.incompletos)} incompletos</span>
            <span class="pill">${esc(t.puntosOmitidos)} omitidos</span>
            <span class="pill">${esc(t.tiempoProm)} min prom.</span>
          </div>
        </div>
      `).join("") || `<div style="color:var(--muted);font-size:12px;">Sin datos por turno.</div>`}
    </div>
  `;
  const historialTab = `
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
      <div><h3 style="margin:0 0 4px;">Historial y cumplimiento por guardia</h3><div style="color:var(--muted);font-size:12px;">Pulsa + para desplegar los recorridos de cada guardia.</div></div>
      <span class="pill">${esc(rondinesHistorialFiltrados.length)} de ${esc(rondineroRondines.length)} registros</span>
    </div>
    <div class="card" style="margin:0 0 14px;padding:14px;box-shadow:none;">
      <div style="font-weight:900;margin-bottom:10px;">Buscar y filtrar recorridos</div>
      <div class="grid" style="grid-template-columns:minmax(190px,1.4fr) minmax(180px,1fr) minmax(145px,.7fr) minmax(145px,.7fr);gap:10px;align-items:end;">
        <div><label>Buscar</label><input id="rondHistSearch" value="${esc(rondineroHistSearch)}" placeholder="Guardia, ruta, turno o estado"></div>
        <div><label>Guardia</label><select id="rondHistGuardia"><option value="">Todos los guardias</option>${guardiasDisponibles.map(g=>`<option value="${esc(g)}" ${rondineroHistGuardia===g?"selected":""}>${esc(g)}</option>`).join("")}</select></div>
        <div><label>Desde</label><input id="rondHistDesde" type="date" value="${esc(rondineroHistDesde)}"></div>
        <div><label>Hasta</label><input id="rondHistHasta" type="date" value="${esc(rondineroHistHasta)}"></div>
      </div>
      <div class="row" style="margin-top:10px;justify-content:flex-end;"><button class="secondary" data-action="rondineroLimpiarFiltros">Limpiar</button><button data-action="rondineroAplicarFiltros">Aplicar filtros</button></div>
    </div>
    <div class="rondinero-history-tree">
      ${porGuardia.map(g => `
        <details class="rondinero-guard-node">
          <summary class="rondinero-guard-summary">
            <span class="rondinero-guard-name"><span class="rondinero-tree-toggle">+</span><span>${esc(g.guardia)}</span></span>
            <span class="rondinero-guard-metric"><b>${esc(g.total)}</b><small>Rondines</small></span>
            <span class="rondinero-guard-metric"><b>${esc(g.promedio)}%</b><small>Promedio</small></span>
            <span class="rondinero-guard-metric"><b>${esc(g.completados)}</b><small>Completos</small></span>
            <span class="rondinero-guard-metric"><b>${esc(g.incompletos)}</b><small>Incompletos</small></span>
          </summary>
          <div class="rondinero-child-wrap">
            <div class="rondinero-child-head"><span>Fecha y ruta</span><span>Estado</span><span>Cumplimiento</span><span>Puntos</span><span>Novedades</span><span>Acciones</span></div>
            ${g.list.map(r => {
              const visitados=(r.puntoIdsVisitados||[]).length, esperados=(r.puntoIdsEsperados||[]).length;
              const novedadesRondin=rondineroEventos.filter(e=>String(e.rondinId)===String(r.id)&&e.tipo==="novedad").length;
              const tono=r.status==="completado"?"ok":r.status==="incompleto"?"bad":"info";
              return `<div class="rondinero-child-row">
                <span class="rondinero-child-main"><b>${esc(new Date(r.inicioTs||r.createdTs||Date.now()).toLocaleString())}</b><small>${esc(r.rutaNombre||"Ruta")} • ${esc(r.turno||"Sin turno")}</small></span>
                <span><span class="pill"><span class="dot ${tono}"></span>${esc(rondineroEstadoLabel(r.status))}</span></span>
                <span><b>${esc(rondineroCumplimientoIndividual(r))}%</b></span>
                <span>${esc(visitados)}/${esc(esperados)}</span>
                <span>${esc(novedadesRondin)}</span>
                <span class="rondinero-child-actions">
                  <button class="secondary" data-action="rondineroDetalle" data-id="${esc(r.id)}" data-no-sb="true">Ver</button>
                  ${currentUser?.role===ROLES.ADMIN?`<button class="secondary" data-action="rondineroEditarRegistro" data-id="${esc(r.id)}" data-no-sb="true">Editar</button><button class="danger" data-action="rondineroEliminarRegistro" data-id="${esc(r.id)}" data-no-sb="true">Eliminar</button>`:""}
                </span>
              </div>`;
            }).join("")}
          </div>
        </details>
      `).join("") || `<div style="color:var(--muted);font-size:12px;">Sin rondines registrados.</div>`}
    </div>
  `;
  const activeTabContent = {
    puntos: puntosTab,
    rutas: rutasTab,
    turnos: turnosTab,
    historial: historialTab
  }[rondineroAdminTab] || "";

  appEl.innerHTML = `
    <section class="provider-dashboard-modern rondinero-modern">
      <div class="provider-dashboard-hero">
        <div class="provider-dashboard-hero-copy">
          <div class="provider-dashboard-hero-icon" aria-hidden="true">🛡️</div>
          <div>
            <h2>Rondinero</h2>
            <p>Rondines digitales por puntos QR, evidencia GPS y fotografías comprimidas en novedades.</p>
          </div>
        </div>
        <div class="provider-dashboard-date"><span aria-hidden="true">●</span>${new Date().toLocaleDateString()}</div>
      </div>
      <div class="dashboard-toolbar">
        <span class="pill">Hoy: <b style="color:var(--text);margin-left:6px;">${statsHoy.total} rondines</b></span>
        <button class="secondary" data-action="rondineroRefresh">Actualizar</button>
        <button class="secondary" data-action="home">Volver</button>
      </div>
      <div class="grid rondinero-stat-grid">
        <div class="tarjeta"><strong>${puntos.length}</strong><small>Puntos activos</small></div>
        <div class="tarjeta"><strong>${rutas.length}</strong><small>Rutas activas</small></div>
        <div class="tarjeta"><strong>${statsHoy.total}</strong><small>Rondines hoy</small></div>
        <div class="tarjeta"><strong>${statsHoy.cumplimiento}%</strong><small>Cumplimiento de puntos hoy</small></div>
        <div class="tarjeta"><strong>${statsTotal.tiempoProm} min</strong><small>Tiempo promedio</small></div>
        <div class="tarjeta"><strong>${statsTotal.puntosOmitidos}</strong><small>Puntos omitidos</small></div>
        <div class="tarjeta"><strong>${statsTotal.novedades}</strong><small>Novedades</small></div>
      </div>

      <div class="rondinero-workspace">
        ${tabNav}
        ${activeTabContent}
      </div>
    </section>
    <div class="modal-overlay vale-modal" id="rondRutaEditModal" style="display:none;">
      <div class="modal" style="max-width:960px;">
        <div class="modal-head">
          <div><h3 style="margin:0;">Editar y ordenar ruta</h3><small>Organiza visualmente la secuencia exacta del recorrido.</small></div>
          <div class="modal-actions"><button class="secondary" data-action="rondineroCerrarEditorRuta">Cerrar</button></div>
        </div>
        <div class="modal-body" id="rondRutaEditBody"></div>
      </div>
    </div>
  `;
}

async function guardarRondineroPunto(){
  if(!requirePerm("rondinero_configurar","Tu rol no puede configurar puntos.")) return;
  const nombre = document.getElementById("rondPuntoNombre")?.value.trim() || "";
  const ubicacion = document.getElementById("rondPuntoUbicacion")?.value.trim() || "";
  const descripcion = document.getElementById("rondPuntoDesc")?.value.trim() || "";
  const orden = Number(document.getElementById("rondPuntoOrden")?.value || 0);
  const latitudRaw = document.getElementById("rondPuntoLatitud")?.value.trim() || "";
  const longitudRaw = document.getElementById("rondPuntoLongitud")?.value.trim() || "";
  const latitud = latitudRaw === "" ? NaN : Number(latitudRaw);
  const longitud = longitudRaw === "" ? NaN : Number(longitudRaw);
  const gpsVacio = latitudRaw === "" && longitudRaw === "";
  const gpsCompleto = latitudRaw !== "" && longitudRaw !== "";
  const radioMetros = Number(document.getElementById("rondPuntoRadio")?.value || RONDINERO_GPS_RADIO_DEFAULT_M);
  if(!nombre || !ubicacion){
    toast("Campos obligatorios","Nombre y ubicación son requeridos.","warn",2600);
    return;
  }
  if(!gpsVacio && (!gpsCompleto || !Number.isFinite(latitud) || latitud < -90 || latitud > 90 ||
     !Number.isFinite(longitud) || longitud < -180 || longitud > 180)){
    toast("GPS incompleto","Captura latitud y longitud válidas, o deja ambos campos vacíos para configurarlos después.","warn",4200);
    return;
  }
  if(!Number.isFinite(radioMetros) || radioMetros < 5 || radioMetros > 200){
    toast("Radio inválido","El radio permitido debe estar entre 5 y 200 metros.","warn",3400);
    return;
  }
  const id = `RP-${Date.now()}`;
  const punto = {
    id,
    nombre,
    ubicacion,
    descripcion,
    orden,
    radioMetros: Math.round(radioMetros),
    ...(gpsCompleto ? { latitud, longitud } : {}),
    qrCode: rondineroQrText(id),
    activo: true,
    createdByUid: currentUser?.uid || "",
    createdByEmail: currentUser?.email || "",
    createdTs: Date.now(),
    updatedTs: Date.now()
  };
  rondineroPuntos.unshift(punto);
  saveRondineroLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertRondineroPunto(punto); }catch(e){ console.warn(e); }
  }
  toast("Rondinero",gpsCompleto ? "Punto guardado con GPS." : "Punto guardado. GPS pendiente de configurar.",gpsCompleto ? "ok" : "warn",3200);
  await renderRondinero();
}

function solicitarEdicionRondineroRegistro(r){
  return new Promise(resolve=>{
    const back=document.createElement("div");
    back.className="modal-backdrop";
    back.innerHTML=`<div class="modal" style="max-width:620px;">
      <h3 style="margin-top:0;">Editar datos administrativos</h3>
      <p class="muted">Las evidencias, puntos, GPS, fotografías, horas y porcentaje de cumplimiento permanecerán sin cambios.</p>
      <label>Nombre del guardia</label><input id="rondEditGuardia" maxlength="120" value="${esc(r.guardiaNombre||"")}">
      <label>Nombre de la ruta</label><input id="rondEditRuta" maxlength="120" value="${esc(r.rutaNombre||"")}">
      <label>Turno</label><select id="rondEditTurno">${["Día","Tarde","Noche","Mixto","Sin turno"].map(x=>`<option ${String(r.turno||"Sin turno")===x?"selected":""}>${x}</option>`).join("")}</select>
      <label>Nota administrativa</label><textarea id="rondEditNota" rows="3" maxlength="300" placeholder="Motivo de la corrección">${esc(r.observacionAdministrativa||"")}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:14px;"><button class="secondary" id="rondEditCancel">Cancelar</button><button id="rondEditSave">Guardar cambios</button></div>
    </div>`;
    document.body.appendChild(back);
    const close=value=>{back.remove();resolve(value);};
    back.querySelector("#rondEditCancel").onclick=()=>close(null);
    back.querySelector("#rondEditSave").onclick=()=>{
      const guardiaNombre=back.querySelector("#rondEditGuardia").value.trim();
      const rutaNombre=back.querySelector("#rondEditRuta").value.trim();
      const turno=back.querySelector("#rondEditTurno").value;
      const observacionAdministrativa=back.querySelector("#rondEditNota").value.trim();
      if(!guardiaNombre||!rutaNombre){toast("Datos requeridos","Escribe el nombre del guardia y de la ruta.","warn",3200);return;}
      if(observacionAdministrativa.length<5){toast("Motivo requerido","Describe brevemente el motivo de la corrección.","warn",3200);return;}
      close({guardiaNombre,rutaNombre,turno,observacionAdministrativa});
    };
    back.addEventListener("click",e=>{if(e.target===back)close(null);});
  });
}

async function editarRondineroRegistro(id){
  if(currentUser?.role!==ROLES.ADMIN)return toast("Acceso denegado","Sólo Administrador puede editar recorridos.","bad",3400);
  const r=rondineroRondines.find(x=>String(x.id)===String(id));
  if(!r)return toast("No encontrado","El rondín ya no existe.","warn",3000);
  if(r.status==="en_curso")return toast("Rondín activo","Cierra el recorrido antes de editar sus datos administrativos.","warn",4200);
  if(!navigator.onLine)return toast("Sin conexión","La edición debe confirmarse directamente en Firebase.","warn",4200);
  const cambios=await solicitarEdicionRondineroRegistro(r);if(!cambios)return;
  if(!(await requireAdminPin("editar los datos administrativos del rondín")))return;
  const before={guardiaNombre:r.guardiaNombre||"",rutaNombre:r.rutaNombre||"",turno:r.turno||"",observacionAdministrativa:r.observacionAdministrativa||""};
  const updated={...r,...cambios,updatedTs:Date.now(),historialAdministrativo:[...(Array.isArray(r.historialAdministrativo)?r.historialAdministrativo:[]),{ts:Date.now(),accion:"editar",porUid:currentUser?.uid||"",porEmail:currentUser?.email||"",antes:before,despues:cambios}]};
  try{
    await cloudUpsertRondineroRondin(updated);
    Object.assign(r,updated);saveRondineroLocal();
    toast("Rondín actualizado","Los datos administrativos fueron corregidos y auditados.","ok",3800);
    await renderRondinero();
  }catch(error){console.error(error);toast("No se pudo editar",error?.message||"Firebase rechazó la actualización.","bad",4600);}
}

async function eliminarRondineroRegistro(id){
  if(currentUser?.role!==ROLES.ADMIN)return toast("Acceso denegado","Sólo Administrador puede eliminar recorridos.","bad",3400);
  const r=rondineroRondines.find(x=>String(x.id)===String(id));
  if(!r)return toast("No encontrado","El rondín ya no existe.","warn",3000);
  if(r.status==="en_curso")return toast("Rondín activo","Cierra el recorrido antes de eliminarlo.","warn",4200);
  if(!navigator.onLine)return toast("Sin conexión","La eliminación debe confirmarse directamente en Firebase.","warn",4200);
  const eventos=rondineroEventos.filter(e=>String(e.rondinId)===String(id));
  if(!confirm(`¿Eliminar definitivamente el rondín de ${r.guardiaNombre||"Guardia"} y sus ${eventos.length} eventos?\n\nEsta acción no se puede deshacer.`))return;
  if(!(await requireAdminPin("eliminar el rondín y todas sus evidencias")))return;
  try{
    const batch=writeBatch(db);
    batch.delete(doc(db,COL_RONDINERO_RONDINES,String(id)));
    eventos.forEach(e=>batch.delete(doc(db,COL_RONDINERO_EVENTOS,String(e.id))));
    await batch.commit();
    rondineroRondines=rondineroRondines.filter(x=>String(x.id)!==String(id));
    rondineroEventos=rondineroEventos.filter(e=>String(e.rondinId)!==String(id));
    saveRondineroLocal();
    toast("Rondín eliminado",`Se eliminaron el recorrido y ${eventos.length} eventos relacionados.`,"ok",4200);
    await renderRondinero();
  }catch(error){console.error(error);toast("No se pudo eliminar",error?.message||"Firebase rechazó la eliminación.","bad",4600);}
}

function getRondineroNovedadPuntoId(novedad, scans=[]){
  if(novedad?.puntoId) return String(novedad.puntoId);
  const previo = scans
    .filter(s => Number(s.createdTs || 0) <= Number(novedad?.createdTs || 0))
    .sort((a,b) => Number(b.createdTs || 0) - Number(a.createdTs || 0))[0];
  return previo?.puntoId ? String(previo.puntoId) : "";
}

async function renderRondineroDetalle(id){
  if(!requirePerm("rondinero_reportes","Tu rol no puede ver detalle de rondines.")) return;
  await syncRondinero(true);
  const r = rondineroRondines.find(x => String(x.id) === String(id));
  if(!r){
    toast("Rondinero","No se encontró el recorrido.","warn",2600);
    return renderRondinero();
  }
  currentView = "rondinero_detalle";
  try{ setActiveSb("rondinero"); }catch{}

  const eventos = getRondineroEventos(r.id);
  const scans = eventos.filter(e => e.tipo === "scan");
  const omisiones = eventos.filter(e => e.tipo === "omision");
  const novedades = eventos.filter(e => e.tipo === "novedad");
  const puntoIdDeNovedad = n => getRondineroNovedadPuntoId(n, scans);
  const novedadesGenerales = novedades.filter(n => !puntoIdDeNovedad(n));
  const renderNovedadEnPunto = n => `
    <div style="margin-top:10px;padding:10px;border-radius:10px;border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.08);">
      <div style="font-size:11px;font-weight:900;color:var(--warn);">NOVEDAD • ${esc(new Date(n.createdTs || Date.now()).toLocaleString())}</div>
      <div style="margin-top:5px;color:var(--text);white-space:pre-wrap;">${esc(n.observaciones || "")}</div>
      ${String(n.fotoDataUrl || "").startsWith("data:image/jpeg;base64,") ? `<img src="${n.fotoDataUrl}" alt="Fotografía de la novedad" loading="lazy" style="display:block;width:100%;max-height:220px;object-fit:cover;margin-top:8px;border-radius:9px;border:1px solid var(--border);background:var(--panel2);">` : ""}
    </div>
  `;
  const esperados = (r.puntoIdsEsperados || []).map(String);
  const visitados = new Set((r.puntoIdsVisitados || []).map(String));
  const puntosDetalle = esperados.map(pid => {
    const punto = getRondineroPuntoSnapshot(r, pid);
    const evento = scans.find(e => String(e.puntoId) === pid);
    const omision = omisiones.find(e => String(e.puntoId) === pid);
    return { puntoId: pid, punto, evento, omision };
  });
  const avance = esperados.length ? Math.round((visitados.size / esperados.length) * 100) : 0;
  const tiempoTotal = typeof r.tiempoTotalMin === "number"
    ? `${r.tiempoTotalMin} min`
    : (r.inicioTs ? `${Math.max(0, Math.round(((r.finTs || Date.now()) - r.inicioTs) / 60000))} min` : "-");

  appEl.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start;">
        <div>
          <h2 style="margin:0 0 4px;">Detalle del recorrido</h2>
          <div style="color:var(--muted);font-size:12px;">${esc(r.rutaNombre || "Ruta")} • ${esc(r.turno || "Sin turno")}</div>
        </div>
        <div class="row">
          <button class="secondary" data-action="rondinero">Volver</button>
          <button class="secondary" data-action="rondineroPdf" data-id="${esc(r.id)}">Generar PDF</button>
        </div>
      </div>

      <div class="divider"></div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
        <div class="tarjeta"><strong>${esc(r.guardiaNombre || "Guardia")}</strong><small>Guardia</small></div>
        <div class="tarjeta"><strong>${esc(r.status || "-")}</strong><small>Estatus</small></div>
        <div class="tarjeta"><strong>${visitados.size}/${esperados.length}</strong><small>Puntos</small></div>
        <div class="tarjeta"><strong>${avance}%</strong><small>Avance</small></div>
        <div class="tarjeta"><strong>${esc(tiempoTotal)}</strong><small>Tiempo total</small></div>
        <div class="tarjeta"><strong>${novedades.length}</strong><small>Novedades</small></div>
      </div>

      <div class="divider"></div>
      <h3 style="margin:0 0 10px;">Puntos del recorrido</h3>
      <div class="dashboard-pending-list">
         ${puntosDetalle.map((item, idx) => {
           const ev = item.evento;
           const om = item.omision;
           const novedadesPunto = novedades.filter(n => puntoIdDeNovedad(n) === String(item.puntoId));
           return `
             <div class="tarjeta history-card">
              <strong>${idx + 1}. ${esc(item.punto.nombre || item.puntoId)}</strong>
              <small>${esc(item.punto.ubicacion || ev?.ubicacion || "")}</small>
              <div class="meta">
                <span class="pill"><span class="dot ${ev ? "ok" : om ? "warn" : "bad"}"></span>${ev ? "Visitado" : om ? "Omitido con justificación" : "No procesado"}</span>
                ${ev ? `<span class="pill">${esc(new Date(ev.createdTs || Date.now()).toLocaleString())}</span>` : ""}
                ${om ? `<span class="pill">${esc(new Date(om.createdTs || Date.now()).toLocaleString())}</span>` : ""}
                 ${ev?.gpsValidado ? `<span class="pill"><span class="dot ok"></span>GPS validado • ${esc(ev.gpsDistanciaMetros)} m • precisión ±${esc(ev.gpsPrecisionMetros)} m</span>` : (ev ? `<span class="pill"><span class="dot bad"></span>Sin evidencia GPS</span>` : "")}
               </div>
               ${om ? `<div style="margin-top:10px;padding:10px;border-radius:10px;border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.08);"><b>Motivo de omisión:</b> ${esc(om.motivoOmision || om.observaciones || "Sin detalle")}${String(om.fotoDataUrl || "").startsWith("data:image/jpeg;base64,") ? `<img src="${om.fotoDataUrl}" alt="Evidencia de la omisión" loading="lazy" style="display:block;width:100%;max-height:220px;object-fit:cover;margin-top:8px;border-radius:9px;border:1px solid var(--border);">` : ""}</div>` : ""}
               ${novedadesPunto.map(renderNovedadEnPunto).join("")}
             </div>
           `;
         }).join("") || `<div style="color:var(--muted);font-size:12px;">Sin puntos esperados.</div>`}
         ${novedadesGenerales.length ? `
           <div class="tarjeta history-card">
             <strong>Novedades generales</strong>
             <small>Sin punto relacionado</small>
             ${novedadesGenerales.map(renderNovedadEnPunto).join("")}
           </div>
         ` : ""}
       </div>
     </div>
  `;
}

async function generarPdfRondinero(id){
  const r = rondineroRondines.find(x => String(x.id) === String(id));
  if(!r){
    toast("PDF","No se encontró el recorrido.","warn",3000);
    return;
  }
  if(!await loadFeatureDependencies("pdf", "la generación de PDF")) return;
  const JsPdf = window.jspdf?.jsPDF;
  if(!JsPdf){
    toast("PDF","La librería para generar el PDF aún no está disponible. Revisa la conexión y vuelve a intentar.","bad",4800);
    return;
  }

  const eventos = getRondineroEventos(r.id);
  const scans = eventos.filter(e => e.tipo === "scan");
  const omisiones = eventos.filter(e => e.tipo === "omision");
  const novedades = eventos.filter(e => e.tipo === "novedad");
  const esperados = (r.puntoIdsEsperados || []).map(String);
  const visitados = new Set((r.puntoIdsVisitados || []).map(String));
  const avance = esperados.length ? Math.round((visitados.size / esperados.length) * 100) : 0;
  const tiempoTotal = typeof r.tiempoTotalMin === "number"
    ? `${r.tiempoTotalMin} min`
    : (r.inicioTs ? `${Math.max(0, Math.round(((r.finTs || Date.now()) - r.inicioTs) / 60000))} min` : "-");
  const docPdf = new JsPdf({ orientation:"portrait", unit:"mm", format:"a4", compress:true });
  const pageWidth = docPdf.internal.pageSize.getWidth();
  const pageHeight = docPdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const clean = value => String(value ?? "").replace(/[•]/g, "-");
  const addPageIfNeeded = height => {
    if(y + height <= pageHeight - 17) return;
    docPdf.addPage();
    y = margin;
  };
  const addWrappedText = (text, x, width, options={}) => {
    const size = options.size || 9;
    const lineHeight = options.lineHeight || 4.5;
    docPdf.setFont("helvetica", options.bold ? "bold" : "normal");
    docPdf.setFontSize(size);
    docPdf.setTextColor(...(options.color || [31,41,55]));
    const lines = docPdf.splitTextToSize(clean(text), width);
    addPageIfNeeded(lines.length * lineHeight + 2);
    docPdf.text(lines, x, y);
    y += lines.length * lineHeight;
    return lines.length;
  };
  const addNovedad = n => {
    const lines = docPdf.splitTextToSize(clean(n.observaciones || "Sin descripción"), contentWidth - 10);
    const baseHeight = 12 + lines.length * 4.2;
    addPageIfNeeded(baseHeight + 2);
    docPdf.setFillColor(255,247,237);
    docPdf.setDrawColor(245,158,11);
    docPdf.roundedRect(margin, y, contentWidth, baseHeight, 2, 2, "FD");
    y += 5;
    docPdf.setFont("helvetica","bold");
    docPdf.setFontSize(8);
    docPdf.setTextColor(180,83,9);
    docPdf.text(`${n.tipo === "omision" ? "OMISIÓN JUSTIFICADA" : "NOVEDAD"} - ${new Date(n.createdTs || Date.now()).toLocaleString()}`, margin + 5, y);
    y += 5;
    docPdf.setFont("helvetica","normal");
    docPdf.setFontSize(9);
    docPdf.setTextColor(31,41,55);
    docPdf.text(lines, margin + 5, y);
    y += lines.length * 4.2 + 5;

    if(String(n.fotoDataUrl || "").startsWith("data:image/jpeg;base64,")){
      const sourceW = Math.max(1, Number(n.fotoWidth) || 640);
      const sourceH = Math.max(1, Number(n.fotoHeight) || 480);
      const maxW = contentWidth;
      const maxH = 82;
      const scale = Math.min(maxW / sourceW, maxH / sourceH);
      const imageW = sourceW * scale;
      const imageH = sourceH * scale;
      addPageIfNeeded(imageH + 8);
      try{
        docPdf.addImage(n.fotoDataUrl, "JPEG", margin, y, imageW, imageH, undefined, "FAST");
        y += imageH + 7;
      }catch(error){
        console.warn("No se pudo agregar fotografía al PDF", error);
        addWrappedText("[La fotografía no pudo incorporarse al PDF]", margin, contentWidth, { size:8, color:[185,28,28] });
        y += 3;
      }
    }
  };

  docPdf.setFillColor(15,23,42);
  docPdf.rect(0, 0, pageWidth, 34, "F");
  docPdf.setTextColor(255,255,255);
  docPdf.setFont("helvetica","bold");
  docPdf.setFontSize(18);
  docPdf.text("Reporte de rondín", margin, 15);
  docPdf.setFontSize(10);
  docPdf.setFont("helvetica","normal");
  docPdf.text(clean(`${r.rutaNombre || "Ruta"} - ${r.turno || "Sin turno"}`), margin, 23);
  docPdf.text(`Generado: ${new Date().toLocaleString()}`, margin, 29);
  y = 43;

  addWrappedText(`Guardia: ${r.guardiaNombre || r.guardiaEmail || "Guardia"}`, margin, contentWidth, { size:11, bold:true });
  addWrappedText(`Estatus: ${r.status || "-"}    Puntos: ${visitados.size}/${esperados.length}    Cumplimiento: ${avance}%    Tiempo: ${tiempoTotal}`, margin, contentWidth, { size:9 });
  addWrappedText(`Inicio: ${r.inicioTs ? new Date(r.inicioTs).toLocaleString() : "-"}    Fin: ${r.finTs ? new Date(r.finTs).toLocaleString() : "-"}`, margin, contentWidth, { size:9 });
  y += 4;
  docPdf.setDrawColor(203,213,225);
  docPdf.line(margin, y, pageWidth - margin, y);
  y += 7;

  esperados.forEach((pid, idx) => {
    const punto = getRondineroPuntoSnapshot(r, pid);
    const scan = scans.find(e => String(e.puntoId) === pid);
    const omision = omisiones.find(e => String(e.puntoId) === pid);
    const novedadesPunto = novedades.filter(n => getRondineroNovedadPuntoId(n, scans) === pid);
    addPageIfNeeded(23);
    docPdf.setFillColor(scan ? 240 : 254, scan ? 253 : 242, scan ? 244 : 242);
    docPdf.setDrawColor(scan ? 34 : 239, scan ? 197 : 68, scan ? 94 : 68);
    docPdf.roundedRect(margin, y, contentWidth, 20, 2, 2, "FD");
    y += 6;
    docPdf.setTextColor(15,23,42);
    docPdf.setFont("helvetica","bold");
    docPdf.setFontSize(11);
    docPdf.text(clean(`${idx + 1}. ${punto.nombre || pid}`), margin + 5, y);
    y += 5;
    docPdf.setFont("helvetica","normal");
    docPdf.setFontSize(8.5);
    const estado = scan ? `Visitado: ${new Date(scan.createdTs || Date.now()).toLocaleString()}` : omision ? `Omitido con justificación: ${new Date(omision.createdTs || Date.now()).toLocaleString()}` : "No procesado";
    docPdf.text(clean(`${punto.ubicacion || scan?.ubicacion || "Sin ubicación"} - ${estado}`), margin + 5, y);
    y += 4.5;
    if(scan?.gpsValidado){
      docPdf.text(clean(`GPS validado: ${scan.gpsDistanciaMetros} m - precisión +/-${scan.gpsPrecisionMetros} m`), margin + 5, y);
    }else if(scan){
      docPdf.text("Sin evidencia GPS", margin + 5, y);
    }
    y += 7;
    if(omision) addNovedad({ ...omision, observaciones:omision.motivoOmision || omision.observaciones || "Sin detalle" });
    novedadesPunto.forEach(addNovedad);
    y += 2;
  });

  const generales = novedades.filter(n => !getRondineroNovedadPuntoId(n, scans));
  if(generales.length){
    addPageIfNeeded(18);
    addWrappedText("Novedades generales", margin, contentWidth, { size:12, bold:true });
    y += 2;
    generales.forEach(addNovedad);
  }

  const totalPages = docPdf.getNumberOfPages();
  for(let page = 1; page <= totalPages; page++){
    docPdf.setPage(page);
    docPdf.setFont("helvetica","normal");
    docPdf.setFontSize(8);
    docPdf.setTextColor(100,116,139);
    docPdf.text(`Caborca Access Control - Página ${page} de ${totalPages}`, pageWidth / 2, pageHeight - 8, { align:"center" });
  }

  const safeRoute = String(r.rutaNombre || "rondin").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const fecha = String(r.fecha || todayISO()).slice(0,10);
  docPdf.save(`rondin_${safeRoute || "recorrido"}_${fecha}.pdf`);
  toast("PDF","Reporte completo generado con puntos, novedades y fotografías.","ok",3400);
}

async function toggleRondineroPunto(id){
  if(!requirePerm("rondinero_configurar","Tu rol no puede configurar puntos.")) return;
  const p = rondineroPuntos.find(x => String(x.id) === String(id));
  if(!p) return;
  p.activo = p.activo === false;
  p.updatedTs = Date.now();
  saveRondineroLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertRondineroPunto(p); }catch(e){ console.warn(e); }
  }
  await renderRondinero();
}

async function editarRondineroPunto(id){
  if(!requirePerm("rondinero_configurar","Tu rol no puede editar puntos.")) return;
  const punto = rondineroPuntos.find(x => String(x.id) === String(id));
  if(!punto){
    toast("Rondinero","No se encontró el punto.","warn",2600);
    return;
  }

  const nombreRaw = prompt("Nombre del punto:", punto.nombre || "");
  if(nombreRaw === null) return;
  const nombre = nombreRaw.trim();
  if(!nombre){
    toast("Campo obligatorio","El nombre del punto no puede quedar vacío.","warn",3200);
    return;
  }

  const ubicacionRaw = prompt("Ubicación o referencia del punto:", punto.ubicacion || "");
  if(ubicacionRaw === null) return;
  const ubicacion = ubicacionRaw.trim();
  if(!ubicacion){
    toast("Campo obligatorio","La ubicación descriptiva no puede quedar vacía.","warn",3200);
    return;
  }

  const descripcionRaw = prompt("Descripción del punto (puede quedar vacía):", punto.descripcion || "");
  if(descripcionRaw === null) return;

  const ordenRaw = prompt("Orden del punto:", String(Number(punto.orden) || 0));
  if(ordenRaw === null) return;
  const orden = Number(ordenRaw);
  if(!Number.isFinite(orden) || orden < 0){
    toast("Orden inválido","El orden debe ser un número igual o mayor que cero.","warn",3400);
    return;
  }

  const radioRaw = prompt("Radio GPS permitido en metros (5 a 200):", String(Math.max(5, Number(punto.radioMetros) || RONDINERO_GPS_RADIO_DEFAULT_M)));
  if(radioRaw === null) return;
  const radioMetros = Number(radioRaw);
  if(!Number.isFinite(radioMetros) || radioMetros < 5 || radioMetros > 200){
    toast("Radio inválido","El radio permitido debe estar entre 5 y 200 metros.","warn",3400);
    return;
  }

  punto.nombre = nombre;
  punto.ubicacion = ubicacion;
  punto.descripcion = descripcionRaw.trim();
  punto.orden = orden;
  punto.radioMetros = Math.round(radioMetros);
  punto.updatedTs = Date.now();
  punto.updatedByUid = currentUser?.uid || "";
  punto.updatedByEmail = currentUser?.email || "";
  saveRondineroLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{
      await cloudUpsertRondineroPunto(punto);
    }catch(e){
      console.warn(e);
      toast("Sincronización","El punto se actualizó localmente, pero no pudo guardarse en Firebase.","warn",4400);
      return renderRondinero();
    }
  }
  toast("Rondinero","Punto actualizado sin cambiar su QR ni ubicación GPS.","ok",3200);
  await renderRondinero();
}

async function guardarRondineroRuta(){
  if(!requirePerm("rondinero_configurar","Tu rol no puede configurar rutas.")) return;
  const nombre = document.getElementById("rondRutaNombre")?.value.trim() || "";
  const turno = document.getElementById("rondRutaTurno")?.value.trim() || "";
  const descripcion = document.getElementById("rondRutaDesc")?.value.trim() || "";
  const puntoIds = Array.from(document.querySelectorAll(".rondRutaPunto:checked")).map(x => String(x.value));
  if(!nombre || !puntoIds.length){
    toast("Campos obligatorios","Nombre de ruta y al menos un punto son requeridos.","warn",2800);
    return;
  }
  const id = `RR-${Date.now()}`;
  const ruta = {
    id,
    nombre,
    turno,
    descripcion,
    puntoIds,
    activo: true,
    createdByUid: currentUser?.uid || "",
    createdByEmail: currentUser?.email || "",
    createdTs: Date.now(),
    updatedTs: Date.now()
  };
  rondineroRutas.unshift(ruta);
  saveRondineroLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertRondineroRuta(ruta); }catch(e){ console.warn(e); }
  }
  toast("Rondinero","Ruta guardada.","ok",2200);
  await renderRondinero();
}

async function editarRondineroRuta(id){
  if(!requirePerm("rondinero_configurar","Tu rol no puede configurar rutas.")) return;
  const ruta = rondineroRutas.find(x => String(x.id) === String(id));
  if(!ruta) return;
  _rondRutaEditorId = String(ruta.id);
  _rondRutaEditorPuntoIds = Array.isArray(ruta.puntoIds) ? ruta.puntoIds.map(String) : [];
  _rondRutaEditorDraft = { nombre:ruta.nombre || "", turno:ruta.turno || "Día", descripcion:ruta.descripcion || "" };
  pintarEditorRondineroRuta();
  const modal = document.getElementById("rondRutaEditModal");
  if(modal) modal.style.display = "flex";
}

function cerrarEditorRondineroRuta(){
  const modal = document.getElementById("rondRutaEditModal");
  if(modal) modal.style.display = "none";
  _rondRutaEditorId = null;
  _rondRutaEditorPuntoIds = [];
  _rondRutaEditorDraft = null;
}

function capturarBorradorEditorRondineroRuta(){
  if(!_rondRutaEditorDraft) return;
  _rondRutaEditorDraft.nombre = document.getElementById("rondRutaEditNombre")?.value ?? _rondRutaEditorDraft.nombre;
  _rondRutaEditorDraft.turno = document.getElementById("rondRutaEditTurno")?.value ?? _rondRutaEditorDraft.turno;
  _rondRutaEditorDraft.descripcion = document.getElementById("rondRutaEditDesc")?.value ?? _rondRutaEditorDraft.descripcion;
}

function pintarEditorRondineroRuta(){
  const body = document.getElementById("rondRutaEditBody");
  const ruta = rondineroRutas.find(x => String(x.id) === String(_rondRutaEditorId));
  if(!body || !ruta) return;
  const selectedSet = new Set(_rondRutaEditorPuntoIds.map(String));
  const selected = _rondRutaEditorPuntoIds.map(pid => rondineroPuntos.find(p => String(p.id) === String(pid))).filter(Boolean);
  const disponibles = getRondineroPuntosActivos().filter(p => !selectedSet.has(String(p.id)));
  const draft = _rondRutaEditorDraft || { nombre:ruta.nombre || "", turno:ruta.turno || "Día", descripcion:ruta.descripcion || "" };
  body.innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));">
      <div><label>Nombre de ruta *</label><input id="rondRutaEditNombre" value="${esc(draft.nombre)}" maxlength="120"></div>
      <div><label>Turno</label><select id="rondRutaEditTurno">${["Día","Tarde","Noche","Mixto"].map(t => `<option ${String(draft.turno) === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div style="grid-column:1/-1;"><label>Descripción</label><textarea id="rondRutaEditDesc" rows="2" maxlength="500">${esc(draft.descripcion)}</textarea></div>
    </div>
    <div class="divider"></div>
    <div class="two" style="align-items:start;">
      <div>
        <h4 style="margin:0 0 4px;">Orden del recorrido</h4>
        <div style="color:var(--muted);font-size:12px;margin-bottom:8px;">El guardia recorrerá los puntos de arriba hacia abajo.</div>
        <div class="dashboard-pending-list" style="max-height:380px;overflow:auto;">
          ${selected.map((p, idx) => `
            <div class="tarjeta history-card" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;">
              <span class="pill" style="font-weight:900;">${idx + 1}</span>
              <span><strong>${esc(p.nombre || "Punto")}</strong><small>${esc(p.ubicacion || "")}${p.activo === false ? " • Inactivo" : ""}</small></span>
              <span class="row" style="gap:4px;justify-content:flex-end;">
                <button class="secondary" type="button" data-action="rondineroMoverPuntoRuta" data-id="${esc(p.id)}" data-dir="up" ${idx === 0 ? "disabled" : ""} title="Subir">↑</button>
                <button class="secondary" type="button" data-action="rondineroMoverPuntoRuta" data-id="${esc(p.id)}" data-dir="down" ${idx === selected.length - 1 ? "disabled" : ""} title="Bajar">↓</button>
                <button class="secondary danger" type="button" data-action="rondineroQuitarPuntoRuta" data-id="${esc(p.id)}">Quitar</button>
              </span>
            </div>
          `).join("") || `<div class="pill bad" style="display:block;white-space:normal;">Agrega al menos un punto a la ruta.</div>`}
        </div>
      </div>
      <div>
        <h4 style="margin:0 0 4px;">Puntos disponibles</h4>
        <div style="color:var(--muted);font-size:12px;margin-bottom:8px;">Pulsa Agregar para colocarlo al final del recorrido.</div>
        <div class="dashboard-pending-list" style="max-height:380px;overflow:auto;">
          ${disponibles.map(p => `
            <div class="tarjeta history-card" style="display:flex;gap:10px;align-items:center;justify-content:space-between;">
              <span><strong>${esc(p.nombre || "Punto")}</strong><small>${esc(p.ubicacion || "")}</small></span>
              <button class="secondary" type="button" data-action="rondineroAgregarPuntoRuta" data-id="${esc(p.id)}">Agregar</button>
            </div>
          `).join("") || `<div style="color:var(--muted);font-size:12px;">Todos los puntos activos ya están incluidos.</div>`}
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="row">
      <button data-action="rondineroGuardarEditorRuta" ${selected.length ? "" : "disabled"}>Guardar cambios</button>
      <button class="secondary" data-action="rondineroCerrarEditorRuta">Cancelar</button>
      <span class="pill">${selected.length} punto(s) en la ruta</span>
    </div>
  `;
}

function moverPuntoEditorRondineroRuta(id, direction){
  capturarBorradorEditorRondineroRuta();
  const index = _rondRutaEditorPuntoIds.findIndex(pid => String(pid) === String(id));
  if(index < 0) return;
  const target = direction === "up" ? index - 1 : index + 1;
  if(target < 0 || target >= _rondRutaEditorPuntoIds.length) return;
  [_rondRutaEditorPuntoIds[index], _rondRutaEditorPuntoIds[target]] = [_rondRutaEditorPuntoIds[target], _rondRutaEditorPuntoIds[index]];
  pintarEditorRondineroRuta();
}

function quitarPuntoEditorRondineroRuta(id){
  capturarBorradorEditorRondineroRuta();
  _rondRutaEditorPuntoIds = _rondRutaEditorPuntoIds.filter(pid => String(pid) !== String(id));
  pintarEditorRondineroRuta();
}

function agregarPuntoEditorRondineroRuta(id){
  capturarBorradorEditorRondineroRuta();
  if(!_rondRutaEditorPuntoIds.map(String).includes(String(id))) _rondRutaEditorPuntoIds.push(String(id));
  pintarEditorRondineroRuta();
}

async function guardarEditorRondineroRuta(){
  if(!requirePerm("rondinero_configurar","Tu rol no puede configurar rutas.")) return;
  const ruta = rondineroRutas.find(x => String(x.id) === String(_rondRutaEditorId));
  if(!ruta) return;
  const nombre = document.getElementById("rondRutaEditNombre")?.value.trim() || "";
  const turno = document.getElementById("rondRutaEditTurno")?.value.trim() || "Día";
  const descripcion = document.getElementById("rondRutaEditDesc")?.value.trim() || "";
  if(!nombre || !_rondRutaEditorPuntoIds.length){
    toast("Campos obligatorios","Escribe el nombre e incluye al menos un punto.","warn",3400);
    return;
  }
  ruta.nombre = nombre;
  ruta.turno = turno;
  ruta.descripcion = descripcion;
  ruta.puntoIds = [..._rondRutaEditorPuntoIds];
  ruta.updatedTs = Date.now();
  ruta.updatedByUid = currentUser?.uid || "";
  ruta.updatedByEmail = currentUser?.email || "";
  saveRondineroLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{
      await cloudUpsertRondineroRuta(ruta);
    }catch(e){
      console.warn(e);
      toast("Sincronización","La ruta se actualizó localmente, pero no pudo guardarse en Firebase.","warn",4400);
      return renderRondinero();
    }
  }
  cerrarEditorRondineroRuta();
  toast("Rondinero","Ruta y orden de puntos actualizados.","ok",3000);
  await renderRondinero();
}

async function toggleRondineroRuta(id){
  if(!requirePerm("rondinero_configurar","Tu rol no puede configurar rutas.")) return;
  const r = rondineroRutas.find(x => String(x.id) === String(id));
  if(!r) return;
  r.activo = r.activo === false;
  r.updatedTs = Date.now();
  saveRondineroLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertRondineroRuta(r); }catch(e){ console.warn(e); }
  }
  await renderRondinero();
}



async function renderRondineroQR(id){
  if(!await loadFeatureDependencies("qr", "el código QR")) return renderRondinero();
  if(!requirePerm("rondinero_ver","Tu rol no puede ver Rondinero.")) return;
  const p = rondineroPuntos.find(x => String(x.id) === String(id));
  if(!p) return renderRondinero();
  currentView = "rondinero_qr";
  const qrText = p.qrCode || rondineroQrText(p.id);
  appEl.innerHTML = `
    <div class="rondinero-print-shell">
      <div class="printable rondinero-wall-card">
        <div class="rondinero-wall-band">
          <div class="rondinero-wall-brand">
            <strong>Rondinero</strong>
            <span>Control de seguridad</span>
          </div>
          <div class="rondinero-wall-badge">PUNTO DE CONTROL</div>
        </div>
        <div class="rondinero-wall-body">
          <div>
            <h2 class="rondinero-wall-title">${esc(p.nombre || "Punto de control")}</h2>
            <p class="rondinero-wall-location">${esc(p.ubicacion || "Ubicacion no especificada")}</p>
            ${p.descripcion ? `<p class="rondinero-wall-desc">${esc(p.descripcion)}</p>` : ""}
            <div class="rondinero-wall-steps">
              <div class="rondinero-wall-step"><b>1</b><span>Escanea este codigo con la app.</span></div>
              <div class="rondinero-wall-step"><b>2</b><span>Confirma que el punto fue registrado.</span></div>
              <div class="rondinero-wall-step"><b>3</b><span>Reporta novedad si encuentras alguna anomalia.</span></div>
            </div>
          </div>
          <div class="rondinero-wall-qr">
            <div id="qrcode" class="rondinero-wall-qr-box"></div>
            <div class="rondinero-wall-code">${esc(qrText)}</div>
          </div>
        </div>
        <div class="rondinero-wall-footer">
          <span>Caborca Access Control</span>
          <span>ID: ${esc(p.id)}</span>
        </div>
      </div>
      <div class="divider"></div>
      <div class="row">
        <button class="secondary" data-action="rondinero">Volver</button>
        <button class="secondary" id="btnGuardarRondineroQR" type="button">Guardar PNG</button>
        <button class="secondary" data-action="print">Imprimir</button>
      </div>
    </div>
  `;
  const box = document.getElementById("qrcode");
  if(box && window.QRCode){
    box.innerHTML = "";
    new QRCode(box, {
      text: qrText,
      width: 168,
      height: 168,
      correctLevel: QRCode.CorrectLevel.M
    });
  }
  setTimeout(() => {
    const btn = document.getElementById("btnGuardarRondineroQR");
    if(!btn) return;
    btn.onclick = () => {
      const canvas = box?.querySelector("canvas");
      const img = box?.querySelector("img");
      const qrDataUrl = canvas?.toDataURL("image/png") || img?.src || null;
      if(!qrDataUrl) return alert("No se pudo generar el QR");
      const a = document.createElement("a");
      a.href = qrDataUrl;
      a.download = `RONDINERO-${String(p.nombre || p.id).replace(/[^\w-]+/g,"_")}.png`;
      a.click();
    };
  }, 80);
}

async function iniciarRondinero(){
  if(!requirePerm("rondinero_ejecutar","Tu rol no puede iniciar rondines.")) return;
  const btn = document.querySelector('[data-action="rondineroIniciar"]');
  if(btn?.dataset.busy === "1") return;
  if(btn){
    btn.dataset.busy = "1";
    btn.disabled = true;
    btn.textContent = "Iniciando…";
  }
  try{
    if(getRondineroActivo()){
      toast("Rondinero","Ya tienes un rondín en curso.","warn",3200);
      return await renderRondinero();
    }
    if(!rondineroGuardiaCred?.uid){
      toast("Guardia requerido","Escanea la credencial del guardia antes de iniciar.","warn",4200);
      return;
    }
    const rutaId = document.getElementById("rondRutaInicio")?.value || "";
    const rutas = getRondineroRutasActivas();
    if(!rutas.length){
      toast("Ruta requerida","No hay rutas activas disponibles. Pide a un administrador que configure una.","warn",4600);
      return;
    }
    const ruta = rutas.find(r => String(r.id) === String(rutaId)) || rutas[0];
    const puntos = getRondineroPuntosPorRuta(ruta.id);
    if(!puntos.length){
      toast("Ruta sin puntos","La ruta seleccionada no tiene puntos activos asignados.","warn",4600);
      return;
    }
    const rondin = {
    id: `ROND-${Date.now()}`,
    fecha: todayISO(),
    rutaId: ruta?.id || "",
    rutaNombre: ruta?.nombre || "Ruta",
    turno: ruta?.turno || "",
    status: "en_curso",
    guardiaUid: rondineroGuardiaCred.uid,
    guardiaEmail: rondineroGuardiaCred.email || "",
    guardiaNombre: rondineroGuardiaCred.nombre || "Guardia",
    operadorUid: currentUser?.uid || "",
    operadorEmail: currentUser?.email || "",
    operadorNombre: currentUser?.nombre || currentUser?.email || "Tablet",
    inicioTs: Date.now(),
    finTs: null,
    puntoIdsEsperados: puntos.map(p => String(p.id)),
    puntosEsperadosSnapshot: puntos.map((p, index) => ({ id:String(p.id), nombre:p.nombre || String(p.id), ubicacion:p.ubicacion || "", orden:index + 1 })),
    puntoIdsVisitados: [],
    puntoIdsOmitidos: [],
    ordenObligatorio: true,
    novedadesCount: 0,
    createdTs: Date.now(),
    updatedTs: Date.now()
    };
    rondineroRondines.unshift(rondin);
    const guardadoLocal = saveRondineroLocal();
    let confirmadoEnFirebase = false;
    if(!guardadoLocal){
      if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
        try{
          await cloudUpsertRondineroRondin(rondin);
          confirmadoEnFirebase = true;
          toast("Rondín en línea", "Firebase confirmó el recorrido. Mantén conexión mientras este dispositivo tenga el almacenamiento restringido.", "warn", 6200);
        }catch(e){
          console.warn("No se pudo iniciar Rondinero en Firebase:", e);
        }
      }
      if(!confirmadoEnFirebase){
        rondineroRondines = rondineroRondines.filter(r => r.id !== rondin.id);
        toast("No se pudo iniciar", navigator.onLine ? "Firebase tampoco confirmó el recorrido. Revisa la conexión e intenta nuevamente." : "Sin almacenamiento local no se puede iniciar el recorrido sin conexión.", "bad", 5200);
        return;
      }
    }
    toast("Rondinero","Rondín iniciado. Ya puedes escanear el primer punto.","ok",3200);
    await renderRondinero();

    if(!confirmadoEnFirebase && navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
      cloudUpsertRondineroRondin(rondin).catch(e => {
        console.warn(e);
        toast("Sincronización pendiente","El rondín inició en este dispositivo. Firebase se reintentará al registrar el siguiente punto.","warn",6200);
      });
    }
  }catch(e){
    console.error("No se pudo iniciar el rondín:", e);
    toast("No se pudo iniciar","Ocurrió un error al preparar el rondín. Intenta nuevamente.","bad",4600);
  }finally{
    if(btn?.isConnected){
      btn.dataset.busy = "0";
      btn.disabled = false;
      btn.textContent = "Iniciar rondín";
    }
  }
}

async function renderRondineroScanner(){
  if(!requirePerm("rondinero_ejecutar","Tu rol no puede escanear Rondinero.")) return;
  const activo = getRondineroActivo();
  if(!activo){
    toast("Rondinero","Primero inicia un rondín.","warn",2600);
    return renderRondinero();
  }
  if(!await loadFeatureDependencies("camera", "el escáner de cámara")) return renderRondinero();
  currentView = "rondinero_scanner";
  cleanup();
  appEl.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 6px;">Escanear punto Rondinero</h2>
      <p style="margin:0 0 10px;color:var(--muted);font-size:12px;">Apunta la cámara al QR del punto de control.</p>
      <div id="reader"></div>
      <div class="divider"></div>
      <div class="row"><button class="secondary" data-action="rondinero">Cancelar</button></div>
    </div>
  `;
  try{
    if(!window.Html5Qrcode){
      toast("Escáner","La librería aún está cargando. Intenta de nuevo.","warn",2600);
      return renderRondinero();
    }
    qrScanner = new Html5Qrcode("reader");
  }catch(e){
    console.warn(e);
    toast("Escáner","No se pudo inicializar cámara.","bad",4200);
    return renderRondinero();
  }
  let scanHandled = false;
  qrScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    async (decodedText) => {
      if(scanHandled) return;
      scanHandled = true;
      stopScanner();
      await registrarEscaneoRondinero(String(decodedText).trim());
    },
    () => {}
  ).catch(err => {
    toast("Permisos", "No se pudo abrir cámara: " + err, "bad", 4200);
    renderRondinero();
  });
}

async function renderRondineroGuardiaScanner(returnTo = "rondinero"){
  if(!requirePerm("rondinero_ejecutar","Tu rol no puede ejecutar rondines.")) return;
  if(!await loadFeatureDependencies("camera", "el escáner de cámara")) return renderRondinero();
  currentView = "rondinero_guardia_scanner";
  cleanup();
  appEl.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 6px;">Escanear credencial de guardia</h2>
      <p style="margin:0 0 10px;color:var(--muted);font-size:12px;">Escanea la tarjeta QR del guardia que realizará el rondín.</p>
      <div id="reader"></div>
      <div class="divider"></div>
      <div class="row"><button class="secondary" data-action="rondinero">Cancelar</button></div>
    </div>
  `;
  try{
    if(!window.Html5Qrcode){
      toast("Escáner","La librería aún está cargando. Intenta de nuevo.","warn",2600);
      return returnTo === "bitacora" ? renderBitacoraGuardia() : renderRondinero();
    }
    qrScanner = new Html5Qrcode("reader");
  }catch(e){
    console.warn(e);
    toast("Escáner","No se pudo inicializar cámara.","bad",4200);
    return returnTo === "bitacora" ? renderBitacoraGuardia() : renderRondinero();
  }
  let scanHandled = false;
  qrScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    async (decodedText) => {
      if(scanHandled) return;
      scanHandled = true;
      stopScanner();
      const cred = parseRondineroGuardiaQr(String(decodedText).trim());
      if(!cred){
        toast("QR inválido","Esta credencial no pertenece al Rondinero.","bad",3200);
        return returnTo === "bitacora" ? renderBitacoraGuardia() : renderRondinero();
      }
      saveRondineroGuardiaCred(cred);
      toast("Guardia identificado", cred.nombre, "ok", 2200);
      if(returnTo === "bitacora") await renderBitacoraGuardia();
      else await renderRondinero();
    },
    () => {}
  ).catch(err => {
    toast("Permisos", "No se pudo abrir cámara: " + err, "bad", 4200);
    if(returnTo === "bitacora") renderBitacoraGuardia();
    else renderRondinero();
  });
}

async function registrarEscaneoRondinero(qrText){
  if(!requirePerm("rondinero_ejecutar","Tu rol no puede escanear Rondinero.")) return;
  const activo = getRondineroActivo();
  if(!activo) return renderRondinero();
  const prefix = "RONDINERO_POINT:";
  if(!String(qrText || "").toUpperCase().startsWith(prefix)){
    toast("QR inválido","Este QR no pertenece al Rondinero.","bad",3200);
    return renderRondinero();
  }
  const puntoId = qrText.slice(prefix.length).trim();
  const punto = rondineroPuntos.find(p => String(p.id) === String(puntoId));
  if(!punto || punto.activo === false){
    toast("Punto inválido","El punto no existe o está inactivo.","bad",3200);
    return renderRondinero();
  }
  if(!(activo.puntoIdsEsperados || []).map(String).includes(String(punto.id))){
    toast("Punto fuera de ruta","Este punto no pertenece al rondín actual.","warn",3200);
    return renderRondinero();
  }
  if((activo.puntoIdsVisitados || []).map(String).includes(String(punto.id))){
    toast("Punto ya visitado","Este punto ya fue registrado en el rondín.","warn",2600);
    return renderRondinero();
  }
  if(getRondineroPuntosOmitidos(activo).includes(String(punto.id))){
    toast("Punto ya omitido","Este punto fue omitido con justificación y la secuencia ya avanzó.","warn",3600);
    return renderRondinero();
  }
  const siguientePunto = getRondineroSiguientePunto(activo);
  if(!siguientePunto || String(siguientePunto.id) !== String(punto.id)){
    const orden = siguientePunto ? (activo.puntoIdsEsperados || []).map(String).indexOf(String(siguientePunto.id)) + 1 : 0;
    toast("Punto fuera de secuencia", siguientePunto ? `Debes visitar primero el punto ${orden}: ${siguientePunto.nombre || siguientePunto.id}.` : "La secuencia del rondín ya terminó.","bad",5200);
    return renderRondinero();
  }
  if(!puntoRondineroTieneGps(punto)){
    toast("Punto sin GPS","Un administrador debe registrar las coordenadas de este punto antes de utilizarlo.","bad",4800);
    return renderRondinero();
  }
  let gps;
  try{
    toast("Validando ubicación","Espera mientras comprobamos tu presencia en el punto…","info",2200);
    gps = await obtenerUbicacionRondinero();
  }catch(e){
    toast("GPS requerido",e?.message || "No se pudo validar la ubicación.","bad",4800);
    return renderRondinero();
  }
  if(gps.precisionMetros > RONDINERO_GPS_PRECISION_MAX_M){
    toast("GPS impreciso",`Precisión actual ±${gps.precisionMetros} m; se requieren ${RONDINERO_GPS_PRECISION_MAX_M} m o menos.`,"bad",4800);
    return renderRondinero();
  }
  const distanciaMetros = Math.round(distanciaMetrosRondinero(
    gps.latitud,
    gps.longitud,
    Number(punto.latitud),
    Number(punto.longitud)
  ));
  const radioPermitidoMetros = Math.max(5, Number(punto.radioMetros) || RONDINERO_GPS_RADIO_DEFAULT_M);
  if(distanciaMetros > radioPermitidoMetros){
    toast("Fuera del punto",`Estás a ${distanciaMetros} m; debes estar dentro de ${radioPermitidoMetros} m.`,"bad",5200);
    return renderRondinero();
  }
  const evento = {
    id: `RE-${Date.now()}`,
    rondinId: activo.id,
    tipo: "scan",
    puntoId: punto.id,
    puntoNombre: punto.nombre,
    ubicacion: punto.ubicacion || "",
    gpsLatitud: gps.latitud,
    gpsLongitud: gps.longitud,
    gpsPrecisionMetros: gps.precisionMetros,
    gpsDistanciaMetros: distanciaMetros,
    gpsRadioPermitidoMetros: radioPermitidoMetros,
    gpsTs: gps.gpsTs,
    gpsValidado: true,
    estatus: "visitado",
    observaciones: "",
    guardiaUid: activo.guardiaUid || "",
    guardiaEmail: activo.guardiaEmail || "",
    guardiaNombre: activo.guardiaNombre || currentUser?.nombre || currentUser?.email || "Guardia",
    operadorUid: currentUser?.uid || "",
    operadorNombre: currentUser?.nombre || currentUser?.email || "Tablet",
    fecha: todayISO(),
    createdTs: Date.now(),
    updatedTs: Date.now()
  };
  activo.puntoIdsVisitados = [...(activo.puntoIdsVisitados || []), String(punto.id)];
  activo.updatedTs = Date.now();
  rondineroEventos.unshift(evento);
  saveRondineroLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{
      await cloudUpsertRondineroEvento(evento);
      await cloudUpsertRondineroRondin(activo);
    }catch(e){
      console.warn(e);
      toast("Permisos Firebase","El punto quedó local, pero Firebase bloqueó la sincronización.","warn",4200);
    }
  }
  toast("Punto registrado", punto.nombre, "ok", 2200);
  await renderRondinero();
}

function renderRondineroOmision(){
  if(!requirePerm("rondinero_ejecutar","Tu rol no puede omitir puntos.")) return;
  const activo = getRondineroActivo();
  if(!activo) return renderRondinero();
  const punto = getRondineroSiguientePunto(activo);
  if(!punto){
    toast("Secuencia terminada","No hay puntos pendientes por omitir.","info",3000);
    return renderRondinero();
  }
  const orden = (activo.puntoIdsEsperados || []).map(String).indexOf(String(punto.id)) + 1;
  currentView = "rondinero_omision";
  appEl.innerHTML = `
    <div class="card" style="max-width:760px;margin:0 auto;">
      <h2 style="margin:0 0 4px;">Omitir punto del recorrido</h2>
      <div style="color:var(--muted);font-size:12px;">La omisión quedará registrada y reducirá el porcentaje de cumplimiento.</div>
      <div class="divider"></div>
      <div class="tarjeta history-card">
        <strong>${orden}. ${esc(punto.nombre || punto.id)}</strong>
        <small>${esc(punto.ubicacion || "Sin ubicación descriptiva")}</small>
      </div>
      <div style="height:12px;"></div>
      <label>Motivo de la omisión *</label>
      <textarea id="rondOmisionMotivo" rows="5" maxlength="800" placeholder="Ejemplo: área cerrada, acceso obstruido o atención de emergencia."></textarea>
      <div style="height:10px;"></div>
      <label>Fotografía opcional</label>
      <input id="rondOmisionFoto" type="file" accept="image/*" capture="environment">
      <div style="margin-top:6px;color:var(--muted);font-size:12px;">La imagen se comprimirá y se guardará como evidencia dentro del registro, sin Firebase Storage.</div>
      <img id="rondOmisionPreview" alt="Vista previa" style="display:none;width:100%;max-height:360px;object-fit:contain;margin-top:10px;border-radius:12px;border:1px solid var(--border);">
      <div class="divider"></div>
      <div class="row">
        <button class="danger" data-action="rondineroGuardarOmision">Confirmar omisión</button>
        <button class="secondary" data-action="rondinero">Cancelar</button>
      </div>
    </div>
  `;
  const input = document.getElementById("rondOmisionFoto");
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    const preview = document.getElementById("rondOmisionPreview");
    if(!file){ if(preview) preview.style.display = "none"; return; }
    if(!String(file.type || "").startsWith("image/")){
      input.value = "";
      toast("Archivo inválido","Selecciona una imagen.","warn",3000);
      return;
    }
    if(preview){ preview.src = URL.createObjectURL(file); preview.style.display = "block"; }
  });
  document.getElementById("rondOmisionMotivo")?.focus();
}

async function guardarRondineroOmision(){
  if(!requirePerm("rondinero_ejecutar","Tu rol no puede omitir puntos.")) return;
  const activo = getRondineroActivo();
  if(!activo) return renderRondinero();
  const punto = getRondineroSiguientePunto(activo);
  if(!punto) return renderRondinero();
  const motivo = document.getElementById("rondOmisionMotivo")?.value.trim() || "";
  if(motivo.length < 8){
    toast("Justificación requerida","Describe el motivo con al menos 8 caracteres.","warn",3600);
    return;
  }
  const file = document.getElementById("rondOmisionFoto")?.files?.[0] || null;
  const btn = document.querySelector('[data-action="rondineroGuardarOmision"]');
  if(btn) btn.disabled = true;
  let foto = null;
  try{ if(file) foto = await comprimirFotoRondinero(file); }
  catch(e){
    if(btn) btn.disabled = false;
    toast("Fotografía",e?.message || "No se pudo procesar la fotografía.","bad",4200);
    return;
  }
  const now = Date.now();
  const evento = {
    id:`RO-${now}`,
    rondinId:activo.id,
    tipo:"omision",
    puntoId:String(punto.id),
    puntoNombre:punto.nombre || String(punto.id),
    ubicacion:punto.ubicacion || "",
    estatus:"omitido",
    observaciones:motivo,
    motivoOmision:motivo,
    fotoDataUrl:foto?.dataUrl || "",
    fotoMime:foto ? "image/jpeg" : "",
    fotoBytes:foto?.bytes || 0,
    fotoWidth:foto?.width || 0,
    fotoHeight:foto?.height || 0,
    guardiaUid:activo.guardiaUid || "",
    guardiaEmail:activo.guardiaEmail || "",
    guardiaNombre:activo.guardiaNombre || currentUser?.nombre || currentUser?.email || "Guardia",
    operadorUid:currentUser?.uid || "",
    operadorNombre:currentUser?.nombre || currentUser?.email || "Tablet",
    fecha:todayISO(),
    createdTs:now,
    updatedTs:now
  };
  activo.puntoIdsOmitidos = [...getRondineroPuntosOmitidos(activo), String(punto.id)];
  activo.updatedTs = now;
  rondineroEventos.unshift(evento);
  saveRondineroLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{
      await cloudUpsertRondineroEvento(evento);
      await cloudUpsertRondineroRondin(activo);
    }catch(e){
      console.warn(e);
      toast("Sincronización pendiente","La omisión quedó guardada localmente. Publica las reglas actualizadas para sincronizar este tipo de evento.","warn",5600);
    }
  }
  toast("Punto omitido",`${punto.nombre || punto.id}. Continúa con el siguiente punto.`,"warn",3200);
  await renderRondinero();
}

function renderRondineroNovedad(){
  if(!requirePerm("rondinero_ejecutar","Tu rol no puede registrar novedades.")) return;
  const activo = getRondineroActivo();
  if(!activo) return renderRondinero();
  const puntos = getRondineroPuntosParaRondin(activo);
  const ultimoScan = getRondineroEventos(activo.id).filter(e => e.tipo === "scan").slice(-1)[0];
  const puntoSugeridoId = String(ultimoScan?.puntoId || "");
  currentView = "rondinero_novedad";
  appEl.innerHTML = `
    <div class="card" style="max-width:760px;margin:0 auto;">
      <h2 style="margin:0 0 4px;">Reportar novedad</h2>
      <div style="color:var(--muted);font-size:12px;">${esc(activo.rutaNombre || "Ruta")} • La fotografía es opcional y se comprimirá antes de guardarse.</div>
      <div class="divider"></div>
      <label>Descripción de la novedad *</label>
      <textarea id="rondNovedadTexto" rows="5" maxlength="1200" placeholder="Describe lo observado..."></textarea>
      <div style="height:10px;"></div>
      <label>Punto relacionado</label>
      <select id="rondNovedadPunto">
        <option value="">Novedad general del recorrido</option>
        ${puntos.map(p => `<option value="${esc(p.id)}" ${String(p.id) === puntoSugeridoId ? "selected" : ""}>${esc(p.nombre)}${p.ubicacion ? ` • ${esc(p.ubicacion)}` : ""}</option>`).join("")}
      </select>
      <div style="margin-top:6px;color:var(--muted);font-size:12px;">Se preselecciona el último punto escaneado. Cámbialo si la novedad corresponde a otro lugar.</div>
      <div style="height:10px;"></div>
      <label>Fotografía opcional</label>
      <input id="rondNovedadFoto" type="file" accept="image/*" capture="environment">
      <div style="margin-top:6px;color:var(--muted);font-size:12px;">Se guardará como JPEG de baja resolución (máximo 640 px y 180 KB), dentro de la novedad; no utiliza Firebase Storage.</div>
      <img id="rondNovedadPreview" alt="Vista previa" style="display:none;width:100%;max-height:360px;object-fit:contain;margin-top:10px;border-radius:12px;border:1px solid var(--border);">
      <div id="rondNovedadFotoInfo" style="margin-top:6px;color:var(--muted);font-size:12px;"></div>
      <div class="divider"></div>
      <div class="row">
        <button data-action="rondineroGuardarNovedad">Guardar novedad</button>
        <button class="secondary" data-action="rondinero">Cancelar</button>
      </div>
    </div>
  `;
  const input = document.getElementById("rondNovedadFoto");
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    const preview = document.getElementById("rondNovedadPreview");
    const info = document.getElementById("rondNovedadFotoInfo");
    if(!file){ if(preview) preview.style.display = "none"; if(info) info.textContent = ""; return; }
    if(!String(file.type || "").startsWith("image/")){
      input.value = "";
      toast("Archivo inválido","Selecciona una imagen.","warn",3000);
      return;
    }
    if(preview){ preview.src = URL.createObjectURL(file); preview.style.display = "block"; }
    if(info) info.textContent = `Original: ${Math.max(1, Math.round(file.size / 1024))} KB. Se comprimirá al guardar.`;
  });
  document.getElementById("rondNovedadTexto")?.focus();
}

async function comprimirFotoRondinero(file){
  if(!file) return null;
  const sourceUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la fotografía."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("La fotografía no es válida."));
    image.src = sourceUrl;
  });
  const render = (maxSide, quality) => {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d", { alpha:false }).drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4);
    return { dataUrl, bytes, width, height };
  };
  let result = render(640, 0.42);
  if(result.bytes > 180 * 1024) result = render(520, 0.34);
  if(result.bytes > 180 * 1024) result = render(420, 0.28);
  if(result.bytes > 180 * 1024) throw new Error("La imagen no pudo reducirse por debajo de 180 KB.");
  return result;
}

async function guardarRondineroNovedad(){
  if(!requirePerm("rondinero_ejecutar","Tu rol no puede registrar novedades.")) return;
  const activo = getRondineroActivo();
  if(!activo) return renderRondinero();
  const texto = document.getElementById("rondNovedadTexto")?.value.trim() || "";
  if(!texto){
    toast("Campo obligatorio","Describe la novedad antes de guardarla.","warn",3000);
    return;
  }
  const file = document.getElementById("rondNovedadFoto")?.files?.[0] || null;
  const puntoId = document.getElementById("rondNovedadPunto")?.value || "";
  const punto = rondineroPuntos.find(p => String(p.id) === String(puntoId));
  const saveBtn = document.querySelector('[data-action="rondineroGuardarNovedad"]');
  if(saveBtn) saveBtn.disabled = true;
  let foto = null;
  try{
    if(file) foto = await comprimirFotoRondinero(file);
  }catch(e){
    if(saveBtn) saveBtn.disabled = false;
    toast("Fotografía",e.message || "No se pudo procesar la fotografía.","bad",4200);
    return;
  }
  const evento = {
    id: `RN-${Date.now()}`,
    rondinId: activo.id,
    tipo: "novedad",
    puntoId: punto ? String(punto.id) : "",
    puntoNombre: punto?.nombre || "",
    ubicacion: punto?.ubicacion || "",
    estatus: "novedad",
    observaciones: texto,
    fotoDataUrl: foto?.dataUrl || "",
    fotoMime: foto ? "image/jpeg" : "",
    fotoBytes: foto?.bytes || 0,
    fotoWidth: foto?.width || 0,
    fotoHeight: foto?.height || 0,
    guardiaUid: activo.guardiaUid || "",
    guardiaEmail: activo.guardiaEmail || "",
    guardiaNombre: activo.guardiaNombre || currentUser?.nombre || currentUser?.email || "Guardia",
    operadorUid: currentUser?.uid || "",
    operadorNombre: currentUser?.nombre || currentUser?.email || "Tablet",
    fecha: todayISO(),
    createdTs: Date.now(),
    updatedTs: Date.now()
  };
  activo.novedadesCount = Number(activo.novedadesCount || 0) + 1;
  activo.updatedTs = Date.now();
  rondineroEventos.unshift(evento);
  saveRondineroLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{
      await cloudUpsertRondineroEvento(evento);
      await cloudUpsertRondineroRondin(activo);
    }catch(e){
      console.warn(e);
      toast("Permisos Firebase","La novedad quedó local, pero Firebase bloqueó la sincronización.","warn",4200);
    }
  }
  toast("Rondinero","Novedad registrada.","ok",2200);
  await renderRondinero();
}

async function cerrarRondinero(){
  if(!requirePerm("rondinero_ejecutar","Tu rol no puede cerrar rondines.")) return;
  const activo = getRondineroActivo();
  if(!activo) return renderRondinero();
  const esperados = (activo.puntoIdsEsperados || []).map(String);
  const visitados = (activo.puntoIdsVisitados || []).map(String);
  const omitidos = getRondineroPuntosOmitidos(activo);
  const pendientes = esperados.filter(id => !visitados.includes(id) && !omitidos.includes(id));
  if(pendientes.length){
    const siguiente = getRondineroSiguientePunto(activo);
    toast("Recorrido pendiente",`Debes visitar u omitir con justificación los ${pendientes.length} punto(s) restantes.${siguiente ? ` Siguiente: ${siguiente.nombre || siguiente.id}.` : ""}`,"warn",5200);
    return;
  }
  const completo = esperados.length > 0 && esperados.every(id => visitados.includes(id));
  if(!completo && !confirm(`El rondín tiene ${omitidos.length} punto(s) omitido(s) con justificación y se cerrará como incompleto. ¿Deseas continuar?`)) return;
  activo.status = completo ? "completado" : "incompleto";
  activo.finTs = Date.now();
  activo.tiempoTotalMin = Math.max(0, Math.round((activo.finTs - (activo.inicioTs || activo.finTs)) / 60000));
  activo.updatedTs = Date.now();
  saveRondineroLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertRondineroRondin(activo); }
    catch(e){
      console.warn(e);
      toast("Permisos Firebase","No se pudo cerrar el rondín en la nube. Revisa reglas de Rondinero.","warn",4200);
    }
  }
  toast("Rondinero", completo ? "Rondín completado." : "Rondín cerrado como incompleto.", completo ? "ok" : "warn", 2600);
  await renderRondinero();
}

function renderValePersonalModal(){
  const soloImss = hasPerm("crear_permiso_imss") && !hasPerm("crear_vale_personal");
  return `
    <div class="modal-overlay vale-modal" id="valePersonalModal" style="display:none;">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h3 style="margin:0;">${soloImss ? "Nuevo permiso IMSS" : "Nuevo vale de personal"}</h3>
            <small>${soloImss ? "Servicio Médico registra salidas a consulta o entradas posteriores a las 8:15." : "Permiso de entrada/salida y tiempo autorizado."}</small>
          </div>
          <div class="modal-actions">
            ${soloImss ? "" : `<div id="vpModalidad" aria-label="Modalidad del vale" style="display:inline-flex;align-items:center;gap:4px;padding:3px;border:1px solid var(--line);border-radius:999px;background:var(--soft);">
              <label class="vp-modalidad-opcion" style="position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:28px;padding:4px 12px;border:1px solid var(--primary);border-radius:999px;cursor:pointer;font-size:13px;font-weight:900;background:var(--panel);color:var(--primary);"><input type="radio" name="vpModalidad" value="individual" checked style="position:absolute!important;opacity:0!important;width:1px!important;height:1px!important;pointer-events:none;"><span class="vp-modalidad-indicador" aria-hidden="true" style="width:12px;height:12px;border:1.5px solid currentColor;border-radius:50%;display:grid;place-items:center;flex:0 0 12px;"><span style="width:5px;height:5px;border-radius:50%;background:currentColor;"></span></span><span>Individual</span></label>
              <label class="vp-modalidad-opcion" style="position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:28px;padding:4px 12px;border:1px solid transparent;border-radius:999px;cursor:pointer;font-size:13px;font-weight:900;color:var(--muted);"><input type="radio" name="vpModalidad" value="grupal" style="position:absolute!important;opacity:0!important;width:1px!important;height:1px!important;pointer-events:none;"><span class="vp-modalidad-indicador" aria-hidden="true" style="width:12px;height:12px;border:1.5px solid currentColor;border-radius:50%;display:grid;place-items:center;flex:0 0 12px;"><span style="width:5px;height:5px;border-radius:50%;background:currentColor;opacity:0;"></span></span><span>Grupal</span></label>
            </div>`}
            <button class="secondary" data-action="closeValePersonalModal">Cerrar</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="two">
            <div id="vpDatosIndividuales" style="display:contents;">
            <div>
              <label>Nombre colaborador *</label>
              <input id="vpNombre" placeholder="Nombre completo">
            </div>
            <div>
              <label>Nómina *</label>
              <input id="vpNomina" inputmode="text" maxlength="4" pattern="[0-9]{4}|P[0-9]{3}" autocomplete="off" autocapitalize="characters" placeholder="1234 o P064">
            </div>
            <div>
              <label>Departamento *</label>
              <select id="vpDepartamento">
                <option value="">— Selecciona —</option>
                <option>Administración y Finanzas</option>
                <option>Calidad</option>
                <option>Comercialización</option>
                <option>Compras</option>
                <option>Contraloria</option>
                <option>Diseño y desarrollo</option>
                <option>DOH</option>
                <option>Ingeniería</option>
                <option>Mantenimiento</option>
                <option>Operaciones</option>
                <option>SYS</option>
                <option>TI</option>
                <option>Ventas</option>
              </select>
            </div>
            </div>
            ${soloImss ? "" : `<div id="vpDatosGrupales" style="display:none;grid-column:1/-1;">
              <div class="card" style="padding:14px;margin:0;">
                <div class="row" style="justify-content:space-between;align-items:center;">
                  <div><b>Integrantes del grupo</b><small style="display:block;color:var(--muted);">Captura manualmente nombre, nómina y departamento. Marca a una persona como responsable.</small><small id="vpContadorIntegrantes" style="display:block;margin-top:4px;font-weight:900;color:var(--primary);">0 de 10 integrantes</small></div>
                  <button type="button" class="secondary" id="vpAgregarIntegrante">Agregar integrante</button>
                </div>
                <div id="vpIntegrantesGrupo" style="display:grid;gap:10px;margin-top:12px;"></div>
              </div>
            </div>`}
            <div>
              <label>Tipo permiso *</label>
              <select id="vpTipoPermiso">
                ${soloImss ? `<option selected>Permiso IMSS</option>` : `<option value="">— Selecciona —</option><option>Salida</option><option>Entrada</option>`}
              </select>
            </div>
            ${soloImss ? `<div>
              <label>Movimiento *</label>
              <select id="vpMovimientoImss">
                <option value="">— Selecciona —</option>
                <option value="salida_consulta">Salida a consulta IMSS</option>
                <option value="entrada_815">Entrada posterior a las 8:15 a.m.</option>
              </select>
            </div>` : ""}
            <div>
              <label>Tiempo autorizado *</label>
              <select id="vpTiempoAutorizado">
                <option value="">— Selecciona —</option>
                <option>Salida 15 minutos</option>
                <option>Salida 30 minutos</option>
                <option>Salida 1 hora</option>
                <option>Sin horario estimado de regreso</option>
                <option>Salida sin regreso</option>
                <option>Trabajo en horario o días no laborables (Límite de hora: 07:00 a.m. - 7:00 p.m.)</option>
                <option>Entrada posterior a las 8:15 a.m.</option>
              </select>
            </div>
            <div>
              <label>Fecha</label>
              <input id="vpFecha" type="date" value="${new Date().toISOString().slice(0,10)}">
            </div>
            ${soloImss ? `<div id="vpHoraSalidaImssWrap" style="display:none;">
              <label>Hora programada de salida *</label>
              <input id="vpHoraSalidaImss" type="time">
              <small>El QR funcionará desde 5 minutos antes y hasta las 6:00 p.m. del mismo día.</small>
            </div>` : ""}
            <div style="${soloImss ? "display:none;" : ""}">
              <label>Autoriza *</label>
              <select id="vpAutorizador">
                ${renderValePersonalAutorizadorOptions()}
              </select>
              <small id="vpRestriccionAutorizacion" style="display:none;margin-top:6px;color:#b45309;font-weight:700;line-height:1.4;">Solo su Jefe o el Administrador puede autorizar este vale. Elija el nombre de su Jefe en el campo de autorización.</small>
            </div>
            <div style="grid-column:1/-1;">
              <label>Observaciones</label>
              <textarea id="vpObservaciones" rows="2" placeholder="Ej. Entrada posterior a 8:15, asunto personal, cita médica, etc."></textarea>
            </div>
          </div>
          <div class="divider"></div>
          <div class="row">
            <button data-action="guardarValePersonal">Guardar y generar QR</button>
            <button class="secondary" data-action="closeValePersonalModal">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function opcionesDepartamentoValePersonal(selected=""){
  return ["Administración y Finanzas","Calidad","Comercialización","Compras","Contraloria","Diseño y desarrollo","DOH","Ingeniería","Mantenimiento","Operaciones","SYS","TI","Ventas"]
    .map(value => `<option ${value === selected ? "selected" : ""}>${esc(value)}</option>`).join("");
}

const MAX_INTEGRANTES_VALE_GRUPAL = 10;

function normalizarCapturaNominaVale(value=""){
  const raw = String(value || "").toUpperCase().replace(/\s/g, "");
  if(raw.startsWith("P")) return `P${raw.slice(1).replace(/\D/g, "").slice(0,3)}`;
  return raw.replace(/\D/g, "").slice(0,4);
}

function configurarCampoNominaVale(input, { grupal=false }={}){
  if(!input || input.dataset.nominaFormatoConfigurada === "1") return;
  input.dataset.nominaFormatoConfigurada = "1";
  input.inputMode = "text";
  input.maxLength = 4;
  input.pattern = "[0-9]{4}|P[0-9]{3}";
  input.autocomplete = "off";
  input.autocapitalize = "characters";
  input.addEventListener("beforeinput", event => {
    if(event.data){
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const next = `${input.value.slice(0,start)}${event.data}${input.value.slice(end)}`.toUpperCase();
      if(/^(?:\d{0,4}|P\d{0,3})$/.test(next)) return;
      event.preventDefault();
      toast(
        "Formato de nómina",
        grupal ? "Usa 4 dígitos o P seguida de 3 dígitos para practicantes." : "Usa 4 dígitos o el formato de practicante P064. Para varias personas, selecciona la modalidad Grupal.",
        "warn",
        4200
      );
    }
  });
  input.addEventListener("paste", event => {
    const raw = (event.clipboardData?.getData("text") || "").trim().toUpperCase();
    const normalized = normalizarCapturaNominaVale(raw);
    event.preventDefault();
    input.value = normalized;
    input.dispatchEvent(new Event("input", { bubbles:true }));
    if(raw !== normalized){
      toast(
        "Nómina corregida",
        grupal ? "Se eliminaron caracteres no válidos. Usa 4 dígitos o P seguida de 3 dígitos." : "Se corrigió el formato. Usa 4 dígitos o P seguida de 3 dígitos para practicantes.",
        "warn",
        4400
      );
    }
  });
  input.addEventListener("input", () => {
    const normalized = normalizarCapturaNominaVale(input.value);
    if(input.value !== normalized) input.value = normalized;
  });
}

function actualizarLimiteIntegrantesValeGrupal(){
  const total = document.querySelectorAll("#vpIntegrantesGrupo .vp-grupo-integrante").length;
  const contador = document.getElementById("vpContadorIntegrantes");
  const boton = document.getElementById("vpAgregarIntegrante");
  if(contador) contador.textContent = `${total} de ${MAX_INTEGRANTES_VALE_GRUPAL} integrantes`;
  if(boton){
    boton.disabled = total >= MAX_INTEGRANTES_VALE_GRUPAL;
    boton.textContent = total >= MAX_INTEGRANTES_VALE_GRUPAL ? "Límite alcanzado" : "Agregar integrante";
  }
}

function agregarIntegranteValeGrupal(data={}){
  const contenedor = document.getElementById("vpIntegrantesGrupo");
  if(!contenedor) return;
  if(contenedor.querySelectorAll(".vp-grupo-integrante").length >= MAX_INTEGRANTES_VALE_GRUPAL){
    actualizarLimiteIntegrantesValeGrupal();
    return toast("Límite alcanzado",`Cada vale grupal admite un máximo de ${MAX_INTEGRANTES_VALE_GRUPAL} integrantes. Genera otro vale para las personas restantes.`,"warn",4800);
  }
  const row = document.createElement("div");
  row.className = "vp-grupo-integrante";
  row.dataset.id = data.id || globalThis.crypto?.randomUUID?.() || `INT-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  row.style.cssText = "display:grid;grid-template-columns:minmax(170px,1.5fr) minmax(100px,.7fr) minmax(160px,1fr) auto auto;gap:8px;align-items:end;padding:10px;border:1px solid var(--line);border-radius:12px;";
  row.innerHTML = `
    <div><label>Nombre *</label><input class="vp-int-nombre" value="${esc(data.nombre || "")}" placeholder="Nombre completo"></div>
    <div><label>Nómina *</label><input class="vp-int-nomina" value="${esc(data.nomina || "")}" inputmode="text" maxlength="4" pattern="[0-9]{4}|P[0-9]{3}" autocomplete="off" autocapitalize="characters" placeholder="1234 o P064"></div>
    <div><label>Departamento *</label><select class="vp-int-departamento"><option value="">— Selecciona —</option>${opcionesDepartamentoValePersonal(data.departamento || "")}</select></div>
    <label style="display:flex;gap:6px;align-items:center;min-height:42px;"><input type="radio" name="vpResponsableGrupo" class="vp-int-responsable" ${data.responsable ? "checked" : ""}> Responsable</label>
    <button type="button" class="secondary vp-int-eliminar" aria-label="Quitar integrante">Quitar</button>`;
  contenedor.appendChild(row);
  actualizarLimiteIntegrantesValeGrupal();
  if(!contenedor.querySelector(".vp-int-responsable:checked")) row.querySelector(".vp-int-responsable").checked = true;
  row.querySelector(".vp-int-eliminar").addEventListener("click", () => {
    const eraResponsable = row.querySelector(".vp-int-responsable").checked;
    row.remove();
    if(eraResponsable && !contenedor.querySelector(".vp-int-responsable:checked")) contenedor.querySelector(".vp-int-responsable")?.click();
    actualizarLimiteIntegrantesValeGrupal();
    syncValePersonalAutorizadoresGrupo();
  });
  const nominaInput = row.querySelector(".vp-int-nomina");
  configurarCampoNominaVale(nominaInput, { grupal:true });
  nominaInput.addEventListener("input", syncValePersonalAutorizadoresGrupo);
}

function obtenerIntegrantesValeGrupalFormulario(){
  return Array.from(document.querySelectorAll("#vpIntegrantesGrupo .vp-grupo-integrante")).map(row => {
    const nomina = row.querySelector(".vp-int-nomina")?.value.trim() || "";
    const perfil = perfilValePersonalPorNomina(nomina);
    return {
      id:row.dataset.id || globalThis.crypto?.randomUUID?.() || `INT-${Date.now()}`,
      nombre:row.querySelector(".vp-int-nombre")?.value.trim() || "",
      nomina,
      departamento:row.querySelector(".vp-int-departamento")?.value || "",
      responsable:Boolean(row.querySelector(".vp-int-responsable")?.checked),
      colaboradorUid:perfil?.uid || perfil?.id || "",
      colaboradorRole:perfil?.role || ""
    };
  });
}

function modalidadValePersonalActual(){
  return document.querySelector('input[name="vpModalidad"]:checked')?.value || "individual";
}

function syncModalidadValePersonal(){
  const grupal = modalidadValePersonalActual() === "grupal";
  document.getElementById("valePersonalModal")?.classList.toggle("is-grupal", grupal);
  document.querySelectorAll(".vp-modalidad-opcion").forEach(label => {
    const active = Boolean(label.querySelector("input")?.checked);
    label.style.background = active ? "var(--panel)" : "transparent";
    label.style.boxShadow = "none";
    label.style.color = active ? "var(--primary)" : "var(--muted)";
    label.style.borderColor = active ? "var(--primary)" : "transparent";
    const innerDot = label.querySelector(".vp-modalidad-indicador span");
    if(innerDot) innerDot.style.opacity = active ? "1" : "0";
  });
  const individual = document.getElementById("vpDatosIndividuales");
  const grupo = document.getElementById("vpDatosGrupales");
  if(individual) individual.style.display = grupal ? "none" : "contents";
  if(grupo) grupo.style.display = grupal ? "block" : "none";
  if(grupal && !document.querySelector("#vpIntegrantesGrupo .vp-grupo-integrante")){
    agregarIntegranteValeGrupal({ responsable:true });
    agregarIntegranteValeGrupal();
  }
  if(grupal) syncValePersonalAutorizadoresGrupo(); else syncValePersonalAutorizadoresPorNomina();
}

function syncValePersonalAutorizadoresGrupo(){
  const select = document.getElementById("vpAutorizador");
  const aviso = document.getElementById("vpRestriccionAutorizacion");
  if(!select || modalidadValePersonalActual() !== "grupal") return;
  const integrantes = obtenerIntegrantesValeGrupalFormulario();
  const perfiles = integrantes.map(item => perfilValePersonalPorNomina(item.nomina)).filter(Boolean);
  const tieneRestringido = perfiles.some(esPerfilJefeRestringido);
  const selected = select.value;
  const perfilFiltro = tieneRestringido ? { role:ROLES.JEFE_RESTRINGIDO } : null;
  select.innerHTML = renderValePersonalAutorizadorOptions(perfilFiltro);
  if(Array.from(select.options).some(option => option.value === selected)) select.value = selected;
  if(aviso){
    aviso.style.display = tieneRestringido ? "block" : "none";
    aviso.textContent = tieneRestringido
      ? "El grupo incluye un Jefe restringido. Solo su Jefe o el Administrador puede autorizar este vale."
      : "";
  }
}

async function openValePersonalModal(){
  if(hasPerm("crear_vale_personal")){
    await ensureValePersonalAutorizadores();
    const sel = document.getElementById("vpAutorizador");
    if(sel) sel.innerHTML = renderValePersonalAutorizadorOptions();
  }
  const modal = document.getElementById("valePersonalModal");
  if(modal){
    const modalidadIndividual = document.querySelector('input[name="vpModalidad"][value="individual"]');
    if(modalidadIndividual) modalidadIndividual.checked = true;
    const integrantesGrupo = document.getElementById("vpIntegrantesGrupo");
    if(integrantesGrupo) integrantesGrupo.innerHTML = "";
    actualizarLimiteIntegrantesValeGrupal();
    modal.dataset.draftId = (globalThis.crypto?.randomUUID?.() || `VP-${Date.now()}-${Math.random().toString(36).slice(2,10)}`);
    modal.style.display = "flex";
  }
  const tipo = document.getElementById("vpTipoPermiso");
  if(tipo){
    tipo.onchange = syncValePersonalTiempoPorTipo;
    syncValePersonalTiempoPorTipo();
  }
  const movimientoImss = document.getElementById("vpMovimientoImss");
  if(movimientoImss) movimientoImss.onchange = syncValePersonalTiempoPorTipo;
  const modalidades = document.querySelectorAll('input[name="vpModalidad"]');
  if(modalidades.length){
    modalidades.forEach(input => input.addEventListener("change", syncModalidadValePersonal));
    document.getElementById("vpAgregarIntegrante")?.addEventListener("click", () => agregarIntegranteValeGrupal());
    syncModalidadValePersonal();
  }
  const nomina = document.getElementById("vpNomina");
  if(nomina){
    configurarCampoNominaVale(nomina);
    nomina.oninput = syncValePersonalAutorizadoresPorNomina;
    nomina.onchange = syncValePersonalAutorizadoresPorNomina;
    syncValePersonalAutorizadoresPorNomina();
  }
}

function syncValePersonalAutorizadoresPorNomina(){
  if(modalidadValePersonalActual() === "grupal") return syncValePersonalAutorizadoresGrupo();
  const nomina = document.getElementById("vpNomina")?.value || "";
  const select = document.getElementById("vpAutorizador");
  const aviso = document.getElementById("vpRestriccionAutorizacion");
  if(!select) return;
  const perfiles = perfilesValePersonalPorNomina(nomina);
  const perfil = perfiles.length === 1 ? perfiles[0] : null;
  const restringido = esPerfilJefeRestringido(perfil);
  const selected = select.value;
  select.innerHTML = renderValePersonalAutorizadorOptions(perfil);
  if(Array.from(select.options).some(option => option.value === selected)) select.value = selected;
  if(aviso){
    aviso.style.display = restringido ? "block" : "none";
    if(perfiles.length > 1){
      aviso.style.display = "block";
      aviso.textContent = "La nómina está duplicada en Usuarios. Corrija los perfiles antes de generar el vale.";
    }else{
      aviso.textContent = "Solo su Jefe o el Administrador puede autorizar este vale. Elija el nombre de su Jefe en el campo de autorización.";
    }
  }
}

function syncValePersonalTiempoPorTipo(){
  const tipo = document.getElementById("vpTipoPermiso");
  const tiempo = document.getElementById("vpTiempoAutorizado");
  if(!tipo || !tiempo) return;
  const entrada = tipo.value === "Entrada";
  const imss = tipo.value === "Permiso IMSS";
  const movimientoImss = document.getElementById("vpMovimientoImss")?.value || "";
  const entradaImss = imss && movimientoImss === "entrada_815";
  const salidaImss = imss && movimientoImss === "salida_consulta";
  const horaWrap = document.getElementById("vpHoraSalidaImssWrap");
  const horaInput = document.getElementById("vpHoraSalidaImss");
  if(entrada || entradaImss){
    tiempo.value = "Entrada posterior a las 8:15 a.m.";
    tiempo.disabled = true;
    if(horaWrap) horaWrap.style.display = "none";
    if(horaInput){ horaInput.value = ""; horaInput.required = false; }
  }else if(salidaImss){
    tiempo.value = "Sin horario estimado de regreso";
    tiempo.disabled = true;
    if(horaWrap) horaWrap.style.display = "";
    if(horaInput) horaInput.required = true;
  }else if(imss){
    tiempo.value = "";
    tiempo.disabled = true;
    if(horaWrap) horaWrap.style.display = "none";
    if(horaInput){ horaInput.value = ""; horaInput.required = false; }
  }else{
    tiempo.disabled = false;
    if(tiempo.value === "Entrada posterior a las 8:15 a.m.") tiempo.value = "";
    if(horaWrap) horaWrap.style.display = "none";
    if(horaInput){ horaInput.value = ""; horaInput.required = false; }
  }
}

function closeValePersonalModal(){
  const modal = document.getElementById("valePersonalModal");
  if(modal){
    modal.style.display = "none";
    delete modal.dataset.draftId;
  }
}

function createValePersonalFromModal(){
  const esGrupal = modalidadValePersonalActual() === "grupal";
  let integrantes = esGrupal ? obtenerIntegrantesValeGrupalFormulario() : [];
  let nombreColaborador = document.getElementById("vpNombre")?.value.trim() || "";
  let nomina = document.getElementById("vpNomina")?.value.trim() || "";
  let departamento = document.getElementById("vpDepartamento")?.value.trim() || "";
  const tipoPermisoSeleccionado = document.getElementById("vpTipoPermiso")?.value || "";
  const fecha = document.getElementById("vpFecha")?.value || new Date().toISOString().slice(0,10);
  const observaciones = document.getElementById("vpObservaciones")?.value.trim() || "";
  const esPermisoImss = tipoPermisoSeleccionado === "Permiso IMSS";
  const movimientoImss = document.getElementById("vpMovimientoImss")?.value || "";
  const esEntradaImss = esPermisoImss && movimientoImss === "entrada_815";
  const esSalidaImss = esPermisoImss && movimientoImss === "salida_consulta";
  // Los movimientos de Enfermería conservan su tipo principal para que Firebase
  // los reconozca como Permiso IMSS. La modalidad se distingue con movimientoImss.
  const tipoPermiso = tipoPermisoSeleccionado;
  const tiempoAutorizado = esEntradaImss
    ? "Entrada posterior a las 8:15 a.m."
    : esSalidaImss
      ? "Sin horario estimado de regreso"
      : (document.getElementById("vpTiempoAutorizado")?.value || "");
  const horaSalidaImss = document.getElementById("vpHoraSalidaImss")?.value || "";
  const autorizadorSelect = document.getElementById("vpAutorizador");
  const autorizadorOption = autorizadorSelect?.selectedOptions?.[0] || null;
  const autorizadorUid = esPermisoImss ? (currentUser?.uid || "") : (autorizadorSelect?.value || "");
  const autorizadorEmail = esPermisoImss ? (currentUser?.email || "") : (autorizadorOption?.dataset?.email || "");
  const autorizadorNombre = esPermisoImss ? (currentUser?.nombre || currentUser?.email || "Servicio Médico") : (autorizadorOption?.dataset?.nombre || "");
  const autorizadorRole = esPermisoImss ? (currentUser?.role || "") : (autorizadorOption?.dataset?.role || "");
  const autorizadorTelefono = autorizadorOption?.dataset?.telefono || "";
  if(esGrupal){
    if(integrantes.length < 2){
      toast("Grupo incompleto","Agrega por lo menos dos integrantes al vale grupal.","warn",4200);
      return null;
    }
    if(integrantes.length > MAX_INTEGRANTES_VALE_GRUPAL){
      toast("Grupo demasiado grande",`El máximo permitido es de ${MAX_INTEGRANTES_VALE_GRUPAL} integrantes por vale grupal.`,"bad",4800);
      return null;
    }
    if(integrantes.some(item => !item.nombre || !item.nomina || !item.departamento)){
      toast("Integrantes incompletos","Cada integrante debe tener nombre, número de nómina y departamento.","warn",4800);
      return null;
    }
    const integranteNominaInvalida = integrantes.find(item => !/^(?:\d{4}|P\d{3})$/.test(item.nomina));
    if(integranteNominaInvalida){
      toast("Nómina inválida",`La nómina de ${integranteNominaInvalida.nombre || "un integrante"} debe tener 4 dígitos o el formato de practicante P064.`,"bad",5200);
      document.querySelectorAll("#vpIntegrantesGrupo .vp-int-nomina")[integrantes.indexOf(integranteNominaInvalida)]?.focus();
      return null;
    }
    const nominas = integrantes.map(item => normalizarNominaPerfil(item.nomina));
    if(nominas.some((value,index) => !value || nominas.indexOf(value) !== index)){
      toast("Nóminas duplicadas","Cada integrante debe tener una nómina válida y diferente dentro del grupo.","bad",4800);
      return null;
    }
    if(!integrantes.some(item => item.responsable)) integrantes[0].responsable = true;
    const responsable = integrantes.find(item => item.responsable) || integrantes[0];
    nombreColaborador = responsable.nombre;
    nomina = "VARIOS";
    departamento = "Varios";
  }
  if(!esGrupal && !/^(?:\d{4}|P\d{3})$/.test(nomina)){
    toast("Nómina inválida","La nómina debe tener 4 dígitos o el formato de practicante P064. Para registrar a varias personas, selecciona la modalidad Grupal.","bad",5200);
    document.getElementById("vpNomina")?.focus();
    return null;
  }
  const perfilesColaborador = esGrupal ? [] : perfilesValePersonalPorNomina(nomina);
  const perfilColaborador = esGrupal ? null : (perfilesColaborador.length === 1 ? perfilesColaborador[0] : null);

  if(perfilesColaborador.length > 1){
    toast("Nómina duplicada","Esta nómina pertenece a más de un perfil de usuario. Un Administrador debe corregir los perfiles antes de generar el vale.","bad",6200);
    return null;
  }
  const grupoTieneJefeRestringido = esGrupal && integrantes.some(item => item.colaboradorRole === ROLES.JEFE_RESTRINGIDO);
  if(esPerfilJefeRestringido(perfilColaborador) || grupoTieneJefeRestringido){
    if(!puedeGestionarValeDeJefeRestringido() || ![ROLES.JEFE, ROLES.ADMIN].includes(autorizadorRole)){
      mensajeRestriccionJefeRestringido();
      return null;
    }
  }

  if(esPermisoImss && (currentUser?.role !== ROLES.SERVICIO_MEDICO || !hasPerm("crear_permiso_imss"))){
    toast("No permitido","Solo el rol Servicio Médico puede emitir permisos IMSS.","warn");
    return null;
  }
  if(esPermisoImss && !esEntradaImss && !esSalidaImss){
    toast("Movimiento obligatorio","Selecciona Salida a consulta IMSS o Entrada posterior a las 8:15.","warn");
    return null;
  }
  if(!nombreColaborador || !nomina || !departamento || !tipoPermiso || !tiempoAutorizado || !autorizadorUid || (esSalidaImss && !horaSalidaImss)){
    toast("Campos obligatorios","Nombre, nómina, departamento, tipo permiso, tiempo autorizado y autorizador.","warn");
    return null;
  }

  const salidaProgramadaTs = esSalidaImss ? new Date(`${fecha}T${horaSalidaImss}:00`).getTime() : 0;
  if(esSalidaImss && !Number.isFinite(salidaProgramadaTs)){
    toast("Horario inválido","Selecciona una fecha y hora de salida válidas.","warn");
    return null;
  }
  if(esSalidaImss && horaSalidaImss > "18:00"){
    toast("Horario fuera de límite","La hora programada de salida no puede ser posterior a las 6:00 p.m.","warn",4200);
    return null;
  }

  const modal = document.getElementById("valePersonalModal");
  const id = modal?.dataset?.draftId || globalThis.crypto?.randomUUID?.() || `VP-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  const esValePropio = normalizarIdentidadValePersonal(nombreColaborador) === normalizarIdentidadValePersonal(currentUser?.nombre) || (
    normalizarIdentidadValePersonal(nomina) &&
    normalizarIdentidadValePersonal(currentUser?.nomina) &&
    normalizarIdentidadValePersonal(nomina) === normalizarIdentidadValePersonal(currentUser?.nomina)
  );
  if(esGrupal){
    integrantes = integrantes.map(item => ({
      ...item,
      status:ValeStatus.PENDIENTE,
      salidaTs:null,
      regresoTs:null,
      llegadaTs:null,
      canceladoTs:null,
      salidaSinRegresoFinalizadaTs:null
    }));
  }
  return {
    id,
    folio: `${esPermisoImss ? "IMSS" : "VP"}-${new Date().getFullYear()}-${String(valesPersonal.length + 1).padStart(4,"0")}`,
    fecha,
    nombreColaborador,
    nomina,
    departamento,
    esGrupal,
    integrantes:esGrupal ? integrantes : [],
    nominasIntegrantes:esGrupal ? integrantes.map(item => String(item.nomina).trim()) : [],
    rolesIntegrantes:esGrupal ? integrantes.map(item => item.colaboradorRole || "").filter(Boolean) : [],
    contieneJefeRestringido:esGrupal ? integrantes.some(item => item.colaboradorRole === ROLES.JEFE_RESTRINGIDO) : false,
    totalIntegrantes:esGrupal ? integrantes.length : 1,
    colaboradorUid: perfilColaborador?.uid || perfilColaborador?.id || (esValePropio ? (currentUser?.uid || "") : ""),
    colaboradorRole: perfilColaborador?.role || "",
    tipoPermiso,
    tiempoAutorizado,
    observaciones,
    autorizadorUid,
    autorizadorEmail,
    autorizadorNombre,
    autorizadorRole,
    autorizadorTelefono,
    esPermisoImss,
    movimientoImss: esPermisoImss ? movimientoImss : "",
    salidaProgramadaTs: esSalidaImss ? salidaProgramadaTs : null,
    imssVentanaInicioTs: esSalidaImss ? salidaProgramadaTs - 5 * 60000 : null,
    imssVentanaFinTs: esSalidaImss ? new Date(`${fecha}T18:00:00`).getTime() : null,
    status: esPermisoImss ? ValeStatus.GENERADO : ValeStatus.PENDIENTE,
    qrActivo: true,
    autorizadoTs: esPermisoImss ? Date.now() : null,
    autorizadoPor: esPermisoImss ? (currentUser?.email || "") : "",
    autorizadoPorUid: esPermisoImss ? (currentUser?.uid || "") : "",
    autorizadoPorNombre: esPermisoImss ? (currentUser?.nombre || "Servicio Médico") : "",
    autorizadoPorRol: esPermisoImss ? ROLES.SERVICIO_MEDICO : "",
    createdByUid: currentUser?.uid || "",
    createdByEmail: currentUser?.email || "",
    createdByNombre: currentUser?.nombre || "",
    createdByTelefono: currentUser?.telefono || "",
    createdTs: Date.now(),
    updatedTs: Date.now()
  };
}

let guardandoValePersonal = false;

function solicitarAutorizacionInmediataVale(v={}){
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay show";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="autorizarAhoraTitle" style="max-width:520px;">
        <div class="modal-head"><div><h2 id="autorizarAhoraTitle" style="margin:0;">Vale generado correctamente</h2><small>${esc(v.folio || v.id || "")}</small></div></div>
        <div class="modal-body">
          <p style="margin-top:0;">Tu rol tiene permiso para autorizar el vale de <b>${esc(v.nombreColaborador || "este colaborador")}</b>.</p>
          <p style="color:var(--muted);">¿Deseas autorizarlo ahora? La autorización solicitará tu PIN y quedará registrada a tu nombre.</p>
          <div class="divider"></div>
          <div class="row" style="justify-content:flex-end;">
            <button class="secondary" id="autorizarValeDespues">Autorizar posteriormente</button>
            <button class="ok" id="autorizarValeAhora">Autorizar ahora</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const finish = value => { overlay.remove(); resolve(value); };
    overlay.querySelector("#autorizarValeAhora").addEventListener("click",()=>finish(true));
    overlay.querySelector("#autorizarValeDespues").addEventListener("click",()=>finish(false));
    overlay.addEventListener("click",event=>{ if(event.target===overlay) finish(false); });
  });
}

async function guardarValePersonal(){
  if(guardandoValePersonal) return;
  if(!hasPerm("crear_vale_personal") && !hasPerm("crear_permiso_imss")) return toast("No permitido","Tu rol no puede crear este permiso.","warn");
  const v = createValePersonalFromModal();
  if(!v) return;
  // El diálogo depende del permiso del rol y nunca permite autoautorizarse.
  const ofreceAutorizacionInmediata = !isPermisoImss(v) && canCurrentUserAuthorizeValePersonal(v);
  if(ofreceAutorizacionInmediata) v.qrActivo = false;
  let existingDuplicate = esValePersonalGrupal(v)
    ? valesPersonal.find(existing => valePersonalActivoParaDuplicado(existing) && v.integrantes.some(item => valePersonalIncluyeNomina(existing, item.nomina))) || null
    : encontrarValePersonalActivoEquivalente(valesPersonal, v);
  if(!existingDuplicate && navigator.onLine){
    try{
      const nominasConsulta = esValePersonalGrupal(v) ? v.nominasIntegrantes : [v.nomina];
      const cloudLists = await Promise.all(nominasConsulta.map(value => cloudFetchValesPersonalByNomina(value)));
      const cloudByNomina = mergeById([], cloudLists.flat());
      existingDuplicate = esValePersonalGrupal(v)
        ? cloudByNomina.find(existing => valePersonalActivoParaDuplicado(existing) && v.integrantes.some(item => valePersonalIncluyeNomina(existing, item.nomina))) || null
        : encontrarValePersonalActivoEquivalente(cloudByNomina, v);
      if(existingDuplicate){
        valesPersonal = mergeById(valesPersonal, cloudByNomina);
        saveValesPersonalLocal();
      }
    }catch(error){
      console.warn("No se pudo verificar duplicados en Firebase:", error);
      toast("Verificación parcial","Firebase no respondió; se revisaron únicamente los vales disponibles en este dispositivo.","warn",4200);
    }
  }
  if(existingDuplicate){
    toast("Vale ya existente",`Ya existe el vale activo ${existingDuplicate.folio || existingDuplicate.id} con los mismos datos. Se abrirá el registro existente.`,"warn",5200);
    closeValePersonalModal();
    return await renderValePersonalQR(existingDuplicate.id);
  }
  const saveButton = document.querySelector('[data-action="guardarValePersonal"]');
  guardandoValePersonal = true;
  if(saveButton){ saveButton.disabled=true; saveButton.textContent="Guardando..."; }
  try{
    if(!valesPersonal.some(existing => String(existing.id) === String(v.id))) valesPersonal.unshift(v);
    await saveValesPersonal();
    if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE && !(esValePersonalGrupal(v) && esPreviewValeGrupalLocal())) await cloudUpsertValePersonal(v);
    if(esValePersonalGrupal(v) && esPreviewValeGrupalLocal()) toast("Prueba local","El vale grupal se guardó únicamente en este dispositivo; Firebase no fue modificado.","info",5200);
    toast(isPermisoImss(v) ? "Permiso IMSS generado" : "Vale generado", isPermisoImss(v) ? "El QR respetará el horario programado." : ofreceAutorizacionInmediata ? "Vale guardado. El QR se activará al autorizarlo." : "Vale de personal guardado y QR generado.","ok",2400);
    closeValePersonalModal();
    if(ofreceAutorizacionInmediata){
      const autorizarAhora = await solicitarAutorizacionInmediataVale(v);
      if(autorizarAhora) await autorizarValePersonal(v.id, { renderAfter:false, freshPin:true });
      else toast("Pendiente de autorización","Puedes compartir el QR; podrá utilizarse cuando el vale sea autorizado.","info",3600);
      return await renderValePersonalQR(v.id, { allowCreatedPreview:true });
    }
    await renderValePersonalQR(v.id);
  }catch(error){
    console.error(error);
    valesPersonal = valesPersonal.filter(existing => String(existing.id) !== String(v.id));
    saveValesPersonalLocal();
    const errorCode = String(error?.code || "").toLowerCase();
    const errorMessage = errorCode.includes("permission-denied")
      ? isPermisoImss(v)
        ? "Firebase rechazó el permiso de escritura. Verifica que el usuario conserve el rol Servicio Médico e inténtalo nuevamente."
        : currentUser?.role === ROLES.JEFE_RESTRINGIDO
          ? "Firebase rechazó el permiso del Jefe restringido. Verifica que las reglas vigentes incluyan este rol y que el vale no corresponda a otro Jefe restringido."
          : "Firebase rechazó el permiso de escritura. Verifica que el rol conserve el permiso para crear vales de personal."
      : errorCode.includes("unavailable") || errorCode.includes("network")
        ? "Firebase no está disponible o no hay conexión. Recupera Internet y vuelve a intentarlo."
        : "Firebase no confirmó el permiso. Vuelve a intentarlo; la operación no se repetirá automáticamente.";
    toast("No se pudo confirmar el vale",errorMessage,"bad",6200);
  }finally{
    guardandoValePersonal = false;
    if(saveButton?.isConnected){ saveButton.disabled=false; saveButton.textContent="Guardar y generar QR"; }
  }
}

function seleccionarIntegrantesMovimientoGrupal(v, status){
  const esEntrada = isValePersonalEntrada(v);
  const elegibles = v.integrantes.filter(item => status === ValeStatus.FUERA
    ? item.status === ValeStatus.GENERADO
    : esEntrada ? item.status === ValeStatus.GENERADO : item.status === ValeStatus.FUERA);
  if(!elegibles.length){
    toast("Sin integrantes pendientes", status === ValeStatus.FUERA ? "No hay integrantes pendientes de salida." : "No hay integrantes pendientes de regreso o ingreso.", "info", 3800);
    return Promise.resolve([]);
  }
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay show";
    const accion = status === ValeStatus.FUERA ? "Registrar salida" : esEntrada ? "Registrar ingreso" : "Registrar regreso";
    overlay.innerHTML = `<div class="modal" style="max-width:620px;" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h3 style="margin:0;">${esc(accion)} · Vale grupal</h3><small>Selecciona a los integrantes que realizan este movimiento.</small></div></div>
      <div class="modal-body">
        <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px;"><input type="checkbox" id="vpGrupoSeleccionarTodos" checked> Seleccionar todos</label>
        <div style="display:grid;gap:8px;max-height:50vh;overflow:auto;">
          ${elegibles.map(item => `<label style="display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:10px;"><input type="checkbox" class="vp-grupo-movimiento" value="${esc(item.id)}" checked><span><b>${esc(item.nombre)}</b><small style="display:block;">Nómina ${esc(item.nomina)} · ${esc(item.departamento)}</small></span></label>`).join("")}
        </div>
        <div class="divider"></div><div class="row" style="justify-content:flex-end;"><button class="secondary" id="vpGrupoCancelarMovimiento">Cancelar</button><button class="ok" id="vpGrupoConfirmarMovimiento">${esc(accion)}</button></div>
      </div></div>`;
    document.body.appendChild(overlay);
    const close = value => { overlay.remove(); resolve(value); };
    overlay.querySelector("#vpGrupoSeleccionarTodos").onchange = event => overlay.querySelectorAll(".vp-grupo-movimiento").forEach(input => { input.checked = event.target.checked; });
    overlay.querySelector("#vpGrupoCancelarMovimiento").onclick = () => close([]);
    overlay.querySelector("#vpGrupoConfirmarMovimiento").onclick = () => {
      const ids = Array.from(overlay.querySelectorAll(".vp-grupo-movimiento:checked")).map(input => input.value);
      if(!ids.length) return toast("Selecciona integrantes","Elige por lo menos una persona para registrar el movimiento.","warn",3200);
      close(ids);
    };
  });
}

function recalcularEstadoValeGrupal(v){
  const estado = estadoIntegrantesValePersonal(v);
  if(estado.finalizados === estado.total){
    v.status = ValeStatus.REGRESO_CANCELADO;
    v.qrActivo = false;
    v.qrDesactivadoTs = Date.now();
    v.qrDesactivadoMotivo = "GRUPO_FINALIZADO";
  }else if(estado.fuera > 0){
    v.status = ValeStatus.FUERA;
    v.qrActivo = true;
  }else{
    v.status = ValeStatus.GENERADO;
    v.qrActivo = true;
  }
}

async function updateValePersonalStatusGrupal(v, status, movimientoDesdeQr){
  const ids = await seleccionarIntegrantesMovimientoGrupal(v, status);
  if(!ids.length) return false;
  const now = Date.now();
  const elegidos = new Set(ids.map(String));
  const esEntrada = isValePersonalEntrada(v);
  const salidaSinRegreso = isValePersonalSalidaSinRegreso(v);
  v.integrantes.forEach(item => {
    if(!elegidos.has(String(item.id))) return;
    item.updatedTs = now;
    item.movimientoPorUid = currentUser?.uid || "";
    item.movimientoPorEmail = currentUser?.email || "";
    item.movimientoPorNombre = currentUser?.nombre || "";
    if(status === ValeStatus.FUERA){
      item.salidaTs = now;
      if(salidaSinRegreso){
        item.status = ValeStatus.REGRESO_CANCELADO;
        item.salidaSinRegresoFinalizadaTs = now;
      }else{
        item.status = ValeStatus.FUERA;
      }
    }else{
      item.status = ValeStatus.REGRESO_CANCELADO;
      if(esEntrada){ item.llegadaTs = now; item.entradaBaseTs = getEntrada815BaseTs(v); }
      else item.regresoTs = now;
    }
  });
  recalcularEstadoValeGrupal(v);
  v.updatedTs = now;
  v.ultimoRegistroOrigen = movimientoDesdeQr ? "qr" : "manual";
  await saveValesPersonal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE && !esPreviewValeGrupalLocal()){
    try{ await cloudUpsertValePersonal(v); }catch(error){ console.warn(error); toast("Sin confirmar en Firebase","El movimiento quedó local, pero Firebase no lo confirmó.","warn",4800); }
  }
  const estado = estadoIntegrantesValePersonal(v);
  toast("Movimiento grupal registrado",`${ids.length} integrante(s) actualizados · ${estado.finalizados}/${estado.total} finalizados.`,"ok",4200);
  if(!movimientoDesdeQr) cerrarRegistroManualPersonal();
  await renderValesPersonal();
  return true;
}

async function updateValePersonalStatus(id, status){
  const v = valesPersonal.find(x => String(x.id) === String(id));
  if(!v) return toast("No encontrado","No se encontró el vale.","warn");

  if(status === ValeStatus.PENDIENTE && !hasPerm("crear_vale_personal")) return;
  if(status === ValeStatus.FUERA && !hasPerm("registrar_salida_personal")) return;
  if(status === ValeStatus.REGRESO_CANCELADO && !hasPerm("registrar_regreso_personal") && !(isValePersonalEntrada(v) && hasPerm("registrar_salida_personal"))) return;

  const movimientoDesdeQr = currentView === "vale_personal_operacion";
  if(!movimientoDesdeQr && !registroManualPersonalActivo()){
    toast("Escaneo requerido","Escanea el QR del vale o habilita temporalmente el registro manual.","warn",4200);
    return;
  }

  if(esValePersonalGrupal(v)) return updateValePersonalStatusGrupal(v, status, movimientoDesdeQr);

  const now = Date.now();
  const finalizarSinRegreso = status === ValeStatus.FUERA && isValePersonalSalidaSinRegreso(v);
  if(isValePersonalEntrada(v) && status === ValeStatus.REGRESO_CANCELADO && String(v.fecha || "") !== todayISO()){
    toast("Fecha no vigente","Este vale de entrada solo puede registrarse durante la fecha indicada.","bad",4800);
    return;
  }
  if(isPermisoImss(v) && status === ValeStatus.FUERA){
    const estadoImss = getPermisoImssQrState(v, now);
    if(estadoImss === "anticipado"){
      await registrarIntentoPermisoImss(v, "anticipado");
      const { inicioTs } = getPermisoImssWindow(v);
      toast("Permiso aún no habilitado", `La salida puede registrarse a partir de las ${formatHoraTs(inicioTs)}.`, "warn", 5200);
      return;
    }
    if(estadoImss !== "habilitado"){
      await registrarIntentoPermisoImss(v, estadoImss === "vencido" ? "vencido" : "invalido");
      toast("Permiso IMSS no vigente", "La ventana de salida terminó. Servicio Médico debe generar un permiso nuevo.", "bad", 5200);
      return;
    }
  }
  if(isPermisoImss(v) && status === ValeStatus.REGRESO_CANCELADO && String(v.fecha || "") !== todayISO()){
    toast("Permiso vencido", "El regreso de este permiso IMSS solo puede registrarse el mismo día.", "bad", 4800);
    return;
  }
  v.status = status;
  v.updatedTs = now;
  if(status === ValeStatus.FUERA){
    v.salidaTs = now;
    v.salidaGuardiaUid = currentUser?.uid || "";
    v.salidaGuardiaEmail = currentUser?.email || "";
    v.salidaGuardiaNombre = currentUser?.nombre || "";
    v.ultimoTiempoAutorizadoTs = now;
    v.reautorizacionPendiente = false;
    if(isPermisoImss(v)){
      v.imssSalidaRealTs = now;
      v.imssSalidaDiferenciaMin = Math.round((now - getPermisoImssWindow(v).salidaTs) / 60000);
      v.imssSalidaGuardiaUid = currentUser?.uid || "";
      v.imssSalidaGuardiaEmail = currentUser?.email || "";
      v.imssSalidaGuardiaNombre = currentUser?.nombre || "";
    }
    if(finalizarSinRegreso){
      v.status = ValeStatus.REGRESO_CANCELADO;
      v.salidaSinRegresoFinalizada = true;
      v.salidaSinRegresoFinalizadaTs = now;
      v.qrActivo = false;
      v.qrDesactivadoTs = now;
      v.qrDesactivadoMotivo = "SALIDA_SIN_REGRESO";
    }
  }
  if(status === ValeStatus.REGRESO_CANCELADO){
    v.regresoGuardiaUid = currentUser?.uid || "";
    v.regresoGuardiaEmail = currentUser?.email || "";
    v.regresoGuardiaNombre = currentUser?.nombre || "";
    if(isValePersonalEntrada(v)){
      v.llegadaTs = now;
      v.entradaBaseTs = getEntrada815BaseTs(v);
      v.tiempoLlegadaMin = calcEntrada815Min(v);
      v.registroIngresoPor = currentUser?.nombre || "";
    }else{
      v.regresoTs = now;
      v.tiempoUsadoMin = calcValePersonalTiempo(v);
    }
    v.qrActivo = false;
    v.reautorizacionPendiente = false;
    v.qrDesactivadoTs = now;
    v.qrDesactivadoMotivo = "REGRESO_CANCELADO";
  }

  v.ultimoRegistroOrigen = movimientoDesdeQr ? "qr" : "manual";
  if(!movimientoDesdeQr){
    if(!Array.isArray(v.historialRegistroManual)) v.historialRegistroManual = [];
    v.historialRegistroManual.push({
      ts: now,
      motivo: registroManualPersonalMotivo,
      uid: currentUser?.uid || "",
      email: currentUser?.email || "",
      nombre: currentUser?.nombre || "",
      role: currentUser?.role || "",
      status: v.status
    });
  }

  await saveValesPersonal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertValePersonal(v); }catch(e){ console.warn(e); }
  }
  toast("Vale actualizado", finalizarSinRegreso ? "Salida registrada; el vale quedó finalizado y el QR fue desactivado." : isValePersonalEntrada(v) && status === ValeStatus.REGRESO_CANCELADO ? "Ingreso registrado y vale finalizado." : valeStatusLabel(status), "ok", 2600);
  if(!movimientoDesdeQr) cerrarRegistroManualPersonal();
  await renderValesPersonal();
}

async function renderValePersonalOperacion(id){
  if(!requirePerm("ver_vales_personal","Tu rol no puede ver vales de personal.")) return;
  currentView = "vale_personal_operacion";
  moduleReturnView = "vales_personal";
  const v = valesPersonal.find(x => String(x.id) === String(id));
  if(!v){
    toast("No encontrado","No se encontró el vale de personal.","warn",3200);
    return renderValesPersonal();
  }
  const esEntrada = isValePersonalEntrada(v);
  if(esEntrada && String(v.fecha || "") !== todayISO()){
    const futura = String(v.fecha || "") > todayISO();
    toast(futura ? "Vale programado" : "Vale vencido", futura ? `La entrada corresponde al ${valePassDate(v.fecha)}.` : "Este vale de entrada solo podía utilizarse en la fecha indicada.", "warn", 5200);
    return await renderValesPersonal();
  }
  if(isPermisoImss(v) && !esEntrada && v.status === ValeStatus.GENERADO){
    const estadoImss = getPermisoImssQrState(v);
    if(estadoImss === "anticipado"){
      const { inicioTs, salidaTs } = getPermisoImssWindow(v);
      await registrarIntentoPermisoImss(v, "anticipado");
      toast("Permiso aún no habilitado", `Salida programada ${formatHoraTs(salidaTs)}. El QR se habilita a las ${formatHoraTs(inicioTs)}.`, "warn", 5600);
      return await renderValesPersonal();
    }
    if(estadoImss !== "habilitado"){
      await registrarIntentoPermisoImss(v, estadoImss === "vencido" ? "vencido" : "invalido");
      toast("Permiso IMSS no vigente", "La ventana permitida para registrar la salida ya terminó.", "bad", 5200);
      return await renderValesPersonal();
    }
  }
  const accion = v.status === ValeStatus.GENERADO
    ? (esEntrada ? "Registrar ingreso" : "Marcar salida")
    : v.status === ValeStatus.FUERA
      ? "Registrar regreso"
      : "Consultar vale";
  appEl.innerHTML = `
    <section class="provider-dashboard-modern vale-dashboard-modern">
      <div class="provider-dashboard-hero">
        <div class="provider-dashboard-hero-copy">
          <div class="provider-dashboard-hero-icon" aria-hidden="true">▦</div>
          <div>
            <h2>Vale de personal localizado</h2>
            <p>Verifica los datos y pulsa ${esc(accion)} para registrar el movimiento.</p>
          </div>
        </div>
        <div class="provider-dashboard-date"><span aria-hidden="true">●</span>${new Date().toLocaleDateString()}</div>
      </div>
      <div class="dashboard-toolbar">
        <span class="pill"><span class="dot ok"></span>QR reconocido</span>
        <button class="secondary" data-action="scan" data-from="vales_personal">Escanear otro</button>
        <button class="secondary" data-action="valesPersonal">Volver a vales</button>
      </div>
      <div class="rondinero-workspace">
        ${renderValePersonalCard(v)}
      </div>
    </section>
  `;
}

function solicitarMotivoEmergencia(v){
  return new Promise(resolve=>{
    const back=document.createElement("div");back.className="modal-backdrop";
    back.innerHTML=`<div class="modal"><h3>Autorización de emergencia</h3><p class="muted">Vale de <b>${esc(v.nombreColaborador||"colaborador")}</b>. Esta acción quedará identificada y auditada.</p><label>Motivo de la urgencia</label><textarea id="emergenciaMotivo" rows="4" maxlength="300" placeholder="Describe por qué no puede esperar al autorizador asignado"></textarea><div style="height:12px"></div><div class="row" style="justify-content:flex-end;"><button class="secondary" id="cancelEmergencia">Cancelar</button><button class="danger" id="confirmEmergencia">Continuar con PIN</button></div></div>`;
    document.body.appendChild(back);const close=value=>{back.remove();resolve(value);};
    back.querySelector("#cancelEmergencia").onclick=()=>close(null);
    back.querySelector("#confirmEmergencia").onclick=()=>{const motivo=back.querySelector("#emergenciaMotivo").value.trim();if(motivo.length<10){toast("Motivo requerido","Describe la urgencia con al menos 10 caracteres.","warn",3200);return;}close(motivo);};
    back.addEventListener("click",e=>{if(e.target===back)close(null);});setTimeout(()=>back.querySelector("#emergenciaMotivo")?.focus(),0);
  });
}

async function autorizarValePersonalEmergencia(id){
  if(!requirePerm("autorizar_vale_personal_emergencia","Tu rol no puede realizar autorizaciones de emergencia."))return;
  if(currentUser?.role!==ROLES.RECEPCIONISTA)return toast("Acceso denegado","Esta función está reservada al rol Recepcionista.","bad",3600);
  const v=valesPersonal.find(x=>String(x.id)===String(id));
  if(!v||v.status!==ValeStatus.PENDIENTE)return toast("No disponible","El vale ya fue atendido o no existe.","warn",3200);
  if(!validarAutoautorizacionValePersonal(v))return;
  if(isValePersonalEntrada(v)||isPermisoImss(v))return toast("No permitido","La autorización de emergencia sólo aplica a vales ordinarios de salida.","warn",4200);
  if(!navigator.onLine)return toast("Sin conexión","La autorización de emergencia debe confirmarse directamente en Firebase.","warn",4200);
  const motivo=await solicitarMotivoEmergencia(v);if(!motivo)return;
  if(!(await requireUserPin("autorizar este vale por emergencia")))return;
  const previous={...v},now=Date.now();
  Object.assign(v,{status:ValeStatus.GENERADO,qrActivo:true,autorizadoTs:now,autorizadoPor:currentUser?.email||"",autorizadoPorUid:currentUser?.uid||"",autorizadoPorNombre:currentUser?.nombre||"",autorizadoPorRol:currentUser?.role||"",autorizacionEmergencia:true,autorizacionEmergenciaMotivo:motivo,autorizacionEmergenciaTs:now,autorizacionEmergenciaPorUid:currentUser?.uid||"",autorizacionEmergenciaPorEmail:currentUser?.email||"",autorizacionEmergenciaPorNombre:currentUser?.nombre||"",updatedTs:now});
  try{await cloudUpsertValePersonal(v);await saveValesPersonal();toast("Autorización de emergencia","El vale fue autorizado y la justificación quedó registrada.","ok",4200);}
  catch(error){Object.assign(v,previous);await saveValesPersonal();console.error(error);toast("No se autorizó","Firebase no confirmó la autorización de emergencia.","bad",4800);}
  await renderValesPersonal();
}

async function autorizarValePersonal(id, { renderAfter=true, freshPin=false }={}){
  if(!requirePerm("autorizar_vale_personal","Tu rol no puede autorizar vales de personal.")) return false;
  const v = valesPersonal.find(x => String(x.id) === String(id));
  if(!v){ toast("No encontrado","No se encontró el vale.","warn"); return false; }
  if(!validarAutoautorizacionValePersonal(v)) return false;
  if(!canCurrentUserAuthorizeValePersonal(v)){
    toast(
      "No permitido",
      "Tu rol no tiene permiso para autorizar vales de personal.",
      "warn",
      4200
    );
    return false;
  }
  if(!navigator.onLine){
    toast("Sin conexión","No se puede autorizar hasta confirmar el cambio en Firebase.","warn",4200);
    return false;
  }
  const pinValido = freshPin
    ? await requireFreshUserPin("autorizar este vale de personal")
    : await requireUserPin("autorizar este vale de personal");
  if(!pinValido) return false;
  const returnToUpcoming = currentView === "proximos_vales_personal";
  const previousVale = globalThis.structuredClone ? structuredClone(v) : JSON.parse(JSON.stringify(v));
  const now = Date.now();
  v.status = ValeStatus.GENERADO;
  v.qrActivo = true;
  v.autorizadoTs = now;
  v.autorizadoPor = currentUser?.email || "";
  v.autorizadoPorUid = currentUser?.uid || "";
  v.autorizadoPorNombre = currentUser?.nombre || "";
  v.autorizadoPorRol = currentUser?.role || "";
  v.updatedTs = Date.now();
  if(esValePersonalGrupal(v)){
    v.integrantes.forEach(item => { if(item.status === ValeStatus.PENDIENTE) item.status = ValeStatus.GENERADO; });
  }
  try{
    if(!(esValePersonalGrupal(v) && esPreviewValeGrupalLocal())) await cloudUpsertValePersonal(v);
  }catch(e){
    console.warn("No se pudo confirmar la autorización en Firebase:", e);
    Object.assign(v, previousVale);
    await saveValesPersonal();
    toast("No se autorizó","Firebase no confirmó el cambio. Revisa la conexión y vuelve a intentarlo.","bad",5200);
    if(renderAfter){
      if(returnToUpcoming) await renderProximosValesPersonal(false); else await renderValesPersonal();
    }
    return false;
  }
  await saveValesPersonal();
  toast("Autorizado", "El vale de personal quedó autorizado.", "ok",2400);
  if(renderAfter){
    if(returnToUpcoming) await renderProximosValesPersonal(false); else await renderValesPersonal();
  }
  return true;
}

async function cancelarValePersonal(id){
  if(!hasPerm("crear_vale_personal") && !hasPerm("autorizar_vale_personal") && !hasPerm("crear_permiso_imss")) return;
  if(!confirm("¿Cancelar este vale de personal?")) return;
  const v = valesPersonal.find(x => String(x.id) === String(id));
  if(!v) return;
  v.status = ValeStatus.REGRESO_CANCELADO;
  v.canceladoTs = Date.now();
  v.canceladoPor = currentUser?.email || "";
  v.qrActivo = false;
  v.updatedTs = Date.now();
  if(esValePersonalGrupal(v)){
    v.integrantes.forEach(item => {
      if(item.status !== ValeStatus.REGRESO_CANCELADO){ item.status = ValeStatus.REGRESO_CANCELADO; item.canceladoTs = v.canceladoTs; }
    });
  }
  await saveValesPersonal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE && !(esValePersonalGrupal(v) && esPreviewValeGrupalLocal())){
    try{ await cloudUpsertValePersonal(v); }catch(e){ console.warn(e); }
  }
  toast("Cancelado","El vale de personal fue cancelado.","ok",2200);
  await renderValesPersonal();
}

async function renderValePersonalQR(id, { allowCreatedPreview=false }={}){
  if(!requirePerm("ver_vales_personal","Tu rol no puede ver vales de personal.")) return;
  if(!await loadFeatureDependencies("qr", "el código QR")) return renderValesPersonal();
  currentView = "vale_personal_qr";
  rememberModuleReturn(currentView);
  const v = valesPersonal.find(x => String(x.id) === String(id));
  if(!v) return renderValesPersonal();
  if(String(v.fecha || "") > todayISO() && !allowCreatedPreview){
    toast("QR aún no habilitado",`Este vale podrá utilizarse el ${valePassDate(v.fecha)}.`,"warn",4200);
    return renderProximosValesPersonal(false);
  }
  if(isValePersonalEntrada(v) && String(v.fecha || "") < todayISO()){
    toast("QR vencido","Este vale de entrada solo podía utilizarse en la fecha indicada.","warn",4200);
    return renderValesPersonal();
  }
  if(!v.qrActivo && !(allowCreatedPreview && v.status === ValeStatus.PENDIENTE)){
    toast("QR desactivado","Este vale ya está en Regreso o fue cancelado.","warn",3200);
    return renderValesPersonal();
  }

  const payload = `VALE_PERSONAL:${String(v.id)}`;
  const folio = v.folio || v.id;
  const esEntrada = isValePersonalEntrada(v);
  const esGrupal = esValePersonalGrupal(v);
  const listaIntegrantes = esGrupal ? v.integrantes.map((item,index) => `${index + 1}. ${item.nombre} · Nómina ${item.nomina}`).join("\n") : "";
  const shareText = [
    esGrupal ? "Permiso grupal de personal" : "Permiso de personal",
    `Folio: ${folio}`,
    esGrupal ? `Responsable: ${v.nombreColaborador || ""}` : `Colaborador: ${v.nombreColaborador || ""}`,
    esGrupal ? `Integrantes: ${v.integrantes.length}` : `Nomina: ${v.nomina || ""}`,
    ...(esGrupal ? [listaIntegrantes] : []),
    `Departamento: ${v.departamento || ""}`,
    `Tipo: ${valePersonalMovimientoLabel(v)}`,
    `Fecha: ${valePassDate(v.fecha)}`,
    `Autoriza: ${v.autorizadorNombre || v.autorizadorEmail || ""}`
  ].join("\n");

  appEl.innerHTML = renderValePermisoPass({
    tipo:esGrupal ? "Vale grupal" : isValePersonalEntrada(v) ? "Entrada autorizada" : isPermisoImss(v) ? "Permiso IMSS" : "Entrada / Salida",
    payload,
    folio,
    nombre:esGrupal ? `${v.integrantes.length} integrantes` : (v.nombreColaborador || ""),
    dato1:esGrupal ? `Responsable: ${v.nombreColaborador || ""}` : v.nomina ? `Nomina: ${v.nomina}` : "",
    dato2:esGrupal ? v.integrantes.map(item => `${item.nombre} (${item.nomina})`).join(" · ") : (v.observaciones || "Permiso de personal"),
    rol:"Empleado",
    depto:v.departamento || "",
    tipoPermiso:valePersonalMovimientoLabel(v),
    fecha:valePassDate(v.fecha),
    fechaSub:esEntrada ? (v.tiempoAutorizado || "Entrada posterior a las 8:15 a.m.") : isPermisoImss(v) ? `${v.tiempoAutorizado || ""} · Salida ${formatHoraTs(v.salidaProgramadaTs)}` : (v.tiempoAutorizado || ""),
    autoriza:v.autorizadorNombre || v.autorizadorEmail || "",
    instrucciones: esEntrada
      ? "Muestra este código QR al llegar. Es válido durante la fecha indicada, incluso si llegas antes de las 8:15 a.m.; el sistema registrará la hora real."
      : isPermisoImss(v)
      ? `Muestra este QR en caseta. La salida se habilita 5 minutos antes de las ${formatHoraTs(v.salidaProgramadaTs)} y permanece vigente hasta las 6:00 p.m. del mismo día.`
      : esGrupal ? "Muestra este código QR en caseta. El guardia podrá registrar a todo el grupo o seleccionar integrantes." : "Muestra este codigo QR en caseta. Este permiso es personal e intransferible.",
    volverAction:"valesPersonal"
  });
  const compartirQrButton = appEl.querySelector("#btnCompartirValePass");
  if(compartirQrButton){
    compartirQrButton.className = "ok";
    compartirQrButton.style.display = "inline-flex";
    compartirQrButton.style.alignItems = "center";
    compartirQrButton.style.justifyContent = "center";
    compartirQrButton.style.gap = "8px";
    compartirQrButton.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 32 32" width="21" height="21" fill="currentColor" focusable="false">
        <path d="M16.04 3.2A12.7 12.7 0 0 0 5.3 22.67L3.6 28.8l6.28-1.65a12.72 12.72 0 1 0 6.16-23.95Zm0 22.93c-1.93 0-3.82-.52-5.47-1.5l-.39-.23-3.72.98.99-3.62-.25-.37a10.2 10.2 0 1 1 8.84 4.74Zm5.6-7.64c-.3-.15-1.82-.9-2.1-1-.28-.1-.48-.15-.69.15-.2.3-.79 1-.97 1.2-.18.2-.36.23-.66.08-.3-.15-1.3-.48-2.47-1.53a9.2 9.2 0 0 1-1.7-2.12c-.18-.3-.02-.46.13-.61.14-.14.3-.36.46-.54.15-.18.2-.3.3-.51.1-.2.05-.38-.03-.54-.08-.15-.69-1.65-.94-2.26-.25-.6-.5-.52-.69-.53h-.58c-.2 0-.53.08-.81.38-.28.3-1.07 1.05-1.07 2.56s1.1 2.97 1.25 3.18c.15.2 2.16 3.3 5.24 4.63.73.32 1.3.5 1.75.65.74.23 1.4.2 1.93.12.59-.09 1.82-.74 2.08-1.46.25-.71.25-1.33.18-1.46-.08-.13-.28-.2-.59-.36Z"/>
      </svg>
      <span>Compartir QR</span>`;
  }
  setupValePassActions({
    payload,
    folio,
    filename:`PERMISO-PERSONAL-${String(folio)}.png`,
    shareText
  });
}

function normalizarTelefonoWhatsApp(value=""){
  let digits = String(value || "").replace(/\D/g, "");
  if(digits.length === 13 && digits.startsWith("521")) digits = `52${digits.slice(3)}`;
  if(digits.length === 10) digits = `52${digits}`;
  return digits;
}

function abrirWhatsAppInstalado(telefono, mensaje){
  const enlace = `whatsapp://send?phone=${encodeURIComponent(telefono)}&text=${encodeURIComponent(mensaje)}`;
  window.location.assign(enlace);
}

function enviarValePersonalWhatsApp(id){
  const v = valesPersonal.find(x => String(x.id) === String(id));
  if(!v) return toast("No encontrado","No se encontró el vale de personal.","warn",3200);
  const telefono = normalizarTelefonoWhatsApp(v.autorizadorTelefono);
  if(!telefono){
    return toast("Teléfono requerido","Registra el teléfono del autorizador en Usuarios para enviarle el vale.","warn",4200);
  }
  const enlace = "https://meredeitor.github.io/control-acceso/?abrir=vales_personal";
  const mensaje = [
    `Hola ${v.autorizadorNombre || ""}, tienes un vale pendiente de autorización.`,
    `Folio: ${v.folio || v.id}`,
    esValePersonalGrupal(v) ? `Vale grupal: ${v.integrantes.length} integrantes` : `Colaborador: ${v.nombreColaborador || ""}`,
    ...(esValePersonalGrupal(v) ? v.integrantes.map(item => `• ${item.nombre} · Nómina ${item.nomina}`) : []),
    `Tipo: ${v.tipoPermiso || ""}`,
    `Tiempo autorizado: ${v.tiempoAutorizado || ""}`,
    `Departamento: ${v.departamento || ""}`,
    "",
    `Abrir Caborca Access Control: ${enlace}`
  ].join("\n");
  abrirWhatsAppInstalado(telefono, mensaje);
}

async function enviarAlertaTiempoExcedidoWhatsApp(id){
  const v = valesPersonal.find(x => String(x.id) === String(id));
  if(!v) return toast("No encontrado","No se encontró el vale de personal.","warn",3200);
  if(!isValePersonalExcedido(v) || v.status !== ValeStatus.FUERA){
    return toast("Aviso no disponible","El vale ya no aparece fuera con tiempo excedido.","warn",3800);
  }

  await ensureValePersonalAutorizadores().catch(()=>{});
  const perfiles = [...valePersonalPerfilesCache, ...valePersonalAutorizadoresCache];
  const buscarPerfil = (uid, email) => perfiles.find(u =>
    (uid && String(u.uid || u.id || "") === String(uid)) ||
    (email && String(u.email || "").toLowerCase() === String(email).toLowerCase())
  );
  const perfilAutorizador = buscarPerfil(v.autorizadorUid || v.autorizadoPorUid, v.autorizadorEmail || v.autorizadoPor);
  const perfilCreador = buscarPerfil(v.createdByUid, v.createdByEmail);
  const telefonoAutorizador = normalizarTelefonoWhatsApp(v.autorizadorTelefono || perfilAutorizador?.telefono);
  const telefonoCreador = normalizarTelefonoWhatsApp(v.createdByTelefono || perfilCreador?.telefono);
  const telefono = telefonoAutorizador || telefonoCreador;
  const destinatario = telefonoAutorizador
    ? (v.autorizadorNombre || v.autorizadoPorNombre || perfilAutorizador?.nombre || "")
    : (v.createdByNombre || perfilCreador?.nombre || "");
  if(!telefono){
    return toast("Teléfono requerido","Registra el teléfono del autorizador o de quien creó el vale en Usuarios para enviar la alerta.","warn",5200);
  }

  const usadoMin = calcValePersonalTiempo(v);
  const autorizadoMin = parseTiempoAutorizadoMin(v.tiempoAutorizado);
  const excedenteMin = usadoMin !== null && autorizadoMin !== null ? Math.max(0, usadoMin - autorizadoMin) : null;
  const mensaje = [
    `⚠️ Alerta de tiempo excedido${destinatario ? ` para ${destinatario}` : ""}`,
    `${v.nombreColaborador || "El colaborador"}${v.nomina ? `, nómina ${v.nomina}` : ""}, todavía aparece fuera en Caborca Access Control.`,
    `Tiempo autorizado: ${v.tiempoAutorizado || "No especificado"}.`,
    `Tiempo fuera registrado: ${usadoMin !== null ? formatMinutes(usadoMin) : "No disponible"}.`,
    `Tiempo excedido: ${excedenteMin !== null ? formatMinutes(excedenteMin) : "No disponible"}.`,
    `Folio: ${v.folio || v.id || "Sin folio"}.`,
    "",
    "Verifica si el colaborador ya regresó y registró su entrada con el guardia."
  ].join("\n");
  abrirWhatsAppInstalado(telefono, mensaje);
}

async function renderEditarCitaCompras(id){
  if(!requirePerm("editar_cita","No tienes permiso para editar citas.")) return;
  currentView = "editar_cita";
  const v = visitas.find(x => String(x.id) === String(id));
  if(!v){
    toast("No encontrado","No se encontró la cita.","warn");
    return renderCitasCompras(_citasTipoFiltro);
  }

    if(citaBloqueadaPorRetraso(v)){
    toast("Cita bloqueada","No se puede editar. Reactiva el QR desde ADMIN para desbloquear la cita.","bad",4200);
    return renderCitasCompras(_citasTipoFiltro);
  }

const esVisitante = isVisitante(v);
  if(!esVisitante){
    await ensureProveedoresLoaded();
  }

  appEl.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div>
          <h2 style="margin:0 0 4px;">Editar cita</h2>
          <div style="color:var(--muted);font-size:12px;">ID: <b style="color:var(--text)">${esc(v.id)}</b></div>
        </div>
        <div class="row">
          <button class="secondary" data-action="citasComprasBack">Volver</button>
        </div>
      </div>

      <div class="divider"></div>

      <div class="two">
        <div>
          <label>${esVisitante ? "Nombre visitante" : "Proveedor"} *</label>
          <input id="ccProvSearch"
                 placeholder="${esVisitante ? "Nombre completo" : "Escribe nombre o código…"}"
                 autocomplete="off"
                 value="${esc(getNombreAcceso(v)||"")}">
          <div id="ccProvResults"></div>
        </div>

        <div>
          <label>Persona a visitar *</label>
          <select id="ccPersona">
            <option value="">— Selecciona —</option>
            <option>Sergio Palomares de Haro</option>
            <option>Daniel López Ramírez</option>
            <option>Cesar Reyes Gasca</option>
            <option>Jaqueline Gómez Valdivia</option>
            <option>Miriam García Aguayo</option>
            <option>Tisbet Gónzalez Guerrero</option>
            <option>Hugo Reyes Pérez</option>
            <option>Angel Ivan Alonso Reyes</option>
            <option>Oscar Jaret Fernandez Ramirez</option>
          </select>
        </div>

        <div>
          <label>Área *</label>
          <select id="ccAreaEdit">
            <option value="">— Selecciona —</option>
            ${AREAS.map(a=>`<option ${v.area===a?"selected":""}>${a}</option>`).join("")}
          </select>
        </div>

        <div>
          <label>Motivo *</label>
          <select id="ccMotivo">
            <option value="">— Selecciona —</option>
            ${["Entrega","Recolección","Visita","Entrevista","Junta","Servicio","Pago","Exámen médico","Otro"].map(m=>`<option ${v.motivo===m?"selected":""}>${m}</option>`).join("")}
          </select>
        </div>

        ${esVisitante ? "" : `<div style="grid-column:1/-1;">
          ${renderFacturaOcEditor(normalizeFacturasOc(v), "ccFacturasOcEditor")}
        </div>`}

        <div>
          <label>Fecha y hora *</label>
          <input type="datetime-local" id="ccFechaHora" value="${esc((v.fechaHora||"").slice(0,16))}" min="${datetimeLocalValue(isVisitante(v) ? Date.now() : minimoFechaHoraProveedorTs())}" ${isVisitante(v) ? "" : `step="${SLOT_MINUTES * 60}"`}>
        </div>
      </div>

      <div class="divider"></div>

      <div class="row">
        <button class="secondary" data-action="ccVerQR" data-id="${esc(v.id)}">Ver QR</button>
        <button class="ok" data-action="ccSaveEdit" data-id="${esc(v.id)}">Guardar cambios</button>
        <button class="secondary" data-action="citasComprasBack">Cancelar</button>
      </div>
    </div>
  `;

  // set persona select
  setTimeout(()=>{
    const sel = document.getElementById("ccPersona");
    if(sel) sel.value = v.personaVisita || "";
  },0);

  if(!esVisitante){
    setupProveedorAutocompleteForEdit(v);
  }
}

function setupProveedorAutocompleteForEdit(v){
  const input = document.getElementById("ccProvSearch");
  const results = document.getElementById("ccProvResults");
  if(!input || !results) return;

  // si ya había código guardado, respétalo
  if(v.proveedorCodigo) input.dataset.codigo = v.proveedorCodigo;

  input.addEventListener("input", ()=>{
    const term = input.value.trim().toLowerCase();
    if(!term){ results.innerHTML=""; return; }
    const matches = (proveedoresCache||[])
      .filter(p => String(p.codigo||"").toLowerCase().includes(term) || String(p.razonSocial||"").toLowerCase().includes(term))
      .slice(0,10);
    results.innerHTML = matches.map(p=>`
      <div class="pill proveedor-opt" data-codigo="${esc(p.codigo)}" data-nombre="${esc(p.razonSocial)}">
        <b>${esc(p.codigo)}</b> — ${esc(p.razonSocial)}
      </div>
    `).join("");
  });

  results.addEventListener("click", (e)=>{
    const opt = e.target.closest(".proveedor-opt");
    if(!opt) return;
    input.value = opt.dataset.nombre;
    input.dataset.codigo = opt.dataset.codigo;
    results.innerHTML = "";
  });
}

async function guardarEdicionCitaCompras(id){
  if(!requirePerm("editar_cita")) return;
  const v = visitas.find(x => String(x.id) === String(id));
  if(!v) return;

    if(citaBloqueadaPorRetraso(v)){
    toast("Cita bloqueada","No se puede guardar cambios. Reactiva el QR desde ADMIN para desbloquear la cita.","bad",4200);
    return;
  }

const esVisitante = isVisitante(v);
  const provInput = document.getElementById("ccProvSearch");
  const proveedorCodigo = esVisitante ? "" : (provInput?.dataset.codigo || v.proveedorCodigo || "");
  const proveedorNombre = (provInput?.value || "").trim();
  const persona = (document.getElementById("ccPersona")?.value || "").trim();
  const area = (document.getElementById("ccAreaEdit")?.value || "").trim();
  const motivo = (document.getElementById("ccMotivo")?.value || "").trim();
  const fechaHora = (document.getElementById("ccFechaHora")?.value || "").trim();
  const docs = esVisitante
    ? { ocNo:"", facturaNo:"", facturasOc:[] }
    : collectFacturaOcFromDom("ccFacturasOcEditor");
  if(!docs) return;
  const ocNo = docs.ocNo;
  const facturaNo = docs.facturaNo;

  if(!proveedorNombre || !area || !motivo || !fechaHora){
    toast("Campos obligatorios",`${esVisitante ? "Nombre visitante" : "Proveedor"}, Área, Motivo y Fecha`,"warn");
    return;
  }

  if(!esVisitante && !horarioCitaPermitido(fechaHora)){
    toast("Horario no permitido","No se pueden generar citas a las 5:00 pm o después.","warn");
    return;
  }

  if(!validarCitaNoPasada(fechaHora)){
    return;
  }

  const fechaHoraCambio = Math.abs(new Date(fechaHora).getTime() - Number(v.fechaHoraTs || 0)) > 30000;
  if(!esVisitante && fechaHoraCambio && !validarBloqueCitaProveedor(fechaHora)){
    return;
  }
  if(!esVisitante && fechaHoraCambio && !validarAnticipacionCitaProveedor(fechaHora)){
    return;
  }

  const fechaHoraTs = new Date(fechaHora).getTime();
  if(!esVisitante && !validarReagendaProveedor({ proveedorCodigo, proveedor: proveedorNombre, fechaHoraTs, excludeId: v.id })){
    return;
  }

  // respeta tu capacidad por área/hora excluyendo la misma cita
  if(existeCitaEnHorarioExcluding(fechaHora, area, v.id)){
    toast("Horario no disponible","Ya existe el máximo de citas para esa área en ese horario.","warn");
    return;
  }

  registrarCambio(v, esVisitante ? "nombreVisitante" : "proveedor", getNombreAcceso(v), proveedorNombre);
  registrarCambio(v, "personaVisita", v.personaVisita, persona);
  registrarCambio(v, "area", v.area, area);
  registrarCambio(v, "motivo", v.motivo, motivo);
  registrarCambio(v, "fechaHora", v.fechaHora, fechaHora);
  registrarCambio(v, "ocNo", v.ocNo, ocNo);
  registrarCambio(v, "facturaNo", v.facturaNo, facturaNo);
  registrarCambio(v, "facturasOc", JSON.stringify(v.facturasOc || []), JSON.stringify(docs.facturasOc || []));

  v.proveedorCodigo = proveedorCodigo;
  v.proveedor = proveedorNombre;
  v.nombreVisitante = esVisitante ? proveedorNombre : "";
  v.tipoVisita = esVisitante ? "visitante" : "proveedor";
  v.tipoAcceso = v.tipoVisita;
  if(esVisitante) v.empresa = "Visitante";
  v.personaVisita = persona;
  v.area = area;
  v.motivo = motivo;
  v.fechaHora = fechaHora;
  v.fechaHoraTs = new Date(fechaHora).getTime();
  v.ocNo = ocNo;
  v.facturaNo = facturaNo;
  v.facturasOc = docs.facturasOc;

  v.updatedTs = Date.now();

  await saveVisitas();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    await cloudUpsertVisita(v);
  }

  toast("Actualizado","La cita fue actualizada.","ok",2200);
  await renderCitasCompras(_citasTipoFiltro);
  await loadCitasCompras(); // refresca tabla con filtros actuales
}
async function cancelarCitaCompras(id){
  if(!requirePerm("cancelar_cita","No tienes permiso para cancelar citas.")) return;

  const v = visitas.find(x => String(x.id) === String(id));
  if(!v){
    toast("No encontrado","No se encontró la cita.","warn");
    return;
  }

  if(v.status === Status.CANCELADO || v.status === Status.FINALIZADO){
    toast("No permitido","Esa cita ya no se puede cancelar.","warn");
    return;
  }

    if(citaBloqueadaPorRetraso(v)){
    toast("Cita bloqueada","No se puede cancelar. Reactiva el QR desde ADMIN para desbloquear la cita.","bad",4200);
    return;
  }

const motivo = prompt("Motivo de cancelación (opcional):") || "";

  v.status = Status.CANCELADO;
  v.qrActivo = false;
  v.canceladoTs = Date.now();
  v.canceladoPor = currentUser?.email || "";
  v.canceladoMotivo = motivo.trim();
  v.updatedTs = Date.now();

  await saveVisitas();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    await cloudUpsertVisita(v);
  }

  toast("Cancelado","La cita fue cancelada y el QR se desactivó.","ok",2400);
  await renderCitasCompras(_citasTipoFiltro);
  await loadCitasCompras();
}

    async function loadHistDay(){
      const dateStr = (document.getElementById("histDate")?.value || "").trim();
      const histTipo = normalizeDashboardTipo(document.getElementById("histTipo")?.value || "proveedores");
      if(!dateStr) return;

      const d = new Date(dateStr + "T00:00:00");
      toast("Historial", "Cargando desde la nube...", "info", 1600);
      await syncDay(d, true);

      // filtra local por ese día
      const list = visitas.filter(v =>
        typeof v.fechaHoraTs === "number" &&
        isSameDay(v.fechaHoraTs, d) &&
        dashboardTipoMatches(v, histTipo)
      );
      const { programados, llegados, dentro, despachados, finalizados } = getCounts(list);
      const showDespachados = histTipo !== "visitantes";

      const wrap = document.getElementById("histWrap");
      const col = (title, dotClass, items) => `
        <div class="col">
          <h3><span><span class="dot ${dotClass}" style="margin-right:8px;"></span>${esc(title)}</span><span>${items.length}</span></h3>
          ${items.length ? items.map(card).join("") : `<div style="color:var(--muted);font-size:12px;">Sin registros</div>`}
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
        const qrVencido = qrInactivoPorImpuntualidad(v);
        return `
          <div class="tarjeta history-card tipo-${esc(tipo)} ${qrVencido ? "qr-vencido" : ""}" data-action="ficha" data-id="${esc(v.id)}">
            ${qrVencido ? `<div class="qr-banda-inactivo">QR inactivo por retraso</div>` : ""}
            <strong>${esc(isVisitante(v) ? getVisitanteResumen(v) : nombreAcceso)}</strong>
            <small>${esc(empresaAcceso || tipoLabel)}</small>
            <div class="meta">
              <span class="pill"><span class="dot brand"></span>ID: ${esc(v.id)}</span>
              <span class="pill"><span class="dot ${tipo === "visitante" ? "brand" : "info"}"></span>${esc(tipoLabel)}</span>
              <span class="pill"><span class="dot warn"></span>${esc(cita)}</span>
              ${pillCitaCreada(v)}
              ${renderVisitanteExtraPills(v)}
              <span class="badge-dictamen ${esc(dict)}"><span class="bdot"></span> ${esc(dictLabel)}</span>
            </div>
            ${qrVencido && currentUser?.role === ROLES.ADMIN ? `<button class="secondary" data-action="reactivar" data-id="${esc(v.id)}" style="margin-top:10px; width:100%;">Reactivar</button>` : ""}
          </div>
        `;
      }

      wrap.innerHTML = `
        <div class="pill" style="margin-bottom:10px;">
          <span class="dot brand"></span> ${histTipo === "visitantes" ? "Visitantes" : "Proveedores"}: <b style="color:var(--text);">${d.toLocaleDateString()}</b>
        </div>

        <div class="grid ${showDespachados ? "cols-5" : "cols-4"} history-grid" style="margin-bottom:18px">
          <div class="card"><h3>Programados</h3><div class="big">${programados.length}</div></div>
          <div class="card"><h3>Llegaron</h3><div class="big">${llegados.length}</div></div>
          <div class="card"><h3>Dentro</h3><div class="big">${dentro.length}</div></div>
          ${showDespachados ? `<div class="card"><h3>Despachados</h3><div class="big">${despachados.length}</div></div>` : ""}
          <div class="card"><h3>Finalizados</h3><div class="big">${finalizados.length}</div></div>
        </div>

        <div class="grid ${showDespachados ? "cols-5" : "cols-4"} history-grid">
          ${col("Programados","info",programados)}
          ${col("Llegaron","warn",llegados)}
          ${col("Dentro","ok",dentro)}
          ${showDespachados ? col("Despachados","brand",despachados) : ""}
          ${col("Finalizados","muted",finalizados)}
        </div>

        <div class="divider"></div>
        <div class="row">
          ${false ? `<button class="secondary" data-action="exportExcelHist" data-date="${esc(dateStr)}">Exportar Excel (día)</button>` : ""}
          <span class="pill" style="margin-left:auto;">Total día: <b style="color:var(--text); margin-left:6px;">${list.length}</b></span>
        </div>
      `;
    }

function proveedorEvalClass(score, flags={}){
  if((flags.rechazos || 0) >= 2 || (flags.noShow || 0) >= 3 || (flags.incidenciasCalidad || 0) >= 3) return "C";
  if((flags.rechazos || 0) >= 1 || (flags.noShow || 0) >= 2 || (flags.tardesGraves || 0) >= 3) return score >= 70 ? "B" : "C";
  if((flags.total || 0) < 3 && score >= 95) return "A";
  if(score >= 95) return "AA";
  if(score >= 85) return "A";
  if(score >= 70) return "B";
  return "C";
}

function proveedorEvalBadge(clase){
  const c = String(clase || "C").toUpperCase();
  const map = {
    AA: "background:rgba(34,197,94,.18);border-color:rgba(34,197,94,.45);color:#86efac;",
    A: "background:rgba(56,189,248,.16);border-color:rgba(56,189,248,.42);color:#7dd3fc;",
    B: "background:rgba(250,204,21,.16);border-color:rgba(250,204,21,.42);color:#fde68a;",
    C: "background:rgba(239,68,68,.16);border-color:rgba(239,68,68,.45);color:#fca5a5;"
  };
  return `<span class="pill" style="font-weight:900;${map[c] || map.C}"><span class="dot ${c === "C" ? "bad" : c === "B" ? "warn" : "ok"}"></span>${esc(c)}</span>`;
}

function buildEvaluacionProveedores(list, opts={}){
  const nowTs = opts.nowTs || Date.now();
  const graceMin = Number(opts.graceMin ?? 10);
  const graveMin = Number(opts.graveMin ?? 30);
  const graceMs = graceMin * 60000;
  const graveMs = graveMin * 60000;
  const groups = new Map();

  const getKey = (v) => String(v.proveedorCodigo || v.codigoProveedor || v.proveedor || v.empresa || "SIN_PROVEEDOR").trim().toUpperCase();
  const getName = (v) => String(v.proveedor || v.empresa || v.proveedorCodigo || "Sin proveedor").trim();

  (list || []).forEach(v => {
    if(!v || typeof v.fechaHoraTs !== "number") return;
    if(typeof isVisitante === "function" && isVisitante(v)) return;
    if(typeof Status !== "undefined" && v.status === Status.CANCELADO) return;

    const key = getKey(v);
    if(!groups.has(key)){
      groups.set(key, {
        key,
        proveedor: getName(v),
        empresa: v.empresa || "",
        total:0,
        llegadas:0,
        aTiempo:0,
        tardes:0,
        tardesGraves:0,
        noShow:0,
        incidenciasCalidad:0,
        rechazos:0,
        docsIncompletos:0,
        incidenciasSalida:0,
        minutosTardeTotal:0,
        score:100,
        clase:"AA",
        motivos:[]
      });
    }

    const g = groups.get(key);
    g.total += 1;
    if(!g.empresa && v.empresa) g.empresa = v.empresa;

    const hasLlegada = typeof v.llegadaTs === "number";
    if(hasLlegada){
      g.llegadas += 1;
      const delay = v.llegadaTs - v.fechaHoraTs;
      if(delay > graceMs){
        g.tardes += 1;
        const mins = Math.max(0, Math.round(delay / 60000));
        g.minutosTardeTotal += mins;
        if(delay > graveMs) g.tardesGraves += 1;
      }else{
        g.aTiempo += 1;
      }
    }else if(String(v.status).toLowerCase() === "programado" && v.fechaHoraTs < (nowTs - graceMs)){
      g.noShow += 1;
    }

    const dictEstado = String(v.dictamen?.estado || "").toLowerCase();
    const inc = String(v.dictamen?.incidencia || "SIN_INCIDENCIAS").trim();
    if(dictEstado === "rechazado") g.rechazos += 1;
    if(inc && inc !== "SIN_INCIDENCIAS") g.incidenciasCalidad += 1;
    if(hasLlegada && (!v.ocNo || !v.facturaNo)) g.docsIncompletos += 1;
    if(String(v.incidenciasSalida || "").trim()) g.incidenciasSalida += 1;
  });

  return Array.from(groups.values()).map(g => {
    const descuentos =
      (g.noShow * 20) +
      (g.tardes * 5) +
      (g.tardesGraves * 5) +
      (g.incidenciasCalidad * 15) +
      (g.rechazos * 25) +
      (g.docsIncompletos * 3) +
      (g.incidenciasSalida * 10);

    g.score = Math.max(0, Math.min(100, 100 - descuentos));
    g.pctAsistencia = g.total ? Math.round((g.llegadas / g.total) * 100) : 0;
    g.pctPuntualidad = g.llegadas ? Math.round((g.aTiempo / g.llegadas) * 100) : 0;
    g.promTarde = g.tardes ? Math.round(g.minutosTardeTotal / g.tardes) : 0;
    g.clase = proveedorEvalClass(g.score, g);

    const motivos = [];
    if(g.noShow) motivos.push(`${g.noShow} no asist.`);
    if(g.tardes) motivos.push(`${g.tardes} tarde${g.tardesGraves ? ` (${g.tardesGraves} graves)` : ""}`);
    if(g.rechazos) motivos.push(`${g.rechazos} rechazo calidad`);
    if(g.incidenciasCalidad) motivos.push(`${g.incidenciasCalidad} inc. calidad`);
    if(g.incidenciasSalida) motivos.push(`${g.incidenciasSalida} inc. salida`);
    if(g.docsIncompletos) motivos.push(`${g.docsIncompletos} docs incompletos`);
    if(g.total < 3) motivos.push("muestra baja");
    g.motivos = motivos.length ? motivos : ["Sin penalizaciones relevantes"];
    return g;
  }).sort((a,b) => b.score - a.score || b.total - a.total || a.proveedor.localeCompare(b.proveedor));
}

function renderEvaluacionProveedores(rows){
  const wrap = document.getElementById("evalProvWrap");
  const summary = document.getElementById("evalProvSummary");
  if(!wrap) return;
  const data = rows || [];
  const counts = data.reduce((acc,r)=>{ acc[r.clase] = (acc[r.clase] || 0) + 1; return acc; }, {});
  if(summary){
    summary.innerHTML = `
      <span class="pill"><span class="dot ok"></span>AA: <b style="color:var(--text);">${counts.AA || 0}</b></span>
      <span class="pill"><span class="dot info"></span>A: <b style="color:var(--text);">${counts.A || 0}</b></span>
      <span class="pill"><span class="dot warn"></span>B: <b style="color:var(--text);">${counts.B || 0}</b></span>
      <span class="pill"><span class="dot bad"></span>C: <b style="color:var(--text);">${counts.C || 0}</b></span>
    `;
  }

  if(!data.length){
    wrap.innerHTML = `<div class="pill"><span class="dot muted"></span>Sin datos para evaluar proveedores en este rango.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Clase</th>
          <th>Proveedor</th>
          <th>Score</th>
          <th>Citas</th>
          <th>Asistencia</th>
          <th>Puntualidad</th>
          <th>Tardes</th>
          <th>No asist.</th>
          <th>Calidad</th>
          <th>Motivos</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(r => `
          <tr>
            <td>${proveedorEvalBadge(r.clase)}</td>
            <td><b>${esc(r.proveedor)}</b><br><small style="color:var(--muted);">${esc(r.empresa || "")}</small></td>
            <td><b>${r.score}</b></td>
            <td>${r.total}</td>
            <td>${r.pctAsistencia}%</td>
            <td>${r.pctPuntualidad}%</td>
            <td>${r.tardes}${r.promTarde ? ` <small style="color:var(--muted);">prom. ${r.promTarde} min</small>` : ""}</td>
            <td>${r.noShow}</td>
            <td>${r.incidenciasCalidad} inc. / ${r.rechazos} rech.</td>
            <td style="min-width:220px;white-space:normal;word-break:break-word;color:var(--muted);">${esc(r.motivos.join(" · "))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

