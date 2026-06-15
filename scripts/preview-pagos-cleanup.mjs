import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({version:'v4',auth})
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const ps = (await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:'PAGOS_STAFF!A:L'})).data.values||[]
const H = ps[0]
const ci = n => H.indexOf(n)
const iMesRef=ci('Mes Referencia'), iFre=ci('Freelancer'), iNro=ci('N° Presupuesto'), iEst=ci('Estado')

const body = ps.slice(1).map((r,idx)=>({r, fila: idx+2}))  // fila real en el sheet (1-based, +header)

// 1) Filas MALFORMADAS = sin "Mes Referencia" (las que escribió el endpoint roto)
const malformadas = body.filter(x => !String(x.r[iMesRef]||'').trim() && String(x.r[iFre]||'').trim())
console.log(`\n=== FILAS MALFORMADAS (Mes Referencia vacío): ${malformadas.length} ===`)
malformadas.forEach(x => console.log(`  fila ${x.fila}: ${x.r[iFre]} · N°${x.r[iNro]||'-'} · Estado="${x.r[iEst]}" · raw=${JSON.stringify(x.r)}`))

// 2) DUPLICADOS exactos entre las malformadas (mismo Freelancer + N° + contenido)
const key = r => JSON.stringify(r)
const grupos = {}
malformadas.forEach(x => { const k=x.r[iFre]+'|'+x.r[iNro]+'|'+key(x.r); (grupos[k]=grupos[k]||[]).push(x.fila) })
const dups = Object.entries(grupos).filter(([k,fs])=>fs.length>1)
console.log(`\n=== GRUPOS DUPLICADOS (idénticos): ${dups.length} ===`)
dups.forEach(([k,fs]) => console.log(`  ${fs.length}x → filas ${fs.join(', ')} · ${k.split('|').slice(0,2).join(' N°')}`))

const totalDupExtra = dups.reduce((s,[,fs])=>s+(fs.length-1),0)
console.log(`\n=== RESUMEN ===`)
console.log(`Total filas en PAGOS_STAFF: ${body.length}`)
console.log(`Malformadas (sin Mes Referencia): ${malformadas.length}`)
console.log(`Filas duplicadas a eliminar (sobran): ${totalDupExtra}`)
console.log(`Malformadas únicas a normalizar (llenar Mes Referencia + Estado=Pagado): ${malformadas.length - totalDupExtra}`)
