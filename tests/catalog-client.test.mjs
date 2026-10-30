import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogKey,catalogOptions,activeCatalogNames,DEFAULT_CATALOG} from '../public/js/catalog-utils.js';
import {clientForOrder} from '../public/js/client-utils.js';

test('Las opciones iniciales se pueden desactivar mediante documento Firestore, sin perder las demás',()=>{
 const id=catalogKey('accesorio','Cable HDMI');
 const opts=catalogOptions('accesorio',[{id,tipo:'accesorio',nombre:'Cable HDMI',activo:false}]);
 assert.equal(opts.find(x=>x.nombre==='Cable HDMI').activo,false);
 assert.ok(!activeCatalogNames('accesorio',[{id,tipo:'accesorio',nombre:'Cable HDMI',activo:false}]).includes('Cable HDMI'));
 assert.ok(activeCatalogNames('accesorio',[{id,tipo:'accesorio',nombre:'Cable HDMI',activo:false}]).includes('Control remoto'));
});
test('Las opciones desactivadas pueden restaurarse y las personalizadas se enumeran',()=>{
 const id=catalogKey('falla','Tira LED quemada');
 const opts=catalogOptions('falla',[{id,tipo:'falla',nombre:'Tira LED quemada',activo:true}]);
 assert.ok(opts.find(x=>x.nombre==='Tira LED quemada').activo);
 assert.ok(opts.some(x=>x.nombre==='No enciende'));
 assert.equal(activeCatalogNames('falla',[{id,tipo:'falla',nombre:'Tira LED quemada',activo:false}]).includes('Tira LED quemada'),false);
 assert.equal(activeCatalogNames('falla',[{id,tipo:'falla',nombre:'Tira LED quemada',activo:true}]).includes('Tira LED quemada'),true);
});
test('El catálogo distingue fallas de accesorios y deduplica nombres',()=>{
 const items=[{id:'falla_a',tipo:'falla',nombre:'No enciende',activo:false},{id:'accesorio_b',tipo:'accesorio',nombre:' Cable HDMI ',activo:true}];
 assert.equal(catalogOptions('falla',items).length,DEFAULT_CATALOG.falla.length);
 assert.equal(catalogOptions('accesorio',items).length,DEFAULT_CATALOG.accesorio.length);
 assert.ok(!activeCatalogNames('falla',items).includes('No enciende'));
});
test('Marcas y modelos importados siguen apareciendo, sin verse afectados por opciones de taller',()=>{
 assert.deepEqual(activeCatalogNames('marca',[{tipo:'modelo',nombre:'x',activo:false}],['Samsung','Samsung']),['Samsung']);
 assert.ok(activeCatalogNames('modelo',[{id:'modelo_j',tipo:'modelo',nombre:'UN32J',activo:true}],['LG-200']).includes('LG-200'));
});
test('La ficha de orden muestra datos actualizados de Agenda',()=>{
 const order={clienteId:'40200111',nombreCliente:'Nombre anterior',dniCliente:'40200111',telefonoCliente:'111111',direccionCliente:'Domicilio anterior'};
 const clients=[{id:'40200111',nombre:'Nombre actual',dni:'40200111',telefono:'222222',correo:'persona@correo.com',direccion:'Dirección nueva',observaciones:'Dejar por la tarde'}];
 assert.deepEqual(clientForOrder(order,clients),{encontrado:true,nombre:'Nombre actual',dni:'40200111',telefono:'222222',correo:'persona@correo.com',direccion:'Dirección nueva',observaciones:'Dejar por la tarde',requiereRevision:false,id:'40200111'});
});
test('Si falta la ficha de Agenda, usa los datos disponibles en la orden sin inventar otros',()=>{
 const order={clienteId:'sin-dni_20',nombreCliente:'Persona migrada',telefonoCliente:'113333',requiereRevisionCliente:true};
 const client=clientForOrder(order,[]);
 assert.equal(client.encontrado,false);
 assert.equal(client.nombre,'Persona migrada');
 assert.equal(client.telefono,'113333');
 assert.equal(client.dni,'');
 assert.equal(client.requiereRevision,true);
});
test('El cliente con DNI provisional no muestra identidad inventada',()=>{
 const order={clienteId:'sin-dni_21',nombreCliente:'Antiguo'};
 const [client]=[{id:'sin-dni_21',nombre:'Sin datos DNI',dni:'',telefono:'',importadoSinDni:true}];
 assert.equal(clientForOrder(order,[client]).dni,'');
 assert.equal(clientForOrder(order,[client]).requiereRevision,true);
});
