# SYX | Órdenes de Trabajo — Nueva aplicación independiente (base inicial)

**Firebase:** `ordenes-trabajo-a8499` · **GitHub previsto:** `agusthebeast/sistema-skorn`

Este repositorio NO utiliza `syx-gestion` ni lee su base de datos. UI desarrollada desde cero como referencia de flujo de taller; no contiene software, logos, scripts ni imágenes de Gestioo.

## Primeros pasos en Firebase Console

1. En `ordenes-trabajo-a8499`, abrir **Authentication → Sign-in method** y habilitar **Correo electrónico/contraseña**.
2. En **Authentication → Users**, crear el primer usuario empleado. No guardar la contraseña en GitHub ni en archivos del proyecto.
3. En **Firestore Database**, crear la base `(default)` en modo producción (Standard). Seleccionar una región y mantenerla. No usar modo prueba público.
4. Copiar el contenido de `firestore.rules` y publicarlo en Firestore → Reglas. Alternativamente, después de instalar Firebase CLI, ejecutar `firebase deploy --only firestore:rules --project ordenes-trabajo-a8499`.
5. Abrir el proyecto con VS Code / Live Server: la interfaz carga bibliotecas Firebase mediante Internet. Si el login falla, revisar los servicios activados y el dominio autorizado. Para pruebas locales, usar `localhost` / `127.0.0.1`.

## Publicar en Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase use ordenes-trabajo-a8499
firebase deploy --only hosting,firestore:rules --project ordenes-trabajo-a8499
```

URL prevista (solo después del primer deploy exitoso): `https://ordenes-trabajo-a8499.web.app`.

## Funciones en esta base

- Login Firebase Auth sin registro público.
- Listado de órdenes: búsqueda por número, cliente/DNI, marca/modelo, filtros de área y estado.
- Alta de clientes, con índice único por DNI.
- Creación de órdenes con número correlativo mediante transacción Firestore; equipos identificados por número de serie cuando existe.
- Detalle, diagnóstico, presupuesto, estados y responsable.
- Una única entrega por orden: transacción Firestore, pago combinado, Caja obligatoria si presupuesto > 0, presupuesto $0 sin ingreso.
- Caja: apertura/cierre, ingresos/egresos manuales, movimientos de órdenes.
- Venta manual con registro en Caja.

## Limitaciones actuales

- **Es una primera base, no una réplica completa de Gestioo.** Falta el formulario completo de carga de equipos, fotos, impresión de comprobantes, stock, POS por catálogo, historial detallado de eventos y permisos por perfil.
- La colección se limita inicialmente a 1000 órdenes, 1500 clientes y 1500 movimientos para evitar lecturas sin límite. Antes de utilizar con muchos registros, agregar paginación y búsquedas indexadas.
- Las reglas incluidas son una primera protección de acceso y escritura. Para producción falta control de roles granulares, validaciones más estrictas de importes y cuentas, y pruebas de seguridad mediante el emulador de Firebase.
- Para impedir cobros duplicados, el movimiento automático tiene ID estable `retiro_<ordenId>` y se crea en la misma transacción que marca la orden entregada. Las órdenes de esta nueva base parten de cero; no se migran automáticamente órdenes/cobros de Gestioo o V11.
- No se utiliza Cloud Storage, para evitar requerir facturación Blaze durante esta etapa.
- Este paquete no incluye información real de clientes ni archivos exportados de Gestioo.

## Pruebas básicas

```bash
node --test tests/domain.test.mjs
node --check public/js/app.js
```

### Pruebas manuales seguras

Con un usuario de prueba: iniciar sesión, abrir caja, crear cliente ficticio, crear orden, guardar presupuesto, entregar con pago combinado y comprobar que se ve un único movimiento en Caja. Intentar entregar nuevamente y verificar bloqueo. Repetir presupuesto $0 y confirmar que no se genera ingreso.

**No usar con dinero real** hasta validar con el emulador y habilitar permisos adecuados para todos los empleados.
