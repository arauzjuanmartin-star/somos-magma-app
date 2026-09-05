// Prueba end-to-end del fix de slots: escribe un presupuesto de PRUEBA con 25 servicios
// usando el mismo mapeo que la app, lo lee de vuelta con la misma lógica que getAllData,
// verifica que los 25 lleguen enteros, y BORRA la fila.
// No consume número de presupuesto real (usa "TEST-SLOTS").
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { MAX_SLOTS, SLOT_PRESU, ANCHO_PRESU } from '../lib/slots.js'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const MARCA='TEST-SLOTS'

// ---- El caso real: Telefe Popstars, 12 jornadas + 25 contenidos = 37 líneas
const servicios=[]
for(let i=0;i<12;i++) servicios.push({svc:'📹 Video 1', precio:290000})
for(let i=0;i<25;i++) servicios.push({svc:'✂️ Edit 60s', precio:116000})
const esperado=servicios.reduce((s,x)=>s+x.precio,0)
console.log(`Escribiendo un presu de prueba con ${servicios.length} servicios (tope MAX_SLOTS=${MAX_SLOTS})`)
console.log(`Subtotal esperado: $${esperado.toLocaleString('es-AR')}\n`)
if(servicios.length>MAX_SLOTS){ console.log('🔴 Más servicios que slots — el test no aplica'); process.exit(1) }

// ---- 1. Construir la fila igual que presupuesto-nuevo.js
const row=new Array(ANCHO_PRESU).fill('')
row[0]=MARCA; row[3]='EN ESPERA'; row[5]='PRUEBA — BORRAR'; row[6]='test slots 40'
let subtotal=0
servicios.forEach((s,i)=>{ const c=SLOT_PRESU(i+1); row[c.pedido]=s.svc; row[c.precio]=s.precio; subtotal+=s.precio })
row[38]=subtotal
row[49]=servicios.map(()=>'1').join('|')

const ap=await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'PRESUPUESTOS!A:A',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:[row]}})
const fila=parseInt(String(ap.data?.updates?.updatedRange||'').match(/!\w+?(\d+)/)?.[1])
console.log(`✅ Escrito en la fila ${fila}`)

// ---- 2. Leerlo de vuelta con la misma lógica que getAllData (toPresupuestos)
const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESUPUESTOS!A:DI'})
const vals=r.data.values||[]
const H=vals[0].map(h=>String(h||''))
const pedidoCount=H.filter(h=>h.trim()==='Pedido').length
const precioCount=H.filter(h=>h.trim()==='Precio').length
const cruda=vals.find(x=>String(x[0]).trim()===MARCA)
if(!cruda){ console.log('🔴 No pude releer la fila'); process.exit(1) }
const obj={}; let pedN=0,prcN=0
H.forEach((h,i)=>{ const ht=h.trim()
  if(ht==='Pedido'&&pedidoCount>1){pedN++;obj['Pedido '+pedN]=cruda[i]||''}
  else if(ht==='Precio'&&precioCount>1){prcN++;obj['Precio '+prcN]=cruda[i]||''}
  else obj[h]=cruda[i]||'' })

// ---- 3. Verificar, servicio por servicio
const parseMonto=s=>{if(!s)return 0;const n=String(s).replace(/[^0-9.,-]/g,'').replace(/,/g,'');const f=parseFloat(n);return isNaN(f)?0:f}
let fallas=0, leido=0, sumaLeida=0
for(let i=1;i<=MAX_SLOTS;i++){
  const svc=obj['Pedido '+i]||'', prc=parseMonto(obj['Precio '+i])
  const esp=servicios[i-1]
  if(esp){
    if(svc!==esp.svc||prc!==esp.precio){ console.log(`   🔴 slot ${i}: leí "${svc}"/$${prc} y esperaba "${esp.svc}"/$${esp.precio}`); fallas++ }
    else { leido++; sumaLeida+=prc }
  } else if(svc||prc){ console.log(`   🔴 slot ${i} debería estar vacío y tiene "${svc}"/$${prc}`); fallas++ }
}
console.log(`\nServicios que volvieron enteros: ${leido}/${servicios.length}`)
console.log(`Suma leída: $${sumaLeida.toLocaleString('es-AR')} · esperada: $${esperado.toLocaleString('es-AR')} ${sumaLeida===esperado?'✅':'🔴'}`)
console.log(`Subtotal del sheet: $${parseMonto(obj['Subtotal']).toLocaleString('es-AR')}`)
console.log(`Fee Servicios: ${String(obj['Fee Servicios']||'').split('|').length} flags (esperaba ${servicios.length}) ${String(obj['Fee Servicios']||'').split('|').length===servicios.length?'✅':'🔴'}`)

// ---- 4. Borrar la fila de prueba
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(sheetId,title))'})
const sid=meta.data.sheets.find(s=>s.properties.title==='PRESUPUESTOS').properties.sheetId
await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[{deleteDimension:{range:{sheetId:sid,dimension:'ROWS',startIndex:fila-1,endIndex:fila}}}]}})
const chk=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESUPUESTOS!A:A'})).data.values||[]
const quedo=chk.some(x=>String(x[0]).trim()===MARCA)
console.log(`\n🧹 Fila de prueba borrada: ${quedo?'🔴 QUEDÓ, borrala a mano en la fila '+fila:'✅ confirmado, no quedó rastro'}`)
console.log(fallas===0&&!quedo?'\n✅✅ EL FIX FUNCIONA: 37 servicios entran y vuelven enteros':'\n🔴 hay fallas')
process.exit(fallas||quedo?1:0)
