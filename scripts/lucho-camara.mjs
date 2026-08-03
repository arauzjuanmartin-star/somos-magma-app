/**
 * ¿Cuánto ganó Lucho (Jorge Luis Chavez) por CÁMARA (filmmaker/video/foto) en los
 * últimos 4 meses, y en cuántos laburos? Solo lectura.
 * Excluye edición. Deduplica filas repetidas (mismo N° presu + monto). Excluye 2025 migrado.
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
const LUCHO=/jorge\s+luis\s+chavez/i
const CAMARA=/foto|film|video|c[aá]mara/i
const EDIT=/edit|edici/i
const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PAGOS_STAFF','PROYECTOS'],valueRenderOption:'FORMATTED_VALUE'})
const [PAG,PRO]=r.data.valueRanges.map(v=>v.values||[])

// lookup: N° presu -> pedidos de Lucho (para clasificar cuando el Servicio está vacío/numérico)
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]
const STF=[13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const proyLucho={} // n° -> [{pedido}]
PRO.slice(1).forEach(row=>{const n=txt(row[2]);if(!n)return
  STF.forEach((sc,k)=>{ if(LUCHO.test(txt(row[sc]))) (proyLucho[n]=proyLucho[n]||[]).push(txt(row[PED[k]])) })})

// clasificar cada fila de pago de Lucho
function clasificar(servicio, npresu){
  const s=txt(servicio)
  if(EDIT.test(s)) return 'edit'
  if(CAMARA.test(s)) return 'camara'
  // servicio vacío o numérico -> mirar el proyecto
  const peds=proyLucho[txt(npresu)]||[]
  const cam=peds.some(p=>CAMARA.test(p)&&!EDIT.test(p))
  const ed=peds.some(p=>EDIT.test(p))
  if(cam&&!ed) return 'camara'
  if(ed&&!cam) return 'edit'
  return 'dudoso'
}

// juntar filas de Lucho, ventana abr-jul 2026, sin 2025
const filas=[]
PAG.slice(1).forEach((row,i)=>{
  if(!LUCHO.test(txt(row[1]))) return
  const notas=txt(row[11]), fpago=txt(row[0])
  if(/2025|migrad/i.test(notas)||/\/2025/.test(fpago)) return // fuera 2025
  const mesRef=parseInt(txt(row[2]))||0
  const monto=num(row[6])||num(row[7]) // adeudado, sino pagado
  const cls=clasificar(row[5], row[3])
  filas.push({fila:i+2, mesRef, npresu:txt(row[3]), proy:txt(row[4]).slice(0,38), serv:txt(row[5]), monto, cls, notas})
})

// dedup: misma (N° presu + monto redondeado) = repetida
const vistos=new Map(), dups=[]
filas.forEach(f=>{ const key=`${f.npresu}|${Math.round(f.monto)}`
  if(f.npresu && vistos.has(key)){ f.dup=true; dups.push(f) } else if(f.npresu) vistos.set(key,f) })

const VENTANA=[4,5,6,7]
console.log(`\n${'█'.repeat(66)}\n  LUCHO (Jorge Luis Chavez) · CÁMARA · últimos 4 meses (abr-jul 2026)\n${'█'.repeat(66)}`)

let totalCam=0, laburos=new Set()
for(const m of VENTANA){
  const delMes=filas.filter(f=>f.mesRef===m && f.cls==='camara' && !f.dup)
  const tot=delMes.reduce((s,f)=>s+f.monto,0)
  totalCam+=tot
  delMes.forEach(f=>laburos.add(`${m}|${f.npresu}`))
  console.log(`\n── ${MES[m].toUpperCase()} · ${money(tot)} · ${new Set(delMes.map(f=>f.npresu)).size} laburos ──`)
  delMes.forEach(f=>console.log(`   ${money(f.monto).padStart(12)}  ${(f.serv||'(s/serv)').padEnd(16)} ${f.proy}  [${f.npresu||'s/n°'}]`))
  if(!delMes.length) console.log('   (nada de cámara)')
}

console.log(`\n${'━'.repeat(66)}`)
console.log(`  TOTAL CÁMARA 4 meses:  ${money(totalCam)}`)
console.log(`  PROMEDIO MENSUAL:      ${money(totalCam/4)}`)
console.log(`  LABUROS (proyectos):   ${laburos.size} en 4 meses  ·  ~${(laburos.size/4).toFixed(1)}/mes`)
console.log(`${'━'.repeat(66)}`)

// contexto: qué se excluyó
const edits=filas.filter(f=>VENTANA.includes(f.mesRef)&&f.cls==='edit'&&!f.dup)
const dudosos=filas.filter(f=>VENTANA.includes(f.mesRef)&&f.cls==='dudoso'&&!f.dup)
console.log(`\n  EXCLUIDO (para que veas):`)
console.log(`   · Edición: ${edits.length} filas por ${money(edits.reduce((s,f)=>s+f.monto,0))}`)
if(dudosos.length) console.log(`   · Dudosos (servicio sin clasificar): ${dudosos.length} — ${dudosos.map(f=>f.proy+' '+money(f.monto)).join(' | ')}`)
if(dups.length){ console.log(`   · Filas DUPLICADAS removidas: ${dups.length}`)
  dups.forEach(f=>console.log(`       ${MES[f.mesRef]} ${money(f.monto)} ${f.proy} [${f.npresu}]`)) }
