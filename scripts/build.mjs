import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFiles = [
  "auth.js",
  "firebase.js",
  "proveedores.js",
  "vales-activos.js",
  "rondinero.js",
  "vales-personal.js",
  "reportes.js",
  "visitantes.js"
];

const parts = await Promise.all(sourceFiles.map(async file => {
  const contents = await readFile(path.join(root, "src", file), "utf8");
  return `\n/* source: src/${file} */\n${contents}`;
}));

const joinedSource = `${parts.join("\n")}\n`;
const outputDir = path.join(root, "assets");
await mkdir(outputDir, { recursive:true });

await build({
  stdin: {
    contents: joinedSource,
    resolveDir: root,
    sourcefile: "app-source.js",
    loader: "js"
  },
  outfile: path.join(outputDir, "app.min.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2017"],
  minify: true,
  legalComments: "none",
  charset: "utf8",
  logLevel: "info"
});

console.log(`Compilación terminada: ${sourceFiles.length} fragmentos -> assets/app.min.js`);
