// Regresión: los totales calculados con el tope viejo (12/20) y el nuevo (40) tienen
// que dar IGUAL, porque los slots nuevos están vacíos en todas las filas existentes.
// Si algún número cambia, el fix rompió algo.
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { SLOT_PRESU, SLOT_PROY } from '../lib/slots.js'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const p=s=>{if(!s)return 0;const n=String(s).replace(/[^0-9.,-]/g,'').replace(/,/g,'');const f=parseFloat(n);return isNaN(f)?0:f}
const b=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PRESUPUESTOS!A:DI','PROYECTOS!A:ER']})
const P=b.data.valueRanges[0].values.slice(1), Y=b.data.valueRanges[1].values.slice(1)
const suma=(filas,slotFn,hasta,campo)=>filas.reduce((s,r)=>{let t=0;for(let i=1;i<=hasta;i++)t+=p(r[slotFn(i)[campo]]);return s+t},0)
const pv=suma(P,SLOT_PRESU,12,'precio'), pn=suma(P,SLOT_PRESU,40,'precio')
const yv=suma(Y,SLOT_PROY,20,'precio'),  yn=suma(Y,SLOT_PROY,40,'precio')
const f=n=>'$'+Math.round(n).toLocaleString('es-AR')
console.log(`PRESUPUESTOS · costo con 12 slots: ${f(pv)}  ·  con 40: ${f(pn)}  ${pv===pn?'✅ igual':'🔴 CAMBIÓ '+f(pn-pv)}`)
console.log(`PROYECTOS    · costo con 20 slots: ${f(yv)}  ·  con 40: ${f(yn)}  ${yv===yn?'✅ igual':'🔴 CAMBIÓ '+f(yn-yv)}`)
console.log(`\nFilas: ${P.length} presupuestos · ${Y.length} proyectos`)
process.exit((pv===pn&&yv===yn)?0:1)
