import { google } from 'googleapis'
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { Readable } from 'stream'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

const FOLDER_ROOT = '0AHMUebE7UIa_Uk9PVA'  // Shared drive ADMINISTRACION
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

function driveClient() {
  return google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/drive'],
  }) })
}
async function getOrCreateFolder(drive, name, parentId) {
  const safe = String(name).replace(/'/g, "\\'")
  const r = await drive.files.list({ q: `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true })
  if (r.data.files.length) return r.data.files[0].id
  const f = await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id', supportsAllDrives: true })
  return f.data.id
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { tarjeta, mes, anio, movimientos, totalArs, totalUsd, vencimiento, resumenNota, titulares, pdfBase64, fileName } = req.body
  if (!tarjeta || !mes || !anio) return res.status(400).json({ error: 'Faltan campos' })
  const movs = Array.isArray(movimientos) ? movimientos : []
  const tits = Array.isArray(titulares) ? titulares : []

  try {
    const { sheets, SHEET_ID } = await getSheets()

    // 1) PDF del resumen a Drive → link (Resúmenes tarjetas / <tarjeta> / <año>)
    let pdfLink = ''
    if (pdfBase64) {
      try {
        const drive = driveClient()
        const f1 = await getOrCreateFolder(drive, 'Resúmenes tarjetas', FOLDER_ROOT)
        const f2 = await getOrCreateFolder(drive, tarjeta, f1)
        const f3 = await getOrCreateFolder(drive, String(anio), f2)
        const up = await drive.files.create({
          requestBody: { name: fileName || `${tarjeta} ${mes}-${anio}.pdf`, parents: [f3] },
          media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(pdfBase64, 'base64')) },
          fields: 'id,webViewLink', supportsAllDrives: true,
        })
        pdfLink = up.data.webViewLink || ''
      } catch (e) { console.error('drive upload', e.message) }
    }

    // 2) → MOVIMIENTOS_TARJETA: rubros de empresa (agregado) + cada gasto personal con la marca final del usuario. Dedup por tarjeta+mes+año.
    const norm = v => String(v||'').trim().toLowerCase()
    const filas = []
    for (const t of tits) {
      const quien = t.nombre || ''
      for (const [rubro, monto] of Object.entries(t.rubros_empresa || {})) { if (Number(monto)>0) filas.push([tarjeta, mes, anio, '', quien, rubro, 'ARS', Number(monto), 'Empresa', rubro, mail, '']) }
      if (Number(t.empresa_usd)>0) filas.push([tarjeta, mes, anio, '', quien, 'Software', 'USD', Number(t.empresa_usd), 'Empresa', 'Software', mail, ''])
    }
    // cada gasto personal, con la marca final: Personal o (si lo pasaste) Empresa
    movs.forEach(m => filas.push([tarjeta, mes, anio, m.fecha||'', m.titular||'', m.comercio||'', m.moneda||'ARS', Number(m.monto)||0, m.categoria||'Personal', m.subcategoria||'', mail, '']))
    if (filas.length) {
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
        const sid = meta.data.sheets.find(s => s.properties.title === 'MOVIMIENTOS_TARJETA')?.properties.sheetId
        const cur = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'MOVIMIENTOS_TARJETA!A:C' })).data.values || []
        const del = cur.map((r,i)=>({r,i})).filter(({r},i)=> i>0 && norm(r[0])===norm(tarjeta) && String(r[1]).trim()===String(mes).trim() && String(r[2]).includes(String(anio))).map(x=>x.i)
        if (sid!=null && del.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: del.sort((a,b)=>b-a).map(i=>({ deleteDimension: { range: { sheetId: sid, dimension:'ROWS', startIndex:i, endIndex:i+1 } } })) } })
      } catch (e) { console.error('dedup movs', e.message) }
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'MOVIMIENTOS_TARJETA!A:L', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: filas } })
    }

    // 3) Upsert del total en TARJETAS (para Egresos) + link del PDF
    if (totalArs !== undefined && totalArs !== null) {
      const tr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'TARJETAS!A:N' })
      const rows = tr.data.values || [], th = rows[0] || []
      const TH = n => th.indexOf(n)
      const norm = v => String(v||'').trim().toLowerCase()
      const fila = rows.findIndex((row,i) => i>0 && norm(row[TH('Tarjeta')])===norm(tarjeta) && String(row[TH('Mes')]).trim()===String(mes).trim() && String(row[TH('Año')]).includes(String(anio)))
      const setCol = (name, val) => ({ range: `TARJETAS!${colLetra(TH(name))}${fila+1}`, values: [[val]] })
      if (fila > 0) {
        const ups = []
        if (TH('Monto')!==-1) ups.push(setCol('Monto', Number(totalArs)||0))
        if (TH('Monto USD')!==-1 && totalUsd!==undefined) ups.push(setCol('Monto USD', Number(totalUsd)||0))
        if (TH('Vencimiento')!==-1 && vencimiento) ups.push(setCol('Vencimiento', vencimiento))
        if (TH('Notas')!==-1 && resumenNota) ups.push(setCol('Notas', resumenNota))
        if (TH('PDF resumen')!==-1 && pdfLink) ups.push(setCol('PDF resumen', pdfLink))
        if (ups.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: ups } })
      } else {
        const nueva = new Array(Math.max(th.length,14)).fill('')
        const put = (name,val)=>{ if(TH(name)!==-1) nueva[TH(name)]=val }
        put('Tarjeta',tarjeta); put('Mes',mes); put('Año',anio); put('Monto',Number(totalArs)||0)
        put('Monto USD',Number(totalUsd)||0); put('Vencimiento',vencimiento||''); put('Pagado','NO'); put('Notas',resumenNota||''); put('PDF resumen',pdfLink)
        await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'TARJETAS!A:N', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [nueva] } })
      }
    }

    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'tarjeta-guardar', 'TARJETAS', tarjeta, `${mes}/${anio} · ${resumenNota||''}${pdfLink?' · PDF✓':''}`]] } })
    } catch (e) {}

    res.json({ ok: true, guardados: filas.length, pdfLink })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
