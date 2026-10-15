/**
 * Sube archivos pesados (videos) a una carpeta de Drive, en tandas y retomando si se corta.
 *
 * Uso:
 *   node scripts/drive-subir-archivo.mjs <folderId> [--carpeta "Guardado de internet"] <archivo> [<archivo>...] [--escribir]
 *
 * - Sin --escribir muestra qué haría y no toca nada.
 * - --carpeta crea (o reusa, si ya existe) una subcarpeta con ese nombre adentro de <folderId>.
 * - Si en el destino ya hay un archivo con el mismo nombre y el mismo peso, lo saltea.
 */
import { google } from 'googleapis'
import { readFileSync, statSync, openSync, readSync, closeSync } from 'fs'
import { basename } from 'path'

const env = Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({version:'v3',auth})

const args = process.argv.slice(2)
const ESCRIBIR = args.includes('--escribir')
const iC = args.indexOf('--carpeta')
const SUB = iC >= 0 ? args[iC+1] : ''
const resto = args.filter((a,i)=>a!=='--escribir' && (iC < 0 || (i!==iC && i!==iC+1)))
const [FOLDER, ...ARCHIVOS] = resto
if (!FOLDER || !ARCHIVOS.length) { console.error('Uso: node scripts/drive-subir-archivo.mjs <folderId> [--carpeta "Nombre"] <archivo>... [--escribir]'); process.exit(1) }

const gb = n => (n/1024/1024/1024).toFixed(2)+' GB'
const TANDA = 64*1024*1024 // múltiplo de 256 KB, como pide Drive

const padre = await drive.files.get({fileId:FOLDER, fields:'id,name,driveId', supportsAllDrives:true})
console.log(`\nDestino: ${padre.data.name}${SUB ? ' / '+SUB : ''}`)

const listar = async (parent, extra='') => (await drive.files.list({
  q:`'${parent}' in parents and trashed=false${extra}`, fields:'files(id,name,size,mimeType,webViewLink)',
  supportsAllDrives:true, includeItemsFromAllDrives:true, pageSize:200 })).data.files || []

let destino = FOLDER
if (SUB) {
  const ya = (await listar(FOLDER, " and mimeType='application/vnd.google-apps.folder'")).find(f=>f.name.trim().toLowerCase()===SUB.trim().toLowerCase())
  if (ya) { destino = ya.id; console.log(`  la carpeta "${ya.name}" ya existe, se usa esa`) }
  else if (ESCRIBIR) {
    const c = await drive.files.create({requestBody:{name:SUB, mimeType:'application/vnd.google-apps.folder', parents:[FOLDER]}, fields:'id', supportsAllDrives:true})
    destino = c.data.id; console.log(`  ✓ carpeta "${SUB}" creada`)
  } else { destino = null; console.log(`  se crearía la carpeta "${SUB}"`) }
}

const existentes = destino ? await listar(destino) : []
let total = 0
for (const ruta of ARCHIVOS) {
  const size = statSync(ruta).size, name = basename(ruta)
  const dup = existentes.find(f=>f.name===name && Number(f.size)===size)
  if (dup) { console.log(`  = ${name} (${gb(size)}) ya está subido, se saltea`); continue }
  total += size
  if (!ESCRIBIR) { console.log(`  + ${name} (${gb(size)}) se subiría`); continue }

  // Subida "resumable": se abre una sesión y se manda de a tandas; si una falla se reintenta desde donde quedó
  const token = async () => (await auth.getAccessToken())
  const ini = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,webViewLink', {
    method:'POST',
    headers:{Authorization:`Bearer ${await token()}`, 'Content-Type':'application/json; charset=UTF-8', 'X-Upload-Content-Type':'video/mp4', 'X-Upload-Content-Length':String(size)},
    body: JSON.stringify({name, parents:[destino]}),
  })
  if (!ini.ok) { console.error(`  ✗ ${name}: no se pudo abrir la subida (${ini.status}) ${await ini.text()}`); process.exit(1) }
  const sesion = ini.headers.get('location')
  const fd = openSync(ruta,'r'); const buf = Buffer.alloc(TANDA)
  let pos = 0, fallos = 0, hecho = null; const t0 = Date.now()
  while (pos < size) {
    const n = readSync(fd, buf, 0, Math.min(TANDA, size-pos), pos)
    let r
    try {
      r = await fetch(sesion, {method:'PUT', headers:{'Content-Length':String(n), 'Content-Range':`bytes ${pos}-${pos+n-1}/${size}`}, body: buf.subarray(0,n)})
    } catch (e) { r = {status:0, _err:e.message} }
    if (r.status === 308) { // tanda recibida: Drive dice hasta dónde tiene
      const rango = r.headers.get('range'); pos = rango ? Number(rango.split('-')[1])+1 : pos+n; fallos = 0
      const seg = (Date.now()-t0)/1000
      console.log(`    ${name}: ${(pos/size*100).toFixed(0)}% (${gb(pos)} de ${gb(size)}, ${(pos/1024/1024/seg).toFixed(1)} MB/s)`)
    } else if (r.status === 200 || r.status === 201) { hecho = await r.json(); pos = size }
    else {
      if (++fallos > 8) { console.error(`  ✗ ${name}: se cortó en ${gb(pos)} (${r.status} ${r._err||''})`); closeSync(fd); process.exit(1) }
      await new Promise(ok=>setTimeout(ok, 2000*fallos))
      // preguntarle a Drive hasta dónde llegó antes de reintentar
      try {
        const q = await fetch(sesion, {method:'PUT', headers:{'Content-Length':'0', 'Content-Range':`bytes */${size}`}})
        if (q.status === 308) { const rango = q.headers.get('range'); pos = rango ? Number(rango.split('-')[1])+1 : 0 }
        else if (q.status === 200 || q.status === 201) { hecho = await q.json(); pos = size }
      } catch {}
    }
  }
  closeSync(fd)
  // Verificación: el peso en Drive tiene que ser el del archivo local
  const v = await drive.files.get({fileId:hecho.id, fields:'id,name,size,webViewLink', supportsAllDrives:true})
  const ok = Number(v.data.size) === size
  console.log(`  ${ok?'✓':'✗ PESO DISTINTO'} ${v.data.name} (${gb(Number(v.data.size))}) ${v.data.webViewLink}`)
  if (!ok) process.exit(1)
}

if (destino) console.log(`\nCarpeta: https://drive.google.com/drive/folders/${destino}`)
if (!ESCRIBIR) console.log(`\nPREVIEW: ${gb(total)} para subir. Agregar --escribir para hacerlo.`)
