// Utilidades puras: catálogo de opciones reutilizables para el taller.
export const DEFAULT_CATALOG={
  accesorio:['Control remoto','Base / pie','Cable de alimentación','Cable HDMI','Soporte','Caja','Tornillos'],
  falla:['No enciende','No da imagen','Tiene sonido pero no imagen','Sin sonido','Líneas en pantalla','Pantalla rota','Reinicia constantemente','No conecta a WiFi','Problema de backlight','Falla de fuente','Falla de placa main']
};
export function catalogKey(type,name){
  return String(type)+'_'+String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,125);
}
export function catalogOptions(type,stored=[],extras=[]){
  const found=new Map();
  for(const name of DEFAULT_CATALOG[type]||[]){
    found.set(catalogKey(type,name),{id:catalogKey(type,name),tipo:type,nombre:name,activo:true,esInicial:true});
  }
  for(const item of stored){
    if(item.tipo!==type||typeof item.nombre!=='string'||!item.nombre.trim())continue;
    const key=catalogKey(type,item.nombre);
    found.set(key,{...found.get(key),...item,id:item.id||key,tipo:type,nombre:item.nombre.trim(),activo:item.activo!==false,esInicial:(DEFAULT_CATALOG[type]||[]).some(x=>catalogKey(type,x)===key)});
  }
  if(type!=='accesorio'&&type!=='falla'){
    for(const item of extras){
      const name=String(item||'').trim();if(!name)continue;
      const key=catalogKey(type,name);
      if(!found.has(key))found.set(key,{id:key,tipo:type,nombre:name,activo:true,esInicial:false});
    }
  }
  return [...found.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
}
export function activeCatalogNames(type,stored=[],extras=[]){
  return catalogOptions(type,stored,extras).filter(x=>x.activo).map(x=>x.nombre);
}
