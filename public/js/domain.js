// Módulo independiente de Firebase, para pruebas automatizadas.
export const METHODS=['Efectivo','Transferencia','QR','Posnet'];
export const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n)||0);
export const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const normalizeDni=v=>String(v??'').replace(/\D/g,'');
export const normalizeSerie=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function sumPayments(payments){return METHODS.reduce((n,m)=>n+Math.round((Number(payments?.[m])||0)*100),0)/100}
export function validateDelivery(order,payments,{openCash}={}){
 if(!order)throw Error('Orden inexistente');
 if(order.estado==='Entregado'||order.entregadoAt||order.deliveryId)throw Error('Esta orden ya fue entregada.');
 if(order.cobroRegistrado||order.cobrosPrevios||order.movimientoCajaId)throw Error('Esta orden tiene registros de cobro anteriores: requiere revisión administrativa.');
 if(order.presupuesto===null||order.presupuesto===undefined||String(order.presupuesto).trim()==='')throw Error('Completá el presupuesto, incluso si es $0.');
 const n=Number(order.presupuesto);
 if(!Number.isFinite(n)||n<0)throw Error('Presupuesto inválido.');
 if(n>0&&!openCash)throw Error('Abrí una caja antes de cobrar y entregar.');
 for(const m of METHODS)if(!Number.isFinite(Number(payments?.[m]??0))||Number(payments?.[m]??0)<0)throw Error('Los pagos deben ser importes válidos y no negativos.');
 if(Math.round(sumPayments(payments)*100)!==Math.round(n*100))throw Error('La suma de los medios de pago debe coincidir con el presupuesto.');
 return n;
}
