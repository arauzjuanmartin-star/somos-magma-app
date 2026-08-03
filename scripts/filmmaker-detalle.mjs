/**
 * Detalle de las jornadas de cámara: distribución de tarifas, quién cobra qué,
 * y el detalle de los pagos grandes (Felipe) para entender si es jornada o equipo.
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const CAMARA=/film|c[aá]mara|camara|video|foto|df\b|director de fot/i
const EDIT=/edit|edici|post|color/i

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PAGOS_STAFF'],valueRenderOption:'FORMATTED_VALUE'})
const PAG=r.data.valueRanges[0].values||[]

const filas=[]
PAG.slice(1).forEach((row,i)=>{
  const persona=txt(row[1]); if(!persona) return
  if(/2025|migrad/i.test(txt(row[11]))||/\/2025/.test(txt(row[0]))) return
  const monto=num(row[6])||num(row[7]); if(monto<=1) return
  filas.push({fila:i+2,persona,mes:parseInt(txt(row[2]))||0,npresu:txt(row[3]),
    proy:txt(row[4]),serv:txt(row[5]),monto,notas:txt(row[11])})
})
const vistos=new Set()
const vivos=filas.filter(f=>{const k=`${f.persona}|${f.npresu}|${Math.round(f.monto)}`
  if(f.npresu&&vistos.has(k))return false; if(f.npresu)vistos.add(k); return true})

// --- 1) Felipe: los pagos grandes ---
console.log(`\n${'█'.repeat(74)}\n  FELIPE MARTINEZ — todos los pagos 2026\n${'█'.repeat(74)}`)
const fel=vivos.filter(f=>/felipe/i.test(f.persona)).sort((a,b)=>b.monto-a.monto)
fel.forEach(f=>console.log(`  ${MES[f.mes].padEnd(4)} ${money(f.monto).padStart(13)}  ${(f.serv||'(s/serv)').padEnd(18)} ${f.proy.slice(0,40)}  [${f.npresu}]${f.notas?' · '+f.notas.slice(0,30):''}`))
console.log(`  TOTAL: ${money(fel.reduce((s,f)=>s+f.monto,0))} en ${fel.length} filas`)

// --- 2) distribución de tarifas de cámara (excluyendo Felipe) ---
const cam=vivos.filter(f=>{const s=f.serv
  if(EDIT.test(s))return false
  return CAMARA.test(s)||(!s&&!/somos magma/i.test(f.persona))})
  .filter(f=>!/somos magma/i.test(f.persona))
console.log(`\n${'━'.repeat(74)}\n  DISTRIBUCIÓN DE TARIFAS POR JORNADA (filas de cámara)\n${'━'.repeat(74)}`)
const rangos=[[0,150e3],[150e3,250e3],[250e3,350e3],[350e3,500e3],[500e3,1e6],[1e6,Infinity]]
rangos.forEach(([a,b])=>{const g=cam.filter(f=>f.monto>=a&&f.monto<b)
  if(!g.length)return
  const t=g.reduce((s,f)=>s+f.monto,0)
  console.log(`  ${money(a).padStart(11)}–${b===Infinity?'∞':money(b).padEnd(11)}  ${String(g.length).padStart(4)} filas   ${money(t).padStart(14)}`)})

const montos=cam.map(f=>f.monto).sort((a,b)=>a-b)
const mediana=montos[Math.floor(montos.length/2)]
console.log(`\n  Filas de cámara: ${cam.length}  ·  mediana por fila: ${money(mediana)}  ·  promedio: ${money(montos.reduce((s,n)=>s+n,0)/montos.length)}`)

// --- 3) los "operarios" repetitivos: quién hace muchas jornadas chicas ---
console.log(`\n${'━'.repeat(74)}\n  JORNADAS CHICAS (< $500k) — lo que reemplazaría un fijo\n${'━'.repeat(74)}`)
const chicas=cam.filter(f=>f.monto<500e3)
const porMesCh={}, porPersCh={}
chicas.forEach(f=>{porMesCh[f.mes]=(porMesCh[f.mes]||{n:0,t:0}); porMesCh[f.mes].n++; porMesCh[f.mes].t+=f.monto
  porPersCh[f.persona]=(porPersCh[f.persona]||{n:0,t:0}); porPersCh[f.persona].n++; porPersCh[f.persona].t+=f.monto})
console.log(`  mes    jornadas   gasto`)
Object.keys(porMesCh).map(Number).sort((a,b)=>a-b).forEach(m=>
  console.log(`  ${MES[m].padEnd(5)}  ${String(porMesCh[m].n).padStart(6)}   ${money(porMesCh[m].t).padStart(13)}`))
const totCh=chicas.reduce((s,f)=>s+f.monto,0)
const mesesAct=Object.keys(porMesCh).filter(m=>porMesCh[m].n>2).length
console.log(`\n  TOTAL jornadas chicas: ${chicas.length} por ${money(totCh)}`)
console.log(`  Promedio mensual (${mesesAct} meses activos): ${(chicas.length/mesesAct).toFixed(1)} jornadas · ${money(totCh/mesesAct)}/mes`)
console.log(`  Tarifa media por jornada: ${money(totCh/chicas.length)}`)
console.log(`\n  Por persona:`)
Object.entries(porPersCh).sort((a,b)=>b[1].n-a[1].n).forEach(([p,d])=>
  console.log(`   ${String(d.n).padStart(3)} jornadas  ${money(d.t).padStart(12)}  ${money(d.t/d.n).padStart(10)}/jornada   ${p}`))
