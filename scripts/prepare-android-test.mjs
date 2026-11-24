import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const project = ".build/android-test";
const web = join(project, "www");
const rootAssets = /^(?:index\.html|diagnostico\.html|app\.css|dependency-loader\.js|firebase\.js|kiosko-[^/]+\.(?:html|js|css)|manifest\.json|version\.json|[^/]+\.png)$/;
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0");

for (const file of tracked) {
  if (!rootAssets.test(file) && !/^(?:assets|vendor)\//.test(file)) continue;
  const destination = join(web, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(file, destination);
}

const config = {
  appId: "com.caborca.accesscontrol.test",
  appName: "Caborca Access Control Prueba",
  webDir: "www",
  server: { androidScheme: "https" }
};
await writeFile(join(project, "capacitor.config.json"), JSON.stringify(config, null, 2));
await writeFile(join(project, "package.json"), JSON.stringify({ name: "caborca-android-test", private: true }));

const capacitorVersion = "7.4.3";
const run = (command, args) => execFileSync(command, args, { cwd: project, stdio: "inherit" });
run("npm", ["install", "--no-audit", "--no-fund", ...["cli", "core", "android"].map(name => `@capacitor/${name}@${capacitorVersion}`)]);
run("npx", ["--no-install", "cap", "add", "android"]);

const manifest = join(project, "android/app/src/main/AndroidManifest.xml");
const xml = await readFile(manifest, "utf8");
await writeFile(manifest, xml.replace("</manifest>", '    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>'));
