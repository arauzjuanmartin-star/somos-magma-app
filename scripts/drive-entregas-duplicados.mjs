/**
 * Carpetas duplicadas en la unidad ENTREGAS.
 *
 * Dos tipos, por dos causas distintas:
 *  1) Un cliente en la raíz que YA existe adentro de su agencia ("IVECO" suelto,
 *     cuando "ADN Comunicacion/IVECO" tiene el material). Lo creaba la app: hasta
 *     hoy Entregas iba solo por cliente y no por agencia.
 *  2) Dos o más carpetas con el mismo nombre en la raíz (POPSTARS x3).
 *
 * SOLO LISTA. No mueve ni borra nada: qué carpeta se queda con el material es una
 * decisión de Juan, y en Drive mover una carpeta le cambia el link a todo el mundo.
 *
 * Uso: node scripts/drive-entregas-duplicados.mjs
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/drive'] })
const drive = google.drive({ version: 'v3', auth })
const ENT = '0AK9Y6BbDhgekUk9PVA'
const clave = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/^CR[_\s]*/, '').replace(/[^A-Z0-9]/g, '')

const hijos = async parent => {
  const out = []
  let token
  do {
    const r = await drive.files.list({ q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, driveId: ENT, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1000, pageToken: token, fields: 'nextPageToken,files(id,name,createdTime)' })
    out.push(...(r.data.files || [])); token = r.data.nextPageToken
  } while (token)
  return out
}
const cuantosDentro = async id => (await drive.files.list({ q: `'${id}' in parents and trashed=false`, driveId: ENT, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1, fields: 'files(id)' })).data.files?.length || 0

const raiz = await hijos(ENT)
console.log(`\nENTREGAS: ${raiz.length} carpetas en la raíz`)

// --- 1) mismo nombre repetido en la raíz
const porClave = new Map()
raiz.forEach(f => { const k = clave(f.name); if (!porClave.has(k)) porClave.set(k, []); porClave.get(k).push(f) })
const repetidas = [...porClave.values()].filter(v => v.length > 1)
console.log(`\n── Mismo nombre repetido en la raíz: ${repetidas.length} casos`)
for (const g of repetidas) {
  console.log(`   "${g[0].name}" x${g.length}`)
  for (const f of g) console.log(`      creada ${(f.createdTime || '').slice(0, 10)} · ${await cuantosDentro(f.id) ? 'CON contenido' : 'vacía'} · https://drive.google.com/drive/folders/${f.id}`)
}

// --- 2) cliente suelto en la raíz que ya vive adentro de otra carpeta de la raíz
console.log('\n── Clientes sueltos en la raíz que ya existen adentro de una agencia:')
let hallados = 0
for (const padre of raiz) {
  const sub = await hijos(padre.id)
  for (const s of sub) {
    const dup = raiz.find(x => x.id !== padre.id && clave(x.name) === clave(s.name))
    if (!dup) continue
    hallados++
    console.log(`   "${dup.name}" (raíz, ${(dup.createdTime || '').slice(0, 10)}, ${await cuantosDentro(dup.id) ? 'CON contenido' : 'vacía'})`)
    console.log(`      ya existe como  ${padre.name} / ${s.name}   (${await cuantosDentro(s.id) ? 'CON contenido' : 'vacía'})`)
    console.log(`      suelta: https://drive.google.com/drive/folders/${dup.id}`)
    console.log(`      buena : https://drive.google.com/drive/folders/${s.id}`)
  }
}
if (!hallados) console.log('   ninguno')
console.log('')
