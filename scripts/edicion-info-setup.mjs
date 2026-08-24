// Crea la solapa EDICION_INFO: el "cómo trabajamos" del área de post.
// Es el espacio editable desde la app (tipo Notion) donde vive todo lo que un
// editor nuevo necesita saber sin preguntar. Se siembra con lo que ya está
// definido en el manual de edición; el resto lo completa el equipo desde la app.
//
//   node scripts/edicion-info-setup.mjs              → preview
//   node scripts/edicion-info-setup.mjs --escribir

import { google } from 'googleapis'
import { readFileSync } from 'fs'

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

export const HEADERS_INFO = ['Orden','Titulo','Contenido','Actualizado','Por']

const SEMILLA = [
  ['10', 'Cómo llega el material',
`El material vive en el shared drive CRUDO, en la carpeta del proyecto:
CR_AGENCIA / CR_CLIENTE / AÑO / NRO_FECHA_Proyecto / Videos (o Fotos)

La carpeta se crea sola cuando se aprueba el presupuesto. El link está en el tablero, en cada entregable.
Si la carpeta está vacía, el estado es "Sin material": avisá desde el botón Preguntar en vez de esperar.`],

  ['20', 'Setup técnico de la casa',
`Cámaras Sony (FX3 / FX30 / A7) → XAVC S H.264/H.265.
Hay que generar PROXIES sí o sí para editar en Premiere.
Premiere Pro es el estándar de Magma: los proyectos se entregan en .prproj.`],

  ['30', 'Qué se entrega',
`De un evento, lo típico:
· Resumen 16:9
· Reels verticales 9:16

No alcanza con el export. Se entrega:
· El export final
· El proyecto de Premiere (.prproj)
· La gráfica usada
· La música usada

Un trabajo sin proyecto entregado no está terminado — tiene que poder retomarse a los 3 meses sin depender del disco de nadie.`],

  ['40', 'Plazos',
`Se cuentan en días hábiles desde que el material está COMPLETO (no desde la fecha del evento si el crudo llegó tarde).
· Reels / verticales / 15-30s / motion → 48 hs hábiles
· Fotos → 3 días hábiles
· Resumen 60s y 60s+ → 4 días hábiles

El tablero calcula la fecha sola con esta regla y la muestra en el semáforo.
Si a un trabajo le corresponde otro plazo, se cambia a mano en "Entregar el" y queda fijado.`],

  ['50', 'Revisiones',
`2 rondas de revisión incluidas. La tercera se cotiza aparte.
Cambiar el enfoque no es una revisión: es una versión nueva y se cotiza.
Los cambios pedidos se escriben en la bitácora del entregable, no por WhatsApp — así queda registro de qué se pidió y cuándo.`],

  ['60', 'Fotos — cómo se entregan',
`Las fotos SIEMPRE van a la carpeta del cliente en ENTREGAS CLIENTES, nunca a CRUDO.
Nombre de archivo: S.Magma-<Proyecto>_<NNN>.jpg  (numeración con 3 dígitos: 001, 002…)
Orden ascendente por número original de captura.

A completar con Dani: criterio de selección (cuántas de cuántas), nivel de retoque, si va adelanto rápido antes de la entrega final.`],

  ['70', 'Dónde va la entrega',
`La carpeta de entrega también se crea sola al aprobar:
ENTREGAS CLIENTES / CLIENTE / AÑO / NRO_FECHA_Proyecto / Fotos (o Videos)

Si el cliente además pide el crudo, se le da desde el tablero con "Dar crudo": pone un acceso directo dentro de su carpeta de entrega. Nunca copiar archivos ni mandar el link de CRUDO por afuera.`],

  ['80', 'Pago y facturación',
`El 15 de cada mes se paga TODO el mes anterior de una, por persona (no trabajo por trabajo).
La factura tiene que estar antes del día 5.`],

  ['90', 'Lo que no se hace',
`· El editor no habla con el cliente.
· No se publica ni se muestra material sin permiso.
· No se entrega nada por fuera de la carpeta del proyecto.`],

  ['100', 'Accesos y herramientas — A COMPLETAR',
`Falta definir y escribir acá:
· Qué biblioteca de música licenciada usa Magma (Artlist / Epidemic / Musicbed) y cómo se pide el acceso.
· Dónde están las plantillas de gráfica y los logos.
· Qué LUT / look se usa por cliente, si hay alguno fijo.`],

  ['110', 'Preguntas',
`Si algo no está acá, preguntá desde el botón "Preguntar" del entregable: la pregunta queda enganchada al trabajo, sube al tope del tablero en rojo y el equipo la ve.
Cuando se responde, la respuesta queda en la bitácora de ese entregable.
Si la pregunta sirve para todos, la respuesta se sube a esta página.`],
]

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
const existe = meta.data.sheets.find(s => s.properties.title === 'EDICION_INFO')

console.log('════════ EDICION_INFO ════════\n')
if (existe) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'EDICION_INFO!A:E' })
  console.log(`Ya existe con ${Math.max(0,(r.data.values||[]).length-1)} secciones. No la toco.`)
  process.exit(0)
}
console.log(`Se crea con ${SEMILLA.length} secciones:`)
SEMILLA.forEach(s => console.log(`   ${s[0].padStart(4)}  ${s[1]}`))

if (ESCRIBIR) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: 'EDICION_INFO', gridProperties: { rowCount: 200, columnCount: 6, frozenRowCount: 1 } } } }] },
  })
  const ahora = new Date().toISOString()
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: 'EDICION_INFO!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS_INFO, ...SEMILLA.map(s => [...s, ahora, 'setup'])] },
  })
  const m2 = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
  const sid = m2.data.sheets.find(s => s.properties.title === 'EDICION_INFO').properties.sheetId
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [
      { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red:0.94, green:0.93, blue:0.91 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } },
      { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 700 }, fields: 'pixelSize' } },
    ] },
  })
  console.log('\n✅ Creada.')
} else {
  console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.')
}
