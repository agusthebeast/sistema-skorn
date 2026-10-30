import {auth,db} from './firebase.js';
import {signInWithEmailAndPassword,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {collection,doc,getDoc,setDoc,updateDoc,runTransaction,onSnapshot,serverTimestamp,query,limit,where,getDocs,increment} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {METHODS,money,safe,normalizeDni,normalizeSerie,sumPayments,validateDelivery} from './domain.js';
import {openPrint} from './print.js';
import {PAY_METHODS,cents,fromCents,normalizeSku,validSku,ensurePaymentTotal,saleTotal,summarizeMovements,paymentStats,emptySummary,movementBreakdown} from './finance.js';
import {catalogKey,catalogOptions,activeCatalogNames} from './catalog-utils.js';
import {clientForOrder} from './client-utils.js';
const $=id=>document.getElementById(id);
const refs={cash:doc(db,'config','cajaActual'),counter:doc(db,'config','contadores')};
let orders=[],clients=[],movements=[],catalog=[],cash=null,area='Entrada',page='ordenes',user=null,selectedClient=null,selectedEquipment=null,detailId=null,unsubs=[],processing=false,detailTab='general',chosenAccessories=new Set(),lastPrintedId=null,orderDraft=null,cashSessions=[],products=[],sales=[],stockAdjustments=[],saleCart=[],salePriceMode="lista",salePayments={Efectivo:0,Transferencia:0,QR:0,Posnet:0},saleSearch={caja:"",venta:""},settingsType="accesorio",settingsSearch="",settingsShowInactive=false;
const namesByType=type=>activeCatalogNames(type,catalog,type==='marca'?orders.map(o=>o.marca).filter(Boolean):type==='modelo'?orders.map(o=>o.modelo).filter(Boolean):[]);
async function ensureCatalog(type,name){const n=String(name||'').trim();if(!n)return;if(n.length>90)throw Error('El nombre debe tener menos de 90 caracteres.');const id=catalogKey(type,n);if(!id.endsWith('_')&&id!==type+'_')await setDoc(doc(db,'catalogos',id),{tipo:type,nombre:n,activo:true,updatedAt:serverTimestamp(),updatedBy:user.email},{merge:true});}
function warnPopup(o,kind){try{const c=clientForOrder(o,clients);openPrint({...o,nombreCliente:c.nombre,dniCliente:c.dni,telefonoCliente:c.telefono,correoCliente:c.correo,direccionCliente:c.direccion},kind)}catch(e){err(e)}}

const dateText=v=>v?.toDate?.()?.toLocaleString('es-AR')||'—';
const fmtN=n=>String(n).padStart(6,'0');
const el=(s)=>document.createElement('div');
const toast=(msg,bad=false)=>{const t=$('toast');t.textContent=msg;t.style.background=bad?'#a52e38':'#262a32';t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),4300)};
const err=e=>{console.error(e);toast(e?.message||'Ocurrió un error',true)};
const busy=async(fn)=>{if(processing)return false;processing=true;try{await fn();return true}catch(e){err(e);return false}finally{processing=false}};
const nav=(p)=>{page=p;document.querySelectorAll('.page').forEach(n=>n.classList.toggle('hidden',n.id!==`page-${p}`));document.querySelectorAll('.rail-nav').forEach(b=>b.classList.toggle('active',b.dataset.page===p));if(p==='caja')renderCash();if(p==='clientes')renderClients();if(p==='inventario')renderInventory();if(p==='estadisticas')renderStats();if(p==='venta'){renderSaleInterfaces();renderSales()}if(p==='configuracion')renderSettings()};
const showDrawer=(title,body)=>{$('drawer-title').textContent=title;$('drawer-body').innerHTML=body;$('drawer').classList.remove('hidden');$('overlay').classList.remove('hidden')};
const closeDrawer=()=>{$('drawer').classList.add('hidden');$('overlay').classList.add('hidden');detailId=null};
const field=(title,val='')=>`<div class="field-card"><b>${safe(title)}</b><p>${safe(val)}</p></div>`;
const statusPill=v=>`<span class="pill ${v==='Entregado'?'done':v==='Listo para retirar'?'ready':v==='En reparación'?'work':''}">${safe(v||'Sin estado')}</span>`;
// Ficha de contacto completa: recupera el registro actual de Agenda, no solo los datos
// que se copiaron cuando la orden fue creada o importada.
function orderClientDetails(o){
 const c=clientForOrder(o,clients),value=v=>v?String(v):'Sin registrar';
 const items=[['Nombre y apellido',c.nombre],['DNI',c.dni],['Teléfono / WhatsApp',c.telefono],['Correo electrónico',c.correo],['Dirección',c.direccion]];
 if(c.observaciones)items.push(['Observaciones del cliente',c.observaciones]);
 return `<section class="drawer-section customer-block"><div class="customer-heading"><h3>Datos completos del cliente</h3><span class="customer-source">${c.encontrado?'Agenda actualizada':'Datos de la orden'}</span></div><div class="customer-grid">${items.map(([name,val])=>`<div class="customer-data"><span>${safe(name)}</span><strong>${safe(value(val))}</strong></div>`).join('')}</div>${c.requiereRevision?'<p class="notice" style="margin:12px 0 0">Cliente pendiente de confirmar sus datos personales.</p>':''}${!c.encontrado?'<p class="hint">No se encontró una ficha coincidente en Agenda. Se muestran los datos que conserva esta orden.</p>':''}</section>`;
}
function settingsItemHtml(item){
 const label=item.activo?'Quitar':'Restaurar';
 return `<div class="settings-item ${item.activo?'':'is-inactive'}"><div class="settings-item-name"><b>${safe(item.nombre)}</b><span class="hint">${item.activo?'Disponible al crear órdenes':'Oculto en órdenes nuevas'} · ${item.esInicial?'Opción inicial':'Personalizado'}</span></div><button type="button" class="btn ${item.activo?'muted':'blue'}" data-catalog-id="${safe(item.id)}" data-catalog-name="${safe(item.nombre)}" data-catalog-toggle="${item.activo?'off':'on'}">${label}</button></div>`;
}
function renderSettings(){
 if(!$('settings-list'))return;
 document.querySelectorAll('[data-settings-type]').forEach(b=>b.classList.toggle('active',b.dataset.settingsType===settingsType));
 const options=catalogOptions(settingsType,catalog);
 const active=options.filter(x=>x.activo),disabled=options.filter(x=>!x.activo);
 $('settings-label').textContent=settingsType==='accesorio'?'Accesorios disponibles':'Fallas informadas disponibles';
 $('settings-count').textContent=`${active.length} activas · ${disabled.length} ocultas`;
 $('settings-show-inactive').checked=settingsShowInactive;
 const filtered=options.filter(x=>(settingsShowInactive||x.activo)&&x.nombre.toLocaleLowerCase().includes(settingsSearch.toLocaleLowerCase()));
 $('settings-list').innerHTML=filtered.length?filtered.map(settingsItemHtml).join(''):'<p class="hint">No hay opciones que coincidan con tu búsqueda.</p>';
 $('settings-list').querySelectorAll('[data-catalog-toggle]').forEach(b=>b.onclick=()=>changeCatalogState(b.dataset.catalogId,b.dataset.catalogName,b.dataset.catalogToggle==='on'));
}
async function changeCatalogState(id,name,enabled){
 const option=catalogOptions(settingsType,catalog).find(x=>x.id===id&&x.nombre===name);
 if(!option)throw Error('La opción ya no existe en el catálogo.');
 if(!enabled&&!confirm(`¿Quitar «${name}» de las opciones disponibles? Las órdenes anteriores conservarán este dato.`))return;
 await busy(async()=>{
  await setDoc(doc(db,'catalogos',id),{tipo:settingsType,nombre:name,activo:enabled,updatedAt:serverTimestamp(),updatedBy:user.email},{merge:true});
  toast(enabled?'Opción restaurada.':'Opción quitada del selector. Las órdenes anteriores se mantienen.');
 });
}
async function addSettingsOption(ev){
 ev.preventDefault();const name=$('settings-add-name').value.trim();
 if(!name||name.length>90)return toast('Ingresá un nombre de entre 1 y 90 caracteres.',true);
 await busy(async()=>{await ensureCatalog(settingsType,name);$('settings-add-name').value='';toast('Opción agregada y disponible para próximas órdenes.');});
}

const STATUSES=['Sin estado','En diagnóstico','En reparación','Esperando repuesto','Esperando respuesta','Pasar presupuesto','Listo para retirar','Reparado','No reparado','Sin solución','Deposito','Entregado'];
function renderOrders(){
 const statusSelect=$('filter-status'),statusSelected=statusSelect.value;
 const statuses=[...new Set([...STATUSES,...orders.map(o=>o.estado).filter(Boolean)])];
 if(statusSelect.options.length!==statuses.length+1||statuses.some(s=>![...statusSelect.options].some(o=>o.value===s))){
   statusSelect.innerHTML='<option value="">Todos los estados</option>'+statuses.map(s=>`<option value="${safe(s)}">${safe(s)}</option>`).join('');
   statusSelect.value=statuses.includes(statusSelected)?statusSelected:'';
 }
 const active=orders.filter(o=>o.estado!=='Entregado');$('open-count').textContent=active.length;for(const a of ['Entrada','Reparación','Salida'])$('count-'+(a==='Reparación'?'reparacion':a.toLowerCase())).textContent=active.filter(o=>o.area===a).length;
const q=$('search-orders').value.trim().toLowerCase(),stat=$('filter-status').value;
let filtered=orders.filter(o=>(area==='Todas'||o.area===area)&&(!stat||o.estado===stat)&&(!q||[o.numero,o.nombreCliente,o.dniCliente,o.modelo,o.marca,o.responsable,o.serie,o.falla].join(' ').toLowerCase().includes(q)));
filtered.sort((a,b)=>Number(b.numero||0)-Number(a.numero||0));$('orders-foot').textContent=`Cantidad: ${filtered.length} órdenes`;
$('orders-table').innerHTML=filtered.length?filtered.map(o=>`<tr class="order-row" data-id="${safe(o.id)}"><td><b>${safe(o.numero)}</b></td><td>${statusPill(o.estado)}</td><td>${safe([o.marca,o.modelo].filter(Boolean).join(' '))}</td><td>${safe(o.nombreCliente)}</td><td>${safe(o.responsable||'Sin asignar')}</td><td>${o.presupuesto===null||o.presupuesto===undefined?'Pendiente':money(o.presupuesto)}</td><td><button type="button" class="mini" data-id="${safe(o.id)}">Ver / Imprimir</button></td></tr>`).join(''):'<tr><td colspan="7">No se encontraron órdenes para este filtro.</td></tr>';
$('orders-table').querySelectorAll('[data-id]').forEach(n=>n.addEventListener('click',()=>showOrder(n.dataset.id)));
}
function renderClients(){let q=$('search-clients').value.trim().toLowerCase();let rows=clients.filter(c=>[c.nombre,c.dni,c.telefono,c.correo].join(' ').toLowerCase().includes(q));$('clients-table').innerHTML=rows.length?rows.map(c=>`<tr><td>${safe(c.nombre)}</td><td>${safe(c.dni||'Sin DNI · revisar')}</td><td>${safe(c.telefono)}</td><td>${safe(c.direccion)}</td></tr>`).join(''):'<tr><td colspan="4">Sin clientes.</td></tr>'}
// ---- Caja, historial, estadísticas y pagos de ventas / V3 ----
function cashDelta(tipo,pagos,monto){
 const dir=tipo==='ingreso'?'Ingresos':'Egresos';
 const amount=cents(monto),eff=cents(pagos.Efectivo),tra=cents(pagos.Transferencia),qr=cents(pagos.QR),pos=cents(pagos.Posnet);
 return {['resumen.'+(tipo==='ingreso'?'ingresos':'egresos')]:increment(fromCents(amount)),
 ['resumen.efectivo'+dir]:increment(fromCents(eff)),['resumen.digital'+dir]:increment(fromCents(tra+qr+pos)),
 ['resumen.transferencia'+dir]:increment(fromCents(tra)),['resumen.qr'+dir]:increment(fromCents(qr)),
 ['resumen.posnet'+dir]:increment(fromCents(pos)), 'resumen.movimientos':increment(1)};
}
const timeValue=v=>v?.toMillis?.()??(v?.seconds? v.seconds*1000:0);
const csvDate=v=>v?.toDate?.()?.toLocaleString('es-AR')||'';
const moneyCell=n=>money(n||0);
function getLiveCashMovements(){return cash?.open&&cash?.id?movements.filter(m=>m.cajaId===cash.id):[]}
function sessionSummary(c){return c?.resumenInicializado&&c.resumen?c.resumen:summarizeMovements(movements.filter(m=>m.cajaId===c?.id))}
function financeCard(s){return paymentStats(s).map(c=>`<article class="finance-card ${c.key}"><div class="finance-title">${safe(c.title)}</div><div class="fin-row"><span>Ingresos</span><strong class="positive">${money(c.ingresos)}</strong></div><div class="fin-row"><span>Egresos</span><strong class="negative">${money(c.egresos)}</strong></div><div class="fin-row net"><span>Saldo neto</span><strong>${money(c.neto)}</strong></div><div class="fin-bar"><span style="width:${c.ingresos+c.egresos?Math.round(c.ingresos/(c.ingresos+c.egresos)*100):0}%"></span></div></article>`).join('')}
function renderCash(){
 const open=Boolean(cash?.open&&cash?.id),current=cashSessions.find(c=>c.id===cash?.id),mov=getLiveCashMovements();
 const sums=current?.resumenInicializado?current.resumen:summarizeMovements(mov);
 $('caja-estado').textContent=open?'Abierta — '+(current?.abiertaPor||cash.abiertaPor||'personal'):'Cerrada';$('cash-status').textContent=open?'Caja abierta':'Caja cerrada';
 $('caja-ingresos').textContent=money(open?sums.ingresos:0);$('caja-egresos').textContent=money(open?sums.egresos:0);
 $('open-cash').disabled=open;$('close-cash').disabled=!open;
 $('caja-stats').innerHTML=financeCard(open?sums:emptySummary());
 const inicial=Number(current?.saldoInicialEfectivo||0);const esperado=inicial+Number(sums.efectivoIngresos||0)-Number(sums.efectivoEgresos||0);
 $('caja-opening-info').textContent=open?`Fondo inicial de efectivo: ${money(inicial)} · Efectivo esperado en el cajón: ${money(esperado)} · Abierta: ${dateText(current?.abiertaAt||cash.abiertaAt)}`:'No hay caja abierta. El historial de las cajas cerradas permanece disponible debajo.';
 $('cash-table').innerHTML=mov.length?mov.sort((a,b)=>timeValue(b.createdAt)-timeValue(a.createdAt)).map(m=>`<tr><td>${dateText(m.createdAt)}</td><td>${safe(m.tipo)}</td><td>${safe(m.concepto)}</td><td>${safe(Object.entries(m.pagos||{}).filter(([,n])=>n>0).map(([k,v])=>`${k}: ${money(v)}`).join(' · ')||m.metodo||'Sin detalle')}</td><td>${money(m.monto)}</td></tr>`).join(''):'<tr><td colspan="5">No hay movimientos en la caja actual.</td></tr>';
 renderCashHistory();renderSaleInterfaces();if(page==='estadisticas')renderStats();
}
function renderCashHistory(){
 const rows=[...cashSessions].sort((a,b)=>timeValue(b.abiertaAt)-timeValue(a.abiertaAt));
 $('cash-history-table').innerHTML=rows.length?rows.map(c=>{const s=sessionSummary(c),cashNet=(s.efectivoIngresos||0)-(s.efectivoEgresos||0),digitalNet=(s.digitalIngresos||0)-(s.digitalEgresos||0);return `<tr><td>${dateText(c.abiertaAt)}<small class="sub-cell">${safe(c.abiertaPor||'')}</small></td><td>${dateText(c.cerradaAt)}<small class="sub-cell">${safe(c.cerradaPor||'')}</small></td><td>${statusPill(c.estado==='cerrada'?'Entregado':'En reparación').replace(c.estado==='cerrada'?'Entregado':'En reparación',c.estado==='cerrada'?'Cerrada':'Abierta')}</td><td>${money(cashNet)}</td><td>${money(digitalNet)}</td><td><b>${money((s.ingresos||0)-(s.egresos||0))}</b></td><td><button class="mini" data-cash-id="${safe(c.id)}">Ver detalle</button></td></tr>`}).join(''):'<tr><td colspan="7">Todavía no hay cajas registradas.</td></tr>';
 $('cash-history-table').querySelectorAll('[data-cash-id]').forEach(b=>b.onclick=()=>showCashHistory(b.dataset.cashId));
}
async function showCashHistory(id){
 const c=cashSessions.find(x=>x.id===id);if(!c)return;
 showDrawer('Historial de caja','<p class="hint">Cargando todos los movimientos de esta caja…</p>');
 try{
  // Consulta por cajaId (sin límite global) para revisar también los turnos antiguos.
  const snapshot=await getDocs(query(collection(db,'movimientos'),where('cajaId','==',id)));
  const rows=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>timeValue(b.createdAt)-timeValue(a.createdAt));
  const totals=summarizeMovements(rows),s=c.resumenInicializado?c.resumen:totals;
  $('drawer-body').innerHTML=`<div class="cash-info"><b>Turno ${safe(id)}</b><p>Apertura: ${dateText(c.abiertaAt)} · ${safe(c.abiertaPor||'')}</p><p>Cierre: ${dateText(c.cerradaAt)} · ${safe(c.cerradaPor||'')}</p></div><div class="finance-grid drawer-finance">${financeCard(s)}</div><div class="field-card">Fondo inicial: <b>${money(c.saldoInicialEfectivo||0)}</b><p>Efectivo esperado: ${money(c.saldoEfectivoEsperado??(Number(c.saldoInicialEfectivo||0)+s.efectivoIngresos-s.efectivoEgresos))} · Efectivo contado: ${c.saldoEfectivoContado===undefined?'No informado':money(c.saldoEfectivoContado)}</p>${c.diferenciaEfectivo===undefined?'':`<p>Diferencia de caja: <b>${money(c.diferenciaEfectivo)}</b></p>`}</div><button class="btn ghost" id="download-session">↓ Exportar movimientos CSV</button><h3>Movimientos (${rows.length})</h3><div class="table-scroll"><table><thead><tr><th>FECHA</th><th>CONCEPTO</th><th>MEDIOS</th><th>IMPORTE</th></tr></thead><tbody>${rows.map(m=>`<tr><td>${dateText(m.createdAt)}</td><td>${safe(m.tipo)} · ${safe(m.concepto)}</td><td>${safe(Object.entries(m.pagos||{}).filter(([,n])=>n>0).map(([k,v])=>k+': '+money(v)).join(' · '))}</td><td>${money(m.monto)}</td></tr>`).join('')||'<tr><td colspan="4">Sin movimientos</td></tr>'}</tbody></table></div>`;
  $('download-session').onclick=()=>downloadMovementsCSV(rows,'caja_'+id+'.csv');
 }catch(e){err(e);$('drawer-body').textContent='No fue posible consultar los movimientos de esta caja.'}
}
function openCash(){
 showDrawer('Abrir nueva caja',`<form id="form-open-cash" class="form-grid"><label>Fondo inicial en efectivo ($)<input id="initial-cash" type="number" min="0" step="0.01" value="0" required></label><p class="hint">Si el cajón ya tiene dinero, registralo como fondo inicial; no se considera un ingreso por ventas.</p><div class="span-2 form-footer"><button class="btn blue" type="submit">Confirmar apertura</button></div></form>`);
 $('form-open-cash').onsubmit=e=>{e.preventDefault();const inicial=Number($('initial-cash').value);if(!Number.isFinite(inicial)||inicial<0||cents(inicial)/100!==inicial){toast('Fondo inicial inválido.',true);return}
 busy(async()=>{const id=doc(collection(db,'cajas')).id;await runTransaction(db,async tx=>{const s=await tx.get(refs.cash);if(s.exists()&&s.data().open)throw Error('Ya existe una caja abierta.');tx.set(doc(db,'cajas',id),{abiertaAt:serverTimestamp(),abiertaPor:user.email,estado:'abierta',saldoInicialEfectivo:inicial,resumenInicializado:true,resumen:emptySummary()});tx.set(refs.cash,{id,open:true,abiertaPor:user.email,abiertaAt:serverTimestamp()});});closeDrawer();toast('Caja abierta correctamente')})};
}
function closeCash(){
 if(!cash?.open)return toast('No hay una caja abierta.',true);
 const c=cashSessions.find(x=>x.id===cash.id),s=c?.resumenInicializado?c.resumen:summarizeMovements(getLiveCashMovements()),esperado=fromCents(cents(c?.saldoInicialEfectivo||0)+cents(s.efectivoIngresos)-cents(s.efectivoEgresos));
 showDrawer('Cerrar caja',`<div class="finance-grid drawer-finance">${financeCard(s)}</div><form id="form-close-cash" class="form-grid"><label>Efectivo esperado ($)<input disabled value="${esperado.toFixed(2)}"></label><label>Efectivo contado en cajón ($)<input id="cash-counted" type="number" min="0" step="0.01" value="${Math.max(0,esperado).toFixed(2)}" required></label><label class="span-2">Observaciones del cierre<textarea id="cash-close-notes" placeholder="Diferencias, comprobantes pendientes, notas del turno…"></textarea></label><div class="span-2 form-footer"><button class="btn danger" type="submit">Confirmar cierre definitivo</button></div></form>`);
 $('form-close-cash').onsubmit=e=>{e.preventDefault();const contado=Number($('cash-counted').value),notas=$('cash-close-notes').value.trim();if(!Number.isFinite(contado)||contado<0||fromCents(cents(contado))!==contado)return toast('Efectivo contado inválido',true);if(!confirm('¿Cerrar esta caja? Se conservarán todos los movimientos en el historial.'))return;
 busy(async()=>{await runTransaction(db,async tx=>{const a=await tx.get(refs.cash);if(!a.exists()||!a.data().open||a.data().id!==cash.id)throw Error('La caja actual cambió. Revisá antes de cerrar.');const cajaRef=doc(db,'cajas',a.data().id),old=await tx.get(cajaRef);if(!old.exists()||old.data().estado!=='abierta')throw Error('Esta caja ya está cerrada.');const resumen=old.data().resumenInicializado?old.data().resumen:s;
 const cashExpected=fromCents(cents(old.data().saldoInicialEfectivo||0)+cents(resumen.efectivoIngresos)-cents(resumen.efectivoEgresos));
 tx.update(cajaRef,{estado:'cerrada',cerradaAt:serverTimestamp(),cerradaPor:user.email,saldoEfectivoEsperado:cashExpected,saldoEfectivoContado:contado,diferenciaEfectivo:fromCents(cents(contado)-cents(cashExpected)),observacionesCierre:notas,resumenCierre:resumen});tx.set(refs.cash,{id:null,open:false,cerradaAt:serverTimestamp()});});closeDrawer();toast('Caja cerrada. Ya podés verla en el historial.')});
 };
}
async function manualMovement({tipo,concepto,monto,metodo,origen='manual'}){return busy(async()=>{
 monto=Number(monto);if(!['ingreso','egreso'].includes(tipo)||!Number.isFinite(monto)||monto<=0||fromCents(cents(monto))!==monto)throw Error('Monto o tipo inválido.');if(!concepto.trim())throw Error('Escribí el concepto.');if(!PAY_METHODS.includes(metodo))throw Error('Medio de pago inválido.');
 const ref=doc(collection(db,'movimientos')),pagos={[metodo]:monto};await runTransaction(db,async tx=>{const c=await tx.get(refs.cash);if(!c.exists()||!c.data().open)throw Error('Abrí una caja antes de registrar movimientos.');const cajaRef=doc(db,'cajas',c.data().id),caja=await tx.get(cajaRef);if(!caja.exists()||caja.data().estado!=='abierta')throw Error('El turno ya está cerrado.');tx.set(ref,{cajaId:c.data().id,tipo,concepto,monto,pagos,origen,usuario:user.email,createdAt:serverTimestamp()});tx.update(cajaRef,cashDelta(tipo,pagos,monto));});toast('Movimiento registrado')
})}
function downloadCSV(name,rows){const body='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');const blob=new Blob([body],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function downloadMovementsCSV(rows,name='movimientos_syx.csv'){downloadCSV(name,[['Fecha','Tipo','Concepto','Caja','Efectivo','Transferencia','QR','Posnet','Total','Usuario'],...rows.map(m=>[csvDate(m.createdAt),m.tipo,m.concepto,m.cajaId,...PAY_METHODS.map(k=>movementBreakdown(m)[k]),m.monto,m.usuario])])}
function statsMovements(){
 const src=$('stats-source').value,from=$('stats-from').value,to=$('stats-to').value;
 return movements.filter(m=>{if(src==='actual'&&m.cajaId!==cash?.id)return false;const d=m.createdAt?.toDate?.();if(!d)return !from&&!to;const local=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');return (!from||local>=from)&&(!to||local<=to)})
}
function renderStats(){
 const entries=statsMovements(),s=summarizeMovements(entries);$('stats-grid').innerHTML=financeCard(s);
 const detail=[['Transferencia',s.transferenciaIngresos,s.transferenciaEgresos],['QR',s.qrIngresos,s.qrEgresos],['Posnet',s.posnetIngresos,s.posnetEgresos],['Otros / sin identificar',s.otrosIngresos,s.otrosEgresos]];
 $('stats-methods').innerHTML=detail.map(([k,inc,out])=>`<tr><td>${k}</td><td>${money(inc)}</td><td>${money(out)}</td><td>${money(inc-out)}</td></tr>`).join('');
 $('stats-range-info').textContent=`${entries.length} movimientos incluidos · ${movements.length>=5000?'ATENCIÓN: la consulta general alcanzó el límite de 5.000 movimientos. Para un cierre exacto usá el detalle de una caja.':'Los importes reflejan los movimientos consultados.'}`;
}
// ---- Inventario y ventas transaccionales / V3 ----
function renderInventory(){
 const active=products.filter(p=>p.activo!==false),low=active.filter(p=>Number(p.stock)<=Number(p.stockMinimo||0));
 $('stock-count').textContent=active.length;$('stock-units').textContent=active.reduce((t,p)=>t+Number(p.stock||0),0);$('stock-low').textContent=low.length;
 const term=$('search-stock').value.trim().toLowerCase(),f=$('stock-filter').value;
 const rows=products.filter(p=>[p.sku,p.nombre,p.categoria].join(' ').toLowerCase().includes(term)&&(f==='todos'||(f==='activos'&&p.activo!==false)||(f==='inactivos'&&p.activo===false)||(f==='bajo'&&p.activo!==false&&p.stock<=p.stockMinimo))).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
 $('stock-foot').textContent=`${rows.length} productos · SKU único por artículo`;
 $('stock-table').innerHTML=rows.length?rows.map(p=>`<tr><td><b>${safe(p.sku)}</b></td><td>${safe(p.nombre)}${p.activo===false?'<small class="sub-cell">Archivado</small>':''}</td><td>${safe(p.categoria||'—')}</td><td>${p.stock<=p.stockMinimo?'<b class="negative">'+p.stock+'</b>':p.stock}</td><td>${p.stockMinimo||0}</td><td>${money(p.precioEfectivo)}</td><td>${money(p.precioLista)}</td><td><button class="mini" data-product="${safe(p.id)}">Editar</button></td></tr>`).join(''):'<tr><td colspan="8">No se encontraron productos. Creá uno con el botón «Agregar producto».</td></tr>';
 $('stock-table').querySelectorAll('[data-product]').forEach(b=>b.onclick=()=>productForm(b.dataset.product));
}
function renderSales(){const rows=[...sales].sort((a,b)=>timeValue(b.createdAt)-timeValue(a.createdAt)).slice(0,200);$('sales-table').innerHTML=rows.length?rows.map(v=>`<tr><td>${dateText(v.createdAt)}</td><td>${(v.items||[]).map(x=>safe(x.sku)+' x'+x.cantidad).join(', ')}</td><td>${safe(Object.entries(v.pagos||{}).filter(([,n])=>n>0).map(([k,n])=>k+': '+money(n)).join(' · '))}</td><td>${money(v.total)}</td><td>${safe(v.usuario||'')}</td></tr>`).join(''):'<tr><td colspan="5">Todavía no hay ventas desde el inventario.</td></tr>'}
function renderStockAdjustments(){const rows=[...stockAdjustments].sort((a,b)=>timeValue(b.createdAt)-timeValue(a.createdAt)).slice(0,100);$('adjustments-table').innerHTML=rows.length?rows.map(a=>`<tr><td>${dateText(a.createdAt)}</td><td>${safe(a.sku||a.productoId)}</td><td>${a.stockAntes}</td><td>${a.stockDespues}</td><td><b class="${a.diferencia<0?'negative':'positive'}">${a.diferencia>0?'+':''}${a.diferencia}</b></td><td>${safe(a.motivo)}</td><td>${safe(a.usuario)}</td></tr>`).join(''):'<tr><td colspan="7">Todavía no hay ajustes manuales.</td></tr>'}
function productForm(id=null){const p=products.find(x=>x.id===id);showDrawer(p?'Editar producto':'Nuevo producto',`<form id="product-form" class="form-grid"><label>SKU *<input id="product-sku" required maxlength="60" value="${safe(p?.sku||'')}" ${p?'readonly':''} placeholder="Ej.: CTRL-SAMSUNG-01"></label><label>Categoría<input id="product-category" maxlength="70" value="${safe(p?.categoria||'')}" placeholder="Controles, cables, soportes…"></label><label class="span-2">Nombre del producto *<input id="product-name" required maxlength="150" value="${safe(p?.nombre||'')}"></label><label>Precio efectivo ($) *<input id="product-cash" type="number" min="0" step="0.01" required value="${p?.precioEfectivo??''}"></label><label>Precio lista ($) *<input id="product-list" type="number" min="0" step="0.01" required value="${p?.precioLista??''}"></label><label>Stock mínimo<input id="product-min" type="number" min="0" step="1" required value="${p?.stockMinimo??0}"></label>${p?`<label>Stock disponible<input readonly value="${Number(p.stock)||0}"></label><label class="span-2"><span>Estado</span><select id="product-active"><option value="true" ${p.activo!==false?'selected':''}>Activo</option><option value="false" ${p.activo===false?'selected':''}>Archivado (no vender)</option></select></label>`:`<label>Stock inicial *<input id="product-stock" type="number" min="0" step="1" required value="0"></label>`}<div class="span-2 form-footer"><button class="btn blue" type="submit">Guardar producto</button>${p?'<button class="btn muted" type="button" id="stock-adjust">Ajustar stock</button>':''}</div></form><p class="hint">El SKU no puede cambiarse una vez creado. Para corregir cantidades utilizá «Ajustar stock», dejando un motivo registrado.</p>`);
 if(p)$('stock-adjust').onclick=()=>adjustStock(p.id);
 $('product-form').onsubmit=e=>{e.preventDefault();busy(async()=>{
 const sku=normalizeSku($('product-sku').value),name=$('product-name').value.trim(),cat=$('product-category').value.trim(),ef=Number($('product-cash').value),li=Number($('product-list').value),min=Number($('product-min').value),stock=p?Number(p.stock):Number($('product-stock').value);
 if(!validSku(sku))throw Error('SKU inválido: usá letras, números, guiones, puntos o guion bajo (máximo 60).');if(!name||name.length>150)throw Error('Nombre de producto inválido.');if(![ef,li].every(n=>Number.isFinite(n)&&n>=0&&fromCents(cents(n))===n))throw Error('Precios inválidos.');if(!Number.isSafeInteger(min)||min<0||!Number.isSafeInteger(stock)||stock<0)throw Error('Stock y mínimo deben ser cantidades enteras no negativas.');
 const productRef=doc(db,'productos',sku),data={sku,nombre:name,categoria:cat,precioLista:li,precioEfectivo:ef,stockMinimo:min,activo:p?$('product-active').value==='true':true,updatedAt:serverTimestamp(),updatedBy:user.email};
 await runTransaction(db,async tx=>{const old=await tx.get(productRef);if(!p&&old.exists())throw Error('Ya existe un producto con ese SKU.');if(p&&!old.exists())throw Error('Producto inexistente.');if(p)tx.update(productRef,data);else tx.set(productRef,{...data,stock,createdAt:serverTimestamp(),createdBy:user.email})});closeDrawer();toast('Producto guardado correctamente');
 })};
}
function adjustStock(id){const p=products.find(x=>x.id===id);if(!p)return;showDrawer('Ajustar stock · '+p.sku,`<div class="field-card"><b>${safe(p.nombre)}</b><p>Stock actual: ${p.stock} unidades</p></div><form class="form-grid" id="adjust-form"><label>Nuevo stock *<input id="adjust-to" type="number" min="0" step="1" required value="${p.stock}"></label><label class="span-2">Motivo del ajuste *<textarea id="adjust-reason" required placeholder="Conteo físico, ingreso de mercadería, rotura, devolución…"></textarea></label><div class="span-2 form-footer"><button class="btn blue" type="submit">Registrar ajuste</button></div></form>`);
 $('adjust-form').onsubmit=e=>{e.preventDefault();const next=Number($('adjust-to').value),reason=$('adjust-reason').value.trim();busy(async()=>{if(!Number.isSafeInteger(next)||next<0)throw Error('Stock inválido.');if(reason.length<4)throw Error('Escribí el motivo del ajuste.');const ref=doc(db,'productos',id),adj=doc(collection(db,'ajustesStock'));
 await runTransaction(db,async tx=>{const old=await tx.get(ref);if(!old.exists())throw Error('El producto ya no existe.');const previous=Number(old.data().stock);if(next===previous)throw Error('No hay diferencia de stock para registrar.');tx.update(ref,{stock:next,updatedAt:serverTimestamp(),updatedBy:user.email});tx.set(adj,{productoId:id,sku:old.data().sku,nombre:old.data().nombre,stockAntes:previous,stockDespues:next,diferencia:next-previous,motivo:reason,usuario:user.email,createdAt:serverTimestamp()})});closeDrawer();toast('Ajuste de stock registrado')})};
}
function cartTotal(){try{return saleTotal(saleCart,products,salePriceMode)}catch(e){return null}}
function saleHtml(ctx){const list=products.filter(p=>p.activo!==false);let total=cartTotal();return `<div class="sale-shell"><div class="sale-picker"><input id="sale-search-${ctx}" autocomplete="off" placeholder="Escaneá SKU o buscá por nombre…" value="${safe(saleSearch[ctx])}"><div id="sale-results-${ctx}" class="sale-results"></div></div><div class="sale-cart"><div class="sale-cart-head"><b>Productos de la venta</b><label>Tarifa<select id="sale-price-${ctx}"><option value="lista" ${salePriceMode==='lista'?'selected':''}>Precio de lista</option><option value="efectivo" ${salePriceMode==='efectivo'?'selected':''}>Precio efectivo (100 % efectivo)</option></select></label></div><div class="cart-list">${saleCart.length?saleCart.map(row=>{const p=products.find(x=>x.id===row.id);return `<div class="cart-line"><div><b>${safe(p?.nombre||row.id)}</b><small>${safe(row.id)} · ${money((salePriceMode==='efectivo'?p?.precioEfectivo:p?.precioLista)||0)} c/u</small></div><div class="cart-quantity"><button type="button" data-qty="-1" data-id="${safe(row.id)}">−</button><strong>${row.cantidad}</strong><button type="button" data-qty="1" data-id="${safe(row.id)}">＋</button></div><button class="remove-line" type="button" data-remove="${safe(row.id)}">×</button></div>`}).join(''):'<p class="hint">Agregá productos desde el buscador. Se podrán descontar del stock al cobrar.</p>'}</div><div class="sale-total"><span>Total a cobrar</span><strong>${total===null?'Revisar stock':money(total)}</strong></div><div class="payments">${PAY_METHODS.map(m=>`<label>${m} ($)<input data-sale-pay="${safe(m)}" data-context="${ctx}" type="number" min="0" step="0.01" value="${salePayments[m]||0}"></label>`).join('')}</div><div class="sale-actions"><span class="hint">Completar en:</span>${PAY_METHODS.map(m=>`<button class="btn muted" data-pay-all="${m}" data-context="${ctx}" type="button">${m}</button>`).join('')}</div><p class="hint">La modalidad efectivo exige pago totalmente en efectivo. Se valida nuevamente el stock antes del cobro.</p><button class="btn primary full" data-final-sale="${ctx}" ${!saleCart.length||total===null||total<=0||!cash?.open?'disabled':''}>Cobrar y descontar stock</button>${!cash?.open?'<p class="error">Abrí Caja antes de vender.</p>':''}</div></div>`}
function renderSaleInterfaces(){for(const ctx of ['caja','venta']){const host=$('quick-sale-'+ctx);if(!host)continue;host.innerHTML=saleHtml(ctx);const search=$('sale-search-'+ctx);search.oninput=()=>{saleSearch[ctx]=search.value;drawSaleResults(ctx)};search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const term=search.value.trim().toUpperCase();const item=products.find(p=>p.activo!==false&&p.stock>0&&p.sku===normalizeSku(term))||products.find(p=>p.activo!==false&&p.stock>0&&p.nombre.toUpperCase().includes(term));if(item)addToCart(item.id);else toast('Producto no encontrado o sin stock',true)}};
 $('sale-price-'+ctx).onchange=e=>{salePriceMode=e.target.value;renderSaleInterfaces()};
 host.querySelectorAll('[data-qty]').forEach(b=>b.onclick=()=>changeCartQuantity(b.dataset.id,Number(b.dataset.qty)));
 host.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{saleCart=saleCart.filter(x=>x.id!==b.dataset.remove);renderSaleInterfaces()});
 host.querySelectorAll('[data-sale-pay]').forEach(inp=>inp.oninput=()=>{salePayments[inp.dataset.salePay]=Number(inp.value||0)});
 host.querySelectorAll('[data-pay-all]').forEach(b=>b.onclick=()=>{if(b.dataset.payAll==='Efectivo')salePriceMode='efectivo';else salePriceMode='lista';const amount=cartTotal();if(amount===null)return toast('Revisá stock y precios',true);salePayments={Efectivo:0,Transferencia:0,QR:0,Posnet:0,[b.dataset.payAll]:amount};renderSaleInterfaces()});
 host.querySelector('[data-final-sale]').onclick=confirmProductSale;drawSaleResults(ctx)
}}
function drawSaleResults(ctx){const el=$('sale-results-'+ctx);if(!el)return;const q=(saleSearch[ctx]||'').trim().toLowerCase();const hits=products.filter(p=>p.activo!==false&&p.stock>0&&(!q||[p.sku,p.nombre,p.categoria].join(' ').toLowerCase().includes(q))).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).slice(0,8);
 el.innerHTML=hits.length?hits.map(p=>`<button type="button" class="sale-hit" data-add="${safe(p.id)}"><span><b>${safe(p.nombre)}</b><small>${safe(p.sku)} · Stock: ${p.stock}</small></span><strong>${money(salePriceMode==='efectivo'?p.precioEfectivo:p.precioLista)} ＋</strong></button>`).join(''):'<p class="hint">Sin productos disponibles. Cargalos en Inventario.</p>';el.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addToCart(b.dataset.add))}
function addToCart(id){const p=products.find(x=>x.id===id);if(!p||p.activo===false||p.stock<=0)return toast('Producto sin stock.',true);const row=saleCart.find(x=>x.id===id);if(row&&row.cantidad>=p.stock)return toast('No hay más unidades disponibles.',true);if(row)row.cantidad++;else saleCart.push({id,cantidad:1});renderSaleInterfaces()}
function changeCartQuantity(id,delta){const row=saleCart.find(x=>x.id===id),p=products.find(x=>x.id===id);if(!row||!p)return;const n=row.cantidad+delta;if(n>p.stock)return toast('No hay más stock disponible.',true);if(n<=0)saleCart=saleCart.filter(x=>x.id!==id);else row.cantidad=n;renderSaleInterfaces()}
async function confirmProductSale(){
 if(processing)return;const items=saleCart.map(x=>({...x})),mode=salePriceMode,pay={...salePayments};let total;
 try{total=saleTotal(items,products,mode);ensurePaymentTotal(pay,total,mode)}catch(e){return err(e)}
 if(!confirm(`¿Cobrar ${money(total)} y descontar ${items.reduce((a,b)=>a+b.cantidad,0)} unidades del stock?`))return;
 await busy(async()=>{const saleRef=doc(collection(db,'ventas')),movementRef=doc(db,'movimientos','venta_'+saleRef.id),productRefs=items.map(x=>doc(db,'productos',x.id));
 await runTransaction(db,async tx=>{
  // Todas las lecturas deben ir antes de la primera escritura de la transacción.
  const [c,oldSale,oldMovement,...snapshots]=await Promise.all([tx.get(refs.cash),tx.get(saleRef),tx.get(movementRef),...productRefs.map(ref=>tx.get(ref))]);
  if(!c.exists()||!c.data().open)throw Error('Abrí Caja antes de vender.');if(oldSale.exists()||oldMovement.exists())throw Error('Esta venta ya fue registrada.');
  const cajaRef=doc(db,'cajas',c.data().id),cashSnap=await tx.get(cajaRef);if(!cashSnap.exists()||cashSnap.data().estado!=='abierta')throw Error('La caja se cerró.');
  const fetched=snapshots.map((s,i)=>{if(!s.exists())throw Error('Producto eliminado: '+items[i].id);return {id:s.id,...s.data()}});
  const exact=saleTotal(items,fetched,mode),split=ensurePaymentTotal(pay,exact,mode);
  const lines=items.map((i,j)=>({sku:i.id,nombre:fetched[j].nombre,cantidad:i.cantidad,precioUnitario:mode==='efectivo'?fetched[j].precioEfectivo:fetched[j].precioLista,subtotal:fromCents(cents(mode==='efectivo'?fetched[j].precioEfectivo:fetched[j].precioLista)*i.cantidad)}));
  tx.set(saleRef,{cajaId:c.data().id,items:lines,modoPrecio:mode,total:exact,pagos:split,movimientoId:movementRef.id,usuario:user.email,createdAt:serverTimestamp()});
  tx.set(movementRef,{cajaId:c.data().id,tipo:'ingreso',origen:'venta_producto',ventaId:saleRef.id,concepto:'Venta de productos · '+lines.map(x=>x.sku+' x'+x.cantidad).join(', ').slice(0,250),monto:exact,pagos:split,usuario:user.email,createdAt:serverTimestamp()});
  snapshots.forEach((p,j)=>tx.update(productRefs[j],{stock:Number(p.data().stock)-items[j].cantidad,updatedAt:serverTimestamp(),updatedBy:user.email}));tx.update(cajaRef,cashDelta('ingreso',split,exact));
 });saleCart=[];salePayments={Efectivo:0,Transferencia:0,QR:0,Posnet:0};saleSearch={caja:'',venta:''};salePriceMode='lista';renderSaleInterfaces();toast('Venta cobrada. Stock descontado y Caja actualizada.')
 });
}
function newClient(returnToOrder=false){showDrawer('Nuevo cliente',`<form id="client-form" class="form-grid"><label>DNI *<input id="c-dni" inputmode="numeric" required placeholder="Documento sin puntos"></label><label>Nombre y apellido *<input id="c-nombre" required></label><label>Teléfono<input id="c-telefono" placeholder="11..."></label><label>Correo<input id="c-correo" type="email"></label><label class="span-2">Dirección<input id="c-direccion"></label><div class="span-2 form-footer"><button type="button" class="btn muted" id="client-cancel">Cancelar</button><button class="btn blue" type="submit">Guardar cliente</button></div></form>`);$('client-cancel').onclick=()=>returnToOrder?newOrder():closeDrawer();$('client-form').onsubmit=e=>{e.preventDefault();busy(async()=>{const dni=normalizeDni($('c-dni').value);if(dni.length<6)throw Error('Ingresá un DNI válido.');const ref=doc(db,'clientes',dni);const name=$('c-nombre').value.trim();const data={dni,nombre:name,telefono:$('c-telefono').value.trim(),correo:$('c-correo').value.trim(),direccion:$('c-direccion').value.trim(),createdAt:serverTimestamp()};await runTransaction(db,async tx=>{const s=await tx.get(ref);if(s.exists())throw Error('Ese DNI ya está registrado. Buscá al cliente existente.');tx.set(ref,data)});selectedClient={id:dni,...data};toast('Cliente creado');returnToOrder?newOrder():closeDrawer()})};}
function accessoryPickerHtml(){return `<div class="accessory-picker"><div id="o-accessory-options" class="accessory-options"></div><div class="accessory-add"><input id="o-accessory-new" placeholder="Ej.: Adaptador, antena, control especial…" maxlength="90"><button type="button" class="btn ghost" id="o-accessory-add">＋ Guardar accesorio</button></div><p class="hint">Seleccioná todos los que ingresan con el equipo. El nuevo accesorio queda guardado para próximas órdenes.</p></div>`}
function drawAccessoryOptions(){
 const holder=$('o-accessory-options');if(!holder)return;
 const all=[...new Set([...namesByType('accesorio'),...chosenAccessories])];
 holder.innerHTML=all.map(a=>`<label class="accessory-choice ${chosenAccessories.has(a)?'chosen':''}"><input type="checkbox" data-acc="${safe(a)}" ${chosenAccessories.has(a)?'checked':''}><span>${safe(a)}</span></label>`).join('');
 holder.querySelectorAll('[data-acc]').forEach(e=>e.onchange=()=>{e.checked?chosenAccessories.add(e.dataset.acc):chosenAccessories.delete(e.dataset.acc);e.closest('label').classList.toggle('chosen',e.checked)});
}
function bindAccessories(){
 drawAccessoryOptions();
 $('o-accessory-add').onclick=async()=>{const node=$('o-accessory-new'),v=node.value.trim();if(!v){node.focus();return;}
  try{await ensureCatalog('accesorio',v);chosenAccessories.add(v);node.value='';drawAccessoryOptions();toast('Accesorio agregado y guardado para futuras órdenes')}catch(e){err(e)}
 };
 $('o-accessory-new').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('o-accessory-add').click()}};
}
function newOrder(){
 selectedEquipment=null;chosenAccessories=new Set(orderDraft?.accessories||[]);
 showDrawer('Crear orden de trabajo',`<div class="drawer-section"><h3>1. Cliente</h3><div class="two-buttons"><input style="flex:1" id="pick-client" placeholder="Buscar cliente por nombre o DNI"><button class="btn blue" type="button" id="client-plus">＋ Cliente</button></div><div id="selected-client"></div><div id="client-results" class="select-list"></div></div>
 <div class="drawer-section"><h3>2. Equipo y recepción</h3><div class="form-grid">
 <label>Marca *<input id="o-marca" list="marcas-list" maxlength="90" placeholder="Elegí o escribí una marca"><datalist id="marcas-list">${namesByType('marca').map(v=>`<option value="${safe(v)}">`).join('')}</datalist></label>
 <label>Modelo *<input id="o-modelo" list="modelos-list" maxlength="110" placeholder="Elegí o escribí el modelo"><datalist id="modelos-list">${namesByType('modelo').map(v=>`<option value="${safe(v)}">`).join('')}</datalist></label>
 <label>N.º de serie<input id="o-serie" maxlength="100" placeholder="Opcional"></label>
 <label>Falla informada *<select id="o-falla"><option value="">Elegir falla</option>${namesByType('falla').map(f=>`<option value="${safe(f)}">${safe(f)}</option>`).join('')}<option value="__otra">＋ Otra falla (escribir)</option></select></label>
 <label class="span-2 hidden" id="o-falla-otra-wrap">Nueva falla<input id="o-falla-otra" maxlength="160" placeholder="Escribí el nombre de la falla"></label>
 <label class="span-2">Descripción del problema declarado por el cliente<textarea id="o-trabajo" placeholder="Ej.: enciende, se escucha sonido y la pantalla queda negra"></textarea></label>
 <label class="span-2">Descripción del estado físico del equipo<textarea id="o-estado-equipo" placeholder="Ej.: pantalla con rayones, marco marcado, carcasa quebrada, falta una pata, tornillos faltantes…"></textarea></label>
 <div class="span-2"><h4 class="form-subheading">Accesorios que recibe el taller</h4>${accessoryPickerHtml()}</div>
 <label>Responsable<input id="o-responsable" value="${safe(user?.email||'')}"></label><label>Prioridad<select id="o-prioridad"><option>Normal</option><option>Alta</option><option>Baja</option></select></label>
 </div></div><p class="hint">El presupuesto se registra después. No se cobra al ingresar el equipo.</p><div class="form-footer"><button class="btn muted" id="cancel-new">Cancelar</button><button class="btn blue" id="save-order">Crear orden e imprimir</button></div>`);
 const showPicked=()=>{$('selected-client').innerHTML=selectedClient?`<div class="field-card"><b>Seleccionado: ${safe(selectedClient.nombre)}</b><p>DNI ${safe(selectedClient.dni)} · ${safe(selectedClient.telefono||'Sin teléfono')}</p></div>`:''};showPicked();
 const find=()=>{const q=$('pick-client').value.trim().toLowerCase();$('client-results').innerHTML=q?clients.filter(c=>[c.nombre,c.dni,c.telefono].join(' ').toLowerCase().includes(q)).slice(0,12).map(c=>`<button class="select-item" data-client="${safe(c.id)}"><b>${safe(c.nombre)}</b><p class="hint">DNI ${safe(c.dni)} · ${safe(c.telefono||'')}</p></button>`).join(''):'<p class="hint">Buscá un cliente o registrá uno nuevo.</p>';$('client-results').querySelectorAll('[data-client]').forEach(b=>b.onclick=()=>{selectedClient=clients.find(c=>c.id===b.dataset.client);$('pick-client').value='';$('client-results').innerHTML='';showPicked()})};
 $('pick-client').oninput=find;find();$('client-plus').onclick=()=>{orderDraft={marca:$('o-marca').value,modelo:$('o-modelo').value,serie:$('o-serie').value,falla:$('o-falla').value,otra:$('o-falla-otra').value,trabajo:$('o-trabajo').value,estadoEquipo:$('o-estado-equipo').value,responsable:$('o-responsable').value,prioridad:$('o-prioridad').value,accessories:[...chosenAccessories]};newClient(true)};$('cancel-new').onclick=()=>{orderDraft=null;closeDrawer()};
 $('o-falla').onchange=()=>{$('o-falla-otra-wrap').classList.toggle('hidden',$('o-falla').value!=='__otra');if($('o-falla').value==='__otra')$('o-falla-otra').focus()};
 bindAccessories();
 if(orderDraft){for(const [key,id] of Object.entries({marca:'o-marca',modelo:'o-modelo',serie:'o-serie',falla:'o-falla',otra:'o-falla-otra',trabajo:'o-trabajo',estadoEquipo:'o-estado-equipo',responsable:'o-responsable',prioridad:'o-prioridad'})){if($(id))$(id).value=orderDraft[key]||'';} $('o-falla-otra-wrap').classList.toggle('hidden',orderDraft.falla!=='__otra');orderDraft=null}
 $('save-order').onclick=async()=>{
   if(processing)return;
   const marca=$('o-marca').value.trim(),modelo=$('o-modelo').value.trim(),serie=$('o-serie').value.trim(),
     falla=$('o-falla').value==='__otra'?$('o-falla-otra').value.trim():$('o-falla').value,
     trabajo=$('o-trabajo').value.trim()||falla,estadoEquipo=$('o-estado-equipo').value.trim();
   if(!selectedClient?.id){toast('Seleccioná un cliente.',true);return}
   if(!marca||!modelo||!falla){toast('Completá marca, modelo y falla.',true);return}
   const data={marca,modelo,serie,falla,trabajo,estadoEquipo,clienteId:selectedClient.id,nombreCliente:selectedClient.nombre,
     dniCliente:selectedClient.dni,telefonoCliente:selectedClient.telefono||'',direccionCliente:selectedClient.direccion||'',
     accesoriosLista:[...chosenAccessories].sort(),accesorios:[...chosenAccessories].sort().join(', '),
     responsable:$('o-responsable').value.trim(),prioridad:$('o-prioridad').value,
     estado:'Sin estado',area:'Entrada',presupuesto:null,createdAt:serverTimestamp(),createdBy:user.email};
   // Reservar la ventana durante el clic evita el bloqueo de pop-ups tras el await.
   const popup=window.open('','_blank');
   if(popup){popup.document.write('<!doctype html><html><meta charset="utf-8"><title>Generando orden…</title><body style="font-family:Arial;padding:30px">Guardando orden e iniciando impresión…</body></html>');popup.document.close()}
   await busy(async()=>{
     const serial=normalizeSerie(serie),eqRef=serial?doc(db,'equipos','serie_'+serial):doc(collection(db,'equipos')),orderRef=doc(collection(db,'ordenes'));
     let next;
     await runTransaction(db,async tx=>{
       const counter=await tx.get(refs.counter),existing=serial?await tx.get(eqRef):null;
       if(existing?.exists()&&existing.data().clienteId!==selectedClient.id)throw Error('Ese número de serie está asignado a otro cliente.');
       next=Number(counter.exists()?counter.data().ordenes||0:0)+1;if(next>999999)throw Error('Se agotó la numeración.');
       tx.set(refs.counter,{ordenes:next},{merge:true});
       if(!existing?.exists())tx.set(eqRef,{clienteId:selectedClient.id,marca,modelo,serie,createdAt:serverTimestamp()});
       tx.set(orderRef,{...data,numero:fmtN(next),equipoId:eqRef.id});
     });
     // El catálogo queda disponible al personal en la próxima orden.
     try{await Promise.allSettled([ensureCatalog('marca',marca),ensureCatalog('modelo',modelo),ensureCatalog('falla',falla),...data.accesoriosLista.map(a=>ensureCatalog('accesorio',a))])}catch(e){console.warn('Catálogo: ',e)}
     const printable={...data,numero:fmtN(next),createdAt:{toDate:()=>new Date()}};
     try{openPrint(printable,'ingreso',popup)}catch(e){toast('Orden creada. Podés imprimirla desde Ver / Imprimir.',true)}
     lastPrintedId=orderRef.id;orderDraft=null;closeDrawer();selectedClient=null;toast('Orden '+fmtN(next)+' creada. Se abrió la hoja para imprimir.');
   });
   if(processing===false&&popup&&!popup.document.title.startsWith('SYX -')){
     try{popup.close()}catch(e){}
   }
 };
}
function renderDetail(){
 const o=orders.find(x=>x.id===detailId);if(!o){closeDrawer();return}
 const done=o.estado==='Entregado';
 const currentClient=clientForOrder(o,clients);
 const tabs=['general','diagnostico','historial'];
 $('drawer-title').textContent=`Orden N.º ${o.numero}`;
 $('drawer-body').innerHTML=`<div class="status-row"><div><b>${safe([o.marca,o.modelo].join(' '))}</b><p class="hint">${safe(currentClient.nombre)} · ${currentClient.dni?'DNI '+safe(currentClient.dni):'Sin DNI · verificar datos'}</p></div>${statusPill(o.estado)}</div>
 ${orderClientDetails(o)}<div class="print-actions"><button class="btn ghost" id="print-entry">▤ Imprimir orden de ingreso + etiquetas</button><button class="btn ghost" id="print-pickup" ${done?'':'disabled title="Se habilita cuando se entrega el equipo"'}>▤ Imprimir constancia de retiro</button></div>
 <div class="detail-tabs">${tabs.map(t=>`<button data-tab="${t}" class="${detailTab===t?'active':''}">${({general:'Orden',diagnostico:'Diagnóstico',historial:'Historial'})[t]}</button>`).join('')}</div><div id="detail-content"></div>`;
 $('print-entry').onclick=()=>warnPopup(o,'ingreso');
 $('print-pickup').onclick=()=>warnPopup(o,'retiro');
 $('drawer-body').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{detailTab=b.dataset.tab;renderDetail()});
 const body=$('detail-content');
 if(detailTab==='historial'){
   const same=orders.filter(x=>x.equipoId&&x.equipoId===o.equipoId&&x.id!==o.id).sort((a,b)=>Number(b.numero)-Number(a.numero));
   body.innerHTML=field('Creada',dateText(o.createdAt))+field('Estado actual',o.estado)+field('Entregada',dateText(o.entregadoAt))+field('Responsable de entrega',o.responsableEntrega||'—')+
    `<h3>Historial del mismo equipo</h3>`+(same.length?same.map(x=>`<button class="select-item full-history" data-order="${safe(x.id)}">Orden ${safe(x.numero)} · ${safe(x.trabajo)} · ${safe(x.estado)}</button>`).join(''):'<p class="hint">No hay otras órdenes registradas de este equipo.</p>');
   body.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>showOrder(b.dataset.order));return;
 }
 if(detailTab==='diagnostico'){
   body.innerHTML=`<div class="form-grid"><label class="span-2">Diagnóstico / trabajo realizado<textarea id="edit-diagnostico" ${done?'disabled':''}>${safe(o.diagnostico||'')}</textarea></label><label class="span-2">Observaciones<textarea id="edit-notas" ${done?'disabled':''}>${safe(o.notas||'')}</textarea></label></div><div class="form-footer"><button id="save-diagnostico" class="btn blue" ${done?'disabled':''}>Guardar diagnóstico</button></div>`;
   if(!done)$('save-diagnostico').onclick=()=>updateOrder({diagnostico:$('edit-diagnostico').value.trim(),notas:$('edit-notas').value.trim()});return;
 }
 const estadoEquipo=o.estadoEquipo||'';
 const accesorios=Array.isArray(o.accesoriosLista)?o.accesoriosLista:(o.accesorios||'').split(',').map(a=>a.trim()).filter(Boolean);
 chosenAccessories=new Set(accesorios);
 body.innerHTML=`<div class="form-grid"><label class="span-2">Falla informada<select id="edit-falla" ${done?'disabled':''}><option value="">Seleccioná una falla</option>${[...new Set([...namesByType('falla'),o.falla].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')).map(v=>`<option value="${safe(v)}" ${v===o.falla?'selected':''}>${safe(v)}</option>`).join('')}${!done?'<option value="__otra">＋ Nueva falla (escribir)</option>':''}</select></label>${!done?'<label class="span-2 hidden" id="edit-falla-otra-wrap">Nueva falla informada<input id="edit-falla-otra" maxlength="90" placeholder="Escribí una nueva falla"></label>':''}<label class="span-2">Descripción de la falla<textarea id="edit-trabajo" ${done?'disabled':''}>${safe(o.trabajo||'')}</textarea></label>
 <label class="span-2">Estado físico del equipo<textarea id="edit-estado-equipo" ${done?'disabled':''} placeholder="Rayones, golpes, falta de piezas…">${safe(estadoEquipo)}</textarea></label>
 <div class="span-2">${!done?`<h4 class="form-subheading">Accesorios ingresados</h4>${accessoryPickerHtml()}`:`${field('Accesorios',accesorios.join(', ')||'Sin accesorios')}`}</div>
 <label>Estado<select id="edit-estado" ${done?'disabled':''}>${[...new Set([...STATUSES,...orders.map(x=>x.estado).filter(Boolean)])].filter(s=>s!=='Entregado'||done).map(s=>`<option ${s===o.estado?'selected':''}>${s}</option>`).join('')}</select></label>
 <label>Área<select id="edit-area" ${done?'disabled':''}>${['Entrada','Reparación','Salida'].map(s=>`<option ${s===o.area?'selected':''}>${s}</option>`).join('')}</select></label>
 <label>Responsable<input id="edit-responsable" value="${safe(o.responsable||'')}" ${done?'disabled':''}></label>
 <label>Presupuesto ($)<input id="edit-presupuesto" type="number" min="0" step="0.01" value="${o.presupuesto??''}" ${done?'disabled':''} placeholder="Pendiente"></label></div>
 ${done?field('Fecha de entrega',dateText(o.entregadoAt)):`<div class="form-footer"><button id="save-detail" class="btn blue">Guardar cambios</button></div>`}
 <hr style="border:0;border-top:1px solid #e5e6e9;margin:25px 0"><div class="drawer-section"><h3>Entrega en mostrador</h3>
 ${done?`<div class="notice"><b>Equipo entregado.</b><p>Fecha: ${dateText(o.entregadoAt)}</p><p>Importe: ${money(o.presupuesto)} · ${Number(o.presupuesto)>0?'Cobro registrado una sola vez.':'Sin cargo.'}</p><p>Para imprimir la constancia de retiro, usá el botón de arriba.</p></div>`:`<p class="hint">Guardá primero el presupuesto. Para confirmar la entrega, el total de los medios de pago debe coincidir exactamente con el importe.</p><div class="form-grid" style="margin-bottom:14px"><label>Persona que retira<input id="retirante-nombre" value="${safe(currentClient.nombre||'')}" placeholder="Nombre y apellido"></label><label>DNI de quien retira<input id="retirante-dni" placeholder="Documento (si corresponde)"></label></div><div class="payments">${METHODS.map(m=>`<label>${m} ($)<input data-pay="${m}" type="number" min="0" step="0.01" value="0"></label>`).join('')}</div><p id="pay-total" class="hint">Total ingresado: ${money(0)}</p><button id="deliver" class="btn primary full">Confirmar cobro y entrega</button>`}</div>`;
 if(!done){
   bindAccessories();
   $('edit-falla').onchange=()=>{$('edit-falla-otra-wrap').classList.toggle('hidden',$('edit-falla').value!=='__otra')};
   $('save-detail').onclick=async()=>{
     const p=$('edit-presupuesto').value,acc=[...chosenAccessories].sort();
     const newFailure=$('edit-falla').value==='__otra'?$('edit-falla-otra').value.trim():$('edit-falla').value;
     if(!newFailure)return toast('Seleccioná una falla informada.',true);
     if($('edit-falla').value==='__otra'){try{await ensureCatalog('falla',newFailure)}catch(e){return err(e)}}
     updateOrder({estado:$('edit-estado').value,area:$('edit-area').value,
       responsable:$('edit-responsable').value.trim(),presupuesto:p===''?null:Number(p),
       falla:newFailure,trabajo:$('edit-trabajo').value.trim(),
       estadoEquipo:$('edit-estado-equipo').value.trim(),accesoriosLista:acc,accesorios:acc.join(', ')});
   };
   const ps=()=>Object.fromEntries(METHODS.map(m=>[m,Number(document.querySelector(`[data-pay="${m}"]`).value||0)]));
   document.querySelectorAll('[data-pay]').forEach(n=>n.oninput=()=>$('pay-total').textContent=`Total ingresado: ${money(sumPayments(ps()))}`);
   $('deliver').onclick=()=>{const pay=ps();if(!confirm(`¿Confirmar entrega de la orden ${o.numero} por ${money(o.presupuesto)}? Esta acción no se puede repetir.`))return;deliverOrder(o.id,pay,{nombre:$('retirante-nombre').value.trim(),dni:$('retirante-dni').value.trim()})};
 }
}
function showOrder(id){detailId=id;detailTab='general';showDrawer('Orden de trabajo','');renderDetail()}
async function updateOrder(partial){const id=detailId;await busy(async()=>{const r=doc(db,'ordenes',id);await runTransaction(db,async tx=>{const s=await tx.get(r);if(!s.exists())throw Error('La orden no existe.');if(s.data().estado==='Entregado')throw Error('No se pueden modificar órdenes entregadas.');if(partial.presupuesto!==undefined&&partial.presupuesto!==null&&(!Number.isFinite(partial.presupuesto)||partial.presupuesto<0))throw Error('Presupuesto inválido.');tx.update(r,{...partial,updatedAt:serverTimestamp(),updatedBy:user.email})});toast('Cambios guardados')})}
async function deliverOrder(id,pagos,retirante={}){await busy(async()=>{const orderRef=doc(db,'ordenes',id),movementRef=doc(db,'movimientos','retiro_'+id);await runTransaction(db,async tx=>{const orderS=await tx.get(orderRef);const cashS=await tx.get(refs.cash);const movementS=await tx.get(movementRef);const cajaRef=cashS.exists()&&cashS.data().open?doc(db,'cajas',cashS.data().id):null;const cajaSnap=cajaRef?await tx.get(cajaRef):null;if(movementS.exists())throw Error('Esta orden ya tiene un movimiento de cobro.');const order=orderS.exists()?orderS.data():null;const cajaAbierta=cashS.exists()&&cashS.data().open;const monto=validateDelivery(order,pagos,{openCash:cajaAbierta});if(monto>0){if(!cajaSnap?.exists()||cajaSnap.data().estado!=='abierta')throw Error('El turno de Caja está cerrado.');tx.update(cajaRef,cashDelta('ingreso',pagos,monto));tx.set(movementRef,{cajaId:cashS.data().id,tipo:'ingreso',origen:'retiro_orden',ordenId:id,numeroOrden:order.numero,concepto:'Retiro de orden N.º '+order.numero,monto,pagos,usuario:user.email,createdAt:serverTimestamp()});}tx.update(orderRef,{estado:'Entregado',area:'Salida',entregadoAt:serverTimestamp(),responsableEntrega:user.email,entregadoA:String(retirante.nombre||'').slice(0,120),dniRetiro:normalizeDni(retirante.dni||''),deliveryId:id,pagosEntrega:pagos,movimientoCajaId:monto>0?movementRef.id:null});});toast('Equipo entregado. Ya podés imprimir la constancia de retiro.');detailId=id;renderDetail()})}
function listen(){unsubs.forEach(f=>f());unsubs=[];unsubs.push(onSnapshot(query(collection(db,'ordenes'),limit(1000)),s=>{orders=s.docs.map(d=>({id:d.id,...d.data()}));renderOrders();if(detailId)renderDetail()},err));unsubs.push(onSnapshot(query(collection(db,'clientes'),limit(1500)),s=>{clients=s.docs.map(d=>({id:d.id,...d.data()}));renderClients();if(detailId)renderDetail()},err));unsubs.push(onSnapshot(refs.cash,s=>{cash=s.exists()?s.data():null;renderCash()},err));unsubs.push(onSnapshot(query(collection(db,'movimientos'),limit(5000)),s=>{movements=s.docs.map(d=>({id:d.id,...d.data()}));renderCash()},err));unsubs.push(onSnapshot(query(collection(db,'catalogos'),limit(1500)),s=>{catalog=s.docs.map(d=>({id:d.id,...d.data()}));drawAccessoryOptions();renderSettings()},err));unsubs.push(onSnapshot(query(collection(db,'cajas'),limit(1000)),s=>{cashSessions=s.docs.map(d=>({id:d.id,...d.data()}));renderCash()},err));unsubs.push(onSnapshot(query(collection(db,'productos'),limit(2000)),s=>{products=s.docs.map(d=>({id:d.id,...d.data()}));renderInventory();renderSaleInterfaces()},err));unsubs.push(onSnapshot(query(collection(db,'ventas'),limit(1500)),s=>{sales=s.docs.map(d=>({id:d.id,...d.data()}));renderSales()},err));unsubs.push(onSnapshot(query(collection(db,'ajustesStock'),limit(1000)),s=>{stockAdjustments=s.docs.map(d=>({id:d.id,...d.data()}));renderStockAdjustments()},err));}
$('today').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
$('login-form').onsubmit=e=>{e.preventDefault();$('login-error').textContent='';signInWithEmailAndPassword(auth,$('login-email').value.trim(),$('login-pass').value).catch(e=>$('login-error').textContent='No se pudo ingresar. Verificá usuario, contraseña y Authentication.')};
onAuthStateChanged(auth,u=>{user=u;if(u){$('login').classList.add('hidden');$('app').classList.remove('hidden');$('user-name').textContent=u.email;$('user-dot').textContent=(u.email||'S')[0].toUpperCase();listen()}else{unsubs.forEach(f=>f());unsubs=[];orders=[];clients=[];movements=[];catalog=[];cashSessions=[];products=[];sales=[];stockAdjustments=[];saleCart=[];cash=null;settingsType='accesorio';settingsSearch='';settingsShowInactive=false;$('login').classList.remove('hidden');$('app').classList.add('hidden');closeDrawer()}});
$('logout').onclick=()=>signOut(auth).catch(err);
document.querySelectorAll('.rail-nav').forEach(b=>b.onclick=()=>nav(b.dataset.page));document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{area=b.dataset.area;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));renderOrders()});
$('search-orders').oninput=renderOrders;$('search-orders').onkeydown=e=>{if(e.key!=='Enter')return;const v=$('search-orders').value.trim();const target=orders.find(o=>o.numero===v||o.numero===v.padStart(6,'0'));if(target){e.preventDefault();showOrder(target.id)}};$('filter-status').onchange=renderOrders;$('search-clients').oninput=renderClients;$('new-order').onclick=()=>{selectedClient=null;orderDraft=null;newOrder()};$('new-client-main').onclick=()=>newClient();$('drawer-close').onclick=closeDrawer;$('overlay').onclick=closeDrawer;$('refresh').onclick=()=>{renderOrders();toast('La lista se actualiza automáticamente desde Firebase')};$('open-cash').onclick=openCash;$('close-cash').onclick=closeCash;
$('cash-form').onsubmit=e=>{e.preventDefault();manualMovement({tipo:$('cash-type').value,concepto:$('cash-concept').value.trim(),monto:$('cash-value').value,metodo:$('cash-method').value}).then(ok=>{if(ok)$('cash-form').reset()})};$('sale-form').onsubmit=e=>{e.preventDefault();manualMovement({tipo:'ingreso',concepto:'Venta: '+$('sale-description').value.trim(),monto:$('sale-total').value,metodo:$('sale-method').value,origen:'venta_manual'}).then(ok=>{if(ok)$('sale-form').reset()})};

$('new-product').onclick=()=>productForm();$('search-stock').oninput=renderInventory;$('stock-filter').onchange=renderInventory;
$('stats-from').onchange=renderStats;$('stats-to').onchange=renderStats;$('stats-source').onchange=renderStats;$('stats-clear').onclick=()=>{$('stats-from').value='';$('stats-to').value='';$('stats-source').value='todas';renderStats()};
$('refresh-history').onclick=()=>{renderCashHistory();toast('El historial se actualiza automáticamente desde Firebase.')};
$('export-caja').onclick=()=>downloadMovementsCSV(getLiveCashMovements(),'syx_caja_actual.csv');
$('export-stats').onclick=()=>downloadMovementsCSV(statsMovements(),'syx_estadisticas_movimientos.csv');
$('export-stock').onclick=()=>downloadCSV('syx_inventario.csv',[['SKU','Nombre','Categoría','Stock','Mínimo','Precio efectivo','Precio lista','Estado'],...products.map(p=>[p.sku,p.nombre,p.categoria,p.stock,p.stockMinimo,p.precioEfectivo,p.precioLista,p.activo===false?'Archivado':'Activo'])]);
renderSaleInterfaces();renderInventory();renderStats();

$('export-sales').onclick=()=>downloadCSV('syx_ventas.csv',[['Fecha','Caja','Productos','Cantidad','Importe','Efectivo','Transferencia','QR','Posnet','Usuario'],...sales.map(v=>[csvDate(v.createdAt),v.cajaId,(v.items||[]).map(x=>x.sku+' x'+x.cantidad).join(', '),(v.items||[]).reduce((n,x)=>n+Number(x.cantidad),0),v.total,...PAY_METHODS.map(k=>v.pagos?.[k]||0),v.usuario])]);
renderSales();renderStockAdjustments();

// Configuración de accesorios y fallas informadas; no borra registros históricos.
document.querySelectorAll('[data-settings-type]').forEach(b=>b.onclick=()=>{settingsType=b.dataset.settingsType;settingsSearch='';$('settings-search').value='';renderSettings()});
$('settings-search').oninput=()=>{settingsSearch=$('settings-search').value.trim();renderSettings()};
$('settings-show-inactive').onchange=()=>{settingsShowInactive=$('settings-show-inactive').checked;renderSettings()};
$('settings-add-form').onsubmit=addSettingsOption;
renderSettings();
