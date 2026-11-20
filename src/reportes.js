async function exportEvaluacionProveedoresExcel(){
  if(!requirePerm("exportar_excel", "No tienes permiso para exportar.")) return;
  const rep = window.__repEvalProveedores || { rows: [] };
  const rows = rep.rows || [];
  if(!rows.length){ toast("Evaluación", "No hay datos para exportar. Presiona Aplicar primero.", "warn"); return; }
  if(!await loadFeatureDependencies("excel", "la exportación de Excel")) return;

  const headers = ["Clase","Score","Proveedor","Empresa","Citas","Llegadas","Asistencia %","Puntualidad %","A tiempo","Tardes","Tardes graves","Prom. min tarde","No asistieron","Incidencias calidad","Rechazos calidad","Docs incompletos","Incidencias salida","Motivos"];
  const body = rows.map(r => [r.clase,r.score,r.proveedor,r.empresa,r.total,r.llegadas,r.pctAsistencia,r.pctPuntualidad,r.aTiempo,r.tardes,r.tardesGraves,r.promTarde,r.noShow,r.incidenciasCalidad,r.rechazos,r.docsIncompletos,r.incidenciasSalida,r.motivos.join(" | ")]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Evaluacion proveedores");
  XLSX.writeFile(wb, `evaluacion_proveedores_${rep.from || ""}_${rep.to || ""}.xlsx`);
  toast("Excel", "Evaluación de proveedores exportada.", "ok", 2200);
}
async function renderReporteEncuestaVisitantes(){
  if(![ROLES.ADMIN,ROLES.RECEPCIONISTA].includes(currentUser?.role)){toast("Acceso denegado","Sólo Administrador o Recepcionista puede consultar este reporte.","bad",3600);return renderModuleHome();}
  currentView="reporte_encuesta_visitantes";
  const today=new Date();
  const monthStart=new Date(today.getFullYear(),today.getMonth(),1);
  const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  appEl.innerHTML=`<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start;"><div><h2 style="margin:0 0 4px;">Encuesta de servicio de recepción</h2><div class="muted">Resultados generados en Control de Accesos; no incluye información histórica de la app anterior.</div></div><button class="secondary" data-action="home">Volver</button></div><div class="divider"></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-items:end;"><div><label>Desde</label><input id="surveyReportFrom" type="date" value="${dateKey(monthStart)}"></div><div><label>Hasta</label><input id="surveyReportTo" type="date" value="${dateKey(today)}"></div><div><button id="surveyReportLoad">Calcular reporte</button></div></div><div class="divider"></div><div id="surveyReportResults" class="muted">Calculando resultados…</div></div>`;
  document.getElementById("surveyReportLoad").onclick=cargarReporteEncuestaVisitantes;
  await cargarReporteEncuestaVisitantes();
}

async function cloudFetchEncuestasVisitantesByRange(fromTs,toTs){
  const snap=await getDocs(query(collection(db,COL_VISITANTES),where("salidaTs",">=",fromTs),where("salidaTs","<=",toTs),orderBy("salidaTs","asc"),limit(1000)));
  const rows=[];snap.forEach(d=>rows.push({id:d.id,...d.data()}));return rows;
}

async function cargarReporteEncuestaVisitantes(){
  const box=document.getElementById("surveyReportResults");if(!box)return;
  const from=document.getElementById("surveyReportFrom")?.value,to=document.getElementById("surveyReportTo")?.value;
  if(!from||!to){box.textContent="Selecciona ambas fechas.";return;}
  box.innerHTML=`<div class="muted">Consultando encuestas…</div>`;
  try{
    const fromTs=new Date(from+"T00:00:00").getTime(),toTs=new Date(to+"T23:59:59.999").getTime();
    let rows=visitas.filter(v=>{const ts=Number(v.salidaTs||v.fechaHoraTs||0);return ts>=fromTs&&ts<=toTs;});
    if(navigator.onLine){const cloud=await cloudFetchEncuestasVisitantesByRange(fromTs,toTs);visitas=mergeById(visitas,cloud);saveVisitasLocal();rows=cloud;}
    const offered=rows.filter(v=>isVisitante(v)&&v.encuestaProgramada===true);
    const answered=offered.filter(v=>Number(v.encuestaCalificacion)>=1&&Number(v.encuestaCalificacion)<=5);
    const ratings=answered.map(v=>Number(v.encuestaCalificacion));
    const average=ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:0;
    const serviceIndex=ratings.length?Math.round(((average-1)/4)*100):0;
    const participation=offered.length?Math.round((answered.length/offered.length)*100):0;
    const counts=[1,2,3,4,5].map(n=>ratings.filter(r=>r===n).length);
    const labels=["Muy malo","Malo","Regular","Bueno","Excelente"],emojis=["😡","🙁","😐","🙂","😄"];
    const maxCount=Math.max(1,...counts);
    box.innerHTML=`<div class="reports-kpi-grid"><div class="card report-kpi-card"><h3>Índice de servicio</h3><div style="font-size:30px;font-weight:900;color:${serviceIndex>=90?'var(--ok)':serviceIndex>=75?'var(--warn)':'var(--bad)'};">${serviceIndex}%</div></div><div class="card report-kpi-card"><h3>Contestadas</h3><div style="font-size:30px;font-weight:900;">${answered.length}</div></div><div class="card report-kpi-card"><h3>Presentadas</h3><div style="font-size:30px;font-weight:900;">${offered.length}</div></div><div class="card report-kpi-card"><h3>Participación</h3><div style="font-size:30px;font-weight:900;">${participation}%</div></div></div><div class="divider"></div><div class="card"><h3 style="margin-top:0;">Distribución de calificaciones</h3>${counts.map((count,i)=>`<div style="display:grid;grid-template-columns:minmax(110px,170px) 1fr 40px;gap:10px;align-items:center;margin:10px 0;"><b>${emojis[i]} ${labels[i]}</b><div style="height:18px;background:var(--surface-soft,#edf3fb);border-radius:999px;overflow:hidden;"><div style="height:100%;width:${Math.round(count/maxCount*100)}%;background:${['#dc2626','#ea580c','#d97706','#16a34a','#15803d'][i]};border-radius:999px;"></div></div><b>${count}</b></div>`).join("")}</div><div class="divider"></div><div style="overflow:auto;"><table class="table"><thead><tr><th>Fecha de salida</th><th>Visitante</th><th>Empresa</th><th>Calificación</th><th>Estado</th></tr></thead><tbody>${offered.length?offered.sort((a,b)=>Number(b.salidaTs||0)-Number(a.salidaTs||0)).map(v=>`<tr><td>${esc(fmt(v.salidaTs))}</td><td>${esc(v.nombreVisitante||v.nombre||'-')}</td><td>${esc(v.empresa||'-')}</td><td>${v.encuestaCalificacion?`${emojis[Number(v.encuestaCalificacion)-1]} ${esc(labels[Number(v.encuestaCalificacion)-1])}`:'—'}</td><td>${esc(v.encuestaEstado||'pendiente')}</td></tr>`).join(''):`<tr><td colspan="5">Sin encuestas en el periodo.</td></tr>`}</tbody></table></div>`;
  }catch(error){console.error(error);box.innerHTML=`<div class="pill bad" style="white-space:normal;">No se pudo calcular el reporte. Revisa conexión, reglas e índices de Firebase.</div>`;}
}

async function renderReportes(){
  if(!hasPerm("ver_reportes")){
    toast("Acceso denegado", "No tienes permiso para ver reportes.", "bad");
    return;
  }
  if(!await loadFeatureDependencies("charts", "las gráficas de reportes")) return renderModuleHome();
  currentView = "reportes";

  const todayISO = new Date().toISOString().slice(0,10);
  const monthStartISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);

  // ⚙️ tolerancia para puntualidad
  const LATE_GRACE_MIN = 10;

  function _safeSetText(id, val){
    const el = document.getElementById(id);
    if(el) el.textContent = val;
  }
  function _safeSetColor(id, cssVar){
    const el = document.getElementById(id);
    if(el) el.style.color = cssVar;
  }

  function _fmtDateTime(ts){
    return typeof ts === "number" ? new Date(ts).toLocaleString() : "-";
  }

  function _openLateProvidersDialog(rows){
    const dialog = document.getElementById("lateProvidersDialog");
    const tbody = document.getElementById("lateProvidersBody");
    const total = document.getElementById("lateProvidersCount");
    if(!dialog || !tbody || !total) return;

    total.textContent = String(rows.length);
    tbody.innerHTML = rows.length
      ? rows.map(v => `
          <tr>
            <td>${esc(v.proveedor || "-")}</td>
            <td>${esc(v.empresa || "-")}</td>
            <td>${esc(v.area || "-")}</td>
            <td>${esc(_fmtDateTime(v.fechaHoraTs))}</td>
            <td>${esc(_fmtDateTime(v.llegadaTs))}</td>
            <td>${esc(Math.round((v.llegadaTs - v.fechaHoraTs) / 60000))} min</td>
          </tr>
        `).join("")
      : `<tr><td colspan="6" style="text-align:center;color:var(--muted);">No hay proveedores tardios en el rango seleccionado.</td></tr>`;

    if(typeof dialog.showModal === "function"){
      dialog.showModal();
    }else{
      dialog.setAttribute("open", "open");
    }
  }

  // Placeholder si no hay incidencias (evita canvas vacío)
  function _renderPlaceholderBar(canvasId, label="Sin datos", color="rgba(148,163,184,.40)"){
    const ctx = document.getElementById(canvasId);
    if(!ctx || !window.Chart) return;

    if(canvasId === "chartIncidencias" && chartIncidenciasInstance){
      try{ chartIncidenciasInstance.destroy(); }catch{}
      chartIncidenciasInstance = null;
    }

    chartIncidenciasInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: [label],
        datasets: [{ data:[0], backgroundColor: color, borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display:false } },
        scales: {
          y: { beginAtZero:true, ticks:{ stepSize:1 } },
          x: { ticks:{ autoSkip:false, maxRotation:0 } }
        }
      }
    });
  }

  appEl.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div>
          <h2 style="margin:0 0 4px;">📊 Reportes</h2>
          <div style="color:var(--muted); font-size:12px;">
            Análisis de visitas, tiempos, calidad y puntualidad
          </div>
        </div>
        <div class="row">
          <button class="secondary" data-action="home">Volver</button>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Filtros -->
      <div class="reports-filter-row">
        <div>
          <label>Fecha inicio</label>
          <input type="date" id="repFrom" value="${monthStartISO}">
        </div>
        <div>
          <label>Fecha fin</label>
          <input type="date" id="repTo" value="${todayISO}">
        </div>
        <div>
          <label>Área</label>
          <select id="repArea">
            <option value="">Todas</option>
            ${AREAS.map(a => `<option value="${a}">${a}</option>`).join("")}
          </select>
        </div>
        <div>
          <button id="repApply">Aplicar</button>
        </div>
      </div>

      <div class="divider"></div>

      <!-- ✅ KPIs: auto-fit para que SIEMPRE quepan -->
      
      <div class="row" style="gap:8px;margin-bottom:14px;">
        <button class="secondary" data-action="repTab" data-tab="resumen" aria-current="page">Resumen</button>
        <button class="secondary" data-action="repTab" data-tab="evaluacion">Evaluación proveedores</button>
      </div>
      <div data-report-tab-panel="resumen" class="reports-kpi-grid">
        ${kpiCard("Total visitas","kpiTotal")}
        ${kpiCard("Tiempo promedio","kpiTiempo")}
        ${kpiCard("% Rechazo","kpiRechazo")}
        ${kpiCard("Incidencias (Calidad)","kpiIncidencias")}
        ${kpiCard("Visitas hoy","kpiHoy")}
        ${kpiCard("A tiempo","kpiATiempo", `Tolerancia: ${LATE_GRACE_MIN} min`)}
        ${kpiCard("Tarde","kpiTarde", `Posterior a cita + ${LATE_GRACE_MIN} min`)}
        ${kpiCard("No asistieron (Programado)","kpiNoShow", "Solo citas vencidas sin llegada")}
      </div>

      <div data-report-tab-panel="evaluacion" style="display:none;">


      <div class="card" style="margin-bottom:18px;">


        <div class="row" style="justify-content:space-between;align-items:flex-start;">


          <div>


            <h3 style="margin:0 0 4px;">Evaluación mensual de proveedores</h3>
            <div style="color:var(--muted);font-size:12px;">Score 0-100 con clasificación AA, A, B o C según asistencia, puntualidad, calidad, documentos e incidencias.</div>
          </div>
          <div class="row" id="evalProvSummary" style="justify-content:flex-end;"></div>
          <button class="secondary" data-action="repExportEvalProv">Exportar Excel</button>
        </div>
        <div class="divider"></div>
                <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:12px;">
          <div class="pill" style="border-radius:12px;align-items:flex-start;white-space:normal;"><span class="dot ok" style="margin-top:5px;"></span><span><b style="color:var(--text);">AA</b><br>Excelente: proveedor confiable, puntual y sin penalizaciones relevantes.</span></div>
          <div class="pill" style="border-radius:12px;align-items:flex-start;white-space:normal;"><span class="dot info" style="margin-top:5px;"></span><span><b style="color:var(--text);">A</b><br>Bueno: cumple en general, con detalles menores o muestra baja.</span></div>
          <div class="pill" style="border-radius:12px;align-items:flex-start;white-space:normal;"><span class="dot warn" style="margin-top:5px;"></span><span><b style="color:var(--text);">B</b><br>Riesgo medio: tardanzas, no asistencias o incidencias que requieren seguimiento.</span></div>
          <div class="pill" style="border-radius:12px;align-items:flex-start;white-space:normal;"><span class="dot bad" style="margin-top:5px;"></span><span><b style="color:var(--text);">C</b><br>Riesgo alto: incumplimientos frecuentes, rechazos o incidencias críticas.</span></div>
        </div>        <div id="evalProvWrap" style="overflow:auto;min-height:80px;color:var(--muted);font-size:12px;">
          Presiona Aplicar para calcular la evaluación del rango seleccionado.
        </div>
      </div>

      </div>

      <!-- ✅ Gráficas: alturas responsivas y sin overflow -->

      <div data-report-tab-panel="resumen">

      <div style="

        display:grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap:12px;
      ">
        <div class="col" style="height:clamp(300px, 30vw, 300px); overflow:hidden;">
          <h3>Visitas por área</h3>
          <canvas id="chartArea" style="width:100%;height:100%;"></canvas>
        </div>

        <div class="col" style="height:clamp(300px, 30vw, 300px); overflow:hidden;">
          <h3>Estado de visitas</h3>
          <canvas id="chartEstado" style="width:100%;height:100%;"></canvas>
        </div>

        <div class="col" style="height:clamp(300px, 30vw, 300px); overflow:hidden;">
          <h3>Dictamen calidad</h3>
          <canvas id="chartDictamen" style="width:100%;height:100%;"></canvas>
        </div>

        <div class="col" style="height:clamp(300px, 30vw, 300px); overflow:hidden;">
          <h3>Tiempo promedio por área</h3>
          <canvas id="chartTiempo" style="width:100%;height:100%;"></canvas>
        </div>

        <div class="col" style="height:clamp(300px, 30vw, 300px); overflow:hidden;">
          <h3>Incidencias por área (Calidad)</h3>
          <canvas id="chartIncidencias" style="width:100%;height:100%;"></canvas>
        </div>

        <div class="col" style="height:clamp(300px, 30vw, 300px); overflow:hidden;">
        <h3>Puntualidad</h3>
        <canvas id="chartPuntualidad" style="width:100%;height:100%;"></canvas>
        </div>
      </div>
    </div>
  `;

  // helper local para tarjetas KPI (evita overflow y se adapta)
  function kpiCard(title, id, sub=""){

// Clickeables: Tarde, NoShow e Incidencias
const clickable = (id === "kpiTarde" || id === "kpiNoShow" || id === "kpiIncidencias");

const action =
  (id === "kpiTarde") ? "repOpenLate" :
  (id === "kpiNoShow") ? "repOpenNoShow" :
  (id === "kpiIncidencias") ? "repOpenIncCalidad" :
  "";

  return `
    <div class="card report-kpi-card"
      ${clickable ? `data-action="${action}"` : ""} 
      style="${clickable ? "cursor:pointer;" : ""}">
      <h3>${title}</h3>
      <div id="${id}" style="
        font-weight:800;
        font-size:clamp(18px, 4vw, 28px);
        line-height:1.05;
        word-break:break-word;
        white-space:normal;
      ">—</div>
      ${sub ? `<div style="color:var(--muted);font-size:11px;margin-top:6px;">${sub}</div>` : ""}
      ${clickable ? `<div style="color:var(--muted);font-size:11px;margin-top:6px;">Haz clic para ver detalle</div>` : ""}
    </div>
  `;
}
 
  document.getElementById("repApply").onclick = async () => {
    const from = document.getElementById("repFrom").value;
    const to   = document.getElementById("repTo").value;
    const area = document.getElementById("repArea").value;

    if(!from || !to){
      toast("Filtros incompletos", "Selecciona rango de fechas", "warn");
      return;
    }


    const fromTs  = new Date(from + "T00:00:00").getTime();
    const toTs    = new Date(to   + "T23:59:59").getTime();
    const nowTs   = Date.now();
    const graceMs = LATE_GRACE_MIN * 60 * 1000;

    // ✅ Cargar rango desde nube
    if(navigator.onLine){
      try{
        const cloudRange = await cloudFetchByRange(fromTs, toTs);
        visitas = mergeById(visitas, cloudRange);
        saveVisitasLocal();
      }catch(e){
        console.warn("Reportes: cloudFetchByRange falló", e);
        toast("Reportes", "No se pudo cargar el rango desde la nube (Rules/Internet).", "warn", 3600);
      }
    } else {
      toast("Sin conexión", "Mostrando solo lo disponible en local.", "warn", 2600);
    }

    // Base por rango + área (sin cancelados)
    let data = filterVisitasByRange(visitas, fromTs, toTs);
    data = filterByArea(data, area);
    if(typeof Status !== "undefined" && Status.CANCELADO){
      data = data.filter(v => v.status !== Status.CANCELADO);
    }

    // KPIs base (incidencias ya deben venir de Calidad si actualizaste calcKPIs)
    const kpi = calcKPIs(data);
    _safeSetText("kpiTotal", String(kpi.total ?? 0));
    _safeSetText("kpiTiempo", kpi.tiempoPromedioMin ? `${kpi.tiempoPromedioMin} min` : "—");

    _safeSetText("kpiRechazo", `${kpi.pctRechazo ?? 0}%`);
    _safeSetColor("kpiRechazo", (kpi.pctRechazo ?? 0) > 10 ? "var(--bad)" : "var(--ok)");

    _safeSetText("kpiIncidencias", String(kpi.incidencias ?? 0));
    _safeSetColor("kpiIncidencias", (kpi.incidencias ?? 0) > 0 ? "var(--warn)" : "var(--muted)");

    
// =========================
// Incidencias (Calidad): detalle para modal
// =========================
const INC_LABEL = {
  "SIN_INCIDENCIAS": "Sin Incidencias",
  "ERROR_ADMINISTRATIVO": "ERROR ADMINISTRATIVO",
  "SIN_DOCUMENTOS": "SIN DOCUMENTOS",
  "FALTANTES": "FALTANTES",
  "EXCEDENTES": "EXCEDENTES",
  "FUERA_DE_ESPECIFICACION": "FUERA DE ESPECIFICACIÓN"
};

const incList = data
  .filter(v => {
    const inc = (v.dictamen?.incidencia || "SIN_INCIDENCIAS").trim();
    return inc && inc !== "SIN_INCIDENCIAS";
  })
  .map(v => {
    const incKey = (v.dictamen?.incidencia || "SIN_INCIDENCIAS").trim();
    return {
      id: v.id,
      proveedor: v.proveedor || "",
      empresa: v.empresa || "",
      area: v.area || "",
      citaTs: (typeof v.fechaHoraTs === "number") ? v.fechaHoraTs : null,
      dictamenEstado: (v.dictamen?.estado || "pendiente"),
      incidenciaKey: incKey,
      incidenciaLabel: INC_LABEL[incKey] || incKey,
      notas: v.dictamen?.notas || "",
      dictamenPor: v.dictamen?.por || "",
      dictamenTs: (typeof v.dictamen?.ts === "number") ? v.dictamen.ts : null
    };
  })
  // orden: dictamen más reciente primero, si no por cita
  .sort((a,b) => (b.dictamenTs || 0) - (a.dictamenTs || 0) || (b.citaTs || 0) - (a.citaTs || 0));

window.__repIncCalidad = {
  from,
  to,
  area,
  rows: incList
};


    // Visitas HOY
    const hoy = new Date();
    const visitasHoy = visitas.filter(v =>
      typeof v.fechaHoraTs === "number" &&
      isSameDay(v.fechaHoraTs, hoy)
    );
    _safeSetText("kpiHoy", String(visitasHoy.length));

    // Puntualidad
    const llegadas = data.filter(v =>
  typeof v.fechaHoraTs === "number" &&
  typeof v.llegadaTs === "number"
);

const tardeList = llegadas
  .filter(v => (v.llegadaTs - v.fechaHoraTs) > graceMs)
  .map(v => ({
    id: v.id,
    proveedor: v.proveedor || "",
    empresa: v.empresa || "",
    area: v.area || "",
    citaTs: v.fechaHoraTs,
    llegadaTs: v.llegadaTs,
    minutosTarde: Math.max(0, Math.round((v.llegadaTs - v.fechaHoraTs) / 60000))
  }))
  .sort((a,b) => b.minutosTarde - a.minutosTarde);

// ✅ guardamos el detalle para el modal (en window para que sea accesible)
window.__repLate = {
  from,
  to,
  area,
  graceMin: LATE_GRACE_MIN,
  rows: tardeList
};

const aTiempo = llegadas.filter(v => (v.llegadaTs - v.fechaHoraTs) <= graceMs).length;
const tarde = tardeList.length;


    _safeSetText("kpiATiempo", String(aTiempo));
    _safeSetColor("kpiATiempo", aTiempo > 0 ? "var(--ok)" : "var(--muted)");

    _safeSetText("kpiTarde", String(tarde));
    _safeSetColor("kpiTarde", tarde > 0 ? "var(--warn)" : "var(--muted)");

    // No asistieron
    // No asistieron (Programado): citas vencidas sin llegada (QR)
const noShowList = data
  .filter(v =>
    String(v.status).toLowerCase() === "programado" &&
    typeof v.fechaHoraTs === "number" &&
    v.fechaHoraTs < (nowTs - graceMs) &&
    !v.llegadaTs
  )
  .map(v => ({
    id: v.id,
    proveedor: v.proveedor || "",
    empresa: v.empresa || "",
    area: v.area || "",
    citaTs: v.fechaHoraTs,
    minutosVencida: Math.max(0, Math.round((nowTs - v.fechaHoraTs) / 60000))
  }))
  // orden: más vencida primero
  .sort((a,b) => b.minutosVencida - a.minutosVencida);

// ✅ guardamos el detalle para el modal
window.__repNoShow = {
  from,
  to,
  area,
  graceMin: LATE_GRACE_MIN,
  nowTs,
  rows: noShowList
};

const noShow = noShowList.length;

_safeSetText("kpiNoShow", String(noShow));
_safeSetColor("kpiNoShow", noShow > 0 ? "var(--bad)" : "var(--muted)");

const evalRows = buildEvaluacionProveedores(data, { nowTs, graceMin: LATE_GRACE_MIN, graveMin: 30 });
window.__repEvalProveedores = { from, to, area, rows: evalRows };
renderEvaluacionProveedores(evalRows);

    // Gráficas
    renderChartVisitasPorArea(data);
    renderChartEstados(data);
    renderChartDictamen(data);
    renderChartTiempoPorArea(data);
    // Incidencias: si 0, placeholder (no canvas en blanco)
    if((kpi.incidencias ?? 0) > 0){
      renderChartIncidenciasPorArea(data);
    } else {
      _renderPlaceholderBar("chartIncidencias", "Sin incidencias (Calidad)");
    }
    renderChartPuntualidad(aTiempo, tarde, noShow);
  };
}

// =========================
// Modal: detalle de "No asistieron"
// =========================
function openNoShowModal(){
  const modal = document.getElementById("noShowModal");
  const closeBtn = document.getElementById("noShowCloseBtn");
  const title = document.getElementById("noShowTitle");
  const sub = document.getElementById("noShowSubtitle");
  const wrap = document.getElementById("noShowTableWrap");

  if(!modal || !wrap) return;

  const rep = window.__repNoShow || { rows: [] };
  const rows = rep.rows || [];

  title.textContent = "🚫 No asistieron (Programado)";
  sub.textContent =
    `Rango: ${rep.from || "—"} a ${rep.to || "—"} | Área: ${rep.area || "Todas"} | ` +
    `Regla: cita vencida > ${rep.graceMin ?? "—"} min sin llegada | Total: ${rows.length}`;

  if(!rows.length){
    wrap.innerHTML = `<div class="pill"><span class="dot muted"></span>No hay "No asistieron" para los filtros actuales.</div>`;
  }else{
    wrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Proveedor</th>
            <th>Empresa</th>
            <th>Área</th>
            <th>Cita (programada)</th>
            <th>Min. vencida</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td>${i+1}</td>
              <td><b>${esc(r.proveedor)}</b></td>
              <td>${esc(r.empresa)}</td>
              <td>${esc(r.area)}</td>
              <td>${new Date(r.citaTs).toLocaleString()}</td>
              <td>
                <span class="pill" style="background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.35); color:#fca5a5;">
                  <span class="dot bad"></span>${r.minutosVencida}
                </span>
              </td>
              <td><code>${esc(r.id)}</code></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  modal.classList.add("show");

  // cerrar por botón
  if(closeBtn){
    closeBtn.onclick = () => modal.classList.remove("show");
  }

  // cerrar al dar clic fuera
  modal.onclick = (e) => {
    if(e.target === modal) modal.classList.remove("show");
  };

  // cerrar con ESC
  document.onkeydown = (e) => {
    if(e.key === "Escape") modal.classList.remove("show");
  };
}

// =========================
// Modal: detalle de "Tarde"
// =========================
function openLateModal(){
  const modal = document.getElementById("lateModal");
  const closeBtn = document.getElementById("lateCloseBtn");
  const title = document.getElementById("lateTitle");
  const sub = document.getElementById("lateSubtitle");
  const wrap = document.getElementById("lateTableWrap");

  if(!modal || !wrap) return;

  const rep = window.__repLate || { rows: [] };
  const rows = rep.rows || [];

  title.textContent = "⏰ Proveedores que llegaron tarde";
  sub.textContent = `Rango: ${rep.from || "—"} a ${rep.to || "—"} | Área: ${rep.area || "Todas"} | Tolerancia: ${rep.graceMin ?? "—"} min | Total: ${rows.length}`;

  if(!rows.length){
    wrap.innerHTML = `<div class="pill"><span class="dot muted"></span>No hay registros de tardanza para los filtros actuales.</div>`;
  }else{
    wrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Proveedor</th>
            <th>Empresa</th>
            <th>Área</th>
            <th>Cita</th>
            <th>Llegada</th>
            <th>Min. tarde</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td>${i+1}</td>
              <td><b>${esc(r.proveedor)}</b></td>
              <td>${esc(r.empresa)}</td>
              <td>${esc(r.area)}</td>
              <td>${new Date(r.citaTs).toLocaleString()}</td>
              <td>${new Date(r.llegadaTs).toLocaleString()}</td>
              <td><span class="pill" style="background: rgba(250,204,21,.12); border-color: rgba(250,204,21,.35); color:#fde68a;">
                    <span class="dot warn"></span>${r.minutosTarde}
                  </span></td>
              <td><code>${esc(r.id)}</code></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  modal.classList.add("show");

  // cerrar por botón
  if(closeBtn){
    closeBtn.onclick = () => modal.classList.remove("show");
  }

  // cerrar al dar clic fuera
  modal.onclick = (e) => {
    if(e.target === modal) modal.classList.remove("show");
  };

  // cerrar con ESC
  document.onkeydown = (e) => {
    if(e.key === "Escape") modal.classList.remove("show");
  };
}


// =========================
// Modal: detalle de "Incidencias (Calidad)"
// =========================
function openIncCalModal(){
  const modal = document.getElementById("incCalModal");
  const closeBtn = document.getElementById("incCalCloseBtn");
  const title = document.getElementById("incCalTitle");
  const sub = document.getElementById("incCalSubtitle");
  const wrap = document.getElementById("incCalTableWrap");

  if(!modal || !wrap) return;

  const rep = window.__repIncCalidad || { rows: [] };
  const rows = rep.rows || [];

  title.textContent = "⚠️ Incidencias (Calidad)";
  sub.textContent = `Rango: ${rep.from || "—"} a ${rep.to || "—"} | Área: ${rep.area || "Todas"} | Total: ${rows.length}`;

  const badgeDict = (estado) => {
    const e = String(estado || "pendiente").toLowerCase();
    if(e === "aceptado") return `<span class="badge-dictamen aceptado"><span class="bdot"></span>ACEPTADO</span>`;
    if(e === "rechazado") return `<span class="badge-dictamen rechazado"><span class="bdot"></span>RECHAZADO</span>`;
    return `<span class="badge-dictamen pendiente"><span class="bdot"></span>PENDIENTE</span>`;
  };

  if(!rows.length){
    wrap.innerHTML = `<div class="pill"><span class="dot muted"></span>No hay incidencias para los filtros actuales. (Presiona "Aplicar")</div>`;
  } else {
    wrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Proveedor</th>
            <th>Empresa</th>
            <th>Área</th>
            <th>Incidencia</th>
            <th>Dictamen</th>
            <th>Dictamen ts</th>
            <th>Notas</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r,i)=>`
            <tr>
              <td>${i+1}</td>
              <td><b>${esc(r.proveedor)}</b></td>
              <td>${esc(r.empresa)}</td>
              <td>${esc(r.area)}</td>
              <td>
                <span class="pill" style="background: rgba(250,204,21,.12); border-color: rgba(250,204,21,.35); color:#fde68a;">
                  <span class="dot warn"></span>${esc(r.incidenciaLabel)}
                </span>
              </td>
              <td>${badgeDict(r.dictamenEstado)}</td>
              <td>${r.dictamenTs ? new Date(r.dictamenTs).toLocaleString() : "-"}</td>
              <td style="max-width:320px; white-space:normal; word-break:break-word; color:var(--muted);">
                ${esc(r.notas || "")}
              </td>
              <td><code>${esc(r.id)}</code></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  modal.classList.add("show");

  if(closeBtn) closeBtn.onclick = () => modal.classList.remove("show");
  modal.onclick = (e) => { if(e.target === modal) modal.classList.remove("show"); };
  document.onkeydown = (e) => { if(e.key === "Escape") modal.classList.remove("show"); };
}


// Listener del KPI Tarde (solo dentro de Reportes)
appEl.addEventListener("click", (e) => {
  const late = e.target.closest('[data-action="repOpenLate"]');
  if(late) return openLateModal();

  const ns = e.target.closest('[data-action="repOpenNoShow"]');
  if(ns) return openNoShowModal();

  const inc = e.target.closest('[data-action="repOpenIncCalidad"]');
  if(inc) return openIncCalModal();

  const expEval = e.target.closest('[data-action="repExportEvalProv"]');
  if(expEval) return exportEvaluacionProveedoresExcel();

  const tabBtn = e.target.closest('[data-action="repTab"]');
  if(tabBtn){
    const tab = tabBtn.dataset.tab || "resumen";
    appEl.querySelectorAll('[data-report-tab-panel]').forEach(panel => {
      panel.style.display = panel.dataset.reportTabPanel === tab ? '' : 'none';
    });
    appEl.querySelectorAll('[data-action="repTab"]').forEach(btn => {
      if(btn.dataset.tab === tab) btn.setAttribute('aria-current','page');
      else btn.removeAttribute('aria-current');
    });
    return;
  }
});

// -------------------------

async function obtenerPersonasVisita(){
  const snap = await getDoc(doc(db, COL_APP_CONFIG, "personas_visita"));
  const data = snap.exists() ? snap.data() : {};
  return Array.isArray(data.personas) ? data.personas : [];
}
async function guardarPersonasVisita(personas){
  await setDoc(doc(db, COL_APP_CONFIG, "personas_visita"), {
    personas, updatedTs:Date.now(), updatedBy:currentUser.uid
  }, { merge:true });
}
function pintarPersonasSelect(select, personas){
  if(!select || !personas.some(p=>p.activo!==false)) return;
  const groups = new Map();
  personas.filter(p=>p.activo!==false).sort((a,b)=>String(a.departamento).localeCompare(String(b.departamento),"es")||String(a.nombre).localeCompare(String(b.nombre),"es")).forEach(p=>{
    const dept = p.departamento || "Sin departamento";
    if(!groups.has(dept)) groups.set(dept,[]);
    groups.get(dept).push(p);
  });
  select.innerHTML = '<option value="">Seleccione...</option>';
  groups.forEach((items,dept)=>{
    const group=document.createElement("optgroup"); group.label=dept;
    items.forEach(p=>{const o=document.createElement("option");o.value=p.nombre;o.textContent=p.nombre;group.appendChild(o);});
    select.appendChild(group);
  });
}
async function cargarPersonasVisitaSelect(select){
  try{ const personas=await obtenerPersonasVisita(); pintarPersonasSelect(select,personas); }
  catch(e){ console.warn("Se usa el listado de respaldo.",e); }
}
async function renderPersonasVisita(){
  if(currentUser?.role !== ROLES.ADMIN){ toast("Acceso denegado","Solo ADMIN puede administrar el directorio.","bad"); return; }
  currentView="personas_visita";
  appEl.innerHTML=`<div class="card"><div class="row" style="justify-content:space-between"><div><h2>Personas a visitar</h2><p class="muted">Directorio usado en citas y kiosco de visitantes.</p></div></div><div class="two"><div><label>Nombre</label><input id="pvNombre"></div><div><label>Departamento</label><input id="pvDepto"></div></div><div class="row" style="margin-top:12px"><button id="pvAgregar">Agregar</button><button class="secondary" id="pvImportar">Importar listado actual</button></div><div class="divider"></div><div id="pvTabla">Cargando...</div></div>`;
  document.getElementById("pvAgregar").onclick=async()=>{const nombre=document.getElementById("pvNombre").value.trim(),departamento=document.getElementById("pvDepto").value.trim();if(!nombre||!departamento)return toast("Datos incompletos","Captura nombre y departamento.","warn");const list=await obtenerPersonasVisita();list.push({id:crypto.randomUUID(),nombre,departamento,activo:true});await guardarPersonasVisita(list);renderPersonasVisita();};
  document.getElementById("pvImportar").onclick=importarPersonasVisitaActuales;
  const list=await obtenerPersonasVisita();
  const tabla=document.getElementById("pvTabla");
  if(!list.length){tabla.innerHTML='<p class="muted">El directorio está vacío. Usa Importar listado actual.</p>';return;}
  tabla.innerHTML=`<div style="overflow:auto"><table class="table"><thead><tr><th>Nombre</th><th>Departamento</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${list.map(p=>`<tr><td>${esc(p.nombre)}</td><td>${esc(p.departamento)}</td><td>${p.activo===false?"Inactiva":"Activa"}</td><td><button class="secondary" data-pv-edit="${p.id}">Editar</button> <button data-pv-toggle="${p.id}">${p.activo===false?"Reactivar":"Desactivar"}</button></td></tr>`).join("")}</tbody></table></div>`;
  tabla.querySelectorAll("[data-pv-edit]").forEach(b=>b.onclick=async()=>{const p=list.find(x=>x.id===b.dataset.pvEdit);const nombre=prompt("Nombre:",p.nombre),departamento=nombre===null?null:prompt("Departamento:",p.departamento);if(nombre===null||departamento===null)return;p.nombre=nombre.trim();p.departamento=departamento.trim();await guardarPersonasVisita(list);renderPersonasVisita();});
  tabla.querySelectorAll("[data-pv-toggle]").forEach(b=>b.onclick=async()=>{const p=list.find(x=>x.id===b.dataset.pvToggle);p.activo=p.activo===false;await guardarPersonasVisita(list);renderPersonasVisita();});
}
async function importarPersonasVisitaActuales(){
  try{
    const source=renderNuevo.toString();
    const html=source.match(/<select id="persona">[\s\S]*?<\/select>/i)?.[0];
    if(!html) throw new Error("No se encontró el listado de respaldo.");
    const parsed=new DOMParser().parseFromString(html,"text/html");
    const current=await obtenerPersonasVisita(), keys=new Set(current.map(p=>`${p.departamento}|${p.nombre}`.toLowerCase()));
    parsed.querySelectorAll("optgroup").forEach(g=>g.querySelectorAll("option").forEach(o=>{const nombre=o.textContent.trim(),departamento=g.label.trim(),key=`${departamento}|${nombre}`.toLowerCase();if(nombre&&!keys.has(key)){current.push({id:crypto.randomUUID(),nombre,departamento,activo:true});keys.add(key);}}));
    await guardarPersonasVisita(current);toast("Importación terminada",`${current.length} personas en el directorio.`,"ok");renderPersonasVisita();
  }catch(e){toast("No se pudo importar",e.message||"Revisa permisos.","bad",4200);}
}

    // Admin usuarios screen
    // -------------------------
    let _adminUsersCache = [];
    let _adminIncompleteUsersCache = [];
    let _editingUserUid = null;

    async function renderMiPin(){
      try{ setActiveSb('config'); }catch{}
      if(!canConfigurePin()){
        toast("Acceso denegado", "Tu rol no puede configurar PIN.", "bad", 3200);
        return;
      }
      currentView = "mi_pin";

      let hasPin = false;
      try{
        hasPin = Boolean(await getCurrentAdminPinHash());
      }catch(e){
        console.warn("No se pudo leer PIN", e);
      }

      appEl.innerHTML = `
        <div class="card" style="max-width:560px;">
          <div class="row" style="justify-content:space-between;">
            <div>
              <h2 style="margin:0 0 4px;">Mi PIN</h2>
              <div style="color:var(--muted); font-size:12px;">
                Configura el PIN para autorizar acciones sensibles.
              </div>
            </div>
            <button class="secondary" data-action="home">Volver</button>
          </div>

          <div class="divider"></div>

          <div class="pill" style="margin-bottom:12px;">
            <span class="dot ${hasPin ? "ok" : "warn"}"></span>
            ${hasPin ? "PIN configurado" : "PIN pendiente de configurar"}
          </div>

          <label>Nuevo PIN</label>
          <input id="pinNuevo" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" placeholder="4 a 12 dígitos">

          <label>Confirmar PIN</label>
          <input id="pinConfirmar" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" placeholder="Repite el PIN">

          <div id="miPinStatus" role="status" aria-live="polite" style="min-height:22px;font-size:13px;font-weight:750;color:var(--muted);"></div>

          <div class="divider"></div>
          <div class="row">
            <button id="btnGuardarMiPin" class="ok" data-action="guardarMiPin">Guardar PIN</button>
            <button class="secondary" data-action="home">Cancelar</button>
          </div>
        </div>
      `;
    }

    function renderMiCuenta(){
      currentView = "mi_cuenta";
      const changedTs = Number(currentUser?.passwordChangedTs || 0);
      appEl.innerHTML = `
        <div class="card" style="max-width:620px;margin-inline:auto;">
          <div class="row" style="justify-content:space-between;align-items:flex-start;">
            <div><h2 style="margin:0 0 4px;">Mi cuenta</h2><div style="color:var(--muted);font-size:13px;">${esc(currentUser?.email || "")}</div></div>
            <button class="secondary" data-action="home">Volver</button>
          </div>
          <div class="divider"></div>
          <div class="pill" style="display:flex;white-space:normal;margin-bottom:14px;"><span class="dot ok"></span>${changedTs ? `Último cambio: ${esc(new Date(changedTs).toLocaleDateString())}` : "Puedes actualizar tu contraseña cuando lo necesites."}</div>
          <label>Contraseña actual</label><input id="passwordActual" type="password" autocomplete="current-password" placeholder="Escribe tu contraseña actual">
          <label>Nueva contraseña</label><input id="passwordNueva" type="password" autocomplete="new-password" placeholder="Mínimo 10 caracteres">
          <label>Confirmar nueva contraseña</label><input id="passwordConfirmar" type="password" autocomplete="new-password" placeholder="Repite la nueva contraseña">
          <div class="muted" style="font-size:12px;margin-top:8px;">Debe incluir mayúscula, minúscula, número y símbolo. No reutilices la contraseña actual.</div>
          <div id="passwordStatus" role="status" aria-live="polite" style="min-height:24px;margin-top:10px;font-size:13px;font-weight:750;color:var(--muted);"></div>
          <div class="divider"></div>
          <div class="row"><button id="btnCambiarPassword" class="ok" data-action="cambiarPassword">Cambiar contraseña</button></div>
        </div>`;
    }

    async function cambiarPassword(){
      const actual = document.getElementById("passwordActual")?.value || "";
      const nueva = document.getElementById("passwordNueva")?.value || "";
      const confirmar = document.getElementById("passwordConfirmar")?.value || "";
      const statusEl = document.getElementById("passwordStatus");
      const button = document.getElementById("btnCambiarPassword");
      const fail = message => { if(statusEl){ statusEl.style.color="var(--bad)"; statusEl.textContent=message; } toast("Contraseña no actualizada",message,"warn",4200); };
      if(!actual) return fail("Escribe tu contraseña actual.");
      if(nueva === actual) return fail("La nueva contraseña debe ser diferente a la actual.");
      if(nueva.length < 10 || !/[A-Z]/.test(nueva) || !/[a-z]/.test(nueva) || !/\d/.test(nueva) || !/[^A-Za-z0-9]/.test(nueva)) return fail("Usa al menos 10 caracteres con mayúscula, minúscula, número y símbolo.");
      if(nueva !== confirmar) return fail("La confirmación no coincide con la nueva contraseña.");
      if(!auth.currentUser?.email) return fail("La sesión no tiene un correo válido. Vuelve a iniciar sesión.");
      button.disabled=true; button.textContent="Actualizando…";
      if(statusEl){statusEl.style.color="var(--muted)";statusEl.textContent="Verificando la contraseña actual…";}
      try{
        await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, actual));
        await updatePassword(auth.currentUser, nueva);
        const changedTs = Date.now();
        await updateDoc(doc(db, COL_USERS, currentUser.uid), {
          passwordChangedTs:changedTs,
          passwordChangedAt:serverTimestamp(),
          passwordChangeRequired:false,
          ...userProfileAudit("cambiar_contrasena")
        });
        currentUser.passwordChangedTs = changedTs;
        currentUser.passwordChangeRequired = false;
        localStorage.setItem(LS_USER, JSON.stringify(currentUser));
        toast("Contraseña actualizada","Tu nueva contraseña quedó guardada correctamente.","ok",5000);
        renderModuleHome();
      }catch(error){
        const code=String(error?.code||"");
        const message=code.includes("invalid-credential") || code.includes("wrong-password") ? "La contraseña actual no es correcta." : code.includes("weak-password") ? "Firebase rechazó la nueva contraseña por ser débil." : code.includes("too-many-requests") ? "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." : "No se pudo actualizar la contraseña. Revisa la conexión e intenta nuevamente.";
        fail(message);
      }finally{const currentBtn=document.getElementById("btnCambiarPassword");if(currentBtn){currentBtn.disabled=false;currentBtn.textContent="Cambiar contraseña";}}
    }

    async function guardarMiPin(){
      if(!canConfigurePin()){
        toast("Acceso denegado", "Tu rol no puede configurar PIN.", "bad", 3200);
        return;
      }

      const pin = (document.getElementById("pinNuevo")?.value || "").trim();
      const confirm = (document.getElementById("pinConfirmar")?.value || "").trim();

      if(!/^\d{4,12}$/.test(pin)){
        toast("PIN inválido", "Usa entre 4 y 12 dígitos.", "warn", 3200);
        return;
      }
      if(pin !== confirm){
        toast("PIN no coincide", "Confirma el mismo PIN.", "warn", 3200);
        return;
      }

      const statusEl = document.getElementById("miPinStatus");
      const saveBtn = document.getElementById("btnGuardarMiPin");
      if(saveBtn){
        saveBtn.disabled = true;
        saveBtn.textContent = "Guardando…";
      }
      if(statusEl){
        statusEl.style.color = "var(--muted)";
        statusEl.textContent = "Guardando y verificando el PIN…";
      }

      try{
        const pinHash = await hashPin(pin);
        const userRef = doc(db, COL_USERS, currentUser.uid);
        const currentProfile = await getDocFromServer(userRef);
        if(!currentProfile.exists() || !userProfileIsComplete(currentProfile.data(), currentUser.uid)){
          throw new Error("El perfil está incompleto. Un administrador debe repararlo antes de guardar el PIN.");
        }
        await updateDoc(userRef, {
          pinHash,
          pinEnabled: true,
          pinUpdatedTs: Date.now(),
          pinUpdatedAt: serverTimestamp(),
          ...userProfileAudit("actualizar_pin")
        });

        const saved = await getDocFromServer(userRef);
        if(!saved.exists() || saved.data()?.pinHash !== pinHash){
          throw new Error("No fue posible verificar el PIN guardado.");
        }

        sessionStorage.removeItem(PIN_SESSION_KEY);
        await renderMiPin();
        const confirmedStatus = document.getElementById("miPinStatus");
        if(confirmedStatus){
          confirmedStatus.style.color = "var(--ok)";
          confirmedStatus.textContent = "✓ PIN guardado y verificado correctamente.";
        }
        toast("PIN guardado", "Tu PIN fue actualizado y verificado.", "ok", 4200);
      }catch(error){
        console.error("No se pudo guardar el PIN:", error);
        const message = String(error?.code || "").includes("permission-denied")
          ? "No tienes permiso para guardar el PIN. Contacta al administrador."
          : (error?.message || "No se pudo guardar el PIN. Revisa tu conexión e intenta nuevamente.");
        if(statusEl){
          statusEl.style.color = "var(--bad)";
          statusEl.textContent = message;
        }
        toast("PIN no guardado", message, "bad", 5200);
      }finally{
        const currentBtn = document.getElementById("btnGuardarMiPin");
        if(currentBtn){
          currentBtn.disabled = false;
          currentBtn.textContent = "Guardar PIN";
        }
      }
    }


async function renderRolePermissions(role=_selectedRolePermRole){
  try{ setActiveSb('config'); }catch{}
  if(!requirePerm("admin_roles", "Solo ADMIN puede administrar roles.")) return;
  currentView = "role_permissions";
  await loadRolePermsConfig();
  _selectedRolePermRole = ALL_ROLES.includes(role) ? role : ROLES.ADMIN;
  const selected = _selectedRolePermRole;
  const active = new Set(getPermsForRole(selected));
  const base = new Set(normalizePermList(PERMISOS[selected] || [], selected));

  appEl.innerHTML = `
    <div class="card roles-screen">
      <div class="roles-screen-head">
        <div>
          <h2 style="margin:0 0 4px;">Roles</h2>
          <div style="color:var(--muted);font-size:12px;">Selecciona un rol y marca los permisos que debe tener. Los cambios aplican a todos los usuarios con ese rol.</div>
        </div>
        <div class="roles-screen-actions">
          <button class="secondary" data-action="adminRoles">Usuarios</button>
          <button class="secondary" data-action="home">Volver</button>
        </div>
      </div>

      <div class="divider"></div>

      <div class="roles-screen-layout">
        <div class="col">
          <h3 style="margin:0 0 10px;">Roles</h3>
          <div class="role-selector-list">
            ${ALL_ROLES.map(r => `
              <button class="secondary" data-action="rolePermSelect" data-role="${esc(r)}" aria-current="${r === selected ? 'page' : 'false'}" style="justify-content:space-between;">
                <span>${esc(roleLabel(r))}</span>
                <span class="pill" style="padding:3px 7px;">${getPermsForRole(r).length}</span>
              </button>
            `).join("")}
          </div>
        </div>

        <div class="col role-perm-panel">
          <div class="role-perm-head">
            <div>
              <h3 style="margin:0 0 4px;">${esc(roleLabel(selected))}</h3>
              <div style="color:var(--muted);font-size:12px;">Activos: <b style="color:var(--text);">${active.size}</b> de ${ALL_PERMS.length}. Base del c\u00f3digo: ${base.size}.</div>
            </div>
            <div class="role-perm-actions">
              <button class="secondary" data-action="rolePermReset" data-role="${esc(selected)}">Restaurar base</button>
              <button data-action="rolePermSave" data-role="${esc(selected)}">Guardar cambios</button>
            </div>
          </div>

          <div class="divider"></div>

          <div id="rolePermChecks" class="role-perm-checks">
            ${PERM_GROUPS.map(group => `
              <div class="card" style="margin:0;">
                <h3 style="margin:0 0 8px;font-size:16px;">${esc(group.title)}</h3>
                <div style="display:grid;gap:8px;">
                  ${group.perms.map(perm => {
                    const checked = active.has(perm);
                    const isRequiredAdmin = selected === ROLES.ADMIN && perm === "admin_roles";
                    return `
                      <label class="pill" style="justify-content:flex-start;gap:10px;white-space:normal;border-radius:10px;">
                        <input type="checkbox" data-role-perm="${esc(perm)}" ${checked ? 'checked' : ''} ${isRequiredAdmin ? 'disabled' : ''} style="width:18px;height:18px;accent-color:#3b82f6;">
                        <span><b style="color:var(--text);">${esc(permLabel(perm))}</b><br><small style="color:var(--muted);">${esc(perm)}</small></span>
                      </label>
                    `;
                  }).join("")}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function saveRolePermissionsFromScreen(role){
  const selected = ALL_ROLES.includes(role) ? role : _selectedRolePermRole;
  const checks = Array.from(document.querySelectorAll('[data-role-perm]'));
  const perms = checks.filter(chk => chk.checked || (selected === ROLES.ADMIN && chk.dataset.rolePerm === "admin_roles")).map(chk => chk.dataset.rolePerm);
  try{
    const ok = await saveRolePermsConfig(selected, perms);
    if(!ok) return;
    toast("Roles", "Permisos guardados para " + roleLabel(selected) + ".", "ok", 2600);
    paintSidebar();
    await renderRolePermissions(selected);
  }catch(e){
    console.error(e);
    toast("Roles", `No se pudieron guardar permisos: ${e?.code || "error"} - ${e?.message || "Revisa Rules/Internet."}`, "bad", 6500);
  }
}

async function resetRolePermissions(role){
  const selected = ALL_ROLES.includes(role) ? role : _selectedRolePermRole;
  if(!confirm("\u00bfRestaurar permisos base para " + roleLabel(selected) + "?")) return;
  await saveRolePermissionsFromScreenWithPerms(selected, normalizePermList(PERMISOS[selected] || [], selected));
}

async function saveRolePermissionsFromScreenWithPerms(role, perms){
  try{
    const ok = await saveRolePermsConfig(role, perms);
    if(!ok) return;
    toast("Roles", "Permisos restaurados para " + roleLabel(role) + ".", "ok", 2600);
    paintSidebar();
    await renderRolePermissions(role);
  }catch(e){
    console.error(e);
    toast("Roles", `No se pudieron restaurar permisos: ${e?.code || "error"} - ${e?.message || "Revisa Rules/Internet."}`, "bad", 6500);
  }
}
