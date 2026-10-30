import {normalizeDni} from './domain.js';

// No se enlazan personas por nombre: puede haber homónimos.
export function ordersForClient(client, orders=[]) {
  if (!client) return [];
  const id=String(client.id||'');
  const dni=normalizeDni(client.dni||'');
  return orders.filter(order => {
    if (id && String(order.clienteId||'')===id) return true;
    // Respaldo para órdenes antiguas cuyos IDs pudieron ser diferentes.
    return Boolean(dni && normalizeDni(order.dniCliente||'')===dni);
  }).sort((a,b)=>Number(b.numero||0)-Number(a.numero||0));
}

export function isProvisionalClient(client) {
  return Boolean(client && String(client.id||'').startsWith('sin-dni_') && !normalizeDni(client.dni||'') && client.importadoSinDni===true);
}

export function validateClientEdit({nombre,dni,telefono,correo,direccion,observaciones},current){
  const result={
    nombre:String(nombre||'').trim(),
    dni:normalizeDni(dni||''),
    telefono:String(telefono||'').trim(),
    correo:String(correo||'').trim(),
    direccion:String(direccion||'').trim(),
    observaciones:String(observaciones||'').trim()
  };
  if(!result.nombre || result.nombre.length>180)throw Error('Ingresá un nombre de hasta 180 caracteres.');
  if(result.telefono.length>80 || result.correo.length>180 || result.direccion.length>300 || result.observaciones.length>1200)throw Error('Alguno de los campos supera la longitud permitida.');
  if(result.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.correo))throw Error('El correo electrónico no tiene un formato válido.');
  if(!isProvisionalClient(current) && result.dni !== normalizeDni(current?.dni||''))throw Error('El DNI de una ficha registrada no puede cambiarse desde esta pantalla.');
  if(isProvisionalClient(current) && result.dni && (result.dni.length<6 || result.dni.length>11))throw Error('Ingresá un DNI válido de 6 a 11 números.');
  return result;
}
