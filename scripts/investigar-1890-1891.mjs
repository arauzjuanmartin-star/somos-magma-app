import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const TABS=['PROYECTOS','FACTURACION','PAGOS_STAFF','COBROS']
const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:TABS,valueRenderOption:'FORMATTED_VALUE'})

function dump(tab, rows, matcher){
  const H=rows[0]||[]
  const hits=[]
  rows.forEach((row,ri)=>{ if(ri===0)return; if(matcher(row,ri)) hits.push({fila:ri+1,row}) })
  if(!hits.length){ console.log(`\n### ${tab}: sin coincidencias`); return }
  console.log(`\n### ${tab} — ${hits.length} fila(s)`)
  hits.forEach(({fila,row})=>{
    console.log(`  ── fila ${fila} ──`)
    row.forEach((c,ci)=>{ if(txt(c)) console.log(`     [${ci}] ${txt(H[ci])||'?'} = ${txt(c)}`) })
  })
}

TABS.forEach((tab,ti)=>{
  const rows=r.data.valueRanges[ti].values||[]
  console.log(`\n${'█'.repeat(60)}\n  ${tab} · headers`)
  ;(rows[0]||[]).forEach((h,i)=>{ if(txt(h)) console.log(`   [${i}] ${txt(h)}`) })
})

console.log(`\n\n${'▓'.repeat(60)}\n  BUSCANDO 1890\n${'▓'.repeat(60)}`)
TABS.forEach((tab,ti)=>dump(tab, r.data.valueRanges[ti].values||[], row=>row.some(c=>txt(c)==='1890')))
console.log(`\n\n${'▓'.repeat(60)}\n  BUSCANDO 1891\n${'▓'.repeat(60)}`)
TABS.forEach((tab,ti)=>dump(tab, r.data.valueRanges[ti].values||[], row=>row.some(c=>txt(c)==='1891')))
console.log(`\n\n${'▓'.repeat(60)}\n  BUSCANDO "lanzamiento" / evento 8/4 sin N° de proyecto\n${'▓'.repeat(60)}`)
TABS.forEach((tab,ti)=>dump(tab, r.data.valueRanges[ti].values||[], row=>row.some(c=>/lanzamiento/i.test(txt(c)))||row.some(c=>/^8\/4\/2026$/.test(txt(c)))))
