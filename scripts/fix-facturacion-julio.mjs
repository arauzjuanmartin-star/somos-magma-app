/**
 * Correcciones de FACTURACION confirmadas por Juan (23/07/2026):
 *   1. Awantex #1848: la fila de $1.800.000 NO va (duplicado de la ya cobrada con IVA)
 *   2. Comafi / Pani Feroz / Casa Blend: se cobran en EFECTIVO, no llevan N° de factura
 *
 *   node scripts/fix-facturacion-julio.mjs        -> preview
 *   node scripts/fix-facturacion-julio.mjs --go   -> aplica
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const GO=process.argv.includes('--go')
const txt=v=>String(v??'').trim()
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;return parseFloat(s.replace(/[^\d.]/g,''))||0}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const colL=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s}

const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties)'})
const sheetId=meta.data.sheets.find(s=>s.properties.title==='FACTURACION').properties.sheetId
const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'FACTURACION',valueRenderOption:'FORMATTED_VALUE'})
const F=r.data.values||[], H=F[0], i=n=>H.indexOf(n)
const ver=(fila,k)=>txt((F[fila-1]||[])[i(k)])

// ---- identificar por N° de presupuesto + monto, no por número de fila fijo ----
const buscar=(nro,montoEsperado)=>{
  const hits=F.map((x,n)=>({x,fila:n+1})).filter(({x,fila})=>fila>1 && txt(x[i('N° Presupuesto')])===String(nro) && (montoEsperado==null||Math.abs(num(x[i('Precio FINAL')])-montoEsperado)<1))
  return hits
}

console.log(`\n${'='.repeat(68)}\n${GO?'APLICANDO':'PREVIEW — no se escribe nada'}\n${'='.repeat(68)}`)

// ---- 1. Awantex duplicado ----
const dupAwantex=buscar('1848',1800000)
const buenaAwantex=buscar('1848',2178000)
console.log(`\n▸ 1. AWANTEX #1848 — borrar la fila duplicada\n`)
if(dupAwantex.length!==1){ console.log(`   ⚠️ esperaba 1 fila de $1.800.000 y encontré ${dupAwantex.length}. ABORTADO por seguridad.`); process.exit(1) }
const fAw=dupAwantex[0].fila
console.log(`   A BORRAR   fila ${fAw}: ${money(num(F[fAw-1][i('Precio FINAL')]))} · ${ver(fAw,'Cliente')} — ${ver(fAw,'Proyecto')} · cobrado: ${ver(fAw,'Cobrado')||'FALSE'}`)
if(buenaAwantex.length===1){ const fb=buenaAwantex[0].fila
  console.log(`   SE QUEDA   fila ${fb}: ${money(num(F[fb-1][i('Precio FINAL')]))} · factura ${ver(fb,'Nro de Factura')} · cobrado: ${ver(fb,'Cobrado')}`) }
else console.log(`   ⚠️ no encontré la fila buena de $2.178.000 — revisar antes de borrar`)

// ---- 2. Efectivo ----
const EFECTIVO=[['1935','Banco Comafi'],['2074','Pani Feroz'],['2088','Casa Blend']]
console.log(`\n▸ 2. COBROS EN EFECTIVO — marcar para que dejen de figurar sin factura\n`)
const updates=[]
EFECTIVO.forEach(([nro,quien])=>{
  const hits=buscar(nro,null).filter(({x})=>!txt(x[i('Nro de Factura')]))
  if(hits.length!==1){ console.log(`   ⚠️ #${nro} ${quien}: encontré ${hits.length} filas sin N° — se saltea`); return }
  const f=hits[0].fila
  console.log(`   fila ${f}: ${money(num(F[f-1][i('Precio FINAL')])).padStart(13)} · ${ver(f,'Cliente')||ver(f,'Agencia')} — ${ver(f,'Proyecto').slice(0,32)}`)
  console.log(`      N° de factura: (vacío)  →  "EFECTIVO"`)
  updates.push({range:`FACTURACION!${colL(i('Nro de Factura'))}${f}`, values:[['EFECTIVO']]})
})

console.log(`\n${'─'.repeat(68)}`)
console.log(`   1 fila a borrar · ${updates.length} filas a marcar como EFECTIVO`)
console.log(`   La fila borrada queda respaldada completa en LOG.`)

if(!GO){ console.log(`\nPara aplicar:  node scripts/fix-facturacion-julio.mjs --go\n`); process.exit(0) }

// ---- aplicar: primero marcar (por nº de fila), después borrar (corre los índices) ----
if(updates.length){
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'RAW',data:updates}})
  console.log(`\n✓ ${updates.length} marcadas como EFECTIVO`)
}
// respaldo de la fila antes de borrarla
const snap={}; H.forEach((h,c)=>{ const v=(F[fAw-1]||[])[c]; if(h&&txt(v)) snap[h]=v })
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'RAW',
  requestBody:{values:[[new Date().toISOString(),'script:fix-facturacion-julio','factura-eliminar','FACTURACION','1848',
    `fila ${fAw} eliminada · duplicado de Awantex (la buena es la de $2.178.000 ya cobrada) · BACKUP=${JSON.stringify(snap)}`]]}})
console.log('✓ respaldo guardado en LOG')
await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
  {deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:fAw-1,endIndex:fAw}}}]}})
console.log(`✓ fila ${fAw} borrada`)

// verificar
await new Promise(r=>setTimeout(r,1500))
const v=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'FACTURACION',valueRenderOption:'FORMATTED_VALUE'})
const V=v.data.values||[]
const quedan=V.slice(1).filter(x=>txt(x[i('N° Presupuesto')])==='1848')
console.log(`\n${'='.repeat(68)}\nVERIFICACIÓN\n${'='.repeat(68)}`)
console.log(`Awantex #1848: quedan ${quedan.length} fila(s) — ${quedan.map(x=>`${money(num(x[i('Precio FINAL')]))} (${txt(x[i('Nro de Factura')])||'sin N°'}, cobrado ${txt(x[i('Cobrado')])})`).join(' · ')}`)
EFECTIVO.forEach(([nro])=>{ const h=V.slice(1).filter(x=>txt(x[i('N° Presupuesto')])===String(nro))
  console.log(`#${nro}: ${h.map(x=>txt(x[i('Nro de Factura')])||'(sin N°)').join(' · ')}`) })
