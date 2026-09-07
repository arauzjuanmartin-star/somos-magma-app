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
//   node scripts/equipo-fichas.mjs --agosto --escribir → solo a quien se le debe algo de agosto
//   node scripts/equipo-fichas.mjs --sin-deuda        → oculta los montos adeudados

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
// La deuda SÍ se muestra: decisión de Juan del 7/9/2026 — el que trabajó tiene que
// saber cuánto se le debe. Los duplicados que la frenaban están identificados con
// scripts/staff-deuda-huerfana.mjs (filas cargadas contra un N° de presupuesto que
// no existe en PROYECTOS, porque el trabajo se re-presupuestó con otro número).
// Correr ese script ANTES de escribir las fichas; con --sin-deuda se ocultan.
const CON_DEUDA = !args.includes('--sin-deuda')
// --agosto: solo las personas con algo pendiente de agosto. Muchos son esporádicos
// y no tiene sentido avisarle a alguien que no cobra nada este mes.
const SOLO_AGOSTO = args.includes('--agosto')
// Juan y Sofi SÍ llevan ficha (decisión de Juan, 7/9/2026): siguen yendo a cubrir
// eventos y su trabajo de campo se registra como el de cualquiera del staff. Lo que
// cambia es cómo cobran — su saldo no entra en el pago del 15, se liquida por la
// cuenta de socios. Eso se aclara dentro de la ficha, no excluyéndolos.
const SIN_FICHA = []
const SOCIOS = /^(juan martin arauz|sofia maria grenier)/i
const SOLO = args.filter(a => !a.startsWith('--'))[0] || null

const plata = n => '$' + Math.round(n).toLocaleString('es-AR')
const num = v => { const s = String(v||'').replace(/[$\s]/g,'').replace(/\./g,'').replace(',','.'); const n = parseFloat(s); return isNaN(n)?0:n }
// Los montos del sheet están en formato US ($764,800.00): la coma es de miles.
const numUS = v => { const n = parseFloat(String(v||'').replace(/[$\s,]/g,'')); return isNaN(n)?0:n }
const norm = s => String(s||'').trim().toLowerCase()

// ---------------------------------------------------------------- datos
const b = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: SHEET_ID, ranges:['RRHH!A:Z','Pagos_Staff!A:N','PROYECTOS!A:ET','ACUERDOS!A:U','TARIFAS!A:E'],
})
const [rrhh, pagos, proy, acu, tar] = b.data.valueRanges.map(v => v.values||[])
const hR = rrhh[0], hP = pagos[0], hY = proy[0], hA = acu[0] || []

// La lista de precios que Juan mandó al equipo el 1/4/2026, leída de la solapa
// TARIFAS. Si sube los precios cambia la celda y cambia en las 42 fichas.
const tarifas = tar.slice(1)
  .filter(r => String(r[0]||'').trim())
  .map(r => ({ concepto:String(r[0]).trim(), detalle:String(r[1]||'').trim(),
               precio:numUS(r[2]), notas:String(r[4]||'').trim() }))
const cR = n => hR.indexOf(n), cP = n => hP.indexOf(n)

const gente = rrhh.slice(1)
  .map(r => Object.fromEntries(hR.map((k,i) => [k, typeof r[i] === 'string' ? r[i].trim() : (r[i] ?? '')])))
  .filter(p => /@/.test(String(p.Mail||'')) && String(p['Nombre Apellido']||'').trim())
  .filter(p => !SIN_FICHA.includes(norm(p.Mail)))
  .filter(p => !SOLO || norm(p['Nombre Apellido']).includes(norm(SOLO)))

const pagosDe = nombre => pagos.slice(1)
  .filter(r => norm(r[cP('Freelancer')]) === norm(nombre))
  .map(r => Object.fromEntries(hP.map((k,i) => [k, r[i] ?? ''])))

// Las condiciones de ACUERDOS ganan sobre cualquier otra cosa: es lo que se firmó.
// La solapa matchea por nombre completo o por el alias entre paréntesis ("(Lucho)").
const acuerdoDe = nombre => {
  const f = acu.slice(1).find(r => {
    const p = String(r[0]||'')
    return norm(p) === norm(nombre) || norm(p.replace(/\s*\(.*\)/,'')) === norm(nombre)
  })
  if (!f || !/vigente/i.test(String(f[hA.indexOf('Estado')]||''))) return null
  return Object.fromEntries(hA.map((k,i) => [k, f[i] ?? '']))
}

const { SLOT_PROY, MAX_SLOTS } = await import('../lib/slots.js')
const { parseFechaAR, hoyCero } = await import('../lib/edicion.js')
const hoy = hoyCero()

// El precio de cada tipo de trabajo sale de lo que se le pagó, no de RRHH.
// La columna "Tarifa jornada" de RRHH no coincide con la realidad: a Santino figura
// $420.000 la jornada y sus jornadas se pagaron entre $190.000 y $600.000. Mostrarle
// al freelancer un número que no es el que cobra genera un reclamo por nada.
const preciosDe = sus => {
  // "🎬 Film ½" y "Film 1/2" son el mismo trabajo: el emoji lo pone la app y el ½
  // depende de quién cargó la fila. Sin unificar, la tabla muestra la misma cosa
  // dos veces con precios distintos y parece que le pagamos distinto por lo mismo.
  const limpio = s => String(s||'')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/½/g, '1/2')
    .replace(/\s+/g, ' ')
    .trim()
  const T = {}
  sus.forEach(x => {
    const serv = limpio(x.Servicio)
    const monto = numUS(x['Monto Pagado'] || x['Monto Adeudado'])
    // Los viáticos no son un precio: son un reembolso y cambian con cada evento.
    if (!serv || !monto || /^\$?[\d.,]+$/.test(serv) || /viatico|viático/i.test(serv)) return
    ;(T[serv] = T[serv] || []).push({ monto, fecha: parseFechaAR(x['Fecha Pago']) || null })
  })
  return Object.entries(T)
    .map(([serv, v]) => {
      // El precio habitual es el que MÁS SE REPITE, no el último. A Santino la última
      // media jornada de video le figura $60.000 porque fue un extra corto: mostrar
      // eso como su precio lo hace pensar que le bajamos la tarifa. El más repetido
      // ($220.000) es el que realmente cobra.
      const cuenta = {}
      v.forEach(y => cuenta[y.monto] = (cuenta[y.monto] || 0) + 1)
      const habitual = Number(Object.entries(cuenta).sort((a,b) => b[1]-a[1] || Number(b[0])-Number(a[0]))[0][0])
      return { serv, veces: v.length, habitual,
               min: Math.min(...v.map(y=>y.monto)), max: Math.max(...v.map(y=>y.monto)) }
    })
    .sort((a,b) => b.veces - a.veces)
}

// Próximos trabajos: los slots de staff con la fecha por delante.
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
  const pagados    = sus.filter(x => /pagad/i.test(String(x.Estado||'')))
  const pendientes = sus.filter(x => /pendiente/i.test(String(x.Estado||'')) && numUS(x['Monto Adeudado']) > 0)
  const totalPagado = pagados.reduce((a,x) => a + numUS(x['Monto Pagado'] || x['Monto Adeudado']), 0)
  const totalPend   = pendientes.reduce((a,x) => a + numUS(x['Monto Adeudado']), 0)
  const ac = acuerdoDe(p['Nombre Apellido'])
  const esSocio = SOCIOS.test(String(p['Nombre Apellido']||''))
  // El efectivo se decide mes a mes (el contador pidió menos facturas C), así que
  // no es un rasgo de la persona: se lee de la columna Cuenta de los pagos que tiene
  // pendientes. Si TODOS están marcados Efectivo, este mes no factura.
  const efectivo = pendientes.length > 0 && pendientes.every(x => /efectivo/i.test(String(x.Cuenta||'')))

  const F = []
  F.push([`Tu cuenta con Somos Magma`])
  F.push([p['Nombre Apellido'], '', '', `actualizado el ${new Date().toLocaleDateString('es-AR')}`])
  F.push([])

  // ── Lo primero es la plata: es a lo que vienen ──────────────────────────
  if (CON_DEUDA) {
    F.push([esSocio ? 'TU SALDO A FAVOR' : 'LO QUE TE DEBEMOS HOY', '', '', totalPend ? plata(totalPend) : 'nada — estás al día'])
    if (pendientes.length) {
      F.push(['', esSocio
        ? 'Son jornadas que cubriste y todavía no se liquidaron en la cuenta de socios.'
        : efectivo
          ? 'Se paga el 15 del mes que viene, todo junto y en efectivo.'
          : efectivo
            ? 'Se paga el 15 del mes que viene, todo junto y en efectivo. Este mes no tenés que facturar.'
            : 'Se paga el 15 del mes que viene, todo junto. Facturá entre el 10 y el 15.'])
      F.push(['Mes', 'Proyecto', 'Qué hiciste', 'Monto'])
      pendientes.forEach(x => F.push([x['Mes Referencia']||'', x.Proyecto||'', x.Servicio||'', plata(numUS(x['Monto Adeudado']))]))
      F.push(['', '', 'TOTAL', plata(totalPend)])
    }
    F.push([])
  } else if (pendientes.length) {
    F.push(['LO QUE ESTÁ POR PAGARSE'])
    F.push(['', `Tenés ${pendientes.length} ${pendientes.length === 1 ? 'trabajo' : 'trabajos'} que todavía no entraron en un pago.`])
    F.push([])
  }

  // ── Cómo funciona el pago. Sin esto la ficha es una lista de números ────
  if (esSocio) {
    // Juan y Sofi cubren eventos como cualquiera y sus jornadas se cargan igual,
    // a los mismos precios. Pero no cobran el 15 ni facturan: su saldo va a la
    // cuenta de socios. Las reglas del pago del staff no les aplican.
    F.push(['CÓMO SE REGISTRA TU TRABAJO'])
    F.push(['Las jornadas', 'Se cargan como las de cualquiera del staff, a los mismos precios de la lista.'])
    F.push(['El cobro', 'No entra en el pago del 15 ni lleva factura: el saldo va a la cuenta de socios.'])
    F.push(['Para qué sirve', 'Que el costo real de cada proyecto incluya lo que cubriste vos.'])
    F.push([])
  } else {
    F.push(['CÓMO TE PAGA MAGMA'])
    F.push(['Cuándo', 'El 15 de cada mes se paga todo el mes anterior, junto y de una sola vez.'])
    F.push(['', 'No se paga trabajo por trabajo ni a mitad de mes.'])
    F.push(['Tu factura', 'Hacela entre el 10 y el 15, así entra en el pago de ese mes.'])
    F.push(['', 'Dejala en la carpeta "Tus facturas" que está acá al lado. Con eso alcanza: no hace falta avisar.'])
    if (efectivo) F.push(['', 'Este mes no hace falta: lo de arriba se te paga en efectivo.'])
    F.push(['El monto', 'Está en la lista de precios de acá abajo. Te lo confirmamos al pasarte el trabajo.'])
    F.push(['', 'Media jornada y jornada completa se pagan distinto: fijate las horas.'])
    F.push(['Viáticos', 'Fuera de CABA se pagan contra ticket, aparte de la jornada. El peaje también.'])
    F.push(['', 'Mandá el ticket junto con lo demás y hablalo con el responsable del proyecto.'])
    F.push(['Si algo no cierra', 'Escribinos antes de facturar. Es más fácil corregirlo ahora que después del pago.'])
    F.push([])
  }

  // ── Si tiene acuerdo firmado, sus condiciones ganan sobre lo general ────
  if (ac) {
    F.push(['TU ACUERDO CON MAGMA', '', ac.Desde ? `desde ${ac.Desde}${ac.Hasta ? ` hasta ${ac.Hasta}` : ''}` : ''])
    // La solapa mezcla los dos formatos: "$190,000" es US (coma de miles) y hay que
    // pasarlo a $190.000, pero "$66.020,12" ya está en argentino y tocarlo lo rompe.
    // Solo convierto lo que tiene coma seguida de exactamente 3 dígitos.
    const arg = t => String(t||'').replace(/\$\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, m => plata(numUS(m)))
    const linea = (t, v) => { if (String(v||'').trim()) F.push(['', t, arg(String(v).trim())]) }
    linea('Alcance',           ac.Alcance)
    linea('Modalidad',         ac.Modalidad)
    linea('Unidad',            ac.Unidad)
    linea('Precio por unidad', ac['Precio unidad'])
    linea('Duración',          ac['Duración'])
    linea('Hora adicional',    ac['Hora adicional'])
    if (ac['Mínimo x mes']) linea('Mínimo por mes', `${ac['Mínimo x mes']} · ${ac['Monto del mínimo']||''}`)
    linea('Jornada extra',     ac['Precio extra'])
    linea('Monotributo',       ac.Monotributo)
    linea('Viáticos',          ac['Viáticos'])
    linea('Si se cancela',     ac['Cancelación'])
    linea('Entrega',           ac.Entrega)
    linea('Equipos',           ac.Equipos)
    linea('Cuándo cobrás',     ac['Cuándo cobra'])
    F.push([])
  }

  // ── La lista de precios. Es la misma para todos y sale del sheet ────────
  // Antes acá se mostraba el precio deducido de los pagos viejos, porque no había
  // lista. Ahora la hay: la que Juan mandó al equipo el 1/4/2026. Si alguien tiene
  // acuerdo propio (Lucho, Juani) manda el suyo y esta queda como referencia.
  if (tarifas.length) {
    F.push(['LA LISTA DE PRECIOS', '', ac ? 'General de Magma — para vos vale tu acuerdo de arriba.' : 'Vigente desde el 1 de abril de 2026.'])
    tarifas.forEach(t => {
      if (!t.precio) { F.push([t.concepto, t.detalle, '', '']); if (t.notas) F.push(['', t.notas]) }
      else F.push([t.concepto, t.detalle, plata(t.precio)])
    })
    F.push(['', 'Si un trabajo no entra en ninguna de estas, lo acordamos antes de la jornada.'])
    F.push([])
  }

  // Acá había una tabla de "lo que cobrás por cada cosa" deducida de los pagos
  // viejos. Con la lista de precios arriba sobra, y peor: chocaba con ella. A
  // Santino le mostraba "Foto 1 habitual $600.000" al lado de "jornada $290.000".
  // El histórico completo de abajo tiene cada pago con su monto: no se oculta nada.

  // ── El histórico completo. Juan: "mostrá todo desde siempre" ────────────
  F.push(['TODO LO QUE TE PAGAMOS', '', `${pagados.length} ${pagados.length === 1 ? 'pago' : 'pagos'}`, totalPagado ? plata(totalPagado) + ' en total' : ''])
  if (!pagados.length) F.push(['', 'Todavía no hay pagos registrados.'])
  else {
    F.push(['Fecha', 'Mes', 'Proyecto', 'Qué hiciste', 'Monto'])
    pagados.slice().reverse().forEach(x => F.push([
      x['Fecha Pago']||'', x['Mes Referencia']||'', x.Proyecto||'', x.Servicio||'',
      plata(numUS(x['Monto Pagado'] || x['Monto Adeudado'])),
    ]))
    F.push(['', '', '', 'TOTAL', plata(totalPagado)])
  }
  F.push([])

  F.push(['TUS PRÓXIMOS TRABAJOS'])
  if (!prox.length) F.push(['', 'No tenés jornadas agendadas por ahora.'])
  else {
    F.push(['Fecha', 'Cliente', 'Proyecto', 'Qué hacés', 'Horario', 'Dónde'])
    prox.slice(0, 30).forEach(x => F.push([x.fecha, x.cliente, x.proyecto, x.rol, x.horario || 'a confirmar', x.ubicacion || 'a confirmar']))
  }
  F.push([])

  // ── Los datos van al final: los corrigen en la otra planilla ────────────
  F.push(['TUS DATOS', '', 'Si algo está mal, corregilo en la planilla "Completá tus datos" que está acá al lado.'])
  F.push(['Rubro', p.Rubro || '—'])
  F.push(['Mail', p.Mail || '—'])
  F.push(['Celular', p.Celular || '—'])
  F.push(['CUIT / CUIL', p['CUIT/CUIL'] || '—'])
  F.push(['Banco', p.Banco || '—'])
  F.push(['Alias', p.Alias || '—'])
  F.push(['CBU', p.CBU || '—'])
  F.push([])
  F.push(['', 'Esta planilla se actualiza sola. Solo vos y Magma la pueden ver.'])
  return F
}

// ------------------------------------------------------- completá tus datos
// La otra mitad: RRHH tiene 14 personas sin alias y 12 sin CUIT. Pedírselo por
// WhatsApp de a uno no escala; esta planilla la completan ellos y un script la
// levanta después (con revisión: nadie escribe RRHH directo).
function armarDatos(p) {
  const D = []
  D.push(['Completá tus datos'])
  D.push([p['Nombre Apellido'], '', 'Esta planilla la podés editar. Lo que pongas acá lo cargamos nosotros.'])
  D.push([])
  D.push(['', 'Al lado de cada dato está lo que tenemos hoy. Si está bien, poné OK.'])
  D.push(['', 'Si está mal o falta, escribí el dato correcto en la columna de la derecha.'])
  D.push([])
  D.push(['DATO', 'LO QUE TENEMOS', 'CORREGILO ACÁ'])
  const campo = (t, v) => D.push([t, String(v||'').trim() || '(falta)', ''])
  campo('Nombre y apellido completo', p['Nombre Apellido'])
  campo('Mail',                       p.Mail)
  campo('Celular (con 11 adelante)',  p.Celular)
  campo('DNI',                        p.Dni)
  campo('CUIT / CUIL',                p['CUIT/CUIL'])
  campo('Banco',                      p.Banco)
  campo('Alias',                      p.Alias)
  campo('CBU',                        p.CBU)
  campo('Zona donde vivís',           p.Zona)
  D.push(['Condición fiscal', '', ''])
  D.push(['', 'Monotributo / Responsable Inscripto / Ninguna', ''])
  D.push(['Razón social de tu factura', '', ''])
  D.push(['', 'Si facturás a nombre de otra persona o de una sociedad, ponelo acá', ''])
  D.push([])
  D.push(['¿Está todo bien?', '', ''])
  D.push(['Poné acá tu nombre y la fecha →', '', ''])
  D.push([])
  D.push(['', 'Gracias. Con esto evitamos que un pago se trabe por un CBU viejo.'])
  return D
}

// ---------------------------------------------------------------- correr
const debeDeAgosto = nombre => pagosDe(nombre).some(x =>
  /pendiente/i.test(String(x.Estado||'')) &&
  /^0?8\b|agosto/i.test(String(x['Mes Referencia']||'')) &&
  numUS(x['Monto Adeudado']) > 0)

const destinatarios = SOLO_AGOSTO ? gente.filter(p => debeDeAgosto(p['Nombre Apellido'])) : gente

// Sin mail no hay ficha, y sin ficha esa persona no se entera de lo que se le debe.
// Vale la pena verlo en pantalla: son pagos que igual hay que hacer este mes.
const conFicha = new Set(gente.map(p => norm(p['Nombre Apellido'])))
const sinMail = {}
pagos.slice(1).forEach(r => {
  const o = Object.fromEntries(hP.map((k,i) => [k, r[i] ?? '']))
  if (!/pendiente/i.test(String(o.Estado||''))) return
  if (!/^0?8\b|agosto/i.test(String(o['Mes Referencia']||''))) return
  const n = String(o.Freelancer||'').trim()
  if (!n || conFicha.has(norm(n)) || SIN_FICHA.some(m => norm(m).startsWith(norm(n).split(' ')[0]))) return
  if (/juan martin arauz|sofia maria grenier/i.test(n)) return
  sinMail[n] = (sinMail[n] || 0) + numUS(o['Monto Adeudado'])
})

console.log('════════ FICHAS DEL EQUIPO ════════\n')
console.log(`${gente.length} personas con mail en RRHH${SOLO ? ` (filtrado por "${SOLO}")` : ''}`)
if (SOLO_AGOSTO) console.log(`${destinatarios.length} con algo pendiente de agosto — solo a esas se les toca la ficha`)
console.log('')

if (!ESCRIBIR) {
  destinatarios.forEach(p => {
    const sus = pagosDe(p['Nombre Apellido'])
    const prox = proximosDe(p['Nombre Apellido'])
    const pend = sus.filter(x => !/pagad/i.test(String(x.Estado||'')) && numUS(x['Monto Adeudado']) > 0)
    console.log(`  ${String(p['Nombre Apellido']).slice(0,30).padEnd(30)} ${String(p.Mail).padEnd(38)} ${String(sus.length).padStart(3)} pagos · ${String(prox.length).padStart(2)} jornadas${pend.length?` · DEBE ${plata(pend.reduce((a,x)=>a+numUS(x['Monto Adeudado']),0))}`:''}`)
  })
  // Con un nombre puntual imprimo la ficha entera: es la única forma de leer lo
  // que va a ver esa persona antes de que lo vea.
  if (SOLO && destinatarios.length === 1) {
    const p = destinatarios[0], nom = String(p['Nombre Apellido']).trim()
    const dump = (t, f) => {
      console.log(`\n┌─── ${t} ${'─'.repeat(Math.max(0, 60-t.length))}`)
      f.forEach(r => console.log('│ ' + r.map(c => String(c ?? '')).join('  ·  ')))
      console.log('└' + '─'.repeat(66))
    }
    dump('Tu cuenta con Magma', armarFicha(p, pagosDe(nom), proximosDe(nom)))
    dump('Completá tus datos', armarDatos(p))
  }

  console.log(`\n  Se crearía:  RECURSOS HUMANOS / ${MADRE} / <Nombre> / {Tu cuenta con Magma, Completá tus datos, Tus facturas}`)
  console.log(`  Deuda:       ${CON_DEUDA ? 'SE MUESTRAN los montos pendientes' : 'ocultos (--sin-deuda)'}`)
  console.log(`  Alcance:     ${SOLO_AGOSTO ? 'solo quien tiene pendientes de agosto' : 'todo el equipo con mail'}`)
  console.log('  Acceso:      lectura en su carpeta · escritura en "Tus facturas" y en "Completá tus datos"')
  const faltan = Object.entries(sinMail).sort((a,b)=>b[1]-a[1])
  if (faltan.length) {
    console.log(`\n  ${faltan.length} personas con deuda de agosto no tienen mail en RRHH — les falta el dato, no la plata:`)
    faltan.forEach(([n,v]) => console.log(`        ${n.padEnd(28)} ${plata(v).padStart(11)}   faltan los datos`))
    console.log(`        ${plata(faltan.reduce((a,[,v])=>a+v,0))} a pagar igual — cuando carguen el mail en RRHH la ficha sale sola.`)
  }
  console.log('\n👀 PREVIEW — no se tocó nada. Corré con --escribir.')
  process.exit(0)
}

// Crea o reescribe una planilla dentro de la carpeta de la persona.
// Se reescribe entera cada corrida: así no hay que sincronizar nada, la ficha
// siempre dice lo que dice el sheet hoy.
async function planilla(carpeta, titulo, filas, { pisar = true } = {}) {
  const q = `'${carpeta}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and name='${titulo.replace(/'/g,"\\'")}' and trashed=false`
  const enc = await drive.files.list({ q, driveId: DRIVE_RRHH, corpora:'drive', includeItemsFromAllDrives:true, supportsAllDrives:true, fields:'files(id)' })
  let sid = enc.data.files?.[0]?.id
  const nueva = !sid
  if (!sid) {
    const c = await drive.files.create({ requestBody:{ name:titulo, mimeType:'application/vnd.google-apps.spreadsheet', parents:[carpeta] }, supportsAllDrives:true, fields:'id' })
    sid = c.data.id
  }
  // "Completá tus datos" NO se pisa si ya existe: adentro está lo que escribieron.
  if (!nueva && !pisar) return { sid, tocada:false }

  await sheets.spreadsheets.values.clear({ spreadsheetId: sid, range: 'A:Z' })
  // RAW y no USER_ENTERED: con USER_ENTERED, Sheets lee "$420.000" como
  // cuatrocientos veinte con tres decimales y lo muestra como "$420.00".
  await sheets.spreadsheets.values.update({ spreadsheetId: sid, range:'A1', valueInputOption:'RAW', requestBody:{ values: filas } })

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sid, fields:'sheets(properties(sheetId))' })
  const sh = meta.data.sheets[0].properties.sheetId
  const titulos = filas.map((f,i)=>({f,i})).filter(({f}) => f[0] && /^[A-ZÁÉÍÓÚÑ¿? ]{4,}$/.test(String(f[0]))).map(({i})=>i)
  // Las filas de TOTAL en negrita: es el número que van a buscar.
  const totales = filas.map((f,i)=>({f,i})).filter(({f}) => f.some(c => String(c).trim() === 'TOTAL')).map(({i})=>i)
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: sid, requestBody:{ requests:[
    { repeatCell:{ range:{ sheetId:sh, startRowIndex:0, endRowIndex:1 }, cell:{ userEnteredFormat:{ textFormat:{ bold:true, fontSize:14 } } }, fields:'userEnteredFormat.textFormat' } },
    ...titulos.map(i => ({ repeatCell:{ range:{ sheetId:sh, startRowIndex:i, endRowIndex:i+1 }, cell:{ userEnteredFormat:{ textFormat:{ bold:true }, backgroundColor:{ red:0.95, green:0.94, blue:0.92 } } }, fields:'userEnteredFormat(textFormat,backgroundColor)' } })),
    ...totales.map(i => ({ repeatCell:{ range:{ sheetId:sh, startRowIndex:i, endRowIndex:i+1 }, cell:{ userEnteredFormat:{ textFormat:{ bold:true } } }, fields:'userEnteredFormat.textFormat' } })),
    { updateDimensionProperties:{ range:{ sheetId:sh, dimension:'COLUMNS', startIndex:0, endIndex:1 }, properties:{ pixelSize:230 }, fields:'pixelSize' } },
    { updateDimensionProperties:{ range:{ sheetId:sh, dimension:'COLUMNS', startIndex:1, endIndex:5 }, properties:{ pixelSize:190 }, fields:'pixelSize' } },
    { updateSheetProperties:{ properties:{ sheetId:sh, gridProperties:{ frozenRowCount:2 } }, fields:'gridProperties.frozenRowCount' } },
  ]}})
  return { sid, tocada:true, nueva }
}

const madre = await subcarpeta(DRIVE_RRHH, MADRE)
console.log(`Carpeta madre: ${madre.name} ${madre.creada ? '(creada)' : '(ya existía)'}\n`)

for (const p of destinatarios) {
  const nombre = String(p['Nombre Apellido']).trim()
  try {
    const suya     = await subcarpeta(madre.id, nombre)
    const facturas = await subcarpeta(suya.id, 'Tus facturas')

    await planilla(suya.id, 'Tu cuenta con Magma', armarFicha(p, pagosDe(nombre), proximosDe(nombre)))
    // Esta la escriben ellos, así que va con permiso de escritura y no se pisa.
    const datos = await planilla(suya.id, 'Completá tus datos', armarDatos(p), { pisar:false })

    const a1 = await darAcceso(suya.id, p.Mail, 'reader')
    const a2 = await darAcceso(facturas.id, p.Mail, 'writer')
    const a3 = await darAcceso(datos.sid, p.Mail, 'writer')
    console.log(`  ✓ ${nombre.padEnd(30)} carpeta:${a1} · facturas:${a2} · datos:${a3}${datos.tocada ? '' : ' (ya la completaron, no se pisó)'}`)
  } catch (e) {
    console.log(`  ✗ ${nombre.padEnd(30)} ${e.message}`)
  }
}
console.log('\n✅ Listo. El link de cada carpeta se lo mandás vos — no se les avisó por mail.')
