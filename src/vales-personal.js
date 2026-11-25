async function renderValesPersonal(refresh=true){
  if(!requirePerm("ver_vales_personal","Tu rol no puede ver vales de personal.")) return;
  currentView = "vales_personal";
  if(registroManualPersonalActivo()) programarCierreRegistroManualPersonal();
  rememberModuleReturn(currentView);
  if(refresh){
    await syncValesPersonal(true);
    await normalizarValesSalidaSinRegreso();
    await marcarValesPersonalExcedidos();
  }
  if(refresh && hasPerm("crear_vale_personal")) await ensureValePersonalAutorizadores();

  const today = new Date();
  const term = valeSearchTerms.personal.trim().toLowerCase();
  const allList = valesPersonal
    .filter(v => {
      if(currentUser?.role === ROLES.SERVICIO_MEDICO) return isPermisoImss(v);
      if(![ROLES.JEFE, ROLES.JEFE_RESTRINGIDO, ROLES.JEFE_COMPRAS].includes(currentUser?.role)) return true;
      const currentUid = String(currentUser?.uid || "");
      const currentEmail = String(currentUser?.email || "").trim().toLowerCase();
      return (
        (v.autorizadorUid && String(v.autorizadorUid) === currentUid) ||
        (v.autorizadorEmail && String(v.autorizadorEmail).trim().toLowerCase() === currentEmail)
      );
    })
    .filter(v => {
      const ts = getValeDisplayTs(v);
      return typeof ts === "number" && isSameDay(ts, today);
    })
    .sort((a,b)=>(b.createdTs||0)-(a.createdTs||0));
  const list = !term ? allList : allList.filter(v =>
    [v.folio,v.nombreColaborador,v.nomina,v.departamento,v.tipoPermiso,v.autorizadorNombre,...integrantesValePersonal(v).flatMap(item => [item.nombre,item.nomina,item.departamento])]
      .join(" ").toLowerCase().includes(term)
  );
  const { generados, pendientes, fuera, regresoCancelado } = getValeCounts(list);
  const finalizadosKpi = regresoCancelado.filter(v => !v.canceladoTs).length;

  const col = (title, dotClass, items, stageKey) => `
    <div class="col provider-stage ${valePersonalMobileStatus === stageKey ? "active" : ""}" data-stage="${esc(stageKey)}">
      <div class="provider-stage-head"><span class="provider-stage-dot" aria-hidden="true"></span><span>${esc(title)}</span><span class="provider-stage-count">${items.length}</span></div>
      <div class="vale-personal-stage-list">
        ${items.length ? items.map(renderValePersonalCard).join("") : `<div class="provider-empty"><span class="provider-empty-icon" aria-hidden="true">${stageKey === "pendientes" ? "◷" : stageKey === "inicio" ? "▶" : stageKey === "fuera" ? "↗" : "✓"}</span><strong>Sin vales</strong><span>No hay registros en este estado.</span></div>`}
      </div>
    </div>
  `;

  const valesContent = `
    <div class="vale-personal-mobile-tabs" role="tablist" aria-label="Estado de vales de personal">
      ${[["pendientes","Por autorizar",pendientes.length],["inicio","Inicio",generados.length],["fuera","Fuera",fuera.length],["regreso","Finalizado",regresoCancelado.length]].map(([key,label,count])=>`<button class="vale-personal-mobile-tab ${valePersonalMobileStatus === key ? "active" : ""}" data-action="valePersonalMobileStage" data-stage="${key}" data-no-sb="true" role="tab" aria-selected="${valePersonalMobileStatus === key}">${label}<b>${count}</b></button>`).join("")}
    </div>
    <div class="grid vales-grid vale-personal-board">
      ${col("Pendientes por autorizar","warn",pendientes,"pendientes")}
      ${col("Inicio","info",generados,"inicio")}
      ${col("Fuera","bad",fuera,"fuera")}
      ${col("Regreso / Finalizado","ok",regresoCancelado,"regreso")}
    </div>
  `;

  appEl.innerHTML = `
    <section class="provider-dashboard-modern vale-dashboard-modern vale-personal-kanban">
      <div class="provider-dashboard-hero">
        <div class="provider-dashboard-hero-copy">
          <div class="provider-dashboard-hero-icon" aria-hidden="true">👤</div>
          <div>
            <h2>Vales de salida de personal</h2>
            <p>${[ROLES.JEFE, ROLES.JEFE_RESTRINGIDO].includes(currentUser?.role) ? "Mostrando únicamente los vales donde estás asignado como autorizador." : currentUser?.role === ROLES.SERVICIO_MEDICO ? "Permisos IMSS emitidos por Servicio Médico y controlados por horario." : "Control de permisos del día en curso, salida, regreso y tiempo autorizado."}</p>
          </div>
        </div>
        <div class="provider-dashboard-date"><span aria-hidden="true">●</span>${new Date().toLocaleDateString()}</div>
      </div>
      <div class="dashboard-toolbar vale-dashboard-head provider-summary-tools">
        <div class="vale-dashboard-summary">
          <div class="provider-summary" aria-label="Resumen de vales de personal">
            <div class="provider-summary-item"><span class="provider-summary-icon" aria-hidden="true">▣</span><span class="provider-summary-copy"><strong>${list.length}</strong><span>Vales de hoy</span></span></div>
            <div class="provider-summary-item bad"><span class="provider-summary-icon" aria-hidden="true">↗</span><span class="provider-summary-copy"><strong>${fuera.length}</strong><span>Fuera</span></span></div>
            <div class="provider-summary-item final"><span class="provider-summary-icon" aria-hidden="true">✓</span><span class="provider-summary-copy"><strong>${finalizadosKpi}</strong><span>Finalizados</span></span></div>
          </div>
        </div>
        <div class="vale-dashboard-tools">
          <input id="valeSearchPersonal" type="search" name="buscar_vales_personal_no_login" autocomplete="off" autocapitalize="none" spellcheck="false" data-lpignore="true" data-1p-ignore="true" value="${esc(valeSearchTerms.personal)}" placeholder="Buscar nombre, nómina, folio..." aria-label="Buscar vales de personal">
          <button class="secondary" data-action="refreshVales" data-tipo="personal">Actualizar</button>
          ${(hasPerm("registrar_salida_personal") || hasPerm("registrar_regreso_personal")) ? `<button class="${registroManualPersonalActivo() ? "danger" : "secondary"}" data-action="toggleRegistroManualPersonal">${registroManualPersonalActivo() ? "Ocultar registro manual" : "Habilitar registro manual"}</button>` : ""}
          ${hasPerm("escanear_qr") ? `<button class="secondary" data-action="scan" data-from="vales_personal">Escanear QR</button>` : ""}
        </div>
      </div>

      ${valesContent}
      <div class="vale-personal-mobile-navigation" aria-label="Navegación de vales de personal">
        ${hasPerm("escanear_qr") ? `<button class="vale-personal-mobile-scan" data-action="scan" data-from="vales_personal" aria-label="Escanear QR"><span aria-hidden="true">▦</span> Escanear QR</button>` : ""}
        <div class="vale-personal-nav-row">
          <button data-action="home" aria-label="Ir al menú principal"><span class="provider-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8"></path><path d="M5.5 9.5V21h13V9.5"></path><path d="M9.5 21v-7h5v7"></path></svg></span><small>Inicio</small></button>
          <button class="active" data-action="refreshVales" data-tipo="personal" data-no-sb="true" aria-label="Actualizar vales de personal"><span class="provider-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M6.1 8.2A7 7 0 0 1 18.7 7L20 12"></path><path d="M17.9 15.8A7 7 0 0 1 5.3 17L4 12"></path></svg></span><small>Actualizar</small></button>
          <button class="${valePersonalMobileStatus === "pendientes" ? "active" : ""}" data-action="valePersonalMobileStage" data-stage="pendientes" data-no-sb="true" aria-label="Mostrar pendientes por autorizar: ${pendientes.length}"><span class="provider-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-7 7v4l-2 3h18l-2-3v-4a7 7 0 0 0-7-7Z"></path><path d="M9.5 20h5"></path></svg></span><span class="vale-personal-nav-count">${pendientes.length}</span><small>Por autorizar</small></button>
        </div>
      </div>
    </section>

    ${renderValePersonalModal()}
  `;
  vigilarAutocompletadoEnBuscadoresVales();
}

function valePersonalIconAction(v, action, label, icon, tone="secondary", status=""){
  const paths = {
    qr:"M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM21 15v4h-2v2h-4",
    authorize:"M5 12l4 4L19 6",
    urgent:"M12 3l10 17H2zM12 9v4m0 3v.1",
    enter:"M14 4h6v16h-6M3 12h12m-5-5 5 5-5 5",
    exit:"M10 4H4v16h6m-1-8h12m-5-5 5 5-5 5",
    return:"M9 10l-5 5 5 5M4 15h11a5 5 0 0 0 0-10h-3",
    cancel:"M7 7l10 10M17 7 7 17M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0"
  };
  return `<button type="button" class="${tone}" data-action="${action}" data-id="${esc(v.id)}" ${status ? `data-status="${esc(status)}"` : ""} data-no-sb="true" title="${esc(label)}" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[icon]}"></path></svg></button>`;
}

function renderValePersonalCard(v){
  const esGrupal = esValePersonalGrupal(v);
  const estadoGrupo = esGrupal ? estadoIntegrantesValePersonal(v) : null;
  const autorizadoPor = v.autorizadoPorNombre || "";
  const autorizador = v.autorizadorNombre || v.autorizadorEmail || "";
  const usadoMin = calcValePersonalTiempo(v);
  const entradaMin = calcEntrada815Min(v);
  const esEntrada = isValePersonalEntrada(v);
  const esSalidaSinRegreso = isValePersonalSalidaSinRegreso(v);
  const esSinHorarioRegreso = isValePersonalSinHorarioRegreso(v);
  const excedido = isValePersonalExcedido(v);
  const esImss = isPermisoImss(v);
  const esSalidaImss = esImss && !esEntrada;
  const imssEstado = getPermisoImssQrState(v);
  const imssWindow = getPermisoImssWindow(v);
  const movimientoDesdeQr = currentView === "vale_personal_operacion";
  const mostrarRegistroManual = movimientoDesdeQr || registroManualPersonalActivo();
  const esFuturo = String(v.fecha || "") > todayISO();
  const tiempoTxt = usadoMin !== null ? formatMinutes(usadoMin) : "-";
  const autorizadoMin = parseTiempoAutorizadoMin(v.tiempoAutorizado);
  const excedenteMin = excedido && usadoMin !== null && autorizadoMin !== null ? Math.max(0, usadoMin-autorizadoMin) : 0;
  const limiteTxt = autorizadoMin === null ? esc(v.tiempoAutorizado || "-") : formatMinutes(autorizadoMin);
  const nombreColaborador = esGrupal ? `Vale grupal · ${estadoGrupo.total} integrantes` : (v.nombreColaborador || "Colaborador");
  const iniciales = nombreColaborador.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x.charAt(0)).join("").toUpperCase() || "VP";
  const estadoTexto = esSalidaSinRegreso && v.status === ValeStatus.REGRESO_CANCELADO ? "Finalizado" : valeStatusLabel(v.status);
  const estadoTone = v.status === ValeStatus.PENDIENTE ? "is-warn" : v.status === ValeStatus.FUERA ? "is-bad" : v.status === ValeStatus.REGRESO_CANCELADO ? "is-ok" : "";
  const tiempoPrincipal = esEntrada ? (entradaMin !== null ? formatMinutes(entradaMin) : "-") : `${tiempoTxt}${excedido ? " excedido" : ""}`;
  return `
    <div class="tarjeta history-card provider-visit-card vale-personal-card tipo-visitante ${excedido ? "vale-card-excedido" : ""}" data-action="verValePersonalQR" data-id="${esc(v.id)}">
      ${excedido ? `<div class="vale-overdue-banner">Tiempo excedido<small>Excedido por ${esc(String(excedenteMin))} min</small></div>` : ""}
      <div class="vale-personal-card-head">
        <span class="vale-personal-avatar" aria-hidden="true">${esc(iniciales)}</span>
        <span class="vale-personal-identity"><strong>${esc(nombreColaborador)}</strong><small>${esGrupal ? `Responsable: ${esc(v.nombreColaborador || "-")}` : `Nómina ${esc(v.nomina || "-")} · ${esc(v.departamento || "Departamento")}`}</small></span>
        <span class="vale-personal-status ${estadoTone}">${esc(estadoTexto)}</span>
      </div>
      <div class="vale-personal-folio">${esc(v.folio || v.id || "Sin folio")}${esFuturo ? ` · ${esc(valePassDate(v.fecha))}` : ""}</div>
      <div class="vale-personal-facts">
        <div class="vale-personal-fact"><small>Movimiento</small><b>${esc(valePersonalMovimientoLabel(v))}</b></div>
        <div class="vale-personal-fact"><small>Tiempo autorizado</small><b>${limiteTxt}</b></div>
        <div class="vale-personal-fact"><small>${esEntrada ? "Llegada vs 8:15" : "Tiempo registrado"}</small><b>${esc(tiempoPrincipal)}</b></div>
        <div class="vale-personal-fact"><small>Autoriza</small><b>${esc(autorizador || "Pendiente de asignar")}</b></div>
      </div>
      <div class="meta vale-card-details">
        ${esGrupal ? `<span class="pill"><span class="dot info"></span>Inicio: ${estadoGrupo.inicio} · Fuera: ${estadoGrupo.fuera} · Finalizados: ${estadoGrupo.finalizados}</span>
        <details style="width:100%;" onclick="event.stopPropagation()"><summary style="cursor:pointer;font-weight:800;">Ver integrantes</summary><div style="display:grid;gap:6px;margin-top:8px;">${v.integrantes.map(item => `<span class="pill" style="white-space:normal;"><span class="dot ${item.status === ValeStatus.REGRESO_CANCELADO ? "ok" : item.status === ValeStatus.FUERA ? "bad" : "info"}"></span><b>${esc(item.nombre)}</b> · Nómina ${esc(item.nomina)} · ${esc(valeStatusLabel(item.status))}${item.salidaTs ? ` · Salida ${esc(formatHoraTs(item.salidaTs))}` : ""}${item.regresoTs || item.llegadaTs ? ` · ${item.llegadaTs ? "Ingreso" : "Regreso"} ${esc(formatHoraTs(item.regresoTs || item.llegadaTs))}` : ""}</span>`).join("")}</div></details>` : ""}
        ${esFuturo ? `<span class="pill"><span class="dot info"></span>Programado</span>` : ""}
        ${esSalidaSinRegreso ? `<span class="pill"><span class="dot ${v.status === ValeStatus.REGRESO_CANCELADO ? "ok" : "warn"}"></span>Salida sin regreso${v.status === ValeStatus.REGRESO_CANCELADO ? " · finalizada" : ""}</span>` : ""}
        ${esSinHorarioRegreso ? `<span class="pill"><span class="dot ${v.status === ValeStatus.REGRESO_CANCELADO ? "ok" : "info"}"></span>Regreso sin horario límite${v.status === ValeStatus.FUERA ? " · tiempo en medición" : v.status === ValeStatus.REGRESO_CANCELADO ? " · regreso registrado" : ""}</span>` : ""}
        ${esSalidaImss ? `<span class="pill"><span class="dot ${imssEstado === "habilitado" || imssEstado === "regreso" ? "ok" : imssEstado === "anticipado" ? "warn" : "bad"}"></span>Salida programada: ${esc(formatHoraTs(imssWindow.salidaTs))} · ${imssEstado === "anticipado" ? "Aún no habilitado" : imssEstado === "habilitado" ? "QR habilitado" : imssEstado === "regreso" ? "Esperando regreso" : "Ventana vencida"}</span>` : ""}
        ${autorizadoPor ? `<span class="pill"><span class="dot ok"></span>Autorizado por: ${esc(autorizadoPor)}</span>` : ""}
        ${esEntrada ? `<span class="pill"><span class="dot info"></span>Entrada posterior a 8:15</span>` : ""}
      </div>
      <div class="row vale-actions">
        ${v.qrActivo && !esFuturo ? valePersonalIconAction(v,"verValePersonalQR","Ver QR","qr","secondary") : esFuturo ? `<span class="pill"><span class="dot warn"></span>QR habilitado el día del vale</span>` : `<span class="pill"><span class="dot bad"></span>QR desactivado</span>`}
        ${v.status === ValeStatus.PENDIENTE && canCurrentUserAuthorizeValePersonal(v) ? valePersonalIconAction(v,"autorizarValePersonal","Autorizar","authorize","ok") : ""}
        ${v.status === ValeStatus.PENDIENTE && hasPerm("autorizar_vale_personal_emergencia") && !isValePersonalEntrada(v) && !isPermisoImss(v) ? valePersonalIconAction(v,"autorizarValePersonalEmergencia","Autorizar por urgencia","urgent","danger") : ""}
        ${esGrupal && mostrarRegistroManual && v.autorizadoTs && estadoGrupo.inicio > 0 && hasPerm("registrar_salida_personal") ? (esEntrada
          ? valePersonalIconAction(v,"setValePersonalStatus","Registrar ingresos","enter","ok",ValeStatus.REGRESO_CANCELADO)
          : valePersonalIconAction(v,"setValePersonalStatus","Registrar salidas","exit","danger",ValeStatus.FUERA)) : ""}
        ${esGrupal && mostrarRegistroManual && estadoGrupo.fuera > 0 && hasPerm("registrar_regreso_personal") ? valePersonalIconAction(v,"setValePersonalStatus","Registrar regresos","return","ok",ValeStatus.REGRESO_CANCELADO) : ""}
        ${!esGrupal && mostrarRegistroManual && v.status === ValeStatus.GENERADO && v.autorizadoTs && hasPerm("registrar_salida_personal") ? (esEntrada
          ? valePersonalIconAction(v,"setValePersonalStatus","Registrar ingreso","enter","ok",ValeStatus.REGRESO_CANCELADO)
          : valePersonalIconAction(v,"setValePersonalStatus","Marcar salida","exit","danger",ValeStatus.FUERA)) : ""}
        ${!esGrupal && mostrarRegistroManual && v.status === ValeStatus.FUERA && hasPerm("registrar_regreso_personal") ? valePersonalIconAction(v,"setValePersonalStatus","Registrar regreso","return","ok",ValeStatus.REGRESO_CANCELADO) : ""}
        ${v.status !== ValeStatus.REGRESO_CANCELADO && (hasPerm("crear_vale_personal") || (isPermisoImss(v) && hasPerm("crear_permiso_imss"))) ? valePersonalIconAction(v,"cancelarValePersonal","Cancelar","cancel","secondary") : ""}
        ${excedido && !esGrupal ? `<button class="ok" data-action="alertaTiempoExcedidoWhatsApp" data-id="${esc(v.id)}" data-no-sb="true" aria-label="Avisar tiempo excedido por WhatsApp" title="Avisar tiempo excedido por WhatsApp"><svg aria-hidden="true" viewBox="0 0 32 32" width="18" height="18" fill="currentColor" focusable="false"><path d="M16.04 3.2A12.7 12.7 0 0 0 5.3 22.67L3.6 28.8l6.28-1.65a12.72 12.72 0 1 0 6.16-23.95Zm0 22.93c-1.93 0-3.82-.52-5.47-1.5l-.39-.23-3.72.98.99-3.62-.25-.37a10.2 10.2 0 1 1 8.84 4.74Zm5.6-7.64c-.3-.15-1.82-.9-2.1-1-.28-.1-.48-.15-.69.15-.2.3-.79 1-.97 1.2-.18.2-.36.23-.66.08-.3-.15-1.3-.48-2.47-1.53a9.2 9.2 0 0 1-1.7-2.12c-.18-.3-.02-.46.13-.61.14-.14.3-.36.46-.54.15-.18.2-.3.3-.51.1-.2.05-.38-.03-.54-.08-.15-.69-1.65-.94-2.26-.25-.6-.5-.52-.69-.53h-.58c-.2 0-.53.08-.81.38-.28.3-1.07 1.05-1.07 2.56s1.1 2.97 1.25 3.18c.15.2 2.16 3.3 5.24 4.63.73.32 1.3.5 1.75.65.74.23 1.4.2 1.93.12.59-.09 1.82-.74 2.08-1.46.25-.71.25-1.33.18-1.46-.08-.13-.28-.2-.59-.36Z"/></svg></button>` : ""}
        ${renderKanbanDetailsButton()}
      </div>
      ${renderKanbanMovementPanel(valeHistoryEvents(v))}
    </div>
  `;
}

async function renderProximosValesPersonal(refresh=true){
  if(!requirePerm("ver_vales_personal","Tu rol no puede ver vales de personal.")) return;
  currentView = "proximos_vales_personal";
  moduleReturnView = "proximos_vales_personal";
  if(refresh && navigator.onLine){
    try{
      const cloud = await cloudFetchProximosValesPersonal();
      valesPersonal = mergeById(valesPersonal, cloud);
      saveValesPersonalLocal();
    }catch(e){
      console.warn("No se pudieron cargar los próximos vales:", e);
      toast("Próximos vales","Se muestran los datos disponibles en este dispositivo.","warn",3400);
    }
  }
  const list = valesPersonal.filter(v => String(v.fecha || "") > todayISO()).filter(v => {
    if(currentUser?.role === ROLES.SERVICIO_MEDICO) return isPermisoImss(v);
    if(![ROLES.JEFE,ROLES.JEFE_RESTRINGIDO,ROLES.JEFE_COMPRAS].includes(currentUser?.role)) return true;
    const uid = String(currentUser?.uid || "");
    const email = String(currentUser?.email || "").trim().toLowerCase();
    return (v.autorizadorUid && String(v.autorizadorUid) === uid) || (v.autorizadorEmail && String(v.autorizadorEmail).trim().toLowerCase() === email);
  }).sort((a,b)=>String(a.fecha||"").localeCompare(String(b.fecha||"")) || Number(a.createdTs||0)-Number(b.createdTs||0));
  const groups = new Map();
  list.forEach(v => { const key=String(v.fecha||""); if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(v); });
  appEl.innerHTML = `
    <section class="provider-dashboard-modern vale-dashboard-modern">
      <div class="provider-dashboard-hero">
        <div class="provider-dashboard-hero-copy"><div class="provider-dashboard-hero-icon" aria-hidden="true">📅</div><div><h2>Próximos vales</h2><p>Vales de personal programados para fechas posteriores. Pueden autorizarse anticipadamente; el QR funcionará hasta el día indicado.</p></div></div>
        <div class="provider-dashboard-date"><span aria-hidden="true">●</span>${list.length} programados</div>
      </div>
      <div class="dashboard-toolbar vale-dashboard-head"><button class="secondary" data-action="refrescarProximosValesPersonal">Actualizar</button></div>
      ${list.length ? Array.from(groups.entries()).map(([fecha,items])=>`<section style="margin-top:18px;"><h3 style="margin:0 0 12px;">${esc(valePassDate(fecha))} · ${items.length} vale${items.length===1?"":"s"}</h3><div class="vale-history-grid">${items.map(renderValePersonalCard).join("")}</div></section>`).join("") : `<div class="card" style="margin-top:18px;color:var(--muted);">No hay vales programados para fechas posteriores.</div>`}
    </section>`;
}

function valeHistoryDateTime(ts){
  const n = Number(ts || 0);
  return n ? new Date(n).toLocaleString() : "-";
}

function valeHistoryEvents(v={}){
  const events = [];
  const push = (ts, title, detail="", tone="") => {
    const n = Number(ts || 0);
    if(n) events.push({ ts:n, title, detail, tone });
  };
  push(v.createdTs, "Vale creado", [v.createdByNombre, v.createdByEmail].filter(Boolean).join(" · ") || "Usuario no registrado");
  if(isPermisoImss(v) && !isValePersonalEntrada(v) && v.salidaProgramadaTs){
    const ventanaImss = getPermisoImssWindow(v);
    push(v.salidaProgramadaTs, "Salida IMSS programada", `Ventana: ${formatHoraTs(ventanaImss.inicioTs)} a ${formatHoraTs(ventanaImss.finTs)}`, "warn");
  }
  push(v.autorizadoTs, v.autorizacionEmergencia ? "Vale autorizado por emergencia" : (isPermisoImss(v) ? "Permiso emitido por Servicio Médico" : "Vale autorizado"), v.autorizacionEmergencia ? `${v.autorizacionEmergenciaPorNombre || v.autorizadoPorNombre || v.autorizadoPor || "Recepcionista"} · ${v.autorizacionEmergenciaMotivo || "Sin motivo"}` : [v.autorizadoPorNombre, v.autorizadoPor].filter(Boolean).join(" · "), v.autorizacionEmergencia ? "bad" : "ok");
  (Array.isArray(v.imssIntentos) ? v.imssIntentos : []).forEach(x => push(x.ts, x.tipo === "anticipado" ? "Intento antes del horario" : "Intento con permiso vencido", [x.guardiaNombre,x.guardiaEmail].filter(Boolean).join(" · "), "bad"));
  (Array.isArray(v.historialRegistroManual) ? v.historialRegistroManual : []).forEach(x => push(x.ts, "Registro manual habilitado", `${x.nombre || x.email || "Usuario"}${x.motivo ? ` · ${x.motivo}` : ""}`, "warn"));
  push(v.reautorizacionSolicitadaTs, "Reautorización solicitada", v.reautorizacionMotivo || "Tiempo autorizado excedido", "warn");
  push(v.reautorizacionAtendidaTs, "Reautorización aprobada", v.reautorizacionAtendidaPorNombre || v.reautorizacionAtendidaPor || "Autorizador", "ok");
  push(v.salidaTs, isValePersonalSalidaSinRegreso(v) ? "Salida sin regreso registrada · vale finalizado" : "Salida registrada", [v.salidaGuardiaNombre,v.salidaGuardiaEmail,v.imssSalidaGuardiaNombre,v.imssSalidaGuardiaEmail].filter(Boolean).join(" · ") || "Guardia no registrado", isValePersonalSalidaSinRegreso(v) ? "ok" : "warn");
  push(v.llegadaTs, "Ingreso registrado", v.regresoGuardiaNombre || v.regresoGuardiaEmail || v.registroIngresoPor || "Guardia no registrado", "ok");
  push(v.regresoTs, "Regreso registrado", v.regresoGuardiaNombre || v.regresoGuardiaEmail || "Guardia no registrado", "ok");
  if(esValePersonalGrupal(v)){
    const movimientos = new Map();
    const agregarMovimiento = (item, ts, tipo, title, tone) => {
      const n = Number(ts || 0);
      if(!n) return;
      const key = `${tipo}:${n}`;
      if(!movimientos.has(key)) movimientos.set(key,{ ts:n, title, tone, integrantes:[], registradoPor:"" });
      const movimiento = movimientos.get(key);
      movimiento.integrantes.push(item.nombre || `Nómina ${item.nomina || "-"}`);
      movimiento.registradoPor ||= item.movimientoPorNombre || item.movimientoPorEmail || "";
    };
    v.integrantes.forEach(item => {
      agregarMovimiento(item, item.salidaTs, "salida", isValePersonalSalidaSinRegreso(v) ? "Salida sin regreso registrada" : "Salida registrada", isValePersonalSalidaSinRegreso(v) ? "ok" : "warn");
      agregarMovimiento(item, item.llegadaTs, "ingreso", "Ingreso registrado", "ok");
      agregarMovimiento(item, item.regresoTs, "regreso", "Regreso registrado", "ok");
    });
    movimientos.forEach(movimiento => {
      const cantidad = movimiento.integrantes.length;
      const nombres = movimiento.integrantes.join(", ");
      const quien = movimiento.registradoPor ? ` · Registró: ${movimiento.registradoPor}` : "";
      push(movimiento.ts, `${movimiento.title} · ${cantidad} integrante${cantidad === 1 ? "" : "s"}`, `${nombres}${quien}`, movimiento.tone);
    });
  }
  push(v.canceladoTs, "Vale cancelado", v.canceladoPor || "Usuario no registrado", "bad");
  return events.sort((a,b)=>a.ts-b.ts);
}

function renderValePersonalHistoryCard(v){
  const events = valeHistoryEvents(v);
  const esEntrada = isValePersonalEntrada(v);
  const usado = esEntrada ? calcEntrada815Min(v) : calcValePersonalTiempo(v);
  const autorizadoMin = parseTiempoAutorizadoMin(v.tiempoAutorizado);
  const excedenteMin = usado !== null && autorizadoMin !== null ? Math.max(0, usado - autorizadoMin) : 0;
  const finalizado = v.status === ValeStatus.REGRESO_CANCELADO;
  return `
    <article class="vale-history-card">
      <div class="vale-history-card-head">
        <div>
          <h3>${esc(v.nombreColaborador || "Colaborador")}</h3>
          <small>${esc(v.folio || v.id || "-")} · Nómina ${esc(v.nomina || "-")} · ${esc(v.departamento || "-")}</small>
        </div>
        <span class="pill"><span class="dot ${valeStatusDot(v.status)}"></span>${esc(valeStatusLabel(v.status))}</span>
      </div>
      <div class="meta" style="margin-top:10px;">
        <span class="pill">${esc(valePersonalMovimientoLabel(v))}</span>
        <span class="pill">Autorizado: ${esc(v.tiempoAutorizado || "-")}</span>
        ${usado !== null ? `<span class="pill">${esEntrada ? "Retraso registrado" : "Tiempo real"}: ${esc(formatMinutes(usado))}</span>` : ""}
        ${esEntrada ? "" : `<span class="pill"><span class="dot ${excedenteMin > 0 ? "bad" : "ok"}"></span>Tiempo excedente: ${esc(String(excedenteMin))} min</span>`}
        ${v.ultimoRegistroOrigen ? `<span class="pill">Origen: ${esc(v.ultimoRegistroOrigen === "qr" ? "QR" : "Manual")}</span>` : ""}
      </div>
      <div class="vale-timeline">
        ${events.length ? events.map(ev => `
          <div class="vale-timeline-item ${ev.tone ? `is-${ev.tone}` : ""}">
            <div class="vale-timeline-title">${esc(ev.title)}</div>
            <div class="vale-timeline-meta">${esc(valeHistoryDateTime(ev.ts))}${ev.detail ? ` · ${esc(ev.detail)}` : ""}</div>
          </div>
        `).join("") : `<div class="vale-timeline-meta">Sin eventos registrados.</div>`}
      </div>
      ${v.observaciones ? `<div class="pill" style="display:block;margin-top:12px;white-space:normal;"><b>Observaciones:</b> ${esc(v.observaciones)}</div>` : ""}
      ${finalizado ? `<div style="margin-top:10px;color:var(--ok);font-size:12px;font-weight:900;">Recorrido finalizado</div>` : ""}
    </article>
  `;
}

async function renderHistorialValesPersonal(refresh=true){
  if(![ROLES.ADMIN, ROLES.GUARDIA].includes(currentUser?.role) || !hasPerm("ver_historial_vales_personal")){
    return toast("Acceso restringido", "El historial de vales solo está disponible para Guardia y Administrador.", "warn", 4200);
  }
  currentView = "historial_vales_personal";
  moduleReturnView = "historial_vales_personal";
  if(refresh && navigator.onLine){
    try{
      historialValesPersonalCache = await cloudFetchHistorialValesPersonal();
      valesPersonal = mergeById(valesPersonal, historialValesPersonalCache);
      saveValesPersonalLocal();
    }catch(e){
      console.warn("No se pudo cargar el historial de vales:", e);
      toast("Historial", "Se muestran los datos disponibles en este dispositivo.", "warn", 3200);
    }
  }
  if(!historialValesPersonalCache.length) historialValesPersonalCache = [...valesPersonal];
  const previous = {
    buscar: document.getElementById("vhBuscar")?.value || "",
    desde: document.getElementById("vhDesde")?.value || "",
    hasta: document.getElementById("vhHasta")?.value || "",
    estado: document.getElementById("vhEstado")?.value || ""
  };
  const term = previous.buscar.trim().toLowerCase();
  const desdeTs = previous.desde ? new Date(`${previous.desde}T00:00:00`).getTime() : 0;
  const hastaTs = previous.hasta ? new Date(`${previous.hasta}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
  const list = historialValesPersonalCache.filter(v => {
    const ts = Number(v.createdTs || getValeDisplayTs(v) || 0);
    const text = [v.folio,v.nombreColaborador,v.nomina,v.departamento,v.tipoPermiso,v.autorizadorNombre,v.createdByEmail].join(" ").toLowerCase();
    return (!term || text.includes(term)) && ts >= desdeTs && ts <= hastaTs && (!previous.estado || v.status === previous.estado);
  }).sort((a,b)=>Number(b.createdTs||0)-Number(a.createdTs||0));
  appEl.innerHTML = `
    <section class="provider-dashboard-modern">
      <div class="provider-dashboard-hero">
        <div class="provider-dashboard-hero-copy"><div class="provider-dashboard-hero-icon" aria-hidden="true">🕘</div><div><h2>Historial de vales</h2><p>Recorrido completo de los vales de personal, desde su creación hasta el regreso.</p></div></div>
        <div class="provider-dashboard-date"><span aria-hidden="true">●</span>${list.length} registros</div>
      </div>
      <div class="dashboard-toolbar" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">
        <input id="vhBuscar" value="${esc(previous.buscar)}" placeholder="Nombre, nómina, folio...">
        <input id="vhDesde" type="date" value="${esc(previous.desde)}" aria-label="Desde">
        <input id="vhHasta" type="date" value="${esc(previous.hasta)}" aria-label="Hasta">
        <select id="vhEstado"><option value="">Todos los estados</option>${Object.values(ValeStatus).map(s=>`<option value="${esc(s)}" ${previous.estado===s?"selected":""}>${esc(valeStatusLabel(s))}</option>`).join("")}</select>
        <button data-action="filtrarHistorialValesPersonal">Aplicar filtros</button>
        <button class="secondary" data-action="refrescarHistorialValesPersonal">Actualizar</button>
      </div>
      <div class="vale-history-grid">${list.length ? list.map(renderValePersonalHistoryCard).join("") : `<div class="card" style="color:var(--muted);">No hay vales que coincidan con los filtros.</div>`}</div>
    </section>
  `;
}

function valeActivoHistoryEvents(v={}){
  const events=[];
  const push=(ts,title,detail="",tone="")=>{ const n=Number(ts||0); if(n) events.push({ts:n,title,detail,tone}); };
  push(v.createdTs,"Vale creado",[v.createdByNombre,v.createdByName,v.createdByEmail].filter(Boolean).join(" · ")||"Usuario no registrado");
  push(v.editedTs,"Vale editado",v.editedByNombre || "Usuario no registrado");
  push(v.autorizadoTs,"Vale autorizado",[v.autorizadoPorNombre,v.autorizadoPor].filter(Boolean).join(" · ")||"Autorizador no registrado","ok");
  push(v.salidaTs,v.salidaSinRegreso === true ? "Salida sin regreso" : "Salida del activo",[v.salidaPorNombre,v.salidaPorEmail].filter(Boolean).join(" · ")||"Guardia no registrado","warn");
  push(v.regresoTs,"Regreso del activo",[v.regresoPorNombre,v.regresoPorEmail].filter(Boolean).join(" · ")||"Guardia no registrado","ok");
  push(v.canceladoTs,"Vale cancelado",v.canceladoPorNombre||v.canceladoPor||"Usuario no registrado","bad");
  return events.sort((a,b)=>a.ts-b.ts);
}

function renderValeActivoHistoryCard(v){
  const events=valeActivoHistoryEvents(v);
  return `<article class="vale-history-card">
    <div class="vale-history-card-head"><div><h3>${esc(v.nombre||v.descripcion||"Activo")}</h3><small>${esc(v.folio||v.id||"-")} · ${esc(v.departamento||"-")} · ${esc(v.tipoActivo||"Activo")}</small></div><span class="pill"><span class="dot ${valeStatusDot(v.status)}"></span>${esc(valeStatusLabel(v.status))}</span></div>
    <div class="meta" style="margin-top:10px;"><span class="pill">Fecha: ${esc(valePassDate(v.fecha))}</span>${v.noSerie?`<span class="pill">Serie: ${esc(v.noSerie)}</span>`:""}${v.autorizadorNombre?`<span class="pill">Autoriza: ${esc(v.autorizadorNombre)}</span>`:""}</div>
    <div class="vale-timeline">${events.length?events.map(ev=>`<div class="vale-timeline-item ${ev.tone?`is-${ev.tone}`:""}"><div class="vale-timeline-title">${esc(ev.title)}</div><div class="vale-timeline-meta">${esc(valeHistoryDateTime(ev.ts))}${ev.detail?` · ${esc(ev.detail)}`:""}</div></div>`).join(""):`<div class="vale-timeline-meta">Sin eventos registrados.</div>`}</div>
  </article>`;
}

async function renderHistorialValesActivos(refresh=true){
  if(![ROLES.ADMIN,ROLES.GUARDIA].includes(currentUser?.role)||!hasPerm("ver_historial_vales_activos")) return toast("Acceso restringido","El historial de activos solo está disponible para Guardia y Administrador.","warn",4200);
  currentView="historial_vales_activos"; moduleReturnView="historial_vales_activos";
  if(refresh&&navigator.onLine){
    try{ historialValesActivosCache=await cloudFetchHistorialValesActivos(); valesActivos=mergeById(valesActivos,historialValesActivosCache); saveValesActivosLocal(); }
    catch(e){ console.warn("No se pudo cargar el historial de activos:",e); toast("Historial de activos","Se muestran los datos disponibles en este dispositivo.","warn",3400); }
  }
  if(!historialValesActivosCache.length) historialValesActivosCache=[...valesActivos];
  const previous={buscar:document.getElementById("vhaBuscar")?.value||"",desde:document.getElementById("vhaDesde")?.value||"",hasta:document.getElementById("vhaHasta")?.value||"",estado:document.getElementById("vhaEstado")?.value||""};
  const term=previous.buscar.trim().toLowerCase(), desdeTs=previous.desde?new Date(`${previous.desde}T00:00:00`).getTime():0, hastaTs=previous.hasta?new Date(`${previous.hasta}T23:59:59`).getTime():Number.MAX_SAFE_INTEGER;
  const list=historialValesActivosCache.filter(v=>{const ts=Number(v.createdTs||0),text=[v.folio,v.nombre,v.descripcion,v.departamento,v.tipoActivo,v.noSerie].join(" ").toLowerCase();return(!term||text.includes(term))&&ts>=desdeTs&&ts<=hastaTs&&(!previous.estado||v.status===previous.estado);}).sort((a,b)=>Number(b.createdTs||0)-Number(a.createdTs||0));
  appEl.innerHTML=`<section class="provider-dashboard-modern"><div class="provider-dashboard-hero"><div class="provider-dashboard-hero-copy"><div class="provider-dashboard-hero-icon" aria-hidden="true">🧭</div><div><h2>Historial recorrido completo · Activos</h2><p>Seguimiento desde la creación y autorización hasta la salida, regreso o cancelación del activo.</p></div></div><div class="provider-dashboard-date"><span aria-hidden="true">●</span>${list.length} registros</div></div>
  <div class="dashboard-toolbar" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;"><input id="vhaBuscar" value="${esc(previous.buscar)}" placeholder="Folio, activo, serie..."><input id="vhaDesde" type="date" value="${esc(previous.desde)}"><input id="vhaHasta" type="date" value="${esc(previous.hasta)}"><select id="vhaEstado"><option value="">Todos los estados</option>${Object.values(ValeStatus).map(s=>`<option value="${esc(s)}" ${previous.estado===s?"selected":""}>${esc(valeStatusLabel(s))}</option>`).join("")}</select><button data-action="filtrarHistorialValesActivos">Aplicar filtros</button><button class="secondary" data-action="refrescarHistorialValesActivos">Actualizar</button></div>
  <div class="vale-history-grid">${list.length?list.map(renderValeActivoHistoryCard).join(""):`<div class="card" style="color:var(--muted);">No hay vales de activo que coincidan con los filtros.</div>`}</div></section>`;
}

let reporteNominasFiltros = {
  desde: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10),
  hasta: todayISO(),
  buscar: "",
  departamento: ""
};

function calcValeNominas(v={}){
  const esEntrada = isValePersonalEntrada(v);
  const esSalidaImss = isPermisoImss(v) && !esEntrada;
  const sinLimite = isValePersonalSinHorarioRegreso(v) || isValePersonalSalidaSinRegreso(v) || esSalidaImss;
  const tiempoRealMin = esEntrada ? calcEntrada815Min(v) : calcValePersonalTiempo(v);
  const tiempoAutorizadoMin = parseTiempoAutorizadoMin(v.tiempoAutorizado);
  const inicioTs = Number(v.salidaTs || 0);
  const finTs = Number(v.regresoTs || v.salidaSinRegresoFinalizadaTs || 0);
  const cruzaFecha = inicioTs && finTs && new Date(inicioTs).toDateString() !== new Date(finTs).toDateString();
  const duracionAtipica = !esEntrada && Number(tiempoRealMin || 0) > 12 * 60;
  let clasificacion = "informativo";
  let motivoCalculo = "Permiso sin tiempo límite; no genera descuento automático.";
  let retrasoEntradaMin = 0;
  let tiempoExcedenteMin = 0;
  let tiempoComputableMin = 0;

  if(esEntrada){
    clasificacion = "retardo";
    motivoCalculo = "Retardo calculado desde las 8:15 a. m.";
    retrasoEntradaMin = tiempoRealMin ?? 0;
    tiempoComputableMin = retrasoEntradaMin;
  }else if(sinLimite){
    motivoCalculo = esSalidaImss
      ? "Salida a consulta IMSS; duración informativa sin horario límite."
      : isValePersonalSalidaSinRegreso(v)
        ? "Salida sin regreso; registro informativo."
        : "Salida sin horario estimado de regreso; duración informativa.";
  }else if(cruzaFecha || duracionAtipica){
    clasificacion = "revision";
    motivoCalculo = cruzaFecha
      ? "El regreso fue registrado en una fecha diferente; requiere revisión."
      : "La duración supera 12 horas; requiere revisión.";
  }else if(tiempoAutorizadoMin !== null && tiempoRealMin !== null){
    clasificacion = "excedente";
    motivoCalculo = "Excedente de una salida con duración autorizada.";
    tiempoExcedenteMin = Math.max(0, tiempoRealMin - tiempoAutorizadoMin);
    tiempoComputableMin = tiempoExcedenteMin;
  }else{
    clasificacion = "revision";
    motivoCalculo = "No se pudo determinar una duración autorizada válida.";
  }

  return {
    tiempoRealMin:tiempoRealMin ?? 0,
    tiempoAutorizadoMin:tiempoAutorizadoMin ?? 0,
    tiempoExcedenteMin,
    retrasoEntradaMin,
    tiempoComputableMin,
    clasificacion,
    motivoCalculo
  };
}

function valesUnicosReporteNominas(list=[]){
  const { duplicates } = detectarDuplicadosValesPersonal(list);
  const duplicateIds = new Set(duplicates.map(v=>String(v.id || "")));
  return {
    list: list.filter(v=>!duplicateIds.has(String(v.id || ""))),
    duplicadosOmitidos: duplicateIds.size
  };
}

function expandirValesGrupalesReporteNominas(list=[]){
  return list.flatMap(v => {
    if(!esValePersonalGrupal(v)) return [v];
    return v.integrantes.map(item => ({
      ...v,
      id:`${v.id}:${item.id}`,
      valeGrupalId:v.id,
      esGrupal:true,
      integrantes:[],
      nombreColaborador:item.nombre,
      nomina:item.nomina,
      departamento:item.departamento,
      colaboradorUid:item.colaboradorUid || "",
      colaboradorRole:item.colaboradorRole || "",
      status:item.status,
      salidaTs:item.salidaTs || null,
      regresoTs:item.regresoTs || null,
      llegadaTs:item.llegadaTs || null,
      canceladoTs:item.canceladoTs || null,
      salidaSinRegresoFinalizadaTs:item.salidaSinRegresoFinalizadaTs || null
    }));
  });
}

async function renderReporteNominas(refresh=true){
  if(currentUser?.role !== ROLES.ADMIN || !hasPerm("ver_reporte_nominas")){
    return toast("Acceso restringido", "El Reporte de Nóminas es exclusivo para Administrador.", "warn", 4200);
  }
  currentView = "reporte_nominas";
  moduleReturnView = "reporte_nominas";
  if(refresh && navigator.onLine){
    try{
      reporteNominasCache = await cloudFetchReporteNominas(reporteNominasFiltros.desde, reporteNominasFiltros.hasta);
      valesPersonal = mergeById(valesPersonal, reporteNominasCache);
      saveValesPersonalLocal();
    }catch(e){
      console.warn("No se pudo cargar el reporte de nóminas:", e);
      toast("Reporte de Nóminas", "Se muestran los datos disponibles en este dispositivo.", "warn", 3400);
    }
  }
  if(!reporteNominasCache.length) reporteNominasCache = [...valesPersonal];
  const desdeTs = reporteNominasFiltros.desde ? new Date(`${reporteNominasFiltros.desde}T00:00:00`).getTime() : 0;
  const hastaTs = reporteNominasFiltros.hasta ? new Date(`${reporteNominasFiltros.hasta}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
  const buscar = reporteNominasFiltros.buscar.trim().toLowerCase();
  const reporteExpandido = expandirValesGrupalesReporteNominas(reporteNominasCache);
  const { list:reporteSinDuplicados, duplicadosOmitidos } = valesUnicosReporteNominas(reporteExpandido);
  const departamentos = Array.from(new Set(reporteSinDuplicados.map(v=>String(v.departamento||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const coincideFiltros = v => {
    const fechaTs = v.fecha ? new Date(`${v.fecha}T12:00:00`).getTime() : 0;
    const ts = Number(fechaTs || v.regresoTs || v.llegadaTs || v.createdTs || 0);
    const text = [v.nomina,v.nombreColaborador,v.folio].join(" ").toLowerCase();
    return ts >= desdeTs && ts <= hastaTs && (!buscar || text.includes(buscar)) && (!reporteNominasFiltros.departamento || v.departamento === reporteNominasFiltros.departamento);
  };
  const filtrados = reporteSinDuplicados.filter(coincideFiltros);
  const detalle = filtrados.filter(v => {
    const terminado = Boolean(v.regresoTs || v.llegadaTs || v.salidaSinRegresoFinalizadaTs) && !v.canceladoTs;
    return terminado;
  }).map(v => ({ ...v, ...calcValeNominas(v) })).sort((a,b)=>Number(b.regresoTs||b.llegadaTs||b.salidaSinRegresoFinalizadaTs||0)-Number(a.regresoTs||a.llegadaTs||a.salidaSinRegresoFinalizadaTs||0));
  const pendientesSinRegreso = filtrados.filter(v => v.status === ValeStatus.FUERA && v.salidaTs && !v.regresoTs);

  const grouped = new Map();
  detalle.forEach(v => {
    const key = String(v.nomina || v.nombreColaborador || "SIN-NOMINA").trim().toLowerCase();
    if(!grouped.has(key)) grouped.set(key, { nomina:v.nomina||"-", nombre:v.nombreColaborador||"-", departamento:v.departamento||"-", permisos:0, tiempoAutorizadoMin:0, tiempoRealMin:0, tiempoExcedenteMin:0, retrasoEntradaMin:0, tiempoComputableMin:0, informativos:0, revision:0 });
    const row = grouped.get(key);
    row.permisos += 1;
    row.tiempoAutorizadoMin += v.tiempoAutorizadoMin;
    row.tiempoRealMin += v.tiempoRealMin;
    row.tiempoExcedenteMin += v.tiempoExcedenteMin;
    row.retrasoEntradaMin += v.retrasoEntradaMin;
    row.tiempoComputableMin += v.tiempoComputableMin;
    if(v.clasificacion === "informativo") row.informativos += 1;
    if(v.clasificacion === "revision") row.revision += 1;
  });
  const resumen = Array.from(grouped.values()).sort((a,b)=>b.tiempoComputableMin-a.tiempoComputableMin || a.nombre.localeCompare(b.nombre));
  const totalExcedente = resumen.reduce((sum,r)=>sum+r.tiempoExcedenteMin,0);
  const totalRetardo = resumen.reduce((sum,r)=>sum+r.retrasoEntradaMin,0);
  const totalComputable = totalExcedente + totalRetardo;
  const requierenRevision = detalle.filter(v=>v.clasificacion === "revision").length;
  const informativos = detalle.filter(v=>v.clasificacion === "informativo").length;
  window.__reporteNominas = { resumen, detalle, pendientesSinRegreso, duplicadosOmitidos, filtros:{...reporteNominasFiltros} };

  appEl.innerHTML = `
    <section class="provider-dashboard-modern">
      <div class="provider-dashboard-hero">
        <div class="provider-dashboard-hero-copy"><div class="provider-dashboard-hero-icon" aria-hidden="true">🧾</div><div><h2>Reporte para Nóminas</h2><p>Separa retardos, excedentes, permisos informativos y registros que requieren revisión. No calcula importes monetarios.</p></div></div>
        <div class="provider-dashboard-date"><span aria-hidden="true">●</span>${esc(String(totalComputable))} min a cobrar</div>
      </div>
      <div class="dashboard-toolbar" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">
        <input id="rnDesde" type="date" value="${esc(reporteNominasFiltros.desde)}" aria-label="Desde">
        <input id="rnHasta" type="date" value="${esc(reporteNominasFiltros.hasta)}" aria-label="Hasta">
        <input id="rnBuscar" value="${esc(reporteNominasFiltros.buscar)}" placeholder="Nómina, nombre o folio">
        <select id="rnDepartamento"><option value="">Todos los departamentos</option>${departamentos.map(d=>`<option ${reporteNominasFiltros.departamento===d?"selected":""}>${esc(d)}</option>`).join("")}</select>
        <button data-action="aplicarReporteNominas">Aplicar</button>
        <button class="secondary" data-action="actualizarReporteNominas">Actualizar</button>
        <button class="ok" data-action="exportarReporteNominas">Exportar Excel</button>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
        <div class="card"><div class="big">${totalExcedente}</div><small>Excedente de salidas</small></div>
        <div class="card"><div class="big">${totalRetardo}</div><small>Retardo de entradas</small></div>
        <div class="card"><div class="big">${informativos}</div><small>Permisos informativos</small></div>
        <div class="card"><div class="big">${requierenRevision}</div><small>Requieren revisión</small></div>
        <div class="card"><div class="big">${pendientesSinRegreso.length}</div><small>Pendientes sin regreso</small></div>
        <div class="card"><div class="big">${duplicadosOmitidos}</div><small>Duplicados omitidos</small></div>
      </div>
      <div class="card">
        <h3 style="margin-top:0;">Resumen por colaborador</h3>
        <div class="users-table-scroll"><table class="table"><thead><tr><th>Nómina</th><th>Colaborador</th><th>Departamento</th><th>Permisos</th><th>Entrada a cobrar</th><th>Salida a cobrar</th><th>Total a cobrar</th><th>Informativos</th><th>Revisión</th></tr></thead><tbody>
          ${resumen.length ? resumen.map(r=>`<tr><td><b>${esc(r.nomina)}</b></td><td>${esc(r.nombre)}</td><td>${esc(r.departamento)}</td><td>${r.permisos}</td><td>${r.retrasoEntradaMin} min</td><td>${r.tiempoExcedenteMin} min</td><td><span class="pill"><span class="dot ${r.tiempoComputableMin>0?"bad":"ok"}"></span><b>${r.tiempoComputableMin} min</b></span></td><td>${r.informativos}</td><td>${r.revision}</td></tr>`).join("") : `<tr><td colspan="9">Sin permisos finalizados en el periodo.</td></tr>`}
        </tbody></table></div>
      </div>
      <div class="card">
        <h3 style="margin-top:0;">Detalle de permisos</h3>
        <div class="users-table-scroll"><table class="table"><thead><tr><th>Fecha</th><th>Nómina</th><th>Colaborador</th><th>Folio</th><th>Movimiento</th><th>Salida</th><th>Regreso/Entrada</th><th>Tiempo real</th><th>Clasificación</th><th>Min. a cobrar</th><th>Observación</th></tr></thead><tbody>
          ${detalle.length ? detalle.map(v=>`<tr><td>${esc(v.fecha||valeHistoryDateTime(v.createdTs))}</td><td>${esc(v.nomina||"-")}</td><td>${esc(v.nombreColaborador||"-")}</td><td>${esc(v.folio||v.id||"-")}</td><td>${esc(valePersonalMovimientoLabel(v))}</td><td>${esc(valeHistoryDateTime(v.salidaTs))}</td><td>${esc(valeHistoryDateTime(v.regresoTs||v.llegadaTs||v.salidaSinRegresoFinalizadaTs))}</td><td>${v.tiempoRealMin} min</td><td><span class="pill"><span class="dot ${v.clasificacion==="revision"?"warn":v.tiempoComputableMin>0?"bad":"ok"}"></span>${esc(v.clasificacion)}</span></td><td><b>${v.tiempoComputableMin} min</b></td><td>${esc(v.motivoCalculo)}</td></tr>`).join("") : `<tr><td colspan="11">Sin detalle para mostrar.</td></tr>`}
        </tbody></table></div>
      </div>
      ${pendientesSinRegreso.length ? `<div class="card"><h3 style="margin-top:0;">Pendientes sin regreso — no contabilizados</h3><div class="users-table-scroll"><table class="table"><thead><tr><th>Fecha</th><th>Nómina</th><th>Colaborador</th><th>Folio</th><th>Movimiento</th><th>Salida</th></tr></thead><tbody>${pendientesSinRegreso.map(v=>`<tr><td>${esc(v.fecha||"-")}</td><td>${esc(v.nomina||"-")}</td><td>${esc(v.nombreColaborador||"-")}</td><td>${esc(v.folio||v.id||"-")}</td><td>${esc(valePersonalMovimientoLabel(v))}</td><td>${esc(valeHistoryDateTime(v.salidaTs))}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
    </section>`;
}

function aplicarReporteNominas(){
  reporteNominasFiltros = {
    desde: document.getElementById("rnDesde")?.value || "",
    hasta: document.getElementById("rnHasta")?.value || "",
    buscar: document.getElementById("rnBuscar")?.value || "",
    departamento: document.getElementById("rnDepartamento")?.value || ""
  };
  return renderReporteNominas(true);
}

async function exportarReporteNominas(){
  if(currentUser?.role !== ROLES.ADMIN) return;
  const rep = window.__reporteNominas || { resumen:[], detalle:[], filtros:{} };
  if(!rep.detalle.length) return toast("Reporte de Nóminas", "No hay datos para exportar.", "warn", 2800);
  if(!await loadFeatureDependencies("excel", "la exportación de Excel")) return;
  const resumenRows = rep.resumen.map(r=>({"No. nómina":r.nomina,"Colaborador":r.nombre,"Departamento":r.departamento,"Permisos":r.permisos,"Entrada a cobrar (min)":r.retrasoEntradaMin,"Salida a cobrar (min)":r.tiempoExcedenteMin,"Total a cobrar (min)":r.tiempoComputableMin,"Informativos":r.informativos,"Requieren revisión":r.revision}));
  const detalleRows = rep.detalle.map(v=>({"Fecha":v.fecha||"","No. nómina":v.nomina||"","Colaborador":v.nombreColaborador||"","Departamento":v.departamento||"","Folio":v.folio||v.id||"","Movimiento":valePersonalMovimientoLabel(v),"Salida":valeHistoryDateTime(v.salidaTs),"Regreso / Entrada":valeHistoryDateTime(v.regresoTs||v.llegadaTs||v.salidaSinRegresoFinalizadaTs),"Tiempo autorizado":v.tiempoAutorizado||"","Minutos reales":v.tiempoRealMin,"Clasificación":v.clasificacion,"Minutos a cobrar":v.tiempoComputableMin,"Observación":v.motivoCalculo,"Autorizó":v.autorizadoPorNombre||v.autorizadorNombre||v.autorizadoPor||""}));
  const pendientesRows = (rep.pendientesSinRegreso||[]).map(v=>({"Fecha":v.fecha||"","No. nómina":v.nomina||"","Colaborador":v.nombreColaborador||"","Departamento":v.departamento||"","Folio":v.folio||v.id||"","Movimiento":valePersonalMovimientoLabel(v),"Salida":valeHistoryDateTime(v.salidaTs),"Observación":"Pendiente sin regreso; no contabilizado"}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows), "Resumen");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleRows), "Detalle");
  if(pendientesRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendientesRows), "Sin regreso");
  XLSX.writeFile(wb, `reporte_nominas_${rep.filtros.desde||"inicio"}_${rep.filtros.hasta||"hoy"}.xlsx`);
  toast("Reporte de Nóminas", "Archivo Excel generado.", "ok", 2400);
}

async function renderBitacoraGuardia(fecha = todayISO()){
  if(!requirePerm("ver_bitacora_guardia","Solo ADMIN y GUARDIA pueden ver la bitácora.")) return;
  currentView = "bitacora_guardia";
  rememberModuleReturn(currentView);
  try{ setActiveSb("bitacora_guardia"); }catch{}
  await syncBitacora(fecha);

  const entries = bitacoraGuardia
    .filter(x => x.fecha === fecha && !x.eliminado)
    .sort((a,b)=>(b.createdTs||0)-(a.createdTs||0));

  appEl.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:flex-start;">
        <div>
          <h2 style="margin:0 0 4px;">Bitácora diaria de novedades</h2>
          <div style="color:var(--muted);font-size:12px;">Visible solo para ADMIN y GUARDIA.</div>
        </div>
        <div class="row">
          <input id="bitacoraFecha" type="date" value="${esc(fecha)}" style="max-width:180px;">
          ${hasPerm("escanear_qr") ? `<button class="secondary" data-action="scan" data-from="bitacora_guardia">Escanear QR</button>` : ""}
        </div>
      </div>

      <div class="divider"></div>

      ${hasPerm("crear_bitacora_guardia") ? `
        <div class="tarjeta history-card">
          <strong>Guardia que registra</strong>
          <div style="height:8px;"></div>
          ${rondineroGuardiaCred ? `
            <div class="pill"><span class="dot ok"></span>${esc(rondineroGuardiaCred.nombre)}</div>
            <div class="row" style="margin-top:10px;">
              <button class="secondary" data-action="bitacoraScanGuardia">Cambiar guardia</button>
              <button class="secondary" data-action="bitacoraClearGuardia">Quitar guardia</button>
            </div>
          ` : `
            <div style="color:var(--muted);font-size:12px;">Escanea la credencial QR del guardia antes de guardar novedades.</div>
            <div class="row" style="margin-top:10px;">
              <button data-action="bitacoraScanGuardia">Escanear credencial de guardia</button>
            </div>
          `}
        </div>
        <div style="height:12px;"></div>
        <label>Novedad *</label>
        <textarea id="bitacoraTexto" rows="4" placeholder="Ej. Incidencias, rondines, pendientes, observaciones del turno..."></textarea>
        <div class="row" style="margin-top:10px;">
          <button data-action="guardarBitacora" ${rondineroGuardiaCred ? "" : "disabled"}>Guardar novedad</button>
        </div>
        <div class="divider"></div>
      ` : ""}

      <div class="row" style="justify-content:space-between;">
        <h3 style="margin:0;">Novedades del día</h3>
        <span class="pill"><span class="dot info"></span>${entries.length} registros</span>
      </div>
      <div style="height:10px;"></div>

      <div class="dashboard-pending-list">
        ${entries.length ? entries.map(entry => `
          <div class="tarjeta history-card">
            <strong>${esc(entry.titulo || "Novedad")}</strong>
            <small>${esc(new Date(entry.createdTs || Date.now()).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}))} • ${esc(entry.autorNombre || entry.autorEmail || "Guardia")}</small>
            <div style="margin-top:8px;color:var(--text);white-space:pre-wrap;">${esc(entry.texto || "")}</div>
          </div>
        `).join("") : `<div style="color:var(--muted);font-size:12px;">Sin novedades registradas para este día.</div>`}
      </div>
    </div>
  `;

  document.getElementById("bitacoraFecha")?.addEventListener("change", async (e) => {
    await renderBitacoraGuardia(e.target.value || todayISO());
  });
}

async function guardarBitacora(){
  if(!requirePerm("crear_bitacora_guardia","Solo GUARDIA y ADMIN pueden registrar novedades.")) return;
  const fecha = document.getElementById("bitacoraFecha")?.value || todayISO();
  const texto = document.getElementById("bitacoraTexto")?.value.trim() || "";
  if(!rondineroGuardiaCred?.uid){
    toast("Guardia requerido","Escanea la credencial del guardia antes de guardar.","warn",3200);
    return;
  }
  if(!texto){
    toast("Campo obligatorio","Escribe la novedad antes de guardar.","warn",2600);
    return;
  }

  const entry = {
    id: `BG-${Date.now()}`,
    fecha,
    titulo: "Novedad",
    texto,
    autorUid: rondineroGuardiaCred.uid,
    autorEmail: rondineroGuardiaCred.email || "",
    autorNombre: rondineroGuardiaCred.nombre || "Guardia",
    operadorUid: currentUser?.uid || "",
    operadorEmail: currentUser?.email || "",
    operadorNombre: currentUser?.nombre || currentUser?.email || "Tablet",
    createdTs: Date.now(),
    updatedTs: Date.now()
  };

  bitacoraGuardia.unshift(entry);
  saveBitacoraLocal();
  if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
    try{ await cloudUpsertBitacora(entry); }catch(e){ console.warn(e); }
  }
  toast("Bitácora","Novedad guardada.","ok",2200);
  await renderBitacoraGuardia(fecha);
}
