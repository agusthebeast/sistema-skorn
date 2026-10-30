// Lectura de la ficha viva del cliente, con respaldo del dato histórico de la orden.
export function clientForOrder(order,clients=[]){
  const c=clients.find(x=>x.id===order.clienteId)
    || (order.dniCliente?clients.find(x=>x.dni===order.dniCliente):null);
  return {
    encontrado:Boolean(c),
    nombre:String(c?.nombre||order.nombreCliente||''),
    dni:String(c?.dni||order.dniCliente||''),
    telefono:String(c?.telefono||c?.celular||order.telefonoCliente||''),
    correo:String(c?.correo||c?.email||order.correoCliente||''),
    direccion:String(c?.direccion||c?.domicilio||order.direccionCliente||''),
    observaciones:String(c?.observaciones||''),
    requiereRevision:Boolean(c?.importadoSinDni||order.requiereRevisionCliente),
    id:String(c?.id||order.clienteId||'')
  };
}
