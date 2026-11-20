async function renderValesActivos(refresh=true){
  if(!requirePerm("ver_vales_activos","Tu rol no puede ver vales de activos.")) return;
  currentView = "vales_activos";
  rememberModuleReturn(currentView);
  if(refresh) await syncValesActivos(true);
  if(refresh && hasPerm("crear_vale_activo")) await ensureValeActivoAutorizadores();

  const term = valeSearchTerms.activos.trim().toLowerCase();
  const allList = valesActivos
    .filter(isValeActivoVisible)
    .sort((a,b)=>(b.createdTs||0)-(a.createdTs||0));
  const list = !term ? allList : allList.filter(v =>
    [v.folio,v.nombre,v.descripcion,v.departamento,v.tipoActivo,v.noSerie,v.autorizadorNombre]
      .join(" ").toLowerCase().includes(term)
  );
  const { generados, pendientes, fuera, regresoCancelado } = getValeCounts(list);
  const finalizadosKpi = regresoCancelado.filter(v => !v.canceladoTs).length;

  const col = (title, dotClass, items, stageKey) => `
    <div class="col provider-stage ${valeActivoMobileStatus === stageKey ? "active" : ""}" data-stage="${esc(stageKey)}">
      <div class="provider-stage-head"><span class="provider-stage-dot" aria-hidden="true"></span><span>${esc(title)}</span><span class="provider-stage-count">${items.length}</span></div>
      <div class="vale-personal-stage-list">
        ${items.length ? items.map(renderValeActivoCard).join("") : `<div class="provider-empty"><span class="provider-empty-icon" aria-hidden="true">${stageKey === "pendientes" ? "◷" : stageKey === "inicio" ? "▶" : stageKey === "fuera" ? "↗" : "✓"}</span><strong>Sin vales</strong><span>No hay activos en este estado.</span></div>`}
      </div>
    </div>
  `;

  const valesContent = `
    <div class="vale-personal-mobile-tabs" role="tablist" aria-label="Estado de vales de activo">
      ${[["pendientes","Por autorizar",pendientes.length],["inicio","Inicio",generados.length],["fuera","Fuera",fuera.length],["regreso","Finalizado",regresoCancelado.length]].map(([key,label,count])=>`<button class="vale-personal-mobile-tab ${valeActivoMobileStatus === key ? "active" : ""}" data-action="valeActivoMobileStage" data-stage="${key}" data-no-sb="true" role="tab" aria-selected="${valeActivoMobileStatus === key}">${label}<b>${count}</b></button>`).join("")}
    </div>
    <div class="grid vales-grid vale-personal-board">
      ${col("Pendientes por autorizar","warn",pendientes,"pendientes")}
      ${col("Inicio","info",generados,"inicio")}
      ${col("Fuera","bad",fuera,"fuera")}
      ${col("Regreso / Finalizado","ok",regresoCancelado,"regreso")}
    </div>
  `;

  appEl.innerHTML = `
    <section class="provider-dashboard-modern vale-dashboard-modern vale-personal-kanban vale-activo-kanban">
      <div class="provider-dashboard-hero">
        <div class="provider-dashboard-hero-copy">
          <div class="provider-dashboard-hero-icon" aria-hidden="true">📦</div>
          <div>
            <h2>Vales de salida de activos</h2>
            <p>Control de activos, autorización, salida, regreso y QR.</p>
          </div>
        </div>
        <div class="provider-dashboard-date"><span aria-hidden="true">●</span>${new Date().toLocaleDateString()}</div>
      </div>
      <div class="dashboard-toolbar vale-dashboard-head provider-summary-tools">
        <div class="vale-dashboard-summary">
          <div class="provider-summary" aria-label="Resumen de vales de activo">
            <div class="provider-summary-item"><span class="provider-summary-icon" aria-hidden="true">▣</span><span class="provider-summary-copy"><strong>${list.length}</strong><span>Vales de hoy</span></span></div>
            <div class="provider-summary-item bad"><span class="provider-summary-icon" aria-hidden="true">↗</span><span class="provider-summary-copy"><strong>${fuera.length}</strong><span>Fuera</span></span></div>
            <div class="provider-summary-item final"><span class="provider-summary-icon" aria-hidden="true">✓</span><span class="provider-summary-copy"><strong>${finalizadosKpi}</strong><span>Finalizados</span></span></div>
          </div>
        </div>
        <div class="vale-dashboard-tools">
          <input id="valeSearchActivos" type="search" name="buscar_vales_activos_no_login" autocomplete="off" autocapitalize="none" spellcheck="false" data-lpignore="true" data-1p-ignore="true" value="${esc(valeSearchTerms.activos)}" placeholder="Buscar folio, activo, serie..." aria-label="Buscar vales de activo">
          <button class="secondary" data-action="refreshVales" data-tipo="activos">Actualizar</button>
          ${hasPerm("escanear_qr") ? `<button class="secondary" data-action="scan" data-from="vales_activos">Escanear QR</button>` : ""}
        </div>
      </div>

      ${valesContent}
      <div class="vale-personal-mobile-navigation" aria-label="Navegación de vales de activo">
        ${hasPerm("escanear_qr") ? `<button class="vale-personal-mobile-scan" data-action="scan" data-from="vales_activos" aria-label="Escanear QR"><span aria-hidden="true">▦</span> Escanear QR</button>` : ""}
        <div class="vale-personal-nav-row">
          <button data-action="home" aria-label="Ir al menú principal"><span class="provider-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8"></path><path d="M5.5 9.5V21h13V9.5"></path><path d="M9.5 21v-7h5v7"></path></svg></span><small>Inicio</small></button>
          <button class="active" data-action="refreshVales" data-tipo="activos" data-no-sb="true" aria-label="Actualizar vales de activo"><span class="provider-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M6.1 8.2A7 7 0 0 1 18.7 7L20 12"></path><path d="M17.9 15.8A7 7 0 0 1 5.3 17L4 12"></path></svg></span><small>Actualizar</small></button>
          <button class="${valeActivoMobileStatus === "pendientes" ? "active" : ""}" data-action="valeActivoMobileStage" data-stage="pendientes" data-no-sb="true" aria-label="Mostrar pendientes por autorizar: ${pendientes.length}"><span class="provider-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-7 7v4l-2 3h18l-2-3v-4a7 7 0 0 0-7-7Z"></path><path d="M9.5 20h5"></path></svg></span><span class="vale-personal-nav-count">${pendientes.length}</span><small>Por autorizar</small></button>
        </div>
      </div>
    </section>

    ${renderValeActivoModal()}
  `;
  vigilarAutocompletadoEnBuscadoresVales();
}

function renderValeActivoCard(v){
  const fecha = v.fecha ? new Date(v.fecha + "T00:00:00").toLocaleDateString() : "-";
  const autorizadoPor = v.autorizadoPorNombre || "";
  const autorizador = v.autorizadorNombre || v.autorizadorEmail || "";
  const activoNombre = v.nombre || v.descripcion || "Activo sin descripción";
  const iniciales = activoNombre.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x.charAt(0)).join("").toUpperCase() || "AC";
  const estadoTone = v.status === ValeStatus.PENDIENTE ? "is-warn" : v.status === ValeStatus.FUERA ? "is-bad" : v.status === ValeStatus.REGRESO_CANCELADO ? "is-ok" : "";
  return `
    <div class="tarjeta history-card provider-visit-card vale-personal-card vale-activo-card tipo-proveedor" data-action="verValeQR" data-id="${esc(v.id)}">
      <div class="vale-personal-card-head">
        <span class="vale-personal-avatar" aria-hidden="true">${esc(iniciales)}</span>
        <span class="vale-personal-identity"><strong>${esc(activoNombre)}</strong><small>${esc(v.descripcion || v.tipoActivo || "Activo")}</small></span>
        <span class="vale-personal-status ${estadoTone}">${esc(valeStatusLabel(v.status))}</span>
      </div>
      <div class="vale-personal-folio">Folio ${esc(v.folio || v.id)}</div>
      <div class="vale-personal-facts">
        <div class="vale-personal-fact"><small>Departamento</small><b>${esc(v.departamento || "Sin departamento")}</b></div>
        <div class="vale-personal-fact"><small>Fecha</small><b>${esc(fecha)}</b></div>
        <div class="vale-personal-fact"><small>Tipo / Serie</small><b>${esc([v.tipoActivo,v.noSerie].filter(Boolean).join(" · ") || "Sin identificar")}</b></div>
        <div class="vale-personal-fact"><small>Autoriza</small><b>${esc(autorizador || "Pendiente de asignar")}</b></div>
      </div>
      <div class="meta vale-card-details">
        ${autorizadoPor ? `<span class="pill"><span class="dot ok"></span>Autorizado por: ${esc(autorizadoPor)}</span>` : ""}
        ${v.autorizacionEmergencia ? `<span class="pill" style="border-color:rgba(239,68,68,.6);"><span class="dot bad"></span>Autorización de emergencia: ${esc(v.autorizacionEmergenciaMotivo || "Sin detalle")}</span>` : ""}
        ${v.autorizacionPorRespaldo ? `<span class="pill"><span class="dot info"></span>Autorización respaldo</span>` : ""}
      </div>
      <div class="row vale-actions">
        ${v.qrActivo ? `<button class="secondary" data-action="verValeQR" data-id="${esc(v.id)}" data-no-sb="true">QR</button>` : `<span class="pill"><span class="dot bad"></span>QR desactivado</span>`}
        ${v.status === ValeStatus.PENDIENTE && canCurrentUserAuthorizeValeActivo(v) ? `<button class="ok" data-action="autorizarVale" data-id="${esc(v.id)}" data-no-sb="true">Autorizar</button>` : ""}
        ${v.status === ValeStatus.GENERADO && v.autorizadoTs && hasPerm("registrar_salida_activo") ? `<button class="danger" data-action="setValeStatus" data-id="${esc(v.id)}" data-status="${ValeStatus.FUERA}" data-no-sb="true">Marcar fuera</button>` : ""}
        ${v.status === ValeStatus.FUERA && hasPerm("registrar_regreso_activo") ? `<button class="ok" data-action="setValeStatus" data-id="${esc(v.id)}" data-status="${ValeStatus.REGRESO_CANCELADO}" data-no-sb="true">Registrar regreso</button>` : ""}
        ${v.status !== ValeStatus.REGRESO_CANCELADO && hasPerm("crear_vale_activo") ? `<button class="secondary" data-action="cancelarVale" data-id="${esc(v.id)}" data-no-sb="true">Cancelar</button>` : ""}
        ${renderKanbanDetailsButton()}
      </div>
      ${renderKanbanMovementPanel(valeActivoHistoryEvents(v))}
    </div>
  `;
}

function renderValeActivoModal(){
  return `
    <div class="modal-overlay vale-modal" id="valeModal" style="display:none;">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h3 style="margin:0;">Nuevo vale de salida</h3>
            <small>Formato basado en Salida Activo.xlsx</small>
          </div>
          <div class="modal-actions">
            <button class="secondary" data-action="closeValeModal">Cerrar</button>
          </div>
        </div>
        <div class="modal-body">
          ${esPreviewValeGrupalLocal() ? `<div class="pill" style="display:block;margin-bottom:12px;white-space:normal;"><span class="dot info"></span><b>Prueba local:</b> los vales grupales creados aquí no se enviarán a Firebase.</div>` : ""}
          <div class="two">
            <div>
              <label>Fecha *</label>
              <input id="valeFecha" type="date" value="${new Date().toISOString().slice(0,10)}">
            </div>
            <div>
              <label>Folio</label>
              <input id="valeFolio" placeholder="Se genera automático si lo dejas vacío">
            </div>
            <div>
              <label>Departamento *</label>
              <input id="valeDepartamento" placeholder="Departamento">
            </div>
            <div>
              <label>Tipo de activo *</label>
              <select id="valeTipoActivo">
                <option value="">— Selecciona —</option>
                <option>Maquinaria y equipo de producción</option>
                <option>Formas, molduras y suajes</option>
                <option>Equipo de Cómputo</option>
                <option>Mobiliario y equipo de oficina</option>
                <option>Herramientas</option>
                <option>Otro</option>
              </select>
            </div>
            <div>
              <label>Motivo *</label>
              <select id="valeMotivo">
                <option value="">— Selecciona —</option>
                <option>Reparación</option>
                <option>Préstamo</option>
                <option>Devolución</option>
                <option>Venta</option>
                <option>Traspaso a otra planta</option>
                <option>Otro</option>
              </select>
            </div>
            <div>
              <label>Nombre / solicitante *</label>
              <input id="valeNombre" placeholder="Nombre">
            </div>
            <div style="grid-column:1/-1;">
              <label>Descripción *</label>
              <textarea id="valeDescripcion" rows="2" placeholder="Descripción del activo"></textarea>
            </div>
            <div>
              <label>No. serie</label>
              <input id="valeSerie" placeholder="No. serie">
            </div>
            <div>
              <label>Código / Lote</label>
              <input id="valeCodigoLote" placeholder="Código o lote">
            </div>
            <div>
              <label>Fecha de retorno</label>
              <input id="valeFechaRetorno" type="date">
            </div>
            <div>
              <label>Autoriza *</label>
              <select id="valeAutorizador">
                ${renderValeActivoAutorizadorOptions()}
              </select>
            </div>
          </div>
          <div class="divider"></div>
          <div class="row">
            <button data-action="guardarValeActivo">Guardar y generar QR</button>
            <button class="secondary" data-action="closeValeModal">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function openValeModal(){
  if(hasPerm("crear_vale_activo")){
    await ensureValeActivoAutorizadores();
    const sel = document.getElementById("valeAutorizador");
    if(sel) sel.innerHTML = renderValeActivoAutorizadorOptions();
  }
  const modal = document.getElementById("valeModal");
  if(modal) modal.style.display = "flex";
}

function closeValeModal(){
  const modal = document.getElementById("valeModal");
  if(modal) modal.style.display = "none";
}

function createValeActivoFromModal(){
  const fecha = document.getElementById("valeFecha")?.value || "";
  const folioRaw = document.getElementById("valeFolio")?.value.trim() || "";
  const departamento = document.getElementById("valeDepartamento")?.value.trim() || "";
  const tipoActivo = document.getElementById("valeTipoActivo")?.value || "";
  const motivo = document.getElementById("valeMotivo")?.value || "";
  const nombre = document.getElementById("valeNombre")?.value.trim() || "";
  const descripcion = document.getElementById("valeDescripcion")?.value.trim() || "";
  const noSerie = document.getElementById("valeSerie")?.value.trim() || "";
  const codigoLote = document.getElementById("valeCodigoLote")?.value.trim() || "";
  const fechaRetorno = document.getElementById("valeFechaRetorno")?.value || "";
  const autorizadorSelect = document.getElementById("valeAutorizador");
  const autorizadorOption = autorizadorSelect?.selectedOptions?.[0] || null;
  const autorizadorUid = autorizadorSelect?.value || "";
  const autorizadorEmail = autorizadorOption?.dataset?.email || "";
  const autorizadorNombre = autorizadorOption?.dataset?.nombre || "";
  const autorizadorRole = autorizadorOption?.dataset?.role || "";

  if(!fecha || !departamento || !tipoActivo || !motivo || !nombre || !descripcion || !autorizadorUid){
    toast("Campos obligatorios","Fecha, departamento, tipo, motivo, nombre, descripción y autorizador.","warn");
    return null;
  }

  const id = Date.now().toString();
  const folio = folioRaw || `VA-${new Date().getFullYear()}-${String(valesActivos.length + 1).padStart(4,"0")}`;

  return {
    id,
    folio,
    fecha,
    planta: "",
    departamento,
    tipoActivo,
    motivo,
    nombre,
    descripcion,
    noSerie,
    codigoLote,
    fechaRetorno,
    autorizadorUid,
    autorizadorEmail,
    autorizadorNombre,
    autorizadorRole,
    status: ValeStatus.PENDIENTE,
    qrActivo: true,
    createdByUid: currentUser?.uid || "",
    createdByEmail: currentUser?.email || "",
    createdTs: Date.now(),
    updatedTs: Date.now()
  };
}

async function guardarValeActivo(){
  if(!requirePerm("crear_vale_activo","Tu rol no puede crear vales.")) return;
  const v = createValeActivoFromModal();
  if(!v) return;
  valesActivos.unshift(v);
  await saveValesActivos();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertValeActivo(v); }catch(e){ console.warn(e); }
  }
  toast("Vale generado","Vale guardado y QR generado.","ok",2400);
  closeValeModal();
  await renderValeQR(v.id);
}

async function validarCredencialGuardiaValeActivo(cred){
  if(!cred?.uid || !navigator.onLine) throw new Error("Se requiere conexión para validar la credencial del guardia.");
  const snap = await getDocFromServer(doc(db, COL_USERS, String(cred.uid)));
  if(!snap.exists()) throw new Error("El guardia no existe en Firebase.");
  const user = { uid:snap.id, ...snap.data() };
  if(user.eliminado || user.aprobado === false || String(user.role || "") !== ROLES.GUARDIA){
    throw new Error("La credencial no pertenece a un guardia activo y aprobado.");
  }
  return { uid:user.uid, email:user.email || cred.email || "", nombre:user.nombre || cred.nombre || "Guardia" };
}

async function iniciarRegistroValeActivo(id, status){
  const v = valesActivos.find(x => String(x.id) === String(id));
  if(!v) return toast("No encontrado","No se encontró el vale.","warn");
  if(status === ValeStatus.FUERA && !hasPerm("registrar_salida_activo")) return toast("Sin permiso","Tu rol no puede registrar salidas de activos.","warn");
  if(status === ValeStatus.REGRESO_CANCELADO && !hasPerm("registrar_regreso_activo")) return toast("Sin permiso","Tu rol no puede registrar el regreso de activos.","warn");
  if(!navigator.onLine) return toast("Conexión requerida","La credencial del guardia debe validarse en Firebase.","warn",4200);
  currentView = "vale_activo_guardia_scanner";
  moduleReturnView = "vales_activos";
  cleanup();
  const movimiento = status === ValeStatus.FUERA ? "salida" : "regreso";
  appEl.innerHTML = `<div class="card"><h2 style="margin:0 0 6px;">Confirmar ${movimiento} del activo</h2><p style="margin:0 0 10px;color:var(--muted);font-size:12px;">El guardia responsable debe escanear su gafete QR. Se verificará en Firebase antes de registrar el movimiento.</p><div class="pill" style="display:block;margin-bottom:12px;"><b>${esc(v.folio || v.id)}</b> · ${esc(v.nombre || v.descripcion || "Activo")}</div><div id="reader"></div><div class="divider"></div><div class="row"><button class="secondary" data-action="valesActivos">Cancelar</button></div></div>`;
  try{
    if(!window.Html5Qrcode) throw new Error("La librería del escáner aún no está disponible.");
    qrScanner = new Html5Qrcode("reader");
  }catch(e){
    toast("Escáner",e.message || "No se pudo inicializar la cámara.","bad",4200);
    return renderValesActivos();
  }
  let scanHandled=false;
  qrScanner.start({facingMode:"environment"},{fps:10,qrbox:250},async decodedText=>{
    if(scanHandled) return;
    scanHandled=true;
    stopScanner();
    const parsed=parseRondineroGuardiaQr(String(decodedText).trim());
    if(!parsed){ toast("QR inválido","Escanea el gafete QR de un guardia.","bad",3600); return iniciarRegistroValeActivo(id,status); }
    try{
      const guardia=await validarCredencialGuardiaValeActivo(parsed);
      await updateValeActivoStatus(id,status,guardia);
    }catch(e){
      console.warn(e);
      toast("Credencial rechazada",e?.message || "No se pudo validar al guardia.","bad",4800);
      await renderValesActivos();
    }
  },()=>{}).catch(err=>{ toast("Permisos","No se pudo abrir la cámara: "+err,"bad",4200); renderValesActivos(); });
}

async function updateValeActivoStatus(id, status, guardiaCred=null){
  const v = valesActivos.find(x => String(x.id) === String(id));
  if(!v) return toast("No encontrado","No se encontró el vale.","warn");

  if(status === ValeStatus.PENDIENTE && !hasPerm("crear_vale_activo")) return;
  if(status === ValeStatus.FUERA && !hasPerm("registrar_salida_activo")) return;
  if(status === ValeStatus.REGRESO_CANCELADO && !hasPerm("registrar_regreso_activo")) return;
  if([ValeStatus.FUERA,ValeStatus.REGRESO_CANCELADO].includes(status) && !guardiaCred?.uid){
    return toast("Credencial requerida","Escanea el QR del guardia responsable.","warn",3800);
  }

  v.status = status;
  v.updatedTs = Date.now();
  if(status === ValeStatus.FUERA){
    v.salidaTs = Date.now();
    v.salidaPorUid = guardiaCred.uid;
    v.salidaPorEmail = guardiaCred.email || "";
    v.salidaPorNombre = guardiaCred.nombre || "Guardia";
  }
  if(status === ValeStatus.REGRESO_CANCELADO){
    v.regresoTs = Date.now();
    v.regresoPorUid = guardiaCred.uid;
    v.regresoPorEmail = guardiaCred.email || "";
    v.regresoPorNombre = guardiaCred.nombre || "Guardia";
    v.qrActivo = false;
    v.qrDesactivadoTs = Date.now();
    v.qrDesactivadoMotivo = "REGRESO_CANCELADO";
  }

  await saveValesActivos();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertValeActivo(v); }catch(e){ console.warn(e); }
  }
  toast("Vale actualizado", valeStatusLabel(status), "ok", 2200);
  await renderValesActivos();
}

async function autorizarValeActivo(id){
  const v = valesActivos.find(x => String(x.id) === String(id));
  if(!v) return toast("No encontrado","No se encontró el vale.","warn");
  if(!canCurrentUserAuthorizeValeActivo(v)){
    toast(
      "No permitido",
      `Este vale debe autorizarlo ${v.autorizadorNombre || v.autorizadorEmail || "el usuario habilitado y asignado"}, o Contraloría como respaldo.`,
      "warn",
      4200
    );
    return;
  }
  if(!(await requireUserPin("autorizar este vale de activo"))) return;
  v.status = ValeStatus.GENERADO;
  v.qrActivo = true;
  v.autorizadoTs = Date.now();
  v.autorizadoPor = currentUser?.email || "";
  v.autorizadoPorUid = currentUser?.uid || "";
  v.autorizadoPorNombre = currentUser?.nombre || "";
  v.autorizadoPorRol = currentUser?.role || "";
  const esAutorizadorAsignado = (
    (v.autorizadorUid && String(v.autorizadorUid) === String(currentUser?.uid || "")) ||
    (v.autorizadorEmail && String(v.autorizadorEmail).toLowerCase() === String(currentUser?.email || "").toLowerCase())
  );
  v.autorizacionPorRespaldo = Boolean(
    (v.autorizadorUid || v.autorizadorEmail) &&
    isValeActivoBackupAuthorizer() &&
    !esAutorizadorAsignado
  );
  v.updatedTs = Date.now();
  await saveValesActivos();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertValeActivo(v); }catch(e){ console.warn(e); }
  }
  toast("Autorizado","El vale quedó autorizado para salida.","ok",2400);
  await renderValesActivos();
}

async function cancelarValeActivo(id){
  if(!hasPerm("crear_vale_activo") && !hasPerm("autorizar_vale_activo")) return;
  if(!confirm("¿Cancelar este vale?")) return;
  const v = valesActivos.find(x => String(x.id) === String(id));
  if(!v) return;
  v.status = ValeStatus.REGRESO_CANCELADO;
  v.canceladoTs = Date.now();
  v.canceladoPor = currentUser?.email || "";
  v.qrActivo = false;
  v.updatedTs = Date.now();
  await saveValesActivos();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertValeActivo(v); }catch(e){ console.warn(e); }
  }
  toast("Cancelado","El vale fue cancelado.","ok",2200);
  await renderValesActivos();
}

function valePassInitials(name){
  return String(name || "P")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0,2)
    .map(x => x[0])
    .join("")
    .toUpperCase() || "P";
}

function valePassDate(value){
  if(!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if(Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-MX", { day:"2-digit", month:"short", year:"numeric" });
}

function renderValePermisoPass({
  tipo, payload, folio, nombre, dato1, dato2, rol, depto, tipoPermiso, fecha, fechaSub, autoriza,
  instrucciones, volverAction, title = "", kindLabel = "Permiso de", personLabel = "Solicitado por",
  roleLabel = "Rol / relacion", factTypeLabel = "Tipo de permiso", leftSide = "Solicitud\ngenerada",
  rightSide = "Presentar\nen acceso"
}){
  return `
    <div class="permit-pass-actions">
      <button class="secondary" data-action="${esc(volverAction)}">Volver</button>
      <button class="secondary" data-action="print">Imprimir</button>
      <button id="btnGuardarValePass" class="secondary" type="button">Guardar pase</button>
      <button id="btnCompartirValePass" class="secondary" type="button">Compartir QR</button>
    </div>
    <div class="permit-pass printable" id="valePermisoPass">
      <div class="permit-hero">
        <div>
          <div class="permit-brand">
            <div class="permit-logo">CA</div>
            <div><strong>Caborca Access Control</strong><span>Seguridad - Confianza - Registro</span></div>
          </div>
          <div class="permit-title"><h2>${esc(title)}</h2></div>
        </div>
        <div class="permit-kind"><small>${esc(kindLabel)}</small><b>${esc(tipo)}</b><i></i></div>
      </div>
      <div class="permit-body">
        <div class="permit-person">
          <div class="permit-avatar">${esc(valePassInitials(nombre))}</div>
          <div>
            <div class="permit-label">${esc(personLabel)}</div>
            <div class="permit-name">${esc(nombre || "")}</div>
            <div class="permit-sub">${esc(dato1 || "")}</div>
            <div class="permit-sub">${esc(dato2 || "")}</div>
          </div>
          <div class="permit-role">
            <div class="permit-label">${esc(roleLabel)}</div>
            <b>${esc(rol || "")}</b>
            <span>${esc(depto || "")}</span>
          </div>
        </div>
        <div class="permit-facts">
          <div class="permit-fact"><div class="permit-icon">IN</div><div><div class="permit-label">${esc(factTypeLabel)}</div><b>${esc(tipoPermiso || "")}</b><span></span></div></div>
          <div class="permit-fact"><div class="permit-icon">CAL</div><div><div class="permit-label">Fecha</div><b>${esc(fecha || "")}</b><span>${esc(fechaSub || "")}</span></div></div>
          <div class="permit-fact"><div class="permit-icon">OK</div><div><div class="permit-label">Autoriza</div><b>${esc(autoriza || "")}</b><span></span></div></div>
        </div>
        <div class="permit-qr-zone">
          <div class="permit-side"><div class="permit-icon">OK</div><div>${esc(leftSide)}</div><i></i></div>
          <div class="permit-qr-card"><div id="qrcode" class="permit-qr"></div><div class="permit-code"><span>${esc(String(payload).replace(/(.{4})/g, "$1 ").trim().toUpperCase())}</span><small>Codigo de verificacion</small></div></div>
          <div class="permit-side"><div class="permit-icon">QR</div><div>${esc(rightSide)}</div><i></i></div>
        </div>
        <div class="permit-instructions"><div class="permit-icon">i</div><div><b>Instrucciones</b><p>${esc(instrucciones || "Muestra este codigo QR en el acceso.")}</p></div></div>
      </div>
      <div class="permit-footer"><span>Seguridad, control y confianza</span><span>Folio: <b>${esc(folio || "")}</b></span></div>
    </div>
  `;
}

function setupValePassActions({ payload, folio, filename, shareText }){
  setTimeout(() => {
    try{
      const box = document.getElementById("qrcode");
      if(box && window.QRCode){
        box.innerHTML = "";
        new QRCode(box, {
          text: payload,
          width: 260,
          height: 260,
          colorDark: "#111827",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    }catch(e){
      console.warn(e);
      toast("QR","No se pudo generar el QR del vale.","bad",3200);
    }

    async function passBlob(){
      if(!await loadFeatureDependencies("capture", "la imagen del pase")) return null;
      const pass = document.getElementById("valePermisoPass");
      if(pass && window.html2canvas){
        const canvas = await window.html2canvas(pass, {
          backgroundColor:"#f8fafc",
          scale:Math.min(2, window.devicePixelRatio || 1.5),
          useCORS:false,
          allowTaint:false
        });
        return new Promise(resolve => canvas.toBlob(resolve, "image/png", 0.95));
      }
      return null;
    }

    const btnGuardar = document.getElementById("btnGuardarValePass");
    if(btnGuardar){
      btnGuardar.onclick = async () => {
        const blob = await passBlob();
        if(!blob) return alert("No se pudo generar el pase");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || `PERMISO-${String(folio || "QR")}.png`;
        a.click();
        URL.revokeObjectURL(url);
      };
    }

    const btnCompartir = document.getElementById("btnCompartirValePass");
    if(btnCompartir){
      btnCompartir.onclick = async () => {
        const text = shareText || "";
        const blob = await passBlob();
        if(!navigator.share){
          try{
            await navigator.clipboard?.writeText(text);
            toast("Compartir","Texto copiado. Guarda el pase y adjuntalo manualmente.","ok",3200);
          }catch{
            toast("Compartir","Guarda el pase y comparte la imagen manualmente.","warn",3200);
          }
          return;
        }
        try{
          if(blob){
            const file = new File([blob], filename || `PERMISO-${String(folio || "QR")}.png`, { type:"image/png" });
            if(!navigator.canShare || navigator.canShare({ files:[file] })){
              await navigator.share({ title:"Permiso de acceso", text, files:[file] });
              return;
            }
          }
          await navigator.share({ title:"Permiso de acceso", text });
        }catch(e){
          console.warn("Compartir cancelado o falló:", e);
        }
      };
    }
  }, 50);
}

async function renderValeQR(id){
  if(!requirePerm("ver_vales_activos","Tu rol no puede ver vales.")) return;
  if(!await loadFeatureDependencies("qr", "el código QR")) return renderValesActivos();
  currentView = "vale_qr";
  rememberModuleReturn(currentView);
  const v = valesActivos.find(x => String(x.id) === String(id));
  if(!v) return renderValesActivos();
  if(!v.qrActivo){
    toast("QR desactivado","Este vale ya está en Regreso o fue cancelado.","warn",3200);
    return renderValesActivos();
  }

  const payload = `VALE_ACTIVO:${String(v.id)}`;
  const folio = v.folio || v.id;
  const depto = v.departamento || "";
  const shareText = [
    "Vale de salida de activo",
    `Folio: ${folio}`,
    `Solicitante: ${v.nombre || ""}`,
    `Activo: ${v.tipoActivo || ""}`,
    `Descripcion: ${v.descripcion || ""}`,
    `Fecha: ${valePassDate(v.fecha)}`,
    `Autoriza: ${v.autorizadorNombre || v.autorizadorEmail || ""}`
  ].join("\n");

  appEl.innerHTML = renderValePermisoPass({
    title:"Vale de activo",
    kindLabel:"Vale de activo",
    tipo:folio,
    payload,
    folio,
    personLabel:"Descripcion del activo",
    nombre:v.descripcion || "Vale de activo",
    dato1:v.noSerie ? `Numero de serie: ${v.noSerie}` : "",
    dato2:[v.tipoActivo, v.codigoLote ? `Codigo/Lote: ${v.codigoLote}` : ""].filter(Boolean).join(" | "),
    roleLabel:"Solicitado por",
    rol:v.nombre || "",
    depto,
    factTypeLabel:"Motivo",
    tipoPermiso:v.motivo || "Salida de activo",
    fecha:valePassDate(v.fecha),
    fechaSub:v.fechaRetorno ? `Retorno: ${valePassDate(v.fechaRetorno)}` : "",
    autoriza:v.autorizadorNombre || v.autorizadorEmail || "",
    leftSide:"Vale\ngenerado",
    rightSide:"Salida\nde activo",
    instrucciones:"Presenta este vale en el acceso al salir. El activo debe coincidir con la descripcion. Este vale es personal e intransferible.",
    volverAction:"valesActivos"
  });
  setupValePassActions({
    payload,
    folio,
    filename:`PERMISO-ACTIVO-${String(folio)}.png`,
    shareText
  });
}

function parseTiempoAutorizadoMin(value=""){
  const v = String(value || "").toLowerCase();
  if(v.includes("entrada posterior")) return null;
  if(v.includes("15")) return 15;
  if(v.includes("30")) return 30;
  if(v.includes("1hr") || v.includes("1 hr") || v.includes("1 hora") || v.includes("60")) return 60;
  return null;
}

function formatMinutes(totalMin){
  if(totalMin === null || totalMin === undefined || Number.isNaN(Number(totalMin))) return "-";
  const mins = Math.max(0, Math.round(Number(totalMin)));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m} min`;
}

function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function calcValePersonalTiempo(v={}){
  if(!v.salidaTs) return null;
  // El tiempo visible y de reportes siempre comprende el recorrido completo.
  const base = Number(v.salidaTs || 0);
  const end = Number(
    v.regresoTs ||
    v.salidaSinRegresoFinalizadaTs ||
    v.canceladoTs ||
    (v.status === ValeStatus.REGRESO_CANCELADO ? v.updatedTs : 0) ||
    Date.now()
  );
  if(end < base) return null;
  return Math.round((end - base) / 60000);
}

function calcValePersonalTramoAutorizado(v={}){
  if(!v.salidaTs) return null;
  // El tiempo autorizado siempre se compara desde la salida original.
  const base = Number(v.salidaTs || 0);
  const end = Number(
    v.regresoTs ||
    v.salidaSinRegresoFinalizadaTs ||
    v.canceladoTs ||
    (v.status === ValeStatus.REGRESO_CANCELADO ? v.updatedTs : 0) ||
    Date.now()
  );
  if(end < base) return null;
  return Math.round((end - base) / 60000);
}

function isValePersonalExcedido(v={}){
  const autorizado = parseTiempoAutorizadoMin(v.tiempoAutorizado);
  const usado = calcValePersonalTramoAutorizado(v);
  return v.status === ValeStatus.FUERA && autorizado !== null && usado !== null && usado > autorizado;
}

async function marcarValesPersonalExcedidos(){
  const legacy = valesPersonal.filter(v => Boolean(v.reautorizacionPendiente));
  if(!legacy.length) return;

  legacy.forEach(v => {
    v.reautorizacionPendiente = false;
    v.reautorizacionEliminadaTs = Date.now();
    v.updatedTs = Date.now();
  });

  saveValesPersonalLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    await Promise.all(legacy.filter(v => !(esValePersonalGrupal(v) && esPreviewValeGrupalLocal())).map(v => cloudUpsertValePersonal(v).catch(e => console.warn(e))));
  }
}

async function normalizarValesSalidaSinRegreso(){
  const pendientes = valesPersonal.filter(v =>
    isValePersonalSalidaSinRegreso(v) &&
    v.status === ValeStatus.FUERA &&
    Number(v.salidaTs || 0) > 0
  );
  if(!pendientes.length) return;
  const now = Date.now();
  pendientes.forEach(v => {
    v.status = ValeStatus.REGRESO_CANCELADO;
    v.salidaSinRegresoFinalizada = true;
    v.salidaSinRegresoFinalizadaTs = Number(v.salidaTs || now);
    v.qrActivo = false;
    v.qrDesactivadoTs = Number(v.salidaTs || now);
    v.qrDesactivadoMotivo = "SALIDA_SIN_REGRESO";
    v.reautorizacionPendiente = false;
    v.updatedTs = now;
  });
  saveValesPersonalLocal();
  if(navigator.onLine && hasPerm("registrar_salida_personal")){
    await Promise.all(pendientes.filter(v => !(esValePersonalGrupal(v) && esPreviewValeGrupalLocal())).map(v => cloudUpsertValePersonal(v).catch(e => console.warn("No se pudo normalizar salida sin regreso:", e))));
  }
}

function isValePersonalEntrada(v={}){
  const tipo = String(v.tipoPermiso || "").trim().toLowerCase();
  const movimientoImss = String(v.movimientoImss || "").trim().toLowerCase();
  const tiempo = String(v.tiempoAutorizado || "").trim().toLowerCase();
  return tipo === "entrada" || (
    isPermisoImss(v) && (
      movimientoImss === "entrada_815" ||
      tiempo === "entrada posterior a las 8:15 a.m." ||
      tiempo === "entrada posterior a las 8:15"
    )
  );
}

function isValePersonalSalidaSinRegreso(v={}){
  return String(v.tiempoAutorizado || "").trim().toLowerCase() === "salida sin regreso";
}

function isValePersonalSinHorarioRegreso(v={}){
  return String(v.tiempoAutorizado || "").trim().toLowerCase() === "sin horario estimado de regreso";
}

function isPermisoImss(v={}){
  return v.esPermisoImss === true || String(v.tipoPermiso || "").trim().toLowerCase() === "permiso imss";
}

function valePersonalMovimientoLabel(v={}){
  if(isPermisoImss(v)) return isValePersonalEntrada(v) ? "Entrada posterior a las 8:15" : "Salida a consulta IMSS";
  return String(v.tipoPermiso || "Permiso");
}

function getPermisoImssWindow(v={}){
  const salidaTs = Number(v.salidaProgramadaTs || 0);
  const fecha = String(v.fecha || "").slice(0,10);
  const cierreDiaTs = fecha ? new Date(`${fecha}T18:00:00`).getTime() : 0;
  return {
    salidaTs,
    inicioTs: Number(v.imssVentanaInicioTs || (salidaTs ? salidaTs - 5 * 60000 : 0)),
    // Se recalcula para extender también los permisos creados anteriormente.
    finTs: Number.isFinite(cierreDiaTs) ? cierreDiaTs : 0
  };
}

function getPermisoImssQrState(v={}, now=Date.now()){
  if(!isPermisoImss(v)) return "normal";
  if(isValePersonalEntrada(v)){
    const fecha = String(v.fecha || "");
    if(fecha < todayISO()) return "vencido";
    if(fecha > todayISO()) return "anticipado";
    return v.status === ValeStatus.GENERADO && v.qrActivo !== false ? "habilitado" : "cerrado";
  }
  if(v.status === ValeStatus.FUERA) return String(v.fecha || "") === todayISO() ? "regreso" : "vencido";
  if(v.status !== ValeStatus.GENERADO || v.qrActivo === false) return "cerrado";
  const { inicioTs, finTs } = getPermisoImssWindow(v);
  if(!inicioTs || !finTs) return "invalido";
  if(now < inicioTs) return "anticipado";
  if(now > finTs) return "vencido";
  return "habilitado";
}

function formatHoraTs(ts){
  const n = Number(ts || 0);
  return n ? new Date(n).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "-";
}

async function registrarIntentoPermisoImss(v, tipo){
  const now = Date.now();
  if(!Array.isArray(v.imssIntentos)) v.imssIntentos = [];
  v.imssIntentos.push({
    ts: now,
    tipo,
    guardiaUid: currentUser?.uid || "",
    guardiaEmail: currentUser?.email || "",
    guardiaNombre: currentUser?.nombre || ""
  });
  v.updatedTs = now;
  await saveValesPersonal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertValePersonal(v); }catch(e){ console.warn("No se pudo auditar el intento IMSS:", e); }
  }
}

function getEntrada815BaseTs(v={}){
  const fecha = v.fecha || new Date().toISOString().slice(0,10);
  const ts = new Date(`${String(fecha).slice(0,10)}T08:15:00`).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function calcEntrada815Min(v={}){
  if(!v.llegadaTs) return null;
  const base = getEntrada815BaseTs(v);
  if(base === null) return null;
  return Math.max(0, Math.round((v.llegadaTs - base) / 60000));
}
