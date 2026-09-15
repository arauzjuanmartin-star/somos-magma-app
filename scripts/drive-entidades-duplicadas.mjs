// Carpetas de agencia/cliente que la app creó AL LADO de una que ya existía a mano.
//
// Pasó el 14/9/2026: "BUNGE & BORN" (Sofi, 2023) y "FUNDACION_BUNGE_BORN" (la app,
// hoy). El match de lib/drive.js compara el nombre "casi igual" y si no encuentra,
// crea. Este script SOLO LISTA, en las dos unidades (ENTREGAS y CRUDO), niveles 1
// y 2: para cada carpeta con pinta de creada por la app (mayúsculas + guión bajo,
// creada desde el 20/8/2026) busca hermanas que compartan palabras.
//
//   node scripts/drive-entidades-duplicadas.mjs            → todo
//   node scripts/drive-entidades-duplicadas.mjs entregas   → solo esa unidad
//   node scripts/drive-entidades-duplicadas.mjs --muestra  → además, 3 carpetas humanas con sus proyectos (para ver la convención)

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
const drive = google.drive({ version: 'v3', auth })
const DRIVES = { entregas: '0AK9Y6BbDhgekUk9PVA', crudo: '0ALsTwjw6_Zc1Uk9PVA' }
const args = process.argv.slice(2)
const MUESTRA = args.includes('--muestra')
const cuales = args.filter(a => DRIVES[a])
const DESDE = '2026-08-20'
const SA = /gserviceaccount/i

const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const STOP = new Set(['DE', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'AND', 'THE', 'SA', 'SRL', 'CR', 'FUNDACION', 'GRUPO', 'ARGENTINA', 'COMUNICACION', 'COMUNICACIONES', 'AGENCIA', 'STUDIO', 'PRODUCCIONES', 'MEDIA'])
const tokens = s => sinTildes(s).toUpperCase().replace(/^CR[_\s]+/, '').split(/[^A-Z0-9]+/).filter(t => t.length >= 3 && !STOP.has(t))
const clave = s => sinTildes(s).toUpperCase().replace(/^CR[_\s]*/, '').replace(/[^A-Z0-9]/g, '')
const pintaApp = f => /^[A-Z0-9_]+$/.test(f.name.replace(/^CR_/, '')) && f.createdTime >= DESDE

async function hijos(driveId, parent, soloCarpetas = true) {
  const out = []; let token
  do {
    const r = await drive.files.list({
      q: `'${parent}' in parents and trashed=false${soloCarpetas ? " and mimeType='application/vnd.google-apps.folder'" : ''}`,
      driveId, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1000, pageToken: token,
      fields: 'nextPageToken,files(id,name,createdTime,mimeType,lastModifyingUser(emailAddress))',
    })
    out.push(...(r.data.files || [])); token = r.data.nextPageToken
  } while (token)
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
const link = id => `https://drive.google.com/drive/folders/${id}`

for (const [nombre, driveId] of Object.entries(DRIVES)) {
  if (cuales.length && !cuales.includes(nombre)) continue
  console.log(`\n══════════ ${nombre.toUpperCase()} ══════════`)
  const raiz = await hijos(driveId, driveId)
  const nivel2 = new Map()   // id de raíz → hijas
  for (const r of raiz) nivel2.set(r.id, await hijos(driveId, r.id))

  // Grupos de hermanas: raíz, y adentro de cada carpeta de raíz
  const grupos = [{ ruta: '/', lista: raiz }, ...raiz.map(r => ({ ruta: r.name, lista: nivel2.get(r.id) || [] }))]
  let pares = 0
  const sospechosas = []
  for (const g of grupos) {
    const app = g.lista.filter(pintaApp)
    for (const a of app) {
      const ta = tokens(a.name)
      const hermanas = g.lista.filter(h => h.id !== a.id && !pintaApp(h)).filter(h => {
        const th = tokens(h.name)
        if (!ta.length || !th.length) return false
        const comun = ta.filter(t => th.includes(t) || th.some(x => x.startsWith(t) || t.startsWith(x)))
        return comun.length >= Math.min(ta.length, th.length) || clave(h.name).includes(clave(a.name)) || clave(a.name).includes(clave(h.name))
      })
      const hijasA = await hijos(driveId, a.id, false)
      if (hermanas.length) {
        pares++
        console.log(`\n${g.ruta === '/' ? '(raíz)' : g.ruta + ' /'}`)
        console.log(`  APP  ${a.name.padEnd(34)} creada ${a.createdTime.slice(0, 10)}  ${hijasA.length} adentro: ${hijasA.map(h => h.name).slice(0, 4).join(' · ')}${hijasA.length > 4 ? ' …' : ''}`)
        console.log(`       ${link(a.id)}`)
        for (const h of hermanas) {
          const hijasH = await hijos(driveId, h.id, false)
          console.log(`  MANO ${h.name.padEnd(34)} creada ${h.createdTime.slice(0, 10)}  ${hijasH.length} adentro: ${hijasH.map(x => x.name).slice(0, 4).join(' · ')}${hijasH.length > 4 ? ' …' : ''}`)
          console.log(`       ${link(h.id)}`)
        }
      } else {
        sospechosas.push({ ruta: g.ruta, a, n: hijasA.length })
      }
    }
  }
  console.log(`\n→ ${pares} carpetas de la app con una hermana parecida hecha a mano`)
  if (sospechosas.length) {
    console.log(`\nCreadas por la app SIN hermana parecida (ok si el cliente era nuevo):`)
    sospechosas.forEach(s => console.log(`   ${(s.ruta === '/' ? '' : s.ruta + ' / ') + s.a.name}  (${s.a.createdTime.slice(0, 10)}, ${s.n} adentro)`))
  }

  if (MUESTRA) {
    console.log(`\nCómo nombran a mano (3 carpetas viejas con proyectos adentro):`)
    let vistas = 0
    for (const r of raiz) {
      if (pintaApp(r) || r.createdTime >= '2026-06-01') continue
      const h2 = nivel2.get(r.id) || []
      // Buscar proyectos: en la raíz de la entidad o un nivel más abajo
      let proys = h2.filter(x => /^\d{1,2}\s*I\s*\d{1,2}/i.test(x.name) || /^\d{4}[_ ]/.test(x.name))
      let donde = r.name
      if (!proys.length && h2.length) { for (const s of h2.slice(0, 3)) { const h3 = await hijos(driveId, s.id); const p = h3.filter(x => /^\d{1,2}\s*I\s*\d{1,2}/i.test(x.name) || /^\d{4}[_ ]/.test(x.name)); if (p.length) { proys = p; donde = `${r.name} / ${s.name}`; break } } }
      if (!proys.length) continue
      console.log(`   ${donde}:`); proys.slice(0, 5).forEach(p => console.log(`      ${p.name}  (${p.createdTime.slice(0, 10)})`))
      if (++vistas >= 3) break
    }
  }
}
