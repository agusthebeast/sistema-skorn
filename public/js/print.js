// Code 39 numérico; autocontenido, apto para imprimir y leer con escáner.
// La clave escaneada son los seis dígitos de la orden (p. ej. 000123).
import {safe,money} from './domain.js';
const PATTERNS={
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn',
  '4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw',
  '8':'wnnwnnwnn','9':'nnwwnnwnn','*':'nwnnwnwnn'
};
export function barcodeSvg(value,{height=43,label=true}={}){
  const code=String(value).trim();
  if(!/^\d{1,12}$/.test(code))throw Error('El código de barras debe ser numérico.');
  const data='*'+code+'*';let x=12;const items=[];
  for(const ch of data){
    const pattern=PATTERNS[ch];
    for(let i=0;i<pattern.length;i++){
      const width=pattern[i]==='w'?4:2;
      if(i%2===0)items.push(`<rect x="${x}" y="0" width="${width}" height="${height}"/>`);
      x+=width;
    }
    x+=2; // separación entre símbolos
  }
  const w=x+12,h=height+(label?17:0);
  return `<svg class="barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Código de barras ${safe(code)}"><g fill="#000">${items.join('')}</g>${label?`<text x="${w/2}" y="${height+13}" fill="#111" font-size="12" text-anchor="middle" font-family="Arial" letter-spacing="1.3">${safe(code)}</text>`:''}</svg>`;
}
const prettyDate=(v)=>v?.toDate?.()?.toLocaleString('es-AR')||new Date().toLocaleString('es-AR');
const val=(v)=>safe(v===null||v===undefined||v===''?'—':v);
const accessorText=o=>Array.isArray(o.accesoriosLista)?o.accesoriosLista.join(', ')||'Sin accesorios':o.accesorios||'Sin accesorios';
const row=(k,v)=>`<div class="info-row"><strong>${safe(k)}</strong><span>${val(v)}</span></div>`;
function summary(o){return `<div class="columns"><div>${row('Cliente',o.nombreCliente)}${row('DNI',o.dniCliente)}${row('Teléfono',o.telefonoCliente)}${row('Dirección',o.direccionCliente)}</div><div>${row('Equipo',`${o.marca||''} ${o.modelo||''}`)}${row('N.º de serie',o.serie)}${row('Ingreso',prettyDate(o.createdAt))}${row('Orden',o.numero)}</div></div><div class="line"><strong>Falla declarada</strong><span>${val(o.falla||o.trabajo)}</span></div><div class="line"><strong>Detalle de la falla</strong><span>${val(o.trabajo)}</span></div><div class="line"><strong>Estado físico del equipo al ingresar</strong><span>${val(o.estadoEquipo)}</span></div><div class="line"><strong>Accesorios recibidos</strong><span>${val(accessorText(o))}</span></div>`}
function logo(title,num){return `<header class="print-head"><div class="print-brand"><span class="s-mark">SYX</span><span>Donde la tecnología vuelve a nacer</span></div><div class="print-head-right"><strong>${safe(title)}</strong><div class="print-number">Orden N.º ${val(num)}</div><small>Emitido: ${new Date().toLocaleString('es-AR')}</small></div></header>`}
function sticker(o){return `<div class="sticker"><b>SYX · ORDEN ${val(o.numero)}</b>${barcodeSvg(o.numero)}<small>${val(`${o.marca||''} ${o.modelo||''}`)}</small></div>`}
const terms='Conservar este comprobante. Para retirar el equipo se solicitará el número de orden y verificación de identidad. La entrega se registra por el personal de mostrador.';
export function intakeHtml(o){
 return `<main class="intake-sheet"><section class="customer">${logo('COMPROBANTE PARA EL CLIENTE',o.numero)}<p class="subtitle">Ingreso al servicio técnico · Presentar este talón al retirar</p>${summary(o)}<div class="customer-barcode">${barcodeSvg(o.numero)}</div><p class="small">${safe(terms)}</p></section><div class="cutline">✂ RECORTAR POR LA LÍNEA</div><section class="workshop">${logo('COPIA PARA EL TALLER',o.numero)}${summary(o)}<div class="sticker-title">ETIQUETAS ADHESIVAS · RECORTAR Y PEGAR UNA AL EQUIPO</div><div class="sticker-row">${sticker(o)}${sticker(o)}</div><div class="signatures"><div>Firma de quien recibe</div><div>Firma del cliente</div></div><p class="small">${safe(terms)}</p></section></main>`;
}
export function deliveryHtml(o){
 return `<section class="delivery">${logo('CONSTANCIA DE RETIRO DEL EQUIPO',o.numero)}<p>Mediante esta constancia se registra la entrega del equipo correspondiente a la orden indicada. Se deja espacio para que la persona que retira confirme haber recibido el equipo y sus accesorios.</p>${summary(o)}<div class="line"><strong>Diagnóstico / trabajo realizado</strong><span>${val(o.diagnostico)}</span></div><div class="line"><strong>Observaciones</strong><span>${val(o.notas)}</span></div><div class="line"><strong>Importe abonado</strong><span>${money(o.presupuesto)}</span></div><div class="line"><strong>Medios de pago</strong><span>${val(Object.entries(o.pagosEntrega||{}).filter(([,n])=>Number(n)>0).map(([m,n])=>m+' '+money(n)).join(' / ')||'Sin cargo')}</span></div><div class="line"><strong>Entregado por</strong><span>${val(o.responsableEntrega)}</span></div><div class="line"><strong>Persona que retira</strong><span>${val(o.entregadoA)}</span></div><div class="line"><strong>DNI del retirante</strong><span>${val(o.dniRetiro)}</span></div><div class="line"><strong>Fecha de entrega</strong><span>${prettyDate(o.entregadoAt)}</span></div><div class="retire-fields"><div>Recibe (nombre y apellido): _________________________________________________</div><div>DNI: ___________________________</div><div>Observaciones al retirar: ____________________________________________________</div></div><div class="signatures delivery-sign"><div>Firma del cliente / autorizado</div><div>Firma del empleado responsable</div></div><div class="delivery-bottom">${barcodeSvg(o.numero)}<span>SYX · Orden ${val(o.numero)}</span></div><p class="small">En caso de retiro por un tercero, solicitar identificación y autorización correspondiente.</p></section>`;
}
export function printDocument(o,kind='ingreso'){
 if(!o?.numero)throw Error('Esta orden todavía no tiene numeración.');
 const title=`SYX - ${kind==='retiro'?'Retiro':'Ingreso'} - Orden ${o.numero}`;
 return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${safe(title)}</title><style>
 @page{size:A4;margin:11mm 13mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#151515;margin:0;background:#fff}section{width:100%;break-inside:avoid}.print-head{display:flex;align-items:start;justify-content:space-between;padding:8px 0 12px;border-top:3px solid #4c2882}.print-brand{display:flex;flex-direction:column;gap:2px;font-size:9px}.s-mark{font-family:Georgia,serif;color:#4c2882;font-size:32px;font-weight:bold;letter-spacing:-3px}.print-head-right{text-align:right}.print-head-right strong{font-size:11px}.print-number{font-size:20px;font-weight:800;margin:5px 0}.subtitle{background:#f1f1f1;padding:7px 10px;font-weight:bold;margin:0 0 12px}.columns{display:grid;grid-template-columns:1fr 1fr;border:1px solid #777}.columns>div{padding:7px 10px}.columns>div+div{border-left:1px solid #aaa}.info-row{display:flex;gap:9px;padding:4px 0;line-height:1.2}.info-row strong{min-width:72px}.info-row span{overflow-wrap:anywhere}.line{display:flex;align-items:baseline;gap:10px;padding:8px 10px;border:1px solid #999;border-top:0;white-space:pre-wrap;overflow-wrap:anywhere}.line strong{min-width:128px;text-transform:uppercase;font-size:9px;letter-spacing:0.5px}.line span{flex:1}.customer-barcode{display:flex;justify-content:flex-end;max-height:57px;margin:10px 0 5px}.barcode{height:50px;max-width:100%;width:auto}.small{font-size:8px;line-height:1.4;margin:10px 0}.cutline{border-top:1.5px dashed #666;position:relative;text-align:center;margin:17mm 0 6mm;padding-top:5px;color:#555;font-size:9px}.workshop .print-head{padding-bottom:9px}.sticker-title{background:#eee;margin-top:10px;padding:6px 9px;font-size:9px;font-weight:bold}.sticker-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:5px}.sticker{border:1px dashed #555;min-height:83px;padding:6px 8px;display:flex;align-items:center;flex-direction:column;justify-content:space-between;gap:3px}.sticker .barcode{height:42px}.sticker small{font-size:8px}.signatures{display:flex;justify-content:space-between;gap:40px;margin-top:24px;padding-top:25px}.signatures>div{border-top:1px solid #666;min-width:38%;text-align:center;padding-top:5px;font-size:9px}.delivery>p{font-size:11px;line-height:1.45}.retire-fields{margin:32px 0 0;display:grid;gap:24px;font-size:11px}.delivery-sign{margin:55px 0 35px}.delivery-bottom{display:flex;align-items:center;justify-content:space-between}.delivery-bottom .barcode{height:48px} @media screen{body{max-width:210mm;margin:20px auto;padding:11mm 13mm;box-shadow:0 3px 22px #0002}} @media print{body{padding:0;margin:0}.delivery{page-break-after:auto}}
 ${kind==='retiro'?'':`
 /* La orden de ingreso utiliza una A4 para las dos copias y ambas etiquetas. */
 @media print{
  @page{size:A4;margin:8mm 11mm}
  .intake-sheet{width:100%;font-size:10.5px;line-height:1.17}
  .intake-sheet section{break-inside:avoid;page-break-inside:avoid}
  .intake-sheet .print-head{padding:4px 0 6px;border-top-width:2px}
  .intake-sheet .print-brand{font-size:8px;gap:1px}
  .intake-sheet .s-mark{font-size:25px}
  .intake-sheet .print-head-right strong{font-size:9.5px}
  .intake-sheet .print-number{font-size:16px;margin:2px 0}
  .intake-sheet .subtitle{padding:4px 7px;margin:0 0 7px}
  .intake-sheet .columns>div{padding:4px 7px;min-width:0}
  .intake-sheet .info-row{padding:2.5px 0;line-height:1.15;min-width:0}
  .intake-sheet .info-row strong{min-width:66px;flex:0 0 66px}
  .intake-sheet .info-row span{flex:1 1 0;min-width:0;overflow-wrap:anywhere;word-break:break-word}
  .intake-sheet .line{padding:4px 7px;line-height:1.22}
  .intake-sheet .line strong{min-width:113px;font-size:8px}
  .intake-sheet .customer-barcode{max-height:44px;margin:5px 0 3px}
  .intake-sheet .customer-barcode .barcode{height:42px}
  .intake-sheet .small{font-size:7.3px;margin:5px 0;line-height:1.2}
  .intake-sheet .cutline{margin:5mm 0 3mm;padding-top:3px;font-size:8px}
  .intake-sheet .workshop .print-head{padding-bottom:5px}
  .intake-sheet .sticker-title{margin-top:6px;padding:4px 7px;font-size:8px}
  .intake-sheet .sticker-row{gap:7px;margin-top:4px}
  .intake-sheet .sticker{min-height:68px;padding:4px 6px;gap:2px}
  .intake-sheet .sticker .barcode{height:34px}
  .intake-sheet .sticker small{font-size:7.5px}
  .intake-sheet .signatures{margin-top:12px;padding-top:15px}
  .intake-sheet .signatures>div{font-size:8px;padding-top:3px}
 }
`}
 </style></head><body>${kind==='retiro'?deliveryHtml(o):intakeHtml(o)}<script>
 function fitIntakeOnOnePage(){
   const sheet=document.querySelector('.intake-sheet');if(!sheet)return;
   sheet.style.zoom='';sheet.style.width='';
   // Altura útil: 297 mm A4 menos los márgenes de 8 mm, con reserva de seguridad.
   const ruler=document.createElement('div');ruler.style.cssText='position:absolute;visibility:hidden;height:276mm;width:1mm';
   document.body.appendChild(ruler);const available=ruler.getBoundingClientRect().height;ruler.remove();
   const height=sheet.getBoundingClientRect().height;
   if(height>available){
      const scale=Math.max(0.55,Math.min(1,(available-12)/height));
      sheet.style.width=(100/scale).toFixed(3)+'%';
      sheet.style.zoom=scale.toFixed(3);
   }
 }
 window.addEventListener('beforeprint',fitIntakeOnOnePage);
 window.onload=function(){setTimeout(function(){window.print()},250)};<\/script></body></html>`;
}
export function openPrint(o,kind='ingreso',existingWindow=null){
 const w=existingWindow||window.open('','_blank');
 if(!w)throw Error('El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes para este sitio.');
 w.document.open();w.document.write(printDocument(o,kind));w.document.close();return w;
}
