import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PRESUPUESTOS!A1:DI2000','PROYECTOS!A:G','LOG!A:F'],valueRenderOption:'FORMATTED_VALUE'})
const PRE=R.data.valueRanges[0].values||[], h=PRE[0]
const PRO=R.data.valueRanges[1].values||[]
const LOG=R.data.valueRanges[2].values||[]
const ix=n=>h.indexOf(n)
console.log('── PRESUPUESTOS #2147')
PRE.slice(1).forEach((r,i)=>{ if(txt(r[0])==='2147') console.log(` fila ${i+2} | Estado: ${txt(r[3])} | ${txt(r[ix('Cliente')])} / ${txt(r[ix('Agencia')])} / ${txt(r[ix('Proyecto')])} | FechaEv ${txt(r[1])} | Motivo(AY) "${txt(r[50])}"`) })
console.log('\n── Cualquier presu con Cabify o Popstars')
PRE.slice(1).forEach((r,i)=>{ const s=txt(r[ix('Cliente')])+' '+txt(r[ix('Agencia')])+' '+txt(r[ix('Proyecto')]); if(/cabify|popstars/i.test(s)) console.log(` fila ${i+2} #${txt(r[0])} | ${txt(r[3])} | ${s} | ${txt(r[1])}`) })
console.log('\n── PROYECTOS con Cabify/Popstars')
PRO.slice(1).forEach((r,i)=>{ const s=txt(r[4])+' '+txt(r[5])+' '+txt(r[6]); if(/cabify|popstars/i.test(s)) console.log(` fila ${i+2} #${txt(r[2])} | ${s} | ${txt(r[3])}`) })
console.log('\n── LOG: últimas 25 entradas')
LOG.slice(-25).forEach(r=>console.log(' '+r.join(' | ')))
console.log('\n── LOG: todo lo que mencione 2147')
LOG.filter(r=>r.some(c=>txt(c)==='2147')).forEach(r=>console.log(' '+r.join(' | ')))
