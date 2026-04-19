import { getSheets } from '../../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

const TABS = [
  {
    name: 'SUELDOS',
    headers: ['Mes','Año','Persona','Tipo','Monto','Adelantos','Pagado','Fecha pago','Método','Observación'],
  },
  {
    name: 'LOG',
    headers: ['Timestamp','Usuario','Acción','Entidad','ID','Detalle'],
  },
  {
    name: 'COSTOS_PROYECTO',
    headers: ['N° proyecto','Concepto','Categoría','Monto','Fecha','Quién pagó','Reembolsado','Notas'],
  },
  {
    name: 'CUENTAS',
    headers: ['Nombre','Entidad fiscal','Banco','Tipo','Activa','Saldo actual','Última actualización','Notas'],
  },
  {
    name: 'RESERVAS',
    headers: ['Cuenta','Concepto','Monto','Fecha','Tipo','Origen','Activa','Fecha liberación','Notas'],
  },
]

const SEED_CUENTAS = [
  ['BBVA Somos Magma','Somos Magma SRL','BBVA','Banco','SÍ',0,'','Cuenta corriente principal'],
  ['Santander Lucia','Lucia Monotributo','Santander','Banco','SÍ',0,'',''],
  ['Santander Sofi','Sofia Responsable Inscripta','Santander','Banco','SÍ',0,'','Se da de baja fin abril 2026'],
  ['Galicia Sofi','Sofia Responsable Inscripta','Galicia','Banco','SÍ',0,'','Se da de baja fin abril 2026'],
  ['Efectivo','Somos Magma SRL','—','Efectivo','SÍ',0,'',''],
]

export default async function handler(req, res) {
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
    const existing = new Set(meta.data.sheets.map(s => s.properties.title))

    const created = []
    const skipped = []

    for (const tab of TABS) {
      if (existing.has(tab.name)) { skipped.push(tab.name); continue }
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: tab.name } } }] },
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${tab.name}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [tab.headers] },
      })
      created.push(tab.name)
    }

    // Seed CUENTAS only if we just created it (empty)
    if (created.includes('CUENTAS')) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'CUENTAS!A:H',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: SEED_CUENTAS },
      })
    }

    res.status(200).json({ ok: true, created, skipped, seeded: created.includes('CUENTAS') ? SEED_CUENTAS.length : 0 })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, error: err.message })
  }
}
