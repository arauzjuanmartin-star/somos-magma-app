// ¿Los servicios ADICIONALES (opcionales, no tomados por el cliente) se están
// copiando igual a PROYECTOS al aprobar? presupuesto-estado.js lee A:AZ (índice 0..51)
// pero busca 'Es Adicional' en el índice 55 → siempre undefined → el filtro no filtra.
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const parse=s=>{if(!s)return 0;const n=String(s).replace(/[^0-9.,-]/g,'').replace(/,/g,'');const f=parseFloat(n);return isNaN(f)?0:f}

const b=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PRESUPUESTOS!A1:ER700','PROYECTOS!A1:ER700']})
const [P,Y]=b.data.valueRanges
const HP=P.values[0], HY=Y.values[0]
const iAdic=HP.indexOf('Es Adicional')
console.log(`'Es Adicional' está en el índice ${iAdic} (col ${String.fromCharCode(65+Math.floor(iAdic/26)-1)}${String.fromCharCode(65+iAdic%26)})`)
console.log(`presupuesto-estado.js lee A:AZ = índices 0..51 → presuRow[${iAdic}] = ${iAdic>51?'undefined 🔴':'ok'}\n`)

// index de proyectos por nro
const proyPorNro={}
Y.values.slice(1).forEach(r=>{ if(r[2]) proyPorNro[String(r[2]).trim()]=r })

let casos=[], plataDeMas=0
P.values.slice(1).forEach(row=>{
  if(String(row[3]||'').trim()!=='APROBADO') return
  const adic=String(row[iAdic]||'').split('|')
  if(!adic.includes('1')) return
  // qué pedidos eran adicionales (no tomados)
  const noTomados=[]
  for(let j=0;j<40;j++){
    const ped=row[11+j*2], prc=parse(row[12+j*2])
    if(!ped && !prc) continue
    if(adic[j]==='1') noTomados.push({ped,prc})
  }
  if(!noTomados.length) return
  const proy=proyPorNro[String(row[0]).trim()]
  if(!proy) return
  // ¿aparecen en el proyecto?
  const enProy=[]
  for(let k=0;k<20;k++){
    const ped=proy[11+k*3], prc=parse(proy[11+k*3+1])
    if(ped||prc) enProy.push({ped,prc})
  }
  const colados=noTomados.filter(nt=>enProy.some(e=>e.ped===nt.ped && e.prc===nt.prc))
  if(colados.length){
    const monto=colados.reduce((s,x)=>s+x.prc,0)
    plataDeMas+=monto
    casos.push({nro:row[0],cl:row[5],proy:row[6],colados,monto})
  }
})

console.log(`=== PRESUS APROBADOS DONDE EL ADICIONAL NO TOMADO SE COLÓ AL PROYECTO: ${casos.length} ===\n`)
casos.sort((a,b)=>b.monto-a.monto).forEach(c=>{
  console.log(`#${c.nro} · ${c.cl} · ${c.proy}`)
  c.colados.forEach(x=>console.log(`   🔴 "${x.ped}" $${x.prc.toLocaleString('es-AR')} — el cliente NO lo tomó y está cargado como costo del proyecto`))
})
console.log(`\nCOSTO FANTASMA TOTAL EN PROYECTOS: $${plataDeMas.toLocaleString('es-AR')}`)
