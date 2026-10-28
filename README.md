# SYX | Órdenes de Trabajo — v3: Caja, Historial, Inventario y Estadísticas

**Firebase independiente:** `ordenes-trabajo-a8499`  
**GitHub:** `agusthebeast/sistema-skorn`  
**Sitio esperado:** `https://ordenes-trabajo-a8499.web.app`

Este paquete amplía la v2. Conserva las órdenes de taller, clientes, selección de accesorios, descripción del estado físico, recepción A4, códigos de barras, entrega e impresión de retiro.

## Novedades de la versión 3

### Caja y cierres
- Listado persistente de cajas abiertas y cerradas en Firestore, con apertura/cierre, responsables, fondo inicial, efectivo esperado, efectivo contado y diferencia.
- Apertura con **fondo inicial en efectivo** (no se contabiliza como ingreso de venta).
- Los resúmenes de cajas nuevas se mantienen en el mismo commit que cada movimiento, sin sumarlos dos veces; el cierre conserva un resumen final.
- Cada caja histórica tiene un botón **Ver detalle**, que busca **todos** los movimientos de ese turno por `cajaId`, no solo los movimientos generales de la pantalla.
- Descarga CSV del historial de un turno y de la caja abierta.
- Los cierres de v2 que no tenían resumen precalculado también se pueden abrir y reconstruir desde sus movimientos.

### Estadísticas
- Tres cuadros distintos de **Efectivo**, **Digital** (Transferencia + QR + Posnet) y **Total general**, todos con ingresos, egresos y neto.
- Resumen digital separado por QR, Transferencia y Posnet.
- Filtro por fecha y alcance de la caja actual o todas las cajas, y exportación CSV.
- El cálculo de ingresos digitales mixtos distingue cada medio: una venta de $100 con $30 efectivo y $70 QR se refleja una sola vez en Total general.
- Las vistas estadísticas generales consultan hasta 5.000 movimientos (se advierte al llegar al límite). Para un cierre exacto, usar **Historial de cajas → Ver detalle**, donde se consultan los movimientos del turno sin ese límite general.

### Inventario
- Productos en colección `productos`, identificados por **SKU único**.
- Campos: SKU, nombre, categoría, stock, stock mínimo, precio efectivo y precio lista, activo/archivado.
- Búsqueda por SKU, nombre y categoría, alerta de mínimo y exportación CSV.
- Ajuste manual de stock con motivo obligatorio, usuario y antes/después, registrado en `ajustesStock`.

### Venta rápida en Caja y Punto de Venta
- Búsqueda / escaneo por SKU o parte del nombre, carrito con múltiples productos y cantidades.
- Tarifa de lista o efectivo; **tarifa efectivo exige 100 % pago efectivo**. El precio de lista permite medios combinados.
- Botones para completar pago con Efectivo, QR, Transferencia o Posnet y cuatro casilleros para cobro mixto.
- Venta, movimiento de caja, desglose de pagos y descuento de stock se registran **en una sola transacción Firestore** con revalidación de stock y de precio, y un ID de movimiento único para esa venta.
- Histórico de ventas del inventario y exportación CSV.
- Se conserva el ingreso manual excepcional que no descuenta stock, identificado explícitamente como tal.

## Publicación de v3

1. Descomprimir y subir **los archivos del interior** del ZIP a la raíz del repositorio `agusthebeast/sistema-skorn`, reemplazando los archivos de v2 (no subir el ZIP como único archivo).
2. Abrir Codespaces de ese repositorio, y ejecutar:

```bash
git pull origin main
firebase deploy --only hosting,firestore:rules --project ordenes-trabajo-a8499
```

3. Abrir `https://ordenes-trabajo-a8499.web.app` y presionar `Ctrl+Shift+R` para renovar la caché.

**Importante:** publicá **hosting y firestore:rules juntos**. Esta versión incorpora las colecciones `productos`, `ventas` y `ajustesStock`, además de actualizar los permisos de `cajas` para poder registrar saldos de turno durante su operación. Si las reglas no se publican, podrían fallar los cobros y la venta de productos.

## Prueba mínima antes de utilizar dinero real

1. Acceder con el usuario de Authentication.
2. Abrir una caja con $10.000 de fondo inicial.
3. En Inventario, crear un producto de prueba con SKU `TEST-HDMI`, stock 3, precio lista $5.000 y efectivo $4.500.
4. En Caja → Venta rápida, buscar `TEST-HDMI` y vender 1 unidad con cobro efectivo; confirmar que el stock baja de 3 a 2, que Caja muestra un ingreso de $4.500 en efectivo y que la venta aparece en Historial de ventas.
5. Registrar un egreso digital de $1.000, comprobar que las estadísticas sean: Efectivo +$4.500, Digital -$1.000, General +$3.500.
6. Cerrar caja contando efectivo y comprobar que aparece en Historial. Abrir el detalle y exportar movimientos.
7. Volver a abrir otra caja: la anterior debe permanecer cerrada e independiente.
8. Revisar con datos ficticios los cobros de entrega de órdenes y comprobar que no generen movimientos duplicados.
9. Eliminar/archivar solamente los productos de prueba desde la app (los movimientos de prueba quedan asentados por auditoría). **Preferible probar en un proyecto de Firebase de prueba si no querés contaminar tus libros reales**.

## Seguridad y límites de esta versión

- No se modificó el proyecto Firebase anterior `syx-gestion`.
- El código Firebase del frontend es público por diseño. Nunca subir claves privadas ni datos reales de clientes a GitHub público.
- `firestore.rules` restringe la lectura/escritura a cuentas autenticadas, con reglas de integridad básicas para órdenes, cobros, ventas y stock. **No establece aún roles detallados por empleado**: para producción, conviene introducir permisos de administrador, vendedor, técnico y cajero y reforzar la auditoría del lado del servidor.
- Las ventas y cierres se prueban con Node.js localmente y deben verificarse **en Firebase real**. No afirmamos que el despliegue ya se realizó.
- El balance de caja refleja movimientos de dinero registrados; **no equivale a ganancia neta contable** porque no descuenta costos de mercadería, impuestos o comisiones de procesadores salvo egresos registrados.
- Los registros anteriores al nuevo sistema de resumen continúan accesibles. Si hay más de 5.000 movimientos, el cuadro general requiere paginación/agregaciones para informes históricos exhaustivos; el detalle por turno realiza una consulta específica.

## Pruebas automáticas

```bash
node --test tests/*.mjs
```

Incluye pruebas de entrega, pagos, códigos de barras, clasificación financiera, SKU, carrito, cobro mixto y control de existencias.
