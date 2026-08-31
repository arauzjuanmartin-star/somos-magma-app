// ============================================================================
// AUDITORÍA / CHEQUEO DE SALUD DE LA APP (Master Magma)
// Corre: node scripts/auditoria.mjs
// Solo LEE — no modifica nada. Reporta duplicados e inconsistencias.
// ============================================================================
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const num=v=>parseFloat(String(v||'').replace(/[^\d.-]/g,''))||0
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim()
const g=async r=>(await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:r})).data.values||[]
const obj=rows=>{const h=rows[0]||[];return rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])))}
let ALERTAS=0
const H=t=>console.log(`\n\x1b[1m═══ ${t} ═══\x1b[0m`)
const ok=m=>console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const warn=m=>{ALERTAS++;console.log(`  \x1b[31m⚠\x1b[0m ${m}`)}

const fc=await g('FACTURACION!A:AF')
const fh=fc[0]
const F=n=>fh.indexOf(n)
const iP=F('N° Presupuesto'),iCob=F('Cobrado'),iEmi=F('Fecha emision'),iNro=F('Nro de Factura'),iFin=F('Precio FINAL'),iProy=F('Proyecto'),iAg=F('Agencia')
const esReal=r=>String(r[iNro]||'').trim()||String(r[iEmi]||'').trim()

// 1) FACTURACION: mismo N° presupuesto en 2+ filas reales
H('FACTURACIÓN · proyectos facturados 2+ veces')
const byNum={}
fc.forEach((r,i)=>{if(i===0)return;const p=String(r[iP]||'').trim();if(!p)return;(byNum[p]=byNum[p]||[]).push({row:i+1,r})})
let dupFc=0
Object.entries(byNum).forEach(([n,v])=>{ const reales=v.filter(x=>esReal(x.r))
  if(reales.length>1){ dupFc++; warn(`#${n} "${v[0].r[iProy]||''}" facturado ${reales.length} veces: `+reales.map(x=>`f${x.row}=$${num(x.r[iFin]).toLocaleString('es-AR')}(${x.r[iCob]==='TRUE'||x.r[iCob]===true?'cob':'pend'})`).join(' + ')) }
  else if(v.length>1){ dupFc++; warn(`#${n} "${v[0].r[iProy]||''}" tiene ${v.length} filas (1 real + fantasma): revisar`) } })
if(!dupFc) ok('Sin proyectos facturados dos veces')

// 2) FACTURACION: mismo Nro de Factura repetido
H('FACTURACIÓN · N° de factura repetido')
const byNro={}
fc.forEach((r,i)=>{if(i===0)return;const n=String(r[iNro]||'').trim();if(!n||/anulad/i.test(n))return;(byNro[n]=byNro[n]||[]).push(i+1)})
const dupNro=Object.entries(byNro).filter(([k,v])=>v.length>1)
if(dupNro.length) dupNro.forEach(([n,v])=>warn(`Factura N° ${n} repetida en filas ${v.join(',')}`)); else ok('Sin N° de factura repetidos')

// 3) FACTURACION: cobrada sin emisión ni N°
H('FACTURACIÓN · cobradas sin comprobante')
let sinComp=0
fc.forEach((r,i)=>{if(i===0)return;const cob=r[iCob]==='TRUE'||r[iCob]===true;if(cob&&!esReal(r)){sinComp++;if(sinComp<=8)warn(`f${i+1} #${r[iP]} "${r[iProy]||''}" cobrada pero sin N° ni fecha emisión`)}})
if(!sinComp) ok('Todas las cobradas tienen comprobante')
else if(sinComp>8) console.log(`     …y ${sinComp-8} más`)

// 4) PRESUPUESTOS
const pr=await g('PRESUPUESTOS!A:K')
const ph=pr[0], pN=0, pEst=ph.findIndex(x=>/estado/i.test(String(x||'')))
H('PRESUPUESTOS · N° duplicado')
const pByNum={}
pr.forEach((r,i)=>{if(i===0)return;const n=String(r[pN]||'').trim();if(!n)return;(pByNum[n]=pByNum[n]||[]).push(r)})
const dupP=Object.entries(pByNum).filter(([k,v])=>v.length>1)
let colision=0
dupP.forEach(([n,v])=>{const ap=v.filter(r=>String(r[pEst]||'').trim().toUpperCase()==='APROBADO').length; if(ap>1){colision++;warn(`Presupuesto #${n}: ${ap} APROBADOS con el mismo N° (colisión REAL — renumerar)`)}})
if(!colision) ok(`Sin colisiones (hay ${dupP.length} N° repetidos pero con ≤1 aprobado c/u = cotizaciones alternativas, OK)`)

H('PRESUPUESTOS · aprobados con mismo evento+cliente+proyecto (posible doble carga)')
const aprob=pr.map((r,i)=>({i:i+1,r})).filter(({r},idx)=>idx>0&&String(r[pEst]||'').trim().toUpperCase()==='APROBADO')
const kEv={}
aprob.forEach(({i,r})=>{const k=norm(r[1])+'|'+norm(r[4])+'|'+norm(r[6]);(kEv[k]=kEv[k]||[]).push({i,n:r[pN]})})
let dupEv=0
Object.values(kEv).forEach(v=>{if(v.length>1){dupEv++;warn(`Mismo evento/cliente/proyecto aprobado ${v.length} veces: #`+v.map(x=>x.n).join(' , #'))}})
if(!dupEv) ok('Sin proyectos aprobados duplicados')

// 5) PROYECTOS: N° duplicado
const py=await g('PROYECTOS!A:D')
const yN=py[0].findIndex(x=>/n°\s*presupuesto/i.test(String(x||'')))
H('PROYECTOS · N° duplicado')
const yByNum={}
py.forEach((r,i)=>{if(i===0)return;const n=String(r[yN]||'').trim();if(!n)return;(yByNum[n]=yByNum[n]||[]).push(i+1)})
const dupY=Object.entries(yByNum).filter(([k,v])=>v.length>1)
if(dupY.length) dupY.forEach(([n,v])=>warn(`Proyecto #${n} en ${v.length} filas (${v.join(',')})`)); else ok('Sin proyectos duplicados')

// 6bis) Fecha Evento desincronizada PROYECTOS vs PRESUPUESTOS
// El calendario de la app lee PROYECTOS para los aprobados. Si la fecha se edita a mano
// en el sheet (no desde la app), PROYECTOS queda viejo y el laburo aparece en el mes equivocado.
// Se arregla con: node scripts/fix-fecha-desync.mjs <N°>
const pyF=await g('PROYECTOS!A:H'), prF=await g('PRESUPUESTOS!A:H')
const yfN=pyF[0].findIndex(x=>/n°\s*presupuesto/i.test(String(x||''))), yfF=pyF[0].indexOf('Fecha Evento')
const pfF=prF[0].indexOf('Fecha Evento'), pfC=prF[0].indexOf('Cliente'), pfP=prF[0].indexOf('Proyecto')
const nd=f=>{const p=String(f||'').trim().split('/');return p.length<3?'':`${+p[0]}/${+p[1]}/${+p[2]}`}
H('CALENDARIO · fecha del evento distinta entre PROYECTOS y PRESUPUESTOS')
const presF={}; prF.forEach((r,i)=>{if(i===0)return;const n=String(r[0]||'').trim();if(n&&!presF[n])presF[n]={f:r[pfF],c:r[pfC],p:r[pfP]}})
let desync=0
pyF.forEach((r,i)=>{if(i===0)return;const n=String(r[yfN]||'').trim();const pe=presF[n];if(!n||!pe)return
  const a=nd(r[yfF]),b=nd(pe.f); if(a&&b&&a!==b){desync++;warn(`#${n} "${pe.c||''} · ${pe.p||''}" → PROYECTOS ${a} ≠ PRESUPUESTOS ${b} (el calendario lo muestra en el mes de ${a})`)}})
if(!desync) ok('Todas las fechas de evento coinciden entre solapas')

// 6) PAGOS_STAFF
const ps=await g('PAGOS_STAFF!A:N')
const psh=ps[0]
const sF=psh.indexOf('Freelancer'),sMe=psh.indexOf('Mes Referencia'),sNr=psh.indexOf('N° Presupuesto'),sSv=psh.indexOf('Servicio'),sEs=psh.indexOf('Estado'),sMp=psh.indexOf('Monto Pagado')
const esPag=r=>{const e=String(r[sEs]||'').toUpperCase();return['PAGADO','SÍ','SI','TRUE'].includes(e)||num(r[sMp])>0}
H('PAGOS_STAFF · pagos marcados sin Servicio (no se reflejan en la pantalla)')
let sinSvc=0
ps.forEach((r,i)=>{if(i===0)return;if(esPag(r)&&String(r[sNr]||'').trim()&&!String(r[sSv]||'').trim()){sinSvc++}})
if(sinSvc) warn(`${sinSvc} filas pagadas con Servicio vacío → la pantalla Pagos Staff NO las cuenta (revisar/rehacer con "Pagar todo")`); else ok('Todos los pagos tienen Servicio')

H('PAGOS_STAFF · nombres de staff de una sola palabra (posibles apodos sin unificar)')
const CANON_OK=new Set(['juan','sofi','lulu','dani','tom','santino','gaspar','felipe','ivan','pablo','lucas','julian','blas','mailen','pedro','nahuel','lucho','chanas','luciano','tutu','pocho','paz','pachu','clari','eli','andy','gabo','manu','nacho','teo','martin','diego','juli','timo','maiko','valentin','gustavo','augusto','joni'])
const apodos={}
ps.forEach((r,i)=>{if(i===0)return;const n=String(r[sF]||'').trim();if(n&&!n.includes(' ')&&!CANON_OK.has(norm(n))&&isNaN(num(n))&&num(n)===0){apodos[n]=(apodos[n]||0)+1}})
const ap=Object.entries(apodos).filter(([k,v])=>v>0)
if(ap.length) warn(`Apodos nuevos sin mapear: ${ap.map(([k,v])=>k+'('+v+')').join(', ')} → agregar al mapa STAFF_CANON_MAP`); else ok('Sin apodos nuevos sin unificar')

// 7) CALENDAR · eventos fantasma (presu eliminado o desaprobado que dejó el evento vivo)
H('CALENDAR · eventos de presupuestos que ya no existen')
try{
  const CAL='5gc9hdvh4vi28bf8uemr2vfnn4@group.calendar.google.com'
  const calAuth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/calendar'],clientOptions:{subject:env.CALENDAR_AS||'sofi@somosmagma.com'}})
  const cal=google.calendar({version:'v3',auth:calAuth})
  const pres=await g('PRESUPUESTOS!A:G')
  const estados=new Map(pres.slice(1).filter(r=>String(r[0]||'').trim()).map(r=>[String(r[0]).trim(),String(r[3]||'').trim()]))
  const d1=new Date(); d1.setMonth(d1.getMonth()-6)
  const d2=new Date(); d2.setMonth(d2.getMonth()+18)
  let tok, evs=[]
  do{ const r=await cal.events.list({calendarId:CAL,timeMin:d1.toISOString(),timeMax:d2.toISOString(),maxResults:250,singleEvents:true,orderBy:'startTime',pageToken:tok}); evs.push(...(r.data.items||[])); tok=r.data.nextPageToken }while(tok)
  const fantasmas=[]
  for(const e of evs){
    const m=String(e.description||'').match(/\[SOMOS_MAGMA_PRESU:([^\]]+)\]/)
    if(!m) continue
    const n=m[1].trim(), est=estados.get(n)
    if(est===undefined) fantasmas.push(`${(e.start?.date||e.start?.dateTime||'').slice(0,10)} ${e.summary} (presu eliminado)`)
    else if(/DESAPROBADO|REPRESUPUESTADO/i.test(est)) fantasmas.push(`${(e.start?.date||e.start?.dateTime||'').slice(0,10)} ${e.summary} (${est})`)
  }
  if(fantasmas.length){ warn(`${fantasmas.length} evento(s) fantasma → node scripts/calendar-huerfanos-audit.mjs --borrar`); fantasmas.forEach(f=>console.log(`      ${f}`)) }
  else ok('Sin eventos fantasma en el Calendar')
}catch(e){ console.log(`  \x1b[33m·\x1b[0m No se pudo leer el Calendar (${e.message})`) }

console.log(`\n\x1b[1m${'─'.repeat(50)}\x1b[0m`)
console.log(ALERTAS===0?`\x1b[32m\x1b[1m✓ TODO OK — 0 alertas\x1b[0m`:`\x1b[31m\x1b[1m⚠ ${ALERTAS} alerta(s) para revisar\x1b[0m`)
