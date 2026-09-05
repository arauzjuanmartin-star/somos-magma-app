/**
 * Para Mariana — FACTURACIÓN y GASTO EN FREELANCERS de julio y agosto 2026.
 * Solo lectura.
 *
 * Criterio:
 *  - Facturación = solapa FACTURACION, filas cuyo "Mes" cae en jul/ago 2026 (mes en que se factura,
 *    no el del evento: "Mani King Mensual Junio" se factura en julio).
 *  - Freelancers = solapa Pagos_Staff por "Mes Referencia" (el mes del trabajo). El pago sale el 15
 *    del mes siguiente, así que agosto está casi todo en Pendiente: es gasto devengado, no caja.
 *  - El año de cada fila de Pagos_Staff sale de la Fecha Pago; si está pendiente, del evento del
 *    proyecto (N° Presupuesto -> PROYECTOS).
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{const s=txt(v).replace(/[\s$]/g,'');if(!s)return 0;return Number(s.replace(/,/g,''))||0}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const pad=(s,n)=>String(s).padStart(n), padr=(s,n)=>String(s).padEnd(n)
const f=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return{d:+m[1],m:+m[2],a:y}}
const mesNum=v=>{const m=txt(v).match(/^(\d{1,2})\s*-/);return m?+m[1]:null}
const INTERNOS=/juan martin arauz|sofia maria grenier|luc[ií]a mar[ií]a grenier|daniela viviana ayala|tom[áa]s halbach/i

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['FACTURACION','Pagos_Staff','PROYECTOS'],valueRenderOption:'FORMATTED_VALUE'})
const [FAC,PS,PRO]=R.data.valueRanges.map(v=>v.values||[])

// ── PROYECTOS: venta, staff presupuestado, y mapa presu -> año/mes de evento ──
const rh=PRO[0]
const iFeP=rh.indexOf('Fecha Evento'), iTotP=rh.findIndex(x=>txt(x)==='Total'), iNroP=rh.indexOf('N° presupuesto')
const idxPrecio=[]; rh.forEach((h,i)=>{ if(/^Precio( \d+)?$/i.test(txt(h))) idxPrecio.push(i) })
const evPorPresu={}
const proMes={7:{venta:0,staff:0,n:0},8:{venta:0,staff:0,n:0}}
for(const r of PRO.slice(1)){
  const fe=f(r[iFeP]); const nro=txt(r[iNroP])
  if(fe&&nro) evPorPresu[nro]=fe
  if(fe?.a!==2026||(fe.m!==7&&fe.m!==8)) continue
  const tot=num(r[iTotP]); if(tot<=0) continue
  proMes[fe.m].venta+=tot; proMes[fe.m].n++
  for(const i of idxPrecio){ const p=num(r[i]), st=txt(r[i+1]); if(p>0&&st&&!/somos\s*magma/i.test(st)) proMes[fe.m].staff+=p }
}

// ── FACTURACIÓN ──
const fh=FAC[0], fi=n=>fh.findIndex(x=>txt(x).toLowerCase()===n.toLowerCase())
const iMes=fi('Mes'),iEv=fi('Fecha Evento'),iEm=fi('Fecha emision'),iNeto=fi('Precio SIN IVA'),iFin=fi('Precio FINAL'),
      iNro=fi('Nro de Factura'),iCli=fi('Cliente'),iAg=fi('Agencia'),iPro=fi('Proyecto'),iCob=fi('Cobrado')
const facMes={7:[],8:[]}
for(const r of FAC.slice(1)){
  const ev=f(r[iEv]), em=f(r[iEm]); const a=em?.a ?? ev?.a; if(a!==2026) continue
  const m=mesNum(r[iMes]) ?? em?.m ?? ev?.m; if(m!==7&&m!==8) continue
  const neto=num(r[iNeto]), fin=num(r[iFin]); if(neto<=0&&fin<=0) continue
  facMes[m].push({neto,fin:fin||neto,nro:txt(r[iNro]),cli:txt(r[iCli])||txt(r[iAg]),pro:txt(r[iPro]),cobrado:/true|si/i.test(txt(r[iCob]))})
}

// ── FREELANCERS ──
const ph=PS[0], pi=n=>ph.findIndex(x=>txt(x).toLowerCase()===n.toLowerCase())
const jFP=pi('Fecha Pago'),jFree=pi('Freelancer'),jMR=pi('Mes Referencia'),jPre=pi('N° Presupuesto'),
      jProy=pi('Proyecto'),jServ=pi('Servicio'),jAd=pi('Monto Adeudado'),jPag=pi('Monto Pagado'),jEst=pi('Estado')
const esDup=r=>/^\s*\$?[\d.,]+\s*$/.test(txt(r[jServ]))&&num(r[jServ])>1000
const staff={7:[],8:[]}, dups={7:0,8:0}, sinAnio={7:0,8:0}
for(const r of PS.slice(1)){
  const mr=mesNum(r[jMR]); if(mr!==7&&mr!==8) continue
  const monto=num(r[jPag])||num(r[jAd]); if(monto<=0) continue
  if(esDup(r)){ dups[mr]++; continue }
  const fp=f(r[jFP])
  const ev=evPorPresu[txt(r[jPre])]
  let anio = fp ? (mr===12&&fp.m===1?fp.a-1:fp.a) : ev?.a
  if(!anio){ anio=2026; sinAnio[mr]++ }          // pendiente sin cruce: se asume el año en curso
  if(anio!==2026) continue
  staff[mr].push({freelancer:txt(r[jFree]),proy:txt(r[jProy]),monto,pagado:/pagad/i.test(txt(r[jEst])),
                  fp:fp?`${fp.d}/${fp.m}/${fp.a}`:'', interno:INTERNOS.test(txt(r[jFree]))})
}

const MES={7:'JULIO',8:'AGOSTO'}
console.log('\n'+'█'.repeat(80))
console.log('  JULIO y AGOSTO 2026 — facturación y gasto en freelancers   (para Mariana)')
console.log('█'.repeat(80))
for(const m of [7,8]){
  const F=facMes[m], S=staff[m]
  const neto=F.reduce((s,x)=>s+x.neto,0), fin=F.reduce((s,x)=>s+x.fin,0)
  const sinNro=F.filter(x=>!x.nro), cobrado=F.filter(x=>x.cobrado)
  const sTot=S.reduce((s,x)=>s+x.monto,0)
  const sPag=S.filter(x=>x.pagado).reduce((s,x)=>s+x.monto,0)
  const sPend=sTot-sPag
  const sExt=S.filter(x=>!x.interno).reduce((s,x)=>s+x.monto,0)
  console.log(`\n┌─ ${MES[m]} 2026 ${'─'.repeat(62-MES[m].length)}`)
  console.log(`│ FACTURADO (${F.length} facturas)`)
  console.log(`│    Neto sin IVA ............. ${pad(M(neto),15)}`)
  console.log(`│    Con IVA .................. ${pad(M(fin),15)}`)
  console.log(`│    Ya cobrado ............... ${pad(M(cobrado.reduce((s,x)=>s+x.neto,0)),15)}   (${cobrado.length} de ${F.length})`)
  console.log(`│    Sin N° de factura ........ ${pad(M(sinNro.reduce((s,x)=>s+x.neto,0)),15)}   (${sinNro.length} filas cargadas, no emitidas)`)
  console.log(`│`)
  console.log(`│ FREELANCERS por trabajo de ${MES[m].toLowerCase()} (${S.length} pagos · ${new Set(S.map(x=>x.freelancer)).size} personas)`)
  console.log(`│    TOTAL .................... ${pad(M(sTot),15)}   = ${(sTot/neto*100).toFixed(1)}% de lo facturado`)
  console.log(`│      ya pagado .............. ${pad(M(sPag),15)}`)
  console.log(`│      pendiente de pago ...... ${pad(M(sPend),15)}${m===8?'   (sale el 15/9)':''}`)
  console.log(`│    Solo externos (sin socios) ${pad(M(sExt),15)}`)
  console.log(`│`)
  console.log(`│ CONTROL — producción del mes (PROYECTOS, por fecha de evento)`)
  console.log(`│    Venta ................... ${pad(M(proMes[m].venta),15)}   (${proMes[m].n} proyectos)`)
  console.log(`│    Staff presupuestado ..... ${pad(M(proMes[m].staff),15)}   → cargado en Pagos_Staff: ${M(sTot)} (dif ${M(proMes[m].staff-sTot)})`)
  console.log(`└${'─'.repeat(78)}`)
  if(dups[m]||sinAnio[m]) console.log(`   nota: ${dups[m]} filas duplicadas excluidas · ${sinAnio[m]} filas pendientes sin cruce de año (asumidas 2026)`)
}

for(const m of [7,8]){
  const por={}
  for(const x of staff[m]) por[x.freelancer]=por[x.freelancer]||{t:0,n:0,interno:x.interno}
  for(const x of staff[m]){ por[x.freelancer].t+=x.monto; por[x.freelancer].n++ }
  const lista=Object.entries(por).sort((a,b)=>b[1].t-a[1].t)
  const tot=lista.reduce((s,x)=>s+x[1].t,0)
  console.log(`\n  ${MES[m]} — quién cobra por el trabajo del mes · ${M(tot)}`)
  lista.forEach(([n,v],i)=>console.log(`    ${pad(i+1,2)}. ${padr(n.slice(0,40),42)} ${pad(M(v.t),13)} ${pad((v.t/tot*100).toFixed(1)+'%',6)}  ${v.n} pagos${v.interno?'   (interno)':''}`))
}
console.log('')
