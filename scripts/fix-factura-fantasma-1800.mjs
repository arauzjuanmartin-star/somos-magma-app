/**
 * Borra la fila fantasma del presu #1800 en FACTURACION.
 *
 * #1800 (SIT 2026 - Personal, $9.438.000) está REPRESUPUESTADO: se convirtió en el
 * #1904, que sí tiene proyecto y sí se facturó (0001-00000058). La fila de 1800 quedó
 * colgada sin N° de factura ni emisión, e infla el "por cobrar" en $9,4M — Personal
 * figuraba debiendo $19,3M por un trabajo de $8,2M + IVA.
 *
 * Guarda la fila completa en LOG antes de borrar. Si el respaldo falla, no borra.
 *
 *   node scripts/fix-factura-fantasma-1800.mjs        -> preview
 *   node scripts/fix-factura-fantasma-1800.mjs --go   -> aplica
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const GO=process.argv.includes('--go')
const NRO='1800'

const txt=v=>String(v??'').trim()
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;return parseFloat(s.replace(/[^\d.]/g,''))||0}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const colL=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s}
const esTrue=v=>/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(v))

const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties)'})
const facSheet=meta.data.sheets.find(s=>s.properties.title==='FACTURACION')

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'FACTURACION',valueRenderOption:'FORMATTED_VALUE'})
const rows=r.data.values||[], H=rows[0]

// ubicar la(s) fila(s) del #1800
const hits=[]
rows.forEach((row,i)=>{ if(i>0 && txt(row[1])===NRO) hits.push({fila:i+1,row}) })
if(hits.length===0){ console.log(`No hay ninguna fila con #${NRO} en FACTURACION. Nada que hacer.`); process.exit(0) }
if(hits.length>1){ console.log(`⚠️ Hay ${hits.length} filas con #${NRO} (${hits.map(h=>h.fila).join(', ')}). Abortado por seguridad.`); process.exit(1) }

const {fila,row}=hits[0]

// chequeos de seguridad: tiene que ser la fantasma, no una factura real
const problemas=[]
if(txt(row[14])) problemas.push(`tiene N° de factura (${txt(row[14])})`)
if(txt(row[15])) problemas.push(`tiene fecha de emisión (${txt(row[15])})`)
if(esTrue(row[4])) problemas.push('está marcada como COBRADA')
if(num(row[31])>0) problemas.push(`tiene monto cobrado (${money(num(row[31]))})`)
if(problemas.length){
  console.log(`\n❌ ABORTADO: la fila ${fila} no parece la fantasma — ${problemas.join(' · ')}`)
  console.log('   Revisar a mano antes de borrar.')
  process.exit(1)
}

console.log(`\n${'='.repeat(66)}`)
console.log(GO?'APLICANDO':'PREVIEW — no se borra nada')
console.log(`${'='.repeat(66)}`)
console.log(`\nFILA A BORRAR: FACTURACION!${fila}\n`)
H.forEach((h,j)=>{ const v=txt(row[j]); if(v) console.log(`   ${colL(j).padStart(2)} ${String(h).padEnd(20)} ${v}`) })
console.log(`\n   ✓ sin N° de factura · sin fecha de emisión · sin cobrar`)

// impacto en el por cobrar
const pc=rows.slice(1).filter(x=>!esTrue(x[4])&&num(x[12])>0)
const antes=pc.reduce((s,x)=>s+num(x[12]),0)
const despues=antes-num(row[12])
console.log(`\nIMPACTO EN "POR COBRAR":`)
console.log(`   antes:   ${money(antes)}  (${pc.length} facturas)`)
console.log(`   después: ${money(despues)}  (${pc.length-1} facturas)`)
console.log(`   ajuste:  -${money(num(row[12]))}`)

if(!GO){ console.log(`\nPara aplicar:  node scripts/fix-factura-fantasma-1800.mjs --go\n`); process.exit(0) }

// respaldo en LOG antes de borrar
const snap={}
H.forEach((h,j)=>{ const v=row[j]; if(h&&v!==undefined&&txt(v)!=='') snap[h]=v })
try{
  await sheets.spreadsheets.values.append({
    spreadsheetId:ID, range:'LOG!A:F', valueInputOption:'RAW',
    requestBody:{values:[[new Date().toISOString(),'script:fix-factura-fantasma','factura-eliminar','FACTURACION',NRO,
      `fila ${fila} eliminada · fantasma de #1800 represupuestado a #1904 · BACKUP=${JSON.stringify(snap)}`]]},
  })
  console.log('\n✓ respaldo guardado en LOG')
}catch(e){
  console.log('\n❌ No se pudo guardar el respaldo en LOG. NO se borró nada.',e.message); process.exit(1)
}

await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
  {deleteDimension:{range:{sheetId:facSheet.properties.sheetId,dimension:'ROWS',startIndex:fila-1,endIndex:fila}}}
]}})
console.log(`✓ fila ${fila} borrada`)

// verificar
await new Promise(r=>setTimeout(r,1500))
const v=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'FACTURACION',valueRenderOption:'FORMATTED_VALUE'})
const V=v.data.values||[]
const queda=V.slice(1).filter(x=>txt(x[1])===NRO)
console.log(`\n${'='.repeat(66)}\nVERIFICACIÓN\n${'='.repeat(66)}`)
console.log(queda.length? `❌ Todavía hay ${queda.length} fila(s) con #${NRO}` : `✅ No queda ninguna fila con #${NRO} en FACTURACION`)
const p1904=V.slice(1).filter(x=>txt(x[1])==='1904')
console.log(p1904.length? `✅ #1904 intacta: ${txt(p1904[0][9])} · ${txt(p1904[0][12])} · factura ${txt(p1904[0][14])} · vence ${txt(p1904[0][19])}` : `❌ OJO: #1904 desapareció`)
const pcV=V.slice(1).filter(x=>!esTrue(x[4])&&num(x[12])>0)
console.log(`✅ por cobrar ahora: ${money(pcV.reduce((s,x)=>s+num(x[12]),0))} en ${pcV.length} facturas`)
