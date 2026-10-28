import test from 'node:test';import assert from 'node:assert/strict';
import {validateMigration,collisionCheck,originalDateToDate,MIGRATION_PROJECT} from '../public/js/migration-validation.js';
const order={id:'gestioo_001069',numero:'001069',fechaIngresoOriginal:'28/10/2026',clienteId:'sin-dni_gestioo_test',equipoId:'gestioo_equipo_001069',marca:'LG',modelo:'55UJ6320',estado:'Sin estado',area:'Entrada',presupuesto:null};
const data=()=>({formato:'syx-migracion-gestioo',version:1,firebaseProject:MIGRATION_PROJECT,maxOrden:1069,
 clientes:[{id:'sin-dni_gestioo_test',nombre:'Prueba',dni:'',importadoSinDni:true}],equipos:[{id:'gestioo_equipo_001069',clienteId:'sin-dni_gestioo_test'}],ordenes:[{...order}],catalogos:[{id:'marca_lg',tipo:'marca',nombre:'LG'}]});
test('valida relaciones cliente-equipo y modelo de orden importada',()=>assert.deepEqual(validateMigration(data()),{clientes:1,equipos:1,ordenes:1,catalogos:1,provisorios:1}));
test('no admite falsos DNI sin registro provisional',()=>{const x=data();x.clientes[0].id='123';assert.throws(()=>validateMigration(x))});
test('no admite números de órdenes repetidos',()=>{const x=data();x.ordenes.push({...x.ordenes[0],id:'gestioo_001070',numero:'001069'});assert.throws(()=>validateMigration(x))});
test('presupuesto nunca se inventa del informe histórico',()=>{const x=data();x.ordenes[0].presupuesto=0;assert.throws(()=>validateMigration(x),/presupuestos/)});
test('identifica colisión con una orden de V3 antes de importar',()=>assert.deepEqual(collisionCheck(data(),[{id:'manual_123',numero:'001069'}]),[{numero:'001069',existente:'manual_123'}]));
test('migrar de nuevo conserva ID y número previos',()=>assert.deepEqual(collisionCheck(data(),[{id:'gestioo_001069',numero:'001069'}]),[]));
test('restaura las fechas originales en horario de Buenos Aires',()=>assert.equal(originalDateToDate('28/10/2026').toISOString(),'2026-10-28T15:00:00.000Z'));
