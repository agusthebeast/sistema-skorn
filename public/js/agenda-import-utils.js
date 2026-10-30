// Rutinas puras: no leen ni envían datos a servicios externos.
export const normDni = (value) => String(value ?? '').replace(/\D/g, '');
export const normName = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const normPhone = (value) => String(value ?? '').replace(/\D/g, '');
export const properText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
export const normalizeClient = (input) => {
  const dni = normDni(input.dni ?? input.DNI);
  const apellido = properText(input.apellido ?? input.Apellido);
  const nombres = properText(input.nombres ?? input.Nombre);
  const nombre = properText(input.nombreCompleto ?? (apellido || nombres ? `${apellido} ${nombres}` : input.nombre));
  return {
    dni, nombre, apellido, nombres, telefono: properText(input.telefono ?? input['Teléfono'] ?? ''),
    correo: properText(input.correo ?? input.Correo ?? ''),
    direccion: properText(input.direccion ?? input['Dirección'] ?? ''),
    tipo: properText(input.tipo ?? input.Tipo ?? 'PERSONA')
  };
};
export const validClient = c => /^[0-9]{6,11}$/.test(c.dni) && c.nombre.length > 1 && c.nombre.length <= 180;

// Nunca fusionar solo por nombre: podría tratarse de otra persona.
// La vinculación de un registro sin DNI requiere confirmación explícita.
export function planClientImport(incoming, existing){
  const byDni = new Map(), withoutDniByName = new Map(), byId = new Map();
  for(const c of existing){
    const id=String(c.id||''); byId.set(id,c);
    const dni=normDni(c.dni), n=normName(c.nombre);
    if(dni){if(!byDni.has(dni))byDni.set(dni,[]);byDni.get(dni).push(c)}
    else if(n){if(!withoutDniByName.has(n))withoutDniByName.set(n,[]);withoutDniByName.get(n).push(c)}
  }
  const used=new Set(), result={newClients:[],existing:[],provisional:[],review:[],invalid:[]};
  for(const raw of incoming){
    const c=normalizeClient(raw);
    if(!validClient(c)){result.invalid.push({...c,reason:'DNI o nombre inválidos'});continue}
    if(used.has(c.dni)){result.invalid.push({...c,reason:'DNI repetido dentro del archivo'});continue}
    used.add(c.dni);
    const matches=byDni.get(c.dni)||[];
    if(matches.length>1){result.review.push({...c,reason:'Varios registros existentes con el mismo DNI'});continue}
    if(matches.length===1){result.existing.push({...c,existingId:matches[0].id});continue}
    if(byId.has(c.dni)){result.review.push({...c,reason:'Identificador de documento ocupado por otro cliente'});continue}
    // Provisionales: se crearon sin DNI a partir de órdenes anteriores.
    const candidateNames=[normName(c.nombre)];
    const reversedName=properText(raw.nombres ?? raw.Nombre) + ' ' + properText(raw.apellido ?? raw.Apellido);
    const rev=normName(reversedName);
    if(rev && !candidateNames.includes(rev))candidateNames.push(rev);
    const provisional=[...new Map(candidateNames.flatMap(name=>withoutDniByName.get(name)||[]).map(x=>[x.id,x])).values()];
    if(provisional.length===1){result.provisional.push({...c,existingId:provisional[0].id,original:provisional[0]});continue}
    if(provisional.length>1){result.review.push({...c,reason:'Más de un cliente provisional con el mismo nombre'});continue}
    result.newClients.push(c);
  }
  return result;
}

// CSV compatible con Excel español: soporta comillas, separadores y saltos de línea.
export function parseCSV(text){
  let raw=String(text??'').replace(/^\uFEFF/,'');
  const first=raw.split(/\r?\n/,1)[0];
  const delim=(first.match(/;/g)||[]).length > (first.match(/,/g)||[]).length ? ';' : ',';
  let row=[],rows=[],field='',quotes=false;
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(ch==='"'){
      if(quotes&&raw[i+1]==='"'){field+='"';i++}else quotes=!quotes;
    }else if(ch===delim&&!quotes){row.push(field);field=''}
    else if((ch==='\n'||ch==='\r')&&!quotes){if(ch==='\r'&&raw[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field=''}
    else field+=ch;
  }
  if(quotes)throw Error('El CSV tiene comillas sin cerrar.');
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2)throw Error('No se encontraron clientes en el CSV.');
  const headers=rows.shift().map(x=>x.trim());
  return rows.map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]||''])));
}
