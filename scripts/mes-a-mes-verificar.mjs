/**
 * VERIFICADOR de la solapa MES A MES. Solo lectura.
 * Recalcula en JS, desde cero, todo lo que la solapa muestra con fórmulas, y compara.
 * Además chequea fila por fila que la columna "Período" de FACTURACION, PROYECTOS y
 * Pagos_Staff diga lo mismo que el cálculo independiente.
 *
 * Correr cada vez que se toque la solapa, las fórmulas, o antes de mostrarle los
 * números a alguien de afuera.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ANIO=2026
const txt=v=>String(v??'').trim()
const n_=v=>typeof v==='number'?v:(()=>{const s=txt(v).replace(/[\s$]/g,'');return s?Number(s.replace(/,/g,''))||0:0})()
const M=v=>'$'+Math.round(v).toLocaleString('es-AR')
const pad=(s,w)=>String(s).padStart(w), padr=(s,w)=>String(s).padEnd(w)
const anioDe=s=>new Date(Date.UTC(1899,11,30)+s*864e5).getUTCFullYear()
const mesDe =s=>new Date(Date.UTC(1899,11,30)+s*864e5).getUTCMonth()+1
const per=(a,m)=>`${a}-${String(m).padStart(2,'0')}`

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['MES A MES!A1:P17','FACTURACION!A1:AH400','Pagos_Staff!A1:Z1500','PROYECTOS!A1:EU1300'],
  valueRenderOption:'UNFORMATTED_VALUE'})
const [MM,FAC,PS,PRO]=R.data.valueRanges.map(v=>v.values||[])

const evAnio={}
for(const r of PRO.slice(1)){ const nro=r[2], fe=r[3]; if(nro!==''&&nro!=null&&typeof fe==='number'&&fe>1000) evAnio[String(nro)]=anioDe(fe) }

const calc={}
const bump=(p,k,v)=>{ if(!p)return; calc[p]=calc[p]||{nFac:0,neto:0,iva:0,fin:0,cobrado:0,prod:0,free:0,socios:0,viat:0,pagado:0}; calc[p][k]+=v }
const facJS=[], proJS=[], psJS=[]

for(const [i,r] of FAC.slice(1).entries()){
  const ev=r[6], em=r[15], neto=n_(r[10]), cob=r[4]===true
  const base = typeof em==='number'&&em>1000 ? em : (typeof ev==='number'&&ev>1000 ? ev : null)
  const p = base ? per(anioDe(base),mesDe(base)) : ''
  facJS[i]=p; if(!p) continue
  if(neto>0) bump(p,'nFac',1)
  bump(p,'neto',neto); bump(p,'iva',n_(r[11])); bump(p,'fin',n_(r[12]))
  if(cob) bump(p,'cobrado',neto)
}
for(const [i,r] of PRO.slice(1).entries()){
  const fe=r[3]
  const p = typeof fe==='number'&&fe>1000 ? per(anioDe(fe),mesDe(fe)) : ''
  proJS[i]=p; if(p) bump(p,'prod',n_(r[7]))
}
const HOY_A=new Date().getFullYear()
// Pagos_Staff por nombre de header: desde 09/2026 hay una columna "Viáticos" en H y todo lo demás corrió un lugar.
const hP=PS[0]||[], iP=n=>hP.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())
const pFP=iP('Fecha Pago'), pFRE=iP('Freelancer'), pMR=iP('Mes Referencia'), pNRO=iP('N° Presupuesto'), pADE=iP('Monto Adeudado'), pVIA=iP('Viáticos'), pPAG=iP('Monto Pagado'), pPER=iP('Período')
if([pFP,pFRE,pMR,pNRO,pADE,pVIA,pPAG,pPER].includes(-1)){ console.error('Pagos_Staff: falta alguna columna (Fecha Pago, Freelancer, Mes Referencia, N° Presupuesto, Monto Adeudado, Viáticos, Monto Pagado, Período). Freno.'); process.exit(1) }
for(const [i,r] of PS.slice(1).entries()){
  const fp=r[pFP], mr=r[pMR], nro=r[pNRO]
  if(typeof mr!=='number'){ psJS[i]=''; continue }
  const m=mesDe(mr)
  let a=evAnio[String(nro)]
  if(a==null) a = typeof fp==='number'&&fp>1000 ? anioDe(fp)-((m===12&&mesDe(fp)===1)?1:0) : HOY_A
  const p=per(a,m); psJS[i]=p
  bump(p,'free',n_(r[pADE])); bump(p,'viat',n_(r[pVIA])); bump(p,'pagado',n_(r[pPAG]))
  const quien=txt(r[pFRE])
  if(/arauz/i.test(quien)||/^sofia.*grenier/i.test(quien)) bump(p,'socios',n_(r[pADE]))
}

const difs=(rows,iCol,js)=>{const d=[];rows.slice(1).forEach((r,i)=>{const s=txt(r[iCol]);if(s!==js[i])d.push(`fila ${i+2}: sheet="${s}" js="${js[i]}"`)});return d}
const dF=difs(FAC,33,facJS), dR=difs(PRO,150,proJS), dP=difs(PS,pPER,psJS)

console.log('\n'+'█'.repeat(104))
console.log('  VERIFICADOR — solapa MES A MES contra recálculo independiente')
console.log('█'.repeat(104))
console.log('\nColumna Período, fila por fila:')
for(const [n,rows,d] of [['FACTURACION',FAC,dF],['PROYECTOS',PRO,dR],['Pagos_Staff',PS,dP]]){
  console.log(`  ${padr(n,13)} ${pad(rows.length-1,5)} filas · ${d.length?`⚠ ${d.length} DIFERENCIAS`:'✓ todas coinciden'}`)
  d.slice(0,6).forEach(x=>console.log('       ',x))
}

const MES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
// Columnas de MES A MES (0-based): I=8 producción · J=9 freelancers · K=10 socios · L=11 externos · M=12 viáticos · N=13 % · O=14 pagado · P=15 falta pagar
const COLS=[['Facturas','nFac',2],['Facturado','neto',3],['IVA','iva',4],['ConIVA','fin',5],['Cobrado','cobrado',6],['Producción','prod',8],['Freelancers','free',9],['Juan+Sofi','socios',10],['Viáticos','viat',12],['Pagado','pagado',14]]
let errores=0
console.log(`\n${padr('Mes',11)} ${pad('FACTURADO',15)} ${pad('PRODUCCIÓN',15)} ${pad('FREELANCERS',14)} ${pad('Juan+Sofi',14)} ${pad('externos',14)} ${pad('VIÁTICOS',12)} ${pad('%',7)}  ok`)
console.log('─'.repeat(104))
for(let m=1;m<=12;m++){
  const p=per(ANIO,m), fila=MM[3+m]||[]
  const c=calc[p]||{nFac:0,neto:0,iva:0,fin:0,cobrado:0,prod:0,free:0,socios:0,viat:0,pagado:0}
  const malas=COLS.filter(([,k,ci])=>Math.abs(n_(fila[ci])-c[k])>1).map(([l])=>l)
  if(malas.length) errores++
  const pct=n_(fila[13])
  console.log(`${padr(MES[m-1],11)} ${pad(M(n_(fila[3])),15)} ${pad(M(n_(fila[8])),15)} ${pad(M(n_(fila[9])),14)} ${pad(M(n_(fila[10])),14)} ${pad(M(n_(fila[11])),14)} ${pad(M(n_(fila[12])),12)} ${pad(pct?(pct*100).toFixed(1)+'%':'—',7)}  ${malas.length?'⚠ '+malas.join(','):'✓'}`)
}
const T=MM[16]||[]
const tot=k=>Object.entries(calc).filter(([p])=>p.startsWith(ANIO+'-')).reduce((s,[,v])=>s+v[k],0)
const malasT=COLS.filter(([,k,ci])=>Math.abs(n_(T[ci])-tot(k))>1).map(([l])=>l)
console.log('─'.repeat(104))
console.log(`${padr('TOTAL',11)} ${pad(M(n_(T[3])),15)} ${pad(M(n_(T[8])),15)} ${pad(M(n_(T[9])),14)} ${pad(M(n_(T[10])),14)} ${pad(M(n_(T[11])),14)} ${pad(M(n_(T[12])),12)} ${pad(n_(T[13])?(n_(T[13])*100).toFixed(1)+'%':'—',7)}  ${malasT.length?'⚠ '+malasT.join(','):'✓'}`)
// la columna "externos" tiene que ser exactamente el resto
const difExt=[]
for(let m=1;m<=12;m++){const f=MM[3+m]||[];if(Math.abs(n_(f[11])-(n_(f[9])-n_(f[10])))>1)difExt.push(MES[m-1])}
console.log(`\nExternos = FREELANCERS − (Juan+Sofi): ${difExt.length?'⚠ no cierra en '+difExt.join(', '):'✓ cierra en los 12 meses'}`)
// "Falta pagar" tiene que ser honorarios + viáticos − pagado, y el % ir sobre honorarios + viáticos
const difFP=[], difPct=[]
for(let m=1;m<=12;m++){const f=MM[3+m]||[]
  if(Math.abs(n_(f[15])-(n_(f[9])+n_(f[12])-n_(f[14])))>1)difFP.push(MES[m-1])
  const prod=n_(f[8]); if(prod>0&&Math.abs(n_(f[13])-(n_(f[9])+n_(f[12]))/prod)>0.0005)difPct.push(MES[m-1])}
console.log(`Falta pagar = FREELANCERS + VIÁTICOS − Ya pagado: ${difFP.length?'⚠ no cierra en '+difFP.join(', '):'✓ cierra en los 12 meses'}`)
console.log(`% s/ producción = (FREELANCERS + VIÁTICOS) / PRODUCCIÓN: ${difPct.length?'⚠ no cierra en '+difPct.join(', '):'✓ cierra en los 12 meses'}`)

console.log('\nContraste con los números que se presentaron (jul/ago 2026):')
const chk=[['Julio facturado neto',40639860,n_((MM[10]||[])[3])],
           ['Agosto facturado neto',31965900,n_((MM[11]||[])[3])],
           ['Julio freelancers',12861650,n_((MM[10]||[])[9])],
           // Agosto se presentó con $16.405.000 el 01/09. Después se siguió cargando staff de
           // agosto y, además, las filas que la app insertaba nacían SIN fórmula de Período
           // (MES A MES no las contaba). El 14/09 se reescribió Período y quedó en $18.921.000.
           ['Agosto freelancers',18921000,n_((MM[11]||[])[9])],
           // "externos" acá = todo lo que no es Juan ni Sofi. Lulu, Tom y Dani cuentan
           // como externos en esta columna, a diferencia del primer cálculo suelto.
           ['Julio Juan+Sofi',3521000,n_((MM[10]||[])[10])],
           ['Agosto Juan+Sofi',3180000,n_((MM[11]||[])[10])],
           ['Julio externos',9340650,n_((MM[10]||[])[11])],
           ['Agosto externos',15741000,n_((MM[11]||[])[11])]]
chk.forEach(([l,d,r])=>console.log(`  ${padr(l,24)} declarado ${pad(M(d),15)} · solapa ${pad(M(r),15)}  ${Math.abs(d-r)<=1?'✓':'⚠ dif '+M(r-d)}`))

const ok = !dF.length && !dR.length && !dP.length && !errores && !malasT.length && !difExt.length && !difFP.length && !difPct.length && chk.every(([,d,r])=>Math.abs(d-r)<=1)
console.log(`\n${ok?'✓ TODO CIERRA — la solapa dice exactamente lo mismo que el recálculo desde cero.':'⚠ HAY DIFERENCIAS — revisar arriba antes de mostrarle esto a nadie.'}\n`)
process.exit(ok?0:1)
