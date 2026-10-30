import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ordersForClient,isProvisionalClient,validateClientEdit} from '../public/js/client-history-utils.js';

const client={id:'12345678',dni:'12.345.678',nombre:'Persona Demo'};
const orders=[
 {id:'o1',clienteId:'12345678',numero:'000042',estado:'Entregado'},
 {id:'o2',clienteId:'viejo-id',dniCliente:'12345678',numero:'000120',estado:'Reparado'},
 {id:'o3',clienteId:'otro',nombreCliente:'Persona Demo',numero:'000077'},
 {id:'o4',clienteId:'otro',dniCliente:'98765432',numero:'000060'},
 {id:'o5',clienteId:'12345678',numero:'000106',estado:'En reparación'}
];
test('historial usa vínculo estable o DNI, sin unir homónimos',()=>{
 assert.deepEqual(ordersForClient(client,orders).map(o=>o.id),['o2','o5','o1']);
});
test('historial funciona en fichas sin DNI por identificador',()=>{
 const c={id:'sin-dni_cliente_1',dni:'',nombre:'Sin documento'};
 assert.deepEqual(ordersForClient(c,[{id:'a',clienteId:c.id,numero:'008'},{id:'b',nombreCliente:'Sin documento'}]).map(o=>o.id),['a']);
});
test('no permitir cambiar DNI de ficha normal',()=>{
 assert.throws(()=>validateClientEdit({nombre:'Nuevo',dni:'87654321'},client),/DNI/);
});
test('editar contacto sin alterar DNI existente',()=>{
 const data=validateClientEdit({nombre:' Nombre nuevo ',dni:'12-345-678',telefono:'111',correo:'correo@example.com',direccion:'Calle 7',observaciones:'Cliente nuevo'},client);
 assert.equal(data.dni,'12345678');assert.equal(data.nombre,'Nombre nuevo');assert.equal(data.telefono,'111');
});
test('provisional permite completar DNI válido',()=>{
 const c={id:'sin-dni_abc',dni:'',nombre:'Demo',importadoSinDni:true};
 assert.equal(isProvisionalClient(c),true);
 assert.equal(validateClientEdit({nombre:'Demo',dni:'20.345.987'},c).dni,'20345987');
 assert.throws(()=>validateClientEdit({nombre:'Demo',dni:'1'},c),/DNI/);
});
test('campos inválidos son rechazados',()=>{
 assert.throws(()=>validateClientEdit({nombre:' ',dni:'12345678'},client),/nombre/);
 assert.throws(()=>validateClientEdit({nombre:'Demo',dni:'12345678',correo:'correo-invalido'},client),/correo/);
 assert.throws(()=>validateClientEdit({nombre:'Demo',dni:'12345678',direccion:'A'.repeat(301)},client),/longitud/);
});
test('Material Symbols y acciones de clientes están conectados a la interfaz',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
 for(const icon of ['point_of_sale','bar_chart','inventory','person_search','settings','format_list_bulleted','history','visibility'])assert.ok(html.includes(icon),icon);
 assert.ok(html.includes('<th>ACCIONES</th>'));
 assert.ok(app.includes('data-view-client'));
 assert.ok(app.includes('data-client-order'));
 assert.ok(app.includes("$('client-edit-form').onsubmit"));
});
