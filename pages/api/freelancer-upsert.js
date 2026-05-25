import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { nombre, rubro, celular, mailFreelancer, dni, cuit, banco, alias, cbu, fechaNac, nacionalidad } = req.body
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Nombre requerido' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RRHH!A:K' })
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
    }

    const norm = v => String(v||'').trim().toLowerCase()
    const filaExistente = rows.findIndex((row,i) => i>0 && norm(row[idx.nombre]) === norm(nombre))

    if (filaExistente > 0) {
      const fila = filaExistente + 1
      const set = (campo, valor) => {
        if (valor === undefined || valor === null || valor === '') return null
        const col = idx[campo]
        if (col === undefined || col === -1) return null
        return { range: `RRHH!${colLetra(col)}${fila}`, values: [[String(valor)]] }
      }
      const updates = [
        set('rubro', rubro), set('cel', celular), set('mail', mailFreelancer),
        set('dni', dni), set('cuit', cuit), set('banco', banco),
        set('alias', alias), set('cbu', cbu), set('fechaNac', fechaNac), set('nac', nacionalidad),
      ].filter(Boolean)
      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
        })
      }
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'LOG!A:F',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[new Date().toISOString(), mail, 'freelancer-update', 'RRHH', nombre, `campos=${updates.length}`]] },
        })
      } catch (e) {}
      return res.json({ ok: true, accion: 'actualizado', fila })
    }

    // Nuevo freelancer
    const row = new Array(11).fill('')
    row[idx.nombre] = nombre.trim()
    row[idx.rubro] = rubro || ''
    row[idx.cel] = celular || ''
    row[idx.mail] = mailFreelancer || ''
    row[idx.dni] = dni || ''
    row[idx.fechaNac] = fechaNac || ''
    row[idx.nac] = nacionalidad || ''
    row[idx.cuit] = cuit || ''
    row[idx.banco] = banco || ''
    row[idx.alias] = alias || ''
    row[idx.cbu] = cbu || ''

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'RRHH!A:K',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })

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
