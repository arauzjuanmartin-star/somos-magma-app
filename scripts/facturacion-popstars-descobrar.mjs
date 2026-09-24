// Popstars (Telefe) #2255 y #2256: quedaron "Cobrada" en FACTURACION por el botón "Ya está ✓" (14/09/2026,
// admin@ = Flor) con el tilde "Ya la cobré también" que venía marcado por defecto. No se cobró ninguna:
// solo se mandó la factura. Este script las vuelve a "facturada, pendiente de cobro".
//
//   node scripts/facturacion-popstars-descobrar.mjs              → preview (no escribe)
//   node scripts/facturacion-popstars-descobrar.mjs --escribir   → aplica
//   agregar --sin-vencimiento para NO cargar Plazo "90 días" + Vencimiento (Telefe paga a 90 días fecha de factura)
//
// No toca CUENTAS ni RESERVAS: "Ya está ✓" nunca sumó saldo (verificado: 0 movimientos con 2255/2256).
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir'), CON_VENC=!process.argv.includes('--sin-vencimiento')
const NROS=['2255','2256'], PLAZO_DIAS=90
const colLetra=i=>{let s='',c=i+1;while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26)}return s}
const parseD=s=>{const m=String(s||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1]):null}
const fmtD=d=>`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`

const leer=async()=>{const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'FACTURACION!A:AH',valueRenderOption:'FORMATTED_VALUE'});return r.data.values||[]}
const rows=await leer(); const H=rows[0]; const I=n=>{const i=H.indexOf(n); if(i<0) throw new Error('No existe la columna '+n); return i}
const iNro=I('N° Presupuesto'), iCob=I('Cobrado'), iFCob=I('Fecha cobro'), iMCob=I('Monto cobrado'), iEv=I('Fecha Evento'), iEmi=I('Fecha emision'), iPlazo=I('Plazo'), iVenc=I('Vencimiento'), iCli=I('Cliente'), iNeto=I('Precio SIN IVA'), iNroFc=I('Nro de Factura')

const updates=[], resumen=[]
for(const nro of NROS){
  const filas=rows.map((r,i)=>({r,fila:i+1})).filter(x=>x.fila>1 && String(x.r[iNro]||'').trim()===nro)
  if(filas.length!==1) throw new Error(`#${nro}: esperaba 1 fila en FACTURACION, hay ${filas.length}`)
  const {r,fila}=filas[0]
  // Guardas: que sea exactamente la fila del bug (Popstars, cobrada, fecha cobro = fecha evento, sin N° de factura)
  if(String(r[iCli]||'').trim()!=='Popstars') throw new Error(`#${nro} fila ${fila}: cliente "${r[iCli]}" ≠ Popstars`)
  if(String(r[iCob])!=='TRUE') throw new Error(`#${nro} fila ${fila}: Cobrado="${r[iCob]}", no está marcada. Nada que hacer.`)
  if(String(r[iFCob]||'')!==String(r[iEv]||'')) throw new Error(`#${nro} fila ${fila}: Fecha cobro "${r[iFCob]}" ≠ Fecha Evento "${r[iEv]}" — no es la huella de "Ya está ✓", revisar a mano`)
  if(String(r[iNroFc]||'').trim()) throw new Error(`#${nro} fila ${fila}: tiene N° de factura ${r[iNroFc]}, revisar a mano`)
  const emi=parseD(r[iEmi]); if(!emi) throw new Error(`#${nro}: Fecha emision inválida "${r[iEmi]}"`)
  const venc=new Date(emi.getTime()+PLAZO_DIAS*864e5)
  const cambios=[
    [iCob, r[iCob], false],
    [iFCob, r[iFCob]||'', ''],
    [iMCob, r[iMCob]||'', ''],
  ]
  if(CON_VENC){ cambios.push([iPlazo, r[iPlazo]||'', `${PLAZO_DIAS} días`]); cambios.push([iVenc, r[iVenc]||'', fmtD(venc)]) }
  resumen.push({nro, fila, proyecto:r[I('Proyecto')], neto:r[iNeto], cambios})
  cambios.forEach(([i,,nuevo])=>updates.push({range:`FACTURACION!${colLetra(i)}${fila}`, values:[[nuevo]]}))
}

console.log(ESCRIBIR?'\n✍️  ESCRIBIENDO en FACTURACION':'\n👀 PREVIEW (no escribe; agregá --escribir para aplicar)')
for(const x of resumen){
  console.log(`\n#${x.nro} · ${x.proyecto} · ${x.neto} · fila ${x.fila}`)
  x.cambios.forEach(([i,antes,nuevo])=>console.log(`   ${colLetra(i).padEnd(3)} ${H[i].padEnd(14)} ${JSON.stringify(antes).padEnd(14)} → ${JSON.stringify(nuevo)}`))
}
if(!ESCRIBIR) process.exit(0)

await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID, requestBody:{valueInputOption:'USER_ENTERED', data:updates}})
// Verificación post-escritura
const rows2=await leer(); let ok=true
for(const x of resumen){ const r=rows2[x.fila-1]; for(const [i,,nuevo] of x.cambios){ const v=r[i]??''; const esp=nuevo===false?'FALSE':String(nuevo); if(String(v)!==esp){ ok=false; console.log(`❌ #${x.nro} ${H[i]}: quedó "${v}", esperaba "${esp}"`) } } }
await sheets.spreadsheets.values.append({spreadsheetId:ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED', requestBody:{values: resumen.map(x=>[new Date().toISOString(),'script','facturacion-descobrar','FACTURACION',x.nro,`Popstars: vuelve a pendiente de cobro (estaba "cobrada" por Ya está ✓ del 14/09)${CON_VENC?` + plazo ${PLAZO_DIAS} días`:''}`])}})
console.log(ok?'\n✅ Verificado: las 2 facturas quedaron como facturadas SIN cobrar. LOG escrito.':'\n⚠️ Algo no quedó como se esperaba, revisar arriba.')
