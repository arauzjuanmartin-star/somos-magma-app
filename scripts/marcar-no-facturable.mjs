/**
 * Marca un proyecto como NO FACTURABLE: el trabajo se hizo (y puede haberse pagado
 * al staff), pero al cliente no se le va a cobrar. Deja el registro intacto y lo
 * saca de la lista de pendientes de facturación.
 *
 * El dato va al SHEET, no hardcodeado acá: así lo ve el equipo y cualquiera puede
 * marcar otro sin tocar código. Si la columna no existe, la crea.
 *
 *   node scripts/marcar-no-facturable.mjs <n°> "<motivo>" [--escribir]
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const args=process.argv.slice(2).filter(a=>a!=='--escribir')
const NRO=args[0], MOTIVO=args[1]||'No se factura al cliente'
const ESCRIBIR=process.argv.includes('--escribir')
const COL='No facturable'
if(!NRO){ console.log('Falta el N° de presupuesto.\n  node scripts/marcar-no-facturable.mjs 1891 "motivo"'); process.exit(1) }

const txt=v=>String(v??'').trim()
const num=v=>{const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const colLetra=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CZ','Pagos_Staff!A:K'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,PS]=R.data.valueRanges.map(v=>v.values||[])
const H=PRO[0]
const fila=PRO.findIndex((r,i)=>i>0&&txt(r[2])===NRO)
if(fila<0){ console.log(`\x1b[31mNo encontré el proyecto #${NRO} en PROYECTOS.\x1b[0m`); process.exit(1) }
const r=PRO[fila]

let iCol=H.indexOf(COL)
const hayQueCrear = iCol<0
if(hayQueCrear) iCol=H.length          // se agrega al final

console.log(`\n\x1b[1m■ #${NRO} · ${txt(r[4])} · ${txt(r[6])}\x1b[0m`)
console.log(`   fecha ${txt(r[3])} · total ${M(num(r[7]))}`)
const pagos=PS.slice(1).filter(x=>txt(x[3])===NRO)
if(pagos.length){ console.log(`\n   Pagos al staff que quedan como están:`)
  pagos.forEach(x=>console.log(`      ${txt(x[1]).padEnd(24)}${M(num(x[7])||num(x[6])).padStart(12)}   ${txt(x[10])}`)) }
console.log(`\n   ${hayQueCrear?`\x1b[33mSe crea la columna "${COL}"\x1b[0m en PROYECTOS (${colLetra(iCol)})`:`Columna "${COL}" ya existe (${colLetra(iCol)})`}`)
console.log(`   Se escribe en ${colLetra(iCol)}${fila+1}: \x1b[32m"${MOTIVO}"\x1b[0m`)
console.log(`\n   El proyecto y el pago NO se borran. Solo deja de figurar entre los pendientes`)
console.log(`   de facturación, porque no se le va a cobrar al cliente.`)

if(!ESCRIBIR){ console.log('\n\x1b[33mPREVIEW — no escribí nada.\x1b[0m\n'); process.exit(0) }

// la solapa tiene un ancho fijo: si la columna cae afuera de la grilla, primero
// hay que agregarla de verdad, no alcanza con escribir en el rango.
if(hayQueCrear){
  const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId,gridProperties(columnCount)))'})
  const pro=meta.data.sheets.find(s=>s.properties.title==='PROYECTOS')
  const ancho=pro.properties.gridProperties.columnCount
  if(iCol>=ancho){
    await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
      { appendDimension:{ sheetId:pro.properties.sheetId, dimension:'COLUMNS', length:iCol-ancho+1 } }]}})
    console.log(`   (se ensanchó PROYECTOS de ${ancho} a ${iCol+1} columnas)`)
  }
}
const data=[{ range:`PROYECTOS!${colLetra(iCol)}${fila+1}`, values:[[MOTIVO]] }]
if(hayQueCrear) data.push({ range:`PROYECTOS!${colLetra(iCol)}1`, values:[[COL]] })
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan@somosmagma.com','marcar-no-facturable','PROYECTOS',NRO,MOTIVO]]}})
console.log(`\n\x1b[32m✓ #${NRO} marcado como no facturable.\x1b[0m\n`)
