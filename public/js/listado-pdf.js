/** SYX V8 - exportación real a PDF A4 horizontal, sin dependencias externas. */
export const PDF_AREAS = ['Entrada','Reparación','Salida'];
export function selectOpenOrders(rows,{scope='todas',area='Todas',status='',search=''}={}){
 const term=String(search).trim().toLocaleLowerCase('es-AR');
 return rows.filter(o=>o.estado!=='Entregado'
   && (scope!=='area'||(area!=='Todas'&&o.area===area))
   && (scope!=='filtros'||((area==='Todas'||o.area===area)
      && (!status||o.estado===status)
      && (!term||[o.numero,o.nombreCliente,o.dniCliente,o.modelo,o.marca,o.responsable,o.serie,o.falla].join(' ').toLocaleLowerCase('es-AR').includes(term)))));
}
export function groupOrders(rows){
 const groups=PDF_AREAS.map(area=>({name:area,rows:rows.filter(o=>o.area===area).sort((a,b)=>Number(a.numero||0)-Number(b.numero||0))}));
 const others=rows.filter(o=>!PDF_AREAS.includes(o.area));
 if(others.length)groups.push({name:'Sin área',rows:others.sort((a,b)=>Number(a.numero||0)-Number(b.numero||0))});
 return groups.filter(x=>x.rows.length);
}
const WIDTH=841.89,HEIGHT=595.28,M=25.5,INNER=WIDTH-M*2;
const HEADS=['N.º','FECHA','PRIOR.','ESTADO','SERIE','MARCA','MODELO','CLIENTE','RESPONSABLE','PRESUP.'];
const COLS=[39,60,44,88,65,67,92,144,113,0];COLS[9]=INNER-COLS.slice(0,9).reduce((a,b)=>a+b,0);
const colors={ink:'0.13 0.13 0.15',shade:'0.92 0.92 0.92',line:'0.60 0.60 0.60'};
const esc=s=>{
 const replacements={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};
 return [...String(s??'')].map(c=>{let n=c.charCodeAt(0);if(n<32&&n!==9)return ' ';if(n>255)n=replacements[c]??63;if(n>255)n=63;if(n===40||n===41||n===92)return '\\'+String.fromCharCode(n);if(n>126)return '\\'+n.toString(8).padStart(3,'0');return String.fromCharCode(n)}).join('');
};
const num=n=>Number(n).toFixed(2);
const dateValue=v=>{if(typeof v?.toDate==='function')return v.toDate();if(v instanceof Date)return v;if(v&&typeof v.seconds==='number')return new Date(v.seconds*1000);if(typeof v==='number')return new Date(v);if(typeof v==='string'&&v.trim())return new Date(v);return null};
const dateShort=v=>{const d=dateValue(v);return d&&!Number.isNaN(d.getTime())?d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Argentina/Buenos_Aires'}):'—'};
const budget=n=>n===null||n===undefined||n===''?'—':new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n)||0);
const clean=s=>String(s??'').replace(/\s+/g,' ').trim()||'—';
function breakWord(word,maxUnits){if(word.length<=maxUnits)return [word];const chunks=[];let current='';for(const ch of word){if(current.length>=maxUnits){chunks.push(current);current=''}current+=ch}if(current)chunks.push(current);return chunks}
export function wrapPDFText(str,maxWidth,fontSize=7){
 const max=Math.max(2,Math.floor(maxWidth/(fontSize*.53)));let rows=[],current='';
 for(const word of clean(str).split(/\s+/).flatMap(w=>breakWord(w,max))){if(!current)current=word;else if(current.length+1+word.length<=max)current+=' '+word;else{rows.push(current);current=word}}
 if(current)rows.push(current);return rows.length?rows:['—'];
}
function pdfWriter(){
 const pages=[];let now=null;
 const add=()=>{now={ops:[]};pages.push(now);return now};
 const op=s=>now.ops.push(s);
 const rect=(x,y,w,h,{fill=null,line=true}={})=>{if(fill)op(`${fill} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);if(line)op(`${colors.line} RG 0.35 w ${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`)};
 const text=(s,x,y,size=8,bold=false)=>op(`BT /${bold?'F2':'F1'} ${num(size)} Tf ${colors.ink} rg 1 0 0 1 ${num(x)} ${num(y)} Tm (${esc(s)}) Tj ET`);
 const line=(x,y,x2,y2)=>op(`${colors.line} RG 0.35 w ${num(x)} ${num(y)} m ${num(x2)} ${num(y2)} l S`);
 const out=()=>{
  const nodes=[''];const store=x=>{nodes.push(x);return nodes.length-1};
  const catalog=store(''),rootPages=store('');const font=store('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),fontBold=store('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const refs=[];
  pages.forEach(p=>{const content=p.ops.join('\n')+'\n';const stream=store(`<< /Length ${content.length} >>\nstream\n${content}endstream`);const page=store(`<< /Type /Page /Parent ${rootPages} 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${stream} 0 R >>`);refs.push(page)});
  nodes[rootPages]=`<< /Type /Pages /Count ${refs.length} /Kids [${refs.map(i=>i+' 0 R').join(' ')}] >>`;
  nodes[catalog]=`<< /Type /Catalog /Pages ${rootPages} 0 R >>`;
  let pdf='%PDF-1.4\n',offsets=[0];for(let i=1;i<nodes.length;i++){offsets.push(pdf.length);pdf+=`${i} 0 obj\n${nodes[i]}\nendobj\n`}
  const xref=pdf.length;pdf+=`xref\n0 ${nodes.length}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${nodes.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
 };
 return {pages,add,rect,text,line,out};
}
export function generateOrdersPdf(rows,{printedAt=new Date(),title='LISTA DE ÓRDENES',scopeLabel='Todas las órdenes abiertas'}={}){
 const data=rows.filter(o=>o.estado!=='Entregado');const groups=groupOrders(data),w=pdfWriter();let y=0;
 const top=()=>{
  w.add();w.text('SYX',M,HEIGHT-47,26,true);w.text('DONDE LA TECNOLOGÍA VUELVE A NACER',M,HEIGHT-61,7);
  w.text(title,WIDTH-177,HEIGHT-41,13,true);w.text('Fecha impresión: '+printedAt.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false}),WIDTH-177,HEIGHT-55,7.5);
  w.line(M,HEIGHT-70,WIDTH-M,HEIGHT-70);w.text(scopeLabel,M,HEIGHT-84,8);
  w.text(`TOTAL: ${data.length} órdenes`,WIDTH-155,HEIGHT-84,8,true);y=HEIGHT-100;
 };
 const tableHeads=()=>{let x=M;for(let j=0;j<HEADS.length;j++){w.rect(x,y-16,COLS[j],16,{fill:colors.shade});w.text(HEADS[j],x+3,y-11,6.45,true);x+=COLS[j]}y-=16};
 const areaHeading=(group,continued=false)=>{if(y<100)top();w.rect(M,y-19,INNER,19,{fill:'0.86 0.86 0.86'});w.text(`ÁREA: ${group.name.toLocaleUpperCase('es-AR')} (${group.rows.length})${continued?' · CONTINUACIÓN':''}`,M+7,y-13,8.3,true);y-=19;tableHeads()};
 const cellValues=o=>[o.numero,dateShort(o.createdAt||o.fechaIngreso||o.fecha),o.prioridad||'Normal',o.estado||'Sin estado',o.serie||'Genérico',o.marca,o.modelo,o.nombreCliente,o.responsable,budget(o.presupuesto)];
 top();for(const group of groups){
  if(y<115)top();areaHeading(group);
  for(const o of group.rows){const vals=cellValues(o),wrapped=vals.map((v,i)=>wrapPDFText(v,COLS[i]-7,i===7?6.4:6.3));const rowsTall=Math.max(...wrapped.map(lines=>lines.length));const h=Math.max(10,rowsTall*7.0+3);
   if(y-h<43){top();areaHeading(group,true)}
   let x=M;for(let j=0;j<vals.length;j++){w.rect(x,y-h,COLS[j],h,{line:true});wrapped[j].forEach((line,i)=>w.text(line,x+3,y-7.3-i*6.95,j===0?6.8:6.3,j===0));x+=COLS[j]}
   y-=h;
  }y-=16;
 }
 if(!groups.length){w.text('No existen órdenes abiertas para los filtros seleccionados.',M,y-23,11)}
 const totalPages=w.pages.length;w.pages.forEach((p,i)=>{const save=p; // pie repetido sobre cada página
  const text=(s,x,yy,size=7)=>p.ops.push(`BT /F1 ${num(size)} Tf ${colors.ink} rg 1 0 0 1 ${num(x)} ${num(yy)} Tm (${esc(s)}) Tj ET`);
  p.ops.push(`${colors.line} RG 0.45 w ${num(M)} 30 m ${num(WIDTH-M)} 30 l S`);
  text('SYX · Documento interno y confidencial. Contiene datos de clientes; no distribuir.',M,19,7);
  text(`Página ${i+1} / ${totalPages}`,WIDTH-88,19,7);
 });
 return w.out();
}
export function downloadOrdersPdf(rows,opts={}){
 const bytes=generateOrdersPdf(rows,opts);const blob=new Blob([bytes],{type:'application/pdf'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`SYX_Listado_Ordenes_${new Date().toISOString().slice(0,10)}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return bytes.length;
}
