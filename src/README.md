# Código fuente de la aplicación

La aplicación se conserva en fragmentos ordenados para reducir el riesgo de la separación inicial. El comando `npm run build` concatena estos archivos en el orden declarado por `scripts/build.mjs` y después genera `assets/app.min.js` con sintaxis ES2017, compatible con Safari/iOS 13+, Chrome y Android WebView modernos.

En esta primera división no se cambian funciones, nombres, permisos ni diseño. Algunos fragmentos todavía comparten estado con el siguiente archivo; esa separación interna se podrá refinar gradualmente después de validar esta compilación en operación.
