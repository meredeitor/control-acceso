  const APP_VERSION = "v256";
  const THEMES = ["dark", "light"];
  const THEME_LABELS = {
    dark: "Tema: Oscuro",
    light: "Tema: Claro"
  };
  const THEME_COLORS = {
    dark: "#0f172a",
    light: "#f6f8fc"
  };

  function setTheme(mode){
  const next = THEMES.includes(mode) ? mode : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("ui_theme", next);
  const btn = document.getElementById("btnTheme");
  if(btn){
    const label = THEME_LABELS[next] || "Tema";
    btn.textContent = label;
    btn.dataset.icon = next === "light" ? "☀" : "☾";
    btn.setAttribute("aria-label", `${label}. Pulsa para cambiar el tema de color.`);
    btn.title = `${label}. Pulsa para cambiar.`;
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[next] || "#0f172a");
}

function initTheme(){
  const saved = localStorage.getItem("ui_theme");
  const normalized = THEMES.includes(saved) ? saved : (saved === "copper" ? "dark" : "light");
  setTheme(normalized);
}

function toggleTheme(){
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const idx = THEMES.indexOf(cur);
  setTheme(THEMES[(idx + 1) % THEMES.length]);
  const btn = document.getElementById("btnTheme");
  if(btn){
    btn.classList.remove("theme-pop");
    void btn.offsetWidth;
    btn.classList.add("theme-pop");
    setTimeout(()=>btn.classList.remove("theme-pop"),420);
  }
}

initTheme();
document.getElementById("btnTheme")?.addEventListener("click", toggleTheme);
document.getElementById("appVersion").textContent = APP_VERSION;
