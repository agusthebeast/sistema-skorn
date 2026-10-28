# SYX | Órdenes de Trabajo — V4 (migración Gestioo)

**Firebase exclusivo:** `ordenes-trabajo-a8499`  
**Repositorio:** `agusthebeast/sistema-skorn`  
**Sitio:** `https://ordenes-trabajo-a8499.web.app`

Esta actualización conserva Caja, historial de cierres, estadísticas, inventario, ventas, órdenes de taller, etiquetas con código de barras y constancias de retiro de V3. Agrega una **pantalla de importación privada** y permite ver y editar los estados originales de Gestioo, sin cambiarlos accidentalmente a «Sin estado».

## Dos archivos ZIP separados (muy importante)

**1. `SYX_Sistema_V4_Migracion_GitHub.zip`**: código del sistema y reglas de Firestore. **Este es el único ZIP cuyo contenido se debe subir al repositorio GitHub.** No incluye datos personales reales.

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

- V4 actualiza `firestore.rules` para permitir contactos importados **sin DNI real**, con ID interno `sin-dni_*` claramente diferenciado. La versión anterior solo permitía clientes con DNI.
- El importador web requiere Firebase Authentication. No contiene ni distribuye los datos personales: estos se cargan de un archivo local elegido expresamente por el operador.
- La app todavía no tiene permisos por roles: **quien tenga cuenta autenticada de Firebase puede realizar operaciones de importación según las reglas actuales**. Usá solamente cuentas de confianza; un endurecimiento con roles de administrador es recomendable para uso productivo.
- Para evitar pérdidas accidentales, no se borra ni reemplaza un cliente, una orden o un equipo existentes. Las órdenes importadas usan documentos con IDs determinísticos y el importador puede reanudarse. Un conflicto de numeración preexistente **bloquea la importación** en la verificación previa.
- **No fue ejecutada una importación real en Firebase desde este entorno**. La primera carga debe probarse desde la pantalla habilitada después de publicar la V4.

## Verificación técnica

```bash
node --test tests/*.mjs
```

29 pruebas locales de lógica, impresión, cobros y preparación de migración pasadas. Falta validar la operación conectada a tu cuenta Firebase desde el navegador.
