// lib/diaria-mail.mjs — el mail de la diaria. Una sola plantilla y una sola regla para los dos que lo mandan:
//   · scripts/diaria.mjs               (la Mac, con launchd 8:00 y 15:00 — además lee el mail de Diego)
//   · pages/api/cron/diaria/[aviso].js (Vercel, con cron 8:10 y 15:10 — sale aunque la Mac esté cerrada)
// La regla para que no llegue dos veces: el primero que lo manda lo anota en la columna "Mail" de la solapa DIARIA;
// el otro lee esa columna antes de enviar y, si ya salió, no manda nada.
// No importa googleapis: el cliente `sheets` se lo pasa el que llama.
import { briefMarkdown, fecha as parseFecha, txt } from './brief.mjs'
import { bloqueIA } from './ia-diaria.mjs'

export const HEADERS = ['Fecha','Hora','Aviso','Vencidas $','Vencidas N','Vencen 7d $','Atrasadas +30d $','Por cobrar $','En espera $','Sin staff 7d','VEPs impagos','VEPs sin noticias','Contador (json)','Mail']
const COL_MAIL = HEADERS.indexOf('Mail') // N
const DIA = 86400000
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
const p2 = n => String(n).padStart(2, '0')

// Un Date cuyos campos "locales" son la hora de Buenos Aires, corra donde corra (Vercel corre en UTC: sin esto
// el mail de las 8 diría 11:10). En la Mac devuelve lo mismo que new Date().
export const horaArgentina = (d = new Date()) => new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))

// A mano y no con toLocaleString: bajo launchd (sin LANG) daba "01:29" en vez de "13:29"
export function partesFecha(ahoraAR) {
  const ddmmyyyy = `${p2(ahoraAR.getDate())}/${p2(ahoraAR.getMonth() + 1)}/${ahoraAR.getFullYear()}`
  const hhmm = `${p2(ahoraAR.getHours())}:${p2(ahoraAR.getMinutes())}`
  const fechaLarga = `${DIAS[ahoraAR.getDay()]}, ${ahoraAR.getDate()} de ${MESES[ahoraAR.getMonth()]} de ${ahoraAR.getFullYear()}`
  return { ddmmyyyy, hhmm, fechaLarga }
}

// El radar del contador guardado en DIARIA trae "dias" calculado el día que se leyó el mail. Si se reusa después
// (Vercel no puede leer el mail de Diego), hay que recalcularlo contra hoy o "vence en 3 días" queda viejo.
export function recalcularDias(contador, ahoraAR) {
  if (!contador || contador.error) return contador
  const hoy = new Date(ahoraAR); hoy.setHours(0, 0, 0, 0)
  const al = e => { const d = parseFecha(e.vto); return { ...e, dias: d ? Math.round((d - hoy) / DIA) : null } }
  return { ...contador, impagos: (contador.impagos || []).map(al), sinNoticias: (contador.sinNoticias || []).map(al), pendientes: contador.pendientes || [] }
}

// ---------- texto ----------
const vtoTxt = e => e.dias === null ? (e.vto || 'sin fecha')
  : e.dias < 0 ? `venció el ${e.vto} (hace ${-e.dias} días)`
  : e.dias === 0 ? `🔥 VENCE HOY ${e.vto}`
  : e.dias <= 3 ? `🔥 vence el ${e.vto} (en ${e.dias} días)`
  : `vence el ${e.vto} (en ${e.dias} días)`
const itemVep = e => `- **${e.titular}** · ${e.tipo} ${e.periodo || ''} · ${vtoTxt(e)} · ${e.asunto}`
const NOTA_CONTADOR = 'Esto sale del mail, no del banco: si pagaste y avisaste por WhatsApp, acá sigue figurando. Chequear en ARCA antes de pagar dos veces.'
// leido = "17/09/2026 15:00": cuándo se leyó el mail de Diego por última vez (solo cuando el dato no es de esta corrida)
const notaLeido = leido => leido ? `El mail de Diego se leyó por última vez el ${leido} (lo lee la Mac cuando está abierta). Lo que haya llegado después no figura acá.` : ''

function contadorMarkdown(c, leido) {
  if (!c) return '## 🧾 El contador (Diego)\n\n⚠️ Todavía no hay ninguna lectura del mail de Diego guardada en la solapa DIARIA.'
  if (c.error) return `## 🧾 El contador (Diego)\n\n⚠️ No pude leer el radar del contador: ${c.error}`
  const L = ['## 🧾 El contador (Diego)', '']
  if (leido) L.push(notaLeido(leido), '')
  L.push(`**🔴 Impago según Diego y sin confirmación tuya (${c.impagos.length})**`)
  L.push(c.impagos.length ? c.impagos.map(itemVep).join('\n') : '- (ninguno)')
  L.push('', `**🟡 Sin noticias: el VEP llegó y nadie dijo "pagado" (${c.sinNoticias.length})**`)
  L.push(c.sinNoticias.length ? c.sinNoticias.map(itemVep).join('\n') : '- (ninguno)')
  L.push('', `**📩 Te pidió algo y no contestaste (${c.pendientes.length})**`)
  L.push(c.pendientes.length ? c.pendientes.map(e => `- ${e.fecha} · ${e.asunto} → ${e.resumen}`).join('\n') : '- (nada pendiente)')
  L.push('', NOTA_CONTADOR)
  return L.join('\n')
}

// ---------- html ----------
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
function md2html(md){
  const out=[]; let enLista=false
  for (const raw of md.split('\n')) {
    const l = raw.trimEnd()
    if (l.startsWith('- ')) { if(!enLista){out.push('<ul>');enLista=true} out.push(`<li>${inline(l.slice(2))}</li>`); continue }
    if (enLista) { out.push('</ul>'); enLista=false }
    if (l.startsWith('# ')) out.push(`<h1>${inline(l.slice(2))}</h1>`)
    else if (l.startsWith('## ')) out.push(`<h2>${inline(l.slice(3))}</h2>`)
    else if (l === '---') out.push('<hr>')
    else if (l === '') out.push('')
    else out.push(`<p>${inline(l)}</p>`)
  }
  if (enLista) out.push('</ul>')
  return out.join('\n')
}
const colorVto = e => e.dias === null ? '#777' : e.dias <= 3 ? '#CE2637' : e.dias <= 10 ? '#B07712' : '#555'
const tablaVeps = (lista, vacio) => !lista.length ? `<p style="color:#777">${vacio}</p>` :
  `<table style="border-collapse:collapse;width:100%;font-size:13.5px">${lista.map(e => `<tr style="border-bottom:1px solid #eee">
    <td style="padding:6px 6px 6px 0;white-space:nowrap"><b>${esc(e.titular)}</b><br><span style="color:#777">${esc(e.tipo)} ${esc(e.periodo||'')}</span></td>
    <td style="padding:6px;color:${colorVto(e)};white-space:nowrap;font-weight:600">${esc(vtoTxt(e))}</td>
    <td style="padding:6px 0 6px 6px;color:#555">${esc(e.asunto)}</td></tr>`).join('')}</table>`
function contadorHtml(c, leido){
  if (!c) return `<h2>🧾 El contador (Diego)</h2><p>⚠️ Todavía no hay ninguna lectura del mail de Diego guardada en la solapa DIARIA.</p>`
  if (c.error) return `<h2>🧾 El contador (Diego)</h2><p>⚠️ No pude leer el radar del contador: ${esc(c.error)}</p>`
  return `<h2>🧾 El contador (Diego)</h2>
${leido ? `<p style="background:#FFF6E0;border-left:3px solid #B07712;padding:8px 12px;border-radius:0 6px 6px 0;font-size:13.5px">${esc(notaLeido(leido))}</p>` : ''}
<p><b>🔴 Impago según Diego y sin confirmación tuya (${c.impagos.length})</b></p>${tablaVeps(c.impagos, 'Ninguno.')}
<p style="margin-top:14px"><b>🟡 Sin noticias: el VEP llegó y nadie dijo "pagado" (${c.sinNoticias.length})</b></p>${tablaVeps(c.sinNoticias, 'Ninguno.')}
<p style="margin-top:14px"><b>📩 Te pidió algo y no contestaste (${c.pendientes.length})</b></p>
${c.pendientes.length ? `<ul>${c.pendientes.map(e => `<li>${esc(e.fecha)} · ${esc(e.asunto)} → ${esc(e.resumen)}</li>`).join('')}</ul>` : '<p style="color:#777">Nada pendiente.</p>'}
<p style="color:#777;font-size:12.5px">${esc(NOTA_CONTADOR)}</p>`
}

// brief: lo que devuelve calcularBrief (o {error}) · contador: el radar (o {error}, o null si no hay ninguno guardado)
// origen: quién lo genera, para el pie ("scripts/diaria.mjs" o "Vercel") · contadorLeido: ver notaLeido
export function armarMail({ brief, contador, tarde, ahoraAR, link, origen, contadorLeido = '' }) {
  const { ddmmyyyy, hhmm, fechaLarga } = partesFecha(ahoraAR)
  const ahora = `${ddmmyyyy} ${hhmm}`
  const titulo = tarde ? '🕒 La tarde de Magma' : '☀️ La diaria de Magma'
  const intro = tarde
    ? 'Segundo aviso del día. Esto es lo que sigue abierto ahora a las 15: lo que ya resolviste a la mañana no aparece más. Lo que quede acá, o se hace antes de cerrar o pasa a mañana a las 8.'
    : ''
  const textoBrief = brief.error ? `⚠️ No pude calcular el brief del día: ${brief.error}` : briefMarkdown(brief)
  const textoIA = tarde ? '' : bloqueIA(ahoraAR)   // solo a la mañana: 10 min de IA (lib/ia-diaria.mjs)
  const texto = [intro, textoBrief, textoIA, contadorMarkdown(contador, contadorLeido), '---', `Abrí la diaria en la app: ${link}`, `Generado por ${origen} · ${ahora}`].filter(Boolean).join('\n\n')
  const html = `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;color:#111;max-width:680px;margin:0 auto;padding:16px">
<style>h1{font-size:22px;margin:18px 0 8px}h2{font-size:16px;margin:22px 0 6px;color:#CE2637}ul{margin:4px 0 8px 18px;padding:0}li{margin:3px 0}p{margin:4px 0}hr{border:0;border-top:1px solid #ddd;margin:16px 0}.intro{background:#FBE9EB;border-left:3px solid #CE2637;padding:8px 12px;margin:0 0 12px;border-radius:0 6px 6px 0}</style>
<a href="${link}" style="display:inline-block;background:#CE2637;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:8px;font-size:15px">Abrir la diaria en la app →</a>
<p style="color:#777;font-size:12.5px;margin:8px 0 18px">${tarde ? 'Segundo aviso' : 'Primer aviso'} · ${esc(fechaLarga)} ${hhmm}. En la app se ve mejor y se recalcula al abrir; acá abajo va lo mismo por si estás sin señal.</p>
${intro ? `<p class="intro">${esc(intro)}</p>` : ''}
${md2html(textoBrief)}
${textoIA ? md2html(textoIA) : ''}
${contadorHtml(contador, contadorLeido)}
<hr><p style="color:#777;font-size:12px"><a href="${link}" style="color:#1543F8">${link}</a> · generada ${ahora} por ${esc(origen)}</p>
</body></html>`
  return { subject: `${titulo} — ${fechaLarga}`, texto, html }
}

// ---------- la solapa DIARIA ----------
// Crea la solapa si no existe y le agrega la columna "Mail" (N) si todavía tiene las 13 originales.
export async function asegurarSolapa(sheets, SHEET_ID) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties(title,sheetId,gridProperties.columnCount)' })
  let hoja = meta.data.sheets.find(s => s.properties.title === 'DIARIA')?.properties
  if (!hoja) {
    const r = await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: 'DIARIA', gridProperties: { frozenRowCount: 1, columnCount: HEADERS.length } } } }] } })
    hoja = r.data.replies[0].addSheet.properties
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: 'DIARIA!A1', valueInputOption: 'USER_ENTERED', requestBody: { values: [HEADERS] } })
    return
  }
  const cols = hoja.gridProperties?.columnCount || 0
  if (cols < HEADERS.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ appendDimension: { sheetId: hoja.sheetId, dimension: 'COLUMNS', length: HEADERS.length - cols } }] } })
  const h = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'DIARIA!N1' })
  if (!txt(h.data.values?.[0]?.[0])) await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: 'DIARIA!N1', valueInputOption: 'USER_ENTERED', requestBody: { values: [['Mail']] } })
}

export async function leerDiaria(sheets, SHEET_ID) {
  const d = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'DIARIA!A:N', valueRenderOption: 'FORMATTED_VALUE' })
  return (d.data.values || []).slice(1)
}

const mismoDia = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const sinTilde = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// ¿Ya salió el mail de este aviso hoy? Solo cuentan las filas donde la columna Mail dice quién lo mandó.
export function yaEnviado(filas, ahoraAR, aviso) {
  const f = filas.find(x => mismoDia(parseFecha(x[0]), ahoraAR) && sinTilde(x[2]) === sinTilde(aviso) && /^(mac|vercel)$/i.test(txt(x[COL_MAIL])))
  return f ? txt(f[COL_MAIL]) : ''
}

// La última lectura del mail de Diego que quedó guardada (la escribe la Mac). Devuelve { contador, leido } o null.
export function ultimoContador(filas) {
  const conJson = filas.filter(x => txt(x[12]))
  for (let i = conJson.length - 1; i >= 0; i--) {
    try { return { contador: JSON.parse(conJson[i][12]), leido: `${txt(conJson[i][0])} ${txt(conJson[i][1])}` } } catch { /* json cortado: probar la anterior */ }
  }
  return null
}

// contadorLeidoAhora: true cuando esta corrida leyó el mail de Diego (la Mac). Si no, K/L/M quedan vacías
// y la página /diaria sigue mostrando la última lectura real.
export function filaDiaria({ brief, contador, contadorLeidoAhora, aviso, ahoraAR, mail }) {
  const { ddmmyyyy, hhmm } = partesFecha(ahoraAR)
  const c = brief.cobros || {}, pl = brief.pipeline || {}
  const ok = contadorLeidoAhora && contador && !contador.error
  return [ddmmyyyy, hhmm, aviso,
    c.vencidas || 0, c.vencidasN || 0, c.vencenSemana || 0, c.atrasadas || 0, c.porCobrar || 0, pl.esperaMonto || 0, brief.en7SinStaffN || 0,
    ok ? contador.impagos.length : '', ok ? contador.sinNoticias.length : '', ok ? JSON.stringify(contador) : '', mail]
}

export async function escribirFila(sheets, SHEET_ID, fila) {
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'DIARIA!A:N', valueInputOption: 'USER_ENTERED', requestBody: { values: [fila] } })
}
