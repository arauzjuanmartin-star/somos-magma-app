// Lo que el pedido de seguro guarda en Drive: los archivos que manda el cliente (protocolo,
// planilla) y el certificado que devuelve La Segunda. Todo en la unidad compartida
// ADMINISTRACION / Seguros / <cliente>, con el N° del trabajo y la fecha en el nombre.
// Solo para el servidor (usa googleapis): lo comparten seguro-pedir.js y seguro-certificado.js.
import { google } from 'googleapis'
import { Readable } from 'stream'

export const DRIVE_ADMINISTRACION = '0AHMUebE7UIa_Uk9PVA'   // la misma unidad donde van las facturas de freelancers

export const getDrive = () => google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({
  credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/drive'],
}) })

export const nombreLimpio = s => String(s || 'archivo').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)
export const fechaArchivo = () => { const d = new Date(Date.now() - 3 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}` }

export async function carpetaDe(drive, nombre, parentId) {
  const safe = String(nombre).replace(/'/g, "\\'")
  const r = await drive.files.list({ q: `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true })
  if (r.data.files.length) return r.data.files[0].id
  const f = await drive.files.create({ requestBody: { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id', supportsAllDrives: true })
  return f.data.id
}

// Sube un archivo a Seguros / <cliente> y devuelve {id, link, nombre}
export async function subirASeguros(drive, { num, cliente, nombre, tipo, content }) {
  const carpetaSeg = await carpetaDe(drive, 'Seguros', DRIVE_ADMINISTRACION)
  const carpetaCli = await carpetaDe(drive, nombreLimpio(cliente || 'Sin cliente'), carpetaSeg)
  const f = await drive.files.create({
    requestBody: { name: `#${String(num).trim()} · ${fechaArchivo()} · ${nombreLimpio(nombre)}`, parents: [carpetaCli] },
    media: { mimeType: tipo || 'application/octet-stream', body: Readable.from(content) },
    fields: 'id,webViewLink', supportsAllDrives: true,
  })
  return { id: f.data.id, link: f.data.webViewLink, nombre: nombreLimpio(nombre) }
}
