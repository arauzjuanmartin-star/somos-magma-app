/**
 * LIMPIEZA de los 94 duplicados de Pagos_Staff.
 * 1) Duplica la solapa como backup con fecha.
 * 2) Re-verifica CADA fila antes de borrar (monto en Servicio + gemelo idéntico con servicio real).
 * 3) Borra de abajo hacia arriba para que no se corran los índices.
 * Requiere --confirmar para escribir; sin ese flag solo simula.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const CONFIRMAR = process.argv.includes('--confirmar')
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const esMonto=v=>/^\$?\s*[\d.,]+\s*$/.test(txt(v))&&txt(v)!==''

const meta=await sheets.spreadsheets.get({spreadsheetId:ID})
const hoja=meta.data.sheets.find(s=>s.properties.title==='Pagos_Staff')
if(!hoja) throw new Error('no encontré la solapa Pagos_Staff')
const sheetId=hoja.properties.sheetId
const PS=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'Pagos_Staff',valueRenderOption:'FORMATTED_VALUE'})).data.values

// índice por clave para encontrar gemelos
const idx={}
PS.slice(1).forEach((r,i)=>{ if(!r||!txt(r[1]))return
  const k=`${txt(r[3])}|${txt(r[1])}|${num(r[6])}|${txt(r[2])}`
  ;(idx[k]=idx[k]||[]).push({fila:i+2, serv:txt(r[5]), estado:txt(r[10]), pagado:num(r[7])}) })

const aBorrar=[]
PS.slice(1).forEach((r,i)=>{ if(!r||!txt(r[1]))return
  const s=txt(r[5]); if(!esMonto(s))return
  const k=`${txt(r[3])}|${txt(r[1])}|${num(r[6])}|${txt(r[2])}`
  const grupo=idx[k]||[]
  const gemelo=grupo.find(g=>g.serv&&!esMonto(g.serv))
  if(!gemelo) return                                   // sin gemelo -> NO se toca
  if(gemelo.estado!==txt(r[10])) return                // estado distinto -> NO se toca
  if(gemelo.pagado!==num(r[7])) return                 // pagado distinto -> NO se toca
  aBorrar.push({fila:i+2, monto:num(r[6]), pers:txt(r[1]), nro:txt(r[3]), gemelo:gemelo.fila}) })

console.log(`\n■ Verificación previa`)
console.log(`   filas que cumplen TODAS las condiciones para borrar: ${aBorrar.length}`)
console.log(`   monto total: ${M(aBorrar.reduce((s,x)=>s+x.monto,0))}`)
if(aBorrar.length!==94){ console.log(`\n   ⚠️ esperaba 94 y encontré ${aBorrar.length}. Abortando por seguridad.`); process.exit(1) }

if(!CONFIRMAR){
  console.log(`\n   MODO SIMULACIÓN — no se escribió nada.`)
  console.log(`   Para ejecutar de verdad: node scripts/limpiar-duplicados-staff.mjs --confirmar`)
  process.exit(0)
}

// 1) backup
const hoy=new Date()
const stamp=`${String(hoy.getDate()).padStart(2,'0')}-${String(hoy.getMonth()+1).padStart(2,'0')}`
const nombreBackup=`Pagos_Staff_backup_${stamp}`
console.log(`\n■ 1/3 · Creando backup "${nombreBackup}"…`)
await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
  {duplicateSheet:{sourceSheetId:sheetId, newSheetName:nombreBackup, insertSheetIndex:meta.data.sheets.length}}]}})
console.log(`   ✓ backup creado`)

// 2) borrar de abajo hacia arriba
console.log(`\n■ 2/3 · Borrando ${aBorrar.length} filas (de abajo hacia arriba)…`)
const filas=aBorrar.map(x=>x.fila).sort((a,b)=>b-a)
const requests=filas.map(f=>({deleteDimension:{range:{sheetId, dimension:'ROWS', startIndex:f-1, endIndex:f}}}))
for(let i=0;i<requests.length;i+=50){
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:requests.slice(i,i+50)}})
  console.log(`   … ${Math.min(i+50,requests.length)}/${requests.length}`)
}
console.log(`   ✓ borradas`)

// 3) verificar
console.log(`\n■ 3/3 · Verificando…`)
const PS2=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'Pagos_Staff',valueRenderOption:'FORMATTED_VALUE'})).data.values
let quedanMonto=0
PS2.slice(1).forEach(r=>{ if(r&&txt(r[1])&&esMonto(txt(r[5])))quedanMonto++ })
console.log(`   filas antes: ${PS.length-1}  ·  filas ahora: ${PS2.length-1}  ·  borradas: ${(PS.length-1)-(PS2.length-1)}`)
console.log(`   registros con monto en "Servicio" que quedan: ${quedanMonto} (deberían ser 8: los que no tienen gemelo)`)
console.log(`\n   Backup en la solapa "${nombreBackup}" por si hay que revertir.`)
