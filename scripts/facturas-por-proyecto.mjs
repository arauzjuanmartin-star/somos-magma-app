import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const num=v=>{const s=String(v??'').replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'FACTURACION!A:AG',valueRenderOption:'FORMATTED_VALUE'})
const rows=R.data.values||[]; const h=rows[0]||[]
console.log('=== COLUMNAS DE FACTURACION ===')
h.forEach((x,i)=>{ if(x) console.log(`  ${String(i).padStart(2)}  ${x}`) })

const H=n=>h.indexOf(n)
const iP=H('N° Presupuesto'), iN=H('Nro de Factura'), iF=H('Precio FINAL'), iProy=H('Proyecto'), iLink=H('Factura')
const porPresu={}
for(let i=1;i<rows.length;i++){const n=String(rows[i][iP]??'').trim(); if(!n)continue; (porPresu[n]||=[]).push(i+1)}
const multi=Object.entries(porPresu).filter(([,f])=>f.length>1)
console.log(`\n=== PRESUPUESTOS CON MAS DE UNA FILA: ${multi.length} de ${Object.keys(porPresu).length} ===`)
for(const [n,filas] of multi.slice(0,20)){
  console.log(`\n  #${n} -> ${filas.length} filas`)
  for(const f of filas){const r=rows[f-1]; console.log(`     fila ${f}: nro="${r[iN]??''}" ${M(num(r[iF]))} link=${(r[iLink]??'')?'SI':'--'} | ${String(r[iProy]??'').slice(0,40)}`)}
}
console.log(`\nTotal filas: ${rows.length-1}`)
