# SYX · Órdenes de Trabajo y Caja

**Proyecto independiente:** Firebase `ordenes-trabajo-a8499` · GitHub `agusthebeast/sistema-skorn`.

Paquete actualizado: 28 de octubre de 2026. No utiliza la configuración ni los datos de SYX Gestión anterior.

## Funciones incluidas

### Taller y clientes
- Inicio de sesión con Firebase Authentication (correo y contraseña).
- Alta y búsqueda de clientes por DNI, nombre y teléfono; documento como identificador único.
- Nueva orden con numeración correlativa de seis dígitos almacenada en Firestore.
- Marca y modelo con autocompletado a partir de órdenes existentes y catálogos Firestore; se guardan al crear una orden.
- Selección de falla frecuente o creación de una falla personalizada, que queda guardada.
- **Estado físico del equipo**, distinto de falla y diagnóstico: se documentan rayones, golpes, faltantes, etc.
- **Accesorios:** chips con selección múltiple, más campo «Guardar accesorio» para crear otro y hacerlo disponible para todo el personal. Se conservan en la orden como lista independiente y texto para compatibilidad con las órdenes anteriores.
- Estados, áreas, responsable, presupuesto, diagnóstico y observaciones editables hasta la entrega.
- Historial básico del mismo equipo por ID interno y filtros por estado, área y búsqueda.

### Impresión A4
- Al crear una orden se abre automáticamente una hoja de ingreso: **comprobante para el cliente + copia del taller + dos etiquetas recortables** con códigos de barras.
- Los tres códigos de la hoja de ingreso contienen el número de orden de seis dígitos, para que el lector pueda buscarla escribiendo ese valor.
- Desde «Ver / Imprimir» se puede reimprimir la hoja de ingreso tantas veces como sea necesario.
- Al confirmar la entrega se habilita «Imprimir constancia de retiro» con datos del cliente, equipo, estado al ingresar, diagnóstico, importe, medios de pago, persona que retira, firma y código de barras.
- Códigos **Code 39 numéricos generados localmente como SVG**, sin servicios externos ni claves de API. Configurá el lector para leer Code 39.
- Impresión en tamaño A4; en el navegador habilitá ventanas emergentes y elegí escala 100 %, sin encabezados/pies de página si querés aprovechar el formato.

### Caja y cobros
- Apertura y cierre de una caja global, movimientos manuales de ingreso/egreso y venta manual.
- Presupuesto obligatorio antes de entregar (se permite $0). Se cobra **solo al entregar**.
- Cobros combinados de efectivo, transferencia, QR y Posnet; el total debe coincidir exactamente con el presupuesto.
- Entrega y cobro se ejecutan **en una transacción**; identificador del movimiento fijo `retiro_{id_orden}`; no se permiten entregas ni cobros duplicados por el flujo de la app.
- Las órdenes con presupuesto 0 pueden entregarse sin caja abierta y no generan un movimiento de ingreso falso.

## Primera instalación

### 1. Subir archivos
Subí **los contenidos del ZIP descomprimido** a la raíz de `https://github.com/agusthebeast/sistema-skorn` en la rama principal. Reemplazá archivos existentes cuando GitHub lo indique. Importante: agregá los nuevos archivos `public/js/print.js` y `tests/print.test.mjs`, además del resto de archivos modificados.

### 2. Publicar en GitHub Codespaces
En **Code → Codespaces** abrí una terminal en la raíz del repositorio y ejecutá:

```bash
npm install -g firebase-tools
firebase login --no-localhost
firebase deploy --only hosting,firestore:rules --project ordenes-trabajo-a8499
```

Si Codespaces tenía un repositorio abierto desde antes de la carga, ejecutá `git pull origin main` primero.

**Es obligatorio publicar `firestore.rules`**: sin ello, la app no podrá utilizar la colección nueva `catalogos` si las reglas previas bloquean su acceso.

### 3. Probar
1. Abrí `https://ordenes-trabajo-a8499.web.app` e ingresá con el usuario ya creado en Firebase Authentication.
2. Creá un cliente ficticio, después una orden con dos accesorios y otro nuevo personalizado.
3. Permití el popup de impresión y comprobá el documento y las dos etiquetas del taller.
4. Creá otra orden: los accesorios guardados y la falla deben volver a aparecer.
5. Abrí Caja y registrá presupuesto y cobro de prueba, luego marcá la orden como Entregada.
6. Comprobá que existe **un único** movimiento de caja, y emití la constancia de retiro.
7. Probá una orden de $0, sin caja abierta, para comprobar que no genera ingreso.

Para corregir caché tras publicar, recargá con **Ctrl+Shift+R**.

## Seguridad y alcance

- No agregues contraseñas, tokens privados, cuentas de servicio ni contactos reales a GitHub público.
- La configuración pública de Firebase en `public/js/firebase.js` no equivale a una cuenta privada; **las reglas Firestore y Authentication son las barreras reales**.
- Las reglas del paquete permiten utilizar los datos a cuentas autenticadas: para controles por roles, autorizaciones diferenciadas o auditoría reglamentaria necesitaremos definir los perfiles del personal y endurecer dichas reglas antes de uso intensivo.
- Esta actualización implementa las mejoras solicitadas del **taller** junto al flujo básico de Caja, Clientes y venta manual de la versión previa. El POS sigue siendo de venta manual: no se presenta como una réplica total de Gestioo ni como inventario/contabilidad integral.
- No se migran clientes ni órdenes anteriores ni se modifica el proyecto Firebase antiguo.
- Las pruebas automáticas verifican la lógica de pago y la estructura de las impresiones, pero **las operaciones en Firebase real requieren la prueba guiada** descrita arriba.

## Pruebas locales

Requiere Node.js 18+:

```bash
node --test tests/*.mjs
```

## Estructura

```
.firebaserc
firebase.json
firestore.rules
public/index.html
public/css/style.css
public/js/app.js
public/js/domain.js
public/js/firebase.js
public/js/print.js
tests/domain.test.mjs
tests/print.test.mjs
```
