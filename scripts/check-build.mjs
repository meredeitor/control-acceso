import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");
const sourceAuth = await readFile(path.join(root, "src", "auth.js"), "utf8");
const sourceFirebase = await readFile(path.join(root, "src", "firebase.js"), "utf8");
const sourceProveedores = await readFile(path.join(root, "src", "proveedores.js"), "utf8");
const sourceVisitantes = await readFile(path.join(root, "src", "visitantes.js"), "utf8");
const sourceRondinero = await readFile(path.join(root, "src", "rondinero.js"), "utf8");
const sourceValesActivos = await readFile(path.join(root, "src", "vales-activos.js"), "utf8");
const kioskVales = await readFile(path.join(root, "kiosko-vales.html"), "utf8");
const cssText = await readFile(path.join(root, "app.css"), "utf8");
const version = JSON.parse(await readFile(path.join(root, "version.json"), "utf8"));
const sw = await readFile(path.join(root, "service-worker.js"), "utf8");
const css = await stat(path.join(root, "app.css"));
const bundle = await stat(path.join(root, "assets", "app.min.js"));

if(!html.includes('href="./app.css"')) throw new Error("index.html no carga app.css");
if(!html.includes('src="./assets/app.min.js"')) throw new Error("index.html no carga la compilación");
if(css.size < 10000) throw new Error("app.css parece incompleto");
if(bundle.size < 10000) throw new Error("assets/app.min.js parece incompleto");
if(/<script type="module">[\s\S]{1000,}<\/script>/.test(html)) throw new Error("index.html aún contiene el módulo monolítico");
if(version.version !== "v269" || !sourceAuth.includes('APP_VERSION = "v269"')) throw new Error("La versión productiva no está alineada en v269");
if(!sw.includes('SW_VERSION = "v269"')) throw new Error("El service worker no informa v269");
if(!sourceValesActivos.includes('renderValeActivoFirmas') || !sourceValesActivos.includes('Guardia · salida') || !sourceValesActivos.includes('Guardia · regreso')) throw new Error("Faltan las firmas del vale de activo");
if(!sourceValesActivos.includes('createdByNombre: currentUser?.nombre') || !sourceValesActivos.includes('salidaPorUid = guardiaCred.uid') || !sourceValesActivos.includes('regresoPorUid = guardiaCred.uid')) throw new Error("La auditoría del vale de activo está incompleta");
if(!sourceValesActivos.includes('provider-kanban-card vale-activo-card') || !sourceValesActivos.includes('Firmas ${firmasRegistradas}/${firmas.length}')) throw new Error("Falta el Kanban compacto de Vales de activo");
if(!sourceRondinero.includes('btnSolicitarAutorizacionVale') || !sourceRondinero.includes('dataset.action = "whatsappValePersonal"')) throw new Error("Falta Solicitar autorización en el QR de personal");
if(!sourceRondinero.includes('link.target = "_blank"') || !sourceRondinero.includes('whatsapp://send')) throw new Error("WhatsApp no conserva la vista del QR");
if(!kioskVales.includes('>Solicitar autorización</button>') || !kioskVales.includes('whatsapp://send')) throw new Error("El kiosco no separa Solicitar autorización de Compartir QR");
if(!sourceFirebase.includes('ROLE_PERMS_SCHEMA_VERSION = 8') || !sourceFirebase.match(/\[ROLES\.JEFE_COMPRAS\]: \[[\s\S]*?"crear_cita_visitante"/)) throw new Error("Jefe de Compras no tiene crear_cita_visitante");
if(!sourceProveedores.includes('role === ROLES.JEFE_COMPRAS') || !sourceProveedores.includes('migrated.push("crear_cita_visitante")')) throw new Error("Falta migrar el permiso de Jefe de Compras");
if(!sourceVisitantes.includes('max-width: 1024px') || !sourceVisitantes.includes('commitDashboardSearch')) throw new Error("Falta la protección del buscador táctil");
if(!cssText.includes('@media (max-width:1024px)') || !cssText.includes('.factura-oc-readonly .factura-oc-item')) throw new Error("Falta el ajuste móvil de Facturas/OC");
if(!sourceProveedores.includes('return "devolucion"') || !sourceProveedores.includes('return "Devolución"')) throw new Error("Falta la clasificación Devolución para visitantes");
if(!sourceVisitantes.includes('<option value="normal" selected>Visita normal</option>')) throw new Error("Visita normal no está seleccionada por defecto");
if(!sourceVisitantes.includes('<option value="especial">Visita especial</option>') || !sourceVisitantes.includes('<option value="devolucion">Devolución</option>')) throw new Error("El selector de visitantes está incompleto");
if(!sourceVisitantes.includes('visitaDevolucion,') || !sourceVisitantes.includes('requiereAutorizacion: visitaEspecial')) throw new Error("La persistencia de modalidad de visitante está incompleta");
if(!sourceRondinero.includes('id="ccModalidadVisita"')) throw new Error("La edición de citas no permite cambiar la modalidad");
if(!cssText.includes('.tarjeta.visita-devolucion') || !cssText.includes('.tarjeta.visita-especial')) throw new Error("Faltan colores diferenciados para visitantes");
for(const area of ["Aduana Peleteria", "Avíos", "Otros"]){
  if(!sourceProveedores.includes(`"${area}": 1`)) throw new Error(`Capacidad incorrecta para ${area}`);
}
if(!html.includes('id="startupRecovery"')) throw new Error("Falta la recuperación visible de arranque");

console.log(JSON.stringify({ htmlBytes:Buffer.byteLength(html), cssBytes:css.size, bundleBytes:bundle.size }));
