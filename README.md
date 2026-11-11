# SYX | Órdenes de Trabajo — V8

**Proyecto Firebase:** `ordenes-trabajo-a8499`  
**Repositorio de destino:** `agusthebeast/sistema-skorn`  
**Hosting previsto:** https://ordenes-trabajo-a8499.web.app  
**Actualización:** sobre V7 sin eliminar colecciones o datos anteriores.

## Funciones incorporadas en V8

### 1. LISTADO de órdenes abiertas

- Botón **LISTADO** al lado del contador **Órdenes abiertas**.
- Generación de **PDF descargable real A4 horizontal**, sin dependencias externas y sin tener que usar «Guardar como PDF».
- Descarga `SYX_Listado_Ordenes_AAAA-MM-DD.pdf` con encabezado SYX, fecha, agrupación **Entrada / Reparación / Salida**, cantidad por área y número de páginas.
- Columnas: número, fecha, prioridad, estado, serie, marca, modelo, cliente, responsable y presupuesto.
- Las órdenes **Entregado** se excluyen aun si conservan el área Salida. Salida puede contener reparadas o sin solución que todavía no se retiraron.
- Selector para exportar **todas las abiertas**, solo el **área activa** o los **filtros de la pantalla**.
- Antes de descargar, se lee de **Firebase servidor la colección completa** de órdenes, sin el límite de la vista de la pantalla.

### 2. Tickets internos para impresora térmica de 80 mm

- **Punto de Venta** (venta con inventario): detalle de cada producto, SKU, cantidad, precio original de la operación, total y pagos combinados. **No se asocian clientes.**
- **Ingreso manual** (Caja y Venta excepcional): concepto, monto y medio de pago. No descuenta stock.
- **Egreso manual:** concepto, monto y medio utilizado.
- **Cierre de Caja:** apertura/cierre, responsables, fondo inicial, ingresos y egresos, efectivo esperado, contado, diferencia y desglose digital (transferencia/QR/Posnet).
- Comprobante interno, **no válido como factura fiscal**. No integra ARCA.
- **Numeración única nueva**, compartida entre ventas, movimientos manuales y cierres (campo `numeroComprobante` de 8 dígitos), asignada en la transacción que crea el registro. No cambia el número ni el ID de las órdenes de trabajo.
- Los registros antiguos sin correlativo conservan su ID y reciben un código de búsqueda derivado del ID solo para su visualización; no se modifica la base de datos al imprimirlos.
- Código de barras Code 39 numérico, imprimible y escaneable. Valor numérico de los comprobantes nuevos: `numeroComprobante`.

### 3. Vista de comprobantes y reimpresión

- Después de confirmar una operación se presenta la vista del ticket con **Imprimir** o **Finalizar sin imprimir**.
- **Historial de Ventas:** buscar por número, fecha, SKU, nombre de producto o empleado; botones **Ver** y **Reimprimir**.
- **Caja actual e Historial de cajas:** botón **Ver** de cada movimiento, con impresión o reimpresión. Los cobros de órdenes conservan su comprobante de retiro A4 original.
- **Cajas cerradas:** botón **Cierre** directamente desde el historial; también desde el detalle del turno.
- La impresión y reimpresión **no escriben en Firebase**, no generan un nuevo cobro ni descuentan stock.
- Detalles de venta conservados dentro de `ventas.items`: el ticket histórico no consulta precios ni nombres actualizados en inventario.

### 4. Configuración > Impresión

- Configuración centralizada en `config/impresion` en Firestore, con reglas de lectura y escritura para personal autenticado y límites de campos.
- Editar dirección del local, WhatsApp, mensaje final, mostrar SKU, mostrar responsable, mostrar barras y abrir impresión automáticamente.
- Ancho fijo **80 mm**; el LISTADO continúa **A4 horizontal**.
- Por defecto la impresión automática está desactivada. El navegador puede bloquear ventanas automáticas después de guardar; siempre queda disponible el botón manual.
- Para la impresora, **instalar el controlador**, elegir papel térmico de **80 mm** en las preferencias del navegador/driver, márgenes 0 o mínimos y desactivar encabezados y pies del navegador. La longitud del ticket crece con los productos.

## Cómo actualizar desde V7 (sin borrar datos)

1. **Conservar una copia del repositorio actual**, idealmente crear una rama o etiqueta V7.
2. Descomprimir el ZIP V8, copiar su contenido a la raíz de `agusthebeast/sistema-skorn` reemplazando archivos con el mismo nombre. Conservar los archivos ocultos `.firebaserc` y `.gitignore`.
3. Desde GitHub Codespaces, después de subir los cambios:

   ```bash
   git pull origin main
   firebase use ordenes-trabajo-a8499
   firebase deploy --only hosting,firestore:rules --project ordenes-trabajo-a8499
   ```

   El despliegue **solo** actualiza los archivos de Hosting y las reglas de Firestore del proyecto especificado. No modifica `syx-gestion` ni borra documentos existentes.

4. Abrir https://ordenes-trabajo-a8499.web.app, recargar con `Ctrl+Shift+R`.
5. Primero probar con una **venta pequeña de prueba**, un **ingreso manual**, un **egreso manual**, un **cierre de Caja** y una exportación LISTADO. Confirmar que cada movimiento aparece una sola vez y que inventario se descuenta una sola vez.
6. Para imprimir, verificar la configuración del driver 80 mm. Si aparecen ventanas bloqueadas, permitir ventanas emergentes para `ordenes-trabajo-a8499.web.app`.

### Datos que permanecen intactos

No se eliminan ni transforman las colecciones existentes `ordenes`, `clientes`, `equipos`, `cajas`, `movimientos`, `productos`, `ventas`, `ajustesStock` y `catalogos`. La nueva versión solo agrega a documentos futuros `numeroComprobante`, añade el contador `config/contadores.comprobantes` y crea (si el usuario guarda la configuración) `config/impresion`.

No es necesario volver a importar clientes, modelos, órdenes ni inventario. **No subir CSV/JSON privados a GitHub.**

### Pruebas incluidas

En una terminal con Node 18+:

```bash
node --test tests/*.mjs
```

Se ejecutaron **57 pruebas automáticas locales** sobre catálogo, clientes, migración, Caja, PDF y tickets. Además, se verificó la navegación visual con un simulador local de Firebase, sin tocar la base de datos real; el PDF de 149 órdenes de ejemplo ocupó cuatro páginas A4 horizontales. Las integraciones con el proyecto Firebase de producción y la impresora térmica física **aún deben probarse en el local**.

## Estructura

- `public/index.html` — pantalla y navegación V8.
- `public/css/style.css` — estilos de la app y previsualización del ticket.
- `public/js/app.js` — conexión entre interfaz, Caja, ventas y órdenes.
- `public/js/listado-pdf.js` — PDF A4 real (sin librerías CDN).
- `public/js/receipts.js` — comprobantes térmicos de 80 mm.
- `public/js/print.js` — hojas A4 originales de ingreso y retiro y barras numéricas Code 39.
- `firestore.rules` — reglas con autorización para `config/impresion`.
- `tests/` — pruebas de regresión y nuevas pruebas V8.

**Esta versión se entrega en un ZIP para que la publiques cuando lo decidas; no se hicieron cambios en tus sistemas desplegados durante su creación.**
