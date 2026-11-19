(function(global){
  "use strict";

  const definitions = Object.freeze({
    qr: {
      src: "./vendor/qrcodejs-1.0.0/qrcode.min.js",
      ready: () => typeof global.QRCode === "function"
    },
    camera: {
      src: "./vendor/html5-qrcode-2.3.8/html5-qrcode.min.js",
      ready: () => typeof global.Html5Qrcode === "function"
    },
    excel: {
      src: "./vendor/xlsx-js-style-1.2.0/xlsx.min.js",
      ready: () => Boolean(global.XLSX?.utils)
    },
    capture: {
      src: "./vendor/html2canvas-1.4.1/html2canvas.min.js",
      ready: () => typeof global.html2canvas === "function"
    },
    pdf: {
      src: "./vendor/jspdf-2.5.2/jspdf.umd.min.js",
      ready: () => typeof global.jspdf?.jsPDF === "function"
    },
    charts: {
      src: "./vendor/chart.js-4.4.7/chart.umd.min.js",
      ready: () => typeof global.Chart === "function"
    }
  });

  const pending = new Map();

  function load(name){
    const definition = definitions[name];
    if(!definition) return Promise.reject(new Error(`Dependencia desconocida: ${name}`));
    if(definition.ready()) return Promise.resolve();
    if(pending.has(name)) return pending.get(name);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = definition.src;
      script.async = true;
      script.dataset.appDependency = name;
      script.onload = () => definition.ready()
        ? resolve()
        : reject(new Error(`La dependencia ${name} no quedó disponible.`));
      script.onerror = () => reject(new Error(`No se pudo cargar ${definition.src}`));
      document.head.appendChild(script);
    }).catch(error => {
      pending.delete(name);
      document.querySelector(`script[data-app-dependency="${name}"]`)?.remove();
      throw error;
    });

    pending.set(name, promise);
    return promise;
  }

  function loadMany(names){
    return Promise.all([...new Set(names)].map(load));
  }

  global.AppDependencies = Object.freeze({ load, loadMany });
})(window);
