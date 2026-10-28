import {auth,db} from './firebase.js';
import {signInWithEmailAndPassword,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {collection,doc,getDoc,setDoc,updateDoc,runTransaction,onSnapshot,serverTimestamp,query,limit} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {METHODS,money,safe,normalizeDni,normalizeSerie,sumPayments,validateDelivery} from './domain.js';
import {openPrint} from './print.js';
const $=id=>document.getElementById(id);
const refs={cash:doc(db,'config','cajaActual'),counter:doc(db,'config','contadores')};
let orders=[],clients=[],movements=[],catalog=[],cash=null,area='Entrada',page='ordenes',user=null,selectedClient=null,selectedEquipment=null,detailId=null,unsubs=[],processing=false,detailTab='general',chosenAccessories=new Set(),lastPrintedId=null,orderDraft=null;
const START_ACCESSORIES=['Control remoto','Base / pie','Cable de alimentación','Cable HDMI','Soporte','Caja','Tornillos'];
const START_FAILURES=['No enciende','No da imagen','Tiene sonido pero no imagen','Sin sonido','Líneas en pantalla','Pantalla rota','Reinicia constantemente','No conecta a WiFi','Problema de backlight','Falla de fuente','Falla de placa main'];
const namesByType=type=>[...new Set([...(type==='accesorio'?START_ACCESSORIES:type==='falla'?START_FAILURES:[]),...catalog.filter(x=>x.tipo===type).map(x=>x.nombre),...(type==='marca'?orders.map(o=>o.marca).filter(Boolean):type==='modelo'?orders.map(o=>o.modelo).filter(Boolean):[])])].sort((a,b)=>a.localeCompare(b,'es'));
const catalogKey=(type,name)=>type+'_'+String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,125);
async function ensureCatalog(type,name){const n=String(name||'').trim();if(!n)return;if(n.length>90)throw Error('El nombre debe tener menos de 90 caracteres.');const id=catalogKey(type,n);if(!id.endsWith('_')&&id!==type+'_')await setDoc(doc(db,'catalogos',id),{tipo:type,nombre:n,updatedAt:serverTimestamp(),updatedBy:user.email},{merge:true});}
function warnPopup(o,kind){try{openPrint(o,kind)}catch(e){err(e)}}

const dateText=v=>v?.toDate?.()?.toLocaleString('es-AR')||'—';
const fmtN=n=>String(n).padStart(6,'0');
const el=(s)=>document.createElement('div');
const toast=(msg,bad=false)=>{const t=$('toast');t.textContent=msg;t.style.background=bad?'#a52e38':'#262a32';t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),4300)};
const err=e=>{console.error(e);toast(e?.message||'Ocurrió un error',true)};
const busy=async(fn)=>{if(processing)return false;processing=true;try{await fn();return true}catch(e){err(e);return false}finally{processing=false}};
const nav=(p)=>{page=p;document.querySelectorAll('.page').forEach(n=>n.classList.toggle('hidden',n.id!==`page-${p}`));document.querySelectorAll('.rail-nav').forEach(b=>b.classList.toggle('active',b.dataset.page===p));if(p==='caja')renderCash();if(p==='clientes')renderClients()};
const showDrawer=(title,body)=>{$('drawer-title').textContent=title;$('drawer-body').innerHTML=body;$('drawer').classList.remove('hidden');$('overlay').classList.remove('hidden')};
const closeDrawer=()=>{$('drawer').classList.add('hidden');$('overlay').classList.add('hidden');detailId=null};
const field=(title,val='')=>`<div class="field-card"><b>${safe(title)}</b><p>${safe(val)}</p></div>`;
const statusPill=v=>`<span class="pill ${v==='Entregado'?'done':v==='Listo para retirar'?'ready':v==='En reparación'?'work':''}">${safe(v||'Sin estado')}</span>`;
function renderOrders(){const active=orders.filter(o=>o.estado!=='Entregado');$('open-count').textContent=active.length;for(const a of ['Entrada','Reparación','Salida'])$('count-'+(a==='Reparación'?'reparacion':a.toLowerCase())).textContent=active.filter(o=>o.area===a).length;
const q=$('search-orders').value.trim().toLowerCase(),stat=$('filter-status').value;
let filtered=orders.filter(o=>(area==='Todas'||o.area===area)&&(!stat||o.estado===stat)&&(!q||[o.numero,o.nombreCliente,o.dniCliente,o.modelo,o.marca,o.responsable,o.serie,o.falla].join(' ').toLowerCase().includes(q)));
filtered.sort((a,b)=>Number(b.numero||0)-Number(a.numero||0));$('orders-foot').textContent=`Cantidad: ${filtered.length} órdenes`;
$('orders-table').innerHTML=filtered.length?filtered.map(o=>`<tr class="order-row" data-id="${safe(o.id)}"><td><b>${safe(o.numero)}</b></td><td>${statusPill(o.estado)}</td><td>${safe([o.marca,o.modelo].filter(Boolean).join(' '))}</td><td>${safe(o.nombreCliente)}</td><td>${safe(o.responsable||'Sin asignar')}</td><td>${o.presupuesto===null||o.presupuesto===undefined?'Pendiente':money(o.presupuesto)}</td><td><button type="button" class="mini" data-id="${safe(o.id)}">Ver / Imprimir</button></td></tr>`).join(''):'<tr><td colspan="7">No se encontraron órdenes para este filtro.</td></tr>';
$('orders-table').querySelectorAll('[data-id]').forEach(n=>n.addEventListener('click',()=>showOrder(n.dataset.id)));
}
function renderClients(){let q=$('search-clients').value.trim().toLowerCase();let rows=clients.filter(c=>[c.nombre,c.dni,c.telefono].join(' ').toLowerCase().includes(q));$('clients-table').innerHTML=rows.length?rows.map(c=>`<tr><td>${safe(c.nombre)}</td><td>${safe(c.dni)}</td><td>${safe(c.telefono)}</td><td>${safe(c.direccion)}</td></tr>`).join(''):'<tr><td colspan="4">Sin clientes.</td></tr>'}
function renderCash(){const open=Boolean(cash?.open&&cash?.id),mov=open?movements.filter(m=>m.cajaId===cash.id):[];const inc=mov.filter(m=>m.tipo==='ingreso').reduce((n,m)=>n+Number(m.monto||0),0),egr=mov.filter(m=>m.tipo==='egreso').reduce((n,m)=>n+Number(m.monto||0),0);$('caja-estado').textContent=open?'Abierta — '+cash.id:'Cerrada';$('cash-status').textContent=open?'Caja abierta':'Caja cerrada';$('caja-ingresos').textContent=money(inc);$('caja-egresos').textContent=money(egr);$('open-cash').disabled=open;$('close-cash').disabled=!open;$('cash-table').innerHTML=mov.length?mov.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).map(m=>`<tr><td>${dateText(m.createdAt)}</td><td>${safe(m.tipo)}</td><td>${safe(m.concepto)}</td><td>${safe(Object.entries(m.pagos||{}).filter(([,n])=>n>0).map(([k,v])=>`${k}: ${money(v)}`).join(' · '))}</td><td>${money(m.monto)}</td></tr>`).join(''):'<tr><td colspan="5">No hay movimientos en la caja actual.</td></tr>'}
async function openCash(){await busy(async()=>{const id=doc(collection(db,'cajas')).id;await runTransaction(db,async tx=>{const s=await tx.get(refs.cash);if(s.exists()&&s.data().open)throw Error('Ya existe una caja abierta.');tx.set(doc(db,'cajas',id),{abiertaAt:serverTimestamp(),abiertaPor:user.email,estado:'abierta'});tx.set(refs.cash,{id,open:true,abiertaPor:user.email,abiertaAt:serverTimestamp()});});toast('Caja abierta correctamente')})}
async function closeCash(){if(!confirm('¿Cerrar la caja actual? Verificá los movimientos antes de continuar.'))return;await busy(async()=>{await runTransaction(db,async tx=>{const s=await tx.get(refs.cash);if(!s.exists()||!s.data().open)throw Error('No hay una caja abierta.');const id=s.data().id;tx.update(doc(db,'cajas',id),{cerradaAt:serverTimestamp(),cerradaPor:user.email,estado:'cerrada'});tx.set(refs.cash,{id:null,open:false,cerradaAt:serverTimestamp()});});toast('Caja cerrada')})}
async function manualMovement({tipo,concepto,monto,metodo,origen='manual'}){await busy(async()=>{monto=Number(monto);if(!Number.isFinite(monto)||monto<=0)throw Error('Monto inválido.');const r=doc(collection(db,'movimientos'));await runTransaction(db,async tx=>{const c=await tx.get(refs.cash);if(!c.exists()||!c.data().open)throw Error('Abrí una caja antes de registrar movimientos.');tx.set(r,{cajaId:c.data().id,tipo,concepto,monto,pagos:{[metodo]:monto},origen,usuario:user.email,createdAt:serverTimestamp()})});toast('Movimiento registrado')})}
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
 const tabs=['general','diagnostico','historial'];
 $('drawer-title').textContent=`Orden N.º ${o.numero}`;
 $('drawer-body').innerHTML=`<div class="status-row"><div><b>${safe([o.marca,o.modelo].join(' '))}</b><p class="hint">${safe(o.nombreCliente)} · DNI ${safe(o.dniCliente)}</p></div>${statusPill(o.estado)}</div>
 <div class="print-actions"><button class="btn ghost" id="print-entry">▤ Imprimir orden de ingreso + etiquetas</button><button class="btn ghost" id="print-pickup" ${done?'':'disabled title="Se habilita cuando se entrega el equipo"'}>▤ Imprimir constancia de retiro</button></div>
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
 body.innerHTML=`<div class="form-grid"><label class="span-2">Falla declarada<input id="edit-falla" value="${safe(o.falla||'')}" ${done?'disabled':''}></label><label class="span-2">Descripción de la falla<textarea id="edit-trabajo" ${done?'disabled':''}>${safe(o.trabajo||'')}</textarea></label>
 <label class="span-2">Estado físico del equipo<textarea id="edit-estado-equipo" ${done?'disabled':''} placeholder="Rayones, golpes, falta de piezas…">${safe(estadoEquipo)}</textarea></label>
 <div class="span-2">${!done?`<h4 class="form-subheading">Accesorios ingresados</h4>${accessoryPickerHtml()}`:`${field('Accesorios',accesorios.join(', ')||'Sin accesorios')}`}</div>
 <label>Estado<select id="edit-estado" ${done?'disabled':''}>${['Sin estado','En diagnóstico','En reparación','Esperando repuesto','Listo para retirar','Entregado'].filter(s=>s!=='Entregado'||done).map(s=>`<option ${s===o.estado?'selected':''}>${s}</option>`).join('')}</select></label>
 <label>Área<select id="edit-area" ${done?'disabled':''}>${['Entrada','Reparación','Salida'].map(s=>`<option ${s===o.area?'selected':''}>${s}</option>`).join('')}</select></label>
 <label>Responsable<input id="edit-responsable" value="${safe(o.responsable||'')}" ${done?'disabled':''}></label>
 <label>Presupuesto ($)<input id="edit-presupuesto" type="number" min="0" step="0.01" value="${o.presupuesto??''}" ${done?'disabled':''} placeholder="Pendiente"></label></div>
 ${done?field('Fecha de entrega',dateText(o.entregadoAt)):`<div class="form-footer"><button id="save-detail" class="btn blue">Guardar cambios</button></div>`}
 <hr style="border:0;border-top:1px solid #e5e6e9;margin:25px 0"><div class="drawer-section"><h3>Entrega en mostrador</h3>
 ${done?`<div class="notice"><b>Equipo entregado.</b><p>Fecha: ${dateText(o.entregadoAt)}</p><p>Importe: ${money(o.presupuesto)} · ${Number(o.presupuesto)>0?'Cobro registrado una sola vez.':'Sin cargo.'}</p><p>Para imprimir la constancia de retiro, usá el botón de arriba.</p></div>`:`<p class="hint">Guardá primero el presupuesto. Para confirmar la entrega, el total de los medios de pago debe coincidir exactamente con el importe.</p><div class="form-grid" style="margin-bottom:14px"><label>Persona que retira<input id="retirante-nombre" value="${safe(o.nombreCliente||'')}" placeholder="Nombre y apellido"></label><label>DNI de quien retira<input id="retirante-dni" placeholder="Documento (si corresponde)"></label></div><div class="payments">${METHODS.map(m=>`<label>${m} ($)<input data-pay="${m}" type="number" min="0" step="0.01" value="0"></label>`).join('')}</div><p id="pay-total" class="hint">Total ingresado: ${money(0)}</p><button id="deliver" class="btn primary full">Confirmar cobro y entrega</button>`}</div>`;
 if(!done){
   bindAccessories();
   $('save-detail').onclick=()=>{
     const p=$('edit-presupuesto').value,acc=[...chosenAccessories].sort();
     updateOrder({estado:$('edit-estado').value,area:$('edit-area').value,
       responsable:$('edit-responsable').value.trim(),presupuesto:p===''?null:Number(p),
       falla:$('edit-falla').value.trim(),trabajo:$('edit-trabajo').value.trim(),
       estadoEquipo:$('edit-estado-equipo').value.trim(),accesoriosLista:acc,accesorios:acc.join(', ')});
   };
   const ps=()=>Object.fromEntries(METHODS.map(m=>[m,Number(document.querySelector(`[data-pay="${m}"]`).value||0)]));
   document.querySelectorAll('[data-pay]').forEach(n=>n.oninput=()=>$('pay-total').textContent=`Total ingresado: ${money(sumPayments(ps()))}`);
   $('deliver').onclick=()=>{const pay=ps();if(!confirm(`¿Confirmar entrega de la orden ${o.numero} por ${money(o.presupuesto)}? Esta acción no se puede repetir.`))return;deliverOrder(o.id,pay,{nombre:$('retirante-nombre').value.trim(),dni:$('retirante-dni').value.trim()})};
 }
}
function showOrder(id){detailId=id;detailTab='general';showDrawer('Orden de trabajo','');renderDetail()}
async function updateOrder(partial){const id=detailId;await busy(async()=>{const r=doc(db,'ordenes',id);await runTransaction(db,async tx=>{const s=await tx.get(r);if(!s.exists())throw Error('La orden no existe.');if(s.data().estado==='Entregado')throw Error('No se pueden modificar órdenes entregadas.');if(partial.presupuesto!==undefined&&partial.presupuesto!==null&&(!Number.isFinite(partial.presupuesto)||partial.presupuesto<0))throw Error('Presupuesto inválido.');tx.update(r,{...partial,updatedAt:serverTimestamp(),updatedBy:user.email})});toast('Cambios guardados')})}
async function deliverOrder(id,pagos,retirante={}){await busy(async()=>{const orderRef=doc(db,'ordenes',id),movementRef=doc(db,'movimientos','retiro_'+id);await runTransaction(db,async tx=>{const orderS=await tx.get(orderRef);const cashS=await tx.get(refs.cash);const movementS=await tx.get(movementRef);if(movementS.exists())throw Error('Esta orden ya tiene un movimiento de cobro.');const order=orderS.exists()?orderS.data():null;const cajaAbierta=cashS.exists()&&cashS.data().open;const monto=validateDelivery(order,pagos,{openCash:cajaAbierta});if(monto>0){tx.set(movementRef,{cajaId:cashS.data().id,tipo:'ingreso',origen:'retiro_orden',ordenId:id,numeroOrden:order.numero,concepto:'Retiro de orden N.º '+order.numero,monto,pagos,usuario:user.email,createdAt:serverTimestamp()});}tx.update(orderRef,{estado:'Entregado',area:'Salida',entregadoAt:serverTimestamp(),responsableEntrega:user.email,entregadoA:String(retirante.nombre||'').slice(0,120),dniRetiro:normalizeDni(retirante.dni||''),deliveryId:id,pagosEntrega:pagos,movimientoCajaId:monto>0?movementRef.id:null});});toast('Equipo entregado. Ya podés imprimir la constancia de retiro.');detailId=id;renderDetail()})}
function listen(){unsubs.forEach(f=>f());unsubs=[];unsubs.push(onSnapshot(query(collection(db,'ordenes'),limit(1000)),s=>{orders=s.docs.map(d=>({id:d.id,...d.data()}));renderOrders();if(detailId)renderDetail()},err));unsubs.push(onSnapshot(query(collection(db,'clientes'),limit(1500)),s=>{clients=s.docs.map(d=>({id:d.id,...d.data()}));renderClients()},err));unsubs.push(onSnapshot(refs.cash,s=>{cash=s.exists()?s.data():null;renderCash()},err));unsubs.push(onSnapshot(query(collection(db,'movimientos'),limit(1500)),s=>{movements=s.docs.map(d=>({id:d.id,...d.data()}));renderCash()},err));unsubs.push(onSnapshot(query(collection(db,'catalogos'),limit(1500)),s=>{catalog=s.docs.map(d=>({id:d.id,...d.data()}));drawAccessoryOptions()},err));}
$('today').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
$('login-form').onsubmit=e=>{e.preventDefault();$('login-error').textContent='';signInWithEmailAndPassword(auth,$('login-email').value.trim(),$('login-pass').value).catch(e=>$('login-error').textContent='No se pudo ingresar. Verificá usuario, contraseña y Authentication.')};
onAuthStateChanged(auth,u=>{user=u;if(u){$('login').classList.add('hidden');$('app').classList.remove('hidden');$('user-name').textContent=u.email;$('user-dot').textContent=(u.email||'S')[0].toUpperCase();listen()}else{unsubs.forEach(f=>f());unsubs=[];orders=[];clients=[];movements=[];catalog=[];cash=null;$('login').classList.remove('hidden');$('app').classList.add('hidden');closeDrawer()}});
$('logout').onclick=()=>signOut(auth).catch(err);
document.querySelectorAll('.rail-nav').forEach(b=>b.onclick=()=>nav(b.dataset.page));document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{area=b.dataset.area;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));renderOrders()});
$('search-orders').oninput=renderOrders;$('search-orders').onkeydown=e=>{if(e.key!=='Enter')return;const v=$('search-orders').value.trim();const target=orders.find(o=>o.numero===v||o.numero===v.padStart(6,'0'));if(target){e.preventDefault();showOrder(target.id)}};$('filter-status').onchange=renderOrders;$('search-clients').oninput=renderClients;$('new-order').onclick=()=>{selectedClient=null;orderDraft=null;newOrder()};$('new-client-main').onclick=()=>newClient();$('drawer-close').onclick=closeDrawer;$('overlay').onclick=closeDrawer;$('refresh').onclick=()=>{renderOrders();toast('La lista se actualiza automáticamente desde Firebase')};$('open-cash').onclick=openCash;$('close-cash').onclick=closeCash;
$('cash-form').onsubmit=e=>{e.preventDefault();manualMovement({tipo:$('cash-type').value,concepto:$('cash-concept').value.trim(),monto:$('cash-value').value,metodo:$('cash-method').value}).then(ok=>{if(ok)$('cash-form').reset()})};$('sale-form').onsubmit=e=>{e.preventDefault();manualMovement({tipo:'ingreso',concepto:'Venta: '+$('sale-description').value.trim(),monto:$('sale-total').value,metodo:$('sale-method').value,origen:'venta_manual'}).then(ok=>{if(ok)$('sale-form').reset()})};
