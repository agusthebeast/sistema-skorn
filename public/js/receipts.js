/** SYX V8 - tickets internos de 80 mm. No facturación fiscal. */
import {safe,money} from './domain.js';
import {barcodeSvg} from './print.js';
export const DEFAULT_PRINT_SETTINGS=Object.freeze({anchoMm:80,mostrarSku:true,mostrarEmpleado:true,mostrarCodigoBarras:true,autoImprimir:false,direccion:'Av. Presidente Perón 4650, Alejandro Korn',whatsapp:'11 3843-7425',mensajeFinal:'¡Gracias por elegir SYX!'});
export function normalizePrintSettings(s={}){
 return {...DEFAULT_PRINT_SETTINGS,...Object.fromEntries(Object.keys(DEFAULT_PRINT_SETTINGS).filter(k=>Object.hasOwn(s,k)).map(k=>[k,s[k]])),anchoMm:80};
}
export function receiptNumber(kind,record={}){
 const number=String(record.numeroComprobante||'').trim();
 if(/^\d{1,12}$/.test(number))return number;
 return String(record.id||record.ventaId||'SIN-REFERENCIA');
}
export function receiptBarcode(kind,record={}){
 const number=String(record.numeroComprobante||'').trim();if(/^\d{1,12}$/.test(number))return number;
 // Referencia determinista para documentos históricos sin correlativo (no modifica registros).
 let hash=2166136261;for(const c of String(kind)+':'+String(record.id||record.ventaId||'')){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0}
 return '9'+String(hash%1000000000).padStart(9,'0');
}
const when=v=>{
 if(!v)return 'Fecha sin registrar';const d=v?.toDate?.()|| (typeof v?.seconds==='number'?new Date(v.seconds*1000):new Date(v));
 return d instanceof Date&&!isNaN(d)?d.toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Argentina/Buenos_Aires'}):'Fecha sin registrar';
};
const row=(title,value,{strong=false}={})=>`<div class="receipt-line${strong?' receipt-strong':''}"><span>${safe(title)}</span><b>${safe(value)}</b></div>`;
const detail=(title,value)=>`<div class="receipt-field"><span>${safe(title)}:</span> ${safe(value||'—')}</div>`;
const payRows=payments=>Object.entries(payments||{}).filter(([,n])=>Number(n)>0).map(([name,n])=>row(name,money(n))).join('')||row('Medios de pago','Sin detalle');
export function receiptBody(kind,record={},settings={}){
 const cfg=normalizePrintSettings(settings),types={venta:'COMPROBANTE DE VENTA',ingreso:'COMPROBANTE DE INGRESO',egreso:'COMPROBANTE DE EGRESO',cierre:'CIERRE DE CAJA'},type=types[kind];
 if(!type)throw Error('Tipo de comprobante no reconocido.');
 const numero=receiptNumber(kind,record),date=kind==='cierre'?when(record.cerradaAt):when(record.createdAt),barcode=cfg.mostrarCodigoBarras?`<div class="receipt-barcode">${barcodeSvg(receiptBarcode(kind,record),{height:36})}</div>`:'';
 let lines='';
 if(kind==='venta'){
   const items=Array.isArray(record.items)?record.items:[];
   lines+=`<div class="receipt-section">${items.map(item=>`<div class="receipt-item"><strong>${safe(item.nombre||item.sku||'Producto')}</strong>${cfg.mostrarSku?`<small>SKU: ${safe(item.sku||'—')}</small>`:''}<div class="receipt-line"><span>${Number(item.cantidad)||0} × ${money(item.precioUnitario||0)}</span><b>${money(item.subtotal??Number(item.cantidad)*Number(item.precioUnitario||0))}</b></div></div>`).join('')}</div>`;
   lines+=row('TOTAL COBRADO',money(record.total||0),{strong:true})+`<div class="receipt-section">${payRows(record.pagos)}</div>`;
   if(record.modoPrecio)lines+=detail('Tarifa',record.modoPrecio==='efectivo'?'Efectivo':'Lista');
 }else if(kind==='ingreso'||kind==='egreso'){
   lines+=`<div class="receipt-section">${detail('Concepto',record.concepto||'Movimiento manual')}${detail('Tipo',kind==='ingreso'?'Ingreso':'Egreso')}</div>`;
   lines+=row(kind==='ingreso'?'TOTAL INGRESADO':'TOTAL EGRESADO',money(record.monto||0),{strong:true});
   lines+=`<div class="receipt-section">${payRows(record.pagos|| (record.metodo?{[record.metodo]:record.monto}:{}))}</div>`;
 }else{
   const s=record.resumenCierre||record.resumen||{};const ing=Number(s.ingresos||0),eg=Number(s.egresos||0),initial=Number(record.saldoInicialEfectivo||0);
   const effIn=Number(s.efectivoIngresos||0),effOut=Number(s.efectivoEgresos||0);
   const expected=Number(record.saldoEfectivoEsperado??initial+effIn-effOut);
   const counted=record.saldoEfectivoContado;
   lines+=`<div class="receipt-section">${detail('Apertura',when(record.abiertaAt))}${detail('Cierre',when(record.cerradaAt))}${detail('Abrió',record.abiertaPor)}${detail('Cerró',record.cerradaPor)}</div>`;
   lines+=`<div class="receipt-section">${row('Fondo inicial',money(initial))}${row('Ingresos',money(ing))}${row('Egresos',money(eg))}${row('Neto de movimientos',money(ing-eg),{strong:true})}</div>`;
   lines+=`<div class="receipt-section"><div class="receipt-subtitle">EFECTIVO</div>${row('Ingresos',money(effIn))}${row('Egresos',money(effOut))}${row('Efectivo esperado',money(expected))}${row('Efectivo contado',counted==null?'No informado':money(counted))}${row('Diferencia',counted==null?'No informada':money(Number(record.diferenciaEfectivo??(Number(counted)-expected))))}</div>`;
   lines+=`<div class="receipt-section"><div class="receipt-subtitle">DIGITAL</div>${row('Transferencia · ingreso',money(s.transferenciaIngresos||0))}${row('Transferencia · egreso',money(s.transferenciaEgresos||0))}${row('QR · ingreso',money(s.qrIngresos||0))}${row('QR · egreso',money(s.qrEgresos||0))}${row('Posnet · ingreso',money(s.posnetIngresos||0))}${row('Posnet · egreso',money(s.posnetEgresos||0))}${row('Total digital neto',money(Number(s.digitalIngresos||0)-Number(s.digitalEgresos||0)),{strong:true})}</div>`;
   if(record.observacionesCierre)lines+=detail('Observaciones',record.observacionesCierre);
 }
 const rep=record.usuario||record.cerradaPor;
 return `<div class="syx-receipt"><div class="receipt-top"><div class="receipt-logo">SYX</div><div class="receipt-tagline">Donde la tecnología vuelve a nacer</div><div>${safe(cfg.direccion)}</div><div>WhatsApp: ${safe(cfg.whatsapp)}</div></div><div class="receipt-separator"></div><div class="receipt-title">${type}</div><div class="receipt-meta">N.º ${safe(numero)}<div>${safe(date)}</div>${record.id?`<div class="receipt-ref">Ref.: ${safe(record.id)}</div>`:''}</div><div class="receipt-separator"></div>${lines}${cfg.mostrarEmpleado&&rep?detail('Responsable',rep):''}<div class="receipt-separator"></div>${barcode}<div class="receipt-bottom"><strong>${safe(cfg.mensajeFinal)}</strong><div>Comprobante interno · No válido como factura</div></div></div>`;
}
export const receiptCss=`*{box-sizing:border-box}html,body{padding:0;margin:0}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11px}.syx-receipt{width:72mm;max-width:72mm;margin:0 auto;padding:3mm 0 6mm;font-size:11px;line-height:1.35;overflow-wrap:anywhere;color:#111;background:#fff}.receipt-top,.receipt-title,.receipt-meta,.receipt-bottom{text-align:center}.receipt-logo{font:bold 30px Georgia,serif;letter-spacing:1px}.receipt-tagline{font-size:10px;margin-bottom:5px}.receipt-title{font-weight:800;font-size:13px;margin:7px 0}.receipt-meta{font-size:10px}.receipt-ref{font-size:8px;color:#555}.receipt-separator{margin:9px 0;border-bottom:1px dashed #555}.receipt-section{border-bottom:1px dashed #aaa;padding:6px 0}.receipt-line{display:flex;justify-content:space-between;align-items:baseline;gap:7px;padding:2px 0}.receipt-line span{min-width:0;flex:1}.receipt-line b{flex-shrink:0;text-align:right}.receipt-strong{font-size:14px;font-weight:800;margin:6px 0}.receipt-field{padding:3px 0}.receipt-field span{font-weight:bold}.receipt-item{margin:6px 0}.receipt-item strong{display:block}.receipt-item small{display:block;font-size:9px;color:#444}.receipt-subtitle{text-align:center;font-weight:bold;font-size:11px}.receipt-barcode{margin:10px auto;text-align:center;max-width:68mm}.receipt-barcode svg{display:block;height:43px;width:100%;max-width:68mm;margin:0 auto}.receipt-bottom{font-size:9px;margin-top:10px}.receipt-bottom strong{display:block;font-size:10px;margin-bottom:5px}@media screen{body{background:#eaeaea;padding:16px 0}.syx-receipt{padding:5mm 3mm;background:white;box-shadow:0 2px 14px #0002;width:78mm;max-width:78mm}}@media print{@page{margin:0}body{width:80mm;min-width:80mm;background:white;margin:0;padding:0}.syx-receipt{box-shadow:none;width:72mm;max-width:72mm;margin:0 4mm;padding:2mm 0 5mm}.receipt-item,.receipt-line{break-inside:avoid}html{width:80mm}}`;
export function receiptDocument(kind,record,settings,{printOnLoad=false}={}){
 const type={venta:'Venta',ingreso:'Ingreso',egreso:'Egreso',cierre:'Cierre de Caja'}[kind]||'Comprobante';
 const boot=printOnLoad?`<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180));<\/script>`:'';
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYX · ${type} ${safe(receiptNumber(kind,record))}</title><style>${receiptCss}</style></head><body>${receiptBody(kind,record,settings)}${boot}</body></html>`;
}
export function openReceipt(kind,record,settings,{printOnLoad=true}={}){
 const w=window.open('','_blank');if(!w)throw Error('El navegador bloqueó la ventana de impresión. Permití ventanas emergentes para SYX.');
 w.document.open();w.document.write(receiptDocument(kind,record,settings,{printOnLoad}));w.document.close();return w;
}
