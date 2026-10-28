// Cálculos compartidos sin dependencia de Firebase; dinero expresado a centavos.
export const PAY_METHODS = ['Efectivo','Transferencia','QR','Posnet'];
export const cents = amount => Math.round(Number(amount || 0) * 100);
export const fromCents = amount => amount / 100;
export function normalizeSku(value){return String(value ?? '').trim().toUpperCase().replace(/\s+/g,'-')}
export function validSku(sku){return /^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(sku)}
export function normalizePayments(pagos={}){
  const out={};for(const m of PAY_METHODS){const n=Number(pagos[m]??0);if(!Number.isFinite(n)||n<0||Math.abs(cents(n)/100-n)>0.000001)throw Error('Importes de pago inválidos.');out[m]=fromCents(cents(n));}
  return out;
}
export function paymentSum(pagos={}){return fromCents(PAY_METHODS.reduce((n,m)=>n+cents(pagos[m]),0))}
export function ensurePaymentTotal(pagos, total, priceMode='lista'){
  const p=normalizePayments(pagos),t=Number(total);
  if(!Number.isFinite(t)||t<=0)throw Error('La venta debe tener un importe positivo.');
  if(cents(paymentSum(p))!==cents(t))throw Error('La suma de efectivo, transferencia, QR y Posnet no coincide con el importe a cobrar.');
  if(priceMode==='efectivo' && (p.Transferencia||p.QR||p.Posnet))throw Error('El precio efectivo solo puede utilizarse si todo el pago es en efectivo.');
  return p;
}
export function saleTotal(cart,products,priceMode='lista'){
 let total=0;for(const row of cart){const p=products.find(x=>x.id===row.id);if(!p||p.activo===false)throw Error('Producto no disponible: '+row.id);const count=Number(row.cantidad);if(!Number.isSafeInteger(count)||count<=0)throw Error('Cantidad inválida.');if(count>Number(p.stock))throw Error('Stock insuficiente de '+p.nombre);const price=Number(priceMode==='efectivo'?p.precioEfectivo:p.precioLista);if(!Number.isFinite(price)||price<0)throw Error('Precio inválido en '+p.nombre);total+=cents(price)*count;}return fromCents(total);
}
export function emptySummary(){return {ingresos:0,egresos:0,efectivoIngresos:0,efectivoEgresos:0,digitalIngresos:0,digitalEgresos:0,transferenciaIngresos:0,transferenciaEgresos:0,qrIngresos:0,qrEgresos:0,posnetIngresos:0,posnetEgresos:0,movimientos:0}}
export function movementBreakdown(m){
 const p=m.pagos||{}, sum=PAY_METHODS.reduce((a,k)=>a+cents(p[k]),0), amount=cents(m.monto), result={Efectivo:0,Transferencia:0,QR:0,Posnet:0,Otros:0};
 if(sum===amount){for(const k of PAY_METHODS)result[k]=fromCents(cents(p[k]));}
 else if(PAY_METHODS.includes(m.metodo)){result[m.metodo]=fromCents(amount)}
 else result.Otros=fromCents(amount);
 return result;
}
export function summarizeMovements(moves){
 const sums=emptySummary();sums.otrosIngresos=0;sums.otrosEgresos=0;
 for(const m of moves){if(!['ingreso','egreso'].includes(m.tipo))continue;const kind=m.tipo==='ingreso'?'Ingresos':'Egresos';const total=fromCents(cents(m.monto));if(total<0)continue;
 sums[m.tipo==='ingreso'?'ingresos':'egresos']+=total;
 const p=movementBreakdown(m);sums['efectivo'+kind]+=p.Efectivo;sums['transferencia'+kind]+=p.Transferencia;sums['qr'+kind]+=p.QR;sums['posnet'+kind]+=p.Posnet;sums['digital'+kind]+=p.Transferencia+p.QR+p.Posnet;sums['otros'+kind]+=p.Otros;sums.movimientos++;
 }for(const k of Object.keys(sums))if(k!=='movimientos')sums[k]=fromCents(cents(sums[k]));return sums;
}
export function paymentStats(s){return [
 {key:'efectivo',title:'Efectivo',ingresos:s.efectivoIngresos||0,egresos:s.efectivoEgresos||0},
 {key:'digital',title:'Digital · QR + Transferencia + Posnet',ingresos:s.digitalIngresos||0,egresos:s.digitalEgresos||0},
 {key:'general',title:'Total general',ingresos:s.ingresos||0,egresos:s.egresos||0}
 ].map(x=>({...x,neto:fromCents(cents(x.ingresos)-cents(x.egresos))}))}
