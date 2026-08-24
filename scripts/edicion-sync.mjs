// Sincroniza la solapa EDICION con PROYECTOS desde la consola.
// Mismo motor que el botón "Actualizar" del módulo Edición de la app.
//   node scripts/edicion-sync.mjs                → preview (no escribe)
//   node scripts/edicion-sync.mjs --escribir     → aplica
//   node scripts/edicion-sync.mjs --escribir 60  → mirando 60 días para atrás

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { sincronizarEdicion } from '../lib/edicion-sync.js'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const desdeDias = parseInt(process.argv.find(a => /^\d+$/.test(a))) || 30

const r = await sincronizarEdicion({ sheets, SHEET_ID, desdeDias, dryRun: !ESCRIBIR })
console.log(`\n════ SYNC EDICIÓN (mirando ${desdeDias} días atrás) ════\n`)
r.detalle.forEach(d => console.log('  ' + d))
console.log(`\n  ${r.vistos} líneas de edición en ventana · ${r.nuevas} nuevas · ${r.actualizadas} a refrescar`)
console.log(ESCRIBIR ? '\n✅ Escrito en la solapa EDICION.' : '\n👀 PREVIEW — nada se escribió. Corré con --escribir.')
