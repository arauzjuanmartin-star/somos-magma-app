// Crea en PRESUPUESTOS el presupuesto formal de la gira de Total Producciones (35 jornadas
// por la Provincia de Buenos Aires, dic 2026 – jun 2027), con la misma estructura que
// escribe pages/api/presupuesto-nuevo.js y los totales de lib/desglose.js.
//
// Modelado como Popstars #2257: UNA línea por servicio con el costo de las 35 jornadas
// sumado (la app expande "× cantidad" en filas y 35 Film + 35 Edit superan los 40 slots).
//
// Uso:  node scripts/presu-gira-total-producciones.mjs             → preview, no escribe
//       node scripts/presu-gira-total-producciones.mjs --escribir  → graba la fila + LOG
// Después de grabar: node scripts/presupuestos-verificar.mjs 30
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { recalcularTotales } from '../lib/desglose.js'
import { SLOT_PRESU, COL_DESGLOSAR, COL_BRIEF_ED, HEADERS_BRIEF_ED, ANCHO_PRESU_FILA } from '../lib/slots.js'

const ESCRIBIR = process.argv.includes('--escribir')

// ── Lo que se le propuso a Jazmin (artifact "Gira Total Producciones", 15/09/2026) ──
const JORNADAS_E1 = 15, PRECIO_E1 = 700_000   // dic–feb, 5 por mes
const JORNADAS_E2 = 20, PRECIO_E2 = 770_000   // mar–jun, 5 por mes
const JORNADAS = JORNADAS_E1 + JORNADAS_E2    // 35
const PRECIO_FINAL = JORNADAS_E1 * PRECIO_E1 + JORNADAS_E2 * PRECIO_E2  // sin IVA

// ── Costos (lista TARIFAS: media jornada $220.000; edición in-house como en #2277) ──
const COSTO_FILM_MEDIA = 220_000
const COSTO_EDIT_60S   = 100_000

const items = [
  { pedido: '🎬 Film ½',   costo: JORNADAS * COSTO_FILM_MEDIA, fee: true },
  { pedido: '✂️ Edit 60s', costo: JORNADAS * COSTO_EDIT_60S,   fee: true },
]
const t = recalcularTotales(items, { gan: true, iibb: true, interesPct: 0, totalObjetivo: PRECIO_FINAL })

const OBSERVACIONES =
  `Gira por la Provincia de Buenos Aires: ${JORNADAS} jornadas entre diciembre 2026 y junio 2027, recorrido y fechas a definir. ` +
  `Precio por jornada: $${PRECIO_E1.toLocaleString('es-AR')} de diciembre a febrero y $${PRECIO_E2.toLocaleString('es-AR')} de marzo a junio, + IVA. ` +
  `El total contempla ${JORNADAS_E1} jornadas en la etapa 1 y ${JORNADAS_E2} en la etapa 2; se factura mensualmente por las jornadas realizadas. ` +
  `Cada jornada: 1 filmmaker foto + video (hasta 4 hs), 1 video resumen + adaptación al otro formato (4 días hábiles) y fotos (3 días hábiles). ` +
  `Viáticos aparte, cotizados al confirmar cada fecha según la localidad. ` +
  `Drone incluido cuando el filmmaker de la parada lo opera y ANAC lo permite. Fechas con 10 días de anticipación.`

const hoy = new Date()
const dd = n => String(n).padStart(2, '0')
const FECHA_HOY = `${dd(hoy.getDate())}/${dd(hoy.getMonth() + 1)}/${hoy.getFullYear()}`

const campos = {
  'Fecha Evento': '01/12/2026',
  'PM Interno': 'Juan',
  'Estado': 'EN ESPERA',
  'Agencia': 'Total Producciones',
  'Cliente': 'Gira PBA',
  'Proyecto': 'Gira Provincia de Buenos Aires · 35 jornadas (dic 2026 – jun 2027)',
  'Cant. Fechas': JORNADAS,
  'Precio Final': t.total,
  'Fecha Presupuesto': FECHA_HOY,
  'Contacto': 'Jazmin',
  'Subtotal': t.subtotal, 'Fee Agencia': t.fee, 'Impuesto a las ganancias': t.gan, 'IIBB': t.iibb,
  'Plazo': '15 días', 'Interes %': '', 'Interes $': t.interes, 'Total': t.total, 'Ajuste': t.ajuste,
  'Tipo Fechas': 'tentativa',
  'Fechas Adicionales': '',           // recorrido sin definir: no inventamos 35 fechas
  'Fee Servicios': items.map(i => i.fee ? 1 : 0).join('|'),
  'Observaciones': OBSERVACIONES,
  'Horario': '', 'Ubicación': 'Provincia de Buenos Aires (recorrido a definir)',
  'Contacto Lugar': 'Jazmin',
  'Es Adicional': items.map(() => 0).join('|'),
  'Precio Cliente Manual': items.map(() => '').join('|'),
  'Desglosar': false,
  'Ed. Clase': 'Activación de marca', 'Ed. Duración': '60 s', 'Ed. Formato': 'Los dos',
  'Ed. Red': '', 'Ed. Gráfica': 'Sí', 'Ed. Material': 'Lo filmamos nosotros',
}

// ── Fila con la misma posición de columnas que el endpoint ──
const armarFila = (numero) => {
  const row = new Array(ANCHO_PRESU_FILA).fill('')
  row[0] = numero
  row[1] = campos['Fecha Evento']; row[2] = campos['PM Interno']; row[3] = campos['Estado']
  row[4] = campos['Agencia']; row[5] = campos['Cliente']; row[6] = campos['Proyecto']
  row[7] = campos['Cant. Fechas']; row[8] = campos['Precio Final']; row[9] = campos['Fecha Presupuesto']; row[10] = campos['Contacto']
  items.forEach((it, k) => { const c = SLOT_PRESU(k + 1); row[c.pedido] = it.pedido; row[c.precio] = it.costo })
  row[38] = campos['Subtotal']; row[39] = campos['Fee Agencia']; row[40] = campos['Impuesto a las ganancias']; row[41] = campos['IIBB']
  row[42] = campos['Plazo']; row[43] = campos['Interes %']; row[44] = campos['Interes $']; row[45] = campos['Total']; row[46] = campos['Ajuste']
  row[47] = campos['Tipo Fechas']; row[48] = campos['Fechas Adicionales']; row[49] = campos['Fee Servicios']; row[50] = ''
  row[51] = campos['Observaciones']; row[52] = campos['Horario']; row[53] = campos['Ubicación']; row[54] = campos['Contacto Lugar']
  row[55] = campos['Es Adicional']; row[56] = campos['Precio Cliente Manual']
  row[COL_DESGLOSAR] = campos['Desglosar']
  HEADERS_BRIEF_ED.forEach((h, i) => { row[COL_BRIEF_ED + i] = campos[h] })
  return row
}

const $ = n => '$' + Math.round(n).toLocaleString('es-AR')
console.log(`\n══ PRESUPUESTO FORMAL · Gira Total Producciones ══  ${ESCRIBIR ? '✍️  ESCRIBIENDO' : '👀 PREVIEW (no escribe)'}\n`)
console.log(`Precio final: ${$(t.total)} + IVA  =  ${JORNADAS_E1} × ${$(PRECIO_E1)} + ${JORNADAS_E2} × ${$(PRECIO_E2)}`)
console.log(`Servicios:    ${items.map(i => `${i.pedido} ${$(i.costo)} (${JORNADAS} × ${$(i.costo / JORNADAS)})`).join('  ·  ')}`)
console.log(`Subtotal ${$(t.subtotal)} + Fee ${$(t.fee)} (×1,086) + Gan ${$(t.gan)} + IIBB ${$(t.iibb)} + Ajuste ${$(t.ajuste)} = ${$(t.subtotal + t.fee + t.gan + t.iibb + t.interes + t.ajuste)}  ${t.subtotal + t.fee + t.gan + t.iibb + t.interes + t.ajuste === t.total ? '✓ cierra' : '✗ NO CIERRA'}`)
console.log(`Margen Magma sobre el precio: ${(((t.total - t.subtotal) / t.total) * 100).toFixed(1)} %  (fee+impuestos ${$(t.total - t.subtotal)}; de eso la edición in-house son otros ${$(items[1].costo)})`)
console.log(`Por jornada: cobra ${$(t.total / JORNADAS)} · staff ${$(COSTO_FILM_MEDIA)} · edición ${$(COSTO_EDIT_60S)} · queda ${$(t.total / JORNADAS - COSTO_FILM_MEDIA - COSTO_EDIT_60S)}\n`)
console.log('Campos de la fila:')
for (const [k, v] of Object.entries(campos)) if (v !== '' && v !== undefined) console.log(`  ${k.padEnd(26)} ${typeof v === 'number' ? v.toLocaleString('es-AR') : v}`)

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const col = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:A' })
const nums = (col.data.values || []).slice(1).map(r => parseInt(String(r[0] || '').match(/^(\d+)/)?.[1] || 0)).filter(n => n > 0)
const numero = Math.max(...nums) + 1
const yaExiste = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:G' })).data.values
  .some(r => /total producciones/i.test(r[4] || '') && /gira/i.test((r[5] || '') + (r[6] || '')))
console.log(`\nN° que se asignaría: #${numero}${yaExiste ? '\n⚠️  YA HAY un presu "Gira" de Total Producciones en PRESUPUESTOS — no grabo dos veces.' : ''}`)

if (!ESCRIBIR) { console.log('\nPara grabar: node scripts/presu-gira-total-producciones.mjs --escribir'); process.exit(0) }
if (yaExiste) process.exit(1)

const row = armarFila(numero)
await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:A', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] } })
await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'juan@somosmagma.com (script presu-gira)', 'presupuesto-nuevo', 'PRESUPUESTOS', String(numero), `cliente=${campos['Cliente']} agencia=${campos['Agencia']} total=${t.total}`]] } })

// Verificación: releer la fila y chequear que los números cierran donde cayeron
const back = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:DP' })).data.values
const h = back[0], fila = back.find(r => String(r[0]).trim() === String(numero))
const leer = n => fila[h.indexOf(n)]
const parse = v => Number(String(v || '').replace(/[\s$,]/g, '')) || 0
const suma = ['Subtotal', 'Fee Agencia', 'Impuesto a las ganancias', 'IIBB', 'Interes $', 'Ajuste'].reduce((s, k) => s + parse(leer(k)), 0)
console.log(`\n✅ Grabado #${numero}. Releído: Precio Final ${leer('Precio Final')} · Pedido 1 ${leer('Pedido 1')} ${leer('Precio 1')} · Pedido 2 ${leer('Pedido 2')} ${leer('Precio 2')} · Estado ${leer('Estado')}`)
console.log(`   Suma de componentes ${suma.toLocaleString('es-AR')} vs Precio Final ${parse(leer('Precio Final')).toLocaleString('es-AR')} → ${suma === parse(leer('Precio Final')) ? '✓ cierra' : '✗ NO CIERRA, avisar a Juan'}`)
console.log(`   Ed. Clase en su columna: "${leer('Ed. Clase')}" · Desglosar: ${leer('Desglosar')}`)
console.log('\nAhora: node scripts/presupuestos-verificar.mjs 30  ·  y abrir https://somos-magma-app.vercel.app/presupuesto?nro=' + numero + ' para bajar el PDF')
