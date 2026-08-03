/**
 * Arregla N° de presupuesto DUPLICADOS en PRESUPUESTOS.
 * Preview por defecto. Aplica solo con --go.
 *
 * Regla: dentro de cada grupo con N° repetido, se CONSERVA el número en una fila
 * y se renumeran las demás con el próximo entero libre.
 *  - Si hay UNA fila APROBADA en el grupo -> esa conserva el número (puede estar linkeada a
 *    PROYECTOS/FACTURACION). Se renumeran las que están EN ESPERA / DESAPROBADO / REPRESUPUESTADO.
 *  - Si NO hay aprobada -> conserva la primera fila; se renumeran las demás.
 *  - Si hay 2+ APROBADAS con el mismo número -> NO se toca, se marca para revisar a mano.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const GO = process.argv.includes('--go')
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const scopes=['https://www.googleapis.com/auth/spreadsheets'+(GO?'':'.readonly')]
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const money=v=>txt(v).replace(/\$/g,'').trim()

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESUPUESTOS',valueRenderOption:'FORMATTED_VALUE'})
const rows=r.data.values||[]
const H=rows[0]

// set de todos los números existentes + max entero
const existentes=new Set()
let maxN=0
rows.slice(1).forEach(row=>{const n=txt(row[0]);if(n){existentes.add(n);if(/^\d+$/.test(n))maxN=Math.max(maxN,+n)}})

// agrupar por número (solo numéricos)
const grupos={}
rows.forEach((row,ri)=>{ if(ri===0)return; const n=txt(row[0])
  if(/^\d+$/.test(n)){ (grupos[n]=grupos[n]||[]).push({ri, fila:ri+1, estado:txt(row[3]), ag:txt(row[4]), cli:txt(row[5]), proy:txt(row[6]), precio:money(row[8]) }) } })
const dups=Object.entries(grupos).filter(([n,g])=>g.length>1).sort((a,b)=>b[1].length-a[1].length)

let siguiente=maxN
const nextFree=()=>{ do{ siguiente++ }while(existentes.has(String(siguiente))); existentes.add(String(siguiente)); return String(siguiente) }
const APROB=/^aprob/i  // "APROBADO" sí, "DESAPROBADO" no (empieza con "des")

const plan=[]      // {fila, nAnt, nNuevo, estado, desc}
const riesgo=[]    // grupos con 2+ aprobadas

for(const [n,g] of dups){
  const aprobadas=g.filter(x=>APROB.test(x.estado))
  if(aprobadas.length>=2){ riesgo.push({n,g,aprobadas}); continue }
  const conserva = aprobadas.length===1 ? aprobadas[0] : g[0]
  for(const x of g){
    if(x===conserva) continue
    plan.push({fila:x.fila, nAnt:n, nNuevo:nextFree(), estado:x.estado, desc:`${x.ag} ${x.cli} ${x.proy}`.replace(/\s+/g,' ').trim().slice(0,44), precio:x.precio})
  }
}

console.log(`\n${'█'.repeat(70)}`)
console.log(`  ARREGLO DE N° DE PRESUPUESTO DUPLICADOS  ${GO?'· APLICANDO':'· PREVIEW (no toca nada)'}`)
console.log(`${'█'.repeat(70)}`)
console.log(`  Grupos duplicados: ${dups.length} · filas a renumerar: ${plan.length}\n`)

console.log(`  ${'FILA'.padEnd(6)}${'N° ANTES'.padEnd(11)}${'N° NUEVO'.padEnd(11)}${'ESTADO'.padEnd(16)}DESCRIPCION`)
console.log(`  ${'─'.repeat(66)}`)
let curN=null
for(const p of plan){
  if(p.nAnt!==curN){ curN=p.nAnt; console.log(`  ${'·'.repeat(66)}`) }
  console.log(`  ${String(p.fila).padEnd(6)}${p.nAnt.padEnd(11)}${p.nNuevo.padEnd(11)}${p.estado.padEnd(16)}${p.desc}  ($${p.precio})`)
}

if(riesgo.length){
  console.log(`\n  ⚠️  GRUPOS CON 2+ APROBADAS (NO se tocan — revisar a mano, pueden estar linkeadas a proyecto/factura):`)
  for(const {n,g} of riesgo){ console.log(`     N° ${n}:`); g.forEach(x=>console.log(`        fila ${x.fila} · ${x.estado} · ${x.ag} ${x.cli} ${x.proy} ($${x.precio})`)) }
}

console.log(`\n  Nota: se conserva el número en la fila APROBADA de cada grupo (o la primera si no hay aprobada).`)
console.log(`  La columna "Fecha Presupuesto" guarda la fecha real, así que el orden cronológico no se pierde.`)

if(!GO){ console.log(`\n  ▶ Esto es SOLO PREVIEW. Para aplicar: node scripts/fix-presupuestos-duplicados.mjs --go\n`); process.exit(0) }

// ---- APLICAR ----
const data=plan.map(p=>({ range:`PRESUPUESTOS!A${p.fila}`, values:[[p.nNuevo]] }))
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId:ID, requestBody:{ valueInputOption:'RAW', data } })
// log
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',requestBody:{values:plan.map(p=>[new Date().toISOString(),'fix-duplicados','renumerar','PRESUPUESTOS',`${p.nAnt}->${p.nNuevo}`,`fila ${p.fila} ${p.desc}`])}}) }catch(e){}
console.log(`\n  ✅ Aplicado: ${plan.length} filas renumeradas.\n`)
