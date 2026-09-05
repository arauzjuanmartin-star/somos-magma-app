// Una carpeta por persona del equipo, en Drive, con su información y nada más.
//
// La idea es de Juan: en vez de darle acceso a la app a quince freelancers —y
// tener que garantizar que ninguno vea lo del otro—, el control lo hace Drive.
// Un mail, una carpeta. Si el mail no está en la lista, no hay nada que ver.
//
//   RECURSOS HUMANOS / FICHAS DEL EQUIPO / <Nombre> /
//        Tu cuenta con Magma   (planilla, se regenera cada vez)
//        Tus facturas /        (acá suben ellos la suya)
//
// Sobre la carpeta personal tienen LECTURA (los datos los corrige Magma) y sobre
// "Tus facturas" pueden escribir. Los archivos viven en la unidad compartida, así
// que son de Magma y no le ocupan Drive a nadie.
//
//   node scripts/equipo-fichas.mjs                    → preview de todos
//   node scripts/equipo-fichas.mjs "Ivan Aranda"      → preview de uno
//   node scripts/equipo-fichas.mjs "Ivan Aranda" --escribir
//   node scripts/equipo-fichas.mjs --escribir         → todos

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive'],
})
const sheets = google.sheets({ version:'v4', auth })
const drive  = google.drive({ version:'v3', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const DRIVE_RRHH = '0AKPc4ZAUvU8YUk9PVA'
const MADRE = 'FICHAS DEL EQUIPO'

const args = process.argv.slice(2)
const ESCRIBIR = args.includes('--escribir')
// La deuda NO se muestra por defecto. Al 6/9/2026 hay 19 grupos repetidos en los
// pendientes ($5.090.000) y no se puede saber desde acá cuáles son duplicados de
// carga y cuáles son jornadas distintas del mismo proyecto — "Cobertuna 3 fechas"
// puede ser las dos cosas. Mostrarle a alguien una deuda inflada es peor que no
// mostrarle nada. Se activa con --con-deuda cuando Pagos_Staff esté limpio.
const CON_DEUDA = args.includes('--con-deuda')
// Los dueños ya ven todo en la app; no necesitan una carpeta compartida.
const SIN_FICHA = ['juan@somosmagma.com', 'sofi@somosmagma.com', 'arauzjuanmartin@gmail.com']
const SOLO = args.filter(a => !a.startsWith('--'))[0] || null

const plata = n => '$' + Math.round(n).toLocaleString('es-AR')
const num = v => { const s = String(v||'').replace(/[$\s]/g,'').replace(/\./g,'').replace(',','.'); const n = parseFloat(s); return isNaN(n)?0:n }
// Los montos del sheet están en formato US ($764,800.00): la coma es de miles.
const numUS = v => { const n = parseFloat(String(v||'').replace(/[$\s,]/g,'')); return isNaN(n)?0:n }
const norm = s => String(s||'').trim().toLowerCase()

// ---------------------------------------------------------------- datos
const b = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: SHEET_ID, ranges:['RRHH!A:Z','Pagos_Staff!A:N','PROYECTOS!A:ET'],
})
const [rrhh, pagos, proy] = b.data.valueRanges.map(v => v.values||[])
const hR = rrhh[0], hP = pagos[0], hY = proy[0]
const cR = n => hR.indexOf(n), cP = n => hP.indexOf(n)

const gente = rrhh.slice(1)
  .map(r => Object.fromEntries(hR.map((k,i) => [k, typeof r[i] === 'string' ? r[i].trim() : (r[i] ?? '')])))
  .filter(p => /@/.test(String(p.Mail||'')) && String(p['Nombre Apellido']||'').trim())
  .filter(p => !SIN_FICHA.includes(norm(p.Mail)))
  .filter(p => !SOLO || norm(p['Nombre Apellido']).includes(norm(SOLO)))

const pagosDe = nombre => pagos.slice(1)
  .filter(r => norm(r[cP('Freelancer')]) === norm(nombre))
  .map(r => Object.fromEntries(hP.map((k,i) => [k, r[i] ?? ''])))

// Próximos trabajos: los slots de staff con la fecha por delante.
const { SLOT_PROY, MAX_SLOTS } = await import('../lib/slots.js')
const { parseFechaAR, hoyCero } = await import('../lib/edicion.js')
const hoy = hoyCero()
const iFe = hY.indexOf('Fecha Evento')
const proximosDe = nombre => {
  const out = []
  proy.slice(1).forEach(r => {
    const f = parseFechaAR(r[iFe]); if (!f || f < hoy) return
    for (let n = 1; n <= MAX_SLOTS; n++) {
      const c = SLOT_PROY(n)
      if (norm(r[c.staff]) !== norm(nombre)) continue
      out.push({
        fecha: String(r[iFe]||''),
        cliente: String(r[hY.indexOf('Cliente')] || r[hY.indexOf('Agencia')] || ''),
        proyecto: String(r[hY.indexOf('Proyecto')]||''),
        rol: String(r[c.pedido]||'').replace(/^[^\p{L}\p{N}]+/u,'').trim(),
        horario: String(r[hY.indexOf('Horario')]||''),
        ubicacion: String(r[hY.indexOf('Ubicación')]||''),
      })
    }
  })
  return out.sort((a,b2) => parseFechaAR(a.fecha) - parseFechaAR(b2.fecha))
}

// ---------------------------------------------------------------- Drive
async function subcarpeta(padre, nombre) {
  const q = `'${padre}' in parents and mimeType='application/vnd.google-apps.folder' and name='${nombre.replace(/'/g,"\\'")}' and trashed=false`
  const r = await drive.files.list({ q, driveId: DRIVE_RRHH, corpora:'drive', includeItemsFromAllDrives:true, supportsAllDrives:true, fields:'files(id,name)' })
  if (r.data.files?.length) return { ...r.data.files[0], creada:false }
  const c = await drive.files.create({ requestBody:{ name:nombre, mimeType:'application/vnd.google-apps.folder', parents:[padre] }, supportsAllDrives:true, fields:'id,name' })
  return { ...c.data, creada:true }
}

async function darAcceso(fileId, mail, role) {
  const p = await drive.permissions.list({ fileId, supportsAllDrives:true, fields:'permissions(id,role,emailAddress)' })
  const ya = (p.data.permissions||[]).find(x => norm(x.emailAddress) === norm(mail))
  if (ya) {
    if (ya.role === role) return 'ya tenía'
    await drive.permissions.update({ fileId, permissionId: ya.id, requestBody:{ role }, supportsAllDrives:true })
    return `de ${ya.role} a ${role}`
  }
  // sendNotificationEmail:false → el aviso se lo damos nosotros, con contexto.
  await drive.permissions.create({ fileId, requestBody:{ type:'user', role, emailAddress: mail }, supportsAllDrives:true, sendNotificationEmail:false })
  return `nuevo (${role})`
}

// ---------------------------------------------------------------- la ficha
function armarFicha(p, sus, prox) {
  const pagados = sus.filter(x => /pagad/i.test(String(x.Estado||'')))
  const pendientes = sus.filter(x => !/pagad/i.test(String(x.Estado||'')) && numUS(x['Monto Adeudado']) > 0)
  const totalPagado = pagados.reduce((a,x) => a + numUS(x['Monto Pagado'] || x['Monto Adeudado']), 0)
  const totalPend = pendientes.reduce((a,x) => a + numUS(x['Monto Adeudado']), 0)

  const F = []
  F.push([`Tu cuenta con Somos Magma`])
  F.push([p['Nombre Apellido'], '', '', `actualizado el ${new Date().toLocaleDateString('es-AR')}`])
  F.push([])
  F.push(['TUS DATOS', '', 'Si algo está mal o cambió, escribinos y lo corregimos.'])
  F.push(['Rubro', p.Rubro || '—'])
  F.push(['Mail', p.Mail || '—'])
  F.push(['Celular', p.Celular || '—'])
  F.push(['CUIT / CUIL', p['CUIT/CUIL'] || '—'])
  F.push(['Banco', p.Banco || '—'])
  F.push(['Alias', p.Alias || '—'])
  F.push(['CBU', p.CBU || '—'])
  const tarifa = v => { const n = numUS(v); return n ? plata(n) : String(v||'') }
  if (p['Tarifa jornada'])       F.push(['Tu tarifa por jornada', tarifa(p['Tarifa jornada'])])
  if (p['Tarifa media jornada']) F.push(['Tu tarifa por media jornada', tarifa(p['Tarifa media jornada'])])
  F.push([])

  F.push(['CÓMO ES EL PAGO'])
  F.push(['', 'El 15 de cada mes se paga todo lo del mes anterior, junto y de una vez.'])
  F.push(['', 'Para que entre en ese pago, mandanos tu factura antes del día 5.'])
  F.push(['', 'Podés dejarla en la carpeta "Tus facturas" que está acá al lado.'])
  F.push([])

  F.push(['LO QUE TE PAGAMOS', '', '', totalPagado ? plata(totalPagado) + ' en total' : ''])
  if (!pagados.length) F.push(['', 'Todavía no hay pagos registrados.'])
  else {
    F.push(['Fecha', 'Mes', 'Proyecto', 'Monto'])
    pagados.slice().reverse().slice(0, 60).forEach(x => {
      F.push([x['Fecha Pago'] || '', x['Mes Referencia'] || '', x.Proyecto || '', plata(numUS(x['Monto Pagado'] || x['Monto Adeudado']))])
    })
    if (pagados.length > 60) F.push(['', `y ${pagados.length - 60} pagos más antes de estos`])
  }
  F.push([])

  if (CON_DEUDA && pendientes.length) {
    F.push(['LO QUE TE DEBEMOS', '', '', plata(totalPend)])
    F.push(['Mes', 'Proyecto', 'Monto', 'Estado'])
    pendientes.forEach(x => F.push([x['Mes Referencia'] || '', x.Proyecto || '', plata(numUS(x['Monto Adeudado'])), x.Estado || 'pendiente']))
    F.push([])
  } else if (pendientes.length) {
    F.push(['LO QUE ESTÁ POR PAGARSE'])
    F.push(['', `Tenés ${pendientes.length} ${pendientes.length === 1 ? 'trabajo' : 'trabajos'} que todavía no entraron en un pago.`])
    F.push(['', 'Los montos los estamos revisando con administración: cuando estén confirmados aparecen acá.'])
    F.push(['', 'Si querés chequear alguno en particular, escribinos.'])
    F.push([])
  }

  F.push(['TUS PRÓXIMOS TRABAJOS'])
  if (!prox.length) F.push(['', 'No tenés jornadas agendadas por ahora.'])
  else {
    F.push(['Fecha', 'Cliente', 'Proyecto', 'Qué hacés', 'Horario', 'Dónde'])
    prox.slice(0, 30).forEach(x => F.push([x.fecha, x.cliente, x.proyecto, x.rol, x.horario || 'a confirmar', x.ubicacion || 'a confirmar']))
  }
  F.push([])
  F.push(['', 'Esta planilla se actualiza sola. Solo vos y Magma la pueden ver.'])
  return F
}

// ---------------------------------------------------------------- correr
console.log('════════ FICHAS DEL EQUIPO ════════\n')
console.log(`${gente.length} personas con mail en RRHH${SOLO ? ` (filtrado por "${SOLO}")` : ''}\n`)

if (!ESCRIBIR) {
  gente.forEach(p => {
    const sus = pagosDe(p['Nombre Apellido'])
    const prox = proximosDe(p['Nombre Apellido'])
    const pend = sus.filter(x => !/pagad/i.test(String(x.Estado||'')) && numUS(x['Monto Adeudado']) > 0)
    console.log(`  ${String(p['Nombre Apellido']).slice(0,30).padEnd(30)} ${String(p.Mail).padEnd(38)} ${String(sus.length).padStart(3)} pagos · ${String(prox.length).padStart(2)} jornadas${pend.length?` · DEBE ${plata(pend.reduce((a,x)=>a+numUS(x['Monto Adeudado']),0))}`:''}`)
  })
  console.log(`\n  Se crearía:  RECURSOS HUMANOS / ${MADRE} / <Nombre> / {Tu cuenta con Magma, Tus facturas}`)
  console.log(`  Deuda:       ${CON_DEUDA ? '⚠️  SE MUESTRAN LOS MONTOS PENDIENTES' : 'no se muestran los montos (hay duplicados sin resolver)'}`)
  console.log('  Acceso:      lectura en su carpeta · escritura en "Tus facturas" · SOLO su mail')
  console.log('\n👀 PREVIEW — no se tocó nada. Corré con --escribir.')
  process.exit(0)
}

const madre = await subcarpeta(DRIVE_RRHH, MADRE)
console.log(`Carpeta madre: ${madre.name} ${madre.creada ? '(creada)' : '(ya existía)'}\n`)

for (const p of gente) {
  const nombre = String(p['Nombre Apellido']).trim()
  try {
    const suya = await subcarpeta(madre.id, nombre)
    const facturas = await subcarpeta(suya.id, 'Tus facturas')

    // La planilla: se busca por nombre y se reescribe entera, así siempre está al día.
    const titulo = 'Tu cuenta con Magma'
    const q = `'${suya.id}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and name='${titulo}' and trashed=false`
    const enc = await drive.files.list({ q, driveId: DRIVE_RRHH, corpora:'drive', includeItemsFromAllDrives:true, supportsAllDrives:true, fields:'files(id)' })
    let sid = enc.data.files?.[0]?.id
    if (!sid) {
      const c = await drive.files.create({ requestBody:{ name:titulo, mimeType:'application/vnd.google-apps.spreadsheet', parents:[suya.id] }, supportsAllDrives:true, fields:'id' })
      sid = c.data.id
    }
    const filas = armarFicha(p, pagosDe(nombre), proximosDe(nombre))
    await sheets.spreadsheets.values.clear({ spreadsheetId: sid, range: 'A:Z' })
    // RAW y no USER_ENTERED: con USER_ENTERED, Sheets lee "$420.000" como
    // cuatrocientos veinte con tres decimales y lo muestra como "$420.00".
    await sheets.spreadsheets.values.update({ spreadsheetId: sid, range:'A1', valueInputOption:'RAW', requestBody:{ values: filas } })
    // Que se lea: títulos en negrita y la primera columna ancha.
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sid, fields:'sheets(properties(sheetId))' })
    const sh = meta.data.sheets[0].properties.sheetId
    const titulos = filas.map((f,i)=>({f,i})).filter(({f}) => f[0] && /^[A-ZÁÉÍÓÚÑ ]{4,}$/.test(String(f[0]))).map(({i})=>i)
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: sid, requestBody:{ requests:[
      { repeatCell:{ range:{ sheetId:sh, startRowIndex:0, endRowIndex:1 }, cell:{ userEnteredFormat:{ textFormat:{ bold:true, fontSize:14 } } }, fields:'userEnteredFormat.textFormat' } },
      ...titulos.map(i => ({ repeatCell:{ range:{ sheetId:sh, startRowIndex:i, endRowIndex:i+1 }, cell:{ userEnteredFormat:{ textFormat:{ bold:true }, backgroundColor:{ red:0.95, green:0.94, blue:0.92 } } }, fields:'userEnteredFormat(textFormat,backgroundColor)' } })),
      { updateDimensionProperties:{ range:{ sheetId:sh, dimension:'COLUMNS', startIndex:0, endIndex:1 }, properties:{ pixelSize:220 }, fields:'pixelSize' } },
      { updateDimensionProperties:{ range:{ sheetId:sh, dimension:'COLUMNS', startIndex:1, endIndex:4 }, properties:{ pixelSize:190 }, fields:'pixelSize' } },
    ]}})

    const a1 = await darAcceso(suya.id, p.Mail, 'reader')
    const a2 = await darAcceso(facturas.id, p.Mail, 'writer')
    console.log(`  ✓ ${nombre.padEnd(30)} carpeta:${a1} · facturas:${a2}`)
  } catch (e) {
    console.log(`  ✗ ${nombre.padEnd(30)} ${e.message}`)
  }
}
console.log('\n✅ Listo. El link de cada carpeta se lo mandás vos — no se les avisó por mail.')
