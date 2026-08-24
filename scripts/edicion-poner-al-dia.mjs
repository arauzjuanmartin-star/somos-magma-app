// Pone al día el tablero de Edición la primera vez.
//
// El problema: al sincronizar por primera vez, TODOS los entregables arrancan en
// "Sin material" y el tablero se llena de rojo con trabajos que en realidad ya se
// entregaron hace semanas. Este script propone un estado inicial honesto:
//
//   · Si el proyecto YA TIENE FACTURA EMITIDA → se entregó. Estado "Entregado".
//     (Magma factura después del evento; una factura emitida es la mejor señal
//      disponible de que el trabajo salió.)
//   · Si no hay factura → lo deja abierto y lo lista aparte para revisar a mano.
//
//   node scripts/edicion-poner-al-dia.mjs             → preview
//   node scripts/edicion-poner-al-dia.mjs --escribir
//   node scripts/edicion-poner-al-dia.mjs 20 --escribir   → solo eventos de hace +20 días

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { parseFechaAR, hoyCero, diasEntre, estaCerrado, limpiarPedido, aAR } from '../lib/edicion.js'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const MIN_DIAS = parseInt(process.argv.slice(2).find(a => /^\d+$/.test(a))) || 7

const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }

const b = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges: ['EDICION!A:R','FACTURACION!A:AG'] })
const [ed, fac] = b.data.valueRanges.map(v => v.values || [])
const hE = ed[0], hF = fac[0]
const iId = hE.indexOf('ID'), iNum = hE.indexOf('N° presupuesto'), iFe = hE.indexOf('Fecha Evento')
const iEst = hE.indexOf('Estado'), iEnt = hE.indexOf('Fecha entrega')

// Presupuestos con factura EMITIDA (tiene N° de factura cargado)
const iFNum = hF.indexOf('N° Presupuesto'), iFNro = hF.findIndex(x => /n[°º]? ?factura|nro.*factura/i.test(String(x)))
const facturados = new Set(fac.slice(1)
  .filter(r => String(r[iFNro] || '').trim())
  .map(r => String(r[iFNum] || '').trim()).filter(Boolean))

const hoy = hoyCero()
const aCerrar = [], aRevisar = []
ed.slice(1).forEach((r, i) => {
  if (!r.some(Boolean)) return
  const estado = String(r[iEst] || '').trim()
  if (estaCerrado(estado)) return
  if (estado !== 'Sin material') return          // si alguien ya lo movió, no lo tocamos
  const f = parseFechaAR(r[iFe]); if (!f) return
  const d = diasEntre(f, hoy)
  if (d < MIN_DIAS) return                        // todavía está en plazo, es normal que no tenga material
  const num = String(r[iNum] || '').trim()
  const item = { fila: i + 2, num, dias: d, cliente: r[hE.indexOf('Cliente')] || r[hE.indexOf('Agencia')], ent: limpiarPedido(r[hE.indexOf('Entregable')]) }
  if (facturados.has(num)) aCerrar.push(item); else aRevisar.push(item)
})

console.log(`\n════ PONER AL DÍA EL TABLERO ════`)
console.log(`Entregables en "Sin material" con el evento hace ${MIN_DIAS}+ días\n`)
console.log(`✅ ${aCerrar.length} con factura ya emitida → pasan a "Entregado":`)
aCerrar.forEach(x => console.log(`     #${String(x.num).padEnd(5)} ${String(x.cliente).slice(0,20).padEnd(20)} ${x.ent.padEnd(14)} hace ${x.dias}d`))
console.log(`\n⚠  ${aRevisar.length} SIN factura → quedan abiertos, hay que mirarlos:`)
aRevisar.forEach(x => console.log(`     #${String(x.num).padEnd(5)} ${String(x.cliente).slice(0,20).padEnd(20)} ${x.ent.padEnd(14)} hace ${x.dias}d`))

if (ESCRIBIR && aCerrar.length) {
  const ahora = new Date().toISOString()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: aCerrar.flatMap(x => ([
      { range: `EDICION!${colLetra(iEst)}${x.fila}`, values: [['Entregado']] },
      { range: `EDICION!${colLetra(iEnt)}${x.fila}`, values: [[aAR(hoy)]] },
      { range: `EDICION!${colLetra(hE.indexOf('Notas'))}${x.fila}`, values: [['[puesta al día] cerrado automáticamente: el proyecto ya tiene factura emitida']] },
      { range: `EDICION!${colLetra(hE.indexOf('Por'))}${x.fila}`, values: [['poner-al-dia']] },
      { range: `EDICION!${colLetra(hE.indexOf('Actualizado'))}${x.fila}`, values: [[ahora]] },
    ])) },
  })
  console.log(`\n✅ ${aCerrar.length} marcados como Entregado.`)
} else if (!ESCRIBIR) {
  console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.')
}
