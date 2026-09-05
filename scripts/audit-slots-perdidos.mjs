// ¿Hay presupuestos con más servicios de los que entran en el sheet?
// Compara la cantidad de servicios que la app dice haber cargado ('Fee Servicios',
// un CSV de flags con un item por servicio) contra los que realmente están escritos.
//
// Antes del 2026-08-20 el sheet cortaba en 12 y los de más se perdían para siempre.
// Ahora entran MAX_SLOTS. Este script sirve para dos cosas:
//   1) listar el daño histórico (líneas que hay que volver a cargar a mano)
//   2) confirmar que no se esté generando daño nuevo
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { MAX_SLOTS, SLOT_PRESU } from '../lib/slots.js'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const parse=s=>{if(!s)return 0;const n=String(s).replace(/[^0-9.,-]/g,'').replace(/,/g,'');const f=parseFloat(n);return isNaN(f)?0:f}

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESUPUESTOS!A1:DI700'})
const v=r.data.values||[]; const H=v[0]
const iFee=H.indexOf('Fee Servicios'), iSub=H.indexOf('Subtotal')

// ¿Hasta qué slot tiene columnas el sheet de verdad?
let slotsReales=0
for(let n=1;n<=MAX_SLOTS;n++){ if(H.indexOf(`Pedido ${n}`)!==-1 || (n===1&&H.indexOf('Pedido')!==-1)) slotsReales=n }
console.log(`Slots en el sheet: ${slotsReales} · MAX_SLOTS en el código: ${MAX_SLOTS} ${slotsReales>=MAX_SLOTS?'✅ alineados':'🔴 el sheet quedó corto, correr ampliar-slots-pedidos.mjs'}`)
console.log(`Columnas de PRESUPUESTOS: ${H.length}\n`)

const afectados=[]
v.slice(1).forEach((row,i)=>{
  const fee=(row[iFee]||'').trim(); if(!fee) return
  const nCargados=fee.split('|').length
  // cuántos están realmente escritos
  let nEscritos=0, sumaEscrita=0
  for(let n=1;n<=slotsReales;n++){
    const c=SLOT_PRESU(n)
    const ped=row[c.pedido]||'', prc=parse(row[c.precio])
    if(ped||prc>0){ nEscritos++; sumaEscrita+=prc }
  }
  if(nCargados<=nEscritos) return
  const sub=parse(row[iSub])
  afectados.push({fila:i+2,nro:row[0],estado:row[3],ag:row[4],cl:row[5],proy:row[6],
    nCargados,nEscritos,sumaEscrita,sub,perdido:sub-sumaEscrita,total:parse(row[45])})
})

if(!afectados.length){ console.log('✅ Ningún presupuesto perdió servicios.'); process.exit(0) }

console.log(`=== ${afectados.length} PRESUPUESTOS CON SERVICIOS QUE NO LLEGARON AL SHEET ===`)
console.log('   (daño histórico: el detalle de esas líneas no se puede recuperar solo,')
console.log('    hay que volver a cargarlas a mano. El Subtotal y el Total SÍ están bien.)\n')
let totalPerdido=0
afectados.sort((a,b)=>b.perdido-a.perdido).forEach(a=>{
  totalPerdido+=a.perdido
  const prio = a.estado==='APROBADO' ? '⚠️  APROBADO — el proyecto tiene el costo subestimado' : a.estado
  console.log(`#${a.nro} (fila ${a.fila}) · ${prio} · ${a.ag}/${a.cl} · ${a.proy}`)
  console.log(`   la app cargó ${a.nCargados} servicios, en el sheet quedaron ${a.nEscritos} → faltan ${a.nCargados-a.nEscritos} líneas`)
  console.log(`   escrito $${a.sumaEscrita.toLocaleString('es-AR')} · Subtotal real $${a.sub.toLocaleString('es-AR')} · sin detalle $${a.perdido.toLocaleString('es-AR')}\n`)
})
console.log(`COSTO SIN DETALLE EN EL SHEET: $${totalPerdido.toLocaleString('es-AR')}`)
