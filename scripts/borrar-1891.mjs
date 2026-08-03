/**
 * Borra el proyecto 1891 (Austral · "Edición Testimonios...") de TODAS las solapas.
 * Reemplazado por 2 proyectos nuevos que ya están cobrados y pagados (dicho de Juan).
 * Preview por defecto; borra con --go. Borra de abajo hacia arriba por solapa (evita corrimiento).
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const GO = process.argv.includes('--go')
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets'+(GO?'':'.readonly')]})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()

const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets.properties'})
const gid=t=>meta.data.sheets.find(s=>s.properties.title===t)?.properties.sheetId

// solapa -> [col del N°, col descriptiva]
const objetivos=[
  {tab:'PROYECTOS', nCol:2, desc:6},
  {tab:'FACTURACION', nCol:1, desc:9},
  {tab:'PAGOS_STAFF', nCol:3, desc:4},
  {tab:'COBROS', nCol:1, desc:2},
]
const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:objetivos.map(o=>o.tab),valueRenderOption:'FORMATTED_VALUE'})
const aBorrar=[] // {tab, fila(1-based), gid, info, estado}
objetivos.forEach((o,i)=>{ const rows=r.data.valueRanges[i].values||[]
  rows.forEach((row,ri)=>{ if(ri===0)return; if(txt(row[o.nCol])==='1891'){
    aBorrar.push({tab:o.tab, fila:ri+1, gid:gid(o.tab), info:txt(row[o.desc]), estado:txt(row[10])||txt(row[4])||''}) } })
})

console.log(`\n${'█'.repeat(64)}\n  BORRAR PROYECTO 1891  ${GO?'· BORRANDO':'· PREVIEW (no borra nada)'}\n${'█'.repeat(64)}`)
if(!aBorrar.length){ console.log('  No quedan filas con 1891. Nada para borrar.'); process.exit(0) }
aBorrar.forEach(x=>console.log(`  ${x.tab.padEnd(13)} fila ${String(x.fila).padStart(4)}  ·  ${x.info.slice(0,40)}  ${x.estado?'['+x.estado+']':''}`))
const pagados=aBorrar.filter(x=>/pagad/i.test(x.estado))
if(pagados.length) console.log(`\n  ⚠️  OJO: ${pagados.length} fila(s) están marcadas PAGADO. Al borrar se pierde ese registro de pago.\n     (Según vos, ese pago ya está cubierto por los 2 proyectos nuevos de Lu.)`)

if(!GO){ console.log(`\n  ▶ PREVIEW. Para borrar: node scripts/borrar-1891.mjs --go\n`); process.exit(0) }

// borrar de abajo hacia arriba por solapa
const porTab={}; aBorrar.forEach(x=>{(porTab[x.tab]=porTab[x.tab]||[]).push(x)})
const requests=[]
Object.values(porTab).forEach(arr=>arr.sort((a,b)=>b.fila-a.fila).forEach(x=>{
  requests.push({deleteDimension:{range:{sheetId:x.gid,dimension:'ROWS',startIndex:x.fila-1,endIndex:x.fila}}})
}))
await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests}})
console.log(`\n  ✅ Borradas ${aBorrar.length} fila(s) de 1891.\n`)
