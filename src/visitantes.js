    async function renderAdminRoles(){
 try{ setActiveSb('config'); }catch{}
      if(!requirePerm("admin_roles","Solo ADMIN puede administrar usuarios.")) return;
      currentView = "admin_roles";

      appEl.innerHTML = `
        <div class="card users-screen">
          <div class="row" style="justify-content:space-between;">
            <div>
              <h2 style="margin:0 0 4px;">Usuarios</h2>
              <div style="color:var(--muted); font-size:12px;">
                Administra datos, roles y estado de usuarios.
              </div>
            </div>
            <div class="row" style="gap:10px; flex-wrap:wrap;">
  <button data-action="openBulkUsersModal">Agregar usuarios</button>
  <button class="secondary" data-action="home">Volver</button>

  <!-- ✅ SOLO ADMIN -->
  ${currentUser?.role === ROLES.ADMIN ? `
    <button class="danger" data-action="normalizarUsuarios">
      Normalizar usuarios
    </button>
  ` : ""}
</div>
          </div>

          <div class="divider"></div>

          <div class="row">
            <input id="uSearch" placeholder="Buscar por nombre, correo, rol..." style="max-width:320px;">
            <button class="secondary" data-action="adminReload">Recargar</button>
          </div>

          <div style="height:10px;"></div>

          <div id="adminUsersWrap" class="users-table-scroll"></div>
          <div id="adminIncompleteUsersWrap"></div>
        </div>
        ${renderUserModal()}
        ${renderBulkUsersModal()}
      `;

      await loadAdminUsers();
      document.getElementById("uSearch").addEventListener("input", filterAdminUsers);
    }

    async function loadAdminUsers(){
      const wrap = document.getElementById("adminUsersWrap");
      wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;">Cargando usuarios...</div>`;

      try{
        const q = query(
        collection(db, COL_USERS),
        limit(300)
        );
        const snap = await getDocs(q);
        const arr = [];
        const incomplete = [];
        snap.forEach(d => {
          const data = { id: d.id, uid: d.id, ...d.data() };
          if(data.eliminado) return;
          if(userProfileIsComplete(data, d.id)) arr.push(data);
          else incomplete.push(data);
        });
        _adminUsersCache = arr;
        _adminIncompleteUsersCache = incomplete;
        paintAdminUsers(arr);
        paintIncompleteUsers(incomplete);
      }catch(e){
        console.error(e);
        wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;">Error cargando usuarios (Rules/Permisos).</div>`;
        toast("Admin","No se pudieron cargar usuarios. Revisa Rules.","bad",4200);
      }
    }

    function filterAdminUsers(){
      const term = (document.getElementById("uSearch").value || "").trim().toLowerCase();
      const filtered = !term ? _adminUsersCache : _adminUsersCache.filter(u =>
        String(u.email||"").toLowerCase().includes(term) ||
        String(u.nombre||"").toLowerCase().includes(term) ||
        String(u.nomina||u.noNomina||u.numeroNomina||"").toLowerCase().includes(term) ||
        String(u.area||"").toLowerCase().includes(term) ||
        String(u.empresa||"").toLowerCase().includes(term) ||
        String(u.role||"").toLowerCase().includes(term) ||
        String(u.uid||u.id||"").toLowerCase().includes(term)
      );
      paintAdminUsers(filtered);
    }

    function paintIncompleteUsers(list=[]){
      const wrap = document.getElementById("adminIncompleteUsersWrap");
      if(!wrap) return;
      if(!list.length){
        wrap.innerHTML = "";
        return;
      }
      wrap.innerHTML = `
        <div class="divider"></div>
        <div class="card" style="border-color:rgba(245,158,11,.42);background:rgba(245,158,11,.06);box-shadow:none;">
          <div class="row" style="justify-content:space-between;align-items:flex-start;">
            <div>
              <h3 style="margin:0 0 4px;">Perfiles incompletos <span class="pill warn">${list.length}</span></h3>
              <p class="muted" style="margin:0;">No aparecen en el listado normal. Revisa cada documento antes de repararlo o eliminarlo de Firestore.</p>
            </div>
          </div>
          <div class="users-table-scroll" style="margin-top:12px;">
            <table class="table">
              <thead><tr><th>UID / documento</th><th>Nombre</th><th>Correo</th><th>Última acción</th><th>Acciones</th></tr></thead>
              <tbody>
                ${list.map(u=>`<tr>
                  <td><code>${esc(u.uid || u.id || "-")}</code></td>
                  <td>${esc(u.nombre || "-")}</td>
                  <td>${esc(u.email || "-")}</td>
                  <td>${esc(u.profileLastAction || "Origen no registrado")}</td>
                  <td><div class="row" style="gap:8px;flex-wrap:nowrap;">
                    <button class="secondary" data-action="repairIncompleteUser" data-uid="${esc(u.uid || u.id)}">Reparar</button>
                    <button class="secondary danger" data-action="deleteIncompleteUser" data-uid="${esc(u.uid || u.id)}">Eliminar documento</button>
                  </div></td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    function paintAdminUsers(list){
      const wrap = document.getElementById("adminUsersWrap");
      if(!wrap) return;

      wrap.innerHTML = `
<table class="table admin-users-table">
  <thead>
    <tr>
      <th>Nombre</th>
      <th>Nómina</th>
      <th>Correo</th>
      <th>Área</th>
      <th>Teléfono</th>
      <th>Rol</th>
      <th>Autoriza activo</th>
      <th>Estado</th>
      <th>Acciones</th>
    </tr>
  </thead>

  <tbody>
    ${list.map(u => `
      <tr>
        <td><b>${esc(u.nombre || "-")}</b></td>
        <td>${esc(u.nomina || u.noNomina || u.numeroNomina || "Pendiente")}</td>
        <td>${esc(u.email || "-")}</td>
        <td>${esc(u.area || "-")}</td>
        <td>${esc(u.telefono || "-")}</td>

        <td><b>${esc(u.role || ROLES.PENDIENTE)}</b></td>

        <td style="text-align:center;">
          <input type="checkbox" data-action="toggleAutorizaValeActivo" data-uid="${esc(u.uid)}" ${u.puedeAutorizarValeActivo === true ? "checked" : ""} aria-label="Autoriza vales de activo para ${esc(u.nombre || u.email || "usuario")}">
        </td>

        <td>
          <span class="pill"
                style="
                  background:${u.aprobado ? 'rgba(34,197,94,.15)' : 'rgba(250,204,21,.15)'};
                  border-color:${u.aprobado ? 'rgba(34,197,94,.45)' : 'rgba(250,204,21,.45)'};
                  color:${u.aprobado ? '#86efac' : '#fde68a'};
                ">
            <span class="dot ${u.aprobado ? 'ok' : 'warn'}"></span>
            ${u.aprobado ? 'Aprobado' : 'Pendiente'}
          </span>
        </td>

        <td>
          <div class="user-action-buttons">
            <button class="secondary user-icon-action"
                  data-action="openUserModal"
                  data-uid="${esc(u.uid)}"
                  title="Editar usuario"
                  aria-label="Editar usuario ${esc(u.nombre || u.email || "")}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>
            </button>
            ${String(u.role || "") === ROLES.GUARDIA ? `
              <button class="secondary user-icon-action"
                    data-action="rondineroGuardiaQR"
                    data-uid="${esc(u.uid)}"
                    title="Generar QR de guardia"
                    aria-label="Generar QR de guardia para ${esc(u.nombre || u.email || "")}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"></path><path d="M14 14h3v3h-3zM18 14h3M21 17v4h-4M14 18v3"></path></svg>
              </button>
            ` : ""}
            <button class="secondary danger user-icon-action"
                    data-action="deleteUser"
                    data-uid="${esc(u.uid)}"
                    title="Eliminar usuario"
                    aria-label="Eliminar usuario ${esc(u.nombre || u.email || "")}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join("")}
  </tbody>
</table>
`;}

function renderUserModal(){
  return `
    <div class="modal-overlay vale-modal" id="userModal" style="display:none;">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h3 style="margin:0;">Editar usuario</h3>
            <small>Actualiza datos visibles, rol y aprobación.</small>
          </div>
          <div class="modal-actions">
            <button class="secondary" data-action="closeUserModal">Cerrar</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="two">
            <div>
              <label>Nombre</label>
              <input id="editUserNombre">
            </div>
            <div>
              <label>Correo</label>
              <input id="editUserEmail" type="email">
            </div>
            <div>
              <label>Número de nómina</label>
              <input id="editUserNomina" inputmode="numeric" autocomplete="off" placeholder="Ej. 1653">
            </div>
            <div>
              <label>Área</label>
              <input id="editUserArea">
            </div>
            <div>
              <label>Empresa</label>
              <input id="editUserEmpresa">
            </div>
            <div>
              <label>Teléfono</label>
              <input id="editUserTelefono">
            </div>
            <div>
              <label>Rol</label>
              <select id="editUserRole">
                ${ALL_ROLES.map(r => `<option value="${r}">${esc(roleLabel(r))}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="divider"></div>
          <label class="pill" style="width:max-content;">
            <input id="editUserAprobado" type="checkbox" style="width:auto; margin-right:8px;">
            Usuario aprobado
          </label>
          <label class="pill" style="width:max-content;margin-top:8px;">
            <input id="editUserAutorizaValeActivo" type="checkbox" style="width:auto; margin-right:8px;">
            Puede autorizar vales de activo
          </label>
          <div class="divider"></div>
          <div class="row">
            <button data-action="saveUserModal">Guardar cambios</button>
            <button class="secondary" data-action="closeUserModal">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderBulkUsersModal(){
  const roleCodes = ALL_ROLES.filter(r => r !== ROLES.PENDIENTE).join(", ");
  return `
    <div class="modal-overlay vale-modal" id="bulkUsersModal" style="display:none;">
      <div class="modal" style="max-width:920px;">
        <div class="modal-head">
          <div>
            <h3 style="margin:0;">Agregar usuarios</h3>
            <small>Crea varias cuentas de Firebase sin cerrar tu sesión administrativa.</small>
          </div>
          <div class="modal-actions"><button class="secondary" data-action="closeBulkUsersModal">Cerrar</button></div>
        </div>
        <div class="modal-body">
          <div class="pill" style="display:block;white-space:normal;line-height:1.5;">
            <b>Formato por fila:</b> Nombre; Correo; Contraseña temporal; Rol; Área; Empresa; Teléfono; Nómina<br>
            <small>Roles válidos: ${esc(roleCodes)}. Puedes pegar directamente desde Excel. Máximo 50 usuarios.</small>
          </div>
          <div style="height:10px;"></div>
          <label>Usuarios *</label>
          <textarea id="bulkUsersInput" rows="12" spellcheck="false" placeholder="Ana López;ana@empresa.com;Temporal2026;anfitrion;Compras;Caborca;6621234567;1653&#10;Luis Pérez;luis@empresa.com;Temporal2026;guardia;Seguridad;Caborca;6627654321;"></textarea>
          <label class="pill" style="width:max-content;margin-top:10px;">
            <input id="bulkUsersApproved" type="checkbox" checked style="width:auto;margin-right:8px;"> Crear usuarios aprobados
          </label>
          <div id="bulkUsersProgress" style="margin-top:10px;color:var(--muted);font-size:12px;"></div>
          <div id="bulkUsersResults" style="margin-top:10px;max-height:240px;overflow:auto;"></div>
          <div class="divider"></div>
          <div class="row">
            <button data-action="createBulkUsers">Crear usuarios</button>
            <button class="secondary" data-action="closeBulkUsersModal">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openBulkUsersModal(){
  if(!requirePerm("admin_roles","Solo ADMIN puede crear usuarios.")) return;
  const modal = document.getElementById("bulkUsersModal");
  if(!modal) return;
  const progress = document.getElementById("bulkUsersProgress");
  const results = document.getElementById("bulkUsersResults");
  if(progress) progress.textContent = "";
  if(results) results.innerHTML = "";
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("bulkUsersInput")?.focus(), 50);
}

function closeBulkUsersModal(){
  const modal = document.getElementById("bulkUsersModal");
  if(modal) modal.style.display = "none";
}

function parseBulkUsers(text){
  const rows = String(text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if(rows.length > 50) throw new Error("El máximo es de 50 usuarios por operación.");
  const users = [];
  const errors = [];
  rows.forEach((line, index) => {
    const separator = line.includes("\t") ? "\t" : ";";
    const cols = line.split(separator).map(x => x.trim());
    if(index === 0 && /correo|email/i.test(cols[1] || "") && /nombre/i.test(cols[0] || "")) return;
    const [nombre, emailRaw, password, roleRaw, area="", empresa="", telefono="", nominaRaw=""] = cols;
    const email = String(emailRaw || "").toLowerCase();
    const role = String(roleRaw || "").toLowerCase();
    const nomina = String(nominaRaw || "").trim();
    const rowNo = index + 1;
    if(!nombre) errors.push(`Fila ${rowNo}: falta nombre.`);
    else if(!/^\S+@\S+\.\S+$/.test(email)) errors.push(`Fila ${rowNo}: correo inválido.`);
    else if(String(password || "").length < 6) errors.push(`Fila ${rowNo}: la contraseña debe tener al menos 6 caracteres.`);
    else if(!ALL_ROLES.includes(role) || role === ROLES.PENDIENTE) errors.push(`Fila ${rowNo}: rol inválido (${roleRaw || "vacío"}).`);
    else if(nomina && !/^\d+$/.test(nomina)) errors.push(`Fila ${rowNo}: la nómina debe contener sólo números.`);
    else users.push({ rowNo, nombre, email, password, role, area, empresa, telefono, nomina });
  });
  const duplicateEmails = users.map(u => u.email).filter((email, i, arr) => arr.indexOf(email) !== i);
  if(duplicateEmails.length) errors.push(`Correos repetidos: ${[...new Set(duplicateEmails)].join(", ")}.`);
  return { users, errors };
}

function bulkUserErrorMessage(error){
  const code = String(error?.code || "");
  if(code.includes("email-already-in-use")) return "el correo ya tiene una cuenta";
  if(code.includes("invalid-email")) return "correo inválido";
  if(code.includes("weak-password")) return "contraseña débil";
  if(code.includes("too-many-requests")) return "Firebase limitó temporalmente las altas";
  if(code.includes("network-request-failed")) return "sin conexión con Firebase";
  return error?.message || code || "error desconocido";
}

async function createBulkUsers(){
  if(!requirePerm("admin_roles","Solo ADMIN puede crear usuarios.")) return;
  const input = document.getElementById("bulkUsersInput");
  const progress = document.getElementById("bulkUsersProgress");
  const results = document.getElementById("bulkUsersResults");
  const createBtn = document.querySelector('[data-action="createBulkUsers"]');
  let parsed;
  try{ parsed = parseBulkUsers(input?.value || ""); }
  catch(e){ toast("Alta de usuarios",e.message || "Revisa el listado.","warn",4200); return; }
  if(parsed.errors.length || !parsed.users.length){
    if(results) results.innerHTML = `<div class="pill bad" style="display:block;white-space:normal;">${parsed.errors.length ? parsed.errors.map(esc).join("<br>") : "Agrega al menos un usuario."}</div>`;
    toast("Revisa el listado",`${parsed.errors.length || 1} problema(s) encontrado(s).`,"warn",3600);
    return;
  }
  if(!(await requireAdminPin(`crear ${parsed.users.length} usuario(s)`))) return;
  if(!confirm(`¿Crear ${parsed.users.length} cuenta(s) en Firebase Authentication?`)) return;

  const approvedRequested = !!document.getElementById("bulkUsersApproved")?.checked;
  const operationResults = [];
  let secondaryApp = null;
  let secondaryAuth = null;
  if(createBtn) createBtn.disabled = true;
  try{
    secondaryApp = initializeApp(firebaseConfig, `bulk-users-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    secondaryAuth = getAuth(secondaryApp);
    for(let i = 0; i < parsed.users.length; i++){
      const user = parsed.users[i];
      if(progress) progress.textContent = `Creando ${i + 1} de ${parsed.users.length}: ${user.email}`;
      let authCreated = false;
      let recoveredExistingAccount = false;
      try{
        let cred;
        try{
          cred = await createUserWithEmailAndPassword(secondaryAuth, user.email, user.password);
          authCreated = true;
        }catch(authError){
          if(!String(authError?.code || "").includes("email-already-in-use")) throw authError;
          if(progress) progress.textContent = `Recuperando perfil ${i + 1} de ${parsed.users.length}: ${user.email}`;
          cred = await signInWithEmailAndPassword(secondaryAuth, user.email, user.password);
          recoveredExistingAccount = true;
        }
        const approved = approvedRequested && user.role !== ROLES.PENDIENTE;
        const profileRef = doc(db, COL_USERS, cred.user.uid);
        await setDoc(profileRef, {
          uid: cred.user.uid, email: user.email, nombre: user.nombre,
          empresa: user.empresa || "", telefono: user.telefono || "", area: user.area || "",
          nomina: user.nomina || "",
          role: user.role, aprobado: approved, solicitadoTs: Date.now(),
          aprobadoTs: approved ? Date.now() : null,
          aprobadoPor: approved ? (currentUser?.uid || "") : "",
          createdByUid: currentUser?.uid || "", createdByEmail: currentUser?.email || "",
          createdAt: serverTimestamp(), updatedTs: Date.now(),
          ...userProfileAudit(recoveredExistingAccount ? "reparar_perfil_alta_masiva" : "crear_perfil_alta_masiva")
        });
        const verifiedProfile = await getDocFromServer(profileRef);
        if(!verifiedProfile.exists() || String(verifiedProfile.data()?.email || "").toLowerCase() !== user.email){
          throw new Error("Firebase no confirmó el perfil en Firestore");
        }
        operationResults.push({
          ok:true,
          email:user.email,
          uid:cred.user.uid,
          message: recoveredExistingAccount ? "perfil recuperado y verificado en Firestore" : "cuenta y perfil verificados en Firebase"
        });
      }catch(e){
        if(authCreated && secondaryAuth?.currentUser){
          await deleteAuthUser(secondaryAuth.currentUser).catch(() => {});
        }
        operationResults.push({
          ok:false,
          email:user.email,
          message: authCreated
            ? `no se pudo confirmar el perfil; la cuenta nueva fue revertida: ${bulkUserErrorMessage(e)}`
            : recoveredExistingAccount
              ? `la cuenta existe, pero no se pudo recuperar el perfil: ${bulkUserErrorMessage(e)}`
              : bulkUserErrorMessage(e)
        });
      }finally{
        if(secondaryAuth?.currentUser) await signOut(secondaryAuth).catch(() => {});
      }
    }
  }finally{
    if(secondaryAuth?.currentUser) await signOut(secondaryAuth).catch(() => {});
    if(secondaryApp) await deleteApp(secondaryApp).catch(() => {});
    if(createBtn) createBtn.disabled = false;
  }

  const okCount = operationResults.filter(r => r.ok).length;
  const failCount = operationResults.length - okCount;
  if(progress) progress.textContent = `Proceso terminado: ${okCount} creados, ${failCount} con error.`;
  if(results) results.innerHTML = operationResults.map(r => `
    <div class="pill ${r.ok ? "ok" : "bad"}" style="display:flex;margin-bottom:6px;white-space:normal;">
      <span class="dot ${r.ok ? "ok" : "bad"}"></span><b>${esc(r.email)}</b>&nbsp;—&nbsp;${esc(r.message)}${r.uid ? ` (UID: ${esc(r.uid)})` : ""}
    </div>`).join("");
  if(input && failCount === 0) input.value = "";
  toast("Alta de usuarios",`${okCount} creados; ${failCount} con error.`,failCount ? "warn" : "ok",5000);
  await loadAdminUsers();
  updatePendingBadge(true);
}

async function renderRondineroGuardiaQR(uid){
  if(!await loadFeatureDependencies("qr", "el código QR")) return renderAdminRoles();
  if(!requirePerm("admin_roles","Solo ADMIN puede generar credenciales.")) return;
  const u = _adminUsersCache.find(x => String(x.uid || x.id) === String(uid));
  if(!u || String(u.role || "") !== ROLES.GUARDIA){
    toast("Rondinero","Selecciona un usuario con rol guardia.","warn",2600);
    return;
  }
  currentView = "rondinero_guardia_qr";
  const qrText = rondineroGuardiaQrText(u);
  const guardId = `SEG-${String(u.uid || u.id || "").slice(0,4).toUpperCase().padStart(4,"0")}`;
  appEl.innerHTML = `
    <div class="guard-badge-shell">
      <div class="printable guard-badge">
        <div class="guard-badge-hole"></div>
        <div class="guard-badge-panel">
          <div class="guard-badge-top">
            <div class="guard-badge-shield" aria-hidden="true">
              <svg viewBox="0 0 96 96" role="img">
                <path d="M48 8 82 22v22c0 22-13 37-34 48C27 81 14 66 14 44V22L48 8Z" fill="#fff"/>
                <path d="M48 15 75 26v19c0 17-10 30-27 40-17-10-27-23-27-40V26l27-11Z" fill="none" stroke="#08284b" stroke-width="5"/>
                <rect x="32" y="42" width="32" height="26" rx="5" fill="#08284b"/>
                <path d="M38 42v-8c0-8 5-14 10-14s10 6 10 14v8" fill="none" stroke="#08284b" stroke-width="7" stroke-linecap="round"/>
                <circle cx="48" cy="54" r="4" fill="#fff"/>
                <path d="M48 58v7" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
              </svg>
            </div>
            <h2 class="guard-badge-title">SEGURIDAD</h2>
            <div class="guard-badge-subtitle">PROTEGEMOS LO QUE IMPORTA</div>
          </div>
          <div class="guard-badge-body">
            <div id="qrcode" class="guard-badge-qr-frame"></div>
            <div class="guard-badge-verify">ESCANEA PARA VERIFICAR</div>
            <div class="guard-badge-divider"><span>*</span></div>
            <h3 class="guard-badge-role">Personal de seguridad</h3>
            <div class="guard-badge-name">${esc(u.nombre || "Guardia")} ${u.email ? `&middot; ${esc(u.email)}` : ""}</div>
            <div class="guard-badge-meta">
              <div class="guard-badge-access">
              <div class="guard-badge-mini-shield">OK</div>
                <div>
                  <strong>ACCESO AUTORIZADO</strong>
                  <span>USO OBLIGATORIO DE GAFETE</span>
                </div>
              </div>
              <div class="guard-badge-id"><b>ID:</b> ${esc(guardId)}</div>
            </div>
          </div>
          <div class="guard-badge-footer"><span>Disciplina - Vigilancia - Compromiso</span></div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="row">
        <button class="secondary" data-action="adminRoles">Volver</button>
        <button class="secondary" id="btnGuardarGuardiaQR" type="button">Guardar QR PNG</button>
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
    const btn = document.getElementById("btnGuardarGuardiaQR");
    if(!btn) return;
    btn.onclick = () => {
      const canvas = box?.querySelector("canvas");
      const img = box?.querySelector("img");
      const qrDataUrl = canvas?.toDataURL("image/png") || img?.src || null;
      if(!qrDataUrl) return alert("No se pudo generar el QR");
      const a = document.createElement("a");
      a.href = qrDataUrl;
      a.download = `GAFETE-GUARDIA-${String(u.nombre || guardId).replace(/[^\w-]+/g,"_")}.png`;
      a.click();
    };
  }, 80);
}

function openUserModal(uid){
  if(!requirePerm("admin_roles")) return;
  const u = [..._adminUsersCache, ..._adminIncompleteUsersCache].find(x => String(x.uid || x.id) === String(uid));
  if(!u) return toast("No encontrado","No se encontró el usuario.","warn");
  _editingUserUid = String(uid);
  const set = (id, value) => { const el = document.getElementById(id); if(el) el.value = value || ""; };
  set("editUserNombre", u.nombre || "");
  set("editUserEmail", u.email || "");
  set("editUserNomina", u.nomina || u.noNomina || u.numeroNomina || "");
  set("editUserArea", u.area || "");
  set("editUserEmpresa", u.empresa || "");
  set("editUserTelefono", u.telefono || "");
  set("editUserRole", u.role || ROLES.PENDIENTE);
  const chk = document.getElementById("editUserAprobado");
  if(chk) chk.checked = !!u.aprobado && (u.role || ROLES.PENDIENTE) !== ROLES.PENDIENTE;
  const chkActivo = document.getElementById("editUserAutorizaValeActivo");
  if(chkActivo) chkActivo.checked = u.puedeAutorizarValeActivo === true;
  const modal = document.getElementById("userModal");
  if(modal) modal.style.display = "flex";
}

function closeUserModal(){
  _editingUserUid = null;
  const modal = document.getElementById("userModal");
  if(modal) modal.style.display = "none";
}

async function saveUserModal(){
  if(!requirePerm("admin_roles","Solo ADMIN puede editar usuarios.")) return;
  if(!_editingUserUid) return;
  if(!(await requireAdminPin("editar usuario"))) return;
  const role = document.getElementById("editUserRole")?.value || ROLES.PENDIENTE;
  const aprobadoManual = !!document.getElementById("editUserAprobado")?.checked;
  const existingUser = [..._adminUsersCache, ..._adminIncompleteUsersCache].find(x => String(x.uid || x.id) === String(_editingUserUid));
  const aprobado = role === ROLES.PENDIENTE ? false : aprobadoManual;
  const wasPending = (existingUser?.role || ROLES.PENDIENTE) === ROLES.PENDIENTE && existingUser?.aprobado !== true;
  const payload = {
    uid: String(_editingUserUid),
    nombre: document.getElementById("editUserNombre")?.value.trim() || "",
    email: document.getElementById("editUserEmail")?.value.trim() || "",
    nomina: document.getElementById("editUserNomina")?.value.trim() || "",
    area: document.getElementById("editUserArea")?.value.trim() || "",
    empresa: document.getElementById("editUserEmpresa")?.value.trim() || "",
    telefono: document.getElementById("editUserTelefono")?.value.trim() || "",
    role,
    aprobado,
    puedeAutorizarValeActivo: !!document.getElementById("editUserAutorizaValeActivo")?.checked,
    ignorarPendiente: role === ROLES.PENDIENTE,
    updatedTs: Date.now(),
    updatedByUid: currentUser?.uid || "",
    ...userProfileAudit(userProfileIsComplete(existingUser, _editingUserUid) ? "editar_perfil_admin" : "reparar_perfil_admin")
  };
  if(!userProfileIsComplete({ uid:_editingUserUid, nombre:payload.nombre, email:payload.email }, _editingUserUid)){
    toast("Perfil incompleto","Para guardar o reparar el perfil se requieren UID, nombre y correo.","warn",4200);
    return;
  }
  if(payload.nomina && !/^\d+$/.test(payload.nomina)){
    toast("Nómina inválida","El número de nómina debe contener únicamente dígitos.","warn",4200);
    return;
  }
  if(aprobado && (!existingUser?.aprobado || wasPending)){
    payload.aprobadoTs = Date.now();
    payload.aprobadoPor = currentUser.uid;
  }
  await updateDoc(doc(db, COL_USERS, _editingUserUid), payload);
  valeActivoAutorizadoresCache = [];
  valeActivoAutorizadoresTs = 0;
  valePersonalAutorizadoresCache = [];
  valePersonalPerfilesCache = [];
  valePersonalAutorizadoresTs = 0;
  if(String(_editingUserUid) === String(currentUser?.uid || "")){
    currentUser.puedeAutorizarValeActivo = payload.puedeAutorizarValeActivo;
    currentUser.nomina = payload.nomina;
    localStorage.setItem(LS_USER, JSON.stringify(currentUser));
  }
  toast("Usuario actualizado", payload.nombre || payload.email || _editingUserUid, "ok", 2400);
  closeUserModal();
  await loadAdminUsers();
  updatePendingBadge(true);
}

async function toggleAutorizaValeActivo(uid, enabled){
  if(!requirePerm("admin_roles","Solo ADMIN puede asignar autorizadores.")) return;
  const u = _adminUsersCache.find(x => String(x.uid || x.id) === String(uid));
  if(!u) return toast("No encontrado","No se encontró el usuario.","warn");
  if(!(await requireAdminPin(enabled ? "habilitar autorizador de vales de activo" : "retirar autorización de vales de activo"))){
    await loadAdminUsers();
    return;
  }
  try{
    await updateDoc(doc(db, COL_USERS, String(uid)), {
      puedeAutorizarValeActivo: Boolean(enabled),
      autorizacionValeActivoUpdatedTs: Date.now(),
      autorizacionValeActivoUpdatedByUid: currentUser?.uid || "",
      autorizacionValeActivoUpdatedByEmail: currentUser?.email || "",
      updatedTs: Date.now(),
      ...userProfileAudit(enabled ? "habilitar_autorizacion_activo" : "retirar_autorizacion_activo")
    });
    valeActivoAutorizadoresCache = [];
    valeActivoAutorizadoresTs = 0;
    if(String(uid) === String(currentUser?.uid || "")) currentUser.puedeAutorizarValeActivo = Boolean(enabled);
    toast("Permiso actualizado",`${u.nombre || u.email || "El usuario"} ${enabled ? "puede autorizar" : "ya no puede autorizar"} vales de activo.`,"ok",3600);
  }catch(e){
    console.error(e);
    toast("No se pudo actualizar",e?.message || "Revisa permisos de Firebase.","bad",4600);
  }
  await loadAdminUsers();
}

async function deleteUser(uid){
  if(!requirePerm("admin_roles","Solo ADMIN puede eliminar usuarios.")) return;
  if(String(uid) === String(currentUser?.uid)){
    toast("No permitido","No puedes eliminar tu propio usuario activo.","warn",3200);
    return;
  }
  const u = _adminUsersCache.find(x => String(x.uid || x.id) === String(uid));
  if(!u) return toast("No encontrado","No se encontró el usuario.","warn");
  if(!(await requireAdminPin("eliminar usuario"))) return;
  if(!confirm(`¿Eliminar de la app a ${u.nombre || u.email || uid}?`)) return;
  await updateDoc(doc(db, COL_USERS, String(uid)), {
    eliminado: true,
    eliminadoTs: Date.now(),
    eliminadoPor: currentUser?.uid || "",
    aprobado: false,
    role: ROLES.PENDIENTE,
    updatedTs: Date.now(),
    ...userProfileAudit("desactivar_perfil_admin")
  });
  toast("Usuario eliminado","Se ocultó de la lista y quedó desactivado en la app.","ok",2600);
  await loadAdminUsers();
  updatePendingBadge(true);
}

async function deleteIncompleteUser(uid){
  if(!requirePerm("admin_roles","Solo ADMIN puede limpiar perfiles incompletos.")) return;
  const u = _adminIncompleteUsersCache.find(x => String(x.uid || x.id) === String(uid));
  if(!u) return toast("No encontrado","El documento ya no está en la lista de perfiles incompletos.","warn");
  if(userProfileIsComplete(u, uid)) return toast("Protegido","El perfil ya contiene nombre y correo; no se puede eliminar desde esta limpieza.","warn",4200);
  if(String(uid) === String(currentUser?.uid || "")) return toast("No permitido","No puedes eliminar el documento de tu sesión actual.","warn");
  if(!(await requireAdminPin("eliminar un documento incompleto de usuarios"))) return;
  const details = `UID: ${uid}\nNombre: ${u.nombre || "(vacío)"}\nCorreo: ${u.email || "(vacío)"}\nOrigen: ${u.profileLastAction || "no registrado"}`;
  if(!confirm(`ELIMINAR DOCUMENTO INCOMPLETO\n\n${details}\n\nEsto elimina únicamente el documento de Firestore. No elimina una cuenta de Firebase Authentication. ¿Continuar?`)) return;
  await deleteDoc(doc(db, COL_USERS, String(uid)));
  toast("Documento eliminado","Se eliminó el perfil incompleto de Firestore.","ok",3600);
  await loadAdminUsers();
}
    // -------------------------
    // Portal proveedor (simple)
    // -------------------------
    function renderProveedor(){
      if(!requirePerm("buscar_proveedor","Tu rol no puede usar el portal.")) return;
      currentView = "proveedor";
      const term = (dashboardSearchTerm || qSearch?.value || "").trim().toLowerCase();
      const results = !term ? [] : visitas.filter(v => String(v.id).toLowerCase() === term).slice(0, 10);

      appEl.innerHTML = `
        <div class="card">
          <h2 style="margin:0 0 6px;">Portal Proveedor</h2>
          <p style="margin:0 0 12px;color:var(--muted);font-size:12px;">
            Escribe tu <b>ID</b> (del QR) para ver tu QR.
          </p>
          <input id="dashSearch"
            placeholder="Ingresa ID (del QR)..."
            value="${esc(dashboardSearchTerm)}"
            style="max-width:320px;" />
          <div class="divider"></div>
          ${results.length ? results.map(v => `
            <div class="tarjeta" data-action="verQR" data-id="${esc(v.id)}">
              <strong>${esc(v.proveedor)}</strong>
              <small>${esc(v.empresa)}</small>
              <div class="meta">
                <span class="pill"><span class="dot info"></span>ID: ${esc(v.id)}</span>
                ${pillCitaCreada(v)}
                <span class="pill"><span class="dot ${v.qrActivo ? "ok":"bad"}"></span>${v.qrActivo ? "QR Activo":"QR Inactivo"}</span>
              </div>
            </div>
          `).join("") : `<div style="color:var(--muted);font-size:12px;">Sin resultados.</div>`}
        </div>
      `;
    }

    // -------------------------
    // Nueva cita
    // -------------------------
    function validateEmail(v){
      if(!v) return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    function existeCitaEnHorario(fechaHoraISO, area){
  if(!fechaHoraISO || !area) return false;

  const ts = new Date(fechaHoraISO).getTime();
  const cap = capArea(area);
  const slotWindowMs = SLOT_MINUTES * 60 * 1000;

  const ocupadas = visitas.filter(v =>
    citaConsumeCapacidad(v) &&
    v.area === area &&
    typeof v.fechaHoraTs === "number" &&
    Math.abs(v.fechaHoraTs - ts) < slotWindowMs
  ).length;

  return ocupadas >= cap; // ✅ solo bloquea si ya llegó al límite
}

function agendaTodayISO(){
  return new Date().toISOString().slice(0,10);
}

function agendaDateLabel(dateISO){
  if(!dateISO || dateISO === agendaTodayISO()) return "hoy";
  return new Date(`${dateISO}T00:00:00`).toLocaleDateString("es-MX", {
    day:"2-digit",
    month:"short",
    year:"numeric"
  });
}

function renderAgendaVisual(dateISO = ""){
  const targetISO = dateISO || document.getElementById("fechaHora")?.value?.slice(0,10) || agendaTodayISO();
  const targetDate = new Date(`${targetISO}T00:00:00`);
  const citasDia = visitas.filter(v =>
    typeof v.fechaHoraTs === "number" &&
    isSameDay(v.fechaHoraTs, targetDate) &&
    citaConsumeCapacidad(v)
  );
  const slots = generarSlots();
  const slotWindowMs = SLOT_MINUTES * 60 * 1000;
  const selectedAgendaArea = document.getElementById("area")?.value || "";

  // helper: cuenta cuántas citas hay en ese slot para esa área
  function countOcupadas(area, slotHora){
    const [h, m] = slotHora.split(":").map(Number);
    const slotTs = new Date(`${targetISO}T00:00:00`);
    slotTs.setHours(h, m, 0, 0);
    const base = slotTs.getTime();

    return citasDia.filter(v => {
      if(v.area !== area) return false;
      if(typeof v.fechaHoraTs !== "number") return false;
      return Math.abs(v.fechaHoraTs - base) < slotWindowMs;
    }).length;
  }

  const totalDisponibles = AREAS.reduce((total, area) => {
    if(selectedAgendaArea && selectedAgendaArea !== area) return total;
    const cap = capArea(area);
    return total + slots.filter(hora => {
      const fechaHoraSlot = `${targetISO}T${hora}`;
      const cumpleAnticipacion = targetISO !== agendaTodayISO() || citaProveedorCumpleAnticipacion(fechaHoraSlot);
      return cumpleAnticipacion && countOcupadas(area, hora) < cap;
    }).length;
  }, 0);

  return `
    <div class="agenda-visual-head">
      <h3>${targetISO === agendaTodayISO() ? "Disponibilidad de hoy" : `Disponibilidad del ${agendaDateLabel(targetISO)}`}</h3>
      <span class="pill"><span class="dot ok"></span><b style="color:var(--text);">${totalDisponibles}</b> horarios disponibles</span>
    </div>
    ${AREAS.map(area => {
      const cap = capArea(area);
      const areaDistinta = !!selectedAgendaArea && selectedAgendaArea !== area;

      return `
        <div style="margin-bottom:14px;${areaDistinta ? "opacity:.48;" : ""}">
          <div style="font-size:13px; font-weight:700; margin-bottom:6px;">
            ${area}${cap > 1 ? ` <span style="color:var(--muted); font-weight:600;">(capacidad ${cap})</span>` : ``}
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${slots.map(hora => {
              const ocupadas = countOcupadas(area, hora);
              const ocupado = ocupadas >= cap;
              const fechaHoraSlot = `${targetISO}T${hora}`;
              const sinAnticipacion = targetISO === agendaTodayISO() && !citaProveedorCumpleAnticipacion(fechaHoraSlot);
              const noDisponible = ocupado || sinAnticipacion || areaDistinta;
              const selectedArea = selectedAgendaArea;
              const selectedHora = document.getElementById("fechaHora")?.value?.slice(11,16) || "";
              const selected = selectedArea === area && selectedHora === hora;

              return `
                <div
                  class="pill agenda-slot ${noDisponible ? "agenda-busy" : "agenda-free"} ${selected ? "agenda-selected" : ""}"
                  data-area="${area}"
                  data-hora="${hora}"
                  data-reason="${areaDistinta ? "area" : sinAnticipacion ? "anticipacion" : ocupado ? "capacidad" : ""}"
                  style="
                    cursor:${noDisponible ? "not-allowed" : "pointer"};
                    opacity:${noDisponible ? "0.9" : "1"};
                  "
                  title="${areaDistinta ? `Seleccionaste ${selectedAgendaArea}; utiliza únicamente sus horarios` : sinAnticipacion ? `Se requieren ${MIN_DIFF_MINUTES} minutos de anticipación` : ocupado ? "Horario no disponible en esta área" : "Horario disponible"}"
                >
                  ${hora}
                  ${cap > 1 ? ` (${ocupadas}/${cap})` : ``}
                  ${areaDistinta || sinAnticipacion ? " 🔒" : ocupado ? " ✖" : ""}
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }).join("")}
  `;
}

async function renderNuevo(tipoCita = "proveedor"){
  const tipoNuevo = tipoCita === "visitante" ? "visitante" : "proveedor";
  const esVisitanteNuevo = tipoNuevo === "visitante";
  if(esVisitanteNuevo && !canCreateVisitanteCita()){
    toast("Acceso denegado","Tu rol no puede crear citas de visitante.","bad",2600);
    return;
  }
  if(!esVisitanteNuevo && !canCreateProveedorCita()){
    toast("Acceso denegado","Tu rol no puede crear citas.","bad",2600);
    return;
  }
  currentView = esVisitanteNuevo ? "nuevo_visitante" : "nuevo";

  if(!esVisitanteNuevo && !proveedoresCache.length){
    await loadProveedores().catch(()=>{});
  }

  appEl.innerHTML = `
    <div class="card nueva-cita-card">
      <div class="nueva-cita-head">
        <div>
          <h2 style="margin:0 0 6px;">${esVisitanteNuevo ? "Nueva cita" : "Nueva cita proveedor"}</h2>
          <p style="margin:0;color:var(--muted);font-size:12px;">
            Captura datos mínimos.
          </p>
        </div>
      </div>
      <input type="hidden" id="tipoVisita" value="${esc(tipoNuevo)}">
       <div class="divider"></div>

      <div class="two">
<div>
  <label id="nombreVisitanteLabel">Nombre del visitante principal *</label>
<input id="nombreVisitante" placeholder="Nombre principal">
  </div>
        <div id="visitaGrupalWrap" style="grid-column:1/-1;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;">
            <input id="visitaGrupal" type="checkbox" style="width:auto;">
            <span>Visita grupal</span>
          </label>
        </div>
        <div id="visitantesListaWrap" style="grid-column:1/-1;">
          <label>Acompañantes</label>
          <textarea id="visitantesTexto" rows="5" placeholder="Un acompañante por línea&#10;Ej:&#10;Ana López&#10;Carlos Gómez"></textarea>
        </div>
        <div id="empresaVisitanteWrap">
          <label>Empresa</label>
          <input id="empresaVisitante" placeholder="Empresa">
        </div>
        <div>  
          <label>Proveedor *</label>
          <input id="proveedorSearch" placeholder="Escribe nombre o código…" autocomplete="off"/>
          <div id="proveedorResults"></div>
          <button class="secondary" type="button" data-action="recargarProveedoresNuevaCita" data-no-sb="true" style="margin-top:8px;">Cargar proveedores</button>
          <small id="proveedoresNuevaCitaEstado" style="display:block;margin-top:6px;color:var(--muted);">${proveedoresCache.length ? `${proveedoresCache.length} proveedores disponibles.` : "Catálogo pendiente de cargar."}</small>
        </div>

        <div>
          <label>Persona a quien visita</label>
<select id="persona">
  <option value="">Seleccione…</option>
  <optgroup label="DOH">
    <option>Mayela Reynaga</option>
    <option>Sara Guereca</option>
    <option>Princess Alvarez</option>
    <option>Paola Palomares</option>
    <option>Anaís Rojas</option>
  </optgroup>

  <optgroup label="SYS">
    <option>Miriam Landeros</option>
    <option>Jesus Mendoza</option>
  </optgroup>
  
 <optgroup label="Servicio Medico">
    <option>Lilia Blancarte</option>
    <option>Nancy Villalpando</option>
  </optgroup>

  <optgroup label="Desarrollo">
    <option>Ángel Reyes</option>
    <option>Montserrat Campos</option>
    <option>Fernanda Ortiz</option>
    <option>Mario Barrios</option>
    <option>Jaime Hernández</option>
    <option>Antonio Gutiérrez</option>
    <option>Jaret Fernández </option>
  </optgroup>

  <optgroup label="Ventas">
    <option>Maru Medina</option>
    <option>Alejandro Herrera</option>
    <option>Javier Sánchez</option>
    <option>Ivonne Soto</option>
    <option>Joselyn Paz</option>
    <option>Juana Ávila</option>
    <option>Marcela Chacón</option>
    <option>Adaneli Aguilera</option>
    <option>Andrea González</option>
  </optgroup>

  <optgroup label="TI">
    <option>Soraya Rodríguez</option>
    <option>Diego Guillen</option>
  </optgroup>

  <optgroup label="Mercadotecnia">
    <option>Alfredo García</option>
    <option>Edgar Cruz</option>
    <option>Nathalie Hernández</option>
    <option>Renata Díaz</option>
  </optgroup>

  <optgroup label="Finanzas">
    <option>Jorge Olvera</option>
  </optgroup>

  <optgroup label="Contabilidad">
    <option>Daniela Sustaita</option>
    <option>Uriel Reyes</option>
    <option>Yolanda Hurtado</option>
  </optgroup>

  <optgroup label="Calidad">
    <option>Sergio Palomares</option>
    <option>Daniel López</option>
    <option>César Reyes</option>
    <option>Rafael Pichardo</option>
    <option>Ricardo Rivera</option>
  </optgroup>

  <optgroup label="Compras">
    <option>Jaqueline Gómez</option>
    <option>Tisbet González</option>
    <option>Miriam García</option>
    <option>Mónica Torres</option>
    <option>Hugo Reyes</option>
  </optgroup>

  <optgroup label="Logística">
    <option>Cristóbal Gutiérrez</option>
    <option>Wendy Parada</option>
    <option>Héctor Ríos</option>
    <option>Sergio Sánchez</option>
  </optgroup>

  <optgroup label="Mantenimiento">
    <option>Ambrosio Becerra</option>
    <option>Luis Salas</option>
    <option>Daniel García</option>
    <option>Refugio Araujo</option>
    <option>Oscar Sánchez</option>
  </optgroup>

  <optgroup label="Almacén">
    <option>Jesús Rodríguez</option>
  </optgroup>

  <optgroup label="Contraloría">
    <option>Martha Rodríguez</option>
  </optgroup>

  <optgroup label="Dirección General">
    <option>Luis Torres</option>
    <option>María Torres</option>
  </optgroup>

</select>

         </div>

        <div>
          <label>Área *</label>
          <select id="area">
            <option value="">— Selecciona —</option>
            <option>Aduana piel</option>
            <option>Aduana Exótico</option>
            <option>Aduana Peleteria</option>
            <option>Avíos</option>
            <option>Otros</option>
          </select>
        </div>

        <div>
          <label>Motivo *</label>
          <select id="motivo">
            <option value="">— Selecciona —</option>
            <option>Entrega</option>
            <option>Recolección</option>
            <option>Visita</option>
            <option>Entrevista</option>
            <option>Junta</option>
            <option>Servicio</option>
            <option>Pago</option>
            <option>Exámen médico</option>
            <option>Otro</option>
          </select>
        </div>
         
        ${esVisitanteNuevo ? "" : `<div style="grid-column:1/-1;">
          ${renderFacturaOcEditor([{ facturaNo:"", ocNos:[] }], "facturasOcEditor")}
        </div>`}
        <div>
        <label>Material a recibir</label>
        <textarea
        id="materialRecibir"
        rows="2"
        placeholder="Ej. Piel res, color negro, 120 pies"
        ></textarea>
        </div>
      </div>  
      <div class="divider"></div>
      <div class="two">
        <div id="fechaVisitanteWrap">
          <label>Fecha</label>
          <input type="date" id="fechaVisitante"/>
        </div>
        <div id="horaVisitanteWrap">
          <label>Hora</label>
          <input type="time" id="horaVisitante"/>
        </div>
        ${esVisitanteNuevo ? `
        <div class="modalidad-visita-field" style="grid-column:1/-1;">
          <label for="modalidadVisita">Tipo de visita *</label>
          <select id="modalidadVisita" class="modalidad-visita-select">
            <option value="normal" selected>Visita normal</option>
            <option value="especial">Visita especial</option>
            <option value="devolucion">Devolución</option>
          </select>
        </div>
        ` : ""}
        <div>
          <label>Fecha y hora *</label>
          <input type="datetime-local" id="fechaHora" min="${datetimeLocalValue(esVisitanteNuevo ? Date.now() : minimoFechaHoraProveedorTs())}" ${esVisitanteNuevo ? "" : `step="${SLOT_MINUTES * 60}"`}/>
        </div>
      </div>
      <div id="agendaVisual">
        ${renderAgendaVisual()}
      </div>
      
     

      <div class="divider"></div>
      <div class="row">
        <button data-action="guardar">${esVisitanteNuevo ? "Crear cita" : "Guardar y Generar QR"}</button>
        ${esVisitanteNuevo ? `<button class="secondary" data-action="limpiarNuevaCita">Limpiar</button>` : ""}
        <button class="secondary" data-action="home">${esVisitanteNuevo ? "Volver" : "Cancelar"}</button>
      </div>
    </div>
  `;
  
const tipoSel = document.getElementById("tipoVisita");

function updateVisitaGrupalUI(){
  const esVisitante = tipoSel?.value === "visitante";
  const grupal = esVisitante && !!document.getElementById("visitaGrupal")?.checked;
  toggleBlock("visitaGrupal", esVisitante);
  toggleBlock("visitantesTexto", grupal);
  if(!grupal){
    const visitantesTexto = document.getElementById("visitantesTexto");
    if(visitantesTexto) visitantesTexto.value = "";
  }
}

document.getElementById("visitaGrupal")?.addEventListener("change", updateVisitaGrupalUI);

if(tipoSel){
  tipoSel.addEventListener("change", () => {
    const esVisitante = tipoSel.value === "visitante";

    // ✅ CAMPOS VISITANTE
    toggleBlock("nombreVisitante", esVisitante);
    updateVisitaGrupalUI();
    toggleBlock("empresaVisitante", esVisitante);
    toggleBlock("persona", true);
    toggleBlock("motivo", true);
    toggleBlock("fechaVisitante", esVisitante);
    toggleBlock("horaVisitante", esVisitante);
    toggleBlock("fechaHora", !esVisitante);

    // ✅ CAMPOS PROVEEDOR
    toggleBlock("proveedorSearch", !esVisitante);
    toggleBlock("area", !esVisitante);
    toggleBlock("materialRecibir", !esVisitante);

    // ✅ FACTURAS / OC
    const fo = document.getElementById("facturasOcEditor");
    if(fo){
      fo.style.display = esVisitante ? "none" : "";
    }

    // ✅ 🆕 AGENDA (disponibilidad)
    const agenda = document.getElementById("agendaVisual");
    if(agenda){
      agenda.style.display = esVisitante ? "none" : "";
    }

    // ✅ LIMPIAR SI ES VISITANTE
    if(esVisitante){
      const proveedor = document.getElementById("proveedorSearch");
      if(proveedor) proveedor.dataset.codigo = "";
      if(proveedor) proveedor.value = "";

      const area = document.getElementById("area");
      if(area) area.value = "Visitantes";

      const material = document.getElementById("materialRecibir");
      if(material) material.value = "";
    }else{
      const fechaVisitante = document.getElementById("fechaVisitante");
      const horaVisitante = document.getElementById("horaVisitante");
      if(fechaVisitante) fechaVisitante.value = "";
      if(horaVisitante) horaVisitante.value = "";
    }
  });

  // ✅ Ejecutar al cargar
  tipoSel.dispatchEvent(new Event("change"));
}

function toggleBlock(id, show){
  const el = document.getElementById(id);
  if(!el) return;

  const wrapper = el.closest("div");
  if(wrapper){
    wrapper.style.display = show ? "" : "none";
  }
}
  setupProveedorAutocomplete();
  cargarPersonasVisitaSelect(document.getElementById("persona"));

  async function refreshAgendaNuevo(){
    const cont = document.getElementById("agendaVisual");
    const fechaInput = document.getElementById("fechaHora");
    if(!cont) return;
    const dateISO = fechaInput?.value?.slice(0,10) || agendaTodayISO();
    if(navigator.onLine){
      await syncDay(new Date(`${dateISO}T00:00:00`)).catch(()=>{});
    }
    cont.innerHTML = renderAgendaVisual(dateISO);
  }

  function limpiarFechaHoraProveedorNoDisponible(){
    const fechaInput = document.getElementById("fechaHora");
    const areaInput = document.getElementById("area");
    if(!fechaInput?.value || !areaInput?.value) return false;
    if(!existeCitaEnHorario(fechaInput.value, areaInput.value)) return false;
    const hora = new Date(fechaInput.value).toLocaleTimeString("es-MX", { hour:"2-digit", minute:"2-digit" });
    toast(
      "Horario no disponible",
      `${areaInput.value} ya alcanzó su capacidad para las ${hora}. Selecciona uno de los horarios disponibles mostrados en la agenda.`,
      "warn",
      6000
    );
    fechaInput.value = "";
    return true;
  }
  
  document.getElementById("agendaVisual")
  ?.addEventListener("click", e => {

  const slot = e.target.closest(".agenda-slot");
  if(!slot) return;
  const areaInput = document.getElementById("area");
  if(areaInput?.value && areaInput.value !== slot.dataset.area){
    toast(
      "Horario de otra área",
      `Seleccionaste ${areaInput.value}. Elige un horario dentro de esa misma área o cambia primero el área seleccionada.`,
      "warn",
      5200
    );
    return;
  }
  if(slot.classList.contains("agenda-busy")){
    if(slot.dataset.reason === "anticipacion") validarAnticipacionCitaProveedor(`${document.getElementById("fechaHora")?.value?.slice(0,10) || agendaTodayISO()}T${slot.dataset.hora}`);
    return;
  }

  const hora = slot.dataset.hora;
  const area = slot.dataset.area;
  const fechaInput = document.getElementById("fechaHora");

  const fecha = fechaInput.value.slice(0,10) || agendaTodayISO();
  const fechaHoraSlot = `${fecha}T${hora}`;
  if(!validarCitaNoPasada(fechaHoraSlot)) return;
  if(!validarAnticipacionCitaProveedor(fechaHoraSlot)) return;
  if(areaInput) areaInput.value = area || "";
  fechaInput.value = fechaHoraSlot;
  refreshAgendaNuevo();
});

document.getElementById("area")
  ?.addEventListener("change", async () => {
    await refreshAgendaNuevo();
    if(limpiarFechaHoraProveedorNoDisponible()) await refreshAgendaNuevo();
  });

document.getElementById("fechaHora")
  ?.addEventListener("change", async event => {
    const input = event.currentTarget;
    const esVisitante = document.getElementById("tipoVisita")?.value === "visitante";
    if(!esVisitante){
      aplicarMinimoFechaHoraProveedor(input);
      if(input.value){
        if(!citaProveedorEstaEnBloque(input.value)){
          validarBloqueCitaProveedor(input.value);
          input.value = "";
        }else if(!citaProveedorCumpleAnticipacion(input.value)){
          validarAnticipacionCitaProveedor(input.value);
          input.value = "";
        }
      }
    }
    await refreshAgendaNuevo();
    if(!esVisitante && limpiarFechaHoraProveedorNoDisponible()) await refreshAgendaNuevo();
  });

function syncFechaHoraVisitante(){
  const fecha = document.getElementById("fechaVisitante")?.value || "";
  const hora = document.getElementById("horaVisitante")?.value || "";
  const fechaHora = document.getElementById("fechaHora");
  if(fechaHora) fechaHora.value = fecha && hora ? `${fecha}T${hora}` : "";
}

document.getElementById("fechaVisitante")
  ?.addEventListener("change", syncFechaHoraVisitante);

document.getElementById("horaVisitante")
  ?.addEventListener("change", syncFechaHoraVisitante);

await refreshAgendaNuevo();

}

function setupProveedorAutocomplete(){
  const input = document.getElementById("proveedorSearch");
  const results = document.getElementById("proveedorResults");
  if(!input || !results) return;

  input.addEventListener("input", () => {
    const term = input.value.trim().toLowerCase();
    if(!term){
      results.innerHTML = "";
      return;
    }

    const matches = proveedoresCache
      .filter(p =>
        p.codigo.toLowerCase().includes(term) ||
        p.razonSocial.toLowerCase().includes(term)
      )
      .slice(0, 10); // 👈 máximo 10 resultados

    results.innerHTML = matches.map(p => `
      <div class="pill proveedor-opt"
           data-codigo="${esc(p.codigo)}"
           data-nombre="${esc(p.razonSocial)}">
        <b>${esc(p.codigo)}</b> - ${esc(p.razonSocial)}
      </div>
    `).join("");
  });

  results.addEventListener("click", e => {
    const opt = e.target.closest(".proveedor-opt");
    if(!opt) return;

    input.value = opt.dataset.nombre;
    input.dataset.codigo = opt.dataset.codigo;
    results.innerHTML = "";
  });
}

async function recargarProveedoresNuevaCita(){
  if(currentView !== "nuevo") return;
  const btn = document.querySelector('[data-action="recargarProveedoresNuevaCita"]');
  const estado = document.getElementById("proveedoresNuevaCitaEstado");
  const input = document.getElementById("proveedorSearch");
  const valorActual = input?.value || "";
  const codigoActual = input?.dataset.codigo || "";
  if(btn){
    btn.disabled = true;
    btn.textContent = "Cargando…";
  }
  if(estado) estado.textContent = "Actualizando catálogo desde Firebase…";
  try{
    proveedoresLoaded = false;
    await loadProveedores(true);
    if(input){
      input.value = valorActual;
      input.dataset.codigo = codigoActual;
      input.dispatchEvent(new Event("input", { bubbles:true }));
    }
    if(estado) estado.textContent = `${proveedoresCache.length} proveedores disponibles.`;
    toast("Proveedores actualizados",`${proveedoresCache.length} proveedores cargados.`,"ok",2800);
  }catch(e){
    console.error(e);
    if(estado) estado.textContent = "No se pudo actualizar el catálogo. Intenta nuevamente.";
    toast("Error","No se pudieron cargar los proveedores.","bad",3600);
  }finally{
    if(btn){
      btn.disabled = false;
      btn.textContent = "Cargar proveedores";
    }
  }
}

   function createVisitaFromForm(){
  if(!currentUser || !currentUser.uid) return null;

  const tipoVisita = document.getElementById("tipoVisita")?.value === "visitante" ? "visitante" : "proveedor";
  const esVisitante = tipoVisita === "visitante";
  const modalidadCapturada = String(document.getElementById("modalidadVisita")?.value || "normal").toLowerCase();
  const modalidadVisita = esVisitante && ["normal","especial","devolucion"].includes(modalidadCapturada) ? modalidadCapturada : "normal";
  const visitaEspecial = esVisitante && modalidadVisita === "especial";
  const visitaDevolucion = esVisitante && modalidadVisita === "devolucion";
  if(esVisitante && !canCreateVisitanteCita()){
    toast("Acceso denegado","Tu rol no puede crear citas de visitante.","bad",2600);
    return null;
  }
  if(!esVisitante && !canCreateProveedorCita()){
    toast("Acceso denegado","Tu rol solo puede crear citas de visitante.","bad",2600);
    return null;
  }
  const nombreVisitante = (document.getElementById("nombreVisitante")?.value || "").trim();
  const visitaGrupal = esVisitante && !!document.getElementById("visitaGrupal")?.checked;
  const visitantesTexto = visitaGrupal ? (document.getElementById("visitantesTexto")?.value || "").trim() : "";
  const visitantesLista = visitantesTexto
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
  const empresaVisitante = (document.getElementById("empresaVisitante")?.value || "").trim();
  const proveedorInput = document.getElementById("proveedorSearch");
  const proveedorCodigo = esVisitante ? "" : (proveedorInput?.dataset.codigo || "");
  const proveedorNombre = esVisitante ? (nombreVisitante || visitantesLista[0] || "") : (proveedorInput?.value || "").trim();

  const persona = document.getElementById("persona").value;
  const area = esVisitante ? "Visitantes" : document.getElementById("area").value;
  const motivo = document.getElementById("motivo").value;
  const fechaVisitante = document.getElementById("fechaVisitante")?.value || "";
  const horaVisitante = document.getElementById("horaVisitante")?.value || "";
  const fechaHora = esVisitante
    ? (fechaVisitante && horaVisitante ? `${fechaVisitante}T${horaVisitante}` : "")
    : document.getElementById("fechaHora").value;
  const docs = esVisitante
    ? { ocNo:"", facturaNo:"", facturasOc:[] }
    : collectFacturaOcFromDom("facturasOcEditor");
  if(!docs) return null;
  const ocNo = docs.ocNo;
  const facturaNo = docs.facturaNo;
  const materialRecibir =
  esVisitante ? "" : document.getElementById("materialRecibir").value.trim();

  if(esVisitante && !nombreVisitante){
    toast("Campos obligatorios","Captura el nombre del visitante principal.","warn");
    return null;
  }

  if(esVisitante && visitaGrupal && !visitantesLista.length){
    toast("Campos obligatorios","Captura al menos un acompañante para la visita grupal.","warn");
    return null;
  }

  if(!esVisitante && !proveedorCodigo){
    toast("Campos obligatorios","Selecciona un proveedor del catálogo.","warn");
    return null;
  }

  if(!persona || !motivo || !fechaHora || (!esVisitante && !area)){
    toast("Campos obligatorios", esVisitante ? "Persona, Motivo, Fecha y Hora" : "Persona, Área, Motivo y Fecha", "warn");
    return null;
  }

  if(!esVisitante && !horarioCitaPermitido(fechaHora)){
    toast("Horario no permitido","No se pueden generar citas a las 5:00 pm o después.","warn");
    return null;
  }

  if(!validarCitaNoPasada(fechaHora)){
    return null;
  }

  if(!esVisitante && !validarAnticipacionCitaProveedor(fechaHora)){
    return null;
  }

  if(!esVisitante && !validarBloqueCitaProveedor(fechaHora)){
    return null;
  }

  const fechaHoraTs = new Date(fechaHora).getTime();

  if(!esVisitante && !validarReagendaProveedor({ proveedorCodigo, proveedor: proveedorNombre, fechaHoraTs })){
    return null;
  }

  // ✅ Bloquea solo si ya existe cita en ese horario PARA LA MISMA ÁREA
if(!esVisitante && existeCitaEnHorario(fechaHora, area)){
  toast("Horario no disponible", "Ya existe el máximo de citas para esa área en ese horario.", "warn");
  return null;
}
  return {
  id: Date.now().toString(),
  tipoVisita,
  tipoAcceso: tipoVisita,
  nombreVisitante: esVisitante ? nombreVisitante : "",
  visitantesTexto: esVisitante ? visitantesTexto : "",
  visitantesLista: esVisitante ? visitantesLista : [],
  visitaEspecial,
  visitaDevolucion,
  modalidadVisita: esVisitante ? modalidadVisita : "",
  visitaGrupal,
  requiereAutorizacion: visitaEspecial,
  proveedorCodigo,
  proveedor: proveedorNombre,
  empresa: esVisitante ? empresaVisitante : "",
  personaVisita: persona,
  area,
  motivo,
  fechaHora,
  fechaHoraTs,
  ocNo,
  facturaNo,
  facturasOc: docs.facturasOc,
  materialRecibir,
  status: visitaEspecial ? Status.PENDIENTE_AUTORIZACION : Status.PROGRAMADO,
  createdByUid: currentUser.uid,
  createdByEmail: currentUser.email,
  createdByName: currentUser.nombre || currentUser.email || "",
  createdTs: Date.now(),
  updatedTs: Date.now(),
  qrActivo: true
};
}
    
// -------------------------
    // QR
    // -------------------------
   async function renderQR(id){
    if(!await loadFeatureDependencies("qr", "el código QR")) return renderHome();
  currentView = "qr";
  const v = visitas.find(x => x.id == id);
  if(!v) return renderHome();
  rememberModuleReturnForVisita(v);

  if(!canSeeVisita(v)){
    toast("Acceso denegado","Tu rol solo puede ver QR de visitantes.","bad",2600);
    return renderHome();
  }

  if(!hasPerm("ver_qr") && currentUser.role !== ROLES.PROVEEDOR){
    toast("Acceso denegado","Tu rol no puede ver QR.","bad",2600);
    return renderHome();
  }

  const tipoLabel = getTipoVisitaLabel(v);
  const nombreAcceso = getNombreAcceso(v);
  const nombrePase = isVisitante(v) ? getVisitanteResumen(v) : nombreAcceso;
  const empresaAcceso = getEmpresaAcceso(v);
  const citaDate = v.fechaHora ? new Date(v.fechaHora) : null;
  const citaFecha = citaDate && !Number.isNaN(citaDate.getTime())
    ? citaDate.toLocaleDateString([], { day:"2-digit", month:"short", year:"numeric" })
    : "-";
  const citaHora = citaDate && !Number.isNaN(citaDate.getTime())
    ? citaDate.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })
    : "-";
  const folioCita = `${isVisitante(v) ? "V" : "C"}-${String(v.id).slice(-6).toUpperCase()}`;
  const codigoVerificacion = String(v.id).replace(/(.{4})/g, "$1 ").trim().toUpperCase();
  const docsRows = normalizeFacturasOc(v).filter(r => r.facturaNo || r.ocNos.length);
  const docsResumen = isVisitante(v)
    ? (getVisitantesLista(v).length ? `
      <div class="appointment-pass-docs">
        <div class="appointment-pass-doc-row">
          <b>Acompañantes</b>
          <span>${esc(getVisitantesLista(v).join(", "))}</span>
        </div>
        ${v.empresa ? `<div class="appointment-pass-doc-row"><b>Empresa</b><span>${esc(v.empresa)}</span></div>` : ""}
      </div>
    ` : "")
    : `
      <div class="appointment-pass-docs">
        ${(docsRows.length ? docsRows : [{ facturaNo:"-", ocNos:[] }]).map((r, idx) => `
          <div class="appointment-pass-doc-row">
            <b>Factura${docsRows.length > 1 ? ` ${idx + 1}` : ""}</b>
            <span>${esc(r.facturaNo || "-")}</span>
          </div>
          <div class="appointment-pass-doc-row">
            <b>OC${docsRows.length > 1 ? ` ${idx + 1}` : ""}</b>
            <span>${esc((r.ocNos || []).join(", ") || "-")}</span>
          </div>
        `).join("")}
        ${v.materialRecibir ? `<div class="appointment-pass-doc-row"><b>Material</b><span>${esc(v.materialRecibir)}</span></div>` : ""}
      </div>
    `;

  appEl.innerHTML = `
    <div class="appointment-pass-wrap">
      <div class="printable appointment-pass">
        <div class="appointment-pass-hero">
          <div>
            <div class="appointment-pass-brand">
              <img src="icon-shield-master.png" alt="Caborca Access Control" data-html2canvas-ignore="true">
              <div>
                <strong>Caborca Access Control</strong>
                <span>Seguridad - Confianza - Registro</span>
              </div>
            </div>
            <div class="appointment-pass-title">
              <h2>Cita programada</h2>
              <div class="appointment-pass-status">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
                Acceso autorizado
              </div>
            </div>
          </div>
          <div class="appointment-pass-number">
            <small>No. de cita</small>
            <b>${esc(folioCita)}</b>
            <i></i>
          </div>
        </div>

        <div class="appointment-pass-body">
          <div class="appointment-pass-person">
            <div class="appointment-pass-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>
            </div>
            <div>
              <div class="appointment-pass-label">${esc(tipoLabel)}</div>
              <div class="appointment-pass-name">${esc(nombrePase)}</div>
              <div class="appointment-pass-sub">${esc(empresaAcceso || v.empresa || v.area || "-")}</div>
              ${v.motivo ? `<div class="appointment-pass-sub">${esc(v.motivo)}</div>` : ""}
            </div>
          </div>

          <div class="appointment-pass-facts">
            <div class="appointment-pass-fact">
              <div class="appointment-pass-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>
              </div>
              <div>
                <div class="appointment-pass-label">${isVisitante(v) ? "Anfitrión" : "Contacto"}</div>
                <b>${esc(v.personaVisita || "-")}</b>
                <span>${esc(isVisitante(v) ? (v.motivo || "-") : (v.area || "-"))}</span>
              </div>
            </div>
            <div class="appointment-pass-fact">
              <div class="appointment-pass-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
              </div>
              <div>
                <div class="appointment-pass-label">Fecha y hora</div>
                <b>${esc(citaFecha)}</b>
                <span>${esc(citaHora)}</span>
              </div>
            </div>
          </div>

          <div class="appointment-pass-qr-zone">
            <div class="appointment-pass-side">
              <div class="appointment-pass-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 3 20 7v6c0 5-3 8-8 10-5-2-8-5-8-10V7l8-4Z"/><path d="m9 12 2 2 4-5"/></svg>
              </div>
              <div>Acceso<br>autorizado</div>
              <i></i>
            </div>
            <div class="appointment-pass-qr-card">
              <div id="qrcode" class="appointment-pass-qr"></div>
              <div class="appointment-pass-code">
                ${esc(codigoVerificacion)}
                <small>Código de verificación</small>
              </div>
            </div>
            <div class="appointment-pass-side">
              <div class="appointment-pass-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>
              </div>
              <div>Válido<br>${isVisitante(v) ? "60 min" : "15 min"}</div>
              <i></i>
            </div>
          </div>

          ${docsResumen}

          <div class="appointment-pass-instructions">
            <div class="appointment-pass-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
            </div>
            <div>
              <b>Instrucciones</b>
              <p>Presenta este código QR en caseta. No lo compartas con otras personas.${isVisitante(v) ? "" : " Recuerda traer orden de compra y factura cuando aplique."}</p>
              ${isVisitante(v) ? "" : `<p><b>Nota:</b> No olvides traer tu Orden de Compra y Factura.</p>`}
            </div>
          </div>
        </div>

        <div class="appointment-pass-footer">
          <span class="appointment-pass-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3 20 7v6c0 5-3 8-8 10-5-2-8-5-8-10V7l8-4Z"/><path d="m9 12 2 2 4-5"/></svg>
          </span>
          Tu seguridad, nuestra prioridad
        </div>
      </div>
    </div>

    <div class="row appointment-pass-actions">
      ${_returnToCitasComprasMode ? `
        <button class="secondary" data-action="citasComprasBack">Volver a citas</button>
      ` : _returnToEditMode ? `
        <button class="secondary" data-action="volverAEditarCita">Volver a edición</button>
      ` : ""}
      <button class="secondary" id="btnGuardarQR" type="button">Guardar pase</button>
      <button class="secondary" id="btnCompartirQR" type="button">Compartir QR</button>
      <button class="secondary" data-action="print">Guardar / Imprimir</button>
      <button class="secondary" data-action="returnDashboard">Volver</button>
    </div>
  `;

  try{
    if(!window.QRCode){
      toast("QR","La librería aún está cargando. Intenta de nuevo.","warn",2200);
      return;
    }

    const box = document.getElementById("qrcode");
    box.innerHTML = "";

    // Genera QR
    new QRCode(box, {
      text: String(v.id),
      width: 210,
      height: 210,
      colorDark: "#111827",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });

    // ===== Guardar/Compartir (tomado de kiosk.html, adaptado) =====
    const canvas = box.querySelector("canvas");
    const img = box.querySelector("img");

    const qrDataUrl =
      canvas?.toDataURL("image/png") ||
      img?.src ||
      null;

    async function appointmentPassBlob(){
      if(!await loadFeatureDependencies("capture", "la imagen del pase")) return null;
      const pass = document.querySelector(".appointment-pass");
      if(pass && window.html2canvas){
        const rendered = await window.html2canvas(pass, {
          backgroundColor: "#f8fafc",
          scale: Math.min(2, window.devicePixelRatio || 1.5),
          useCORS: false,
          allowTaint: false,
          ignoreElements: (el) => el?.hasAttribute?.("data-html2canvas-ignore")
        });
        return new Promise(resolve => rendered.toBlob(resolve, "image/png", 0.95));
      }
      if(qrDataUrl) return await (await fetch(qrDataUrl)).blob();
      return null;
    }

    // 📌 Texto completo a compartir (TODOS los datos solicitados)
    const citaFmt = v.fechaHora ? new Date(v.fechaHora).toLocaleString() : "-"; // usa el mismo origen que ya muestras
    const tipoLabel = getTipoVisitaLabel(v);
    const provFmt = isVisitante(v) ? getVisitanteResumen(v) : getNombreAcceso(v);
    const docsText = isVisitante(v) ? "" : (
      docsRows.length
        ? docsRows.map((r, idx) =>
            `• Factura${docsRows.length > 1 ? ` ${idx + 1}` : ""}: ${r.facturaNo || "-"}\n` +
            `• OC${docsRows.length > 1 ? ` ${idx + 1}` : ""}: ${(r.ocNos || []).join(", ") || "-"}\n`
          ).join("")
        : `• Factura: -\n• OC: -\n`
    );
    const reminderText = isVisitante(v) ? "" : `\n⚠️ No olvides tu OC y Factura.`;

    const shareText =
`✅ Datos de tu cita
• ${tipoLabel}: ${provFmt}
${isVisitante(v) && v.empresa ? `• Empresa: ${v.empresa}\n` : ""}${isVisitante(v) && getVisitantesLista(v).length ? `• Acompañantes: ${getVisitantesLista(v).join(", ")}\n` : ""}
${docsText}• Horario: ${citaFmt}${reminderText}`;

    // Guardar QR
    const btnGuardar = document.getElementById("btnGuardarQR");
    if(btnGuardar){
      btnGuardar.onclick = async () => {
        const blob = await appointmentPassBlob();
        if(!blob) return alert("No se pudo generar el pase");
        const passDataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        const a = document.createElement("a");
        a.href = passDataUrl;
        a.download = `CITA-${String(v.id)}.png`;
        a.click();
      };
    }

    // Compartir QR + texto con todos los datos
    const btnCompartir = document.getElementById("btnCompartirQR");
    if(btnCompartir){
      btnCompartir.onclick = async () => {
        // Si no soporta share, al menos copiamos texto para pegar en WhatsApp/correo
        if(!navigator.share){
          try{
            await navigator.clipboard.writeText(shareText);
            alert("Tu dispositivo no soporta 'Compartir'. Se copió el texto al portapapeles. Ahora pega en WhatsApp/Correo y adjunta el QR guardado.");
          }catch{
            alert("Tu dispositivo no soporta 'Compartir'. Copia manualmente los datos y adjunta el QR guardado.");
          }
          return;
        }

        const passBlob = await appointmentPassBlob();
        if(!passBlob){
          // igual comparte texto aunque no haya imagen (raro, pero posible si falla el QR)
          await navigator.share({
            title: "QR de la Cita",
            text: shareText
          });
          return;
        }

        try{
          const file = new File([passBlob], `CITA-${String(v.id)}.png`, { type: "image/png" });

          // Evita fallos en dispositivos que no pueden compartir archivos
          if(navigator.canShare && !navigator.canShare({ files: [file] })){
            // comparte solo texto (y sugiere guardar imagen)
            await navigator.share({
              title: "Datos de la Cita",
              text: shareText
            });
            toast("Compartir", "Tu dispositivo no permite compartir archivos. Se compartió el texto; guarda el QR y adjúntalo manualmente.", "warn", 3600);
            return;
          }

          await navigator.share({
            title: "QR de la Cita",
            text: shareText,     // ✅ AQUÍ van TODOS los datos
            files: [file]
          });
        }catch(e){
          console.warn("Compartir cancelado o falló:", e);
          // Cancelado por el usuario o error — no hacer toast agresivo
        }
      };
    }

  }catch(e){
    console.warn(e);
    toast("QR","No se pudo generar el QR.","bad",3600);
  }
}

// -------------------------
    // Scanner (GUARDIA/ADMIN)
    // -------------------------
    let qrScanner = null;
    function stopScanner(){
      if(qrScanner){
        try{ qrScanner.stop().catch(()=>{}).finally(()=> qrScanner = null); }catch{ qrScanner = null; }
      }
    }
    function cleanup(){ stopScanner(); }

    async function renderScanner(fromView = ""){
      if(!requirePerm("escanear_qr","Solo GUARDIA o ADMIN pueden escanear QR.")) return;
      if(!await loadFeatureDependencies("camera", "el escáner de cámara")) return renderHome();
      rememberModuleReturn(fromView || currentView);
      currentView = "scanner";
      cleanup();

      appEl.innerHTML = `
        <div class="card">
          <h2 style="margin:0 0 6px;">Escáner de accesos</h2>
          <p style="margin:0 0 10px;color:var(--muted);font-size:12px;">Escanea códigos de proveedores, visitantes y vales, o el QR NOMINA:número del gafete para localizar un permiso de personal vigente.</p>
          <div id="reader"></div>
          <div class="divider"></div>
          <div class="row"><button class="secondary" data-action="home">Cancelar</button></div>
        </div>
      `;

      try{
        if(!window.Html5Qrcode){
          toast("Escáner","La librería aún está cargando. Intenta de nuevo.","warn",2600);
          return renderHome();
        }
        qrScanner = new Html5Qrcode("reader");
      }catch(e){
        console.warn(e);
        toast("Escáner","No se pudo inicializar cámara.","bad",4200);
        return renderHome();
      }

      let scanHandled = false;
      qrScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        async (decodedText) => {
          if(scanHandled) return;
          scanHandled = true;
          stopScanner();
          await abrirFichaDesdeQR(String(decodedText).trim());
        },
        () => {}
      ).catch(err => {
        toast("Permisos", "No se pudo abrir cámara: " + err, "bad", 4200);
        renderHome();
      });
    }

    function normalizarNomina(value){
      return normalizarNominaPerfil(value);
    }

    function extraerNominaDeGafete(qrText){
      const match = String(qrText || "").trim().match(/^NOMINA:(P\d{3}|\d+)$/i);
      return match ? normalizarNomina(match[1]) : "";
    }

    function valePersonalVigenteParaGafete(v, nomina){
      const mismaNomina = valePersonalIncluyeNomina(v, nomina);
      const fechaValida = String(v?.fecha || "") === todayISO();
      const integrante = integrantesValePersonal(v).find(item => normalizarNomina(item.nomina) === normalizarNomina(nomina));
      const estadoValido = [ValeStatus.GENERADO, ValeStatus.FUERA].includes(integrante?.status || v?.status);
      return mismaNomina && fechaValida && estadoValido && v?.qrActivo !== false;
    }

    function diagnosticoGafeteSinVale(nomina){
      const relacionados = valesPersonal
        .filter(v => valePersonalIncluyeNomina(v, nomina))
        .sort((a,b) => Number(b.updatedTs || b.createdTs || 0) - Number(a.updatedTs || a.createdTs || 0));
      const deHoy = relacionados.filter(v => String(v?.fecha || "") === todayISO());
      const pendiente = deHoy.find(v => v.status === ValeStatus.PENDIENTE);
      if(pendiente){
        return { title:"Vale pendiente de autorización", message:`El gafete fue reconocido, pero el vale ${pendiente.folio || pendiente.id || "de hoy"} todavía no está autorizado.`, tone:"warn" };
      }
      const cancelado = deHoy.find(v => v.canceladoTs);
      if(cancelado){
        return { title:"Vale cancelado", message:`El gafete fue reconocido, pero el vale ${cancelado.folio || cancelado.id || "de hoy"} fue cancelado.`, tone:"bad" };
      }
      const desactivado = deHoy.find(v => v.qrActivo === false || v.status === ValeStatus.REGRESO_CANCELADO);
      if(desactivado){
        return { title:"Vale finalizado o desactivado", message:`El gafete fue reconocido, pero el vale ${desactivado.folio || desactivado.id || "de hoy"} ya no está disponible para registrar otro movimiento.`, tone:"bad" };
      }
      const futuro = relacionados.find(v => String(v?.fecha || "") > todayISO());
      if(futuro){
        return { title:"Vale programado para otra fecha", message:`El gafete fue reconocido. El próximo vale está programado para el ${valePassDate(futuro.fecha)} y todavía no puede utilizarse.`, tone:"warn" };
      }
      if(relacionados.length){
        return { title:"Sin permiso vigente para hoy", message:"El gafete fue reconocido, pero los vales encontrados pertenecen a otra fecha o ya concluyeron.", tone:"warn" };
      }
      return { title:"Sin permiso vigente", message:"El gafete fue reconocido correctamente, pero esta nómina no tiene ningún vale registrado y autorizado para hoy.", tone:"bad" };
    }

    function renderResultadoGafetePersonal({ nomina="", title="Sin permiso vigente", message="No existe un vale utilizable para hoy.", tone="bad" } = {}){
      cleanup();
      currentView = "resultado_gafete_personal";
      moduleReturnView = "vales_personal";
      try{ navigator.vibrate?.(tone === "bad" ? [140,80,140] : [120]); }catch{}
      const color = tone === "bad" ? "#dc2626" : "#d97706";
      const soft = tone === "bad" ? "rgba(220,38,38,.10)" : "rgba(217,119,6,.10)";
      appEl.innerHTML = `
        <section class="provider-dashboard-modern vale-dashboard-modern">
          <div class="card" role="status" aria-live="assertive" style="max-width:680px;margin:0 auto;border:2px solid ${color};background:linear-gradient(180deg,${soft},var(--panel));">
            <div style="display:grid;grid-template-columns:64px minmax(0,1fr);gap:16px;align-items:start;">
              <div aria-hidden="true" style="display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:${color};color:#fff;font-size:34px;font-weight:900;">!</div>
              <div>
                <div style="color:${color};font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;">Gafete reconocido</div>
                <h2 style="margin:5px 0 8px;">${esc(title)}</h2>
                ${nomina ? `<span class="pill" style="margin-bottom:12px;"><span class="dot ${tone === "bad" ? "bad" : "warn"}"></span>Nómina: <b>${esc(nomina)}</b></span>` : ""}
                <p style="margin:0;color:var(--muted);line-height:1.55;">${esc(message)}</p>
              </div>
            </div>
            <div class="divider"></div>
            <div class="row">
              <button class="ok" data-action="scan" data-from="vales_personal">Escanear otro gafete</button>
              <button class="secondary" data-action="valesPersonal">Volver a Vales de personal</button>
            </div>
          </div>
        </section>`;
    }

    async function abrirValePersonalDesdeGafete(nomina){
      let candidatos = valesPersonal.filter(v => valePersonalVigenteParaGafete(v, nomina));
      let consultaNubeConfirmada = false;
      if(navigator.onLine){
        try{
          const cloud = await cloudFetchValesPersonalByNomina(nomina);
          consultaNubeConfirmada = true;
          if(cloud.length){
            valesPersonal = mergeById(valesPersonal, cloud);
            saveValesPersonalLocal();
            candidatos = valesPersonal.filter(v => valePersonalVigenteParaGafete(v, nomina));
          }
        }catch(e){
          console.warn("No se pudo buscar la nómina en la nube:", e);
        }
      }
      candidatos.sort((a,b) => Number(b.autorizadoTs || b.updatedTs || b.createdTs || 0) - Number(a.autorizadoTs || a.updatedTs || a.createdTs || 0));
      if(!candidatos.length){
        const tieneDatosLocales = valesPersonal.some(v => valePersonalIncluyeNomina(v, nomina));
        if((navigator.onLine && !consultaNubeConfirmada) || (!navigator.onLine && !tieneDatosLocales)){
          return renderResultadoGafetePersonal({
            nomina,
            title:"No se pudo confirmar el permiso",
            message:"El gafete fue reconocido, pero no fue posible consultar Firebase ni confirmar un vale local. Revisa la conexión e intenta escanear nuevamente.",
            tone:"warn"
          });
        }
        return renderResultadoGafetePersonal({ nomina, ...diagnosticoGafeteSinVale(nomina) });
      }
      let elegido = candidatos[0];
      if(candidatos.length > 1){
        const opciones = candidatos.map((v,i) => `${i+1}. ${v.folio || v.id} - ${v.tipoPermiso || "Permiso"} - ${valeStatusLabel(v.status)}`).join("\n");
        const seleccion = prompt(`Hay ${candidatos.length} permisos vigentes para la nómina ${nomina}:\n\n${opciones}\n\nEscribe el número del permiso:`);
        const idx = Number(seleccion) - 1;
        if(!Number.isInteger(idx) || idx < 0 || idx >= candidatos.length){
          toast("Selección cancelada", "No se abrió ningún permiso.", "warn", 2600);
          return renderValesPersonal();
        }
        elegido = candidatos[idx];
      }
      toast("Gafete reconocido", `Nómina ${nomina}: permiso vigente encontrado.`, "ok", 2200);
      moduleReturnView = "vales_personal";
      return renderValePersonalOperacion(elegido.id);
    }

    async function abrirFichaDesdeQR(id){
      const qrText = String(id || "").trim();
      const qrUpper = qrText.toUpperCase();

      const nominaGafete = extraerNominaDeGafete(qrText);
      if(nominaGafete){
        return abrirValePersonalDesdeGafete(nominaGafete);
      }
      if(qrUpper.startsWith("NOMINA:")){
        return renderResultadoGafetePersonal({
          title:"Formato de gafete no válido",
          message:"El QR debe contener NOMINA: seguido por la nómina, por ejemplo NOMINA:1951 o NOMINA:P064.",
          tone:"bad"
        });
      }

      if(qrUpper.startsWith("VALE_ACTIVO:")){
        const valeId = qrText.split(":").slice(1).join(":").trim();
        let vale = valesActivos.find(x => String(x.id) === valeId);
        if(navigator.onLine){
          try{
            const cloudVale = await cloudFetchValeActivoById(valeId);
            if(cloudVale){
              vale = cloudVale;
              valesActivos = mergeById(valesActivos, [cloudVale]);
              saveValesActivosLocal();
            }
          }catch(e){
            console.warn("No se pudo buscar vale activo en nube:", e);
          }
        }
        if(!vale || !vale.qrActivo){
          toast("QR inválido","Vale no encontrado o desactivado.","bad",3600);
          moduleReturnView = "vales_activos";
          return renderModuleHome();
        }
        toast("QR detectado","Vale de activo encontrado.","ok",1800);
        return renderValeQR(vale.id);
      }

      if(qrUpper.startsWith("VALE_PERSONAL:")){
        const valeId = qrText.split(":").slice(1).join(":").trim();
        let vale = valesPersonal.find(x => String(x.id) === valeId);
        if(navigator.onLine){
          toast("Sincronizando vale","Consultando Firebase antes de validar el QR...","info",2400);
          const lookup = await cloudFetchValePersonalByIdReliable(valeId, 3);
          if(lookup.vale){
              vale = lookup.vale;
              valesPersonal = mergeById(valesPersonal, [lookup.vale]);
              saveValesPersonalLocal();
          }else if(!lookup.confirmedRead){
            toast("No se pudo consultar Firebase","El QR no fue rechazado. Revisa la conexión e intenta nuevamente.","warn",5200);
            moduleReturnView = "vales_personal";
            return renderModuleHome();
          }else{
            vale = null;
          }
        }
        if(!navigator.onLine && (!vale || !vale.qrActivo)){
          toast("Sin conexión","No hay datos locales suficientes para validar este QR. Conéctate e intenta nuevamente.","warn",5200);
          moduleReturnView = "vales_personal";
          return renderModuleHome();
        }
        if(!vale || !vale.qrActivo){
          const pendiente = vale && vale.status === ValeStatus.PENDIENTE;
          toast(pendiente ? "Pendiente de autorización" : "QR inválido", pendiente ? "Firebase indica que este vale todavía no ha sido autorizado." : "Vale de personal no encontrado o desactivado.", pendiente ? "warn" : "bad",4200);
          moduleReturnView = "vales_personal";
          return renderModuleHome();
        }
        if(String(vale.fecha || "") > todayISO()){
          toast("Vale programado",`Este QR se habilitará el ${valePassDate(vale.fecha)}. No debe registrarse antes de esa fecha.`,"warn",5200);
          moduleReturnView = "proximos_vales_personal";
          return renderModuleHome();
        }
        if(isValePersonalEntrada(vale) && String(vale.fecha || "") < todayISO()){
          toast("Vale vencido","Este QR de entrada solo podía utilizarse en la fecha indicada.","warn",4800);
          moduleReturnView = "vales_personal";
          return renderModuleHome();
        }
        toast("QR detectado","Vale de personal encontrado.","ok",1800);
        moduleReturnView = "vales_personal";
        return renderValePersonalOperacion(vale.id);
      }

      let v = visitas.find(x => String(x.id) === qrText);
      if(!v && navigator.onLine){
        try{
          const visitanteSnap = await getDoc(doc(db, COL_VISITANTES, qrText));
          const snap = visitanteSnap.exists() ? visitanteSnap : await getDoc(doc(db, COL_VISITAS, qrText));
          if(snap.exists()){
            v = { id: snap.id, ...snap.data() };
            if(visitanteSnap.exists()){
              v.tipoVisita = "visitante";
              v.tipoAcceso = "visitante";
            }
            visitas = mergeById(visitas, [v]);
            saveVisitasLocal();
          }
        }catch(e){
          console.warn("No se pudo buscar QR en nube:", e);
        }
      }

      if(v && normalizarQrVisitanteRetrasado(v)){
        saveVisitasLocal();
        if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
          await cloudUpsertVisita(v).catch(error => console.warn("No se pudo reactivar el QR del visitante:",error));
        }
      }

      if(v?.status === "pendiente_autorizacion"){
        rememberModuleReturnForVisita(v);
        toast("Pendiente de autorización","Esta solicitud aún no está autorizada. No liberar acceso.", "warn", 4200);
        return renderVisitaReturnDashboard();
      }

      if(!v || !v.qrActivo){
        toast("QR inválido","QR no encontrado o desactivado.","bad",3600);
        if(v) rememberModuleReturnForVisita(v);
        return renderVisitaReturnDashboard();
      }

      if(v.status === Status.PROGRAMADO){
  const now = Date.now();
  const diffMin = Math.round((now - v.fechaHoraTs) / 60000);

  // Proveedores: impedir el acceso antes de la ventana autorizada.
  if(bloquearProveedorAntesDeVentana(v, now)) return;

  // BLOQUEO BLOQUEO DURO POR RETRASO > 15 MIN
 if(diffMin > qrLateBlockMin(v) && !qrRetrasoAutorizado(v)){
  v.qrActivo = false;

  // ✅ guarda motivo/mins para mostrar el toast correcto después
  v.qrDesactivadoMotivo = "RETRASO";
  v.qrDesactivadoMin = diffMin;
  v.qrDesactivadoTs = Date.now();

  v.updatedTs = Date.now();
  await saveVisitas();
  if(navigator.onLine && currentUser.role !== ROLES.PENDIENTE){
    await cloudUpsertVisita(v);
  }

  toast("Acceso bloqueado",
    `Retraso de ${diffMin} min. El QR fue desactivado y requiere autorización de ADMIN.`,
    "bad", 4200
   );
  rememberModuleReturnForVisita(v);
  return renderVisitaReturnDashboard();
}

  // ✅ llegada NORMAL
  v.status = Status.LLEGADO;
  v.llegadaTs = now;
  v.updatedTs = now;
  await saveVisitas();
  if(navigator.onLine && currentUser.role !== ROLES.PENDIENTE){
    await cloudUpsertVisita(v);
  }

  toast("Llegada registrada","Se movió a 'Llegaron'.","ok",2200);
  rememberModuleReturnForVisita(v);
  return renderVisitaReturnDashboard();
}
      
// 🟢 LLEGADO → ENTRADA (GUARDIA)
  if(v.status === Status.LLEGADO && hasPerm("registrar_entrada")){
    return renderEntrada(v.id);
  }

  // 🔵 DENTRO → CALIDAD (solo proveedores)
  if(v.status === Status.DENTRO && !isVisitante(v) && hasPerm("dictaminar")){
    return renderFichaCalidad(v);
  }

  // 🔴 VISITANTE DENTRO → SALIDA directa
  if(v.status === Status.DENTRO && isVisitante(v) && hasPerm("registrar_salida")){
    return renderSalida(v.id);
  }

  // 🔴 DESPACHADO → SALIDA
  if(v.status === Status.DESPACHADO && hasPerm("registrar_salida")){
    return renderSalida(v.id);
  }

      renderFicha(v.id);
    }

    // -------------------------
    // Ficha / Entrada / Calidad / Salida
    // -------------------------

async function renderAdminProveedores(){
  if(!requirePerm("admin_proveedores","Solo ADMIN")) return;
  currentView = "admin_proveedores";

  appEl.innerHTML = `
    <div class="card">
      <h2>Catálogo de Proveedores</h2>
      <p style="color:var(--muted);font-size:12px;">
        Alta de Proveedores
      </p>

      <div class="divider"></div>

      <h3>Alta</h3>
      <div class="two">
        <div>
          <label>Código</label>
          <input id="provCodigo" placeholder="AMTO0001"/>
        </div>
        <div>
          <label>Razón Social</label>
          <input id="provRazon"/>
        </div>
      </div>

      <button class="secondary" data-action="guardarProveedor" data-no-sb="true">
      Guardar proveedor
      </button>
      <div class="divider"></div>

       <h3>Carga masiva</h3>
       <input type="file" id="provExcel" accept=".xlsx,.xls"/>
       <button class="secondary" data-action="importProveedores">
       Importar proveedores desde Excel
       </button>
      <div class="divider"></div>

      <h3>Proveedores registrados</h3>
      <div id="proveedoresRegistrados"></div>
    </div>
  `;

  await loadProveedores();
}

    function renderFicha(id){
      cleanup();
      const v = visitas.find(x => x.id == id);
      if(!v) return renderVisitaReturnDashboard();
      if(!requirePerm("ver_ficha","Tu rol no puede ver fichas.")) return;
      rememberModuleReturnForVisita(v);
      if(!canSeeVisita(v)){
        toast("Acceso denegado","Tu rol solo puede ver citas de visitantes.","bad",2600);
        return renderVisitaReturnDashboard();
      }
      currentView = "ficha";

      if(v.status === Status.DENTRO && !isVisitante(v) && hasPerm("dictaminar")){
        return renderFichaCalidad(v);
      }

      const dur = calcDuration(v);
      const tiemposVisita = visitTimeMetrics(v);
      const statusLabel =
        v.status === Status.PROGRAMADO ? "Programado" :
        v.status === Status.LLEGADO ? "Llegó" :
        v.status === Status.DENTRO ? "Dentro" :
        v.status === Status.DESPACHADO ? "Despachado" : "Finalizado";

      const statusDot =
        v.status === Status.PROGRAMADO ? "warn" :
        v.status === Status.LLEGADO ? "info" :
        v.status === Status.DENTRO ? "ok" :
        v.status === Status.DESPACHADO ? "brand" : "bad";

      const dict = (v.dictamen?.estado || "pendiente").toLowerCase();
      const dictLabel = (v.dictamen?.estado || "pendiente").toUpperCase();
      const tipo = getTipoVisita(v);
      const tipoLabel = getTipoVisitaLabel(v);
      const nombreAcceso = getNombreAcceso(v);
      const empresaAcceso = getEmpresaAcceso(v);

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

      appEl.innerHTML = `
        <div class="card printable">
          <div class="row" style="justify-content:space-between; align-items:flex-start;">
            <div>
              <h2 style="margin:0;">${esc(nombreAcceso)}</h2>
              <div style="color:var(--muted); margin-top:2px;">${esc(empresaAcceso || tipoLabel)}</div>
              <div class="meta" style="margin-top:10px;">
                <span class="pill"><span class="dot ${tipo === "visitante" ? "brand" : "info"}"></span>${esc(tipoLabel)}</span>
                ${isVisitante(v) ? renderModalidadVisitantePill(v) : ""}
                <span class="pill"><span class="dot ${statusDot}"></span>${esc(statusLabel)}</span>
                <span class="pill"><span class="dot info"></span>ID: ${esc(v.id)}</span>
                ${pillCitaCreada(v)}
                ${v.qrActivo
                  ? `<span class="pill"><span class="dot ok"></span>QR Activo</span>`
                  : `<span class="pill"><span class="dot bad"></span>QR Desactivado</span>`
                }
                ${v.guardNombre ? `<span class="pill"><span class="dot ok"></span>Guardia: ${esc(v.guardNombre)}</span>` : ""}
                ${v.gafeteNo ? `<span class="pill"><span class="dot info"></span>Gafete: ${esc(v.gafeteNo)}</span>` : ""}
                ${tipo === "proveedor" ? `<span class="badge-dictamen ${esc(dict)}">
  <span class="bdot"></span>${esc(dictLabel)}
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
                ${v.incidenciasSalida ? `<span class="pill"><span class="dot warn"></span>Incidencias</span>` : ""}
              </div>
            </div>

            <div class="row">
              <button class="secondary" data-action="verQR" data-id="${esc(v.id)}">Ver QR</button>
               <button class="secondary" data-action="returnDashboard">Volver</button>
            </div>
          </div>

          <div class="divider"></div>

          <div class="two">
            <div>
              ${isVisitante(v) && v.empresa ? `
                <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Empresa</span><b style="color:var(--text)">${esc(v.empresa)}</b></div>
                <div style="height:8px;"></div>
              ` : ""}
              ${isVisitante(v) && getVisitantesLista(v).length ? `
                <div class="pill" style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
                  <span style="color:var(--muted)">Acompañantes</span>
                  <b style="color:var(--text); text-align:right;">${esc(getVisitantesLista(v).join(", "))}</b>
                </div>
                <div style="height:8px;"></div>
              ` : ""}
              <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Visita a</span><b style="color:var(--text)">${esc(v.personaVisita || "-")}</b></div>
              <div style="height:8px;"></div>
              ${!isVisitante(v) ? `
                <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Área</span><b style="color:var(--text)">${esc(v.area || "-")}</b></div>
                <div style="height:8px;"></div>
              ` : ""}
              <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Motivo</span><b style="color:var(--text)">${esc(v.motivo || "-")}</b></div>
            </div>

            <div>
              <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Cita</span><b style="color:var(--text)">${esc(v.fechaHora ? new Date(v.fechaHora).toLocaleString() : "-")}</b></div>
              <div style="height:8px;"></div>
              <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Llegada (QR)</span><b style="color:var(--text)">${esc(fmt(v.llegadaTs))}</b></div>
              <div style="height:8px;"></div>
              <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Entrada</span><b style="color:var(--text)">${esc(fmt(v.entradaTs))}</b></div>
              <div style="height:8px;"></div>
              <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Salida</span><b style="color:var(--text)">${esc(fmt(v.salidaTs))}</b></div>
              ${isVisitante(v) && tiemposVisita.espera !== null ? `
                <div style="height:8px;"></div>
                <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Tiempo de espera</span><b style="color:var(--text)">${esc(elapsedLabel(tiemposVisita.espera))}</b></div>
              ` : ""}
              ${isVisitante(v) && tiemposVisita.dentro !== null ? `
                <div style="height:8px;"></div>
                <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Tiempo dentro</span><b style="color:var(--text)">${esc(elapsedLabel(tiemposVisita.dentro))}</b></div>
              ` : ""}
              ${isVisitante(v) && v.salidaTs && tiemposVisita.total !== null ? `
                <div style="height:8px;"></div>
                <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Tiempo total de visita</span><b style="color:var(--text)">${esc(elapsedLabel(tiemposVisita.total))}</b></div>
              ` : ""}
              ${!isVisitante(v) && dur ? `
                <div style="height:8px;"></div>
                <div class="pill" style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Tiempo Total</span><b style="color:var(--text)">${esc(dur)}</b></div>
              ` : ""}
            </div>
          </div>

          ${hasPerm("ver_documentos") && !isVisitante(v) ? `
            <div class="divider"></div>
            ${renderFacturasOcReadonly(v)}
            <div class="row" style="margin-top:8px;">
              ${v.ocFileKey ? `<button class="secondary" data-action="verOC" data-id="${esc(v.id)}">Ver OC</button>` : ""}
              ${v.facturaFileKey ? `<button class="secondary" data-action="verFactura" data-id="${esc(v.id)}">Ver Factura</button>` : ""}
            </div>
          ` : ""}

          ${v.incidenciasSalida ? `
            <div class="divider"></div>
            <div class="card" style="box-shadow:none;">
              <h3 style="margin:0 0 6px;">Incidencias de salida</h3>
              <div style="color:var(--muted);font-size:12px;">${esc(v.incidenciasSalida)}</div>
              ${v.salidaPor ? `<div style="margin-top:6px;color:var(--muted);font-size:12px;">Por: <b style="color:var(--text)">${esc(v.salidaPor)}</b></div>` : ""}
            </div>
          ` : ""}

          <div class="divider"></div>
          <div class="row">
            ${(v.status === Status.PROGRAMADO || v.status === Status.LLEGADO) && hasPerm("registrar_entrada") ? `
              <button class="ok" data-action="entrada" data-id="${esc(v.id)}">Registrar Entrada</button>
            ` : ""}
            ${v.status === Status.DESPACHADO && hasPerm("registrar_salida") ? `
              <button class="danger" data-action="salida" data-id="${esc(v.id)}">Registrar Salida</button>
            ` : ""}
            ${v.status === Status.DENTRO && isVisitante(v) && hasPerm("registrar_salida") ? `
              <button class="danger" data-action="salida" data-id="${esc(v.id)}">Registrar Salida</button>
            ` : ""}
            <button class="secondary" data-action="print">Imprimir</button>

            ${v.status === Status.FINALIZADO && currentUser?.role === ROLES.ADMIN ? `
              <button class="secondary" data-action="reactivar" data-id="${esc(v.id)}">Reactivar QR</button>
            ` : ""}

            ${hasPerm("eliminar") ? `
              <button class="secondary danger" data-action="eliminar" data-id="${esc(v.id)}">Eliminar</button>
            ` : ""}
          </div>
        </div>
      `;
    }

    function renderEntradaLegacy(id){
  if(!requirePerm("registrar_entrada","Solo GUARDIA o ADMIN pueden registrar entrada.")) return;
  currentView = "entrada";

  const isGuardia = currentUser?.role === ROLES.GUARDIA;
  const v = visitas.find(x => x.id == id);
  if(v) rememberModuleReturnForVisita(v);

  // ✅ FIX #1: evitar crash si no existe la cita en memoria
  if(!v){
    toast("No encontrado","No se encontró la cita en memoria. Sincroniza o regresa al dashboard.","warn", 3600);
    return renderVisitaReturnDashboard();
  }

  // ✅ Validación defensiva: fechaHoraTs debe existir para calcular retraso
  if(typeof v.fechaHoraTs !== "number"){
    toast("Datos incompletos","Esta cita no tiene fechaHoraTs válida. Requiere revisión por ADMIN.","warn", 4200);
    return renderVisitaReturnDashboard();
  }

  if(normalizarQrVisitanteRetrasado(v)) saveVisitasLocal();

  // BLOQUEO Bloqueo por QR desactivado
 if(!v.qrActivo){
  // ✅ Si fue desactivado por retraso, muestra el toast con minutos
  if(v.qrDesactivadoMotivo === "RETRASO"){
    const mins = Number(v.qrDesactivadoMin) || Math.round((Date.now() - v.fechaHoraTs) / 60000);
    toast(
      "Acceso bloqueado",
      `Retraso de ${mins} min. El QR fue desactivado y requiere autorización de ADMIN.`,
      "bad",
      4200
    );
  } else {
    // ✅ Caso genérico: desactivado por cancelación/salida/etc.
    toast(
      "Acceso bloqueado",
      "El QR de esta cita está desactivado. Requiere reactivación por ADMIN.",
      "bad",
      4200
    );
  }
  return renderVisitaReturnDashboard();
}

  // BLOQUEO Bloqueo por retraso > 15 min (y desactivar QR)
  const delayMin = Math.round((Date.now() - v.fechaHoraTs) / 60000);
  if(delayMin > qrLateBlockMin(v) && !qrRetrasoAutorizado(v)){

    // ✅ FIX #2: apagar QR y persistir (best effort)
    v.qrActivo = false;
    v.updatedTs = Date.now();

    // guarda local (no await)
    saveVisitas();

    // guarda nube best-effort
    if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
      cloudUpsertVisita(v).catch(()=>{});
    }

    toast(
      "Acceso bloqueado",
      `Retraso de ${delayMin} min. El QR fue desactivado y requiere autorización de ADMIN.`,
      "bad",
      4200
    );
    return renderVisitaReturnDashboard();
  }

  // ✅ Si pasa validaciones, render normal del form (tu UI original)
  appEl.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 6px;">Registrar Entrada</h2>
      <p style="margin:0 0 12px;color:var(--muted);font-size:12px;">
        Captura guardia y gafete.${isVisitante(v) ? "" : " Puedes confirmar OC y Factura si vienen con el proveedor."}
      </p>

      <label>Nombre del guardia *</label>
      <input id="guardia" value="${esc(v.guardNombre || currentUser.nombre || "")}" />

      <label>No. de Gafete *</label>
      <input id="gafeteNo" value="${esc(v.gafeteNo || "")}" />
      ${isVisitante(v) ? "" : renderFacturaOcEditor(normalizeFacturasOc(v), "entradaFacturasOcEditor")}

      <div class="divider"></div>

      <div class="row">
        <button class="ok" data-action="confirmarEntrada" data-id="${id}">
          Confirmar Entrada
        </button>
        <button class="secondary" data-action="ficha" data-id="${id}">
          Cancelar
        </button>
      </div>
    </div>
  `;
}

    function renderEntrada(id){
  if(!requirePerm("registrar_entrada","Solo GUARDIA o ADMIN pueden registrar entrada.")) return;
  currentView = "entrada";

  const isGuardia = currentUser?.role === ROLES.GUARDIA;
  const v = visitas.find(x => x.id == id);
  if(v) rememberModuleReturnForVisita(v);

  // ✅ Evita crash si no existe la cita en memoria
  if(!v){
    toast("No encontrado","No se encontró la cita en memoria. Sincroniza o regresa al dashboard.","warn", 3600);
    return renderVisitaReturnDashboard();
  }

  // ✅ Validación defensiva: se necesita fechaHoraTs para calcular retraso
  if(typeof v.fechaHoraTs !== "number"){
    toast("Datos incompletos","Esta cita no tiene fechaHoraTs válida. Requiere revisión por ADMIN.","warn", 4200);
    return renderVisitaReturnDashboard();
  }

  if(normalizarQrVisitanteRetrasado(v)) saveVisitasLocal();

  // Evita que el botón del dashboard omita la misma ventana de horario.
  if(bloquearProveedorAntesDeVentana(v)) return;

  // ⛔ QR DESACTIVADO → TOAST OBLIGATORIO AL INTENTAR REGISTRAR ENTRADA
  // (Esto es lo que pediste: aunque el botón exista, al click aquí se bloquea con toast)
  if(!v.qrActivo){
    toast(
      "Acceso bloqueado",
      "El QR de esta cita está desactivado. Requiere reactivación por ADMIN.",
      "bad",
      4200
    );
    return renderVisitaReturnDashboard();
  }

  // BLOQUEO Bloqueo por retraso > 15 min (y desactivar QR)
  const delayMin = Math.round((Date.now() - v.fechaHoraTs) / 60000);
  if(delayMin > qrLateBlockMin(v) && !qrRetrasoAutorizado(v)){

    // Apaga QR y persiste (best effort)
    v.qrActivo = false;
    v.updatedTs = Date.now();

    // guarda local (best effort)
    saveVisitas();

    // guarda nube (best effort)
    if(navigator.onLine && currentUser?.role !== ROLES.PENDIENTE){
      cloudUpsertVisita(v).catch(()=>{});
    }

    toast(
      "Acceso bloqueado",
      `Retraso de ${delayMin} min. El QR fue desactivado y requiere autorización de ADMIN.`,
      "bad",
      4200
    );
    return renderVisitaReturnDashboard();
  }

  // ✅ Si pasa validaciones, render normal del form (tu UI original)
  appEl.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 6px;">Registrar Entrada</h2>
      <p style="margin:0 0 12px;color:var(--muted);font-size:12px;">
        Captura guardia y gafete.${isVisitante(v) ? "" : " Puedes confirmar OC y Factura si vienen con el proveedor."}
      </p>

      <label>Nombre del guardia *</label>
      <input id="guardia" value="${esc(v.guardNombre || currentUser.nombre || "")}" />

      <label>No. de Gafete *</label>
      <input id="gafeteNo" value="${esc(v.gafeteNo || "")}" />
      ${isVisitante(v) ? "" : renderFacturaOcEditor(normalizeFacturasOc(v), "entradaFacturasOcEditor")}

      <div class="divider"></div>

      <div class="row">
        <button class="ok" data-action="confirmarEntrada" data-id="${id}">
          Confirmar Entrada
        </button>
        <button class="secondary" data-action="ficha" data-id="${id}">
          Cancelar
        </button>
      </div>
    </div>
  `;
}

    function renderFichaCalidad(v){
      if(!requirePerm("dictaminar","Solo CALIDAD o ADMIN pueden dictaminar.")) return;
      if(isVisitante(v)){
        toast("Flujo de visitante","Los visitantes pasan de Dentro a Finalizado, sin despachado.","info",3200);
        rememberModuleReturnForVisita(v);
        return renderSalida(v.id);
      }
      rememberModuleReturnForVisita(v);
      currentView = "calidad";
      cleanup();

      const dictSel = (v.dictamen?.estado || "pendiente").toLowerCase();

      appEl.innerHTML = `
        <div class="card printable">
          <h2 style="margin:0;">Revisión de Calidad</h2>
          <div style="color:var(--muted); margin-bottom:10px;">${esc(getNombreAcceso(v))} — ${esc(getEmpresaAcceso(v) || getTipoVisitaLabel(v))}</div>
          <div class="pill" style="margin-bottom:10px;">
            <span class="dot ok"></span>
            Entrada registrada por: <b style="color:var(--text)">${esc(v.guardNombre || "-")}</b>
            ${v.gafeteNo ? ` Gafete: <b style="color:var(--text)">${esc(v.gafeteNo)}</b>` : ""}
          </div>

          ${hasPerm("ver_documentos") && !isVisitante(v) ? `
            <div class="divider"></div>
            ${renderFacturasOcReadonly(v)}
            <div class="row" style="margin-top:8px;">
              ${v.ocFileKey ? `<button class="secondary" data-action="verOC" data-id="${esc(v.id)}">Ver OC</button>` : ""}
              ${v.facturaFileKey ? `<button class="secondary" data-action="verFactura" data-id="${esc(v.id)}">Ver Factura</button>` : ""}
            </div>
          ` : ""}

          <div class="divider"></div>

          <h3 style="margin:0 0 6px;">Dictamen (dato)</h3>
          <label>Dictamen *</label>
          <select id="dictamenEstado">
            <option value="pendiente">Pendiente</option>
            <option value="aceptado">Aceptado</option>
            <option value="rechazado">Rechazado</option>
          </select>

          <label>Incidencias</label>
          <select id="dictamenIncidencia">
            <option value="">— Selecciona —</option>
            <option value="SIN_INCIDENCIAS">Sin Incidencias</option>
            <option value="ERROR_ADMINISTRATIVO">Error Administrativo</option>
            <option value="SIN_DOCUMENTOS">Sin documentos</option>
            <option value="FALTANTES">Faltantes</option>
            <option value="EXCEDENTES">Excedentes</option>
            <option value="FUERA_DE_ESPECIFICACION">Fuera de especificación</option>
          </select>

          <label>Observaciones</label>
          <textarea id="dictamenNotas" rows="3" placeholder="Daños, faltantes, observaciones...">${esc(v.dictamen?.notas || "")}</textarea>

          <div class="divider"></div>

          <p style="margin:0 0 10px;color:var(--muted);font-size:12px;">
            Al despachar se mueve a <b>Despachados</b>.
          </p>
          <div class="row">
            <button class="ok" data-action="despachar" data-id="${esc(v.id)}">Despachar</button>
            <button class="secondary" data-action="home">Cancelar</button>
          </div>
        </div>
      `;

     setTimeout(() => {
     const sel = document.getElementById("dictamenEstado");
     if (sel) sel.value = dictSel;

     
     const inc = document.getElementById("dictamenIncidencia");
     if (inc) inc.value = (v.dictamen?.incidencia || "SIN_INCIDENCIAS");
     }, 0);
    }

   async function despachar(id){
  if(!requirePerm("despachar","Solo CALIDAD o ADMIN pueden despachar.")) return;

  const v = visitas.find(x => x.id == id);
  if(!v) return renderVisitaReturnDashboard();
  rememberModuleReturnForVisita(v);
  if(isVisitante(v)){
    toast("Flujo de visitante","Los visitantes no usan despachado; registra salida para finalizar.","warn",3200);
    return renderSalida(v.id);
  }

  // -------------------------
  // Lectura de formulario
  // -------------------------
  const estado = (document.getElementById("dictamenEstado")?.value || "pendiente").trim();
  const notas  = (document.getElementById("dictamenNotas")?.value || "").trim();

  // ✅ Default seguro: siempre guardar SIN_INCIDENCIAS si no hay selección
  const incidencia =
    (document.getElementById("dictamenIncidencia")?.value || "SIN_INCIDENCIAS").trim() || "SIN_INCIDENCIAS";

  // ✅ VALIDACIÓN CLAVE:
  // Rechazado requiere incidencia distinta a SIN_INCIDENCIAS
  if(estado.toLowerCase() === "rechazado" && incidencia === "SIN_INCIDENCIAS"){
    toast(
      "Validación",
      "Si el dictamen es RECHAZADO, debes seleccionar una incidencia (no puede ser 'Sin incidencias').",
      "warn",
      4200
    );
    return; // BLOQUEO no cambia estatus, no guarda
  }

  // -------------------------
  // Auditoría de cambios
  // -------------------------
  registrarCambio(v, "dictamen.estado", v.dictamen?.estado, estado, "dictamen");
  registrarCambio(v, "dictamen.incidencia", v.dictamen?.incidencia, incidencia, "dictamen");
  registrarCambio(v, "status", v.status, Status.DESPACHADO, "transición");

  // -------------------------
  // Guardado de dictamen
  // -------------------------
  v.dictamen = v.dictamen || {};
  v.dictamen.estado = estado;
  v.dictamen.notas = notas;
  v.dictamen.incidencia = incidencia;   // ✅ siempre definido
  v.dictamen.ts = Date.now();
  v.dictamen.por = currentUser?.nombre || "";

  // -------------------------
  // Cambio de estatus
  // -------------------------
  v.status = Status.DESPACHADO;
  v.updatedTs = Date.now();

  await saveVisitas();

  if(navigator.onLine && currentUser.role !== ROLES.PENDIENTE){
    await cloudUpsertVisita(v);
  }

  toast(
    "Despachado",
    `Se movió a 'Despachados'. Dictamen: ${estado.toUpperCase()}`,
    "ok",
    2200
  );

  renderVisitaReturnDashboard();
}
    
function renderSalida(id){
      if(!requirePerm("registrar_salida","No tienes permiso para registrar salida.")) return;
      currentView = "salida";
      cleanup();
      const v = visitas.find(x => x.id == id);
      if(!v) return renderVisitaReturnDashboard();
      rememberModuleReturnForVisita(v);

      appEl.innerHTML = `
        <div class="card">
          <h2 style="margin:0 0 6px;">Registrar Salida</h2>
          <p style="margin:0 0 12px;color:var(--muted);font-size:12px;">
            Registra incidencias si existieron.
          </p>
          <label>Incidencias (opcional)</label>
          <textarea id="incidenciasSalida" rows="4" placeholder="Ej. Documentación incompleta...">${esc(v.incidenciasSalida || "")}</textarea>
          <div class="divider"></div>
          <div class="row">
            <button class="danger" data-action="confirmarSalida" data-id="${esc(id)}">Confirmar Salida</button>
            <button class="secondary" data-action="ficha" data-id="${esc(id)}">Cancelar</button>
          </div>
        </div>
      `;
    }

async function confirmarEntrada(id) {
  if (!requirePerm("registrar_entrada", "No tienes permiso para registrar entrada.")) return;

  const v = visitas.find(x => x.id == id);
  if (!v) {
    toast("No encontrado", "La cita no existe.", "bad");
    return renderVisitaReturnDashboard();
    }
  rememberModuleReturnForVisita(v);

  // Validar campos obligatorios
  const guardia = document.getElementById("guardia")?.value.trim();
  const gafeteNo = document.getElementById("gafeteNo")?.value.trim();
  const docs = isVisitante(v)
    ? { ocNo:"", facturaNo:"", facturasOc:[] }
    : collectFacturaOcFromDom("entradaFacturasOcEditor");
  if(!docs) return;
  const ocNo = docs.ocNo;
  const facturaNo = docs.facturaNo;

  if (!guardia || !gafeteNo) {
    toast("Datos obligatorios", "Guardia y gafete son requeridos.", "warn");
    return;
  }

  // Guardar datos de entrada
  v.guardNombre = guardia;
  v.gafeteNo = gafeteNo;
  v.ocNo = ocNo;
  v.facturaNo = facturaNo;
  v.facturasOc = docs.facturasOc;

  v.entradaTs = Date.now();
  v.status = "dentro";
  v.updatedTs = Date.now();

  // Guardado local
  await saveVisitas();

  // Guardado nube (si aplica)
  if (navigator.onLine && currentUser.role !== ROLES.PENDIENTE) {
    try {
      await cloudUpsertVisita(v);
    } catch (e) {
      console.warn("Error al guardar en nube:", e);
    }
  }

  toast("Entrada registrada", `${getTipoVisitaLabel(v)} marcado como DENTRO.`, "ok", 2200);
  renderVisitaReturnDashboard();
}

    async function programarEncuestaRecepcion(v){
      if(!isVisitante(v) || !navigator.onLine) return false;
      const visitaRef = doc(db, COL_VISITANTES, String(v.id));
      const counterRef = doc(db, "app_config", "encuesta_visitantes");
      const result = await runTransaction(db, async tx => {
        const [counterSnap, visitaSnap] = await Promise.all([tx.get(counterRef), tx.get(visitaRef)]);
        if(!visitaSnap.exists()) throw new Error("La visita no existe en Firebase.");
        const saved = visitaSnap.data();
        if(Number(saved.encuestaSecuencia || 0) > 0){
          return { secuencia:Number(saved.encuestaSecuencia), programada:saved.encuestaProgramada === true };
        }
        const secuencia = Number(counterSnap.exists() ? counterSnap.data().totalSalidas || 0 : 0) + 1;
        const programada = secuencia % 2 === 0;
        tx.set(counterRef, {totalSalidas:secuencia,frecuencia:2,actualizadoTs:Date.now()}, {merge:true});
        tx.update(visitaRef, {encuestaProgramada:programada,encuestaSecuencia:secuencia,encuestaEstado:programada ? "pendiente" : "no_aplica",updatedTs:Date.now()});
        return {secuencia,programada};
      });
      v.encuestaProgramada = result.programada;
      v.encuestaSecuencia = result.secuencia;
      v.encuestaEstado = result.programada ? "pendiente" : "no_aplica";
      saveVisitasLocal();
      return result.programada;
    }

    function mostrarEncuestaRecepcion(v){
      return new Promise(resolve => {
        const labels=["Muy malo","Malo","Regular","Bueno","Excelente"];
        const emojis=["😡","🙁","😐","🙂","😄"];
        const screen=document.createElement("div");
        screen.style.cssText="position:fixed;inset:0;z-index:10000;background:linear-gradient(145deg,#eaf4ff,#cfe6ff);display:grid;place-items:center;padding:18px;";
        screen.innerHTML=`<div style="width:min(760px,100%);background:white;border:1px solid #bdd4f4;border-radius:26px;padding:clamp(22px,5vw,46px);box-shadow:0 24px 70px #1235;text-align:center;color:#0b2142;"><div style="font-size:44px;margin-bottom:8px;">😊</div><h2 style="font-size:clamp(24px,5vw,38px);margin:0 0 8px;">¿Cómo calificarías el servicio de recepción?</h2><p style="color:#5b6f8d;margin:0 0 24px;">Toca una carita. Tu respuesta es confidencial y toma sólo un segundo.</p><div style="display:grid;grid-template-columns:repeat(5,minmax(92px,1fr));gap:10px;overflow:auto;padding-bottom:4px;">${labels.map((label,i)=>`<button data-survey-rating="${i+1}" style="background:#f2f7ff;color:#0b2142;border:1px solid #cbdcf5;border-radius:18px;padding:16px 8px;min-width:92px;"><span style="display:block;font-size:42px;">${emojis[i]}</span><b>${label}</b></button>`).join("")}</div><button id="skipReceptionSurvey" class="secondary" style="margin-top:20px;">Omitir</button><p style="color:#6b7c96;font-size:13px;margin:16px 0 0;">La pantalla se cerrará en <b id="receptionSurveySeconds">15</b> segundos.</p></div>`;
        document.body.appendChild(screen);
        let seconds=15,finished=false;
        const finish=async rating=>{
          if(finished)return;finished=true;clearInterval(timer);screen.querySelectorAll("button").forEach(b=>b.disabled=true);
          const now=Date.now();
          if(rating){v.encuestaCalificacion=rating;v.encuestaPorcentaje=Math.round(((rating-1)/4)*100);v.encuestaRespondidaTs=now;v.encuestaEstado="respondida";}
          else{v.encuestaEstado="omitida";v.encuestaOmitidaTs=now;}
          v.encuestaPresentada=true;v.encuestaPresentadaTs=v.encuestaPresentadaTs||now;v.updatedTs=now;
          saveVisitasLocal();
          try{await cloudUpsertVisita(v);}catch(error){console.warn("No se pudo guardar la encuesta",error);}
          screen.innerHTML=`<div style="background:white;border-radius:24px;padding:42px;text-align:center;color:#0b2142;"><h2>${rating ? "¡Gracias por tu opinión!" : "Gracias por tu visita"}</h2><p>${rating ? "Tu evaluación fue registrada correctamente." : "La encuesta fue omitida."}</p></div>`;
          setTimeout(()=>{screen.remove();resolve(rating);},1200);
        };
        v.encuestaPresentada=true;v.encuestaPresentadaTs=Date.now();v.encuestaEstado="presentada";saveVisitasLocal();cloudUpsertVisita(v).catch(()=>{});
        screen.querySelectorAll("[data-survey-rating]").forEach(btn=>btn.onclick=()=>finish(Number(btn.dataset.surveyRating)));
        screen.querySelector("#skipReceptionSurvey").onclick=()=>finish(null);
        const timer=setInterval(()=>{seconds--;const el=screen.querySelector("#receptionSurveySeconds");if(el)el.textContent=String(seconds);if(seconds<=0)finish(null);},1000);
      });
    }

    async function confirmarSalida(id){
      const v = visitas.find(x => x.id == id);
      if(!v) return renderVisitaReturnDashboard();
      rememberModuleReturnForVisita(v);

      v.incidenciasSalida = (document.getElementById("incidenciasSalida")?.value || "").trim();
      v.salidaPor = currentUser?.nombre || "";
      v.salidaTs = Date.now();
      v.status = Status.FINALIZADO;
      v.qrActivo = false;
      v.updatedTs = Date.now();

      await saveVisitas();
      let mostrarEncuesta = false;
      if(navigator.onLine && currentUser.role !== ROLES.PENDIENTE){
        await cloudUpsertVisita(v);
        if(isVisitante(v)){
          try{mostrarEncuesta = await programarEncuestaRecepcion(v);}catch(error){console.warn("No se pudo programar la encuesta",error);}
        }
      }
      toast("Salida registrada", v.incidenciasSalida ? "Finalizado con incidencias." : "Finalizado (sin incidencias).", "ok", 2200);
      if(mostrarEncuesta) await mostrarEncuestaRecepcion(v);
      renderVisitaReturnDashboard();
    }

   async function reactivarQR(id){
  if(!requirePerm("reactivar_qr","Solo ADMIN puede reactivar QR.")) return;
  if(!(await requireAdminPin("reactivar el código QR"))) return;

  const v = visitas.find(x => x.id == id);
  if(!v) return;
  rememberModuleReturnForVisita(v);

  // ✅ Reactiva QR
  v.qrActivo = true;
  v.qrReactivadoTs = Date.now();
  v.qrReactivadoPor = currentUser?.email || currentUser?.nombre || "";

  // ✅ Limpieza del motivo (por si fue desactivado por RETRASO u otro motivo)
  // (si no existen, delete no hace nada)
  delete v.qrDesactivadoMotivo;
  delete v.qrDesactivadoMin;
  delete v.qrDesactivadoTs;

  // (Opcional, por si en algún momento guardaste "qrDesactivadoPor")
  // delete v.qrDesactivadoPor;

  v.updatedTs = Date.now();

  await saveVisitas();

  if(navigator.onLine && currentUser.role !== ROLES.PENDIENTE){
    await cloudUpsertVisita(v);
  }

  toast("QR reactivado","El QR volvió a estar activo.","ok",2200);
  renderVisitaReturnDashboard();
}

    async function eliminarVisita(id){
      if(!requirePerm("eliminar","Solo ADMIN puede eliminar registros.")) return;
      const idx = visitas.findIndex(x => x.id == id);
      if(idx < 0) return;
      const v = visitas[idx];
      rememberModuleReturnForVisita(v);

            if(citaBloqueadaPorRetraso(v)){
        toast("Cita bloqueada","No se puede eliminar. Reactiva el QR desde ADMIN para desbloquear la cita.","bad",4200);
        return;
      }

      if(v.ocFileKey){ try{ await idbDelDoc(v.ocFileKey); }catch{} }
      if(v.facturaFileKey){ try{ await idbDelDoc(v.facturaFileKey); }catch{} }

      visitas.splice(idx, 1);
      await saveVisitas();

      if(navigator.onLine) { try{ await cloudDeleteVisita(id); }catch{} }

      toast("Eliminado","Se eliminó el registro.","ok",2000);

       // ✅ Limpieza dura
      visitas = visitas.filter(v => v.id !== id);
      saveVisitasLocal();

      renderVisitaReturnDashboard();
    }

    async function limpiarFinalizadosHoy(){
 if(currentUser?.role !== ROLES.ADMIN || !requirePerm("limpiar_finalizados","Solo ADMIN puede borrar finalizados.")) return;
 if(!(await requireAdminPin("limpiar FINALIZADOS del día"))) return;
      const today = new Date();
      const antes = visitas.length;

      const toDelete = visitas.filter(v => v.status === Status.FINALIZADO && typeof v.fechaHoraTs==="number" && isSameDay(v.fechaHoraTs, today));
      if(!toDelete.length){
        toast("Sin cambios","No hay finalizados para borrar.","info",2200);
        return;
      }

      Promise.all(toDelete.map(v => {
        const ops = [];
        if(v.ocFileKey) ops.push(idbDelDoc(v.ocFileKey).catch(()=>{}));
        if(v.facturaFileKey) ops.push(idbDelDoc(v.facturaFileKey).catch(()=>{}));
        return Promise.all(ops);
      })).finally(async () => {
        // borrar en nube best effort
        if(navigator.onLine){
          await Promise.all(toDelete.map(v => cloudDeleteVisita(v.id).catch(()=>{})));
        }
        visitas = visitas.filter(v => !(v.status === Status.FINALIZADO && typeof v.fechaHoraTs==="number" && isSameDay(v.fechaHoraTs, today)));
        saveVisitasLocal();
        toast("Limpieza", `Se borraron ${antes - visitas.length} finalizados.`, "ok", 2200);
        renderVisitaReturnDashboard();
      });
    }

    async function verDocumento(key){
      if(!requirePerm("ver_documentos","Tu rol no puede ver documentos.")) return;
      const blob = await idbGetDoc(key);
      if(!blob){
        toast("Archivo","No encontrado.","warn",2400);
        return;
      }
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    }

    async function updatePendingBadge(force = false){
  if(!currentUser || currentUser.role !== ROLES.ADMIN) return;

  const count = await getPendingUsersCount(force);
  if(!sbConfigChip) return;

  if(count > 0){
    sbConfigChip.textContent = `${count} pendiente${count > 1 ? 's' : ''}`;
    sbConfigChip.style.display = 'inline-flex';
    
sbConfigChip.style.background =
  count > 0 ? 'rgba(250,204,21,.15)' : '';
sbConfigChip.style.borderColor =
  count > 0 ? 'rgba(250,204,21,.35)' : '';

  }else{
    sbConfigChip.textContent = 'ADMIN';
  }
}

    // -------------------------
    // Excel export (HOY o historial)
    // -------------------------
    async function exportExcelHastaHoy() {
  if (!requirePerm("exportar_excel", "No tienes permiso para exportar.")) return;

  const hoy = new Date();
  const hoyTs = hoy.setHours(23, 59, 59, 999);

  if (navigator.onLine) {
    const continuar = confirm("Esta exportación consulta Firestore desde el inicio hasta hoy y puede consumir muchas lecturas. Para cuidar el plan gratuito, úsala solo cuando realmente la necesites. ¿Continuar?");
    if (!continuar) {
      toast("Exportación cancelada", "No se consultó Firestore.", "info", 2200);
      return;
    }
  }

  toast("Exportando", "Cargando datos hasta hoy…", "info", 2000);

  let data = [];

  try {
    // Preferir nube si hay conexión
    if (navigator.onLine) {
      const snap = await cloudFetchByRange(0, hoyTs);
      data = snap;
    } else {
      // respaldo local
      data = visitas.filter(v =>
        typeof v.fechaHoraTs === "number" &&
        v.fechaHoraTs <= hoyTs
      );
    }
  } catch (e) {
    console.error(e);
    toast("Error", "No se pudo cargar la información.", "bad");
    return;
  }

  await exportExcelFor(data, "HASTA_HOY");
}

   async function exportExcelFor(list, suffix = ""){
  if(!requirePerm("exportar_excel","Tu rol no puede exportar Excel.")) return;
  if(!await loadFeatureDependencies("excel", "la exportación de Excel")) return;

  const headers = [
    "ID",
    "Tipo",
    "Nombre",
    "Empresa",
    "Persona a visitar",
    "Área",
    "Motivo",
    "Fecha cita",
    "Estatus",
    "QR activo",
    "Llegada (QR)",
    "Guardia entrada",
    "Gafete",
    "Entrada",
    "Dictamen calidad",
    "Incidencia calidad",
    "Notas calidad",
    "Despachado por",
    "Salida",
    "Incidencias salida",
    "No. OC",
    "No. Factura"
  ];

  const rows = list.map(v => ([
    v.id || "",
    getTipoVisitaLabel(v),
    getNombreAcceso(v) || "",
    getEmpresaAcceso(v) || "",
    v.personaVisita || "",
    v.area || "",
    v.motivo || "",
    v.fechaHora ? new Date(v.fechaHora).toLocaleString() : "",
    v.status || "",
    v.qrActivo ? "Sí" : "No",
    v.llegadaTs ? new Date(v.llegadaTs).toLocaleString() : "",
    v.guardNombre || "",
    v.gafeteNo || "",
    v.entradaTs ? new Date(v.entradaTs).toLocaleString() : "",
    (v.dictamen?.estado || "").toUpperCase(),
    v.dictamen?.incidencia || "",
    v.dictamen?.notas || "",
    v.dictamen?.por || "",
    v.salidaTs ? new Date(v.salidaTs).toLocaleString() : "",
    v.incidenciasSalida || "",
    v.ocNo || "",
    v.facturaNo || ""
  ]));

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Visitas");

  const filename = `visitas_${suffix || new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, filename);

  toast("Excel","Archivo descargado.","ok",2200);
}
    
    function exportPdfFor(list, suffix = ""){
  if(!requirePerm("exportar_excel","Tu rol no puede exportar.")) return;

  const title = `Visitas_${suffix || new Date().toISOString().slice(0,10)}`;

  const rows = list.map(v => ({
    tipo: getTipoVisitaLabel(v),
    nombre: getNombreAcceso(v) || "",
    empresa: getEmpresaAcceso(v) || "",
    area: v.area || "",
    cita: v.fechaHora ? new Date(v.fechaHora).toLocaleString() : "",
    status: v.status || "",
    entrada: v.entradaTs ? new Date(v.entradaTs).toLocaleString() : "",
    salida: v.salidaTs ? new Date(v.salidaTs).toLocaleString() : "",
    dictamen: (v.dictamen?.estado || "").toUpperCase(),
    incidencia: v.dictamen?.incidencia || v.incidenciasSalida || "",
    docs: `${v.ocNo || "-"} / ${v.facturaNo || "-"}`
  }));

  const w = window.open("", "_blank");
  if(!w){
    toast("PDF","Permite pop‑ups para generar PDF.","warn",4200);
    return;
  }

  w.document.open();
  w.document.write(`
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
body{font-family:Arial,system-ui;padding:18px;}
h1{font-size:16px;margin:0 0 10px;}
table{width:100%;border-collapse:collapse;}
th,td{border:1px solid #ddd;padding:6px;font-size:11px;}
th{background:#f3f4f6;}
@media print{button{display:none;}}


</style>
</head>
<body>
<button onclick="window.print()">Imprimir / Guardar PDF</button>
<h1>${title}</h1>
<p>Total: ${rows.length}</p>
<table>
<thead>
<tr>
  <th>Tipo</th>
  <th>Nombre</th>
  <th>Empresa</th>
  <th>Área</th>
  <th>Cita</th>
  <th>Estatus</th>
  <th>Entrada</th>
  <th>Salida</th>
  <th>Dictamen</th>
  <th>Incidencias</th>
  <th>OC / Factura</th>
</tr>
</thead>
<tbody>
${rows.map(r => `
<tr>
  <td>${esc(r.tipo)}</td>
  <td>${esc(r.nombre)}</td>
  <td>${esc(r.empresa)}</td>
  <td>${esc(r.area)}</td>
  <td>${esc(r.cita)}</td>
  <td>${esc(r.status)}</td>
  <td>${esc(r.entrada)}</td>
  <td>${esc(r.salida)}</td>
  <td>${esc(r.dictamen)}</td>
  <td>${esc(r.incidencia)}</td>
  <td>${esc(r.docs)}</td>
</tr>
`).join("")}
</tbody>
</table>
</body>
</html>
`);
  w.document.close();

  toast("PDF","Vista imprimible generada.","ok",2600);
}

async function guardarProveedor(){
  const codigo = $("#provCodigo").value.trim();
  const razon  = $("#provRazon").value.trim();

  if(!codigo || !razon){
    toast("Datos requeridos","Código y razón social","warn");
    return;
  }

  try{
    await addDoc(collection(db,"proveedores"),{
      codigo,
      razonSocial: razon,
      activo: true,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    toast("Proveedor creado","Registro guardado","ok");

    // recarga cache
    proveedoresLoaded = false;
    await loadProveedores(true);

  }catch(e){
    console.error(e);
    toast("Error", e.message || "Revisa permisos de Firestore", "bad", 4000);
  }
}

async function importProveedoresDesdeExcel(){
  if(!requirePerm("admin_proveedores","Solo ADMIN")) return;
  if(!await loadFeatureDependencies("excel", "la importación de Excel")) return;

  const input = document.getElementById("provExcel");
  if(!input || !input.files.length){
    toast("Archivo requerido","Selecciona un archivo Excel","warn");
    return;
  }

  const file = input.files[0];
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if(!rows.length){
    toast("Excel vacío","No hay filas para importar","warn");
    return;
  }

  const batch = writeBatch(db);
  let count = 0;

  rows.forEach(r => {
    if(!r.codigo || !r.razonSocial) return;

    const ref = doc(collection(db,"proveedores"));
    batch.set(ref,{
      codigo: String(r.codigo).trim(),
      razonSocial: String(r.razonSocial).trim(),
      activo: r.activo !== false,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    count++;
  });

  await batch.commit();

  toast("Importación completa",`${count} proveedores cargados`,`ok`,3000);

  // refresca cache
  proveedoresLoaded = false;
  await loadProveedores(true);
}

async function loadProveedores(force = false){
  try{
    const cacheFresh = proveedoresLoaded && (Date.now() - proveedoresLoadedTs) < PROVEEDORES_CACHE_TTL_MS;
    if(!force && cacheFresh){
      renderProveedores(proveedoresCache);
      return proveedoresCache;
    }

    if(!force){
      const local = loadProveedoresLocalCache();
      const localTs = Number(localStorage.getItem("proveedores_cache_ts_v1") || 0);
      if(local.length && Date.now() - localTs < PROVEEDORES_CACHE_TTL_MS){
        proveedoresCache = local;
        proveedoresLoaded = true;
        proveedoresLoadedTs = localTs;
        renderProveedores(proveedoresCache);
        return proveedoresCache;
      }
    }

    const snap = await getDocs(collection(db,"proveedores"));
    const lista = [];

    snap.forEach(doc=>{
      lista.push({ id: doc.id, ...doc.data() });
    });

    // 🔥 ESTA LÍNEA FALTABA
    proveedoresCache = lista;
    proveedoresLoaded = true;
    proveedoresLoadedTs = Date.now();
    saveProveedoresLocalCache(lista);

    console.log("Proveedores:", proveedoresCache);

    renderProveedores(proveedoresCache);
    return proveedoresCache;

  }catch(e){
    console.error(e);
    if(!proveedoresCache.length){
      proveedoresCache = loadProveedoresLocalCache();
      if(proveedoresCache.length){
        proveedoresLoaded = true;
        renderProveedores(proveedoresCache);
      }
    }
    toast("Error","No se pudieron cargar proveedores","bad");
    return proveedoresCache;
  }
}

function renderProveedores(lista){
  const cont = document.getElementById("proveedoresRegistrados");
  if(!cont) return;

  if(!lista || !lista.length){
    cont.innerHTML = `
      <div class="pill">
        No hay proveedores registrados
      </div>
    `;
    return;
  }

  // ✅ ORDENAR POR CÓDIGO (alfanumérico)
  const ordenados = [...lista].sort((a, b) =>
    String(a.codigo).localeCompare(String(b.codigo), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );

  cont.innerHTML = `
    <ul style="
      list-style:none;
      padding:0;
      margin:0;
      display:flex;
      flex-direction:column;
      gap:6px;
    ">
      ${ordenados.map(p => `
        <li class="pill" style="justify-content:space-between;">
          <span><b>${esc(p.codigo)}</b></span>
          <span>${esc(p.razonSocial)}</span>
        </li>
      `).join("")}
    </ul>
  `;
}

// -------------------------
    // Router Home
    // -------------------------
    function renderHome(){
      if(!currentUser) return renderLogin();
      setAuthShell(false);
      if(currentUser.role === ROLES.PENDIENTE) return renderPendiente();
      if(currentUser.role === ROLES.PROVEEDOR) return renderProveedor();
      return renderModuleHome();
    }

    // -------------------------
    // Eventos
    // -------------------------
    document.addEventListener("click", async (e) => {
      const btnTop = e.target.closest("[data-top]");
      if(btnTop && btnTop.dataset.top === "logout"){
        await doLogout();
        return;
      }

      const el = e.target.closest("[data-action]");
      if(!el) return;

      const action = el.dataset.action;
      const id = el.dataset.id;

      switch(action){
        case "toggleKanbanDetails": toggleKanbanDetails(el); break;
        case "kanbanDetailsNoop": break;
        case "logout": await doLogout(); break;
        case "whatsappValePersonal": enviarValePersonalWhatsApp(id); break;
        case "alertaTiempoExcedidoWhatsApp": await enviarAlertaTiempoExcedidoWhatsApp(id); break;
        case "abrirMenuInicio": btnHamb?.click(); break;
        case "homeModulo": {
          const moduleKey = el.dataset.module;
          if(moduleKey === "proveedores") await renderDashboardHoy("proveedores");
          else if(moduleKey === "visitantes") await renderDashboardHoy("visitantes");
          else if(moduleKey === "vales"){
            if(hasPerm("ver_vales_personal")) await renderValesPersonal();
            else await renderValesActivos();
          }else if(moduleKey === "rondinero"){
            if(hasPerm("rondinero_ver")) await renderRondinero();
            else await renderBitacoraGuardia();
          }
          break;
        }
        case "closeHelpModal": closeHelpModal(); break;
        case "openAppDiagnostics": location.href = "./diagnostico.html"; break;
        case "repairAppCache": await repairAppCache(); break;
        case "applyAppUpdate": await applyAppUpdate(); break;
        case "dismissAppUpdate": dismissAppUpdate(); break;
        case "home":
          lockView = false;
          dashboardPendingOnly = false;
          renderHome();
          break;
        case "returnDashboard":
          lockView = false;
          dashboardPendingOnly = false;
          renderVisitaReturnDashboard();
          break;
        case "limpiarNuevaCita":
          document.querySelectorAll(".nueva-cita-card input, .nueva-cita-card textarea, .nueva-cita-card select").forEach(input => {
            if(input.id === "tipoVisita") return;
            if(input.id === "modalidadVisita"){
              input.value = "normal";
              return;
            }
            if(input.type === "checkbox"){
              input.checked = false;
              return;
            }
            input.value = "";
          });
          break;
        case "togglePendingAuth": dashboardPendingOnly = !dashboardPendingOnly; renderActiveDashboard(); break;
        case "providerMobileStage":
          providerDashboardMobileStatus = el.dataset.stage || "programados";
          dashboardPendingOnly = false;
          renderDashboardHoy("proveedores");
          break;
        case "visitorMobileStage":
          visitorDashboardMobileStatus = el.dataset.stage || "programados";
          dashboardPendingOnly = false;
          renderDashboardHoy("visitantes");
          break;
        case "valePersonalMobileStage":
          valePersonalMobileStatus = el.dataset.stage || "pendientes";
          await renderValesPersonal(false);
          break;
        case "valeActivoMobileStage":
          valeActivoMobileStatus = el.dataset.stage || "pendientes";
          await renderValesActivos(false);
          break;
        case "autorizarVisita": await resolverAutorizacionVisita(id, true); break;
        case "rechazarVisita": await resolverAutorizacionVisita(id, false); break;
        case "historial": await renderHistorial(); break;
        case "histLoad": await loadHistDay(); break;
        case "valesActivos": await renderValesActivos(); break;
        case "refreshVales": {
          el.disabled = true;
          el.textContent = "Actualizando...";
          if(el.dataset.tipo === "personal") await renderValesPersonal();
          else await renderValesActivos();
          toast("Dashboard actualizado","Los datos de vales se actualizaron sin salir del módulo.","ok",2200);
          break;
        }
        case "openValeModal": await openValeModal(); break;
        case "closeValeModal": closeValeModal(); break;
        case "guardarValeActivo": await guardarValeActivo(); break;
        case "verValeQR": await renderValeQR(id); break;
        case "setValeStatus": await iniciarRegistroValeActivo(id, el.dataset.status); break;
        case "autorizarVale": await autorizarValeActivo(id); break;
        case "cancelarVale": await cancelarValeActivo(id); break;
        case "valesPersonal": await renderValesPersonal(); break;
        case "refrescarProximosValesPersonal": await renderProximosValesPersonal(true); break;
        case "filtrarHistorialValesPersonal": await renderHistorialValesPersonal(false); break;
        case "refrescarHistorialValesPersonal": await renderHistorialValesPersonal(true); break;
        case "filtrarHistorialValesActivos": await renderHistorialValesActivos(false); break;
        case "refrescarHistorialValesActivos": await renderHistorialValesActivos(true); break;
        case "aplicarReporteNominas": await aplicarReporteNominas(); break;
        case "actualizarReporteNominas": await renderReporteNominas(true); break;
        case "exportarReporteNominas": await exportarReporteNominas(); break;
        case "toggleRegistroManualPersonal": await toggleRegistroManualPersonal(); break;
        case "bitacoraGuardia": await renderBitacoraGuardia(); break;
        case "guardarBitacora": await guardarBitacora(); break;
        case "bitacoraScanGuardia": await renderRondineroGuardiaScanner("bitacora"); break;
        case "bitacoraClearGuardia": saveRondineroGuardiaCred(null); await renderBitacoraGuardia(); break;
        case "rondinero": await renderRondinero(); break;
        case "rondineroRefresh":
          if(hasPerm("rondinero_configurar") || hasPerm("rondinero_reportes")){
            await syncRondinero(true);
          }else{
            await syncRondineroGuardia(true);
          }
          await renderRondinero();
          break;
        case "rondineroGuardarPunto": await guardarRondineroPunto(); break;
        case "rondineroCapturarGps": await capturarGpsRondineroPunto(); break;
        case "rondineroConfigurarGps": await configurarGpsRondineroPuntoExistente(el.dataset.id); break;
        case "rondineroEditarPunto": await editarRondineroPunto(el.dataset.id); break;
        case "recargarProveedoresNuevaCita": await recargarProveedoresNuevaCita(); break;
        case "rondineroTab":
          rondineroAdminTab = el.dataset.tab || "puntos";
          await renderRondinero();
          break;
        case "rondineroAplicarFiltros": {
          const desde=document.getElementById("rondHistDesde")?.value||"";
          const hasta=document.getElementById("rondHistHasta")?.value||"";
          if(desde&&hasta&&desde>hasta){toast("Rango inválido","La fecha Desde no puede ser posterior a Hasta.","warn",3400);break;}
          rondineroHistSearch=document.getElementById("rondHistSearch")?.value.trim()||"";
          rondineroHistGuardia=document.getElementById("rondHistGuardia")?.value||"";
          rondineroHistDesde=desde;rondineroHistHasta=hasta;
          await renderRondinero();
          break;
        }
        case "rondineroLimpiarFiltros":
          rondineroHistSearch="";rondineroHistGuardia="";rondineroHistDesde="";rondineroHistHasta="";
          await renderRondinero();
          break;
        case "rondineroTogglePunto": await toggleRondineroPunto(id); break;
        case "rondineroGuardarRuta": await guardarRondineroRuta(); break;
        case "rondineroEditarRuta": await editarRondineroRuta(id); break;
        case "rondineroCerrarEditorRuta": cerrarEditorRondineroRuta(); break;
        case "rondineroMoverPuntoRuta": moverPuntoEditorRondineroRuta(id, el.dataset.dir); break;
        case "rondineroQuitarPuntoRuta": quitarPuntoEditorRondineroRuta(id); break;
        case "rondineroAgregarPuntoRuta": agregarPuntoEditorRondineroRuta(id); break;
        case "rondineroGuardarEditorRuta": await guardarEditorRondineroRuta(); break;
        case "rondineroToggleRuta": await toggleRondineroRuta(id); break;
        case "rondineroDetalle": await renderRondineroDetalle(id); break;
        case "rondineroEditarRegistro": await editarRondineroRegistro(id); break;
        case "rondineroEliminarRegistro": await eliminarRondineroRegistro(id); break;
        case "rondineroPdf": await generarPdfRondinero(id); break;
        case "rondineroQR": await renderRondineroQR(id); break;
        case "rondineroScanGuardia": await renderRondineroGuardiaScanner(); break;
        case "rondineroClearGuardia": saveRondineroGuardiaCred(null); await renderRondinero(); break;
        case "rondineroIniciar": await iniciarRondinero(); break;
        case "rondineroScan": await renderRondineroScanner(); break;
        case "rondineroOmitir": renderRondineroOmision(); break;
        case "rondineroGuardarOmision": await guardarRondineroOmision(); break;
        case "rondineroNovedad": renderRondineroNovedad(); break;
        case "rondineroGuardarNovedad": await guardarRondineroNovedad(); break;
        case "rondineroCerrar": await cerrarRondinero(); break;
        case "openValePersonalModal": await openValePersonalModal(); break;
        case "closeValePersonalModal": closeValePersonalModal(); break;
        case "guardarValePersonal": await guardarValePersonal(); break;
        case "verValePersonalQR": await renderValePersonalQR(id); break;
        case "setValePersonalStatus": await updateValePersonalStatus(id, el.dataset.status); break;
        case "autorizarValePersonal": await autorizarValePersonal(id); break;
        case "autorizarValePersonalEmergencia": await autorizarValePersonalEmergencia(id); break;
        case "cancelarValePersonal": await cancelarValePersonal(id); break;

        case "nuevo": await goNuevaCita("proveedor"); break;
        case "nuevoVisitante": await goNuevaCita("visitante"); break;

        case "guardarProveedor": await guardarProveedor(); break;
        case "cambiarPassword": await cambiarPassword(); break;
        case "guardarMiPin": await guardarMiPin(); break;
        case "adminRoles": await renderAdminRoles(); break;
        case "rolePermissions": await renderRolePermissions(); break;
        case "rolePermSelect": await renderRolePermissions(el.dataset.role); break;
        case "rolePermSave": await saveRolePermissionsFromScreen(el.dataset.role); break;
        case "rolePermReset": await resetRolePermissions(el.dataset.role); break;

        case "addFacturaOc": {
          const editorId = el.dataset.editor || "facturasOcEditor";
          const editor = document.getElementById(editorId);
          const list = editor?.querySelector(".factura-oc-list");
          if(list){
            const idx = list.querySelectorAll(".factura-oc-item").length;
            list.insertAdjacentHTML("beforeend", renderFacturaOcItem({ facturaNo:"", ocNos:[] }, idx, editorId));
          }
          break;
        }

        case "removeFacturaOc": {
          const editorId = el.dataset.editor || "facturasOcEditor";
          const editor = document.getElementById(editorId);
          const rows = editor ? Array.from(editor.querySelectorAll(".factura-oc-item")) : [];
          const row = el.closest(".factura-oc-item");
          if(rows.length <= 1){
            row?.querySelectorAll("input, textarea").forEach(input => input.value = "");
          }else{
            row?.remove();
            syncFacturasOcEditorNumbers(editor);
          }
          break;
        }
        
        case "importProveedores": await importProveedoresDesdeExcel(); break;

        case "guardar": {
          if(!canCreateAnyCita()){
            toast("Acceso denegado","Tu rol no puede crear citas.","bad",2600);
            return;
          }
          const v = createVisitaFromForm();
          if(!v) return;
          if(!navigator.onLine){
            toast("Sin conexión","La cita no se guardó ni se generó el QR. Conéctate a Internet e inténtalo nuevamente.","warn",5200);
            return;
          }

          el.disabled = true;
          const previousLabel = el.textContent;
          el.textContent = "Publicando…";
          try{
            await cloudUpsertVisita(v);
            visitas.unshift(v);
            saveVisitasLocal();
            toast("Guardado","Firebase confirmó la cita. El QR ya puede utilizarse.","ok",2600);
            lockView = true;
            await renderQR(v.id);
          }catch(e){
            console.error("No se pudo publicar la cita:", e);
            toast("No se generó el QR", cloudCreateVisitaErrorMessage(e), "bad", 6000);
          }finally{
            if(el.isConnected){
              el.disabled = false;
              el.textContent = previousLabel;
            }
          }
          break;
        }

        case "reporteCambios":
        renderReporteCambios();
        break;
        
        case "normalizarUsuarios":
  if(!requirePerm("admin_roles","Solo ADMIN puede normalizar usuarios")) return;

  if(!confirm(
    "⚠️ Esta acción actualizará usuarios antiguos agregando campos faltantes.\n\n" +
    "✅ No borra datos\n" +
    "✅ No cambia roles\n\n" +
    "¿Deseas continuar?"
  )) return;

  await normalizarUsuariosViejos();
  await loadAdminUsers(); // refresca la lista
  break;

        case "verQR": await renderQR(id); break;
        case "scan": await renderScanner(el.dataset.from || currentView); break;

        case "ficha":
          if(bloquearAccionCitaRetrasada(id, "abrir la ficha")) break;
          renderFicha(id);
          break;
        case "entrada": renderEntrada(id); break;
        case "confirmarEntrada": await confirmarEntrada(id); break;
        case "despachar": await despachar(id); break;
        case "salida": renderSalida(id); break;
        case "confirmarSalida": await confirmarSalida(id); break;

        case "verOC": {
          const v = visitas.find(x => x.id == id);
          if(v?.ocFileKey) verDocumento(v.ocFileKey);
          break;
        }
        case "verFactura": {
          const v = visitas.find(x => x.id == id);
          if(v?.facturaFileKey) verDocumento(v.facturaFileKey);
          break;
        }

        case "shareCitaConQR": compartirCitaConQR(id); break;

        case "reactivar":
          await reactivarQR(id);
          break;

        case "eliminar": {
          const v = visitas.find(x => x.id == id);
          if(!v) return;
          if(bloquearAccionCitaRetrasada(id, "eliminar la cita")) break;
          if(!(await requireAdminPin("eliminar este registro"))) return;
          if(confirm(`¿Eliminar el registro de "${getNombreAcceso(v) || v.proveedor}"?`)){
            await eliminarVisita(id);
          }
          break;
        }

        case "sync":
          toast("Sincronizando","Actualizando desde la nube...","info",1600);
          await syncDay(new Date(), true);
          await pushRecentToCloud();
          toast("Listo","Datos sincronizados.","ok",1600);
          renderActiveDashboard();
          break;

        case "adminRoles":
          await renderAdminRoles();
          break;
        case "sesionesActivas":
          await renderSesionesActivas();
          break;
        case "adminReload":
          await loadAdminUsers();
          break;
        case "openBulkUsersModal":
          openBulkUsersModal();
          break;
        case "closeBulkUsersModal":
          closeBulkUsersModal();
          break;
        case "createBulkUsers":
          await createBulkUsers();
          break;
        case "openUserModal":
          openUserModal(el.dataset.uid);
          break;
        case "repairIncompleteUser":
          openUserModal(el.dataset.uid);
          break;
        case "deleteIncompleteUser":
          await deleteIncompleteUser(el.dataset.uid);
          break;

        case "rondineroGuardiaQR":
          await renderRondineroGuardiaQR(el.dataset.uid);
          break;
        case "closeUserModal":
          closeUserModal();
          break;
        case "saveUserModal":
          await saveUserModal();
          break;
        case "toggleAutorizaValeActivo":
          await toggleAutorizaValeActivo(el.dataset.uid, el.checked);
          break;
        case "deleteUser":
          await deleteUser(el.dataset.uid);
          break;

        case "exportExcel": {
          const today = new Date();
          const list = visitas.filter(v => typeof v.fechaHoraTs === "number" && isSameDay(v.fechaHoraTs, today));
          await exportExcelFor(list, "HOY");
          break;
        }
        case "exportExcelHist": {
          const dateStr = el.dataset.date || "";
          const d = new Date(dateStr + "T00:00:00");
          const list = visitas.filter(v => typeof v.fechaHoraTs === "number" && isSameDay(v.fechaHoraTs, d));
          await exportExcelFor(list, dateStr);
          break;
        }

        case "limpiarFinalizadosHoy":
 if(!(await requireAdminPin("limpiar FINALIZADOS del día"))) break;
 if(confirm("¿Borrar FINALIZADOS?")) limpiarFinalizadosHoy();
          break;

        case "print": window.print(); break;
      
        case "ccLoad":
  await loadCitasCompras();
  break;

case "ccEdit":
  _returnToCitasComprasMode = false;
  if(bloquearAccionCitaRetrasada(id, "editar la cita")) break;
  await renderEditarCitaCompras(id);
  break;

case "ccTableVerQR":
  _returnToEditMode = false;
  _returnToEditCitaId = null;
  _returnToCitasComprasMode = true;
  await renderQR(id);
  break;

case "ccSaveEdit":
  if(bloquearAccionCitaRetrasada(id, "guardar cambios")) break;
  await guardarEdicionCitaCompras(id);
  break;

case "ccCancel":
  if(bloquearAccionCitaRetrasada(id, "cancelar la cita")) break;
  if(confirm("¿Cancelar esta cita? El QR quedará inactivo.")){
    await cancelarCitaCompras(id);
  }
  break;

case "citasComprasBack":
  _returnToCitasComprasMode = false;
  await renderCitasCompras(_citasTipoFiltro);
  await loadCitasCompras();
  break;
    
  case "ccChipArea": {
  const a = el.dataset.area || "";
  const sel = document.getElementById("ccArea");
  if(!sel) break;

  if(a === "__ALL__") sel.value = "";
  else sel.value = a;

  await loadCitasCompras();
  break;
}

case "ccVerQR":
  _returnToCitasComprasMode = false;
  _returnToEditCitaId = id;
  _returnToEditMode = true;
  await renderQR(id);
  break;

case "volverAEditarCita":
  if(_returnToEditMode && _returnToEditCitaId){
    await renderEditarCitaCompras(_returnToEditCitaId);
  } else {
    renderHome();
  }
  break;

  case "home":
  _returnToCitasComprasMode = false;
  _returnToEditMode = false;
  _returnToEditCitaId = null;
  lockView = false;
  dashboardPendingOnly = false;
  renderHome();
  break;
  
      }
    });

    // Buscar (local inmediato + sync con debounce)
let _searchTimer = null;
document.addEventListener("input", (e) => {
  const valeSearch = e.target.closest("#valeSearchPersonal, #valeSearchActivos");
  if(valeSearch){
    const tipo = valeSearch.id === "valeSearchPersonal" ? "personal" : "activos";
    const incomingValue = valeSearch.value || "";
    const loginEmail = String(currentUser?.email || "").trim().toLowerCase();
    if(!valeSearchTerms[tipo] && loginEmail && incomingValue.trim().toLowerCase() === loginEmail){
      valeSearch.value = "";
      return;
    }
    valeSearchTerms[tipo] = incomingValue;
    const cursorPos = valeSearch.selectionStart ?? valeSearchTerms[tipo].length;
    if(tipo === "personal") renderValesPersonal(false);
    else renderValesActivos(false);
    requestAnimationFrame(() => {
      const nextInput = document.getElementById(valeSearch.id);
      if(nextInput){
        nextInput.focus();
        nextInput.setSelectionRange(cursorPos,cursorPos);
      }
    });
    return;
  }
  const searchInput = e.target.closest("#dashSearch, #qSearch");
  if(!searchInput) return;
  if(!currentUser) return;
  const searchId = searchInput.id;
  const dashboardWasActive = isDashboardView();
  dashboardSearchTerm = searchInput.value || "";
  const cursorPos = searchInput.selectionStart ?? dashboardSearchTerm.length;
  if(!dashboardWasActive) return;
  renderActiveDashboard();
  requestAnimationFrame(() => {
    const nextInput = document.getElementById(searchId);
    if(nextInput){
      nextInput.focus();
      nextInput.setSelectionRange(cursorPos, cursorPos);
    }
  });
  if(_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    updateNet();
    if(isDashboardView()) renderActiveDashboard();
  }, 600);
});

document.addEventListener("keydown", (e) => {
  const providerCard = e.target.closest?.(".provider-kanban-card[data-action='ficha']");
  if(!providerCard || (e.key !== "Enter" && e.key !== " ")) return;
  if(e.target.closest?.("button,a,input,select,textarea,[data-action='kanbanDetailsNoop']")) return;
  e.preventDefault();
  providerCard.click();
});

window.addEventListener("online", () => {
  updateNet();
  if(currentUser && isDashboardView() && document.visibilityState === "visible"){
    syncDay(new Date()).catch(()=>{});
  }
});
window.addEventListener("offline",updateNet);
    updateNet();

let detectedRemoteVersion = "";
function appCacheKeysOnly(keys=[]){ return keys.filter(key => String(key).startsWith("caborca-access-control-")); }
function appServiceWorkerRegistrations(registrations=[]){ const base=new URL("./",location.href).href; return registrations.filter(registration=>String(registration.scope||"").startsWith(base)); }
function showAppUpdateBanner(version=""){
  detectedRemoteVersion = String(version || detectedRemoteVersion || "").trim();
  const banner = document.getElementById("appUpdateBanner");
  const message = document.getElementById("appUpdateMessage");
  if(!banner) return;
  if(message) message.textContent = detectedRemoteVersion ? `La versión ${detectedRemoteVersion} está lista. La versión abierta es ${APP_VERSION}.` : "Existe una versión nueva de la aplicación.";
  banner.hidden = false;
}
function dismissAppUpdate(){ const banner=document.getElementById("appUpdateBanner"); if(banner) banner.hidden=true; }
async function fetchPublishedAppVersion(){
  const response = await fetch(`./version.json?ts=${Date.now()}`, { cache:"no-store" });
  if(!response.ok) throw new Error(`version-http-${response.status}`);
  const data = await response.json();
  return String(data?.version || "").trim();
}
async function checkForAppUpdate(){
  if(!navigator.onLine || location.protocol === "file:") return "";
  try{
    const remoteVersion = await fetchPublishedAppVersion();
    if(remoteVersion && remoteVersion !== APP_VERSION) showAppUpdateBanner(remoteVersion);
    return remoteVersion;
  }catch(error){ console.warn("No se pudo comprobar la versión publicada:", error); return ""; }
}
async function clearOnlyAppCaches(){
  if(!("caches" in window)) return 0;
  const keys = appCacheKeysOnly(await caches.keys());
  await Promise.all(keys.map(key => caches.delete(key)));
  return keys.length;
}
async function applyAppUpdate(){
  if(!navigator.onLine) return toast("Sin conexión","Recupera Internet antes de actualizar la aplicación.","warn",4200);
  const button = document.querySelector('[data-action="applyAppUpdate"]');
  if(button){ button.disabled=true; button.textContent="Actualizando…"; }
  try{
    await clearOnlyAppCaches();
    if("serviceWorker" in navigator){
      const registrations = appServiceWorkerRegistrations(await navigator.serviceWorker.getRegistrations());
      await Promise.all(registrations.map(async registration => {
        await registration.update().catch(()=>{});
        registration.waiting?.postMessage({ type:"SKIP_WAITING" });
      }));
    }
    const url = new URL(location.href);
    url.searchParams.set("v", detectedRemoteVersion || String(Date.now()));
    location.replace(url.toString());
  }catch(error){
    console.error("No se pudo aplicar la actualización:", error);
    toast("Actualización incompleta","No se eliminaron datos. Intenta nuevamente o abre Diagnóstico.","bad",5200);
    if(button){ button.disabled=false; button.textContent="Actualizar ahora"; }
  }
}
async function repairAppCache(){
  if(!confirm("Se eliminará únicamente la caché y el service worker de Caborca Access Control. No se borrarán usuarios ni registros de Firebase. ¿Continuar?")) return;
  try{
    const removed = await clearOnlyAppCaches();
    if("serviceWorker" in navigator){
      const registrations = appServiceWorkerRegistrations(await navigator.serviceWorker.getRegistrations());
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
    const url = new URL(location.origin + location.pathname);
    url.searchParams.set("fresh", String(Date.now()));
    location.replace(url.toString());
    console.info(`Cachés retiradas: ${removed}`);
  }catch(error){ console.error(error); toast("No se pudo reparar","Abre Diagnóstico y revisa el estado del dispositivo.","bad",4800); }
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./service-worker.js", { updateViaCache:"none" })
    .then(registration => {
      console.log("SW registrado", registration.scope);
      registration.update().catch(()=>{});
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if((worker.state === "installed" || worker.state === "activated") && navigator.serviceWorker.controller) checkForAppUpdate();
        });
      });
    })
    .catch(err => console.error("SW error", err));
  checkForAppUpdate();
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") checkForAppUpdate(); });
} else {
  console.warn("SW deshabilitado (file://)");
}


    // -------------------------
    // Auth observer
    // -------------------------
    onAuthStateChanged(auth, async (user) => {
      if(!user){
        stopAutoSync();
        currentUser = null;
        localStorage.removeItem(LS_USER);
        paintHeader();
        renderLogin();
        return;
      }

      if(user.isAnonymous){
        console.info("Sesión anónima de kiosco detectada en la app principal; se cerrará sin crear un perfil.");
        await signOut(auth).catch(error => console.warn("No se pudo cerrar la sesión anónima:", error));
        return;
      }

      if(authCredentialsTimedOut){
        await signOut(auth).catch(()=>{});
        return;
      }

      const observerFlowToken = authFlowToken || ++authFlowToken;
      setAuthProgress("profile");
      let prof;
      try{
        prof = await withAuthTimeout(ensureUserProfile(user), PROFILE_TIMEOUT_MS, "PROFILE_TIMEOUT");
        if(observerFlowToken !== authFlowToken) return;
      }catch(error){
        console.error("Perfil de usuario inválido:", error);
        setAuthProgress("profile", true);
        pendingAuthInlineError = authErrorMessage(error);
        authFlowToken++;
        await signOut(auth).catch(()=>{});
        return;
      }
      currentUser = {
        uid: prof.uid,
        email: prof.email,
        user: prof.email,
        role: prof.role,
        nombre: prof.nombre || prof.email,
        nomina: prof.nomina || prof.noNomina || prof.numeroNomina || "",
        telefono: prof.telefono || "",
        createdTs: prof.createdTs || 0,
        solicitadoTs: prof.solicitadoTs || 0,
        passwordChangedTs: prof.passwordChangedTs || 0,
        passwordChangeRequired: prof.passwordChangeRequired === true,
        migradoDesde: prof.migradoDesde || ""
      };
      
      localStorage.setItem(LS_USER, JSON.stringify(currentUser));
      setAuthProgress("permissions");
      try{
        await withAuthTimeout(loadRolePermsConfig(true), PERMISSIONS_TIMEOUT_MS, "PERMISSIONS_TIMEOUT");
        if(observerFlowToken !== authFlowToken) return;
      }catch(error){
        console.error("No se pudieron validar permisos:", error);
        setAuthProgress("permissions", true);
        pendingAuthInlineError = authErrorMessage(error);
        authFlowToken++;
        await signOut(auth).catch(()=>{});
        return;
      }

      setAuthProgress("authorized");
      await new Promise(resolve => setTimeout(resolve, 420));
      if(observerFlowToken !== authFlowToken) return;

      setAuthShell(false);
      paintHeader();
      paintSidebar();     // ✅ AQUÍ 
      updatePendingBadge();
      touchActiveSession(true).catch(error => console.warn("Presencia en segundo plano:", error));
      startAutoSync();
      // carga local inmediata + sync HOY
      visitas = loadVisitasLocal();
      const abrir = new URLSearchParams(location.search).get("abrir");
      if(abrir === "vales_personal" && hasPerm("ver_vales_personal")){
        try{ history.replaceState({}, "", location.pathname); }catch{}
        await renderValesPersonal();
      }else{
        renderHome();
      }
      syncDay(new Date(), true).then(() => {
        if(isDashboardView()) renderActiveDashboard();
        else if(currentView === "module_home") renderModuleHome();
      }).catch(error => console.warn("Sincronización inicial en segundo plano:", error));
    });

    paintHeader();
    renderLogin();
  })();
