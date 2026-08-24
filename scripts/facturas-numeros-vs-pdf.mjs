/** Compara el N° de factura cargado en el sheet contra el que dice el PDF de AFIP.
 *  Preview por defecto. Con --escribir corrige los que difieren SOLO en formato. */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const ESCRIBIR=process.argv.includes('--escribir')
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive.readonly']})
const sheets=google.sheets({version:'v4',auth}); const drive=google.drive({version:'v3',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const colLetra=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}
// AFIP nombra: CUIT_TIPO_PTOVENTA_NUMERO.pdf  →  0001-00000138
const RX=/(\d{11})_(\d{3})_(\d{5})_(\d{8})/
const nroDeNombre=n=>{const m=String(n||'').match(RX); return m?`${m[3].slice(-4)}-${m[4]}`:null}
// Un N° de factura es punto de venta + número. Comparamos como ENTEROS: así
// "0001-0000090" y "0001-00000090" son el MISMO número mal escrito, pero
// "0002-00000088" vs "0001-00000088" es otro punto de venta (error de verdad).
const partes=v=>{ const m=String(v||'').match(/(\d+)\D+(\d+)/); return m?{pv:parseInt(m[1]), nro:parseInt(m[2])}:null }
const mismoNumero=(a,b)=>{ const x=partes(a), y=partes(b); return !!x&&!!y&&x.pv===y.pv&&x.nro===y.nro }

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'FACTURACION!A:AG',valueRenderOption:'FORMATTED_VALUE'})
const rows=R.data.values||[], h=rows[0], F=n=>h.indexOf(n)
const iNro=F('Nro de Factura')
const formato=[], distinto=[], vacios=[], sinPdf=[]
for(let i=1;i<rows.length;i++){
  const link=String(rows[i][F('Factura')]||'').trim(); const id=(link.match(/\/d\/([^/]+)/)||[])[1]
  if(!id) continue
  let nombre=''
  try{ nombre=(await drive.files.get({fileId:id,fields:'name',supportsAllDrives:true})).data.name }catch(e){ continue }
  const real=nroDeNombre(nombre); if(!real){ sinPdf.push({fila:i+1,nombre}); continue }
  const cargado=String(rows[i][iNro]||'').trim()
  if(cargado===real) continue
  const item={fila:i+1, presu:rows[i][F('N° Presupuesto')], cargado, real, nombre, cliente:rows[i][F('Cliente')]||rows[i][F('Agencia')]||''}
  if(!cargado) vacios.push(item)
  else if(mismoNumero(cargado, real)) formato.push(item)
  else distinto.push(item)
}
// Un mismo PDF referenciado por varias filas = factura consolidada (típico de
// Austral: una factura cubre varios proyectos). Es válido, pero lo separamos:
// si en cambio alguien pegó el link repetido por error, escribiríamos un número
// que no es. Esas van aparte y no se tocan sin que Juan las mire.
const cuenta={}; for(const x of vacios) cuenta[x.real]=(cuenta[x.real]||0)+1
const vaciosUnicos=vacios.filter(x=>cuenta[x.real]===1)
const vaciosCompartidos=vacios.filter(x=>cuenta[x.real]>1)
console.log(`=== ${vaciosUnicos.length} SIN número, con PDF propio — seguro de completar ===`)
for(const x of vaciosUnicos) console.log(`  fila ${x.fila} · #${x.presu} · (vacío)  →  "${x.real}"   ${String(x.cliente).slice(0,26)}`)
console.log(`\n=== ${vaciosCompartidos.length} SIN número, pero el PDF lo comparten varias filas ===`)
console.log(`    (¿facturas consolidadas o link pegado de más? NO se tocan)`)
for(const [nro,n] of Object.entries(cuenta).filter(([,n])=>n>1)){
  console.log(`  ${nro} → ${n} filas:`)
  for(const x of vaciosCompartidos.filter(v=>v.real===nro)) console.log(`      fila ${x.fila} · #${x.presu} · ${String(x.cliente).slice(0,26)}`)
}
console.log(`\n=== ${formato.length} con el MISMO número mal escrito (solo formato) ===`)
for(const x of formato) console.log(`  fila ${x.fila} · #${x.presu} · "${x.cargado}"  →  "${x.real}"   ${String(x.cliente).slice(0,26)}`)
console.log(`\n=== ${distinto.length} donde el número NO COINCIDE — REVISAR A MANO ===`)
for(const x of distinto) console.log(`  fila ${x.fila} · #${x.presu} · sheet "${x.cargado}"  vs  PDF "${x.real}"   ${String(x.cliente).slice(0,26)}\n        archivo: ${x.nombre}`)
console.log(`\n(${sinPdf.length} PDFs con nombre libre, no se puede sacar el número del nombre)`)
if(!ESCRIBIR){ console.log('\n→ Para completar los vacíos y corregir los de formato:  node scripts/facturas-numeros-vs-pdf.mjs --escribir'); process.exit(0) }
const data=[...vaciosUnicos, ...formato].map(x=>({range:`FACTURACION!${colLetra(iNro)}${x.fila}`, values:[[x.real]]}))
if(data.length){ await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
  console.log(`\n✓ ${data.length} números corregidos`) }
console.log('NO se tocaron: los de número distinto ni los de PDF compartido.')
