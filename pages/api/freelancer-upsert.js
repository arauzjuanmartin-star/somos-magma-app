import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

// Renombra un freelancer en TODAS sus referencias: Proyectos (Staff) + Pagos Staff (Freelancer)
async function renombrarEnReferencias(sheets, SHEET_ID, nombreOriginal, nombreNuevo) {
  const norm = v => String(v||'').trim().toLowerCase()
  const nuevo = String(nombreNuevo).trim()
  let total = 0
  try {
    const rP = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:CF' })
    const pRows = rP.data.values || [], pH = pRows[0] || []
    const updP = []
    for (let i = 1; i < pRows.length; i++) pH.forEach((h, c) => {
      const ht = String(h||'').trim()
      if ((ht === 'Staff' || /^Staff \d+$/.test(ht)) && norm(pRows[i][c]) === norm(nombreOriginal)) updP.push({ range: `PROYECTOS!${colLetra(c)}${i+1}`, values: [[nuevo]] })
    })
    if (updP.length) { await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW', data: updP } }); total += updP.length }
  } catch (e) { console.error('rename PROYECTOS:', e.message) }
  try {
    const rPS = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:L' })
    const psRows = rPS.data.values || [], psH = psRows[0] || []
    const iFre = psH.indexOf('Freelancer') !== -1 ? psH.indexOf('Freelancer') : 1
    const updPS = []
    for (let i = 1; i < psRows.length; i++) if (norm(psRows[i][iFre]) === norm(nombreOriginal)) updPS.push({ range: `PAGOS_STAFF!${colLetra(iFre)}${i+1}`, values: [[nuevo]] })
    if (updPS.length) { await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW', data: updPS } }); total += updPS.length }
  } catch (e) { console.error('rename PAGOS_STAFF:', e.message) }
  return total
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { nombre, nombreOriginal, rubro, celular, mailFreelancer, dni, cuit, banco, alias, cbu, fechaNac, nacionalidad,
          tarifaMedia, tarifaJornada, zona, estado, notas } = req.body
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Nombre requerido' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    // A:P — incluye las columnas del registro (tarifas, zona, estado, notas)
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RRHH!A:P' })
    const headers = r.data.values?.[0] || []
    const rows = r.data.values || []

    const idx = {
      nombre: headers.indexOf('Nombre Apellido'),
      rubro: headers.indexOf('Rubro'),
      cel: headers.indexOf('Celular'),
      mail: headers.indexOf('Mail'),
      dni: headers.indexOf('Dni'),
      fechaNac: headers.indexOf('Fecha de nac'),
      nac: headers.indexOf('Nacionalidad'),
      cuit: headers.indexOf('CUIT/CUIL'),
      banco: headers.indexOf('Banco'),
      alias: headers.indexOf('Alias'),
      cbu: headers.indexOf('CBU'),
      tarifaMedia: headers.indexOf('Tarifa media jornada'),
      tarifaJornada: headers.indexOf('Tarifa jornada'),
      zona: headers.indexOf('Zona'),
      estado: headers.indexOf('Estado'),
      notas: headers.indexOf('Notas'),
    }

    const norm = v => String(v||'').trim().toLowerCase()
    // Buscamos por el nombre original (si viene de un rename) o por el nombre actual
    const buscar = nombreOriginal || nombre
    const filaExistente = rows.findIndex((row,i) => i>0 && norm(row[idx.nombre]) === norm(buscar))

    if (filaExistente > 0) {
      const fila = filaExistente + 1
      const set = (campo, valor) => {
        if (valor === undefined || valor === null || valor === '') return null
        const col = idx[campo]
        if (col === undefined || col === -1) return null
        return { range: `RRHH!${colLetra(col)}${fila}`, values: [[String(valor)]] }
      }
      // Estado y Notas SÍ se pueden vaciar (son campos que se corrigen), el resto no se pisa con vacío
      const setNulleable = (campo, valor) => {
        if (valor === undefined || valor === null) return null
        const col = idx[campo]
        if (col === undefined || col === -1) return null
        return { range: `RRHH!${colLetra(col)}${fila}`, values: [[String(valor)]] }
      }
      const updates = [
        set('rubro', rubro), set('cel', celular), set('mail', mailFreelancer),
        set('dni', dni), set('cuit', cuit), set('banco', banco),
        set('alias', alias), set('cbu', cbu), set('fechaNac', fechaNac), set('nac', nacionalidad),
        set('tarifaMedia', tarifaMedia), set('tarifaJornada', tarifaJornada), set('zona', zona),
        setNulleable('estado', estado), setNulleable('notas', notas),
      ].filter(Boolean)
      // Renombrar: si cambió el nombre, actualizar la columna Nombre Apellido
      if (nombreOriginal && norm(nombreOriginal) !== norm(nombre) && idx.nombre !== -1) {
        updates.push({ range: `RRHH!${colLetra(idx.nombre)}${fila}`, values: [[String(nombre).trim()]] })
      }
      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'RAW', data: updates }
        })
      }

      // RENOMBRE GLOBAL: si cambió el nombre, propagar a Proyectos (Staff) y Pagos Staff (Freelancer)
      let renombrados = 0
      if (nombreOriginal && norm(nombreOriginal) !== norm(nombre)) {
        renombrados = await renombrarEnReferencias(sheets, SHEET_ID, nombreOriginal, nombre)
      }

      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'LOG!A:F',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[new Date().toISOString(), mail, 'freelancer-update', 'RRHH', nombre, `campos=${updates.length}${renombrados?` rename=${renombrados}`:''}`]] },
        })
      } catch (e) {}
      return res.json({ ok: true, accion: 'actualizado', fila })
    }

    // Nuevo freelancer
    const row = new Array(Math.max(16, headers.length)).fill('')
    const put = (campo, valor) => { const c = idx[campo]; if (c >= 0) row[c] = valor || '' }
    row[idx.nombre] = nombre.trim()
    put('rubro', rubro); put('cel', celular); put('mail', mailFreelancer); put('dni', dni)
    put('fechaNac', fechaNac); put('nac', nacionalidad); put('cuit', cuit); put('banco', banco)
    put('alias', alias); put('cbu', cbu)
    put('tarifaMedia', tarifaMedia); put('tarifaJornada', tarifaJornada); put('zona', zona)
    put('estado', estado); put('notas', notas)

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'RRHH!A:P',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })

    // Si vino de corregir el nombre de un staff ya cargado en trabajos, renombrar sus referencias
    if (nombreOriginal && norm(nombreOriginal) !== norm(nombre)) {
      try { await renombrarEnReferencias(sheets, SHEET_ID, nombreOriginal, nombre) } catch (e) {}
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'freelancer-nuevo', 'RRHH', nombre, `rubro=${rubro||''} cuit=${cuit||''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, accion: 'creado' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
