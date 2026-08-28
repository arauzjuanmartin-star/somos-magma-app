import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Chequeo semanal calculado EN VIVO desde el Master Magma.
// Misma lógica que scripts/somos-semana.mjs. Se recalcula en cada visita → siempre actual.
// Protegido por auth: solo mails autorizados (Juan, Sofi, equipo) pueden verlo.

const ERR = /^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt = v => { const s = String(v ?? '').trim(); return ERR.test(s) ? '' : s }
const num = v => { const s = txt(v).replace(/\s/g, ''); if (!s) return 0; const neg = /^-/.test(s); const n = parseFloat(s.replace(/[^\d.]/g, '')) || 0; return neg ? -n : n }
const fecha = v => { const m = txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; const d = new Date(y, +m[2] - 1, +m[1]); return isNaN(d) ? null : d }
const esTrue = v => /^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(v))

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      ranges: ['PRESUPUESTOS!A:DI', 'PROYECTOS!A:ER', 'FACTURACION!A:AG', 'PRESTAMOS!A:T', 'PAGOS_STAFF!A:N', 'TARJETAS!A:N', 'MOVIMIENTOS_TARJETA!A:N', 'AGENCIAS!A:L', 'Contactos/agencias!A:Z'],
      valueRenderOption: 'FORMATTED_VALUE',
    }))
    const [PRE, PRO, FAC, PST, PAG, TAR, MOV, AG, CON] = r.data.valueRanges.map(v => v.values || [])
    const PRC = [12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 61, 64, 67, 70, 73, 76, 79, 82]
    const STF = [13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46, 49, 62, 65, 68, 71, 74, 77, 80, 83]
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const ANIO = hoy.getFullYear()
    const DIA = 86400000, dias = d => Math.round((hoy - d) / DIA)

    // 1. Cobranzas
    const pc = FAC.slice(1).filter(f => (txt(f[1]) || txt(f[8])) && !esTrue(f[4]) && num(f[12]) > 0)
    const sinEmitir = pc.filter(f => !txt(f[14]))
    const vencidas = pc.filter(f => { const v = fecha(f[19]); return v && v < hoy })
    const facMes = FAC.slice(1).filter(f => { const fe = fecha(f[6]); return fe && fe.getFullYear() === ANIO && fe.getMonth() === hoy.getMonth() }).reduce((s, f) => s + num(f[12]), 0)
    const proMes = PRO.slice(1).filter(p => { const fe = fecha(p[3]); return txt(p[2]) && fe && fe.getFullYear() === ANIO && fe.getMonth() === hoy.getMonth() }).reduce((s, p) => s + num(p[7]), 0)
    const cobranzas = {
      porCobrar: pc.reduce((s, f) => s + num(f[12]), 0), porCobrarN: pc.length,
      sinEmitir: sinEmitir.reduce((s, f) => s + num(f[12]), 0), sinEmitirN: sinEmitir.length,
      vencidas: vencidas.reduce((s, f) => s + num(f[12]), 0), vencidasN: vencidas.length,
      gapMes: Math.max(0, proMes - facMes), facMes, proMes,
      topSinEmitir: sinEmitir.sort((a, b) => num(b[12]) - num(a[12])).slice(0, 5).map(f => ({ cliente: txt(f[8]) || txt(f[7]), proyecto: txt(f[9]), monto: num(f[12]) })),
    }

    // 2. Churn
    const INTERNO = /^(juan|sofi|sofia|somos magma|magma)$/i
    const porCli = {}
    PRO.slice(1).forEach(p => { if (!txt(p[2])) return; const k = txt(p[5]) || txt(p[4]); if (!k || INTERNO.test(k.trim())) return; const fe = fecha(p[3]); if (!fe) return; porCli[k] = porCli[k] || { n: 0, ult: fe, monto: 0 }; porCli[k].n++; porCli[k].monto += num(p[7]); if (fe > porCli[k].ult) porCli[k].ult = fe })
    const churn = Object.entries(porCli).filter(([, d]) => d.n >= 3 && dias(d.ult) > 75 && d.monto >= 1000000).sort((a, b) => b[1].monto - a[1].monto).slice(0, 8).map(([k, d]) => ({ cliente: k, proyectos: d.n, monto: d.monto, dias: dias(d.ult) }))

    // 3. Préstamos — por nombre de header, no por posición: la solapa se reordena
    const pH = PST[0] || [], pcol = n => pH.indexOf(n)
    const iNom = pcol('Prestamo'), iCuo = pcol('Cuota nro'), iVen = pcol('Vencimiento'), iMon = pcol('Monto cuota'), iPag = pcol('Pagado')
    const pend = PST.slice(1).filter(row => !esTrue(row[iPag])).reduce((s, row) => s + num(row[iMon]), 0)
    const prox = PST.slice(1).filter(row => { const v = fecha(row[iVen]); return v && !esTrue(row[iPag]) && v >= hoy && (v - hoy) / DIA <= 35 }).sort((a, b) => fecha(a[iVen]) - fecha(b[iVen])).map(row => ({ prestamo: txt(row[iNom]), cuota: txt(row[iCuo]).replace(/^cuota\s*/i, ''), venc: txt(row[iVen]), monto: num(row[iMon]) }))
    const prestamos = { pendiente: pend, proximas: prox }

    // 4. Deuda Juan/Sofi
    const cuenta = re => { let t = 0, c = 0; PRO.slice(1).forEach(row => { if (!txt(row[2])) return; const fe = fecha(row[3]); if (!fe || fe.getFullYear() !== ANIO) return; STF.forEach((sc, i) => { if (re.test(txt(row[sc]))) t += num(row[PRC[i]]) }) }); PAG.slice(1).forEach(row => { if (!re.test(txt(row[1]))) return; const fp = fecha(row[0]); if (!fp || fp.getFullYear() !== ANIO) return; c += num(row[7]) }); return t - c }
    const dJuan = cuenta(/arauz/i), dSofi = cuenta(/sofia\s+maria\s+grenier/i)
    const deuda = { juan: dJuan, sofi: dSofi, total: dJuan + dSofi }

    // 5. Zombis
    const zomb = PRE.slice(1).filter(p => { const e = txt(p[3]).toUpperCase(); const fe = fecha(p[1]); return txt(p[0]) && /ESPERA|PENDIENTE/.test(e) && fe && fe < hoy })
    const zombis = { n: zomb.length, monto: zomb.reduce((s, p) => s + num(p[8]), 0) }

    // 6. Salud de datos
    let rotas = 0
    ;[CON, AG].forEach(tab => tab.slice(1).forEach(row => row.forEach(c => { if (typeof c === 'string' && ERR.test(c.trim())) rotas++ })))
    const tarSinPers = TAR.slice(1).filter(row => !txt(row[1])).length
    const movSinPers = MOV.slice(1).filter(row => !txt(row[14])).length
    const cnt = {}; PRE.slice(1).forEach(p => { const n = txt(p[0]); if (n) cnt[n] = (cnt[n] || 0) + 1 })
    const dup = Object.entries(cnt).filter(([, c]) => c > 1).map(([n, c]) => ({ nro: n, veces: c }))
    const datos = { rotas, tarSinPers, movSinPers, duplicados: dup }

    res.json({ generado: new Date().toISOString(), cobranzas, churn, prestamos, deuda, zombis, datos })
  } catch (e) {
    console.error(e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando. Esperá 30s.' })
    res.status(500).json({ error: e.message })
  }
}
