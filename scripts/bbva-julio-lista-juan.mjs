/**
 * BBVA julio 2026 — clasificación definitiva de Juan (03/08/2026):
 * la lista que pasó es EXHAUSTIVA: eso es lo personal de cada uno, TODO el resto es de Magma.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const M=n=>'$'+n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})
const num=v=>{const s=String(v??'').replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}

// lo ÚNICO personal de la BBVA, según Juan
const PERSONAL=[
  [/MERPAGO\*CHIPOTE/i,'Juan'], [/MERPAGO\*MERCADOLIBRE/i,'Juan'], [/^TOPPER/i,'Juan'],
  [/MERPAGO\*PASAJESCDP/i,'Juan'], [/^EQUUS/i,'Juan'], [/^NETFLIX/i,'Juan'],
  [/EL MUNDO DEL JUGUETE/i,'Juan'], [/MERPAGO\*DMO/i,'Juan'],
  [/MERPAGO\*FLORIAN/i,'Sofi'], [/MERPAGO\*LUBOLOQUE/i,'Sofi'], [/^47 STREET/i,'Sofi'],
  [/^ZARA/i,'Sofi'], [/^LAS PEPAS/i,'Sofi'], [/MERPAGO\*TOYOTATREOS/i,'Sofi'], [/MERPAGO\*MISHKA/i,'Sofi'],
]
const RUBRO=c=>
  /rappi|pedidosya/i.test(c)                                        ? 'Producción · Comida de rodaje/equipo'
: /dia tienda|super|prospero|cramer|carrefour/i.test(c)             ? 'Compras · Súper/almacén'
: /pedrera|pollo|mc donalds|res cris|gato|brooklyn|anchorena|kiosco|farola|parrilla/i.test(c) ? 'Producción · Comida de rodaje/equipo'
: /passline|venti|festival/i.test(c)                                ? 'Producción · Entradas/acreditaciones'
: /youtube|google|apple|netflix/i.test(c)                           ? 'Software · Web/productividad'
: /rouge|juguete|topper|zara|pepas|street/i.test(c)                  ? 'Compras · Insumos/equipos'
: /merpago|hermosilla|mora andrea/i.test(c)                         ? 'Producción · Freelancers/proveedores'
:                                                                     'Producción · Freelancers/proveedores'

const MT=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'MOVIMIENTOS_TARJETA!A:L'})).data.values||[]
const data=[], log={aEmpresa:[], aPersonal:[]}
MT.forEach((r,i)=>{ if(i===0||!r)return
  if(r[0]!=='BBVA Visa'||String(r[1])!=='7'||!String(r[2]).includes('2026'))return
  if(r[4]==='Magma')return                       // los cargos del banco no se tocan
  const com=String(r[5]||''), esP=String(r[8]).trim()==='Personal'
  const hit=PERSONAL.find(([rx])=>rx.test(com))
  const fila=i+1
  if(hit&&!esP){
    data.push({range:`MOVIMIENTOS_TARJETA!E${fila}:J${fila}`, values:[[hit[1],com,r[6],num(r[7]),'Personal','Personal']]})
    log.aPersonal.push({com, m:num(r[7]), q:hit[1]})
  } else if(!hit&&esP){
    data.push({range:`MOVIMIENTOS_TARJETA!I${fila}:J${fila}`, values:[['Empresa',RUBRO(com)]]})
    data.push({range:`MOVIMIENTOS_TARJETA!L${fila}`, values:[[`gastó ${r[4]} · Magma según lista de Juan 03/08`]]})
    log.aEmpresa.push({com, m:r[6]==='ARS'?num(r[7]):0, moneda:r[6]})
  }
})
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
const sE=log.aEmpresa.reduce((a,x)=>a+x.m,0), sP=log.aPersonal.reduce((a,x)=>a+x.m,0)
console.log(`\n  ✓ Personal → Empresa: ${log.aEmpresa.length} movimientos · ${M(sE)}`)
console.log(`  ✓ Empresa → Personal: ${log.aPersonal.length} movimientos · ${M(sP)}`)
log.aPersonal.forEach(x=>console.log(`      ${x.com.slice(0,44).padEnd(46)} ${M(x.m).padStart(14)} → ${x.q}`))
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan@somosmagma.com','bbva-julio-lista-juan','MOVIMIENTOS_TARJETA','BBVA Visa 7/2026',`${log.aEmpresa.length}→Empresa (${M(sE)}) · ${log.aPersonal.length}→Personal`]]}})
