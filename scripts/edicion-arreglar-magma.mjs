// Saca "Somos Magma" del campo Editor de las filas ya cargadas.
//
// En PROYECTOS ese valor significa que la plata del slot queda en la productora
// —es una etiqueta de facturación—, no que la productora edite. Al copiarse al
// tablero, esas filas figuraban asignadas y en realidad no las tenía nadie.
// Ahora quedan como "sin asignar" con la marca de que se cobran adentro.
//
//   node scripts/edicion-arreglar-magma.mjs              → preview
//   node scripts/edicion-arreglar-magma.mjs --escribir

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { HEADERS_EDICION, ES_MAGMA, limpiarPedido, estaCerrado } from '../lib/edicion.js'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1); return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }
const ULT = colLetra(HEADERS_EDICION.length - 1)

const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range:`EDICION!A:${ULT}` })
const v = r.data.values || [], h = v[0]
const c = n => h.indexOf(n)
if (c('Interno') === -1) { console.log('Falta la columna "Interno" — correr scripts/edicion-setup.mjs --escribir'); process.exit(1) }

// En las CERRADAS el nombre no molesta y el dato sirve para el histórico: se
// marcan como internas pero no se les borra nada. Solo se libera lo abierto,
// que es donde "asignado a Magma" esconde que no lo tiene nadie.
const tocar = [], soloMarcar = []
v.slice(1).forEach((f, i) => {
  if (!ES_MAGMA(f[c('Editor')])) return
  const it = { fila: i + 2, id: f[c('ID')], cli: f[c('Cliente')] || f[c('Agencia')], ent: limpiarPedido(f[c('Entregable')]), estado: f[c('Estado')] }
  ;(estaCerrado(it.estado) ? soloMarcar : tocar).push(it)
})

console.log('════ "SOMOS MAGMA" EN EL CAMPO EDITOR ════\n')
if (!tocar.length && !soloMarcar.length) { console.log('  ✓ No quedó ninguno.'); process.exit(0) }
console.log(`SE LIBERAN — abiertas, hay que asignarlas a alguien:`)
tocar.forEach(t => console.log(`  ${String(t.id).padEnd(9)} ${String(t.cli).slice(0,20).padEnd(20)} ${t.ent.padEnd(14)} ${t.estado}`))
console.log(`\nSOLO SE MARCAN como internas — ya entregadas, el nombre queda:`)
console.log(`  ${soloMarcar.length} filas (${soloMarcar.slice(0,6).map(t=>t.cli).join(', ')}${soloMarcar.length>6?'…':''})`)

if (!ESCRIBIR) { console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.'); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { valueInputOption:'USER_ENTERED', data: [
    ...tocar.flatMap(t => ([
      { range:`EDICION!${colLetra(c('Editor'))}${t.fila}`, values:[['']] },
      { range:`EDICION!${colLetra(c('Interno'))}${t.fila}`, values:[['Sí']] },
    ])),
    ...soloMarcar.map(t => ({ range:`EDICION!${colLetra(c('Interno'))}${t.fila}`, values:[['Sí']] })),
  ]},
})
console.log(`\n✅ ${tocar.length} liberadas y ${soloMarcar.length} marcadas. Las liberadas hay que asignarlas desde el tablero.`)
