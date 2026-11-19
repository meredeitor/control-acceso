# Dependencias locales

Estos archivos sustituyen los componentes que antes se descargaban desde Google, unpkg, jsDelivr y cdnjs. Las versiones están fijadas para que todos los dispositivos ejecuten exactamente el mismo código publicado en GitHub Pages.

| Componente | Versión | Carga |
| --- | --- | --- |
| Firebase App, Auth y Firestore | 12.11.0 | Inicio de sesión y perfil |
| qrcodejs | 1.0.0 | Al mostrar o generar un QR |
| html5-qrcode | 2.3.8 | Al abrir la cámara |
| xlsx-js-style | 1.2.0 | Al importar o exportar Excel |
| html2canvas | 1.4.1 | Al guardar o compartir un pase |
| jsPDF | 2.5.2 | Al generar un PDF |
| Chart.js | 4.4.7 | Al abrir Reportes |

Los módulos de Firebase Auth y Firestore conservan su licencia original y fueron ajustados únicamente para importar `firebase-app.js` desde esta misma carpeta, sin solicitarlo a Google.
