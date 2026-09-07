// El recordatorio de facturación, del 10 al 15.
//
// El pago sale el 15 y cubre todo el mes anterior. La ventana para facturar es del
// 10 al 15: antes del 10 el mes todavía no cerró y después del 15 el pago ya salió.
// Este script arma el aviso para cada uno, con su monto y el link a su carpeta.
//
// No manda nada por default: escribe los borradores y los muestra. El envío es un
// paso aparte y explícito, porque son mails a gente de afuera.
//
//   node scripts/staff-aviso-facturar.mjs              → preview de todos los avisos
//   node scripts/staff-aviso-facturar.mjs --mes 08     → el mes que se está por pagar
//   node scripts/staff-aviso-facturar.mjs --enviar     → los manda de verdad

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import nodemailer from 'nodemailer'

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
const SHEET_ID   = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const DRIVE_RRHH = '0AKPc4ZAUvU8YUk9PVA'

const args = process.argv.slice(2)
const ENVIAR = args.includes('--enviar')
const MES = (() => {
  const i = args.indexOf('--mes')
  if (i >= 0) return String(args[i+1]||'').padStart(2,'0')
  const d = new Date(); d.setMonth(d.getMonth()-1)   // por default, el mes que se paga
  return String(d.getMonth()+1).padStart(2,'0')
})()

const numUS = v => { const n = parseFloat(String(v||'').replace(/[$\s,]/g,'')); return isNaN(n)?0:n }
const plata = n => '$' + Math.round(n).toLocaleString('es-AR')
const norm  = s => String(s||'').trim().toLowerCase()

const b = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges:['Pagos_Staff!A:N','RRHH!A:Z','PROYECTOS!A:ET'] })
const [pv, rv, yv] = b.data.valueRanges.map(v => v.values||[])
const hP = pv[0], hR = rv[0]

const gente = rv.slice(1)
  .map(r => Object.fromEntries(hR.map((k,i) => [k, typeof r[i] === 'string' ? r[i].trim() : (r[i] ?? '')])))
  .filter(p => /@/.test(String(p.Mail||'')) && String(p['Nombre Apellido']||'').trim())

const filas = pv.slice(1).map(r => Object.fromEntries(hP.map((k,j)=>[k, r[j]??''])))

// Los links de las carpetas, para que el mail lleve al lugar donde suben la factura.
const madre = await drive.files.list({
  q:`name='FICHAS DEL EQUIPO' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  driveId: DRIVE_RRHH, corpora:'drive', includeItemsFromAllDrives:true, supportsAllDrives:true, fields:'files(id)',
})
const carpetas = {}
if (madre.data.files?.length) {
  let token
  do {
    const p = await drive.files.list({
      q:`'${madre.data.files[0].id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      driveId: DRIVE_RRHH, corpora:'drive', includeItemsFromAllDrives:true, supportsAllDrives:true,
      fields:'nextPageToken, files(id,name)', pageSize:100, pageToken: token,
    })
    p.data.files.forEach(f => carpetas[norm(f.name)] = f.id); token = p.data.nextPageToken
  } while (token)
}

const MESES = { '01':'enero','02':'febrero','03':'marzo','04':'abril','05':'mayo','06':'junio',
                '07':'julio','08':'agosto','09':'septiembre','10':'octubre','11':'noviembre','12':'diciembre' }
const nombreMes = MESES[MES] || MES

const avisos = [], enEfectivo = []
for (const p of gente) {
  const nom = String(p['Nombre Apellido']).trim()
  if (/^(juan martin arauz|sofia maria grenier)/i.test(nom)) continue   // cobran por la cuenta de socios
  const suyas = filas.filter(x => norm(x.Freelancer) === norm(nom)
    && /pendiente/i.test(String(x.Estado||''))
    && String(x['Mes Referencia']||'').trim().startsWith(MES)
    && numUS(x['Monto Adeudado']) > 0)
  if (!suyas.length) continue
  // Este mes cobra en efectivo: no tiene que facturar, no le llega el aviso.
  // Se marca con scripts/staff-efectivo.mjs y se decide de nuevo cada mes.
  if (suyas.every(x => /efectivo/i.test(String(x.Cuenta||'')))) { enEfectivo.push({ nombre:nom, total: suyas.reduce((a,x)=>a+numUS(x['Monto Adeudado']),0) }); continue }

  const total = suyas.reduce((a,x) => a + numUS(x['Monto Adeudado']), 0)
  const link = carpetas[norm(nom)] ? `https://drive.google.com/drive/folders/${carpetas[norm(nom)]}` : null
  const pila = suyas.map(x => `  · ${String(x.Proyecto||'').trim()} — ${String(x.Servicio||'').replace(/^[^\p{L}\p{N}]+/u,'').trim()} — ${plata(numUS(x['Monto Adeudado']))}`).join('\n')

  avisos.push({ nombre: nom, mail: p.Mail, total, n: suyas.length, link,
    subject: `Facturá ${nombreMes} — Somos Magma`,
    text: `Hola ${nom.split(' ')[0]}!

Ya cerramos ${nombreMes}. Esto es lo que te vamos a pagar el 15:

${pila}

  TOTAL: ${plata(total)}

Para que entre en el pago de este mes, hacé la factura entre el 10 y el 15 y dejala en tu carpeta:
${link || '(pedile el link a administración)'}

Ahí adentro también está tu ficha: lo que te debemos, la lista de precios y todo lo que cobraste hasta hoy.

Si algún número no te cierra, avisanos antes de facturar — es más fácil corregirlo ahora.

Gracias!
Somos Magma`,
  })
}

const total = avisos.reduce((a,x) => a + x.total, 0)
console.log(`════════ AVISO DE FACTURACIÓN · ${nombreMes.toUpperCase()} ════════\n`)
console.log(`${avisos.length} personas · ${plata(total)}\n`)
avisos.sort((a,b)=>b.total-a.total).forEach(x =>
  console.log(`   ${x.nombre.slice(0,26).padEnd(26)} ${String(x.mail).slice(0,34).padEnd(34)} ${plata(x.total).padStart(12)}  ${String(x.n).padStart(2)} trabajos${x.link ? '' : '   ⚠ sin carpeta'}`))
if (enEfectivo.length) {
  console.log(`\n   No les llega — este mes cobran en efectivo (${enEfectivo.length}):`)
  enEfectivo.forEach(x => console.log(`   ${x.nombre.slice(0,26).padEnd(26)} ${plata(x.total).padStart(12)}`))
}

if (!avisos.length) { console.log('Nadie tiene pendientes de ese mes.'); process.exit(0) }

// Un aviso con un trabajo duplicado le pide a alguien que facture de más, y eso no
// se arregla después: ya facturó. Si quedan filas contra un presupuesto que no
// existe en PROYECTOS, el envío se frena hasta limpiarlas.
const enProyectos = new Set(yv.slice(1).map(r => String(r[2]||'').trim()).filter(Boolean))
const sucias = filas.filter(x => {
  const n = String(x['N° Presupuesto']||'').trim()
  return n && !enProyectos.has(n)
    && /pendiente/i.test(String(x.Estado||''))
    && String(x['Mes Referencia']||'').trim().startsWith(MES)
    && avisos.some(a => norm(a.nombre) === norm(x.Freelancer))
})
if (sucias.length) {
  console.log(`\n⛔ FRENO — ${sucias.length} líneas de ${nombreMes} apuntan a un presupuesto que no existe en PROYECTOS:\n`)
  sucias.forEach(x => console.log(`   #${String(x['N° Presupuesto']).padEnd(6)} ${String(x.Freelancer).slice(0,24).padEnd(24)} ${String(x.Proyecto).slice(0,32).padEnd(32)} ${plata(numUS(x['Monto Adeudado']))}`))
  console.log(`\n   Pueden ser el mismo trabajo cargado dos veces con números distintos.`)
  console.log(`   Si mandás el aviso así, esa persona factura de más y después no se arregla.`)
  console.log(`   Corré primero:  node scripts/staff-deuda-huerfana.mjs`)
  if (ENVIAR) { console.log('\n   No se mandó ningún mail.'); process.exit(1) }
}

console.log('\n──────── así queda el mail ────────\n')
console.log(`Para: ${avisos[0].mail}`)
console.log(`Asunto: ${avisos[0].subject}\n`)
console.log(avisos[0].text)
console.log('\n───────────────────────────────────')

if (!ENVIAR) {
  console.log(`\n👀 PREVIEW — no se mandó ningún mail. Corré con --enviar para mandar los ${avisos.length}.`)
  process.exit(0)
}

const t = nodemailer.createTransport({ service:'gmail', auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD } })
for (const a of avisos) {
  try {
    await t.sendMail({ from:`Somos Magma <${env.MAIL_USER}>`, to:a.mail, subject:a.subject, text:a.text })
    console.log(`  ✓ ${a.nombre.padEnd(28)} ${a.mail}`)
  } catch (e) {
    console.log(`  ✗ ${a.nombre.padEnd(28)} ${e.message}`)
  }
}
console.log(`\n✅ ${avisos.length} avisos enviados.`)
