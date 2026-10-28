import {auth,db,firebaseConfig} from './firebase.js';
import {onAuthStateChanged,signInWithEmailAndPassword} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {collection,doc,getDocs,query,limit,runTransaction,serverTimestamp,Timestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {validateMigration,collisionCheck,originalDateToDate,MIGRATION_PROJECT} from './migration-validation.js';
const $=id=>document.getElementById(id);
let data=null,user=null,verified=false,running=false,existing={},plan=null;
const log=msg=>{const e=$('log');e.textContent+=`\n${new Date().toLocaleTimeString('es-AR')}  ${msg}`;e.scrollTop=e.scrollHeight};
const warn=msg=>{$('error').textContent=String(msg?.message||msg);$('error').classList.remove('hidden');log('ERROR: '+String(msg?.message||msg))};
const clearError=()=>{$('error').textContent='';$('error').classList.add('hidden')};
function updateReady(){ $('preflight').disabled=!user||!data||running;$('run').disabled=!verified||running||$('confirm-text').value.trim()!=='IMPORTAR';$('confirm-row').classList.toggle('hidden',!verified); }
function invalidate(){verified=false;plan=null;$('plan').classList.add('hidden');$('preflight-status').textContent='';$('confirm-text').value='';updateReady()}
onAuthStateChanged(auth,u=>{user=u;$('auth-status').textContent=u?'Conectado: '+u.email:'Sin iniciar sesión';$('auth-status').style.color=u?'green':'';$('login-form').classList.toggle('hidden',!!u);invalidate()});
$('login-form').onsubmit=async e=>{e.preventDefault();clearError();try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('password').value='';log('Sesión Firebase iniciada.')}catch(ex){warn('No se pudo iniciar sesión. Verificá las credenciales.')}};
$('file').onchange=async()=>{invalidate();clearError();data=null;const f=$('file').files?.[0];if(!f)return;try{
 if(f.size>8_000_000)throw Error('El archivo supera 8 MB.');
 const json=JSON.parse(await f.text());const n=validateMigration(json);
 if(firebaseConfig.projectId!==MIGRATION_PROJECT)throw Error('Este sistema está configurado para otro proyecto Firebase.');
 data=json;
 $('file-summary').innerHTML=`<div><b>${n.clientes}</b> clientes · <b>${n.equipos}</b> equipos · <b>${n.ordenes}</b> órdenes · <b>${n.catalogos}</b> marcas/modelos</div><p>${n.provisorios} clientes sin DNI, pendientes de identificar.</p><small>Lote: ${json.lote} · Fecha de corte: ${json.fechaCorte}</small>`;
 log('Archivo privado validado. '+n.ordenes+' órdenes tienen marca y modelo.');
 }catch(ex){$('file-summary').textContent='Error de archivo, elegí el JSON privado correcto.';warn(ex)}updateReady()};
$('confirm-text').oninput=updateReady;
async function scan(){const names=['clientes','equipos','ordenes','catalogos'];const out={};for(const name of names){
 const s=await getDocs(query(collection(db,name),limit(5000)));
 if(s.size===5000)throw Error('Hay 5000 o más registros en '+name+'; se necesita una revisión adicional antes de importar.');
 out[name]=new Map(s.docs.map(x=>[x.id,{id:x.id,...x.data()}]));log('Leídos '+s.size+' registros existentes en '+name+'.');
 }return out;}
$('preflight').onclick=async()=>{if(running)return;clearError();invalidate();running=true;updateReady();try{
 log('Verificando Firestore…');existing=await scan();
 const conflicts=collisionCheck(data,[...existing.ordenes.values()]);
 if(conflicts.length)throw Error(`Hay ${conflicts.length} números de orden ya utilizados con otro identificador (${conflicts.slice(0,5).map(x=>x.numero).join(', ')}). No se importará nada. Revisá esos registros antes de continuar.`);
 for(const name of ['equipos','ordenes'])for(const x of data[name]){
  const y=existing[name].get(x.id);
  if(y&&(y.migracionId!==data.lote || (name==='ordenes'&&y.numero!==x.numero)))throw Error('Conflicto de identificador existente en '+name+': '+x.id);
 }
 for(const c of data.clientes){const y=existing.clientes.get(c.id);if(y&&y.dni!==c.dni)throw Error('Identificador de cliente ya usado con otro DNI: '+c.id)}
 plan=Object.fromEntries(['clientes','equipos','catalogos','ordenes'].map(name=>[name,data[name].filter(x=>!existing[name].has(x.id)).length]));
 $('plan').innerHTML=`<b>Importación segura</b><ul>${Object.entries(plan).map(([k,v])=>`<li>${k}: ${v} registros nuevos (${data[k].length-v} existentes se respetan)</li>`).join('')}</ul><p>El contador de órdenes se elevará como mínimo a ${data.maxOrden}. Los clientes y órdenes que ya existen no se sobrescribirán.</p><p><b>No se importará ningún cobro:</b> las columnas TOTAL y ADELANTO de este informe son $0,00 y no equivalen a presupuestos aprobados.</p>`;
 $('plan').classList.remove('hidden');verified=true;$('preflight-status').textContent='Verificación exitosa; podés importar.';log('Verificación exitosa.');
 }catch(ex){warn(ex);$('preflight-status').textContent='Verificación fallida.'}finally{running=false;updateReady()}};
const progress=(done,total,label)=>{$('progress').value=Math.round(100*done/Math.max(total,1));$('progress-label').textContent=`${label} · ${done} de ${total}`};
const CHUNK=70;
function payloadFor(name,r){const {id,...rest}=r;
 if(name==='clientes')return {...rest,createdAt:serverTimestamp(),migracionId:data.lote};
 if(name==='equipos')return {...rest,createdAt:serverTimestamp()};
 if(name==='catalogos')return {...rest,updatedAt:serverTimestamp(),updatedBy:user.email};
 if(name==='ordenes')return {...rest,estado:'Sin estado',migracionEnProceso:r.estado!=='Sin estado',createdAt:Timestamp.fromDate(originalDateToDate(r.fechaIngresoOriginal)),importadoAt:serverTimestamp()};
 throw Error('Grupo inválido');}
async function importGroup(name,rows,after){
 for(let i=0;i<rows.length;i+=CHUNK){
  const batch=rows.slice(i,i+CHUNK);
  const refs=batch.map(r=>doc(db,name,r.id));
  const created=await runTransaction(db,async tx=>{
   const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
   let made=0;
   for(let j=0;j<batch.length;j++){
    if(snaps[j].exists()){
      if((name==='ordenes'||name==='equipos')&&snaps[j].data().migracionId!==data.lote)throw Error('Identificador ocupado: '+batch[j].id);
      continue;
    }
    tx.set(refs[j],payloadFor(name,batch[j]));made++;
   }
   return made;
  },{maxAttempts:4});
  after(batch.length,created);log(`${name}: lote ${Math.floor(i/CHUNK)+1}, ${created} nuevos, ${batch.length-created} ya existentes.`)
 }
}
async function restoreStatuses(rows,after){
 const nonDefault=rows.filter(r=>r.estado!=='Sin estado');
 for(let i=0;i<nonDefault.length;i+=CHUNK){
  const batch=nonDefault.slice(i,i+CHUNK),refs=batch.map(r=>doc(db,'ordenes',r.id));
  await runTransaction(db,async tx=>{
   const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
   for(let j=0;j<batch.length;j++){
    const cur=snaps[j].data(),r=batch[j];
    if(!cur||cur.migracionId!==data.lote)throw Error('Orden no importada: '+r.numero);
    if(!cur.migracionEnProceso)continue; // Respetar estados que se hayan editado después de importar.
    if(cur.estado!=='Sin estado'){
     tx.update(refs[j],{migracionEnProceso:false});continue;
    }
    tx.update(refs[j],{estado:r.estado,migracionEnProceso:false,updatedBy:user.email,updatedAt:serverTimestamp()});
   }
  },{maxAttempts:4});
  after(batch.length);log(`Estados restaurados: ${Math.min(i+CHUNK,nonDefault.length)} de ${nonDefault.length}.`)
 }
}
$('run').onclick=async()=>{if(!verified||running||!data||$('confirm-text').value!=='IMPORTAR')return;
 if(!confirm(`¿Importar ${data.clientes.length} clientes, ${data.ordenes.length} órdenes, ${data.equipos.length} equipos y sus marcas/modelos en ${MIGRATION_PROJECT}? Los datos existentes no se reemplazarán.`))return;
 running=true;updateReady();clearError();$('success').classList.add('hidden');$('run').disabled=true;
 const orderStates=data.ordenes.filter(r=>r.estado!=='Sin estado').length;
 const total=data.clientes.length+data.equipos.length+data.catalogos.length+data.ordenes.length+orderStates+1;
 let count=0;
 const inc=(n,created)=>{count+=n;progress(count,total,'Importando');};
 try{
  // Reservar la numeración primero para que las órdenes nuevas nunca repitan una anterior.
  const cr=doc(db,'config','contadores');await runTransaction(db,async tx=>{
   const s=await tx.get(cr);tx.set(cr,{ordenes:Math.max(Number(s.exists()?s.data().ordenes||0:0),data.maxOrden)},{merge:true})
  });inc(1);log('Contador de órdenes protegido (al menos '+data.maxOrden+').');
  for(const group of ['clientes','equipos','catalogos','ordenes']){
   log('Iniciando '+group+'…');await importGroup(group,data[group],inc)
  }
  await restoreStatuses(data.ordenes,inc);
  progress(total,total,'Importación completa');$('success').textContent=`Importación finalizada. Ordenes: ${data.ordenes.length} · Clientes disponibles: ${data.clientes.length} · Marcas/modelos de cada equipo cargados. Volvé al Taller y verificá las órdenes.`;$('success').classList.remove('hidden');log('FINALIZADO. Podés cerrar esta pantalla y volver a SYX.');verified=false;
 }catch(ex){warn(ex);log('Podés volver a ejecutar Verificar en Firebase y retomar. No se borran registros.');verified=false}
 finally{running=false;updateReady()}
};
