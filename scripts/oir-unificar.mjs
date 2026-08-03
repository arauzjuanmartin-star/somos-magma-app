/**
 * Unifica la agencia "Oir/OIR Comunicaciones" (duplicada por mayúsculas) en TODAS las solapas.
 * Preview por defecto; aplica con --go. No pierde datos: solo normaliza el nombre de la agencia.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const GO = process.argv.includes('--go')
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets'+(GO?'':'.readonly')]})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const col=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s}

const TABS=['PROYECTOS','PRESUPUESTOS','FACTURACION','AGENCIAS','HISTORICO_2025','HISTORICO_2024']
const CANON='Oir Comunicaciones'   // nombre unificado
const MATCH=/^\s*oir\b/i            // cualquier "Oir..."/"OIR..."

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:TABS,valueRenderOption:'FORMATTED_VALUE'})
const cambios=[] // {tab, celda, antes}
const variantes={}

r.data.valueRanges.forEach((vr,ti)=>{
  const tab=TABS[ti], rows=vr.values||[]
  if(!rows.length) return
  const H=(rows[0]||[]).map(h=>txt(h).toLowerCase())
  // columnas donde puede estar el nombre de la agencia
  const cols=[]
  H.forEach((h,i)=>{ if(h==='agencia'||h==='nombre'||h==='cliente'||h.includes('agencia')) cols.push(i) })
  rows.forEach((row,ri)=>{ if(ri===0)return
    cols.forEach(ci=>{ const val=txt(row[ci])
      if(MATCH.test(val)){
        variantes[val]=(variantes[val]||0)+1
        if(val!==CANON) cambios.push({tab, celda:`${tab}!${col(ci)}${ri+1}`, antes:val})
      }
    })
  })
})

console.log(`\n${'█'.repeat(60)}\n  UNIFICAR "OIR" → "${CANON}"  ${GO?'· APLICANDO':'· PREVIEW'}\n${'█'.repeat(60)}`)
console.log(`\n  Variantes encontradas:`)
Object.entries(variantes).sort((a,b)=>b[1]-a[1]).forEach(([v,c])=>console.log(`     "${v}"  ×${c}  ${v===CANON?'✓ (se conserva)':'→ se cambia'}`))
console.log(`\n  Celdas a cambiar: ${cambios.length}`)
cambios.forEach(c=>console.log(`     ${c.celda.padEnd(22)} "${c.antes}"  →  "${CANON}"`))

if(!cambios.length){ console.log('\n  Nada que unificar.'); process.exit(0) }
if(!GO){ console.log(`\n  ▶ PREVIEW. Para aplicar: node scripts/oir-unificar.mjs --go\n`); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'RAW',data:cambios.map(c=>({range:c.celda,values:[[CANON]]}))}})
console.log(`\n  ✅ Unificadas ${cambios.length} celdas a "${CANON}".\n`)
