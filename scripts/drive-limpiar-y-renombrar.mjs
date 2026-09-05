/**
 * Saca duplicados exactos (mismo md5) y renombra a la convencion de entrega.
 * Uso:  node scripts/drive-limpiar-y-renombrar.mjs <folderId> <NombreProyecto> [--escribir]
 * Sin --escribir solo muestra el preview. Guarda rollback en scripts/.rollback-<folderId>.json
 */
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth = new google.auth.JWT({ email:env.GOOGLE_CLIENT_EMAIL, key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n'), scopes:['https://www.googleapis.com/auth/drive'] })
const drive = google.drive({version:'v3', auth})

const ROOT = process.argv[2], PROY = process.argv[3]
const ESCRIBIR = process.argv.includes('--escribir')
const TIPO = { 'Fotos':'Foto', 'Clips':'Clip', 'Drone':'Drone' }

// orden de captura: agrupa por prefijo (nombre sin digitos) y despues por el numero final.
// El archivo sin numero de una serie va primero (ej: CASE.construccion.jpg antes que -2).
const clave = n => {
  const base = n.replace(/\.[^.]+$/,'')
  const m = base.match(/(\d+)(?!.*\d)/)
  const pref = base.replace(/\d+/g,'').replace(/[-_.\s]+$/,'')
  return [pref, m ? parseInt(m[1],10) : -1]
}
const natural = (a,b) => {
  const [pa,na]=clave(a.name), [pb,nb]=clave(b.name)
  return pa.localeCompare(pb,'en',{sensitivity:'base'}) || na-nb || a.name.localeCompare(b.name)
}

async function hijos(id){
  const out=[]; let token
  do{ const r = await drive.files.list({ q:`'${id}' in parents and trashed=false`,
        fields:'nextPageToken, files(id,name,mimeType,size,md5Checksum,createdTime)',
        pageSize:1000, pageToken:token, supportsAllDrives:true, includeItemsFromAllDrives:true })
      out.push(...(r.data.files||[])); token=r.data.nextPageToken } while(token)
  return out
}

const carpetas = (await hijos(ROOT)).filter(f=>f.mimeType==='application/vnd.google-apps.folder')
const plan = { borrar:[], renombrar:[] }

for(const c of carpetas){
  const files = (await hijos(c.id)).filter(f=>f.mimeType!=='application/vnd.google-apps.folder')
  // 1. duplicados exactos: mismo md5 -> se queda el mas viejo
  const grupos={}
  for(const f of files) (grupos[f.md5Checksum || 'sinmd5-'+f.id] = grupos[f.md5Checksum || 'sinmd5-'+f.id] || []).push(f)
  const sobrantes = new Set()
  for(const g of Object.values(grupos)){
    if(g.length<2) continue
    g.sort((a,b)=>a.createdTime.localeCompare(b.createdTime))
    for(const f of g.slice(1)){ sobrantes.add(f.id); plan.borrar.push({...f, carpeta:c.name, seQueda:g[0].name+' ('+g[0].createdTime.slice(11,19)+')'}) }
  }
  // 2. renombrado de lo que queda, orden natural por nombre original
  const quedan = files.filter(f=>!sobrantes.has(f.id)).sort(natural)
  const tipo = TIPO[c.name] || c.name
  quedan.forEach((f,i)=>{
    const ext = f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.')) : ''
    const nuevo = `S.Magma-${PROY}_${tipo}_${String(i+1).padStart(3,'0')}${ext}`
    if(nuevo!==f.name) plan.renombrar.push({id:f.id, carpeta:c.name, viejo:f.name, nuevo})
  })
}

const gb = plan.borrar.reduce((s,f)=>s+Number(f.size||0),0)/1e9
console.log(`\n===== PREVIEW =====`)
console.log(`\nA PAPELERA: ${plan.borrar.length} copias duplicadas (${gb.toFixed(2)} GB)`)
plan.borrar.slice(0,5).forEach(f=>console.log(`   ${f.carpeta}/${f.name}  (${f.createdTime.slice(11,19)})  → se queda ${f.seQueda}`))
if(plan.borrar.length>5) console.log(`   ... y ${plan.borrar.length-5} mas`)
console.log(`\nRENOMBRAR: ${plan.renombrar.length} archivos`)
for(const c of carpetas){
  const r = plan.renombrar.filter(x=>x.carpeta===c.name)
  if(!r.length) continue
  console.log(`   ${c.name} (${r.length}):  ${r[0].viejo} → ${r[0].nuevo}`)
  console.log(`   ${' '.repeat(c.name.length)}   ${r[r.length-1].viejo} → ${r[r.length-1].nuevo}`)
}

if(!ESCRIBIR){ console.log('\n[PREVIEW] Nada se toco. Agregar --escribir para ejecutar.\n'); process.exit(0) }

writeFileSync(`/Users/dronjuan/somos-magma-app/scripts/.rollback-${ROOT}.json`, JSON.stringify(plan,null,1))
console.log('\n[rollback guardado en scripts/.rollback-'+ROOT+'.json]')

let ok=0, err=0
for(const f of plan.borrar){
  try{ await drive.files.update({fileId:f.id, requestBody:{trashed:true}, supportsAllDrives:true}); ok++ }
  catch(e){ err++; console.log('  ✗ borrar '+f.name+': '+e.message.slice(0,80)) }
  if(ok%20===0 && ok) process.stdout.write(`\r  papelera: ${ok}/${plan.borrar.length}`)
}
console.log(`\n✓ a papelera: ${ok}  (errores: ${err})`)

ok=0; err=0
for(const f of plan.renombrar){
  try{ await drive.files.update({fileId:f.id, requestBody:{name:f.nuevo}, supportsAllDrives:true}); ok++ }
  catch(e){ err++; console.log('  ✗ renombrar '+f.viejo+': '+e.message.slice(0,80)) }
  if(ok%25===0 && ok) process.stdout.write(`\r  renombrados: ${ok}/${plan.renombrar.length}`)
}
console.log(`\n✓ renombrados: ${ok}  (errores: ${err})\n`)
