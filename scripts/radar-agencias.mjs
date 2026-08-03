/**
 * Radar de agencias/productores: a quién golpear para conseguir laburo YA.
 * Agrupa por AGENCIA (el canal real de Magma), suma facturado, cuenta proyectos,
 * mira hace cuánto no trabajan. Marca activas / enfriándose / dormidas.
 * Cruza PROYECTOS (2026) + HISTORICO_2025 para encontrar las que se fueron. Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>{const s=String(v??'').trim();return /^#(ERROR|REF|N\/A|VALUE|NAME|DIV|NUM|NULL)/.test(s)?'':s}
const num=v=>{const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const fecha=v=>{const m=txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const hoy=new Date();hoy.setHours(0,0,0,0)
const MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS','HISTORICO_2025'],valueRenderOption:'FORMATTED_VALUE'})
const tabs=[{n:'2026',rows:r.data.valueRanges[0].values||[]},{n:'2025',rows:r.data.valueRanges[1].values||[]}]

const ag={} // nombre -> {tot2026,tot2025,n2026,n2025,ultima:Date, ejemplos:[]}
for(const {n,rows} of tabs){
  const H=(rows[0]||[]).map(h=>txt(h).toLowerCase())
  const ci=(...names)=>{for(const nm of names){const i=H.findIndex(h=>h===nm||h.includes(nm));if(i>=0)return i}return -1}
  const iAg=ci('agencia'), iTot=ci('total'), iFe=ci('fecha evento','fecha'), iCli=ci('cliente'), iProy=ci('proyecto')
  rows.slice(1).forEach(row=>{
    let nombre=txt(row[iAg])
    if(!nombre) nombre='(directo) '+(txt(row[iCli])||'?')
    const tot=num(row[iTot]), f=fecha(row[iFe])
    if(!txt(row[iProy]) && !tot) return
    const a=ag[nombre]=ag[nombre]||{tot2026:0,tot2025:0,n2026:0,n2025:0,ultima:null,ej:new Set()}
    a['tot'+n]+=tot; a['n'+n]++
    if(f&&(!a.ultima||f>a.ultima)) a.ultima=f
    if(txt(row[iCli])) a.ej.add(txt(row[iCli]))
  })
}

const lista=Object.entries(ag).map(([nombre,a])=>{
  const dias=a.ultima?Math.round((hoy-a.ultima)/86400000):9999
  return {nombre,...a,dias}
})

// ---- ACTIVAS 2026, ordenadas por facturado ----
const activas=lista.filter(a=>a.tot2026>0&&!a.nombre.startsWith('(directo)')).sort((x,y)=>y.tot2026-x.tot2026)
console.log(`\n${'█'.repeat(72)}\n  RADAR DE AGENCIAS · a quién golpear para laburo YA\n${'█'.repeat(72)}`)
console.log(`\n═══ ACTIVAS EN 2026 (ordenadas por lo que te facturaron) ═══\n`)
console.log(`  ${'AGENCIA'.padEnd(22)}${'FACTURÓ 2026'.padStart(15)}${'PROY'.padStart(6)}  ÚLT. EVENTO   ESTADO`)
console.log(`  ${'─'.repeat(70)}`)
activas.slice(0,20).forEach(a=>{
  const estado = a.dias<=45?'🔥 activa' : a.dias<=90?'⚠️ enfriándose' : '❄️ dormida (reactivar)'
  const ult = a.ultima?`${a.ultima.getDate()}/${MES[a.ultima.getMonth()]}`:'—'
  console.log(`  ${a.nombre.slice(0,21).padEnd(22)}${money(a.tot2026).padStart(15)}${String(a.n2026).padStart(6)}  ${ult.padEnd(13)} ${estado}`)
})

// ---- SE ENFRIARON: fuertes en 2025, poco/nada en 2026 ----
const enfriadas=lista.filter(a=>a.tot2025>0 && a.tot2026< a.tot2025*0.3 && !a.nombre.startsWith('(directo)')).sort((x,y)=>y.tot2025-x.tot2025)
console.log(`\n\n═══ SE FUERON / SE ENFRIARON (fuertes en 2025, poco o nada en 2026) — ORO PARA REACTIVAR ═══\n`)
console.log(`  ${'AGENCIA'.padEnd(22)}${'FACTURÓ 2025'.padStart(15)}${'2026'.padStart(13)}  ÚLT. EVENTO`)
console.log(`  ${'─'.repeat(66)}`)
enfriadas.slice(0,15).forEach(a=>{
  const ult = a.ultima?`${a.ultima.getDate()}/${MES[a.ultima.getMonth()]}/${String(a.ultima.getFullYear()).slice(2)}`:'—'
  console.log(`  ${a.nombre.slice(0,21).padEnd(22)}${money(a.tot2025).padStart(15)}${money(a.tot2026).padStart(13)}  ${ult}`)
})

console.log(`\n\n  Resumen: ${activas.length} agencias activas en 2026 · ${enfriadas.length} para reactivar.`)
console.log(`  (Los clientes directos y el detalle de contactos los saco aparte si querés.)`)
