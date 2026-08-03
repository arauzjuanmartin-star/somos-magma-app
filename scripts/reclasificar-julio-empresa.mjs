/**
 * Pasa a EMPRESA los 7 consumos que Juan confirmó el 03/08/2026 como de Magma.
 * Estaban en Personal por la regla "ante la duda, personal" — él los revisó y son de la empresa.
 * Sin --escribir solo muestra el preview.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')
const M=n=>'$'+n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})
const num=v=>{const s=String(v??'').replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}

// comercio exacto → rubro de empresa
const REGLAS=[
  [/^TOTAL POLLO$/i,                'Producción · Comida de rodaje/equipo'],
  [/^MERPAGO\*SOSSA$/i,             'Producción · Freelancers/proveedores'],
  [/^MERPAGO\*MARIANALUCIABONAN$/i, 'Producción · Freelancers/proveedores'],
  [/^HERMOSILLA ADELA$/i,           'Producción · Freelancers/proveedores'],
  [/^MERPAGO\*DMO$/i,               'Producción · Freelancers/proveedores'],
  [/^MERPAGO\*ELECTRONICAELUNIV$/i, 'Compras · Insumos/equipos'],
  [/^MERPAGO\*GALLIOELECTRO$/i,     'Compras · Insumos/equipos'],
  [/^APPYPF 00126 TIENDA$/i,        'Producción · Nafta'],
]

const MT=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'MOVIMIENTOS_TARJETA!A:L',valueRenderOption:'FORMATTED_VALUE'})).data.values||[]
const cambios=[]
MT.forEach((r,i)=>{ if(i===0||!r)return
  if(String(r[1])!=='7'||!String(r[2]).includes('2026'))return
  if(String(r[8]).trim()!=='Personal')return
  const reg=REGLAS.find(([rx])=>rx.test(String(r[5]||'').trim()))
  if(!reg)return
  cambios.push({fila:i+1, quien:r[4], fecha:r[3], comercio:r[5], monto:num(r[7]), rubro:reg[1]}) })

console.log(`\n\x1b[1m■ A pasar de Personal → EMPRESA (${cambios.length} movimientos)\x1b[0m\n`)
const porRubro={}
cambios.forEach(c=>{ (porRubro[c.rubro]=porRubro[c.rubro]||[]).push(c) })
Object.entries(porRubro).forEach(([ru,cs])=>{
  console.log(`  \x1b[36m${ru}\x1b[0m — ${M(cs.reduce((a,c)=>a+c.monto,0))}`)
  cs.forEach(c=>console.log(`     fila ${String(c.fila).padStart(4)}  ${c.fecha.padEnd(7)} ${c.comercio.slice(0,36).padEnd(38)} ${M(c.monto).padStart(14)}  (${c.quien})`))
})
const tot=cambios.reduce((a,c)=>a+c.monto,0)
const porQuien={}
cambios.forEach(c=>porQuien[c.quien]=(porQuien[c.quien]||0)+c.monto)
console.log(`\n  \x1b[1mTOTAL ${M(tot)}\x1b[0m`)
Object.entries(porQuien).forEach(([q,v])=>console.log(`     baja del personal de ${q}: ${M(v)}`))

if(!ESCRIBIR){ console.log('\n\x1b[33mPREVIEW — no escribí nada.\x1b[0m\n'); process.exit(0) }

const data=cambios.flatMap(c=>[
  { range:`MOVIMIENTOS_TARJETA!I${c.fila}`, values:[['Empresa']] },
  { range:`MOVIMIENTOS_TARJETA!J${c.fila}`, values:[[c.rubro]] },
  { range:`MOVIMIENTOS_TARJETA!L${c.fila}`, values:[[`gastó ${c.quien} · confirmado Magma por Juan 03/08`]] },
])
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan@somosmagma.com','reclasificar-julio-empresa','MOVIMIENTOS_TARJETA','BBVA Visa 7/2026',`${cambios.length} movimientos Personal→Empresa por ${M(tot)}`]]}})
console.log(`\n\x1b[32m✓ ${cambios.length} movimientos pasados a Empresa.\x1b[0m\n`)
