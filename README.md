# Control de Acceso Unificado

Aplicacion PWA para control operativo de accesos, citas, vales, bitacora de guardias, reportes y rondines de seguridad.

Version actual visible en la app: `control-acceso-v106`.

## Modulos principales

- Proveedores: citas, autorizacion, entrada, salida, dictamen y trazabilidad.
- Visitantes: citas y flujo independiente de registro, entrada y finalizacion.
- Vales de salida de activo: solicitud, autorizacion, QR y salida fisica de activos.
- Vales de salida de personal: registro y seguimiento de salidas de personal.
- Bitacora de novedades: registro operativo por guardia mediante credencial QR.
- Rondinero: rondines digitales por puntos QR.
- Reportes: indicadores, historiales y exportacion a Excel.
- Configuracion: usuarios, roles, permisos, proveedores y catalogos.

## Tecnologia

- HTML, CSS y JavaScript en una sola app principal.
- Firebase Authentication para sesiones.
- Firebase Firestore como base de datos.
- LocalStorage e IndexedDB para soporte local/offline-first.
- Service Worker y Manifest para funcionamiento PWA.
- Codigos QR para citas, vales, rondines y tarjetas de guardia.

Archivos principales:

- `index.html`: interfaz, estilos y logica principal.
- `service-worker.js`: cache PWA.
- `manifest.json`: configuracion de instalacion.
- `reglas.txt`: reglas sugeridas para Firestore.

## Roles

La app contempla roles operativos como:

- Administrador
- Coordinador / Supervisor
- Guardia
- Compras
- Jefe de compras
- Anfitrion
- Jefe
- Calidad
- Contraloria
- Proveedor

Los permisos se controlan desde la configuracion de usuarios y desde las reglas de Firestore.

## Proveedores

El modulo de proveedores gestiona el acceso de transportistas, proveedores y visitas relacionadas con operacion.

Funciones principales:

- Dashboard independiente de proveedores.
- Creacion de nueva cita de proveedor.
- Consulta de citas de proveedores.
- Validacion de horarios disponibles.
- Bloqueo de citas a las 5:00 pm o despues.
- Registro de llegada.
- Flujo de entrada, dentro, salida y finalizacion.
- Captura de guardia y gafete.
- Confirmacion de OC y factura cuando aplica.
- Dictamen operativo: pendiente, aceptado o rechazado.
- QR por cita para agilizar caseta.
- Historial por dia y busqueda por folio/QR.

Los proveedores usan la coleccion `visitas`.

## Visitantes

Visitantes tiene flujo separado de proveedores para evitar mezclar informacion operativa.

Funciones principales:

- Dashboard independiente de visitantes.
- Nueva cita de visitante sin selector de tipo proveedor/visitante.
- Tabla propia en Firestore mediante la coleccion `visitantes`.
- Registro de anfitrion, motivo y datos del visitante.
- Entrada y finalizacion del visitante.
- Sin estado `Despachado`; el flujo pasa de `Dentro` a `Finalizado`.
- QR por cita de visitante.
- Historial y consulta separada desde el sidebar.

La separacion permite operar visitantes sin afectar la tabla historica de proveedores.

## Citas y horarios

La agenda no permite generar citas fuera del horario permitido.

Reglas actuales:

- Los horarios de 5:00 pm y 5:30 pm no se muestran.
- No se puede crear una cita a las 5:00 pm o despues.
- No se puede editar una cita para dejarla a las 5:00 pm o despues.
- Se valida capacidad por area y horario.

## Vales de salida de activo

Este modulo controla la salida fisica de activos mediante autorizacion y QR.

Funciones principales:

- Creacion de vale de activo.
- Captura de solicitante, area, descripcion y datos del activo.
- Flujo de autorizacion segun rol.
- Generacion/consulta de QR del vale.
- Registro de salida en caseta.
- Consulta de vales activos y recientes.
- Sincronizacion con Firestore y respaldo local.

Coleccion principal: `vales_activos`.

## Vales de salida de personal

Este modulo registra salidas de personal y conserva trazabilidad del evento.

Funciones principales:

- Creacion de vale de salida de personal.
- Captura de empleado, area, motivo y fecha.
- Autorizacion segun permisos.
- QR para validacion en caseta.
- Registro de salida.
- Consulta de vales del dia.
- Cierre y seguimiento del estado.

Coleccion principal: `vales_personal`.

## Bitacora de novedades

La bitacora permite que guardias registren novedades del turno.

Funciones principales:

- Consulta por fecha.
- Registro de novedad con titulo, texto, fecha y hora.
- Identificacion del guardia real mediante tarjeta `QR Guardia`.
- Registro del operador de sesion de la tablet.
- Soporte para tablets compartidas.
- Sin fotos ni videos para no saturar Firebase.

Coleccion principal: `bitacora_guardia`.

## Rondinero

El modulo Rondinero permite ejecutar rondines de seguridad por medio de puntos de control con QR.

Flujo administrativo:

1. El administrador o supervisor registra puntos de control.
2. Cada punto tiene nombre, ubicacion, descripcion y codigo QR.
3. Se crean rutas con los puntos que debe visitar el guardia.
4. Desde Configuracion > Usuarios se puede generar el `QR Guardia`.
5. El administrador consulta historial, cumplimiento, avance y detalle de recorridos.

Flujo del guardia:

1. El guardia entra a `Mi rondin` desde su sidebar.
2. Antes de iniciar, escanea su tarjeta `QR Guardia`.
3. Selecciona la ruta asignada.
4. Inicia el rondin.
5. Escanea los QR de los puntos visitados.
6. Puede reportar novedades durante el recorrido.
7. Cierra el rondin al finalizar.

El rondinero guarda:

- Guardia identificado por QR.
- Usuario de la tablet que tenia la sesion abierta.
- Fecha y hora.
- Punto de control.
- Ubicacion.
- Estatus.
- Observaciones.
- Novedades reportadas.
- Tiempo total y avance del recorrido.

Colecciones principales:

- `rondinero_puntos`
- `rondinero_rutas`
- `rondinero_rondines`
- `rondinero_eventos`

Nota: el modulo no guarda fotos ni videos para evitar saturar Firebase.

## Uso compartido de tablet

En caseta puede existir una sesion fija abierta en la misma tablet. Para identificar al guardia real, la app usa una tarjeta QR por guardia.

Esto aplica en:

- Rondinero.
- Bitacora de novedades.

Cuando el guardia escanea su QR, el sistema registra dos identidades:

- Guardia real: quien ejecuta el rondin o registra la novedad.
- Operador de sesion: usuario que esta autenticado en la tablet.

## Reportes

La app incluye reportes e historiales para seguimiento operativo.

Funciones principales:

- Historial por dia.
- Reportes por rango de fechas.
- Indicadores de visitas, estados, tiempos y puntualidad.
- Reportes de cumplimiento del Rondinero.
- Cumplimiento por guardia.
- Cumplimiento por turno.
- Detalle de recorrido.
- Exportacion a Excel hasta el dia actual.

Los reportes por rango consultan Firestore cuando hay conexion y usan datos locales como respaldo cuando no hay internet.

## Depuracion de datos

La app tiene funciones administrativas para limpiar informacion operativa:

- `Depurar (<= hoy)`: elimina registros con fecha hasta el dia actual.
- `Depurar (+30 dias)`: elimina registros mayores a 30 dias.

Estas depuraciones incluyen:

- Citas de proveedores.
- Citas de visitantes.
- Vales de salida de activos.
- Vales de salida de personal.
- Bitacora de novedades.
- Rondines y eventos del Rondinero.
- Resumenes diarios relacionados.

No se borran:

- Usuarios.
- Proveedores del catalogo.
- Puntos QR del Rondinero.
- Rutas del Rondinero.
- Configuracion general.

## Ahorro de datos Firebase

La app esta pensada para reducir consumo de Firestore y evitar lecturas/escrituras innecesarias.

Medidas aplicadas:

- No usa `onSnapshot`; evita listeners en tiempo real consumiendo lecturas constantes.
- Usa lecturas puntuales con `getDocs` y `getDoc`.
- Usa cache local con `localStorage` e `IndexedDB`.
- Usa TTL de lectura para no consultar Firestore en cada cambio de vista.
- El dashboard se sincroniza cada 5 minutos solo si la app esta visible.
- El auto-sync no reenvia citas sin cambios; solo sube registros nuevos o modificados.
- Rondinero no guarda fotos ni videos.
- Bitacora no guarda evidencia pesada.
- Reportes por rango se ejecutan solo cuando el usuario los solicita.
- Las consultas tienen limites por coleccion para controlar lectura masiva.

TTL principales:

- Citas del dia: 5 minutos.
- Vales de activos: 10 minutos.
- Vales de personal: 5 minutos.
- Bitacora: 3 minutos.
- Rondinero: 3 minutos.
- Usuarios pendientes: 5 minutos.

Zonas que mas pueden consumir cuando se usan:

- Reportes y exportaciones por rango.
- Rondinero administrativo con historial y eventos.
- Administracion de usuarios.
- Depuraciones masivas, porque eliminan documentos en varias colecciones.

## Colecciones Firestore

Colecciones principales usadas por la app:

- `users`
- `proveedores`
- `visitas`
- `visitantes`
- `vales_activos`
- `vales_personal`
- `bitacora_guardia`
- `presence`
- `resumen_diario`
- `rondinero_puntos`
- `rondinero_rutas`
- `rondinero_rondines`
- `rondinero_eventos`

## Reglas de Firestore

Las reglas deben publicarse manualmente en Firebase Console tomando como base `reglas.txt`.

Puntos importantes:

- Proveedores usan `visitas`.
- Visitantes usan `visitantes`.
- Rondinero debe permitir que el guardia trabaje con la sesion de la tablet mediante `operadorUid`.
- Bitacora debe permitir guardar novedades cuando el usuario autenticado sea el operador de sesion.
- Administrador y supervisor conservan acceso de consulta y seguimiento.

Si aparece `FirebaseError: Missing or insufficient permissions`, revisar primero:

- Que `reglas.txt` este publicado en Firebase.
- Que el usuario tenga el rol y permisos correctos.
- Que el documento guarde `operadorUid` igual al usuario autenticado.
- Que la tarjeta QR del guardia sea valida.

## PWA y cache

Cuando se modifique `index.html`, tambien se debe actualizar:

1. La version visible en el sidebar.
2. `CACHE_NAME` en `service-worker.js`.

Esto fuerza a los equipos a descargar la nueva version de la app.

Version actual:

- Sidebar: `control-acceso-v106`
- Service Worker: `control-acceso-v106`

## Mantenimiento recomendado

- Probar cambios como administrador, guardia y usuario operativo.
- Verificar proveedores y visitantes por separado.
- Verificar vales de activo y vales de personal antes de liberar cambios.
- Verificar que las reglas de Firestore esten publicadas despues de modificar permisos.
- Limpiar cache del navegador si una tablet sigue mostrando una version anterior.
- Mantener la version del sidebar y del service worker sincronizadas.
- Evitar cargar archivos pesados a Firebase desde rondines o bitacora.

## Kioscos de vales

- `kiosko-vales-personal.html`: solicitudes exclusivas de vales de personal.
- `kiosko-vales-activos.html`: solicitudes exclusivas de vales de activos.
- `kiosko-vales.html`: acceso combinado conservado por compatibilidad.

Los dos kioscos dedicados reutilizan la misma lógica para mantener formularios, autorizadores y reglas sincronizados. El selector Autoriza consulta los permisos configurados en Roles y sólo muestra usuarios cuyo rol puede autorizar el tipo de vale correspondiente.
