import { google } from 'googleapis'
import { readFileSync } from 'fs'

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

// Helper
async function ensureSheet(title, rowCount, colCount) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties.title' })
  const tabs = meta.data.sheets.map(s => s.properties.title)
  if (tabs.includes(title)) {
    console.log(`⚠️  ${title} ya existe, no la recreo`)
    return false
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title, gridProperties: { rowCount, columnCount: colCount } } } }] },
  })
  console.log(`✓ Hoja ${title} creada`)
  return true
}

async function setHeaders(title, headers) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${title}!A1:Z1` })
  if ((r.data.values?.[0]||[]).length > 0) {
    console.log(`  ${title}: ya tiene headers, no los reescribo`)
    return
  }
  const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${title}!A1:${colLetra(headers.length-1)}1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  })
  console.log(`  ${title}: headers escritos (${headers.length} cols)`)
}

async function appendRows(title, rows) {
  if (rows.length === 0) return
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${title}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  })
  console.log(`  ${title}: ${rows.length} filas insertadas`)
}

// 1. GASTOS_FIJOS — gastos recurrentes mensuales (sueldos, alquiler, impuestos, servicios)
await ensureSheet('GASTOS_FIJOS', 200, 12)
await setHeaders('GASTOS_FIJOS', ['Categoria','Concepto','Monto','Moneda','Frecuencia','Dia pago','Persona/Cuenta','Activo','Observacion','Mes carga','Año carga','Tipo'])

// Datos iniciales (basados en lo que veo en BALANCE/RESUMEN actuales — Juan los puede ajustar)
const gastosFijos = [
  // Categoria, Concepto, Monto, Moneda, Frecuencia, Dia pago, Persona/Cuenta, Activo, Observacion, Mes carga, Año carga, Tipo
  ['Sueldos','Sueldo Juan',2285786,'ARS','mensual',5,'Juan','SI','','5','2026','sueldo'],
  ['Sueldos','Sueldo Sofi',2350277,'ARS','mensual',5,'Sofi','SI','sueldo base mensual','5','2026','sueldo'],
  ['Sueldos','Sueldo Lulu',1300000,'ARS','mensual',5,'Lulu','SI','','5','2026','sueldo'],
  ['Sueldos','Sueldo Dani',1968402,'ARS','mensual',5,'Dani','SI','','5','2026','sueldo'],
  ['Sueldos','Sueldo Tomi',1300000,'ARS','mensual',5,'Tomi','SI','','5','2026','sueldo'],
  ['Sueldos','Contador',453750,'ARS','mensual',10,'Contador','SI','','5','2026','sueldo'],
  ['Operativos','Alquiler oficina',850000,'ARS','mensual',1,'','SI','','5','2026','operativo'],
  ['Operativos','Expensas',54674,'ARS','mensual',10,'','SI','','5','2026','operativo'],
  ['Operativos','ABL',11793,'ARS','mensual',10,'','SI','','5','2026','operativo'],
  ['Operativos','Edenor',7004,'ARS','mensual',9,'','SI','','5','2026','operativo'],
  ['Operativos','Metrogas',0,'ARS','mensual',10,'','SI','','5','2026','operativo'],
  ['Operativos','CM (Community Manager)',1023000,'ARS','mensual',5,'','SI','','5','2026','operativo'],
  ['Operativos','ADOBE',59035,'ARS','mensual',15,'','SI','suscripcion','5','2026','operativo'],
  ['Impuestos','Autonomos Sofi',95500,'ARS','mensual',5,'Sofi','SI','vto fin de mes','5','2026','impuesto'],
  ['Impuestos','Monotributo Juan',589000,'ARS','mensual',20,'Juan','SI','','5','2026','impuesto'],
  ['Impuestos','Monotributo Lulu',447000,'ARS','mensual',20,'Lulu','SI','','5','2026','impuesto'],
  ['Impuestos','Monotributo Dani',92000,'ARS','mensual',20,'Dani','SI','','5','2026','impuesto'],
  ['Impuestos','IIBB Juan',61500,'ARS','mensual',15,'Juan','SI','','5','2026','impuesto'],
  ['Impuestos','IIBB Magma',402500,'ARS','mensual',15,'Magma','SI','','5','2026','impuesto'],
  ['Impuestos','IIBB Lulu',58000,'ARS','mensual',15,'Lulu','SI','','5','2026','impuesto'],
]
await appendRows('GASTOS_FIJOS', gastosFijos)

// 2. TARJETAS — resumenes mensuales por tarjeta
await ensureSheet('TARJETAS', 500, 11)
await setHeaders('TARJETAS', ['Tarjeta','Moneda','Mes','Año','Monto','Vencimiento','Pagado','Fecha pago','Cuenta pago','PDF resumen','Notas'])

const tarjetas = [
  // Mayo 2026 estimado (basado en valores de Abril)
  ['Master','ARS',5,2026,6776919,'6/5/2026','NO','','','',''],
  ['Santander Visa','ARS',5,2026,4038656,'6/5/2026','NO','','','',''],
  ['Santander Visa USD','USD',5,2026,323150,'6/5/2026','NO','','','en pesos al cambio'],
  ['Amex','ARS',5,2026,1353349,'9/5/2026','NO','','','',''],
  ['Amex USD','USD',5,2026,545140,'9/5/2026','NO','','','en pesos al cambio'],
]
await appendRows('TARJETAS', tarjetas)

// 3. PRESTAMOS — cronograma de cuotas
await ensureSheet('PRESTAMOS', 500, 11)
await setHeaders('PRESTAMOS', ['Prestamo','Cuota nro','Cuotas total','Vencimiento','Monto cuota','Moneda','Pagado','Fecha pago','Cuenta pago','PDF cronograma','Notas'])

const prestamos = [
  // Galicia — del BALANCE veo cuotas variables: 13/24=970000, 14/24=897001, 15/24=876779
  ['Galicia',13,24,'1/3/2026',970000,'ARS','SI','','','','vto fin mes'],
  ['Galicia',14,24,'1/4/2026',897001,'ARS','SI','','','','vto fin mes'],
  ['Galicia',15,24,'1/5/2026',876779,'ARS','NO','','','','vto fin mes'],
  ['Galicia',16,24,'1/6/2026',876779,'ARS','NO','','','','vto fin mes'],
  // Santander — cuotas 6/18=358782, 7/18=355521, 8/18=707345
  ['Santander',6,18,'1/3/2026',358782,'ARS','SI','','','','cuota 6/18'],
  ['Santander',7,18,'1/4/2026',355521,'ARS','SI','','','','cuota 7/18'],
  ['Santander',8,18,'1/5/2026',707345,'ARS','NO','','','','cuota 8/18'],
  ['Santander',9,18,'1/6/2026',703816,'ARS','NO','','','','cuota 9/18'],
]
await appendRows('PRESTAMOS', prestamos)

console.log('\n✓ Setup completo. Hojas: GASTOS_FIJOS, TARJETAS, PRESTAMOS')
