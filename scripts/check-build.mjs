import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");
const sourceAuth = await readFile(path.join(root, "src", "auth.js"), "utf8");
const sourceProveedores = await readFile(path.join(root, "src", "proveedores.js"), "utf8");
const version = JSON.parse(await readFile(path.join(root, "version.json"), "utf8"));
const sw = await readFile(path.join(root, "service-worker.js"), "utf8");
const css = await stat(path.join(root, "app.css"));
const bundle = await stat(path.join(root, "assets", "app.min.js"));

if(!html.includes('href="./app.css"')) throw new Error("index.html no carga app.css");
if(!html.includes('src="./assets/app.min.js"')) throw new Error("index.html no carga la compilación");
if(css.size < 10000) throw new Error("app.css parece incompleto");
if(bundle.size < 10000) throw new Error("assets/app.min.js parece incompleto");
if(/<script type="module">[\s\S]{1000,}<\/script>/.test(html)) throw new Error("index.html aún contiene el módulo monolítico");
if(version.version !== "v254" || !sourceAuth.includes('APP_VERSION = "v254"')) throw new Error("La versión productiva no está alineada en v254");
if(!sw.includes('SW_VERSION = "v254"')) throw new Error("El service worker no informa v254");
for(const area of ["Aduana Peleteria", "Avíos", "Otros"]){
  if(!sourceProveedores.includes(`"${area}": 1`)) throw new Error(`Capacidad incorrecta para ${area}`);
}
if(!html.includes('id="startupRecovery"')) throw new Error("Falta la recuperación visible de arranque");

console.log(JSON.stringify({ htmlBytes:Buffer.byteLength(html), cssBytes:css.size, bundleBytes:bundle.size }));
