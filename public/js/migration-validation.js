// Comprobaciones puras del archivo privado, sin Firebase ni acceso a red.
export const MIGRATION_PROJECT='ordenes-trabajo-a8499';
export const MIGRATION_FORMAT='syx-migracion-gestioo';
const unique=items=>new Set(items).size===items.length;
export function validateMigration(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Elegí un JSON de migración válido.');
 if(data.formato!==MIGRATION_FORMAT||data.version!==1||data.firebaseProject!==MIGRATION_PROJECT)throw Error('El archivo no corresponde al formato y proyecto Firebase esperados.');
 for(const k of ['clientes','equipos','ordenes','catalogos'])if(!Array.isArray(data[k]))throw Error('Falta la sección '+k);
 if(data.clientes.length<1||data.ordenes.length<1)throw Error('El archivo no contiene los clientes y órdenes.');
 for(const group of ['clientes','equipos','ordenes','catalogos']){
  const ids=data[group].map(x=>x?.id);
  if(ids.some(x=>typeof x!=='string'||!x.trim()||x.includes('/'))||!unique(ids))throw Error('IDs faltantes o duplicados en '+group);
 }
 const clients=new Set(data.clientes.map(c=>c.id)),eqs=new Map(data.equipos.map(e=>[e.id,e]));
 const nums=data.ordenes.map(o=>o.numero);
 if(!unique(nums)||nums.some(x=>typeof x!=='string'||!/^[0-9]{6}$/.test(x)))throw Error('Números de orden duplicados o inválidos.');
 for(const c of data.clientes){
  if(typeof c.nombre!=='string'||!c.nombre.trim()||typeof c.dni!=='string')throw Error('Datos de cliente incompletos: '+c.id);
  if(c.dni && c.id!==c.dni)throw Error('El identificador no coincide con DNI: '+c.id);
  if(!c.dni&&(!c.id.startsWith('sin-dni_')||c.importadoSinDni!==true))throw Error('Cliente sin DNI no marcado correctamente: '+c.id);
 }
 for(const o of data.ordenes){
  if(!clients.has(o.clienteId)||!eqs.has(o.equipoId)||eqs.get(o.equipoId).clienteId!==o.clienteId)throw Error('Orden sin vínculo correcto de cliente/equipo: '+o.numero);
  if(!o.marca?.trim()||!o.modelo?.trim()||!o.area?.trim()||!o.estado?.trim())throw Error('Marca, modelo, área o estado faltante en orden '+o.numero);
  if(o.presupuesto!==null)throw Error('No se importan presupuestos desde este informe: '+o.numero);
  if(o.id!=='gestioo_'+o.numero)throw Error('Identificador de orden incorrecto: '+o.numero);
  if(!/^\d\d\/\d\d\/20\d\d$/.test(o.fechaIngresoOriginal))throw Error('Fecha no válida en orden '+o.numero);
 }
 if(data.maxOrden!==Math.max(...nums.map(Number)))throw Error('Contador de órdenes inconsistente.');
 for(const c of data.catalogos)if(!['marca','modelo'].includes(c.tipo)||!c.nombre?.trim()||c.nombre.length>90)throw Error('Catálogo inválido: '+c.id);
 return {clientes:data.clientes.length,equipos:data.equipos.length,ordenes:data.ordenes.length,catalogos:data.catalogos.length,provisorios:data.clientes.filter(c=>c.importadoSinDni).length};
}
export function originalDateToDate(original){
 const [d,m,y]=original.split('/').map(Number);
 const dt=new Date(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T12:00:00-03:00`);
 if(Number.isNaN(dt.getTime())||dt.toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'})!==`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`)throw Error('Fecha histórica incorrecta: '+original);
 return dt;
}
export function collisionCheck(data,existingOrders){
 const byNum=new Map();
 for(const x of existingOrders){
  if(x.numero){if(byNum.has(x.numero)&&byNum.get(x.numero)!==x.id)throw Error('La base ya tiene duplicado el número '+x.numero);byNum.set(x.numero,x.id)}
 }
 const conflicts=[];
 for(const order of data.ordenes){
  const existing=byNum.get(order.numero);
  if(existing&&existing!==order.id)conflicts.push({numero:order.numero,existente:existing});
 }
 return conflicts;
}
