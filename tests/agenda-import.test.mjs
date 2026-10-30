import assert from 'node:assert/strict';
import {normDni,normName,normalizeClient,planClientImport,parseCSV} from '../public/js/agenda-import-utils.js';
assert.equal(normDni('30.123.456-7'), '301234567');
assert.equal(normName('GÓMEZ   JOSE'), 'gomez jose');
assert.equal(normalizeClient({DNI:'12-345-678',Apellido:'Diaz',Nombre:'Ana', 'Teléfono':'11'}).nombre, 'Diaz Ana');
const old=[
 {id:'12345678',dni:'12345678',nombre:'GÓMEZ CARLOS',telefono:'111'},
 {id:'sin-dni_gestioo_44',dni:'',nombre:'Pérez Juan',telefono:'',importadoSinDni:true},
 {id:'99999999',dni:'99999999',nombre:'Persona Distinta'}
];
const incoming=[
 {DNI:'12.345.678',Apellido:'Gomez',Nombre:'Carlos'},
 {dni:'45-678-901',apellido:'Pérez',nombres:'Juan'},
 {DNI:'33.333.333',Apellido:'Suarez',Nombre:'Maria'},
 {DNI:'33333333',Apellido:'Suarez',Nombre:'Maria'},
 {DNI:'4',Apellido:'NoValido',Nombre:'Ana'}
];
const p=planClientImport(incoming,old);
assert.deepEqual([p.existing.length,p.provisional.length,p.newClients.length,p.invalid.length],[1,1,1,2]);
assert.equal(p.provisional[0].existingId,'sin-dni_gestioo_44');
const again=planClientImport(incoming,[...old,{id:'33333333',dni:'33333333',nombre:'Suarez Maria'}]);
assert.equal(again.newClients.length,0);
assert.equal(again.existing.length,2);
const csv='Tipo;DNI;Apellido;Nombre;Teléfono;Correo;Dirección\r\nPERSONA;12345678;PEREZ;MARIA;11;;"San Martín 13; 2"\r\n';
assert.equal(parseCSV(csv)[0]['Dirección'],'San Martín 13; 2');
console.log('OK: importación de agenda sin duplicados, DNI normalizados, fichas provisionales y CSV');
