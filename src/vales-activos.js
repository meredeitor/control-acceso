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

function valeActivoFirmaFecha(ts){
  const n = Number(ts || 0);
  if(!n) return "Pendiente";
  return new Date(n).toLocaleString("es-MX", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

function renderValeActivoFirmas(v={}, { collapsible=true }={}){
  const firmas = [
    { label:"Elaboró", nombre:v.createdByNombre || v.createdByName || v.createdByEmail || "Información no disponible", email:v.createdByEmail || "", ts:v.createdTs, complete:Boolean(v.createdTs) },
    { label:"Autorizó", nombre:v.autorizadoPorNombre || v.autorizadoPor || "Pendiente de autorización", email:v.autorizadoPor || "", ts:v.autorizadoTs, complete:Boolean(v.autorizadoTs) },
    { label:"Guardia · salida", nombre:v.salidaPorNombre || "Pendiente de salida", email:v.salidaPorEmail || "", ts:v.salidaTs, complete:Boolean(v.salidaTs && v.salidaPorUid) },
    { label:"Guardia · regreso", nombre:v.salidaSinRegreso === true ? "No aplica" : v.regresoPorNombre || "Pendiente de regreso", email:v.regresoPorEmail || "", ts:v.regresoTs, complete:v.salidaSinRegreso === true || Boolean(v.regresoTs && v.regresoPorUid) }
  ];
  const body = `<div class="vale-activo-signature-grid">${firmas.map(firma=>`
    <div class="vale-activo-signature ${firma.complete ? "is-complete" : "is-pending"}">
      <small>${esc(firma.label)}</small>
      <b>${esc(firma.nombre)}</b>
      ${firma.email && firma.email !== firma.nombre ? `<span>${esc(firma.email)}</span>` : ""}
      <time>${esc(valeActivoFirmaFecha(firma.ts))}</time>
    </div>`).join("")}</div>`;
  return collapsible
    ? `<details class="vale-activo-signatures" onclick="event.stopPropagation()"><summary>Firmas y responsables</summary>${body}</details>`
    : `<section class="vale-activo-signatures permit-signatures"><h3>Firmas y responsables</h3>${body}</section>`;
}

function renderValeActivoAction(v, action, label, path){
  return `<button type="button" class="secondary" data-action="${action}" data-id="${esc(v.id)}" data-no-sb="true" title="${label}" aria-label="${label}"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"></path></svg></button>`;
}

function renderValeActivoCard(v){
  const fecha = v.fecha ? new Date(v.fecha + "T00:00:00").toLocaleDateString() : "-";
  const autorizadoPor = v.autorizadoPorNombre || "";
  const autorizador = v.autorizadorNombre || v.autorizadorEmail || "";
  const activoNombre = v.descripcion || v.nombre || "Activo sin descripción";
  const iniciales = activoNombre.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x.charAt(0)).join("").toUpperCase() || "AC";
  const statusMeta = {
    [ValeStatus.PENDIENTE]: ["Pendiente", "pendiente"],
    [ValeStatus.GENERADO]: ["Inicio", "inicio"],
    [ValeStatus.FUERA]: ["Fuera", "fuera"],
    [ValeStatus.REGRESO_CANCELADO]: [v.canceladoTs ? "Cancelado" : "Finalizado", v.canceladoTs ? "cancelado" : "finalizado"]
  }[v.status] || [valeStatusLabel(v.status), ""];
  const createdTime = Number(v.createdTs || 0) ? new Date(Number(v.createdTs)).toLocaleTimeString("es-MX", {hour:"2-digit", minute:"2-digit"}) : "";
  const creatorName = v.createdByNombre || v.createdByName || v.createdByEmail || "Usuario no registrado";
  const firmas = [v.createdTs, v.autorizadoTs, v.salidaTs && v.salidaPorUid];
  if(v.salidaSinRegreso !== true) firmas.push(v.regresoTs && v.regresoPorUid);
  const firmasRegistradas = firmas.filter(Boolean).length;
  return `
    <article class="tarjeta history-card provider-visit-card provider-kanban-card vale-activo-card status-${esc(statusMeta[1])}" data-action="verDetalleValeActivo" data-id="${esc(v.id)}" tabindex="0" aria-label="Ver detalle del vale ${esc(v.folio || v.id)}">
      <div class="provider-card-top">
        <span class="provider-avatar" aria-hidden="true">${esc(iniciales)}</span>
        <span class="provider-card-name"><strong>${esc(activoNombre)}</strong><small>${esc(v.tipoActivo || "Activo")} · ${esc(v.nombre || "Solicitante no indicado")}</small></span>
        <span class="provider-state-chip">${esc(statusMeta[0])}</span>
      </div>
      <div class="provider-card-ops">
        <span title="Folio del vale">▣ &nbsp;<b>${esc(v.folio || v.id)}</b></span>
        <span title="Departamento">⌖ &nbsp;${esc(v.departamento || "Sin departamento")}</span>
      </div>
      <div class="provider-card-created">Elaborado${createdTime ? ` ${esc(createdTime)}` : ""} · ${esc(creatorName)}</div>
      <div class="provider-card-secondary">
        <span class="provider-mini-pill">Fecha ${esc(fecha)}</span>
        ${v.noSerie ? `<span class="provider-mini-pill" title="Número de serie">Serie ${esc(v.noSerie)}</span>` : ""}
        ${v.codigoLote ? `<span class="provider-mini-pill">Código / lote: ${esc(v.codigoLote)}</span>` : ""}
        ${v.motivo ? `<span class="provider-mini-pill">Motivo: ${esc(v.motivo)}</span>` : ""}
        <span class="provider-mini-pill">${v.salidaSinRegreso === true ? "Salida sin regreso" : `Retorno: ${esc(valePassDate(v.fechaRetorno) || "Sin fecha indicada")}`}</span>
        <span class="provider-mini-pill alert">Autorizador: ${esc(autorizador || "Sin asignar")}</span>
        ${autorizadoPor ? `<span class="provider-mini-pill success">Autorizó: ${esc(autorizadoPor)}</span>` : ""}
        <span class="provider-mini-pill ${firmasRegistradas === firmas.length ? "success" : ""}">Firmas ${firmasRegistradas}/${firmas.length}</span>
        ${v.autorizacionPorRespaldo ? `<span class="provider-mini-pill">Autorización respaldo</span>` : ""}
        <span class="provider-card-actions">
          ${v.qrActivo ? renderValeActivoAction(v,"verValeQR","Ver QR","M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM21 15v4h-2v2h-4") : ""}
          ${renderKanbanDetailsButton()}
        </span>
      </div>
      ${renderValeActivoFirmas(v)}
      ${canCancelValeActivo(v) ? `<div class="provider-card-actions vale-activo-actions">
        ${canEditValeActivo(v) ? renderValeActivoAction(v,"editarValeActivo","Editar","M12 20h9M16 4l4 4L9 19l-5 1 1-5Z") : ""}
        ${renderValeActivoAction(v,"cancelarVale","Cancelar","M7 7l10 10M17 7L7 17M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0")}
        ${canDeleteValeActivo(v) ? renderValeActivoAction(v,"eliminarValeActivo","Eliminar","M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7") : ""}
      </div>` : ""}
      ${renderKanbanMovementPanel(valeActivoHistoryEvents(v))}
    </article>
  `;
}

function valeActivoMovement(v){
  if(!v.qrActivo) return null;
  if(v.status === ValeStatus.GENERADO && v.autorizadoTs && hasPerm("registrar_salida_activo")){
    return { id:v.id, status:ValeStatus.FUERA, label:"Registrar salida" };
  }
  if(v.status === ValeStatus.FUERA && hasPerm("registrar_regreso_activo")){
    return { id:v.id, status:ValeStatus.REGRESO_CANCELADO, label:"Registrar regreso" };
  }
  return null;
}

function valeActivoDetailStatus(v){
  if(v.status === ValeStatus.REGRESO_CANCELADO) return v.canceladoTs ? "Cancelado" : "Finalizado";
  if(v.status === ValeStatus.GENERADO) return "Inicio";
  return valeStatusLabel(v.status);
}

function abrirDetalleValeActivo(id){
  if(!requirePerm("ver_vales_activos","Tu rol no puede ver vales.")) return;
  const v = valesActivos.find(row => String(row.id) === String(id));
  if(!v) return toast("Vale no encontrado","Actualiza el tablero y vuelve a intentarlo.","warn");
  const movement = valeActivoMovement(v);
  const fields = [
    ["Solicitante", v.nombre], ["Departamento", v.departamento],
    ["Tipo de activo", v.tipoActivo], ["Motivo", v.motivo],
    ["Número de serie", v.noSerie], ["Código / lote", v.codigoLote],
    ["Fecha", valePassDate(v.fecha)],
    ["Retorno", v.salidaSinRegreso === true ? "Salida sin regreso" : valePassDate(v.fechaRetorno) || "Sin fecha indicada"],
    ["Autorizador asignado", v.autorizadorNombre || v.autorizadorEmail], ["QR", v.qrActivo ? "Activo" : "Desactivado"],
    ...(v.planta ? [["Planta", v.planta]] : [])
  ];
  const dialog = document.createElement("dialog");
  dialog.id = "detalleValeActivo";
  dialog.className = "vale-activo-detail-dialog";
  dialog.setAttribute("aria-labelledby", "detalleValeActivoTitulo");
  dialog.innerHTML = `
    <div class="vale-activo-detail-head">
      <div><h3 id="detalleValeActivoTitulo">Detalle del vale de activo</h3><div class="vale-activo-detail-meta"><strong>${esc(v.folio || v.id)}</strong><span class="pill"><span class="dot info"></span>${esc(valeActivoDetailStatus(v))}</span></div></div>
      <form method="dialog"><button class="secondary" aria-label="Cerrar detalle" title="Cerrar detalle" autofocus>✕</button></form>
    </div>
    <div class="vale-activo-detail-body">
      <div class="vale-activo-detail-description"><h4>Descripción del activo</h4><p>${esc(v.descripcion || "Sin descripción")}</p></div>
      <dl class="vale-activo-detail-fields">${fields.map(([label,value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value || "—")}</dd></div>`).join("")}</dl>
      <div class="vale-activo-detail-expand">
        ${renderValeActivoFirmas(v)}
        <details class="vale-activo-signatures"><summary>Movimientos</summary>${renderKanbanMovementPanel(valeActivoHistoryEvents(v), false)}</details>
      </div>
      <div class="row vale-activo-detail-actions">
        ${v.status === ValeStatus.PENDIENTE && canCurrentUserAuthorizeValeActivo(v) ? `<button class="ok" type="button" data-action="autorizarVale" data-id="${esc(v.id)}">Autorizar</button>` : ""}
        ${movement ? `<button class="ok" type="button" data-action="setValeStatus" data-id="${esc(v.id)}" data-status="${esc(movement.status)}">${esc(movement.label)}</button>` : ""}
      </div>
    </div>`;
  dialog.addEventListener("close", () => dialog.remove(), { once:true });
  dialog.addEventListener("click", event => {
    if(event.target.closest('[data-action="autorizarVale"], [data-action="setValeStatus"]')) dialog.close();
  });
  appEl.append(dialog);
  dialog.showModal();
}

function renderValeActivoModal(){
  return `
    <div class="modal-overlay vale-modal" id="valeModal" style="display:none;">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h3 id="valeActivoModalTitle" style="margin:0;">Nuevo vale de salida</h3>
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
                <option>Residuos</option>
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
                <option>Salida de Residuos</option>
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
              <label><input id="valeSalidaSinRegreso" type="checkbox" style="width:auto" onchange="document.getElementById('valeFechaRetorno').disabled = this.checked"> Salida sin regreso</label>
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

function canEditValeActivo(v){
  return v?.status === ValeStatus.PENDIENTE && canCancelValeActivo(v);
}

function canCancelValeActivo(v){
  return [ValeStatus.PENDIENTE, ValeStatus.GENERADO].includes(v?.status) &&
    (currentUser?.role === ROLES.ADMIN || Boolean(currentUser?.uid && v.createdByUid === currentUser.uid));
}

function canDeleteValeActivo(v){
  return currentUser?.role === ROLES.ADMIN && canCancelValeActivo(v);
}

async function openValeModal(id=""){
  const modal = document.getElementById("valeModal");
  if(!modal) return;
  const v = id ? valesActivos.find(row => String(row.id) === String(id)) : null;
  if(id && !canEditValeActivo(v)) return toast("Sin permiso","Solo quien creó el vale o un administrador puede editarlo mientras esté pendiente.","warn");
  if(!id && !hasPerm("crear_vale_activo")) return;
  await ensureValeActivoAutorizadores(Boolean(v));
  modal.dataset.editId = v ? String(v.id) : "";
  modal.dataset.editRevision = String(v?.updatedTs || 0);
  document.getElementById("valeActivoModalTitle").textContent = v ? "Editar vale de activo" : "Nuevo vale de salida";
  const save = modal.querySelector('[data-action="guardarValeActivo"]');
  save.textContent = v ? "Guardar cambios" : "Guardar y generar QR";
  document.getElementById("valeFolio").readOnly = Boolean(v);
  const fields = {
    valeFecha:v?.fecha || todayISO(), valeFolio:v ? v.folio || v.id : "", valeDepartamento:v?.departamento,
    valeTipoActivo:v?.tipoActivo, valeMotivo:v?.motivo, valeNombre:v?.nombre,
    valeDescripcion:v?.descripcion, valeSerie:v?.noSerie, valeCodigoLote:v?.codigoLote,
    valeFechaRetorno:v?.fechaRetorno
  };
  for(const [key,value] of Object.entries(fields)){
    const field = document.getElementById(key);
    if(field.tagName === "SELECT" && value && !Array.from(field.options).some(option => option.value === value)){
      field.add(new Option(value, value), field.options[field.options.length - 1]);
    }
    field.value = value || "";
  }
  const sinRegreso = v?.salidaSinRegreso === true;
  document.getElementById("valeSalidaSinRegreso").checked = sinRegreso;
  document.getElementById("valeFechaRetorno").disabled = sinRegreso;
  const sel = document.getElementById("valeAutorizador");
  sel.innerHTML = renderValeActivoAutorizadorOptions();
  sel.value = v?.autorizadorUid || "";
  modal.style.display = "flex";
}

function closeValeModal(){
  const modal = document.getElementById("valeModal");
  if(modal) modal.style.display = "none";
}

function readValeActivoForm(){
  const fecha = document.getElementById("valeFecha")?.value || "";
  const departamento = document.getElementById("valeDepartamento")?.value.trim() || "";
  const tipoActivo = document.getElementById("valeTipoActivo")?.value || "";
  const motivo = document.getElementById("valeMotivo")?.value || "";
  const nombre = document.getElementById("valeNombre")?.value.trim() || "";
  const descripcion = document.getElementById("valeDescripcion")?.value.trim() || "";
  const noSerie = document.getElementById("valeSerie")?.value.trim() || "";
  const codigoLote = document.getElementById("valeCodigoLote")?.value.trim() || "";
  const salidaSinRegreso = document.getElementById("valeSalidaSinRegreso")?.checked === true;
  const fechaRetorno = salidaSinRegreso ? "" : document.getElementById("valeFechaRetorno")?.value || "";
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

  return {
    fecha,
    departamento,
    tipoActivo,
    motivo,
    nombre,
    descripcion,
    noSerie,
    codigoLote,
    fechaRetorno,
    salidaSinRegreso,
    autorizadorUid,
    autorizadorEmail,
    autorizadorNombre,
    autorizadorRole
  };
}

async function guardarValeActivo(){
  const modal = document.getElementById("valeModal");
  if(modal?.dataset.editId) return guardarEdicionValeActivo(modal);
  if(!requirePerm("crear_vale_activo","Tu rol no puede crear vales.")) return;
  const fields = readValeActivoForm();
  if(!fields) return;
  const folioRaw = document.getElementById("valeFolio")?.value.trim() || "";
  const v = {
    ...fields,
    id:Date.now().toString(),
    folio:folioRaw || `VA-${new Date().getFullYear()}-${String(valesActivos.length + 1).padStart(4,"0")}`,
    planta:"",
    status: ValeStatus.PENDIENTE,
    qrActivo: true,
    createdByUid: currentUser?.uid || "",
    createdByEmail: currentUser?.email || "",
    createdByNombre: currentUser?.nombre || currentUser?.email || "",
    createdByRole: currentUser?.role || "",
    createdTs: Date.now(),
    updatedTs: Date.now()
  };
  valesActivos.unshift(v);
  await saveValesActivos();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertValeActivo(v); }catch(e){ console.warn(e); }
  }
  toast("Vale generado","Vale guardado y QR generado.","ok",2400);
  closeValeModal();
  await renderValeQR(v.id);
}

async function updatePendingValeActivo(id, revision, canUpdate, changes){
  const ref = doc(db, COL_VALES_ACTIVOS, String(id));
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const current = snap.data();
    if(current?.status !== ValeStatus.PENDIENTE || Number(current.updatedTs || 0) !== revision || !canUpdate(current)){
      throw new Error("El vale cambió o dejó de estar disponible. Actualiza el tablero y vuelve a revisarlo.");
    }
    const patch = {
      ...changes,
      updatedTs:Math.max(Date.now(), revision + 1),
      updatedAt:serverTimestamp(),
      updatedByUid:currentUser.uid,
      updatedByEmail:currentUser.email || ""
    };
    tx.update(ref, patch);
    return patch;
  });
}

async function guardarEdicionValeActivo(modal){
  const { editId, editRevision } = modal.dataset;
  const v = valesActivos.find(row => String(row.id) === editId);
  if(!canEditValeActivo(v)) return toast("Sin permiso","El vale ya no se puede editar.","warn");
  const fields = readValeActivoForm();
  if(!fields) return;
  const save = modal.querySelector('[data-action="guardarValeActivo"]');
  if(save.disabled) return;
  save.disabled = true;
  try{
    await updatePendingValeActivo(editId, Number(editRevision), canEditValeActivo, {
      ...fields,
      editedTs:Date.now(),
      editedByUid:currentUser.uid,
      editedByNombre:currentUser.nombre || currentUser.email || ""
    });
  }catch(error){
    return toast("No se guardó la edición", error.message || "Revisa la conexión y los permisos.","bad",4800);
  }finally{
    save.disabled = false;
  }
  closeValeModal();
  toast("Vale actualizado","Los cambios quedaron guardados. El vale sigue pendiente de autorización.","ok",3200);
  await renderValesActivos();
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
  if(!await loadFeatureDependencies("camera", "el escáner de cámara")) return;
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

  if(status === ValeStatus.FUERA && v.salidaSinRegreso === true){
    if(v.status !== ValeStatus.GENERADO || !v.autorizadoTs) return toast("Vale actualizado","El vale debe estar autorizado y pendiente de salida.","warn");
    const now = Date.now();
    const finalizado = {
      ...v,
      status: ValeStatus.REGRESO_CANCELADO,
      salidaTs: now,
      salidaPorUid: guardiaCred.uid,
      salidaPorEmail: guardiaCred.email || "",
      salidaPorNombre: guardiaCred.nombre || "Guardia",
      qrActivo: false,
      qrDesactivadoTs: now,
      qrDesactivadoMotivo: "SALIDA_SIN_REGRESO",
      updatedTs: now
    };
    try{
      await cloudUpsertValeActivo(finalizado);
    }catch(error){
      console.warn(error);
      toast("Salida sin confirmar","Firebase no guardó la salida sin regreso. Revisa la conexión y los permisos antes de reintentar.","bad",4800);
      return renderValesActivos();
    }
    Object.assign(v, finalizado);
    await saveValesActivos();
    toast("Salida sin regreso","El vale pasó a Finalizado.","ok",2400);
    return renderValesActivos();
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
  if(v.status !== ValeStatus.PENDIENTE) return toast("Vale actualizado","Este vale ya no está pendiente de autorización.","warn");
  if(!canCurrentUserAuthorizeValeActivo(v)){
    toast(
      "No permitido",
      `Este vale debe autorizarlo ${v.autorizadorNombre || v.autorizadorEmail || "el usuario habilitado y asignado"}, o Contraloría como respaldo.`,
      "warn",
      4200
    );
    return;
  }
  const revision = Number(v.updatedTs || 0);
  if(!(await requireUserPin("autorizar este vale de activo"))) return;
  const esAutorizadorAsignado = (
    (v.autorizadorUid && String(v.autorizadorUid) === String(currentUser?.uid || "")) ||
    (v.autorizadorEmail && String(v.autorizadorEmail).toLowerCase() === String(currentUser?.email || "").toLowerCase())
  );
  const autorizacionPorRespaldo = Boolean(
    (v.autorizadorUid || v.autorizadorEmail) &&
    isValeActivoBackupAuthorizer() &&
    !esAutorizadorAsignado
  );
  try{
    await updatePendingValeActivo(id, revision, canCurrentUserAuthorizeValeActivo, {
      status:ValeStatus.GENERADO,
      qrActivo:true,
      autorizadoTs:Date.now(),
      autorizadoPor:currentUser.email || "",
      autorizadoPorUid:currentUser.uid,
      autorizadoPorNombre:currentUser.nombre || "",
      autorizadoPorRol:currentUser.role || "",
      autorizacionPorRespaldo
    });
  }catch(error){
    toast("No se autorizó el vale",error.message || "Revisa la conexión y los permisos.","bad",4800);
    return renderValesActivos();
  }
  toast("Autorizado","El vale quedó autorizado para salida.","ok",2400);
  await renderValesActivos();
}

async function gestionarBajaValeActivo(id, eliminar=false){
  const v = valesActivos.find(x => String(x.id) === String(id));
  const permitido = eliminar ? canDeleteValeActivo : canCancelValeActivo;
  if(!permitido(v)) return toast("Acción no disponible","Revisa el estado del vale y tus permisos.","warn");
  if(!confirm(eliminar ? `¿Eliminar permanentemente el vale ${v.folio || v.id}?` : `¿Cancelar el vale ${v.folio || v.id}?`)) return;
  const ref = doc(db, COL_VALES_ACTIVOS, String(id));
  try{
    const changes = await runTransaction(db, async tx => {
      const actual = (await tx.get(ref)).data();
      if(!permitido(actual) || actual.status !== v.status) throw new Error("El estado del vale cambió. Actualiza el tablero antes de continuar.");
      if(eliminar){ tx.delete(ref); return null; }
      const patch = {
        status:ValeStatus.REGRESO_CANCELADO,
        canceladoTs:Date.now(),
        canceladoPor:currentUser.email || "",
        canceladoPorNombre:currentUser.nombre || "",
        qrActivo:false,
        updatedTs:Date.now(),
        updatedByUid:currentUser.uid,
        updatedByEmail:currentUser.email || ""
      };
      tx.update(ref, { ...patch, updatedAt:serverTimestamp() });
      return patch;
    });
    if(changes) Object.assign(v, changes);
  }catch(error){
    return toast("No se completó la acción",error.message || "Revisa la conexión y tus permisos.","bad",4800);
  }
  if(eliminar) valesActivos = valesActivos.filter(row => String(row.id) !== String(id));
  await saveValesActivos();
  toast(eliminar ? "Vale eliminado" : "Vale cancelado","","ok",2200);
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
  rightSide = "Presentar\nen acceso", signaturesHtml = "", authorizeAssetId = "", requestAssetAuthorizationId = "", showQr = true, assetMovement = null
}){
  return `
    <div class="permit-pass-actions">
      <button class="secondary" data-action="${esc(volverAction)}">Volver</button>
      <button class="secondary" data-action="print">Imprimir</button>
      ${showQr ? `<button id="btnGuardarValePass" class="secondary" type="button">Guardar pase</button>
      <button id="btnCompartirValePass" class="secondary" type="button">Compartir QR</button>` : ""}
      ${requestAssetAuthorizationId ? `<button class="secondary" type="button" data-action="whatsappValeActivo" data-id="${esc(requestAssetAuthorizationId)}" title="Enviar solicitud por WhatsApp al autorizador">Solicitar autorización</button>` : ""}
      ${authorizeAssetId ? `<button class="ok" type="button" data-action="autorizarVale" data-id="${esc(authorizeAssetId)}">Autorizar</button>` : ""}
      ${assetMovement ? `<button class="ok" type="button" data-action="setValeStatus" data-id="${esc(assetMovement.id)}" data-status="${esc(assetMovement.status)}">${esc(assetMovement.label)}</button>` : ""}
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
        ${showQr ? `<div class="permit-qr-zone">
          <div class="permit-side"><div class="permit-icon">OK</div><div>${esc(leftSide)}</div><i></i></div>
          <div class="permit-qr-card"><div id="qrcode" class="permit-qr"></div><div class="permit-code"><span>${esc(String(payload).replace(/(.{4})/g, "$1 ").trim().toUpperCase())}</span><small>Codigo de verificacion</small></div></div>
          <div class="permit-side"><div class="permit-icon">QR</div><div>${esc(rightSide)}</div><i></i></div>
        </div>` : ""}
        ${signaturesHtml}
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
  currentView = "vale_qr";
  rememberModuleReturn(currentView);
  const v = valesActivos.find(x => String(x.id) === String(id));
  if(!v) return renderValesActivos();

  const payload = `VALE_ACTIVO:${String(v.id)}`;
  const folio = v.folio || v.id;
  const depto = v.departamento || "";
  const status = valeActivoDetailStatus(v);
  const pendiente = v.status === ValeStatus.PENDIENTE;
  const assetMovement = valeActivoMovement(v);
  const retorno = v.salidaSinRegreso === true ? "Salida sin regreso" : valePassDate(v.fechaRetorno) || "Sin fecha indicada";
  const shareText = [
    "Vale de salida de activo",
    `Folio: ${folio}`,
    `Solicitante: ${v.nombre || ""}`,
    `Departamento: ${depto}`,
    `Tipo de activo: ${v.tipoActivo || ""}`,
    `Descripción: ${v.descripcion || ""}`,
    v.noSerie ? `Número de serie: ${v.noSerie}` : "",
    v.codigoLote ? `Código / lote: ${v.codigoLote}` : "",
    `Motivo: ${v.motivo || ""}`,
    `Fecha: ${valePassDate(v.fecha)}`,
    `Retorno: ${retorno}`,
    `Estado: ${status}`,
    `Autoriza: ${v.autorizadorNombre || v.autorizadorEmail || ""}`
  ].filter(Boolean).join("\n");

  appEl.innerHTML = renderValePermisoPass({
    title:"Vale de activo",
    kindLabel:"Vale de activo",
    tipo:folio,
    payload,
    folio,
    personLabel:"Descripcion del activo",
    nombre:v.descripcion || "Vale de activo",
    dato1:v.noSerie ? `Numero de serie: ${v.noSerie}` : "",
    dato2:[v.tipoActivo ? `Tipo: ${v.tipoActivo}` : "", v.codigoLote ? `Código / lote: ${v.codigoLote}` : ""].filter(Boolean).join(" | "),
    roleLabel:"Solicitado por",
    rol:v.nombre || "",
    depto,
    factTypeLabel:"Motivo",
    tipoPermiso:v.motivo || "Salida de activo",
    fecha:valePassDate(v.fecha),
    fechaSub:`Retorno: ${retorno}`,
    autoriza:v.autorizadorNombre || v.autorizadorEmail || "",
    leftSide:status,
    rightSide:"Salida\nde activo",
    signaturesHtml:renderValeActivoFirmas(v, { collapsible:false }) + `<details class="vale-activo-signatures"><summary>Movimientos</summary>${renderKanbanMovementPanel(valeActivoHistoryEvents(v), false)}</details>`,
    showQr:Boolean(v.qrActivo),
    assetMovement,
    authorizeAssetId:pendiente && canCurrentUserAuthorizeValeActivo(v) ? String(v.id) : "",
    requestAssetAuthorizationId:pendiente ? String(v.id) : "",
    instrucciones:!v.qrActivo ? `${status}. QR desactivado.` : pendiente
      ? "Revisa los datos del activo antes de autorizar. El vale debe estar autorizado para registrar la salida."
      : "Presenta este vale en el acceso al salir. El activo debe coincidir con la descripción. Este vale es personal e intransferible.",
    volverAction:"valesActivos"
  });
  if(!v.qrActivo || !await loadFeatureDependencies("qr", "el código QR")) return;
  setupValePassActions({
    payload,
    folio,
    filename:`PERMISO-ACTIVO-${String(folio)}.png`,
    shareText
  });
}

async function enviarValeActivoWhatsApp(id){
  const v = valesActivos.find(row => String(row.id) === String(id));
  if(v?.status !== ValeStatus.PENDIENTE) return toast("Solicitud no disponible","El vale ya no está pendiente de autorización.","warn");
  const uid = v.autorizadorUid;
  let telefono = normalizarTelefonoWhatsApp(valeActivoAutorizadoresCache.find(u => String(u.uid || u.id) === String(uid))?.telefono);
  if(!telefono && uid){
    try{
      const perfil = await getDoc(doc(db, COL_USERS, String(uid)));
      telefono = normalizarTelefonoWhatsApp(perfil.data()?.telefono);
    }catch(error){
      console.warn(error);
      return toast("No se pudo consultar el teléfono","Revisa la conexión y los permisos antes de reintentar.","warn",4200);
    }
  }
  if(!telefono) return toast("Teléfono requerido","Registra el teléfono del autorizador en Usuarios para solicitar la autorización.","warn",4200);
  const mensaje = [
    `Hola ${v.autorizadorNombre || ""}, tienes un vale de activo pendiente de autorización.`,
    `Folio: ${v.folio || v.id}`,
    `Solicitante: ${v.nombre || ""}`,
    `Activo: ${[v.tipoActivo, v.descripcion].filter(Boolean).join(" · ")}`,
    `Motivo: ${v.motivo || ""}`,
    `Fecha: ${valePassDate(v.fecha)}`,
    `Retorno: ${v.salidaSinRegreso === true ? "Salida sin regreso" : valePassDate(v.fechaRetorno) || "Sin fecha indicada"}`,
    "",
    "Abrir Vales de activo: https://meredeitor.github.io/control-acceso/?abrir=vales_activos"
  ].join("\n");
  abrirWhatsAppInstalado(telefono, mensaje);
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
