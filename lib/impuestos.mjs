/**
 * IMPUESTOS: los VEP que manda el contador (Diego Musco), uno por fila en la solapa IMPUESTOS.
 *
 * Hasta ahora cada VEP llegaba por mail, alguien lo cargaba a mano como un gasto único (o no lo cargaba) y nadie sabía
 * con certeza cuáles se habían pagado: Diego avisaba que quedaron impagos semanas después. Acá cada VEP tiene su monto,
 * su vencimiento (el que escribe Diego en el mail: "VENCE: 21/09", no el día en que expira el volante, que es más tarde)
 * y su número, que es lo que el banco escribe cuando se paga ("PAGOS AFIP VEP 1674405875").
 *
 * Es cálculo puro, como lib/caja.mjs: no lee ni escribe nada. Lo usan Caja, Hoy, el cruce del extracto y los scripts.
 *
 * La solapa tiene las mismas columnas de pago que TARJETAS y PRESTAMOS (Monto, Vencimiento, Pagado, Fecha pago,
 * Cuenta pago, Monto pagado) para que el botón "Pagué" y el extracto la marquen igual que a esas.
 * "Pagado" puede ser: SI · NO · NO VA (el volante se reemplazó por otro, no se paga) · SIN DATO (es de antes de tener
 * los extractos cargados: no se sabe).
 */
const txt = v => String(v ?? '').trim()
const num = v => { if (v === null || v === undefined || v === '') return 0; if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const fechaDe = s => { const m = txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1]) }
const dmy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
const DIA = 864e5

// Los cuatro contribuyentes que lleva el contador. "re" es cómo aparece cada uno en un asunto o en el nombre de un gasto.
export const TITULARES = [
  { cuit: '30719228026', nombre: 'Magma', re: /magma|srl/i },
  { cuit: '27379959712', nombre: 'Sofi', re: /sof[ií]/i },
  { cuit: '27419156650', nombre: 'Lucia', re: /luc[ií]a|lulu/i },
  { cuit: '23307837439', nombre: 'Juan', re: /juan/i },
]
// Cada impuesto: cómo lo escribe Diego en el asunto, cómo figura en el volante y cómo lo carga el equipo en los gastos fijos.
export const IMPUESTOS = [
  { nombre: 'IVA', re: /\biva\b/i, vep: /^IVA\b|IVA - Saldo DJ/im },
  { nombre: 'IIBB', re: /iibb|ing\.?\s*brutos|ingresos brutos|sifere/i, vep: /Convenio Multilateral|SIFERE|^CM /im },
  { nombre: 'F.931', re: /\b931\b|sicoss|cargas sociales/i, vep: /SICOSS|SIJP/i },
  { nombre: 'Autónomos', re: /aut[oó]nomos?/i, vep: /Autonomo/i },
  { nombre: 'Monotributo', re: /monotributo/i, vep: /Monotribut/i },
]
const titularDeCuit = c => TITULARES.find(t => t.cuit === txt(c).replace(/\D/g, ''))?.nombre || ''
const titularDeTexto = s => TITULARES.find(t => t.re.test(s))?.nombre || ''
const impuestoDeTexto = s => IMPUESTOS.find(i => i.re.test(s))?.nombre || ''
// "06-2026", "06/2026", "2026-06" → "06-2026"
export const periodoDe = s => { const t = txt(s); const m = t.match(/\b(0?[1-9]|1[0-2])[-/](20\d{2})\b/); if (m) return `${m[1].padStart(2, '0')}-${m[2]}`; const y = t.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/); return y ? `${y[2].padStart(2, '0')}-${y[1]}` : '' }

/**
 * Lee el texto de un VEP (el PDF "Volante Electrónico de Pago" de ARCA). No hace falta IA: el volante es texto.
 * @returns { nro, cuit, titular, impuesto, periodo "MM-AAAA", monto, expira "DD/MM/AAAA", generado "DD/MM/AAAA" } o null si no es un VEP
 */
export function leerVep(texto) {
  const t = String(texto || '')
  if (!/Volante Electr[oó]nico de Pago/i.test(t) || !/Importe total a pagar/i.test(t)) return null
  const nro = (t.match(/Nro\.?\s*VEP:\s*(\d+)/i) || [])[1] || ''
  const cuit = ((t.match(/CUIT:\s*([\d-]+)/i) || [])[1] || '').replace(/\D/g, '')
  const per = t.match(/Per[ií]odo:\s*(\d{4})-(\d{2})/i)
  const monto = parseFloat(((t.match(/Importe total a pagar\s*\$?\s*([\d.,]+)/i) || [])[1] || '').replace(/\./g, '').replace(',', '.')) || 0
  const fecha = re => { const m = t.match(re); return m ? `${m[3]}/${m[2]}/${m[1]}` : '' }
  const tipoPago = txt((t.match(/Tipo de Pago:\s*(.+)/i) || [])[1])
  // Qué impuesto es: por cómo figura en el volante; si no se reconoce, el nombre del primer renglón de importes.
  const impuesto = IMPUESTOS.find(i => i.vep.test(t))?.nombre || txt((t.match(/^(.+?)\s*\(\d+\)\s*\$/m) || [])[1]) || tipoPago
  if (!nro || !monto) return null
  return {
    nro, cuit, titular: titularDeCuit(cuit) || cuit, impuesto, periodo: per ? `${per[2]}-${per[1]}` : '', monto,
    expira: fecha(/D[ií]a de Expiraci[oó]n:\s*(\d{4})-(\d{2})-(\d{2})/i), generado: fecha(/Fecha Generaci[oó]n:\s*(\d{4})-(\d{2})-(\d{2})/i),
  }
}

/** Lo que dice el asunto de un mail de Diego: "VEP IVA 06-2026 Somos Magma" → { impuesto, titular, periodo } */
export function leerAsuntoVep(asunto) {
  const s = txt(asunto).replace(/^((RE|RV|FW|FWD)\s*:\s*)+/i, '')
  if (!/^vep\b/i.test(s)) return null
  const impuesto = impuestoDeTexto(s)
  // El 931 (cargas sociales) es solo de Magma: Diego no siempre pone el nombre.
  return { impuesto, titular: titularDeTexto(s) || (impuesto === 'F.931' ? 'Magma' : ''), periodo: periodoDe(s) }
}

/** El vencimiento que escribe Diego en el cuerpo: "VENCE: 21/09", "VENCE; 07/09", "VENCE 15/09". Devuelve "DD/MM/AAAA" o "". */
export function venceDeMail(cuerpo, fechaMail) {
  const m = String(cuerpo || '').match(/VENCE\s*[:;]?\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i)
  if (!m) return ''
  const base = new Date(fechaMail)
  const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : base.getFullYear()
  const d = new Date(y, +m[2] - 1, +m[1])
  // Sin año escrito: si la fecha quedó más de dos meses ANTES del mail, es del año que viene (un mail de diciembre que vence en enero).
  if (!m[3] && base - d > 60 * DIA) d.setFullYear(y + 1)
  return dmy(d)
}

/** "IVA 06-2026 Magma": el nombre con que se muestra un VEP en la app y con que queda anotado en el banco. */
export const nombreVep = r => [txt(r['Impuesto']), txt(r['Período']), txt(r['Titular'])].filter(Boolean).join(' ')

/** 'pagado' · 'pendiente' · 'fuera' (reemplazado por otro volante, o de antes de tener extractos: no cuenta ni como deuda ni como pago) */
export const estadoVep = r => { const p = norm(r['Pagado']); return p === 'si' ? 'pagado' : (p === 'no' || p === '') ? 'pendiente' : 'fuera' }

/**
 * ¿Este gasto fijo es la ESTIMACIÓN (o la carga a mano) de este mismo impuesto? Si lo es, en el mes en que está el VEP
 * el gasto no se cuenta: vale el volante, que trae el monto real. Sin esto el mismo impuesto saldría dos veces.
 * Un gasto de todos los meses ("IIBB Magma", "Autonomos Sofi") coincide por impuesto y titular. Un gasto único
 * ("MAGMA IVA 06-2026") además tiene que ser del mismo período o del mismo monto.
 */
export function gastoEsElVep(g, vep) {
  if (!/impuesto/i.test(`${txt(g['Rubro'])} ${txt(g['Categoria'])}`)) return false
  const nombre = txt(g['Concepto']), donde = `${nombre} ${txt(g['Persona/Cuenta'])}`
  if (/plan de pago|reducci[oó]n/i.test(nombre)) return false   // un plan de pagos o un pago a cuenta no es el volante del mes
  const tit = TITULARES.find(t => t.nombre === txt(vep['Titular'])); if (!tit) return false
  if (TITULARES.some(t => t !== tit && t.re.test(nombre))) return false   // el gasto dice que es de OTRO ("IIBB Lulu" no es el de Magma)
  const unico = /[uú]nico/i.test(txt(g['Frecuencia'])), monto = num(g['Monto'])
  // Un pago único de impuestos por el mismo importe, al centavo, que el volante (o que lo que salió al pagarlo, con
  // intereses): es ese volante cargado a mano, se llame como se llame ("VEP Sofi").
  if (unico && monto > 0 && (Math.abs(monto - num(vep['Monto'])) < 1 || Math.abs(monto - num(vep['Monto pagado'])) < 1)) return true
  const imp = IMPUESTOS.find(i => i.nombre === txt(vep['Impuesto'])); if (!imp || !imp.re.test(nombre)) return false
  // Es del titular si lo nombra; el 931 (cargas sociales) es solo de Magma y casi nunca lo nombra.
  const delTitular = tit.re.test(donde) || (imp.nombre === 'F.931' && tit.nombre === 'Magma')
  if (!unico) return delTitular
  const per = periodoDe(nombre)
  return delTitular && !!per && per === txt(vep['Período'])
}

/**
 * Qué renglón del banco pagó este VEP. BBVA escribe el número del volante: es seguro. Los otros bancos no lo escriben:
 * vale el monto exacto, pagado después de que llegó el volante y antes de 60 días.
 * @param movs [{ fecha: Date, texto, salio: number, cuenta }]
 * @returns { mov, como: 'N° de VEP' | 'mismo monto' } o null
 */
export function pagoDeVep(vep, movs, usados = new Set()) {
  const nro = txt(vep['N° VEP']), monto = num(vep['Monto']), llego = fechaDe(vep['Llegó']) || fechaDe(vep['Vencimiento'])
  const libres = movs.filter(m => !usados.has(m))
  const porNro = nro && libres.find(m => new RegExp(`\\b${nro}\\b`).test(m.texto))
  if (porNro) return { mov: porNro, como: 'N° de VEP' }
  if (!monto || !llego) return null
  const porMonto = libres.filter(m => /afip|arca/i.test(m.texto) && Math.abs(m.salio - monto) < 0.01 && m.fecha - llego >= -2 * DIA && m.fecha - llego <= 60 * DIA).sort((a, b) => a.fecha - b.fecha)[0]
  return porMonto ? { mov: porMonto, como: 'mismo monto' } : null
}

/**
 * Los VEP de un mes para Caja. Uno pagado cuenta en el mes en que salió la plata; uno sin pagar, en el mes en que
 * vence. Los que vencieron en meses anteriores y siguen sin pagar no desaparecen: van al mes en curso, el día 1.
 * @returns [{ r, dia, pagado, atrasado }]
 */
export function vepsDelMes(impuestos, mes, anio, hoy0) {
  const enMes = d => !!d && d.getMonth() + 1 === mes && d.getFullYear() === anio
  const esMesActual = !!hoy0 && mes === hoy0.getMonth() + 1 && anio === hoy0.getFullYear()
  const primerDia = new Date(anio, mes - 1, 1)
  const out = []
  for (const r of impuestos || []) {
    if (!txt(r['Impuesto'])) continue
    const e = estadoVep(r); if (e === 'fuera') continue
    const vence = fechaDe(r['Vencimiento']), pago = fechaDe(r['Fecha pago'])
    if (e === 'pagado') { const d = pago || vence; if (enMes(d)) out.push({ r, dia: d.getDate(), pagado: true, atrasado: false }) }
    else if (enMes(vence)) out.push({ r, dia: vence.getDate(), pagado: false, atrasado: false })
    else if (esMesActual && vence && vence < primerDia) out.push({ r, dia: 1, pagado: false, atrasado: true })
    else if (esMesActual && !vence) out.push({ r, dia: null, pagado: false, atrasado: false })
  }
  return out
}
