# SYX | Órdenes de Trabajo — V5 (ficha de cliente y configuración)

**Firebase exclusivo:** `ordenes-trabajo-a8499`  
**Repositorio:** `agusthebeast/sistema-skorn`  
**Sitio:** `https://ordenes-trabajo-a8499.web.app`

Esta actualización conserva Caja, historial de cierres, estadísticas, inventario, ventas, órdenes de taller, etiquetas con código de barras y constancias de retiro de V3. Agrega una **pantalla de importación privada** y permite ver y editar los estados originales de Gestioo, sin cambiarlos accidentalmente a «Sin estado».

## Novedades de la V5 (30/10/2026)

### Ver orden → Datos completos del cliente

- En **Ver / Imprimir** se muestra, de forma visible y sin cambiar de pantalla, una tarjeta con **nombre y apellido, DNI, teléfono/WhatsApp, correo electrónico y dirección**.
- Si el registro en la agenda incluye observaciones, se muestran también.
- Los datos se toman de **la ficha actualizada de `clientes`** en Firestore usando `clienteId`. Si esa ficha aún no existe, se usan los datos históricos disponibles dentro de la orden; los campos faltantes dicen *Sin registrar*.
- Los clientes migrados con datos por revisar siguen identificados. No se inventan DNI, teléfonos ni correos.
- Los botones **Imprimir orden** e **Imprimir retiro** también toman los datos vigentes de contacto cuando están disponibles.

### Configuración → Accesorios y Fallas informadas

- Nueva sección **Configuración** (ícono de engranaje del menú izquierdo) con pestañas **Accesorios** y **Fallas informadas**.
- Podés **agregar opciones** y se guardan en la colección `catalogos`.
- Podés **quitar una opción** de la lista usada para órdenes nuevas. Se marca `activo:false` en Firestore: **no se borra ni modifica ninguna orden histórica**. Con **Mostrar también las ocultas**, se puede **Restaurar**.
- El mismo catálogo se usa en **Crear orden** y en el selector de **Falla informada** al **editar una orden**. Las fallas históricas se siguen mostrando en su propia orden aunque se hayan ocultado del selector general.
- Los accesorios seleccionados históricamente tampoco se pierden ni se quitan de órdenes antiguas.

### Instalación sin pérdida de datos

1. Descomprimí **este ZIP de código** y subí su contenido a la raíz de `agusthebeast/sistema-skorn`, reemplazando archivos anteriores. Conservá los archivos ocultos `.firebaserc` y `.gitignore`.
2. En GitHub Codespaces abrí una terminal y ejecutá:

```bash
git pull origin main
firebase deploy --only hosting,firestore:rules --project ordenes-trabajo-a8499
```

3. Abrí `https://ordenes-trabajo-a8499.web.app` y recargá con `Ctrl + Shift + R`.
4. Abrí una orden existente para comprobar los contactos. Entrá en Configuración, creá una falla de prueba, quitála y restaurala.

**Los documentos de órdenes, clientes, equipos, Caja, inventario y ventas existentes no se borran ni se migran de nuevo.** El despliegue sustituye únicamente el frontend y las reglas. No es necesario repetir la importación de los 909 clientes o las 152 órdenes si ya se completó.

**Permisos:** la versión mantiene el esquema de la V4: toda cuenta autenticada puede modificar el catálogo. Para reservar Configuración exclusivamente a administradores habría que incorporar roles y reglas adicionales.

**Pruebas locales:** 36 tests unitarios aprobados, incluidos 7 tests nuevos de opciones visibles/ocultas, clientes históricos y datos actualizados. También se verificó la presentación de Configuración en desktop y móvil. El proyecto no se publicó ni se probó conectado a tu Firebase desde este entorno.

---

## Guía histórica de migración V4 (solo si todavía no migraste)

## Dos archivos ZIP separados (muy importante)

**1. `SYX_Sistema_V5_Clientes_Configuracion_GitHub.zip`**: código del sistema y reglas de Firestore. **Este es el único ZIP cuyo contenido se debe subir al repositorio GitHub.** No incluye datos personales reales.

**2. `SYX_Datos_Privados_Migracion_Gestioo.zip`**: contiene el JSON con la agenda y las órdenes reales y archivos CSV para verificación. **NO SUBIR ESTE ARCHIVO NI SU CONTENIDO A GITHUB, GITHUB CODESPACES NI A FIREBASE HOSTING.** Guardarlo localmente y cargar el JSON en el navegador desde la pantalla de importación. Los datos solo se escriben en Firestore después de la confirmación.

## Qué se extrae del archivo de Gestioo

- **899 contactos** de la agenda, deduplicados por DNI. El contacto adicional exportado el 28/10/2026 ya estaba dentro de los 899, así que no se duplica.
- **10 clientes provisionales sin DNI**: seis nombres faltantes en la agenda y cuatro nombres ambiguos que coinciden con más de un DNI. Están marcados para revisión, sin asignarles DNI inventados.
- **152 órdenes** del PDF, con número original (con ceros a la izquierda), fecha, estado, área, responsable, marca, modelo, cliente y datos originales del reporte.
- **152 registros de equipos** vinculados a las órdenes, uno por orden porque el PDF no aporta números de serie verificables («Genérico»). Se preserva ese texto como dato original, pero no se asume que sea una serie real.
- **174 entradas únicas de catálogo** (marcas y modelos). Se normaliza solo la presentación de marcas conocidas y se corrigen dos modelos partidos entre líneas por el PDF; se preserva el valor original también.
- **No se inventan** fallas, presupuestos, estados físicos ni accesorios que el informe no incluya. Las columnas TOTAL/ADELANTO están en cero en todas las filas, pero no se interpretan como un presupuesto aprobado de $0.
- **Sin movimientos de Caja ni cobros históricos** como consecuencia de importar.

### Diferencia entre el resumen y las filas reales

El PDF declara **Entrada 42, Reparación 28 y Salida 83 (153 en total)**, pero contiene filas legibles **Entrada 42, Reparación 27 y Salida 83 (152 en total)**. No se inventa la posible orden faltante: habrá que recuperar esa fila de Gestioo con otro listado si existe.

## Cómo actualizar el sitio

1. Descargar y descomprimir el ZIP **de código**.
2. Subir todos sus archivos a la raíz del repositorio `agusthebeast/sistema-skorn`, reemplazando los anteriores. **No subir el ZIP de datos privados.**
3. Abrir Codespaces para `sistema-skorn` y ejecutar:

```bash
git pull origin main
firebase deploy --only hosting,firestore:rules --project ordenes-trabajo-a8499
```

4. Abrir `https://ordenes-trabajo-a8499.web.app/importar.html` y autenticar con el usuario autorizado de Firebase.
5. Descomprimir el ZIP **privado** en tu computadora. En la pantalla, **seleccionar** `SYX_Datos_Migracion_PRIVADOS_2026-10-28.json` desde el navegador.
6. Presionar **Verificar en Firebase**. La revisión comprueba que no existan números de órdenes utilizados en documentos distintos y muestra cuántos registros son nuevos.
7. Escribir **IMPORTAR**, revisar el mensaje de confirmación y ejecutar la importación. **No cerrar la pestaña hasta ver «Importación finalizada»**; ante una interrupción, se puede volver a verificar y reanudar sin sobrescribir los documentos existentes.
8. Regresar al panel Taller: comprobar las órdenes `001069`, `001060` y otras conocidas, sus marcas, modelos, fechas, responsables y estados. Revisar que los clientes estén en Agenda y que los estados «Reparado», «Depósito», «Esperando respuesta», etc. estén en los filtros.
9. Revisar el CSV de clientes a identificar antes de decidir unificar o completar sus datos.

La importación eleva el contador de nuevas órdenes al menos a **1069** para que las próximas sigan desde **1070** o desde el número ya existente si fuese mayor. **No dar de alta nuevas órdenes durante el proceso de importación.**

## Reglas de seguridad

- V4 y V5 actualizan `firestore.rules` para permitir contactos importados **sin DNI real**, con ID interno `sin-dni_*` claramente diferenciado. La versión anterior solo permitía clientes con DNI.
- El importador web requiere Firebase Authentication. No contiene ni distribuye los datos personales: estos se cargan de un archivo local elegido expresamente por el operador.
- La app todavía no tiene permisos por roles: **quien tenga cuenta autenticada de Firebase puede realizar operaciones de importación según las reglas actuales**. Usá solamente cuentas de confianza; un endurecimiento con roles de administrador es recomendable para uso productivo.
- Para evitar pérdidas accidentales, no se borra ni reemplaza un cliente, una orden o un equipo existentes. Las órdenes importadas usan documentos con IDs determinísticos y el importador puede reanudarse. Un conflicto de numeración preexistente **bloquea la importación** en la verificación previa.
- **No fue ejecutada una importación real en Firebase desde este entorno**. La primera carga debe probarse desde la pantalla habilitada después de publicar la V4.

## Verificación técnica

```bash
node --test tests/*.mjs
```

36 pruebas locales de lógica, impresión, cobros, migración y Configuración pasadas. Falta validar la operación conectada a tu cuenta Firebase desde el navegador.


## V6 — Importación de Agenda sin duplicados (30/10/2026)

**Archivo privado:** `SYX_Agenda_30-10-2026_PARA_IMPORTAR_PRIVADO.json` se entrega **por separado**. Contiene datos personales reales de 905 personas. **Nunca se debe cargar a GitHub, Hosting ni una carpeta pública**.

1. Subir únicamente el contenido de **SYX_Sistema_V6_Importacion_Agenda_GitHub.zip** a `agusthebeast/sistema-skorn`.
2. Publicar el nuevo frontend y las reglas: `firebase deploy --only hosting,firestore:rules --project ordenes-trabajo-a8499`.
3. Iniciar sesión y abrir **Clientes → Importar agenda** (o `/importar-agenda.html`).
4. Seleccionar el JSON privado adjunto, o cualquier CSV de Gestioo con las columnas del exportador. El Excel `.xlsx` original se ha convertido a JSON para esta importación, sin alterar los datos de contacto. No seleccionar el XLSX en la página: el navegador requiere el JSON convertido o CSV.
5. Pulsar **Verificar sin modificar nada**. La pantalla compara **todos los DNI normalizados**, no solo los identificadores de documento, con los registros **reales** en Firebase.
6. Los clientes ya existentes **se omiten sin sobrescribirlos**. Si hay fichas sin DNI que coinciden por nombre, el administrador debe compararlas visualmente y confirmar cada vinculación. Las fichas no confirmadas **se mantienen tal cual**, sin crearse un cliente nuevo con ese DNI.
7. Escribir `IMPORTAR` y confirmar. Las transacciones evitan reescribir un documento que ya exista, y los clientes nuevos se crean con documento de ID DNI.

**Validación offline de este lote:** 905 filas, todos los DNI normalizados únicos. Frente al lote de migración anterior con 899 DNI y 10 fichas provisionales: 899 DNI ya existentes y 6 personas que coinciden por nombre con fichas provisionales sin DNI; no se requiere crear registros nuevos si se migró ese lote. **Esta predicción no es una lectura del Firebase en vivo.** Si no se ejecutó la migración anterior, los números reales serán distintos.

**Límites:** las coincidencias por nombre se consideran indicios, **no pruebas de identidad**. No se vinculan sin confirmación. Los registros con DNI inválidos, duplicados dentro del archivo o en conflicto se excluyen y se informan para revisión. Se protege contra cargas repetidas y no se eliminan personas ni se modifican órdenes. No sustituye una copia de seguridad ni una validación con Firebase Emulator Suite antes de uso productivo.
