import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Cuenta corriente de cada socio contra Magma. Misma lógica que scripts/cuenta-socios.mjs
// (criterios definidos por Juan el 31/07/2026, ampliados el 02/08):
//   · sueldo $3.000.000/mes, se devenga desde MAYO hasta el mes en curso
//     (el sueldo de un mes corresponde al trabajo del mes anterior, ya hecho)
//   · extras (trabajo como staff en proyectos) desde MARZO hasta el mes pasado
//   · los gastos personales pagados con tarjeta de Magma son retiro
//   · los préstamos Galicia SGR no entran: están a nombre de Sofi pero los paga Magma
const SUELDO = 3000000
const SUELDO_DESDE = 5      // mayo
const EXTRAS_DESDE = 3      // marzo
const ANIO = 2026
const SANT_COMPARTIDO = 'Santander #810-03510008128/6'   // 50% Magma / 50% Sofi
const SANT_PERSONAL   = 'Santander #810-03510008035/1'   // 100% Sofi
// pagos que Magma hizo por Sofi y que ella declaró; todavía no están en ninguna solapa
const PAGOS_SOFI_DECLARADOS = [
  { mes:5, concepto:'Pago tarjeta Visa Galicia', monto:600000 },
  { mes:5, concepto:'Pago tarjeta Visa Galicia', monto:217230 },
  { mes:5, concepto:'Pago psicóloga',            monto:86000 },
  { mes:6, concepto:'Pago tarjeta Visa Galicia', monto:474630 },
  { mes:6, concepto:'Haberes',                   monto:2800000 },
]
const PUSO_SOFI = [{ mes:7, concepto:'Préstamo en efectivo a Magma', monto:600000 }]
const PED = [11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

const txt = v => String(v ?? '').trim()
const num = v => { if (typeof v === 'number') return v; const s = txt(v).replace(/[^\d.-]/g,''); const n = parseFloat(s); return isNaN(n) ? 0 : n }
const fecha = v => { const m = txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m) return null; let y = +m[3]; if(y<100) y+=2000; return new Date(y, +m[2]-1, +m[1]) }

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID,
      ranges: ['SOCIOS_MOVIMIENTOS','MOVIMIENTOS_TARJETA','PRESTAMOS','PROYECTOS'], valueRenderOption: 'FORMATTED_VALUE' })
    const [SM, MT, PRE, PRO] = r.data.valueRanges.map(v => v.values || [])

    const hoy = new Date()
    // el sueldo del mes en curso ya está devengado (corresponde al trabajo del mes pasado)
    const hastaSueldo = hoy.getFullYear() > ANIO ? 12 : hoy.getMonth() + 1
    const hastaExtras = hastaSueldo - 1
    const MESES = []
    for (let m = SUELDO_DESDE; m <= hastaSueldo; m++) MESES.push(m)

    // ── lo que Magma pagó por Sofi: cuotas de sus préstamos personales ──
    const cuota = (pres, mes) => { let v = 0
      PRE.slice(1).forEach(row => { if (!row || txt(row[0]) !== pres) return
        const f = fecha(row[3]); if (!f || f.getFullYear() !== ANIO || f.getMonth()+1 !== mes) return
        v = num(row[4]) })
      return v }
    const recSofi = []
    MESES.forEach(m => {
      const c1 = cuota(SANT_COMPARTIDO, m), c2 = cuota(SANT_PERSONAL, m)
      if (c1) recSofi.push({ mes:m, concepto:'Santander compartido (50%)', monto:c1/2 })
      if (c2) recSofi.push({ mes:m, concepto:'Santander personal (100%)',  monto:c2 })
    })
    PAGOS_SOFI_DECLARADOS.forEach(p => { if (MESES.includes(p.mes)) recSofi.push(p) })

    // ── SOCIOS_MOVIMIENTOS: solo ARS y solo lo que pasa con Magma ──
    const recJuan = [], pusoJuan = [], usd = []
    SM.slice(1).forEach(row => { if (!row || !txt(row[0])) return
      const f = fecha(row[0]); if (!f || f.getFullYear() !== ANIO) return
      const socio = txt(row[1]), dir = txt(row[2]), concepto = txt(row[3]), monto = num(row[4])
      const moneda = txt(row[9] || 'ARS').toUpperCase()
      if (/→/.test(dir) && !/magma/i.test(dir)) return      // deuda entre socios: va por otro lado
      if (moneda !== 'ARS') { usd.push({ socio, dir, concepto, monto }); return }
      if (f.getMonth()+1 < SUELDO_DESDE) return
      if (!/juan/i.test(socio)) return
      const item = { mes: f.getMonth()+1, concepto, monto }
      if (/Magma→Socio/i.test(dir)) recJuan.push(item); else pusoJuan.push(item)
    })

    // ── gastos personales con tarjeta de Magma (col 4 = titular) ──
    const tarj = { Juan: {}, Sofi: {} }
    MT.slice(1).forEach(row => { if (!row || !txt(row[0])) return
      if (!/personal/i.test(txt(row[8]))) return
      const mes = num(row[1]); if (mes < SUELDO_DESDE) return
      const tit = /sof/i.test(txt(row[4])) ? 'Sofi' : (/juan/i.test(txt(row[4])) ? 'Juan' : null)
      if (!tit) return
      tarj[tit][mes] = (tarj[tit][mes] || 0) + num(row[7])
    })

    // ── extras: trabajo de los socios como staff dentro de los proyectos ──
    const extras = { Juan: {}, Sofi: {} }
    PRO.slice(1).forEach(row => {
      const f = fecha(row[3]); if (!f || f.getFullYear() !== ANIO) return
      const mes = f.getMonth()+1; if (mes < EXTRAS_DESDE || mes > hastaExtras) return
      PED.forEach(c => { const p = txt(row[c]); if (!p) return
        const v = num(row[c+1]), pers = txt(row[c+2])
        if (v <= 1 || !pers) return
        const q = /juan martin arauz/i.test(pers) ? 'Juan' : (/sofia maria grenier/i.test(pers) ? 'Sofi' : null)
        if (!q) return
        extras[q][mes] = (extras[q][mes] || 0) + v })
    })

    const armar = (nombre, recibidos, puestos) => {
      const sueldo = SUELDO * MESES.length
      const extra = Object.values(extras[nombre]).reduce((s,v)=>s+v, 0)
      const rec = recibidos.reduce((s,x)=>s+x.monto, 0)
      const gt = Object.values(tarj[nombre]).reduce((s,v)=>s+v, 0)
      const pus = puestos.reduce((s,x)=>s+x.monto, 0)
      return { nombre, sueldo, meses: MESES.length, extra, devengado: sueldo+extra,
        recibido: rec, tarjetas: gt, puso: pus, saldo: sueldo+extra-rec-gt+pus,
        extrasPorMes: extras[nombre], tarjPorMes: tarj[nombre],
        detalleRecibido: recibidos.sort((a,b)=>a.mes-b.mes) }
    }
    res.json({ ok:true, anio: ANIO, sueldoMensual: SUELDO,
      desdeSueldo: SUELDO_DESDE, hastaSueldo, desdeExtras: EXTRAS_DESDE, hastaExtras,
      socios: [armar('Sofi', recSofi, PUSO_SOFI), armar('Juan', recJuan, pusoJuan)], usd })
  } catch (e) {
    console.error('socios-cuenta', e)
    res.status(500).json({ error: e.message })
  }
}
