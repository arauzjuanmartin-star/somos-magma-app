import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','PRESUPUESTOS!A:AR'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,PRE]=R.data.valueRanges.map(v=>v.values||[])
const H=PRO[0], PH=PRE[0]
for(const nro of ['2141','2131','1905']){
  console.log(`\n\x1b[1m════ #${nro} ════\x1b[0m`)
  const fs=PRO.filter((r,i)=>i>0&&txt(r[2])===nro)
  console.log(`  ocupa ${fs.length} fila(s) en PROYECTOS`)
  fs.forEach((r,k)=>{
    console.log(`  ─ fila ${k+1}: ${txt(r[6])}`)
    ;[[7,'Total'],[8,'Fee Final'],[9,'Diferencia'],[10,'Fee Agencia'],[52,'Subtotal'],[53,'Ganancias'],[54,'IIBB'],[59,'Ajuste']].forEach(([i,l])=>{
      if(txt(r[i])&&txt(r[i])!=='$0.00'&&txt(r[i])!=='0') console.log(`      ${l.padEnd(12)} ${r[i]}`)})
    const ped=[]
    ;[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81].forEach(c=>{
      if(txt(r[c])) ped.push(`${txt(r[c])} ${M(num(r[c+1]))} → ${txt(r[c+2])||'(sin staff)'}`)})
    ped.forEach(p=>console.log(`      · ${p}`))
  })
  const pr=PRE.find((r,i)=>i>0&&txt(r[0])===nro)
  if(pr){ const iCF=PH.indexOf('Cant. Fechas'), iPF=PH.indexOf('Precio Final')
    console.log(`  \x1b[36mPRESUPUESTO: Cant. Fechas = ${pr[iCF]} · Precio Final = ${pr[iPF]}\x1b[0m`) }
}
