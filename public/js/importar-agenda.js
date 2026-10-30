import {auth, db, firebaseConfig} from './firebase.js';
import {signInWithEmailAndPassword,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {collection,doc, getDocs,runTransaction,limit,query,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {normalizeClient,planClientImport,parseCSV,normDni,normName} from './agenda-import-utils.js';
const PROJECT='ordenes-trabajo-a8499';
const $=id=>document.getElementById(id);
let user=null,contacts=null,verified=false,running=false,plan=null;
const showError=msg=>{$('error').textContent=String(msg?.message||msg);$('error').classList.remove('hidden');addLog('Error: '+String(msg?.message||msg))};
const addLog=msg=>{$('log').textContent+=`\n${new Date().toLocaleTimeString('es-AR')} · ${msg}`;$('log').scrollTop=$('log').scrollHeight};
const hideError=()=>{$('error').classList.add('hidden');$('error').textContent=''};
function ready(){ $('verify').disabled=!(user&&contacts)&&!running; $('verify').disabled=!user||!contacts||running;$('import').disabled=!verified||running||$('confirmation').value.trim()!=='IMPORTAR'; }
function reset(){verified=false;plan=null;$('preview').classList.add('hidden');$('confirmation').value='';$('verification-status').textContent='Pendiente de verificar';ready()}
if(firebaseConfig.projectId!==PROJECT){showError('El código apunta a otro Firebase. Se anuló la importación.');$('verify').disabled=true;throw Error('Firebase distinto al permitido.');}
onAuthStateChanged(auth,u=>{user=u;$('auth-form').classList.toggle('hidden',!!u);$('auth-status').textContent=u?'Autenticado: '+u.email:'Sin iniciar sesión';reset()});
$('auth-form').onsubmit=async e=>{e.preventDefault();hideError();try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('password').value='';addLog('Acceso autorizado.')}catch(_){showError('No se pudo iniciar sesión. Verificá correo y contraseña.') }};
$('file').onchange=async()=>{contacts=null;reset();hideError();const file=$('file').files?.[0];if(!file)return;try{
 if(file.size>12_000_000)throw Error('El archivo supera el límite de 12 MB.');
 const raw=await file.text();let data;
 if(/\.csv$/i.test(file.name))data=parseCSV(raw);
 else if(/\.json$/i.test(file.name)){
  const j=JSON.parse(raw);
  if(j.firebaseProject&&j.firebaseProject!==PROJECT)throw Error('El archivo JSON pertenece a otro Firebase.');
  if(j.formato!=='syx-agenda-contactos-v1')throw Error('Se requiere un archivo de agenda SYX; este JSON no corresponde.');
  data=j.clientes;
 }else throw Error('Formato incorrecto: elegí el JSON preparado o un CSV de contactos.');
 if(!Array.isArray(data)||data.length<1||data.length>4999)throw Error('El archivo debe contener entre 1 y 4.999 contactos.');
 contacts=data;$('file-status').textContent=`${data.length} contactos preparados. Todavía no se escribió nada en Firebase.`;addLog('Archivo leído en el navegador: '+data.length+' contactos.');
 }catch(e){$('file-status').textContent='No se pudo leer el archivo.';showError(e)}ready()};
$('confirmation').oninput=ready;
// Consulta completa con límite de protección para impedir comparaciones incompletas.
async function scanClients(){const result=await getDocs(query(collection(db,'clientes'),limit(5000)));if(result.size===5000)throw Error('Se alcanzó el límite de 5000 clientes. Suspendé la importación para revisar la base.');return result.docs.map(d=>({id:d.id,...d.data()}));}
$('verify').onclick=async()=>{if(running)return;running=true;reset();hideError();ready();try{
  addLog('Consultando DNI existentes en Firestore...');const existing=await scanClients();
  plan=planClientImport(contacts,existing);
  $('stat-all').textContent=contacts.length;
  $('stat-exists').textContent=plan.existing.length;
  $('stat-new').textContent=plan.newClients.length;
  $('stat-review').textContent=plan.provisional.length+plan.review.length+plan.invalid.length;
  $('preview-msg').innerHTML=`<p><b>${plan.existing.length}</b> contactos ya existen: no se tocarán. <b>${plan.newClients.length}</b> nuevos pueden agregarse. <b>${plan.provisional.length}</b> coinciden con fichas antiguas sin DNI y necesitan aprobación individual.</p>`;
  $('provisional-area').classList.toggle('hidden',!plan.provisional.length);
  $('provisional-body').replaceChildren();
  for(let i=0;i<plan.provisional.length;i++){
   const c=plan.provisional[i],tr=document.createElement('tr');
   const opt=document.createElement('td'),lab=document.createElement('label'),ck=document.createElement('input');ck.type='checkbox';ck.dataset.linkIndex=String(i);ck.id=`link-${i}`;lab.append(ck,document.createTextNode('Confirmo'));opt.append(lab);
   const a=document.createElement('td');a.textContent=`${c.nombre} · DNI ${c.dni}`;
   const b=document.createElement('td');b.textContent=String(c.original?.nombre||'');
   const d=document.createElement('td');d.textContent=`Excel: ${c.telefono||'—'} / Anterior: ${c.original?.telefono||'—'}`;
   tr.append(opt,a,b,d);$('provisional-body').append(tr);
  }
  const pending=[...plan.review.map(x=>x.reason),...plan.invalid.map(x=>x.reason)];
  $('review-area').classList.toggle('hidden',!pending.length);
  if(pending.length)$('review-area').textContent=`${pending.length} registros necesitan revisión y no se importarán automáticamente. Motivos: ${[...new Set(pending)].join('; ')}.`;
  $('preview').classList.remove('hidden');verified=true;
  $('verification-status').textContent=`Verificado: ${existing.length} clientes encontrados en Firebase. Sin modificaciones.`;
  addLog('Previsualización completada: '+plan.existing.length+' existentes, '+plan.newClients.length+' nuevos, '+plan.provisional.length+' provisorios.');
 }catch(ex){showError(ex);$('verification-status').textContent='Verificación fallida.'}finally{running=false;ready()}};
function progress(done,total){$('progress').value=Math.round(100*done/Math.max(1,total));$('progress-text').textContent=`${done} de ${total} operaciones revisadas`}
// Cada lote lee todos los documentos antes de escribir: reimportar no pisa datos nuevos.
async function createNew(group){let created=0,skipped=0;const CHUNK=60;
 for(let i=0;i<group.length;i+=CHUNK){const part=group.slice(i,i+CHUNK),refs=part.map(c=>doc(db,'clientes',c.dni));
  const count=await runTransaction(db,async tx=>{
   const snapshots=await Promise.all(refs.map(r=>tx.get(r)));let n=0;
   for(let j=0;j<part.length;j++){
    const snap=snapshots[j],c=part[j];
    if(snap.exists()){
     if(normDni(snap.data().dni)!==c.dni)throw Error('Conflicto con un identificador existente: se detuvo el proceso.');
     continue;
    }
    tx.set(refs[j],{dni:c.dni,nombre:c.nombre,telefono:c.telefono,correo:c.correo,direccion:c.direccion,origen:'agenda-gestioo-2026-10-30',createdAt:serverTimestamp()});n++;
   }
   return n;
  },{maxAttempts:4});created+=count;skipped+=part.length-count;progress(Math.min(i+CHUNK,group.length),group.length);addLog(`Lote ${Math.floor(i/CHUNK)+1}: ${count} nuevos, ${part.length-count} ya existentes.`);
 }
 return {created,skipped};
}
async function linkProvisional(c){return runTransaction(db,async tx=>{
 const oldRef=doc(db,'clientes',c.existingId),dniRef=doc(db,'clientes',c.dni);
 const [old,canon]=await Promise.all([tx.get(oldRef),tx.get(dniRef)]);
 if(!old.exists())throw Error('Ya no existe la ficha provisional: '+c.nombre);
 const oldData=old.data();
 if(canon.exists()){
  if(normDni(canon.data().dni)===c.dni)return false;
  throw Error('El documento del DNI tiene otro titular; revisar manualmente.');
 }
 if(normDni(oldData.dni)===c.dni)return false; // vinculación ya aplicada
 if(normDni(oldData.dni))throw Error('La ficha provisional ya tiene otro DNI. No se modifica.');
 if(normName(oldData.nombre)!==normName(c.nombre) && normName(oldData.nombre)!==normName(c.nombres+' '+c.apellido))throw Error('El nombre de la ficha provisional cambió. Revisá antes de continuar.');
 tx.update(oldRef,{dni:c.dni,importadoSinDni:false,telefono:oldData.telefono||c.telefono,correo:oldData.correo||c.correo,direccion:oldData.direccion||c.direccion,dniVinculadoPor:user.email,dniVinculadoAt:serverTimestamp()});
 return true;
 },{maxAttempts:4});}
$('import').onclick=async()=>{if(running||!verified||!plan||$('confirmation').value.trim()!=='IMPORTAR')return;
 const selected=plan.provisional.filter((_,i)=>$('provisional-body').querySelector(`#link-${i}`)?.checked);
 if(!confirm(`¿Agregar ${plan.newClients.length} clientes nuevos y completar DNI en ${selected.length} fichas provisionales? Los ${plan.existing.length} ya registrados permanecerán intactos.`))return;
 running=true;ready();hideError();$('done').classList.add('hidden');let added=0,linked=0;
 try{
  const res=await createNew(plan.newClients);added=res.created;
  for(const c of selected){const ok=await linkProvisional(c);if(ok)linked++;addLog(`${ok?'Vinculado':'Ya vinculado'}: cliente provisional verificado.`)}
  $('done').textContent=`Carga finalizada. Se agregaron ${added} clientes nuevos, se completaron ${linked} fichas provisionales y se respetaron ${plan.existing.length} registros que ya existían. Las fichas sin confirmar siguen intactas. Ningún cliente ni orden anterior fue borrado.`;
  $('done').classList.remove('hidden');addLog('Importación terminada correctamente.');verified=false;
 }catch(ex){showError(ex);addLog('Podés verificar de nuevo y retomar: los documentos ya existentes no se sobrescriben.');verified=false}
 finally{running=false;ready()}
};
