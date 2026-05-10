import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      let v = l.slice(i+1).trim()
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1)
      return [l.slice(0, i).trim(), v]
    })
)

const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: env.GOOGLE_CLIENT_EMAIL,
    private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

const [presR, proyR] = await Promise.all([
  sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:AV' }),
  sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:AQ' }),
])

const presuVals = presR.data.values || []
const presuHeaders = presuVals[0]
const presuRows = presuVals.slice(1).map((row, i) => {
  const o = { __fila: i + 2 }
  presuHeaders.forEach((h, c) => { const k = h || `col${c}`; if (o[k]!==undefined) o[`${k}_${c}`] = row[c]||''; else o[k] = row[c]||'' })
  return o
}).filter(p => Object.values(p).some(v => v !== '' && v !== undefined))

const proyVals = proyR.data.values || []
const proyHeaders = proyVals[0]
const proyRows = proyVals.slice(1).map((row, i) => {
  const o = { __fila: i + 2 }
  proyHeaders.forEach((h, c) => { o[h] = row[c] || '' })
  return o
})

const norm = v => String(v||'').replace(/\s+/g,'').toLowerCase()
const presuN = p => p['Columna 1'] || p['col0'] || ''

const proyNs = new Set(proyRows.map(p => norm(p['N° presupuesto'])).filter(Boolean))
const aprobados = presuRows.filter(p => String(p['Estado']||'').trim().toUpperCase() === 'APROBADO')
const huerfanos = aprobados.filter(p => presuN(p) && !proyNs.has(norm(presuN(p))))

const proyNumsArr = [...proyNs]
const tieneVersion = (n) => {
  const base = String(n).replace(/[a-z]+$/i,'').trim()
  if (!base) return false
  return proyNumsArr.some(pn => pn.startsWith(norm(base)) && pn !== norm(n))
}

console.log(`\n===== ${huerfanos.length} PRESUPUESTOS APROBADOS SIN PROYECTO =====\n`)
console.log(`Listado completo (ordenado por fecha de evento):\n`)

const parseFecha = s => {
  const m = String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return new Date(0)
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
  return new Date(y, Number(m[2])-1, Number(m[1]))
}

const sorted = [...huerfanos].sort((a,b) => parseFecha(a['Fecha Evento']) - parseFecha(b['Fecha Evento']))

console.log('FILA | N°    | FECHA EVENTO | ESTADO    | AGENCIA / CLIENTE                          | PROYECTO                                      | PRECIO FINAL    | NOTAS')
console.log('-----|-------|--------------|-----------|--------------------------------------------|-----------------------------------------------|-----------------|----------')
sorted.forEach(p => {
  const n = String(presuN(p)).padEnd(5)
  const fila = String(p.__fila).padEnd(4)
  const fec = String(p['Fecha Evento']||'(sin fecha)').padEnd(12)
  const cli = String((p['Cliente']||p['Agencia']||'')).slice(0,42).padEnd(42)
  const ag  = String(p['Agencia']||'').slice(0,18).padEnd(18)
  const proy = String(p['Proyecto']||'').slice(0,45).padEnd(45)
  const precio = String(p['Precio Final']||'').padEnd(15)
  const versionado = tieneVersion(presuN(p)) ? '⚠ tiene versión similar' : ''
  console.log(`${fila} | ${n} | ${fec} | ${ag.slice(0,9).padEnd(9)} | ${cli} | ${proy} | ${precio} | ${versionado}`)
})

const csv = [
  ['Fila','N°','Estado','Fecha Evento','Agencia','Cliente','Proyecto','Cant. Fechas','Precio Final','PM Interno','Versión similar'].join(','),
  ...sorted.map(p => [
    p.__fila,
    presuN(p),
    p['Estado'],
    p['Fecha Evento'],
    `"${(p['Agencia']||'').replace(/"/g,'""')}"`,
    `"${(p['Cliente']||'').replace(/"/g,'""')}"`,
    `"${(p['Proyecto']||'').replace(/"/g,'""')}"`,
    p['Cant. Fechas']||'',
    `"${(p['Precio Final']||'').replace(/"/g,'""')}"`,
    `"${(p['PM Interno']||'').replace(/"/g,'""')}"`,
    tieneVersion(presuN(p)) ? 'SI' : '',
  ].join(','))
].join('\n')

writeFileSync('huerfanos-presupuestos.csv', csv)
console.log(`\nCSV guardado en: huerfanos-presupuestos.csv`)
console.log(`\nTotales:`)
console.log(`  Total huérfanos: ${huerfanos.length}`)
console.log(`  Con versión similar en proyectos: ${huerfanos.filter(p => tieneVersion(presuN(p))).length}`)
console.log(`  Eventos pasados (antes hoy): ${sorted.filter(p => parseFecha(p['Fecha Evento']) < new Date()).length}`)
console.log(`  Eventos futuros: ${sorted.filter(p => parseFecha(p['Fecha Evento']) >= new Date()).length}`)
